using System.IO.Compression;
using System.Text;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class AutoCountExportTests
{
    [Fact]
    public void Export_creates_valid_xlsx_with_manifest_categories_and_remarks()
    {
        var vehicle = new Vehicle
        {
            PlateNumber = "ABC1234",
            Make = "YS",
            Model = "Test",
            IntakeDate = new DateOnly(2026, 8, 1),
            CustomerId = Guid.NewGuid()
        };
        var customer = new Customer { Id = vehicle.CustomerId!.Value, Name = "Test Buyer" };
        var payment = new PaymentRecord { VehicleId = vehicle.Id, NettPrice = 50000m, CreatedAt = new DateTime(2026, 8, 2, 3, 0, 0, DateTimeKind.Utc) };

        var bytes = AutoCountExcel.Export(Input([vehicle], [customer], [payment]));

        using var archive = new ZipArchive(new MemoryStream(bytes), ZipArchiveMode.Read);
        Assert.NotNull(archive.GetEntry("[Content_Types].xml"));
        var workbook = Read(archive, "xl/workbook.xml");
        Assert.Contains("Manifest", workbook);
        Assert.Contains("Customers", workbook);
        Assert.Contains("Vehicles", workbook);
        Assert.Contains("Purchases", workbook);
        Assert.Contains("Payments", workbook);
        Assert.Contains("Expenses", workbook);
        Assert.Contains("Remark", Read(archive, "xl/worksheets/sheet1.xml"));
        Assert.Contains("direct AutoCount import", Read(archive, "xl/worksheets/sheet1.xml"));
        Assert.Contains("ABC1234", Read(archive, "xl/worksheets/sheet3.xml"));
        Assert.Contains("Test Buyer", Read(archive, "xl/worksheets/sheet2.xml"));
        Assert.Contains("t=\"n\"><v>50000</v>", Read(archive, "xl/worksheets/sheet5.xml"));
    }

    [Fact]
    public void Export_uses_transaction_date_and_keeps_referenced_july_vehicle_master_for_august_transaction()
    {
        var julyVehicle = new Vehicle { PlateNumber = "JULY123", IntakeDate = new DateOnly(2026, 7, 31), CustomerId = Guid.NewGuid() };
        var augustVehicle = new Vehicle { PlateNumber = "OUT123", IntakeDate = new DateOnly(2026, 8, 20) };
        var customer = new Customer { Id = julyVehicle.CustomerId!.Value, Name = "Referenced Buyer" };
        var input = Input(
            [julyVehicle, augustVehicle],
            [customer],
            [new PaymentRecord { VehicleId = julyVehicle.Id, NettPrice = 1, CreatedAt = new DateTime(2026, 8, 11, 0, 0, 0, DateTimeKind.Utc) }]) with
        {
            PaymentVouchers = [new PaymentVoucher { VehicleId = julyVehicle.Id, IssuedDate = new DateOnly(2026, 8, 12), Amount = 2, PayeeName = "Pickup" }],
            DebtRecoveries = [new DebtRecoveryCase { VehicleId = julyVehicle.Id, CustomerId = customer.Id, FollowUpDate = new DateOnly(2026, 8, 13), BalanceAmount = 3 }],
            Settlements = [new SettlementReminder { VehicleId = julyVehicle.Id, Deadline = new DateOnly(2026, 8, 14), Amount = 4 }],
            From = new DateOnly(2026, 8, 10),
            To = new DateOnly(2026, 8, 15)
        };

        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        var vehicles = Read(archive, "xl/worksheets/sheet3.xml");
        var payments = Read(archive, "xl/worksheets/sheet5.xml");
        var expenses = Read(archive, "xl/worksheets/sheet6.xml");
        var customers = Read(archive, "xl/worksheets/sheet2.xml");
        Assert.Contains("JULY123", vehicles);
        Assert.DoesNotContain("OUT123", vehicles);
        Assert.Contains("JULY123", payments);
        Assert.Contains("JULY123", expenses);
        Assert.Contains("Referenced Buyer", customers);
    }

    [Fact]
    public void Payment_period_uses_Singapore_accounting_date_at_utc_month_boundary()
    {
        Assert.Equal(new DateOnly(2026, 7, 31), AutoCountDateRules.SingaporeAccountingDate(new DateTime(2026, 7, 31, 15, 59, 0, DateTimeKind.Utc)));
        Assert.Equal(new DateOnly(2026, 8, 1), AutoCountDateRules.SingaporeAccountingDate(new DateTime(2026, 7, 31, 16, 0, 0, DateTimeKind.Utc)));

        var vehicle = new Vehicle { PlateNumber = "SGT123", IntakeDate = new DateOnly(2026, 7, 1) };
        var input = Input(vehicles: [vehicle], payments:
        [
            new PaymentRecord { VehicleId = vehicle.Id, NettPrice = 1, CreatedAt = new DateTime(2026, 7, 31, 15, 59, 0, DateTimeKind.Utc) },
            new PaymentRecord { VehicleId = vehicle.Id, NettPrice = 2, CreatedAt = new DateTime(2026, 7, 31, 16, 0, 0, DateTimeKind.Utc) }
        ]) with { From = new DateOnly(2026, 8, 1), To = new DateOnly(2026, 8, 1) };

        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        var payments = Read(archive, "xl/worksheets/sheet5.xml");
        Assert.DoesNotContain("<v>1</v>", payments);
        Assert.Contains("<v>2</v>", payments);
        Assert.Contains("2026-08-01", payments);
    }

    [Fact]
    public void Period_validation_rejects_reverse_ranges_and_labels_audit_scope()
    {
        Assert.False(AutoCountDateRules.IsValidPeriod(new DateOnly(2026, 8, 2), new DateOnly(2026, 8, 1)));
        Assert.True(AutoCountDateRules.IsValidPeriod(new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 2)));
        Assert.Equal("20260801-20260831", AutoCountDateRules.PeriodLabel(new DateOnly(2026, 8, 1), new DateOnly(2026, 8, 31)));
        Assert.Equal("all", AutoCountDateRules.PeriodLabel(null, null));
    }

    private static AutoCountExportInput Input(IReadOnlyList<Vehicle>? vehicles = null, IReadOnlyList<Customer>? customers = null, IReadOnlyList<PaymentRecord>? payments = null) =>
        new(vehicles ?? [], customers ?? [], [], [], payments ?? [], [], [], [], [], [], [], null, null, new DateTime(2026, 8, 22, 0, 0, 0, DateTimeKind.Utc));

    private static string Read(ZipArchive archive, string path)
    {
        using var stream = archive.GetEntry(path)!.Open();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }
}
