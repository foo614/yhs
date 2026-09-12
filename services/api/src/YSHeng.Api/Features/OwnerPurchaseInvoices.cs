using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record GenerateOwnerPurchaseInvoiceRequest(Guid ExpectedOwnerId, decimal ExpectedPurchasePrice, DateOnly ExpectedIntakeDate);

public sealed record PurchaseInvoiceRevisionSeller(string? Name, string? Phone, string? IcNumber, string? TinNumber, string? Address);

public sealed record PurchaseInvoiceRevisionLineRequest(PurchaseInvoiceLineType LineType, string? Description, decimal Amount, bool CapitaliseIntoVehicleCost);

public sealed record CreatePurchaseInvoiceRevisionRequest(
    int ExpectedRevision,
    string? Reason,
    DateOnly InvoiceDate,
    DateOnly PurchaseDate,
    string? PaymentReference,
    PurchaseInvoiceRevisionSeller? Seller,
    IReadOnlyList<PurchaseInvoiceRevisionLineRequest>? Lines);

public sealed record OwnerPurchaseInvoiceDraft(PurchaseInvoice Invoice, PurchaseInvoiceRevision Revision, IReadOnlyList<PurchaseInvoiceRevisionLine> Lines);

public static class OwnerPurchaseInvoiceRules
{
    private const int MaximumRevisionLines = 100;
    private const int MaximumReasonLength = 500;
    private const int MaximumSellerFieldLength = 200;
    private const int MaximumSellerAddressLength = 1_000;
    private const int MaximumPaymentReferenceLength = 200;
    private const int MaximumLineDescriptionLength = 500;
    private const decimal MaximumRevisionLineAmount = 10_000_000m;
    private static readonly Regex OfficialNumberPattern = new("^YSH-PINV-[0-9]{4}-[0-9]{6,}$", RegexOptions.CultureInvariant);

