using System.Globalization;
using System.IO.Compression;
using System.Security;
using System.Text;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record AutoCountExportInput(
    IReadOnlyList<Vehicle> Vehicles,
    IReadOnlyList<Customer> Customers,
    IReadOnlyList<PurchaseInvoice> PurchaseInvoices,
    IReadOnlyList<SupplierInvoice> SupplierInvoices,
    IReadOnlyList<PaymentRecord> Payments,
    IReadOnlyList<RepairJob> Repairs,
    IReadOnlyList<DailySpend> DailySpends,
    IReadOnlyList<BrokerCommission> BrokerCommissions,
    IReadOnlyList<DebtRecoveryCase> DebtRecoveries,
    IReadOnlyList<PaymentVoucher> PaymentVouchers,
    IReadOnlyList<SettlementReminder> Settlements,
    DateOnly? From,
    DateOnly? To,
    DateTime GeneratedAtUtc,
    IReadOnlyList<FinanceInvoice>? FinanceInvoices = null,
    IReadOnlyList<CollectionTransaction>? Collections = null,
    IReadOnlyList<Supplier>? Suppliers = null,
    IReadOnlyList<DeliveryAccountingCharge>? DeliveryAccountingCharges = null,
    IReadOnlyList<Owner>? Owners = null,
    IReadOnlyList<RepairReceipt>? RepairReceipts = null,
    IReadOnlyList<RepairReceiptItem>? RepairReceiptItems = null);

/// <summary>
/// Builds a small, dependency-free Open XML workbook for manual AutoCount mapping.
/// This is intentionally not presented as a verified direct-import file.
/// </summary>
public static class AutoCountExcel
{
    private const string RemarkHeader = "Remark";
    private const string MappingVersion = "native-paste-2026-10-02";

    public static byte[] Export(AutoCountExportInput input)
    {
        var sourceVehicles = input.Vehicles.ToDictionary(vehicle => vehicle.Id);
        var sourcePayments = input.Payments.ToDictionary(payment => payment.Id);
        var financeInvoices = input.FinanceInvoices ?? [];
        var collections = input.Collections ?? [];
        var repairReceipts = MatchRepairReceipts(input);
        var supplierInvoiceLookup = input.SupplierInvoices.ToDictionary(invoice => invoice.Id);
        var invoiceByReceiptId = repairReceipts.ToDictionary(pair => pair.Value.Id, pair => supplierInvoiceLookup[pair.Key]);
        var repairInvoiceTotals = repairReceipts.GroupBy(pair => pair.Value.RepairJobId)
            .ToDictionary(group => group.Key, group => group.Sum(pair => supplierInvoiceLookup[pair.Key].Amount));
        var repairLookup = input.Repairs.ToDictionary(repair => repair.Id);
        var selectedPurchaseInvoices = input.PurchaseInvoices
            .Where(invoice => InPeriod(EffectiveDate(Present(invoice.InvoiceDate), sourceVehicles, invoice.VehicleId), input.From, input.To)).ToList();
        var selectedSupplierInvoices = input.SupplierInvoices
            .Where(invoice => InPeriod(EffectiveDate(Present(invoice.InvoiceDate) ?? Present(invoice.PaidAt) ?? Present(invoice.DueDate), sourceVehicles, invoice.VehicleId), input.From, input.To)).ToList();
        var selectedPayments = input.Payments
            .Where(payment => InPeriod(AutoCountDateRules.SingaporeAccountingDate(payment.CreatedAt), input.From, input.To)).ToList();
        var selectedRepairs = input.Repairs
            .Where(repair => (!repairInvoiceTotals.TryGetValue(repair.Id, out var total) || total != repair.Cost)
                && InPeriod(RepairReviewDate(repair), input.From, input.To)).ToList();
        var selectedReceipts = (input.RepairReceipts ?? [])
            .Where(receipt => invoiceByReceiptId.TryGetValue(receipt.Id, out var invoice)
                ? InPeriod(EffectiveDate(Present(invoice.InvoiceDate) ?? Present(invoice.PaidAt) ?? Present(invoice.DueDate), sourceVehicles, invoice.VehicleId), input.From, input.To)
                : repairLookup.TryGetValue(receipt.RepairJobId, out var repair) && InPeriod(RepairReviewDate(repair), input.From, input.To)).ToList();
        var selectedDailySpends = input.DailySpends
            .Where(spend => InPeriod(spend.DueDate, input.From, input.To)).ToList();
        var selectedBrokerCommissions = input.BrokerCommissions
            .Where(commission => InPeriod(EffectiveDate(null, sourceVehicles, commission.VehicleId), input.From, input.To)).ToList();
        var selectedDebtRecoveries = input.DebtRecoveries
            .Where(debt => InPeriod(EffectiveDate(Present(debt.FollowUpDate), sourceVehicles, debt.VehicleId), input.From, input.To)).ToList();
        var selectedPaymentVouchers = input.PaymentVouchers
            .Where(voucher => InPeriod(EffectiveDate(Present(voucher.IssuedDate), sourceVehicles, voucher.VehicleId), input.From, input.To)).ToList();
        var selectedSettlements = input.Settlements
            .Where(settlement => InPeriod(EffectiveDate(Present(settlement.Deadline), sourceVehicles, settlement.VehicleId), input.From, input.To)).ToList();
        var selectedFinanceInvoices = financeInvoices
            .Where(invoice => InPeriod(invoice.InvoiceDate, input.From, input.To)).ToList();
        var selectedCollections = collections
            .Where(collection => InPeriod(collection.ReceivedDate, input.From, input.To)).ToList();

        var referencedVehicleIds = input.Vehicles
            .Where(vehicle => InPeriod(vehicle.IntakeDate, input.From, input.To))
            .Select(vehicle => vehicle.Id)
            .ToHashSet();
        foreach (var vehicleId in selectedPurchaseInvoices.Select(invoice => invoice.VehicleId)
                     .Concat(selectedSupplierInvoices.Select(invoice => invoice.VehicleId))
                     .Concat(selectedPayments.Select(payment => payment.VehicleId))
                     .Concat(selectedRepairs.Select(repair => repair.VehicleId))
                     .Concat(selectedReceipts.Select(receipt => repairLookup[receipt.RepairJobId].VehicleId))
                     .Concat(selectedBrokerCommissions.Select(commission => commission.VehicleId))
                     .Concat(selectedDebtRecoveries.Select(debt => debt.VehicleId))
                     .Concat(selectedPaymentVouchers.Select(voucher => voucher.VehicleId))
                     .Concat(selectedSettlements.Select(settlement => settlement.VehicleId))
                     .Concat(selectedFinanceInvoices.Select(invoice => invoice.VehicleId))
                     .Concat(selectedCollections.Select(collection => sourcePayments.GetValueOrDefault(collection.PaymentRecordId)?.VehicleId ?? Guid.Empty)))
        {
            referencedVehicleIds.Add(vehicleId);
        }

        // A referenced master row must travel with its transaction even when the master date is outside the selected period.
        var includedVehicles = input.Vehicles.Where(vehicle => referencedVehicleIds.Contains(vehicle.Id)).ToList();
        var includedCustomerIds = includedVehicles.Where(vehicle => vehicle.CustomerId.HasValue).Select(vehicle => vehicle.CustomerId!.Value)
            .Concat(selectedFinanceInvoices.Select(invoice => invoice.CustomerId)).ToHashSet();
        var includedCustomers = input.Customers
            .Where(customer => includedCustomerIds.Contains(customer.Id))
            .OrderBy(customer => customer.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var includedOwnerIds = includedVehicles.Where(vehicle => vehicle.OwnerId.HasValue).Select(vehicle => vehicle.OwnerId!.Value)
            .Concat(selectedPurchaseInvoices.Where(invoice => invoice.OwnerId.HasValue).Select(invoice => invoice.OwnerId!.Value)).ToHashSet();
        var includedOwners = (input.Owners ?? []).Where(owner => includedOwnerIds.Contains(owner.Id)).OrderBy(owner => owner.Name, StringComparer.OrdinalIgnoreCase).ToList();

        var selectedInput = input with
        {
            Vehicles = includedVehicles,
            Customers = includedCustomers,
            Owners = includedOwners,
            PurchaseInvoices = selectedPurchaseInvoices,
            SupplierInvoices = selectedSupplierInvoices,
            Payments = selectedPayments,
            Repairs = selectedRepairs,
            DailySpends = selectedDailySpends,
            BrokerCommissions = selectedBrokerCommissions,
            DebtRecoveries = selectedDebtRecoveries,
            PaymentVouchers = selectedPaymentVouchers,
            Settlements = selectedSettlements,
            FinanceInvoices = selectedFinanceInvoices,
            Collections = selectedCollections,
            RepairReceipts = selectedReceipts,
            RepairReceiptItems = (input.RepairReceiptItems ?? []).Where(item => selectedReceipts.Any(receipt => receipt.Id == item.RepairReceiptId)).ToList()
        };
        var vehicleLookup = selectedInput.Vehicles.ToDictionary(vehicle => vehicle.Id);

        var sheets = new List<Sheet>
        {
            new("Manifest", ManifestRows(selectedInput, includedVehicles, includedCustomers)),
            new("Customers", CustomerRows(includedCustomers)),
            new("Vehicles", VehicleRows(includedVehicles)),
            new("Purchases", PurchaseRows(selectedInput, vehicleLookup, repairReceipts)),
            new("Payments", PaymentRows(selectedInput, vehicleLookup)),
            new("Expenses", ExpenseRows(selectedInput, vehicleLookup, repairInvoiceTotals)),
            new("SalesInvoices", SalesInvoiceRows(selectedInput, vehicleLookup)),
            // Collections are period-scoped, but their invoice reference may belong to an earlier period.
            new("Collections", CollectionRows(selectedInput, vehicleLookup, sourcePayments, financeInvoices)),
            new("Suppliers", SupplierRows(selectedInput.Suppliers ?? [])),
            new("Owners", OwnerRows(selectedInput.Owners ?? [])),
            new("SalesLines", SalesLineRows(selectedInput, vehicleLookup)),
            new("DeliveryCharges", DeliveryAccountingChargeRows(selectedInput, vehicleLookup)),
            new("PurchaseInvoices", PurchaseInvoiceRows(selectedInput, vehicleLookup, repairReceipts)),
            new("StockItems", StockItemRows(includedVehicles)),
            new("RepairReceiptReview", RepairReceiptReviewRows(selectedInput, repairLookup, invoiceByReceiptId))
        };

        sheets.AddRange(ClipboardSheets(sheets));

        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            WriteEntry(archive, "[Content_Types].xml", ContentTypesXml(sheets.Count));
            WriteEntry(archive, "_rels/.rels", RootRelationshipsXml());
            WriteEntry(archive, "xl/workbook.xml", WorkbookXml(sheets));
            WriteEntry(archive, "xl/_rels/workbook.xml.rels", WorkbookRelationshipsXml(sheets.Count));
            WriteEntry(archive, "xl/styles.xml", StylesXml());
            for (var index = 0; index < sheets.Count; index++)
            {
                WriteEntry(archive, $"xl/worksheets/sheet{index + 1}.xml", WorksheetXml(sheets[index]));
            }
        }

        return output.ToArray();
    }

