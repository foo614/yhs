using System.Globalization;
using System.Text;

namespace YSHeng.Api.Features;

internal static class BrandedPdf
{
    internal const int PageWidth = 595;
    internal const int PageHeight = 842;
    internal const int LeftMargin = 36;
    internal const int RightMargin = 36;
    internal const string Navy = "0.05 0.18 0.32";
    internal const string Blue = "0.10 0.34 0.58";
    internal const string PaleBlue = "0.92 0.96 0.99";
    internal const string PaleGray = "0.96 0.97 0.98";
    internal const string Dark = "0.10 0.14 0.18";
    internal const string Muted = "0.35 0.40 0.46";
    internal const string Rule = "0.84 0.87 0.90";

    internal static void Header(StringBuilder page, string documentName, string reference, string? badge = null, bool continued = false)
    {
        Fill(page, LeftMargin, 742, PageWidth - LeftMargin - RightMargin, 64, Navy);
        Text(page, 56, 779, 23, "YS HENG", bold: true, color: "1 1 1");
        Text(page, 57, 761, 9, "FINANCE OPERATIONS", color: "0.79 0.88 0.96");
        var heading = continued ? $"{documentName} / CONT." : documentName;
        var headingSize = heading.Length > 22 ? 13 : 16;
        Text(page, 330, 778, headingSize, heading, bold: true, color: "1 1 1");
        Text(page, 351, 761, 8, reference, color: "0.79 0.88 0.96");
        if (!string.IsNullOrWhiteSpace(badge))
        {
            Fill(page, 430, 708, 129, 25, PaleBlue);
            Text(page, 443, 716, 9, badge.ToUpperInvariant(), bold: true, color: Blue);
        }
    }

    internal static void Footer(StringBuilder page, string reference, int pageNumber, int pageCount, string copy)
    {
        Line(page, LeftMargin, 52, PageWidth - RightMargin, 52, Rule);
        Text(page, LeftMargin, 34, 8, $"Reference: {reference}  |  Page {pageNumber} of {pageCount}", color: Muted);
        Text(page, 438, 34, 8, copy, color: Muted);
    }

