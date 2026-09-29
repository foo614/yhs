using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Npgsql;
using Xunit;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;

namespace YSHeng.Api.Tests;

[Collection("WhatsApp application startup")]
public sealed class WhatsAppPostgresTests
{
    [PostgresFact]
    public async Task Schema_is_idempotent_and_capture_serializes_with_revocation_on_postgres()
    {
        var config = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES"));
        Assert.Contains(config.Host, new[] { "127.0.0.1", "localhost" });
        Assert.Equal("whatsapp_ci", config.Database); // Never operate on an application database.
        var database = "whatsapp_check_" + Guid.NewGuid().ToString("N");
        config.Pooling = false;
        await using var admin = new NpgsqlConnection(config.ConnectionString);
        await admin.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", admin)) await create.ExecuteNonQueryAsync();
        config.Database = database;
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(config.ConnectionString).Options;
        try
        {
            await using var db = new AppDbContext(options);
            await db.Database.EnsureCreatedAsync();
            // Upgrade the earlier application schema only inside this generated disposable database.
            await db.Database.ExecuteSqlRawAsync("""
                DROP TABLE "WhatsAppStaffRequests";
                DROP TABLE "WhatsAppStaffChallenges";
                DROP TABLE "WhatsAppStaffBindings";
                """);
            await WhatsAppAssistantSchema.EnsureAsync(db);
            await WhatsAppAssistantSchema.EnsureAsync(db);
            db.Users.Add(new AppUser { Id = "assistant-ci", UserName = "assistant-ci", SecurityStamp = "synthetic-ci-stamp" });
            db.Roles.Add(new IdentityRole("Sales") { Id = "assistant-sales", NormalizedName = "SALES" });
            db.UserRoles.Add(new IdentityUserRole<string> { UserId = "assistant-ci", RoleId = "assistant-sales" });
            await db.SaveChangesAsync();
            var assistant = new WhatsAppAssistantOptions
            {
                Enabled = true, WebhookEnabled = true, TestRecipient = "60188888888", PhoneNumberId = "123", BusinessAccountId = "456",
                GraphApiVersion = "v25.0", AppSecret = new string('s', 32), VerifyToken = new string('v', 32), AccessToken = "synthetic"
            };
            var assistantNow = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            var code = await WhatsAppStaffBindings.IssueAsync(db, assistant, "assistant-ci", new(assistant.TestRecipient, "ms", true), "assistant-ci", assistantNow);
            var attempts = await Task.WhenAll(Enumerable.Range(0, 2).Select(async index =>
            {
                await using var replica = new AppDbContext(options);
                return await WhatsAppStaffBindings.VerifyAsync(replica, assistant, assistant.TestRecipient, code.Command[5..], "synthetic-link-" + index, assistantNow);
            }));
            Assert.Single(attempts, accepted => accepted);
            Assert.Single(await db.WhatsAppStaffBindings.AsNoTracking().ToListAsync());
            Assert.Single(await db.WhatsAppStaffRequests.AsNoTracking().ToListAsync());
            await WhatsAppAssistantSchema.EnsureAsync(db);
            Assert.Single(await db.WhatsAppStaffBindings.AsNoTracking().ToListAsync());
            var submittedStaff = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var finishStaff = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var staffDispatch = Task.Run(async () =>
            {
                await using var replica = new AppDbContext(options);
                return await WhatsAppStaffQueue.DispatchOneAsync(replica, assistant, async (_, _, _) =>
                {
                    submittedStaff.SetResult();
                    await finishStaff.Task.WaitAsync(TimeSpan.FromSeconds(20));
                    return new WhatsAppSendResult("Accepted", "synthetic-assistant-pg");
                }, assistantNow);
            });
            try
            {
                await submittedStaff.Task.WaitAsync(TimeSpan.FromSeconds(15));
                await using var replica = new AppDbContext(options);
                Assert.False(await WhatsAppStaffQueue.DispatchOneAsync(replica, assistant, (_, _, _) => throw new Exception("duplicate staff submission"), assistantNow));
                finishStaff.SetResult();
                Assert.True(await staffDispatch);
            }
            finally { finishStaff.TrySetResult(); await staffDispatch; }
            await VerifyFinanceQueryJoinsAsync(db, assistantNow);
            var retained = new WhatsAppConsent { Recipient = "60199999999", OptedIn = false, Evidence = "retained CI withdrawal", UpdatedAt = 1 };
            db.WhatsAppConsents.Add(retained);
            await db.SaveChangesAsync();
            // Emulate the earlier test model, then exercise the additive upgrade without discarding its rows.
            await db.Database.ExecuteSqlRawAsync("""
                ALTER TABLE "WhatsAppConsents" DROP COLUMN "Language";
                ALTER TABLE "WhatsAppOutbox" DROP COLUMN "EventKind";
                ALTER TABLE "WhatsAppOutbox" DROP COLUMN "BusinessReference";
                ALTER TABLE "WhatsAppOutbox" DROP COLUMN "TemplateReference";
                """);
            await SeedData.EnsureWhatsAppSchemaAsync(db);
            await SeedData.EnsureWhatsAppSchemaAsync(db);
            Assert.Equal(retained.Id, (await db.WhatsAppConsents.AsNoTracking().SingleAsync()).Id);
            const string recipient = "60123456789";
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            await WhatsAppOutboxStore.SetConsentAsync(db, recipient, true, "isolated CI approval", now);
            await using (var transaction = await db.Database.BeginTransactionAsync())
            {
                var lead = new Lead { Phone = recipient, CustomerName = "Synthetic CI" };
                db.Leads.Add(lead);
                await WhatsAppBusinessEvents.StageEnquiryAsync(db, lead, true);
                await db.SaveChangesAsync();
                await transaction.RollbackAsync();
            }
            db.ChangeTracker.Clear();
            Assert.Empty(await db.WhatsAppOutbox.ToListAsync());
            Assert.Empty(await db.Leads.ToListAsync());
            await using (var transaction = await db.Database.BeginTransactionAsync())
            {
                var lead = new Lead { Phone = recipient, CustomerName = "Synthetic CI" };
                db.Leads.Add(lead);
                await WhatsAppBusinessEvents.StageEnquiryAsync(db, lead, true);
                var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
                var revoke = Task.Run(async () =>
                {
                    await using var other = new AppDbContext(options);
                    started.SetResult();
                    await WhatsAppOutboxStore.SetConsentAsync(other, recipient, false, "CI withdrawal", now + 1);
                });
                await started.Task;
                await Task.Delay(150);
                Assert.False(revoke.IsCompleted);
                await db.SaveChangesAsync();
                await transaction.CommitAsync();
                await revoke.WaitAsync(TimeSpan.FromSeconds(15));
            }
            Assert.False((await db.WhatsAppConsents.AsNoTracking().SingleAsync(row => row.Recipient == recipient)).OptedIn);
            Assert.Equal("Suppressed", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
            Assert.Equal("ms", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).Language);
            // One provider request can be in flight while another replica tries to claim work.
            // A durable limit of one must prevent the second replica from submitting anything.
            await WhatsAppOutboxStore.SetConsentAsync(db, recipient, true, "isolated dispatch approval", now + 2);
            db.WhatsAppOutbox.AddRange(WhatsAppDispatchTestData.Item(), WhatsAppDispatchTestData.Item()); await db.SaveChangesAsync();
            var submitted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var first = Task.Run(async () =>
            {
                await using var replica = new AppDbContext(options);
                return await WhatsAppNotificationDispatcher.DispatchOneAsync(replica, WhatsAppDispatchTestData.Options(daily: 1), async (_, _) =>
                {
                    submitted.SetResult();
                    await finish.Task.WaitAsync(TimeSpan.FromSeconds(20));
                    return new WhatsAppSendResult("Accepted", "wamid.pg.first");
                }, 1800000000);
            });
            try
            {
                await submitted.Task.WaitAsync(TimeSpan.FromSeconds(15));
                await using var second = new AppDbContext(options);
                Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(second, WhatsAppDispatchTestData.Options(daily: 1),
                    (_, _) => throw new Exception("second replica exceeded cap"), 1800000000));
                var withdrawal = Task.Run(async () =>
                {
                    await using var revoked = new AppDbContext(options);
                    await WhatsAppOutboxStore.SetConsentAsync(revoked, recipient, false, "concurrent dispatch withdrawal", now + 3);
                });
                await Task.Delay(150);
                Assert.False(withdrawal.IsCompleted); // Consent lock defines submission before committed withdrawal.
                finish.SetResult(); await first; await withdrawal.WaitAsync(TimeSpan.FromSeconds(15));
                Assert.Single(await db.WhatsAppOutbox.Where(row => row.State == "Accepted").ToListAsync());
                Assert.Equal(2, await db.WhatsAppDispatchUsage.CountAsync(row => row.Attempts == 1 && row.ReservedCostSen == 10));
            }
            finally { finish.TrySetResult(); await first; }
            await VerifyApplicationAsync(config.ConnectionString);
        }
        finally
        {
            // The name is generated by this test and never supplied externally.
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }

    private static async Task VerifyFinanceQueryJoinsAsync(AppDbContext db, long now)
    {
        // Prevents SQLite-only coverage from missing PostgreSQL translation errors in the authoritative receivable joins.
        var customerId = Guid.NewGuid();
        var vehicle = new Vehicle { PlateNumber = "PGFIN1", Year = 2022, Make = "Synthetic", Model = "Finance", CustomerId = customerId };
        var payment = new PaymentRecord { VehicleId = vehicle.Id, CustomerId = customerId, FinanceWorkflowVersion = 2, NettPrice = 12_000m };
        db.Vehicles.Add(vehicle);
        db.PaymentRecords.Add(payment);
        db.FinanceInvoices.Add(new FinanceInvoice
        {
            PaymentRecordId = payment.Id, VehicleId = vehicle.Id, CustomerId = customerId, Amount = payment.NettPrice, InvoiceNumber = "PG-FIN-1"
        });
        db.CollectionTransactions.AddRange(
            new CollectionTransaction { PaymentRecordId = payment.Id, Amount = 5_000m, Status = CollectionStatus.Reconciled },
            new CollectionTransaction { PaymentRecordId = payment.Id, Amount = 1_000m, Status = CollectionStatus.Pending });
        await db.SaveChangesAsync();

        var reply = await WhatsAppStaffFinanceQueries.ReplyAsync(db, new("collections", "PGFIN1"), ["Finance"], "en_US", now);
        Assert.Contains("Reconciled: RM 5,000.00", reply);
        Assert.Contains("Outstanding: RM 7,000.00", reply);
        Assert.Contains("Pending collections: RM 1,000.00 (not deducted)", reply);
    }

