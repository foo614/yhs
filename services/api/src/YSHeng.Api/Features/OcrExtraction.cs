using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Google.Apis.Auth.OAuth2;
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
    IReadOnlyList<string> Warnings,
    IReadOnlyList<OcrLineItem>? LineItems = null);

public sealed record OcrLineItem(string Description, string? Quantity, string? UnitPrice, string? Amount, decimal? Confidence, string? RawText);
public sealed record OcrReviewedResult(Dictionary<string, string?> Fields, IReadOnlyList<OcrLineItem>? LineItems = null);
public sealed record OcrReviewChange(string Field, string? ExtractedValue, string? ReviewedValue);
public sealed record OcrReviewComparison(IReadOnlyList<OcrReviewChange> Changes, int ComparedFieldCount, int CorrectFieldCount);

public sealed class GoogleDocumentAiOptions
{
    public string ProjectId { get; init; } = "";
    public string Location { get; init; } = "asia-southeast1";
    public string DefaultProcessorId { get; init; } = "";
    public string? InvoiceProcessorId { get; init; }
    public string? ExpenseProcessorId { get; init; }
    public int RequestTimeoutSeconds { get; init; } = 120;
}

public interface IGoogleAccessTokenProvider
{
    Task<string> GetAccessTokenAsync(CancellationToken cancellationToken = default);
}

public sealed class GoogleApplicationDefaultAccessTokenProvider : IGoogleAccessTokenProvider
{
    private const string CloudPlatformScope = "https://www.googleapis.com/auth/cloud-platform";
    private readonly Lazy<Task<GoogleCredential>> credential = new(() => GoogleCredential.GetApplicationDefaultAsync());

    public async Task<string> GetAccessTokenAsync(CancellationToken cancellationToken = default)
    {
        var loadedCredential = await credential.Value.WaitAsync(cancellationToken);
        var scopedCredential = loadedCredential.IsCreateScopedRequired
            ? loadedCredential.CreateScoped(CloudPlatformScope)
            : loadedCredential;
        return await ((ITokenAccess)scopedCredential).GetAccessTokenForRequestAsync(cancellationToken: cancellationToken);
    }
}

public sealed record GoogleDocumentAiEntity(string Type, string Value, decimal Confidence);

public sealed record GoogleDocumentAiRecognition(
    string RawText,
    decimal Confidence,
    IReadOnlyList<GoogleDocumentAiEntity> Entities,
    IReadOnlyList<string> Warnings);

