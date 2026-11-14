using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;

namespace YSHeng.Api.Tests;

public sealed class BankSettlementTests
{
    [Fact]
    public async Task Replacement_links_survive_reload_and_prevent_duplicate_conversion()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        var old = new SettlementReminder { Amount = 5000m, BankDebtAmount = 15000m, Direction = SettlementDirection.PaySeller, Deadline = new DateOnly(2026, 12, 1) };
        var bank = BankSettlementRules.PrepareReplacement(old, "Test Bank", "00123");
        db.SettlementReminders.Add(old with { SupersededById = bank.Id });
        db.SettlementReminders.Add(bank);
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        var records = await db.SettlementReminders.ToListAsync();
        Assert.Equal(15000m, records.Where(SettlementRules.IsPayable).Sum(x => x.Amount));
        Assert.Equal(5000m, records.Single(x => x.Id == old.Id).Amount);
        Assert.Equal("00123", records.Single(x => x.Id == bank.Id).BankAccountNumber);
        db.SettlementReminders.Add(bank with { Id = Guid.NewGuid() });
        await Assert.ThrowsAsync<DbUpdateException>(() => db.SaveChangesAsync());
    }

    [Fact]
    public void Digest_names_bank_payee_and_omits_replaced_seller()
    {
        var today = new DateOnly(2026, 12, 1);
        var vehicle = new Vehicle { PlateNumber = "TEST123" };
        var bank = BankSettlementRules.Create(vehicle, 15000m, today, "Test Bank", "00123");
        var old = new SettlementReminder { VehicleId = vehicle.Id, Amount = 5000m, Deadline = today, SupersededById = bank.Id };
        var digest = WhatsAppDueDigest.Project(new([old, bank], [], [], [], [], [vehicle]), today, 2, "boss", "BossAdmin");
        Assert.NotNull(digest);
        Assert.Single(digest.Items);
        Assert.Contains("Pay to bank", digest.Body);
        Assert.DoesNotContain("Pay seller", digest.Body);
    }

    [Fact]
    public void Bank_payment_uses_debt_not_seller_difference_or_purchase_price()
    {
        var vehicle = new Vehicle { PurchasePrice = 0 };
        var record = BankSettlementRules.Create(vehicle, 15000m, new DateOnly(2026, 12, 1), "Test Bank", "00123");
        Assert.Equal(SettlementDirection.PayBank, record.Direction);
        Assert.Equal(15000m, record.Amount);
        Assert.True(BankSettlementRules.Validate(record).IsValid);
    }

    [Fact]
    public void Conversion_preserves_original_and_excludes_superseded_payment_from_reminders()
    {
        var source = new SettlementReminder { Direction = SettlementDirection.PaySeller, Amount = 5000m, BankDebtAmount = 15000m, PurchasePriceSnapshot = 20000m, Deadline = new DateOnly(2026, 12, 1) };
        var replacement = BankSettlementRules.PrepareReplacement(source, "Test Bank", "00123");
        var superseded = source with { SupersededById = replacement.Id };
        Assert.Equal(5000m, superseded.Amount);
        Assert.Equal(SettlementDirection.PaySeller, superseded.Direction);
        Assert.Equal(source.Id, replacement.ReplacesSettlementId);
        Assert.Equal(15000m, replacement.Amount);
        Assert.False(SettlementRules.RequiresReminder(superseded));
        Assert.False(SettlementRules.IsPayable(superseded));
        Assert.Throws<InvalidOperationException>(() => BankSettlementRules.PrepareReplacement(superseded, "Test Bank", "00123"));
    }

    [Fact]
    public void Paid_history_and_missing_debt_cannot_be_converted()
    {
        var source = new SettlementReminder { BankDebtAmount = 5000m, IsPaid = true };
        Assert.Throws<InvalidOperationException>(() => BankSettlementRules.PrepareReplacement(source, "Test Bank", "00123"));
        Assert.Throws<InvalidOperationException>(() => BankSettlementRules.PrepareReplacement(source with { IsPaid = false, BankDebtAmount = null }, "Test Bank", "00123"));
    }

    [Fact]
    public void Completion_requires_evidence_from_same_vehicle_and_payment_date()
    {
        var record = BankSettlementRules.Create(new Vehicle(), 100m, new DateOnly(2026, 12, 1), "Test Bank", "00123");
        var document = new DocumentBlob { VehicleId = Guid.NewGuid(), Category = FileCategory.BankSettlementPayment, BankSettlementId = record.Id };
        Assert.False(BankSettlementRules.ValidateEvidence(record, document, new DateOnly(2026, 12, 1)).IsValid);
        Assert.False(BankSettlementRules.ValidateEvidence(record, document with { VehicleId = record.VehicleId }, default).IsValid);
        Assert.False(BankSettlementRules.ValidateEvidence(record, document with { VehicleId = record.VehicleId, BankSettlementId = Guid.NewGuid() }, new DateOnly(2026, 12, 1)).IsValid);
        Assert.True(BankSettlementRules.ValidateEvidence(record, document with { VehicleId = record.VehicleId }, new DateOnly(2026, 12, 1)).IsValid);
        Assert.False(BankSettlementRules.ValidateEvidence(record, document with { VehicleId = record.VehicleId, OwnershipType = DocumentOwnershipType.Buyer }, new DateOnly(2026, 12, 1)).IsValid);
        Assert.False(BankSettlementRules.ValidateEvidence(record, document with { VehicleId = record.VehicleId, InspectionId = Guid.NewGuid() }, new DateOnly(2026, 12, 1)).IsValid);
        Assert.False(BankSettlementRules.ValidateEvidence(record, document with { VehicleId = record.VehicleId, CustomerId = Guid.NewGuid() }, new DateOnly(2026, 12, 1)).IsValid);

    }
}
