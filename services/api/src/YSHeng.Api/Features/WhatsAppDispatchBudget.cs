using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record WhatsAppDispatchLimitsUpdate(int DailyAttemptLimit);
public sealed record WhatsAppDispatchLimits(int DailyAttemptLimit)
{
    public bool Valid => DailyAttemptLimit > 0;
}
public sealed record WhatsAppDispatchLimitsView(int DailyAttemptLimit, long DailyAttempts,
    long DailyRemainingAttempts, bool AdminConfigured, long? UpdatedAt, string? BlockedReason);

// Legacy storage names and RM columns are retained without affecting dispatch or reporting billing.
public static class WhatsAppDispatchBudget
{
    private const string SettingsKey = "default";

    public static async Task<WhatsAppDispatchOptions> OptionsAsync(AppDbContext db,
        WhatsAppDispatchOptions fallback, CancellationToken ct = default) =>
        fallback.WithLimits(await EffectiveAsync(db, fallback, ct));

    public static async Task<WhatsAppDispatchLimits> EffectiveAsync(AppDbContext db,
        WhatsAppDispatchOptions fallback, CancellationToken ct = default)
    {
        var saved = await db.WhatsAppDispatchBudgetSettings.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Key == SettingsKey, ct);
        return new(saved?.DailyAttemptLimit ?? fallback.DailyAttemptLimit);
    }

    public static async Task<WhatsAppDispatchLimitsView> ViewAsync(AppDbContext db,
        WhatsAppDispatchOptions fallback, long now, CancellationToken ct = default)
    {
        var saved = await db.WhatsAppDispatchBudgetSettings.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Key == SettingsKey, ct);
        var limit = saved?.DailyAttemptLimit ?? fallback.DailyAttemptLimit;
        var date = DateTimeOffset.FromUnixTimeSeconds(now).ToOffset(TimeSpan.FromHours(8));
        var daily = "day:" + date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        var day = await db.WhatsAppDispatchUsage.AsNoTracking().SingleOrDefaultAsync(item => item.Period == daily, ct);
        var attempts = day?.Attempts ?? 0;
        return new(limit, attempts, Math.Max(0, (long)limit - attempts), saved is not null, saved?.UpdatedAt,
            WhatsAppNotificationDispatcher.DailyLimitBlockReason(limit, attempts));
    }

    public static async Task<bool> UpdateAsync(AppDbContext db, WhatsAppDispatchLimitsUpdate request,
        string actor, long now, CancellationToken ct = default)
    {
        if (request.DailyAttemptLimit <= 0) return false;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "WhatsAppDispatchUsage" ("Period", "Attempts", "ReservedCostSen")
            VALUES ({"dispatch-lock"}, 0, 0) ON CONFLICT ("Period") DO NOTHING;
            """, ct);
        await db.WhatsAppDispatchUsage.Where(item => item.Period == "dispatch-lock")
            .ExecuteUpdateAsync(set => set.SetProperty(item => item.Attempts, item => item.Attempts), ct);
        var row = await db.WhatsAppDispatchBudgetSettings.SingleOrDefaultAsync(item => item.Key == SettingsKey, ct);
        var next = (row ?? new WhatsAppDispatchBudgetSetting { Key = SettingsKey }) with
        {
            DailyAttemptLimit = request.DailyAttemptLimit,
            UpdatedAt = now
        };
        if (row is null) db.WhatsAppDispatchBudgetSettings.Add(next);
        else db.Entry(row).CurrentValues.SetValues(next);
        db.AuditLogs.Add(new AuditLog
        {
            Actor = actor,
            Action = "whatsapp.dispatch_limits.updated",
            EntityName = nameof(WhatsAppDispatchBudgetSetting),
            EntityId = Guid.NewGuid()
        });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return true;
    }
}
