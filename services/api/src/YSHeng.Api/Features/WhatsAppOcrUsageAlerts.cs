using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record WhatsAppOcrUsageWarning(string Scope, string PeriodKey, int Used, int Limit,
    long Percent, long ResetsAt, string Body);

// FOO-194 adapter. The quota commit and settings endpoint will call EvaluateAsync after
// their own transaction, with exceptions logged and swallowed by that caller. Recovery
// invokes the same method so a WhatsApp outage never changes OCR accounting.
public static class WhatsAppOcrUsageAlerts
{
    private const string Category = "OcrUsage";

    public static WhatsAppOcrUsageWarning? Project(string scope, string periodKey, int used,
        int limit, int thresholdPercent, DateTime resetUtc, string language, string? staffLabel = null)
    {
        if (limit <= 0 || used < 0 || thresholdPercent is < 1 or > 100 ||
            (long)used * 100 < (long)limit * thresholdPercent) return null;
        if (scope is not ("workspace-monthly" or "staff-daily")) return null;
        var reset = new DateTimeOffset(DateTime.SpecifyKind(resetUtc, DateTimeKind.Utc)).ToUnixTimeSeconds();
        var localReset = resetUtc.AddHours(8).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
        var percentage = (long)used * 100 / limit;
        var malay = language == "ms";
        var subject = scope == "workspace-monthly"
            ? (malay ? "OCR bulanan organisasi" : "OCR workspace monthly")
            : (malay ? "OCR harian staf" : "OCR staff daily");
        var label = scope == "staff-daily" ? $" [{SafeLabel(staffLabel)}]" : "";
        var body = malay
            ? $"YS Heng: {subject}{label} {used}/{limit} ({percentage}%). Set semula {localReset} SGT."
            : $"YS Heng: {subject}{label} {used}/{limit} ({percentage}%). Resets {localReset} SGT.";
        return body.Length > 1024 ? null : new(scope, periodKey, used, limit, percentage, reset, body);
    }

