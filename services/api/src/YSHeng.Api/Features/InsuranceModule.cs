using System.Text.RegularExpressions;
using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record InsuranceCaseView(InsuranceCase Record, IReadOnlyList<InsuranceReceipt> Receipts,
    IReadOnlyList<InsuranceInsurerPayment> InsurerPayments, IReadOnlyList<InsuranceAttachment> Attachments,
    decimal Total, decimal Received, decimal Outstanding, bool RenewalDue, bool PaymentAlert, decimal? Commission);
public sealed record InsuranceReceiptRequest(string IdempotencyKey, decimal Amount, string PaymentType,
    string DepositAccount, DateOnly ReceivedDate, string InvoiceNumber, Guid? EvidenceAttachmentId = null);
public sealed record InsurancePaymentRequest(string IdempotencyKey, decimal Amount, DateOnly PaidDate, string Reference);
public sealed record InsuranceConfirmRequest(bool Confirmed);
public sealed record InsuranceRenewRequest(long Version, bool Confirmed);
public sealed record InsuranceImportRequest(string[] Headers, string[][] Rows, string? IdempotencyKey = null);
public sealed record InsuranceImportPreview(IReadOnlyList<InsuranceCase> Records, IReadOnlyList<string> Errors);

public static class InsuranceRules
{
    public static readonly string[] ImportHeaders = ["NAME", "IC NO.", "VEHICLE NO.", "EXP DATE", "INSURANCE", "COVERAGE", "NCD", "RENEWAL/NEW", "REMARK", "Customer Phone Number"];
    public static DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow.AddHours(8));
    public static decimal Total(InsuranceCase item) => item.InsuranceAmount + item.RoadTaxAmount + item.RunnerFee + item.OtherCharges.Sum(x => x.Amount) - item.Discount;
    public static decimal Received(IEnumerable<InsuranceReceipt> receipts) => receipts.Where(x => x.Status == "Confirmed").Sum(x => x.Amount);
    public static bool RenewalDue(InsuranceCase item, DateOnly today) => !item.RenewalDeclined && item.RenewedByCaseId == null && today >= item.ExpiryDate.AddMonths(-1);
    public static bool PaymentAlert(InsuranceCase item, decimal outstanding, DateOnly today) => outstanding > 0 && item.CoverStartDate.HasValue && today >= item.CoverStartDate.Value.AddDays(7);
    public static InsuranceCase Normalize(InsuranceCase item) => item with
    {
        PlateNumber = (item.PlateNumber ?? "").Trim().ToUpperInvariant(), CustomerName = (item.CustomerName ?? "").Trim(),
        CustomerPhone = string.IsNullOrWhiteSpace(item.CustomerPhone) ? null : item.CustomerPhone.Trim(),
        RunnerFee = item.RoadTaxMethod == "JPJ" ? item.RunnerFee : 0
    };
    private static bool Money(decimal amount) => amount >= 0 && amount <= 10000000m && decimal.Round(amount, 2) == amount;
    public static string? Validate(InsuranceCase item)
    {
        if (string.IsNullOrWhiteSpace(item.PlateNumber) || item.PlateNumber.Length > 30 || string.IsNullOrWhiteSpace(item.CustomerName) || item.CustomerName.Length > 250)
            return "Plate and customer name are required (maximum 30 and 250 characters).";
        if (item.ExpiryDate == default || item.CoverStartDate > item.ExpiryDate) return "Enter a valid expiry after cover starts.";
        if (item.CaseType is not ("New" or "Renewal" or "BankArranged") || item.Company is not ("Auto" or "Automotive")) return "Invalid case type or invoice company.";
        if (item.RoadTaxMethod is not ("None" or "JPJ" or "EAuto") || item.RoadTaxMonths is not (6 or 12)) return "Select a valid road-tax method and term.";
        if (item.Ncd is < 0 or > 100) return "NCD must be between 0 and 100.";
        if (!Money(item.InsuranceAmount) || !Money(item.RoadTaxAmount) || !Money(item.RunnerFee) || !Money(item.Discount) || item.OtherCharges.Length > 30 || item.OtherCharges.Any(x => x == null || !Money(x.Amount) || string.IsNullOrWhiteSpace(x.ItemCode) || string.IsNullOrWhiteSpace(x.Description))) return "Amounts must be non-negative RM values with at most two decimal places; other charges need item and description.";
        if (item.Discount > item.InsuranceAmount) return "Insurance discount cannot exceed the insurance amount.";
        if ((item.BankCreditorName?.Length ?? 0) > 250 || (item.BankInvoiceNumber?.Length ?? 0) > 100) return "Bank creditor or invoice is too long.";
        if ((item.CustomerPhone?.Length ?? 0) > 30 || (item.IdentityNumber?.Length ?? 0) > 50 || (item.Remark?.Length ?? 0) > 2000 || (item.PolicyNumber?.Length ?? 0) > 100) return "A customer or policy field is too long.";
        return null;
    }
    public static string? ValidateReceipt(InsuranceReceiptRequest request, InsuranceCase item, decimal outstanding)
    {
        if (string.IsNullOrWhiteSpace(request.IdempotencyKey) || request.IdempotencyKey.Length > 100 || !Money(request.Amount) || request.Amount <= 0 || request.Amount > outstanding) return "Enter a positive amount no greater than outstanding and an idempotency key.";
        if (request.PaymentType is not ("Cash" or "TNG" or "Transfer" or "Card") || request.DepositAccount is not ("Cash" or "PBB")) return "Select an original payment type and actual Cash/PBB destination.";
        if (request.PaymentType == "Cash" && request.DepositAccount != "Cash") return "Cash receipts use Cash in AutoCount.";
        if (request.ReceivedDate == default || request.ReceivedDate > Today || string.IsNullOrWhiteSpace(request.InvoiceNumber) || request.InvoiceNumber != item.InvoiceNumber) return "Receipt must identify this case's current invoice and a valid received date.";
        return null;
    }
    public static InsuranceImportPreview PreviewImport(InsuranceImportRequest request)
    {
        var errors = new List<string>(); var records = new List<InsuranceCase>();
        if (request.Headers == null || !request.Headers.SequenceEqual(ImportHeaders)) return new([], ["Headers must exactly follow the sample order: " + string.Join(", ", ImportHeaders)]);
        if (request.Rows == null || request.Rows.Length is 0 or > 1000) return new([], ["Import between 1 and 1000 rows at a time."]);
        var keys = new HashSet<string>();
        for (var i = 0; i < request.Rows.Length; i++)
        {
            var row = request.Rows[i]?.Select(x => x ?? "").ToArray();
            if (row == null || row.Length != ImportHeaders.Length) { errors.Add($"Row {i + 1}: expected {ImportHeaders.Length} columns."); continue; }
            if (!DateOnly.TryParseExact(row[3].Trim(), ["d/M/yyyy", "dd/MM/yyyy", "yyyy-MM-dd"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var expiry)) { errors.Add($"Row {i + 1}: expiry must be day/month/year or YYYY-MM-DD."); continue; }
            decimal? ncd = null;
            if (row[6].Trim().Length > 0) { if (decimal.TryParse(row[6], NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed)) ncd = parsed; else { errors.Add($"Row {i + 1}: invalid NCD."); continue; } }
            var renewal = row[7].Trim().ToUpperInvariant();
            if (renewal != "N" && !Regex.IsMatch(renewal, @"\AR(?:\s*\([^()\r\n]+\))?\z")) { errors.Add($"Row {i + 1}: RENEWAL/NEW must be N or R (with optional source note)."); continue; }
            var item = Normalize(new InsuranceCase { CustomerName = row[0], IdentityNumber = row[1], PlateNumber = row[2], ExpiryDate = expiry, Insurer = row[4], Coverage = row[5], Ncd = ncd, CaseType = renewal == "N" ? "New" : "Renewal", Remark = renewal.Length > 1 ? row[8] + "\nSource RENEWAL/NEW: " + row[7] : row[8], CustomerPhone = row[9], RunnerFee = 0 });
            var key = item.PlateNumber + ":" + item.ExpiryDate.ToString("yyyy-MM-dd");
            if (!keys.Add(key)) errors.Add($"Row {i + 1}: duplicate plate and expiry in import.");
            var error = Validate(item); if (error != null) errors.Add($"Row {i + 1}: {error}");
            records.Add(item with { ImportKey = key });
        }
        return new(records, errors);
    }
}

