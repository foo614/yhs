using Microsoft.EntityFrameworkCore;
using Npgsql;
using Xunit;
using YSHeng.Api;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;

namespace YSHeng.Api.Tests;

public sealed class LoanWorkflowPostgresTests
{
    [LoanPostgresFact]
    public async Task Loan_schema_upgrade_is_idempotent_and_preserves_legacy_rows()
    {
        var config = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES"));
        Assert.Contains(config.Host, new[] { "127.0.0.1", "localhost" });
        Assert.Equal("whatsapp_ci", config.Database);
        var database = "loan_schema_check_" + Guid.NewGuid().ToString("N");
        config.Pooling = false;
        await using var admin = new NpgsqlConnection(config.ConnectionString);
        await admin.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", admin)) await create.ExecuteNonQueryAsync();
        config.Database = database;
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(config.ConnectionString).Options;
        try
        {
            var vehicle = new Vehicle { PlateNumber = "LOANPG1", Make = "Synthetic", Model = "Loan", Year = 2026 };
            var customer = new Customer { Name = "Loan PG Customer", Phone = "0100000000" };
            var loan = new LoanApplication { VehicleId = vehicle.Id, CustomerId = customer.Id, Status = LoanStatus.Pending, SubmittedAt = new DateOnly(2026, 11, 1) };
            await using (var db = new AppDbContext(options))
            {
                await db.Database.EnsureCreatedAsync();
                db.AddRange(vehicle, customer, loan);
                await db.SaveChangesAsync();
                await db.Database.ExecuteSqlRawAsync("ALTER TABLE \"LoanApplications\" DROP COLUMN IF EXISTS \"LastUpdatedAt\"; ALTER TABLE \"LoanApplications\" DROP COLUMN IF EXISTS \"BankSubmittedAt\"; ALTER TABLE \"LoanApplications\" DROP COLUMN IF EXISTS \"FinalLouDocumentId\";");
            }

            await using (var upgraded = new AppDbContext(options))
            {
                await SeedData.EnsureLoanWorkflowSchemaAsync(upgraded);
                await SeedData.EnsureLoanWorkflowSchemaAsync(upgraded);
                var preserved = await upgraded.LoanApplications.AsNoTracking().SingleAsync(item => item.Id == loan.Id);
                Assert.Equal(LoanStatus.Pending, preserved.Status);
                Assert.Equal(loan.SubmittedAt, preserved.SubmittedAt);
                Assert.Null(preserved.LastUpdatedAt);
                Assert.Null(preserved.BankSubmittedAt);
                Assert.Null(preserved.FinalLouDocumentId);
                Assert.Equal(2, await upgraded.Database.SqlQueryRaw<int>("""
                    SELECT COUNT(*)::integer AS "Value"
                    FROM information_schema.columns
                    WHERE table_name = 'LoanApplications'
                      AND column_name IN ('LastUpdatedAt', 'BankSubmittedAt')
                    """).SingleAsync());
            }
        }
        finally
        {
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }

    [LoanPostgresFact]
    public async Task Loan_advisory_lock_serializes_concurrent_bank_mutations()
    {
        var config = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES"));
        var database = "loan_lock_check_" + Guid.NewGuid().ToString("N");
        config.Pooling = false;
        await using var admin = new NpgsqlConnection(config.ConnectionString);
        await admin.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", admin)) await create.ExecuteNonQueryAsync();
        config.Database = database;
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(config.ConnectionString).Options;
        try
        {
            await using (var db = new AppDbContext(options)) await db.Database.EnsureCreatedAsync();
            var vehicleId = Guid.NewGuid();
            var loanId = Guid.NewGuid();
            var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var first = Task.Run(async () =>
            {
                await using var db = new AppDbContext(options);
                await using var transaction = await DeliveryConcurrencyLock.BeginLoanAsync(db, vehicleId, loanId);
                started.SetResult();
                await release.Task.WaitAsync(TimeSpan.FromSeconds(10));
                await transaction.CommitAsync();
            });
            await started.Task.WaitAsync(TimeSpan.FromSeconds(10));

            var second = Task.Run(async () =>
            {
                await using var db = new AppDbContext(options);
                await using var transaction = await DeliveryConcurrencyLock.BeginLoanAsync(db, vehicleId, loanId);
                await transaction.CommitAsync();
            });
            await Task.Delay(150);
            Assert.False(second.IsCompleted);
            release.SetResult();
            await Task.WhenAll(first, second);
        }
        finally
        {
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }

    [LoanPostgresFact]
    public async Task Customer_identity_lock_prevents_concurrent_duplicate_phone_or_ic_creation()
    {
        var config = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES"));
        var database = "customer_identity_lock_" + Guid.NewGuid().ToString("N");
        config.Pooling = false;
        await using var admin = new NpgsqlConnection(config.ConnectionString);
        await admin.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", admin)) await create.ExecuteNonQueryAsync();
        config.Database = database;
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(config.ConnectionString).Options;
        try
        {
            await using (var db = new AppDbContext(options)) await db.Database.EnsureCreatedAsync();
            var firstCustomer = new Customer { Name = "First", Phone = "012-345 6789", IcNumber = "900101-01-1234" };
            var duplicateCustomer = new Customer { Name = "Duplicate", Phone = "0123456789", IcNumber = "900101011234" };
            var firstSaved = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var releaseFirst = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

            var first = Task.Run(async () =>
            {
                await using var db = new AppDbContext(options);
                await using var transaction = await CustomerIdentityConcurrencyLock.BeginAsync(db, firstCustomer);
                db.Customers.Add(firstCustomer);
                await db.SaveChangesAsync();
                firstSaved.SetResult();
                await releaseFirst.Task.WaitAsync(TimeSpan.FromSeconds(10));
                await transaction.CommitAsync();
            });
            await firstSaved.Task.WaitAsync(TimeSpan.FromSeconds(10));

            var second = Task.Run(async () =>
            {
                await using var db = new AppDbContext(options);
                await using var transaction = await CustomerIdentityConcurrencyLock.BeginAsync(db, duplicateCustomer);
                var customers = await db.Customers.AsNoTracking().ToListAsync();
                return (
                    Phone: ContactRules.ValidateUniqueCustomerPhone(duplicateCustomer, customers),
                    Ic: ContactRules.ValidateUniqueCustomerIcNumber(duplicateCustomer, customers));
            });
            await Task.Delay(150);
            Assert.False(second.IsCompleted);
            releaseFirst.SetResult();

            var duplicateValidation = await second;
            await first;
            Assert.False(duplicateValidation.Phone.IsValid);
            Assert.False(duplicateValidation.Ic.IsValid);
            await using var verification = new AppDbContext(options);
            Assert.Single(await verification.Customers.AsNoTracking().ToListAsync());
        }
        finally
        {
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }

    private sealed class LoanPostgresFactAttribute : FactAttribute
    {
        public LoanPostgresFactAttribute()
        {
            if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES")))
                Skip = "Requires the isolated PostgreSQL CI service; never uses an application database.";
        }
    }
}
