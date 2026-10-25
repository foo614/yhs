using System.Data.Common;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class FinanceLegacyPersistenceTests
{
    // Exercise the real EF read projection: lost/duplicated partial balances or date proxies
    // would make the Dashboard drill-down disagree with its existing financial headline.
    [Fact]
    public async Task Collection_ageing_read_reconciles_with_headline_without_inventing_due_dates()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        var commands = new RecordingCommandInterceptor();
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).AddInterceptors(commands).Options;
        await using var db = new AppDbContext(options);
        await db.Database.EnsureCreatedAsync();
        var today = new DateOnly(2026, 10, 25);
        var sharedVehicle = Guid.NewGuid();
        PaymentRecord[] payments = [
            new() { VehicleId = sharedVehicle, FinanceWorkflowVersion = 2, NettPrice = 100.25m, BankFollowUpDate = today.AddDays(-40) },
            new() { VehicleId = sharedVehicle, NettPrice = 50.50m, Status = PaymentStatus.Pending, CreatedAt = DateTime.UtcNow.AddYears(-1) },
            new() { NettPrice = 80m, Status = PaymentStatus.Reconciled },
            new() { FinanceWorkflowVersion = 2, NettPrice = 20m },
            new() { NettPrice = 0m }
        ];
        CollectionTransaction[] collections = [
            new() { PaymentRecordId = payments[0].Id, IdempotencyKey = Guid.NewGuid(), Amount = 30.10m, Status = CollectionStatus.Reconciled },
            new() { PaymentRecordId = payments[0].Id, IdempotencyKey = Guid.NewGuid(), Amount = 15m, Status = CollectionStatus.Pending },
            new() { PaymentRecordId = payments[0].Id, IdempotencyKey = Guid.NewGuid(), Amount = 12m, Status = CollectionStatus.Reversed },
            new() { PaymentRecordId = payments[3].Id, IdempotencyKey = Guid.NewGuid(), Amount = 25m, Status = CollectionStatus.Reconciled }
        ];
        DebtRecoveryCase[] debts = [
            new() { VehicleId = sharedVehicle, BalanceAmount = 10.20m, FollowUpDate = today.AddDays(-60) },
            new() { BalanceAmount = 11m, Status = DebtRecoveryStatus.FollowedUp, FollowUpDate = today.AddDays(1) },
            new() { BalanceAmount = 90m, Status = DebtRecoveryStatus.Closed }
        ];
        db.PaymentRecords.AddRange(payments);
        db.CollectionTransactions.AddRange(collections);
        db.DebtRecoveryCases.AddRange(debts);
        await db.SaveChangesAsync();
        commands.Clear();

        var records = await CollectionAgeingQueries.ReadAsync(db, CancellationToken.None);
        var ageing = CollectionAgeingRules.Summarize(records, today);
        var headline = DashboardMetrics.Create([], [], [], payments, [], [], [], [], [], [], debts, [], today, collections: collections);
        Assert.Equal(141.85m, ageing.TotalAmount);
        Assert.Equal(headline.OutstandingCollection, ageing.TotalAmount);
        Assert.Equal(ageing.TotalAmount, ageing.Buckets.Sum(bucket => bucket.Amount));
        Assert.Equal(4, ageing.TotalCount);
        Assert.Equal(4, records.Select(record => (record.SourceType, record.SourceId)).Distinct().Count());
        Assert.All(records, record => Assert.Null(record.DueDate));
        Assert.Equal(3, commands.CommandTexts.Count);
        Assert.All(commands.CommandTexts, command => Assert.StartsWith("SELECT", command));
        Assert.DoesNotContain(commands.CommandTexts, command => command.Contains("Content", StringComparison.Ordinal));
        Assert.Equal(4, ageing.Buckets.Single(bucket => bucket.Key == "UnknownDueDate").Count);
        Assert.All(ageing.Buckets.Where(bucket => bucket.Key != "UnknownDueDate"), bucket => Assert.Equal(0m, bucket.Amount));
        Assert.Equal("Asia/Singapore", ageing.TimeZone);
        Assert.Equal(today, ageing.AsOfDate);
        Assert.DoesNotContain(records, record => record.SourceId == payments[2].Id || record.SourceId == payments[3].Id || record.SourceId == debts[2].Id);
    }

    [Fact]
    public void Create_and_legacy_update_persist_all_retained_autocount_columns()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        var commands = new RecordingCommandInterceptor();
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(connection)
            .AddInterceptors(commands)
            .Options;

        using (var setup = new AppDbContext(options))
        {
            setup.Database.EnsureCreated();
        }

        var vehicle = new Vehicle { Id = Guid.NewGuid(), SellingPrice = 150_000m, BossConfirmed = true };
        var request = new FinanceSaleRequest(vehicle.Id, 150_000m, 0, 0, 0, null, null, "sales-1");
        var created = FinanceV2Rules.CreatePayment(request, vehicle, Guid.NewGuid(), "finance-1", DateTime.UtcNow);

        commands.Clear();
        using (var insertDb = new AppDbContext(options))
        {
            insertDb.PaymentRecords.Add(created);
            insertDb.SaveChanges();
        }

        Assert.Contains(commands.CommandTexts, command => IsPaymentWrite(command, "INSERT") && HasLegacyColumns(command));
        using (var readDb = new AppDbContext(options))
        {
            var stored = readDb.PaymentRecords.AsNoTracking().Single(payment => payment.Id == created.Id);
            Assert.False(stored.InvoiceGenerated);
            Assert.False(stored.AutoCountKeyed);
            Assert.Equal(0, stored.ExternalSyncStatus);
        }

        PaymentRecord existing;
        using (var seedLegacyDb = new AppDbContext(options))
        {
            var tracked = seedLegacyDb.PaymentRecords.Single(payment => payment.Id == created.Id);
            existing = tracked with
            {
                InvoiceGenerated = true,
                AutoCountKeyed = true,
                ExternalSyncStatus = 2
            };
            seedLegacyDb.Entry(tracked).CurrentValues.SetValues(existing);
            seedLegacyDb.SaveChanges();
        }

        var preserved = FinanceV2Rules.PreserveServerOwnedFields(existing, existing with
        {
            InvoiceGenerated = false,
            AutoCountKeyed = false,
            ExternalSyncStatus = 0
        });

        commands.Clear();
        using (var updateDb = new AppDbContext(options))
        {
            updateDb.PaymentRecords.Update(preserved);
            updateDb.SaveChanges();
        }

        Assert.Contains(commands.CommandTexts, command => IsPaymentWrite(command, "UPDATE") && HasLegacyColumns(command));
        using var verifyDb = new AppDbContext(options);
        var updated = verifyDb.PaymentRecords.AsNoTracking().Single(payment => payment.Id == created.Id);
        Assert.True(updated.InvoiceGenerated);
        Assert.True(updated.AutoCountKeyed);
        Assert.Equal(2, updated.ExternalSyncStatus);
    }

    private static bool IsPaymentWrite(string command, string operation) =>
        command.Contains(operation, StringComparison.OrdinalIgnoreCase)
        && command.Contains("PaymentRecords", StringComparison.OrdinalIgnoreCase);

    private static bool HasLegacyColumns(string command) =>
        command.Contains("InvoiceGenerated", StringComparison.Ordinal)
        && command.Contains("AutoCountKeyed", StringComparison.Ordinal)
        && command.Contains("ExternalSyncStatus", StringComparison.Ordinal);

    private sealed class RecordingCommandInterceptor : DbCommandInterceptor
    {
        public List<string> CommandTexts { get; } = [];

        public void Clear() => CommandTexts.Clear();

        public override InterceptionResult<int> NonQueryExecuting(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<int> result)
        {
            CommandTexts.Add(command.CommandText);
            return result;
        }

        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command, CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            CommandTexts.Add(command.CommandText);
            return ValueTask.FromResult(result);
        }

        public override InterceptionResult<DbDataReader> ReaderExecuting(
            DbCommand command,
            CommandEventData eventData,
            InterceptionResult<DbDataReader> result)
        {
            CommandTexts.Add(command.CommandText);
            return result;
        }
    }
}
