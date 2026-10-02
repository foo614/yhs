using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace YSHeng.Api.Features;

public static class WhatsAppWebhookProbe
{
    public const int MaxBodyBytes = 262144;
    public const string HelpReply = """
        YS Heng WhatsApp test commands

        help - Show this menu.
        stock - List up to 5 public vehicles for sale.
        stock <make, model or plate> - Search public stock. Example: stock toyota
        test - Check the connection.
        stop - Stop all test replies. Contact the operator to resume.

        Notification previews (demo only):
        language en / language ms - Choose English / Bahasa Malaysia for previews.
        notify enquiry - Preview an enquiry acknowledgement.
        notify receipt - Preview a receipt notification; no receipt is sent.
        notify update - Preview a business update.

        These commands use public stock and demo notifications only. Staff, loan and finance queries are not available.
        """;

    public static bool VerifySignature(ReadOnlySpan<byte> body, string? signature, string appSecret)
    {
        if (body.Length > MaxBodyBytes || string.IsNullOrWhiteSpace(appSecret) ||
            signature is null || signature.Length != 71 || !signature.StartsWith("sha256=", StringComparison.Ordinal)) return false;
        byte[] actual;
        try { actual = Convert.FromHexString(signature[7..]); }
        catch (FormatException) { return false; }
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(appSecret), body);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }

    public static bool VerifyToken(string? supplied, string expected) =>
        !string.IsNullOrWhiteSpace(expected) && supplied is not null && supplied.Length <= 256 &&
        CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(supplied)), SHA256.HashData(Encoding.UTF8.GetBytes(expected)));

    // Return only commands from the explicitly allowed sender/recipient pair. Only bounded inventory search terms are retained in memory, never logged.
    public static IReadOnlyList<WhatsAppProbeCommand> ReadCommands(JsonElement root, string phoneNumberId, string testRecipient, DateTimeOffset now)
    {
        var commands = new List<WhatsAppProbeCommand>();
        if (Text(root, "object") != "whatsapp_business_account") return commands;
        foreach (var entry in Array(root, "entry"))
        foreach (var change in Array(entry, "changes"))
        {
            if (Text(change, "field") != "messages" || !Object(change, "value", out var value) ||
                !Object(value, "metadata", out var metadata) || Text(metadata, "phone_number_id") != phoneNumberId) continue;
            foreach (var message in Array(value, "messages"))
            {
                if (Text(message, "from") != testRecipient || Text(message, "type") != "text" ||
                    !Object(message, "text", out var text)) continue;
                var id = Text(message, "id");
                if (string.IsNullOrWhiteSpace(id) || id.Length > 512) continue;
                var body = Text(text, "body")?.Trim();
                if (body is null) continue;
                var stop = body.Equals("stop", StringComparison.OrdinalIgnoreCase) ||
                    body.Equals("berhenti", StringComparison.OrdinalIgnoreCase) || body == "退订";
                // Honor opt-outs even if delayed. Only fresh test commands may generate a reply.
                if (stop) { commands.Add(new(id, true)); continue; }
                var normalized = body.ToLowerInvariant();
                var language = normalized switch { "language ms" => "ms", "language en" => "en_US", _ => null };
                var template = normalized switch { "notify enquiry" => "enquiry_ack_v1", "notify receipt" => "receipt_ready_v1", "notify update" => "business_update_v1", _ => null };
                var inventory = body.Equals("stock", StringComparison.OrdinalIgnoreCase) || body.StartsWith("stock ", StringComparison.OrdinalIgnoreCase);
                var help = body.Equals("help", StringComparison.OrdinalIgnoreCase);
                var query = inventory && body.StartsWith("stock ", StringComparison.OrdinalIgnoreCase) ? body[6..].Trim() : "";
                if (query.Length > 80 || query.Any(char.IsControl)) continue;
                if (!(inventory || help || language is not null || template is not null || body.Equals("test", StringComparison.OrdinalIgnoreCase))) continue;
                if (!long.TryParse(Text(message, "timestamp"), NumberStyles.None, CultureInfo.InvariantCulture, out var seconds) ||
                    seconds < now.ToUnixTimeSeconds() - 300 || seconds > now.ToUnixTimeSeconds() + 30) continue;
                commands.Add(new(id, false, inventory, query, language, template, help));
            }
        }
        return commands;
    }

    public static IReadOnlyList<WhatsAppProbeStatus> ReadStatuses(JsonElement root, string phoneNumberId, string testRecipient)
    {
        var statuses = new List<WhatsAppProbeStatus>();
        if (Text(root, "object") != "whatsapp_business_account") return statuses;
        foreach (var entry in Array(root, "entry"))
        foreach (var change in Array(entry, "changes"))
        {
            if (Text(change, "field") != "messages" || !Object(change, "value", out var value) ||
                !Object(value, "metadata", out var metadata) || Text(metadata, "phone_number_id") != phoneNumberId) continue;
            foreach (var status in Array(value, "statuses"))
            {
                var id = Text(status, "id");
                var state = Text(status, "status");
                if (Text(status, "recipient_id") != testRecipient || string.IsNullOrWhiteSpace(id) || id.Length > 512 ||
                    state is not ("sent" or "delivered" or "read" or "failed")) continue;
                statuses.Add(new(id, state));
            }
        }
        return statuses;
    }

    // Delivery evidence wins over failure; duplicate/out-of-order callbacks cannot undo delivery.
    public static string MergeStatus(string current, string incoming) => incoming switch
    {
        "read" => "read",
        "delivered" when current != "read" => "delivered",
        "failed" when current is "accepted" or "sent" => "failed",
        "sent" when current == "accepted" => "sent",
        _ => current
    };

    private static string? Text(JsonElement item, string key) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static bool Object(JsonElement item, string key, out JsonElement value)
    {
        value = default;
        return item.ValueKind == JsonValueKind.Object && item.TryGetProperty(key, out value) && value.ValueKind == JsonValueKind.Object;
    }

    private static IEnumerable<JsonElement> Array(JsonElement item, string key) =>
        item.ValueKind == JsonValueKind.Object && item.TryGetProperty(key, out var value) && value.ValueKind == JsonValueKind.Array ? value.EnumerateArray() : [];
}

public sealed record WhatsAppProbeCommand(string MessageId, bool OptOut, bool Inventory = false, string Query = "", string? Language = null, string? Template = null, bool Help = false);
public sealed record WhatsAppProbeStatus(string MessageId, string Status);