    // These layouts come from Accounting 2.2 Rev 34's Copy as Spreadsheet,
    // in Purchase Invoice and Sales > Invoice (not A/P or A/R Excel import).
    private static readonly string[] PurchaseClipboardFields = ["CreditorCode", "CreditorName", "InvAddr1", "InvAddr2", "InvAddr3", "InvAddr4", "BranchCode", "PurchaseLocation", "DocNo", "Date", "DisplayTerm", "PurchaseAgent", "TaxEntityID", "ShipVia", "ShipInfo", "CurrencyCode", "CurrencyRate", "ToTaxCurrencyRate", "Description", "Ref", "RefDocNo", "Remark1", "Remark2", "Remark3", "Remark4", "Attention", "Phone1", "Fax1", "Footer1Amt", "Footer2Amt", "Footer3Amt"];
    private static readonly string[] SalesClipboardFields = ["DebtorCode", "DebtorName", "InvAddr1", "InvAddr2", "InvAddr3", "InvAddr4", "BranchCode", "SalesLocation", "DocNo", "Date", "DisplayTerm", "SalesAgent", "TaxEntityID", "ShipVia", "ShipInfo", "CurrencyCode", "CurrencyRate", "ToTaxCurrencyRate", "MemberNo", "Description", "Ref", "RefDocNo", "Remark1", "Remark2", "Remark3", "Remark4", "Attention", "Phone1", "Fax1", "DeliverAddr1", "DeliverAddr2", "DeliverAddr3", "DeliverAddr4", "SalesExemptionNo", "Footer1Amt", "Footer2Amt", "Footer3Amt"];
    private static readonly string[] PurchaseClipboardColumns = ["ItemCode", "PackageCode", "PackageDetailItemCode", "Description", "Desc2", "UOM", "UserUOM", "BatchNo", "ProjNo", "DeptNo", "Qty", "FOCQty", "UnitPrice", "Discount", "SubTotal", "TaxCode", "TaxRate", "AccountingBasis", "SalesExemptionNo", "AccNo", "DeliveryDate", "EstimatedDeliveryDate", "Transferable", "OurPONo", "OurPODate", "AddToSubTotal", "PrintOut", "Location", "Numbering", "Duty", "ForeignCharges", "LocalCharges", "FurtherDescription"];
    private static readonly string[] SalesClipboardColumns = ["ItemCode", "PackageCode", "PackageDetailItemCode", "Description", "Desc2", "UOM", "UserUOM", "BatchNo", "ProjNo", "DeptNo", "Qty", "FOCQty", "UnitPrice", "Discount", "SubTotal", "LocalTotalCost", "TaxCode", "TaxRate", "AccountingBasis", "SalesExemptionNo", "AccNo", "DeliveryDate", "EstimatedDeliveryDate", "OurDONo", "OurDODate", "Transferable", "YourPONo", "YourPODate", "AddToSubTotal", "PrintOut", "Location", "Numbering", "FurtherDescription"];

    private static IReadOnlyList<Sheet> ClipboardSheets(IReadOnlyList<Sheet> reviewSheets)
    {
        static List<Dictionary<string, string>> Records(Sheet sheet) => sheet.Rows.Skip(1)
            .Select(row => sheet.Rows[0].Select((header, index) => (header, value: row[index]))
                .ToDictionary(cell => cell.header, cell => cell.value)).ToList();
        var guide = new List<IReadOnlyList<string>>
        {
            new[] { "Sheet", "DocumentType", "InvoiceNumber", "CarPlate", "Amount", "LineTotal", "Difference", "ReviewStatus", "CopyRange", "BeforePaste", "SourceId", "SupplierInvoiceNumber", "SupplierDONumber" },
            new[] { "", "Instructions", "", "", "", "", "", "", "", "先在 Excel 填好客户账套的 code。打开对应 Purchase Invoice / Sales > Invoice 的空白 New draft；只 copy 指定工作表的 CopyRange，Edit > Paste Whole Document，只 paste 一次。重试就 Cancel、不保存，再开 New；重复 paste 会追加明细。Auto Price Rule 提示选 No，保留 Excel 金额。采购另外 copy 本表 SupplierInvoiceNumber / SupplierDONumber 单格到画面同名栏位。核对后由财务决定 Save。先 check 是否已经录入。Payments / Collections 用另外的流程。", "", "", "" }
        };
        var documents = new List<Sheet>();
        foreach (var sales in new[] { false, true })
        {
            var headers = Records(reviewSheets.Single(sheet => sheet.Name == (sales ? "SalesInvoices" : "PurchaseInvoices")));
            var lines = Records(reviewSheets.Single(sheet => sheet.Name == (sales ? "SalesLines" : "Purchases")));
            var sequence = 0;
            foreach (var header in headers)
            {
                var invoiceLines = lines.Where(line => line[sales ? "SourceId" : "InvoiceSourceId"] == header["SourceId"]).ToList();
                var problems = new List<string>();
                if (decimal.Parse(header["Difference"], CultureInfo.InvariantCulture) != 0) problems.Add("Invoice total 跟明细不一样；先修正原始资料。");
                if (string.IsNullOrWhiteSpace(header["InvoiceDate"])) problems.Add("缺少 invoice date。");
                if (header["InvoiceNumber"].Length > 80 || header["CarPlate"].Length > 40) problems.Add("Invoice number / 车牌超过已验证的 Remark 长度；先核对。");
                if (header[RemarkHeader].Contains("Inactive supplier", StringComparison.Ordinal)) problems.Add("Supplier 已 inactive。");
                if (invoiceLines.Count == 0 || invoiceLines.Any(line =>
                    !decimal.TryParse(line["Quantity"], NumberStyles.Float, CultureInfo.InvariantCulture, out var quantity) || quantity <= 0 ||
                    !decimal.TryParse(line["UnitPrice"], NumberStyles.Number, CultureInfo.InvariantCulture, out var price) ||
                    !decimal.TryParse(line["Discount"], NumberStyles.Number, CultureInfo.InvariantCulture, out var discount) ||
                    !decimal.TryParse(line["Amount"], NumberStyles.Number, CultureInfo.InvariantCulture, out var amount) ||
                    decimal.Round(quantity * price - discount, 2, MidpointRounding.AwayFromZero) != amount))
                    problems.Add("明细 quantity / unit price / discount 跟金额不一致或不完整。");
                var name = problems.Count == 0 ? $"{(sales ? "SI" : header["SourceType"] == "SupplierInvoice" ? "RI" : "PI")}_{++sequence:D4}" : "";
                Sheet? document = null;
                if (problems.Count == 0)
                {
                    document = ClipboardDocument(name, sales, header, invoiceLines);
                    documents.Add(document);
                }
                var review = sales ? "填 DebtorCode（客户编号）" : "核对 CreditorCode（供应商编号）；空白就填客户账套的 code";
                review += "、Location、ItemCode、UOM、AccNo（这笔钱记进哪个 account）和 TaxCode。DocNo 用 <<New>>，原 invoice no 留在 Remark1 / Remark2，车牌在 Remark3。Purchase 的 Supplier Invoice No. / Supplier D/O No. 没有通过整张 paste 带入；请从 PasteGuide 最后两栏单格 copy/paste 到画面对应栏位，空白就核对原单。Paste 后再 check 金额和 AccNo；更换 customer / supplier 可能重设价格和 account。不要重复录入。";
                guide.Add(new[] { name, sales ? "Sales > Invoice" : "Purchase Invoice", header["InvoiceNumber"], header["CarPlate"], header["Amount"], header["LineTotal"], header["Difference"],
                    problems.Count == 0 ? "ReviewRequired" : "BlockedForPaste", document is null ? "" : $"A1:{ColumnName(document.Rows[document.HeaderRow].Count)}{document.Rows.Count}",
                    problems.Count == 0 ? review : string.Join(" ", problems), header["SourceId"], sales ? "" : header["SupplierInvoiceNumber"], sales ? "" : header["SupplierDONumber"] });
            }
        }
        return [new("PasteGuide", guide), ..documents];
    }

