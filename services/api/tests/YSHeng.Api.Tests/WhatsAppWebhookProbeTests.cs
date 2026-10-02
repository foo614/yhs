using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class WhatsAppWebhookProbeTests
{
    private const string Secret = "synthetic-secret";
    private static readonly DateTimeOffset Now = DateTimeOffset.FromUnixTimeSeconds(1800000000);

    [Theory]
    [InlineData("accepted", "sent", "sent")]
    [InlineData("sent", "delivered", "delivered")]
    [InlineData("delivered", "sent", "delivered")]
    [InlineData("delivered", "failed", "delivered")]
    [InlineData("read", "delivered", "read")]
    [InlineData("read", "failed", "read")]
    [InlineData("accepted", "failed", "failed")]
    [InlineData("failed", "sent", "failed")]
    [InlineData("failed", "delivered", "delivered")]
    [InlineData("delivered", "delivered", "delivered")]
    public void Delivery_evidence_does_not_regress(string current, string incoming, string expected) =>
        Assert.Equal(expected, WhatsAppWebhookProbe.MergeStatus(current, incoming));

    [Theory]
    [InlineData("sender", "recipient", "delivered", 1)]
    [InlineData("other", "recipient", "delivered", 0)]
    [InlineData("sender", "other", "delivered", 0)]
    [InlineData("sender", "recipient", "unrecognized", 0)]
    public void Delivery_receipts_require_the_configured_sender_and_recipient(string sender, string recipient, string state, int count)
    {
        using var payload = JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            @object = "whatsapp_business_account",
            entry = new[] { new { changes = new[] { new { field = "messages", value = new
            {
                metadata = new { phone_number_id = sender },
                statuses = new[] { new { id = "wamid.synthetic", recipient_id = recipient, status = state } }
            } } } } }
        }));
        Assert.Equal(count, WhatsAppWebhookProbe.ReadStatuses(payload.RootElement, "sender", "recipient").Count);
    }

    [Fact]
    public void Stock_query_boundary_and_controls_are_enforced()
    {
        using var boundary = Payload("stock " + new string('x', 80), "sender", "recipient", 0);
        Assert.Single(WhatsAppWebhookProbe.ReadCommands(boundary.RootElement, "sender", "recipient", Now));
        using var control = Payload("stock Audi\nQ7", "sender", "recipient", 0);
        Assert.Empty(WhatsAppWebhookProbe.ReadCommands(control.RootElement, "sender", "recipient", Now));
    }

    [Theory]
    [InlineData("库存", "recipient", 0, false)]
    [InlineData("stock", "recipient", 0, true)]
    [InlineData("库存", "other", 0, false)]
    [InlineData("库存", "recipient", -301, false)]
    public void Inventory_requires_fresh_allowlisted_message(string text, string recipient, int age, bool accepted)
    {
        using var payload = Payload(text, "sender", recipient, age);
        var commands = WhatsAppWebhookProbe.ReadCommands(payload.RootElement, "sender", "recipient", Now);
        if (accepted) Assert.True(Assert.Single(commands).Inventory);
        else Assert.Empty(commands);
    }

    [Theory]
    [InlineData("stock Audi Q7", "Audi Q7")]
    [InlineData("STOCK vcc3321", "vcc3321")]
    public void Stock_search_preserves_only_the_search_term(string text, string expected)
    {
        using var payload = Payload(text, "sender", "recipient", 0);
        var command = Assert.Single(WhatsAppWebhookProbe.ReadCommands(payload.RootElement, "sender", "recipient", Now));
        Assert.True(command.Inventory);
        Assert.Equal(expected, command.Query);
    }

    [Fact]
    public void Oversized_stock_search_is_ignored()
    {
        using var payload = Payload("stock " + new string('x', 81), "sender", "recipient", 0);
        Assert.Empty(WhatsAppWebhookProbe.ReadCommands(payload.RootElement, "sender", "recipient", Now));
    }

    [Fact]
    public void Help_routes_to_the_menu_instead_of_inventory_or_notification_previews()
    {
        using var payload = Payload(" HELP ", "sender", "recipient", 0);
        var command = Assert.Single(WhatsAppWebhookProbe.ReadCommands(payload.RootElement, "sender", "recipient", Now));
        Assert.True(command.Help);
        Assert.False(command.Inventory);
        Assert.False(command.OptOut);
        Assert.Null(command.Language);
        Assert.Null(command.Template);
    }

    [Theory]
    [InlineData("audi q7", true)]
    [InlineData("vcc3321", true)]
    [InlineData("Toyota", false)]
    [InlineData("PRIVATE", false)]
    public void Inventory_filters_only_public_plate_make_and_model(string query, bool found)
    {
        using var json = JsonDocument.Parse("""[{"status":"Available","year":2020,"make":"Audi","model":"Q7","plateNumber":"VCC3321","sellingPrice":80000,"customer":"PRIVATE"}]""");
        var reply = WhatsAppPublicInventory.Format(json.RootElement, query);
        Assert.Equal(found, reply.Contains("Audi Q7"));
        if (!found) Assert.Contains("No matching", reply);
    }

    [Fact]
    public void Inventory_reply_excludes_private_fields_and_unavailable_vehicles()
    {
        using var json = JsonDocument.Parse("""[{"status":"Available","year":2020,"make":"Audi","model":"Q7","plateNumber":"TEST1","sellingPrice":80000,"purchasePrice":12345,"customer":"PRIVATE"},{"status":"Sold"}]""");
        var reply = WhatsAppPublicInventory.Format(json.RootElement);
        Assert.Contains("Audi Q7", reply);
        Assert.Contains("80,000", reply);
        Assert.DoesNotContain("12345", reply);
        Assert.DoesNotContain("PRIVATE", reply);
    }

    [Fact]
    public void Signature_checks_exact_bytes_and_rejects_tampering()
    {
        var bytes = Encoding.UTF8.GetBytes("{\"test\":true}");
        var signature = "sha256=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(Secret), bytes)).ToLowerInvariant();
        Assert.True(WhatsAppWebhookProbe.VerifySignature(bytes, signature, Secret));
        Assert.False(WhatsAppWebhookProbe.VerifySignature(Encoding.UTF8.GetBytes("{\"test\":false}"), signature, Secret));
        Assert.False(WhatsAppWebhookProbe.VerifySignature(bytes, signature, "other-secret"));
        Assert.False(WhatsAppWebhookProbe.VerifySignature(bytes, signature, ""));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("sha256=xyz")]
    [InlineData("sha256=zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")]
    public void Invalid_signatures_are_rejected(string? signature) =>
        Assert.False(WhatsAppWebhookProbe.VerifySignature([], signature, Secret));

    [Fact]
    public void Verification_token_requires_an_exact_nonempty_match()
    {
        Assert.True(WhatsAppWebhookProbe.VerifyToken("test-token", "test-token"));
        Assert.False(WhatsAppWebhookProbe.VerifyToken("test-token ", "test-token"));
        Assert.False(WhatsAppWebhookProbe.VerifyToken("", ""));
        Assert.False(WhatsAppWebhookProbe.VerifyToken(null, "test-token"));
    }

    [Theory]
    [InlineData("test", "sender", "recipient", 0, 1)]
    [InlineData("help", "sender", "recipient", 0, 1)]
    [InlineData("HELP", "sender", "recipient", 0, 1)]
    [InlineData("help", "other", "recipient", 0, 0)]
    [InlineData("help", "sender", "other", 0, 0)]
    [InlineData("help", "sender", "recipient", -301, 0)]
    [InlineData("help", "sender", "recipient", 31, 0)]
    [InlineData("测试", "sender", "recipient", 0, 0)]
    [InlineData("language ms", "sender", "recipient", 0, 1)]
    [InlineData("language en", "sender", "recipient", 0, 1)]
    [InlineData("language zh", "sender", "recipient", 0, 0)]
    [InlineData("notify receipt", "sender", "other", 0, 0)]
    [InlineData("notify enquiry", "sender", "recipient", -301, 0)]
    [InlineData("test", "other", "recipient", 0, 0)]
    [InlineData("test", "sender", "other", 0, 0)]
    [InlineData("test", "sender", "recipient", -301, 0)]
    [InlineData("test", "sender", "recipient", 31, 0)]
    [InlineData("private text", "sender", "recipient", 0, 0)]
    public void Only_fresh_allowlisted_test_commands_generate_replies(string text, string sender, string recipient, int age, int count)
    {
        using var payload = Payload(text, sender, recipient, age);
        var commands = WhatsAppWebhookProbe.ReadCommands(payload.RootElement, "sender", "recipient", Now);
        Assert.Equal(count, commands.Count);
        Assert.All(commands, command => Assert.False(command.OptOut));
    }

    [Theory]
    [InlineData("STOP")]
    [InlineData("berhenti")]
    [InlineData("退订")]
    public void Opt_out_is_honored_even_when_callback_is_delayed(string text)
    {
        using var payload = Payload(text, "sender", "recipient", -3600);
        Assert.True(Assert.Single(WhatsAppWebhookProbe.ReadCommands(payload.RootElement, "sender", "recipient", Now)).OptOut);
    }

    [Theory]
    [InlineData("null")]
    [InlineData("{}")]
    [InlineData("{\"object\":\"whatsapp_business_account\",\"entry\":[null,{}]}")]
    public void Unexpected_payload_shapes_do_not_generate_replies(string payload)
    {
        using var json = JsonDocument.Parse(payload);
        Assert.Empty(WhatsAppWebhookProbe.ReadCommands(json.RootElement, "sender", "recipient", Now));
    }

    private static JsonDocument Payload(string text, string sender, string recipient, int age) => JsonDocument.Parse(JsonSerializer.Serialize(new
    {
        @object = "whatsapp_business_account",
        entry = new[] { new { changes = new[] { new { field = "messages", value = new
        {
            metadata = new { phone_number_id = sender },
            messages = new[] { new { id = "wamid.synthetic", from = recipient, type = "text", timestamp = (Now.ToUnixTimeSeconds() + age).ToString(), text = new { body = text } } }
        } } } } }
    }));
}
