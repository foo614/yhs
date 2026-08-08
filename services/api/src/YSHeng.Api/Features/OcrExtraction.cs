using System.Text.RegularExpressions;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public interface IOcrExtractor
{
    Task<OcrExtractionResult> AnalyzeAsync(DocumentBlob document, IEnumerable<Vehicle> vehicles, CancellationToken cancellationToken = default);
}

public sealed record OcrExtractionResult(
    FileCategory DocumentCategory,
    decimal Confidence,
    Dictionary<string, decimal> FieldConfidence,
    Dictionary<string, string?> Fields,
    string RawText,
    IReadOnlyList<string> Warnings);

public sealed class BaiduUnlimitedOcrOptions
{
    public string Endpoint { get; init; } = "http://127.0.0.1:10000";
    public string Model { get; init; } = "Unlimited-OCR";
    public string Prompt { get; init; } = "document parsing.";
    public string ImageMode { get; init; } = "gundam";
    public int RequestTimeoutSeconds { get; init; } = 1200;
    public bool Stream { get; init; } = true;
}

public sealed record BaiduUnlimitedOcrRecognition(string RawText, decimal Confidence, IReadOnlyList<string> Warnings);

public sealed class BaiduUnlimitedOcrClient(HttpClient httpClient, IOptions<BaiduUnlimitedOcrOptions> options)
{
    private readonly BaiduUnlimitedOcrOptions _options = options.Value;

    public async Task<BaiduUnlimitedOcrRecognition> RecognizeAsync(DocumentBlob document, CancellationToken cancellationToken = default)
    {
        if (!document.MimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Baidu Unlimited-OCR requires an uploaded image file for this backend flow.");
        }

        httpClient.Timeout = TimeSpan.FromSeconds(Math.Max(30, _options.RequestTimeoutSeconds));
        var endpoint = new Uri(new Uri(_options.Endpoint.TrimEnd('/') + "/", UriKind.Absolute), "v1/chat/completions");
        var payload = BuildPayload(document);

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        using var response = await httpClient.SendAsync(
            request,
            _options.Stream ? HttpCompletionOption.ResponseHeadersRead : HttpCompletionOption.ResponseContentRead,
            cancellationToken);
        response.EnsureSuccessStatusCode();

        var rawText = _options.Stream
            ? await ReadStreamingTextAsync(response, cancellationToken)
            : await ReadCompletionTextAsync(response, cancellationToken);
        if (string.IsNullOrWhiteSpace(rawText))
        {
            throw new InvalidOperationException("Baidu Unlimited-OCR returned no readable text.");
        }

        return new BaiduUnlimitedOcrRecognition(
            rawText.Trim(),
            0.86m,
            ["Baidu Unlimited-OCR result. Review extracted values before saving."]);
    }

    private object BuildPayload(DocumentBlob document)
    {
        var base64 = Convert.ToBase64String(document.Content);
        var mimeType = string.IsNullOrWhiteSpace(document.MimeType) ? "image/png" : document.MimeType;
        var imageUrl = $"data:{mimeType};base64,{base64}";
        return new
        {
            model = _options.Model,
            messages = new[]
            {
                new
                {
                    role = "user",
                    content = new object[]
                    {
                        new { type = "text", text = _options.Prompt },
                        new { type = "image_url", image_url = new { url = imageUrl } }
                    }
                }
            },
            temperature = 0,
            skip_special_tokens = false,
            stream = _options.Stream,
            images_config = new { image_mode = _options.ImageMode },
            custom_params = new
            {
                ngram_size = 35,
                window_size = string.Equals(_options.ImageMode, "base", StringComparison.OrdinalIgnoreCase) ? 1024 : 128
            }
        };
    }

    private static async Task<string> ReadStreamingTextAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var reader = new StreamReader(stream);
        var builder = new StringBuilder();
        while (true)
        {
            var line = await reader.ReadLineAsync(cancellationToken);
            if (line is null) break;
            if (!line.StartsWith("data:", StringComparison.OrdinalIgnoreCase)) continue;

            var data = line["data:".Length..].Trim();
            if (data == "[DONE]") break;
            if (string.IsNullOrWhiteSpace(data)) continue;

            using var payload = JsonDocument.Parse(data);
            var delta = payload.RootElement.GetProperty("choices")[0].GetProperty("delta");
            if (delta.TryGetProperty("content", out var content))
            {
                builder.Append(content.GetString());
            }
        }

        return builder.ToString();
    }

    private static async Task<string> ReadCompletionTextAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var payload = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
        var choice = payload.RootElement.GetProperty("choices")[0];
        return choice.GetProperty("message").GetProperty("content").GetString() ?? "";
    }
}

