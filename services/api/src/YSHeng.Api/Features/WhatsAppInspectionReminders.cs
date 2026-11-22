using System.Globalization;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record InspectionReminderCandidate(string Kind, DateOnly TargetDate);

public static class WhatsAppInspectionReminders
{
    public const string Category = "InspectionReminder";
    private const string AppointmentReminder = "appointment-1day";
    private const string BookingReminder = "expiry-2months";
    private const string ExpiryReminder = "expiry-7days";

    public static IReadOnlyList<InspectionReminderCandidate> DueFor(InspectionRecord inspection, VehicleStatus vehicleStatus, DateOnly today)
    {
        if (inspection.Status == InspectionStatus.Cancelled || vehicleStatus == VehicleStatus.Sold) return [];
        var dates = InspectionRules.ReminderDates(inspection.AppointmentDate);
        var candidates = new List<InspectionReminderCandidate>();
        if (inspection.Status == InspectionStatus.Booked)
        {
            if (dates.AppointmentReminderDate == today && !string.IsNullOrWhiteSpace(inspection.BookingReference))
                candidates.Add(new(AppointmentReminder, today));
        }
        else if (inspection.Status == InspectionStatus.Completed)
        {
            if (inspection.IsLorry && dates.BookingReminderDate == today) candidates.Add(new(BookingReminder, today));
            if (dates.ReportExpiryReminderDate == today) candidates.Add(new(ExpiryReminder, today));
        }
        return candidates;
    }

    public static async Task<int> EnqueueAsync(AppDbContext db, WhatsAppAssistantOptions assistant, long now, CancellationToken ct = default)
    {
        if (!assistant.Ready) return 0;
        var policy = await db.WhatsAppStaffNotificationPolicies.AsNoTracking()
            .SingleOrDefaultAsync(row => row.Category == Category && row.Enabled, ct);
        if (policy is null) return 0;

        var today = WhatsAppStaffNotifications.LocalDate(now);
        var rows = await (from inspection in db.InspectionRecords.AsNoTracking()
                          join vehicle in db.Vehicles.AsNoTracking() on inspection.VehicleId equals vehicle.Id
                          where inspection.Status != InspectionStatus.Cancelled && vehicle.Status != VehicleStatus.Sold
                          select new { inspection, vehicle }).ToListAsync(ct);
        var completedIds = rows.Where(row => row.inspection.Status == InspectionStatus.Completed).Select(row => row.inspection.Id).ToArray();
        var reports = completedIds.Length == 0 ? [] : await db.DocumentBlobs.AsNoTracking()
            .Where(document => document.InspectionId.HasValue && completedIds.Contains(document.InspectionId.Value) &&
                document.Category == FileCategory.InspectionReport)
            .Select(document => document.InspectionId!.Value).Distinct().ToListAsync(ct);
        var reportIds = reports.ToHashSet();
        var bindingIds = await db.WhatsAppStaffBindings.AsNoTracking()
            .Where(binding => binding.VerifiedAt > 0 && binding.RevokedAt == null).Select(binding => binding.Id).ToArrayAsync(ct);
        var dueAt = WhatsAppStaffNotifications.LocalDayDueAt(today, policy.LocalMinuteOfDay);
        var expiresAt = WhatsAppStaffNotifications.LocalDayDueAt(today.AddDays(1), 0);
        var count = 0;
        foreach (var row in rows)
        {
            if (row.inspection.Status == InspectionStatus.Completed && !reportIds.Contains(row.inspection.Id)) continue;
            foreach (var candidate in DueFor(row.inspection, row.vehicle.Status, today))
            foreach (var bindingId in bindingIds)
            {
                var resolved = await WhatsAppStaffBindings.ResolveAsync(db, assistant, bindingId, now, ct);
                if (resolved is null || !resolved.Value.Roles.Contains("BossAdmin")) continue;
                var body = Render(row.inspection, row.vehicle, candidate.Kind, resolved.Value.Binding.Language);
                var key = $"inspection:{row.inspection.Id:N}:{candidate.Kind}:{candidate.TargetDate:yyyy-MM-dd}";
                var staged = await WhatsAppStaffNotifications.StageAsync(db, assistant, bindingId, Category, "BossAdmin",
                    key, 1, body, dueAt, expiresAt, now, "whatsapp-inspection", ct);
                if (staged is null || db.Entry(staged).State == EntityState.Detached) continue;
                if (candidate.Kind == AppointmentReminder)
                    db.Entry(staged).CurrentValues.SetValues(staged with { TemplateVersion = WhatsAppInspectionAttachment.TemplateKey });
                try { await db.SaveChangesAsync(ct); count++; }
                catch (DbUpdateException)
                {
                    db.ChangeTracker.Clear();
                    if (!await db.WhatsAppOutbox.AnyAsync(item => item.IdempotencyKey == staged.IdempotencyKey, ct)) throw;
                }
            }
        }
        return count;
    }

