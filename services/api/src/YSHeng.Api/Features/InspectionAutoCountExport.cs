using System.Globalization;
using System.IO.Compression;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record InspectionAutoCountExportInput(
    IReadOnlyList<InspectionRecord> Inspections,
    IReadOnlyList<Vehicle> Vehicles,
    InspectionCompany Company);

public sealed record InspectionAutoCountMapping(
    InspectionCompany Company,
    string CreditorCode,
    string CreditorName,
    string ItemCode,
    string AccountCode,
    string Uom);

public static class InspectionAutoCountRules
{
    public static InspectionAutoCountMapping Mapping(InspectionCompany company) => company switch
    {
        InspectionCompany.YSHengAutomotive => new(company, "4T00-P004", "PUSPAKOM SDN BHD", "INSPECTION (PUSPAKOM)", "6I00-0000", "UNIT"),
        InspectionCompany.YSHengAuto => new(company, "4001-P002", "PUSPAKOM SDN BHD", "INSPECTION (PUSPAKOM)", "6020-O01", "JOB"),
        _ => throw new ArgumentOutOfRangeException(nameof(company), company, "Unsupported inspection company.")
    };

    public static string TypeName(InspectionType? type) => type switch
    {
        null => "",
        InspectionType.Awalan => "Awalan",
        InspectionType.Berkala => "Berkala",
        InspectionType.Khas => "Khas",
        InspectionType.BerkalaSemula => "Berkala Semula",
        InspectionType.PertukaranHakMilik => "Pertukaran Hak Milik",
        _ => "Unknown"
    };
}

