using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record GenerateOwnerPurchaseInvoiceRequest(
    Guid ExpectedOwnerId,
    decimal ExpectedPurchasePrice,
    DateOnly ExpectedIntakeDate,
    Guid? ExpectedSupplierId = null,
    string? SupplierInvoiceNumber = null,
    DateOnly? SupplierInvoiceDate = null,
    string? DiscountVoucherReference = null,
    decimal? ExpectedDealerProcessingFee = null,
    decimal? ExpectedDealerTrailerFee = null,
    decimal? ExpectedDealerParkingFee = null,
    decimal? ExpectedDealerLateCharge = null,
    decimal? ExpectedDealerDiscount = null,
    decimal? ExpectedPurchaseInvoiceTotal = null);

public sealed record RecordAutoCountKeyRequest(int ExpectedRevision, string? AutoCountInvoiceNumber);

public sealed record PurchaseInvoiceRevisionSeller(string? Name, string? Phone, string? IcNumber, string? TinNumber, string? Address);

public sealed record PurchaseInvoiceRevisionLineRequest(
    PurchaseInvoiceLineType LineType,
    string? Description,
    decimal Amount,
    bool CapitaliseIntoVehicleCost,
    string? SupplierInvoiceNumber = null,
    DateOnly? SupplierInvoiceDate = null,
    string? DiscountVoucherReference = null,
    decimal DiscountAmount = 0m);

public sealed record CreatePurchaseInvoiceRevisionRequest(
    int ExpectedRevision,
    string? Reason,
    DateOnly InvoiceDate,
    DateOnly PurchaseDate,
    string? PaymentReference,
    PurchaseInvoiceRevisionSeller? Seller,
    IReadOnlyList<PurchaseInvoiceRevisionLineRequest>? Lines,
    string? SupplierInvoiceNumber = null,
    DateOnly? SupplierInvoiceDate = null,
    string? DiscountVoucherReference = null);

public sealed record OwnerPurchaseInvoiceDraft(PurchaseInvoice Invoice, PurchaseInvoiceRevision Revision, IReadOnlyList<PurchaseInvoiceRevisionLine> Lines);

public static class OwnerPurchaseInvoiceRules
{
    public static decimal GenerationAmount(Vehicle vehicle) => vehicle.ModifiedPurchasePrice ?? vehicle.PurchasePrice;

    public static decimal GenerationInvoiceTotal(Vehicle vehicle) =>
        GenerationAmount(vehicle)
        + EffectiveDealerCharge(vehicle, vehicle.DealerProcessingFee)
        + EffectiveDealerCharge(vehicle, vehicle.DealerTrailerFee)
        + EffectiveDealerCharge(vehicle, vehicle.DealerParkingFee)
        + EffectiveDealerCharge(vehicle, vehicle.DealerLateCharge)
        - EffectiveDealerCharge(vehicle, vehicle.DealerDiscount);

    private const int MaximumRevisionLines = 100;
    private const int MaximumReasonLength = 500;
    private const int MaximumSellerFieldLength = 200;
    private const int MaximumSellerAddressLength = 1_000;
    private const int MaximumPaymentReferenceLength = 200;
    private const int MaximumLineDescriptionLength = 500;
    private const decimal MaximumRevisionLineAmount = 10_000_000m;
    private static readonly Regex OfficialNumberPattern = new("^YSH-PINV-[0-9]{4}-[0-9]{6,}$", RegexOptions.CultureInvariant);

