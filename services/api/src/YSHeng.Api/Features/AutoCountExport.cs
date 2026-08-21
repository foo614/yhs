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
    DateTime GeneratedAtUtc);

/// <summary>
/// Builds a small, dependency-free Open XML workbook for manual AutoCount mapping.
/// This is intentionally not presented as a verified direct-import file.
/// </summary>
public static class AutoCountExcel
{
    private const string RemarkHeader = "Remark";

    public static byte[] Export(AutoCountExportInput input)
    {
        var sourceVehicles = input.Vehicles.ToDictionary(vehicle => vehicle.Id);
        var selectedPurchaseInvoices = input.PurchaseInvoices
            .Where(invoice => InPeriod(EffectiveDate(null, sourceVehicles, invoice.VehicleId), input.From, input.To)).ToList();
        var selectedSupplierInvoices = input.SupplierInvoices
            .Where(invoice => InPeriod(EffectiveDate(Present(invoice.PaidAt) ?? Present(invoice.DueDate), sourceVehicles, invoice.VehicleId), input.From, input.To)).ToList();
        var selectedPayments = input.Payments
            .Where(payment => InPeriod(AutoCountDateRules.SingaporeAccountingDate(payment.CreatedAt), input.From, input.To)).ToList();
        var selectedRepairs = input.Repairs
            .Where(repair => InPeriod(EffectiveDate(null, sourceVehicles, repair.VehicleId), input.From, input.To)).ToList();
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

        var referencedVehicleIds = input.Vehicles
            .Where(vehicle => InPeriod(vehicle.IntakeDate, input.From, input.To))
            .Select(vehicle => vehicle.Id)
            .ToHashSet();
        foreach (var vehicleId in selectedPurchaseInvoices.Select(invoice => invoice.VehicleId)
                     .Concat(selectedSupplierInvoices.Select(invoice => invoice.VehicleId))
                     .Concat(selectedPayments.Select(payment => payment.VehicleId))
                     .Concat(selectedRepairs.Select(repair => repair.VehicleId))
                     .Concat(selectedBrokerCommissions.Select(commission => commission.VehicleId))
                     .Concat(selectedDebtRecoveries.Select(debt => debt.VehicleId))
                     .Concat(selectedPaymentVouchers.Select(voucher => voucher.VehicleId))
                     .Concat(selectedSettlements.Select(settlement => settlement.VehicleId)))
        {
            referencedVehicleIds.Add(vehicleId);
        }

        // A referenced master row must travel with its transaction even when the master date is outside the selected period.
        var includedVehicles = input.Vehicles.Where(vehicle => referencedVehicleIds.Contains(vehicle.Id)).ToList();
        var includedCustomerIds = includedVehicles.Where(vehicle => vehicle.CustomerId.HasValue).Select(vehicle => vehicle.CustomerId!.Value).ToHashSet();
        var includedCustomers = input.Customers
            .Where(customer => includedCustomerIds.Contains(customer.Id))
            .OrderBy(customer => customer.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var selectedInput = input with
        {
            Vehicles = includedVehicles,
            Customers = includedCustomers,
            PurchaseInvoices = selectedPurchaseInvoices,
            SupplierInvoices = selectedSupplierInvoices,
            Payments = selectedPayments,
            Repairs = selectedRepairs,
            DailySpends = selectedDailySpends,
            BrokerCommissions = selectedBrokerCommissions,
            DebtRecoveries = selectedDebtRecoveries,
            PaymentVouchers = selectedPaymentVouchers,
            Settlements = selectedSettlements
        };
        var vehicleLookup = selectedInput.Vehicles.ToDictionary(vehicle => vehicle.Id);

        var sheets = new List<Sheet>
        {
            new("Manifest", ManifestRows(selectedInput, includedVehicles, includedCustomers)),
            new("Customers", CustomerRows(includedCustomers)),
            new("Vehicles", VehicleRows(includedVehicles)),
            new("Purchases", PurchaseRows(selectedInput, vehicleLookup)),
            new("Payments", PaymentRows(selectedInput, vehicleLookup)),
            new("Expenses", ExpenseRows(selectedInput, vehicleLookup))
        };

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
                WriteEntry(archive, $"xl/worksheets/sheet{index + 1}.xml", WorksheetXml(sheets[index].Rows));
            }
        }

