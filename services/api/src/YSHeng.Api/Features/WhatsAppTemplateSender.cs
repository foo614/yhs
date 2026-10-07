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
    public bool StaffCaptureEnabled { get; init; }
    public bool StaffSendingEnabled { get; init; }
    public bool InvitationEnabled { get; init; }
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

    public bool WebhookReady => (CaptureEnabled || StaffCaptureEnabled || InvitationEnabled) && WebhookEnabled &&
        Id(PhoneNumberId) && Id(BusinessAccountId) && Secret(AppSecret) && Secret(VerifyToken);

    // Preserve the customer rollout's all-template manifest requirement.
    public bool Ready => CaptureEnabled && SendingEnabled && TransportReady && Templates.Length > 0 &&
        Templates.All(template => template.Valid) &&
        Templates.Select(template => (template.Key, template.Language)).Distinct().Count() == Templates.Length;
    public bool StaffSenderReady => StaffCaptureEnabled && StaffSendingEnabled && TransportReady;
    public bool StaffReady => StaffSenderReady && HasTemplate("staff_notice_v1");
    public bool InvitationSenderReady => InvitationEnabled && TransportReady;
    public bool InvitationReady => InvitationSenderReady && HasTemplate(WhatsAppStaffInvitation.TemplateKey);

    private bool TransportReady => WebhookReady && SenderApproved && Evidence(SenderApprovalEvidence) &&
        Regex.IsMatch(GraphApiVersion, @"\Av[0-9]{1,3}\.0\z") && Secret(AccessToken) && Evidence(BudgetOwner) &&
        DailyAttemptLimit > 0 && MonthlyBudgetSen > 0 && MaximumCostPerAttemptSen > 0 &&
        MaximumCostPerAttemptSen <= MonthlyBudgetSen && CostCeilingConfirmed;

    public WhatsAppApprovedTemplate? TemplateFor(WhatsAppOutbox item) => TemplateFor(item.TemplateVersion, item.Language);

    public WhatsAppApprovedTemplate? TemplateFor(string key, string language)
    {
        var matches = Templates.Where(template => template.Key == key && template.Language == language).Take(2).ToArray();
        return matches.Length == 1 && matches[0].Valid ? matches[0] : null;
    }

    private bool HasTemplate(string key) => TemplateFor(key, "ms") is not null || TemplateFor(key, "en_US") is not null;

    public WhatsAppTemplateReadiness TemplateReadiness(string key, string language)
    {
        var matches = Templates.Where(template => template.Key == key && template.Language == language).Take(2).ToArray();
        var issues = new List<string>();
        if (matches.Length == 0) issues.Add("Template is not configured for this language.");
        else if (matches.Length > 1) issues.Add("Duplicate template entries exist for this language.");
        else
        {
            if (!matches[0].Approved) issues.Add("Template approval flag is off.");
            if (!matches[0].ValidName) issues.Add("Template name is missing or invalid.");
            if (!Evidence(matches[0].ApprovalEvidence)) issues.Add("Template approval evidence is missing or invalid.");
        }
        return new(language, issues.Count == 0, issues);
    }

    public IReadOnlyList<string> StaffSenderIssues()
    {
        var issues = new List<string>();
        if (!StaffCaptureEnabled) issues.Add("Staff WhatsApp capture is disabled.");
        if (!StaffSendingEnabled) issues.Add("Staff WhatsApp sending is disabled.");
        if (!WebhookEnabled) issues.Add("WhatsApp webhook is disabled.");
        if (!Id(PhoneNumberId)) issues.Add("Meta phone number ID is missing or invalid.");
        if (!Id(BusinessAccountId)) issues.Add("Meta business account ID is missing or invalid.");
        if (!Secret(AppSecret)) issues.Add("Webhook app secret is missing or invalid.");
        if (!Secret(VerifyToken)) issues.Add("Webhook verify token is missing or invalid.");
        if (!SenderApproved) issues.Add("Sender approval flag is off.");
        if (!Evidence(SenderApprovalEvidence)) issues.Add("Sender approval evidence is missing or invalid.");
        if (!Regex.IsMatch(GraphApiVersion, @"\Av[0-9]{1,3}\.0\z")) issues.Add("Graph API version is missing or invalid.");
        if (!Secret(AccessToken)) issues.Add("Graph API access token is missing or invalid.");
        if (!Evidence(BudgetOwner)) issues.Add("Budget owner is missing or invalid.");
        if (DailyAttemptLimit <= 0) issues.Add("Daily attempt limit must be positive.");
        if (MonthlyBudgetSen <= 0) issues.Add("Monthly budget must be positive.");
        if (MaximumCostPerAttemptSen <= 0 || MaximumCostPerAttemptSen > MonthlyBudgetSen)
            issues.Add("Maximum cost per attempt must be positive and within the monthly budget.");
        if (!CostCeilingConfirmed) issues.Add("Cost ceiling confirmation is off.");
        return issues;
    }

    private static bool Id(string value) => Regex.IsMatch(value, @"\A[0-9]{1,32}\z");
    private static bool Secret(string value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 4096 && !value.Any(char.IsWhiteSpace);
    internal static bool Evidence(string value) => !string.IsNullOrWhiteSpace(value) && value.Length <= 160 && !value.Any(char.IsControl);
}

public sealed record WhatsAppTemplateReadiness(string Language, bool Ready, IReadOnlyList<string> Issues);

public sealed class WhatsAppApprovedTemplate
{
    public string Key { get; init; } = "";
    public string Name { get; init; } = "";
    public string Language { get; init; } = "";
    public bool Approved { get; init; }
    public string ApprovalEvidence { get; init; } = "";
    public bool ValidName => Regex.IsMatch(Name, @"\A[a-z][a-z0-9_]{0,79}\z");
    public bool Valid => Approved && Key is "enquiry_ack_v1" or "business_update_v1" or "receipt_ready_v1" or "staff_notice_v1" or "staff_invite_v1" &&
        Language is "ms" or "en_US" && ValidName &&
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
        if (item.Audience switch { "Staff" => !options.StaffSenderReady, "Enrollment" => !options.InvitationSenderReady, _ => !options.Ready }) return new("Disabled");
        var template = options.TemplateFor(item);
        if (template is null || !WhatsAppNotificationDispatcher.Supported(item) ||
            (item.Audience == "Customer" && !Guid.TryParseExact(item.BusinessReference, "D", out _)) || string.IsNullOrWhiteSpace(item.TemplateReference) ||
            item.TemplateReference.Length > (item.Audience is "Staff" or "Enrollment" ? 1024 : 80) || item.TemplateReference.Any(char.IsControl)) return new("TemplateNotApproved");
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
