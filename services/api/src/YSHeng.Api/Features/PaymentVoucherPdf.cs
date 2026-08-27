using System.Globalization;
using System.Text;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record PaymentVoucherPdf(string VoucherNumber, byte[] Content);

public static class PaymentVoucherPdfFactory
{
    public static PaymentVoucherPdf Create(PaymentVoucher voucher, Vehicle vehicle)
    {
        var voucherNumber = $"YSV-{voucher.IssuedDate:yyyyMMdd}-{voucher.Id.ToString("N")[..6].ToUpperInvariant()}";
        var statusLine = voucher.Status == PaymentVoucherStatus.Pending ? "DRAFT" : $"Status: {voucher.Status}";
        return new PaymentVoucherPdf(voucherNumber, CreateVoucherPage(voucher, vehicle, voucherNumber, statusLine));
    }

    private static byte[] CreateVoucherPage(PaymentVoucher voucher, Vehicle vehicle, string voucherNumber, string statusLine)
    {
        var page = new StringBuilder();
        var navy = "0.05 0.18 0.32";
        var blue = "0.10 0.34 0.58";
        var paleBlue = "0.92 0.96 0.99";
        var paleGray = "0.96 0.97 0.98";
        var dark = "0.10 0.14 0.18";
        var muted = "0.35 0.40 0.46";

        Fill(page, 36, 742, 523, 64, navy);
        Text(page, 56, 779, 23, "YS HENG", bold: true, color: "1 1 1");
        Text(page, 57, 761, 9, "FINANCE OPERATIONS", color: "0.79 0.88 0.96");
        Text(page, 363, 778, 18, "PAYMENT VOUCHER", bold: true, color: "1 1 1");
        Text(page, 364, 761, 9, "INTERNAL FINANCE DOCUMENT", color: "0.79 0.88 0.96");
        Text(page, 36, 704, 19, "Payment Voucher", bold: true, color: dark);
        Text(page, 36, 687, 10, "A controlled record of an approved or pending payment.", color: muted);
        Fill(page, 414, 677, 145, 30, voucher.Status == PaymentVoucherStatus.Pending ? "0.99 0.92 0.79" : paleBlue);
        Text(page, 426, 688, 11, statusLine.ToUpperInvariant(), bold: true, color: voucher.Status == PaymentVoucherStatus.Pending ? "0.55 0.31 0.02" : blue);

        Fill(page, 36, 582, 523, 76, paleGray);
        Field(page, 56, 632, "VOUCHER NUMBER", voucherNumber, dark);
        Field(page, 315, 632, "ISSUED DATE", voucher.IssuedDate.ToString("dd MMMM yyyy", CultureInfo.InvariantCulture), dark);
        Field(page, 56, 596, "VEHICLE", TextValue($"{vehicle.PlateNumber} {vehicle.Make} {vehicle.Model} {vehicle.Year}".Trim()), dark);
        Field(page, 315, 596, "PAYEE", TextValue(voucher.PayeeName), dark);
        Text(page, 36, 550, 9, "PAYMENT PURPOSE", bold: true, color: muted);
        TextBlock(page, 36, 532, 11, TextValue(voucher.Purpose), 78, 15, color: dark);
        Line(page, 36, 494, 559, 494, "0.84 0.87 0.90");

        Fill(page, 36, 390, 523, 78, paleBlue);
        Text(page, 56, 443, 9, "AMOUNT PAYABLE", bold: true, color: blue);
        Text(page, 56, 414, 25, $"RM {voucher.Amount:N2}", bold: true, color: navy);
        Text(page, 315, 443, 9, "AMOUNT IN WORDS", bold: true, color: blue);
        TextBlock(page, 315, 423, 11, AmountInWords(voucher.Amount), 42, 15, color: dark);
        Text(page, 36, 358, 9, "NOTES / SUPPORTING REFERENCE", bold: true, color: muted);
        Fill(page, 36, 266, 523, 76, "0.99 0.99 0.99");
        TextBlock(page, 56, 318, 11, TextValue(voucher.Notes, "No additional notes."), 82, 15, color: dark, maximumLines: 3);

        Text(page, 36, 226, 10, "AUTHORISATION", bold: true, color: navy);
        Text(page, 36, 210, 9, "Sign only after checking the voucher details and supporting documents.", color: muted);
        Signature(page, 56, 150, "PREPARED BY");
        Signature(page, 231, 150, "APPROVED BY");
        Signature(page, 406, 150, "RECEIVED BY");
        Line(page, 36, 83, 559, 83, "0.84 0.87 0.90");
        Text(page, 36, 62, 8, $"Reference: {voucherNumber}  |  Vehicle: {TextValue(vehicle.PlateNumber)}", color: muted);
        Text(page, 423, 62, 8, "YS Heng - Finance copy", color: muted);
        return SimplePdf.CreatePage(page.ToString());
    }