        return output.ToArray();
    }

    private static IReadOnlyList<IReadOnlyList<string>> ManifestRows(AutoCountExportInput input, IReadOnlyList<Vehicle> vehicles, IReadOnlyList<Customer> customers)
    {
        var from = input.From?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "Not set";
        var to = input.To?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "Not set";
        return
        [
            ["AutoCount V1 mapping workbook", "Value"],
            ["Workbook purpose", "Manual mapping aid for AutoCount 2.2 review; this is not a verified direct AutoCount import."],
            ["Generated at (UTC)", input.GeneratedAtUtc.ToString("O", CultureInfo.InvariantCulture)],
            ["Period from (inclusive)", from],
            ["Period to (inclusive)", to],
            ["Category sheets", "Customers, Vehicles, Purchases, Payments, Expenses"],
            ["Vehicles included", vehicles.Count.ToString(CultureInfo.InvariantCulture)],
            ["Customers included", customers.Count.ToString(CultureInfo.InvariantCulture)],
            ["Data boundary", "Only values currently persisted in YS Heng are included; no new database fields are inferred."],
            ["Mapping limitation", "AutoCount account codes, tax codes, TIN, supplier address, insurance amount and loan fees are not verified or persisted here."],
            ["Period note", "Records without their own date use the linked vehicle intake date where available; PaymentRecord.CreatedAt is converted to Asia/Singapore accounting date; referenced vehicle/customer masters are retained."],
            ["Cell typing", "Money and whole-number fields are emitted as numeric XLSX cells where practical; identifiers, dates, statuses and Remarks remain text."],
            ["Review instruction", "Check every Remark field and confirm the AutoCount 2.2 template/account mapping before any manual import."]
        ];
    }

    private static IReadOnlyList<IReadOnlyList<string>> CustomerRows(IReadOnlyList<Customer> customers)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "CustomerName", "Phone", "IcNumber", "Email", "Address", RemarkHeader } };
        rows.AddRange(customers.Select(customer => new[] {
            customer.Id.ToString(), customer.Name, customer.Phone, customer.IcNumber ?? "", customer.Email ?? "", customer.Address ?? "",
            string.IsNullOrWhiteSpace(customer.Address) ? "Address is not persisted; confirm AutoCount customer master mapping." : "Customer/account code mapping not verified."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> VehicleRows(IReadOnlyList<Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "CarPlate", "ChassisNumber", "EngineNumber", "Make", "Model", "Year", "StockOwner", "StockLocation", "Status", "PurchasePrice", "SellingPrice", "AdditionalCharges", "RefurbishmentTotal", "CommissionTotal", "CustomerId", "OwnerId", "IntakeDate", RemarkHeader }
        };
        rows.AddRange(vehicles.Select(vehicle => new[] {
            vehicle.Id.ToString(), vehicle.PlateNumber, vehicle.ChassisNumber ?? "", vehicle.EngineNumber ?? "", vehicle.Make, vehicle.Model, vehicle.Year.ToString(CultureInfo.InvariantCulture), vehicle.StockOwner.ToString(), vehicle.StockLocation, vehicle.Status.ToString(),
            Money(vehicle.PurchasePrice), Money(vehicle.SellingPrice), Money(vehicle.AdditionalCharges), Money(vehicle.RefurbishmentTotal), Money(vehicle.CommissionTotal),
            vehicle.CustomerId?.ToString() ?? "", vehicle.OwnerId?.ToString() ?? "", vehicle.IntakeDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            "Item/account/tax mapping is not verified; TIN, supplier address, insurance amount and loan fees are not persisted."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> PurchaseRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "Category", "CarPlate", "InvoiceNumber", "SupplierName", "PlateNumberOnInvoice", "Amount", "EffectiveDate", "DueDate", "PaidAt", RemarkHeader } };
        rows.AddRange(input.PurchaseInvoices.Select(invoice => new[] {
            invoice.Id.ToString(), "PurchaseInvoice", PlateFor(vehicles, invoice.VehicleId), invoice.InvoiceNumber, "", "", Money(invoice.Amount), VehicleDate(vehicles, invoice.VehicleId), "", "", "Supplier/account/tax mapping is not verified; source has no invoice date."
        }));
        rows.AddRange(input.SupplierInvoices.Select(invoice => new[] {
            invoice.Id.ToString(), "SupplierInvoice", PlateFor(vehicles, invoice.VehicleId), invoice.InvoiceNumber, invoice.SupplierName, invoice.PlateNumberOnInvoice ?? "", Money(invoice.Amount), EffectiveDateText(Present(invoice.PaidAt) ?? Present(invoice.DueDate), vehicles, invoice.VehicleId), Date(Present(invoice.DueDate)), Date(Present(invoice.PaidAt)), "Supplier address, account code and tax mapping are not verified."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> PaymentRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "CarPlate", "Status", "NettPrice", "ReceiptNumber", "InvoiceNumber", "SalesPrice", "InterestAdditionalCharges", "NcdAmount", "WindscreenCharges", "OutstationDeliveryDate", "BankName", "BankFollowUpDate", "CreatedAt", RemarkHeader } };
        rows.AddRange(input.Payments.OrderByDescending(payment => payment.CreatedAt).Select(payment => new[] {
            payment.Id.ToString(), PlateFor(vehicles, payment.VehicleId), payment.Status.ToString(), Money(payment.NettPrice), payment.ReceiptNumber ?? "", payment.InvoiceNumber ?? "", Money(payment.SalesPrice), Money(payment.InterestAdditionalCharges), Money(payment.NcdAmount), Money(payment.WindscreenCharges), Date(payment.OutstationDeliveryDate), payment.BankName ?? "", Date(payment.BankFollowUpDate), AutoCountDateRules.SingaporeAccountingDate(payment.CreatedAt).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            "Manual review required; this workbook is a mapping aid and not a verified direct AutoCount import."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> ExpenseRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "Category", "CarPlate", "Description", "Amount", "EffectiveDate", "Status", RemarkHeader } };
        rows.AddRange(input.Repairs.Select(repair => new[] {
            repair.Id.ToString(), "Repair", PlateFor(vehicles, repair.VehicleId), $"{repair.RepairPart} - {repair.WhatToDo}".Trim(" -".ToCharArray()), Money(repair.Cost), VehicleDate(vehicles, repair.VehicleId), repair.ApprovalStatus.ToString(), "Repair expense/account mapping is not verified; source has no repair date."
        }));
        rows.AddRange(input.DailySpends.Select(spend => new[] {
            spend.Id.ToString(), "DailySpend", "", spend.Description, Money(spend.Amount), Date(Present(spend.DueDate)), spend.IsPaid ? "Paid" : "Due", "Expense account/tax mapping is not verified."
        }));
        rows.AddRange(input.BrokerCommissions.Select(commission => new[] {
            commission.Id.ToString(), "BrokerCommission", PlateFor(vehicles, commission.VehicleId), commission.BrokerName, Money(commission.Amount), VehicleDate(vehicles, commission.VehicleId), commission.IsPaid ? "Paid" : "Unpaid", "Broker/account mapping is not verified; source has no commission date."
        }));
        rows.AddRange(input.DebtRecoveries.Select(debt => new[] {
            debt.Id.ToString(), "DebtRecovery", PlateFor(vehicles, debt.VehicleId), debt.Notes ?? "Balance recovery", Money(debt.BalanceAmount), EffectiveDateText(Present(debt.FollowUpDate), vehicles, debt.VehicleId), debt.Status.ToString(), "Debt recovery is operational data; accounting treatment is not verified."
        }));
        rows.AddRange(input.PaymentVouchers.Select(voucher => new[] {
            voucher.Id.ToString(), "PaymentVoucher", PlateFor(vehicles, voucher.VehicleId), $"{voucher.PayeeName}: {voucher.Purpose}", Money(voucher.Amount), EffectiveDateText(Present(voucher.IssuedDate), vehicles, voucher.VehicleId), voucher.Status.ToString(), "Payment voucher account/tax mapping is not verified."
        }));
        rows.AddRange(input.Settlements.Select(settlement => new[] {
            settlement.Id.ToString(), "Settlement", PlateFor(vehicles, settlement.VehicleId), "Previous owner settlement", Money(settlement.Amount), EffectiveDateText(Present(settlement.Deadline), vehicles, settlement.VehicleId), settlement.IsPaid ? "Paid" : "Due", "Settlement account mapping is not verified."
        }));
        return rows;
    }

    private static string VehicleDate(IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) => vehicles.TryGetValue(vehicleId, out var vehicle) ? Date(vehicle.IntakeDate) : "";
    private static string PlateFor(IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) => vehicles.TryGetValue(vehicleId, out var vehicle) ? vehicle.PlateNumber : "";
    private static DateOnly? EffectiveDate(DateOnly? ownDate, IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) => ownDate ?? (vehicles.TryGetValue(vehicleId, out var vehicle) ? vehicle.IntakeDate : null);
    private static string EffectiveDateText(DateOnly? ownDate, IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) => Date(EffectiveDate(ownDate, vehicles, vehicleId));
    private static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
    private static string Date(DateOnly? value) => value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "";
    private static DateOnly? Present(DateOnly value) => value == default ? null : value;
    private static DateOnly? Present(DateOnly? value) => value is { } date && date != default ? date : null;
    private static bool InPeriod(DateOnly? date, DateOnly? from, DateOnly? to) => from is null && to is null || date.HasValue && (!from.HasValue || date.Value >= from.Value) && (!to.HasValue || date.Value <= to.Value);

    private sealed record Sheet(string Name, IReadOnlyList<IReadOnlyList<string>> Rows);

    private static void WriteEntry(ZipArchive archive, string path, string content)
    {
        var entry = archive.CreateEntry(path, CompressionLevel.Optimal);
        using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false));
        writer.Write(content);
    }

    private static string WorksheetXml(IReadOnlyList<IReadOnlyList<string>> rows)
    {
        var builder = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>");
        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            builder.Append($"<row r=\"{rowIndex + 1}\">");
            for (var columnIndex = 0; columnIndex < rows[rowIndex].Count; columnIndex++)
            {
                var reference = $"{ColumnName(columnIndex + 1)}{rowIndex + 1}";
                var value = rows[rowIndex][columnIndex] ?? "";
                var header = rows[0].Count > columnIndex ? rows[0][columnIndex] : "";
                if (rowIndex > 0 && IsNumericColumn(header) && decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var numericValue))
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
    private static bool IsNumericColumn(string header) => header is "Year" or "PurchasePrice" or "SellingPrice" or "AdditionalCharges" or "RefurbishmentTotal" or "CommissionTotal" or "Amount" or "NettPrice" or "SalesPrice" or "InterestAdditionalCharges" or "NcdAmount" or "WindscreenCharges";

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
