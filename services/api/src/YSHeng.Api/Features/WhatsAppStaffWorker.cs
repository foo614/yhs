using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using YSHeng.Api.Data;

namespace YSHeng.Api.Features;

public sealed class WhatsAppStaffSender : IDisposable
{
    private readonly HttpClient client;
    public WhatsAppStaffSender() : this(new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(30) }) { }
    internal WhatsAppStaffSender(HttpClient client) => this.client = client;
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
            if (!response.IsSuccessStatusCode) return new("ProviderRejected", HttpStatusCode: (int)response.StatusCode);
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
