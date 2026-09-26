using System.Net;
using System.Text.Json;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class WhatsAppTestSenderTests
{
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