public sealed class GoogleDocumentAiClient(
    HttpClient httpClient,
    IGoogleAccessTokenProvider accessTokenProvider,
    IOptions<GoogleDocumentAiOptions> options)
{
    private readonly GoogleDocumentAiOptions options = options.Value;

    public async Task<GoogleDocumentAiRecognition> RecognizeAsync(DocumentBlob document, CancellationToken cancellationToken = default)
    {
        if (!document.MimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Google Document AI requires an uploaded image file for this backend flow.");
        }

        var processor = SelectProcessor(document.Category);
        ValidateConfiguration(processor.ProcessorId);

        var endpoint = BuildEndpoint(processor.ProcessorId);
        var accessToken = await accessTokenProvider.GetAccessTokenAsync(cancellationToken);
        var payload = new
        {
            rawDocument = new
            {
                content = Convert.ToBase64String(document.Content),
                mimeType = document.MimeType
            },
            fieldMask = "text,entities,pages"
        };

        httpClient.Timeout = TimeSpan.FromSeconds(Math.Max(30, options.RequestTimeoutSeconds));
        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"Google Document AI request failed with HTTP {(int)response.StatusCode}.");
        }

        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var responseJson = await JsonDocument.ParseAsync(responseStream, cancellationToken: cancellationToken);
        if (!responseJson.RootElement.TryGetProperty("document", out var analyzedDocument))
        {
            throw new InvalidOperationException("Google Document AI returned no analyzed document.");
        }

        var rawText = analyzedDocument.TryGetProperty("text", out var textElement) ? textElement.GetString() : null;
        if (string.IsNullOrWhiteSpace(rawText))
        {
            throw new InvalidOperationException("Google Document AI returned no readable text.");
        }

        var entities = ReadEntities(analyzedDocument);
        var confidence = ReadConfidence(analyzedDocument, entities);
        var warnings = new List<string> { "Google Document AI result. Review extracted values before saving." };
        if (processor.UsedDefaultFallback)
        {
            warnings.Add($"No specialized {processor.SpecializedProcessorName} processor is configured; the default OCR processor was used.");
        }
        if (confidence == 0)
        {
            warnings.Add("Google Document AI did not return confidence values for this result.");
        }

        return new GoogleDocumentAiRecognition(rawText.Trim(), confidence, entities, warnings);
    }

    private (string ProcessorId, bool UsedDefaultFallback, string SpecializedProcessorName) SelectProcessor(FileCategory category)
    {
        if (category is FileCategory.PurchaseInvoice or FileCategory.RepairInvoice or FileCategory.PaymentInvoice)
        {
            return !string.IsNullOrWhiteSpace(options.InvoiceProcessorId)
                ? (options.InvoiceProcessorId, false, "invoice")
                : (options.DefaultProcessorId, true, "invoice");
        }

        if (category == FileCategory.PaymentReceipt)
        {
            return !string.IsNullOrWhiteSpace(options.ExpenseProcessorId)
                ? (options.ExpenseProcessorId, false, "expense")
                : (options.DefaultProcessorId, true, "expense");
        }

        return (options.DefaultProcessorId, false, "general OCR");
    }

    private void ValidateConfiguration(string processorId)
    {
        if (string.IsNullOrWhiteSpace(options.ProjectId))
        {
            throw new InvalidOperationException("Google Document AI project ID is not configured.");
        }
        if (string.IsNullOrWhiteSpace(options.Location) || !Regex.IsMatch(options.Location, "^[a-z0-9-]+$"))
        {
            throw new InvalidOperationException("Google Document AI location is invalid.");
        }
        if (string.IsNullOrWhiteSpace(processorId) || !Regex.IsMatch(processorId, "^[A-Za-z0-9_-]+$"))
        {
            throw new InvalidOperationException("Google Document AI processor ID is not configured or invalid.");
        }
    }

    private Uri BuildEndpoint(string processorId) => new(
        $"https://{options.Location}-documentai.googleapis.com/v1/projects/{Uri.EscapeDataString(options.ProjectId)}/locations/{options.Location}/processors/{Uri.EscapeDataString(processorId)}:process");

    private static IReadOnlyList<GoogleDocumentAiEntity> ReadEntities(JsonElement document)
    {
        if (!document.TryGetProperty("entities", out var entityArray) || entityArray.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        var entities = new List<GoogleDocumentAiEntity>();
        foreach (var entity in entityArray.EnumerateArray())
        {
            var type = entity.TryGetProperty("type", out var typeElement) ? typeElement.GetString() : null;
            var value = ReadEntityValue(entity);
            var confidence = entity.TryGetProperty("confidence", out var confidenceElement) && confidenceElement.TryGetDecimal(out var parsedConfidence)
                ? parsedConfidence
                : 0;
            if (!string.IsNullOrWhiteSpace(type) && !string.IsNullOrWhiteSpace(value))
            {
                entities.Add(new GoogleDocumentAiEntity(type, value, confidence));
            }
        }
        return entities;
    }

    private static string? ReadEntityValue(JsonElement entity)
    {
        if (entity.TryGetProperty("normalizedValue", out var normalized))
        {
            if (normalized.TryGetProperty("moneyValue", out var moneyValue))
            {
                var units = moneyValue.TryGetProperty("units", out var unitsElement) ? unitsElement.GetString() : "0";
                var nanos = moneyValue.TryGetProperty("nanos", out var nanosElement) && nanosElement.TryGetInt32(out var parsedNanos) ? parsedNanos : 0;
                if (decimal.TryParse(units, NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsedUnits))
                {
                    return (parsedUnits + (nanos / 1_000_000_000m)).ToString("0.##", CultureInfo.InvariantCulture);
                }
            }
            if (normalized.TryGetProperty("text", out var normalizedText) && !string.IsNullOrWhiteSpace(normalizedText.GetString()))
            {
                return normalizedText.GetString();
            }
        }
        return entity.TryGetProperty("mentionText", out var mentionText) ? mentionText.GetString() : null;
    }

    private static decimal ReadConfidence(JsonElement document, IReadOnlyList<GoogleDocumentAiEntity> entities)
    {
        var values = entities.Where(entity => entity.Confidence > 0).Select(entity => entity.Confidence).ToList();
        if (document.TryGetProperty("pages", out var pages) && pages.ValueKind == JsonValueKind.Array)
        {
            foreach (var page in pages.EnumerateArray())
            {
                if (!page.TryGetProperty("tokens", out var tokens) || tokens.ValueKind != JsonValueKind.Array) continue;
                foreach (var token in tokens.EnumerateArray())
                {
                    if (token.TryGetProperty("layout", out var layout)
                        && layout.TryGetProperty("confidence", out var confidenceElement)
                        && confidenceElement.TryGetDecimal(out var confidence)
                        && confidence > 0)
                    {
                        values.Add(confidence);
                    }
                }
            }
        }
        return values.Count == 0 ? 0 : Math.Round(values.Average(), 4);
    }
}

