using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging.Abstractions;
using YSHeng.Api.Data;

namespace YSHeng.Api.Features;

public sealed class WhatsAppStaffSender : IDisposable
{
    private const int MaxErrorBytes = 4096;
    private readonly HttpClient client;
    private readonly ILogger<WhatsAppStaffSender> logger;
    public WhatsAppStaffSender(ILogger<WhatsAppStaffSender> logger) : this(
        new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(30) }, logger) { }
    internal WhatsAppStaffSender(HttpClient client, ILogger<WhatsAppStaffSender>? logger = null)
    {
        this.client = client;
        this.logger = logger ?? NullLogger<WhatsAppStaffSender>.Instance;
    }
    public void Dispose() => client.Dispose();

    public async Task<WhatsAppSendResult> SendAsync(WhatsAppAssistantOptions options, string recipient, string reply, CancellationToken ct)
    {
        if (!options.Allows(recipient)) return new("Disabled");
        if (string.IsNullOrWhiteSpace(reply) || reply.Length > 3500) return new("InvalidReply");
        return await SendPayloadAsync(options, recipient,
            new { messaging_product = "whatsapp", to = recipient, type = "text", text = new { body = reply, preview_url = false } }, ct);
    }

    public async Task<WhatsAppSendResult> SendAsync(WhatsAppAssistantOptions options, string recipient, WhatsAppStaffOutbound outbound, CancellationToken ct)
    {
        if (outbound.Services is null || outbound.Services.Count == 0)
            return await SendAsync(options, recipient, outbound.Text, ct);
        if (!options.Allows(recipient)) return new("Disabled");
        if (outbound.Services.Count > 10 || outbound.Services.Any(service => service.Name.Length > 24 ||
            (outbound.Language == "ms" ? service.MalayPurpose : service.Purpose).Length > 72))
            return new("InvalidReply");
        var bm = outbound.Language == "ms";
        var sections = outbound.Services.GroupBy(service => service.Group).Select(group => new
        {
            title = bm ? group.First().MalayGroup : group.Key,
            rows = group.Select(service => new
            {
                id = WhatsAppStaffCommandHelp.SelectionPrefix + service.Name,
                title = service.Name,
                description = bm ? service.MalayPurpose : service.Purpose
            }).ToArray()
        }).ToArray();
        var payload = new
        {
            messaging_product = "whatsapp", to = recipient, type = "interactive",
            interactive = new
            {
                type = "list",
                body = new { text = bm ? $"Pilih daripada {outbound.Services.Count} pertanyaan tersedia. Hantar help untuk panduan penuh." :
                    $"Choose from {outbound.Services.Count} available enquiries. Send help for the full guide." },
                action = new { button = bm ? "Lihat perkhidmatan" : "View services", sections }
            }
        };
        var result = await SendPayloadAsync(options, recipient, payload, ct);
        // A definite invalid-menu response can safely fall back to the complete text guide.
        return result.Outcome == "ProviderRejected" && result.HttpStatusCode == 400
            ? await SendAsync(options, recipient, outbound.Text, ct) : result;
    }

    private async Task<WhatsAppSendResult> SendPayloadAsync(WhatsAppAssistantOptions options, string recipient, object payload, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"https://graph.facebook.com/{options.GraphApiVersion}/{options.PhoneNumberId}/messages");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.AccessToken);
        request.Content = JsonContent.Create(payload);
        try
        {
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode)
            {
                var (code, subcode, reason, field) = await ReadErrorDiagnosticsAsync(response, ct);
                logger.LogWarning("Staff WhatsApp provider rejected reply (HTTP {HttpStatusCode}, Meta code {MetaErrorCode}, subcode {MetaErrorSubcode}, reason {MetaErrorReason}, field {MetaErrorField}).",
                    (int)response.StatusCode, code, subcode, reason, field);
                return new("ProviderRejected", HttpStatusCode: (int)response.StatusCode);
            }
            using var content = new MemoryStream();
            using var stream = await response.Content.ReadAsStreamAsync(ct);
            var bytes = new byte[4096];
            int count;
            while ((count = await stream.ReadAsync(bytes, ct)) > 0)
            {
                if (content.Length + count > 65536) return new("UnknownOutcome");
                content.Write(bytes, 0, count);
            }
            using var json = JsonDocument.Parse(content.ToArray());
            if (json.RootElement.ValueKind == JsonValueKind.Object && json.RootElement.TryGetProperty("messages", out var messages) &&
                messages.ValueKind == JsonValueKind.Array && messages.GetArrayLength() > 0 && messages[0].ValueKind == JsonValueKind.Object &&
                messages[0].TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String && id.GetString() is { Length: > 0 and <= 512 } messageId)
                return new("Accepted", messageId, (int)response.StatusCode);
            return new("UnknownOutcome");
        }
        catch (Exception exception) when (exception is JsonException or HttpRequestException or OperationCanceledException)
        {
            return new("UnknownOutcome");
        }
    }

    private static async Task<(int? Code, int? Subcode, string Reason, string Field)> ReadErrorDiagnosticsAsync(
        HttpResponseMessage response, CancellationToken ct)
    {
        try
        {
            if (response.Content is null || response.Content.Headers.ContentLength > MaxErrorBytes)
                return (null, null, "Unknown", "Unknown");
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(2));
            using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var content = new MemoryStream();
            var buffer = new byte[1024];
            int count;
            while ((count = await stream.ReadAsync(buffer, timeout.Token)) > 0)
            {
                if (content.Length + count > MaxErrorBytes) return (null, null, "Unknown", "Unknown");
                content.Write(buffer, 0, count);
            }
            using var json = JsonDocument.Parse(content.ToArray(), new JsonDocumentOptions { MaxDepth = 8 });
            if (json.RootElement.ValueKind != JsonValueKind.Object ||
                !json.RootElement.TryGetProperty("error", out var error) || error.ValueKind != JsonValueKind.Object)
                return (null, null, "Unknown", "Unknown");
            int? Number(string name) => error.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number &&
                value.TryGetInt32(out var number) ? number : null;
            var message = error.TryGetProperty("message", out var messageValue) && messageValue.ValueKind == JsonValueKind.String
                ? messageValue.GetString() ?? "" : "";
            var details = error.TryGetProperty("error_data", out var data) && data.ValueKind == JsonValueKind.Object &&
                data.TryGetProperty("details", out var detailValue) && detailValue.ValueKind == JsonValueKind.String
                ? detailValue.GetString() ?? "" : "";
            var (reason, field) = ClassifyError(message, details);
            return (Number("code"), Number("error_subcode"), reason, field);
        }
        catch (Exception)
        {
            // The HTTP rejection is definitive even when the bounded diagnostic body cannot be read.
            return (null, null, "Unknown", "Unknown");
        }
    }

    private static (string Reason, string Field) ClassifyError(string message, string details)
    {
        var text = NormalizeMetaText(message);
        var detailText = NormalizeMetaText(details);
        var reason = KnownReason(text);
        // Meta sometimes puts the useful parameter diagnosis under error_data.details.
        // Only refine an already recognised generic parameter error, never arbitrary echoed text.
        if (text.StartsWith("Invalid parameter", StringComparison.OrdinalIgnoreCase) ||
            text.StartsWith("Unsupported parameter", StringComparison.OrdinalIgnoreCase))
        {
            var detailReason = KnownReason(detailText);
            if (detailReason is "MissingRequiredParameter" or "InvalidOrUnsupportedParameter") reason = detailReason;
        }
        if (text.Equals("Re-engagement message", StringComparison.OrdinalIgnoreCase) &&
            detailText.StartsWith("Message failed to send because more than 24 hours", StringComparison.OrdinalIgnoreCase))
            reason = "SessionWindowClosed";
        if (reason is not ("MissingRequiredParameter" or "InvalidOrUnsupportedParameter"))
            return (reason, "Unknown");
        var field = KnownField(text);
        return (reason, field == "Unknown" ? KnownField(detailText) : field);
    }

    private static string NormalizeMetaText(string value)
    {
        var text = value.Trim();
        if (text.StartsWith("(#", StringComparison.Ordinal))
        {
            var end = text.IndexOf(')');
            if (end is > 2 and <= 9 && int.TryParse(text.AsSpan(2, end - 2), out _))
                text = text[(end + 1)..].TrimStart();
        }
        return text;
    }

    private static string KnownReason(string text)
    {
        if (text.StartsWith("Missing required parameter", StringComparison.OrdinalIgnoreCase) ||
            text.StartsWith("The parameter ", StringComparison.OrdinalIgnoreCase) &&
            text.Contains(" is required", StringComparison.OrdinalIgnoreCase))
            return "MissingRequiredParameter";
        if (text.StartsWith("Invalid parameter", StringComparison.OrdinalIgnoreCase) ||
            text.StartsWith("Unsupported parameter", StringComparison.OrdinalIgnoreCase) ||
            text.StartsWith("Param ", StringComparison.OrdinalIgnoreCase) &&
            text.Contains(" must be ", StringComparison.OrdinalIgnoreCase) && KnownField(text) != "Unknown")
            return "InvalidOrUnsupportedParameter";
        if (text.StartsWith("Unsupported post request", StringComparison.OrdinalIgnoreCase) ||
            text.StartsWith("Object with ID ", StringComparison.OrdinalIgnoreCase) &&
            text.Contains(" does not exist", StringComparison.OrdinalIgnoreCase))
            return "UnknownOrInaccessibleObject";
        if (text.StartsWith("Error validating access token", StringComparison.OrdinalIgnoreCase) ||
            text.StartsWith("Invalid OAuth access token", StringComparison.OrdinalIgnoreCase))
            return "InvalidAccessToken";
        if (text.StartsWith("Permissions error", StringComparison.OrdinalIgnoreCase) ||
            text.StartsWith("Permission denied", StringComparison.OrdinalIgnoreCase))
            return "PermissionDenied";
        if (text.StartsWith("Recipient phone number not in allowed list", StringComparison.OrdinalIgnoreCase) ||
            text.StartsWith("Recipient is not in allowed list", StringComparison.OrdinalIgnoreCase))
            return "RecipientRestricted";
        if (text.StartsWith("Re-engagement message outside", StringComparison.OrdinalIgnoreCase) ||
            text.StartsWith("Message failed to send because more than 24 hours", StringComparison.OrdinalIgnoreCase))
            return "SessionWindowClosed";
        return "Unknown";
    }

    private static string KnownField(string text)
    {
        var match = Regex.Match(text, @"\b(?:parameter|param|field)\s*(?::|=)?\s*['""]?(?<field>[A-Za-z][A-Za-z0-9_.-]{0,40})",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(50));
        return match.Success ? match.Groups["field"].Value.ToLowerInvariant() switch
        {
            "messaging_product" => "messaging_product",
            "to" => "to",
            "text" => "text",
            "text.body" => "text.body",
            "text.preview_url" => "text.preview_url",
            "recipient_type" => "recipient_type",
            "type" => "type",
            "interactive" => "interactive",
            _ => "Unknown"
        } : "Unknown";
    }
}

public sealed class WhatsAppStaffWorker(IServiceScopeFactory scopes, WhatsAppAssistantOptions options, WhatsAppStaffSender sender, ILogger<WhatsAppStaffWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var nextFailureLog = DateTimeOffset.MinValue;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await WhatsAppStaffQueue.DispatchOneRichAsync(db, options, (recipient, outbound, ct) => sender.SendAsync(options, recipient, outbound, ct), DateTimeOffset.UtcNow.ToUnixTimeSeconds(), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception exception)
            {
                // Log the failure category only; exception messages can include sensitive query data.
                if (DateTimeOffset.UtcNow >= nextFailureLog)
                {
                    logger.LogError("Staff WhatsApp processing failed ({FailureType}). Check database availability; ambiguous submissions will not be replayed.", exception.GetType().Name);
                    nextFailureLog = DateTimeOffset.UtcNow.AddMinutes(1);
                }
            }
            try { await Task.Delay(TimeSpan.FromSeconds(1), stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