    public static ValidationResult ValidateGeneration(GenerateOwnerPurchaseInvoiceRequest request, Vehicle? vehicle, Owner? owner, Supplier? supplier = null)
    {
        var errors = new List<ValidationError>();
        if (vehicle is null)
        {
            errors.Add(new ValidationError("purchase_invoice_vehicle_not_found", "The vehicle is no longer available. Refresh and try again."));
            return new ValidationResult(errors);
        }

        if (!vehicle.BossConfirmed)
            errors.Add(new ValidationError("purchase_invoice_intake_not_approved", "A Boss-confirmed intake is required before issuing an owner purchase invoice."));
        if (OwnerPurchaseInvoiceRules.GenerationAmount(vehicle) <= 0)
            errors.Add(new ValidationError("purchase_invoice_purchase_price_required", "A positive canonical purchase price is required before issuing an owner purchase invoice."));
        else if (!HasCurrencyPrecision(OwnerPurchaseInvoiceRules.GenerationAmount(vehicle)))
            errors.Add(new ValidationError("purchase_invoice_purchase_price_precision_invalid", "The canonical purchase price must have no more than two decimal places for a formal purchase invoice."));
        if (vehicle.IntakeDate == default)
            errors.Add(new ValidationError("purchase_invoice_intake_date_required", "A valid intake date is required before issuing an owner purchase invoice."));
        if (vehicle.PurchaseSource is VehiclePurchaseSource.Carsome or VehiclePurchaseSource.Carro or VehiclePurchaseSource.KSA)
        {
            if (!request.ExpectedSupplierId.HasValue || supplier is null || supplier.Status != SupplierStatus.Active || supplier.Id != request.ExpectedSupplierId.Value)
                errors.Add(new ValidationError("purchase_invoice_supplier_required", "Select an active supplier company for a dealer-sourced vehicle before issuing its purchase invoice."));
            else
            {
                if (string.IsNullOrWhiteSpace(supplier.CompanyName)) errors.Add(new ValidationError("purchase_invoice_supplier_name_required", "The dealer company name is required for a formal purchase invoice."));
                if (string.IsNullOrWhiteSpace(supplier.Phone)) errors.Add(new ValidationError("purchase_invoice_supplier_phone_required", "The dealer company phone number is required for a formal purchase invoice."));
            }
            if (vehicle.PurchaseSource == VehiclePurchaseSource.KSA && vehicle.Status != VehicleStatus.Sold)
                errors.Add(new ValidationError("purchase_invoice_ksa_not_sold", "A KSA vehicle can only receive a purchase invoice after it has been sold."));
        }
        else if (!vehicle.OwnerId.HasValue)
            errors.Add(new ValidationError("purchase_invoice_owner_required", "Select the vehicle's previous owner before issuing an owner purchase invoice."));
        else if (request.ExpectedOwnerId != vehicle.OwnerId.Value)
            errors.Add(new ValidationError("purchase_invoice_owner_changed", "The selected previous owner changed. Refresh and review the intake before issuing."));
        if (request.ExpectedPurchasePrice != OwnerPurchaseInvoiceRules.GenerationAmount(vehicle))
            errors.Add(new ValidationError("purchase_invoice_purchase_price_changed", "The canonical purchase price changed. Refresh and review the intake before issuing."));
        if (request.ExpectedIntakeDate != vehicle.IntakeDate)
            errors.Add(new ValidationError("purchase_invoice_intake_date_changed", "The intake date changed. Refresh and review the intake before issuing."));
        if (IsDealerSource(vehicle))
        {
            foreach (var (name, value) in new[]
            {
                ("processing_fee", vehicle.DealerProcessingFee),
                ("trailer_fee", vehicle.DealerTrailerFee),
                ("parking_fee", vehicle.DealerParkingFee),
                ("late_charge", vehicle.DealerLateCharge),
                ("discount", vehicle.DealerDiscount)
            })
            {
                if (value < 0)
                    errors.Add(new ValidationError($"purchase_invoice_dealer_{name}_invalid", "Dealer charges cannot be negative."));
                else if (value.HasValue && !HasCurrencyPrecision(value.Value))
                    errors.Add(new ValidationError($"purchase_invoice_dealer_{name}_precision_invalid", "Dealer charges must have no more than two decimal places for a formal purchase invoice."));
            }
        }
        AddGenerationSnapshotError(errors, request.ExpectedDealerProcessingFee, EffectiveDealerCharge(vehicle, vehicle.DealerProcessingFee), "processing_fee");
        AddGenerationSnapshotError(errors, request.ExpectedDealerTrailerFee, EffectiveDealerCharge(vehicle, vehicle.DealerTrailerFee), "trailer_fee");
        AddGenerationSnapshotError(errors, request.ExpectedDealerParkingFee, EffectiveDealerCharge(vehicle, vehicle.DealerParkingFee), "parking_fee");
        AddGenerationSnapshotError(errors, request.ExpectedDealerLateCharge, EffectiveDealerCharge(vehicle, vehicle.DealerLateCharge), "late_charge");
        AddGenerationSnapshotError(errors, request.ExpectedDealerDiscount, EffectiveDealerCharge(vehicle, vehicle.DealerDiscount), "discount");
        AddGenerationSnapshotError(errors, request.ExpectedPurchaseInvoiceTotal, GenerationInvoiceTotal(vehicle), "total");
        if (OwnerPurchaseInvoiceRules.GenerationInvoiceTotal(vehicle) <= 0)
            errors.Add(new ValidationError("purchase_invoice_total_invalid", "The formal purchase invoice total must be greater than zero after dealer charges and discount."));
        if (request.SupplierInvoiceNumber?.Length > MaximumPaymentReferenceLength)
            errors.Add(new ValidationError("purchase_invoice_supplier_number_too_long", $"The supplier invoice number cannot exceed {MaximumPaymentReferenceLength} characters."));
        if (request.DiscountVoucherReference?.Length > MaximumPaymentReferenceLength)
            errors.Add(new ValidationError("purchase_invoice_discount_reference_too_long", $"The discount voucher reference cannot exceed {MaximumPaymentReferenceLength} characters."));
        AddUnsupportedTextError(errors, [request.SupplierInvoiceNumber, request.DiscountVoucherReference]);
        if (vehicle.PurchaseSource is VehiclePurchaseSource.Carsome or VehiclePurchaseSource.Carro or VehiclePurchaseSource.KSA)
        {
            if (supplier is not null)
                AddUnsupportedTextError(errors, [supplier.CompanyName, supplier.RegistrationNumber, supplier.TinNumber, supplier.Address, supplier.Phone, vehicle.PlateNumber, VehicleDescription(vehicle)]);
        }
        else if (owner is null || !vehicle.OwnerId.HasValue || owner.Id != vehicle.OwnerId.Value)
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
                var hasInvalidLines = request.Lines.Any(line => line is null || !Enum.IsDefined(typeof(PurchaseInvoiceLineType), line.LineType) || string.IsNullOrWhiteSpace(line.Description) || line.Description.Length > MaximumLineDescriptionLength || line.Amount <= 0 || line.Amount > MaximumRevisionLineAmount || line.DiscountAmount < 0 || line.DiscountAmount > MaximumRevisionLineAmount);
                var hasImpreciseAmounts = request.Lines.Any(line => line is not null && (!HasCurrencyPrecision(line.Amount) || !HasCurrencyPrecision(line.DiscountAmount)));
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
                AddUnsupportedTextError(errors, request.Lines.SelectMany(line => line is null
                    ? [null]
                    : new[] { line.Description, line.SupplierInvoiceNumber, line.DiscountVoucherReference }));
                if (request.Lines.Any(line => line is not null && line.SupplierInvoiceNumber?.Length > MaximumPaymentReferenceLength))
                    errors.Add(new ValidationError("purchase_invoice_revision_line_supplier_number_too_long", $"A line supplier invoice number cannot exceed {MaximumPaymentReferenceLength} characters."));
                if (request.Lines.Any(line => line is not null && line.DiscountVoucherReference?.Length > MaximumPaymentReferenceLength))
                    errors.Add(new ValidationError("purchase_invoice_revision_line_discount_reference_too_long", $"A line discount voucher reference cannot exceed {MaximumPaymentReferenceLength} characters."));
            }
        }

        if (request.PaymentReference?.Length > MaximumPaymentReferenceLength)
            errors.Add(new ValidationError("purchase_invoice_revision_payment_reference_too_long", $"The payment reference cannot exceed {MaximumPaymentReferenceLength} characters."));
        if (request.SupplierInvoiceNumber?.Length > MaximumPaymentReferenceLength)
            errors.Add(new ValidationError("purchase_invoice_revision_supplier_number_too_long", $"The supplier invoice number cannot exceed {MaximumPaymentReferenceLength} characters."));
        if (request.DiscountVoucherReference?.Length > MaximumPaymentReferenceLength)
            errors.Add(new ValidationError("purchase_invoice_revision_discount_reference_too_long", $"The discount voucher reference cannot exceed {MaximumPaymentReferenceLength} characters."));
        AddUnsupportedTextError(errors, [request.Reason, request.PaymentReference, request.SupplierInvoiceNumber, request.DiscountVoucherReference]);
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

    public static bool IsGenerationSourceStale(ValidationResult validation) => validation.Errors.Count > 0 && validation.Errors.All(error => error.Code is "purchase_invoice_owner_changed" or "purchase_invoice_purchase_price_changed" or "purchase_invoice_intake_date_changed" or "purchase_invoice_processing_fee_changed" or "purchase_invoice_trailer_fee_changed" or "purchase_invoice_parking_fee_changed" or "purchase_invoice_late_charge_changed" or "purchase_invoice_discount_changed" or "purchase_invoice_total_changed");

    public static bool IsReservedOfficialNumber(string? number) => OfficialNumberPattern.IsMatch(NormalizeInvoiceNumber(number));

    public static string NormalizeInvoiceNumber(string? number) => string.Concat((number ?? "").Where(character => !char.IsWhiteSpace(character))).ToUpperInvariant();

    public static bool HasCurrencyPrecision(decimal amount) => decimal.Round(amount, 2) == amount;

    public static ValidationResult ValidateAutoCountKey(PurchaseInvoice invoice, RecordAutoCountKeyRequest request)
    {
        var errors = new List<ValidationError>();
        if (invoice.SourceType == PurchaseInvoiceSourceType.OwnerAcquisition && request.ExpectedRevision != invoice.CurrentRevisionNumber)
            errors.Add(new ValidationError("purchase_invoice_revision_stale", "This formal invoice changed after it was reviewed. Refresh before recording the AutoCount number."));
        if (invoice.AccountingStatus != AccountingConfirmationStatus.FinanceConfirmed)
            errors.Add(new ValidationError("purchase_invoice_accounting_confirmation_required", "Boss/Admin must confirm the purchase invoice before recording its AutoCount number."));
        if (string.IsNullOrWhiteSpace(request.AutoCountInvoiceNumber) || request.AutoCountInvoiceNumber.Trim().Length > 100)
            errors.Add(new ValidationError("purchase_invoice_autocount_number_required", "Enter the AutoCount purchase invoice number (maximum 100 characters)."));
        return new ValidationResult(errors);
    }

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

    private static bool IsDealerSource(Vehicle vehicle) => vehicle.PurchaseSource is VehiclePurchaseSource.Carsome or VehiclePurchaseSource.Carro or VehiclePurchaseSource.KSA;

    public static decimal EffectiveDealerCharge(Vehicle vehicle, decimal? value) => IsDealerSource(vehicle) && value is > 0 ? value.Value : 0m;

    private static void AddGenerationSnapshotError(List<ValidationError> errors, decimal? expected, decimal actual, string name)
    {
        if (expected.HasValue && expected.Value != actual)
            errors.Add(new ValidationError($"purchase_invoice_{name}_changed", "The dealer charges or formal invoice total changed. Refresh and review the invoice breakdown before issuing."));
    }
}