    private static async Task VerifyApplicationAsync(string connectionString)
    {
        var configuration = new Dictionary<string, string>
        {
            ["ConnectionStrings__Default"] = connectionString, ["SeedData__Enabled"] = "true",
            ["SeedAdmin__Email"] = "admin@example.test", ["SeedAdmin__Password"] = "Synthetic-CI-123!",
            ["Worker__Enabled"] = "false", ["WhatsApp__CaptureEnabled"] = "false", ["WhatsApp__SendingEnabled"] = "false", ["WhatsApp__WebhookEnabled"] = "false",
            ["WhatsAppAssistant__Enabled"] = "true", ["WhatsAppAssistant__WebhookEnabled"] = "true", ["WhatsAppAssistant__TestMode"] = "true",
            ["WhatsAppAssistant__PhoneNumberId"] = "123", ["WhatsAppAssistant__BusinessAccountId"] = "456", ["WhatsAppAssistant__TestRecipient"] = "60177777777",
            ["WhatsAppAssistant__GraphApiVersion"] = "v25.0", ["WhatsAppAssistant__AccessToken"] = "synthetic-token",
            ["WhatsAppAssistant__AppSecret"] = new string('s', 32), ["WhatsAppAssistant__VerifyToken"] = new string('v', 32)
        };
        var previous = configuration.Keys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
        try
        {
            foreach (var value in configuration) Environment.SetEnvironmentVariable(value.Key, value.Value);
            var submitted = new ConcurrentQueue<string>();
            await using var factory = new StaffApplicationFactory(submitted);
            using var anonymous = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/whatsapp/assistant/connection")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/whatsapp/assistant/connection", new { recipient = "60177777777", language = "en_US", consentConfirmed = true })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/whatsapp/assistant/disconnect", new { })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync("/api/whatsapp/assistant/webhook", new StringContent("{}"))).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await anonymous.PostAsync("/api/whatsapp/webhook", new StringContent("{}"))).StatusCode);
            using var admin = factory.CreateClient();
            Assert.True((await admin.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "admin@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
            var created = await admin.PostAsJsonAsync("/api/admin/users", new { email = "sales@example.test", displayName = "Synthetic Sales", password = "Synthetic-CI-123!", role = "Sales" });
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            using var staff = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
            var staffId = staff.RootElement.GetProperty("id").GetString()!;
            var issued = await admin.PostAsJsonAsync("/api/whatsapp/assistant/connection", new { recipient = "60177777777", language = "en_US", consentConfirmed = true, staffUserId = staffId });
            Assert.Equal(HttpStatusCode.OK, issued.StatusCode);
            Assert.Contains("no-store", issued.Headers.CacheControl!.ToString());
            var command = (await issued.Content.ReadFromJsonAsync<WhatsAppStaffLinkResult>())!.Command;
            using var sales = factory.CreateClient();
            Assert.True((await sales.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "sales@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await sales.GetAsync("/api/whatsapp/assistant/connection?staffUserId=assistant-ci")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await sales.PostAsJsonAsync("/api/whatsapp/assistant/connection", new { recipient = "60177777777", language = "en_US", consentConfirmed = true, staffUserId = "assistant-ci" })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await sales.PostAsJsonAsync("/api/whatsapp/assistant/disconnect", new { staffUserId = "assistant-ci" })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await sales.GetAsync("/api/loans")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await sales.GetAsync("/api/deliveries")).StatusCode);
            async Task Callback(string text, string id)
            {
                var payload = JsonSerializer.SerializeToUtf8Bytes(new
                {
                    @object = "whatsapp_business_account",
                    entry = new[] { new
                    {
                        id = "456", changes = new[] { new
                        {
                            field = "messages", value = new
                            {
                                metadata = new { phone_number_id = "123" },
                                messages = new[] { new { id, from = "60177777777", type = "text", timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(), text = new { body = text } } }
                            }
                        } }
                    } }
                });
                using var request = new HttpRequestMessage(HttpMethod.Post, "/api/whatsapp/assistant/webhook") { Content = new ByteArrayContent(payload) };
                request.Headers.Add("X-Hub-Signature-256", "sha256=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(new string('s', 32)), payload)).ToLowerInvariant());
                Assert.Equal(HttpStatusCode.OK, (await anonymous.SendAsync(request)).StatusCode);
            }
            await Callback(command, "synthetic-startup-link");
            var status = (await sales.GetFromJsonAsync<WhatsAppStaffConnection>("/api/whatsapp/assistant/connection"))!;
            Assert.Equal("Connected", status.State);
            Assert.Equal("***7777", status.MaskedNumber);
            await Callback("help", "synthetic-startup-query");
            for (var attempt = 0; attempt < 100 && !submitted.Any(reply => reply.Contains("YS Heng staff commands")); attempt++) await Task.Delay(100);
            Assert.Contains(submitted, reply => reply.Contains("YS Heng staff commands"));
            Assert.True((await sales.PostAsJsonAsync("/api/whatsapp/assistant/disconnect", new { })).IsSuccessStatusCode);
            Assert.Equal("Disconnected", (await sales.GetFromJsonAsync<WhatsAppStaffConnection>("/api/whatsapp/assistant/connection"))!.State);
        }
        finally { foreach (var value in previous) Environment.SetEnvironmentVariable(value.Key, value.Value); }
    }

    private sealed class StaffApplicationFactory(ConcurrentQueue<string> submitted) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing"); // Never loads a developer's user-secrets.
            builder.ConfigureLogging(logging => logging.ClearProviders());
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<WhatsAppStaffSender>();
                services.AddSingleton(new WhatsAppStaffSender(new HttpClient(new SyntheticTransport(submitted))));
            });
        }
    }

    private sealed class SyntheticTransport(ConcurrentQueue<string> submitted) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
            Assert.Equal("60177777777", json.RootElement.GetProperty("to").GetString());
            submitted.Enqueue(json.RootElement.GetProperty("text").GetProperty("body").GetString()!);
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { messages = new[] { new { id = "synthetic-" + Guid.NewGuid() } } }) };
        }
    }

    private sealed class PostgresFactAttribute : FactAttribute
    {
        public PostgresFactAttribute()
        {
            if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES")))
                Skip = "Requires the isolated PostgreSQL CI service; never uses an application database.";
        }
    }
}

[CollectionDefinition("WhatsApp application startup", DisableParallelization = true)]
public sealed class WhatsAppApplicationStartupCollection;