    public static async Task<string?> RefreshAsync(AppDbContext db, WhatsAppOutbox row, long now, CancellationToken ct = default)
    {
        if (row.Audience != "Staff" || row.MessageKind != Category || row.StaffUserId is null || row.ExpiresAt <= now ||
            !TryParseKey(row.BusinessEventKey, out var inspectionId, out var kind, out var targetDate) ||
            targetDate != WhatsAppStaffNotifications.LocalDate(now)) return null;
        var inspection = await db.InspectionRecords.AsNoTracking().SingleOrDefaultAsync(item => item.Id == inspectionId, ct);
        if (inspection is null || inspection.Status == InspectionStatus.Cancelled) return null;
        var vehicle = await db.Vehicles.AsNoTracking().SingleOrDefaultAsync(item => item.Id == inspection.VehicleId, ct);
        if (vehicle is null || vehicle.Status == VehicleStatus.Sold || !DueFor(inspection, vehicle.Status, targetDate).Any(item => item.Kind == kind)) return null;
        if (inspection.Status == InspectionStatus.Completed && !await db.DocumentBlobs.AsNoTracking().AnyAsync(document =>
            document.InspectionId == inspection.Id && document.Category == FileCategory.InspectionReport, ct)) return null;
        var body = Render(inspection, vehicle, kind, row.Language);
        return ValidBody(body) ? body : null;
    }

    private static bool TryParseKey(string key, out Guid inspectionId, out string kind, out DateOnly targetDate)
    {
        inspectionId = Guid.Empty;
        kind = "";
        targetDate = default;
        var parts = key.Split(':', StringSplitOptions.None);
        return parts.Length == 4 && parts[0] == "inspection" && Guid.TryParseExact(parts[1], "N", out inspectionId) &&
            parts[2] is AppointmentReminder or BookingReminder or ExpiryReminder &&
            DateOnly.TryParseExact(parts[3], "yyyy-MM-dd", out targetDate) && (kind = parts[2]).Length > 0;
    }

    private static string Render(InspectionRecord inspection, Vehicle vehicle, string kind, string language)
    {
        var malay = language == "ms";
        var plate = WhatsAppStaffSalesQueries.Clean(vehicle.PlateNumber);
        var remark = inspection.IsLorry ? " (Lorry)" : "";
        return kind switch
        {
            AppointmentReminder => AppointmentText(inspection, plate, remark),
            BookingReminder => malay
                ? $"Peringatan booking inspection: report {plate} akan expire pada {inspection.ReportExpiryDate:dd/MM/yyyy}. Sila arrange booking baru."
                : $"Inspection booking reminder: {plate} report expires on {inspection.ReportExpiryDate:dd/MM/yyyy}. Please arrange a new booking.",
            ExpiryReminder => malay
                ? $"Peringatan: inspection report {plate} akan expire dalam 7 hari pada {inspection.ReportExpiryDate:dd/MM/yyyy}."
                : $"Reminder: {plate} inspection report expires in 7 days on {inspection.ReportExpiryDate:dd/MM/yyyy}.",
            _ => ""
        };
    }

    private static string AppointmentText(InspectionRecord inspection, string plate, string remark)
    {
        var date = inspection.AppointmentDate.ToString("dd MMM yyyy", CultureInfo.InvariantCulture);
        var appointment = $"Vehicle {plate}{remark} is scheduled for inspection on {date}";
        return inspection.AppointmentTime is { } time
            ? $"{appointment} at {time.ToString("h:mm tt", CultureInfo.InvariantCulture)} MYT."
            : $"{appointment}. Appointment time is unavailable in the portal.";
    }

    private static bool ValidBody(string body) => !string.IsNullOrWhiteSpace(body) && body.Length <= 1024 && !body.Any(char.IsControl);
}
