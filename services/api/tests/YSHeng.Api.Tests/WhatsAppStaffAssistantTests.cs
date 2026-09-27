using System.Security.Cryptography;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Xunit;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;

namespace YSHeng.Api.Tests;

public sealed class WhatsAppStaffAssistantTests
{
    [Fact]
    public async Task One_time_link_requires_the_intended_phone_and_replay_does_not_duplicate_binding_or_reply()
    {
        await using var fixture = await Fixture.Create();
        var issued = await fixture.Issue();
        var code = issued.Command[5..];
        Assert.False(await WhatsAppStaffBindings.VerifyAsync(fixture.Db, fixture.Options, "60188888888", code, "wrong-phone", fixture.Now));
        Assert.Equal(0, (await fixture.Db.WhatsAppStaffChallenges.SingleAsync()).FailedAttempts);
        Assert.True(await fixture.Verify(issued));
        Assert.True(await fixture.Verify(issued));
        Assert.Single(await fixture.Db.WhatsAppStaffBindings.ToListAsync());
        Assert.Single(await fixture.Db.WhatsAppStaffRequests.ToListAsync());
        Assert.DoesNotContain(code, JsonSerializer.Serialize(await fixture.Db.WhatsAppStaffChallenges.SingleAsync()));
        Assert.Equal("Connected", (await WhatsAppStaffBindings.StatusAsync(fixture.Db, fixture.Options, "staff", fixture.Now)).State);
    }

