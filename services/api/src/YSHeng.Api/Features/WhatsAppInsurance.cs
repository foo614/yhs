using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record InsuranceDocumentSendRequest(long CaseVersion, string? CustomerPhone, Guid[] AttachmentIds);

public static class WhatsAppInsurance
{
    public const string DocumentTemplate = "insurance_document_v1";
    public const string ImageTemplate = "insurance_image_v1";
    public const string PaymentTemplate = "insurance_payment_due_v1";
    public const string Category = "InsuranceReminder";
    public static bool IsDocument(WhatsAppOutbox row) => row.Audience == "Customer" && row.EventKind == "insurance.document" && row.TemplateVersion is DocumentTemplate or ImageTemplate;
    public static bool IsPayment(WhatsAppOutbox row) => row.Audience == "Customer" && row.EventKind == "insurance.payment_due" && row.TemplateVersion == PaymentTemplate;
    public static bool ValidManifest(WhatsAppApprovedTemplate template) => template.Key == DocumentTemplate && template.HeaderFormat == "DOCUMENT" || template.Key == ImageTemplate && template.HeaderFormat == "IMAGE" || template.Key == PaymentTemplate && template.HeaderFormat == "";

    public static void MapRoutes(RouteGroupBuilder api)
    {
        api.MapPost("/insurance/{id:guid}/send-documents", async (Guid id, InsuranceDocumentSendRequest request, AppDbContext db, ClaimsPrincipal actor, WhatsAppDispatchOptions options, CancellationToken ct) =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            await db.InsuranceCases.Where(x => x.Id == id).ExecuteUpdateAsync(set => set.SetProperty(x => x.Version, x => x.Version), ct);
            var record = await db.InsuranceCases.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (request.CaseVersion != record.Version || request.CustomerPhone != record.CustomerPhone)
                return Results.Conflict(new { message = "Case or recipient changed. Reload and review the document send again." });
            var consent = await ConsentAsync(db, record, ct);
            if (consent is null) return Results.BadRequest(new { message = "A valid customer phone and existing WhatsApp opt-in are required. No message was queued." });
            if (!options.Ready)
                return Results.Conflict(new { message = "WhatsApp sender and approved insurance DOCUMENT template must be configured. No message was queued." });
            var all = await db.InsuranceAttachments.AsNoTracking().Where(x => x.CaseId == id && (x.Kind == "Policy" || x.Kind == "RoadTaxReceipt")).ToListAsync(ct);
            var kinds = record.RoadTaxMethod == "JPJ" ? new[] { "Policy", "RoadTaxReceipt" } : new[] { "Policy" };
            var documents = kinds.Select(kind => all.Where(x => x.Kind == kind).OrderByDescending(x => x.UploadedAt).ThenByDescending(x => x.Id).FirstOrDefault()).ToArray();
            if (documents.Any(x => x is null || !Sendable(x)))
                return Results.BadRequest(new { message = "Upload the policy and applicable JPJ receipt as PDF or JPEG/PNG (images up to 5 MB) before sending. No message was queued." });
            if (request.AttachmentIds is null || !request.AttachmentIds.Order().SequenceEqual(documents.Select(x => x!.Id).Order()))
                return Results.Conflict(new { message = "Documents changed. Reload and review the latest files before sending." });
            if (documents.Any(x => options.TemplateFor(x!.MimeType == "application/pdf" ? DocumentTemplate : ImageTemplate, consent.Language) is null))
                return Results.Conflict(new { message = "An approved insurance document/image template for this customer language is required. No message was queued." });
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var items = new List<WhatsAppOutbox>();
            foreach (var document in documents)
            {
                var key = $"insurance:{id:N}:document:{document!.Id:N}";
                var prior = await db.WhatsAppOutbox.AsNoTracking().SingleOrDefaultAsync(x => x.BusinessEventKey == key && x.Recipient == consent.Recipient, ct);
                if (prior is not null) { items.Add(prior); continue; }
                var reference = record.PlateNumber;
                var row = WhatsAppOutboxStore.Stage(db, key, consent.Recipient, "Insurance document for " + reference, now, now + 86400,
                    document.MimeType == "application/pdf" ? DocumentTemplate : ImageTemplate, consent.Language, "insurance.document", id.ToString("D"), actor.Identity?.Name ?? "staff", reference);
                db.Entry(row).CurrentValues.SetValues(row with { BusinessEventKey = key, MessageKind = "InsuranceDocument", State = "Queued" });
                items.Add(row);
            }
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.Ok(new { items = items.Select(x => new { x.Id, x.State }), message = "Documents queued; acceptance and delivery are tracked in the WhatsApp outbox." });
        }).RequireAuthorization("BossAdmin");
    }

    public static bool Sendable(InsuranceAttachment document) => document.MimeType == "application/pdf"
        ? WhatsAppInspectionAttachment.ValidPdf(document.Content)
        : document.MimeType is "image/jpeg" or "image/png" && document.Content.Length <= 5 * 1024 * 1024 &&
            UploadPolicy.ValidateCollectionEvidenceContent(document.FileName, document.MimeType, document.Content).Result.IsValid;

    private static async Task<WhatsAppConsent?> ConsentAsync(AppDbContext db, InsuranceCase record, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(record.CustomerPhone)) return null;
        string recipient;
        try { recipient = WhatsAppOutboxStore.NormalizeRecipient(record.CustomerPhone); }
        catch (ArgumentException) { return null; }
        return await db.WhatsAppConsents.AsNoTracking().SingleOrDefaultAsync(x => x.Recipient == recipient && x.OptedIn, ct);
    }

    public static async Task<bool> EligibleAsync(AppDbContext db, WhatsAppOutbox row, long now, CancellationToken ct, bool lockCase = false)
    {
        if (!IsDocument(row) && !IsPayment(row) || !Guid.TryParse(row.BusinessReference, out var caseId) || row.ExpiresAt <= now) return false;
        if (lockCase && await db.InsuranceCases.Where(x => x.Id == caseId)
            .ExecuteUpdateAsync(set => set.SetProperty(x => x.Version, x => x.Version), ct) == 0) return false;
        var record = await db.InsuranceCases.AsNoTracking().SingleOrDefaultAsync(x => x.Id == caseId, ct);
        if (record is null || await ConsentAsync(db, record, ct) is not { } consent || consent.Recipient != row.Recipient || consent.Language != row.Language) return false;
        if (IsDocument(row)) return await LoadDocumentAsync(db, row, ct) is not null;
        var parts = row.BusinessEventKey.Split(':');
        return parts.Length == 4 && parts[0] == "insurance" && parts[2] == "payment" &&
            DateOnly.TryParseExact(parts[3], "yyyy-MM-dd", out var day) && day == WhatsAppStaffNotifications.LocalDate(now) &&
            await PaymentDueAsync(db, record, day, ct);
    }

    private static async Task<InsuranceAttachment?> LoadDocumentAsync(AppDbContext db, WhatsAppOutbox row, CancellationToken ct)
    {
        var parts = row.BusinessEventKey.Split(':');
        if (parts.Length != 4 || parts[0] != "insurance" || parts[2] != "document" || !Guid.TryParseExact(parts[1], "N", out var caseId) ||
            row.BusinessReference != caseId.ToString("D") || !Guid.TryParseExact(parts[3], "N", out var documentId)) return null;
        var document = await db.InsuranceAttachments.AsNoTracking().SingleOrDefaultAsync(x => x.Id == documentId && x.CaseId == caseId && (x.Kind == "Policy" || x.Kind == "RoadTaxReceipt"), ct);
        if (document is null || !Sendable(document) || row.TemplateVersion != (document.MimeType == "application/pdf" ? DocumentTemplate : ImageTemplate)) return null;
        var record = await db.InsuranceCases.AsNoTracking().SingleOrDefaultAsync(x => x.Id == caseId, ct);
        if (record is null || document.Kind == "RoadTaxReceipt" && record.RoadTaxMethod != "JPJ") return null;
        var candidates = await db.InsuranceAttachments.AsNoTracking().Where(x => x.CaseId == caseId && x.Kind == document.Kind)
            .Select(x => new { x.Id, x.UploadedAt }).ToListAsync(ct);
        var latest = candidates.OrderByDescending(x => x.UploadedAt).ThenByDescending(x => x.Id).First().Id;
        return latest == document.Id ? document : null;
    }

    public static async Task<WhatsAppSendResult> SendAsync(AppDbContext db, WhatsAppTemplateSender sender, WhatsAppDispatchOptions options, WhatsAppOutbox row, CancellationToken ct)
    {
        if (!IsDocument(row)) return await sender.SendAsync(options, row, ct);
        var document = await LoadDocumentAsync(db, row, ct);
        if (document is null) return new("Suppressed");
        return await sender.SendAttachmentAsync(options, row, document.Content,
            token => EligibleAsync(db, row, DateTimeOffset.UtcNow.ToUnixTimeSeconds(), token), ct, document.MimeType);
    }

    public static async Task<int> EnqueueAsync(AppDbContext db, WhatsAppAssistantOptions assistant, long now, CancellationToken ct, WhatsAppDispatchOptions? dispatch = null)
    {
        var today = WhatsAppStaffNotifications.LocalDate(now);
        var records = await db.InsuranceCases.AsNoTracking().ToListAsync(ct);
        var policy = await db.WhatsAppStaffNotificationPolicies.AsNoTracking().SingleOrDefaultAsync(x => x.Category == Category && x.Enabled, ct);
        var bindingIds = policy is null ? [] : await db.WhatsAppStaffBindings.AsNoTracking().Where(x => x.RevokedAt == null).Select(x => x.Id).ToArrayAsync(ct);
        var count = 0;
        foreach (var record in records)
        {
            if (!record.RenewalDeclined && record.RenewedByCaseId == null && record.ExpiryDate.AddMonths(-1) <= today && policy is not null)
            foreach (var binding in bindingIds)
            {
                var row = await WhatsAppStaffNotifications.StageAsync(db, assistant, binding, Category, "BossAdmin",
                    $"insurance:{record.Id:N}:renewal:{record.ExpiryDate:yyyy-MM-dd}", 1, RenewalText(record),
                    WhatsAppStaffNotifications.LocalDayDueAt(today, policy.LocalMinuteOfDay), WhatsAppStaffNotifications.LocalDayDueAt(today.AddDays(1), 0), now, "insurance-reminder", ct);
                if (row is not null && db.Entry(row).State == EntityState.Added) count++;
            }
            if (dispatch?.CaptureEnabled != true || !await PaymentDueAsync(db, record, today, ct) || await ConsentAsync(db, record, ct) is not { } consent) continue;
            var key = $"insurance:{record.Id:N}:payment:{today:yyyy-MM-dd}";
            if (await db.WhatsAppOutbox.AnyAsync(x => x.BusinessEventKey == key && x.Recipient == consent.Recipient, ct)) continue;
            var row2 = WhatsAppOutboxStore.Stage(db, key, consent.Recipient, "Insurance payment follow-up for " + record.PlateNumber, now,
                WhatsAppStaffNotifications.LocalDayDueAt(today.AddDays(1), 0), PaymentTemplate, consent.Language, "insurance.payment_due", record.Id.ToString("D"), "insurance-reminder", record.PlateNumber);
            db.Entry(row2).CurrentValues.SetValues(row2 with { BusinessEventKey = key, MessageKind = "InsurancePayment", State = "Queued" });
            count++;
        }
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException) { db.ChangeTracker.Clear(); throw; }
        return count;
    }

    private static async Task<bool> PaymentDueAsync(AppDbContext db, InsuranceCase record, DateOnly today, CancellationToken ct)
    {
        if (record.CoverStartDate is not { } cover || today < cover.AddDays(7) || (today.DayNumber - cover.DayNumber) % 7 != 0) return false;
        var receipts = await db.InsuranceReceipts.AsNoTracking().Where(x => x.CaseId == record.Id && x.Status == "Confirmed").ToListAsync(ct);
        var total = record.InsuranceAmount + record.RoadTaxAmount + (record.RoadTaxMethod == "JPJ" ? record.RunnerFee : 0) + record.OtherCharges.Sum(x => x.Amount) - record.Discount;
        return total > receipts.Sum(x => x.Amount);
    }

    private static string RenewalText(InsuranceCase record) => $"Prepare insurance renewal quotation: {record.PlateNumber}; expiry {record.ExpiryDate:yyyy-MM-dd}.";
    public static async Task<string?> RefreshReminderAsync(AppDbContext db, WhatsAppOutbox row, long now, CancellationToken ct)
    {
        var parts = row.BusinessEventKey.Split(':');
        if (row.Audience != "Staff" || row.MessageKind != Category || parts.Length != 4 || parts[0] != "insurance" || parts[2] != "renewal" ||
            !Guid.TryParseExact(parts[1], "N", out var id) || !DateOnly.TryParseExact(parts[3], "yyyy-MM-dd", out var day)) return null;
        var record = await db.InsuranceCases.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        return record is not null && !record.RenewalDeclined && record.RenewedByCaseId == null && record.ExpiryDate == day && record.ExpiryDate.AddMonths(-1) <= WhatsAppStaffNotifications.LocalDate(now) ? RenewalText(record) : null;
    }

    public static bool TryParsePayment(string argument, out Guid receiptId, out decimal amount)
    {
        receiptId = default; amount = 0;
        var parts = argument.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length == 2 && Guid.TryParse(parts[0], out receiptId) && decimal.TryParse(parts[1], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out amount) && amount > 0 && decimal.Round(amount, 2) == amount;
    }

    public static async Task<string> PaymentReplyAsync(AppDbContext db, string argument, Guid bindingId, Guid requestId,
        string staffUserId, WhatsAppAssistantOptions options, long now, CancellationToken ct)
    {
        var identity = await WhatsAppStaffBindings.ResolveAsync(db, options, bindingId, now, ct);
        if (identity is null || identity.Value.Binding.StaffUserId != staffUserId || !identity.Value.Roles.Contains("BossAdmin")) return "A current Boss/Admin connection is required.";
        if (argument.StartsWith("confirm ", StringComparison.OrdinalIgnoreCase) && Guid.TryParse(argument[8..], out var previewId))
        {
            var preview = await db.WhatsAppStaffRequests.AsNoTracking().SingleOrDefaultAsync(x => x.Id == previewId && x.BindingId == bindingId && x.ExpiresAt > now &&
                (x.State == "Accepted" || x.State == "Sent" || x.State == "Delivered" || x.State == "Read"), ct);
            Guid receiptId; decimal amount;
            if (preview is null) return "Preview expired or unavailable. Request a fresh preview.";
            if (preview.Intent == "insurance-pay" && TryParsePayment(preview.Argument, out receiptId, out amount)) { }
            else if (preview.Intent == "insurance-evidence") { receiptId = preview.Id; amount = 0; }
            else return "A matching payment preview is required.";
            var receipt = await db.InsuranceReceipts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == receiptId, ct);
            if (receipt is null || amount > 0 && receipt.Amount != amount) return "Receipt amount changed. Request a fresh preview.";
            var actor = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, staffUserId), new Claim(ClaimTypes.Name, staffUserId), new Claim(ClaimTypes.Role, "BossAdmin")], "WhatsApp"));
            var error = await InsuranceModule.ConfirmReceiptAsync(db, receipt.CaseId, receipt.Id, actor, ct);
            return error ?? "Funds verified. Confirmed receipt applied; any remaining balance stays outstanding.";
        }
        if (!TryParsePayment(argument, out var id, out var proposed)) return "Use insurance-pay <receipt-id> <confirmed-amount>.";
        var pending = await db.InsuranceReceipts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
        if (pending is null || pending.Status != "Pending" || pending.Amount != proposed) return "Pending receipt and amount must match exactly.";
        return await PreviewAsync(db, pending, requestId, ct);
    }

    private static async Task<string> PreviewAsync(AppDbContext db, InsuranceReceipt receipt, Guid previewId, CancellationToken ct)
    {
        var record = await db.InsuranceCases.AsNoTracking().SingleAsync(x => x.Id == receipt.CaseId, ct);
        return $"VERIFY FUNDS preview: {record.PlateNumber}; case {record.Id:D}; invoice {receipt.InvoiceNumber}; {receipt.Company}; RM {receipt.Amount:0.00}; {receipt.PaymentType} to {receipt.DepositAccount}; date {receipt.ReceivedDate:yyyy-MM-dd}; evidence {receipt.EvidenceAttachmentId?.ToString("D") ?? "none"}. Check actual funds before confirming. Within 5 minutes send: insurance-pay confirm {previewId:D}";
    }

    public static async Task<string> StoreEvidenceAsync(AppDbContext db, string argument, Guid bindingId, Guid requestId, string staffUserId,
        WhatsAppAssistantOptions options, WhatsAppMediaClient mediaClient, long now, CancellationToken ct)
    {
        var identity = await WhatsAppStaffBindings.ResolveAsync(db, options, bindingId, now, ct);
        if (identity is null || !identity.Value.Roles.Contains("BossAdmin") || identity.Value.Binding.StaffUserId != staffUserId) return "A current Boss/Admin connection is required.";
        var parts = argument.Split('|', StringSplitOptions.TrimEntries);
        if (parts.Length != 7 || !Guid.TryParse(parts[0], out var caseId) || !decimal.TryParse(parts[1], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var amount) || amount <= 0 || decimal.Round(amount, 2) != amount ||
            parts[2] is not ("Cash" or "TNG" or "Transfer" or "Card") || parts[3] is not ("Cash" or "PBB") ||
            !DateOnly.TryParseExact(parts[4], "yyyy-MM-dd", out var date) || date > WhatsAppStaffNotifications.LocalDate(now) || parts[5].Length is 0 or > 100 || parts[5].Any(char.IsControl) || !WhatsAppMediaClient.ValidId(parts[6]))
            return "Forward slip with caption: INSURANCE <case-id> | <amount> | Cash/TNG/Transfer/Card | Cash/PBB | yyyy-mm-dd | <invoice-no>";
        var record = await db.InsuranceCases.AsNoTracking().SingleOrDefaultAsync(x => x.Id == caseId && x.InvoiceNumber == parts[5], ct);
        if (record is null) return "Case and invoice must match an existing insurance case.";
        var prior = await db.InsuranceReceipts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == requestId, ct);
        if (prior is not null) return await PreviewAsync(db, prior, requestId, ct);
        var outstanding = InsuranceRules.Total(record) - InsuranceRules.Received(await db.InsuranceReceipts.AsNoTracking().Where(x => x.CaseId == caseId).ToListAsync(ct));
        var validation = InsuranceRules.ValidateReceipt(new("whatsapp:" + requestId.ToString("N"), amount, parts[2], parts[3], date, parts[5]), record, outstanding);
        if (validation is not null) return validation;
        var media = await mediaClient.DownloadAsync(options, parts[6], ct);
        if (media is null) return "Evidence could not be downloaded or validated. No payment was changed.";
        var contentValidation = UploadPolicy.ValidateCollectionEvidenceContent(media.FileName, media.MimeType, media.Content);
        if (!contentValidation.Result.IsValid) return "Evidence content is invalid. No payment was changed.";
        var attachment = new InsuranceAttachment { CaseId = caseId, Kind = "PaymentEvidence", FileName = media.FileName, MimeType = media.MimeType,
            Content = media.Content, Checksum = Convert.ToHexString(SHA256.HashData(media.Content)), UploadedBy = staffUserId };
        var receipt = new InsuranceReceipt { Id = requestId, CaseId = caseId, IdempotencyKey = "whatsapp:" + requestId.ToString("N"), Amount = amount,
            PaymentType = parts[2], DepositAccount = parts[3], ReceivedDate = date, EvidenceAttachmentId = attachment.Id, InvoiceNumber = parts[5], Company = record.Company, CreatedBy = staffUserId };
        db.InsuranceAttachments.Add(attachment); db.InsuranceReceipts.Add(receipt);
        db.AuditLogs.Add(new AuditLog { Actor = staffUserId, Action = "insurance.paymentEvidenceReceived", EntityName = nameof(InsuranceReceipt), EntityId = receipt.Id });
        await db.SaveChangesAsync(ct);
        return await PreviewAsync(db, receipt, requestId, ct);
    }
}