    internal static byte[] Create(IReadOnlyList<string> pageContents, IEnumerable<string> searchableText)
    {
        const int pageObjectStart = 9;
        var contentObjectStart = pageObjectStart + pageContents.Count;
        var pageReferences = string.Join(" ", Enumerable.Range(pageObjectStart, pageContents.Count).Select(number => $"{number} 0 R"));
        var objects = new List<byte[]>
        {
            Ascii("<< /Type /Catalog /Pages 2 0 R >>"),
            Ascii($"<< /Type /Pages /Kids [{pageReferences}] /Count {pageContents.Count} >>"),
            Ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
            Ascii("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
            Ascii("<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [6 0 R] /ToUnicode 8 0 R >>"),
            Ascii("<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 5 >> /FontDescriptor 7 0 R /DW 1000 >>"),
            Ascii("<< /Type /FontDescriptor /FontName /STSong-Light /Flags 6 /FontBBox [-250 -143 1000 857] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 700 /StemV 80 >>"),
            StreamObject(Ascii(ToUnicodeCMap(searchableText)))
        };
        objects.AddRange(pageContents.Select((_, index) => Ascii($"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {PageWidth} {PageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents {contentObjectStart + index} 0 R >>")));
        objects.AddRange(pageContents.Select(content => StreamObject(Ascii(content))));

        using var stream = new MemoryStream();
        Write(stream, Ascii("%PDF-1.7\n"));
        var offsets = new List<long> { 0 };
        for (var index = 0; index < objects.Count; index++)
        {
            offsets.Add(stream.Position);
            Write(stream, Ascii($"{index + 1} 0 obj\n"));
            Write(stream, objects[index]);
            Write(stream, Ascii("\nendobj\n"));
        }
        var xrefOffset = stream.Position;
        Write(stream, Ascii($"xref\n0 {objects.Count + 1}\n0000000000 65535 f \n"));
        foreach (var offset in offsets.Skip(1)) Write(stream, Ascii($"{offset:0000000000} 00000 n \n"));
        Write(stream, Ascii($"trailer\n<< /Size {objects.Count + 1} /Root 1 0 R >>\nstartxref\n{xrefOffset}\n%%EOF"));
        return stream.ToArray();
    }

    internal static void Fill(StringBuilder page, double x, double y, double width, double height, string color) =>
        page.AppendLine(FormattableString.Invariant($"q {color} rg {x:0.##} {y:0.##} {width:0.##} {height:0.##} re f Q"));

    internal static void Line(StringBuilder page, double x1, double y1, double x2, double y2, string color) =>
        page.AppendLine(FormattableString.Invariant($"q {color} RG 0.7 w {x1:0.##} {y1:0.##} m {x2:0.##} {y2:0.##} l S Q"));

    internal static void Text(StringBuilder page, double x, double y, double size, string value, bool bold = false, string color = "0 0 0")
    {
        page.AppendLine("BT");
        page.AppendLine($"{color} rg");
        AppendText(page, value, bold ? "/F2" : "/F1", size, x, y);
        page.AppendLine("ET");
    }

    internal static IEnumerable<string> Wrap(string value, int charactersPerLine)
    {
        var words = value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var line = new StringBuilder();
        foreach (var word in words)
        {
            if (line.Length > 0 && line.Length + word.Length + 1 > charactersPerLine)
            {
                yield return line.ToString();
                line.Clear();
            }
            if (line.Length > 0) line.Append(' ');
            line.Append(word);
        }
        if (line.Length > 0) yield return line.ToString();
    }

    internal static void TextBlock(StringBuilder page, double x, double y, double size, string value, double maximumWidth, double lineHeight, int maximumLines, string color, bool bold = false)
    {
        var lines = WrapToWidth(value, size, maximumWidth).ToList();
        if (lines.Count > maximumLines)
            throw new ArgumentException($"PDF text requires {lines.Count} lines but only {maximumLines} fit in the allocated area.", nameof(value));
        foreach (var (line, index) in lines.Select((line, index) => (line, index)))
            Text(page, x, y - index * lineHeight, size, line, bold, color);
    }

    internal static IEnumerable<string> WrapToWidth(string value, double fontSize, double maximumWidth)
    {
        var remaining = value.Trim();
        while (remaining.Length > 0)
        {
            var width = 0d;
            var lastSpace = -1;
            var index = 0;
            for (; index < remaining.Length; index++)
            {
                var characterWidth = EstimatedWidth(remaining[index].ToString(), fontSize);
                if (width + characterWidth > maximumWidth && index > 0) break;
                width += characterWidth;
                if (char.IsWhiteSpace(remaining[index])) lastSpace = index;
            }

            if (index == remaining.Length)
            {
                yield return remaining;
                yield break;
            }

            var breakAt = lastSpace > 0 ? lastSpace : index;
            yield return remaining[..breakAt].TrimEnd();
            remaining = remaining[breakAt..].TrimStart();
        }
    }

    internal static double EstimatedWidth(string value, double fontSize) =>
        value.Sum(character => character > '\u007f' ? fontSize : character == ' ' ? fontSize * 0.28 : fontSize * 0.56);

    private static void AppendText(StringBuilder page, string value, string latinFont, double fontSize, double x, double y)
    {
        var segment = new StringBuilder();
        var currentIsLatin = true;
        foreach (var character in value)
        {
            var isLatin = character <= '\u007f';
            if (segment.Length > 0 && isLatin != currentIsLatin)
            {
                var completed = segment.ToString();
                AppendSegment(page, completed, currentIsLatin, latinFont, fontSize, x, y);
                x += completed.Sum(item => item > '\u007f' ? fontSize : fontSize * 0.56);
                segment.Clear();
            }
            currentIsLatin = isLatin;
            segment.Append(character);
        }
        if (segment.Length > 0) AppendSegment(page, segment.ToString(), currentIsLatin, latinFont, fontSize, x, y);
    }

    private static void AppendSegment(StringBuilder page, string value, bool isLatin, string latinFont, double fontSize, double x, double y)
    {
        page.Append(isLatin ? latinFont : "/F3").Append(' ').Append(fontSize.ToString("0.##", CultureInfo.InvariantCulture)).AppendLine(" Tf");
        page.Append(FormattableString.Invariant($"1 0 0 1 {x:0.##} {y:0.##} Tm\n"));
        page.Append(isLatin ? $"({Escape(value)}) Tj\n" : $"<{Convert.ToHexString(Encoding.BigEndianUnicode.GetBytes(value))}> Tj\n");
    }

    private static string ToUnicodeCMap(IEnumerable<string> values)
    {
        var characters = values.SelectMany(value => value).Distinct().OrderBy(value => value).ToList();
        var cmap = new StringBuilder("/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n");
        foreach (var batch in characters.Chunk(100))
        {
            cmap.AppendLine($"{batch.Length} beginbfchar");
            foreach (var character in batch) cmap.AppendLine($"<{(int)character:X4}> <{(int)character:X4}>");
            cmap.AppendLine("endbfchar");
        }
        return cmap.Append("endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n").ToString();
    }

    private static string Escape(string value) => value.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("(", "\\(", StringComparison.Ordinal).Replace(")", "\\)", StringComparison.Ordinal).Replace('\r', ' ').Replace('\n', ' ');
    private static byte[] StreamObject(byte[] content) => Ascii($"<< /Length {content.Length} >>\nstream\n").Concat(content).Concat(Ascii("\nendstream")).ToArray();
    private static byte[] Ascii(string value) => Encoding.ASCII.GetBytes(value);
    private static void Write(Stream stream, byte[] bytes) => stream.Write(bytes, 0, bytes.Length);
}