public sealed class BaiduUnlimitedOcrExtractor(BaiduUnlimitedOcrClient client) : IOcrExtractor
{
    public async Task<OcrExtractionResult> AnalyzeAsync(DocumentBlob document, IEnumerable<Vehicle> vehicles, CancellationToken cancellationToken = default)
    {
        var recognition = await client.RecognizeAsync(document, cancellationToken);
        return OcrExtractionParser.Analyze(
            document,
            vehicles,
            recognition.RawText,
            recognition.Confidence,
            recognition.Warnings);
    }
}

public sealed class LocalMockOcrExtractor : IOcrExtractor
{
    public Task<OcrExtractionResult> AnalyzeAsync(DocumentBlob document, IEnumerable<Vehicle> vehicles, CancellationToken cancellationToken = default) =>
        Task.FromResult(Analyze(document, vehicles));

    public OcrExtractionResult Analyze(DocumentBlob document, IEnumerable<Vehicle> vehicles)
    {
        var text = BuildRawText(document);
        return OcrExtractionParser.Analyze(document, vehicles, text, 0.82m, [], allowMockFallbacks: true);
    }

    private static string BuildRawText(DocumentBlob document)
    {
        var text = System.Text.Encoding.UTF8.GetString(document.Content);
        if (!string.IsNullOrWhiteSpace(text) && text.Any(char.IsLetter)) return text;

        return document.Category switch
        {
            FileCategory.PurchaseInvoice => $"Purchase Invoice {MockReference(document, "PI")} Amount RM {MockAmount(document)}",
            FileCategory.IdentityCard => "Identity Card Name Ali Tan IC 900101-01-1234 Address Demo customer address",
            FileCategory.Voc => "Vehicle Ownership Certificate Registration WXY1234 Chassis MMBXUFG2WNH123456 Engine 4B11T123456 Make Proton Model X70 Year 2024 Owner Ali Tan",
            FileCategory.RepairInvoice => $"Supplier OCR Demo Supplier Invoice {MockReference(document, "SUP")} Amount RM {MockAmount(document)}",
            FileCategory.PaymentReceipt => $"Payment Receipt {MockReference(document, "RCPT")} Bank Maybank Amount RM {MockAmount(document)}",
            FileCategory.PaymentInvoice => $"Payment Invoice {MockReference(document, "PINV")} Bank Maybank Amount RM {MockAmount(document)}",
            _ => $"Document {document.FileName} Amount RM {MockAmount(document)}"
        };
    }

    private static string MockReference(DocumentBlob document, string prefix) =>
        $"{prefix}-{document.Id.ToString("N")[..6].ToUpperInvariant()}";

    private static string MockAmount(DocumentBlob document) =>
        (500 + document.Content.Length).ToString("0.00");
}

public static class OcrExtractionParser
{
    public static OcrExtractionResult Analyze(
        DocumentBlob document,
        IEnumerable<Vehicle> vehicles,
        string text,
        decimal confidence,
        IReadOnlyList<string> initialWarnings,
        bool allowMockFallbacks = false)
    {
        var fields = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["vehicleId"] = document.VehicleId?.ToString(),
            ["plateNumber"] = FindPlate(text) ?? vehicles.FirstOrDefault(vehicle => vehicle.Id == document.VehicleId)?.PlateNumber,
            ["invoiceNumber"] = FindValue(text, "invoice", "inv") ?? MockReference(document, "INV", allowMockFallbacks),
            ["receiptNumber"] = FindValue(text, "receipt", "rcpt"),
            ["amount"] = FindAmount(text) ?? MockAmount(document, allowMockFallbacks),
            ["nettPrice"] = FindAmount(text) ?? MockAmount(document, allowMockFallbacks),
            ["salesPrice"] = FindAmount(text) ?? MockAmount(document, allowMockFallbacks),
            ["bankName"] = FindBank(text),
            ["documentDate"] = FindDate(text),
            ["bankFollowUpDate"] = FindDate(text)
        };

        if (document.Category == FileCategory.RepairInvoice)
        {
            fields["supplierName"] = FindValue(text, "supplier", "vendor") ?? (allowMockFallbacks ? "OCR Demo Supplier" : null);
            fields["plateNumberOnInvoice"] = fields["plateNumber"];
        }

        if (document.Category == FileCategory.PaymentReceipt)
        {
            fields["receiptNumber"] ??= MockReference(document, "RCPT", allowMockFallbacks);
        }

        if (document.Category == FileCategory.PaymentInvoice)
        {
            fields["invoiceNumber"] ??= MockReference(document, "PINV", allowMockFallbacks);
        }

