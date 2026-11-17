using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

// Loan follow-ups are staged to the assigned Loan processor only. The body is
// intentionally amount-free; the processor opens the protected case in Portal.
public static class WhatsAppLoanFollowUps
{
    public const string Category = "LoanFollowUp";
    public const string RequiredRole = "Loan";

    public static string Body(string plate) =>
        $"YS Heng loan follow-up: {SafePlate(plate)}. Please review the assigned loan case in Portal.";

    public static async Task<WhatsAppOutbox?> RefreshAsync(AppDbContext db, WhatsAppOutbox item,
        long now, CancellationToken ct = default)
    {
        if (item.Audience != "Staff" || item.MessageKind != Category || item.RequiredStaffRole != RequiredRole ||
            item.StaffUserId is null || !TryParseEventKey(item.BusinessEventKey, out var loanId, out _)) return null;

        var loan = await db.LoanApplications.AsNoTracking().SingleOrDefaultAsync(row => row.Id == loanId, ct);
        if (loan is null || loan.Status is not (LoanStatus.Pending or LoanStatus.Submitted) || loan.TakenByUserId != item.StaffUserId ||
            !ReminderRules.IsLoanFollowUpDue(loan, WhatsAppStaffNotifications.LocalDate(now))) return null;
        var vehicle = await db.Vehicles.AsNoTracking().SingleOrDefaultAsync(row => row.Id == loan.VehicleId, ct);
        return vehicle is null ? null : item with { Body = Body(vehicle.PlateNumber), TemplateReference = Body(vehicle.PlateNumber) };
    }

    public static async Task<int> EnqueueForVerifiedBindingsAsync(AppDbContext db,
        WhatsAppAssistantOptions assistant, long now, string actor, CancellationToken ct = default)
    {
        var policy = await db.WhatsAppStaffNotificationPolicies.AsNoTracking()
            .SingleOrDefaultAsync(row => row.Category == Category && row.Enabled, ct);
        if (policy is null) return 0;

        var today = WhatsAppStaffNotifications.LocalDate(now);
        var bindings = await db.WhatsAppStaffBindings.AsNoTracking()
            .Where(row => row.VerifiedAt > 0 && row.RevokedAt == null)
            .Select(row => row.Id).ToArrayAsync(ct);
        var staged = 0;
        foreach (var bindingId in bindings)
        {
            var resolved = await WhatsAppStaffBindings.ResolveAsync(db, assistant, bindingId, now, ct);
            if (resolved is null || !resolved.Value.Roles.Contains(RequiredRole)) continue;
            var staffUserId = resolved.Value.Binding.StaffUserId;
            var loans = await db.LoanApplications.AsNoTracking()
                .Where(row => (row.Status == LoanStatus.Pending || row.Status == LoanStatus.Submitted) && row.TakenByUserId == staffUserId)
                .ToListAsync(ct);
            if (loans.Count == 0) continue;
            var vehicleIds = loans.Select(row => row.VehicleId).Distinct().ToArray();
            var vehicles = await db.Vehicles.AsNoTracking().Where(row => vehicleIds.Contains(row.Id))
                .ToDictionaryAsync(row => row.Id, ct);
            foreach (var loan in loans)
            {
                var dueDate = ReminderRules.LoanFollowUpDate(loan).AddDays(2);
                if (dueDate > today || !vehicles.TryGetValue(loan.VehicleId, out var vehicle)) continue;
                var key = $"{loan.Id:N}:{dueDate:yyyyMMdd}";
                var queued = await WhatsAppStaffNotifications.StageAsync(db, assistant, bindingId,
                    Category, RequiredRole, key, 1, Body(vehicle.PlateNumber), now, now + 86400, now, actor, ct);
                if (queued is not null) staged++;
            }
        }
        if (staged > 0) await db.SaveChangesAsync(ct);
        return staged;
    }

    private static bool TryParseEventKey(string value, out Guid loanId, out DateOnly dueDate)
    {
        loanId = Guid.Empty;
        dueDate = default;
        var parts = value.Split(':', 2, StringSplitOptions.TrimEntries);
        return parts.Length == 2 && Guid.TryParseExact(parts[0], "N", out loanId) &&
            DateOnly.TryParseExact(parts[1], "yyyyMMdd", out dueDate);
    }

    private static string SafePlate(string? plate)
    {
        var safe = Regex.Replace(plate ?? "", "[^A-Za-z0-9-]", "").ToUpperInvariant();
        return safe.Length is > 0 and <= 16 ? safe : "vehicle";
    }
}