    private static void Field(StringBuilder page, double x, double y, string label, string value, string textColor)
    {
        Text(page, x, y, 8, label, bold: true, color: "0.35 0.40 0.46");
        Text(page, x, y - 17, 11, value, color: textColor);
    }

    private static void Signature(StringBuilder page, double x, double y, string label)
    {
        Line(page, x, y, x + 133, y, "0.38 0.44 0.50");
        Text(page, x, y - 18, 8, label, bold: true, color: "0.35 0.40 0.46");
        Text(page, x, y - 31, 8, "Name / signature / date", color: "0.55 0.60 0.66");
    }

    private static void TextBlock(StringBuilder page, double x, double y, double size, string value, int charactersPerLine, double lineHeight, string color, int maximumLines = 2)
    {
        foreach (var (line, index) in Wrap(value, charactersPerLine).Take(maximumLines).Select((line, index) => (line, index)))
            Text(page, x, y - index * lineHeight, size, line, color: color);
    }

    private static IEnumerable<string> Wrap(string value, int charactersPerLine)
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

    private static void Fill(StringBuilder page, double x, double y, double width, double height, string color) =>
        page.AppendLine(FormattableString.Invariant($"q {color} rg {x:0.##} {y:0.##} {width:0.##} {height:0.##} re f Q"));

    private static void Line(StringBuilder page, double x1, double y1, double x2, double y2, string color) =>
        page.AppendLine(FormattableString.Invariant($"q {color} RG 0.7 w {x1:0.##} {y1:0.##} m {x2:0.##} {y2:0.##} l S Q"));

    private static void Text(StringBuilder page, double x, double y, double size, string value, bool bold = false, string color = "0 0 0")
    {
        page.AppendLine("BT");
        page.AppendLine($"/{(bold ? "F2" : "F1")} {size.ToString("0.##", CultureInfo.InvariantCulture)} Tf");
        page.AppendLine($"{color} rg");
        page.AppendLine(FormattableString.Invariant($"{x:0.##} {y:0.##} Td"));
        page.AppendLine($"({SimplePdf.EscapeText(value)}) Tj");
        page.AppendLine("ET");
    }

    private static string TextValue(string? value, string fallback = "") =>
        string.IsNullOrWhiteSpace(value) ? fallback : value.Replace('\r', ' ').Replace('\n', ' ').Trim();

    private static string AmountInWords(decimal amount)
    {
        var rounded = decimal.Round(amount, 2, MidpointRounding.AwayFromZero);
        var whole = decimal.ToInt64(decimal.Truncate(rounded));
        var sen = decimal.ToInt32((rounded - whole) * 100m);
        return $"Ringgit Malaysia {WholeNumberInWords(whole)} and Sen {WholeNumberInWords(sen)} Only";
    }

    private static string WholeNumberInWords(long number)
    {
        if (number == 0) return "Zero";
        var scales = new[] { (1_000_000_000_000L, "Trillion"), (1_000_000_000L, "Billion"), (1_000_000L, "Million"), (1_000L, "Thousand") };
        var words = new StringBuilder();
        foreach (var (value, name) in scales)
        {
            if (number < value) continue;
            Append(words, WholeNumberInWords(number / value));
            Append(words, name);
            number %= value;
        }
        if (number >= 100)
        {
            Append(words, WholeNumberInWords(number / 100));
            Append(words, "Hundred");
            number %= 100;
        }
        if (number >= 20)
        {
            var tens = new[] { "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety" };
            Append(words, tens[number / 10]);
            number %= 10;
        }
        if (number > 0)
        {
            var belowTwenty = new[] { "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen" };
            Append(words, belowTwenty[number]);
        }
        return words.ToString();
    }

    private static void Append(StringBuilder builder, string value)
    {
        if (builder.Length > 0) builder.Append(' ');
        builder.Append(value);
    }
}
