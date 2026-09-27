using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record WhatsAppConsentRequest(string Recipient, bool OptedIn, string Language, string Evidence);
public sealed record WhatsAppQueueItem(Guid Id, string Recipient, string EventKind, string BusinessReference,
    string TemplateVersion, string Language, string State, int Attempts, long CreatedAt, bool CanRetry, bool CanSuppress);

public static class WhatsAppAdministration
{
    public static string? ConfiguredTestRecipient(string? recipient)
    {
        if (string.IsNullOrWhiteSpace(recipient)) return null;
        try { return WhatsAppOutboxStore.NormalizeRecipient(recipient); }
        catch (ArgumentException) { return null; }
    }

    public static async Task<IReadOnlyList<WhatsAppQueueItem>> ListAsync(AppDbContext db, string? state, int page, string? testRecipient, CancellationToken ct = default, WhatsAppDispatchOptions? options = null)
    {
        testRecipient = ConfiguredTestRecipient(testRecipient);
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var query = db.WhatsAppOutbox.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(state)) query = query.Where(row => row.State == state);
        var rows = await query.OrderByDescending(row => row.CreatedAt).ThenBy(row => row.Id)
            .Skip((Math.Clamp(page, 1, 10000) - 1) * 25).Take(25)
            .Select(row => new { Row = row, Consented = db.WhatsAppConsents.Any(consent => consent.Recipient == row.Recipient && consent.OptedIn),
                BusinessConsented = db.WhatsAppConsents.Any(consent => consent.Recipient == row.Recipient && consent.OptedIn && consent.Language == row.Language) }).ToListAsync(ct);
        return rows.Select(item => new WhatsAppQueueItem(item.Row.Id, "***" + item.Row.Recipient[^4..], item.Row.EventKind,
            item.Row.BusinessReference, item.Row.TemplateVersion, item.Row.Language, item.Row.State, item.Row.Attempts, item.Row.CreatedAt,
            item.Row.State == "DeadLetter" && item.Row.ProviderMessageId is null && item.Row.ExpiresAt > now &&
                ((item.Row.EventKind == "test" && item.Row.Recipient == testRecipient && item.Consented) ||
                 (CanRetryBusiness(item.Row, options) && item.BusinessConsented)),
            item.Row.State is "Queued" or "RetryScheduled" or "HeldForApproval")).ToArray();
    }

    private static bool CanRetryBusiness(WhatsAppOutbox item, WhatsAppDispatchOptions? options) => options?.Ready == true &&
        WhatsAppNotificationDispatcher.Supported(item) && item.Attempts is > 0 and < 3 && item.TemplateReference != "" && options.TemplateFor(item) is not null;

    public static async Task<bool> RetryBusinessAsync(AppDbContext db, Guid id, WhatsAppDispatchOptions options, string actor, long now, CancellationToken ct = default)
    {
        if (!options.Ready) return false;
        var item = await db.WhatsAppOutbox.AsNoTracking().SingleOrDefaultAsync(row => row.Id == id, ct);
        if (item is null || !CanRetryBusiness(item, options)) return false;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var changed = await db.WhatsAppOutbox.Where(row => row.Id == id && row.State == "DeadLetter" && row.Attempts == item.Attempts &&
            row.ProviderMessageId == null && row.ExpiresAt > now && db.WhatsAppConsents.Any(consent =>
                consent.Recipient == row.Recipient && consent.OptedIn && consent.Language == row.Language))
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "Queued").SetProperty(row => row.NextAttemptAt, now), ct);
        if (changed > 0)
        {
            db.AuditLogs.Add(new AuditLog { Actor = actor, Action = "whatsapp.manual_retry", EntityName = nameof(WhatsAppOutbox), EntityId = id });
            await db.SaveChangesAsync(ct);
        }
        await transaction.CommitAsync(ct);
        return changed > 0;
    }

    public static async Task<bool> SuppressAsync(AppDbContext db, Guid id, string actor, CancellationToken ct = default)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var count = await db.WhatsAppOutbox.Where(row => row.Id == id && (row.State == "Queued" || row.State == "RetryScheduled" || row.State == "HeldForApproval"))
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "Suppressed"), ct);
        if (count > 0)
        {
            db.AuditLogs.Add(new AuditLog { Actor = actor, Action = "whatsapp.manual_suppression", EntityName = nameof(WhatsAppOutbox), EntityId = id });
            await db.SaveChangesAsync(ct);
        }
        await transaction.CommitAsync(ct);
        return count > 0;
    }
}