public static class InsuranceModule
{
    public static void MapRoutes(RouteGroupBuilder backOffice)
    {
        var group = backOffice.MapGroup("/insurance").RequireAuthorization("BossAdmin");
        group.MapGet("", async (AppDbContext db) =>
        {
            var items = await db.InsuranceCases.AsNoTracking().OrderBy(x => x.ExpiryDate).ToListAsync();
            var receipts = await db.InsuranceReceipts.AsNoTracking().ToListAsync();
            var payments = await db.InsuranceInsurerPayments.AsNoTracking().ToListAsync();
            var attachments = await db.InsuranceAttachments.AsNoTracking().Select(x => new InsuranceAttachment { Id = x.Id, CaseId = x.CaseId, Kind = x.Kind, FileName = x.FileName, MimeType = x.MimeType, Checksum = x.Checksum, UploadedBy = x.UploadedBy, UploadedAt = x.UploadedAt }).ToListAsync();
            return Results.Ok(items.Select(x => View(x, receipts.Where(r => r.CaseId == x.Id).ToList(), payments.Where(r => r.CaseId == x.Id).ToList(), attachments.Where(r => r.CaseId == x.Id).ToList())));
        });
        group.MapGet("/{id:guid}", async (Guid id, AppDbContext db) =>
        {
            var item = await db.InsuranceCases.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id);
            return item == null ? Results.NotFound() : Results.Ok(await LoadView(db, item));
        });
        group.MapGet("/jpj-list", async (AppDbContext db) => Results.Ok(await db.InsuranceCases.AsNoTracking()
            .Where(x => x.RoadTaxMethod == "JPJ" && !x.RoadTaxCompleted)
            .Select(x => new { x.Id, x.PlateNumber, x.IdentityNumber, x.CustomerName, x.RoadTaxMonths, x.RunnerFee }).ToListAsync()));
        group.MapPost("", async (InsuranceCase request, AppDbContext db, HttpContext context) =>
        {
            var item = InsuranceRules.Normalize(request) with { Id = Guid.NewGuid(), Version = 1, CreatedBy = AuditTrail.ActorFrom(context.User), CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow, ImportKey = null, ImportBatchKey = null, ImportFingerprint = null, RenewedByCaseId = null };
            var error = InsuranceRules.Validate(item); if (error != null) return Results.BadRequest(new ApiError(error));
            if (item.RoadTaxCompleted) return Results.BadRequest(new ApiError("Upload evidence after creating the case before completing road tax."));
            db.InsuranceCases.Add(item); ApiAudit.Add(db, context.User, "insurance.created", nameof(InsuranceCase), item.Id);
            await db.SaveChangesAsync(); return Results.Created($"/api/insurance/{item.Id}", await LoadView(db, item));
        });
        group.MapPut("/{id:guid}", async (Guid id, InsuranceCase request, AppDbContext db, HttpContext context) =>
        {
            if (id != request.Id) return Results.BadRequest(new ApiError("Route and body IDs must match."));
            var current = await db.InsuranceCases.FirstOrDefaultAsync(x => x.Id == id); if (current == null) return Results.NotFound();
            if (request.Version != current.Version) return Results.Conflict(new ApiError("Case changed. Reload before saving."));
            var item = InsuranceRules.Normalize(request) with { Version = current.Version + 1, CreatedAt = current.CreatedAt, CreatedBy = current.CreatedBy, RenewedByCaseId = current.RenewedByCaseId, ImportKey = current.ImportKey, ImportBatchKey = current.ImportBatchKey, ImportFingerprint = current.ImportFingerprint, UpdatedAt = DateTimeOffset.UtcNow };
            var error = InsuranceRules.Validate(item); if (error != null) return Results.BadRequest(new ApiError(error));
            var receipts = await db.InsuranceReceipts.AsNoTracking().Where(x => x.CaseId == id).ToListAsync();
            var insurerPaid = await db.InsuranceInsurerPayments.Where(x => x.CaseId == id).Select(x => x.Amount).ToListAsync();
            if (item.CaseType == "BankArranged" && insurerPaid.Count > 0) return Results.Conflict(new ApiError("A case with actual Auto insurer payments cannot change to bank-arranged cover."));
            if (item.InsuranceAmount < insurerPaid.Sum()) return Results.Conflict(new ApiError("Policy amount cannot be less than actual insurer payments."));
            if (InsuranceRules.Total(item) < InsuranceRules.Received(receipts)) return Results.Conflict(new ApiError("Charges cannot be less than confirmed receipts."));
            if (receipts.Any() && (item.InvoiceNumber != current.InvoiceNumber || item.Company != current.Company)) return Results.Conflict(new ApiError("Invoice number and company cannot change after a receipt preview exists."));
            if (item.RoadTaxCompleted && (item.RoadTaxMethod == "None" || (item.RoadTaxMethod == "JPJ" && !await db.InsuranceAttachments.AnyAsync(x => x.CaseId == id && x.Kind == "RoadTaxReceipt")))) return Results.Conflict(new ApiError("JPJ completion requires a receipt file belonging to this case."));
            db.Entry(current).CurrentValues.SetValues(item); ApiAudit.Add(db, context.User, "insurance.updated", nameof(InsuranceCase), id);
            try { await db.SaveChangesAsync(); } catch (DbUpdateConcurrencyException) { return Results.Conflict(new ApiError("Case changed. Reload before saving.")); }
            return Results.Ok(await LoadView(db, item));
        });
        group.MapPost("/{id:guid}/renew", async (Guid id, InsuranceRenewRequest request, AppDbContext db, HttpContext context, CancellationToken ct) =>
        {
            if (!request.Confirmed) return Results.BadRequest(new ApiError("Explicit new annual case confirmation is required."));
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            await db.InsuranceCases.Where(x => x.Id == id).ExecuteUpdateAsync(set => set.SetProperty(x => x.Version, x => x.Version), ct);
            var current = await db.InsuranceCases.SingleOrDefaultAsync(x => x.Id == id, ct);
            if (current is null) return Results.NotFound();
            if (current.RenewedByCaseId is { } successor)
                return Results.Ok(await LoadView(db, await db.InsuranceCases.SingleAsync(x => x.Id == successor, ct)));
            if (request.Version != current.Version) return Results.Conflict(new ApiError("Case changed. Reload before starting renewal."));
            if (current.RenewalDeclined) return Results.Conflict(new ApiError("Customer declined renewal. Review the renewal decision first."));
            if (current.ExpiryDate.Year == 9999) return Results.BadRequest(new ApiError("Expiry cannot be advanced another year."));
            var next = new InsuranceCase
            {
                PlateNumber = current.PlateNumber, CustomerName = current.CustomerName, CustomerPhone = current.CustomerPhone,
                IdentityNumber = current.IdentityNumber, CaseType = "Renewal", Company = current.Company, Insurer = current.Insurer,
                Coverage = current.Coverage, Ncd = current.Ncd, ExpiryDate = current.ExpiryDate.AddYears(1),
                RoadTaxMethod = current.RoadTaxMethod, RoadTaxMonths = current.RoadTaxMonths, RunnerFee = current.RoadTaxMethod == "JPJ" ? 20 : 0,
                Version = 1, CreatedBy = AuditTrail.ActorFrom(context.User)
            };
            db.InsuranceCases.Add(next);
            db.Entry(current).CurrentValues.SetValues(current with { RenewedByCaseId = next.Id, Version = current.Version + 1, UpdatedAt = DateTimeOffset.UtcNow });
            ApiAudit.Add(db, context.User, "insurance.renewalStarted", nameof(InsuranceCase), current.Id);
            await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
            return Results.Ok(await LoadView(db, next));
        });
        group.MapPost("/{id:guid}/attachments", UploadAsync).DisableAntiforgery();
        group.MapGet("/{id:guid}/attachments/{attachmentId:guid}", async (Guid id, Guid attachmentId, AppDbContext db, HttpContext context) =>
        {
            var file = await db.InsuranceAttachments.AsNoTracking().FirstOrDefaultAsync(x => x.Id == attachmentId && x.CaseId == id);
            if (file == null) return Results.NotFound();
            context.Response.Headers.XContentTypeOptions = "nosniff"; context.Response.Headers.CacheControl = "no-store";
            return Results.File(file.Content, file.MimeType, file.FileName);
        });
        group.MapPost("/{id:guid}/receipts/preview", async (Guid id, InsuranceReceiptRequest request, AppDbContext db, HttpContext context) =>
        {
            var item = await db.InsuranceCases.FirstOrDefaultAsync(x => x.Id == id); if (item == null) return Results.NotFound();
            var prior = await db.InsuranceReceipts.AsNoTracking().FirstOrDefaultAsync(x => x.CaseId == id && x.IdempotencyKey == request.IdempotencyKey);
            if (prior != null) return prior.Amount == request.Amount && prior.PaymentType == request.PaymentType && prior.DepositAccount == request.DepositAccount && prior.ReceivedDate == request.ReceivedDate && prior.InvoiceNumber == request.InvoiceNumber && prior.EvidenceAttachmentId == request.EvidenceAttachmentId ? Results.Ok(prior) : Results.Conflict(new ApiError("Idempotency key was already used for different receipt details."));
            var received = InsuranceRules.Received(await db.InsuranceReceipts.AsNoTracking().Where(x => x.CaseId == id).ToListAsync());
            var error = InsuranceRules.ValidateReceipt(request, item, InsuranceRules.Total(item) - received); if (error != null) return Results.BadRequest(new ApiError(error));
            if (request.EvidenceAttachmentId.HasValue && !await db.InsuranceAttachments.AnyAsync(x => x.Id == request.EvidenceAttachmentId && x.CaseId == id && x.Kind == "PaymentEvidence")) return Results.BadRequest(new ApiError("Payment evidence must belong to this case."));
            var receipt = new InsuranceReceipt { CaseId = id, IdempotencyKey = request.IdempotencyKey, Amount = request.Amount, PaymentType = request.PaymentType, DepositAccount = request.DepositAccount, ReceivedDate = request.ReceivedDate, EvidenceAttachmentId = request.EvidenceAttachmentId, InvoiceNumber = request.InvoiceNumber, Company = item.Company, CreatedBy = AuditTrail.ActorFrom(context.User) };
            db.InsuranceReceipts.Add(receipt); ApiAudit.Add(db, context.User, "insurance.receiptPreviewed", nameof(InsuranceReceipt), receipt.Id);
            try { await db.SaveChangesAsync(); } catch (DbUpdateException) { return Results.Conflict(new ApiError("Receipt preview already exists. Reload the case.")); }
            return Results.Ok(receipt);
        }).RequireAuthorization("Finance");
        group.MapPost("/{id:guid}/receipts/{receiptId:guid}/confirm", async (Guid id, Guid receiptId, InsuranceConfirmRequest request, AppDbContext db, HttpContext context, CancellationToken ct) =>
        {
            if (!request.Confirmed) return Results.BadRequest(new ApiError("Explicit funds confirmation is required."));
            var error = await ConfirmReceiptAsync(db, id, receiptId, context.User, ct);
            return error == null ? Results.Ok(await db.InsuranceReceipts.AsNoTracking().FirstAsync(x => x.Id == receiptId, ct)) : Results.Conflict(new ApiError(error));
        }).RequireAuthorization("Finance");
        group.MapPost("/{id:guid}/insurer-payments", async (Guid id, InsurancePaymentRequest request, AppDbContext db, HttpContext context) =>
        {
            var item = await db.InsuranceCases.FirstOrDefaultAsync(x => x.Id == id); if (item == null) return Results.NotFound();
            var existing = await db.InsuranceInsurerPayments.AsNoTracking().FirstOrDefaultAsync(x => x.CaseId == id && x.IdempotencyKey == request.IdempotencyKey);
            if (existing != null) return existing.Amount == request.Amount && existing.PaidDate == request.PaidDate && existing.Reference == request.Reference ? Results.Ok(existing) : Results.Conflict(new ApiError("Idempotency key already used for different insurer payment."));
            if (item.CaseType == "BankArranged") return Results.Conflict(new ApiError("Bank-arranged cover does not record an Auto insurer payment."));
            var paid = (await db.InsuranceInsurerPayments.Where(x => x.CaseId == id).Select(x => x.Amount).ToListAsync()).Sum();
            if (paid > 0) return Results.Conflict(new ApiError("The final actual insurer payment is already recorded. Do not enter installment payments as additional settlement."));
            if (string.IsNullOrWhiteSpace(request.IdempotencyKey) || request.IdempotencyKey.Length > 100 || request.Amount <= 0 || decimal.Round(request.Amount, 2) != request.Amount || paid + request.Amount > item.InsuranceAmount || request.PaidDate == default || request.PaidDate > InsuranceRules.Today || string.IsNullOrWhiteSpace(request.Reference)) return Results.BadRequest(new ApiError("Enter actual insurer payment, valid date, reference and unique key. Total cannot exceed policy amount."));
            var payment = new InsuranceInsurerPayment { CaseId = id, IdempotencyKey = request.IdempotencyKey, Amount = request.Amount, PaidDate = request.PaidDate, Reference = request.Reference, ConfirmedBy = AuditTrail.ActorFrom(context.User) };
            db.InsuranceInsurerPayments.Add(payment); db.Entry(item).CurrentValues.SetValues(item with { Version = item.Version + 1, UpdatedAt = DateTimeOffset.UtcNow });
            ApiAudit.Add(db, context.User, "insurance.insurerPaymentConfirmed", nameof(InsuranceInsurerPayment), payment.Id);
            try { await db.SaveChangesAsync(); } catch (DbUpdateException) { return Results.Conflict(new ApiError("Payment or case changed. Reload before recording.")); }
            return Results.Ok(payment);
        }).RequireAuthorization("Finance");
        group.MapPost("/import/preview", (InsuranceImportRequest request) => Results.Ok(InsuranceRules.PreviewImport(request)));
        group.MapPost("/import/confirm", async (InsuranceImportRequest request, AppDbContext db, HttpContext context) =>
        {
            var preview = InsuranceRules.PreviewImport(request); if (preview.Errors.Count > 0) return Results.BadRequest(preview);
            if (string.IsNullOrWhiteSpace(request.IdempotencyKey) || request.IdempotencyKey.Length > 100) return Results.BadRequest(new ApiError("Import confirmation requires a unique key."));
            var fingerprint = Convert.ToHexString(SHA256.HashData(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new { request.Headers, request.Rows })));
            var priorBatch = await db.InsuranceCases.AsNoTracking().Where(x => x.ImportBatchKey == request.IdempotencyKey).ToListAsync();
            if (priorBatch.Count > 0) return priorBatch.All(x => x.ImportFingerprint == fingerprint) ? Results.Ok(priorBatch) : Results.Conflict(new ApiError("Import key already used for a different listing."));
            var keys = preview.Records.Select(x => x.ImportKey).ToList();
            var existing = await db.InsuranceCases.Where(x => keys.Contains(x.ImportKey)).ToListAsync();
            if (existing.Count > 0) return Results.Conflict(new ApiError("Import contains an existing plate/expiry. No records imported."));
            var records = preview.Records.Select(x => x with { CreatedBy = AuditTrail.ActorFrom(context.User), Version = 1, ImportBatchKey = request.IdempotencyKey, ImportFingerprint = fingerprint }).ToList();
            db.InsuranceCases.AddRange(records); ApiAudit.Add(db, context.User, "insurance.imported", nameof(InsuranceCase), Guid.Empty);
            try { await db.SaveChangesAsync(); } catch (DbUpdateException) { return Results.Conflict(new ApiError("Import duplicates existing records. No records imported.")); }
            return Results.Ok(records);
        });
    }
    public static InsuranceCaseView View(InsuranceCase item, IReadOnlyList<InsuranceReceipt> receipts, IReadOnlyList<InsuranceInsurerPayment> payments, IReadOnlyList<InsuranceAttachment> attachments)
    {
        var total = InsuranceRules.Total(item); var received = InsuranceRules.Received(receipts); var outstanding = Math.Max(0, total - received);
        return new(item, receipts, payments, attachments, total, received, outstanding, InsuranceRules.RenewalDue(item, InsuranceRules.Today), InsuranceRules.PaymentAlert(item, outstanding, InsuranceRules.Today), payments.Count > 0 ? item.InsuranceAmount - payments.Sum(x => x.Amount) : null);
    }
    public static async Task<InsuranceCaseView> LoadView(AppDbContext db, InsuranceCase item) => View(item,
        await db.InsuranceReceipts.AsNoTracking().Where(x => x.CaseId == item.Id).ToListAsync(),
        await db.InsuranceInsurerPayments.AsNoTracking().Where(x => x.CaseId == item.Id).ToListAsync(),
        await db.InsuranceAttachments.AsNoTracking().Where(x => x.CaseId == item.Id).Select(x => new InsuranceAttachment { Id = x.Id, CaseId = x.CaseId, Kind = x.Kind, FileName = x.FileName, MimeType = x.MimeType, Checksum = x.Checksum, UploadedBy = x.UploadedBy, UploadedAt = x.UploadedAt }).ToListAsync());
    public static async Task<string?> ConfirmReceiptAsync(AppDbContext db, Guid caseId, Guid receiptId, ClaimsPrincipal actor, CancellationToken ct = default)
    {
        if (!actor.IsInRole("BossAdmin")) return "Only Boss/Admin may verify actual funds.";
        var item = await db.InsuranceCases.FirstOrDefaultAsync(x => x.Id == caseId, ct);
        var receipt = await db.InsuranceReceipts.FirstOrDefaultAsync(x => x.Id == receiptId && x.CaseId == caseId, ct);
        if (item == null || receipt == null) return "Case or receipt not found.";
        if (receipt.Status == "Confirmed") return null;
        if (receipt.Status != "Pending") return "Only a pending receipt can be confirmed.";
        var received = InsuranceRules.Received(await db.InsuranceReceipts.AsNoTracking().Where(x => x.CaseId == caseId).ToListAsync(ct));
        var validation = InsuranceRules.ValidateReceipt(new(receipt.IdempotencyKey, receipt.Amount, receipt.PaymentType, receipt.DepositAccount, receipt.ReceivedDate, receipt.InvoiceNumber, receipt.EvidenceAttachmentId), item, InsuranceRules.Total(item) - received);
        if (validation != null) return validation;
        if (receipt.Company != item.Company) return "Invoice company changed. Reload the case.";
        if (receipt.EvidenceAttachmentId.HasValue && !await db.InsuranceAttachments.AnyAsync(x => x.Id == receipt.EvidenceAttachmentId && x.CaseId == caseId && x.Kind == "PaymentEvidence", ct)) return "Payment evidence does not belong to this case.";
        db.Entry(receipt).CurrentValues.SetValues(receipt with { Status = "Confirmed", ConfirmedBy = AuditTrail.ActorFrom(actor), ConfirmedAt = DateTimeOffset.UtcNow });
        db.Entry(item).CurrentValues.SetValues(item with { Version = item.Version + 1, UpdatedAt = DateTimeOffset.UtcNow });
        ApiAudit.Add(db, actor, "insurance.receiptConfirmed", nameof(InsuranceReceipt), receipt.Id);
        try { await db.SaveChangesAsync(ct); } catch (DbUpdateConcurrencyException) { db.ChangeTracker.Clear(); return "Case changed. Reload before confirming funds."; }
        return null;
    }
    private static async Task<IResult> UploadAsync(Guid id, HttpRequest request, AppDbContext db, HttpContext context)
    {
        if (!await db.InsuranceCases.AnyAsync(x => x.Id == id)) return Results.NotFound();
        if (!request.HasFormContentType) return Results.BadRequest(new ApiError("Upload a multipart file."));
        var form = await request.ReadFormAsync(); var file = form.Files.GetFile("file"); var kind = form["kind"].ToString();
        if (kind is not ("Policy" or "RoadTaxReceipt" or "Windscreen" or "PaymentEvidence" or "Other")) return Results.BadRequest(new ApiError("Invalid insurance attachment kind."));
        if (file == null || !UploadPolicy.IsAllowed(FileCategory.Policy, file.Length)) return Results.BadRequest(new ApiError("Upload a file no larger than 10 MB."));
        using var stream = new MemoryStream(); await file.CopyToAsync(stream); var bytes = stream.ToArray();
        var validation = UploadPolicy.ValidateCollectionEvidenceContent(file.FileName, file.ContentType, bytes);
        if (!validation.Result.IsValid) return Results.BadRequest(validation.Result);
        if (kind == "Windscreen" && validation.MimeType == "application/pdf") return Results.BadRequest(new ApiError("Windscreen evidence must be a photo."));
        var attachment = new InsuranceAttachment { CaseId = id, Kind = kind, FileName = Path.GetFileName(file.FileName), MimeType = validation.MimeType!, Content = bytes, Checksum = Convert.ToHexString(SHA256.HashData(bytes)), UploadedBy = AuditTrail.ActorFrom(context.User) };
        await using var transaction = await db.Database.BeginTransactionAsync();
        // Serialize new evidence with the final customer-send source check.
        if (await db.InsuranceCases.Where(x => x.Id == id).ExecuteUpdateAsync(set => set.SetProperty(x => x.Version, x => x.Version + 1)) == 0) return Results.NotFound();
        db.InsuranceAttachments.Add(attachment); ApiAudit.Add(db, context.User, "insurance.attachmentUploaded", nameof(InsuranceAttachment), attachment.Id);
        await db.SaveChangesAsync(); await transaction.CommitAsync(); return Results.Ok(attachment);
    }
}
