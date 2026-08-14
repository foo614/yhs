using System.Globalization;
using System.Text;

namespace YSHeng.Api.Features;

internal static class SimplePdf
{
    public static byte[] Create(string title, IEnumerable<string> lines)
    {
        var pageText = new StringBuilder();
        pageText.AppendLine("BT");
        pageText.AppendLine("/F1 12 Tf");
        pageText.AppendLine("50 780 Td");
        pageText.AppendLine($"({Escape(title)}) Tj");
        pageText.AppendLine("0 -24 Td");

        foreach (var line in lines)
        {
            pageText.AppendLine($"({Escape(line)}) Tj");
            pageText.AppendLine("0 -18 Td");
        }

        pageText.AppendLine("ET");
        var contentBytes = Encoding.ASCII.GetBytes(pageText.ToString());
        var objects = new[]
        {
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
            $"<< /Length {contentBytes.Length} >>\nstream\n{pageText}endstream"
        };

        var builder = new StringBuilder("%PDF-1.4\n");
        var offsets = new List<int> { 0 };
        foreach (var obj in objects.Select((value, index) => new { value, number = index + 1 }))
        {
            offsets.Add(Encoding.ASCII.GetByteCount(builder.ToString()));
            builder.Append(CultureInfo.InvariantCulture, $"{obj.number} 0 obj\n{obj.value}\nendobj\n");
        }

        var xrefOffset = Encoding.ASCII.GetByteCount(builder.ToString());
        builder.Append($"xref\n0 {objects.Length + 1}\n");
        builder.Append("0000000000 65535 f \n");
        foreach (var offset in offsets.Skip(1))
        {
            builder.Append(CultureInfo.InvariantCulture, $"{offset:0000000000} 00000 n \n");
        }

        builder.Append($"trailer\n<< /Size {objects.Length + 1} /Root 1 0 R >>\nstartxref\n{xrefOffset}\n%%EOF");
        return Encoding.ASCII.GetBytes(builder.ToString());
    }

    private static string Escape(string value) => value.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("(", "\\(", StringComparison.Ordinal).Replace(")", "\\)", StringComparison.Ordinal);
}
