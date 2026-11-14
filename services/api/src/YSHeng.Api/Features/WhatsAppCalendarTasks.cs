using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class WhatsAppCalendarTasks
{
    public const string Category = "CalendarTasks";
    public static string? Project(IEnumerable<CalendarTask> tasks, DateOnly target, string userId, bool boss, string language)
    {
        var rows = tasks.Where(task => task.Status == CalendarTaskStatus.Open && task.StartDate <= target && task.EndDate >= target && (boss || task.AssignedToUserId == userId)).OrderBy(task => task.StartDate).ThenBy(task => task.Id).ToArray();
        if (rows.Length == 0) return null;
        var heading = language == "ms" ? "Tugasan" : "Tasks";
        var lines = rows.Take(4).Select(task =>
        {
            var title = WhatsAppStaffSalesQueries.Clean(task.Title);
            title = title[..Math.Min(100, title.Length)];
            return task.StartTime is { } start && task.EndTime is { } end
                ? $"{title} ({task.StartDate:dd/MM/yyyy} {start.ToString("HH':'mm")}-{task.EndDate:dd/MM/yyyy} {end.ToString("HH':'mm")})"
                : title;
        });
        return $"{heading} {target:dd/MM/yyyy}: {string.Join("; ", lines)}. {rows.Length} total. Check Dashboard for details.";
    }

    private static async Task<string?> BodyAsync(AppDbContext db, WhatsAppStaffNotificationPolicy policy, string userId, string role, long now, string language, CancellationToken ct)
    {
        var target = WhatsAppStaffNotifications.LocalDate(now).AddDays(policy.LeadDays);
        var tasks = await db.CalendarTasks.AsNoTracking().Where(task => task.Status == CalendarTaskStatus.Open && task.StartDate <= target && task.EndDate >= target && (role == "BossAdmin" || task.AssignedToUserId == userId)).ToListAsync(ct);
        return Project(tasks, target, userId, role == "BossAdmin", language);
    }

    public static async Task<string?> RefreshAsync(AppDbContext db, WhatsAppOutbox row, long now, CancellationToken ct)
    {
        if (row.MessageKind != Category || row.StaffUserId is null || row.ExpiresAt <= now || row.BusinessEventKey != WhatsAppStaffNotifications.LocalDate(now).ToString("yyyy-MM-dd")) return null;
        var policy = await db.WhatsAppStaffNotificationPolicies.AsNoTracking().SingleOrDefaultAsync(item => item.Category == Category && item.Enabled, ct);
        if (policy is null || now < WhatsAppStaffNotifications.LocalDayDueAt(WhatsAppStaffNotifications.LocalDate(now), policy.LocalMinuteOfDay)) return null;
        return await BodyAsync(db, policy, row.StaffUserId, row.RequiredStaffRole!, now, row.Language, ct);
    }

    public static async Task<int> EnqueueAsync(AppDbContext db, WhatsAppAssistantOptions assistant, long now, CancellationToken ct)
    {
        if (!assistant.Ready) return 0;
        var policy = await db.WhatsAppStaffNotificationPolicies.AsNoTracking().SingleOrDefaultAsync(item => item.Category == Category && item.Enabled, ct);
        if (policy is null || now < WhatsAppStaffNotifications.LocalDayDueAt(WhatsAppStaffNotifications.LocalDate(now), policy.LocalMinuteOfDay)) return 0;
        var ids = await db.WhatsAppStaffBindings.AsNoTracking().Where(row => row.VerifiedAt > 0 && row.RevokedAt == null).Select(row => row.Id).ToArrayAsync(ct);
        var count = 0;
        foreach (var id in ids)
        {
            var resolved = await WhatsAppStaffBindings.ResolveAsync(db, assistant, id, now, ct);
            if (resolved is null) continue;
            var role = resolved.Value.Roles.Contains("BossAdmin") ? "BossAdmin" : resolved.Value.Roles.FirstOrDefault(value => WhatsAppStaffNotifications.RoleAllowed(Category, [value]));
            if (role is null) continue;
            var body = await BodyAsync(db, policy, resolved.Value.Binding.StaffUserId, role, now, resolved.Value.Binding.Language, ct);
            if (body is null) continue;
            var staged = await WhatsAppStaffNotifications.StageCurrentDayDigestAsync(db, assistant, id, Category, role, body, 1, now, "calendar-reminder", ct);
            if (staged is null || db.Entry(staged).State == EntityState.Detached) continue;
            try { await db.SaveChangesAsync(ct); count++; }
            catch (DbUpdateException)
            {
                db.ChangeTracker.Clear();
                if (!await db.WhatsAppOutbox.AnyAsync(row => row.IdempotencyKey == staged.IdempotencyKey, ct)) throw;
            }
        }
        return count;
    }
}
