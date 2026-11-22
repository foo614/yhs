using System.Globalization;
using System.IO.Compression;
using System.Security;
using System.Text;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record StockListExportFilter(VehiclePurchaseSource? Source = null, bool IncludeSold = false);

public static class StockListExport
{
    public static readonly string[] Headers = ["No", "Date", "Vehicle No", "Model", "Year", "Purchase Source", "UCD Date", "Bank Loan", "S.Key"];

    public static byte[] Export(IEnumerable<Vehicle> vehicles, IEnumerable<SettlementReminder> settlements, StockListExportFilter filter)
    {
        var rows = Rows(vehicles, settlements, filter);
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            WriteEntry(archive, "[Content_Types].xml", ContentTypesXml);
            WriteEntry(archive, "_rels/.rels", RootRelationshipsXml);
            WriteEntry(archive, "xl/workbook.xml", WorkbookXml);
            WriteEntry(archive, "xl/_rels/workbook.xml.rels", WorkbookRelationshipsXml);
            WriteEntry(archive, "xl/styles.xml", StylesXml);
            WriteEntry(archive, "xl/worksheets/sheet1.xml", WorksheetXml(rows));
        }

        return output.ToArray();
    }

    internal static IReadOnlyList<IReadOnlyList<string>> Rows(IEnumerable<Vehicle> vehicles,
        IEnumerable<SettlementReminder> settlements, StockListExportFilter filter)
    {
        var settlementByVehicle = settlements
            .GroupBy(item => item.VehicleId)
            .ToDictionary(group => group.Key, group => group.Where(item => !item.SupersededById.HasValue).ToArray());
        var selected = vehicles
            .Where(vehicle => filter.IncludeSold || vehicle.Status != VehicleStatus.Sold)
            .Where(vehicle => !filter.Source.HasValue || vehicle.PurchaseSource == filter.Source.Value)
            .OrderBy(vehicle => vehicle.PlateNumber, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var rows = new List<IReadOnlyList<string>> { Headers };
        for (var index = 0; index < selected.Count; index++)
        {
            var vehicle = selected[index];
            rows.Add([
                (index + 1).ToString(CultureInfo.InvariantCulture),
                vehicle.IntakeDate.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
                vehicle.PlateNumber,
                vehicle.Model,
                vehicle.Year.ToString(CultureInfo.InvariantCulture),
                SourceCode(vehicle.PurchaseSource),
                "", // UCD Date remains blank until the source field is mapped and confirmed.
                BankLoanLabel(vehicle, settlementByVehicle.GetValueOrDefault(vehicle.Id) ?? []),
                vehicle.HasSpareKey switch { true => "Yes", false => "No", _ => "" }
            ]);
        }

        return rows;
    }

    private static string BankLoanLabel(Vehicle vehicle, IReadOnlyList<SettlementReminder> settlements)
    {
        var outstanding = settlements.Where(item => !item.IsPaid && item.BankDebtAmount > 0m).ToArray();
        if (outstanding.Length == 1) return outstanding[0].BankName?.Trim() ?? "";
        if (outstanding.Length > 1) return "";
        if (vehicle.HasBankDebt == false || settlements.Any(item => item.Direction == SettlementDirection.PayBank && item.IsPaid)) return "CASH";
        return "";
    }

    public static string SourceCode(VehiclePurchaseSource source) => source switch
    {
        VehiclePurchaseSource.Carro => "MY",
        VehiclePurchaseSource.Carsome => "CAR",
        VehiclePurchaseSource.YSHeng => "YS",
        VehiclePurchaseSource.KSA => "KLG",
        _ => source.ToString()
    };

    private static void WriteEntry(ZipArchive archive, string path, string content)
    {
        var entry = archive.CreateEntry(path, CompressionLevel.Fastest);
        using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false));
        writer.Write(content);
    }

    private static string Cell(string value, int row, int column) =>
        $"<c r=\"{ColumnName(column)}{row}\" t=\"inlineStr\"><is><t xml:space=\"preserve\">{Escape(value)}</t></is></c>";

    private static string WorksheetXml(IReadOnlyList<IReadOnlyList<string>> rows)
    {
        var body = new StringBuilder();
        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            var excelRow = rowIndex + 1;
            body.Append($"<row r=\"{excelRow}\">");
            for (var columnIndex = 0; columnIndex < rows[rowIndex].Count; columnIndex++)
                body.Append(Cell(rows[rowIndex][columnIndex], excelRow, columnIndex));
            body.Append("</row>");
        }

        return $"<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>{body}</sheetData></worksheet>";
    }

    private static string ColumnName(int zeroBased)
    {
        var value = zeroBased + 1;
        var result = new StringBuilder();
        while (value > 0)
        {
            value--;
            result.Insert(0, (char)('A' + value % 26));
            value /= 26;
        }
        return result.ToString();
    }

    private static string Escape(string value) => SecurityElement.Escape(value) ?? "";

    private const string ContentTypesXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/></Types>";
    private const string RootRelationshipsXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>";
    private const string WorkbookXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"Stock List\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>";
    private const string WorkbookRelationshipsXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/><Relationship Id=\"rId2\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>";
    private const string StylesXml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><fonts count=\"1\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts><fills count=\"2\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill></fills><borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellXfs></styleSheet>";
}
