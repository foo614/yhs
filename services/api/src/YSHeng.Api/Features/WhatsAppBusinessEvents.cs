using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

// Stages only: the business operation owns SaveChanges and its transaction.
// Draft notifications cannot be sent by the test dispatcher.
public static class WhatsAppBusinessEvents
{
    public static async Task StageReceiptVoidedAsync(AppDbContext db, Guid receiptId, bool enabled, string actor, CancellationToken ct = default)
    {
        if (!enabled) return;
        var reference = receiptId.ToString("D");
        var rows = await db.WhatsAppOutbox.Where(row => row.EventKind == "receipt.issued" && row.BusinessReference == reference &&
            (row.State == "HeldForApproval" || row.State == "Queued" || row.State == "RetryScheduled")).ToListAsync(ct);
        foreach (var row in rows)
        {
            db.Entry(row).CurrentValues.SetValues(row with { State = "Suppressed" });
            db.AuditLogs.Add(new AuditLog { Actor = actor, Action = "whatsapp.receipt_voided", EntityName = nameof(WhatsAppOutbox), EntityId = row.Id });
        }
    }

    public static Task StageEnquiryAsync(AppDbContext db, Lead lead, bool enabled, CancellationToken ct = default) =>
        StageAsync(db, enabled, "enquiry.created", lead.Id, lead.Phone, "enquiry_ack_v1", lead.Id.ToString("N"), "public", ct);

    public static async Task StageLoanStatusAsync(AppDbContext db, LoanApplication previous, LoanApplication next, bool enabled, string actor, CancellationToken ct = default)
    {
        if (!enabled || previous.Status == next.Status || previous.Id != next.Id || previous.CustomerId != next.CustomerId) return;
        var phone = await db.Customers.Where(row => row.Id == next.CustomerId).Select(row => row.Phone).SingleOrDefaultAsync(ct);
        // The locked domain transition is the event: an HTTP retry sees the saved status and does not stage again.
        // A later transition back to a previous status is a distinct event.
        await StageAsync(db, true, "loan.status_changed", next.Id, phone, "business_update_v1", next.Id.ToString("N"), actor, ct, Guid.NewGuid().ToString("N"));
    }

    public static async Task StageReceiptAsync(AppDbContext db, OfficialReceipt receipt, bool enabled, string actor, CancellationToken ct = default)
    {
        if (!enabled || receipt.IsVoided) return;
        var customerId = await db.PaymentRecords.Where(row => row.Id == receipt.PaymentRecordId).Select(row => row.CustomerId).SingleOrDefaultAsync(ct);
        if (customerId is null) return;
        var phone = await db.Customers.Where(row => row.Id == customerId).Select(row => row.Phone).SingleOrDefaultAsync(ct);
        await StageAsync(db, true, "receipt.issued", receipt.Id, phone, "receipt_ready_v1", receipt.ReceiptNumber, actor, ct);
    }

    private static async Task StageAsync(AppDbContext db, bool enabled, string kind, Guid id, string? phone,
        string template, string reference, string actor, CancellationToken ct, string? occurrence = null)
    {
        if (!enabled || string.IsNullOrWhiteSpace(phone)) return;
        string recipient;
        try { recipient = WhatsAppOutboxStore.NormalizeRecipient(phone); }
        catch (ArgumentException) { return; } // Invalid contact details must not break a valid business operation.
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Notification capture requires the business transaction.");
        // Conditional no-op write serializes capture with consent revocation until the business commit.
        var eligible = await db.WhatsAppConsents.Where(row => row.Recipient == recipient && row.OptedIn)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.UpdatedAt, row => row.UpdatedAt), ct);
        if (eligible == 0) return;
        var consent = await db.WhatsAppConsents.AsNoTracking().SingleOrDefaultAsync(row => row.Recipient == recipient && row.OptedIn, ct);
        if (consent is null) return;
        // The entity/event pair is stable even if language preference changes later.
        var eventReference = id.ToString("D");
        if (occurrence is null && (db.WhatsAppOutbox.Local.Any(row => row.EventKind == kind && row.BusinessReference == eventReference && row.Recipient == recipient) ||
            await db.WhatsAppOutbox.AnyAsync(row => row.EventKind == kind && row.BusinessReference == eventReference && row.Recipient == recipient, ct))) return;
        var language = WhatsAppNotificationTemplates.Language(consent.Language);
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        WhatsAppOutboxStore.Stage(db, kind + ":" + eventReference + (occurrence is null ? "" : ":" + occurrence), recipient,
            WhatsAppNotificationTemplates.Render(template, language, reference), now, now + 86400,
            template, language, kind, eventReference, actor, templateReference: reference);
    }
}
