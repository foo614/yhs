using System.Text.RegularExpressions;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public interface IOcrExtractor
{
    OcrExtractionResult Analyze(DocumentBlob document, IEnumerable<Vehicle> vehicles);
}

public sealed record OcrExtractionResult(
    FileCategory DocumentCategory,
    decimal Confidence,
    Dictionary<string, decimal> FieldConfidence,
    Dictionary<string, string?> Fields,
    string RawText,
    IReadOnlyList<string> Warnings);

public sealed class LocalMockOcrExtractor : IOcrExtractor
{
    public OcrExtractionResult Analyze(DocumentBlob document, IEnumerable<Vehicle> vehicles)
    {
        var text = BuildRawText(document);
        var fields = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["vehicleId"] = document.VehicleId?.ToString(),
            ["plateNumber"] = FindPlate(text) ?? vehicles.FirstOrDefault(vehicle => vehicle.Id == document.VehicleId)?.PlateNumber,
            ["invoiceNumber"] = FindValue(text, "invoice", "inv") ?? MockReference(document, "INV"),
            ["receiptNumber"] = FindValue(text, "receipt", "rcpt"),
            ["amount"] = FindAmount(text) ?? MockAmount(document),
            ["nettPrice"] = FindAmount(text) ?? MockAmount(document),
            ["salesPrice"] = FindAmount(text) ?? MockAmount(document),
            ["bankName"] = FindBank(text),
            ["documentDate"] = FindDate(text),
            ["bankFollowUpDate"] = FindDate(text)
        };

        if (document.Category == FileCategory.RepairInvoice)
        {
            fields["supplierName"] = FindValue(text, "supplier", "vendor") ?? "OCR Demo Supplier";
            fields["plateNumberOnInvoice"] = fields["plateNumber"];
        }

        if (document.Category == FileCategory.PaymentReceipt)
        {
            fields["receiptNumber"] ??= MockReference(document, "RCPT");
        }

        if (document.Category == FileCategory.PaymentInvoice)
        {
            fields["invoiceNumber"] ??= MockReference(document, "PINV");
        }

        var warnings = new List<string>();
        if (string.IsNullOrWhiteSpace(fields["plateNumber"]))
        {
            warnings.Add("No car plate was detected. Please confirm the linked vehicle before saving.");
        }

        if (document.Category == FileCategory.RepairInvoice && string.IsNullOrWhiteSpace(fields["supplierName"]))
        {
            warnings.Add("Supplier name was not detected.");
        }

        return new OcrExtractionResult(
            document.Category,
            0.82m,
            fields.Keys.ToDictionary(key => key, _ => 0.8m, StringComparer.OrdinalIgnoreCase),
            fields,
            text,
            warnings);
    }

    private static string BuildRawText(DocumentBlob document)
    {
        var text = System.Text.Encoding.UTF8.GetString(document.Content);
        if (!string.IsNullOrWhiteSpace(text) && text.Any(char.IsLetter)) return text;

        return document.Category switch
        {
            FileCategory.PurchaseInvoice => $"Purchase Invoice {MockReference(document, "PI")} Amount RM {MockAmount(document)}",
            FileCategory.RepairInvoice => $"Supplier OCR Demo Supplier Invoice {MockReference(document, "SUP")} Amount RM {MockAmount(document)}",
            FileCategory.PaymentReceipt => $"Payment Receipt {MockReference(document, "RCPT")} Bank Maybank Amount RM {MockAmount(document)}",
            FileCategory.PaymentInvoice => $"Payment Invoice {MockReference(document, "PINV")} Bank Maybank Amount RM {MockAmount(document)}",
            _ => $"Document {document.FileName} Amount RM {MockAmount(document)}"
        };
    }

    private static string? FindValue(string text, params string[] labels)
    {
        foreach (var label in labels)
        {
            var match = Regex.Match(text, $@"\b{Regex.Escape(label)}(?:\s*(?:no|number|#|:))?\s*[:#-]?\s*(?<value>[A-Z0-9][A-Z0-9\-\/]+)", RegexOptions.IgnoreCase);
            if (match.Success) return match.Groups["value"].Value.Trim();
        }

        return null;
    }

    private static string? FindAmount(string text)
    {
        var labeled = Regex.Match(text, @"(?:amount|total|paid|due)\s*(?:RM|MYR)?\s*[:#-]?\s*(?<amount>\d{1,}(?:,\d{3})*(?:\.\d{1,2})?)", RegexOptions.IgnoreCase);
        if (labeled.Success) return labeled.Groups["amount"].Value.Replace(",", "", StringComparison.Ordinal);

        var currency = Regex.Match(text, @"(?:RM|MYR)\s*(?<amount>\d{1,}(?:,\d{3})*(?:\.\d{1,2})?)", RegexOptions.IgnoreCase);
        return currency.Success ? currency.Groups["amount"].Value.Replace(",", "", StringComparison.Ordinal) : null;
    }

    private static string? FindPlate(string text)
    {
        var match = Regex.Match(text, @"\b[A-Z]{1,3}\s?\d{1,4}[A-Z]?\b", RegexOptions.IgnoreCase);
        return match.Success ? match.Value.Replace(" ", "", StringComparison.Ordinal).ToUpperInvariant() : null;
    }

    private static string? FindBank(string text)
    {
        var banks = new[] { "Maybank", "CIMB", "Public Bank", "RHB", "Hong Leong", "AmBank" };
        return banks.FirstOrDefault(bank => text.Contains(bank, StringComparison.OrdinalIgnoreCase));
    }

    private static string? FindDate(string text)
    {
        var match = Regex.Match(text, @"\b(?<date>\d{4}-\d{2}-\d{2})\b");
        return match.Success ? match.Groups["date"].Value : null;
    }

    private static string MockReference(DocumentBlob document, string prefix) =>
        $"{prefix}-{document.Id.ToString("N")[..6].ToUpperInvariant()}";

    private static string MockAmount(DocumentBlob document) =>
        (500 + document.Content.Length).ToString("0.00");
}
