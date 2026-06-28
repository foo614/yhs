using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Options;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed class AutoCountAotgOptions
{
    public string? Endpoint { get; init; }
    public string? ApiToken { get; init; }
    public string? CompanyCode { get; init; }
    public string? AccountBookId { get; init; }
    public string CreateSalesInvoicePath { get; init; } = "/api/public/v1/ARInvoice/CreateARInvoice";
}

public sealed record FinanceInvoiceResponse(
    Guid Id,
    Guid PaymentRecordId,
    Guid VehicleId,
    Guid CustomerId,
    string InvoiceNumber,
    DateOnly InvoiceDate,
    decimal Amount,
    decimal SalesPrice,
    decimal InterestAdditionalCharges,
    decimal NcdAmount,
    decimal WindscreenCharges,
    string ContentMimeType,
    string CreatedBy,
    DateTime CreatedAt,
    AutoCountSyncJobResponse? LatestSync);

public sealed record AutoCountSyncJobResponse(
    Guid Id,
    Guid FinanceInvoiceId,
    Guid PaymentRecordId,
    AutoCountSyncStatus Status,
    string? ExternalDocumentId,
    string? ExternalDocumentNumber,
    string? ResponseSummary,
    string? LastError,
    int RetryCount,
    string? SubmittedBy,
    DateTime? SubmittedAt,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public sealed record AutoCountSubmitResult(
    AutoCountSyncStatus Status,
    string? ExternalDocumentId,
    string? ExternalDocumentNumber,
    string? ResponseSummary,
    string? Error);

public interface IAutoCountClient
{
    Task<AutoCountSubmitResult> SubmitSalesInvoiceAsync(
        FinanceInvoice invoice,
        PaymentRecord payment,
        Vehicle vehicle,
        Customer customer,
        CancellationToken cancellationToken);
}

public sealed class AutoCountAotgClient(HttpClient httpClient, IOptions<AutoCountAotgOptions> options) : IAutoCountClient
{
    private static readonly Regex SensitiveJsonValue = new(
        "(\"(?:api[_-]?token|access[_-]?token|token|authorization|password|secret|client[_-]?secret)\"\\s*:\\s*\")[^\"]*(\")",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex BearerValue = new(
        "\\b(Bearer\\s+)[A-Za-z0-9._\\-+/=]+",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private readonly AutoCountAotgOptions settings = options.Value;

    public async Task<AutoCountSubmitResult> SubmitSalesInvoiceAsync(
        FinanceInvoice invoice,
        PaymentRecord payment,
        Vehicle vehicle,
        Customer customer,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(settings.Endpoint))
        {
            return new AutoCountSubmitResult(
                AutoCountSyncStatus.Failed,
                null,
                null,
                null,
                "AutoCount AOTG endpoint is not configured.");
        }

        var request = new HttpRequestMessage(HttpMethod.Post, BuildUri(settings.Endpoint, settings.CreateSalesInvoicePath))
        {
            Content = JsonContent.Create(BuildPayload(invoice, payment, vehicle, customer))
        };

        if (!string.IsNullOrWhiteSpace(settings.ApiToken))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", settings.ApiToken);
        }

        try
        {
            using var response = await httpClient.SendAsync(request, cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            var summary = AutoCountResponseSummary(body);

            if (!response.IsSuccessStatusCode)
            {
                return new AutoCountSubmitResult(
                    AutoCountSyncStatus.Failed,
                    ExtractJsonString(body, "documentId", "id", "docKey"),
                    ExtractJsonString(body, "documentNumber", "docNo", "invoiceNumber"),
                    summary,
                    $"AutoCount returned {(int)response.StatusCode} {response.ReasonPhrase}.");
            }

            return new AutoCountSubmitResult(
                AutoCountSyncStatus.Synced,
                ExtractJsonString(body, "documentId", "id", "docKey"),
                ExtractJsonString(body, "documentNumber", "docNo", "invoiceNumber") ?? invoice.InvoiceNumber,
                summary,
                null);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return new AutoCountSubmitResult(
                AutoCountSyncStatus.Failed,
                null,
                null,
                null,
                "AutoCount request timed out.");
        }
        catch (HttpRequestException ex)
        {
            return new AutoCountSubmitResult(
                AutoCountSyncStatus.Failed,
                null,
                null,
                null,
                $"AutoCount request failed: {ex.Message}");
        }
    }

    private object BuildPayload(FinanceInvoice invoice, PaymentRecord payment, Vehicle vehicle, Customer customer) =>
        new
        {
            settings.CompanyCode,
            settings.AccountBookId,
            DocumentNo = invoice.InvoiceNumber,
            DocumentDate = invoice.InvoiceDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            DebtorCode = !string.IsNullOrWhiteSpace(customer.IcNumber) ? customer.IcNumber : customer.Phone,
            CustomerName = customer.Name,
            CustomerPhone = customer.Phone,
            CustomerEmail = customer.Email,
            VehiclePlate = vehicle.PlateNumber,
            VehicleDescription = $"{vehicle.Make} {vehicle.Model} {vehicle.Year}".Trim(),
            PaymentId = payment.Id,
            TotalAmount = invoice.Amount,
            Lines = FinanceInvoiceFactory.InvoiceLines(invoice, vehicle)
        };

    private static Uri BuildUri(string endpoint, string path)
    {
        var baseUri = endpoint.EndsWith("/", StringComparison.Ordinal) ? new Uri(endpoint) : new Uri(endpoint + "/");
        var relativePath = path.TrimStart('/');
        return new Uri(baseUri, relativePath);
    }

    private static string? ExtractJsonString(string body, params string[] names)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            return ExtractJsonString(document.RootElement, names);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static string? ExtractJsonString(JsonElement element, params string[] names)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (names.Any(name => string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase)))
                {
                    return property.Value.ValueKind switch
                    {
                        JsonValueKind.String => property.Value.GetString(),
                        JsonValueKind.Number => property.Value.GetRawText(),
                        _ => property.Value.GetRawText()
                    };
                }

                var nested = ExtractJsonString(property.Value, names);
                if (!string.IsNullOrWhiteSpace(nested))
                {
                    return nested;
                }
            }
        }

        if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                var nested = ExtractJsonString(item, names);
                if (!string.IsNullOrWhiteSpace(nested))
                {
                    return nested;
                }
            }
        }

        return null;
    }

    private static string? AutoCountResponseSummary(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return "AutoCount returned an empty response.";
        }

        var compact = RedactSensitiveResponseValues(string.Join(" ", body.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)));
        return compact.Length <= 500 ? compact : compact[..500];
    }

    private static string RedactSensitiveResponseValues(string value) =>
        BearerValue.Replace(SensitiveJsonValue.Replace(value, "$1[redacted]$2"), "$1[redacted]");
}

