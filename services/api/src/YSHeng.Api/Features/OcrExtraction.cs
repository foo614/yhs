using System.Globalization;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Google.Apis.Auth.OAuth2;
using Microsoft.Extensions.Options;
using YSHeng.Api.Data;
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

public sealed record OcrLineItem(string Description, string? Quantity, string? UnitPrice, string? Amount, decimal? Confidence, string? RawText, string? Unit = null);
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
    IReadOnlyList<string> Warnings,
    IReadOnlyList<GoogleDocumentAiLayoutLine>? LayoutLines = null,
    IReadOnlyList<GoogleDocumentAiLayoutLine>? LayoutTokens = null);

public sealed record GoogleDocumentAiLayoutLine(string Text, int Page, double Left, double Top, double Right, double Bottom);

public sealed class GoogleDocumentAiClient(
    HttpClient httpClient,
    IGoogleAccessTokenProvider accessTokenProvider,
    IOptions<GoogleDocumentAiOptions> options)
{
    private readonly GoogleDocumentAiOptions options = options.Value;

    public async Task<GoogleDocumentAiRecognition> RecognizeAsync(DocumentBlob document, CancellationToken cancellationToken = default)
    {
        if (!string.Equals(document.MimeType, "application/pdf", StringComparison.OrdinalIgnoreCase) &&
            !document.MimeType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Google Document AI requires an uploaded image or PDF file for this backend flow.");
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

        return new GoogleDocumentAiRecognition(
            rawText.Trim(),
            confidence,
            entities,
            warnings,
            ReadLayoutLines(analyzedDocument, rawText),
            ReadLayoutTokens(analyzedDocument, rawText));
    }

    private static IReadOnlyList<GoogleDocumentAiLayoutLine> ReadLayoutTokens(JsonElement document, string rawText)
    {
        const int maxPages = 15;
        const int maxTokens = 1_000;
        if (!document.TryGetProperty("pages", out var pages) || pages.ValueKind != JsonValueKind.Array) return [];
        var result = new List<GoogleDocumentAiLayoutLine>();
        var pageNumber = 0;
        var examinedTokens = 0;
        foreach (var page in pages.EnumerateArray())
        {
            pageNumber++;
            if (pageNumber > maxPages || result.Count >= maxTokens || examinedTokens >= 2_000) break;
            if (!page.TryGetProperty("tokens", out var tokens) || tokens.ValueKind != JsonValueKind.Array) continue;
            foreach (var token in tokens.EnumerateArray())
            {
                if (++examinedTokens > 2_000 || result.Count >= maxTokens) break;
                if (!token.TryGetProperty("layout", out var layout)
                    || !TryReadTextAnchor(layout, rawText, out var text)
                    || !TryReadBounds(layout, out var left, out var top, out var right, out var bottom)) continue;
                result.Add(new GoogleDocumentAiLayoutLine(text.Trim(), pageNumber, left, top, right, bottom));
            }
        }
        return result;
    }

    private static IReadOnlyList<GoogleDocumentAiLayoutLine> ReadLayoutLines(JsonElement document, string rawText)
    {
        const int maxPages = 15;
        const int maxLayoutItems = 1_000;
        const int maxExaminedItems = 2_000;
        if (!document.TryGetProperty("pages", out var pages) || pages.ValueKind != JsonValueKind.Array) return [];
        var result = new List<GoogleDocumentAiLayoutLine>();
        var seen = new HashSet<GoogleDocumentAiLayoutLine>();
        var pageNumber = 0;
        var examinedItems = 0;
        foreach (var page in pages.EnumerateArray())
        {
            pageNumber++;
            if (pageNumber > maxPages || result.Count >= maxLayoutItems) break;
            if (page.TryGetProperty("tables", out var tables) && tables.ValueKind == JsonValueKind.Array)
            {
                foreach (var table in tables.EnumerateArray())
                {
                    if (++examinedItems > maxExaminedItems) break;
                    ReadTableRows(table, "headerRows", pageNumber, rawText, result, seen, maxLayoutItems, ref examinedItems, maxExaminedItems);
                    ReadTableRows(table, "bodyRows", pageNumber, rawText, result, seen, maxLayoutItems, ref examinedItems, maxExaminedItems);
                    if (result.Count >= maxLayoutItems || examinedItems >= maxExaminedItems) break;
                }
            }
            if (examinedItems >= maxExaminedItems) break;
            if (!page.TryGetProperty("lines", out var lines) || lines.ValueKind != JsonValueKind.Array) continue;
            foreach (var line in lines.EnumerateArray())
            {
                if (++examinedItems > maxExaminedItems || result.Count >= maxLayoutItems) break;
                if (!line.TryGetProperty("layout", out var layout)
                    || !TryReadTextAnchor(layout, rawText, out var text)
                    || !TryReadBounds(layout, out var left, out var top, out var right, out var bottom)) continue;
                AddLayoutLine(result, seen, new GoogleDocumentAiLayoutLine(text.Trim(), pageNumber, left, top, right, bottom));
            }
        }
        return result;
    }

    private static void ReadTableRows(
        JsonElement table,
        string property,
        int pageNumber,
        string rawText,
        List<GoogleDocumentAiLayoutLine> result,
        HashSet<GoogleDocumentAiLayoutLine> seen,
        int maxLayoutItems,
        ref int examinedItems,
        int maxExaminedItems)
    {
        if (!table.TryGetProperty(property, out var rows) || rows.ValueKind != JsonValueKind.Array) return;
        foreach (var row in rows.EnumerateArray())
        {
            if (++examinedItems > maxExaminedItems || result.Count >= maxLayoutItems) break;
            if (!row.TryGetProperty("cells", out var cells) || cells.ValueKind != JsonValueKind.Array) continue;
            foreach (var cell in cells.EnumerateArray())
            {
                if (++examinedItems > maxExaminedItems || result.Count >= maxLayoutItems) break;
                if (!cell.TryGetProperty("layout", out var layout)
                    || !TryReadTextAnchor(layout, rawText, out var text)
                    || !TryReadBounds(layout, out var left, out var top, out var right, out var bottom)) continue;
                AddLayoutLine(result, seen, new GoogleDocumentAiLayoutLine(text.Trim(), pageNumber, left, top, right, bottom));
            }
        }
    }

    private static void AddLayoutLine(List<GoogleDocumentAiLayoutLine> result, HashSet<GoogleDocumentAiLayoutLine> seen, GoogleDocumentAiLayoutLine line)
    {
        if (seen.Add(line)) result.Add(line);
    }

    private static bool TryReadTextAnchor(JsonElement layout, string rawText, out string text)
    {
        text = "";
        if (!layout.TryGetProperty("textAnchor", out var anchor)
            || !anchor.TryGetProperty("textSegments", out var segments)
            || segments.ValueKind != JsonValueKind.Array) return false;
        var builder = new StringBuilder();
        var segmentCount = 0;
        foreach (var segment in segments.EnumerateArray())
        {
            if (++segmentCount > 16 || builder.Length >= 512) break;
            var start = ReadIndex(segment, "startIndex");
            var end = ReadIndex(segment, "endIndex");
            if (start < 0 || end <= start || end > rawText.Length) continue;
            builder.Append(rawText.AsSpan(start, Math.Min(end - start, 512 - builder.Length)));
        }
        text = builder.ToString();
        return !string.IsNullOrWhiteSpace(text);
    }

    private static int ReadIndex(JsonElement segment, string property)
    {
        if (!segment.TryGetProperty(property, out var value)) return property == "startIndex" ? 0 : -1;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number)) return number;
        return value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out number) ? number : -1;
    }

    private static bool TryReadBounds(JsonElement layout, out double left, out double top, out double right, out double bottom)
    {
        left = top = double.MaxValue;
        right = bottom = double.MinValue;
        if (!layout.TryGetProperty("boundingPoly", out var poly)
            || !poly.TryGetProperty("normalizedVertices", out var vertices)
            || vertices.ValueKind != JsonValueKind.Array) return false;
        var found = false;
        var vertexCount = 0;
        foreach (var vertex in vertices.EnumerateArray())
        {
            if (++vertexCount > 16) return false;
            var x = vertex.TryGetProperty("x", out var xValue) && xValue.TryGetDouble(out var parsedX) ? parsedX : 0;
            var y = vertex.TryGetProperty("y", out var yValue) && yValue.TryGetDouble(out var parsedY) ? parsedY : 0;
            if (!double.IsFinite(x) || !double.IsFinite(y) || x is < 0 or > 1 || y is < 0 or > 1) return false;
            left = Math.Min(left, x);
            top = Math.Min(top, y);
            right = Math.Max(right, x);
            bottom = Math.Max(bottom, y);
            found = true;
        }
        return found && right > left && bottom > top;
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

public sealed class GoogleDocumentAiExtractor(
    GoogleDocumentAiClient client,
    ILogger<GoogleDocumentAiExtractor> logger) : IOcrExtractor
{
    public async Task<OcrExtractionResult> AnalyzeAsync(DocumentBlob document, IEnumerable<Vehicle> vehicles, CancellationToken cancellationToken = default)
    {
        GoogleDocumentAiRecognition recognition;
        try
        {
            recognition = await client.RecognizeAsync(document, cancellationToken);
        }
        catch (Exception exception) when (
            document.Category == FileCategory.Voc &&
            !(exception is OperationCanceledException && cancellationToken.IsCancellationRequested))
        {
            logger.LogWarning("VOC OCR provider diagnostic: ProviderSucceeded={ProviderSucceeded}", false);
            throw;
        }
        var extraction = OcrExtractionParser.Analyze(
            document,
            vehicles,
            recognition.RawText,
            recognition.Confidence,
            recognition.Warnings);
        var mappedExtraction = GoogleDocumentAiEntityMapper.Apply(extraction, recognition.Entities);
        if (document.Category == FileCategory.Voc)
        {
            mappedExtraction = GoogleDocumentAiVocLayoutMapper.Apply(
                mappedExtraction,
                recognition.LayoutLines ?? [],
                out var identifierMappingReason);
            var diagnostic = GoogleDocumentAiVocDiagnostic.Create(recognition, mappedExtraction, identifierMappingReason);
            LogVocDiagnostic(logger, diagnostic);
        }
        return mappedExtraction;
    }

    private static void LogVocDiagnostic(ILogger logger, GoogleDocumentAiVocDiagnostic diagnostic) =>
        logger.LogInformation(
                "VOC OCR field-presence diagnostic: Lines={LineCount}, Entities={EntityCount}, EntityTypes={EntityTypeCount}, RegistrationLayout={RegistrationLayout}, ChassisLayout={ChassisLayout}, EngineLayout={EngineLayout}, MakeLayout={MakeLayout}, ModelLayout={ModelLayout}, YearLayout={YearLayout}, PlateMapped={PlateMapped}, ChassisMapped={ChassisMapped}, EngineMapped={EngineMapped}, MakeMapped={MakeMapped}, ModelMapped={ModelMapped}, YearMapped={YearMapped}, ChassisLengthBucket={ChassisLengthBucket}, ChassisAllowedCharacters={ChassisAllowedCharacters}, ChassisHasLetter={ChassisHasLetter}, ChassisHasDigit={ChassisHasDigit}, EngineLengthBucket={EngineLengthBucket}, EngineAllowedCharacters={EngineAllowedCharacters}, EngineHasLetter={EngineHasLetter}, EngineHasDigit={EngineHasDigit}, IdentifierMappingReason={IdentifierMappingReason}, IdentifierLabelTokenCount={IdentifierLabelTokenCount}, IdentifierLabelTokenBuckets={IdentifierLabelTokenBuckets}, IdentifierLabelDelimiter={IdentifierLabelDelimiter}, IdentifierSameBandCount={IdentifierSameBandCount}, IdentifierSameBandTokenBuckets={IdentifierSameBandTokenBuckets}, IdentifierBelowBandCount={IdentifierBelowBandCount}, IdentifierBelowBandTokenBuckets={IdentifierBelowBandTokenBuckets}, IdentifierWordSameBandCount={IdentifierWordSameBandCount}, IdentifierWordSameBandBuckets={IdentifierWordSameBandBuckets}, IdentifierWordBelowBandCount={IdentifierWordBelowBandCount}, IdentifierWordBelowBandBuckets={IdentifierWordBelowBandBuckets}, VehicleLabelBlockCount={VehicleLabelBlockCount}, VehicleValueBlockCount={VehicleValueBlockCount}, YearPositionValid={YearPositionValid}, RegistrationDatePositionValid={RegistrationDatePositionValid}",
                diagnostic.LineCount,
                diagnostic.EntityCount,
                diagnostic.EntityTypeCount,
                diagnostic.RegistrationLayout,
                diagnostic.ChassisLayout,
                diagnostic.EngineLayout,
                diagnostic.MakeLayout,
                diagnostic.ModelLayout,
                diagnostic.YearLayout,
                diagnostic.PlateMapped,
                diagnostic.ChassisMapped,
                diagnostic.EngineMapped,
                diagnostic.MakeMapped,
                diagnostic.ModelMapped,
                diagnostic.YearMapped,
                diagnostic.ChassisCandidate.LengthBucket,
                diagnostic.ChassisCandidate.AllowedCharacters,
                diagnostic.ChassisCandidate.HasLetter,
                diagnostic.ChassisCandidate.HasDigit,
                diagnostic.EngineCandidate.LengthBucket,
                diagnostic.EngineCandidate.AllowedCharacters,
                diagnostic.EngineCandidate.HasLetter,
                diagnostic.EngineCandidate.HasDigit,
                diagnostic.IdentifierMappingReason,
                diagnostic.IdentifierLayout.LabelTokenCount,
                diagnostic.IdentifierLayout.LabelTokenBuckets,
                diagnostic.IdentifierLayout.LabelDelimiter,
                diagnostic.IdentifierLayout.SameBandCount,
                diagnostic.IdentifierLayout.SameBandTokenBuckets,
                diagnostic.IdentifierLayout.BelowBandCount,
                diagnostic.IdentifierLayout.BelowBandTokenBuckets,
                diagnostic.IdentifierLayout.WordSameBandCount,
                diagnostic.IdentifierLayout.WordSameBandBuckets,
                diagnostic.IdentifierLayout.WordBelowBandCount,
                diagnostic.IdentifierLayout.WordBelowBandBuckets,
                diagnostic.VehicleColumn.LabelBlockCount,
                diagnostic.VehicleColumn.ValueBlockCount,
                diagnostic.VehicleColumn.YearPositionValid,
                diagnostic.VehicleColumn.RegistrationDatePositionValid);
}

public sealed record GoogleDocumentAiVocDiagnostic(
    int LineCount,
    int EntityCount,
    int EntityTypeCount,
    string RegistrationLayout,
    string ChassisLayout,
    string EngineLayout,
    string MakeLayout,
    string ModelLayout,
    string YearLayout,
    bool PlateMapped,
    bool ChassisMapped,
    bool EngineMapped,
    bool MakeMapped,
    bool ModelMapped,
    bool YearMapped,
    VocIdentifierCandidateDiagnostic ChassisCandidate,
    VocIdentifierCandidateDiagnostic EngineCandidate,
    string IdentifierMappingReason,
    VocCompositeIdentifierLayoutDiagnostic IdentifierLayout,
    VocVehicleColumnDiagnostic VehicleColumn)
{
    public static GoogleDocumentAiVocDiagnostic Create(
        GoogleDocumentAiRecognition recognition,
        OcrExtractionResult extraction,
        string identifierMappingReason = "not-captured")
    {
        var lines = recognition.RawText
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        var identifierCandidates = FindIdentifierCandidates(lines);

        return new GoogleDocumentAiVocDiagnostic(
            lines.Length,
            recognition.Entities.Count,
            recognition.Entities.Select(entity => entity.Type).Distinct(StringComparer.OrdinalIgnoreCase).Count(),
            ClassifyLayout(lines, @"\b(?:NO\.?|NOMBOR)\s*PENDAFTARAN\b"),
            ClassifyLayout(lines, @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b"),
            ClassifyLayout(lines, @"\b(?:NO\.?|NOMBOR)\s*ENJIN\b"),
            ClassifyLayout(lines, @"\bBUATAN\b"),
            ClassifyLayout(lines, @"\bNAMA\s+MODEL\b"),
            ClassifyLayout(lines, @"\bTAHUN\s+DIBUAT\b"),
            HasField(extraction, "plateNumber"),
            HasField(extraction, "chassisNumber"),
            HasField(extraction, "engineNumber"),
            HasField(extraction, "make"),
            HasField(extraction, "model"),
            HasField(extraction, "year"),
            IdentifierCandidate(identifierCandidates.Chassis),
            IdentifierCandidate(identifierCandidates.Engine),
            identifierMappingReason,
            AnalyzeIdentifierLayout(recognition.LayoutLines ?? [], recognition.LayoutTokens ?? []),
            AnalyzeVehicleColumn(lines));
    }

    private static VocCompositeIdentifierLayoutDiagnostic AnalyzeIdentifierLayout(
        IReadOnlyList<GoogleDocumentAiLayoutLine> layoutLines,
        IReadOnlyList<GoogleDocumentAiLayoutLine> layoutTokens)
    {
        var label = layoutLines
            .Where(line => Regex.IsMatch(line.Text, @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b", RegexOptions.IgnoreCase)
                && Regex.IsMatch(line.Text, @"\b(?:NO\.?|NOMBOR)\s*ENJIN\b", RegexOptions.IgnoreCase))
            .OrderBy(line => Math.Max(0, line.Right - line.Left) * Math.Max(0, line.Bottom - line.Top))
            .FirstOrDefault();
        if (label is null) return new VocCompositeIdentifierLayoutDiagnostic(0, "none", "none", 0, "none", 0, "none", 0, "none", 0, "none");

        var withoutLabels = Regex.Replace(
            label.Text,
            @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS|ENJIN)\b",
            " ",
            RegexOptions.IgnoreCase);
        var labelTokens = IdentifierTokens(withoutLabels);
        var sameBand = layoutLines.Where(line => !ReferenceEquals(line, label)
            && line.Page == label.Page
            && VerticalOverlap(label, line) >= 0.45
            && !IsDiagnosticKnownLabel(line.Text)).Take(8).ToList();
        var belowBand = layoutLines.Where(line => !ReferenceEquals(line, label)
            && line.Page == label.Page
            && line.Top - label.Bottom is >= -0.01 and <= 0.12
            && (HorizontalOverlap(label, line) >= 0.35 || Math.Abs(CenterX(label) - CenterX(line)) <= 0.08)
            && !IsDiagnosticKnownLabel(line.Text)).Take(8).ToList();
        var wordSameBand = layoutTokens.Where(token => token.Page == label.Page
            && VerticalOverlap(label, token) >= 0.45
            && !IsIdentifierLabelToken(token.Text)).Take(16).ToList();
        var wordBelowBand = layoutTokens.Where(token => token.Page == label.Page
            && token.Top - label.Bottom is >= -0.01 and <= 0.12
            && (HorizontalOverlap(label, token) >= 0.35 || Math.Abs(CenterX(label) - CenterX(token)) <= 0.08)
            && !IsIdentifierLabelToken(token.Text)).Take(16).ToList();
        return new VocCompositeIdentifierLayoutDiagnostic(
            labelTokens.Count,
            TokenBuckets(labelTokens),
            withoutLabels.Contains('/') ? "slash" : withoutLabels.Contains('|') ? "pipe" : labelTokens.Count > 0 ? "none" : "labels-only",
            sameBand.Count,
            TokenBuckets(sameBand.SelectMany(line => IdentifierTokens(line.Text)).ToList()),
            belowBand.Count,
            TokenBuckets(belowBand.SelectMany(line => IdentifierTokens(line.Text)).ToList()),
            wordSameBand.Count,
            TokenBuckets(wordSameBand.SelectMany(token => IdentifierTokens(token.Text)).ToList()),
            wordBelowBand.Count,
            TokenBuckets(wordBelowBand.SelectMany(token => IdentifierTokens(token.Text)).ToList()));
    }

    private static List<string> IdentifierTokens(string value) => Regex.Matches(value.ToUpperInvariant(), @"[A-Z0-9-]{2,64}")
        .Select(match => match.Value)
        .Take(16)
        .ToList();

    private static string TokenBuckets(IReadOnlyList<string> tokens) => tokens.Count == 0
        ? "none"
        : string.Join(',', tokens.Take(8).Select(token => LengthBucket(token.Length)));

    private static bool IsDiagnosticKnownLabel(string value) =>
        Regex.IsMatch(value, @"\b(?:NO\.?|NOMBOR)\s*(?:PENDAFTARAN|CHASIS|CHASSIS|CASIS|ENJIN)\b|\b(?:KEUPAYAAN\s+ENJIN|BUATAN|NAMA\s+MODEL|JENIS\s+BADAN|TAHUN\s+DIBUAT|TARIKH\s+PENDAFTARAN)\b", RegexOptions.IgnoreCase);

    private static bool IsIdentifierLabelToken(string value) =>
        Regex.IsMatch(value.Trim(), @"^(?:NO\.?|NOMBOR|CHASIS|CHASSIS|CASIS|ENJIN|/|\|)$", RegexOptions.IgnoreCase);

    private static double VerticalOverlap(GoogleDocumentAiLayoutLine left, GoogleDocumentAiLayoutLine right)
    {
        var overlap = Math.Max(0, Math.Min(left.Bottom, right.Bottom) - Math.Max(left.Top, right.Top));
        return overlap / Math.Max(0.001, Math.Min(left.Bottom - left.Top, right.Bottom - right.Top));
    }

    private static double HorizontalOverlap(GoogleDocumentAiLayoutLine left, GoogleDocumentAiLayoutLine right)
    {
        var overlap = Math.Max(0, Math.Min(left.Right, right.Right) - Math.Max(left.Left, right.Left));
        return overlap / Math.Max(0.001, Math.Min(left.Right - left.Left, right.Right - right.Left));
    }

    private static double CenterX(GoogleDocumentAiLayoutLine line) => (line.Left + line.Right) / 2;

    private static VocIdentifierCandidateDiagnostic IdentifierCandidate(string candidate)
    {
        var normalized = Regex.Replace(candidate, @"\s+", string.Empty).ToUpperInvariant();
        return new VocIdentifierCandidateDiagnostic(
            LengthBucket(normalized.Length),
            normalized.Length > 0 && Regex.IsMatch(normalized, @"^[A-Z0-9-]+$", RegexOptions.IgnoreCase),
            Regex.IsMatch(normalized, @"[A-Z]", RegexOptions.IgnoreCase),
            Regex.IsMatch(normalized, @"\d"));
    }

    private static (string Chassis, string Engine) FindIdentifierCandidates(IReadOnlyList<string> lines)
    {
        var interleavedPattern = @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b\s*[:#-]?\s*(?<chassis>[^/]+?)\s*/?\s*\b(?:NO\.?|NOMBOR)\s*ENJIN\b\s*[:#-]?\s*(?<engine>.+)$";
        foreach (var line in lines)
        {
            var interleaved = Regex.Match(line, interleavedPattern, RegexOptions.IgnoreCase);
            if (interleaved.Success)
                return (CleanCandidate(interleaved.Groups["chassis"].Value), CleanCandidate(interleaved.Groups["engine"].Value));
        }

        var combinedIndex = -1;
        for (var index = 0; index < lines.Count; index++)
        {
            if (Regex.IsMatch(lines[index], @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b", RegexOptions.IgnoreCase) &&
                Regex.IsMatch(lines[index], @"\b(?:NO\.?|NOMBOR)\s*ENJIN\b", RegexOptions.IgnoreCase))
            {
                combinedIndex = index;
                break;
            }
        }
        if (combinedIndex >= 0 && combinedIndex + 1 < lines.Count)
        {
            var pair = lines[combinedIndex + 1].Split('/', 2, StringSplitOptions.TrimEntries);
            if (pair.Length == 2) return (CleanCandidate(pair[0]), CleanCandidate(pair[1]));
        }

        return (
            FindStandaloneCandidate(lines, @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b"),
            FindStandaloneCandidate(lines, @"\b(?:NO\.?|NOMBOR)\s*ENJIN\b"));
    }

    private static string FindStandaloneCandidate(IReadOnlyList<string> lines, string labelPattern)
    {
        for (var index = 0; index < lines.Count; index++)
        {
            var match = Regex.Match(lines[index], labelPattern, RegexOptions.IgnoreCase);
            if (!match.Success) continue;
            var candidate = CleanCandidate(lines[index][(match.Index + match.Length)..]);
            return !string.IsNullOrWhiteSpace(candidate) || index + 1 >= lines.Count || IsKnownLabel(lines[index + 1])
                ? candidate
                : CleanCandidate(lines[index + 1]);
        }
        return "";
    }

    private static string CleanCandidate(string value) => value.Trim().TrimStart(':', '-', '/', '|').Trim();

    private static VocVehicleColumnDiagnostic AnalyzeVehicleColumn(IReadOnlyList<string> lines)
    {
        var makeIndex = Array.FindIndex(lines.ToArray(), line => Regex.IsMatch(line, LabelOnlyPattern("BUATAN"), RegexOptions.IgnoreCase));
        if (makeIndex < 0) return new VocVehicleColumnDiagnostic(0, 0, false, false);
        var start = makeIndex;
        while (start > 0 && IsLabelOnly(lines[start - 1])) start--;
        var end = makeIndex;
        while (end + 1 < lines.Count && IsLabelOnly(lines[end + 1])) end++;
        var labelCount = Math.Min(end - start + 1, 20);
        var valueStart = end + 1;
        var valueCount = 0;
        while (valueStart + valueCount < lines.Count && valueCount < 20 && !IsKnownLabel(lines[valueStart + valueCount])) valueCount++;
        var yearLabelOffset = FindOffset(lines, start, end, LabelOnlyPattern(@"TAHUN\s+DIBUAT"));
        var dateLabelOffset = FindOffset(lines, start, end, LabelOnlyPattern(@"TARIKH\s+PENDAFTARAN"));
        return new VocVehicleColumnDiagnostic(
            labelCount,
            valueCount,
            PositionMatches(lines, valueStart, valueCount, yearLabelOffset, @"^(?:19|20)\d{2}$"),
            PositionMatches(lines, valueStart, valueCount, dateLabelOffset, @"^(?:\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2}|(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2})$"));
    }

    private static int FindOffset(IReadOnlyList<string> lines, int start, int end, string pattern)
    {
        for (var index = start; index <= end; index++)
            if (Regex.IsMatch(lines[index], pattern, RegexOptions.IgnoreCase)) return index - start;
        return -1;
    }

    private static bool PositionMatches(IReadOnlyList<string> lines, int valueStart, int valueCount, int offset, string pattern) =>
        offset >= 0 && offset < valueCount && Regex.IsMatch(lines[valueStart + offset].Trim().TrimStart(':', '-', '/', '|').Trim(), pattern, RegexOptions.IgnoreCase);

    private static bool IsKnownLabel(string value) =>
        Regex.IsMatch(value, @"\b(?:NO\.?|NOMBOR)\s*(?:PENDAFTARAN|CHASIS|CHASSIS|CASIS|ENJIN)\b|\b(?:KEUPAYAAN\s+ENJIN|BUATAN|NAMA\s+MODEL|JENIS\s+BADAN|TAHUN\s+DIBUAT|TARIKH\s+PENDAFTARAN)\b", RegexOptions.IgnoreCase);

    private static bool IsLabelOnly(string value)
    {
        var withoutLabels = Regex.Replace(
            value,
            @"\b(?:NO\.?|NOMBOR)\s*(?:PENDAFTARAN|CHASIS|CHASSIS|CASIS|ENJIN)\b|\b(?:KEUPAYAAN\s+ENJIN|BUATAN|NAMA\s+MODEL|JENIS\s+BADAN|TAHUN\s+DIBUAT|TARIKH\s+PENDAFTARAN)\b",
            "",
            RegexOptions.IgnoreCase);
        return IsKnownLabel(value) && string.IsNullOrWhiteSpace(withoutLabels.Trim(' ', ':', '-', '/', '|'));
    }

    private static string LabelOnlyPattern(string labelPattern) => $@"^\s*{labelPattern}\s*[:|/-]?\s*$";

    private static string LengthBucket(int length) => length switch
    {
        0 => "none",
        <= 4 => "1-4",
        <= 9 => "5-9",
        <= 17 => "10-17",
        <= 32 => "18-32",
        _ => "33-plus"
    };

    private static string ClassifyLayout(IReadOnlyList<string> lines, string labelPattern)
    {
        for (var index = 0; index < lines.Count; index++)
        {
            var match = Regex.Match(lines[index], labelPattern, RegexOptions.IgnoreCase);
            if (!match.Success) continue;
            var suffix = lines[index][(match.Index + match.Length)..];
            var nonLabelSuffix = Regex.Replace(
                suffix,
                @"\b(?:NO\.?|NOMBOR)\s*(?:PENDAFTARAN|CHASIS|CHASSIS|CASIS|ENJIN)\b|\b(?:KEUPAYAAN\s+ENJIN|BUATAN|NAMA\s+MODEL|JENIS\s+BADAN|TAHUN\s+DIBUAT|TARIKH\s+PENDAFTARAN)\b",
                "",
                RegexOptions.IgnoreCase);
            if (!string.IsNullOrWhiteSpace(nonLabelSuffix.Trim(' ', ':', '-', '/', '|')))
            {
                return "same-line-content";
            }
            if (index + 1 >= lines.Count) return "label-at-end";
            return Regex.IsMatch(lines[index + 1], @"\b(?:NO\.?|NOMBOR)\s*(?:PENDAFTARAN|CHASIS|CHASSIS|CASIS|ENJIN)\b|\b(?:KEUPAYAAN\s+ENJIN|BUATAN|NAMA\s+MODEL|JENIS\s+BADAN|TAHUN\s+DIBUAT|TARIKH\s+PENDAFTARAN)\b", RegexOptions.IgnoreCase)
                ? "next-line-label"
                : "next-line-content";
        }
        return "missing";
    }

    private static bool HasField(OcrExtractionResult extraction, string field) =>
        extraction.Fields.TryGetValue(field, out var value) && !string.IsNullOrWhiteSpace(value);
}

public sealed record VocIdentifierCandidateDiagnostic(string LengthBucket, bool AllowedCharacters, bool HasLetter, bool HasDigit);
public sealed record VocCompositeIdentifierLayoutDiagnostic(
    int LabelTokenCount,
    string LabelTokenBuckets,
    string LabelDelimiter,
    int SameBandCount,
    string SameBandTokenBuckets,
    int BelowBandCount,
    string BelowBandTokenBuckets,
    int WordSameBandCount,
    string WordSameBandBuckets,
    int WordBelowBandCount,
    string WordBelowBandBuckets);
public sealed record VocVehicleColumnDiagnostic(int LabelBlockCount, int ValueBlockCount, bool YearPositionValid, bool RegistrationDatePositionValid);

public static class GoogleDocumentAiVocLayoutMapper
{
    private sealed record FieldSpec(string Field, string[] Labels, Func<string, string?> Validate);
    private sealed record IdentifierPairParseResult(bool Success, string Chassis, string Engine, string Reason);
    private sealed record CompositeIdentifierApplyResult(bool SuppressStandalone, string Reason);

    private static readonly FieldSpec[] Fields =
    [
        new("plateNumber", ["NO PENDAFTARAN", "NOMBOR PENDAFTARAN"], ValidatePlate),
        new("chassisNumber", ["NO CHASIS", "NO CHASSIS", "NOMBOR CASIS", "NOMBOR CHASIS"], value => ValidateIdentifier(value, 10)),
        new("engineNumber", ["NO ENJIN", "NOMBOR ENJIN"], value => ValidateIdentifier(value, 5)),
        new("make", ["BUATAN"], ValidateDescription),
        new("model", ["NAMA MODEL"], ValidateDescription),
        new("year", ["TAHUN DIBUAT"], ValidateYear)
    ];

    public static OcrExtractionResult Apply(OcrExtractionResult extraction, IReadOnlyList<GoogleDocumentAiLayoutLine> layoutLines)
        => Apply(extraction, layoutLines, out _);

    public static OcrExtractionResult Apply(
        OcrExtractionResult extraction,
        IReadOnlyList<GoogleDocumentAiLayoutLine> layoutLines,
        out string identifierMappingReason)
    {
        if (layoutLines.Count == 0)
        {
            identifierMappingReason = "no-layout-lines";
            return extraction;
        }
        var fields = new Dictionary<string, string?>(extraction.Fields, StringComparer.OrdinalIgnoreCase);
        var confidence = new Dictionary<string, decimal>(extraction.FieldConfidence, StringComparer.OrdinalIgnoreCase);
        var consumed = new HashSet<GoogleDocumentAiLayoutLine>();
        var identifierResult = ApplyCompositeIdentifierPair(layoutLines, fields, confidence, consumed, extraction.Confidence);
        identifierMappingReason = identifierResult.Reason;
        var suppressStandaloneIdentifiers = identifierResult.SuppressStandalone;
        ApplyCompositeTextPair(layoutLines, fields, confidence, consumed, extraction.Confidence);
        ApplyCompositeYear(layoutLines, fields, confidence, consumed, extraction.Confidence);
        foreach (var spec in Fields)
        {
            if (suppressStandaloneIdentifiers && spec.Field is "chassisNumber" or "engineNumber") continue;
            if (fields.TryGetValue(spec.Field, out var existing) && !string.IsNullOrWhiteSpace(existing)) continue;
            var match = FindRelativeValue(layoutLines, spec, consumed);
            if (match is null) continue;
            fields[spec.Field] = match.Value.Value;
            confidence[spec.Field] = extraction.Confidence;
            consumed.Add(match.Value.Line);
        }
        var warnings = extraction.Warnings
            .Where(warning => !Fields.Any(spec => fields.TryGetValue(spec.Field, out var value)
                && !string.IsNullOrWhiteSpace(value)
                && warning.StartsWith($"No {WarningFieldName(spec.Field)} was detected.", StringComparison.OrdinalIgnoreCase)))
            .ToList();
        return extraction with { Fields = fields, FieldConfidence = confidence, Warnings = warnings };
    }

    private static CompositeIdentifierApplyResult ApplyCompositeIdentifierPair(
        IReadOnlyList<GoogleDocumentAiLayoutLine> lines,
        Dictionary<string, string?> fields,
        Dictionary<string, decimal> confidence,
        HashSet<GoogleDocumentAiLayoutLine> consumed,
        decimal documentConfidence)
    {
        var label = lines
            .Where(line => Regex.IsMatch(line.Text, @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b", RegexOptions.IgnoreCase)
                && Regex.IsMatch(line.Text, @"\b(?:NO\.?|NOMBOR)\s*ENJIN\b", RegexOptions.IgnoreCase))
            .OrderBy(LineArea)
            .FirstOrDefault();
        var match = label;
        var hasInlineContent = match is not null && HasInlineIdentifierContent(match.Text);
        var inlinePair = hasInlineContent
            ? ParseInlineIdentifierPair(match!.Text)
            : new IdentifierPairParseResult(false, "", "", "no-inline-content");
        var hasInlinePair = inlinePair.Success;
        var chassis = inlinePair.Chassis;
        var engine = inlinePair.Engine;
        if (hasInlineContent && !hasInlinePair) return new CompositeIdentifierApplyResult(true, inlinePair.Reason);
        if (!hasInlineContent)
            match = label is null ? null : FindCompositeRelativeLineFromLabel(lines, label, consumed);
        if (!hasInlinePair && (match is null || !TrySplitIdentifierPair(match.Text, out chassis, out engine)))
            return new CompositeIdentifierApplyResult(false, label is null ? "no-combined-label" : "relative-pair-not-mapped");
        if (!CanFillCompositePair(fields, "chassisNumber", chassis, "engineNumber", engine))
            return new CompositeIdentifierApplyResult(hasInlineContent, "existing-value-conflict");
        FillMissingCompositeField(fields, confidence, "chassisNumber", chassis, documentConfidence);
        FillMissingCompositeField(fields, confidence, "engineNumber", engine, documentConfidence);
        if (match is not null && !ReferenceEquals(match, label)) consumed.Add(match);
        return new CompositeIdentifierApplyResult(hasInlineContent, hasInlineContent ? inlinePair.Reason : "mapped-relative-pair");
    }

    private static void ApplyCompositeTextPair(
        IReadOnlyList<GoogleDocumentAiLayoutLine> lines,
        Dictionary<string, string?> fields,
        Dictionary<string, decimal> confidence,
        HashSet<GoogleDocumentAiLayoutLine> consumed,
        decimal documentConfidence)
    {
        var match = FindCompositeRelativeLine(lines, "BUATAN", "NAMA MODEL", consumed);
        if (match is null) return;
        var parts = match.Text.Split(['/', '|'], 2, StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2) return;
        var make = ValidateDescription(parts[0]);
        var model = ValidateDescription(parts[1]);
        if (make is null || model is null) return;
        // The generic parser can place the unsplit paired cell in Make. That value is
        // the same layout candidate, not an independent extraction worth preserving.
        fields.TryGetValue("make", out var existingMake);
        fields.TryGetValue("model", out var existingModel);
        var makeIsEcho = IsCompositeTextEcho(existingMake, make, model);
        var modelIsEcho = IsCompositeTextEcho(existingModel, make, model);
        if ((!makeIsEcho && HasValue(fields, "make") && !string.Equals(existingMake?.Trim(), make, StringComparison.OrdinalIgnoreCase))
            || (!modelIsEcho && HasValue(fields, "model") && !string.Equals(existingModel?.Trim(), model, StringComparison.OrdinalIgnoreCase)))
        {
            return;
        }
        if (makeIsEcho)
        {
            fields["make"] = null;
            confidence.Remove("make");
        }
        if (modelIsEcho)
        {
            fields["model"] = null;
            confidence.Remove("model");
        }
        FillMissingCompositeField(fields, confidence, "make", make, documentConfidence);
        FillMissingCompositeField(fields, confidence, "model", model, documentConfidence);
        consumed.Add(match);
    }

    private static void ApplyCompositeYear(
        IReadOnlyList<GoogleDocumentAiLayoutLine> lines,
        Dictionary<string, string?> fields,
        Dictionary<string, decimal> confidence,
        HashSet<GoogleDocumentAiLayoutLine> consumed,
        decimal documentConfidence)
    {
        var match = FindCompositeRelativeLine(lines, "JENIS BADAN", "TAHUN DIBUAT", consumed);
        if (match is null) return;
        var parts = match.Text.Split(['/', '|'], 2, StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        var year = parts.Length == 2 ? ValidateYear(parts[1]) : null;
        if (year is null || HasValue(fields, "year")) return;
        FillMissingCompositeField(fields, confidence, "year", year, documentConfidence);
        consumed.Add(match);
    }

    private static bool CanFillCompositePair(
        IReadOnlyDictionary<string, string?> fields,
        string firstField,
        string firstCandidate,
        string secondField,
        string secondCandidate) =>
        (!HasValue(fields, firstField) || string.Equals(fields[firstField]?.Trim(), firstCandidate, StringComparison.OrdinalIgnoreCase))
        && (!HasValue(fields, secondField) || string.Equals(fields[secondField]?.Trim(), secondCandidate, StringComparison.OrdinalIgnoreCase));

    private static bool IsCompositeTextEcho(string? existing, string make, string model)
    {
        if (string.IsNullOrWhiteSpace(existing)) return false;
        var normalized = existing.Trim();
        return normalized.StartsWith(make, StringComparison.OrdinalIgnoreCase)
            && normalized.Contains(model, StringComparison.OrdinalIgnoreCase)
            && (normalized.Contains('/') || normalized.Contains('|'));
    }

    private static bool HasValue(IReadOnlyDictionary<string, string?> fields, string field) =>
        fields.TryGetValue(field, out var value) && !string.IsNullOrWhiteSpace(value);

    private static void FillMissingCompositeField(
        Dictionary<string, string?> fields,
        Dictionary<string, decimal> confidence,
        string field,
        string value,
        decimal documentConfidence)
    {
        if (HasValue(fields, field)) return;
        fields[field] = value;
        confidence[field] = documentConfidence;
    }

    private static GoogleDocumentAiLayoutLine? FindCompositeRelativeLine(
        IReadOnlyList<GoogleDocumentAiLayoutLine> lines,
        string firstLabel,
        string secondLabel,
        HashSet<GoogleDocumentAiLayoutLine> consumed)
    {
        var label = FindCompositeLabel(lines, firstLabel, secondLabel);
        if (label is null) return null;
        return FindCompositeRelativeLineFromLabel(lines, label, consumed);
    }

    private static GoogleDocumentAiLayoutLine? FindCompositeRelativeLineFromLabel(
        IReadOnlyList<GoogleDocumentAiLayoutLine> lines,
        GoogleDocumentAiLayoutLine label,
        HashSet<GoogleDocumentAiLayoutLine> consumed)
    {
        return lines
            .Where(line => line.Page == label.Page && !ReferenceEquals(line, label) && !consumed.Contains(line) && !IsKnownLabel(line.Text))
            .Select(line => new { Line = line, Score = RelativeScore(label, line, lines) })
            .Where(candidate => candidate.Score is not null)
            .OrderBy(candidate => candidate.Score)
            .ThenBy(candidate => LineArea(candidate.Line))
            .Select(candidate => candidate.Line)
            .FirstOrDefault();
    }

    private static GoogleDocumentAiLayoutLine? FindCompositeLabel(
        IReadOnlyList<GoogleDocumentAiLayoutLine> lines,
        string firstLabel,
        string secondLabel) => lines
        .Where(line => NormalizeWords(line.Text).Contains(firstLabel, StringComparison.Ordinal)
            && NormalizeWords(line.Text).Contains(secondLabel, StringComparison.Ordinal))
        .OrderBy(LineArea)
        .FirstOrDefault();

    private static bool TrySplitIdentifierPair(string value, out string chassis, out string engine)
    {
        chassis = engine = "";
        var delimited = value.Split(['/', '|'], 2, StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        if (delimited.Length == 2)
        {
            chassis = ValidateIdentifier(delimited[0], 10) ?? "";
            engine = ValidateIdentifier(delimited[1], 5) ?? "";
            if (chassis.Length > 0 && engine.Length > 0) return true;
        }
        var tokens = Regex.Matches(value.ToUpperInvariant(), @"[A-Z0-9-]{5,32}")
            .Select(match => match.Value)
            .Where(token => ValidateIdentifier(token, 5) is not null)
            .ToList();
        if (tokens.Count != 2) return false;
        chassis = ValidateIdentifier(tokens[0], 10) ?? "";
        engine = ValidateIdentifier(tokens[1], 5) ?? "";
        return chassis.Length > 0 && engine.Length > 0;
    }

    public static string DiagnoseInlineIdentifierPair(string value) => ParseInlineIdentifierPair(value).Reason;

    private static IdentifierPairParseResult ParseInlineIdentifierPair(string value)
    {
        var labelsFirst = Regex.Match(
            value,
            @"^\s*(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b\s*[/|]\s*(?:NO\.?|NOMBOR)\s*ENJIN\b\s*[:#-]\s*(?<values>.+)$",
            RegexOptions.IgnoreCase);
        if (labelsFirst.Success)
        {
            var cells = labelsFirst.Groups["values"].Value.Split(['/', '|'], StringSplitOptions.TrimEntries);
            if (cells.Length != 2 || cells.Any(string.IsNullOrWhiteSpace))
                return new IdentifierPairParseResult(false, "", "", "labels-first-delimiter-count");
            var chassis = ValidateInlineIdentifier(cells[0], 10) ?? "";
            var engine = ValidateInlineIdentifier(cells[1], 5) ?? "";
            return chassis.Length > 0 && engine.Length > 0
                ? new IdentifierPairParseResult(true, chassis, engine, "mapped-labels-first-delimited")
                : new IdentifierPairParseResult(false, "", "", "labels-first-validation-failed");
        }

        var interleaved = Regex.Match(
            value,
            @"^\s*(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b\s*[:#-]?\s*(?<chassis>.+?)\s*[/|]?\s*\b(?:NO\.?|NOMBOR)\s*ENJIN\b\s*[:#-]?\s*(?<engine>.+)$",
            RegexOptions.IgnoreCase);
        if (!interleaved.Success) return new IdentifierPairParseResult(false, "", "", "label-pattern-not-matched");
        var interleavedChassis = ValidateInlineIdentifier(interleaved.Groups["chassis"].Value, 10) ?? "";
        var interleavedEngine = ValidateInlineIdentifier(interleaved.Groups["engine"].Value, 5) ?? "";
        return interleavedChassis.Length > 0 && interleavedEngine.Length > 0
            ? new IdentifierPairParseResult(true, interleavedChassis, interleavedEngine, "mapped-interleaved")
            : new IdentifierPairParseResult(false, "", "", "interleaved-validation-failed");
    }

    private static bool HasInlineIdentifierContent(string value)
    {
        var withoutLabels = Regex.Replace(
            value,
            @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS|ENJIN)\b",
            " ",
            RegexOptions.IgnoreCase);
        return !string.IsNullOrWhiteSpace(withoutLabels.Trim(' ', ':', '#', '-', '/', '|'));
    }

    private static string? ValidateInlineIdentifier(string value, int minimumLength)
    {
        var trimmed = value.Trim().Trim(':', '-', '/', '|').Trim();
        return Regex.IsMatch(trimmed, @"^[A-Z0-9-]+$", RegexOptions.IgnoreCase)
            ? ValidateIdentifier(trimmed, minimumLength)
            : null;
    }

    private static (string Value, GoogleDocumentAiLayoutLine Line)? FindRelativeValue(
        IReadOnlyList<GoogleDocumentAiLayoutLine> lines,
        FieldSpec spec,
        HashSet<GoogleDocumentAiLayoutLine> consumed)
    {
        var label = lines
            .Where(line => spec.Labels.Any(candidate => IsLabel(line.Text, candidate)))
            .OrderBy(LineArea)
            .FirstOrDefault();
        if (label is null) return null;

        var candidates = lines
            .Where(line => !ReferenceEquals(line, label)
                && line.Page == label.Page
                && !consumed.Contains(line)
                && !IsKnownLabel(line.Text))
            .Select(line => new { Line = line, Score = RelativeScore(label, line, lines) })
            .Where(candidate => candidate.Score is not null)
            .OrderBy(candidate => candidate.Score)
            .ThenBy(candidate => LineArea(candidate.Line));
        foreach (var candidate in candidates)
        {
            var validated = spec.Validate(candidate.Line.Text);
            if (validated is not null) return (validated, candidate.Line);
        }
        return null;
    }

    private static double? RelativeScore(
        GoogleDocumentAiLayoutLine label,
        GoogleDocumentAiLayoutLine candidate,
        IReadOnlyList<GoogleDocumentAiLayoutLine> lines)
    {
        var overlapY = Math.Max(0, Math.Min(label.Bottom, candidate.Bottom) - Math.Max(label.Top, candidate.Top));
        var minHeight = Math.Max(0.001, Math.Min(label.Bottom - label.Top, candidate.Bottom - candidate.Top));
        if (overlapY / minHeight >= 0.45
            && candidate.Left >= label.Right - 0.01
            && candidate.Left - label.Right <= 0.25
            && !lines.Any(other => IsInterveningRightLabel(label, candidate, other)))
            return Math.Max(0, candidate.Left - label.Right) * 10 + Math.Abs(CenterY(candidate) - CenterY(label));

        var overlapX = Math.Max(0, Math.Min(label.Right, candidate.Right) - Math.Max(label.Left, candidate.Left));
        var minWidth = Math.Max(0.001, Math.Min(label.Right - label.Left, candidate.Right - candidate.Left));
        var verticalGap = candidate.Top - label.Bottom;
        if (verticalGap >= -0.01 && verticalGap <= 0.12
            && (overlapX / minWidth >= 0.35 || Math.Abs(CenterX(candidate) - CenterX(label)) <= 0.08)
            && !lines.Any(other => IsInterveningBelowLabel(label, candidate, other)))
            return 1 + Math.Max(0, verticalGap) * 10 + Math.Abs(CenterX(candidate) - CenterX(label));
        return null;
    }

    private static bool IsInterveningRightLabel(
        GoogleDocumentAiLayoutLine label,
        GoogleDocumentAiLayoutLine candidate,
        GoogleDocumentAiLayoutLine other) =>
        other.Page == label.Page
        && !ReferenceEquals(other, label)
        && IsKnownLabel(other.Text)
        && CenterX(other) > CenterX(label)
        && CenterX(other) < CenterX(candidate)
        && CenterY(other) >= Math.Min(label.Top, candidate.Top) - 0.02
        && CenterY(other) <= Math.Max(label.Bottom, candidate.Bottom) + 0.02;

    private static bool IsInterveningBelowLabel(
        GoogleDocumentAiLayoutLine label,
        GoogleDocumentAiLayoutLine candidate,
        GoogleDocumentAiLayoutLine other) =>
        other.Page == label.Page
        && !ReferenceEquals(other, label)
        && IsKnownLabel(other.Text)
        && CenterY(other) > CenterY(label)
        && CenterY(other) < CenterY(candidate)
        && CenterX(other) >= Math.Min(label.Left, candidate.Left) - 0.05
        && CenterX(other) <= Math.Max(label.Right, candidate.Right) + 0.05;

    private static bool IsLabel(string text, string label)
    {
        var normalized = NormalizeWords(text);
        return normalized == label || normalized.StartsWith(label + " ", StringComparison.Ordinal);
    }

    private static bool IsKnownLabel(string text) => Fields.Any(spec => spec.Labels.Any(label => IsLabel(text, label)))
        || IsLabel(text, "KEUPAYAAN ENJIN")
        || IsLabel(text, "JENIS BADAN")
        || IsLabel(text, "TARIKH PENDAFTARAN");

    private static string NormalizeWords(string value) => Regex.Replace(value.ToUpperInvariant(), @"[^A-Z0-9]+", " ").Trim();

    private static string? ValidatePlate(string value)
    {
        var normalized = Regex.Replace(value.ToUpperInvariant(), @"[\s-]+", "");
        return Regex.IsMatch(normalized, @"^[A-Z]{1,3}[A-Z0-9]{1,8}$") && Regex.IsMatch(normalized, @"\d") ? normalized : null;
    }

    private static string? ValidateIdentifier(string value, int minimumLength)
    {
        const string monthName = "(?:JAN|JANUARY|JANUARI|FEB|FEBRUARY|FEBRUARI|MAC|MAR|MARCH|APR|APRIL|MEI|MAY|JUN|JUNE|JUL|JULY|JULAI|OGO|OGOS|AUG|AUGUST|SEP|SEPT|SEPTEMBER|OKT|OKTOBER|OCT|OCTOBER|NOV|NOVEMBER|DIS|DISEMBER|DEC|DECEMBER)";
        var normalized = Regex.Replace(value.ToUpperInvariant(), @"\s+", "").Trim(':', '-', '/', '|');
        return normalized.Length >= minimumLength
            && Regex.IsMatch(normalized, @"^[A-Z0-9-]{5,32}$")
            && !Regex.IsMatch(normalized, @"^\d{3,5}CC$")
            && !Regex.IsMatch(normalized, $@"^(?:\d{{1,2}}{monthName}\d{{2,4}}|\d{{4}}{monthName}\d{{1,2}})$")
            && Regex.IsMatch(normalized, @"[A-Z]")
            && Regex.IsMatch(normalized, @"\d") ? normalized : null;
    }

    private static string? ValidateDescription(string value)
    {
        var normalized = Regex.Replace(value.Trim(), @"\s+", " ");
        return normalized.Length is > 0 and <= 80
            && !IsKnownLabel(normalized)
            && !Regex.IsMatch(normalized, @"^(?:19|20)\d{2}$") ? normalized : null;
    }

    private static string? ValidateYear(string value)
    {
        var normalized = value.Trim();
        return Regex.IsMatch(normalized, @"^(?:19|20)\d{2}$")
            && int.TryParse(normalized, out var year)
            && year <= DateTime.UtcNow.Year + 1 ? normalized : null;
    }

    private static double LineArea(GoogleDocumentAiLayoutLine line) => Math.Max(0, line.Right - line.Left) * Math.Max(0, line.Bottom - line.Top);
    private static double CenterX(GoogleDocumentAiLayoutLine line) => (line.Left + line.Right) / 2;
    private static double CenterY(GoogleDocumentAiLayoutLine line) => (line.Top + line.Bottom) / 2;

    private static string WarningFieldName(string field) => field switch
    {
        "plateNumber" => "car plate",
        "chassisNumber" => "chassis number",
        "engineNumber" => "engine number",
        "make" => "vehicle make",
        "model" => "vehicle model",
        "year" => "manufacture year",
        _ => field
    };
}

public static class GoogleDocumentAiEntityMapper
{
    public static OcrExtractionResult Apply(OcrExtractionResult extraction, IReadOnlyList<GoogleDocumentAiEntity> entities)
    {
        var fields = new Dictionary<string, string?>(extraction.Fields, StringComparer.OrdinalIgnoreCase);
        var fieldConfidence = new Dictionary<string, decimal>(extraction.FieldConfidence, StringComparer.OrdinalIgnoreCase);

        ApplyFirst(entities, fields, fieldConfidence, "invoiceNumber", "invoice_id");
        ApplyFirst(entities, fields, fieldConfidence, "receiptNumber", "receipt_id", "expense_id");
        ApplyFirst(entities, fields, fieldConfidence, "supplierName", "supplier_name", "supplier_company_name");
        ApplyFirst(entities, fields, fieldConfidence, "supplierAddress", "supplier_address", "supplier_address/address");
        ApplyFirst(entities, fields, fieldConfidence, "supplierPhone", "supplier_phone", "supplier_phone_number");
        ApplyFirst(entities, fields, fieldConfidence, "supplierRegistrationNumber", "supplier_registration", "supplier_registration_number", "supplier_registration_no");
        ApplyFirst(entities, fields, fieldConfidence, "supplierTinNumber", "supplier_tax_id", "supplier_tin", "supplier_tax_identification_number");

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
            var directLineItems = entities
                .Where(entity => string.Equals(entity.Type, "line_item", StringComparison.OrdinalIgnoreCase))
                .ToList();
            var repairDetails = (directLineItems.Count > 0 ? directLineItems : entities
                .Where(entity => new[] { "line_item/description", "description" }.Contains(entity.Type, StringComparer.OrdinalIgnoreCase)))
                .Where(entity => !string.IsNullOrWhiteSpace(entity.Value))
                .ToList();
            var lineItems = repairDetails
                .Select(entity => OcrExtractionParser.ParseRepairLineItem(entity.Value, entity.Confidence, allowDescriptionOnly: true))
                .Where(item => item is not null)
                .Select(item => item!)
                .GroupBy(item => item.Description, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First())
                .ToList();
            return extraction with { Fields = fields, FieldConfidence = fieldConfidence, LineItems = lineItems };
        }

        if (extraction.DocumentCategory == FileCategory.IdentityCard)
        {
            var address = FindFirst(entities, "address", "address_line", "residential_address");
            var normalizedAddress = address is null ? null : OcrExtractionParser.NormalizeIdentityCardAddress(address.Value.Value);
            if (!string.IsNullOrWhiteSpace(normalizedAddress) && address is not null)
            {
                fields["address"] = normalizedAddress;
                fieldConfidence["address"] = address.Value.Confidence;
            }
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
            var jpjVoc = FindJpjVocFields(text);
            if (jpjVoc.IsDetected)
            {
                // JPJ extracts label columns separately from their values. Do not
                // let generic English-label fallbacks turn an unreadable JPJ value
                // into a plausible-but-wrong draft; staff must review missing data.
                fields["plateNumber"] = jpjVoc.PlateNumber;
                fields["chassisNumber"] = jpjVoc.ChassisNumber;
                fields["engineNumber"] = jpjVoc.EngineNumber;
                fields["make"] = jpjVoc.Make;
                fields["model"] = jpjVoc.Model;
                fields["year"] = jpjVoc.Year;
            }
            else
            {
                fields["plateNumber"] = FindValue(text, "registration", "plate") ?? fields["plateNumber"];
                fields["chassisNumber"] = FindValue(text, "chassis", "vin");
                fields["engineNumber"] = FindValue(text, "engine");
                fields["make"] = FindLabeledText(text, "make");
                fields["model"] = FindLabeledText(text, "model");
                fields["year"] = FindVehicleYear(text);
            }
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

    private sealed record JpjVocFields(
        bool IsDetected,
        string? PlateNumber,
        string? ChassisNumber,
        string? EngineNumber,
        string? Make,
        string? Model,
        string? Year);

    private static JpjVocFields FindJpjVocFields(string text)
    {
        var lines = TextLines(text);
        var plateLabelIndex = lines.FindIndex(line => Regex.IsMatch(line, @"\b(?:NO\.?|NOMBOR)\s*PENDAFTARAN\b", RegexOptions.IgnoreCase));
        var chassisEngineLabelIndex = lines.FindIndex(line => Regex.IsMatch(line, @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b\s*/?\s*\b(?:NO\.?|NOMBOR)\s*ENJIN\b", RegexOptions.IgnoreCase));
        var interleavedIdentifiers = FindJpjInterleavedIdentifierPair(lines);
        var makeModelLabelIndex = lines.FindIndex(line => Regex.IsMatch(line, @"\bBUATAN\b\s*/?\s*\bNAMA\s+MODEL\b", RegexOptions.IgnoreCase));
        var chassisLabelIndex = lines.FindIndex(line =>
            Regex.IsMatch(line, @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b", RegexOptions.IgnoreCase) &&
            !Regex.IsMatch(line, @"\b(?:NO\.?|NOMBOR)\s*ENJIN\b", RegexOptions.IgnoreCase));
        var engineLabelIndex = lines.FindIndex(line =>
            Regex.IsMatch(line, @"\b(?:NO\.?|NOMBOR)\s*ENJIN\b", RegexOptions.IgnoreCase) &&
            !Regex.IsMatch(line, @"\b(?:CHASIS|CHASSIS|CASIS)\b", RegexOptions.IgnoreCase));
        var makeLabelIndex = lines.FindIndex(line =>
            Regex.IsMatch(line, @"\bBUATAN\b", RegexOptions.IgnoreCase) &&
            !Regex.IsMatch(line, @"\bNAMA\s+MODEL\b", RegexOptions.IgnoreCase));
        var modelLabelIndex = lines.FindIndex(line =>
            Regex.IsMatch(line, @"\bNAMA\s+MODEL\b", RegexOptions.IgnoreCase) &&
            !Regex.IsMatch(line, @"\bBUATAN\b", RegexOptions.IgnoreCase));
        if (plateLabelIndex < 0 ||
            (chassisEngineLabelIndex < 0 && interleavedIdentifiers is null && (chassisLabelIndex < 0 || engineLabelIndex < 0)) ||
            (makeModelLabelIndex < 0 && (makeLabelIndex < 0 || modelLabelIndex < 0)))
        {
            return new JpjVocFields(false, null, null, null, null, null, null);
        }

        var plateNumber = FindJpjLabeledPlate(lines[plateLabelIndex])
            ?? (plateLabelIndex > 0 ? FindJpjPlateNumber(lines[plateLabelIndex - 1]) : null)
            ?? (plateLabelIndex + 1 < lines.Count ? FindJpjPlateNumber(lines[plateLabelIndex + 1]) : null);
        var labeledIdentifiers = chassisEngineLabelIndex >= 0
            ? FindJpjLabeledIdentifierPair(lines[chassisEngineLabelIndex])
            : null;
        var (chassisNumber, engineNumber, identifierPairIndex) = interleavedIdentifiers is not null
            ? interleavedIdentifiers.Value
            : labeledIdentifiers is not null
                ? (labeledIdentifiers.Value.ChassisNumber, labeledIdentifiers.Value.EngineNumber, chassisEngineLabelIndex)
                : FindJpjIdentifierPair(lines, chassisEngineLabelIndex);
        chassisNumber ??= FindJpjStandaloneIdentifier(
            lines,
            chassisLabelIndex,
            @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b",
            minimumLength: 10);
        engineNumber ??= FindJpjStandaloneIdentifier(
            lines,
            engineLabelIndex,
            @"\b(?:NO\.?|NOMBOR)\s*ENJIN\b",
            minimumLength: 5);
        string? make = null;
        string? model = null;
        var labeledMakeModel = makeModelLabelIndex >= 0
            ? FindJpjLabeledMakeModel(lines[makeModelLabelIndex])
            : null;
        if (labeledMakeModel is not null)
        {
            (make, model) = labeledMakeModel.Value;
        }
        else if (identifierPairIndex >= 0)
        {
            (make, model) = FindJpjMakeModelPair(lines, Math.Max(identifierPairIndex, makeModelLabelIndex));
        }
        make ??= FindJpjStandaloneVehicleText(lines, makeLabelIndex, @"\bBUATAN\b");
        model ??= FindJpjStandaloneVehicleText(lines, modelLabelIndex, @"\bNAMA\s+MODEL\b");
        var year = FindJpjYear(lines);
        return new JpjVocFields(true, plateNumber, chassisNumber, engineNumber, make, model, year);
    }

    private static string? FindJpjStandaloneIdentifier(
        IReadOnlyList<string> lines,
        int labelIndex,
        string labelPattern,
        int minimumLength)
    {
        var value = FindJpjFieldValue(lines, labelIndex, labelPattern);
        if (value is null) return null;
        var identifier = NormalizeJpjIdentifier(value);
        return Regex.IsMatch(identifier, $@"^[A-Z0-9-]{{{minimumLength},32}}$", RegexOptions.IgnoreCase) &&
               Regex.IsMatch(identifier, @"[A-Z]", RegexOptions.IgnoreCase) &&
               Regex.IsMatch(identifier, @"\d")
            ? identifier
            : null;
    }

    private static string? FindJpjStandaloneVehicleText(
        IReadOnlyList<string> lines,
        int labelIndex,
        string labelPattern)
    {
        var value = FindJpjFieldValue(lines, labelIndex, labelPattern);
        return value is not null && IsJpjVehicleText(value) ? value : null;
    }

    private static string? FindJpjFieldValue(
        IReadOnlyList<string> lines,
        int labelIndex,
        string labelPattern)
    {
        if (labelIndex < 0 || labelIndex >= lines.Count) return null;

        var labelMatch = Regex.Match(lines[labelIndex], labelPattern, RegexOptions.IgnoreCase);
        if (labelMatch.Success)
        {
            var sameRowValue = TrimJpjValuePrefix(lines[labelIndex][(labelMatch.Index + labelMatch.Length)..]);
            if (!string.IsNullOrWhiteSpace(sameRowValue) && !IsJpjLabelLine(sameRowValue))
            {
                return sameRowValue;
            }
        }

        return FindJpjNextRowValue(lines, labelIndex) ?? FindJpjColumnValue(lines, labelIndex);
    }

    private static string? FindJpjNextRowValue(IReadOnlyList<string> lines, int labelIndex)
    {
        if (labelIndex < 0 || labelIndex + 1 >= lines.Count) return null;
        var candidate = TrimJpjValuePrefix(lines[labelIndex + 1]);
        return IsJpjLabelLine(candidate) ? null : candidate;
    }

    private static string? FindJpjColumnValue(IReadOnlyList<string> lines, int labelIndex)
    {
        if (labelIndex < 0 || labelIndex + 1 >= lines.Count || !IsJpjLabelLine(lines[labelIndex + 1])) return null;

        var labelBlockStart = labelIndex;
        while (labelBlockStart > 0 && IsJpjLabelLine(lines[labelBlockStart - 1])) labelBlockStart--;

        var labelBlockEnd = labelIndex;
        while (labelBlockEnd + 1 < lines.Count && IsJpjLabelLine(lines[labelBlockEnd + 1])) labelBlockEnd++;

        var vehicleLabelPatterns = new[]
        {
            JpjLabelOnlyPattern("BUATAN"),
            JpjLabelOnlyPattern(@"NAMA\s+MODEL"),
            JpjLabelOnlyPattern(@"JENIS\s+BADAN"),
            JpjLabelOnlyPattern(@"TAHUN\s+DIBUAT"),
            JpjLabelOnlyPattern(@"TARIKH\s+PENDAFTARAN")
        };
        var labelPatterns = labelBlockEnd - labelBlockStart + 1 == vehicleLabelPatterns.Length + 1
            ? new[] { JpjLabelOnlyPattern(@"KEUPAYAAN\s+ENJIN") }.Concat(vehicleLabelPatterns).ToArray()
            : vehicleLabelPatterns;
        if (labelBlockEnd - labelBlockStart + 1 != labelPatterns.Length) return null;
        for (var offset = 0; offset < labelPatterns.Length; offset++)
        {
            if (!Regex.IsMatch(lines[labelBlockStart + offset], labelPatterns[offset], RegexOptions.IgnoreCase)) return null;
        }

        var valueBlockStart = labelBlockEnd + 1;
        if (valueBlockStart + labelPatterns.Length > lines.Count) return null;
        var values = Enumerable.Range(valueBlockStart, labelPatterns.Length)
            .Select(index => TrimJpjValuePrefix(lines[index]))
            .ToArray();
        var yearOffset = Array.FindIndex(labelPatterns, pattern => pattern.Contains("TAHUN", StringComparison.Ordinal));
        var registrationDateOffset = Array.FindIndex(labelPatterns, pattern => pattern.Contains("TARIKH", StringComparison.Ordinal));
        if (values.Any(value => IsJpjLabelLine(value)) ||
            yearOffset < 0 || registrationDateOffset < 0 ||
            !Regex.IsMatch(values[yearOffset], @"^(?:19|20)\d{2}$") ||
            !Regex.IsMatch(values[registrationDateOffset], @"^(?:\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2}|(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2})$"))
        {
            return null;
        }

        return values[labelIndex - labelBlockStart];
    }

    private static bool IsJpjLabelLine(string value) =>
        Regex.IsMatch(value, @"\b(?:NO\.?|NOMBOR)\s*(?:PENDAFTARAN|CHASIS|CHASSIS|CASIS|ENJIN)\b|\b(?:KEUPAYAAN\s+ENJIN|BUATAN|NAMA\s+MODEL|JENIS\s+BADAN|TAHUN\s+DIBUAT|TARIKH\s+PENDAFTARAN)\b", RegexOptions.IgnoreCase);

    private static string JpjLabelOnlyPattern(string labelPattern) => $@"^\s*{labelPattern}\s*[:|/-]?\s*$";

    private static (string? ChassisNumber, string? EngineNumber, int Index) FindJpjIdentifierPair(IReadOnlyList<string> lines, int startIndex)
    {
        for (var index = startIndex + 1; index < lines.Count && index <= startIndex + 6; index++)
        {
            if (TrySplitJpjPair(lines[index], out var left, out var right) &&
                TryValidateJpjIdentifierPair(left, right, out var chassisNumber, out var engineNumber))
                return (chassisNumber, engineNumber, index);

            if (startIndex >= 0 && index == startIndex + 1 &&
                TrySplitJpjIdentifierTokens(lines[index], out left, out right) &&
                TryValidateJpjIdentifierPair(left, right, out chassisNumber, out engineNumber))
                return (chassisNumber, engineNumber, index);
        }

        return (null, null, -1);
    }

    private static bool TryValidateJpjIdentifierPair(
        string left,
        string right,
        out string chassisNumber,
        out string engineNumber)
    {
        chassisNumber = NormalizeJpjIdentifier(left);
        engineNumber = NormalizeJpjIdentifier(right);
        return Regex.IsMatch(chassisNumber, @"^[A-Z0-9-]{10,32}$", RegexOptions.IgnoreCase) &&
               Regex.IsMatch(engineNumber, @"^[A-Z0-9-]{5,32}$", RegexOptions.IgnoreCase) &&
               Regex.IsMatch(chassisNumber, @"[A-Z]", RegexOptions.IgnoreCase) &&
               Regex.IsMatch(chassisNumber, @"\d") &&
               Regex.IsMatch(engineNumber, @"[A-Z]", RegexOptions.IgnoreCase) &&
               Regex.IsMatch(engineNumber, @"\d");
    }

    private static bool TrySplitJpjIdentifierTokens(string line, out string left, out string right)
    {
        var candidates = Regex.Matches(line, @"(?<![\p{L}\p{N}-])[A-Z0-9-]{5,32}(?![\p{L}\p{N}-])", RegexOptions.IgnoreCase)
            .Select(match => match.Value)
            .Where(candidate => Regex.IsMatch(candidate, @"[A-Z]", RegexOptions.IgnoreCase) && Regex.IsMatch(candidate, @"\d"))
            .ToArray();
        if (candidates.Length == 2)
        {
            left = candidates[0];
            right = candidates[1];
            return true;
        }

        left = string.Empty;
        right = string.Empty;
        return false;
    }

    private static (string? Make, string? Model) FindJpjMakeModelPair(IReadOnlyList<string> lines, int startIndex)
    {
        for (var index = startIndex + 1; index < lines.Count && index <= startIndex + 3; index++)
        {
            if (TrySplitJpjPair(lines[index], out var left, out var right))
            {
                var make = TrimJpjValuePrefix(left);
                var model = TrimJpjValuePrefix(right);
                if (IsJpjVehicleText(make) && IsJpjVehicleText(model))
                {
                    return (make, model);
                }
            }

            if (TrySplitJpjMakeModelByCatalog(lines[index], out var catalogMake, out var catalogModel))
            {
                return (catalogMake, catalogModel);
            }
        }

        return (null, null);
    }

    private static string? FindJpjYear(IReadOnlyList<string> lines)
    {
        var yearLabelIndex = lines.ToList().FindIndex(line => Regex.IsMatch(line, @"\bTAHUN\s+DIBUAT\b", RegexOptions.IgnoreCase));
        var yearValue = FindJpjFieldValue(lines, yearLabelIndex, @"\bTAHUN\s+DIBUAT\b");
        if (yearValue is not null)
        {
            var fieldYear = Regex.Match(yearValue, @"\b(?<year>(?:19|20)\d{2})\b");
            if (fieldYear.Success) return fieldYear.Groups["year"].Value;
        }
        if (yearLabelIndex >= 0 &&
            Regex.IsMatch(lines[yearLabelIndex], JpjLabelOnlyPattern(@"TAHUN\s+DIBUAT"), RegexOptions.IgnoreCase) &&
            yearLabelIndex + 1 < lines.Count &&
            IsJpjLabelLine(lines[yearLabelIndex + 1]))
        {
            return null;
        }

        var bodyYearLabelIndex = -1;
        for (var index = 0; index < lines.Count; index++)
        {
            if (Regex.IsMatch(lines[index], @"\bJENIS\s+BADAN\b", RegexOptions.IgnoreCase))
            {
                bodyYearLabelIndex = index;
                break;
            }
        }

        if (bodyYearLabelIndex < 0) return null;

        for (var index = bodyYearLabelIndex; index < lines.Count && index <= bodyYearLabelIndex + 5; index++)
        {
            var line = lines[index];
            var labeledYear = Regex.Match(line, @"\bJENIS\s+BADAN\b\s*/?\s*\bTAHUN\s+DIBUAT\b\s*:?\s*[^/\r\n]+/\s*(?<year>(?:19|20)\d{2})\b", RegexOptions.IgnoreCase);
            if (labeledYear.Success) return labeledYear.Groups["year"].Value;
            if (Regex.IsMatch(line, @"\bTARIKH\s+PENDAFTARAN\b", RegexOptions.IgnoreCase) ||
                Regex.IsMatch(line, @"\b(?:\d{1,2}[-/.]\d{1,2}[-/.](?:19|20)\d{2}|(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b")) continue;
            var year = Regex.Match(line, @"\b(?<year>(?:19|20)\d{2})\b");
            if (year.Success) return year.Groups["year"].Value;
        }

        return null;
    }

    private static bool TrySplitJpjPair(string line, out string left, out string right)
    {
        var values = line.Split('/', StringSplitOptions.TrimEntries);
        if (values.Length == 2)
        {
            left = values[0];
            right = values[1];
            return !string.IsNullOrWhiteSpace(left) && !string.IsNullOrWhiteSpace(right);
        }

        left = string.Empty;
        right = string.Empty;
        return false;
    }

    private static string NormalizeJpjIdentifier(string value) =>
        Regex.Replace(TrimJpjValuePrefix(value), @"\s+", string.Empty).ToUpperInvariant();

    private static string? FindJpjPlateNumber(string value)
    {
        var match = Regex.Match(value, @"^\s*:?\s*(?<plate>[A-Z]{1,3}\s?\d{1,4}(?:[A-Z](?=\s|$))?)", RegexOptions.IgnoreCase);
        return match.Success
            ? match.Groups["plate"].Value.Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant()
            : null;
    }

    private static string? FindJpjLabeledPlate(string line)
    {
        var match = Regex.Match(line, @"\b(?:NO\.?|NOMBOR)\s*PENDAFTARAN\b\s*:?\s*(?<plate>[A-Z]{1,3}\s?\d{1,4}(?:[A-Z])?)\b", RegexOptions.IgnoreCase);
        return match.Success
            ? match.Groups["plate"].Value.Replace(" ", string.Empty, StringComparison.Ordinal).ToUpperInvariant()
            : null;
    }

    private static (string ChassisNumber, string EngineNumber)? FindJpjLabeledIdentifierPair(string line)
    {
        var match = Regex.Match(
            line,
            @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b\s*/?\s*\b(?:NO\.?|NOMBOR)\s*ENJIN\b\s*:?\s*(?<chassis>[A-Z0-9-]{10,32})\s*/\s*(?<engine>[A-Z0-9-]{5,32})\b",
            RegexOptions.IgnoreCase);
        return match.Success
            ? (NormalizeJpjIdentifier(match.Groups["chassis"].Value), NormalizeJpjIdentifier(match.Groups["engine"].Value))
            : null;
    }

    private static (string ChassisNumber, string EngineNumber, int Index)? FindJpjInterleavedIdentifierPair(IReadOnlyList<string> lines)
    {
        for (var index = 0; index < lines.Count; index++)
        {
            var match = Regex.Match(
                lines[index],
                @"\b(?:NO\.?|NOMBOR)\s*(?:CHASIS|CHASSIS|CASIS)\b\s*[:#-]?\s*(?<chassis>[A-Z0-9-]{10,32})\s*/?\s*\b(?:NO\.?|NOMBOR)\s*ENJIN\b\s*[:#-]?\s*(?<engine>[A-Z0-9-]{5,32})\b",
                RegexOptions.IgnoreCase);
            if (!match.Success) continue;

            var chassisNumber = NormalizeJpjIdentifier(match.Groups["chassis"].Value);
            var engineNumber = NormalizeJpjIdentifier(match.Groups["engine"].Value);
            if (Regex.IsMatch(chassisNumber, @"[A-Z]", RegexOptions.IgnoreCase) &&
                Regex.IsMatch(chassisNumber, @"\d") &&
                Regex.IsMatch(engineNumber, @"[A-Z]", RegexOptions.IgnoreCase) &&
                Regex.IsMatch(engineNumber, @"\d"))
            {
                return (chassisNumber, engineNumber, index);
            }
        }

        return null;
    }

    private static (string Make, string Model)? FindJpjLabeledMakeModel(string line)
    {
        var match = Regex.Match(
            line,
            @"\bBUATAN\b\s*/?\s*\bNAMA\s+MODEL\b\s*:?\s*(?<make>[A-Z][A-Z0-9 .&()'-]{1,30}?)\s*/\s*(?<model>[A-Z0-9][A-Z0-9 .&()'/-]{0,60})$",
            RegexOptions.IgnoreCase);
        if (!match.Success) return null;
        var make = match.Groups["make"].Value.Trim();
        var model = match.Groups["model"].Value.Trim();
        return IsJpjVehicleText(make) && IsJpjVehicleText(model) ? (make, model) : null;
    }

    private static bool TrySplitJpjMakeModelByCatalog(string line, out string make, out string model)
    {
        var value = TrimJpjValuePrefix(line);
        foreach (var catalogMake in MalaysiaVehicleCatalog.Models
                     .Select(item => item.Make)
                     .Distinct(StringComparer.OrdinalIgnoreCase)
                     .OrderByDescending(item => item.Length))
        {
            if (!value.StartsWith(catalogMake, StringComparison.OrdinalIgnoreCase) ||
                value.Length <= catalogMake.Length ||
                !char.IsWhiteSpace(value[catalogMake.Length])) continue;

            var candidateModel = value[catalogMake.Length..].Trim();
            if (!IsJpjVehicleText(candidateModel)) continue;

            make = catalogMake;
            model = candidateModel;
            return true;
        }

        make = string.Empty;
        model = string.Empty;
        return false;
    }

    private static string TrimJpjValuePrefix(string value) =>
        value.Trim().TrimStart(':', '-', '/', '|').Trim();

    private static bool IsJpjVehicleText(string value) =>
        Regex.IsMatch(value.Trim(), @"^[\p{L}\p{N}][\p{L}\p{N} .&()'/-]{0,60}$") &&
        !Regex.IsMatch(value, @"\b(?:NO\.?|BUATAN|NAMA\s+MODEL|JENIS\s+BADAN|TAHUN\s+DIBUAT)\b", RegexOptions.IgnoreCase);

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
        if (match.Success)
        {
            var labeledAddress = NormalizeIdentityCardAddress(match.Groups["value"].Value);
            if (!string.IsNullOrWhiteSpace(labeledAddress)) return labeledAddress;
        }

        // MyKad has no Address label; collect the address block until the card's
        // trailing nationality/gender lines. Keep multiple OCR lines together.
        var lines = TextLines(text);
        var addressStart = lines.FindIndex(line => Regex.IsMatch(line, @"(?:^|\s)NO\.?\s*\d{1,4}\b", RegexOptions.IgnoreCase));
        var addressLines = (addressStart < 0 ? Enumerable.Empty<string>() : lines.Skip(addressStart))
            .TakeWhile(line => !Regex.IsMatch(line, @"^(WARGANEGARA|LELAKI|PEREMPUAN|ISLAM|MALAYSIA)\b", RegexOptions.IgnoreCase))
            .Where(line => !IsIdentityCardNumberOnlyOrPrefixed(line))
            .Where(line => Regex.IsMatch(line, @"\d|JALAN|TAMAN|LORONG|KG\.?|BANDAR|KAMPUNG|JOHOR|SELANGOR|KEDAH|PERAK|PENANG|MELAKA|SABAH|SARAWAK", RegexOptions.IgnoreCase))
            .Select(line => Regex.Replace(line, @"^.*?(?=\bNO\.?\s*\d{1,4}\b)", "", RegexOptions.IgnoreCase))
            .ToList();
        if (addressLines.Count > 0) return string.Join(" ", addressLines);

        // Some rural MyKad addresses begin with a locality marker instead of a
        // house number. Only accept this form when it still carries both a
        // Malaysian postcode and state, so names or headings cannot become an address.
        var localityAddressStart = lines.FindIndex(line => Regex.IsMatch(line, @"^(?:GDW\s+)?(?:JALAN|LORONG|TAMAN|KAMPUNG|KG\.?|BANDAR)\b", RegexOptions.IgnoreCase));
        var localityAddressLines = (localityAddressStart < 0 ? Enumerable.Empty<string>() : lines.Skip(localityAddressStart))
            .TakeWhile(line => !Regex.IsMatch(line, @"^(WARGANEGARA|LELAKI|PEREMPUAN|ISLAM|MALAYSIA)\b", RegexOptions.IgnoreCase))
            .Where(line => !IsIdentityCardNumberOnlyOrPrefixed(line))
            .Where(line => Regex.IsMatch(line, @"\d|JALAN|TAMAN|LORONG|KG\.?|BANDAR|KAMPUNG|JOHOR|SELANGOR|KEDAH|PERAK|PENANG|MELAKA|SABAH|SARAWAK", RegexOptions.IgnoreCase))
            .ToList();
        if (localityAddressLines.Any(line => Regex.IsMatch(line, @"\b\d{5}\b")) &&
            localityAddressLines.Any(line => Regex.IsMatch(line, @"\b(?:JOHOR|SELANGOR|KEDAH|PERAK|PENANG|MELAKA|SABAH|SARAWAK)\b", RegexOptions.IgnoreCase)))
        {
            return string.Join(" ", localityAddressLines);
        }

        // The same card may arrive as a single line, so recognise the common
        // Malaysian address form without requiring an Address label or line breaks.
        var flattenedMatch = Regex.Match(
            text,
            @"\b(?:NO\.?\s*)?\d{1,4}[A-Z]?(?:\s*,?\s*(?:JALAN|LORONG|TAMAN|KAMPUNG|KG\.?|BANDAR)\s+[A-Z0-9 ./'-]+?){1,4}\s+\d{5}\s+(?:JOHOR|SELANGOR|KEDAH|PERAK|PULAU PINANG|MELAKA|NEGERI SEMBILAN|PAHANG|TERENGGANU|KELANTAN|PERLIS|SABAH|SARAWAK)\b",
            RegexOptions.IgnoreCase);
        return flattenedMatch.Success ? Regex.Replace(flattenedMatch.Value, @"\s+", " ").Trim() : null;
    }

    public static string? NormalizeIdentityCardAddress(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var normalized = Regex.Replace(value.Trim(), @"\s+", " ");
        var withoutIdentityLabel = Regex.Replace(
            normalized,
            @"^(?:(?:(?:MYKAD|KAD\s+PENGENALAN)\s+)?(?:(?:IC|NRIC)(?:\s*NO\.?)?|NO\.?)\s*[:#-]?\s*(?=\d{6}[-\s]?\d{2})|(?:MYKAD|KAD\s+PENGENALAN)\s*[:#-]?\s*)",
            "",
            RegexOptions.IgnoreCase);
        if (IsIdentityCardNumberOnly(withoutIdentityLabel)) return null;

        var withoutIdentityHeader = Regex.Replace(
            withoutIdentityLabel,
            @"^\d{6}(?:-|\s)?\d{2}(?:-|\s)?\d{4}\s+(?=(?:NO\.?\s*)?\d{1,4}[A-Z]?\b|JALAN\b|LORONG\b|TAMAN\b|KAMPUNG\b|KG\.?\b|BANDAR\b|POS\b)",
            "",
            RegexOptions.IgnoreCase);
        return IsIdentityCardNumberOnly(withoutIdentityHeader) ? null : withoutIdentityHeader;
    }

    private static bool IsIdentityCardNumberOnly(string value) =>
        Regex.IsMatch(value.Trim(), @"^\d{6}(?:-|\s)?\d{2}(?:-|\s)?\d{4}$");

    private static bool IsIdentityCardNumberOnlyOrPrefixed(string value) =>
        IsIdentityCardNumberOnly(value) || string.IsNullOrWhiteSpace(NormalizeIdentityCardAddress(value));

    private static List<string> TextLines(string text) => text
        .Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
        .Select(line => Regex.Replace(line.Trim(), @"\s+", " "))
        .Where(line => line.Length > 0)
        .ToList();

    private static bool IsMyKadHeader(string text) =>
        Regex.IsMatch(text, @"\b(KAD|PENGENALAN|IDENTITY\s+CARD|MALAYSIA|WARGANEGARA|LELAKI|PEREMPUAN|ISLAM)\b", RegexOptions.IgnoreCase) ||
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

    public static OcrLineItem? ParseRepairLineItem(string rawLine, decimal confidence, bool allowDescriptionOnly = false)
    {
        var line = Regex.Replace(rawLine.Replace("\\.", ".", StringComparison.Ordinal).Trim(), @"\s+", " ");
        if (string.IsNullOrWhiteSpace(line) || IsIgnoredRepairLine(line)) return null;

        // Values are intentionally captured from one printed row. Pairing the
        // last amounts or units found anywhere on a receipt can assign one
        // item's RM 130 to a later item's RM 7.50.
        var structured = Regex.Match(
            line,
            @"^(?<description>.+?)\s+(?<quantity>\d+(?:\.\d+)?)\s+(?<unit>[A-Za-z]{1,12})\s+(?:RM\s*)?(?<unitPrice>\d{1,6}(?:,\d{3})*\.\d{2})\s+(?:RM\s*)?(?<amount>\d{1,6}(?:,\d{3})*\.\d{2})$",
            RegexOptions.IgnoreCase);
        if (structured.Success)
        {
            return new OcrLineItem(
                structured.Groups["description"].Value.Trim(),
                structured.Groups["quantity"].Value,
                NormalizeMoney(structured.Groups["unitPrice"].Value),
                NormalizeMoney(structured.Groups["amount"].Value),
                confidence,
                rawLine,
                structured.Groups["unit"].Value.ToUpperInvariant());
        }

        var structuredWithoutUnit = Regex.Match(
            line,
            @"^(?<description>.+?)\s+(?<quantity>\d+(?:\.\d+)?)\s+(?:RM\s*)?(?<unitPrice>\d{1,6}(?:,\d{3})*\.\d{2})\s+(?:RM\s*)?(?<amount>\d{1,6}(?:,\d{3})*\.\d{2})$",
            RegexOptions.IgnoreCase);
        if (structuredWithoutUnit.Success)
        {
            return new OcrLineItem(
                structuredWithoutUnit.Groups["description"].Value.Trim(),
                structuredWithoutUnit.Groups["quantity"].Value,
                NormalizeMoney(structuredWithoutUnit.Groups["unitPrice"].Value),
                NormalizeMoney(structuredWithoutUnit.Groups["amount"].Value),
                confidence,
                rawLine);
        }

        var numbered = Regex.Match(line, @"^\d+[.)]\s*(?<description>[A-Za-z][^\r\n]{2,120}?)\s*$");
        if (numbered.Success)
        {
            var description = numbered.Groups["description"].Value.Trim();
            if (IsIgnoredRepairLine(description)) return null;
            var quantityAndAmount = Regex.Match(
                description,
                @"^(?<description>.+?)\s+qty\s*(?<quantity>\d+(?:\.\d+)?)\s+(?:RM\s*)?(?<amount>\d{1,6}(?:,\d{3})*(?:\.\d{1,2})?)$",
                RegexOptions.IgnoreCase);
            if (quantityAndAmount.Success)
            {
                return new OcrLineItem(
                    quantityAndAmount.Groups["description"].Value.Trim(),
                    quantityAndAmount.Groups["quantity"].Value,
                    null,
                    NormalizeMoney(quantityAndAmount.Groups["amount"].Value),
                    confidence,
                    rawLine);
            }

            return new OcrLineItem(description, null, null, null, confidence, rawLine);
        }

        return allowDescriptionOnly
            ? new OcrLineItem(line, null, null, null, confidence, rawLine)
            : null;
    }

    private static IReadOnlyList<OcrLineItem> ParseRepairLineItems(string text, decimal confidence)
    {
        var items = new List<OcrLineItem>();
        foreach (var line in TextLines(text))
        {
            if (Regex.IsMatch(line, @"^(?:notes?|b/f pages total|page total|total)\b", RegexOptions.IgnoreCase)) break;
            var item = ParseRepairLineItem(line, confidence);
            if (item is not null) items.Add(item);
        }
        if (items.Count == 0)
        {
            var flattened = Regex.Replace(text.Replace("\\.", ".", StringComparison.Ordinal), @"\s+", " ");
            foreach (Match match in Regex.Matches(flattened, @"(?:^|\s)(?<number>\d+)[.)]\s+(?<description>.+?)(?=\s+\d+[.)]\s+|\s+(?:Notes?|B/F Pages Total|Page Total|Total)\b|$)", RegexOptions.IgnoreCase))
            {
                var item = ParseRepairLineItem($"{match.Groups["number"].Value}. {match.Groups["description"].Value}", confidence);
                if (item is not null) items.Add(item);
            }
        }

        return items;
    }

    private static bool IsIgnoredRepairLine(string value) =>
        Regex.IsMatch(value, @"^(?:notes?|b/f pages total|page total|total|all cheques|cheques should|authorised signature)\b", RegexOptions.IgnoreCase);

    private static string NormalizeMoney(string value) => value.Replace(",", "", StringComparison.Ordinal);

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
