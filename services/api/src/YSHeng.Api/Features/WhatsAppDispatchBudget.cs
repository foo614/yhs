using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record WhatsAppDispatchBudgetUpdate(int DailyAttemptLimit, long MonthlyBudgetSen,
    long MaximumCostPerAttemptSen);
public sealed record WhatsAppDispatchLimits(int DailyAttemptLimit, long MonthlyBudgetSen,
    long MaximumCostPerAttemptSen)
{
    public bool Valid => DailyAttemptLimit > 0 && MonthlyBudgetSen > 0 && MaximumCostPerAttemptSen > 0 &&
        MaximumCostPerAttemptSen <= MonthlyBudgetSen;
}
public sealed record WhatsAppDispatchBudgetView(int DailyAttemptLimit, long MonthlyBudgetSen,
    long MaximumCostPerAttemptSen, long DailyAttempts, long DailyRemainingAttempts,
    long MonthlyAttempts, long MonthlyReservedCostSen, long MonthlyRemainingBudgetSen,
    bool AdminConfigured, long? UpdatedAt, string? BlockedReason);

public static class WhatsAppDispatchBudget
{
    private const string SettingsKey = "default";

    public static async Task<WhatsAppDispatchOptions> OptionsAsync(AppDbContext db,
        WhatsAppDispatchOptions fallback, CancellationToken ct = default) =>
        fallback.WithBudgetLimits(await EffectiveAsync(db, fallback, ct));

    public static async Task<WhatsAppDispatchLimits> EffectiveAsync(AppDbContext db,
        WhatsAppDispatchOptions fallback, CancellationToken ct = default)
    {
        var saved = await db.WhatsAppDispatchBudgetSettings.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Key == SettingsKey, ct);
        return saved is null
            ? new(fallback.DailyAttemptLimit, fallback.MonthlyBudgetSen, fallback.MaximumCostPerAttemptSen)
            : new(saved.DailyAttemptLimit, saved.MonthlyBudgetSen, saved.MaximumCostPerAttemptSen);
    }

    public static async Task<WhatsAppDispatchBudgetView> ViewAsync(AppDbContext db,
        WhatsAppDispatchOptions fallback, long now, CancellationToken ct = default)
    {
        var saved = await db.WhatsAppDispatchBudgetSettings.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Key == SettingsKey, ct);
        var limits = saved is null
            ? new WhatsAppDispatchLimits(fallback.DailyAttemptLimit, fallback.MonthlyBudgetSen, fallback.MaximumCostPerAttemptSen)
            : new(saved.DailyAttemptLimit, saved.MonthlyBudgetSen, saved.MaximumCostPerAttemptSen);
        var date = DateTimeOffset.FromUnixTimeSeconds(now).ToOffset(TimeSpan.FromHours(8));
        var daily = "day:" + date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        var monthly = "month:" + date.ToString("yyyy-MM", System.Globalization.CultureInfo.InvariantCulture);
        var usage = await db.WhatsAppDispatchUsage.AsNoTracking()
            .Where(item => item.Period == daily || item.Period == monthly).ToListAsync(ct);
        var day = usage.SingleOrDefault(item => item.Period == daily);
        var month = usage.SingleOrDefault(item => item.Period == monthly);
        var dailyAttempts = day?.Attempts ?? 0;
        var monthlyAttempts = month?.Attempts ?? 0;
        var reserved = month?.ReservedCostSen ?? 0;
        var dailyRemaining = Math.Max(0, (long)limits.DailyAttemptLimit - dailyAttempts);
        var monthlyRemaining = Math.Max(0, limits.MonthlyBudgetSen - reserved);
        var blocked = !limits.Valid ? "Sending limits are not configured."
            : dailyAttempts >= limits.DailyAttemptLimit ? "Daily attempt limit reached."
            : reserved > limits.MonthlyBudgetSen - limits.MaximumCostPerAttemptSen
            ? "Monthly budget has less than one reserved attempt remaining."
            : null;
        return new(limits.DailyAttemptLimit, limits.MonthlyBudgetSen, limits.MaximumCostPerAttemptSen,
            dailyAttempts, dailyRemaining, monthlyAttempts, reserved, monthlyRemaining,
            saved is not null, saved?.UpdatedAt, blocked);
    }

    public static async Task<bool> UpdateAsync(AppDbContext db, WhatsAppDispatchBudgetUpdate request,
        string actor, long now, CancellationToken ct = default)
    {
        if (request.DailyAttemptLimit <= 0 || request.MonthlyBudgetSen <= 0 ||
            request.MaximumCostPerAttemptSen <= 0 || request.MaximumCostPerAttemptSen > request.MonthlyBudgetSen)
            return false;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO "WhatsAppDispatchUsage" ("Period", "Attempts", "ReservedCostSen")
            VALUES ({"dispatch-lock"}, 0, 0) ON CONFLICT ("Period") DO NOTHING;
            """, ct);
        await db.WhatsAppDispatchUsage.Where(item => item.Period == "dispatch-lock")
            .ExecuteUpdateAsync(set => set.SetProperty(item => item.Attempts, item => item.Attempts), ct);
        var row = await db.WhatsAppDispatchBudgetSettings.SingleOrDefaultAsync(item => item.Key == SettingsKey, ct);
        var next = new WhatsAppDispatchBudgetSetting
        {
            Key = SettingsKey,
            DailyAttemptLimit = request.DailyAttemptLimit,
            MonthlyBudgetSen = request.MonthlyBudgetSen,
            MaximumCostPerAttemptSen = request.MaximumCostPerAttemptSen,
            UpdatedAt = now
        };
        if (row is null) db.WhatsAppDispatchBudgetSettings.Add(next);
        else db.Entry(row).CurrentValues.SetValues(next);
        db.AuditLogs.Add(new AuditLog
        {
            Actor = actor,
            Action = "whatsapp.dispatch_budget.updated",
            EntityName = nameof(WhatsAppDispatchBudgetSetting),
            EntityId = Guid.NewGuid()
        });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return true;
    }
}
