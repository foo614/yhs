using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;

namespace YSHeng.Api.Tests;

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
        }
        finally
        {
            // The name is generated by this test and never supplied externally.
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
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