    [Fact]
    public async Task Link_expiry_failure_limit_and_issuance_cooldown_are_enforced()
    {
        await using var fixture = await Fixture.Create();
        var issued = await fixture.Issue();
        await Assert.ThrowsAsync<ArgumentException>(() => fixture.Issue());
        Assert.False(await fixture.Verify(issued, now: fixture.Now + 600));
        for (var attempt = 0; attempt < 5; attempt++)
            Assert.False(await WhatsAppStaffBindings.VerifyAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new string('F', 32), "invalid-" + attempt, fixture.Now));
        Assert.False(await fixture.Verify(issued));
        Assert.Empty(await fixture.Db.WhatsAppStaffBindings.ToListAsync());
        Assert.Equal(5, (await fixture.Db.WhatsAppStaffChallenges.SingleAsync()).FailedAttempts);
    }

    [Fact]
    public async Task An_occupied_number_is_not_transferred_and_revocation_preserves_history()
    {
        await using var fixture = await Fixture.Create();
        await fixture.AddStaff("second", "Sales");
        var first = await fixture.Issue();
        var second = await fixture.Issue("second");
        Assert.True(await fixture.Verify(first));
        Assert.False(await fixture.Verify(second, "second-event"));
        Assert.Equal("staff", (await fixture.Db.WhatsAppStaffBindings.SingleAsync()).StaffUserId);
        await WhatsAppStaffBindings.RevokeAsync(fixture.Db, "staff", "staff", fixture.Now + 1);
        Assert.True(await fixture.Verify(second, "second-event", fixture.Now + 2));
        var bindings = await fixture.Db.WhatsAppStaffBindings.ToListAsync();
        Assert.Equal(2, bindings.Count);
        Assert.Single(bindings, item => item.RevokedAt == null && item.StaffUserId == "second");
        Assert.Single(bindings, item => item.RevokedAt != null && item.StaffUserId == "staff");
    }

    [Theory]
    [InlineData("lockout")]
    [InlineData("stamp")]
    [InlineData("roles")]
    [InlineData("revoke")]
    public async Task Current_identity_changes_suppress_queued_answers(string change)
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        if (change == "revoke") await WhatsAppStaffBindings.RevokeAsync(fixture.Db, "staff", "staff", fixture.Now);
        else
        {
            var user = await fixture.Db.Users.SingleAsync();
            if (change == "lockout") user.LockoutEnd = DateTimeOffset.MaxValue;
            if (change == "stamp") user.SecurityStamp = "changed-synthetic-stamp";
            if (change == "roles") fixture.Db.UserRoles.RemoveRange(await fixture.Db.UserRoles.ToListAsync());
            await fixture.Db.SaveChangesAsync();
        }
        var sends = 0;
        await WhatsAppStaffQueue.DispatchOneAsync(fixture.Db, fixture.Options, (_, _, _) =>
        { sends++; return Task.FromResult(new WhatsAppSendResult("Accepted", "synthetic")); }, fixture.Now);
        Assert.Equal(0, sends);
        Assert.Equal("Suppressed", (await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync()).State);
    }

    [Fact]
    public async Task Signed_stop_takes_precedence_and_does_not_change_customer_notification_consent()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        fixture.Db.WhatsAppConsents.Add(new WhatsAppConsent { Recipient = fixture.Options.TestRecipient, OptedIn = true, Evidence = "synthetic customer opt-in" });
        await fixture.Db.SaveChangesAsync();
        await fixture.Db.WhatsAppStaffBindings.ExecuteUpdateAsync(set => set.SetProperty(item => item.VerifiedAt, fixture.Now - 4000));
        using var payload = fixture.Payload(("help", fixture.Now), ("stop", fixture.Now - 3600), ("language en", fixture.Now));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, payload.RootElement, fixture.Now));
        Assert.NotNull((await fixture.Db.WhatsAppStaffBindings.AsNoTracking().SingleAsync()).RevokedAt);
        Assert.Equal("Suppressed", (await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync()).State);
        Assert.True((await fixture.Db.WhatsAppConsents.SingleAsync()).OptedIn);
    }

    [Fact]
    public async Task Duplicate_events_send_once_and_ambiguous_outcomes_are_not_replayed()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        await fixture.DispatchAccepted();
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("test"), "same-event", fixture.Now));
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("test"), "same-event", fixture.Now));
        var sends = 0;
        await WhatsAppStaffQueue.DispatchOneAsync(fixture.Db, fixture.Options, (_, _, _) =>
        { sends++; return Task.FromResult(new WhatsAppSendResult("UnknownOutcome")); }, fixture.Now);
        Assert.False(await WhatsAppStaffQueue.DispatchOneAsync(fixture.Db, fixture.Options, (_, _, _) =>
        { sends++; return Task.FromResult(new WhatsAppSendResult("Accepted", "unexpected")); }, fixture.Now));
        Assert.Equal(1, sends);
        Assert.Single(await fixture.Db.WhatsAppStaffRequests.Where(item => item.State == "UnknownOutcome").ToListAsync());
    }

    [Fact]
    public async Task Sales_reads_minimal_loan_delivery_and_vehicle_summaries_without_customer_or_financial_fields()
    {
        await using var fixture = await Fixture.Create();
        var vehicle = new Vehicle { PlateNumber = "TEST123", Year = 2021, Make = "Toyota", Model = "Vios", PurchasePrice = 777777, Status = VehicleStatus.LoanProcessing };
        fixture.Db.Vehicles.Add(vehicle);
        fixture.Db.LoanApplications.Add(new LoanApplication { VehicleId = vehicle.Id, Status = LoanStatus.Rejected, RejectionReason = "PRIVATE-REJECTION", CustomerId = Guid.NewGuid() });
        fixture.Db.DeliverySchedules.Add(new DeliverySchedule { VehicleId = vehicle.Id, Status = DeliveryStatus.Scheduled, ScheduledDate = new DateOnly(2026, 10, 2), DeliveryAddress = "PRIVATE-ADDRESS", InsurancePolicyReference = "PRIVATE-POLICY" });
        await fixture.Db.SaveChangesAsync();
        foreach (var command in new[] { "vehicle test123", "loan TEST-123", "delivery TEST123" })
        {
            var intent = Assert.IsType<WhatsAppStaffIntent>(WhatsAppStaffQueries.Parse(command));
            Assert.True(WhatsAppStaffQueries.Permitted(intent, ["Sales"]));
            var reply = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, intent, "en_US", fixture.Now);
            Assert.Contains("TEST123", reply);
            Assert.DoesNotContain("PRIVATE", reply);
            Assert.DoesNotContain("777777", reply);
        }
        Assert.False(WhatsAppStaffQueries.Permitted(new("collections", "TEST123"), ["Sales"]));
        Assert.False(WhatsAppStaffQueries.Permitted(new("settlement", "TEST123"), ["Loan"]));
        Assert.False(WhatsAppStaffQueries.Permitted(new("profit", "month"), ["Finance"]));
        Assert.True(WhatsAppStaffQueries.Permitted(new("collections", "TEST123"), ["Finance"]));
        Assert.True(WhatsAppStaffQueries.Permitted(new("profit", "month"), ["BossAdmin"]));
    }

    [Fact]
    public void Delivery_dates_distinguish_planned_cancelled_and_actual_release()
    {
        var date = new DateOnly(2026, 10, 2);
        Assert.Contains("Planned date", WhatsAppStaffQueries.FormatDelivery([new(date, null, DeliveryStatus.BookingInspection, null)], "en_US"));
        Assert.Contains("Time not set", WhatsAppStaffQueries.FormatDelivery([new(date, null, DeliveryStatus.Scheduled, null)], "en_US"));
        Assert.Contains("Previous plan cancelled", WhatsAppStaffQueries.FormatDelivery([new(date, null, DeliveryStatus.Cancelled, null)], "en_US"));
        var missing = WhatsAppStaffQueries.FormatDelivery([new(date, null, DeliveryStatus.Released, null)], "en_US");
        Assert.Contains("not recorded", missing);
        Assert.DoesNotContain("02 Oct", missing);
        var actual = WhatsAppStaffQueries.FormatDelivery([new(date, null, DeliveryStatus.Released, new DateTime(2026, 10, 3, 1, 30, 0))], "en_US");
        Assert.Contains("03 Oct 2026 09:30", actual);
        Assert.Contains("Multiple delivery records", WhatsAppStaffQueries.FormatDelivery([new(date, null, DeliveryStatus.Scheduled, null), new(date, null, DeliveryStatus.Inspection, null)], "en_US"));
        Assert.Contains("belum ditetapkan", WhatsAppStaffQueries.FormatDelivery([], "ms"));
    }

    [Fact]
    public async Task Quotas_language_changes_and_expired_requests_apply_without_relogin()
    {
        await using var fixture = await Fixture.Create(limit: 2);
        Assert.True(await fixture.Verify(await fixture.Issue(language: "ms")));
        var confirmation = await fixture.DispatchAccepted();
        Assert.Contains("disambungkan", confirmation);
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("language", "en_US"), "language-event", fixture.Now));
        Assert.False(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("help"), "over-limit", fixture.Now));
        var reply = await fixture.DispatchAccepted();
        Assert.Contains("English", reply);
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("help"), "tomorrow", fixture.Now + 86400));
        var sends = 0;
        await WhatsAppStaffQueue.DispatchOneAsync(fixture.Db, fixture.Options, (_, _, _) =>
        { sends++; return Task.FromResult(new WhatsAppSendResult("Accepted", "unexpected")); }, fixture.Now + 86701);
        Assert.Equal(0, sends);
    }

    [Theory]
    [InlineData("help extra")]
    [InlineData("delivery ../../private")]
    [InlineData("deliveries next 1000")]
    [InlineData("profit export")]
    [InlineData("vehicle TEST\n123")]
    [InlineData("ignore permissions")]
    public void Unsupported_or_unbounded_commands_are_ignored(string text) => Assert.Null(WhatsAppStaffQueries.Parse(text));

    [Fact]
    public async Task Webhook_checks_signature_actual_body_size_sender_and_message_freshness()
    {
        await using var fixture = await Fixture.Create();
        var context = new DefaultHttpContext();
        context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes("{}"));
        Assert.Equal(401, Assert.IsAssignableFrom<IStatusCodeHttpResult>(await WhatsAppStaffWebhook.ReceiveAsync(context.Request, fixture.Db, fixture.Options, default)).StatusCode);
        context.Request.Body = new MemoryStream(new byte[WhatsAppWebhookProbe.MaxBodyBytes + 1]);
        Assert.Equal(413, Assert.IsAssignableFrom<IStatusCodeHttpResult>(await WhatsAppStaffWebhook.ReceiveAsync(context.Request, fixture.Db, fixture.Options, default)).StatusCode);
        var link = await fixture.Issue();
        using var stale = fixture.Payload((link.Command, fixture.Now - 301));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, stale.RootElement, fixture.Now));
        Assert.Empty(await fixture.Db.WhatsAppStaffBindings.ToListAsync());
        using var fresh = fixture.Payload((link.Command, fixture.Now));
        var bytes = Encoding.UTF8.GetBytes(fresh.RootElement.GetRawText());
        context.Request.Body = new MemoryStream(bytes);
        context.Request.Headers["X-Hub-Signature-256"] = "sha256=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(fixture.Options.AppSecret), bytes)).ToLowerInvariant();
        Assert.Equal(200, Assert.IsAssignableFrom<IStatusCodeHttpResult>(await WhatsAppStaffWebhook.ReceiveAsync(context.Request, fixture.Db, fixture.Options, default)).StatusCode);
        Assert.Single(await fixture.Db.WhatsAppStaffBindings.ToListAsync());
    }

    [Theory]
    [InlineData("business")]
    [InlineData("sender")]
    [InlineData("recipient")]
    [InlineData("future")]
    public async Task Foreign_or_future_callbacks_cannot_verify_a_staff_connection(string change)
    {
        await using var fixture = await Fixture.Create();
        var link = await fixture.Issue();
        using var payload = fixture.Payload((link.Command, change == "future" ? fixture.Now + 31 : fixture.Now));
        var text = payload.RootElement.GetRawText();
        if (change == "business") text = text.Replace("\"456\"", "\"999\"");
        if (change == "sender") text = text.Replace("\"123\"", "\"999\"");
        if (change == "recipient") text = text.Replace(fixture.Options.TestRecipient, "60188888888");
        using var changed = JsonDocument.Parse(text);
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, changed.RootElement, fixture.Now));
        Assert.Empty(await fixture.Db.WhatsAppStaffBindings.ToListAsync());
        Assert.Equal(0, (await fixture.Db.WhatsAppStaffChallenges.SingleAsync()).FailedAttempts);
    }

    [Fact]
    public async Task Portal_management_checks_current_database_roles_and_masks_the_phone()
    {
        await using var fixture = await Fixture.Create();
        await fixture.AddStaff("other", "Sales");
        var context = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "staff"), new Claim(ClaimTypes.Role, "BossAdmin")], "synthetic"))
        };
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.ForbidHttpResult>(await WhatsAppStaffApi.StatusAsync(context, fixture.Db, fixture.Options, "other", default));
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.ForbidHttpResult>(await WhatsAppStaffApi.ConnectAsync(context, fixture.Db, fixture.Options, new(fixture.Options.TestRecipient, "ms", true, "other"), default));
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.ForbidHttpResult>(await WhatsAppStaffApi.DisconnectAsync(context, fixture.Db, fixture.Options, new("other"), default));
        var self = await WhatsAppStaffApi.ConnectAsync(context, fixture.Db, fixture.Options, new(fixture.Options.TestRecipient, "ms", true), default);
        var code = Assert.IsType<WhatsAppStaffLinkResult>(Assert.IsAssignableFrom<IValueHttpResult>(self).Value);
        Assert.Equal("no-store", context.Response.Headers.CacheControl);
        Assert.True(await fixture.Verify(code));
        var state = Assert.IsType<WhatsAppStaffConnection>(Assert.IsAssignableFrom<IValueHttpResult>(await WhatsAppStaffApi.StatusAsync(context, fixture.Db, fixture.Options, null, default)).Value);
        Assert.Equal("***9999", state.MaskedNumber);
        Assert.Equal("Connected", state.State);
        await WhatsAppStaffApi.DisconnectAsync(context, fixture.Db, fixture.Options, new(), default);
        Assert.NotNull((await fixture.Db.WhatsAppStaffBindings.SingleAsync()).RevokedAt);
    }

    [Fact]
    public async Task Upcoming_deliveries_use_the_Malaysia_date_and_exclude_preliminary_or_terminal_records()
    {
        await using var fixture = await Fixture.Create();
        var today = BusinessClock.SingaporeDate(DateTimeOffset.FromUnixTimeSeconds(fixture.Now));
        for (var i = 0; i < 9; i++)
        {
            var vehicle = new Vehicle { PlateNumber = "SYN" + i, Year = 2020, Make = "Synthetic", Model = "Car" };
            fixture.Db.Vehicles.Add(vehicle);
            fixture.Db.DeliverySchedules.Add(new DeliverySchedule { VehicleId = vehicle.Id, ScheduledDate = today.AddDays(i < 6 ? 0 : 6), ScheduledTime = new TimeOnly(9, i), Status = i < 6 ? DeliveryStatus.Scheduled : i == 6 ? DeliveryStatus.Cancelled : i == 7 ? DeliveryStatus.Released : DeliveryStatus.BookingInspection });
        }
        var outside = new Vehicle { PlateNumber = "OUTSIDE", Year = 2020, Make = "Synthetic", Model = "Car" };
        fixture.Db.Vehicles.Add(outside);
        fixture.Db.DeliverySchedules.Add(new DeliverySchedule { VehicleId = outside.Id, ScheduledDate = today.AddDays(7), Status = DeliveryStatus.Scheduled });
        await fixture.Db.SaveChangesAsync();
        var reply = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, WhatsAppStaffQueries.Parse("deliveries next7")!, "ms", fixture.Now);
        Assert.Contains("5 daripada 6", reply);
        Assert.Contains("Dijadualkan", reply);
        foreach (var excluded in new[] { "SYN5", "SYN6", "SYN7", "SYN8", "OUTSIDE" }) Assert.DoesNotContain(excluded, reply);
    }

    [Fact]
    public async Task Signed_statuses_require_recipient_correlation_and_never_regress_read_state()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        await fixture.DispatchAccepted();
        var request = await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync();
        async Task Status(string recipient, string state)
        {
            using var json = JsonDocument.Parse(JsonSerializer.Serialize(new
            {
                @object = "whatsapp_business_account", entry = new[] { new { id = fixture.Options.BusinessAccountId, changes = new[] { new { field = "messages", value = new
                {
                    metadata = new { phone_number_id = fixture.Options.PhoneNumberId }, statuses = new[] { new { id = request.ProviderMessageId, recipient_id = recipient, status = state } }
                } } } } }
            }));
            Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, json.RootElement, fixture.Now));
        }
        await Status("60188888888", "read");
        Assert.Equal("Accepted", (await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync()).State);
        await Status(fixture.Options.TestRecipient, "read");
        await Status(fixture.Options.TestRecipient, "delivered");
        await Status(fixture.Options.TestRecipient, "failed");
        Assert.Equal("Read", (await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync()).State);
    }

    [Fact]
    public async Task Stop_after_the_query_batch_limit_still_revokes_the_connection()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        using var payload = fixture.Payload(Enumerable.Repeat(("help", fixture.Now), 20).Append(("stop", fixture.Now)).ToArray());
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, payload.RootElement, fixture.Now));
        Assert.NotNull((await fixture.Db.WhatsAppStaffBindings.SingleAsync()).RevokedAt);
        Assert.All(await fixture.Db.WhatsAppStaffRequests.AsNoTracking().ToListAsync(), request => Assert.Equal("Suppressed", request.State));
    }

    [Fact]
    public async Task Replayed_old_stop_does_not_withdraw_a_new_connection()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        using var payload = fixture.Payload(("stop", fixture.Now - 4000), ("help", fixture.Now));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, payload.RootElement, fixture.Now));
        Assert.Null((await fixture.Db.WhatsAppStaffBindings.AsNoTracking().SingleAsync()).RevokedAt);
        Assert.Contains(await fixture.Db.WhatsAppStaffRequests.AsNoTracking().ToListAsync(), request => request.Intent == "help");
    }

    [Fact]
    public async Task Stop_wins_when_Meta_cannot_distinguish_same_second_link_order()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        using var payload = fixture.Payload(("stop", fixture.Now));
        await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, payload.RootElement, fixture.Now);
        Assert.NotNull((await fixture.Db.WhatsAppStaffBindings.AsNoTracking().SingleAsync()).RevokedAt);
    }

    [Fact]
    public async Task Disabled_assistant_does_not_require_its_schema_or_read_unsigned_bodies()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite("Data Source=:memory:").Options);
        var disabled = new WhatsAppAssistantOptions();
        Assert.Equal("Disabled", (await WhatsAppStaffBindings.StatusAsync(db, disabled, "staff", 1)).State);
        Assert.False(await WhatsAppStaffQueue.EnqueueAsync(db, disabled, "60199999999", new("help"), "disabled", 1));
        Assert.False(await WhatsAppStaffQueue.DispatchOneAsync(db, disabled, (_, _, _) => throw new Exception("disabled assistant attempted a send"), 1));
        Assert.Equal(404, Assert.IsAssignableFrom<IStatusCodeHttpResult>(await WhatsAppStaffWebhook.ReceiveAsync(new DefaultHttpContext().Request, db, disabled, default)).StatusCode);
    }

    [Theory]
    [InlineData("AppSecret")]
    [InlineData("VerifyToken")]
    public void Whitespace_only_credentials_keep_the_assistant_disabled(string key)
    {
        var values = new Dictionary<string, string?>
        {
            ["WhatsAppAssistant:Enabled"] = "true", ["WhatsAppAssistant:WebhookEnabled"] = "true",
            ["WhatsAppAssistant:TestRecipient"] = "60199999999", ["WhatsAppAssistant:PhoneNumberId"] = "123",
            ["WhatsAppAssistant:BusinessAccountId"] = "456", ["WhatsAppAssistant:GraphApiVersion"] = "v25.0",
            ["WhatsAppAssistant:AccessToken"] = "synthetic-token", ["WhatsAppAssistant:AppSecret"] = new('s', 32),
            ["WhatsAppAssistant:VerifyToken"] = new('v', 32)
        };
        Assert.True(WhatsAppAssistantOptions.Load(new ConfigurationBuilder().AddInMemoryCollection(values).Build()).Ready);
        values["WhatsAppAssistant:" + key] = new(' ', 32);
        Assert.False(WhatsAppAssistantOptions.Load(new ConfigurationBuilder().AddInMemoryCollection(values).Build()).Ready);
    }

    [Theory]
    [InlineData(200, "{\"messages\":[{\"id\":\"synthetic-provider-id\"}]}", "Accepted")]
    [InlineData(200, "not-json", "UnknownOutcome")]
    [InlineData(429, "{\"error\":\"synthetic\"}", "ProviderRejected")]
    [InlineData(302, "", "ProviderRejected")]
    public async Task Sender_submits_once_and_distinguishes_accepted_from_ambiguous_results(int status, string body, string outcome)
    {
        await using var fixture = await Fixture.Create();
        var handler = new SyntheticHandler(request =>
        {
            Assert.Equal("graph.facebook.com", request.RequestUri!.Host);
            Assert.Equal("/v25.0/123/messages", request.RequestUri.AbsolutePath);
            Assert.Equal("synthetic-token", request.Headers.Authorization!.Parameter);
            return new HttpResponseMessage((System.Net.HttpStatusCode)status) { Content = new StringContent(body) };
        });
        using var sender = new WhatsAppStaffSender(new HttpClient(handler));
        Assert.Equal(outcome, (await sender.SendAsync(fixture.Options, fixture.Options.TestRecipient, "Synthetic answer", default)).Outcome);
        Assert.Equal(1, handler.Calls);
        Assert.Equal("Disabled", (await sender.SendAsync(fixture.Options, "60188888888", "Synthetic answer", default)).Outcome);
        Assert.Equal("InvalidReply", (await sender.SendAsync(fixture.Options, fixture.Options.TestRecipient, new string('A', 3501), default)).Outcome);
        Assert.Equal(1, handler.Calls);
    }

    private sealed class SyntheticHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public int Calls { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(respond(request));
        }
    }

    private sealed class Fixture(SqliteConnection connection, AppDbContext db, WhatsAppAssistantOptions options) : IAsyncDisposable
    {
        public AppDbContext Db { get; } = db;
        public WhatsAppAssistantOptions Options { get; } = options;
        public long Now { get; } = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        public static async Task<Fixture> Create(int limit = 100)
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
            await db.Database.EnsureCreatedAsync();
            var fixture = new Fixture(connection, db, new WhatsAppAssistantOptions
            {
                Enabled = true, WebhookEnabled = true, TestRecipient = "60199999999", PhoneNumberId = "123", BusinessAccountId = "456",
                GraphApiVersion = "v25.0", AppSecret = new string('s', 32), VerifyToken = new string('v', 32), AccessToken = "synthetic-token",
                PerStaffDailyLimit = limit
            });
            await fixture.AddStaff("staff", "Sales");
            return fixture;
        }
        public async Task AddStaff(string id, string role)
        {
            var existing = await Db.Roles.SingleOrDefaultAsync(item => item.Name == role);
            existing ??= new IdentityRole(role) { Id = role, NormalizedName = role.ToUpperInvariant() };
            if (Db.Entry(existing).State == EntityState.Detached) Db.Roles.Add(existing);
            Db.Users.Add(new AppUser { Id = id, UserName = id, SecurityStamp = "synthetic-stamp-" + id });
            Db.UserRoles.Add(new IdentityUserRole<string> { UserId = id, RoleId = existing.Id });
            await Db.SaveChangesAsync();
        }
        public Task<WhatsAppStaffLinkResult> Issue(string user = "staff", string language = "en_US") =>
            WhatsAppStaffBindings.IssueAsync(Db, Options, user, new(Options.TestRecipient, language, true), "synthetic-actor", Now);
        public Task<bool> Verify(WhatsAppStaffLinkResult issued, string key = "link-event", long? now = null) =>
            WhatsAppStaffBindings.VerifyAsync(Db, Options, Options.TestRecipient, issued.Command[5..], key, now ?? Now);
        public async Task<string> DispatchAccepted()
        {
            var reply = "";
            await WhatsAppStaffQueue.DispatchOneAsync(Db, Options, (_, body, _) =>
            { reply = body; return Task.FromResult(new WhatsAppSendResult("Accepted", "synthetic-" + Guid.NewGuid())); }, Now);
            return reply;
        }
        public JsonDocument Payload(params (string Text, long Timestamp)[] messages) => JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            @object = "whatsapp_business_account",
            entry = new[] { new { id = Options.BusinessAccountId, changes = new[] { new { field = "messages", value = new
            {
                metadata = new { phone_number_id = Options.PhoneNumberId },
                messages = messages.Select((message, index) => new { id = "synthetic-" + index, from = Options.TestRecipient, type = "text", timestamp = message.Timestamp.ToString(), text = new { body = message.Text } }).ToArray()
            } } } } }
        }));
        public async ValueTask DisposeAsync() { await Db.DisposeAsync(); await connection.DisposeAsync(); }
    }
}
