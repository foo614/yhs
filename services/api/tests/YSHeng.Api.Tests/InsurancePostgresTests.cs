using System.Security.Claims;
using Microsoft.AspNetCore.Builder;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using Xunit;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;

namespace YSHeng.Api.Tests;

public sealed class InsurancePostgresTests
{
    // Real PostgreSQL coverage prevents schema/parameter type failures hidden by SQLite.
    [InsurancePostgresFact]
    public async Task Startup_schema_is_idempotent_and_preserves_standalone_records()
    {
        await using var app = await CreateIsolatedAppAsync();
        await InsuranceSchema.EnsureAsync(app);
        var item = Case();
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            db.InsuranceCases.Add(item);
            await db.SaveChangesAsync();
        }

        await InsuranceSchema.EnsureAsync(app);
        using var read = app.Services.CreateScope();
        var persisted = await read.ServiceProvider.GetRequiredService<AppDbContext>().InsuranceCases.SingleAsync();
        Assert.Equal(item.Id, persisted.Id);
        Assert.Equal(item.ExpiryDate, persisted.ExpiryDate);
        Assert.Equal(item.InsuranceAmount, persisted.InsuranceAmount);
        Assert.Equal(item.OtherCharges, persisted.OtherCharges);
    }

    // Both requests read the same outstanding balance; PostgreSQL must roll back the loser,
    // including its receipt and audit write, instead of collecting RM120 against RM100 due.
    [InsurancePostgresFact]
    public async Task Concurrent_receipt_confirmation_cannot_overcollect_and_retry_is_idempotent()
    {
        await using var app = await CreateIsolatedAppAsync();
        await InsuranceSchema.EnsureAsync(app);
        var item = Case();
        var first = Receipt(item.Id);
        var second = Receipt(item.Id);
        string connection;
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            connection = db.Database.GetConnectionString()!;
            await db.Database.ExecuteSqlRawAsync("""
                CREATE TABLE "AuditLogs" (
                    "Id" uuid PRIMARY KEY, "Actor" text NOT NULL, "Action" text NOT NULL,
                    "EntityName" text NOT NULL, "EntityId" uuid NOT NULL,
                    "CreatedAt" timestamp with time zone NOT NULL);
                """);
            db.AddRange(item, first, second);
            await db.SaveChangesAsync();
        }

        var barrier = new ConfirmationBarrier();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection).AddInterceptors(barrier).Options;
        var actor = new ClaimsPrincipal(new ClaimsIdentity([
            new Claim(ClaimTypes.Name, "synthetic-insurance-reviewer"), new Claim(ClaimTypes.Role, "BossAdmin")
        ], "Test"));
        await using var one = new AppDbContext(options);
        await using var two = new AppDbContext(options);
        var outcomes = await Task.WhenAll(
            InsuranceModule.ConfirmReceiptAsync(one, item.Id, first.Id, actor),
            InsuranceModule.ConfirmReceiptAsync(two, item.Id, second.Id, actor)).WaitAsync(TimeSpan.FromSeconds(20));
        Assert.Single(outcomes, result => result == null);
        Assert.Single(outcomes, result => result != null);

        using var verification = app.Services.CreateScope();
        var check = verification.ServiceProvider.GetRequiredService<AppDbContext>();
        var receipts = await check.InsuranceReceipts.AsNoTracking().ToListAsync();
        var confirmed = Assert.Single(receipts, receipt => receipt.Status == "Confirmed");
        Assert.Single(receipts, receipt => receipt.Status == "Pending");
        Assert.Equal(60m, InsuranceRules.Received(receipts));
        Assert.Equal(2, (await check.InsuranceCases.AsNoTracking().SingleAsync()).Version);
        Assert.Single(await check.AuditLogs.AsNoTracking().ToListAsync());
        Assert.Null(await InsuranceModule.ConfirmReceiptAsync(check, item.Id, confirmed.Id, actor));
        Assert.Equal(60m, InsuranceRules.Received(await check.InsuranceReceipts.AsNoTracking().ToListAsync()));
        Assert.Single(await check.AuditLogs.AsNoTracking().ToListAsync());
    }

    private static InsuranceCase Case() => new()
    {
        PlateNumber = "PGTEST282", CustomerName = "Synthetic insurance customer", Version = 1,
        InsuranceAmount = 100m, RunnerFee = 0, InvoiceNumber = "SYNTHETIC-IV-282",
        ExpiryDate = new DateOnly(2027, 11, 21), OtherCharges = []
    };

    private static InsuranceReceipt Receipt(Guid caseId) => new()
    {
        CaseId = caseId, IdempotencyKey = Guid.NewGuid().ToString("N"), Amount = 60m,
        ReceivedDate = InsuranceRules.Today, InvoiceNumber = "SYNTHETIC-IV-282"
    };

    private static string? TestConnection => Environment.GetEnvironmentVariable("INSURANCE_TEST_POSTGRES")
        ?? Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES");

    private static async Task<WebApplication> CreateIsolatedAppAsync()
    {
        var config = new NpgsqlConnectionStringBuilder(TestConnection) { Pooling = false };
        Assert.Contains(config.Host, new[] { "127.0.0.1", "localhost" });
        Assert.Contains(config.Database, new[] { "insurance_test", "whatsapp_ci" });
        // A generated schema isolates these tests from every other test and application table.
        // The disposable test database owns cleanup; no shared schema/table is dropped here.
        var schema = "insurance_pg_" + Guid.NewGuid().ToString("N");
        await using (var admin = new NpgsqlConnection(config.ConnectionString))
        {
            await admin.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE SCHEMA \"{schema}\"", admin);
            await create.ExecuteNonQueryAsync();
        }
        config.SearchPath = schema;
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.Logging.ClearProviders();
        builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(config.ConnectionString));
        return builder.Build();
    }

    private sealed class ConfirmationBarrier : SaveChangesInterceptor
    {
        private int arrivals;
        private readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(DbContextEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (Interlocked.Increment(ref arrivals) == 2) ready.TrySetResult();
            await ready.Task.WaitAsync(TimeSpan.FromSeconds(10), cancellationToken);
            return result;
        }
    }

    private sealed class InsurancePostgresFactAttribute : FactAttribute
    {
        public InsurancePostgresFactAttribute()
        {
            if (string.IsNullOrWhiteSpace(TestConnection))
                Skip = "Set INSURANCE_TEST_POSTGRES or WHATSAPP_TEST_POSTGRES to an isolated local test database.";
        }
    }
}
