using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
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
                var (code, subcode) = await ReadErrorCodesAsync(response, ct);
                logger.LogWarning("Staff WhatsApp provider rejected reply (HTTP {HttpStatusCode}, Meta code {MetaErrorCode}, subcode {MetaErrorSubcode}).",
                    (int)response.StatusCode, code, subcode);
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

    private static async Task<(int? Code, int? Subcode)> ReadErrorCodesAsync(HttpResponseMessage response, CancellationToken ct)
    {
        try
        {
            if (response.Content is null || response.Content.Headers.ContentLength > MaxErrorBytes) return (null, null);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(2));
            using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
            using var content = new MemoryStream();
            var buffer = new byte[1024];
            int count;
            while ((count = await stream.ReadAsync(buffer, timeout.Token)) > 0)
            {
                if (content.Length + count > MaxErrorBytes) return (null, null);
                content.Write(buffer, 0, count);
            }
            using var json = JsonDocument.Parse(content.ToArray(), new JsonDocumentOptions { MaxDepth = 8 });
            if (json.RootElement.ValueKind != JsonValueKind.Object ||
                !json.RootElement.TryGetProperty("error", out var error) || error.ValueKind != JsonValueKind.Object)
                return (null, null);
            int? Number(string name) => error.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.Number &&
                value.TryGetInt32(out var number) ? number : null;
            return (Number("code"), Number("error_subcode"));
        }
        catch (Exception)
        {
            // The HTTP rejection is definitive even when the bounded diagnostic body cannot be read.
            return (null, null);
        }
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
