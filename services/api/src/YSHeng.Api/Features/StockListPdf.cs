using System.Globalization;
using System.Text;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class StockListPdf
{
    private const int Width = 842;
    private const int Height = 595;
    private const int Margin = 36;
    private const int TableTop = 461;
    private const int TableBottom = 54;
    private const int CellPadding = 6;
    private const double FontSize = 9;
    private static readonly int[] ColumnWidths = [34, 68, 83, 230, 45, 84, 65, 115, 46];

    public static byte[] Export(IEnumerable<Vehicle> vehicles, IEnumerable<SettlementReminder> settlements,
        StockListExportFilter filter, DateOnly reportDate)
    {
        var rows = StockListExport.Rows(vehicles, settlements, filter);
        var pages = new List<StringBuilder>();
        var page = StartPage(pages, rows.Count - 1, filter, reportDate);
        var y = (double)TableTop;
        foreach (var row in rows.Skip(1))
        {
            var cells = row.Select((value, index) => BrandedPdf.WrapToWidth(
                value.Replace('\r', ' ').Replace('\n', ' ').Replace('\t', ' '),
                FontSize, ColumnWidths[index] - 2 * CellPadding, CharacterWidth).ToArray()).ToArray();
            var lineCount = cells.Max(lines => lines.Length);
            var lineHeight = Math.Min(12, (TableTop - TableBottom - 8d) / Math.Max(1, lineCount));
            var rowHeight = Math.Max(20, lineCount * lineHeight + 8);
            if (y - rowHeight < TableBottom)
            {
                page = StartPage(pages, rows.Count - 1, filter, reportDate);
                y = TableTop;
            }

            if (int.Parse(row[0], CultureInfo.InvariantCulture) % 2 == 0)
                BrandedPdf.Fill(page, Margin, y - rowHeight, Width - Margin * 2, rowHeight, BrandedPdf.PaleGray);

            var x = Margin;
            for (var column = 0; column < cells.Length; column++)
            {
                var baseline = y - 4 - lineHeight * 0.78;
                foreach (var line in cells[column])
                {
                    BrandedPdf.Text(page, x + CellPadding, baseline, Math.Min(FontSize, lineHeight * 0.75), line,
                        bold: column == 2, color: BrandedPdf.Dark);
                    baseline -= lineHeight;
                }
                x += ColumnWidths[column];
            }

            y -= rowHeight;
            BrandedPdf.Line(page, Margin, y, Width - Margin, y, BrandedPdf.Rule);
        }

        if (rows.Count == 1)
            BrandedPdf.Text(page, Margin + CellPadding, TableTop - 22, 10,
                "No vehicles match these filters.", color: BrandedPdf.Muted);

        var reportReference = reportDate.ToString("dd MMM yyyy", CultureInfo.InvariantCulture);
        for (var index = 0; index < pages.Count; index++)
        {
            BrandedPdf.Line(pages[index], Margin, 42, Width - Margin, 42, BrandedPdf.Rule);
            BrandedPdf.Text(pages[index], Margin, 26, 8, $"YS Heng stock list  |  {reportReference}", color: BrandedPdf.Muted);
            BrandedPdf.Text(pages[index], Width - Margin - 85, 26, 8,
                $"Page {index + 1} of {pages.Count}", color: BrandedPdf.Muted);
        }

        return BrandedPdf.Create(pages.Select(item => item.ToString()).ToArray(), rows.SelectMany(row => row),
            pageWidth: Width, pageHeight: Height);
    }

    // Conservative upper bounds for the regular and bold Helvetica fonts used by this table.
    private static double CharacterWidth(char character) => FontSize * (character switch
    {
        ' ' or '/' or '.' or ',' or ':' => 0.31,
        >= '0' and <= '9' => 0.58,
        'W' or 'M' => 0.96,
        >= 'A' and <= 'Z' => 0.80,
        'w' or 'm' => 0.86,
        'i' or 'l' => 0.32,
        >= 'a' and <= 'z' => 0.65,
        _ => 1.05
    });

    private static StringBuilder StartPage(List<StringBuilder> pages, int count, StockListExportFilter filter,
        DateOnly reportDate)
    {
        var page = new StringBuilder();
        pages.Add(page);

        BrandedPdf.Fill(page, Margin, 535, Width - Margin * 2, 25, BrandedPdf.Navy);
        BrandedPdf.Text(page, Margin + 10, 543, 10, "YS HENG   /   VEHICLE INVENTORY", bold: true, color: "1 1 1");
        BrandedPdf.Text(page, Margin, 506, 21, "Stock List", bold: true, color: BrandedPdf.Dark);
        var source = filter.Source is { } selected ? StockListExport.SourceCode(selected) : "All sources";
        var scope = filter.IncludeSold ? "Includes sold vehicles" : "Current stock";
        var date = reportDate.ToString("dd MMM yyyy", CultureInfo.InvariantCulture);
        BrandedPdf.Text(page, Margin, 487, 9, $"{date}  |  {source}  |  {scope}  |  {count} vehicles", color: BrandedPdf.Muted);

        BrandedPdf.Fill(page, Margin, TableTop, Width - Margin * 2, 18, BrandedPdf.Blue);
        var x = Margin;
        for (var column = 0; column < ColumnWidths.Length; column++)
        {
            BrandedPdf.Text(page, x + CellPadding, TableTop + 5, 8, StockListExport.Headers[column],
                bold: true, color: "1 1 1");
            x += ColumnWidths[column];
        }
        return page;
    }
}