public static class OwnerPurchaseInvoiceFactory
{
    public static string NumberFor(DateOnly issuedDate, long sequence) => $"YSH-PINV-{issuedDate.Year}-{sequence:000000}";

    public static OwnerPurchaseInvoiceDraft CreateInitial(Vehicle vehicle, Owner owner, string invoiceNumber, DateOnly issueDate, string createdBy, DateTime now, string? createdByUserId = null)
        => CreateInitial(vehicle, owner, null, invoiceNumber, issueDate, createdBy, now, createdByUserId);

    public static OwnerPurchaseInvoiceDraft CreateInitial(Vehicle vehicle, Owner? owner, Supplier? supplier, string invoiceNumber, DateOnly issueDate, string createdBy, DateTime now, string? createdByUserId = null, string? supplierInvoiceNumber = null, DateOnly? supplierInvoiceDate = null, string? discountVoucherReference = null)
    {
        var dealerSource = vehicle.PurchaseSource is VehiclePurchaseSource.Carsome or VehiclePurchaseSource.Carro or VehiclePurchaseSource.KSA;
        var sellerType = dealerSource ? PurchaseInvoiceSellerType.Company : PurchaseInvoiceSellerType.Private;
        var sellerName = dealerSource ? supplier?.CompanyName : owner?.Name;
        var sellerPhone = dealerSource ? supplier?.Phone : owner?.Phone;
        var sellerIc = dealerSource ? null : CleanOptional(owner?.IcNumber);
        var sellerTin = dealerSource ? CleanOptional(supplier?.TinNumber) : CleanOptional(owner?.TinNumber);
        var sellerAddress = dealerSource ? CleanOptional(supplier?.Address) : CleanOptional(owner?.Address);
        var lines = CreateInitialLines(vehicle, supplierInvoiceNumber, supplierInvoiceDate, discountVoucherReference);
        var amount = lines.Sum(line => line.Amount);
        var invoice = new PurchaseInvoice
        {
            VehicleId = vehicle.Id,
            SourceType = PurchaseInvoiceSourceType.OwnerAcquisition,
            SupplierId = dealerSource ? supplier?.Id : null,
            OwnerId = owner?.Id,
            CurrentRevisionNumber = 1,
            InvoiceNumber = invoiceNumber,
            InvoiceDate = issueDate,
            PurchaseDate = vehicle.IntakeDate,
            Amount = amount,
            AccountingStatus = AccountingConfirmationStatus.Draft,
            SupplierInvoiceNumber = CleanOptional(supplierInvoiceNumber),
            SupplierInvoiceDate = supplierInvoiceDate,
            DiscountVoucherReference = CleanOptional(discountVoucherReference)
        };
        var revision = new PurchaseInvoiceRevision
        {
            PurchaseInvoiceId = invoice.Id,
            RevisionNumber = 1,
            InvoiceNumber = invoiceNumber,
            SourceVehicleId = vehicle.Id,
            SourceOwnerId = owner?.Id ?? Guid.Empty,
            InvoiceDate = issueDate,
            PurchaseDate = vehicle.IntakeDate,
            SellerName = (sellerName ?? "").Trim(),
            SellerPhone = (sellerPhone ?? "").Trim(),
            SellerIcNumber = sellerIc,
            SellerTinNumber = sellerTin,
            SellerAddress = sellerAddress,
            SellerType = sellerType,
            SellerRegistrationNumber = dealerSource ? CleanOptional(supplier?.RegistrationNumber) : null,
            SupplierInvoiceNumber = CleanOptional(supplierInvoiceNumber),
            SupplierInvoiceDate = supplierInvoiceDate,
            DiscountVoucherReference = CleanOptional(discountVoucherReference),
            VehiclePlateNumber = vehicle.PlateNumber.Trim(),
            VehicleDescription = OwnerPurchaseInvoiceRules.VehicleDescription(vehicle),
            Amount = amount,
            CreatedBy = createdBy,
            CreatedByUserId = createdByUserId,
            CreatedAt = now,
            Reason = "Initial formal issue"
        };
        lines = lines.Select((line, index) => line with
        {
            PurchaseInvoiceRevisionId = revision.Id,
            PurchaseInvoiceId = invoice.Id,
            SortOrder = index + 1
        }).ToList();
        revision = revision with { Content = OwnerPurchaseInvoicePdf.Create(revision, lines) };
        return new OwnerPurchaseInvoiceDraft(invoice, revision, lines);
    }