    private static Sheet ClipboardDocument(string name, bool sales, IReadOnlyDictionary<string, string> invoice, IReadOnlyList<Dictionary<string, string>> lines)
    {
        var fields = sales ? SalesClipboardFields : PurchaseClipboardFields;
        var columns = sales ? SalesClipboardColumns : PurchaseClipboardColumns;
        var values = new Dictionary<string, string>
        {
            [sales ? "DebtorCode" : "CreditorCode"] = invoice[sales ? "DebtorCode" : "CreditorCode"],
            [sales ? "DebtorName" : "CreditorName"] = invoice[sales ? "CustomerName" : "CreditorName"],
            ["InvAddr1"] = invoice[sales ? "CustomerAddress" : "Address"],
            ["Phone1"] = invoice[sales ? "CustomerPhone" : "Phone"],
            ["DocNo"] = "<<New>>",
            ["Date"] = DateOnly.ParseExact(invoice["InvoiceDate"], "yyyy-MM-dd", CultureInfo.InvariantCulture).ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
            ["DisplayTerm"] = invoice["CreditTerm"],
            ["CurrencyCode"] = "MYR", ["CurrencyRate"] = "1.0", ["ToTaxCurrencyRate"] = "1.0",
            ["Description"] = sales ? "INVOICE" : "PURCHASE INVOICE",
            ["Remark1"] = invoice["InvoiceNumber"][..Math.Min(40, invoice["InvoiceNumber"].Length)],
            ["Remark2"] = invoice["InvoiceNumber"].Length > 40 ? invoice["InvoiceNumber"][40..] : "",
            ["Remark3"] = invoice["CarPlate"],
            ["Footer1Amt"] = "0", ["Footer2Amt"] = "0", ["Footer3Amt"] = "0"
        };
        if (sales) values["SalesAgent"] = invoice["SalesAgent"];
        static string ClipboardValue(string value) => value.Replace("\r", " ").Replace("\n", " ").Replace("\t", " ");
        var rows = new List<IReadOnlyList<string>> { new[] { sales ? "AutoCount Accounting Invoice" : "AutoCount Accounting Purchase Invoice" }, Array.Empty<string>() };
        rows.AddRange(fields.Select(field => new[] { field, ClipboardValue(values.GetValueOrDefault(field, "")) }));
        var detailHeaderRow = rows.Count;
        rows.Add(columns);
        foreach (var line in lines)
        {
            var detail = new Dictionary<string, string>
            {
                ["ItemCode"] = line["ItemCode"], ["Description"] = line["Description"],
                ["UOM"] = line["UOM"], ["Qty"] = line["Quantity"], ["FOCQty"] = "0", ["UnitPrice"] = line["UnitPrice"],
                ["Discount"] = line["Discount"], ["SubTotal"] = line["Amount"], ["AccNo"] = line["AccountCode"], ["TaxCode"] = line["TaxCode"],
                ["Transferable"] = "True", ["AddToSubTotal"] = "True", ["PrintOut"] = "True"
            };
            rows.Add(columns.Select(column => ClipboardValue(detail.GetValueOrDefault(column, ""))).ToArray());
        }
        return new(name, rows, detailHeaderRow);
    }

    private static IReadOnlyList<IReadOnlyList<string>> ManifestRows(AutoCountExportInput input, IReadOnlyList<Vehicle> vehicles, IReadOnlyList<Customer> customers)
    {
        var from = input.From?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "Not set";
        var to = input.To?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "Not set";
        return
        [
            ["AutoCount V2 mapping workbook", "Value"],
            ["Workbook purpose", "Review data plus per-invoice native clipboard sheets for AutoCount Accounting 2.2 Rev 34. Use PasteGuide; client master codes and purchase supplier reference fields require review/input."],
            ["Generated at (UTC)", input.GeneratedAtUtc.ToString("O", CultureInfo.InvariantCulture)],
            ["Period from (inclusive)", from],
            ["Period to (inclusive)", to],
            ["Category sheets", "Customers, Owners, Suppliers, Vehicles, Purchases, Payments, Expenses, SalesInvoices, SalesLines, DeliveryCharges, Collections, PurchaseInvoices, StockItems, RepairReceiptReview, PasteGuide and per-invoice PI/RI/SI sheets"],
            ["Vehicles included", vehicles.Count.ToString(CultureInfo.InvariantCulture)],
            ["Customers included", customers.Count.ToString(CultureInfo.InvariantCulture)],
            ["Data boundary", "Persisted facts plus explicitly labelled video setup suggestions and blank Finance review fields; no tax code or debtor/owner creditor code is inferred."],
            ["Approved classification mapping", "Vehicle/car = 025; insurance = 006; road tax = 006. Classification is separate from TaxCode."],
            ["Approved account mapping", "Vehicle sale 5S00-0000 (letter S); insurance sale 4001-I001; road-tax sale 4001-R001; vehicle purchase 6P00-0000; purchase processing 6P00-1000; parking 6T00-1000; refurbishment 6R00-0000; insurance paid on behalf 4001-I002; loan application fee 8000-L002."],
            ["Mapping limitation", "TaxCode remains blank until Finance confirms the approved AutoCount tax-code mapping."],
            ["Period note", "Invoices use invoice dates where persisted. Undated legacy supplier invoices retain paid/due/intake fallback for review only. Unmatched repair costs use repair start or Singapore creation date, never vehicle intake. Referenced vehicle/customer/owner masters are retained."],
            ["Cell typing", "Money and whole-number fields are emitted as numeric XLSX cells where practical; identifiers, dates, statuses and Remarks remain text."],
            ["Review instruction", "Check every Remark and ReviewStatus field. Resolve missing identities, debtor/creditor codes, TaxCode and any Difference before posting. Blank review fields are not saved back to YS Heng."],
            ["Mapping version", MappingVersion],
            ["Mapping evidence", "SALES INVOICE.mp4 3:30; CAR PURCHASE.mp4 2:35; INVOICE CAR REPAIR.mp4 0:55. Native Purchase Invoice and Sales > Invoice layouts captured with Copy as Spreadsheet; generated synthetic Excel tested in unsaved DEMO drafts. File > Import From Excel and final posting are not verified."],
            ["Duplicate cost rule", "Purchases contains accounting lines; PurchaseInvoices contains reference totals. A repair cost is excluded from Expenses only when uniquely linked supplier invoice totals equal that cost. Unmatched costs and differences remain review-only; do not post them or RepairReceiptReview as additional invoices."],
            ["Master review fields", "Blank debtor/owner creditor and structured tax-entity fields require Finance input. StockItems contains suggested MV/FIFO/UNIT setup from the videos; confirm it in AutoCount. No account or stock master is created automatically."]
        ];
    }

