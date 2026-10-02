using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class WhatsAppNotificationDispatcher
{
    public static bool Supported(WhatsAppOutbox item) => (item.EventKind, item.TemplateVersion) is
        ("enquiry.created", "enquiry_ack_v1") or ("loan.status_changed", "business_update_v1") or ("receipt.issued", "receipt_ready_v1");

    public static async Task<bool> DispatchOneAsync(AppDbContext db, WhatsAppDispatchOptions options,
        Func<WhatsAppOutbox, CancellationToken, Task<WhatsAppSendResult>> send, long now, CancellationToken ct = default)
    {
        // This gate precedes any database access, including on installations without WhatsApp tables.
        if (!options.Ready) return false;
        WhatsAppOutbox? candidate;
        var attempt = 0;
        await using (var claim = await db.Database.BeginTransactionAsync(ct))
        {
            // A shared database row serializes claims AND budget reservations across API replicas.
            // Both PostgreSQL and the isolated SQLite test database support this insert.
            await EnsureUsageAsync(db, "dispatch-lock", ct);
            await db.WhatsAppDispatchUsage.Where(row => row.Period == "dispatch-lock")
                .ExecuteUpdateAsync(set => set.SetProperty(row => row.Attempts, row => row.Attempts), ct);
            var stale = await db.WhatsAppOutbox.Where(row => row.EventKind != "test" && row.State == "Sending" && row.LeaseUntil <= now)
                .Select(row => row.Id).ToListAsync(ct);
            foreach (var id in stale)
            {
                await db.WhatsAppOutbox.Where(row => row.Id == id && row.State == "Sending" && row.LeaseUntil <= now)
                    .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "UnknownOutcome"), ct);
                Audit(db, id, "UnknownOutcome");
            }
            var ms = options.Templates.Where(template => template.Language == "ms").Select(template => template.Key).ToArray();
            var en = options.Templates.Where(template => template.Language == "en_US").Select(template => template.Key).ToArray();
            candidate = await db.WhatsAppOutbox.AsNoTracking().Where(row => row.EventKind != "test" && row.ProviderMessageId == null &&
                (row.State == "HeldForApproval" || row.State == "Queued" || row.State == "RetryScheduled") && row.TemplateReference != "" && row.NextAttemptAt <= now &&
                ((row.Language == "ms" && ms.Contains(row.TemplateVersion)) || (row.Language == "en_US" && en.Contains(row.TemplateVersion))))
                .OrderBy(row => row.CreatedAt).ThenBy(row => row.Id).FirstOrDefaultAsync(ct);
            if (candidate is null)
            {
                await db.SaveChangesAsync(ct);
                await claim.CommitAsync(ct);
                return false;
            }
            if (!Supported(candidate) || candidate.ExpiresAt <= now || candidate.Attempts >= 3 ||
                !Guid.TryParseExact(candidate.BusinessReference, "D", out _) ||
                !await db.WhatsAppConsents.AnyAsync(row => row.Recipient == candidate.Recipient && row.OptedIn && row.Language == candidate.Language, ct) ||
                !await ReceiptEligibleAsync(db, candidate, ct))
            {
                await db.WhatsAppOutbox.Where(row => row.Id == candidate.Id).ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "Suppressed"), ct);
                Audit(db, candidate.Id, "Suppressed");
                await db.SaveChangesAsync(ct);
                await claim.CommitAsync(ct);
                return true;
            }
            // Malaysia calendar boundaries; every attempted request reserves the reviewed worst-case cost.
            var date = DateTimeOffset.FromUnixTimeSeconds(now).ToOffset(TimeSpan.FromHours(8));
            var daily = "day:" + date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
            var monthly = "month:" + date.ToString("yyyy-MM", System.Globalization.CultureInfo.InvariantCulture);
            await EnsureUsageAsync(db, daily, ct);
            await EnsureUsageAsync(db, monthly, ct);
            var day = await db.WhatsAppDispatchUsage.AsNoTracking().SingleAsync(row => row.Period == daily, ct);
            var month = await db.WhatsAppDispatchUsage.AsNoTracking().SingleAsync(row => row.Period == monthly, ct);
            if (day.Attempts >= options.DailyAttemptLimit || month.ReservedCostSen > options.MonthlyBudgetSen - options.MaximumCostPerAttemptSen)
            {
                await db.SaveChangesAsync(ct);
                await claim.CommitAsync(ct);
                return false;
            }
            attempt = candidate.Attempts + 1;
            var claimed = await db.WhatsAppOutbox.Where(row => row.Id == candidate.Id && row.State == candidate.State && row.Attempts == candidate.Attempts)
                .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "Sending").SetProperty(row => row.Attempts, attempt)
                    .SetProperty(row => row.LeaseUntil, now + 120), ct);
            if (claimed == 0)
            {
                await db.SaveChangesAsync(ct);
                await claim.CommitAsync(ct);
                return true;
            }
            foreach (var period in new[] { daily, monthly })
                await db.WhatsAppDispatchUsage.Where(row => row.Period == period).ExecuteUpdateAsync(set =>
                    set.SetProperty(row => row.Attempts, row => row.Attempts + 1)
                    .SetProperty(row => row.ReservedCostSen, row => row.ReservedCostSen + options.MaximumCostPerAttemptSen), ct);
            Audit(db, candidate.Id, "Sending");
            await db.SaveChangesAsync(ct);
            await claim.CommitAsync(ct);
        }

        // Serialize the final consent decision with withdrawal, separately from the business transaction.
        // This per-recipient lock lasts at most the bounded provider request, never the global budget lock.
        await using var submission = await db.Database.BeginTransactionAsync(ct);
        var consented = await db.WhatsAppConsents.Where(row => row.Recipient == candidate.Recipient && row.OptedIn && row.Language == candidate.Language)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.UpdatedAt, row => row.UpdatedAt), ct);
        var owned = await db.WhatsAppOutbox.AnyAsync(row => row.Id == candidate.Id && row.Attempts == attempt && row.State == "Sending", ct);
        var eligible = consented > 0 && owned && candidate.ExpiresAt > now && await ReceiptEligibleAsync(db, candidate, ct, lockReceipt: true);
        WhatsAppSendResult result;
        if (!eligible) result = new("Suppressed");
        else
        {
            try { result = await send(candidate, ct); }
            catch (Exception) { result = new("UnknownOutcome"); }
        }
        var state = result.Outcome switch
        {
            "Accepted" when !string.IsNullOrWhiteSpace(result.MessageId) => "Accepted",
            "RateLimited" when attempt < 3 => "RetryScheduled",
            "RateLimited" or "Rejected" => "DeadLetter",
            "Suppressed" or "Disabled" or "TemplateNotApproved" or "InvalidRecipient" => "Suppressed",
            _ => "UnknownOutcome"
        };
        var providerId = state == "Accepted" ? result.MessageId : null;
        // Do not let cancellation discard acceptance evidence. A failed DB commit leaves a lease for recovery.
        var changed = await db.WhatsAppOutbox.Where(row => row.Id == candidate.Id && row.Attempts == attempt &&
            (row.State == "Sending" || row.State == "UnknownOutcome"))
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, state).SetProperty(row => row.ProviderMessageId, providerId)
                .SetProperty(row => row.NextAttemptAt, now + (attempt == 1 ? 30 : 120)), CancellationToken.None);
        if (changed > 0) Audit(db, candidate.Id, state);
        await db.SaveChangesAsync(CancellationToken.None);
        await submission.CommitAsync(CancellationToken.None);
        return true;
    }

    private static Task<int> EnsureUsageAsync(AppDbContext db, string period, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"""
        INSERT INTO "WhatsAppDispatchUsage" ("Period", "Attempts", "ReservedCostSen")
        VALUES ({period}, 0, 0) ON CONFLICT ("Period") DO NOTHING;
        """, ct);

    private static async Task<bool> ReceiptEligibleAsync(AppDbContext db, WhatsAppOutbox item, CancellationToken ct, bool lockReceipt = false)
    {
        if (item.EventKind != "receipt.issued") return true;
        if (!Guid.TryParseExact(item.BusinessReference, "D", out var id)) return false;
        if (lockReceipt)
            return await db.OfficialReceipts.Where(row => row.Id == id && !row.IsVoided)
                .ExecuteUpdateAsync(set => set.SetProperty(row => row.IsVoided, row => row.IsVoided), ct) > 0;
        return await db.OfficialReceipts.AnyAsync(row => row.Id == id && !row.IsVoided, ct);
    }

    private static void Audit(AppDbContext db, Guid id, string state) => db.AuditLogs.Add(new AuditLog
        { Actor = "whatsapp-dispatch", Action = "whatsapp." + state, EntityName = nameof(WhatsAppOutbox), EntityId = id });
}

public sealed class WhatsAppNotificationWorker(IServiceScopeFactory scopes, WhatsAppDispatchOptions options,
    WhatsAppTemplateSender sender, ILogger<WhatsAppNotificationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await WhatsAppNotificationDispatcher.DispatchOneAsync(db, options,
                    (item, ct) => sender.SendAsync(options, item, ct), DateTimeOffset.UtcNow.ToUnixTimeSeconds(), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception)
            {
                // No exception object: database/provider details may contain recipients or credentials.
                logger.LogWarning("WhatsApp dispatch iteration failed; pending leases require reconciliation.");
            }
        }
    }
}