public sealed class GoogleDocumentAiExtractor(GoogleDocumentAiClient client) : IOcrExtractor
{
    public async Task<OcrExtractionResult> AnalyzeAsync(DocumentBlob document, IEnumerable<Vehicle> vehicles, CancellationToken cancellationToken = default)
    {
        var recognition = await client.RecognizeAsync(document, cancellationToken);
        var extraction = OcrExtractionParser.Analyze(
            document,
            vehicles,
            recognition.RawText,
            recognition.Confidence,
            recognition.Warnings);
        return GoogleDocumentAiEntityMapper.Apply(extraction, recognition.Entities);
    }
}

public static class GoogleDocumentAiEntityMapper
{
    public static OcrExtractionResult Apply(OcrExtractionResult extraction, IReadOnlyList<GoogleDocumentAiEntity> entities)
    {
        var fields = new Dictionary<string, string?>(extraction.Fields, StringComparer.OrdinalIgnoreCase);
        var fieldConfidence = new Dictionary<string, decimal>(extraction.FieldConfidence, StringComparer.OrdinalIgnoreCase);

        ApplyFirst(entities, fields, fieldConfidence, "invoiceNumber", "invoice_id");
        ApplyFirst(entities, fields, fieldConfidence, "receiptNumber", "receipt_id", "expense_id");
        ApplyFirst(entities, fields, fieldConfidence, "supplierName", "supplier_name");

        var amount = FindFirst(entities, "total_amount", "net_amount", "invoice_amount");
        if (amount is not null)
        {
            foreach (var field in new[] { "amount", "nettPrice", "salesPrice" })
            {
                fields[field] = amount.Value.Value;
                fieldConfidence[field] = amount.Value.Confidence;
            }
        }

        var documentDate = FindFirst(entities, "invoice_date", "receipt_date", "expense_date");
        if (documentDate is not null)
        {
            fields["documentDate"] = documentDate.Value.Value;
            fieldConfidence["documentDate"] = documentDate.Value.Confidence;
        }

        if (extraction.DocumentCategory == FileCategory.RepairInvoice)
        {
            var repairDetails = entities
                .Where(entity => new[] { "line_item", "line_item/description", "description" }.Contains(entity.Type, StringComparer.OrdinalIgnoreCase))
                .Select(entity => entity.Value.Trim())
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            var lineItems = repairDetails
                .Select(value => new OcrLineItem(value, null, null, null, entities
                    .Where(entity => string.Equals(entity.Value.Trim(), value, StringComparison.OrdinalIgnoreCase))
                    .Select(entity => (decimal?)entity.Confidence)
                    .FirstOrDefault(), value))
                .ToList();
            return extraction with { Fields = fields, FieldConfidence = fieldConfidence, LineItems = lineItems };
        }

        return extraction with { Fields = fields, FieldConfidence = fieldConfidence };
    }

    private static void ApplyFirst(
        IReadOnlyList<GoogleDocumentAiEntity> entities,
        Dictionary<string, string?> fields,
        Dictionary<string, decimal> fieldConfidence,
        string field,
        params string[] entityTypes)
    {
        var entity = FindFirst(entities, entityTypes);
        if (entity is null) return;
        fields[field] = entity.Value.Value;
        fieldConfidence[field] = entity.Value.Confidence;
    }

