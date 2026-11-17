using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class LoanBankWorkflow
{
    public static bool HasTerms(LoanBankOption bank) => !string.IsNullOrWhiteSpace(bank.BankName) && bank.LoanAmount is > 0 && bank.InterestRate is > 0 && bank.TenureMonths is > 0;

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
            if (saved.LouDocumentId.HasValue) saved = saved with { Status = HasTerms(saved) ? LoanBankOptionStatus.Approved : LoanBankOptionStatus.Submitted };
            db.Entry(bank).CurrentValues.SetValues(saved);
            await RefreshLoanAsync(db, loan, saved, context.User, context.RequestServices.GetRequiredService<IConfiguration>().GetValue("WhatsApp:CaptureEnabled", false));
            ApiAudit.Add(db, context.User, "loan.bank.updated", nameof(LoanBankOption), bankId);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            return Results.Ok(saved);
        }).RequireAuthorization("Loans");

        routes.MapPost("/loans/{id:guid}/banks/{bankId:guid}/submit", async (Guid id, Guid bankId, AppDbContext db, HttpContext context) =>
            await MutateAsync(id, bankId, "submit", null, db, context)).RequireAuthorization("Loans");
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
            if (bank.Status != LoanBankOptionStatus.Approved || !HasTerms(bank) || !bank.LouDocumentId.HasValue ||
                !await db.DocumentBlobs.AnyAsync(row => row.Id == bank.LouDocumentId && row.LoanApplicationId == id && row.VehicleId == loan.VehicleId && row.Category == FileCategory.LoanDocument))
                return Results.BadRequest(new ApiError("Select an approved bank with complete reviewed terms and linked LOU."));
            await db.LoanBankOptions.Where(row => row.LoanApplicationId == id && row.Id != bankId).ExecuteUpdateAsync(setters => setters.SetProperty(row => row.IsSelected, false));
            saved = bank with { IsSelected = true, UpdatedAt = DateTime.UtcNow };
            db.Entry(loan).CurrentValues.SetValues(loan with { LoanBank = bank.BankName.Trim(), LoanAmount = bank.LoanAmount, InterestRate = bank.InterestRate, LoanTenureMonths = bank.TenureMonths, LoanTerms = bank.Terms?.Trim(), LastUpdatedAt = DateTime.UtcNow });
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