public static class FinanceInvoiceFactory
{
    public static FinanceInvoice Create(
        PaymentRecord payment,
        Vehicle vehicle,
        Customer customer,
        string createdBy,
        DateTime now)
    {
        var invoiceNumber = !string.IsNullOrWhiteSpace(payment.InvoiceNumber)
            ? payment.InvoiceNumber.Trim()
            : $"YSI-{now:yyyyMMdd}-{payment.Id.ToString("N")[..6].ToUpperInvariant()}";

        var salesPrice = payment.SalesPrice > 0 ? payment.SalesPrice : payment.NettPrice;
        var invoice = new FinanceInvoice
        {
            PaymentRecordId = payment.Id,
            VehicleId = payment.VehicleId,
            CustomerId = customer.Id,
            InvoiceNumber = invoiceNumber,
            InvoiceDate = DateOnly.FromDateTime(now),
            Amount = payment.NettPrice,
            SalesPrice = salesPrice,
            InterestAdditionalCharges = payment.InterestAdditionalCharges,
            NcdAmount = payment.NcdAmount,
            WindscreenCharges = payment.WindscreenCharges,
            CreatedBy = createdBy,
            CreatedAt = now
        };

        return invoice with
        {
            Content = SimplePdf.Create(
                $"YS Heng Sales Invoice {invoice.InvoiceNumber}",
                BuildInvoiceText(invoice, vehicle, customer, payment))
        };
    }

