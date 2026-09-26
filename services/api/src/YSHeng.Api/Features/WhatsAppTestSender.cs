using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.RegularExpressions;

[assembly: InternalsVisibleTo("YSHeng.Api.Tests")]

namespace YSHeng.Api.Features;

// Deliberately not registered in the API or worker. This is a manual connectivity probe,
// not the consent-aware notification engine tracked by FOO-40.
public sealed class WhatsAppTestSender : IDisposable
{
    private readonly HttpClient httpClient;

    // Bypass the application's default factory resilience pipeline: retrying a POST
    // after an ambiguous failure could send the same message twice.
    public WhatsAppTestSender() : this(new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(30)
    }) { }

    internal WhatsAppTestSender(HttpClient httpClient) => this.httpClient = httpClient;

    public void Dispose() => httpClient.Dispose();

    public Task<WhatsAppTestResult> SendHelloWorldAsync(
        WhatsAppTestOptions options, CancellationToken cancellationToken = default) => SendAsync(options, null, cancellationToken);

    // Only the signed, allowlisted inbound test host invokes this inside the service window.
    public Task<WhatsAppTestResult> SendTestReplyAsync(
        WhatsAppTestOptions options, CancellationToken cancellationToken = default) => SendAsync(options, "YS Heng test connection successful. Your message was received.", cancellationToken);

    public Task<WhatsAppTestResult> SendInventoryReplyAsync(
        WhatsAppTestOptions options, string reply, CancellationToken cancellationToken = default) =>
        string.IsNullOrWhiteSpace(reply) || reply.Length > 3500
            ? Task.FromResult(new WhatsAppTestResult("InvalidReply"))
            : SendAsync(options, reply, cancellationToken);

    private async Task<WhatsAppTestResult> SendAsync(
        WhatsAppTestOptions options, string? reply, CancellationToken cancellationToken)
    {
        if (!options.Enabled)
            return new("Disabled");
        if (!options.RecipientConsentConfirmed)
            return new("ConsentRequired");

        var recipient = options.TestRecipient.Trim();
        if (recipient.StartsWith('+')) recipient = recipient[1..];
        if (!Regex.IsMatch(recipient, @"\A[1-9][0-9]{7,14}\z") ||
            !Regex.IsMatch(options.PhoneNumberId, @"\A[0-9]{1,32}\z") ||
            !Regex.IsMatch(options.GraphApiVersion, @"\Av[0-9]{1,3}\.0\z") ||
            string.IsNullOrWhiteSpace(options.AccessToken) || options.AccessToken.Any(char.IsWhiteSpace))
            return new("InvalidConfiguration");

        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"https://graph.facebook.com/{options.GraphApiVersion}/{options.PhoneNumberId}/messages");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.AccessToken);
        request.Content = reply is not null ? JsonContent.Create<object>(new
        {
            messaging_product = "whatsapp",
            to = recipient,
            type = "text",
            text = new { body = reply, preview_url = false }
        }) : JsonContent.Create<object>(new
        {
            messaging_product = "whatsapp",
            to = recipient,
            type = "template",
            template = new { name = "hello_world", language = new { code = "en_US" } }
        });

        try
        {
            using var response = await httpClient.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return new("ProviderRejected", HttpStatusCode: (int)response.StatusCode);

            using var body = await JsonDocument.ParseAsync(
                await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
            if (body.RootElement.ValueKind == JsonValueKind.Object &&
                body.RootElement.TryGetProperty("messages", out var messages) &&
                messages.ValueKind == JsonValueKind.Array && messages.GetArrayLength() > 0 &&
                messages[0].ValueKind == JsonValueKind.Object &&
                messages[0].TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String &&
                !string.IsNullOrWhiteSpace(id.GetString()))
                return new("Accepted", id.GetString(), (int)response.StatusCode);

            return new("UnknownOutcome", HttpStatusCode: (int)response.StatusCode);
        }
        catch (JsonException)
        {
            return new("UnknownOutcome");
        }
        catch (HttpRequestException)
        {
            // The provider may have accepted the message before the connection failed.
            return new("UnknownOutcome");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new("UnknownOutcome");
        }
    }
}

// A class rather than a record prevents generated ToString() from exposing credentials.
public sealed class WhatsAppTestOptions
{
    public bool Enabled { get; init; }
    public bool RecipientConsentConfirmed { get; init; }
    public string GraphApiVersion { get; init; } = "";
    public string PhoneNumberId { get; init; } = "";
    public string AccessToken { get; init; } = "";
    public string TestRecipient { get; init; } = "";
}

public sealed record WhatsAppTestResult(string Outcome, string? MessageId = null, int? HttpStatusCode = null);