public static partial class AutoCountExcel
{
    public static byte[] ExportInspection(InspectionAutoCountExportInput input)
    {
        var mapping = InspectionAutoCountRules.Mapping(input.Company);
        var vehicles = input.Vehicles.ToDictionary(vehicle => vehicle.Id);
        var records = input.Inspections
            .Where(item => item.Company == input.Company && item.Status != InspectionStatus.Cancelled)
            .Select(item => new InspectionExportRecord(item, vehicles.GetValueOrDefault(item.VehicleId)))
            .OrderBy(item => item.Inspection.AppointmentDate)
            .ThenBy(item => item.Vehicle?.PlateNumber ?? "", StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.Inspection.SupplierInvoiceReference, StringComparer.OrdinalIgnoreCase)
            .ThenBy(item => item.Inspection.Id)
            .ToList();

        var bookings = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "Company", "VehicleId", "CarPlate", "InspectionTypeCode", "InspectionType", "Status", "AppointmentDate", "BookingReference", "SourceReceiptNumber", "SupplierInvoiceReference", "SupplierDONumber", "ReceiptTotal", "AllocatedAmount", "CreditorCode", "CreditorName", "ItemCode", "AccountCode", "UOM", "Description", "AutoCountInvoiceNumber", "ReviewStatus", "Remark", "ReceiptDate" }
        };
        var guide = new List<IReadOnlyList<string>>
        {
            new[] { "Sheet", "DocumentType", "SupplierInvoiceNumber", "SupplierDONumber", "CarPlate", "Company", "InspectionTypeCode", "InspectionType", "Description", "SourceReceiptNumber", "Amount", "LineTotal", "Difference", "ReviewStatus", "CopyRange", "BeforePaste", "SourceId", "ReceiptDate" }
        };
        var documents = new List<Sheet>();
        var sequence = 0;

        foreach (var record in records)
        {
            var inspection = record.Inspection;
            var typeCode = inspection.Type is { } type ? ((int)type).ToString(CultureInfo.InvariantCulture) : "";
            var plate = record.Vehicle?.PlateNumber ?? "";
            var description = $"INSPECTION FEE - {plate}";
            var problems = InspectionProblems(record, inspection);
            var reviewStatus = problems.Count == 0 ? "ReviewRequired" : "BlockedForPaste";
            bookings.Add(new[] {
                inspection.Id.ToString(), mapping.Company.ToString(), inspection.VehicleId.ToString(), plate,
                typeCode, InspectionAutoCountRules.TypeName(inspection.Type), inspection.Status.ToString(),
                inspection.AppointmentDate == default ? "" : inspection.AppointmentDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                inspection.BookingReference, inspection.SourceReceiptNumber, inspection.SupplierInvoiceReference, inspection.SupplierInvoiceReference,
                Money(inspection.ReceiptTotal), Money(inspection.AllocatedAmount), mapping.CreditorCode, mapping.CreditorName,
                mapping.ItemCode, mapping.AccountCode, mapping.Uom, description, "", reviewStatus,
                problems.Count == 0
                    ? "Original receipt number is reused for this vehicle allocation. Supplier Invoice No is manual and preserved exactly; no automatic suffix or AutoCount invoice number is created. Review account, item, UOM and TaxCode before saving."
                    : string.Join(" ", problems), inspection.ReceiptDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? ""
            });

            var invoiceNumber = inspection.SupplierInvoiceReference;
            var amount = Money(inspection.AllocatedAmount);
            var typeName = InspectionAutoCountRules.TypeName(inspection.Type);
            var typeDescription = inspection.Company == InspectionCompany.YSHengAutomotive
                ? ""
                : inspection.Type is null ? "" : $"{typeCode} - {(inspection.Type == InspectionType.PertukaranHakMilik ? "Pertukaran Hak" : typeName)}";
            string sheetName = "";
            string copyRange = "";
            if (problems.Count == 0)
            {
                sheetName = $"PI_{++sequence:D4}";
                var line = new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["ItemCode"] = mapping.ItemCode,
                    ["Description"] = description,
                    ["UOM"] = mapping.Uom,
                    ["Quantity"] = "1",
                    ["UnitPrice"] = Number(inspection.AllocatedAmount),
                    ["Discount"] = "0",
                    ["Amount"] = amount,
                    ["AccountCode"] = mapping.AccountCode,
                    ["TaxCode"] = ""
                };
                var invoice = new Dictionary<string, string>(StringComparer.Ordinal)
                {
                    ["CreditorCode"] = mapping.CreditorCode,
                    ["CreditorName"] = mapping.CreditorName,
                    ["Address"] = "",
                    ["Phone"] = "",
                    ["InvoiceDate"] = inspection.AppointmentDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    ["CreditTerm"] = "",
                    ["InvoiceNumber"] = invoiceNumber,
                    ["CarPlate"] = plate,
                    ["DocumentDescription"] = typeDescription,
                    ["SourceReceiptNumber"] = inspection.SourceReceiptNumber,
                    ["SupplierInvoiceNumber"] = invoiceNumber
                };
                var document = ClipboardDocument(sheetName, false, invoice, [line]);
                documents.Add(document);
                copyRange = $"A1:{ColumnName(document.Rows[document.HeaderRow].Count)}{document.Rows.Count}";
            }

            guide.Add(new[] {
                sheetName, "Purchase Invoice", invoiceNumber, invoiceNumber, plate, mapping.Company.ToString(),
                typeCode, InspectionAutoCountRules.TypeName(inspection.Type), typeDescription, inspection.SourceReceiptNumber,
                amount, amount, "0.00", reviewStatus, copyRange,
                problems.Count == 0
                    ? "Open a new Purchase Invoice, paste this sheet once, choose No for Auto Price Rule, then copy Supplier Invoice No and Supplier D/O No separately from this guide. Confirm the original receipt reference and allocated amount before Save."
                    : string.Join(" ", problems), inspection.Id.ToString(), inspection.ReceiptDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? ""
            });
        }

        var sheets = new List<Sheet>
        {
            new("InspectionBookings", bookings),
            new("PasteGuide", guide)
        };
        sheets.AddRange(documents);
        return WorkbookBytes(sheets);
    }

    private static List<string> InspectionProblems(InspectionExportRecord record, InspectionRecord inspection)
    {
        var problems = new List<string>();
        if (record.Vehicle is null || string.IsNullOrWhiteSpace(record.Vehicle.PlateNumber)) problems.Add("Vehicle plate is missing; do not paste.");
        if (inspection.Type is null && inspection.Company == InspectionCompany.YSHengAuto)
            problems.Add("Missing Special inspection type; do not paste.");
        else if (inspection.Type is not null && !InspectionRules.SupportedTypes.Contains(inspection.Type.Value))
            problems.Add("Inspection type is not supported; do not paste.");
        if (inspection.AppointmentDate == default) problems.Add("Missing appointment date; do not paste.");
        if (!inspection.ReceiptDate.HasValue || inspection.ReceiptDate.Value == default)
            problems.Add("Missing actual receipt/service date; enter it before selecting an export period or pasting a PI. No appointment, invoice or upload date is substituted.");
        if (string.IsNullOrWhiteSpace(inspection.BookingReference)) problems.Add("Missing booking reference; review the original booking.");
        if (string.IsNullOrWhiteSpace(inspection.SourceReceiptNumber)) problems.Add("Missing original receipt number; do not paste.");
        if (string.IsNullOrWhiteSpace(inspection.SupplierInvoiceReference)) problems.Add("Missing manual Supplier Invoice No; do not paste.");
        if (inspection.ReceiptTotal < 0 || inspection.AllocatedAmount <= 0 || inspection.AllocatedAmount > inspection.ReceiptTotal)
            problems.Add("Receipt total and per-vehicle allocated amount are inconsistent; do not paste.");
        return problems;
    }

    private static byte[] WorkbookBytes(IReadOnlyList<Sheet> sheets)
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            WriteEntry(archive, "[Content_Types].xml", ContentTypesXml(sheets.Count));
            WriteEntry(archive, "_rels/.rels", RootRelationshipsXml());
            WriteEntry(archive, "xl/workbook.xml", WorkbookXml(sheets));
            WriteEntry(archive, "xl/_rels/workbook.xml.rels", WorkbookRelationshipsXml(sheets.Count));
            WriteEntry(archive, "xl/styles.xml", StylesXml());
            for (var index = 0; index < sheets.Count; index++)
                WriteEntry(archive, $"xl/worksheets/sheet{index + 1}.xml", WorksheetXml(sheets[index]));
        }
        return output.ToArray();
    }

    private sealed record InspectionExportRecord(InspectionRecord Inspection, Vehicle? Vehicle);
}