        if (document.Category == FileCategory.IdentityCard)
        {
            fields["customerName"] = FindIdentityName(text);
            fields["icNumber"] = FindIdentityCardNumber(text);
            fields["address"] = FindAddress(text);
            fields["invoiceNumber"] = null;
            fields["receiptNumber"] = null;
            fields["amount"] = null;
            fields["nettPrice"] = null;
            fields["salesPrice"] = null;
        }

        if (document.Category == FileCategory.Voc)
        {
            fields["plateNumber"] = FindValue(text, "registration", "plate") ?? fields["plateNumber"];
            fields["chassisNumber"] = FindValue(text, "chassis", "vin");
            fields["engineNumber"] = FindValue(text, "engine");
            fields["make"] = FindLabeledText(text, "make");
            fields["model"] = FindLabeledText(text, "model");
            fields["year"] = FindVehicleYear(text);
            fields["ownerName"] = FindLabeledText(text, "owner", "registered owner");
            fields["invoiceNumber"] = null;
            fields["receiptNumber"] = null;
            fields["amount"] = null;
            fields["nettPrice"] = null;
            fields["salesPrice"] = null;
        }

        var warnings = new List<string>(initialWarnings);
        if (document.Category != FileCategory.IdentityCard && string.IsNullOrWhiteSpace(fields["plateNumber"]))
        {
            warnings.Add("No car plate was detected. Please confirm the linked vehicle before saving.");
        }

        if (document.Category == FileCategory.RepairInvoice && string.IsNullOrWhiteSpace(fields["supplierName"]))
        {
            warnings.Add("Supplier name was not detected.");
        }

        if (document.Category == FileCategory.IdentityCard && string.IsNullOrWhiteSpace(fields["icNumber"]))
        {
            warnings.Add("No identity card number was detected. Confirm the document manually before saving customer details.");
        }

        if (document.Category == FileCategory.Voc)
        {
            if (string.IsNullOrWhiteSpace(fields["chassisNumber"])) warnings.Add("No chassis number was detected. Confirm the VOC manually before saving vehicle details.");
            if (string.IsNullOrWhiteSpace(fields["engineNumber"])) warnings.Add("No engine number was detected. Confirm the VOC manually before saving vehicle details.");
        }

        return new OcrExtractionResult(
            document.Category,
            confidence,
            fields.Keys.ToDictionary(key => key, _ => 0.8m, StringComparer.OrdinalIgnoreCase),
            fields,
            text,
            warnings);
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

    private static string? FindIdentityCardNumber(string text)
    {
        var match = Regex.Match(text, @"\b\d{6}-?\d{2}-?\d{4}\b");
        return match.Success ? match.Value : null;
    }

    private static string? FindIdentityName(string text)
    {
        var match = Regex.Match(text, @"\bname\s*[:#-]?\s*(?<value>[A-Za-z][A-Za-z .'-]{1,80}?)(?=\s+(?:IC|Address)\b|$)", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups["value"].Value.Trim() : null;
    }

    private static string? FindAddress(string text)
    {
        var match = Regex.Match(text, @"\baddress\s*[:#-]?\s*(?<value>[^\r\n]{3,200})", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups["value"].Value.Trim() : null;
    }

    private static string? FindLabeledText(string text, params string[] labels)
    {
        foreach (var label in labels)
        {
            var match = Regex.Match(
                text,
                $@"\b{Regex.Escape(label)}\b\s*[:#-]?\s*(?<value>[A-Za-z0-9][A-Za-z0-9 ./'-]{{0,100}}?)(?=\s+(?:Registration|Plate|Chassis|VIN|Engine|Make|Model|Year|Owner)\b|$)",
                RegexOptions.IgnoreCase);
            if (match.Success) return match.Groups["value"].Value.Trim();
        }

        return null;
    }

    private static string? FindVehicleYear(string text)
    {
        var match = Regex.Match(text, @"\b(?:year|manufactured)\s*[:#-]?\s*(?<year>(?:19|20)\d{2})\b", RegexOptions.IgnoreCase);
        return match.Success ? match.Groups["year"].Value : null;
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

    private static string? MockReference(DocumentBlob document, string prefix, bool allowMockFallbacks) =>
        allowMockFallbacks ? $"{prefix}-{document.Id.ToString("N")[..6].ToUpperInvariant()}" : null;

    private static string? MockAmount(DocumentBlob document, bool allowMockFallbacks) =>
        allowMockFallbacks ? (500 + document.Content.Length).ToString("0.00") : null;
}
