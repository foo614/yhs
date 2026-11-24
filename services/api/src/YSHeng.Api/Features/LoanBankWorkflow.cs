using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class LoanBankWorkflow
{
    public static bool HasTerms(LoanBankOption bank) => !string.IsNullOrWhiteSpace(bank.BankName) && bank.LoanAmount is > 0 && bank.InterestRate is > 0 && bank.TenureMonths is > 0;

    public static Task<bool> HasOriginalLouAsync(AppDbContext db, LoanApplication loan, LoanBankOption bank) =>
        db.DocumentBlobs.AnyAsync(row => bank.LouDocumentId.HasValue && row.Id == bank.LouDocumentId &&
            row.LoanApplicationId == loan.Id && row.VehicleId == loan.VehicleId && row.Category == FileCategory.LoanDocument);

    public static async Task RefreshLoanAsync(AppDbContext db, LoanApplication loan, LoanBankOption changed, ClaimsPrincipal actor, bool captureEnabled = false)
    {
        var banks = await db.LoanBankOptions.AsNoTracking().Where(row => row.LoanApplicationId == loan.Id && row.Id != changed.Id).ToListAsync();
        banks.Add(changed);
        var approved = banks.Any(row => row.Status == LoanBankOptionStatus.Approved && row.LouDocumentId.HasValue && HasTerms(row));
        var rejected = banks.Count > 0 && banks.All(row => row.Status == LoanBankOptionStatus.Rejected);
        var updated = loan with
        {
            Status = approved ? LoanStatus.Approved : rejected ? LoanStatus.Rejected : banks.Any(row => row.SubmittedAt.HasValue) ? LoanStatus.Submitted : LoanStatus.Pending,
            LouApproved = approved,
            BankSubmittedAt = banks.Where(row => row.SubmittedAt.HasValue).Select(row => row.SubmittedAt).Min(),
            LastUpdatedAt = DateTime.UtcNow,
            DecisionAt = approved || rejected ? loan.DecisionAt ?? DateTime.UtcNow : null,
            DecisionBy = approved || rejected ? loan.DecisionBy ?? AuditTrail.ActorFrom(actor) : null,
            RejectionReason = rejected ? changed.RejectionReason : null
        };
        await WhatsAppBusinessEvents.StageLoanStatusAsync(db, loan, updated, captureEnabled, AuditTrail.ActorFrom(actor));
        db.Entry(loan).CurrentValues.SetValues(updated);
        var vehicle = await db.Vehicles.FirstAsync(row => row.Id == loan.VehicleId);
        var loans = await db.LoanApplications.AsNoTracking().Where(row => row.VehicleId == loan.VehicleId && row.Id != loan.Id).ToListAsync();
        loans.Add(updated);
        db.Entry(vehicle).CurrentValues.SetValues(WorkflowStatusRules.ApplyWorkflowStatus(vehicle, loans,
            await db.PaymentRecords.AsNoTracking().Where(row => row.VehicleId == loan.VehicleId).ToListAsync(),
            await db.DeliverySchedules.AsNoTracking().Where(row => row.VehicleId == loan.VehicleId).ToListAsync(),
            await db.FinanceInvoices.AsNoTracking().Where(row => row.VehicleId == loan.VehicleId).ToListAsync(),
            await db.CollectionTransactions.AsNoTracking().ToListAsync()));
    }

    public static void MapLoanBankWorkflow(this RouteGroupBuilder routes)
    {
        routes.MapGet("/loans/{id:guid}/banks", async (Guid id, AppDbContext db, HttpContext context) =>
        {
            var loan = await db.LoanApplications.AsNoTracking().FirstOrDefaultAsync(row => row.Id == id);
            if (loan is null) return Results.NotFound();
            if (!await CanReadAsync(db, loan, context)) return Results.Forbid();
            return Results.Ok(await db.LoanBankOptions.AsNoTracking().Where(row => row.LoanApplicationId == id).OrderByDescending(row => row.IsSelected).ThenBy(row => row.BankName).ToListAsync());
        }).RequireAuthorization("LoanRead");

        routes.MapPost("/loans/{id:guid}/banks", async (Guid id, LoanBankOption option, AppDbContext db, HttpContext context) =>
        {
            var initial = await db.LoanApplications.AsNoTracking().FirstOrDefaultAsync(row => row.Id == id);
            if (initial is null) return Results.NotFound();
            await using var transaction = await DeliveryConcurrencyLock.BeginLoanAsync(db, initial.VehicleId, id);
            var loan = await db.LoanApplications.FirstAsync(row => row.Id == id);
            if (!LoanDecisionRules.CanProcess(loan, context.User, StaffIdentity.CurrentUserId(context))) return Results.Forbid();
            if (loan.Status is LoanStatus.Done or LoanStatus.Rejected) return Results.BadRequest(new ApiError("This loan is review-only."));
            if (option.LoanApplicationId != Guid.Empty && option.LoanApplicationId != id) return Results.BadRequest(ApiErrors.RouteIdMismatch("loan"));
            var saved = new LoanBankOption { LoanApplicationId = id, BankName = (option.BankName ?? "").Trim(), LoanAmount = option.LoanAmount, InterestRate = option.InterestRate, TenureMonths = option.TenureMonths, Terms = option.Terms?.Trim() };
            var validation = LoanDecisionRules.ValidateBankOption(saved);
            if (!validation.IsValid) return Results.BadRequest(validation);
            db.LoanBankOptions.Add(saved);
            db.Entry(loan).CurrentValues.SetValues(loan with { LastUpdatedAt = DateTime.UtcNow });
            ApiAudit.Add(db, context.User, "loan.bank.added", nameof(LoanBankOption), saved.Id);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.Created($"/api/loans/{id}/banks/{saved.Id}", saved);
        }).RequireAuthorization("Loans");

        routes.MapPut("/loans/{id:guid}/banks/{bankId:guid}", async (Guid id, Guid bankId, LoanBankOption option, AppDbContext db, HttpContext context) =>
        {
            var initial = await db.LoanApplications.AsNoTracking().FirstOrDefaultAsync(row => row.Id == id);
            if (initial is null) return Results.NotFound();
            await using var transaction = await DeliveryConcurrencyLock.BeginLoanAsync(db, initial.VehicleId, id);
            var loan = await db.LoanApplications.FirstAsync(row => row.Id == id);
            if (!LoanDecisionRules.CanProcess(loan, context.User, StaffIdentity.CurrentUserId(context))) return Results.Forbid();
            if (option.Id != bankId || option.LoanApplicationId != id) return Results.BadRequest(ApiErrors.RouteIdMismatch("loan bank option"));
            var bank = await db.LoanBankOptions.FirstOrDefaultAsync(row => row.Id == bankId && row.LoanApplicationId == id);
            if (bank is null) return Results.NotFound();
            if (loan.Status is LoanStatus.Done or LoanStatus.Rejected || bank.IsSelected || bank.Status == LoanBankOptionStatus.Rejected) return Results.BadRequest(new ApiError("Final bank terms are locked. Select another approved bank before changing this option."));
            var saved = bank with { BankName = (option.BankName ?? "").Trim(), LoanAmount = option.LoanAmount, InterestRate = option.InterestRate, TenureMonths = option.TenureMonths, Terms = option.Terms?.Trim(), UpdatedAt = DateTime.UtcNow };
            var validation = LoanDecisionRules.ValidateBankOption(saved);
            if (!validation.IsValid) return Results.BadRequest(validation);
            if (saved.Status == LoanBankOptionStatus.Approved && !HasTerms(saved)) saved = saved with { Status = LoanBankOptionStatus.Submitted };
            db.Entry(bank).CurrentValues.SetValues(saved);
            await RefreshLoanAsync(db, loan, saved, context.User, context.RequestServices.GetRequiredService<IConfiguration>().GetValue("WhatsApp:CaptureEnabled", false));
            ApiAudit.Add(db, context.User, "loan.bank.updated", nameof(LoanBankOption), bankId);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.Ok(saved);
        }).RequireAuthorization("Loans");

        routes.MapGet("/loans/{id:guid}/banks/{bankId:guid}/lous", async (Guid id, Guid bankId, AppDbContext db, HttpContext context) =>
        {
            var loan = await db.LoanApplications.AsNoTracking().FirstOrDefaultAsync(row => row.Id == id);
            if (loan is null) return Results.NotFound();
            if (!await CanReadAsync(db, loan, context)) return Results.Forbid();
            var bank = await db.LoanBankOptions.AsNoTracking().FirstOrDefaultAsync(row => row.Id == bankId && row.LoanApplicationId == id);
            if (bank is null) return Results.NotFound();
            var links = await db.LoanBankLouDocuments.AsNoTracking().Where(row => row.BankOptionId == bankId).ToListAsync();
            var documentIds = links.Select(row => row.DocumentId).Append(bank.LouDocumentId ?? Guid.Empty).Append(bank.EditedLouDocumentId ?? Guid.Empty).ToArray();
            var documents = await db.DocumentBlobs.AsNoTracking().Where(row => documentIds.Contains(row.Id) && row.LoanApplicationId == id && row.VehicleId == loan.VehicleId && row.Category == FileCategory.LoanDocument)
                .Select(row => new DocumentBlob { Id = row.Id, FileName = row.FileName, MimeType = row.MimeType, UploadedAt = row.UploadedAt }).ToListAsync();
            return Results.Ok(documents.OrderBy(row => row.UploadedAt).ThenBy(row => row.Id).Select(document =>
                LouView(document, bankId, links.FirstOrDefault(row => row.DocumentId == document.Id), loan.FinalLouDocumentId)));
        }).RequireAuthorization("LoanRead");

        routes.MapPost("/loans/{id:guid}/banks/from-document/{documentId:guid}", async (Guid id, Guid documentId, LoanLouReviewRequest request, AppDbContext db, HttpContext context) =>
            await ReviewLouAsync(id, request.BankOptionId, documentId, request, db, context, true)).RequireAuthorization("Loans");
        routes.MapPost("/loans/{id:guid}/banks/{bankId:guid}/lous/{documentId:guid}/review", async (Guid id, Guid bankId, Guid documentId, LoanLouReviewRequest request, AppDbContext db, HttpContext context) =>
            await ReviewLouAsync(id, bankId, documentId, request, db, context, false)).RequireAuthorization("Loans");
        routes.MapPost("/loans/{id:guid}/banks/{bankId:guid}/lous/{documentId:guid}/finalize", async (Guid id, Guid bankId, Guid documentId, LoanLouFinalizeRequest request, AppDbContext db, HttpContext context) =>
            await FinalizeLouAsync(id, bankId, documentId, request, db, context)).RequireAuthorization("Loans");
        routes.MapPost("/loans/{id:guid}/banks/{bankId:guid}/submit", async (Guid id, Guid bankId, AppDbContext db, HttpContext context) =>
            await MutateAsync(id, bankId, "submit", null, db, context)).RequireAuthorization("Loans");
        routes.MapPost("/loans/{id:guid}/banks/{bankId:guid}/approve", async (Guid id, Guid bankId, AppDbContext db, HttpContext context) =>
            await MutateAsync(id, bankId, "approve", null, db, context)).RequireAuthorization("Loans");
        routes.MapPost("/loans/{id:guid}/banks/{bankId:guid}/reject", async (Guid id, Guid bankId, LoanBankRejectionRequest request, AppDbContext db, HttpContext context) =>
            await MutateAsync(id, bankId, "reject", request.RejectionReason, db, context)).RequireAuthorization("Loans");
        routes.MapPost("/loans/{id:guid}/banks/{bankId:guid}/select-final", async (Guid id, Guid bankId, AppDbContext db, HttpContext context) =>
            await MutateAsync(id, bankId, "select", null, db, context)).RequireAuthorization("LoanRead");
    }

    private static LoanBankLouView LouView(DocumentBlob document, Guid bankId, LoanBankLouDocument? snapshot, Guid? finalDocumentId) =>
        new(document.Id, bankId, document.FileName, document.MimeType, document.UploadedAt, snapshot?.ReviewedAt,
            snapshot?.BankName, snapshot?.LoanAmount, snapshot?.InterestRate, snapshot?.TenureMonths, snapshot?.Terms,
            finalDocumentId == document.Id, snapshot?.IsLegacy ?? true);

    private static LoanBankOption SnapshotTerms(LoanBankOption bank, LoanBankLouDocument snapshot) => bank with
    {
        BankName = snapshot.BankName ?? "", LoanAmount = snapshot.LoanAmount, InterestRate = snapshot.InterestRate,
        TenureMonths = snapshot.TenureMonths, Terms = snapshot.Terms
    };

    public static async Task<ValidationResult> ValidateFinalLouAsync(AppDbContext db, LoanApplication loan, IReadOnlyList<LoanBankOption> banks)
    {
        if (!loan.FinalLouDocumentId.HasValue) return LoanDecisionRules.ValidateApprovalEvidence(loan, banks);
        var selected = banks.SingleOrDefault(row => row.IsSelected);
        var snapshot = await db.LoanBankLouDocuments.AsNoTracking().FirstOrDefaultAsync(row => row.DocumentId == loan.FinalLouDocumentId);
        if (selected is null || snapshot is null || snapshot.BankOptionId != selected.Id || !snapshot.ReviewedAt.HasValue ||
            !HasTerms(SnapshotTerms(selected, snapshot)) ||
            !await db.DocumentBlobs.AnyAsync(row => row.Id == snapshot.DocumentId && row.LoanApplicationId == loan.Id && row.VehicleId == loan.VehicleId && row.Category == FileCategory.LoanDocument))
            return new ValidationResult([new ValidationError("loan_final_lou_invalid", "The exact final LOU must belong to the selected bank and have complete reviewed terms.")]);
        return LoanDecisionRules.ValidateApprovalEvidence(loan, [SnapshotTerms(selected, snapshot)]);
    }

    private static async Task<IResult> ReviewLouAsync(Guid id, Guid? bankId, Guid documentId, LoanLouReviewRequest request, AppDbContext db, HttpContext context, bool returnBank)
    {
        var initial = await db.LoanApplications.AsNoTracking().FirstOrDefaultAsync(row => row.Id == id);
        if (initial is null) return Results.NotFound();
        await using var transaction = await DeliveryConcurrencyLock.BeginLoanAsync(db, initial.VehicleId, id);
        var loan = await db.LoanApplications.FirstAsync(row => row.Id == id);
        if (!LoanDecisionRules.CanProcess(loan, context.User, StaffIdentity.CurrentUserId(context))) return Results.Forbid();
        if (request.UseAsFinal) return Results.BadRequest(new ApiError("Review never selects a final LOU. Use the specific file's final confirmation action."));
        if (!bankId.HasValue || (request.BankOptionId.HasValue && request.BankOptionId != bankId))
            return Results.BadRequest(new ApiError("Choose the bank application explicitly before reviewing its LOU."));
        if (loan.Status is LoanStatus.Draft or LoanStatus.Done or LoanStatus.Rejected) return Results.BadRequest(new ApiError("This loan cannot accept a bank LOU review."));
        var vehicle = await db.Vehicles.AsNoTracking().FirstAsync(row => row.Id == loan.VehicleId);
        if (vehicle.CustomerId != loan.CustomerId) return Results.Conflict(new ApiError("The loan buyer no longer matches the vehicle's confirmed buyer. Refresh the loan."));
        var bank = await db.LoanBankOptions.FirstOrDefaultAsync(row => row.Id == bankId && row.LoanApplicationId == id);
        if (bank is null) return Results.NotFound();
        if (bank.Status == LoanBankOptionStatus.Rejected) return Results.BadRequest(new ApiError("A rejected bank application is review-only."));
        var document = await db.DocumentBlobs.FirstOrDefaultAsync(row => row.Id == documentId && row.LoanApplicationId == id && row.VehicleId == loan.VehicleId && row.Category == FileCategory.LoanDocument);
        if (document is null) return Results.NotFound();
        var link = await db.LoanBankLouDocuments.FirstOrDefaultAsync(row => row.DocumentId == documentId);
        var otherLegacyLink = await db.LoanBankOptions.AnyAsync(row => row.Id != bank.Id && (row.LouDocumentId == documentId || row.EditedLouDocumentId == documentId));
        if ((link is not null && link.BankOptionId != bank.Id) || otherLegacyLink)
            return Results.Conflict(new ApiError("This LOU belongs to another bank application."));
        var legacy = bank.LouDocumentId == documentId || bank.EditedLouDocumentId == documentId;
        if (link is null && !legacy && !returnBank) return Results.NotFound();
        if (returnBank && link?.ReviewedAt is not null && request.BankName is null && !request.LoanAmount.HasValue &&
            !request.InterestRate.HasValue && !request.TenureMonths.HasValue && request.Terms is null && !request.RequireCompleteTerms)
            return Results.Ok(bank);
        var terms = bank with { BankName = (request.BankName ?? "").Trim(), LoanAmount = request.LoanAmount, InterestRate = request.InterestRate, TenureMonths = request.TenureMonths, Terms = request.Terms?.Trim() };
        if (returnBank && link?.ReviewedAt is not null)
        {
            var previous = SnapshotTerms(bank, link);
            if (previous.BankName != terms.BankName || previous.LoanAmount != terms.LoanAmount || previous.InterestRate != terms.InterestRate || previous.TenureMonths != terms.TenureMonths || (previous.Terms ?? "") != (terms.Terms ?? ""))
                return Results.Conflict(new ApiError("This file already has different reviewed terms. Refresh and explicitly review the file before continuing."));
            return Results.Ok(bank);
        }
        if (!HasTerms(terms)) return Results.BadRequest(new ApiError("Review the bank name, amount, interest rate and tenure before saving this LOU."));
        var validation = LoanDecisionRules.ValidateBankOption(terms);
        if (!validation.IsValid) return Results.BadRequest(validation);
        var now = new DateTime(DateTime.UtcNow.Ticks / 10 * 10, DateTimeKind.Utc);
        if (link?.ReviewedAt >= now) now = link.ReviewedAt.Value.AddTicks(10);
        var reviewed = new LoanBankLouDocument { DocumentId = documentId, BankOptionId = bank.Id, ReviewedAt = now,
            ReviewedBy = AuditTrail.ActorFrom(context.User), BankName = terms.BankName, LoanAmount = terms.LoanAmount,
            InterestRate = terms.InterestRate, TenureMonths = terms.TenureMonths, Terms = terms.Terms, IsLegacy = link?.IsLegacy ?? legacy };
        if (link is null) db.LoanBankLouDocuments.Add(reviewed); else db.Entry(link).CurrentValues.SetValues(reviewed);
        var saved = bank.IsSelected ? bank : terms with { Status = LoanBankOptionStatus.Approved,
            LouDocumentId = bank.LouDocumentId ?? documentId,
            EditedLouDocumentId = bank.LouDocumentId.HasValue && bank.LouDocumentId != documentId ? documentId : bank.EditedLouDocumentId,
            RejectionReason = null, UpdatedAt = now };
        if (!bank.IsSelected) db.Entry(bank).CurrentValues.SetValues(saved);
        await RefreshLoanAsync(db, loan, saved, context.User, context.RequestServices.GetRequiredService<IConfiguration>().GetValue("WhatsApp:CaptureEnabled", false));
        ApiAudit.Add(db, context.User, "loan.bank.louReviewed", nameof(DocumentBlob), documentId);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return returnBank ? Results.Ok(saved) : Results.Ok(LouView(document, bank.Id, reviewed, loan.FinalLouDocumentId));
    }

    private static async Task<IResult> FinalizeLouAsync(Guid id, Guid bankId, Guid documentId, LoanLouFinalizeRequest request, AppDbContext db, HttpContext context)
    {
        var initial = await db.LoanApplications.AsNoTracking().FirstOrDefaultAsync(row => row.Id == id);
        if (initial is null) return Results.NotFound();
        await using var transaction = await DeliveryConcurrencyLock.BeginLoanAsync(db, initial.VehicleId, id);
        var loan = await db.LoanApplications.FirstAsync(row => row.Id == id);
        if (!LoanDecisionRules.CanProcess(loan, context.User, StaffIdentity.CurrentUserId(context))) return Results.Forbid();
        var bank = await db.LoanBankOptions.FirstOrDefaultAsync(row => row.Id == bankId && row.LoanApplicationId == id);
        if (bank is null) return Results.NotFound();
        if (loan.Status == LoanStatus.Done)
            return loan.FinalLouDocumentId == documentId && bank.IsSelected ? Results.Ok(loan) : Results.Conflict(new ApiError("This loan has already been completed with another final choice."));
        if (loan.Status != LoanStatus.Approved || bank.Status != LoanBankOptionStatus.Approved)
            return Results.BadRequest(new ApiError("Only an active approved loan and approved bank can be completed."));
        var snapshot = await db.LoanBankLouDocuments.AsNoTracking().FirstOrDefaultAsync(row => row.DocumentId == documentId && row.BankOptionId == bankId);
        if (snapshot is null || !snapshot.ReviewedAt.HasValue) return Results.BadRequest(new ApiError("Review this bank's exact LOU file before final confirmation."));
        if (!request.ExpectedReviewedAt.HasValue || request.ExpectedReviewedAt != snapshot.ReviewedAt)
            return Results.Conflict(new ApiError("This LOU review has changed. Refresh and confirm the latest reviewed terms."));
        var selected = SnapshotTerms(bank, snapshot) with { IsSelected = true, UpdatedAt = DateTime.UtcNow };
        if (!HasTerms(selected) || !await HasOriginalLouAsync(db, loan, bank)) return Results.BadRequest(new ApiError("The bank must have its original LOU and complete reviewed terms."));
        var updated = loan with { Status = LoanStatus.Done, LouDone = true, LouApproved = true, FinalLouDocumentId = documentId,
            LoanBank = selected.BankName, LoanAmount = selected.LoanAmount, InterestRate = selected.InterestRate,
            LoanTenureMonths = selected.TenureMonths, LoanTerms = selected.Terms, LastUpdatedAt = DateTime.UtcNow };
        var transition = LoanDecisionRules.ValidateGenericUpdate(loan, updated);
        if (!transition.IsValid) return Results.BadRequest(transition);
        var deal = LoanDecisionRules.ValidateDealFields(updated);
        if (!deal.IsValid) return Results.BadRequest(deal);
        var vehicles = await db.Vehicles.AsNoTracking().ToListAsync();
        var customers = await db.Customers.AsNoTracking().ToListAsync();
        var loans = await db.LoanApplications.AsNoTracking().ToListAsync();
        var reference = WorkflowReferenceRules.ValidateLoan(updated, vehicles, customers, loans);
        if (!reference.IsValid) return Results.BadRequest(reference);
        var vehicle = await db.Vehicles.FirstAsync(row => row.Id == loan.VehicleId);
        if (vehicle.CustomerId != loan.CustomerId) return Results.Conflict(new ApiError("The loan buyer no longer matches the vehicle's confirmed buyer. Refresh the loan."));
        var finalEvidence = await ValidateFinalLouAsync(db, updated, [selected]);
        if (!finalEvidence.IsValid) return Results.BadRequest(finalEvidence);
        var completion = LoanDocumentRules.ValidateCompletion(updated, await db.DocumentBlobs.AsNoTracking().ToListAsync());
        if (!completion.IsValid) return Results.BadRequest(completion);
        await db.LoanBankOptions.Where(row => row.LoanApplicationId == id && row.Id != bankId).ExecuteUpdateAsync(setters => setters.SetProperty(row => row.IsSelected, false));
        db.Entry(bank).CurrentValues.SetValues(selected);
        db.Entry(vehicle).CurrentValues.SetValues(WorkflowStatusRules.ApplyWorkflowStatus(vehicle, loans.Where(row => row.Id != id).Append(updated),
            await db.PaymentRecords.AsNoTracking().ToListAsync(), await db.DeliverySchedules.AsNoTracking().ToListAsync(),
            await db.FinanceInvoices.AsNoTracking().ToListAsync(), await db.CollectionTransactions.AsNoTracking().ToListAsync()));
        await WhatsAppBusinessEvents.StageLoanStatusAsync(db, loan, updated, context.RequestServices.GetRequiredService<IConfiguration>().GetValue("WhatsApp:CaptureEnabled", false), AuditTrail.ActorFrom(context.User));
        db.Entry(loan).CurrentValues.SetValues(updated);
        ApiAudit.Add(db, context.User, "loan.lou.finalized", nameof(DocumentBlob), documentId);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(updated);
    }

    private static async Task<bool> CanReadAsync(AppDbContext db, LoanApplication loan, HttpContext context)
    {
        var vehicle = await db.Vehicles.AsNoTracking().FirstAsync(row => row.Id == loan.VehicleId);
        return LoanDecisionRules.CanProcess(loan, context.User, StaffIdentity.CurrentUserId(context)) || (context.User.IsInRole("Sales") && vehicle.CustomerId == loan.CustomerId && vehicle.SalesAgentUserId == StaffIdentity.CurrentUserId(context));
    }

    private static async Task<IResult> MutateAsync(Guid id, Guid bankId, string action, string? reason, AppDbContext db, HttpContext context)
    {
        var initial = await db.LoanApplications.AsNoTracking().FirstOrDefaultAsync(row => row.Id == id);
        if (initial is null) return Results.NotFound();
        await using var transaction = await DeliveryConcurrencyLock.BeginLoanAsync(db, initial.VehicleId, id);
        var loan = await db.LoanApplications.FirstAsync(row => row.Id == id);
        if (action == "select" ? !await CanReadAsync(db, loan, context) : !LoanDecisionRules.CanProcess(loan, context.User, StaffIdentity.CurrentUserId(context))) return Results.Forbid();
        if (loan.Status is LoanStatus.Done or LoanStatus.Rejected) return Results.BadRequest(new ApiError("This loan is review-only."));
        var bank = await db.LoanBankOptions.FirstOrDefaultAsync(row => row.Id == bankId && row.LoanApplicationId == id);
        if (bank is null) return Results.NotFound();
        LoanBankOption saved;
        if (action == "select")
        {
            if (bank.Status != LoanBankOptionStatus.Approved || !HasTerms(bank) || !await HasOriginalLouAsync(db, loan, bank))
                return Results.BadRequest(new ApiError("Select an approved bank with complete reviewed terms and linked LOU."));
            await db.LoanBankOptions.Where(row => row.LoanApplicationId == id && row.Id != bankId).ExecuteUpdateAsync(setters => setters.SetProperty(row => row.IsSelected, false));
            saved = bank with { IsSelected = true, UpdatedAt = DateTime.UtcNow };
            db.Entry(loan).CurrentValues.SetValues(loan with { FinalLouDocumentId = null, LoanBank = bank.BankName.Trim(), LoanAmount = bank.LoanAmount, InterestRate = bank.InterestRate, LoanTenureMonths = bank.TenureMonths, LoanTerms = bank.Terms?.Trim(), LastUpdatedAt = DateTime.UtcNow });
        }
        else if (action == "approve")
        {
            var vehicle = await db.Vehicles.AsNoTracking().FirstAsync(row => row.Id == loan.VehicleId);
            if (vehicle.CustomerId != loan.CustomerId)
                return Results.Conflict(new ApiError("The loan buyer no longer matches the vehicle's confirmed buyer. Refresh the loan before approving the bank."));
            if (bank.Status != LoanBankOptionStatus.Submitted || bank.IsSelected || !HasTerms(bank) || !await HasOriginalLouAsync(db, loan, bank))
                return Results.BadRequest(new ApiError("Approve a submitted bank with complete terms and its linked original LOU. An edited LOU is optional."));
            var validation = LoanDecisionRules.ValidateBankOption(bank);
            if (!validation.IsValid) return Results.BadRequest(validation);
            saved = bank with { Status = LoanBankOptionStatus.Approved, RejectionReason = null, UpdatedAt = DateTime.UtcNow };
        }
        else if (action == "submit")
        {
            if (bank.Status != LoanBankOptionStatus.Pending) return Results.BadRequest(new ApiError("Only a pending bank option can be submitted."));
            saved = bank with { Status = LoanBankOptionStatus.Submitted, SubmittedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        }
        else
        {
            if (bank.Status != LoanBankOptionStatus.Submitted || bank.IsSelected || string.IsNullOrWhiteSpace(reason) || reason.Trim().Length > LoanDecisionRules.RejectionReasonMaxLength)
                return Results.BadRequest(new ApiError("Reject a submitted bank with a reason of 1 to 500 characters."));
            saved = bank with { Status = LoanBankOptionStatus.Rejected, RejectionReason = reason.Trim(), UpdatedAt = DateTime.UtcNow };
        }
        db.Entry(bank).CurrentValues.SetValues(saved);
        if (action != "select") await RefreshLoanAsync(db, loan, saved, context.User, context.RequestServices.GetRequiredService<IConfiguration>().GetValue("WhatsApp:CaptureEnabled", false));
        ApiAudit.Add(db, context.User, "loan.bank." + action, nameof(LoanBankOption), bankId);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(saved);
    }
}

public sealed record LoanBankRejectionRequest(string? RejectionReason);
public sealed record LoanLouReviewRequest(string? BankName, decimal? LoanAmount, decimal? InterestRate, int? TenureMonths, string? Terms, Guid? BankOptionId = null, bool UseAsFinal = false, bool RequireCompleteTerms = false);
public sealed record LoanLouFinalizeRequest(DateTime? ExpectedReviewedAt);
public sealed record LoanBankLouView(Guid DocumentId, Guid BankOptionId, string FileName, string MimeType, DateTime UploadedAt,
    DateTime? ReviewedAt, string? BankName, decimal? LoanAmount, decimal? InterestRate, int? TenureMonths, string? Terms, bool IsFinal, bool IsLegacy);
