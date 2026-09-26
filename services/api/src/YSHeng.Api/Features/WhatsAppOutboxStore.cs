using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

// Shared EF persistence, currently exercised only by the isolated test host.
// Production does not register or dispatch this service yet.
public static class WhatsAppOutboxStore
{
    // Used only by the signed, allowlisted test host. Preference never grants consent.
    public static async Task EnqueuePreviewAsync(AppDbContext db, string eventKey, string recipient, string? language,
        string? template, long now, CancellationToken ct = default)
    {
        recipient = NormalizeRecipient(recipient);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var consent = await db.WhatsAppConsents.FindAsync([recipient], ct);
        if (consent is null || !consent.OptedIn) return;
        var selected = WhatsAppNotificationTemplates.Language(language ?? consent.Language);
        var body = template is null
            ? (selected == "ms" ? "Bahasa pemberitahuan ditetapkan kepada Bahasa Malaysia." : "Notification language set to English.")
            : (selected == "ms" ? "PRATONTON UJIAN: " : "TEST PREVIEW: ") + WhatsAppNotificationTemplates.Render(template, selected, "TEST-001");
        var item = Stage(db, eventKey, recipient, body, now, now + 300, template is null ? "test-language-v1" : "preview-" + template, selected);
        if (await db.WhatsAppOutbox.AsNoTracking().AnyAsync(row => row.IdempotencyKey == item.IdempotencyKey, ct))
        {
            db.ChangeTracker.Clear();
            return;
        }
        if (language is not null)
        {
            db.Entry(consent).CurrentValues.SetValues(consent with { Language = selected, UpdatedAt = now });
            Audit(db, consent.Id, "language.changed", nameof(WhatsAppConsent));
        }
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public static string NormalizeRecipient(string recipient)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(recipient);
        var value = recipient.Trim();
        if (value.StartsWith('+')) value = value[1..];
        if (!Regex.IsMatch(value, @"\A[1-9][0-9]{7,14}\z")) throw new ArgumentException("Invalid international recipient.");
        return value;
    }

