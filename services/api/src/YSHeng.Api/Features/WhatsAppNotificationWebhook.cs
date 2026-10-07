using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;

namespace YSHeng.Api.Features;

public static class WhatsAppNotificationWebhook
{
    public static IResult Challenge(WhatsAppDispatchOptions options, string? mode, string? token, string? challenge) =>
        options.WebhookReady && mode == "subscribe" && challenge is { Length: > 0 and <= 256 } &&
        !challenge.Any(char.IsControl) && WhatsAppWebhookProbe.VerifyToken(token, options.VerifyToken)
            ? Results.Text(challenge) : Results.Unauthorized();

    public static async Task<IResult> ReceiveAsync(HttpRequest request, AppDbContext db,
        WhatsAppDispatchOptions options, CancellationToken ct)
    {
        if (!options.WebhookReady) return Results.NotFound();
        using var stream = new MemoryStream();
        var buffer = new byte[8192];
        int read;
        while ((read = await request.Body.ReadAsync(buffer, ct)) > 0)
        {
            if (stream.Length + read > WhatsAppWebhookProbe.MaxBodyBytes) return Results.StatusCode(413);
            stream.Write(buffer, 0, read);
        }
        var bytes = stream.ToArray();
        if (!WhatsAppWebhookProbe.VerifySignature(bytes, request.Headers["X-Hub-Signature-256"].ToString(), options.AppSecret))
            return Results.Unauthorized();
        try
        {
            using var body = JsonDocument.Parse(bytes);
            return await ApplyAsync(db, body.RootElement, options, DateTimeOffset.UtcNow.ToUnixTimeSeconds(), ct)
                ? Results.Ok() : Results.StatusCode(503);
        }
        catch (JsonException) { return Results.BadRequest(new { message = "Invalid WhatsApp callback." }); }
    }

    public static async Task<bool> ApplyAsync(AppDbContext db, JsonElement root, WhatsAppDispatchOptions options, long now, CancellationToken ct = default)
    {
        if (!options.WebhookReady || Text(root, "object") != "whatsapp_business_account") return true;
        var reconciled = true;
        foreach (var entry in Array(root, "entry"))
        {
            if (Text(entry, "id") != options.BusinessAccountId) continue;
            foreach (var change in Array(entry, "changes"))
            {
                if (Text(change, "field") != "messages" || !Object(change, "value", out var value) ||
                    !Object(value, "metadata", out var metadata) || Text(metadata, "phone_number_id") != options.PhoneNumberId) continue;
                foreach (var message in Array(value, "messages"))
                {
                    if (Text(message, "type") != "text" || !Object(message, "text", out var text)) continue;
                    var command = Text(text, "body")?.Trim();
                    if (command is null || !(command.Equals("stop", StringComparison.OrdinalIgnoreCase) ||
                        command.Equals("berhenti", StringComparison.OrdinalIgnoreCase) || command == "退订")) continue;
                    var recipient = Recipient(Text(message, "from"));
                    if (recipient is null) continue;
                    // Revoke even on delayed callbacks. Repeated STOP messages do not append duplicate audits.
                    if (await db.WhatsAppConsents.AnyAsync(row => row.Recipient == recipient && row.OptedIn, ct))
                    {
                        db.ChangeTracker.Clear();
                        await WhatsAppOutboxStore.SetConsentAsync(db, recipient, false, "Recipient requested withdrawal via signed WhatsApp callback",
                            now, ct, actor: "whatsapp-webhook");
                    }
                    var staffIds = await db.WhatsAppStaffBindings.AsNoTracking()
                        .Where(row => row.Recipient == recipient && row.PhoneNumberId == options.PhoneNumberId && row.RevokedAt == null)
                        .Select(row => row.StaffUserId).ToListAsync(ct);
                    foreach (var staffId in staffIds)
                        await WhatsAppStaffBindings.RevokeAsync(db, staffId, "whatsapp-webhook", now, ct);
                }
                foreach (var status in Array(value, "statuses"))
                {
                    var recipient = Recipient(Text(status, "recipient_id"));
                    var id = Text(status, "id");
                    var state = Text(status, "status");
                    if (recipient is null || id is not { Length: > 0 and <= 512 } || state is not ("sent" or "delivered" or "read" or "failed")) continue;
                    var known = await db.WhatsAppOutbox.AnyAsync(row => row.Recipient == recipient && row.ProviderMessageId == id && row.EventKind != "test", ct);
                    if (!known)
                    {
                        // Meta can deliver the callback before the acceptance transaction commits.
                        // Request a retry while that recipient has a possible in-flight request; never store an unknown ID/payload.
                        if (await db.WhatsAppOutbox.AnyAsync(row => row.Recipient == recipient && row.EventKind != "test" &&
                            (row.State == "Sending" || row.State == "UnknownOutcome") && row.LeaseUntil > now - 120, ct)) reconciled = false;
                        continue;
                    }
                    var callbackAt = long.TryParse(Text(status, "timestamp"), out var timestamp) && timestamp > 0 && timestamp <= now + 300
                        ? timestamp : now;
                    await WhatsAppOutboxStore.ApplyStatusAsync(db, recipient, new(id, state), ct,
                        actor: "whatsapp-webhook", at: callbackAt);
                }
            }
        }
        return reconciled;
    }

    private static string? Recipient(string? value)
    {
        if (value is null) return null;
        try { return WhatsAppOutboxStore.NormalizeRecipient(value); }
        catch (ArgumentException) { return null; }
    }
    private static string? Text(JsonElement item, string key) => item.ValueKind == JsonValueKind.Object && item.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    private static bool Object(JsonElement item, string key, out JsonElement value)
    {
        value = default;
        return item.ValueKind == JsonValueKind.Object && item.TryGetProperty(key, out value) && value.ValueKind == JsonValueKind.Object;
    }
    private static IEnumerable<JsonElement> Array(JsonElement item, string key) => item.ValueKind == JsonValueKind.Object && item.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Array ? value.EnumerateArray() : [];
}
