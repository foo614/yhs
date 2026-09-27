using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;

namespace YSHeng.Api.Features;

public static class WhatsAppStaffWebhook
{
    public static IResult Challenge(WhatsAppAssistantOptions options, string? mode, string? token, string? challenge) =>
        !options.Ready ? Results.NotFound() : mode == "subscribe" && challenge is { Length: > 0 and <= 200 } &&
        WhatsAppWebhookProbe.VerifyToken(token, options.VerifyToken) ? Results.Text(challenge, "text/plain") : Results.Unauthorized();

    public static async Task<IResult> ReceiveAsync(HttpRequest request, AppDbContext db, WhatsAppAssistantOptions options, CancellationToken ct)
    {
        if (!options.Ready) return Results.NotFound();
        using var buffer = new MemoryStream();
        var chunk = new byte[8192];
        int length;
        while ((length = await request.Body.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + length > WhatsAppWebhookProbe.MaxBodyBytes) return Results.StatusCode(413);
            buffer.Write(chunk, 0, length);
        }
        var bytes = buffer.ToArray();
        if (!WhatsAppWebhookProbe.VerifySignature(bytes, request.Headers["X-Hub-Signature-256"], options.AppSecret)) return Results.Unauthorized();
        try
        {
            using var json = JsonDocument.Parse(bytes);
            return await ProcessAsync(db, options, json.RootElement, DateTimeOffset.UtcNow.ToUnixTimeSeconds(), ct) ? Results.Ok() : Results.StatusCode(503);
        }
        catch (JsonException) { return Results.BadRequest(); }
        catch (DbUpdateException) { return Results.StatusCode(503); }
    }

