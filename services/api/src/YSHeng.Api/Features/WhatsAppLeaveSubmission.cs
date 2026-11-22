using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class WhatsAppLeaveSubmission
{
    public const string TemplateKey = "ysheng_leave_approval_v1";
    public const string Category = "LeaveApproval";
    private const int LifetimeSeconds = 60 * 60;
    private const string EventPrefix = "leave-submitted:";

    public static bool IsSubmission(WhatsAppOutbox item) => item.Audience == "Staff" &&
        item.TemplateVersion == TemplateKey && item.MessageKind == Category &&
        item.RequiredStaffRole is "BossAdmin" or "HrSalary" && item.StaffUserId is not null &&
        item.BusinessEventKey.StartsWith(EventPrefix, StringComparison.Ordinal) &&
        Guid.TryParseExact(item.BusinessEventKey[EventPrefix.Length..], "N", out _);

    // Stage with the leave request and its audit entry in the endpoint's existing SaveChanges transaction.
    public static async Task StageAsync(AppDbContext db, WhatsAppAssistantOptions assistant,
        WhatsAppDispatchOptions dispatch, HrLeaveRequest leave, string actor, long now, CancellationToken ct)
    {
        if (!assistant.Ready || !dispatch.StaffCaptureEnabled || dispatch.TemplateFor(TemplateKey, "en_US") is null ||
            !await db.WhatsAppStaffNotificationPolicies.AnyAsync(row => row.Category == Category && row.Enabled, ct)) return;

        var bindingIds = await db.WhatsAppStaffBindings.AsNoTracking()
            .Where(binding => binding.VerifiedAt > 0 && binding.RevokedAt == null && binding.StaffUserId != leave.StaffUserId)
            .Select(binding => binding.Id).ToListAsync(ct);
        var expiresAt = now + LifetimeSeconds;
        foreach (var bindingId in bindingIds)
        {
            var identity = await WhatsAppStaffBindings.ResolveAsync(db, assistant, bindingId, now, ct);
            if (identity is null) continue;
            var role = identity.Value.Roles.Contains("BossAdmin") ? "BossAdmin" :
                identity.Value.Roles.Contains("HrSalary") ? "HrSalary" : null;
            if (role is null) continue;
            await WhatsAppStaffNotifications.StageAsync(db, assistant, bindingId, Category, role,
                EventPrefix + leave.Id.ToString("N"), 1, "New leave request awaiting review.",
                now, expiresAt, now, actor, ct, templateVersion: TemplateKey);
        }
    }

    internal static async Task<WhatsAppOutbox?> RefreshAsync(AppDbContext db, WhatsAppOutbox item, long now,
        WhatsAppPendingLeaveFacts? facts, CancellationToken ct)
    {
        if (!IsSubmission(item) || item.ExpiresAt <= now) return null;
        var submittedId = Guid.ParseExact(item.BusinessEventKey[EventPrefix.Length..], "N");
        facts ??= await WhatsAppHrNotifications.LoadPendingLeaveFactsAsync(db, ct);
        var pending = facts.Requests.Where(request => request.StaffUserId != item.StaffUserId)
            .OrderByDescending(request => request.Id == submittedId)
            .ThenBy(request => request.StartDate).ThenBy(request => request.Id).ToArray();
        if (pending.Length == 0 || pending[0].Id != submittedId) return null;

        var values = new[] { DisplayDate(WhatsAppStaffNotifications.LocalDate(now)),
            pending.Length.ToString(CultureInfo.InvariantCulture), "None", "None", "None" };
        for (var index = 0; index < Math.Min(pending.Length, 3); index++)
        {
            var request = pending[index];
            var name = SafeName(facts.StaffNames.GetValueOrDefault(request.StaffUserId));
            var dates = DisplayDate(request.StartDate);
            if (request.EndDate != request.StartDate) dates += " to " + DisplayDate(request.EndDate);
            values[index + 2] = name + " - " + dates;
        }
        return item with { Body = Render(values), TemplateReference = JsonSerializer.Serialize(values) };
    }

    internal static string[]? Parameters(WhatsAppOutbox item)
    {
        if (!IsSubmission(item) || item.Language != "en_US") return null;
        try
        {
            var values = JsonSerializer.Deserialize<string[]>(item.TemplateReference);
            return values is { Length: 5 } && values.All(value => !string.IsNullOrWhiteSpace(value) &&
                value.Length <= 100 && !value.Any(char.IsControl)) && Render(values) == item.Body ? values : null;
        }
        catch (JsonException) { return null; }
    }

    private static string Render(string[] values) =>
        $"Summary date: {values[0]}\nPending requests: {values[1]}\nRequest 1: {values[2]}\nRequest 2: {values[3]}\nRequest 3: {values[4]}\nOpen the portal to review all pending requests and record your decision.";

    private static string DisplayDate(DateOnly date) => date.ToString("dd MMM yyyy", CultureInfo.InvariantCulture);

    private static string SafeName(string? value)
    {
        var name = Regex.Replace(value ?? "", @"[\p{C}{}]", "");
        name = Regex.Replace(name, @"\s+", " ").Trim();
        return name.Length == 0 ? "Staff member" : name[..Math.Min(name.Length, 32)].TrimEnd();
    }
}
