using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record WhatsAppStaffOutbound(string Text, string Language, IReadOnlyList<WhatsAppStaffService>? Services = null);

public static class WhatsAppStaffQueue
{
    public static async Task<bool> EnqueueAsync(AppDbContext db, WhatsAppAssistantOptions options, string recipient,
        WhatsAppStaffIntent intent, string eventKey, long now, CancellationToken ct = default)
    {
        if (!options.Allows(recipient) || intent.Name is "link" or "stop") return false;
        await using var transaction = await WhatsAppStaffBindings.LockAsync(db, ct);
        if (await db.WhatsAppStaffRequests.AnyAsync(item => item.EventKey == eventKey, ct)) return true;
        var binding = await db.WhatsAppStaffBindings.AsNoTracking().SingleOrDefaultAsync(item =>
            item.PhoneNumberId == options.PhoneNumberId && item.Recipient == recipient && item.RevokedAt == null, ct);
        if (binding is null || await WhatsAppStaffBindings.ResolveAsync(db, options, binding.Id, now, ct) is not { } identity) return false;
        var dayStart = DateTimeOffset.FromUnixTimeSeconds(now).ToOffset(TimeSpan.FromHours(8)).Date;
        var from = new DateTimeOffset(dayStart, TimeSpan.FromHours(8)).ToUnixTimeSeconds();
        var workspace = await db.WhatsAppStaffRequests.CountAsync(item => item.CreatedAt >= from, ct);
        var staff = await db.WhatsAppStaffRequests.Where(item => item.CreatedAt >= from)
            .Join(db.WhatsAppStaffBindings, item => item.BindingId, item => item.Id, (request, linked) => linked.StaffUserId)
            .CountAsync(userId => userId == binding.StaffUserId, ct);
        if (workspace >= options.WorkspaceDailyLimit || staff >= options.PerStaffDailyLimit) return false;
        if (intent.Name == "usage" && await db.WhatsAppStaffRequests.Where(item => item.Intent == "usage" && item.CreatedAt > now - 60)
            .Join(db.WhatsAppStaffBindings, item => item.BindingId, item => item.Id, (_, linked) => linked.StaffUserId)
            .AnyAsync(userId => userId == binding.StaffUserId, ct)) return false;
        // Permission is checked again by the worker; a denied query stores only its allowlisted intent/reference.
        if (intent.Name == "language")
        {
            await db.WhatsAppStaffBindings.Where(item => item.Id == binding.Id && item.RevokedAt == null)
                .ExecuteUpdateAsync(set => set.SetProperty(item => item.Language, intent.Argument), ct);
            WhatsAppStaffBindings.Audit(db, binding.Id, "languageChanged", binding.StaffUserId);
        }
        db.WhatsAppStaffRequests.Add(new WhatsAppStaffRequest
        {
            EventKey = eventKey, BindingId = binding.Id, Intent = intent.Name, Argument = intent.Argument,
            CreatedAt = now, ExpiresAt = now + 300
        });
        WhatsAppStaffBindings.Audit(db, binding.Id, "queryQueued." + intent.Name, binding.StaffUserId);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return true;
    }

    public static async Task<bool> DispatchOneAsync(AppDbContext db, WhatsAppAssistantOptions options,
        Func<string, string, CancellationToken, Task<WhatsAppSendResult>> send, long now, CancellationToken ct = default) =>
        await DispatchOneRichAsync(db, options, (recipient, outbound, token) => send(recipient, outbound.Text, token), now, ct);

    public static async Task<bool> DispatchOneRichAsync(AppDbContext db, WhatsAppAssistantOptions options,
        Func<string, WhatsAppStaffOutbound, CancellationToken, Task<WhatsAppSendResult>> send, long now, CancellationToken ct = default)
    {
        if (!options.Ready) return false;
        // An interrupted HTTP submission is ambiguous, so it is never automatically replayed.
        await db.WhatsAppStaffRequests.Where(item => item.State == "Sending" && item.LeaseUntil <= now)
            .ExecuteUpdateAsync(set => set.SetProperty(item => item.State, "UnknownOutcome"), ct);
        var request = await db.WhatsAppStaffRequests.AsNoTracking().Where(item => item.State == "Queued")
            .OrderBy(item => item.CreatedAt).ThenBy(item => item.Id).FirstOrDefaultAsync(ct);
        if (request is null) return false;
        var claimed = await db.WhatsAppStaffRequests.Where(item => item.Id == request.Id && item.State == "Queued")
            .ExecuteUpdateAsync(set => set.SetProperty(item => item.State, "Sending")
                .SetProperty(item => item.Attempts, item => item.Attempts + 1).SetProperty(item => item.LeaseUntil, now + 60), ct);
        if (claimed == 0) return true;
        var intent = new WhatsAppStaffIntent(request.Intent, request.Argument);
        var identity = await WhatsAppStaffBindings.ResolveAsync(db, options, request.BindingId, now, ct);
        if (identity is null || request.ExpiresAt <= now)
        {
            await FinishAsync(db, request.Id, "Suppressed", null, ct);
            return true;
        }
        var permitted = WhatsAppStaffQueries.Permitted(intent, identity.Value.Roles);
        var reply = permitted
            ? intent.Name == "usage" ? WhatsAppStaffCommandHelp.Reply(intent.Argument, identity.Value.Binding.Language, identity.Value.Roles)
                : await WhatsAppStaffQueries.ReplyAsync(db, intent, identity.Value.Binding.Language, now, ct, options.PublicSiteUrl,
                    identity.Value.Roles, identity.Value.Binding.StaffUserId)
            : WhatsAppStaffQueries.Text(identity.Value.Binding.Language, "Your role cannot access this query.", "Peranan anda tidak dibenarkan mengakses pertanyaan ini.");
        var outbound = new WhatsAppStaffOutbound(reply, identity.Value.Binding.Language,
            permitted && intent.Name == "menu" ? WhatsAppStaffCommandHelp.Allowed(identity.Value.Roles) : null);
        var currentTime = Math.Max(now, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        // Re-read account, stamp, binding and roles after retrieval, immediately before provider submission.
        var current = await WhatsAppStaffBindings.ResolveAsync(db, options, request.BindingId, currentTime, ct);
        if (current is null || request.ExpiresAt <= currentTime || !identity.Value.Roles.Order().SequenceEqual(current.Value.Roles.Order()))
        {
            await FinishAsync(db, request.Id, "Suppressed", null, ct);
            return true;
        }
        WhatsAppSendResult result;
        try { result = await send(current.Value.Binding.Recipient, outbound, ct); }
        catch (Exception) { result = new("UnknownOutcome"); }
        var state = result.Outcome switch
        {
            "Accepted" when !string.IsNullOrWhiteSpace(result.MessageId) => "Accepted",
            "ProviderRejected" => "Failed",
            "Disabled" or "InvalidReply" => "Suppressed",
            _ => "UnknownOutcome"
        };
        await FinishAsync(db, request.Id, state, result.MessageId, CancellationToken.None);
        return true;
    }

    private static async Task FinishAsync(AppDbContext db, Guid id, string state, string? providerId, CancellationToken ct)
    {
        // A correlated status callback may already have advanced the state; never overwrite it.
        await db.WhatsAppStaffRequests.Where(item => item.Id == id && item.State == "Sending")
            .ExecuteUpdateAsync(set => set.SetProperty(item => item.State, state).SetProperty(item => item.ProviderMessageId, providerId), ct);
    }
}