    public static async Task<bool> ProcessAsync(AppDbContext db, WhatsAppAssistantOptions options, JsonElement root, long now, CancellationToken ct = default)
    {
        if (!options.Ready || String(root, "object") != "whatsapp_business_account") return true;
        var messages = new List<(string Recipient, string MessageId, WhatsAppStaffIntent Intent, bool Fresh, long Timestamp)>();
        var statuses = new List<(string Recipient, string MessageId, string State)>();
        foreach (var entry in Array(root, "entry"))
        {
            if (String(entry, "id") != options.BusinessAccountId) continue;
            foreach (var change in Array(entry, "changes"))
            {
                if (String(change, "field") != "messages" || !Object(change, "value", out var value) ||
                    !Object(value, "metadata", out var metadata) || String(metadata, "phone_number_id") != options.PhoneNumberId) continue;
                foreach (var message in Array(value, "messages"))
                {
                    var recipient = Recipient(String(message, "from"));
                    var id = String(message, "id");
                    if (recipient is null || !options.Allows(recipient) || id is not { Length: > 0 and <= 512 } ||
                        String(message, "type") != "text" || !Object(message, "text", out var text)) continue;
                    var intent = WhatsAppStaffQueries.Parse(String(text, "body") ?? "");
                    if (intent is null) continue;
                    var validTime = long.TryParse(String(message, "timestamp"), NumberStyles.None, CultureInfo.InvariantCulture, out var timestamp) && timestamp <= now + 30;
                    var fresh = validTime && timestamp >= now - 300;
                    if (fresh || validTime && intent.Name == "stop") messages.Add((recipient, id, intent, fresh, timestamp));
                }
                foreach (var status in Array(value, "statuses").Take(50))
                {
                    var recipient = Recipient(String(status, "recipient_id"));
                    var id = String(status, "id");
                    var state = String(status, "status");
                    if (recipient is not null && options.Allows(recipient) && id is { Length: > 0 and <= 512 } && state is "sent" or "delivered" or "read" or "failed")
                        statuses.Add((recipient, id, state));
                }
            }
        }
        // STOP takes precedence across the complete callback batch, including link/language commands.
        var stopped = new HashSet<string>(StringComparer.Ordinal);
        foreach (var stop in messages.Where(item => item.Intent.Name == "stop").GroupBy(item => item.Recipient))
        {
            var recipient = stop.Key;
            var timestamp = stop.Max(item => item.Timestamp);
            // Ignore STOP older than verification. Meta only supplies seconds; STOP wins an equal-time ambiguity.
            var users = await db.WhatsAppStaffBindings.AsNoTracking().Where(item => item.PhoneNumberId == options.PhoneNumberId && item.Recipient == recipient && item.RevokedAt == null && item.VerifiedAt <= timestamp)
                .Select(item => item.StaffUserId).ToListAsync(ct);
            users.AddRange(await db.WhatsAppStaffChallenges.AsNoTracking().Where(item => item.PhoneNumberId == options.PhoneNumberId && item.Recipient == recipient && item.ConsumedAt == null && item.CreatedAt <= timestamp)
                .Select(item => item.StaffUserId).ToListAsync(ct));
            if (users.Count > 0) stopped.Add(recipient);
            foreach (var userId in users.Distinct()) await WhatsAppStaffBindings.RevokeAsync(db, userId, "whatsapp-assistant-stop", now, ct, timestamp);
        }
        // Scan the size-bounded batch for STOP before limiting query work across all entries.
        foreach (var message in messages.Where(item => item.Fresh && !stopped.Contains(item.Recipient)).Take(20))
        {
            var key = WhatsAppStaffBindings.Hash(options.PhoneNumberId + ":" + message.Recipient + ":" + message.MessageId);
            if (message.Intent.Name == "link") await WhatsAppStaffBindings.VerifyAsync(db, options, message.Recipient, message.Intent.Argument, key, now, ct);
            else await WhatsAppStaffQueue.EnqueueAsync(db, options, message.Recipient, message.Intent, key, now, ct);
        }
        var reconciled = true;
        foreach (var status in statuses.Take(50))
        {
            var request = await db.WhatsAppStaffRequests.AsNoTracking().Where(item => item.ProviderMessageId == status.MessageId)
                .Join(db.WhatsAppStaffBindings.AsNoTracking(), item => item.BindingId, item => item.Id, (request, binding) => new { Request = request, Binding = binding })
                .SingleOrDefaultAsync(item => item.Binding.PhoneNumberId == options.PhoneNumberId && item.Binding.Recipient == status.Recipient, ct);
            if (request is null)
            {
                // A callback can race the HTTP acceptance commit; ask Meta to retry rather than retain an unknown provider ID.
                if (await db.WhatsAppStaffRequests.Where(item => item.State == "Sending" && item.LeaseUntil > now)
                    .Join(db.WhatsAppStaffBindings, item => item.BindingId, item => item.Id, (_, binding) => binding)
                    .AnyAsync(item => item.PhoneNumberId == options.PhoneNumberId && item.Recipient == status.Recipient, ct)) reconciled = false;
                continue;
            }
            var current = request.Request.State;
            var next = status.State switch
            {
                "read" => "Read",
                "delivered" when current != "Read" => "Delivered",
                "sent" when current == "Accepted" => "Sent",
                "failed" when current is "Accepted" or "Sent" => "Failed",
                _ => current
            };
            if (current != next) await db.WhatsAppStaffRequests.Where(item => item.Id == request.Request.Id && item.State == current)
                .ExecuteUpdateAsync(set => set.SetProperty(item => item.State, next), ct);
        }
        return reconciled;
    }

    private static string? Recipient(string? value)
    {
        if (value is null) return null;
        try { return WhatsAppOutboxStore.NormalizeRecipient(value); }
        catch (ArgumentException) { return null; }
    }
    private static string? String(JsonElement item, string name) => item.ValueKind == JsonValueKind.Object && item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static bool Object(JsonElement item, string name, out JsonElement value)
    {
        value = default;
        return item.ValueKind == JsonValueKind.Object && item.TryGetProperty(name, out value) && value.ValueKind == JsonValueKind.Object;
    }
    private static IEnumerable<JsonElement> Array(JsonElement item, string name) => item.ValueKind == JsonValueKind.Object && item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Array ? value.EnumerateArray() : [];
}
