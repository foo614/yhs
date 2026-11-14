using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class WhatsAppInspectionAttachment
{
    public const string TemplateKey = "inspection_appointment_document_v1";

    public static bool Required(WhatsAppOutbox row) => row.Audience == "Staff" &&
        row.MessageKind == WhatsAppInspectionReminders.Category &&
        row.BusinessEventKey.Split(':') is ["inspection", _, "appointment-1day", _];

    public static bool ValidPdf(byte[] content) => content.Length is >= 5 and <= 10 * 1024 * 1024 &&
        content.AsSpan(0, 5).SequenceEqual("%PDF-"u8);

    public static async Task<DocumentBlob?> LoadAsync(AppDbContext db, WhatsAppOutbox row, long now, CancellationToken ct)
    {
        if (!Required(row) || row.RequiredStaffRole != "BossAdmin" ||
            !Guid.TryParseExact(row.BusinessEventKey.Split(':')[1], "N", out var inspectionId) ||
            await WhatsAppInspectionReminders.RefreshAsync(db, row, now, ct) is null) return null;
        var inspection = await db.InspectionRecords.AsNoTracking().SingleAsync(item => item.Id == inspectionId, ct);
        var document = await db.DocumentBlobs.AsNoTracking().Where(item => item.InspectionId == inspectionId &&
            item.VehicleId == inspection.VehicleId && item.OwnershipType == DocumentOwnershipType.Vehicle &&
            item.Category == FileCategory.InspectionAppointmentConfirmation &&
            item.CustomerId == null && item.OwnerId == null && item.RepairJobId == null && item.BankSettlementId == null &&
            item.PaymentRecordId == null && item.CollectionTransactionId == null && item.DeliveryScheduleId == null && item.LoanApplicationId == null)
            .OrderByDescending(item => item.UploadedAt).ThenByDescending(item => item.Id).FirstOrDefaultAsync(ct);
        return document is not null && document.MimeType == "application/pdf" && ValidPdf(document.Content) ? document : null;
    }

    public static async Task<WhatsAppSendResult> SendAsync(AppDbContext db, WhatsAppTemplateSender sender,
        WhatsAppDispatchOptions options, WhatsAppAssistantOptions assistant, WhatsAppOutbox row, CancellationToken ct)
    {
        if (!Required(row)) return await sender.SendAsync(options, row, ct);
        var document = await LoadAsync(db, row, DateTimeOffset.UtcNow.ToUnixTimeSeconds(), ct);
        if (document is null) return new("Suppressed");
        return await sender.SendAttachmentAsync(options, row, document.Content, async token =>
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            if (row.StaffBindingId is not { } bindingId || row.ExpiresAt <= now) return false;
            var identity = await WhatsAppStaffBindings.ResolveAsync(db, assistant, bindingId, now, token);
            if (identity is null || !identity.Value.Roles.Contains("BossAdmin") ||
                identity.Value.Binding.Recipient != row.Recipient || identity.Value.Binding.StaffUserId != row.StaffUserId ||
                identity.Value.Binding.PhoneNumberId != options.PhoneNumberId || identity.Value.Binding.Language != row.Language ||
                !await db.WhatsAppStaffNotificationPolicies.AnyAsync(item => item.Category == row.MessageKind && item.Enabled, token)) return false;
            var current = await LoadAsync(db, row, now, token);
            return current?.Id == document.Id && current.Checksum == document.Checksum;
        }, ct);
    }
}
