using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

// Configuration is an operator-reviewed approval manifest, not a claim that drafts are approved.
// Classes deliberately avoid generated ToString() implementations that could reveal credentials.
public sealed class WhatsAppDispatchOptions
{
    public bool CaptureEnabled { get; init; }
    public bool SendingEnabled { get; init; }
    public bool WebhookEnabled { get; init; }
    public bool SenderApproved { get; init; }
    public string SenderApprovalEvidence { get; init; } = "";
    public string GraphApiVersion { get; init; } = "";
    public string PhoneNumberId { get; init; } = "";
    public string BusinessAccountId { get; init; } = "";
    public string AccessToken { get; init; } = "";
    public string AppSecret { get; init; } = "";
    public string VerifyToken { get; init; } = "";
    public string BudgetOwner { get; init; } = "";
    public int DailyAttemptLimit { get; init; }
    public long MonthlyBudgetSen { get; init; }
    public long MaximumCostPerAttemptSen { get; init; }
    public bool CostCeilingConfirmed { get; init; }
    public WhatsAppApprovedTemplate[] Templates { get; init; } = [];

    public bool WebhookReady => CaptureEnabled && WebhookEnabled &&
        Id(PhoneNumberId) && Id(BusinessAccountId) && Secret(AppSecret) && Secret(VerifyToken);

    public bool Ready => WebhookReady && SendingEnabled && SenderApproved && Evidence(SenderApprovalEvidence) &&
        Regex.IsMatch(GraphApiVersion, @"\Av[0-9]{1,3}\.0\z") && Secret(AccessToken) && Evidence(BudgetOwner) &&
        DailyAttemptLimit > 0 && MonthlyBudgetSen > 0 && MaximumCostPerAttemptSen > 0 &&
        MaximumCostPerAttemptSen <= MonthlyBudgetSen && CostCeilingConfirmed && Templates.Length > 0 &&
        Templates.All(template => template.Valid) &&
        Templates.Select(template => (template.Key, template.Language)).Distinct().Count() == Templates.Length;

    public WhatsAppApprovedTemplate? TemplateFor(WhatsAppOutbox item) => Templates.SingleOrDefault(template =>
        template.Valid && template.Key == item.TemplateVersion && template.Language == item.Language);

    private static bool Id(string value) => Regex.IsMatch(value, @"\A[0-9]{1,32}\z");
    private static bool Secret(string value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 4096 && !value.Any(char.IsWhiteSpace);
    internal static bool Evidence(string value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 160 && !value.Any(char.IsControl);
}

public sealed class WhatsAppApprovedTemplate
{
    public string Key { get; init; } = "";
    public string Name { get; init; } = "";
    public string Language { get; init; } = "";
    public bool Approved { get; init; }
    public string ApprovalEvidence { get; init; } = "";
    public bool Valid => Approved && Key is "enquiry_ack_v1" or "business_update_v1" or "receipt_ready_v1" &&
        Language is "ms" or "en_US" && Regex.IsMatch(Name, @"\A[a-z][a-z0-9_]{0,79}\z") &&
        WhatsAppDispatchOptions.Evidence(ApprovalEvidence);
}

public sealed record WhatsAppSendResult(string Outcome, string? MessageId = null, int? HttpStatusCode = null);

public sealed class WhatsAppTemplateSender : IDisposable
{
    private readonly HttpClient httpClient;
    public WhatsAppTemplateSender() : this(new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
        { Timeout = TimeSpan.FromSeconds(30) }) { }
    internal WhatsAppTemplateSender(HttpClient httpClient) => this.httpClient = httpClient;
    public void Dispose() => httpClient.Dispose();

    public async Task<WhatsAppSendResult> SendAsync(WhatsAppDispatchOptions options, WhatsAppOutbox item, CancellationToken ct = default)
    {
        if (!options.Ready) return new("Disabled");
        var template = options.TemplateFor(item);
        if (template is null || !WhatsAppNotificationDispatcher.Supported(item) ||
            !Guid.TryParseExact(item.BusinessReference, "D", out _) || string.IsNullOrWhiteSpace(item.TemplateReference) ||
            item.TemplateReference.Length > 80 || item.TemplateReference.Any(char.IsControl)) return new("TemplateNotApproved");
        string recipient;
        try { recipient = WhatsAppOutboxStore.NormalizeRecipient(item.Recipient); }
        catch (ArgumentException) { return new("InvalidRecipient"); }

        using var request = new HttpRequestMessage(HttpMethod.Post,
            $"https://graph.facebook.com/{options.GraphApiVersion}/{options.PhoneNumberId}/messages");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.AccessToken);
        request.Content = JsonContent.Create(new
        {
            messaging_product = "whatsapp", to = recipient, type = "template",
            template = new
            {
                name = template.Name, language = new { code = template.Language },
                components = new[] { new { type = "body", parameters = new[] { new { type = "text", text = item.TemplateReference } } } }
            }
        });
        try
        {
            using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            await response.Content.LoadIntoBufferAsync(WhatsAppWebhookProbe.MaxBodyBytes, ct);
            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
            var root = body.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return new("UnknownOutcome", HttpStatusCode: (int)response.StatusCode);
            if (response.IsSuccessStatusCode && !root.TryGetProperty("error", out _) &&
                root.TryGetProperty("messages", out var messages) && messages.ValueKind == JsonValueKind.Array && messages.GetArrayLength() == 1 &&
                messages[0].ValueKind == JsonValueKind.Object && messages[0].TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String &&
                id.GetString() is { Length: > 6 and <= 512 } messageId && messageId.StartsWith("wamid.", StringComparison.Ordinal) && !messageId.Any(character => char.IsWhiteSpace(character) || char.IsControl(character)))
                return new("Accepted", messageId, (int)response.StatusCode);
            // A valid provider error with no acceptance evidence is known non-acceptance.
            // Only explicit HTTP rate rejection is retried; 5xx/transport errors remain ambiguous.
            if (!response.IsSuccessStatusCode && !root.TryGetProperty("messages", out _) &&
                root.TryGetProperty("error", out var error) && error.ValueKind == JsonValueKind.Object &&
                error.TryGetProperty("code", out var code) && code.ValueKind == JsonValueKind.Number && code.TryGetInt32(out var number) && number > 0 &&
                (int)response.StatusCode is >= 400 and < 500)
                return new((int)response.StatusCode == 429 ? "RateLimited" : "Rejected", HttpStatusCode: (int)response.StatusCode);
            return new("UnknownOutcome", HttpStatusCode: (int)response.StatusCode);
        }
        catch (Exception ex) when (ex is HttpRequestException or OperationCanceledException or JsonException)
        {
            // Including cancellation: once submission started, acceptance cannot be ruled out.
            return new("UnknownOutcome");
        }
    }
}
