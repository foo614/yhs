using System.IO.Compression;
using System.Text;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class StockListExportTests
{
    [Fact]
    public void Export_contains_only_slide_18_columns_and_source_codes()
    {
        var ksa = VehicleSeed.Available(publicVisible: false) with
        {
            PlateNumber = "KSA1234",
            Model = "=Civic",
            PurchaseSource = VehiclePurchaseSource.KSA,
            HasSpareKey = true,
            PurchasePrice = 999_999m,
            OwnerId = Guid.NewGuid(),
            CustomerId = Guid.NewGuid()
        };
        var sold = ksa with { Id = Guid.NewGuid(), PlateNumber = "SOLD123", Status = VehicleStatus.Sold };

        var workbook = StockListExport.Export(
            [ksa, sold],
            [new SettlementReminder { VehicleId = ksa.Id, BankDebtAmount = 123_456m, BankName = "CIMB" }],
            new StockListExportFilter(VehiclePurchaseSource.KSA));
        var sheet = ReadSheet(workbook);

        Assert.Contains("Purchase Source", sheet);
        Assert.Contains("KLG", sheet);
        Assert.Contains("CIMB", sheet);
        Assert.Contains("Yes", sheet);
        Assert.DoesNotContain("TIN", sheet, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("PurchasePrice", sheet, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("999999", sheet, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("123456", sheet, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("SOLD123", sheet, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("UCD Date", sheet);
        Assert.DoesNotContain("<f>", sheet, StringComparison.OrdinalIgnoreCase); // Values are inline strings, never formulas.
    }

    [Fact]
    public void Export_defaults_to_current_stock_and_keeps_ucd_date_blank()
    {
        var vehicle = VehicleSeed.Available(publicVisible: false) with
        {
            PlateNumber = "TEST123",
            PurchaseSource = VehiclePurchaseSource.Carro,
            HasSpareKey = false
        };

        var sheet = ReadSheet(StockListExport.Export([vehicle], [], new StockListExportFilter()));

        Assert.Contains("MY", sheet);
        Assert.Contains("S.Key", sheet);
        Assert.Contains("<c r=\"G2\" t=\"inlineStr\"><is><t xml:space=\"preserve\"></t>", sheet);
    }

    [Fact]
    public void Paid_or_superseded_bank_debt_is_not_exported_as_outstanding()
    {
        var vehicle = VehicleSeed.Available(publicVisible: false);
        var sheet = ReadSheet(StockListExport.Export([vehicle], [
            new SettlementReminder { VehicleId = vehicle.Id, BankDebtAmount = 50_000m, IsPaid = true, Direction = SettlementDirection.PayBank },
            new SettlementReminder { VehicleId = vehicle.Id, BankDebtAmount = 50_000m, SupersededById = Guid.NewGuid() }
        ], new StockListExportFilter()));
        Assert.Contains("<c r=\"H2\" t=\"inlineStr\"><is><t xml:space=\"preserve\">CASH</t>", sheet);
    }

    private static string ReadSheet(byte[] workbook)
    {
        using var archive = new ZipArchive(new MemoryStream(workbook), ZipArchiveMode.Read);
        using var stream = archive.GetEntry("xl/worksheets/sheet1.xml")!.Open();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }
}
