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
        Assert.Contains("SalesInvoices", workbook);
        Assert.Contains("Collections", workbook);
        Assert.Contains("Remark", Read(archive, "xl/worksheets/sheet1.xml"));
        Assert.Contains("direct AutoCount import", Read(archive, "xl/worksheets/sheet1.xml"));
        Assert.Contains("ABC1234", Read(archive, "xl/worksheets/sheet3.xml"));
        Assert.Contains("Test Buyer", Read(archive, "xl/worksheets/sheet2.xml"));
        Assert.Contains("t=\"n\"><v>50000</v>", Read(archive, "xl/worksheets/sheet5.xml"));
    }

    [Fact]
    public void Export_adds_v2_invoice_and_collection_sheets_without_moving_legacy_sheets()
    {
        var vehicle = new Vehicle { PlateNumber = "V2CAR", IntakeDate = new DateOnly(2026, 8, 1), CustomerId = Guid.NewGuid() };
        var customer = new Customer { Id = vehicle.CustomerId!.Value, Name = "V2 Buyer" };
        var payment = new PaymentRecord { VehicleId = vehicle.Id, CustomerId = customer.Id, NettPrice = 500m, FinanceWorkflowVersion = 2, CreatedAt = new DateTime(2026, 8, 2, 0, 0, 0, DateTimeKind.Utc) };
        var invoice = new FinanceInvoice { PaymentRecordId = payment.Id, VehicleId = vehicle.Id, CustomerId = customer.Id, CustomerName = customer.Name, VehiclePlateNumber = vehicle.PlateNumber, InvoiceNumber = "YSH-INV-2026-000001", InvoiceDate = new DateOnly(2026, 8, 2), Amount = 500m };
        var collection = new CollectionTransaction { PaymentRecordId = payment.Id, Amount = 200m, Method = CollectionMethod.DownPayment, Status = CollectionStatus.Reconciled, Reference = "PAY-1", ReceivedDate = new DateOnly(2026, 8, 3), CreatedBy = "finance-1" };
        var input = Input([vehicle], [customer], [payment]) with { FinanceInvoices = [invoice], Collections = [collection] };

        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        Assert.Contains("YSH-INV-2026-000001", Read(archive, "xl/worksheets/sheet7.xml"));
        Assert.Contains("PAY-1", Read(archive, "xl/worksheets/sheet8.xml"));
        Assert.Contains("DownPayment", Read(archive, "xl/worksheets/sheet8.xml"));
        Assert.Contains("Expenses", Read(archive, "xl/workbook.xml"));
    }

    [Fact]
    public void August_collection_keeps_its_july_invoice_reference_without_reexporting_the_july_invoice()
    {
        var vehicle = new Vehicle { PlateNumber = "PERIOD1", IntakeDate = new DateOnly(2026, 7, 1), CustomerId = Guid.NewGuid() };
        var customer = new Customer { Id = vehicle.CustomerId!.Value, Name = "Period Buyer" };
        var payment = new PaymentRecord
        {
            VehicleId = vehicle.Id,
            CustomerId = customer.Id,
            NettPrice = 500m,
            FinanceWorkflowVersion = 2,
            CreatedAt = new DateTime(2026, 7, 2, 0, 0, 0, DateTimeKind.Utc)
        };
        var invoice = new FinanceInvoice
        {
            PaymentRecordId = payment.Id,
            VehicleId = vehicle.Id,
            CustomerId = customer.Id,
            CustomerName = customer.Name,
            VehiclePlateNumber = vehicle.PlateNumber,
            InvoiceNumber = "YSH-INV-2026-000099",
            InvoiceDate = new DateOnly(2026, 7, 2),
            Amount = 500m
        };
        var collection = new CollectionTransaction
        {
            PaymentRecordId = payment.Id,
            Amount = 200m,
            Method = CollectionMethod.BankTransfer,
            Status = CollectionStatus.Reconciled,
            Reference = "AUG-PAY-1",
            ReceivedDate = new DateOnly(2026, 8, 3)
        };
        var input = Input([vehicle], [customer], [payment]) with
        {
            FinanceInvoices = [invoice],
            Collections = [collection],
            From = new DateOnly(2026, 8, 1),
            To = new DateOnly(2026, 8, 31)
        };

        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        var salesInvoices = Read(archive, "xl/worksheets/sheet7.xml");
        var collections = Read(archive, "xl/worksheets/sheet8.xml");
        Assert.DoesNotContain(invoice.InvoiceNumber, salesInvoices);
        Assert.Contains(invoice.InvoiceNumber, collections);
        Assert.Contains(collection.Reference, collections);
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

    [Fact]
    public void Export_keeps_classification_separate_from_tax_code_and_uses_approved_accounts()
    {
        var vehicle = new Vehicle { PlateNumber = "MAP025", IntakeDate = new DateOnly(2026, 8, 1), CustomerId = Guid.NewGuid() };
        var customer = new Customer { Id = vehicle.CustomerId!.Value, Name = "Mapped Buyer", TinNumber = "IG123" };
        var payment = new PaymentRecord { VehicleId = vehicle.Id, CustomerId = customer.Id, SalesAgentName = "Agent One", SalesPrice = 50_000m, InsurancePaidOnBehalfAmount = 1_000m, RoadTaxPaidOnBehalfAmount = 100m };
        var invoice = new FinanceInvoice
        {
            PaymentRecordId = payment.Id, VehicleId = vehicle.Id, CustomerId = customer.Id, CustomerName = customer.Name,
            CustomerTinNumber = customer.TinNumber, VehiclePlateNumber = vehicle.PlateNumber, InvoiceNumber = "INV-MAP-1",
            InvoiceDate = new DateOnly(2026, 8, 2), SalesPrice = 50_000m, InsurancePaidOnBehalfAmount = 1_000m, RoadTaxPaidOnBehalfAmount = 100m
        };
        var purchase = new PurchaseInvoice
        {
            VehicleId = vehicle.Id, InvoiceNumber = "PI-MAP-1", InvoiceDate = new DateOnly(2026, 8, 1), Amount = 4m,
            Lines =
            [
                new PurchaseInvoiceLine { LineType = PurchaseInvoiceLineType.VehiclePurchase, Description = "Vehicle", Amount = 1m },
                new PurchaseInvoiceLine { LineType = PurchaseInvoiceLineType.PurchaseProcessing, Description = "Processing", Amount = 1m },
                new PurchaseInvoiceLine { LineType = PurchaseInvoiceLineType.Parking, Description = "Parking", Amount = 1m },
                new PurchaseInvoiceLine { LineType = PurchaseInvoiceLineType.Refurbishment, Description = "Refurbishment", Amount = 1m }
            ]
        };

        var input = Input([vehicle], [customer], [payment]) with { FinanceInvoices = [invoice], PurchaseInvoices = [purchase] };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        var salesLines = Read(archive, "xl/worksheets/sheet11.xml");
        var purchaseLines = Read(archive, "xl/worksheets/sheet4.xml");

        Assert.Contains("ClassificationCode", salesLines);
        Assert.Contains("TaxCode", salesLines);
        Assert.Contains("5500-0000", salesLines);
        Assert.Contains(">025<", salesLines);
        Assert.Contains("4001-I001", salesLines);
        Assert.Contains("4001-R001", salesLines);
        Assert.Contains(">006<", salesLines);
        Assert.Contains("IG123", salesLines);
        Assert.Contains("6P00-0000", purchaseLines);
        Assert.Contains("6P00-1000", purchaseLines);
        Assert.Contains("6T00-1000", purchaseLines);
        Assert.Contains("6R00-0000", purchaseLines);
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