    private static IReadOnlyList<IReadOnlyList<string>> CustomerRows(IReadOnlyList<Customer> customers)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "CustomerName", "Phone", "IcNumber", "TinNumber", "Email", "Address", RemarkHeader, "DebtorCode", "TaxEntityCategory", "IdentityType", "PostCode", "City", "State", "Country", "ControlAccount", "DebtorType", "CreditTerm" } };
        rows.AddRange(customers.Select(customer => new[] {
            customer.Id.ToString(), customer.Name, customer.Phone, customer.IcNumber ?? "", customer.TinNumber ?? "", customer.Email ?? "", customer.Address ?? "",
            "Complete blank AutoCount debtor and tax-entity review fields; do not infer identity type or split an address automatically.", "", "", "", "", "", "", "", "", "", ""
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> OwnerRows(IReadOnlyList<Owner> owners)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "OwnerName", "Phone", "IcNumber", "TinNumber", "Address", RemarkHeader, "CreditorCode", "Email", "TaxEntityCategory", "IdentityType", "PostCode", "City", "State", "Country", "ControlAccount", "CreditorType", "CreditTerm" } };
        rows.AddRange(owners.Select(owner => new[] {
            owner.Id.ToString(), owner.Name, owner.Phone, owner.IcNumber ?? "", owner.TinNumber ?? "", owner.Address ?? "",
            "Complete blank AutoCount seller creditor and tax-entity fields. PurchaseInvoices retains the issued seller snapshot.", "", "", "", "", "", "", "", "", "", "", ""
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> VehicleRows(IReadOnlyList<Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "CarPlate", "ChassisNumber", "EngineNumber", "Make", "Model", "Year", "StockOwner", "StockLocation", "Status", "PurchasePrice", "ModifiedPurchasePrice", "SellingPrice", "AdditionalCharges", "RefurbishmentTotal", "CommissionTotal", "CustomerId", "OwnerId", "IntakeDate", RemarkHeader }
        };
        rows.AddRange(vehicles.Select(vehicle => new[] {
            vehicle.Id.ToString(), vehicle.PlateNumber, vehicle.ChassisNumber ?? "", vehicle.EngineNumber ?? "", vehicle.Make, vehicle.Model, vehicle.Year.ToString(CultureInfo.InvariantCulture), vehicle.StockOwner.ToString(), vehicle.StockLocation, vehicle.Status.ToString(),
            Money(vehicle.PurchasePrice), Money(vehicle.ModifiedPurchasePrice ?? vehicle.PurchasePrice), Money(vehicle.SellingPrice), Money(vehicle.AdditionalCharges), Money(vehicle.RefurbishmentTotal), Money(vehicle.CommissionTotal),
            vehicle.CustomerId?.ToString() ?? "", vehicle.OwnerId?.ToString() ?? "", vehicle.IntakeDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            "Vehicle classification 025. TaxCode remains blank until Finance confirms it."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> SupplierRows(IReadOnlyList<Supplier> suppliers)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "CompanyName", "RegistrationNumber", "TinNumber", "Address", "Phone", "ContactPerson", "AutoCountCreditorCode", "Status", RemarkHeader, "TaxEntityCategory", "IdentityType", "PostCode", "City", "State", "Country", "ControlAccount", "CreditorType", "CreditTerm" } };
        rows.AddRange(suppliers.OrderBy(supplier => supplier.CompanyName).Select(supplier => new[] {
            supplier.Id.ToString(), supplier.CompanyName, supplier.RegistrationNumber ?? "", supplier.TinNumber ?? "", supplier.Address, supplier.Phone,
            supplier.ContactPerson ?? "", supplier.AutoCountCreditorCode ?? "", supplier.Status.ToString(),
            SupplierRemark(supplier.Status), "", "", "", "", "", "", "", "", ""
        }));
        return rows;
    }

    private static string SupplierRemark(SupplierStatus status) => status switch
    {
        SupplierStatus.Active => "Active supplier; manually map its AutoCount creditor code before import.",
        SupplierStatus.Inactive => "Inactive supplier; do not import.",
        _ => "Supplier status is unavailable."
    };

    private static IReadOnlyList<IReadOnlyList<string>> PurchaseRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles, IReadOnlyDictionary<Guid, RepairReceipt> receipts)
    {
        var suppliers = (input.Suppliers ?? []).ToDictionary(supplier => supplier.Id);
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "Category", "CarPlate", "InvoiceNumber", "SupplierName", "InvoiceDate", "PurchaseDate", "PaymentReference", "LineType", "Description", "AccountCode", "UOM", "Amount", "CapitaliseIntoVehicleCost", "AccountingStatus", "TaxCode", RemarkHeader, "SourceType", "OwnerName", "CurrentRevision", "InvoiceSourceId", "SupplierId", "OwnerId", "SupplierCreditorCode", "ItemCode", "Quantity", "UnitPrice", "Discount", "LineNumber", "ReceiptId", "ReceiptItemId", "SupplierDONumber" } };
        foreach (var invoice in input.PurchaseInvoices)
        {
            var ownerSource = invoice.SourceType == PurchaseInvoiceSourceType.OwnerAcquisition;
            var supplier = !ownerSource && invoice.SupplierId.HasValue ? suppliers.GetValueOrDefault(invoice.SupplierId.Value) : null;
            var lineNumber = 0;
            foreach (var line in PurchaseLines(invoice))
            {
                rows.Add(new[] {
                    line.Id.ToString(), "PurchaseInvoice", invoice.CurrentRevision?.VehiclePlateNumber ?? PlateFor(vehicles, invoice.VehicleId), invoice.InvoiceNumber,
                    supplier?.CompanyName ?? "", Date(invoice.InvoiceDate), Date(invoice.PurchaseDate), invoice.PaymentReference ?? "", line.LineType.ToString(), line.Description,
                    PurchaseAccountCode(line.LineType), "UNIT", Money(line.Amount), line.CapitaliseIntoVehicleCost ? "Yes" : "No", invoice.AccountingStatus.ToString(), "",
                    PurchaseRemark(invoice), invoice.SourceType.ToString(), ownerSource ? invoice.CurrentRevision?.SellerName ?? "" : "", ownerSource ? invoice.CurrentRevisionNumber.ToString(CultureInfo.InvariantCulture) : "",
                    invoice.Id.ToString(), supplier?.Id.ToString() ?? "", ownerSource ? invoice.OwnerId?.ToString() ?? "" : "", supplier?.AutoCountCreditorCode ?? "",
                    PurchaseItemCode(line.LineType, invoice.CurrentRevision?.VehiclePlateNumber ?? PlateFor(vehicles, invoice.VehicleId)), "1", Money(line.Amount), "0", (++lineNumber).ToString(CultureInfo.InvariantCulture), "", "", ""
                });
            }
        }
        foreach (var invoice in input.SupplierInvoices)
        {
            var supplier = invoice.SupplierId.HasValue ? suppliers.GetValueOrDefault(invoice.SupplierId.Value) : null;
            var receipt = receipts.GetValueOrDefault(invoice.Id);
            var lineNumber = 0;
            foreach (var line in SupplierLines(input, invoice, receipt))
            {
                rows.Add(new[] {
                    line.Id.ToString(), "SupplierInvoice", PlateFor(vehicles, invoice.VehicleId), invoice.InvoiceNumber, invoice.SupplierName,
                    Date(invoice.InvoiceDate), "", "", "Refurbishment", line.Description, "6R00-0000", line.Uom, Money(line.Amount), "No", "ReviewRequired", "",
                    SupplierInvoiceRemark(invoice, supplier, receipt) + " " + line.Remark, "SupplierInvoice", "", "", invoice.Id.ToString(), invoice.SupplierId?.ToString() ?? "", "",
                    supplier?.AutoCountCreditorCode ?? "", "REFURBISHMENT", line.Quantity, line.UnitPrice, "0", (++lineNumber).ToString(CultureInfo.InvariantCulture), receipt?.Id.ToString() ?? "", line.ReceiptItemId, ""
                });
            }
        }
        return rows;
    }

    private static IReadOnlyList<PurchaseInvoiceLine> PurchaseLines(PurchaseInvoice invoice) => invoice.Lines.Count > 0
        ? invoice.Lines
        : [new PurchaseInvoiceLine { Id = invoice.Id, PurchaseInvoiceId = invoice.Id, LineType = PurchaseInvoiceLineType.Other, Description = "Legacy purchase invoice - classify before import", Amount = invoice.Amount }];

    private sealed record SupplierExportLine(Guid Id, string ReceiptItemId, string Description, string Quantity, string Uom, string UnitPrice, decimal Amount, string Remark);

    private static IReadOnlyList<SupplierExportLine> SupplierLines(AutoCountExportInput input, SupplierInvoice invoice, RepairReceipt? receipt)
    {
        var items = receipt is null ? [] : (input.RepairReceiptItems ?? []).Where(item => item.RepairReceiptId == receipt.Id).OrderBy(item => item.SortOrder).ThenBy(item => item.Id).ToList();
        if (items.Count == 0)
        {
            return [new(invoice.Id, "", $"REFURBISHMENT COST - {invoice.PlateNumberOnInvoice ?? input.Vehicles.FirstOrDefault(vehicle => vehicle.Id == invoice.VehicleId)?.PlateNumber ?? ""}", "1", "UNIT", Money(invoice.Amount), invoice.Amount,
                "Aggregate invoice line; quantity 1 represents the invoice total, not a supplier item count.")];
        }
        return items.Select(item =>
        {
            var hasQuantity = decimal.TryParse(item.Quantity, NumberStyles.Float, CultureInfo.InvariantCulture, out var quantity) && quantity > 0;
            var remark = !hasQuantity || string.IsNullOrWhiteSpace(item.Unit) || !item.UnitPrice.HasValue
                ? "Complete missing or non-numeric receipt quantity, UOM and unit price before posting."
                : decimal.Round(quantity * item.UnitPrice!.Value, 2, MidpointRounding.AwayFromZero) != item.Amount
                    ? "Receipt quantity times unit price differs from its amount; review any discount or rounding before posting."
                    : "Confirmed receipt detail; Finance must review the accounting mapping.";
            return new SupplierExportLine(item.Id, item.Id.ToString(), item.Description, item.Quantity ?? "", item.Unit ?? "", item.UnitPrice.HasValue ? Number(item.UnitPrice.Value) : "", item.Amount, remark);
        }).ToList();
    }

    private static string SupplierInvoiceRemark(SupplierInvoice invoice, Supplier? supplier, RepairReceipt? receipt)
    {
        var remark = "Refurbishment account follows the repair video; Finance review and TaxCode remain unresolved.";
        if (!Present(invoice.InvoiceDate).HasValue) remark += " Missing supplier invoice date; do not post.";
        if (supplier is null || string.IsNullOrWhiteSpace(supplier.AutoCountCreditorCode)) remark += " Missing supplier creditor mapping; do not post.";
        if (supplier?.Status == SupplierStatus.Inactive) remark += " Inactive supplier; do not import.";
        if (receipt is null) remark += " No unique confirmed receipt link; review the original invoice.";
        if (receipt?.TotalAmount is { } total && total != invoice.Amount) remark += " Receipt total differs from supplier invoice total; do not post.";
        return remark;
    }

    private static string PurchaseRemark(PurchaseInvoice invoice) => invoice.SourceType == PurchaseInvoiceSourceType.OwnerAcquisition
        ? $"Owner acquisition revision {invoice.CurrentRevisionNumber}; Finance must manually map the owner creditor/account. Do not create or guess a Supplier or AutoCount creditor code.{(invoice.AccountingStatus == AccountingConfirmationStatus.FinanceConfirmed ? " Finance confirmed; TaxCode remains a separate unresolved field." : " Draft only; do not import.")}"
        : invoice.AccountingStatus == AccountingConfirmationStatus.FinanceConfirmed
            ? "Finance confirmed; TaxCode remains a separate unresolved field."
            : "Account follows the approved workbook mapping where available; TaxCode is intentionally blank pending Finance confirmation.";

    private static IReadOnlyList<IReadOnlyList<string>> PurchaseInvoiceRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles, IReadOnlyDictionary<Guid, RepairReceipt> receipts)
    {
        var suppliers = (input.Suppliers ?? []).ToDictionary(supplier => supplier.Id);
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "SourceType", "InvoiceNumber", "InvoiceDate", "SupplierInvoiceNumber", "SupplierDONumber", "CarPlate", "SupplierId", "OwnerId", "CreditorCode", "CreditorName", "Address", "Phone", "TinNumber", "IdentityNumber", "Amount", "LineTotal", "Difference", "AccountingStatus", "ReviewStatus", RemarkHeader, "CreditTerm", "TaxDate", "AutoCountDocNumber", "CurrentRevision", "CurrentSupplierName", "CurrentSupplierAddress", "CurrentSupplierPhone", "CurrentSupplierTinNumber", "CurrentSupplierRegistrationNumber" }
        };
        foreach (var invoice in input.PurchaseInvoices)
        {
            var ownerSource = invoice.SourceType == PurchaseInvoiceSourceType.OwnerAcquisition;
            var supplier = !ownerSource && invoice.SupplierId.HasValue ? suppliers.GetValueOrDefault(invoice.SupplierId.Value) : null;
            var snapshot = ownerSource ? invoice.CurrentRevision : null;
            var lineTotal = PurchaseLines(invoice).Sum(line => line.Amount);
            var remark = PurchaseRemark(invoice) + " Header totals are reference-only; post Purchases lines once after Finance review.";
            if (lineTotal != invoice.Amount) remark += " Invoice total differs from its lines; do not post.";
            if (supplier?.Status == SupplierStatus.Inactive) remark += " Inactive supplier; do not import.";
            if (!ownerSource && string.IsNullOrWhiteSpace(supplier?.AutoCountCreditorCode)) remark += " Missing supplier creditor mapping; do not post.";
            if (!ownerSource) remark += " Seller identity/contact snapshot is not persisted; verify the original invoice. CurrentSupplier fields are current master references only.";
            rows.Add(new[] {
                invoice.Id.ToString(), invoice.SourceType.ToString(), invoice.InvoiceNumber, Date(invoice.InvoiceDate), ownerSource ? "" : invoice.InvoiceNumber, "",
                snapshot?.VehiclePlateNumber ?? PlateFor(vehicles, invoice.VehicleId), supplier?.Id.ToString() ?? "", ownerSource ? invoice.OwnerId?.ToString() ?? "" : "",
                supplier?.AutoCountCreditorCode ?? "", snapshot?.SellerName ?? "", snapshot?.SellerAddress ?? "", snapshot?.SellerPhone ?? "", snapshot?.SellerTinNumber ?? "", snapshot?.SellerIcNumber ?? "",
                Money(invoice.Amount), Money(lineTotal), Money(invoice.Amount - lineTotal), invoice.AccountingStatus.ToString(), lineTotal == invoice.Amount ? "ReviewRequired" : "TotalsMismatch", remark, "", "", "", ownerSource ? invoice.CurrentRevisionNumber.ToString(CultureInfo.InvariantCulture) : "",
                supplier?.CompanyName ?? "", supplier?.Address ?? "", supplier?.Phone ?? "", supplier?.TinNumber ?? "", supplier?.RegistrationNumber ?? ""
            });
        }
        foreach (var invoice in input.SupplierInvoices)
        {
            var supplier = invoice.SupplierId.HasValue ? suppliers.GetValueOrDefault(invoice.SupplierId.Value) : null;
            var receipt = receipts.GetValueOrDefault(invoice.Id);
            var lineTotal = SupplierLines(input, invoice, receipt).Sum(line => line.Amount);
            var remark = SupplierInvoiceRemark(invoice, supplier, receipt) + " Header totals are reference-only; post Purchases lines once after Finance review. Supplier contact/tax snapshot is not persisted; verify the original invoice. CurrentSupplier fields are current master references only.";
            if (lineTotal != invoice.Amount) remark += " Invoice total differs from receipt lines; do not post.";
            rows.Add(new[] {
                invoice.Id.ToString(), "SupplierInvoice", invoice.InvoiceNumber, Date(invoice.InvoiceDate), invoice.InvoiceNumber, "", PlateFor(vehicles, invoice.VehicleId),
                invoice.SupplierId?.ToString() ?? "", "", supplier?.AutoCountCreditorCode ?? "", invoice.SupplierName, "", "", "", "",
                Money(invoice.Amount), Money(lineTotal), Money(invoice.Amount - lineTotal), "ReviewRequired", lineTotal == invoice.Amount ? "ReviewRequired" : "TotalsMismatch", remark, "", "", "", "",
                supplier?.CompanyName ?? "", supplier?.Address ?? "", supplier?.Phone ?? "", supplier?.TinNumber ?? "", supplier?.RegistrationNumber ?? ""
            });
        }
        return rows;
    }

    private static IReadOnlyDictionary<Guid, RepairReceipt> MatchRepairReceipts(AutoCountExportInput input)
    {
        var repairs = input.Repairs.ToDictionary(repair => repair.Id);
        var receiptGroups = (input.RepairReceipts ?? [])
            .Where(receipt => repairs.ContainsKey(receipt.RepairJobId) && !string.IsNullOrWhiteSpace(receipt.SupplierName) && !string.IsNullOrWhiteSpace(receipt.InvoiceNumber))
            .GroupBy(receipt => (repairs[receipt.RepairJobId].VehicleId, Normalize(receipt.SupplierName), Normalize(receipt.InvoiceNumber)))
            .ToDictionary(group => group.Key, group => group.ToList());
        var invoiceGroups = input.SupplierInvoices
            .Where(invoice => !string.IsNullOrWhiteSpace(invoice.SupplierName) && !string.IsNullOrWhiteSpace(invoice.InvoiceNumber))
            .GroupBy(invoice => (invoice.VehicleId, Normalize(invoice.SupplierName), Normalize(invoice.InvoiceNumber)));
        return invoiceGroups
            .Where(group => group.Count() == 1 && receiptGroups.TryGetValue(group.Key, out var receipts) && receipts.Count == 1)
            .ToDictionary(group => group.Single().Id, group => receiptGroups[group.Key].Single());
    }

    private static IReadOnlyList<IReadOnlyList<string>> RepairReceiptReviewRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, RepairJob> repairs, IReadOnlyDictionary<Guid, SupplierInvoice> invoices)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "ReceiptId", "RepairJobId", "DocumentId", "ReceiptItemId", "SupplierName", "InvoiceNumber", "SourceInvoiceId", "InvoiceDate", "CarPlate", "Description", "Quantity", "UOM", "UnitPrice", "Amount", "ReceiptTotal", "AccountingTreatment", "LinkStatus", RemarkHeader }
        };
        foreach (var receipt in input.RepairReceipts ?? [])
        {
            var invoice = invoices.GetValueOrDefault(receipt.Id);
            var repair = repairs.GetValueOrDefault(receipt.RepairJobId);
            var items = (input.RepairReceiptItems ?? []).Where(item => item.RepairReceiptId == receipt.Id).OrderBy(item => item.SortOrder).ThenBy(item => item.Id).ToList();
            var remark = invoice is null
                ? "No unique vehicle/supplier/invoice link. Resolve missing or ambiguous references; do not post this review sheet."
                : "Receipt details are represented in Purchases. Reference-only; do not post this sheet as another invoice.";
            foreach (var item in items.Count > 0 ? items : [new RepairReceiptItem { Id = Guid.Empty }])
            {
                rows.Add(new[] {
                    receipt.Id.ToString(), receipt.RepairJobId.ToString(), receipt.DocumentId.ToString(), item.Id == Guid.Empty ? "" : item.Id.ToString(), receipt.SupplierName ?? "", receipt.InvoiceNumber ?? "",
                    invoice?.Id.ToString() ?? "", Date(invoice?.InvoiceDate), input.Vehicles.FirstOrDefault(vehicle => vehicle.Id == (invoice?.VehicleId ?? repair?.VehicleId))?.PlateNumber ?? "", item.Description,
                    item.Quantity ?? "", item.Unit ?? "", item.UnitPrice.HasValue ? Number(item.UnitPrice.Value) : "", item.Id == Guid.Empty ? "" : Money(item.Amount),
                    receipt.TotalAmount.HasValue ? Money(receipt.TotalAmount.Value) : "", "ReferenceOnly", invoice is null ? "Unresolved" : "Matched", remark
                });
            }
        }
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> StockItemRows(IReadOnlyList<Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "ItemCode", "Description", "SuggestedItemGroup", "SuggestedCostingMethod", "SuggestedStockControl", "UOM", "ClassificationCode", "SupplyTaxCode", "PurchaseTaxCode", "MainSupplierCode", RemarkHeader }
        };
        rows.AddRange(vehicles.Select(vehicle => new[] {
            vehicle.Id.ToString(), vehicle.PlateNumber, $"{vehicle.PlateNumber} - {vehicle.Make} {vehicle.Model} {vehicle.Year}", "MV", "FIFO", "Yes", "UNIT", "025", "", "", "",
            "Suggested setup from the vehicle videos. Confirm the existing item, stock settings and tax mapping in AutoCount; this export does not create a stock item."
        }));
        return rows;
    }

    private static decimal SalesLineTotal(FinanceInvoice invoice) => invoice.SalesPrice + invoice.InterestAdditionalCharges + invoice.WindscreenCharges - invoice.NcdAmount
        + (invoice.InsurancePaidOnBehalfAmount > 0 ? invoice.InsurancePaidOnBehalfAmount : 0)
        + (invoice.RoadTaxPaidOnBehalfAmount > 0 ? invoice.RoadTaxPaidOnBehalfAmount : 0)
        + (invoice.AdvancePaidOnBehalfAmount > 0 ? invoice.AdvancePaidOnBehalfAmount : 0);

    private static string Normalize(string? value) => string.Join(" ", (value ?? "").Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).ToUpperInvariant();
    private static DateOnly RepairReviewDate(RepairJob repair) => Present(repair.StartedOn) ?? AutoCountDateRules.SingaporeAccountingDate(repair.CreatedAt);
    private static string PurchaseItemCode(PurchaseInvoiceLineType lineType, string plate) => lineType switch
    {
        PurchaseInvoiceLineType.VehiclePurchase => plate,
        PurchaseInvoiceLineType.PurchaseProcessing => "PROCESS (PURCHASE)",
        PurchaseInvoiceLineType.Parking => "PARKING",
        PurchaseInvoiceLineType.Refurbishment => "REFURBISHMENT",
        _ => ""
    };

    private static IReadOnlyList<IReadOnlyList<string>> PaymentRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "CarPlate", "Status", "NettPrice", "ReceiptNumber", "InvoiceNumber", "SalesPrice", "InterestAdditionalCharges", "NcdAmount", "WindscreenCharges", "SalesAgent", "LoanBankReference", "InsurancePaidOnBehalfAmount", "RoadTaxPaidOnBehalfAmount", "AdvancePaidOnBehalfAmount", "OutstationDeliveryDate", "BankName", "BankFollowUpDate", "CreatedAt", RemarkHeader } };
        rows.AddRange(input.Payments.OrderByDescending(payment => payment.CreatedAt).Select(payment => new[] {
            payment.Id.ToString(), PlateFor(vehicles, payment.VehicleId), payment.Status.ToString(), Money(payment.NettPrice), payment.ReceiptNumber ?? "", payment.InvoiceNumber ?? "", Money(payment.SalesPrice), Money(payment.InterestAdditionalCharges), Money(payment.NcdAmount), Money(payment.WindscreenCharges), payment.SalesAgentName ?? "", payment.LoanBankReference ?? "", Money(payment.InsurancePaidOnBehalfAmount), Money(payment.RoadTaxPaidOnBehalfAmount), Money(payment.AdvancePaidOnBehalfAmount), Date(payment.OutstationDeliveryDate), payment.BankName ?? "", Date(payment.BankFollowUpDate), AutoCountDateRules.SingaporeAccountingDate(payment.CreatedAt).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            "Manual review required; this workbook is a mapping aid and not a verified direct AutoCount import."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> ExpenseRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles, IReadOnlyDictionary<Guid, decimal> repairInvoiceTotals)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "Category", "CarPlate", "Description", "Amount", "EffectiveDate", "Status", RemarkHeader, "AccountingTreatment" } };
        rows.AddRange(input.Repairs.Select(repair => new[] {
            repair.Id.ToString(), "Repair", PlateFor(vehicles, repair.VehicleId), $"{repair.RepairPart} - {repair.WhatToDo}".Trim(" -".ToCharArray()), Money(repair.Cost), Date(RepairReviewDate(repair)), repair.ApprovalStatus.ToString(),
            repairInvoiceTotals.TryGetValue(repair.Id, out var total)
                ? $"Operational cost {Money(repair.Cost)} differs from linked supplier invoice total {Money(total)}; cost difference {Money(repair.Cost - total)}. Reference-only; do not post a balancing cost automatically."
                : "Operational repair cost only; no unique supplier invoice/receipt link. This is a start/creation date, not an invoice date; do not post as an additional purchase.", "ReviewOnly"
        }));
        rows.AddRange(input.DailySpends.Select(spend => new[] {
            spend.Id.ToString(), "DailySpend", "", spend.Description, Money(spend.Amount), Date(Present(spend.DueDate)), spend.IsPaid ? "Paid" : "Due", "Expense account/tax mapping is not verified.", "ReviewRequired"
        }));
        rows.AddRange(input.BrokerCommissions.Select(commission => new[] {
            commission.Id.ToString(), "BrokerCommission", PlateFor(vehicles, commission.VehicleId), commission.BrokerName, Money(commission.Amount), VehicleDate(vehicles, commission.VehicleId), commission.IsPaid ? "Paid" : "Unpaid", "Broker/account mapping is not verified; source has no commission date.", "ReviewRequired"
        }));
        rows.AddRange(input.DebtRecoveries.Select(debt => new[] {
            debt.Id.ToString(), "DebtRecovery", PlateFor(vehicles, debt.VehicleId), debt.Notes ?? "Balance recovery", Money(debt.BalanceAmount), EffectiveDateText(Present(debt.FollowUpDate), vehicles, debt.VehicleId), debt.Status.ToString(), "Debt recovery is operational data; accounting treatment is not verified.", "ReviewOnly"
        }));
        rows.AddRange(input.PaymentVouchers.Select(voucher => new[] {
            voucher.Id.ToString(), "PaymentVoucher", PlateFor(vehicles, voucher.VehicleId), $"{voucher.PayeeName}: {voucher.Purpose} | {voucher.PaymentMethod} | Source {voucher.SourceAccountCode} | Account {voucher.AccountingAccountCode} | Ref {voucher.ChequeNumber ?? voucher.PaymentReference ?? "-"} | Bank charge {Money(voucher.BankChargeAmount)} ({voucher.BankChargeAccountCode ?? "-"})", Money(voucher.Amount), EffectiveDateText(Present(voucher.IssuedDate), vehicles, voucher.VehicleId), voucher.Status.ToString(), voucher.Status == PaymentVoucherStatus.Paid ? "Paid with maker-checker evidence captured; TaxCode still needs Finance mapping." : "Do not post until the voucher is paid.", "ReviewRequired"
        }));
        rows.AddRange(input.Settlements.Select(settlement => SettlementExportRow(settlement, vehicles).Append("ReviewRequired").ToArray()));
        return rows;
    }

    private static IReadOnlyList<string> SettlementExportRow(SettlementReminder settlement, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        if (SettlementRules.IsLegacy(settlement))
        {
            return [
                settlement.Id.ToString(), "Settlement", PlateFor(vehicles, settlement.VehicleId), "Previous owner settlement", Money(settlement.Amount), EffectiveDateText(Present(settlement.Deadline), vehicles, settlement.VehicleId), settlement.IsPaid ? "Paid" : "Due", "Settlement account mapping is not verified."
            ];
        }

        var absoluteDifference = Money(settlement.Amount);
        var purchaseSnapshot = Money(settlement.PurchasePriceSnapshot ?? 0m);
        var bankDebt = Money(settlement.BankDebtAmount ?? 0m);
        var (category, action, exportedAmount, remark) = settlement.Direction switch
        {
            SettlementDirection.PaySeller => (
                "SettlementPaySeller",
                "Suggested Payment Voucher",
                Money(settlement.Amount),
                "Suggested Payment Voucher only; review seller and manual AutoCount account mapping. Do not post automatically."),
            SettlementDirection.CollectFromSeller => (
                "SettlementCollectFromSeller",
                "Suggested Official Receipt",
                Money(-settlement.Amount),
                "Suggested Official Receipt only; review seller and manual AutoCount account mapping. Do not post automatically."),
            SettlementDirection.InternalOffset => (
                "SettlementInternalOffset",
                "Internal offset",
                Money(0m),
                "Internal offset only; no cash action. Do not post automatically."),
            _ => throw new InvalidOperationException("Calculated settlement direction is invalid.")
        };
        var description = $"{action} | Direction: {settlement.Direction} | Absolute difference RM {absoluteDifference} | Purchase snapshot RM {purchaseSnapshot} | Bank debt RM {bankDebt}";
        return [
            settlement.Id.ToString(), category, PlateFor(vehicles, settlement.VehicleId), description, exportedAmount, EffectiveDateText(Present(settlement.Deadline), vehicles, settlement.VehicleId), settlement.IsPaid ? "Completed" : "Open", remark
        ];
    }

    private static IReadOnlyList<IReadOnlyList<string>> SalesInvoiceRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "InvoiceNumber", "InvoiceDate", "CustomerId", "CustomerName", "CarPlate", "Amount", "SalesPrice", "InterestAdditionalCharges", "NcdAmount", "WindscreenCharges", "CreatedBy", RemarkHeader, "CustomerPhone", "CustomerAddress", "CustomerTinNumber", "SalesAgent", "LoanBankReference", "VehicleDescription", "DebtorCode", "CreditTerm", "TaxDate", "AutoCountDocNumber", "InsurancePaidOnBehalfAmount", "RoadTaxPaidOnBehalfAmount", "AdvancePaidOnBehalfAmount", "LineTotal", "Difference", "ReviewStatus" }
        };
        rows.AddRange((input.FinanceInvoices ?? []).OrderBy(invoice => invoice.InvoiceDate).Select(invoice => new[] {
            invoice.Id.ToString(), invoice.InvoiceNumber, Date(invoice.InvoiceDate), invoice.CustomerId.ToString(), invoice.CustomerName,
            string.IsNullOrWhiteSpace(invoice.VehiclePlateNumber) ? PlateFor(vehicles, invoice.VehicleId) : invoice.VehiclePlateNumber,
            Money(invoice.Amount), Money(invoice.SalesPrice), Money(invoice.InterestAdditionalCharges), Money(invoice.NcdAmount), Money(invoice.WindscreenCharges), invoice.CreatedBy,
            SalesLineTotal(invoice) != invoice.Amount ? "Invoice total differs from exported lines; review the agreed price variance or source amounts; do not post until resolved." : "YS Heng-issued snapshot. Confirm debtor, credit term, tax date, AutoCount document number and TaxCode before posting.",
            invoice.CustomerPhone ?? "", invoice.CustomerAddress ?? "", invoice.CustomerTinNumber ?? "", invoice.SalesAgentName ?? "", invoice.LoanBankReference ?? "", invoice.VehicleDescription, "", "", "", "",
            Money(invoice.InsurancePaidOnBehalfAmount), Money(invoice.RoadTaxPaidOnBehalfAmount), Money(invoice.AdvancePaidOnBehalfAmount), Money(SalesLineTotal(invoice)), Money(invoice.Amount - SalesLineTotal(invoice)), SalesLineTotal(invoice) == invoice.Amount ? "ReviewRequired" : "TotalsMismatch"
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> SalesLineRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "InvoiceNumber", "InvoiceDate", "CustomerTinNumber", "SalesAgent", "LoanBankReference", "CarPlate", "ItemCode", "Description", "AccountCode", "ClassificationCode", "TaxCode", "Amount", RemarkHeader, "LineNumber", "CustomerId", "DebtorCode", "Quantity", "UOM", "UnitPrice", "Discount" }
        };
        foreach (var invoice in (input.FinanceInvoices ?? []).OrderBy(item => item.InvoiceDate))
        {
            var plate = string.IsNullOrWhiteSpace(invoice.VehiclePlateNumber) ? PlateFor(vehicles, invoice.VehicleId) : invoice.VehiclePlateNumber;
            var lineNumber = 0;
            void AddLine(string itemCode, string description, string accountCode, string classification, decimal amount, string remark)
            {
                rows.Add(new[] { invoice.Id.ToString(), invoice.InvoiceNumber, Date(invoice.InvoiceDate), invoice.CustomerTinNumber ?? "", invoice.SalesAgentName ?? "", invoice.LoanBankReference ?? "", plate, itemCode, description, accountCode, classification, "", Money(amount), remark,
                    (++lineNumber).ToString(CultureInfo.InvariantCulture), invoice.CustomerId.ToString(), "", "1", "UNIT", Money(amount), "0" });
            }
            AddLine(plate, $"{plate} - {invoice.VehicleDescription}".Trim(" -".ToCharArray()), "5S00-0000", "025", invoice.SalesPrice, "Vehicle account/classification follows the sales video. TaxCode is intentionally blank.");
            if (invoice.InterestAdditionalCharges != 0)
            {
                AddLine("ADDITIONAL CHARGES", "Interest / additional charges", "", "", invoice.InterestAdditionalCharges, "Finance must select the approved AutoCount item, account, classification and TaxCode before import.");
            }
            if (invoice.WindscreenCharges != 0)
            {
                AddLine("WINDSCREEN", "Windscreen charges", "", "", invoice.WindscreenCharges, "Finance must select the approved AutoCount item, account, classification and TaxCode before import.");
            }
            if (invoice.NcdAmount != 0)
            {
                AddLine("NCD", "NCD deduction", "", "", -invoice.NcdAmount, "Finance must select the approved AutoCount item, account, classification and TaxCode before import.");
            }
            if (invoice.InsurancePaidOnBehalfAmount > 0)
            {
                AddLine("INSURANCE (MV)", $"INSURANCE FOR MOTOR VEHICLE - {plate}", "4001-I001", "006", invoice.InsurancePaidOnBehalfAmount, "Insurance account/classification follows the sales video. TaxCode is intentionally blank.");
            }
            if (invoice.RoadTaxPaidOnBehalfAmount > 0)
            {
                AddLine("ROAD TAX", $"ROAD TAX - {plate}", "4001-R001", "006", invoice.RoadTaxPaidOnBehalfAmount, "Road-tax account/classification follows the sales video. TaxCode is intentionally blank.");
            }
            if (invoice.AdvancePaidOnBehalfAmount > 0)
            {
                AddLine("ADVANCE", "Other advance paid on behalf", "", "", invoice.AdvancePaidOnBehalfAmount, "Finance must select the approved AutoCount item, account, classification and TaxCode before import.");
            }
        }
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> DeliveryAccountingChargeRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var suppliers = (input.Suppliers ?? []).ToDictionary(supplier => supplier.Id);
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "CarPlate", "ChargeType", "Provider", "SupplierCreditorCode", "InvoiceDate", "ReferenceNumber", "Amount", "PaidOnBehalf", "PurchaseAccountCode", "ClassificationCode", "TaxCode", "AccountingStatus", RemarkHeader }
        };
        rows.AddRange((input.DeliveryAccountingCharges ?? []).OrderBy(charge => charge.InvoiceDate).Select(charge => new[] {
            charge.Id.ToString(), PlateFor(vehicles, charge.VehicleId), charge.ChargeType.ToString(), charge.ProviderName,
            charge.SupplierId.HasValue && suppliers.TryGetValue(charge.SupplierId.Value, out var supplier) ? supplier.AutoCountCreditorCode ?? "" : "",
            Date(charge.InvoiceDate), charge.ReferenceNumber ?? "", Money(charge.Amount), charge.PaidOnBehalf ? "Yes" : "No",
            charge.ChargeType == DeliveryAccountingChargeType.Insurance ? "4001-I002" : "", "006", "", charge.AccountingStatus.ToString(),
            charge.AccountingStatus == AccountingConfirmationStatus.FinanceConfirmed ? "Finance confirmed; TaxCode remains a separate unresolved field." : "Draft only; do not import."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> CollectionRows(
        AutoCountExportInput input,
        IReadOnlyDictionary<Guid, Vehicle> vehicles,
        IReadOnlyDictionary<Guid, PaymentRecord> payments,
        IReadOnlyList<FinanceInvoice> invoiceLookup)
    {
        var invoices = invoiceLookup.ToDictionary(invoice => invoice.PaymentRecordId);
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "PaymentRecordId", "InvoiceNumber", "CarPlate", "ReceivedDate", "Amount", "Method", "CollectionStatus", "FinancingStatus", "Reference", "CreatedBy", "ReconciledBy", "ReconciledAt", "ReversalReason", RemarkHeader }
        };
        rows.AddRange((input.Collections ?? []).OrderBy(collection => collection.ReceivedDate).Select(collection =>
        {
            payments.TryGetValue(collection.PaymentRecordId, out var payment);
            invoices.TryGetValue(collection.PaymentRecordId, out var invoice);
            var remark = collection.Status switch
            {
                CollectionStatus.Reconciled => "Reconciled in YS Heng; confirm bank and AutoCount receipt/account mapping before posting.",
                CollectionStatus.Reversed => "Reversed in YS Heng; do not post as an active receipt. Review any matching AutoCount entry.",
                _ => "Pending reconciliation in YS Heng; do not treat as a completed receipt."
            };
            return new[] {
                collection.Id.ToString(), collection.PaymentRecordId.ToString(), invoice?.InvoiceNumber ?? "",
                payment is null ? "" : PlateFor(vehicles, payment.VehicleId), Date(collection.ReceivedDate), Money(collection.Amount),
                collection.Method.ToString(), collection.Status.ToString(), collection.FinancingStatus.ToString(), collection.Reference ?? "",
                collection.CreatedBy, collection.ReconciledBy ?? "", collection.ReconciledAt?.ToString("O", CultureInfo.InvariantCulture) ?? "", collection.ReversalReason ?? "", remark
            };
        }));
        return rows;
    }

    private static string VehicleDate(IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) => vehicles.TryGetValue(vehicleId, out var vehicle) ? Date(vehicle.IntakeDate) : "";
    private static string PlateFor(IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) => vehicles.TryGetValue(vehicleId, out var vehicle) ? vehicle.PlateNumber : "";
    private static DateOnly? EffectiveDate(DateOnly? ownDate, IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) => ownDate ?? (vehicles.TryGetValue(vehicleId, out var vehicle) ? vehicle.IntakeDate : null);
    private static string EffectiveDateText(DateOnly? ownDate, IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) => Date(EffectiveDate(ownDate, vehicles, vehicleId));
    private static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
    private static string Number(decimal value) => value.ToString("0.############################", CultureInfo.InvariantCulture);
    private static string PurchaseAccountCode(PurchaseInvoiceLineType lineType) => lineType switch
    {
        PurchaseInvoiceLineType.VehiclePurchase => "6P00-0000",
        PurchaseInvoiceLineType.PurchaseProcessing => "6P00-1000",
        PurchaseInvoiceLineType.Parking => "6T00-1000",
        PurchaseInvoiceLineType.Refurbishment => "6R00-0000",
        _ => ""
    };
    private static string Date(DateOnly? value) => value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "";
    private static DateOnly? Present(DateOnly value) => value == default ? null : value;
    private static DateOnly? Present(DateOnly? value) => value is { } date && date != default ? date : null;
    private static bool InPeriod(DateOnly? date, DateOnly? from, DateOnly? to) => from is null && to is null || date.HasValue && (!from.HasValue || date.Value >= from.Value) && (!to.HasValue || date.Value <= to.Value);

    private sealed record Sheet(string Name, IReadOnlyList<IReadOnlyList<string>> Rows, int HeaderRow = 0);

    private static void WriteEntry(ZipArchive archive, string path, string content)
    {
        var entry = archive.CreateEntry(path, CompressionLevel.Optimal);
        using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false));
        writer.Write(content);
    }

    private static string WorksheetXml(Sheet sheet)
    {
        var rows = sheet.Rows;
        var builder = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>");
        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            builder.Append($"<row r=\"{rowIndex + 1}\">");
            for (var columnIndex = 0; columnIndex < rows[rowIndex].Count; columnIndex++)
            {
                var reference = $"{ColumnName(columnIndex + 1)}{rowIndex + 1}";
                var value = rows[rowIndex][columnIndex] ?? "";
                var header = rows[sheet.HeaderRow].Count > columnIndex ? rows[sheet.HeaderRow][columnIndex] : "";
                if (rowIndex > sheet.HeaderRow && IsNumericColumn(header) && decimal.TryParse(value, header is "Quantity" or "Qty" ? NumberStyles.Float : NumberStyles.Number, CultureInfo.InvariantCulture, out var numericValue))
                {
                    builder.Append($"<c r=\"{reference}\" t=\"n\"><v>{numericValue.ToString("0.####################", CultureInfo.InvariantCulture)}</v></c>");
                }
                else
                {
                    builder.Append($"<c r=\"{reference}\" t=\"inlineStr\"><is><t xml:space=\"preserve\">{Xml(value)}</t></is></c>");
                }
            }
            builder.Append("</row>");
        }
        return builder.Append("</sheetData></worksheet>").ToString();
    }

    private static string WorkbookXml(IReadOnlyList<Sheet> sheets)
    {
        var builder = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets>");
        for (var index = 0; index < sheets.Count; index++) builder.Append($"<sheet name=\"{Xml(sheets[index].Name)}\" sheetId=\"{index + 1}\" r:id=\"rId{index + 1}\"/>");
        return builder.Append("</sheets></workbook>").ToString();
    }

    private static string WorkbookRelationshipsXml(int sheetCount) =>
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
        string.Concat(Enumerable.Range(1, sheetCount).Select(index => $"<Relationship Id=\"rId{index}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet{index}.xml\"/>")) +
        $"<Relationship Id=\"rId{sheetCount + 1}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>";

    private static string ContentTypesXml(int sheetCount) =>
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>" +
        string.Concat(Enumerable.Range(1, sheetCount).Select(index => $"<Override PartName=\"/xl/worksheets/sheet{index}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>")) +
        "</Types>";

    private static string RootRelationshipsXml() => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>";
    private static string StylesXml() => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><fonts count=\"1\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts><fills count=\"2\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill></fills><borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/></cellXfs></styleSheet>";
    private static string Xml(string value) => SecurityElement.Escape(value) ?? "";
    private static bool IsNumericColumn(string header) => header is "Year" or "PurchasePrice" or "ModifiedPurchasePrice" or "SellingPrice" or "AdditionalCharges" or "RefurbishmentTotal" or "CommissionTotal" or "Amount" or "NettPrice" or "SalesPrice" or "InterestAdditionalCharges" or "NcdAmount" or "WindscreenCharges"
        or "InsurancePaidOnBehalfAmount" or "RoadTaxPaidOnBehalfAmount" or "AdvancePaidOnBehalfAmount" or "LineTotal" or "Difference" or "Quantity" or "UnitPrice" or "Discount" or "LineNumber" or "ReceiptTotal" or "Qty" or "FOCQty" or "SubTotal" or "TaxRate" or "LocalTotalCost" or "Duty" or "ForeignCharges" or "LocalCharges";

    private static string ColumnName(int column)
    {
        var name = new StringBuilder();
        while (column > 0)
        {
            column--;
            name.Insert(0, (char)('A' + column % 26));
            column /= 26;
        }
        return name.ToString();
    }
}

public static class AutoCountDateRules
{
    private static readonly TimeZoneInfo SingaporeTimeZone = ResolveSingaporeTimeZone();

    public static DateOnly SingaporeAccountingDate(DateTime value)
    {
        var utc = value.Kind == DateTimeKind.Local
            ? value.ToUniversalTime()
            : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utc, SingaporeTimeZone));
    }

    public static string PeriodLabel(DateOnly? from, DateOnly? to) =>
        from is null && to is null
            ? "all"
            : $"{from?.ToString("yyyyMMdd", CultureInfo.InvariantCulture) ?? "start"}-{to?.ToString("yyyyMMdd", CultureInfo.InvariantCulture) ?? "end"}";

    public static bool IsValidPeriod(DateOnly? from, DateOnly? to) => !from.HasValue || !to.HasValue || from <= to;

    private static TimeZoneInfo ResolveSingaporeTimeZone()
    {
        foreach (var id in new[] { "Asia/Singapore", "Singapore Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
                // Try the other platform-specific identifier.
            }
            catch (InvalidTimeZoneException)
            {
                // Try the other platform-specific identifier.
            }
        }

        return TimeZoneInfo.Utc;
    }
}
