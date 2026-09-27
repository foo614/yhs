using System.Net;
using System.Text.Json;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class WhatsAppTestSenderTests
{
    [Theory]
    [InlineData("ms")]
    [InlineData("en_US")]
    public async Task Business_sender_uses_approved_template_and_reference_without_private_body(string language)
    {
        using var handler = new StubHandler();
        using var sender = new WhatsAppTemplateSender(new HttpClient(handler));
        var id = Guid.NewGuid();
        var item = new YSHeng.Api.Domain.WhatsAppOutbox { EventKind = "enquiry.created", TemplateVersion = "enquiry_ack_v1",
            Language = language, BusinessReference = id.ToString("D"), TemplateReference = id.ToString("N"), Recipient = "+60123456789", Body = "PRIVATE_BODY" };
        var result = await sender.SendAsync(WhatsAppDispatchTestData.Options(language: language), item);
        Assert.Equal("Accepted", result.Outcome);
        Assert.Equal(1, handler.Calls);
        Assert.DoesNotContain("PRIVATE_BODY", handler.Body!);
        Assert.DoesNotContain("test-token", handler.Body!);
        using var payload = JsonDocument.Parse(handler.Body!);
        var template = payload.RootElement.GetProperty("template");
        Assert.Equal("approved_enquiry_v1", template.GetProperty("name").GetString());
        Assert.Equal(language, template.GetProperty("language").GetProperty("code").GetString());
        Assert.Equal(id.ToString("N"), template.GetProperty("components")[0].GetProperty("parameters")[0].GetProperty("text").GetString());
    }

    [Theory]
    [InlineData(400, "{\"error\":{\"code\":100}}", "Rejected")]
    [InlineData(429, "{\"error\":{\"code\":130429,\"message\":\"PRIVATE_ERROR\"}}", "RateLimited")]
    [InlineData(500, "{\"error\":{\"code\":1}}", "UnknownOutcome")]
    [InlineData(429, "{\"error\":{\"code\":\"bad\"}}", "UnknownOutcome")]
    [InlineData(429, "{\"messages\":[{\"id\":\"wamid.accepted\"}],\"error\":{\"code\":130429}}", "UnknownOutcome")]
    [InlineData(200, "{\"messages\":[]}", "UnknownOutcome")]
    [InlineData(200, "not json", "UnknownOutcome")]
    public async Task Business_sender_classifies_non_acceptance_and_never_retries_or_exposes_provider_errors(int status, string response, string outcome)
    {
        using var handler = new StubHandler { Status = (HttpStatusCode)status, ResponseBody = response };
        using var sender = new WhatsAppTemplateSender(new HttpClient(handler));
        var result = await sender.SendAsync(WhatsAppDispatchTestData.Options(), WhatsAppDispatchTestData.Item());
        Assert.Equal(outcome, result.Outcome);
        Assert.Null(result.MessageId);
        Assert.Equal(1, handler.Calls);
        Assert.DoesNotContain("PRIVATE_ERROR", result.ToString());
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Business_sender_transport_or_cancellation_is_unknown_without_retry(bool canceled)
    {
        using var handler = new StubHandler { Failure = canceled ? new OperationCanceledException("PRIVATE_ERROR") : new HttpRequestException("PRIVATE_ERROR") };
        using var sender = new WhatsAppTemplateSender(new HttpClient(handler));
        var result = await sender.SendAsync(WhatsAppDispatchTestData.Options(), WhatsAppDispatchTestData.Item());
        Assert.Equal("UnknownOutcome", result.Outcome);
        Assert.Equal(1, handler.Calls);
        Assert.DoesNotContain("PRIVATE_ERROR", result.ToString());
    }

    [Fact]
    public async Task Business_sender_blocks_unapproved_language_and_oversized_responses()
    {
        using var handler = new StubHandler { ResponseBody = new string('x', WhatsAppWebhookProbe.MaxBodyBytes + 1) };
        using var sender = new WhatsAppTemplateSender(new HttpClient(handler));
        var item = WhatsAppDispatchTestData.Item() with { Language = "en_US" };
        Assert.Equal("TemplateNotApproved", (await sender.SendAsync(WhatsAppDispatchTestData.Options(), item)).Outcome);
        Assert.Equal(0, handler.Calls);
        Assert.Equal("UnknownOutcome", (await sender.SendAsync(WhatsAppDispatchTestData.Options(), item with { Language = "ms" })).Outcome);
        Assert.Equal(1, handler.Calls);
    }
    [Fact]
    public async Task Inventory_reply_uses_text_contract_without_a_retry()
    {
        using var handler = new StubHandler();
        using var sender = new WhatsAppTestSender(new HttpClient(handler));
        var result = await sender.SendInventoryReplyAsync(Options(), "Public inventory: Audi Q7");
        Assert.Equal("Accepted", result.Outcome);
        Assert.Equal(1, handler.Calls);
        using var body = JsonDocument.Parse(handler.Body!);
        Assert.Equal("text", body.RootElement.GetProperty("type").GetString());
        Assert.Equal("Public inventory: Audi Q7", body.RootElement.GetProperty("text").GetProperty("body").GetString());
        Assert.False(body.RootElement.GetProperty("text").GetProperty("preview_url").GetBoolean());
    }

    [Fact]
    public async Task Oversized_inventory_reply_never_calls_provider()
    {
        using var handler = new StubHandler();
        using var sender = new WhatsAppTestSender(new HttpClient(handler));
        Assert.Equal("InvalidReply", (await sender.SendInventoryReplyAsync(Options(), new string('x', 3501))).Outcome);
        Assert.Equal(0, handler.Calls);
    }

    [Theory]
    [InlineData(false, true, "Disabled")]
    [InlineData(true, false, "ConsentRequired")]
    public async Task Disabled_or_unconfirmed_recipient_never_calls_provider(bool enabled, bool consent, string outcome)
    {
        using var handler = new StubHandler();
        using var client = new HttpClient(handler);
        var result = await new WhatsAppTestSender(client).SendHelloWorldAsync(Options(enabled, consent));
        Assert.Equal(outcome, result.Outcome);
        Assert.Equal(0, handler.Calls);
    }

    [Theory]
    [InlineData("0123456789", "12345", "v23.0", "test-token")]
    [InlineData("++60123456789", "12345", "v23.0", "test-token")]
    [InlineData("+60123456789", "../other", "v23.0", "test-token")]
    [InlineData("+60123456789", "12345", "v23.0/other", "test-token")]
    [InlineData("+60123456789", "12345", "v23.0", "")]
    public async Task Invalid_settings_never_call_provider(string recipient, string phoneId, string version, string token)
    {
        using var handler = new StubHandler();
        using var client = new HttpClient(handler);
        var result = await new WhatsAppTestSender(client).SendHelloWorldAsync(new WhatsAppTestOptions
        {
            Enabled = true, RecipientConsentConfirmed = true, TestRecipient = recipient,
            PhoneNumberId = phoneId, GraphApiVersion = version, AccessToken = token
        });
        Assert.Equal("InvalidConfiguration", result.Outcome);
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task Sends_Meta_test_template_and_returns_acceptance_not_delivery()
    {
        using var handler = new StubHandler();
        using var client = new HttpClient(handler);
        var result = await new WhatsAppTestSender(client).SendHelloWorldAsync(Options());
        Assert.Equal("Accepted", result.Outcome);
        Assert.Equal("wamid.test", result.MessageId);
        Assert.Equal(1, handler.Calls);
        Assert.Equal(HttpMethod.Post, handler.Method);
        Assert.Equal("https://graph.facebook.com/v23.0/12345/messages", handler.Url);
        Assert.Equal("Bearer test-token", handler.Authorization);
        using var body = JsonDocument.Parse(handler.Body!);
        Assert.Equal("whatsapp", body.RootElement.GetProperty("messaging_product").GetString());
        Assert.Equal("60123456789", body.RootElement.GetProperty("to").GetString());
        Assert.Equal("template", body.RootElement.GetProperty("type").GetString());
        var template = body.RootElement.GetProperty("template");
        Assert.Equal("hello_world", template.GetProperty("name").GetString());
        Assert.Equal("en_US", template.GetProperty("language").GetProperty("code").GetString());
        Assert.DoesNotContain("test-token", handler.Body!);
        Assert.DoesNotContain("test-token", Options().ToString()!);
    }

    [Theory]
    [InlineData(401)]
    [InlineData(429)]
    [InlineData(500)]
    public async Task Provider_errors_are_redacted_and_not_retried(int status)
    {
        using var handler = new StubHandler { Status = (HttpStatusCode)status, ResponseBody = "private provider details" };
        using var client = new HttpClient(handler);
        var result = await new WhatsAppTestSender(client).SendHelloWorldAsync(Options());
        Assert.Equal("ProviderRejected", result.Outcome);
        Assert.Equal(status, result.HttpStatusCode);
        Assert.Null(result.MessageId);
        Assert.DoesNotContain("private", result.ToString());
        Assert.Equal(1, handler.Calls);
    }

    [Theory]
    [InlineData("not json")]
    [InlineData("{}")]
    [InlineData("{\"messages\":[]}")]
    [InlineData("{\"messages\":[null]}")]
    public async Task Malformed_success_is_unknown_and_not_retried(string response)
    {
        using var handler = new StubHandler { ResponseBody = response };
        using var client = new HttpClient(handler);
        var result = await new WhatsAppTestSender(client).SendHelloWorldAsync(Options());
        Assert.Equal("UnknownOutcome", result.Outcome);
        Assert.Equal(1, handler.Calls);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Transport_failure_is_unknown_and_not_retried(bool timeout)
    {
        using var handler = new StubHandler { Failure = timeout ? new TaskCanceledException() : new HttpRequestException("private details") };
        using var client = new HttpClient(handler);
        var result = await new WhatsAppTestSender(client).SendHelloWorldAsync(Options());
        Assert.Equal("UnknownOutcome", result.Outcome);
        Assert.Equal(1, handler.Calls);
    }

    private static WhatsAppTestOptions Options(bool enabled = true, bool consent = true) => new()
    {
        Enabled = enabled, RecipientConsentConfirmed = consent, GraphApiVersion = "v23.0",
        PhoneNumberId = "12345", AccessToken = "test-token", TestRecipient = "+60123456789"
    };

    private sealed class StubHandler : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public string? Url { get; private set; }
        public HttpMethod? Method { get; private set; }
        public string? Authorization { get; private set; }
        public string? Body { get; private set; }
        public HttpStatusCode Status { get; init; } = HttpStatusCode.OK;
        public string ResponseBody { get; init; } = "{\"messages\":[{\"id\":\"wamid.test\"}]}";
        public Exception? Failure { get; init; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            Url = request.RequestUri!.AbsoluteUri;
            Method = request.Method;
            Authorization = request.Headers.Authorization?.ToString();
            Body = await request.Content!.ReadAsStringAsync(cancellationToken);
            if (Failure is not null) throw Failure;
            return new(Status) { Content = new StringContent(ResponseBody) };
        }
    }
}
