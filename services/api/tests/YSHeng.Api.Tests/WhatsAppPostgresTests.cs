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
    public async Task Delivery_workboard_columns_are_additive_defaulted_and_idempotent_on_postgres()
    {
        var config = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES"));
        Assert.Contains(config.Host, new[] { "127.0.0.1", "localhost" });
        Assert.Equal("whatsapp_ci", config.Database);
        var database = "delivery_schema_check_" + Guid.NewGuid().ToString("N");
        config.Pooling = false;
        await using var admin = new NpgsqlConnection(config.ConnectionString);
        await admin.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", admin)) await create.ExecuteNonQueryAsync();
        config.Database = database;
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(config.ConnectionString).Options;
        try
        {
            await using (var db = new AppDbContext(options))
            {
                await db.Database.EnsureCreatedAsync();
                var vehicle = new Vehicle { PlateNumber = "PGDEL1", Make = "Synthetic", Model = "Delivery", Year = 2026 };
                db.Vehicles.Add(vehicle);
                db.DeliverySchedules.Add(new DeliverySchedule { VehicleId = vehicle.Id, Pic = "Legacy Delivery", ScheduledDate = new DateOnly(2026, 11, 17) });
                await db.SaveChangesAsync();
                await db.Database.ExecuteSqlRawAsync("""
                    ALTER TABLE "DeliverySchedules" DROP COLUMN IF EXISTS "InsuranceCompany";
                    ALTER TABLE "DeliverySchedules" DROP COLUMN IF EXISTS "InsurancePrice";
                    ALTER TABLE "DeliverySchedules" DROP COLUMN IF EXISTS "InsuranceSumInsured";
                    ALTER TABLE "DeliverySchedules" DROP COLUMN IF EXISTS "RoadTaxPaidViaEAuto";
                    """);
                await SeedData.EnsureFinanceRepairEnhancementSchemaAsync(db);
                await SeedData.EnsureFinanceRepairEnhancementSchemaAsync(db);

                var columns = await db.Database.SqlQueryRaw<string>("""
                    SELECT column_name AS "Value"
                    FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = 'DeliverySchedules'
                      AND column_name IN ('InsuranceCompany', 'InsurancePrice', 'InsuranceSumInsured', 'RoadTaxPaidViaEAuto')
                    ORDER BY column_name
                    """).ToListAsync();
                Assert.Equal(["InsuranceCompany", "InsurancePrice", "InsuranceSumInsured", "RoadTaxPaidViaEAuto"], columns);
                var legacy = await db.DeliverySchedules.AsNoTracking().SingleAsync();
                Assert.Null(legacy.InsuranceCompany);
                Assert.Null(legacy.InsurancePrice);
                Assert.Null(legacy.InsuranceSumInsured);
                Assert.Null(legacy.RoadTaxPaidViaEAuto);
            }
        }
        finally
        {
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }

    [PostgresFact]
    public async Task Owner_purchase_invoice_schema_upgrade_is_idempotent_and_hydrates_legacy_revision_lines_on_postgres()
    {
        var config = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES"));
        Assert.Contains(config.Host, new[] { "127.0.0.1", "localhost" });
        Assert.Equal("whatsapp_ci", config.Database);
        var database = "purchase_invoice_check_" + Guid.NewGuid().ToString("N");
        config.Pooling = false;
        await using var admin = new NpgsqlConnection(config.ConnectionString);
        await admin.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", admin)) await create.ExecuteNonQueryAsync();
        config.Database = database;
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(config.ConnectionString).Options;
        try
        {
            Guid invoiceId;
            Guid legacyInvoiceId;
            await using (var db = new AppDbContext(options))
            {
                await db.Database.EnsureCreatedAsync();
                var owner = new Owner { Name = "Legacy Owner", Phone = "0123456789" };
                var vehicle = new Vehicle
                {
                    PlateNumber = "PGINV1",
                    Make = "Synthetic",
                    Model = "Legacy",
                    Year = 2022,
                    OwnerId = owner.Id,
                    PurchasePrice = 50_000m,
                    PurchaseSource = VehiclePurchaseSource.YSHeng,
                    Status = VehicleStatus.Available,
                    BossConfirmed = true
                };
                var invoice = new PurchaseInvoice
                {
                    VehicleId = vehicle.Id,
                    OwnerId = owner.Id,
                    SourceType = PurchaseInvoiceSourceType.OwnerAcquisition,
                    CurrentRevisionNumber = 1,
                    InvoiceNumber = "YSH-PINV-2026-000001",
                    InvoiceDate = new DateOnly(2026, 11, 14),
                    PurchaseDate = new DateOnly(2026, 11, 14),
                    Amount = 50_000m
                };
                var revision = new PurchaseInvoiceRevision
                {
                    PurchaseInvoiceId = invoice.Id,
                    RevisionNumber = 1,
                    InvoiceNumber = invoice.InvoiceNumber,
                    SourceVehicleId = vehicle.Id,
                    SourceOwnerId = owner.Id,
                    InvoiceDate = invoice.InvoiceDate,
                    PurchaseDate = invoice.PurchaseDate!.Value,
                    SellerName = owner.Name,
                    SellerPhone = owner.Phone,
                    VehiclePlateNumber = vehicle.PlateNumber,
                    VehicleDescription = $"{vehicle.Make} {vehicle.Model}",
                    Amount = invoice.Amount,
                    CreatedBy = "legacy-ci",
                    Content = []
                };
                var line = new PurchaseInvoiceRevisionLine
                {
                    PurchaseInvoiceRevisionId = revision.Id,
                    LineType = PurchaseInvoiceLineType.VehiclePurchase,
                    Description = "Legacy vehicle line",
                    Amount = invoice.Amount,
                    CapitaliseIntoVehicleCost = true,
                    SortOrder = 1
                };
                var legacyInvoice = new PurchaseInvoice
                {
                    VehicleId = vehicle.Id,
                    InvoiceNumber = "LEGACY-PINV-000001",
                    InvoiceDate = invoice.InvoiceDate,
                    PurchaseDate = invoice.PurchaseDate,
                    Amount = 100m
                };
                var legacyLine = new PurchaseInvoiceLine
                {
                    PurchaseInvoiceId = legacyInvoice.Id,
                    LineType = PurchaseInvoiceLineType.Other,
                    Description = "Legacy supplier line",
                    Amount = 100m,
                    CapitaliseIntoVehicleCost = false
                };
                db.AddRange(owner, vehicle, invoice, revision, line, legacyInvoice, legacyLine);
                await db.SaveChangesAsync();
                invoiceId = invoice.Id;
                legacyInvoiceId = legacyInvoice.Id;

                await db.Database.ExecuteSqlRawAsync("""
                    ALTER TABLE "PurchaseInvoiceRevisionLines" DROP COLUMN IF EXISTS "SupplierInvoiceNumber";
                    ALTER TABLE "PurchaseInvoiceRevisionLines" DROP COLUMN IF EXISTS "SupplierInvoiceDate";
                    ALTER TABLE "PurchaseInvoiceRevisionLines" DROP COLUMN IF EXISTS "DiscountVoucherReference";
                    ALTER TABLE "PurchaseInvoiceRevisionLines" DROP COLUMN IF EXISTS "DiscountAmount";
                    ALTER TABLE "PurchaseInvoiceLines" DROP COLUMN IF EXISTS "DiscountAmount";
                    """);
            }

            await VerifyOwnerPurchaseInvoiceHydrationAsync(config.ConnectionString, invoiceId, legacyInvoiceId, 0m, 0m);
            await using (var upgraded = new AppDbContext(options))
            {
                Assert.Equal(2, await upgraded.Database.SqlQueryRaw<int>("""
                    SELECT COUNT(*)::integer AS "Value"
                    FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND ((table_name = 'PurchaseInvoiceRevisionLines' AND column_name = 'DiscountAmount')
                        OR (table_name = 'PurchaseInvoiceLines' AND column_name = 'DiscountAmount'))
                    """).SingleAsync());
                var discountDefaults = await upgraded.Database.SqlQueryRaw<string>("""
                    SELECT column_default AS "Value"
                    FROM information_schema.columns
                    WHERE table_schema = current_schema()
                      AND ((table_name = 'PurchaseInvoiceRevisionLines' AND column_name = 'DiscountAmount')
                        OR (table_name = 'PurchaseInvoiceLines' AND column_name = 'DiscountAmount'))
                    ORDER BY table_name
                    """).ToListAsync();
                Assert.Equal(2, discountDefaults.Count);
                Assert.All(discountDefaults, value => Assert.Contains("0", value ?? ""));
                await upgraded.Database.ExecuteSqlRawAsync("""
                    UPDATE "PurchaseInvoiceRevisionLines" SET "DiscountAmount" = 500 WHERE "PurchaseInvoiceRevisionId" IN (SELECT "Id" FROM "PurchaseInvoiceRevisions" WHERE "PurchaseInvoiceId" = {0});
                    UPDATE "PurchaseInvoiceLines" SET "DiscountAmount" = 5 WHERE "PurchaseInvoiceId" = {1};
                    """, invoiceId, legacyInvoiceId);
            }
            await VerifyOwnerPurchaseInvoiceHydrationAsync(config.ConnectionString, invoiceId, legacyInvoiceId, 500m, 5m);
            await VerifyOwnerPurchaseInvoiceHydrationAsync(config.ConnectionString, invoiceId, legacyInvoiceId, 500m, 5m);
        }
        finally
        {
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }

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
            var legacyTask = new CalendarTask
            {
                Title = "Legacy calendar task",
                StartDate = new DateOnly(2026, 11, 13),
                EndDate = new DateOnly(2026, 11, 13),
                AssignedToUserId = "legacy-staff",
                AssignedToName = "Legacy Staff",
                CreatedByUserId = "legacy-boss",
                CreatedByName = "Legacy Boss"
            };
            db.CalendarTasks.Add(legacyTask);
            await db.SaveChangesAsync();
            // Upgrade the earlier application schema only inside this generated disposable database.
            await db.Database.ExecuteSqlRawAsync("""
                ALTER TABLE "CalendarTasks" DROP COLUMN IF EXISTS "StartTime";
                ALTER TABLE "CalendarTasks" DROP COLUMN IF EXISTS "EndTime";
                ALTER TABLE "WhatsAppOutbox" DROP CONSTRAINT IF EXISTS "FK_WhatsAppOutbox_WhatsAppStaffBindings_StaffBindingId";
                DROP TABLE "WhatsAppVehicleIntakeDrafts";
                DROP TABLE "WhatsAppPriceUpdateDrafts";
                DROP TABLE "WhatsAppSettlementUpdateDrafts";
                DROP TABLE "WhatsAppStaffRequests";
                DROP TABLE "WhatsAppStaffChallenges";
                DROP TABLE "WhatsAppStaffBindings";
                DROP TABLE "WhatsAppWorkflowEvents";
                """);
            await WhatsAppAssistantSchema.EnsureAsync(db);
            await WhatsAppAssistantSchema.EnsureAsync(db);
            await WhatsAppWorkflowEvents.EnsureSchemaAsync(db);
            await WhatsAppWorkflowEvents.EnsureSchemaAsync(db);
            Assert.Empty(await db.WhatsAppWorkflowEvents.AsNoTracking().ToListAsync());
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
            var historicalInspection = new InspectionRecord
            {
                Type = InspectionType.Awalan, Company = InspectionCompany.YSHengAutomotive,
                BookingReference = "LEGACY-INSPECTION", SourceReceiptNumber = "LEGACY-INSPECTION",
                SupplierInvoiceReference = "LEGACY-INSPECTION", AppointmentDate = new DateOnly(2026, 11, 23)
            };
            db.InspectionRecords.Add(historicalInspection);
            await db.SaveChangesAsync();
            await db.Database.ExecuteSqlRawAsync("""ALTER TABLE "InspectionRecords" ALTER COLUMN "Type" SET NOT NULL""");
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
                Assert.Equal(1, await db.WhatsAppDispatchUsage.CountAsync(row => row.Attempts == 1 && row.ReservedCostSen == 0));
            }
            finally { finish.TrySetResult(); await first; }
            await VerifyApplicationAsync(config.ConnectionString);
            Assert.Equal(InspectionType.Awalan, (await db.InspectionRecords.AsNoTracking().SingleAsync(item => item.Id == historicalInspection.Id)).Type);
            await using (var schemaDb = new AppDbContext(options))
            {
                await schemaDb.Database.ExecuteSqlRawAsync("""
                    ALTER TABLE "CalendarTasks" DROP COLUMN IF EXISTS "StartTime";
                    ALTER TABLE "CalendarTasks" DROP COLUMN IF EXISTS "EndTime";
                    """);
            }
            await VerifyCalendarTaskNonSeedStartupAsync(config.ConnectionString);
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
            ["Worker__Enabled"] = "false", ["WhatsApp__CaptureEnabled"] = "false", ["WhatsApp__SendingEnabled"] = "false",
            ["WhatsApp__StaffCaptureEnabled"] = "true", ["WhatsApp__StaffSendingEnabled"] = "true",
            ["WhatsApp__InvitationEnabled"] = "true", ["WhatsApp__WebhookEnabled"] = "true", ["WhatsApp__SenderApproved"] = "true",
            ["WhatsApp__SenderApprovalEvidence"] = "synthetic CI approval", ["WhatsApp__GraphApiVersion"] = "v25.0",
            ["WhatsApp__PhoneNumberId"] = "123", ["WhatsApp__BusinessAccountId"] = "456", ["WhatsApp__AccessToken"] = "synthetic-token",
            ["WhatsApp__AppSecret"] = new string('s', 32), ["WhatsApp__VerifyToken"] = new string('v', 32),
            ["WhatsApp__BudgetOwner"] = "", ["WhatsApp__DailyAttemptLimit"] = "10",
            ["WhatsApp__MonthlyBudgetSen"] = "0", ["WhatsApp__MaximumCostPerAttemptSen"] = "0",
            ["WhatsApp__CostCeilingConfirmed"] = "false", ["WhatsApp__Templates__0__Key"] = "staff_invite_v1",
            ["WhatsApp__Templates__0__Name"] = "approved_staff_invite", ["WhatsApp__Templates__0__Language"] = "en_US",
            ["WhatsApp__Templates__0__Approved"] = "true", ["WhatsApp__Templates__0__ApprovalEvidence"] = "synthetic CI template approval",
            ["WhatsApp__Templates__1__Key"] = "staff_notice_v1", ["WhatsApp__Templates__1__Name"] = "approved_staff_notice",
            ["WhatsApp__Templates__1__Language"] = "en_US", ["WhatsApp__Templates__1__Approved"] = "true",
            ["WhatsApp__Templates__1__ApprovalEvidence"] = "synthetic CI staff template approval",
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
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/whatsapp/staff/connections")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/whatsapp/staff/limits")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PutAsJsonAsync("/api/whatsapp/staff/limits", new { dailyAttemptLimit = 50 })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/whatsapp/assistant/connection", new { recipient = "60177777777", language = "en_US", consentConfirmed = true })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/whatsapp/assistant/disconnect", new { })).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync("/api/whatsapp/assistant/webhook", new StringContent("{}"))).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync("/api/whatsapp/webhook", new StringContent("{}"))).StatusCode);
            using var admin = factory.CreateClient();
            Assert.True((await admin.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "admin@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
            var limitsResponse = await admin.GetAsync("/api/whatsapp/staff/limits");
            Assert.Equal(HttpStatusCode.OK, limitsResponse.StatusCode);
            Assert.Contains("no-store", limitsResponse.Headers.CacheControl!.ToString());
            using var limits = JsonDocument.Parse(await limitsResponse.Content.ReadAsStringAsync());
            Assert.Equal(10, limits.RootElement.GetProperty("dailyAttemptLimit").GetInt32());
            Assert.False(limits.RootElement.TryGetProperty("monthlyBudgetSen", out _));
            Assert.False(limits.RootElement.TryGetProperty("monthlyReservedCostSen", out _));
            Assert.False(limits.RootElement.TryGetProperty("maximumCostPerAttemptSen", out _));
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync("/api/whatsapp/staff/limits", new { dailyAttemptLimit = 0 })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/whatsapp/staff/limits", new { dailyAttemptLimit = 10 })).StatusCode);
            var created = await admin.PostAsJsonAsync("/api/admin/users", new { email = "sales@example.test", displayName = "Synthetic Sales", password = "Synthetic-CI-123!", role = "Sales" });
            Assert.Equal(HttpStatusCode.Created, created.StatusCode);
            using var staff = JsonDocument.Parse(await created.Content.ReadAsStringAsync());
            var staffId = staff.RootElement.GetProperty("id").GetString()!;
            var issued = await admin.PostAsJsonAsync("/api/whatsapp/assistant/connection", new { recipient = "60177777777", language = "en_US", consentConfirmed = true, staffUserId = staffId });
            Assert.Equal(HttpStatusCode.OK, issued.StatusCode);
            Assert.Contains("no-store", issued.Headers.CacheControl!.ToString());
            var command = (await issued.Content.ReadFromJsonAsync<WhatsAppStaffLinkResult>())!.Command;
            for (var attempt = 0; attempt < 100 && !submitted.Any(reply => reply.StartsWith("invite:", StringComparison.Ordinal)); attempt++) await Task.Delay(100);
            var invitation = Assert.Single(submitted, reply => reply.StartsWith("invite:", StringComparison.Ordinal));
            Assert.Contains("Open your YS Heng portal", invitation);
            Assert.DoesNotContain(command[5..], invitation);
            using var sales = factory.CreateClient();
            Assert.True((await sales.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "sales@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
            await VerifyInspectionInvoiceApplicationAsync(factory, admin, sales, anonymous);
            await VerifyDeliveryBuyerPriceAsync(factory, admin);
            await VerifyRepairPaymentApplicationAsync(factory, admin, sales, anonymous);
            Assert.Equal(HttpStatusCode.Forbidden, (await sales.GetAsync("/api/whatsapp/assistant/connection?staffUserId=assistant-ci")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await sales.GetAsync("/api/whatsapp/staff/connections")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await sales.GetAsync("/api/whatsapp/staff/limits")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await sales.PutAsJsonAsync("/api/whatsapp/staff/limits", new { dailyAttemptLimit = 50 })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await sales.PostAsJsonAsync("/api/whatsapp/assistant/connection", new { recipient = "60177777777", language = "en_US", consentConfirmed = true, staffUserId = "assistant-ci" })).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await sales.PostAsJsonAsync("/api/whatsapp/assistant/disconnect", new { staffUserId = "assistant-ci" })).StatusCode);
            // Sales can read the loan list so the assigned Broker can open an owned case;
            // sensitive fields and cross-owner mutations remain server-redacted/forbidden.
            Assert.Equal(HttpStatusCode.OK, (await sales.GetAsync("/api/loans")).StatusCode);
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
            using var connectionsResponse = await admin.GetAsync("/api/whatsapp/staff/connections");
            Assert.Equal(HttpStatusCode.OK, connectionsResponse.StatusCode);
            Assert.Contains("no-store", connectionsResponse.Headers.CacheControl!.ToString());
            var connectionsJson = await connectionsResponse.Content.ReadAsStringAsync();
            Assert.DoesNotContain("60177777777", connectionsJson);
            Assert.DoesNotContain(command[5..], connectionsJson);
            var connections = await connectionsResponse.Content.ReadFromJsonAsync<WhatsAppStaffConnectionSummary[]>();
            Assert.Contains(connections!, connection => connection.StaffUserId == staffId && connection.State == "Connected" && connection.MaskedNumber == "***7777");
            await Callback("help", "synthetic-startup-query");
            for (var attempt = 0; attempt < 100 && !submitted.Any(reply => reply.Contains("available enquiries")); attempt++) await Task.Delay(100);
            Assert.Contains(submitted, reply => reply.Contains("available enquiries"));
            Assert.True((await sales.PostAsJsonAsync("/api/whatsapp/assistant/disconnect", new { })).IsSuccessStatusCode);
            Assert.Equal("Disconnected", (await sales.GetFromJsonAsync<WhatsAppStaffConnection>("/api/whatsapp/assistant/connection"))!.State);

            // Boot the real Program.cs hosted services, not manual worker construction.
            // After setup, all three categories must reach the synthetic provider without admin HTTP requests.
            var bossIssued = await admin.PostAsJsonAsync("/api/whatsapp/assistant/connection", new { recipient = "60177777777", language = "en_US", consentConfirmed = true });
            Assert.Equal(HttpStatusCode.OK, bossIssued.StatusCode);
            await Callback((await bossIssued.Content.ReadFromJsonAsync<WhatsAppStaffLinkResult>())!.Command, "synthetic-startup-boss-link");
            string bossId;
            await using (var scope = factory.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                bossId = await db.Users.Where(user => user.Email == "admin@example.test").Select(user => user.Id).SingleAsync();
                var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var day = WhatsAppStaffNotifications.LocalDate(now);
                foreach (var category in new[] { "OutstandingDigest", "AttendanceSummary", "LeaveApproval" })
                    Assert.True(await WhatsAppStaffNotifications.UpdatePolicyAsync(db, category,
                        new(true, 0, category == "OutstandingDigest" ? 3 : 0, 0), "synthetic setup", now));
                db.DailySpends.Add(new DailySpend { DueDate = day, Amount = 20 });
                db.HrLeaveRequests.Add(new HrLeaveRequest { StaffUserId = staffId, StartDate = day, EndDate = day, Days = 1 });
                await db.SaveChangesAsync();
            }
            for (var attempt = 0; attempt < 900 && submitted.Count(body => body.StartsWith("notice:", StringComparison.Ordinal)) < 3; attempt++)
                await Task.Delay(100);
            Assert.Equal(3, submitted.Count(body => body.StartsWith("notice:", StringComparison.Ordinal)));
            await using (var scope = factory.Services.CreateAsyncScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                for (var attempt = 0; attempt < 100 && await db.WhatsAppOutbox.CountAsync(row => row.Audience == "Staff" && row.StaffUserId == bossId && row.State == "Accepted") < 3; attempt++)
                    await Task.Delay(25);
                var daily = await db.WhatsAppOutbox.AsNoTracking().Where(row => row.Audience == "Staff" && row.StaffUserId == bossId).ToListAsync();
                Assert.Equal(new[] { "AttendanceSummary", "LeaveApproval", "OutstandingDigest" }, daily.Select(row => row.MessageKind).Order().ToArray());
                Assert.All(daily, row => { Assert.Equal("Accepted", row.State); Assert.Equal(1, row.Attempts); Assert.False(string.IsNullOrWhiteSpace(row.SubmittedBody)); });
            }
            await VerifyCollectionAgeingApplicationAsync(factory, admin, sales, anonymous);
        }
        finally { foreach (var value in previous) Environment.SetEnvironmentVariable(value.Key, value.Value); }
    }

    private static async Task VerifyCalendarTaskNonSeedStartupAsync(string connectionString)
    {
        var keys = new[] { "ConnectionStrings__Default", "SeedData__Enabled", "Worker__Enabled", "WhatsAppAssistant__Enabled" };
        var previous = keys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
        try
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__Default", connectionString);
            Environment.SetEnvironmentVariable("SeedData__Enabled", "false");
            Environment.SetEnvironmentVariable("Worker__Enabled", "false");
            Environment.SetEnvironmentVariable("WhatsAppAssistant__Enabled", "false");
            await using var factory = new StaffApplicationFactory(new ConcurrentQueue<string>());
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/ready")).StatusCode);

            var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options;
            await using var db = new AppDbContext(options);
            var legacy = await db.CalendarTasks.SingleAsync(task => task.Title == "Legacy calendar task");
            Assert.Null(legacy.StartTime);
            Assert.Null(legacy.EndTime);
            var timed = new CalendarTask
            {
                Title = "Timed calendar task",
                StartDate = new DateOnly(2026, 11, 13),
                EndDate = new DateOnly(2026, 11, 14),
                StartTime = new TimeOnly(9, 0),
                EndTime = new TimeOnly(17, 30),
                AssignedToUserId = "timed-staff",
                AssignedToName = "Timed Staff",
                CreatedByUserId = "timed-boss",
                CreatedByName = "Timed Boss"
            };
            db.CalendarTasks.Add(timed);
            await db.SaveChangesAsync();
            db.ChangeTracker.Clear();
            var saved = await db.CalendarTasks.SingleAsync(task => task.Id == timed.Id);
            Assert.Equal(new TimeOnly(9, 0), saved.StartTime);
            Assert.Equal(new TimeOnly(17, 30), saved.EndTime);
        }
        finally
        {
            foreach (var value in previous) Environment.SetEnvironmentVariable(value.Key, value.Value);
        }
    }

    private static async Task VerifyOwnerPurchaseInvoiceHydrationAsync(string connectionString, Guid invoiceId, Guid legacyInvoiceId, decimal expectedRevisionDiscount, decimal expectedLegacyDiscount)
    {
        var keys = new[] { "ConnectionStrings__Default", "SeedData__Enabled", "Worker__Enabled", "WhatsAppAssistant__Enabled" };
        var previous = keys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
        try
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__Default", connectionString);
            Environment.SetEnvironmentVariable("SeedData__Enabled", "false");
            Environment.SetEnvironmentVariable("Worker__Enabled", "false");
            Environment.SetEnvironmentVariable("WhatsAppAssistant__Enabled", "false");
            await using var factory = new StaffApplicationFactory(new ConcurrentQueue<string>());
            using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
            Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/health/ready")).StatusCode);

            var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connectionString).Options;
            await using var db = new AppDbContext(options);
            var invoices = await db.PurchaseInvoices.AsNoTracking().Where(row => row.Id == invoiceId || row.Id == legacyInvoiceId).ToListAsync();
            var hydrated = await OwnerPurchaseInvoiceReader.HydrateAsync(db, invoices);
            var ownerInvoice = Assert.Single(hydrated, row => row.Id == invoiceId);
            var current = ownerInvoice.CurrentRevision;
            Assert.NotNull(current);
            var line = Assert.Single(current!.Lines);
            Assert.Equal("Legacy vehicle line", line.Description);
            Assert.Equal(50_000m, line.Amount);
            Assert.Equal(expectedRevisionDiscount, line.DiscountAmount);
            Assert.Equal(expectedRevisionDiscount, Assert.Single((await OwnerPurchaseInvoiceReader.HistoryAsync(db, invoiceId)).Single().Lines).DiscountAmount);

            var legacy = Assert.Single(hydrated, row => row.Id == legacyInvoiceId);
            var legacyLine = Assert.Single(legacy.Lines);
            Assert.Equal("Legacy supplier line", legacyLine.Description);
            Assert.Equal(100m, legacyLine.Amount);
            Assert.Equal(expectedLegacyDiscount, legacyLine.DiscountAmount);
        }
        finally
        {
            foreach (var value in previous) Environment.SetEnvironmentVariable(value.Key, value.Value);
        }
    }

    // Reuse the isolated real-Program PostgreSQL harness: financial reads must enforce
    // permissions and reconcile over HTTP, not merely through pure rule tests.
    private static async Task VerifyCollectionAgeingApplicationAsync(StaffApplicationFactory factory, HttpClient admin, HttpClient sales, HttpClient anonymous)
    {
        const string summaryPath = "/api/dashboard/collection-ageing";
        const string recordsPath = "/api/finance/collection-ageing?bucket=UnknownDueDate";
        foreach (var path in new[] { summaryPath, recordsPath })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(path)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await sales.GetAsync(path)).StatusCode);
        }
        var ageing = (await admin.GetFromJsonAsync<CollectionAgeingSummary>(summaryPath))!;
        var records = (await admin.GetFromJsonAsync<CollectionAgeingRecords>(recordsPath))!;
        using var headline = JsonDocument.Parse(await admin.GetStringAsync("/api/dashboard/summary"));
        Assert.Equal(headline.RootElement.GetProperty("outstandingCollection").GetDecimal(), ageing.TotalAmount);
        Assert.Equal(ageing.TotalAmount, records.TotalAmount);
        Assert.Equal(ageing.TotalCount, records.Records.Count);
        Assert.Equal(ageing.TotalCount, ageing.Buckets.Single(bucket => bucket.Key == "UnknownDueDate").Count);
        Assert.Equal(records.Records.Count, records.Records.Select(record => (record.SourceType, record.SourceId)).Distinct().Count());
        Assert.All(records.Records, record => Assert.Null(record.DueDate));
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/finance/collection-ageing?bucket=invalid")).StatusCode);
        Assert.Empty((await admin.GetFromJsonAsync<CollectionAgeingRecords>("/api/finance/collection-ageing?bucket=NotYetDue"))!.Records);
        var created = await admin.PostAsJsonAsync("/api/admin/users", new { email = "ageing-finance@example.test", displayName = "Synthetic Finance", password = "Synthetic-CI-123!", role = "Finance" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        using var finance = factory.CreateClient();
        Assert.True((await finance.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "ageing-finance@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
        Assert.Equal(HttpStatusCode.OK, (await finance.GetAsync(recordsPath)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await finance.GetAsync(summaryPath)).StatusCode);
    }

    private static async Task VerifyRepairPaymentApplicationAsync(StaffApplicationFactory factory, HttpClient admin, HttpClient sales, HttpClient anonymous)
    {
        var vehicle = new Vehicle { PlateNumber = "PGREPAIR1", Make = "Synthetic", Model = "Repair", Year = 2022 };
        var repair = new RepairJob { VehicleId = vehicle.Id, Cost = 120m, RepairPart = "Synthetic part", WhatToDo = "Synthetic repair", ApprovalStatus = RepairApprovalStatus.Approved };
        var invoice = new SupplierInvoice { VehicleId = vehicle.Id, SupplierName = "Synthetic supplier", InvoiceNumber = "PG-REPAIR-1", Amount = 120m, InvoiceDate = new DateOnly(2026, 11, 1) };
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Vehicles.Add(vehicle);
            db.RepairJobs.Add(repair);
            db.SupplierInvoices.Add(invoice);
            db.RepairReceipts.Add(new RepairReceipt { RepairJobId = repair.Id, DocumentId = Guid.NewGuid(), SupplierName = invoice.SupplierName, InvoiceNumber = invoice.InvoiceNumber, TotalAmount = 120m });
            await db.SaveChangesAsync();
        }
        var endpoint = $"/api/repair-review/{invoice.Id}/paid";
        var request = new RepairPaymentRequest(new DateOnly(2026, 11, 17), 120m);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/repair-review")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await sales.PostAsJsonAsync(endpoint, request)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync(endpoint, request with { ExpectedAmount = 119m })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync($"/api/repairs/{repair.Id}/reject", new { notes = "Already approved" })).StatusCode);
        var responses = await Task.WhenAll(admin.PostAsJsonAsync(endpoint, request), admin.PostAsJsonAsync(endpoint, request));
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.OK);
        Assert.Single(responses, response => response.StatusCode == HttpStatusCode.Conflict);
        foreach (var response in responses) response.Dispose();
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync($"/api/repairs/{repair.Id}/reject", new { notes = "Cannot reject paid" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsJsonAsync($"/api/repairs/{repair.Id}", repair with { Cost = 130m })).StatusCode);

        var correctionVehicle = new Vehicle { PlateNumber = "PGREPAIR2", Make = "Synthetic", Model = "Correction", Year = 2022 };
        var correctionRepair = new RepairJob { VehicleId = correctionVehicle.Id, Cost = 600m, RepairPart = "Synthetic part", WhatToDo = "Correct receipt", ApprovalStatus = RepairApprovalStatus.Pending };
        var correctionSupplier = new Supplier { CompanyName = "维修供应商", Address = "Johor", Phone = "0123456789", Status = SupplierStatus.Active };
        var correctionInvoice = new SupplierInvoice
        {
            VehicleId = correctionVehicle.Id,
            SupplierId = correctionSupplier.Id,
            SupplierName = correctionSupplier.CompanyName,
            InvoiceNumber = "PG-REPAIR-MISKEY",
            Amount = 500m,
            InvoiceDate = new DateOnly(2026, 11, 1)
        };
        var correctionReceipt = new RepairReceipt
        {
            RepairJobId = correctionRepair.Id,
            DocumentId = Guid.NewGuid(),
            SupplierName = correctionInvoice.SupplierName,
            InvoiceNumber = correctionInvoice.InvoiceNumber,
            TotalAmount = 600m
        };
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.AddRange(correctionVehicle, correctionRepair, correctionSupplier, correctionInvoice, correctionReceipt);
            db.RepairReceiptItems.Add(new RepairReceiptItem { RepairReceiptId = correctionReceipt.Id, Description = "Corrected line", Amount = 600m, SortOrder = 1 });
            await db.SaveChangesAsync();
        }

        var correctedInvoice = correctionInvoice with { InvoiceNumber = "PG-REPAIR-CORRECTED", Amount = 600m };
        using var correctionRequest = new HttpRequestMessage(HttpMethod.Put, $"/api/supplier-invoices/{correctionInvoice.Id}")
        {
            Content = JsonContent.Create(correctedInvoice)
        };
        correctionRequest.Headers.Add("X-Expected-Supplier-Invoice", Uri.EscapeDataString(JsonSerializer.Serialize(correctionInvoice, new JsonSerializerOptions(JsonSerializerDefaults.Web))));
        using var correctionResponse = await admin.SendAsync(correctionRequest);
        var correctionBody = await correctionResponse.Content.ReadAsStringAsync();
        Assert.True(correctionResponse.IsSuccessStatusCode, $"{correctionResponse.StatusCode}: {correctionBody}");
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var savedInvoice = await db.SupplierInvoices.SingleAsync(item => item.Id == correctionInvoice.Id);
            var savedReceipt = await db.RepairReceipts.SingleAsync(item => item.Id == correctionReceipt.Id);
            Assert.Equal("PG-REPAIR-CORRECTED", savedInvoice.InvoiceNumber);
            Assert.Equal(600m, savedInvoice.Amount);
            Assert.Equal("PG-REPAIR-CORRECTED", savedReceipt.InvoiceNumber);
            Assert.Equal(600m, savedReceipt.TotalAmount);
            Assert.Equal(600m, await db.RepairJobs.Where(item => item.Id == correctionRepair.Id).Select(item => item.Cost).SingleAsync());
        }

        using var staleRequest = new HttpRequestMessage(HttpMethod.Put, $"/api/supplier-invoices/{correctionInvoice.Id}")
        {
            Content = JsonContent.Create(correctedInvoice with { InvoiceNumber = "STALE" })
        };
        staleRequest.Headers.Add("X-Expected-Supplier-Invoice", Uri.EscapeDataString(JsonSerializer.Serialize(correctionInvoice, new JsonSerializerOptions(JsonSerializerDefaults.Web))));
        Assert.Equal(HttpStatusCode.Conflict, (await admin.SendAsync(staleRequest)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/repairs/{correctionRepair.Id}/approval", new { expectedCost = 600m })).StatusCode);
        using var approvedRequest = new HttpRequestMessage(HttpMethod.Put, $"/api/supplier-invoices/{correctedInvoice.Id}")
        {
            Content = JsonContent.Create(correctedInvoice with { InvoiceNumber = "APPROVED-MUTATION" })
        };
        approvedRequest.Headers.Add("X-Expected-Supplier-Invoice", Uri.EscapeDataString(JsonSerializer.Serialize(correctedInvoice, new JsonSerializerOptions(JsonSerializerDefaults.Web))));
        Assert.Equal(HttpStatusCode.Conflict, (await admin.SendAsync(approvedRequest)).StatusCode);

        using var paidRequest = new HttpRequestMessage(HttpMethod.Put, $"/api/supplier-invoices/{invoice.Id}")
        {
            Content = JsonContent.Create(invoice with { PaidAt = new DateOnly(2026, 11, 17), Amount = 121m })
        };
        Assert.Equal(HttpStatusCode.Conflict, (await admin.SendAsync(paidRequest)).StatusCode);

        var rejectedVehicle = new Vehicle { PlateNumber = "PGREPAIR3", Make = "Synthetic", Model = "Rejected", Year = 2022 };
        var rejectedRepair = new RepairJob { VehicleId = rejectedVehicle.Id, Cost = 50m, RepairPart = "Synthetic part", WhatToDo = "Rejected repair", ApprovalStatus = RepairApprovalStatus.Rejected };
        var rejectedInvoice = new SupplierInvoice { VehicleId = rejectedVehicle.Id, SupplierId = correctionSupplier.Id, SupplierName = correctionSupplier.CompanyName, InvoiceNumber = "PG-REPAIR-REJECTED", Amount = 50m };
        var rejectedReceipt = new RepairReceipt { RepairJobId = rejectedRepair.Id, DocumentId = Guid.NewGuid(), SupplierName = rejectedInvoice.SupplierName, InvoiceNumber = rejectedInvoice.InvoiceNumber, TotalAmount = 50m };
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.AddRange(rejectedVehicle, rejectedRepair, rejectedInvoice, rejectedReceipt);
            db.RepairReceiptItems.Add(new RepairReceiptItem { RepairReceiptId = rejectedReceipt.Id, Description = "Rejected line", Amount = 50m, SortOrder = 1 });
            await db.SaveChangesAsync();
        }
        using var rejectedRequest = new HttpRequestMessage(HttpMethod.Put, $"/api/supplier-invoices/{rejectedInvoice.Id}")
        {
            Content = JsonContent.Create(rejectedInvoice with { InvoiceNumber = "REJECTED-MUTATION" })
        };
        Assert.Equal(HttpStatusCode.Conflict, (await admin.SendAsync(rejectedRequest)).StatusCode);
    }

    private static async Task VerifyDeliveryBuyerPriceAsync(StaffApplicationFactory factory, HttpClient admin)
    {
        var buyer = new Customer { Name = "Synthetic delivery buyer", Phone = "0000000001" };
        var other = new Customer { Name = "Synthetic other buyer", Phone = "0000000002" };
        var vehicle = new Vehicle { PlateNumber = "PGDELPRICE", Make = "Synthetic", Model = "Delivery", Year = 2026, CustomerId = buyer.Id };
        var delivery = new DeliverySchedule { VehicleId = vehicle.Id, CustomerId = buyer.Id, Pic = "Synthetic", ScheduledDate = new DateOnly(2026, 1, 1), Status = DeliveryStatus.Released, ReleasedAt = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc) };
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.Customers.AddRange(buyer, other);
            db.Vehicles.Add(vehicle);
            db.DeliverySchedules.Add(delivery);
            db.LoanApplications.AddRange(
                new LoanApplication { VehicleId = vehicle.Id, CustomerId = buyer.Id, Status = LoanStatus.Done, FinalSellingPrice = 50000m, SubmittedAt = new DateOnly(2026, 1, 1) },
                new LoanApplication { VehicleId = vehicle.Id, CustomerId = other.Id, Status = LoanStatus.Done, FinalSellingPrice = 90000m, SubmittedAt = new DateOnly(2026, 2, 1) });
            await db.SaveChangesAsync();
        }
        var response = await admin.GetAsync("/api/deliveries/workboard");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var rows = await response.Content.ReadFromJsonAsync<JsonElement>();
        var row = rows.EnumerateArray().Single(item => item.GetProperty("id").GetGuid() == delivery.Id);
        Assert.Equal(50000m, row.GetProperty("finalSellingPrice").GetDecimal());
        Assert.NotEqual(JsonValueKind.Null, row.GetProperty("releasedAt").ValueKind);
    }

    private static async Task VerifyInspectionInvoiceApplicationAsync(
        StaffApplicationFactory factory,
        HttpClient admin,
        HttpClient sales,
        HttpClient anonymous)
    {
        const string invoiceNumber = "INSPECT-SUPPLIER-253";
        var checkPath = "/api/inspections/invoice-number-check?invoiceNumber=" + Uri.EscapeDataString(invoiceNumber);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync(checkPath)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await sales.GetAsync(checkPath)).StatusCode);

        Guid firstVehicleId;
        Guid secondVehicleId;
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var firstVehicle = new Vehicle
            {
                PlateNumber = "PGI" + Guid.NewGuid().ToString("N")[..5].ToUpperInvariant(),
                Year = 2022,
                Make = "Synthetic",
                Model = "Inspection One"
            };
            var secondVehicle = new Vehicle
            {
                PlateNumber = "PGI" + Guid.NewGuid().ToString("N")[..5].ToUpperInvariant(),
                Year = 2023,
                Make = "Synthetic",
                Model = "Inspection Two"
            };
            db.Vehicles.AddRange(firstVehicle, secondVehicle);
            await db.SaveChangesAsync();
            firstVehicleId = firstVehicle.Id;
            secondVehicleId = secondVehicle.Id;
        }

        static object Request(Guid vehicleId, string receipt, string supplierReference,
            InspectionType? type = InspectionType.Awalan, InspectionCompany company = InspectionCompany.YSHengAuto) => new
        {
            vehicleId,
            type = (int?)type,
            company = (int)company,
            isLorry = false,
            appointmentDate = new DateOnly(2026, 12, 10),
            appointmentTime = new TimeOnly(9, 0),
            bookingReference = "PG-INS-BOOK-253",
            sourceReceiptNumber = receipt,
            receiptTotal = 100m,
            allocatedAmount = 100m,
            notes = "Synthetic PostgreSQL invoice uniqueness check",
            supplierInvoiceReference = supplierReference
        };

        var firstResponseTask = admin.PostAsJsonAsync(
            "/api/inspections",
            Request(firstVehicleId, "PG-INS-RECEIPT-A", "  " + invoiceNumber.ToLowerInvariant() + "  "));
        var secondResponseTask = admin.PostAsJsonAsync(
            "/api/inspections",
            Request(secondVehicleId, "PG-INS-RECEIPT-B", invoiceNumber));
        using var firstResponse = await firstResponseTask;
        using var secondResponse = await secondResponseTask;
        var statuses = new[] { firstResponse.StatusCode, secondResponse.StatusCode };
        Assert.Single(statuses, status => status == HttpStatusCode.Created);
        Assert.Single(statuses, status => status == HttpStatusCode.Conflict);
        var createdBody = firstResponse.StatusCode == HttpStatusCode.Created
            ? await firstResponse.Content.ReadAsStringAsync()
            : await secondResponse.Content.ReadAsStringAsync();
        using var createdDocument = JsonDocument.Parse(createdBody);
        var createdReference = createdDocument.RootElement.GetProperty("supplierInvoiceReference").GetString();
        Assert.Contains(createdReference, new[] { invoiceNumber, invoiceNumber.ToLowerInvariant() });

        using var listDocument = JsonDocument.Parse(await admin.GetStringAsync("/api/inspections"));
        var saved = listDocument.RootElement.EnumerateArray()
            .Where(item => string.Equals(
                item.GetProperty("supplierInvoiceReference").GetString()?.Trim(),
                invoiceNumber,
                StringComparison.OrdinalIgnoreCase))
            .ToList();
        var savedInspection = Assert.Single(saved);
        Assert.Equal(createdReference, savedInspection.GetProperty("supplierInvoiceReference").GetString());

        using var checkDocument = JsonDocument.Parse(await admin.GetStringAsync(
            "/api/inspections/invoice-number-check?invoiceNumber=" + Uri.EscapeDataString(" " + invoiceNumber.ToLowerInvariant() + " ")));
        Assert.False(checkDocument.RootElement.GetProperty("available").GetBoolean());
        Assert.Equal(invoiceNumber.ToLowerInvariant() + " (1)", checkDocument.RootElement.GetProperty("suggestedInvoiceNumber").GetString());

        var regularRequest = JsonSerializer.SerializeToNode(Request(firstVehicleId,
            "REGULAR-" + invoiceNumber, "REGULAR-" + invoiceNumber, null, InspectionCompany.YSHengAutomotive))!.AsObject();
        regularRequest.Remove("type");
        using var regularResponse = await admin.PostAsJsonAsync("/api/inspections", regularRequest);
        Assert.Equal(HttpStatusCode.Created, regularResponse.StatusCode);
        using var regularDocument = JsonDocument.Parse(await regularResponse.Content.ReadAsStringAsync());
        var regularId = regularDocument.RootElement.GetProperty("id").GetGuid();
        using var regularRead = JsonDocument.Parse(await admin.GetStringAsync($"/api/inspections/{regularId}"));
        Assert.Equal(JsonValueKind.Null, regularRead.RootElement.GetProperty("type").ValueKind);
        Assert.Equal("YSHengAutomotive", regularRead.RootElement.GetProperty("company").GetString());
        Assert.Equal("2027-04-10", regularRead.RootElement.GetProperty("reportExpiryDate").GetString());
        regularRequest["type"] = null;
        regularRequest["status"] = "Booked";
        using var regularUpdate = await admin.PutAsJsonAsync($"/api/inspections/{regularId}", regularRequest);
        Assert.Equal(HttpStatusCode.OK, regularUpdate.StatusCode);
        using var updatedRegular = JsonDocument.Parse(await regularUpdate.Content.ReadAsStringAsync());
        Assert.Equal(JsonValueKind.Null, updatedRegular.RootElement.GetProperty("type").ValueKind);

        using var missingSpecialType = await admin.PostAsJsonAsync("/api/inspections",
            Request(firstVehicleId, "MISSING-" + invoiceNumber, "MISSING-" + invoiceNumber, null));
        Assert.Equal(HttpStatusCode.BadRequest, missingSpecialType.StatusCode);
        Assert.Contains("inspection_type_required", await missingSpecialType.Content.ReadAsStringAsync());
        using var staleRegularType = await admin.PostAsJsonAsync("/api/inspections",
            Request(firstVehicleId, "STALE-" + invoiceNumber, "STALE-" + invoiceNumber, InspectionType.Khas, InspectionCompany.YSHengAutomotive));
        Assert.Equal(HttpStatusCode.BadRequest, staleRegularType.StatusCode);
        Assert.Contains("inspection_type_not_applicable", await staleRegularType.Content.ReadAsStringAsync());
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
                services.RemoveAll<WhatsAppTemplateSender>();
                services.AddSingleton(new WhatsAppTemplateSender(new HttpClient(new SyntheticTransport(submitted))));
            });
        }
    }

    private sealed class SyntheticTransport(ConcurrentQueue<string> submitted) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            using var json = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
            Assert.Equal("60177777777", json.RootElement.GetProperty("to").GetString());
            var kind = json.RootElement.GetProperty("type").GetString();
            var body = kind == "template"
                ? json.RootElement.GetProperty("template").GetProperty("components")[0].GetProperty("parameters")[0].GetProperty("text").GetString()
                : json.RootElement.GetProperty("text").GetProperty("body").GetString();
            var prefix = kind != "template" ? "" : json.RootElement.GetProperty("template").GetProperty("name").GetString() == "approved_staff_notice" ? "notice:" : "invite:";
            submitted.Enqueue(prefix + body);
            return new HttpResponseMessage(HttpStatusCode.OK) { Content = JsonContent.Create(new { messages = new[] { new { id = "wamid.synthetic-" + Guid.NewGuid() } } }) };
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