    private static IReadOnlyList<PurchaseInvoiceRevisionLine> CreateInitialLines(Vehicle vehicle, string? supplierInvoiceNumber, DateOnly? supplierInvoiceDate, string? discountVoucherReference)
    {
        var plate = vehicle.PlateNumber.Trim();
        var description = string.IsNullOrWhiteSpace(OwnerPurchaseInvoiceRules.VehicleDescription(vehicle))
            ? $"Vehicle purchase - {plate}"
            : $"Vehicle purchase - {plate} {OwnerPurchaseInvoiceRules.VehicleDescription(vehicle)}";
        var sourceReference = CleanOptional(supplierInvoiceNumber);
        var voucherReference = CleanOptional(discountVoucherReference);
        var lines = new List<PurchaseInvoiceRevisionLine>
        {
            new()
            {
                LineType = PurchaseInvoiceLineType.VehiclePurchase,
                Description = description,
                Amount = OwnerPurchaseInvoiceRules.GenerationAmount(vehicle) - OwnerPurchaseInvoiceRules.EffectiveDealerCharge(vehicle, vehicle.DealerDiscount),
                DiscountAmount = OwnerPurchaseInvoiceRules.EffectiveDealerCharge(vehicle, vehicle.DealerDiscount),
                CapitaliseIntoVehicleCost = true,
                SupplierInvoiceNumber = sourceReference,
                SupplierInvoiceDate = supplierInvoiceDate,
                DiscountVoucherReference = voucherReference
            }
        };

        void AddFee(PurchaseInvoiceLineType lineType, string label, decimal? amount)
        {
            if (amount is not > 0) return;
            lines.Add(new PurchaseInvoiceRevisionLine
            {
                LineType = lineType,
                Description = $"{label} - {plate}",
                Amount = amount.Value,
                DiscountAmount = 0m,
                CapitaliseIntoVehicleCost = false,
                SupplierInvoiceNumber = sourceReference,
                SupplierInvoiceDate = supplierInvoiceDate,
                DiscountVoucherReference = voucherReference
            });
        }

        AddFee(PurchaseInvoiceLineType.PurchaseProcessing, "Processing fee (purchase)", OwnerPurchaseInvoiceRules.EffectiveDealerCharge(vehicle, vehicle.DealerProcessingFee));
        AddFee(PurchaseInvoiceLineType.Transport, "Transportation fee", OwnerPurchaseInvoiceRules.EffectiveDealerCharge(vehicle, vehicle.DealerTrailerFee));
        AddFee(PurchaseInvoiceLineType.LatePaymentCharge, "Late charge", OwnerPurchaseInvoiceRules.EffectiveDealerCharge(vehicle, vehicle.DealerLateCharge));
        AddFee(PurchaseInvoiceLineType.Parking, "Parking fee", OwnerPurchaseInvoiceRules.EffectiveDealerCharge(vehicle, vehicle.DealerParkingFee));
        return lines;
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
            SellerType = currentRevision.SellerType,
            SellerRegistrationNumber = currentRevision.SellerRegistrationNumber,
            SupplierInvoiceNumber = CleanOptional(request.SupplierInvoiceNumber),
            SupplierInvoiceDate = request.SupplierInvoiceDate,
            DiscountVoucherReference = CleanOptional(request.DiscountVoucherReference),
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
            DiscountAmount = line.DiscountAmount,
            CapitaliseIntoVehicleCost = line.CapitaliseIntoVehicleCost,
            SortOrder = index + 1,
            SupplierInvoiceNumber = CleanOptional(line.SupplierInvoiceNumber),
            SupplierInvoiceDate = line.SupplierInvoiceDate,
            DiscountVoucherReference = CleanOptional(line.DiscountVoucherReference)
        }).ToList();
        revision = revision with { Content = OwnerPurchaseInvoicePdf.Create(revision, lines) };
        var current = invoice with
        {
            CurrentRevisionNumber = revision.RevisionNumber,
            InvoiceDate = revision.InvoiceDate,
            PurchaseDate = revision.PurchaseDate,
            PaymentReference = revision.PaymentReference,
            SupplierInvoiceNumber = revision.SupplierInvoiceNumber,
            SupplierInvoiceDate = revision.SupplierInvoiceDate,
            DiscountVoucherReference = revision.DiscountVoucherReference,
            Amount = revision.Amount,
            AccountingStatus = AccountingConfirmationStatus.Draft,
            AccountingConfirmedBy = null,
            AccountingConfirmedByUserId = null,
            AccountingConfirmedAt = null,
            AutoCountInvoiceNumber = null,
            AutoCountKeyed = false,
            AutoCountKeyedBy = null,
            AutoCountKeyedByUserId = null,
            AutoCountKeyedAt = null
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
            DiscountAmount = line.DiscountAmount,
            CapitaliseIntoVehicleCost = line.CapitaliseIntoVehicleCost,
            SupplierInvoiceNumber = line.SupplierInvoiceNumber,
            SupplierInvoiceDate = line.SupplierInvoiceDate,
            DiscountVoucherReference = line.DiscountVoucherReference
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
        SellerType = revision.SellerType,
        SellerRegistrationNumber = revision.SellerRegistrationNumber,
        SupplierInvoiceNumber = revision.SupplierInvoiceNumber,
        SupplierInvoiceDate = revision.SupplierInvoiceDate,
        DiscountVoucherReference = revision.DiscountVoucherReference,
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
    private const int FirstPageRowCapacity = 4;
    private const int ContinuationPageRowCapacity = 25;
    private const int FinalPageRowCapacity = 13;
    private const int RowHeight = 21;
    private const int AmountColumnRightEdge = 559;

    private sealed record PurchaseRenderRow(string Description, string? Amount);

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
            $"{line.SortOrder}. {FormatPurchaseLineDescription(line)} — {FormatMoney(line.Amount)}"));
        text.Add($"Total: {FormatMoney(revision.Amount)}");
        text.Add($"Prepared by: {revision.CreatedBy}");
        text.Add($"Prepared at (UTC): {revision.CreatedAt:yyyy-MM-dd HH:mm:ss}");
        text.Add($"Revision reason: {Display(revision.Reason)}");

        if (text.Any(value => !OwnerPurchaseInvoiceRules.IsPdfTextSupported(value)))
            throw new ArgumentException("Formal purchase invoice contains unsupported PDF text.", nameof(revision));

        var pages = Paginate(BuildRenderRows(lines));
        var allText = text
            .Append("YS HENG | FINANCE OPERATIONS")
            .Append("PURCHASE INVOICE")
            .Append("PURCHASE DETAILS")
            .Append("AMOUNT PAYABLE")
            .Append("AMOUNT IN WORDS")
            .ToList();
        return BrandedPdf.Create(
            pages.Select((page, index) => PageContent(page, index + 1, pages.Count, revision)).ToList(),
            allText.Concat(new[] { AmountInWords(revision.Amount) }));
    }

    private static string Display(string? value) => string.IsNullOrWhiteSpace(value) ? "-" : value;

    private static string FormatMoney(decimal amount) =>
        $"RM {amount.ToString("N2", CultureInfo.InvariantCulture)}";

    private static string FormatPurchaseLineDescription(PurchaseInvoiceRevisionLine line)
    {
        var label = HumanizeIdentifier(line.LineType.ToString());
        var description = Regex.Replace(line.Description?.Trim() ?? string.Empty, @"\s+", " ");

        // Older revisions may already contain prefixes such as
        // "Vehicle purchase -". Remove that prefix before adding the
        // friendly LineType label so it is not rendered twice.
        var labelPattern = string.Join(
            @"\s*",
            label.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(Regex.Escape));

        description = Regex.Replace(
                description,
                $@"^\s*{labelPattern}\s*(?:[-:–—]\s*)?",
                string.Empty,
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)
            .Trim();

        var rendered = string.IsNullOrWhiteSpace(description)
            ? label
            : $"{label}: {description}";
        return line.DiscountAmount > 0
            ? $"{rendered} (Discount {FormatMoney(line.DiscountAmount)})"
            : rendered;
    }

    private static string HumanizeIdentifier(string value)
    {
        var separatedAcronym = Regex.Replace(value, "([A-Z]+)([A-Z][a-z])", "$1 $2");
        return Regex.Replace(separatedAcronym, "([a-z0-9])([A-Z])", "$1 $2");
    }

    private static IReadOnlyList<PurchaseRenderRow> BuildRenderRows(IReadOnlyList<PurchaseInvoiceRevisionLine> lines)
    {
        var rows = new List<PurchaseRenderRow>();
        foreach (var line in lines.OrderBy(line => line.SortOrder))
        {
            var description = $"{line.SortOrder}. {FormatPurchaseLineDescription(line)}";
            var wrapped = BrandedPdf.WrapToWidth(description, 9.5, 360).ToList();
            if (wrapped.Count == 0) wrapped.Add(string.Empty);
            rows.Add(new PurchaseRenderRow(wrapped[0], FormatMoney(line.Amount)));
            rows.AddRange(wrapped.Skip(1).Select(value => new PurchaseRenderRow(value, null)));
        }
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<PurchaseRenderRow>> Paginate(IReadOnlyList<PurchaseRenderRow> rows)
    {
        if (rows.Count <= FirstPageRowCapacity) return [rows];

        var pages = new List<IReadOnlyList<PurchaseRenderRow>>
        {
            rows.Take(FirstPageRowCapacity).ToList()
        };
        var remaining = rows.Skip(FirstPageRowCapacity).ToList();
        while (remaining.Count > FinalPageRowCapacity)
        {
            var take = Math.Min(ContinuationPageRowCapacity, remaining.Count - FinalPageRowCapacity);
            pages.Add(remaining.Take(take).ToList());
            remaining = remaining.Skip(take).ToList();
        }
        pages.Add(remaining);
        return pages;
    }

    private static string PageContent(
        IReadOnlyList<PurchaseRenderRow> rows,
        int pageNumber,
        int pageCount,
        PurchaseInvoiceRevision revision)
    {
        var page = new StringBuilder();
        var versionBadge = revision.AccountingStatus == AccountingConfirmationStatus.FinanceConfirmed
            ? $"Version {revision.RevisionNumber} / Confirmed"
            : $"Version {revision.RevisionNumber} / Draft";
        BrandedPdf.Header(
            page,
            "PURCHASE INVOICE",
            revision.InvoiceNumber,
            versionBadge,
            pageNumber > 1);

        if (pageNumber == 1)
        {
            BrandedPdf.Text(page, 36, 704, 19, "Purchase Invoice", bold: true, color: BrandedPdf.Dark);
            BrandedPdf.Text(page, 36, 687, 10, "Owner acquisition record and seller payment summary", color: BrandedPdf.Muted);

            BrandedPdf.Fill(page, 36, 558, 523, 94, BrandedPdf.PaleGray);
            Field(page, 56, 626, "INVOICE NUMBER", revision.InvoiceNumber);
            Field(page, 315, 626, "ISSUED DATE", revision.InvoiceDate.ToString("dd MMMM yyyy", CultureInfo.InvariantCulture));
            Field(page, 56, 592, "VEHICLE", $"{revision.VehiclePlateNumber} {revision.VehicleDescription}".Trim());
            Field(page, 315, 592, "PURCHASE DATE", revision.PurchaseDate.ToString("dd MMMM yyyy", CultureInfo.InvariantCulture));

            BrandedPdf.Text(page, 36, 538, 9, "SELLER DETAILS", bold: true, color: BrandedPdf.Muted);
            Field(page, 36, 516, "SELLER", revision.SellerName);
            Field(page, 315, 516, "SELLER PHONE", revision.SellerPhone);
            Field(page, 36, 480, "SELLER IC", Display(revision.SellerIcNumber));
            Field(page, 315, 480, "SELLER TIN", Display(revision.SellerTinNumber));
            BrandedPdf.Text(page, 36, 446, 9, "SELLER ADDRESS", bold: true, color: BrandedPdf.Muted);
            BrandedPdf.TextBlock(page, 36, 431, 9.5, Display(revision.SellerAddress), 523, 12, 2, BrandedPdf.Dark);
            BrandedPdf.TextBlock(page, 36, 396, 9, $"Payment reference: {Display(revision.PaymentReference)}", 523, 12, 1, BrandedPdf.Muted);
            BrandedPdf.Line(page, 36, 376, 559, 376, BrandedPdf.Rule);
        }
        else
        {
            BrandedPdf.Text(page, 36, 704, 14, "Invoice details continued", bold: true, color: BrandedPdf.Dark);
            BrandedPdf.Line(page, 36, 690, 559, 690, BrandedPdf.Rule);
        }

        var tableHeaderY = pageNumber == 1 ? 348 : 660;
        var baseline = tableHeaderY - 26;
        BrandedPdf.Fill(page, 36, tableHeaderY, 523, 27, BrandedPdf.Navy);
        BrandedPdf.Text(page, 54, tableHeaderY + 9, 9, "PURCHASE DETAILS", bold: true, color: "1 1 1");
        BrandedPdf.Text(page, 470, tableHeaderY + 9, 9, "AMOUNT (RM)", bold: true, color: "1 1 1");

        foreach (var row in rows)
        {
            BrandedPdf.Text(page, 54, baseline, 9.5, row.Description, color: BrandedPdf.Dark);
            if (row.Amount is not null)
                BrandedPdf.Text(page, RightAlignedX(row.Amount, 9.5), baseline, 9.5, row.Amount, color: BrandedPdf.Dark);
            BrandedPdf.Line(page, 36, baseline - 9, 559, baseline - 9, BrandedPdf.Rule);
            baseline -= RowHeight;
        }

        if (pageNumber == pageCount)
            RenderFinalSection(page, baseline, revision);

        BrandedPdf.Footer(
            page,
            $"{revision.InvoiceNumber}  |  Version {revision.RevisionNumber}",
            pageNumber,
            pageCount,
            "YS Heng - Finance copy");

        return page.ToString();
    }

    private static void Field(StringBuilder page, double x, double y, string label, string value)
    {
        BrandedPdf.Text(page, x, y, 7.5, label, bold: true, color: BrandedPdf.Blue);
        BrandedPdf.TextBlock(page, x, y - 14, 9.5, Display(value), 224, 12, 2, BrandedPdf.Dark);
    }

    private static int RightAlignedX(string value, double fontSize) =>
        Math.Max(36, (int)Math.Round(AmountColumnRightEdge - BrandedPdf.EstimatedWidth(value, fontSize)));

    private static void RenderFinalSection(StringBuilder page, int nextBaseline, PurchaseInvoiceRevision revision)
    {
        var totalTop = Math.Min(nextBaseline - 10, 300);
        var totalBottom = totalTop - 78;
        BrandedPdf.Fill(page, 36, totalBottom, 523, 78, BrandedPdf.PaleBlue);
        BrandedPdf.Text(page, 56, totalTop - 14, 7.5, "AMOUNT PAYABLE", bold: true, color: BrandedPdf.Blue);
        BrandedPdf.Text(page, 56, totalTop - 25, 9, "TOTAL", bold: true, color: BrandedPdf.Blue);
        BrandedPdf.Text(page, 56, totalTop - 56, 25, FormatMoney(revision.Amount), bold: true, color: BrandedPdf.Navy);
        BrandedPdf.Text(page, 315, totalTop - 25, 9, "AMOUNT IN WORDS", bold: true, color: BrandedPdf.Blue);
        BrandedPdf.TextBlock(page, 315, totalTop - 43, 9.5, AmountInWords(revision.Amount), 220, 12, 3, BrandedPdf.Dark);

        BrandedPdf.Text(page, 36, totalBottom - 18, 8, $"Prepared by: {revision.CreatedBy}", color: BrandedPdf.Muted);
        BrandedPdf.Text(page, 36, totalBottom - 32, 8, $"Prepared at (UTC): {revision.CreatedAt:yyyy-MM-dd HH:mm:ss}", color: BrandedPdf.Muted);
        BrandedPdf.TextBlock(page, 315, totalBottom - 18, 8, $"Revision reason: {Display(revision.Reason)}", 244, 11, 2, BrandedPdf.Muted);

        var authorizationY = totalBottom - 61;
        BrandedPdf.Text(page, 36, authorizationY, 8, "AUTHORIZATION", bold: true, color: BrandedPdf.Muted);
        BrandedPdf.Text(page, 36, authorizationY - 16, 8, "Prepared / checked for finance records", color: BrandedPdf.Dark);
        BrandedPdf.Line(page, 36, authorizationY - 37, 188, authorizationY - 37, BrandedPdf.Rule);
        BrandedPdf.Line(page, 232, authorizationY - 37, 384, authorizationY - 37, BrandedPdf.Rule);
        BrandedPdf.Line(page, 428, authorizationY - 37, 559, authorizationY - 37, BrandedPdf.Rule);
        BrandedPdf.Text(page, 36, authorizationY - 50, 7.5, "Prepared by", color: BrandedPdf.Muted);
        BrandedPdf.Text(page, 232, authorizationY - 50, 7.5, "Checked by", color: BrandedPdf.Muted);
        BrandedPdf.Text(page, 428, authorizationY - 50, 7.5, "Finance confirmation", color: BrandedPdf.Muted);
    }

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
