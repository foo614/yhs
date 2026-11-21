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

        routes.MapPost("/loans/{id:guid}/banks/from-document/{documentId:guid}", async (Guid id, Guid documentId, LoanLouReviewRequest request, AppDbContext db, HttpContext context) =>
        {
            var initial = await db.LoanApplications.AsNoTracking().FirstOrDefaultAsync(row => row.Id == id);
            if (initial is null) return Results.NotFound();
            await using var transaction = await DeliveryConcurrencyLock.BeginLoanAsync(db, initial.VehicleId, id);
            var loan = await db.LoanApplications.FirstAsync(row => row.Id == id);
            if (!LoanDecisionRules.CanProcess(loan, context.User, StaffIdentity.CurrentUserId(context))) return Results.Forbid();
            if (loan.Status is LoanStatus.Done or LoanStatus.Rejected) return Results.BadRequest(new ApiError("This loan is review-only."));
            var vehicle = await db.Vehicles.AsNoTracking().FirstOrDefaultAsync(row => row.Id == loan.VehicleId);
            if (vehicle is null || vehicle.CustomerId != loan.CustomerId) return Results.Conflict(new ApiError("The loan buyer no longer matches the vehicle's confirmed buyer. Refresh the loan before saving the LOU."));
            var document = await db.DocumentBlobs.FirstOrDefaultAsync(row => row.Id == documentId && row.VehicleId == loan.VehicleId && row.LoanApplicationId == id && row.Category == FileCategory.LoanDocument);
            if (document is null) return Results.NotFound();
            var existing = await db.LoanBankOptions.FirstOrDefaultAsync(row => row.LouDocumentId == documentId || row.EditedLouDocumentId == documentId);
            if (existing is not null)
            {
                if (existing.LoanApplicationId != id || (request.BankOptionId.HasValue && request.BankOptionId != existing.Id))
                    return Results.Conflict(new ApiError("This LOU is already linked to another bank option."));
                return Results.Ok(existing);
            }
            var bankName = (request.BankName ?? "").Trim();
            LoanBankOption? target = request.BankOptionId.HasValue
                ? await db.LoanBankOptions.FirstOrDefaultAsync(row => row.Id == request.BankOptionId && row.LoanApplicationId == id)
                : null;
            if (request.BankOptionId.HasValue && target is null) return Results.NotFound();
            if (target is null)
            {
                var matches = await db.LoanBankOptions.Where(row => row.LoanApplicationId == id && row.Status != LoanBankOptionStatus.Rejected && row.BankName.ToUpper() == bankName.ToUpper()).ToListAsync();
                if (matches.Count > 1) return Results.Conflict(new ApiError("Select the bank option before saving this LOU because duplicate bank names exist."));
                target = matches.SingleOrDefault();
            }
            if (target is not null && (target.IsSelected || target.Status == LoanBankOptionStatus.Rejected)) return Results.BadRequest(new ApiError("This bank option is locked. Select another active bank option."));
            if (target?.LouDocumentId is not null && !await HasOriginalLouAsync(db, loan, target))
                return Results.BadRequest(new ApiError("The bank's original LOU is unavailable. Restore its original evidence before reviewing an edited LOU."));
            if (request.UseAsFinal)
            {
                var activeOptions = await db.LoanBankOptions.Where(row => row.LoanApplicationId == id && row.Status != LoanBankOptionStatus.Rejected).ToListAsync();
                if (activeOptions.Any(row => target is null || row.Id != target.Id))
                    return Results.Conflict(new ApiError("Another active bank option exists. Refresh and choose the final LOU explicitly."));
            }
            var option = (target ?? new LoanBankOption { LoanApplicationId = id }) with { BankName = bankName, LoanAmount = request.LoanAmount, InterestRate = request.InterestRate, TenureMonths = request.TenureMonths, Terms = request.Terms?.Trim(), Status = LoanBankOptionStatus.Approved, LouDocumentId = target?.LouDocumentId ?? documentId, EditedLouDocumentId = target?.LouDocumentId.HasValue == true ? documentId : null, IsSelected = request.UseAsFinal, RejectionReason = null, UpdatedAt = DateTime.UtcNow };
            if (!LoanBankWorkflow.HasTerms(option)) return Results.BadRequest(new ApiError("Review the bank name, amount, interest rate, and tenure before saving the LOU."));
            var validation = LoanDecisionRules.ValidateBankOption(option);
            if (!validation.IsValid) return Results.BadRequest(validation);
            if (target is null) db.LoanBankOptions.Add(option); else db.Entry(target).CurrentValues.SetValues(option);
            await LoanBankWorkflow.RefreshLoanAsync(db, loan, option, context.User, context.RequestServices.GetRequiredService<IConfiguration>().GetValue("WhatsApp:CaptureEnabled", false));
            if (request.UseAsFinal)
                db.Entry(loan).CurrentValues.SetValues(loan with { LoanBank = option.BankName, LoanAmount = option.LoanAmount, InterestRate = option.InterestRate, LoanTenureMonths = option.TenureMonths, LoanTerms = option.Terms, LastUpdatedAt = DateTime.UtcNow });
            ApiAudit.Add(db, context.User, "loan.bank.louReviewed", nameof(LoanBankOption), option.Id);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.Created($"/api/loans/{id}/banks/{option.Id}", option);
        }).RequireAuthorization("Loans");

        routes.MapPost("/loans/{id:guid}/banks/{bankId:guid}/submit", async (Guid id, Guid bankId, AppDbContext db, HttpContext context) =>
            await MutateAsync(id, bankId, "submit", null, db, context)).RequireAuthorization("Loans");
        routes.MapPost("/loans/{id:guid}/banks/{bankId:guid}/approve", async (Guid id, Guid bankId, AppDbContext db, HttpContext context) =>
            await MutateAsync(id, bankId, "approve", null, db, context)).RequireAuthorization("Loans");
        routes.MapPost("/loans/{id:guid}/banks/{bankId:guid}/reject", async (Guid id, Guid bankId, LoanBankRejectionRequest request, AppDbContext db, HttpContext context) =>
            await MutateAsync(id, bankId, "reject", request.RejectionReason, db, context)).RequireAuthorization("Loans");
        routes.MapPost("/loans/{id:guid}/banks/{bankId:guid}/select-final", async (Guid id, Guid bankId, AppDbContext db, HttpContext context) =>
            await MutateAsync(id, bankId, "select", null, db, context)).RequireAuthorization("LoanRead");
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
            db.Entry(loan).CurrentValues.SetValues(loan with { LoanBank = bank.BankName.Trim(), LoanAmount = bank.LoanAmount, InterestRate = bank.InterestRate, LoanTenureMonths = bank.TenureMonths, LoanTerms = bank.Terms?.Trim(), LastUpdatedAt = DateTime.UtcNow });
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
public sealed record LoanLouReviewRequest(string? BankName, decimal? LoanAmount, decimal? InterestRate, int? TenureMonths, string? Terms, Guid? BankOptionId = null, bool UseAsFinal = false);