    public static async Task<IReadOnlyList<WhatsAppOcrUsageWarning>> CurrentWarningsAsync(AppDbContext db,
        long now, string language, CancellationToken ct = default)
    {
        var utc = DateTimeOffset.FromUnixTimeSeconds(now).UtcDateTime;
        var monthStart = new DateTime(utc.Year, utc.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthEnd = monthStart.AddMonths(1);
        var dayStart = utc.Date;
        var dayEnd = dayStart.AddDays(1);
        var limit = await db.AiServiceLimits.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Service == AiService.Ocr, ct);
        if (limit?.IsEnabled != true) return [];
        var policy = await db.WhatsAppStaffNotificationPolicies.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Category == Category && item.Enabled, ct);
        if (policy is null) return [];
        var results = new List<WhatsAppOcrUsageWarning>();
        if (limit.MonthlyRequestLimit > 0)
        {
            // AiUsageQuotaService counts every committed reservation, including failures.
            var used = await db.AiUsageRecords.CountAsync(item => item.Service == AiService.Ocr &&
                item.RequestedAt >= monthStart && item.RequestedAt < monthEnd, ct);
            if (Project("workspace-monthly", monthStart.ToString("yyyy-MM", CultureInfo.InvariantCulture),
                    used, limit.MonthlyRequestLimit, policy.ThresholdPercent, monthEnd, language) is { } warning)
                results.Add(warning);
        }
        if (limit.PerStaffDailyRequestLimit > 0)
        {
            var counts = await db.AiUsageRecords.AsNoTracking()
                .Where(item => item.Service == AiService.Ocr && item.RequestedAt >= dayStart && item.RequestedAt < dayEnd)
                .GroupBy(item => item.StaffUserId)
                .Select(group => new { StaffUserId = group.Key, Used = group.Count() }).ToListAsync(ct);
            var labels = await db.Users.AsNoTracking().Where(item => counts.Select(count => count.StaffUserId).Contains(item.Id))
                .Select(item => new { item.Id, item.DisplayName }).ToDictionaryAsync(item => item.Id, ct);
            foreach (var count in counts)
                if (Project("staff-daily", $"{count.StaffUserId}:{dayStart:yyyy-MM-dd}", count.Used,
                    limit.PerStaffDailyRequestLimit, policy.ThresholdPercent, dayEnd, language,
                    labels.TryGetValue(count.StaffUserId, out var staff) ? staff.DisplayName : "staff") is { } warning)
                    results.Add(warning);
        }
        return results;
    }

    public static async Task<int> EvaluateAsync(AppDbContext db, WhatsAppAssistantOptions assistant,
        long now, string actor, CancellationToken ct = default)
    {
        var bindings = await db.WhatsAppStaffBindings.AsNoTracking()
            .Where(item => item.VerifiedAt > 0 && item.RevokedAt == null).ToListAsync(ct);
        var observed = 0;
        foreach (var binding in bindings)
        {
            var resolved = await WhatsAppStaffBindings.ResolveAsync(db, assistant, binding.Id, now, ct);
            if (resolved is null || !resolved.Value.Roles.Contains("BossAdmin")) continue;
            var warnings = await CurrentWarningsAsync(db, now, binding.Language, ct);
            foreach (var warning in warnings)
                if (await StageAsync(db, resolved.Value.Binding, warning, now, actor, ct) is not null)
                    observed++;
        }
        return observed;
    }

    public static async Task<WhatsAppOcrUsageWarning?> RefreshForDispatchAsync(AppDbContext db,
        WhatsAppOutbox queued, long now, CancellationToken ct = default)
    {
        if (queued.Audience != "Staff" || queued.MessageKind != Category || queued.RequiredStaffRole != "BossAdmin" ||
            queued.StaffUserId is null || queued.ExpiresAt <= now) return null;
        var warnings = await CurrentWarningsAsync(db, now, queued.Language, ct);
        return warnings.SingleOrDefault(item => EventKey(item) == queued.BusinessEventKey);
    }

    private static async Task<WhatsAppOutbox?> StageAsync(AppDbContext db, WhatsAppStaffBinding binding,
        WhatsAppOcrUsageWarning warning, long now, string actor, CancellationToken ct)
    {
        if (warning.ResetsAt <= now || binding.StaffUserId.Length == 0) return null;
        var eventKey = EventKey(warning);
        // Stable staff identity, not binding ID/phone, prevents rebind or limit edits
        // from generating another warning for the same scope and UTC period.
        var material = $"staff|ocr|{eventKey}|{binding.StaffUserId}";
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(material)));
        var existing = await db.WhatsAppOutbox.AsNoTracking()
            .SingleOrDefaultAsync(item => item.IdempotencyKey == key, ct);
        if (existing is not null) return existing;
        var row = new WhatsAppOutbox
        {
            Audience = "Staff", StaffBindingId = binding.Id, StaffUserId = binding.StaffUserId,
            Recipient = binding.Recipient, IdempotencyKey = key, MessageKind = Category,
            RequiredStaffRole = "BossAdmin", BusinessEventKey = eventKey, BusinessEventVersion = 1,
            EventKind = "staff.notification", TemplateVersion = "staff_notice_v1",
            TemplateReference = warning.Body, Body = warning.Body, Language = binding.Language,
            State = "Queued", CreatedAt = now, ScheduledAt = now, NextAttemptAt = now,
            ExpiresAt = warning.ResetsAt
        };
        db.WhatsAppOutbox.Add(row);
        db.AuditLogs.Add(new AuditLog { Actor = actor, Action = "whatsapp.staff.ocr-usage.queued",
            EntityName = nameof(WhatsAppOutbox), EntityId = row.Id });
        try { await db.SaveChangesAsync(ct); return row; }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            // The unique idempotency index is the cross-process concurrency arbiter.
            var raced = await db.WhatsAppOutbox.AsNoTracking()
                .SingleOrDefaultAsync(item => item.IdempotencyKey == key, ct);
            if (raced is null) throw;
            return raced;
        }
    }

    private static string EventKey(WhatsAppOcrUsageWarning warning) =>
        $"ocr:{warning.Scope}:{warning.PeriodKey}";

    private static string SafeLabel(string? value)
    {
        var label = new string((value ?? "staff").Where(c => !char.IsControl(c) && c is not '[' and not ']').Take(40).ToArray()).Trim();
        return label.Length == 0 ? "staff" : label;
    }
}
