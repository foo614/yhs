namespace YSHeng.Api.Features;

public static partial class AutoCountExcel
{
    public static byte[] ExportInsuranceMonthly(InsuranceCopyRows preview)
    {
        if (preview.Blockers.Count > 0 || preview.Rows.Length == 0)
            throw new InvalidOperationException("Resolve monthly sales blockers before exporting.");
        var rows = new List<IReadOnlyList<string>> { preview.Columns };
        rows.AddRange(preview.Rows);
        return WorkbookBytes([new Sheet("MonthlySales", rows)]);
    }
}