    public static ValidationResult ValidateGeneration(GenerateOwnerPurchaseInvoiceRequest request, Vehicle? vehicle, Owner? owner)
    {
        var errors = new List<ValidationError>();
        if (vehicle is null)
        {
            errors.Add(new ValidationError("purchase_invoice_vehicle_not_found", "The vehicle is no longer available. Refresh and try again."));
            return new ValidationResult(errors);
        }

        if (!vehicle.BossConfirmed)
            errors.Add(new ValidationError("purchase_invoice_intake_not_approved", "A Boss-confirmed intake is required before issuing an owner purchase invoice."));
        if (vehicle.PurchasePrice <= 0)
            errors.Add(new ValidationError("purchase_invoice_purchase_price_required", "A positive canonical purchase price is required before issuing an owner purchase invoice."));
        else if (!HasCurrencyPrecision(vehicle.PurchasePrice))
            errors.Add(new ValidationError("purchase_invoice_purchase_price_precision_invalid", "The canonical purchase price must have no more than two decimal places for a formal purchase invoice."));
        if (vehicle.IntakeDate == default)
            errors.Add(new ValidationError("purchase_invoice_intake_date_required", "A valid intake date is required before issuing an owner purchase invoice."));
        if (!vehicle.OwnerId.HasValue)
            errors.Add(new ValidationError("purchase_invoice_owner_required", "Select the vehicle's previous owner before issuing an owner purchase invoice."));
        else if (request.ExpectedOwnerId != vehicle.OwnerId.Value)
            errors.Add(new ValidationError("purchase_invoice_owner_changed", "The selected previous owner changed. Refresh and review the intake before issuing."));
        if (request.ExpectedPurchasePrice != vehicle.PurchasePrice)
            errors.Add(new ValidationError("purchase_invoice_purchase_price_changed", "The canonical purchase price changed. Refresh and review the intake before issuing."));
        if (request.ExpectedIntakeDate != vehicle.IntakeDate)
            errors.Add(new ValidationError("purchase_invoice_intake_date_changed", "The intake date changed. Refresh and review the intake before issuing."));
        if (owner is null || !vehicle.OwnerId.HasValue || owner.Id != vehicle.OwnerId.Value)
            errors.Add(new ValidationError("purchase_invoice_owner_not_found", "The vehicle's previous owner is unavailable. Refresh and review the intake before issuing."));
        else
        {
            if (string.IsNullOrWhiteSpace(owner.Name)) errors.Add(new ValidationError("purchase_invoice_owner_name_required", "The previous owner name is required for a formal purchase invoice."));
            if (string.IsNullOrWhiteSpace(owner.Phone)) errors.Add(new ValidationError("purchase_invoice_owner_phone_required", "The previous owner phone number is required for a formal purchase invoice."));
            AddUnsupportedTextError(errors, [owner.Name, owner.Phone, owner.IcNumber, owner.TinNumber, owner.Address, vehicle.PlateNumber, VehicleDescription(vehicle)]);
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateRevision(CreatePurchaseInvoiceRevisionRequest request)
    {
        var errors = new List<ValidationError>();
        if (request.ExpectedRevision <= 0)
            errors.Add(new ValidationError("purchase_invoice_revision_required", "The invoice revision being corrected is required."));
        if (string.IsNullOrWhiteSpace(request.Reason))
            errors.Add(new ValidationError("purchase_invoice_revision_reason_required", "Explain why this formal purchase invoice is being corrected."));
        else if (request.Reason.Length > MaximumReasonLength)
            errors.Add(new ValidationError("purchase_invoice_revision_reason_too_long", $"The correction reason cannot exceed {MaximumReasonLength} characters."));
        if (request.InvoiceDate == default)
            errors.Add(new ValidationError("purchase_invoice_revision_invoice_date_required", "The revised invoice date is required."));
        if (request.PurchaseDate == default)
            errors.Add(new ValidationError("purchase_invoice_revision_purchase_date_required", "The revised purchase date is required."));

        var seller = request.Seller;
        if (seller is null)
        {
            errors.Add(new ValidationError("purchase_invoice_revision_seller_required", "Seller details are required for a formal purchase invoice revision."));
        }
        else
        {
            if (string.IsNullOrWhiteSpace(seller.Name)) errors.Add(new ValidationError("purchase_invoice_revision_seller_name_required", "Seller name is required for a formal purchase invoice revision."));
            if (string.IsNullOrWhiteSpace(seller.Phone)) errors.Add(new ValidationError("purchase_invoice_revision_seller_phone_required", "Seller phone number is required for a formal purchase invoice revision."));
            if (seller.Name?.Length > MaximumSellerFieldLength || seller.Phone?.Length > MaximumSellerFieldLength || seller.IcNumber?.Length > MaximumSellerFieldLength || seller.TinNumber?.Length > MaximumSellerFieldLength || seller.Address?.Length > MaximumSellerAddressLength)
                errors.Add(new ValidationError("purchase_invoice_revision_seller_too_long", "Seller fields exceed the maximum length for an official invoice."));
            AddUnsupportedTextError(errors, [seller.Name, seller.Phone, seller.IcNumber, seller.TinNumber, seller.Address]);
        }

        if (request.Lines is not { Count: > 0 })
        {
            errors.Add(new ValidationError("purchase_invoice_revision_lines_required", "Add at least one classified purchase invoice line."));
        }
        else
        {
            if (request.Lines.Count > MaximumRevisionLines)
            {
                errors.Add(new ValidationError("purchase_invoice_revision_line_limit", $"A formal purchase invoice can contain at most {MaximumRevisionLines} classified lines."));
            }
            else
            {
                var hasInvalidLines = request.Lines.Any(line => line is null || !Enum.IsDefined(typeof(PurchaseInvoiceLineType), line.LineType) || string.IsNullOrWhiteSpace(line.Description) || line.Description.Length > MaximumLineDescriptionLength || line.Amount <= 0 || line.Amount > MaximumRevisionLineAmount);
                var hasImpreciseAmounts = request.Lines.Any(line => line is not null && !HasCurrencyPrecision(line.Amount));
                if (hasInvalidLines)
                    errors.Add(new ValidationError("purchase_invoice_revision_line_invalid", "Every revised purchase invoice line needs a description, recognised type and amount greater than zero."));
                if (hasImpreciseAmounts)
                    errors.Add(new ValidationError("purchase_invoice_revision_line_precision_invalid", "Every revised purchase invoice line amount must have no more than two decimal places."));
                if (!hasInvalidLines && !hasImpreciseAmounts)
                {
                    try
                    {
                        if (CalculateRevisionTotal(request.Lines) <= 0)
                            errors.Add(new ValidationError("purchase_invoice_revision_total_invalid", "The revised purchase invoice total must be greater than zero."));
                    }
                    catch (OverflowException)
                    {
                        errors.Add(new ValidationError("purchase_invoice_revision_total_invalid", "The revised purchase invoice total is too large."));
                    }
                }
                AddUnsupportedTextError(errors, request.Lines.Select(line => line?.Description));
            }
        }

        if (request.PaymentReference?.Length > MaximumPaymentReferenceLength)
            errors.Add(new ValidationError("purchase_invoice_revision_payment_reference_too_long", $"The payment reference cannot exceed {MaximumPaymentReferenceLength} characters."));
        AddUnsupportedTextError(errors, [request.Reason, request.PaymentReference]);
        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateLegacyWrite(PurchaseInvoice invoice, string? existingInvoiceNumber = null)
    {
        var errors = new List<ValidationError>();
        if (invoice.SourceType != PurchaseInvoiceSourceType.LegacySupplier ||
            invoice.OwnerId.HasValue ||
            invoice.CurrentRevisionNumber != 0 ||
            invoice.CurrentRevision is not null)
        {
            errors.Add(new ValidationError(
                "owner_purchase_invoice_workflow_required",
                "System-generated owner purchase invoices must be issued and corrected through the formal invoice workflow."));
        }
        if (IsReservedOfficialNumber(invoice.InvoiceNumber) && !string.Equals(NormalizeInvoiceNumber(invoice.InvoiceNumber), NormalizeInvoiceNumber(existingInvoiceNumber), StringComparison.Ordinal))
        {
            errors.Add(new ValidationError(
                "purchase_invoice_official_number_reserved",
                "YSH-PINV numbers are reserved for system-generated owner purchase invoices."));
        }
        return new ValidationResult(errors);
    }

    public static bool IsGenerationSourceStale(ValidationResult validation) => validation.Errors.Count > 0 && validation.Errors.All(error => error.Code is "purchase_invoice_owner_changed" or "purchase_invoice_purchase_price_changed" or "purchase_invoice_intake_date_changed");

    public static bool IsReservedOfficialNumber(string? number) => OfficialNumberPattern.IsMatch(NormalizeInvoiceNumber(number));

    public static string NormalizeInvoiceNumber(string? number) => string.Concat((number ?? "").Where(character => !char.IsWhiteSpace(character))).ToUpperInvariant();

    public static bool HasCurrencyPrecision(decimal amount) => decimal.Round(amount, 2) == amount;

    public static decimal CalculateRevisionTotal(IEnumerable<PurchaseInvoiceRevisionLineRequest> lines)
    {
        decimal total = 0;
        foreach (var line in lines) total = checked(total + line.Amount);
        return total;
    }

    public static bool IsPdfTextSupported(string? value) => value is null || value.All(IsSupportedPdfCharacter);

    public static string VehicleDescription(Vehicle vehicle) => $"{vehicle.Make} {vehicle.Model} {vehicle.Year}".Trim();

    private static bool IsSupportedPdfCharacter(char value) =>
        value is '\r' or '\n' ||
        value is >= '\u0020' and <= '\u007e' ||
        value is >= '\u00a0' and <= '\u024f' ||
        value is >= '\u2000' and <= '\u206f' ||
        value is >= '\u3000' and <= '\u303f' ||
        value is >= '\u3400' and <= '\u4dbf' ||
        value is >= '\u4e00' and <= '\u9fff' ||
        value is >= '\uf900' and <= '\ufaff' ||
        value is >= '\uff00' and <= '\uffef';

    private static void AddUnsupportedTextError(IEnumerable<ValidationError> existingErrors, IEnumerable<string?> values)
    {
        var errors = existingErrors as List<ValidationError> ?? existingErrors.ToList();
        if (errors.Any(error => error.Code == "purchase_invoice_pdf_text_unsupported") || values.All(IsPdfTextSupported)) return;
        errors.Add(new ValidationError(
            "purchase_invoice_pdf_text_unsupported",
            "Formal purchase invoices support Latin and Chinese text. Remove unsupported characters instead of replacing them in the official PDF."));
    }
}

public static class OwnerPurchaseInvoiceFactory
{
    public static string NumberFor(DateOnly issuedDate, long sequence) => $"YSH-PINV-{issuedDate.Year}-{sequence:000000}";

    public static OwnerPurchaseInvoiceDraft CreateInitial(Vehicle vehicle, Owner owner, string invoiceNumber, DateOnly issueDate, string createdBy, DateTime now, string? createdByUserId = null)
    {
        var invoice = new PurchaseInvoice
        {
            VehicleId = vehicle.Id,
            SourceType = PurchaseInvoiceSourceType.OwnerAcquisition,
            OwnerId = owner.Id,
            CurrentRevisionNumber = 1,
            InvoiceNumber = invoiceNumber,
            InvoiceDate = issueDate,
            PurchaseDate = vehicle.IntakeDate,
            Amount = vehicle.PurchasePrice,
            AccountingStatus = AccountingConfirmationStatus.Draft
        };
        var revision = new PurchaseInvoiceRevision
        {
            PurchaseInvoiceId = invoice.Id,
            RevisionNumber = 1,
            InvoiceNumber = invoiceNumber,
            SourceVehicleId = vehicle.Id,
            SourceOwnerId = owner.Id,
            InvoiceDate = issueDate,
            PurchaseDate = vehicle.IntakeDate,
            SellerName = owner.Name.Trim(),
            SellerPhone = owner.Phone.Trim(),
            SellerIcNumber = CleanOptional(owner.IcNumber),
            SellerTinNumber = CleanOptional(owner.TinNumber),
            SellerAddress = CleanOptional(owner.Address),
            VehiclePlateNumber = vehicle.PlateNumber.Trim(),
            VehicleDescription = OwnerPurchaseInvoiceRules.VehicleDescription(vehicle),
            Amount = vehicle.PurchasePrice,
            CreatedBy = createdBy,
            CreatedByUserId = createdByUserId,
            CreatedAt = now,
            Reason = "Initial formal issue"
        };
        var lines = new[]
        {
            new PurchaseInvoiceRevisionLine
            {
                PurchaseInvoiceRevisionId = revision.Id,
                PurchaseInvoiceId = invoice.Id,
                LineType = PurchaseInvoiceLineType.VehiclePurchase,
                Description = string.IsNullOrWhiteSpace(revision.VehicleDescription)
                    ? $"Vehicle purchase - {revision.VehiclePlateNumber}"
                    : $"Vehicle purchase - {revision.VehiclePlateNumber} {revision.VehicleDescription}",
                Amount = vehicle.PurchasePrice,
                CapitaliseIntoVehicleCost = true,
                SortOrder = 1
            }
        };
        revision = revision with { Content = OwnerPurchaseInvoicePdf.Create(revision, lines) };
        return new OwnerPurchaseInvoiceDraft(invoice, revision, lines);
    }

    public static OwnerPurchaseInvoiceDraft CreateRevision(
        PurchaseInvoice invoice,
        PurchaseInvoiceRevision currentRevision,
        CreatePurchaseInvoiceRevisionRequest request,
        string createdBy,
        DateTime now,
        string? createdByUserId = null)
    {
        var seller = request.Seller!;
        var revision = new PurchaseInvoiceRevision
        {
            PurchaseInvoiceId = invoice.Id,
            RevisionNumber = currentRevision.RevisionNumber + 1,
            InvoiceNumber = invoice.InvoiceNumber,
            SourceVehicleId = currentRevision.SourceVehicleId,
            SourceOwnerId = currentRevision.SourceOwnerId,
            InvoiceDate = request.InvoiceDate,
            PurchaseDate = request.PurchaseDate,
            PaymentReference = CleanOptional(request.PaymentReference),
            SellerName = seller.Name!.Trim(),
            SellerPhone = seller.Phone!.Trim(),
            SellerIcNumber = CleanOptional(seller.IcNumber),
            SellerTinNumber = CleanOptional(seller.TinNumber),
            SellerAddress = CleanOptional(seller.Address),
            VehiclePlateNumber = currentRevision.VehiclePlateNumber,
            VehicleDescription = currentRevision.VehicleDescription,
            Amount = OwnerPurchaseInvoiceRules.CalculateRevisionTotal(request.Lines!),
            CreatedBy = createdBy,
            CreatedByUserId = createdByUserId,
            CreatedAt = now,
            Reason = request.Reason!.Trim()
        };
        var lines = request.Lines!.Select((line, index) => new PurchaseInvoiceRevisionLine
        {
            PurchaseInvoiceRevisionId = revision.Id,
            PurchaseInvoiceId = invoice.Id,
            LineType = line.LineType,
            Description = line.Description!.Trim(),
            Amount = line.Amount,
            CapitaliseIntoVehicleCost = line.CapitaliseIntoVehicleCost,
            SortOrder = index + 1
        }).ToList();
        revision = revision with { Content = OwnerPurchaseInvoicePdf.Create(revision, lines) };
        var current = invoice with
        {
            CurrentRevisionNumber = revision.RevisionNumber,
            InvoiceDate = revision.InvoiceDate,
            PurchaseDate = revision.PurchaseDate,
            PaymentReference = revision.PaymentReference,
            Amount = revision.Amount,
            AccountingStatus = AccountingConfirmationStatus.Draft,
            AccountingConfirmedBy = null,
            AccountingConfirmedByUserId = null,
            AccountingConfirmedAt = null
        };
        return new OwnerPurchaseInvoiceDraft(current, revision, lines);
    }

    public static IReadOnlyList<PurchaseInvoiceLine> ToCurrentLines(PurchaseInvoiceRevision revision) => revision.Lines
        .OrderBy(line => line.SortOrder)
        .Select(line => new PurchaseInvoiceLine
        {
            Id = line.Id,
            PurchaseInvoiceId = revision.PurchaseInvoiceId,
            LineType = line.LineType,
            Description = line.Description,
            Amount = line.Amount,
            CapitaliseIntoVehicleCost = line.CapitaliseIntoVehicleCost
        }).ToList();

    private static string? CleanOptional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

public static class OwnerPurchaseInvoiceNumbering
{
    public static async Task<string> AllocateAsync(AppDbContext db, DateOnly issuedDate)
    {
        var usedNumbers = (await db.PurchaseInvoices.AsNoTracking().Select(invoice => invoice.InvoiceNumber).ToListAsync())
            .Select(OwnerPurchaseInvoiceRules.NormalizeInvoiceNumber)
            .ToHashSet(StringComparer.Ordinal);
        for (var attempt = 0; attempt < 10_000; attempt++)
        {
            var sequence = await db.Database.SqlQueryRaw<long>("SELECT nextval('\"OwnerPurchaseInvoiceNumberSequence\"') AS \"Value\"").SingleAsync();
            var candidate = OwnerPurchaseInvoiceFactory.NumberFor(issuedDate, sequence);
            if (!usedNumbers.Contains(OwnerPurchaseInvoiceRules.NormalizeInvoiceNumber(candidate))) return candidate;
        }

        throw new InvalidOperationException("Unable to allocate an unused formal owner purchase invoice number.");
    }
}

public static class OwnerPurchaseInvoiceReader
{
    public static async Task<IReadOnlyList<PurchaseInvoice>> HydrateAsync(AppDbContext db, IReadOnlyList<PurchaseInvoice> invoices)
    {
        if (invoices.Count == 0) return invoices;

        var invoiceIds = invoices.Select(invoice => invoice.Id).ToList();
        var legacyLines = await db.PurchaseInvoiceLines.AsNoTracking()
            .Where(line => invoiceIds.Contains(line.PurchaseInvoiceId))
            .ToListAsync();
        var ownerInvoices = invoices.Where(invoice => invoice.SourceType == PurchaseInvoiceSourceType.OwnerAcquisition).ToList();
        var currentRevisionByInvoiceId = new Dictionary<Guid, PurchaseInvoiceRevision>();
        if (ownerInvoices.Count > 0)
        {
            var currentRevisionPairs = ownerInvoices.Select(invoice => new { invoice.Id, invoice.CurrentRevisionNumber }).ToList();
            var revisions = await db.PurchaseInvoiceRevisions.AsNoTracking()
                .Where(revision => invoiceIds.Contains(revision.PurchaseInvoiceId))
                .Select(SummaryProjection())
                .ToListAsync();
            currentRevisionByInvoiceId = revisions
                .Where(revision => currentRevisionPairs.Any(pair => pair.Id == revision.PurchaseInvoiceId && pair.CurrentRevisionNumber == revision.RevisionNumber))
                .ToDictionary(revision => revision.PurchaseInvoiceId);
            var revisionIds = currentRevisionByInvoiceId.Values.Select(revision => revision.Id).ToList();
            var revisionLines = await db.PurchaseInvoiceRevisionLines.AsNoTracking()
                .Where(line => revisionIds.Contains(line.PurchaseInvoiceRevisionId))
                .OrderBy(line => line.SortOrder)
                .ToListAsync();
            currentRevisionByInvoiceId = currentRevisionByInvoiceId.ToDictionary(
                pair => pair.Key,
                pair => pair.Value with { Lines = revisionLines.Where(line => line.PurchaseInvoiceRevisionId == pair.Value.Id).Select(line => line with { PurchaseInvoiceId = pair.Value.PurchaseInvoiceId }).ToList() });
        }

        return invoices.Select(invoice =>
        {
            var currentRevision = currentRevisionByInvoiceId.GetValueOrDefault(invoice.Id);
            return invoice with
            {
                Lines = currentRevision is null
                    ? legacyLines.Where(line => line.PurchaseInvoiceId == invoice.Id).ToList()
                    : OwnerPurchaseInvoiceFactory.ToCurrentLines(currentRevision),
                CurrentRevision = currentRevision
            };
        }).ToList();
    }

    public static async Task<PurchaseInvoiceRevision?> FindRevisionSummaryAsync(AppDbContext db, Guid purchaseInvoiceId, int revisionNumber) =>
        await db.PurchaseInvoiceRevisions.AsNoTracking()
            .Where(revision => revision.PurchaseInvoiceId == purchaseInvoiceId && revision.RevisionNumber == revisionNumber)
            .Select(SummaryProjection())
            .FirstOrDefaultAsync();

    public static async Task<IReadOnlyList<PurchaseInvoiceRevision>> HistoryAsync(AppDbContext db, Guid purchaseInvoiceId)
    {
        var revisions = await db.PurchaseInvoiceRevisions.AsNoTracking()
            .Where(revision => revision.PurchaseInvoiceId == purchaseInvoiceId)
            .OrderBy(revision => revision.RevisionNumber)
            .Select(SummaryProjection())
            .ToListAsync();
        if (revisions.Count == 0) return revisions;
        var revisionIds = revisions.Select(revision => revision.Id).ToList();
        var lines = await db.PurchaseInvoiceRevisionLines.AsNoTracking()
            .Where(line => revisionIds.Contains(line.PurchaseInvoiceRevisionId))
            .OrderBy(line => line.SortOrder)
            .ToListAsync();
        return revisions.Select(revision => revision with { Lines = lines.Where(line => line.PurchaseInvoiceRevisionId == revision.Id).Select(line => line with { PurchaseInvoiceId = revision.PurchaseInvoiceId }).ToList() }).ToList();
    }

    private static System.Linq.Expressions.Expression<Func<PurchaseInvoiceRevision, PurchaseInvoiceRevision>> SummaryProjection() => revision => new PurchaseInvoiceRevision
    {
        Id = revision.Id,
        PurchaseInvoiceId = revision.PurchaseInvoiceId,
        RevisionNumber = revision.RevisionNumber,
        InvoiceNumber = revision.InvoiceNumber,
        SourceVehicleId = revision.SourceVehicleId,
        SourceOwnerId = revision.SourceOwnerId,
        InvoiceDate = revision.InvoiceDate,
        PurchaseDate = revision.PurchaseDate,
        PaymentReference = revision.PaymentReference,
        SellerName = revision.SellerName,
        SellerPhone = revision.SellerPhone,
        SellerIcNumber = revision.SellerIcNumber,
        SellerTinNumber = revision.SellerTinNumber,
        SellerAddress = revision.SellerAddress,
        VehiclePlateNumber = revision.VehiclePlateNumber,
        VehicleDescription = revision.VehicleDescription,
        Amount = revision.Amount,
        AccountingStatus = revision.AccountingStatus,
        AccountingConfirmedBy = revision.AccountingConfirmedBy,
        AccountingConfirmedByUserId = revision.AccountingConfirmedByUserId,
        AccountingConfirmedAt = revision.AccountingConfirmedAt,
        CreatedBy = revision.CreatedBy,
        CreatedByUserId = revision.CreatedByUserId,
        CreatedAt = revision.CreatedAt,
        Reason = revision.Reason,
        ContentMimeType = revision.ContentMimeType
    };
}

public static class OwnerPurchaseInvoicePdf
{
    private const int PageWidth = 595;
    private const int PageHeight = 842;
    private const int LeftMargin = 50;
    private const int RightMargin = 50;
    private const int BodyFontSize = 10;
    private const int BodyLineHeight = 14;
    private const int FirstBodyBaseline = 708;
    private const int FooterBaseline = 35;
    private const int MaximumBodyLinesPerPage = 45;

    public static byte[] Create(PurchaseInvoiceRevision revision, IReadOnlyList<PurchaseInvoiceRevisionLine> lines)
    {
        var text = new List<string>
        {
            $"Invoice number: {revision.InvoiceNumber}",
            $"Revision: {revision.RevisionNumber}",
            $"Issue date: {revision.InvoiceDate:yyyy-MM-dd}",
            $"Purchase date: {revision.PurchaseDate:yyyy-MM-dd}",
            $"Seller: {revision.SellerName}",
            $"Seller phone: {revision.SellerPhone}",
            $"Seller IC: {Display(revision.SellerIcNumber)}",
            $"Seller TIN: {Display(revision.SellerTinNumber)}",
            $"Seller address: {Display(revision.SellerAddress)}",
            $"Payment reference: {Display(revision.PaymentReference)}",
            $"Vehicle: {revision.VehiclePlateNumber} {revision.VehicleDescription}".Trim(),
            "Purchase lines:"
        };
        text.AddRange(lines.OrderBy(line => line.SortOrder).Select(line =>
            $"{line.SortOrder}. {line.LineType}: {line.Description} — RM {line.Amount.ToString("N2", CultureInfo.InvariantCulture)}"));
        text.Add($"Total: RM {revision.Amount.ToString("N2", CultureInfo.InvariantCulture)}");
        text.Add($"Prepared by: {revision.CreatedBy}");
        text.Add($"Prepared at (UTC): {revision.CreatedAt:yyyy-MM-dd HH:mm:ss}");
        text.Add($"Revision reason: {Display(revision.Reason)}");

        if (text.Any(value => !OwnerPurchaseInvoiceRules.IsPdfTextSupported(value)))
            throw new ArgumentException("Formal purchase invoice contains unsupported PDF text.", nameof(revision));

        var pages = Paginate(text);
        var allText = pages.SelectMany(page => page)
            .Append("YS HENG | FINANCE OPERATIONS")
            .Append("PURCHASE INVOICE / 收车发票")
            .Append("PURCHASE DETAILS / 收车明细")
            .ToList();
        var contents = pages.Select((page, index) => PageContent(page, index + 1, pages.Count, revision.InvoiceNumber, revision.RevisionNumber)).ToList();
        return BrandedPdf.Create(contents, allText);
    }

    private static string Display(string? value) => string.IsNullOrWhiteSpace(value) ? "-" : value;

    private static IReadOnlyList<IReadOnlyList<string>> Paginate(IReadOnlyList<string> values)
    {
        var wrapped = values.SelectMany(Wrap).ToList();
        var pages = new List<IReadOnlyList<string>>();
        for (var index = 0; index < wrapped.Count; index += MaximumBodyLinesPerPage)
        {
            var page = new List<string>();
            page.AddRange(wrapped.Skip(index).Take(MaximumBodyLinesPerPage));
            pages.Add(page);
        }
        return pages.Count == 0 ? [[]] : pages;
    }

    private static IEnumerable<string> Wrap(string value)
    {
        foreach (var paragraph in value.Replace("\r\n", "\n", StringComparison.Ordinal).Split('\n'))
        {
            if (paragraph.Length == 0)
            {
                yield return "";
                continue;
            }

            var lineStart = 0;
            while (lineStart < paragraph.Length)
            {
                var width = 0d;
                var lastBreak = -1;
                var index = lineStart;
                for (; index < paragraph.Length; index++)
                {
                    var characterWidth = TextWidth(paragraph[index], BodyFontSize);
                    if (width + characterWidth > PageWidth - LeftMargin - RightMargin && index > lineStart) break;
                    width += characterWidth;
                    if (char.IsWhiteSpace(paragraph[index])) lastBreak = index;
                }

                if (index == paragraph.Length)
                {
                    yield return paragraph[lineStart..].TrimEnd();
                    break;
                }

                var breakAt = lastBreak >= lineStart ? lastBreak + 1 : index;
                yield return paragraph[lineStart..breakAt].TrimEnd();
                lineStart = breakAt;
                while (lineStart < paragraph.Length && char.IsWhiteSpace(paragraph[lineStart])) lineStart++;
            }
        }
    }

    private static double TextWidth(char character, int fontSize)
    {
        if (character > '\u007f') return fontSize;
        var units = character switch
        {
            ' ' => 278,
            'i' or 'j' or 'l' or 'I' or '!' or '|' => 278,
            'f' or 'r' or 't' => 333,
            'm' or 'w' or 'M' or 'W' => 944,
            'A' or 'B' or 'C' or 'D' or 'E' or 'F' or 'G' or 'H' or 'K' or 'N' or 'O' or 'P' or 'Q' or 'R' or 'S' or 'T' or 'U' or 'V' or 'X' or 'Y' or 'Z' => 667,
            _ => 556
        };
        return units * fontSize / 1000d;
    }

    private static string PageContent(IReadOnlyList<string> lines, int pageNumber, int pageCount, string invoiceNumber, int revisionNumber)
    {
        var page = new StringBuilder();
        BrandedPdf.Header(page, pageNumber == 1 ? "PURCHASE INVOICE / 收车发票" : "PURCHASE INVOICE", invoiceNumber, $"Version {revisionNumber}", pageNumber > 1);

        BrandedPdf.Text(page, LeftMargin, 724, 11, pageNumber == 1 ? "Owner acquisition record" : "Invoice details continued", bold: true, color: BrandedPdf.Navy);
        BrandedPdf.Line(page, LeftMargin, 714, PageWidth - RightMargin, 714, BrandedPdf.Rule);
        var baseline = FirstBodyBaseline;
        foreach (var line in lines)
        {
            if (line.StartsWith("Purchase lines:", StringComparison.Ordinal))
            {
                BrandedPdf.Line(page, LeftMargin, baseline + 9, PageWidth - RightMargin, baseline + 9, BrandedPdf.Rule);
                BrandedPdf.Text(page, LeftMargin, baseline, 10, "PURCHASE DETAILS / 收车明细", bold: true, color: BrandedPdf.Blue);
            }
            else if (line.StartsWith("Total:", StringComparison.Ordinal))
            {
                BrandedPdf.Fill(page, LeftMargin - 8, baseline - 5, PageWidth - LeftMargin - RightMargin + 16, 22, BrandedPdf.PaleBlue);
                BrandedPdf.Text(page, LeftMargin, baseline, 11, line, bold: true, color: BrandedPdf.Navy);
            }
            else
            {
                BrandedPdf.Text(page, LeftMargin, baseline, BodyFontSize, line, bold: line.StartsWith("Invoice number:", StringComparison.Ordinal), color: BrandedPdf.Dark);
            }
            baseline -= BodyLineHeight;
        }
        BrandedPdf.Footer(page, $"{invoiceNumber}  |  Version {revisionNumber}", pageNumber, pageCount, "YS Heng - Finance copy");
        return page.ToString();
    }

}