    public static object[] InvoiceLines(FinanceInvoice invoice, Vehicle vehicle)
    {
        var lines = new List<object>
        {
            new
            {
                Description = $"Vehicle sale - {vehicle.PlateNumber} {vehicle.Make} {vehicle.Model}".Trim(),
                Amount = invoice.SalesPrice
            }
        };

        if (invoice.InterestAdditionalCharges > 0)
        {
            lines.Add(new { Description = "Interest and additional charges", Amount = invoice.InterestAdditionalCharges });
        }

        if (invoice.WindscreenCharges > 0)
        {
            lines.Add(new { Description = "Windscreen charges", Amount = invoice.WindscreenCharges });
        }

        if (invoice.NcdAmount > 0)
        {
            lines.Add(new { Description = "NCD amount", Amount = -invoice.NcdAmount });
        }

        return [.. lines];
    }

    private static IEnumerable<string> BuildInvoiceText(FinanceInvoice invoice, Vehicle vehicle, Customer customer, PaymentRecord payment)
    {
        yield return $"Invoice No: {invoice.InvoiceNumber}";
        yield return $"Invoice Date: {invoice.InvoiceDate:yyyy-MM-dd}";
        yield return $"Customer: {customer.Name}";
        yield return $"Phone: {customer.Phone}";
        yield return $"Vehicle: {vehicle.PlateNumber} {vehicle.Make} {vehicle.Model} {vehicle.Year}";
        yield return $"Payment Id: {payment.Id}";
        yield return $"Sales Price: RM {invoice.SalesPrice:N2}";
        yield return $"Interest/Additional Charges: RM {invoice.InterestAdditionalCharges:N2}";
        yield return $"NCD Amount: RM {invoice.NcdAmount:N2}";
        yield return $"Windscreen Charges: RM {invoice.WindscreenCharges:N2}";
        yield return $"Total Nett Price: RM {invoice.Amount:N2}";
    }
}

public static class FinanceInvoiceMapping
{
    public static FinanceInvoiceResponse ToResponse(FinanceInvoice invoice, IEnumerable<AutoCountSyncJob> syncJobs) =>
        new(
            invoice.Id,
            invoice.PaymentRecordId,
            invoice.VehicleId,
            invoice.CustomerId,
            invoice.InvoiceNumber,
            invoice.InvoiceDate,
            invoice.Amount,
            invoice.SalesPrice,
            invoice.InterestAdditionalCharges,
            invoice.NcdAmount,
            invoice.WindscreenCharges,
            invoice.ContentMimeType,
            invoice.CreatedBy,
            invoice.CreatedAt,
            ToResponse(LatestSync(invoice.Id, syncJobs)));

    public static AutoCountSyncJobResponse? ToResponse(AutoCountSyncJob? job) =>
        job is null
            ? null
            : new AutoCountSyncJobResponse(
                job.Id,
                job.FinanceInvoiceId,
                job.PaymentRecordId,
                job.Status,
                job.ExternalDocumentId,
                job.ExternalDocumentNumber,
                job.ResponseSummary,
                job.LastError,
                job.RetryCount,
                job.SubmittedBy,
                job.SubmittedAt,
                job.CreatedAt,
                job.UpdatedAt);

    public static AutoCountSyncJob? LatestSync(Guid invoiceId, IEnumerable<AutoCountSyncJob> syncJobs) =>
        syncJobs
            .Where(job => job.FinanceInvoiceId == invoiceId)
            .OrderByDescending(job => job.UpdatedAt)
            .ThenByDescending(job => job.CreatedAt)
            .FirstOrDefault();
}

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
        builder.Append(CultureInfo.InvariantCulture, $"xref\n0 {objects.Length + 1}\n");
        builder.AppendLine("0000000000 65535 f ");
        foreach (var offset in offsets.Skip(1))
        {
            builder.Append(CultureInfo.InvariantCulture, $"{offset:0000000000} 00000 n \n");
        }

        builder.Append(CultureInfo.InvariantCulture, $"trailer\n<< /Size {objects.Length + 1} /Root 1 0 R >>\nstartxref\n{xrefOffset}\n%%EOF\n");
        return Encoding.ASCII.GetBytes(builder.ToString());
    }

    private static string Escape(string value) =>
        value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("(", "\\(", StringComparison.Ordinal)
            .Replace(")", "\\)", StringComparison.Ordinal);
}
