using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
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
            CustomerId = Guid.NewGuid(),
            PurchasePrice = 42000m,
            ModifiedPurchasePrice = 40000m
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
        Assert.Contains("PasteGuide", workbook);
        Assert.Contains("ABC1234", Read(archive, "xl/worksheets/sheet3.xml"));
        var vehicles = Read(archive, "xl/worksheets/sheet3.xml");
        Assert.Contains("42000", vehicles);
        Assert.Contains("40000", vehicles);
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
    public void Export_distinguishes_calculated_seller_payment_collection_and_internal_offset_without_auto_posting()
    {
        var vehicle = new Vehicle { PlateNumber = "SETTLE1", IntakeDate = new DateOnly(2026, 8, 1) };
        var deadline = new DateOnly(2026, 8, 14);
        var settlements = new[]
        {
            new SettlementReminder { VehicleId = vehicle.Id, Direction = SettlementDirection.PaySeller, PurchasePriceSnapshot = 50_000m, BankDebtAmount = 20_000m, Amount = 30_000m, Deadline = deadline },
            new SettlementReminder { VehicleId = vehicle.Id, Direction = SettlementDirection.CollectFromSeller, PurchasePriceSnapshot = 50_000m, BankDebtAmount = 60_000m, Amount = 10_000m, Deadline = deadline },
            new SettlementReminder { VehicleId = vehicle.Id, Direction = SettlementDirection.InternalOffset, PurchasePriceSnapshot = 50_000m, BankDebtAmount = 50_000m, Amount = 0m, Deadline = deadline }
        };

        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(Input([vehicle]) with { Settlements = settlements })), ZipArchiveMode.Read);
        var expenses = Read(archive, "xl/worksheets/sheet6.xml");

        Assert.Contains("SettlementPaySeller", expenses);
        Assert.Contains("Suggested Payment Voucher", expenses);
        Assert.Contains("SettlementCollectFromSeller", expenses);
        Assert.Contains("Suggested Official Receipt", expenses);
        Assert.Contains("SettlementInternalOffset", expenses);
        Assert.Contains("no cash action", expenses);
        Assert.Contains("Purchase snapshot RM 50000.00", expenses);
        Assert.Contains("Bank debt RM 60000.00", expenses);
        Assert.Contains("Do not post automatically", expenses);
        Assert.Contains("t=\"n\"><v>-10000</v>", expenses);
    }

    [Fact]
    public void Export_marks_active_and_historical_supplier_statuses_without_claiming_an_auto_mapping()
    {
        var suppliers = new[]
        {
            new Supplier { CompanyName = "Active", Address = "A", Phone = "1", Status = SupplierStatus.Active },
            new Supplier { CompanyName = "Inactive", Address = "A", Phone = "1", Status = SupplierStatus.Inactive }
        };

        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(Input() with { Suppliers = suppliers })), ZipArchiveMode.Read);
        var supplierRows = Read(archive, "xl/worksheets/sheet9.xml");

        Assert.Contains("manually map its AutoCount creditor code", supplierRows);
        Assert.DoesNotContain("ApprovalStatus", supplierRows);
        Assert.Contains("Inactive supplier; do not import.", supplierRows);
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
        Assert.Contains("5S00-0000", salesLines);
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

    [Fact]
    public void Sales_export_matches_video_lines_and_retains_issued_customer_snapshot()
    {
        var vehicle = new Vehicle { PlateNumber = "TEST100", Make = "Test", Model = "Car", Year = 2020, CustomerId = Guid.NewGuid() };
        var customer = new Customer { Id = vehicle.CustomerId!.Value, Name = "Changed Buyer", Address = "Changed address" };
        var invoice = new FinanceInvoice
        {
            CustomerId = customer.Id, CustomerName = "Issued Buyer", CustomerAddress = "Issued address",
            CustomerPhone = "Test phone", CustomerTinNumber = "TEST-TIN", VehicleId = vehicle.Id,
            VehiclePlateNumber = vehicle.PlateNumber, VehicleDescription = "Test Car 2020", InvoiceNumber = "TEST-SALE-1",
            InvoiceDate = new DateOnly(2026, 9, 22), SalesPrice = 56_820.35m, InsurancePaidOnBehalfAmount = 2_089.65m,
            RoadTaxPaidOnBehalfAmount = 90m, Amount = 59_000m, SalesAgentName = "Test agent", LoanBankReference = "Test bank"
        };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(Input([vehicle], [customer]) with { FinanceInvoices = [invoice] })), ZipArchiveMode.Read);

        var header = Assert.Single(Rows(archive, "SalesInvoices"));
        Assert.Equal("Issued address", header["CustomerAddress"]);
        Assert.Equal("Test agent", header["SalesAgent"]);
        Assert.Equal("Test bank", header["LoanBankReference"]);
        Assert.Equal("59000", header["LineTotal"]);
        Assert.Equal("0", header["Difference"]);
        Assert.Equal("", header["DebtorCode"]);
        var lines = Rows(archive, "SalesLines");
        Assert.Equal(3, lines.Count);
        Assert.Equal(new[] { "5S00-0000", "4001-I001", "4001-R001" }, lines.Select(line => line["AccountCode"]));
        Assert.Equal(new[] { "025", "006", "006" }, lines.Select(line => line["ClassificationCode"]));
        Assert.All(lines, line => { Assert.Equal("1", line["Quantity"]); Assert.Equal("UNIT", line["UOM"]); Assert.Equal(line["Amount"], line["UnitPrice"]); Assert.Equal("", line["TaxCode"]); });
        Assert.Contains("Test Car 2020", lines[0]["Description"]);
        Assert.Equal(59_000m, lines.Sum(line => decimal.Parse(line["Amount"], System.Globalization.CultureInfo.InvariantCulture)));
    }

    [Fact]
    public void Sales_export_flags_approved_price_variance_without_inventing_a_balancing_line()
    {
        var invoice = new FinanceInvoice { InvoiceNumber = "TEST-VARIANCE", SalesPrice = 500m, Amount = 450m };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(Input() with { FinanceInvoices = [invoice] })), ZipArchiveMode.Read);
        var header = Assert.Single(Rows(archive, "SalesInvoices"));
        Assert.Equal("500", header["LineTotal"]);
        Assert.Equal("-50", header["Difference"]);
        Assert.Equal("TotalsMismatch", header["ReviewStatus"]);
        Assert.Contains("do not post", header["Remark"]);
        Assert.Single(Rows(archive, "SalesLines"));
    }

    [Fact]
    public void Repair_supplier_invoice_exports_refurbishment_line_and_known_creditor()
    {
        var vehicle = new Vehicle { PlateNumber = "TEST200", IntakeDate = new DateOnly(2026, 7, 1) };
        var supplier = new Supplier { CompanyName = "Test Workshop", AutoCountCreditorCode = "TEST-CREDITOR" };
        var invoice = new SupplierInvoice { VehicleId = vehicle.Id, SupplierId = supplier.Id, SupplierName = supplier.CompanyName, InvoiceNumber = "TEST-REPAIR-1", InvoiceDate = new DateOnly(2026, 9, 21), Amount = 190m };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(Input([vehicle]) with { Suppliers = [supplier], SupplierInvoices = [invoice] })), ZipArchiveMode.Read);
        var line = Assert.Single(Rows(archive, "Purchases"));
        Assert.Equal("REFURBISHMENT", line["ItemCode"]);
        Assert.Equal("6R00-0000", line["AccountCode"]);
        Assert.Equal("TEST-CREDITOR", line["SupplierCreditorCode"]);
        Assert.Equal("1", line["Quantity"]);
        Assert.Equal("190", line["UnitPrice"]);
        Assert.Equal("UNIT", line["UOM"]);
        Assert.Equal("", line["SupplierDONumber"]);
        Assert.Equal("2026-09-21", line["InvoiceDate"]);
    }

    [Fact]
    public void Unmatched_repair_review_uses_its_start_date_instead_of_vehicle_intake()
    {
        var vehicle = new Vehicle { PlateNumber = "TEST300", IntakeDate = new DateOnly(2026, 7, 1) };
        var repair = new RepairJob { VehicleId = vehicle.Id, StartedOn = new DateOnly(2026, 9, 21), Cost = 190m };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(Input([vehicle]) with { Repairs = [repair], From = new DateOnly(2026, 9, 1), To = new DateOnly(2026, 9, 30) })), ZipArchiveMode.Read);
        var row = Assert.Single(Rows(archive, "Expenses"));
        Assert.Equal("2026-09-21", row["EffectiveDate"]);
        Assert.Equal("ReviewOnly", row["AccountingTreatment"]);
        Assert.Contains("do not post", row["Remark"]);
    }

    private static IReadOnlyList<Dictionary<string, string>> Rows(ZipArchive archive, string sheetName)
    {
        XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var sheets = XDocument.Parse(Read(archive, "xl/workbook.xml")).Descendants(ns + "sheet").ToList();
        var index = sheets.FindIndex(sheet => (string?)sheet.Attribute("name") == sheetName);
        Assert.True(index >= 0, $"Missing worksheet {sheetName}");
        var rows = XDocument.Parse(Read(archive, $"xl/worksheets/sheet{index + 1}.xml")).Descendants(ns + "row").ToList();
        var headers = rows[0].Elements(ns + "c").Select(cell => cell.Value).ToList();
        return rows.Skip(1).Select(row =>
        {
            var cells = row.Elements(ns + "c").ToList();
            Assert.Equal(headers.Count, cells.Count);
            return headers.Select((header, i) => (header, value: cells[i].Value)).ToDictionary(pair => pair.header, pair => pair.value);
        }).ToList();
    }

    [Fact]
    public void Confirmed_repair_receipt_uses_invoice_period_and_does_not_duplicate_operational_cost()
    {
        var input = RepairInput() with { From = new DateOnly(2026, 9, 1), To = new DateOnly(2026, 9, 30) };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        var lines = Rows(archive, "Purchases");
        Assert.Equal(2, lines.Count);
        Assert.Equal(new[] { "2", "3" }, lines.Select(line => line["Quantity"]));
        Assert.Equal(new[] { "50", "30" }, lines.Select(line => line["UnitPrice"]));
        Assert.Equal(new[] { "100", "90" }, lines.Select(line => line["Amount"]));
        Assert.All(lines, line =>
        {
            Assert.Equal("6R00-0000", line["AccountCode"]);
            Assert.Equal("REFURBISHMENT", line["ItemCode"]);
            Assert.Equal("2026-09-21", line["InvoiceDate"]);
            Assert.Equal(input.SupplierInvoices[0].Id.ToString(), line["InvoiceSourceId"]);
            Assert.Equal(input.RepairReceipts![0].Id.ToString(), line["ReceiptId"]);
        });
        Assert.Empty(Rows(archive, "Expenses"));
        Assert.Contains(input.Vehicles[0].PlateNumber, Assert.Single(Rows(archive, "Vehicles"))["CarPlate"]);
        var header = Assert.Single(Rows(archive, "PurchaseInvoices"));
        Assert.Equal("190", header["LineTotal"]);
        Assert.Equal("0", header["Difference"]);
        Assert.All(Rows(archive, "RepairReceiptReview"), row => Assert.Equal("ReferenceOnly", row["AccountingTreatment"]));

        using var july = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input with { From = new DateOnly(2026, 7, 1), To = new DateOnly(2026, 7, 31) })), ZipArchiveMode.Read);
        Assert.Empty(Rows(july, "Purchases"));
        Assert.Empty(Rows(july, "Expenses"));
        Assert.Empty(Rows(july, "RepairReceiptReview"));
    }

    [Theory]
    [InlineData("different supplier")]
    [InlineData("different vehicle")]
    [InlineData("missing reference")]
    [InlineData("duplicate receipt")]
    [InlineData("duplicate invoice")]
    public void Ambiguous_or_incomplete_receipt_links_remain_review_only(string scenario)
    {
        var input = RepairInput();
        var receipt = input.RepairReceipts![0];
        input = scenario switch
        {
            "different supplier" => input with { RepairReceipts = [receipt with { SupplierName = "Another supplier" }] },
            "different vehicle" => input with { Repairs = [input.Repairs[0] with { VehicleId = Guid.NewGuid() }] },
            "missing reference" => input with { RepairReceipts = [receipt with { InvoiceNumber = "" }] },
            "duplicate receipt" => input with { RepairReceipts = [receipt, receipt with { Id = Guid.NewGuid(), DocumentId = Guid.NewGuid() }] },
            "duplicate invoice" => input with { SupplierInvoices = [input.SupplierInvoices[0], input.SupplierInvoices[0] with { Id = Guid.NewGuid() }] },
            _ => throw new InvalidOperationException()
        };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        Assert.All(Rows(archive, "Purchases"), row =>
        {
            Assert.Equal("", row["ReceiptId"]);
            Assert.Contains("No unique confirmed receipt link", row["Remark"]);
        });
        Assert.Equal("ReviewOnly", Assert.Single(Rows(archive, "Expenses"))["AccountingTreatment"]);
        Assert.All(Rows(archive, "RepairReceiptReview"), row => Assert.Equal("Unresolved", row["LinkStatus"]));
    }

    [Fact]
    public void Receipt_line_total_mismatch_and_missing_line_fields_are_visible_without_invented_values()
    {
        var input = RepairInput();
        var item = input.RepairReceiptItems![0] with { Amount = 189m, Quantity = "1,5", Unit = null, UnitPrice = null };
        input = input with { RepairReceiptItems = [item] };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        var header = Assert.Single(Rows(archive, "PurchaseInvoices"));
        Assert.Equal("189", header["LineTotal"]);
        Assert.Equal("1", header["Difference"]);
        Assert.Equal("TotalsMismatch", header["ReviewStatus"]);
        var line = Assert.Single(Rows(archive, "Purchases"));
        Assert.Equal("1,5", line["Quantity"]);
        Assert.Equal("", line["UnitPrice"]);
        Assert.Equal("", line["UOM"]);
        Assert.Contains("non-numeric receipt quantity", line["Remark"]);
    }

    [Fact]
    public void Receipt_unit_price_keeps_source_precision_and_flags_unrepresented_discount()
    {
        var input = RepairInput();
        var item = input.RepairReceiptItems![0] with { Amount = 24.69m, Quantity = "2", UnitPrice = 12.345m };
        input = input with { RepairReceiptItems = [item], SupplierInvoices = [input.SupplierInvoices[0] with { Amount = 24.69m }], RepairReceipts = [input.RepairReceipts![0] with { TotalAmount = 24.69m }] };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        Assert.Equal("12.345", Assert.Single(Rows(archive, "Purchases"))["UnitPrice"]);
        using var mismatch = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input with { RepairReceiptItems = [item with { Amount = 24m }] })), ZipArchiveMode.Read);
        Assert.Contains("review any discount or rounding", Assert.Single(Rows(mismatch, "Purchases"))["Remark"]);
    }

    [Fact]
    public void Purchase_headers_keep_seller_snapshot_and_classified_item_codes()
    {
        var vehicle = new Vehicle { PlateNumber = "TEST400" };
        var owner = new Owner { Name = "Changed owner", Address = "Changed address" };
        var invoice = new PurchaseInvoice
        {
            VehicleId = vehicle.Id, OwnerId = owner.Id, SourceType = PurchaseInvoiceSourceType.OwnerAcquisition,
            InvoiceNumber = "TEST-PURCHASE", InvoiceDate = new DateOnly(2026, 9, 23), Amount = 4m,
            CurrentRevision = new PurchaseInvoiceRevision { SellerName = "Issued seller", SellerAddress = "Issued address", SellerTinNumber = "TEST-OWNER-TIN", VehiclePlateNumber = vehicle.PlateNumber },
            Lines =
            [
                new PurchaseInvoiceLine { LineType = PurchaseInvoiceLineType.VehiclePurchase, Amount = 1m },
                new PurchaseInvoiceLine { LineType = PurchaseInvoiceLineType.PurchaseProcessing, Amount = 1m },
                new PurchaseInvoiceLine { LineType = PurchaseInvoiceLineType.Parking, Amount = 1m },
                new PurchaseInvoiceLine { LineType = PurchaseInvoiceLineType.Refurbishment, Amount = 1m }
            ]
        };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(Input([vehicle]) with { Owners = [owner], PurchaseInvoices = [invoice] })), ZipArchiveMode.Read);
        var header = Assert.Single(Rows(archive, "PurchaseInvoices"));
        Assert.Equal("Issued seller", header["CreditorName"]);
        Assert.Equal("Issued address", header["Address"]);
        Assert.Equal("", header["CreditorCode"]);
        Assert.Equal("0", header["Difference"]);
        Assert.Equal(owner.Id.ToString(), Assert.Single(Rows(archive, "Owners"))["SourceId"]);
        Assert.Equal(new[] { "TEST400", "PROCESS (PURCHASE)", "PARKING", "REFURBISHMENT" }, Rows(archive, "Purchases").Select(row => row["ItemCode"]));
    }

    [Fact]
    public void Undated_invoice_and_inactive_creditor_are_explicitly_blocked_in_review()
    {
        var input = RepairInput();
        input = input with { SupplierInvoices = [input.SupplierInvoices[0] with { InvoiceDate = null }], Suppliers = [input.Suppliers![0] with { Status = SupplierStatus.Inactive }] };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        var header = Assert.Single(Rows(archive, "PurchaseInvoices"));
        Assert.Equal("", header["InvoiceDate"]);
        Assert.Contains("Missing supplier invoice date; do not post", header["Remark"]);
        Assert.Contains("Inactive supplier; do not import", header["Remark"]);
    }

    [Fact]
    public void Export_preserves_sheet_order_and_numeric_cells_without_converting_account_identifiers()
    {
        var input = RepairInput();
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var names = XDocument.Parse(Read(archive, "xl/workbook.xml")).Descendants(ns + "sheet").Select(sheet => (string)sheet.Attribute("name")!).ToList();
        Assert.Equal(new[] { "Manifest", "Customers", "Vehicles", "Purchases", "Payments", "Expenses", "SalesInvoices", "Collections", "Suppliers", "Owners", "SalesLines", "DeliveryCharges" }, names.Take(12));
        foreach (var name in names.Take(16)) _ = Rows(archive, name);
        var stock = Assert.Single(Rows(archive, "StockItems"));
        Assert.Equal("MV", stock["SuggestedItemGroup"]);
        Assert.Equal("FIFO", stock["SuggestedCostingMethod"]);
        Assert.Equal("025", stock["ClassificationCode"]);
        var cells = XDocument.Parse(Read(archive, "xl/worksheets/sheet4.xml")).Descendants(ns + "row").ToList();
        var headers = cells[0].Elements(ns + "c").Select(cell => cell.Value).ToList();
        var data = cells[1].Elements(ns + "c").ToList();
        Assert.Equal("n", (string?)data[headers.IndexOf("Quantity")].Attribute("t"));
        Assert.Equal("n", (string?)data[headers.IndexOf("UnitPrice")].Attribute("t"));
        Assert.Equal("inlineStr", (string?)data[headers.IndexOf("SupplierCreditorCode")].Attribute("t"));
        Assert.Equal("inlineStr", (string?)data[headers.IndexOf("AccountCode")].Attribute("t"));
    }

    [Fact]
    public void Empty_period_and_repeat_generation_keep_review_data_consistent()
    {
        var input = RepairInput() with { From = new DateOnly(2026, 1, 1), To = new DateOnly(2026, 1, 31) };
        using var empty = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        Assert.Empty(Rows(empty, "Purchases"));
        Assert.Empty(Rows(empty, "PurchaseInvoices"));
        Assert.Empty(Rows(empty, "Expenses"));
        Assert.Empty(Rows(empty, "RepairReceiptReview"));
        using var first = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input with { From = null, To = null })), ZipArchiveMode.Read);
        using var second = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input with { From = null, To = null })), ZipArchiveMode.Read);
        Assert.Equal(Read(first, "xl/worksheets/sheet4.xml"), Read(second, "xl/worksheets/sheet4.xml"));
    }

    private static AutoCountExportInput RepairInput()
    {
        var vehicle = new Vehicle { PlateNumber = "TEST500", IntakeDate = new DateOnly(2026, 7, 1) };
        var supplier = new Supplier { CompanyName = "Test workshop", AutoCountCreditorCode = "001-TEST" };
        var invoice = new SupplierInvoice { VehicleId = vehicle.Id, SupplierId = supplier.Id, SupplierName = supplier.CompanyName, InvoiceNumber = "TEST-REPAIR", InvoiceDate = new DateOnly(2026, 9, 21), Amount = 190m };
        var repair = new RepairJob { VehicleId = vehicle.Id, Cost = 190m, StartedOn = new DateOnly(2026, 10, 1) };
        var receipt = new RepairReceipt { RepairJobId = repair.Id, DocumentId = Guid.NewGuid(), SupplierName = " Test WORKSHOP ", InvoiceNumber = " test-repair ", TotalAmount = 190m };
        return Input([vehicle]) with
        {
            Suppliers = [supplier], SupplierInvoices = [invoice], Repairs = [repair], RepairReceipts = [receipt],
            RepairReceiptItems =
            [
                new RepairReceiptItem { RepairReceiptId = receipt.Id, Description = "Test part", Quantity = "2", Unit = "UNIT", UnitPrice = 50m, Amount = 100m, SortOrder = 0 },
                new RepairReceiptItem { RepairReceiptId = receipt.Id, Description = "Test labour", Quantity = "3", Unit = "UNIT", UnitPrice = 30m, Amount = 90m, SortOrder = 1 }
            ]
        };
    }

    [Fact]
    public void Partially_invoiced_repair_keeps_its_operational_cost_difference_for_review()
    {
        var input = RepairInput();
        var repair = input.Repairs[0] with { Cost = 1000m };
        var invoice = input.SupplierInvoices[0] with { Amount = 600m };
        input = input with { Repairs = [repair], SupplierInvoices = [invoice], RepairReceipts = [input.RepairReceipts![0] with { TotalAmount = 600m }], RepairReceiptItems = [input.RepairReceiptItems![0] with { Quantity = "1", UnitPrice = 600m, Amount = 600m }] };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        var expense = Assert.Single(Rows(archive, "Expenses"));
        Assert.Equal("1000", expense["Amount"]);
        Assert.Equal("ReviewOnly", expense["AccountingTreatment"]);
        Assert.Contains("invoice total 600.00; cost difference 400.00", expense["Remark"]);
        Assert.Equal("600", Assert.Single(Rows(archive, "Purchases"))["Amount"]);
    }

    [Fact]
    public void Multiple_unique_invoices_can_represent_one_repair_cost_without_duplicate_expense()
    {
        var input = RepairInput();
        var secondInvoice = input.SupplierInvoices[0] with { Id = Guid.NewGuid(), InvoiceNumber = "TEST-REPAIR-2", Amount = 810m };
        var secondReceipt = input.RepairReceipts![0] with { Id = Guid.NewGuid(), InvoiceNumber = secondInvoice.InvoiceNumber, TotalAmount = secondInvoice.Amount };
        input = input with
        {
            Repairs = [input.Repairs[0] with { Cost = 1000m }],
            SupplierInvoices = [input.SupplierInvoices[0], secondInvoice],
            RepairReceipts = [input.RepairReceipts[0], secondReceipt],
            RepairReceiptItems = [..input.RepairReceiptItems!, new RepairReceiptItem { RepairReceiptId = secondReceipt.Id, Amount = 810m, Quantity = "1", Unit = "UNIT", UnitPrice = 810m, Description = "Test additional work" }]
        };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        Assert.Empty(Rows(archive, "Expenses"));
        Assert.Equal(1000m, Rows(archive, "Purchases").Sum(line => decimal.Parse(line["Amount"], System.Globalization.CultureInfo.InvariantCulture)));
    }

    [Fact]
    public void Supplier_master_edits_are_not_presented_as_historical_invoice_contact_facts()
    {
        var input = RepairInput();
        input = input with { Suppliers = [input.Suppliers![0] with { CompanyName = "Changed master", Address = "Changed address", Phone = "Changed phone", TinNumber = "CHANGED-TIN" }] };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        var header = Assert.Single(Rows(archive, "PurchaseInvoices"));
        Assert.Equal("Test workshop", header["CreditorName"]);
        Assert.Equal("", header["Address"]);
        Assert.Equal("", header["Phone"]);
        Assert.Equal("", header["TinNumber"]);
        Assert.Equal("Changed address", header["CurrentSupplierAddress"]);
        Assert.Contains("current master references only", header["Remark"]);
    }

    [Fact]
    public void Receipt_link_normalization_matches_existing_whitespace_rules_and_detects_collisions()
    {
        var input = RepairInput();
        input = input with { RepairReceipts = [input.RepairReceipts![0] with { SupplierName = "Test  Workshop", InvoiceNumber = " TEST-REPAIR " }] };
        using var matched = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        Assert.All(Rows(matched, "Purchases"), row => Assert.NotEqual("", row["ReceiptId"]));
        using var collision = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input with
        {
            SupplierInvoices = [input.SupplierInvoices[0], input.SupplierInvoices[0] with { Id = Guid.NewGuid(), SupplierName = "Test  Workshop" }]
        })), ZipArchiveMode.Read);
        Assert.All(Rows(collision, "Purchases"), row => Assert.Equal("", row["ReceiptId"]));
        Assert.Equal("ReviewOnly", Assert.Single(Rows(collision, "Expenses"))["AccountingTreatment"]);
    }

    [Fact]
    public void Native_purchase_documents_keep_invoice_identity_and_receipt_money_separate()
    {
        var input = RepairInput();
        var second = input.SupplierInvoices[0] with { Id = Guid.NewGuid(), InvoiceNumber = "SECOND-REPAIR", Amount = 810m };
        input = input with { SupplierInvoices = [input.SupplierInvoices[0], second] };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        var guide = Rows(archive, "PasteGuide").Where(row => row["SourceId"] != "").ToList();
        Assert.Equal(2, guide.Count);
        var first = NativeRows(archive, guide.Single(row => row["InvoiceNumber"] == "TEST-REPAIR")["Sheet"]);
        Assert.Equal("TEST-REPAIR", guide.Single(row => row["InvoiceNumber"] == "TEST-REPAIR")["SupplierInvoiceNumber"]);
        Assert.Equal("", first.Single(row => row.Count == 2 && row[0] == "RefDocNo")[1]);
        Assert.Equal("001-TEST", first.Single(row => row.Count == 2 && row[0] == "CreditorCode")[1]);
        Assert.Equal("21/09/2026", first.Single(row => row.Count == 2 && row[0] == "Date")[1]);
        Assert.Equal("<<New>>", first.Single(row => row.Count == 2 && row[0] == "DocNo")[1]);
        var detailIndex = first.FindIndex(row => row.Count > 2 && row[0] == "ItemCode");
        var columns = first[detailIndex];
        var details = first.Skip(detailIndex + 1).ToList();
        Assert.Equal(2, details.Count);
        Assert.Equal("2", details[0][columns.IndexOf("Qty")]);
        Assert.Equal("50", details[0][columns.IndexOf("UnitPrice")]);
        Assert.Equal("UNIT", details[0][columns.IndexOf("UOM")]);
        Assert.All(details, row => Assert.Equal("6R00-0000", row[columns.IndexOf("AccNo")]));
        Assert.Equal(190m, details.Sum(row => decimal.Parse(row[columns.IndexOf("SubTotal")], System.Globalization.CultureInfo.InvariantCulture)));
        var other = NativeRows(archive, guide.Single(row => row["InvoiceNumber"] == "SECOND-REPAIR")["Sheet"]);
        var otherHeader = other.FindIndex(row => row.Count > 2 && row[0] == "ItemCode");
        Assert.Equal("810", Assert.Single(other.Skip(otherHeader + 1))[other[otherHeader].IndexOf("SubTotal")]);
    }

    [Fact]
    public void Native_sales_preserves_all_signed_charge_lines_and_text_account_codes()
    {
        var vehicle = new Vehicle { PlateNumber = "PASTE100" };
        var invoice = new FinanceInvoice { VehicleId = vehicle.Id, InvoiceNumber = "TEST-SALE", InvoiceDate = new DateOnly(2026, 9, 22), SalesPrice = 50000m, NcdAmount = 100m, InsurancePaidOnBehalfAmount = 1000m, Amount = 50900m, VehiclePlateNumber = vehicle.PlateNumber, VehicleDescription = "Test\ncar\tdescription" };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(Input([vehicle]) with { FinanceInvoices = [invoice] })), ZipArchiveMode.Read);
        var document = Assert.Single(Rows(archive, "PasteGuide"), row => row["SourceId"] != "");
        var rows = NativeRows(archive, document["Sheet"]);
        var headerIndex = rows.FindIndex(row => row.Count > 2 && row[0] == "ItemCode");
        var columns = rows[headerIndex];
        var details = rows.Skip(headerIndex + 1).ToList();
        Assert.Equal(3, details.Count);
        Assert.Equal(50900m, details.Sum(row => decimal.Parse(row[columns.IndexOf("SubTotal")], System.Globalization.CultureInfo.InvariantCulture)));
        Assert.Contains(details, row => row[columns.IndexOf("SubTotal")] == "-100");
        Assert.Equal("5S00-0000", details[0][columns.IndexOf("AccNo")]);
        Assert.All(details, row => Assert.Equal("1", row[columns.IndexOf("Qty")]));
        Assert.All(details.SelectMany(row => row), value => { Assert.DoesNotContain('\t', value); Assert.DoesNotContain('\n', value); });
        XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var sheets = XDocument.Parse(Read(archive, "xl/workbook.xml")).Descendants(ns + "sheet").ToList();
        var index = sheets.FindIndex(sheet => (string?)sheet.Attribute("name") == document["Sheet"]);
        var xmlRows = XDocument.Parse(Read(archive, $"xl/worksheets/sheet{index + 1}.xml")).Descendants(ns + "row").ToList();
        var cells = xmlRows[headerIndex + 1].Elements(ns + "c").ToList();
        Assert.Equal("n", (string?)cells[columns.IndexOf("Qty")].Attribute("t"));
        Assert.Equal("n", (string?)cells[columns.IndexOf("UnitPrice")].Attribute("t"));
        Assert.Equal("n", (string?)cells[columns.IndexOf("SubTotal")].Attribute("t"));
        Assert.Equal("inlineStr", (string?)cells[columns.IndexOf("AccNo")].Attribute("t"));
    }

    [Theory]
    [InlineData("InvoiceTotal")]
    [InlineData("ItemPrice")]
    [InlineData("ReceiptTotal")]
    public void Inconsistent_invoice_or_receipt_amount_cannot_produce_a_paste_document(string mismatch)
    {
        var input = RepairInput();
        input = mismatch switch
        {
            "InvoiceTotal" => input with { SupplierInvoices = [input.SupplierInvoices[0] with { Amount = 999m }] },
            "ReceiptTotal" => input with { RepairReceipts = [input.RepairReceipts![0] with { TotalAmount = 189m }] },
            _ => input with { RepairReceiptItems = [input.RepairReceiptItems![0] with { UnitPrice = 999m }, input.RepairReceiptItems[1]] }
        };
        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        var document = Assert.Single(Rows(archive, "PasteGuide"), row => row["SourceId"] != "");
        Assert.Equal("BlockedForPaste", document["ReviewStatus"]);
        Assert.Equal("", document["Sheet"]);
        Assert.Equal("", document["CopyRange"]);
        Assert.NotEmpty(Rows(archive, "Purchases"));
    }

    private static List<List<string>> NativeRows(ZipArchive archive, string name)
    {
        XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var sheets = XDocument.Parse(Read(archive, "xl/workbook.xml")).Descendants(ns + "sheet").ToList();
        var index = sheets.FindIndex(sheet => (string?)sheet.Attribute("name") == name);
        Assert.True(index >= 0);
        return XDocument.Parse(Read(archive, $"xl/worksheets/sheet{index + 1}.xml")).Descendants(ns + "row")
            .Select(row => row.Elements(ns + "c").Select(cell => cell.Value).ToList()).ToList();
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