    public static async Task SetConsentAsync(AppDbContext db, string recipient, bool optedIn, string evidence, long now, CancellationToken ct = default, string? language = null, string actor = "whatsapp-test")
    {
        recipient = NormalizeRecipient(recipient);
        if (string.IsNullOrWhiteSpace(evidence) || evidence.Length > 160) throw new ArgumentException("Consent evidence is required.");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        // Obtain the same row write lock used by business-event capture before scanning pending work.
        await db.WhatsAppConsents.Where(row => row.Recipient == recipient)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.UpdatedAt, row => row.UpdatedAt), ct);
        var prior = await db.WhatsAppConsents.FindAsync([recipient], ct);
        var next = new WhatsAppConsent { Id = prior?.Id ?? Guid.NewGuid(), Recipient = recipient, OptedIn = optedIn, Language = WhatsAppNotificationTemplates.Language(language ?? prior?.Language), Evidence = evidence, UpdatedAt = now };
        if (prior is null) db.WhatsAppConsents.Add(next);
        else db.Entry(prior).CurrentValues.SetValues(next);
        if (!optedIn)
        {
            var pending = await db.WhatsAppOutbox.Where(item => item.Recipient == recipient && (item.State == "Queued" || item.State == "RetryScheduled" || item.State == "HeldForApproval"))
                .Select(item => item.Id).ToListAsync(ct);
            foreach (var id in pending)
            {
                var changed = await db.WhatsAppOutbox.Where(item => item.Id == id && (item.State == "Queued" || item.State == "RetryScheduled" || item.State == "HeldForApproval"))
                    .ExecuteUpdateAsync(set => set.SetProperty(item => item.State, "Suppressed"), ct);
                if (changed > 0) Audit(db, id, "Suppressed", actor: actor);
            }
        }
        Audit(db, next.Id, optedIn ? "consent.granted" : "consent.revoked", nameof(WhatsAppConsent), actor);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    // Domain integrations can stage in their own unit of work; caller owns SaveChanges and transaction.
    public static WhatsAppOutbox Stage(AppDbContext db, string eventKey, string recipient, string body, long now, long expiresAt, string templateVersion = "test-text-v1", string language = "en_US", string eventKind = "test", string businessReference = "", string actor = "whatsapp-test")
    {
        recipient = NormalizeRecipient(recipient);
        if (string.IsNullOrWhiteSpace(eventKey) || eventKey.Length > 512 || string.IsNullOrWhiteSpace(body) || body.Length > 3500 || expiresAt <= now)
            throw new ArgumentException("Invalid notification.");
        language = WhatsAppNotificationTemplates.Language(language);
        if (string.IsNullOrWhiteSpace(templateVersion) || templateVersion.Length > 80) throw new ArgumentException("Invalid template version.");
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new[] { eventKey, recipient, templateVersion }))));
        var item = new WhatsAppOutbox { IdempotencyKey = key, Recipient = recipient, Body = body, TemplateVersion = templateVersion, Language = language, EventKind = eventKind, BusinessReference = businessReference, State = eventKind == "test" ? "Queued" : "HeldForApproval", CreatedAt = now, NextAttemptAt = now, ExpiresAt = expiresAt };
        db.WhatsAppOutbox.Add(item);
        Audit(db, item.Id, eventKind == "test" ? "queued" : "HeldForApproval", actor: actor);
        return item;
    }

    public static async Task<Guid> EnqueueTestAsync(AppDbContext db, string eventKey, string recipient, string body, long now, CancellationToken ct = default)
    {
        var item = Stage(db, eventKey, recipient, body, now, now + 300);
        try { await db.SaveChangesAsync(ct); return item.Id; }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            var existing = await db.WhatsAppOutbox.AsNoTracking().SingleOrDefaultAsync(row => row.IdempotencyKey == item.IdempotencyKey, ct);
            if (existing is null) throw;
            return existing.Id;
        }
    }

    public static async Task<bool> DispatchOneTestAsync(AppDbContext db, string allowedRecipient,
        Func<WhatsAppOutbox, CancellationToken, Task<WhatsAppTestResult>> send, long now, CancellationToken ct = default)
    {
        allowedRecipient = NormalizeRecipient(allowedRecipient);
        // A crash during HTTP is ambiguous, never automatically retryable.
        await using (var recovery = await db.Database.BeginTransactionAsync(ct))
        {
            var stale = await db.WhatsAppOutbox.Where(row => row.State == "Sending" && row.LeaseUntil <= now).Select(row => row.Id).ToListAsync(ct);
            foreach (var id in stale)
            {
                var changed = await db.WhatsAppOutbox.Where(row => row.Id == id && row.State == "Sending" && row.LeaseUntil <= now)
                    .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "UnknownOutcome"), ct);
                if (changed > 0) Audit(db, id, "UnknownOutcome");
            }
            await db.SaveChangesAsync(ct);
            await recovery.CommitAsync(ct);
        }
        var candidate = await db.WhatsAppOutbox.AsNoTracking()
            .Where(row => (row.State == "Queued" || row.State == "RetryScheduled") && row.NextAttemptAt <= now)
            .OrderBy(row => row.CreatedAt).FirstOrDefaultAsync(ct);
        if (candidate is null) return false;
        await using (var claim = await db.Database.BeginTransactionAsync(ct))
        {
            var claimed = await db.WhatsAppOutbox.Where(row => row.Id == candidate.Id && row.State == candidate.State && row.Attempts == candidate.Attempts)
                .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "Sending")
                    .SetProperty(row => row.Attempts, row => row.Attempts + 1).SetProperty(row => row.LeaseUntil, now + 120), ct);
            if (claimed == 0) return true;
            Audit(db, candidate.Id, "Sending");
            await db.SaveChangesAsync(ct);
            await claim.CommitAsync(ct);
        }
        var eligible = candidate.EventKind == "test" && candidate.Recipient == allowedRecipient && candidate.ExpiresAt > now &&
            await db.WhatsAppConsents.AnyAsync(consent => consent.Recipient == candidate.Recipient && consent.OptedIn, ct);
        if (!eligible)
        {
            await Finish(db, candidate.Id, "Suppressed", null, now, ct);
            return true;
        }
        WhatsAppTestResult result;
        try { result = await send(candidate, ct); }
        catch (Exception) { result = new("UnknownOutcome"); }
        var attempt = candidate.Attempts + 1;
        var state = result.Outcome switch
        {
            "Accepted" when !string.IsNullOrWhiteSpace(result.MessageId) => "Accepted",
            "ProviderRejected" when result.HttpStatusCode == 429 && attempt < 3 => "RetryScheduled",
            "ProviderRejected" when result.HttpStatusCode is >= 400 and < 500 => "DeadLetter",
            "Disabled" or "ConsentRequired" or "InvalidConfiguration" or "InvalidReply" => "Suppressed",
            _ => "UnknownOutcome"
        };
        await Finish(db, candidate.Id, state, result.MessageId, now + (30 * attempt), CancellationToken.None);
        return true;
    }

    private static async Task Finish(AppDbContext db, Guid id, string state, string? providerId, long next, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var changed = await db.WhatsAppOutbox.Where(row => row.Id == id && (row.State == "Sending" || row.State == "UnknownOutcome"))
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, state).SetProperty(row => row.ProviderMessageId, providerId)
                .SetProperty(row => row.NextAttemptAt, next), ct);
        if (changed > 0) { Audit(db, id, state); await db.SaveChangesAsync(ct); }
        await transaction.CommitAsync(ct);
    }

    public static async Task<bool> RetryDeadLetterTestAsync(AppDbContext db, Guid id, string allowedRecipient, long now, CancellationToken ct = default, string actor = "whatsapp-test")
    {
        allowedRecipient = NormalizeRecipient(allowedRecipient);
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var changed = await db.WhatsAppOutbox.Where(row => row.Id == id && row.State == "DeadLetter" && row.EventKind == "test" && row.ProviderMessageId == null && row.Recipient == allowedRecipient && row.ExpiresAt > now &&
            db.WhatsAppConsents.Any(consent => consent.Recipient == row.Recipient && consent.OptedIn))
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "Queued").SetProperty(row => row.NextAttemptAt, now), ct);
        if (changed > 0) { Audit(db, id, "manual_retry", actor: actor); await db.SaveChangesAsync(ct); }
        await transaction.CommitAsync(ct);
        return changed > 0;
    }

    public static async Task ApplyStatusAsync(AppDbContext db, string recipient, WhatsAppProbeStatus status, CancellationToken ct = default)
    {
        var row = await db.WhatsAppOutbox.AsNoTracking().SingleOrDefaultAsync(item => item.Recipient == recipient && item.ProviderMessageId == status.MessageId, ct);
        if (row is null) return;
        var merged = WhatsAppWebhookProbe.MergeStatus(row.State.ToLowerInvariant(), status.Status);
        var next = merged switch { "sent" => "Sent", "delivered" => "Delivered", "read" => "Read", "failed" => "Failed", _ => row.State };
        if (next == row.State) return;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var changed = await db.WhatsAppOutbox.Where(item => item.Id == row.Id && item.State == row.State)
            .ExecuteUpdateAsync(set => set.SetProperty(item => item.State, next), ct);
        if (changed > 0) { Audit(db, row.Id, next); await db.SaveChangesAsync(ct); }
        await transaction.CommitAsync(ct);
    }

    private static void Audit(AppDbContext db, Guid id, string action, string entity = nameof(WhatsAppOutbox), string actor = "whatsapp-test") => db.AuditLogs.Add(new AuditLog
    {
        Actor = actor, Action = "whatsapp." + action, EntityName = entity, EntityId = id
    });
}
