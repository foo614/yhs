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