    private static (string Value, decimal Confidence)? FindFirst(IReadOnlyList<GoogleDocumentAiEntity> entities, params string[] types)
    {
        var entity = entities.FirstOrDefault(item => types.Contains(item.Type, StringComparer.OrdinalIgnoreCase));
        return entity is null ? null : (entity.Value, entity.Confidence);
    }
}

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
        if (!document.MimeType.StartsWith("text/", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Local OCR mock cannot read image files. Configure Google Document AI to extract values from uploaded photos.");
        }

        var text = System.Text.Encoding.UTF8.GetString(document.Content);
        if (!string.IsNullOrWhiteSpace(text)) return text;

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
            ["plateNumber"] = document.Category == FileCategory.RepairInvoice
                ? vehicles.FirstOrDefault(vehicle => vehicle.Id == document.VehicleId)?.PlateNumber
                : FindPlate(text) ?? vehicles.FirstOrDefault(vehicle => vehicle.Id == document.VehicleId)?.PlateNumber,
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
            fields["supplierName"] = FindRepairSupplier(text) ?? (allowMockFallbacks ? "OCR Demo Supplier" : null);
            fields["invoiceNumber"] = FindRepairInvoiceNumber(text) ?? fields["invoiceNumber"];
            fields["amount"] = FindRepairTotal(text) ?? fields["amount"];
            fields["plateNumberOnInvoice"] = FindRepairVehiclePlate(text, vehicles);
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

        var lineItems = document.Category == FileCategory.RepairInvoice
            ? ParseRepairLineItems(text, confidence)
            : null;

        if (document.Category == FileCategory.RepairInvoice && lineItems is not { Count: > 0 })
        {
            warnings.Add("Repair details were not detected. Check the item descriptions before saving.");
        }

        if (document.Category == FileCategory.RepairInvoice
            && !string.IsNullOrWhiteSpace(fields["plateNumberOnInvoice"])
            && !string.IsNullOrWhiteSpace(fields["plateNumber"])
            && !string.Equals(fields["plateNumberOnInvoice"], fields["plateNumber"], StringComparison.OrdinalIgnoreCase))
        {
            warnings.Add($"The receipt plate {fields["plateNumberOnInvoice"]} does not match the selected vehicle {fields["plateNumber"]}. Confirm before creating the repair.");
        }

        if (document.Category == FileCategory.IdentityCard && string.IsNullOrWhiteSpace(fields["icNumber"]))
        {
            warnings.Add("No identity card number was detected. Confirm the document manually before saving customer details.");
        }
        else if (document.Category == FileCategory.IdentityCard && !Regex.IsMatch(fields["icNumber"]!, @"^\d{6}-?\d{2}-?\d{4}$"))
        {
            warnings.Add("The identity card number appears incomplete. Correct it before saving customer details.");
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
            warnings,
            lineItems);
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
        if (match.Success) return match.Value;

        // Keep a visibly incomplete value in the review draft instead of
        // discarding it. Staff can correct it before explicitly applying it.
        var partialMatch = Regex.Match(text, @"\b\d{6}-?\d{2}-?\d{3}\b");
        return partialMatch.Success ? partialMatch.Value : null;
    }

    private static string? FindIdentityName(string text)
    {
        var match = Regex.Match(text, @"\bname\s*[:#-]?\s*(?<value>[A-Za-z][A-Za-z .'-]{1,80}?)(?=\s+(?:IC|Address)\b|$)", RegexOptions.IgnoreCase);
        if (match.Success) return match.Groups["value"].Value.Trim();

        // Malaysian identity cards commonly print the name as a standalone line,
        // without a Name label. Prefer the uppercase alphabetic line nearest the
        // identity number and ignore card headings/nationality text.
        var lines = TextLines(text);
        var identityLine = lines.FindIndex(line => Regex.IsMatch(line, @"\b\d{6}-?\d{2}-?\d{4}\b"));
        var candidates = lines
            .Select((line, index) => (line, index))
            .Where(item => (identityLine < 0 || Math.Abs(item.index - identityLine) <= 3) && Regex.IsMatch(item.line, @"^[A-Z][A-Z .'-]{3,80}$"))
            .Select(item => item.line)
            .Where(line => IsMyKadNameCandidate(line))
            .ToList();
        var multiWordCandidate = candidates.FirstOrDefault(line => Regex.Matches(line, @"[A-Z]{2,}").Count >= 2);
        if (!string.IsNullOrWhiteSpace(multiWordCandidate)) return multiWordCandidate;
        if (identityLine >= 0 && candidates.Count > 0) return candidates[0];

        // Some OCR providers flatten an entire MyKad into one text run. In that
        // case, search the text surrounding the IC number for an uppercase name.
        var identityMatch = Regex.Match(text, @"\b\d{6}-?\d{2}-?\d{4}\b");
        if (!identityMatch.Success) return null;
        var start = Math.Max(0, identityMatch.Index - 120);
        var length = Math.Min(text.Length - start, 260);
        var nearbyText = text.Substring(start, length);
        return Regex.Matches(nearbyText, @"\b(?:[A-Z]{2,}\s+){1,5}[A-Z]{2,}\b")
            .Select(candidate => candidate.Value.Trim())
            .FirstOrDefault(IsMyKadNameCandidate);
    }

    private static string? FindAddress(string text)
    {
        var match = Regex.Match(text, @"\baddress\s*[:#-]?\s*(?<value>[^\r\n]{3,200})", RegexOptions.IgnoreCase);
        if (match.Success) return match.Groups["value"].Value.Trim();

        // MyKad has no Address label; collect the address block until the card's
        // trailing nationality/gender lines. Keep multiple OCR lines together.
        var lines = TextLines(text);
        var addressStart = lines.FindIndex(line => Regex.IsMatch(line, @"(?:^|\s)NO\.?\s*\d{1,4}\b", RegexOptions.IgnoreCase));
        var addressLines = (addressStart < 0 ? Enumerable.Empty<string>() : lines.Skip(addressStart))
            .TakeWhile(line => !Regex.IsMatch(line, @"^(WARGANEGARA|LELAKI|PEREMPUAN|ISLAM|MALAYSIA)\b", RegexOptions.IgnoreCase))
            .Where(line => Regex.IsMatch(line, @"\d|JALAN|TAMAN|LORONG|KG\.?|BANDAR|KAMPUNG|JOHOR|SELANGOR|KEDAH|PERAK|PENANG|MELAKA|SABAH|SARAWAK", RegexOptions.IgnoreCase))
            .Select(line => Regex.Replace(line, @"^.*?(?=\bNO\.?\s*\d{1,4}\b)", "", RegexOptions.IgnoreCase))
            .ToList();
        if (addressLines.Count > 0) return string.Join(" ", addressLines);

        // The same card may arrive as a single line, so recognise the common
        // Malaysian address form without requiring an Address label or line breaks.
        var flattenedMatch = Regex.Match(
            text,
            @"\b(?:NO\.?\s*)?\d{1,4}[A-Z]?(?:\s*,?\s*(?:JALAN|LORONG|TAMAN|KAMPUNG|KG\.?|BANDAR)\s+[A-Z0-9 ./'-]+?){1,4}\s+\d{5}\s+(?:JOHOR|SELANGOR|KEDAH|PERAK|PULAU PINANG|MELAKA|NEGERI SEMBILAN|PAHANG|TERENGGANU|KELANTAN|PERLIS|SABAH|SARAWAK)\b",
            RegexOptions.IgnoreCase);
        return flattenedMatch.Success ? Regex.Replace(flattenedMatch.Value, @"\s+", " ").Trim() : null;
    }

    private static List<string> TextLines(string text) => text
        .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
        .Select(line => Regex.Replace(line.Trim(), @"\s+", " "))
        .Where(line => line.Length > 0)
        .ToList();

    private static bool IsMyKadHeader(string text) =>
        Regex.IsMatch(text, @"\b(KAD|PENGENALAN|MALAYSIA|WARGANEGARA|LELAKI|PEREMPUAN|ISLAM)\b", RegexOptions.IgnoreCase) ||
        Regex.IsMatch(text, @"^MA[IL]S?Y?$", RegexOptions.IgnoreCase) ||
        Regex.IsMatch(text, @"MALAY|KERAJAAN", RegexOptions.IgnoreCase);

    private static bool IsMyKadNameCandidate(string text) =>
        !IsMyKadHeader(text) &&
        !Regex.IsMatch(text, @"\b(NO\.?|JALAN|LORONG|TAMAN|KAMPUNG|KG\.?|BANDAR|POS|JOHOR|SELANGOR|KEDAH|PERAK|PENANG|MELAKA|SABAH|SARAWAK)\b", RegexOptions.IgnoreCase);

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

    private static string? FindRepairSupplier(string text)
    {
        var soldTo = Regex.Match(text, @"(?im)^\s*(?<supplier>[A-Z][A-Z0-9 &'.,-]{3,100})\s*\(\d{9,}\)\s*$");
        if (soldTo.Success) return soldTo.Groups["supplier"].Value.Trim();

        var firstLine = TextLines(text).FirstOrDefault(line =>
            line.Length >= 4 &&
            Regex.IsMatch(line, @"[A-Za-z]") &&
            !Regex.IsMatch(line, @"^(CASH SALE|SOLD TO|DATE|ITEM|DESCRIPTION|TOTAL|NOTES?)\b", RegexOptions.IgnoreCase));
        return firstLine;
    }

    private static string? FindRepairInvoiceNumber(string text)
    {
        var match = Regex.Match(text, @"(?im)\b(?:no\.?|number)\s*[:#-]?\s*(?<number>\d{3,})\b");
        return match.Success ? match.Groups["number"].Value : null;
    }

    private static string? FindRepairTotal(string text)
    {
        var matches = Regex.Matches(text, @"(?im)^\s*(?:page\s+total|total)\s*[:#-]?\s*(?:RM\s*)?(?<amount>\d{1,}(?:,\d{3})*(?:\.\d{1,2})?)\s*$");
        var match = matches.Cast<Match>().LastOrDefault();
        if (match is not null) return match.Groups["amount"].Value.Replace(",", "", StringComparison.Ordinal);

        return null;
    }

    private static string? FindRepairVehiclePlate(string text, IEnumerable<Vehicle> vehicles)
    {
        var knownPlate = vehicles
            .Select(vehicle => vehicle.PlateNumber.Trim())
            .Where(plate => plate.Length >= 4)
            .FirstOrDefault(plate => text.Contains(plate, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(knownPlate)) return knownPlate;

        var soldTo = Regex.Match(text, @"(?is)\bSOLD\s+TO\b(?<block>.*?)(?:\bTEL\b|\bDATE\b|\bITEM\b)");
        var candidate = Regex.Match(soldTo.Success ? soldTo.Groups["block"].Value : text, @"\b(?<plate>[A-Z]{1,3}\s?\d{3,5}[A-Z]?)\b");
        return candidate.Success ? candidate.Groups["plate"].Value.Replace(" ", "", StringComparison.Ordinal).ToUpperInvariant() : null;
    }

    private static IReadOnlyList<OcrLineItem> ParseRepairLineItems(string text, decimal confidence)
    {
        var items = new List<OcrLineItem>();
        foreach (var line in TextLines(text))
        {
            if (Regex.IsMatch(line, @"^(?:notes?|b/f pages total|page total|total)\b", RegexOptions.IgnoreCase)) break;
            var match = Regex.Match(line, @"^\s*\d+[.)]\s*(?<description>[A-Za-z][^\r\n]{2,120}?)\s*$");
            if (!match.Success || Regex.IsMatch(match.Groups["description"].Value, @"^(?:all cheques|cheques should|authorised signature)\b", RegexOptions.IgnoreCase)) continue;
            var description = Regex.Replace(match.Groups["description"].Value.Trim(), @"\s+", " ");
            items.Add(new OcrLineItem(description, null, null, null, confidence, line));
        }
        if (items.Count == 0)
        {
            var flattened = Regex.Replace(text.Replace("\\.", ".", StringComparison.Ordinal), @"\s+", " ");
            foreach (Match match in Regex.Matches(flattened, @"(?:^|\s)\d+[.)]\s+(?<description>.+?)(?=\s+\d+[.)]\s+|\s+(?:Notes?|B/F Pages Total|Page Total|Total)\b|$)", RegexOptions.IgnoreCase))
            {
                var description = match.Groups["description"].Value.Trim();
                if (description.Length >= 3 && !Regex.IsMatch(description, @"^(?:all cheques|cheques should|authorised signature)\b", RegexOptions.IgnoreCase))
                    items.Add(new OcrLineItem(description, null, null, null, confidence, description));
            }
        }

        return items;
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
