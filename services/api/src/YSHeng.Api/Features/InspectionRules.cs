using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record InspectionReminderDates(
    DateOnly BookingReminderDate,
    DateOnly AppointmentReminderDate,
    DateOnly ReportExpiryReminderDate,
    DateOnly? LorryAppointmentReminderDate);

public sealed record InspectionReceiptAllocation(Guid VehicleId, decimal Amount);

public sealed record CreateInspectionRequest(
    Guid VehicleId,
    InspectionType Type,
    InspectionCompany Company,
    bool IsLorry,
    DateOnly AppointmentDate,
    TimeOnly? AppointmentTime,
    string BookingReference,
    string SourceReceiptNumber,
    decimal ReceiptTotal,
    decimal AllocatedAmount,
    string? Notes,
    string? SupplierInvoiceReference = null);

public sealed record SupplierInvoiceReferenceAvailability(
    bool Available,
    string? SuggestedInvoiceNumber);

public sealed record UpdateInspectionRequest(
    InspectionType Type,
    InspectionCompany Company,
    InspectionStatus Status,
    bool IsLorry,
    DateOnly AppointmentDate,
    TimeOnly? AppointmentTime,
    string BookingReference,
    decimal ReceiptTotal,
    decimal AllocatedAmount,
    string? Notes);

public static class InspectionRules
{
    public static readonly IReadOnlyList<InspectionType> SupportedTypes =
    [
        InspectionType.Awalan,
        InspectionType.Berkala,
        InspectionType.Khas,
        InspectionType.BerkalaSemula,
        InspectionType.PertukaranHakMilik
    ];

    public static bool IsInspectionCategory(FileCategory category) => category is
        FileCategory.InspectionReceipt or
        FileCategory.InspectionAppointmentConfirmation or
        FileCategory.InspectionReport;

    public static ValidationResult Validate(CreateInspectionRequest request, IEnumerable<InspectionRecord> existing)
    {
        var errors = new List<ValidationError>();
        if (request.VehicleId == Guid.Empty) errors.Add(new("inspection_vehicle_required", "Select a vehicle for the inspection."));
        if (!SupportedTypes.Contains(request.Type)) errors.Add(new("inspection_type_invalid", "Select a supported inspection type."));
        if (!Enum.IsDefined(request.Company)) errors.Add(new("inspection_company_invalid", "Select a supported inspection company."));
        if (request.AppointmentDate == default) errors.Add(new("inspection_appointment_required", "Appointment date is required."));
        if (string.IsNullOrWhiteSpace(request.BookingReference)) errors.Add(new("inspection_booking_reference_required", "Appointment confirmation reference is required."));
        if (string.IsNullOrWhiteSpace(request.SourceReceiptNumber)) errors.Add(new("inspection_receipt_number_required", "Receipt number is required."));
        if (string.IsNullOrWhiteSpace(request.SupplierInvoiceReference)) errors.Add(new("inspection_supplier_invoice_reference_required", "Supplier invoice number is required."));
        if (request.ReceiptTotal < 0 || request.AllocatedAmount < 0) errors.Add(new("inspection_receipt_amount_invalid", "Receipt amounts cannot be negative."));
        if (request.AllocatedAmount > request.ReceiptTotal) errors.Add(new("inspection_receipt_amount_exceeds_total", "Allocated amount cannot exceed the receipt total."));
        if (existing.Any(item => item.VehicleId == request.VehicleId && string.Equals(item.SourceReceiptNumber.Trim(), request.SourceReceiptNumber.Trim(), StringComparison.OrdinalIgnoreCase)))
            errors.Add(new("inspection_receipt_vehicle_duplicate", "This receipt is already linked to the selected vehicle."));
        return new ValidationResult(errors);
    }

    public static string NormalizeSupplierInvoiceReference(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "" : value.Trim().ToUpperInvariant();

    public static SupplierInvoiceReferenceAvailability CheckSupplierInvoiceReference(
        string? value,
        IEnumerable<InspectionRecord> existing)
    {
        var trimmed = value?.Trim() ?? "";
        var normalized = NormalizeSupplierInvoiceReference(trimmed);
        if (normalized.Length == 0)
        {
            return new SupplierInvoiceReferenceAvailability(false, null);
        }

        var used = existing
            .Select(item => NormalizeSupplierInvoiceReference(item.SupplierInvoiceReference))
            .Where(reference => reference.Length > 0)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (!used.Contains(normalized))
        {
            return new SupplierInvoiceReferenceAvailability(true, null);
        }

        var root = SupplierInvoiceReferenceRoot(trimmed);
        for (var suffix = 1; suffix < int.MaxValue; suffix++)
        {
            var candidate = $"{root} ({suffix})";
            if (!used.Contains(NormalizeSupplierInvoiceReference(candidate)))
            {
                return new SupplierInvoiceReferenceAvailability(false, candidate);
            }
        }

        return new SupplierInvoiceReferenceAvailability(false, null);
    }

    private static string SupplierInvoiceReferenceRoot(string value)
    {
        var close = value.EndsWith(')') ? value.LastIndexOf(" (", StringComparison.Ordinal) : -1;
        if (close > 0 && int.TryParse(value[(close + 2)..^1], out var suffix) && suffix >= 0)
        {
            return value[..close].Trim();
        }

        return value;
    }

    public static ValidationResult Validate(UpdateInspectionRequest request)
    {
        var errors = new List<ValidationError>();
        if (!SupportedTypes.Contains(request.Type)) errors.Add(new("inspection_type_invalid", "Select a supported inspection type."));
        if (!Enum.IsDefined(request.Company)) errors.Add(new("inspection_company_invalid", "Select a supported inspection company."));
        if (!Enum.IsDefined(request.Status)) errors.Add(new("inspection_status_invalid", "Select a supported inspection status."));
        if (request.AppointmentDate == default) errors.Add(new("inspection_appointment_required", "Appointment date is required."));
        if (string.IsNullOrWhiteSpace(request.BookingReference)) errors.Add(new("inspection_booking_reference_required", "Appointment confirmation reference is required."));
        if (request.ReceiptTotal < 0 || request.AllocatedAmount < 0) errors.Add(new("inspection_receipt_amount_invalid", "Receipt amounts cannot be negative."));
        if (request.AllocatedAmount > request.ReceiptTotal) errors.Add(new("inspection_receipt_amount_exceeds_total", "Allocated amount cannot exceed the receipt total."));
        return new ValidationResult(errors);
    }

    public static InspectionRecord PrepareCreate(CreateInspectionRequest request, string actor, string supplierInvoiceReference) => new()
    {
        VehicleId = request.VehicleId,
        Type = request.Type,
        Company = request.Company,
        IsLorry = request.IsLorry,
        AppointmentDate = request.AppointmentDate,
        AppointmentTime = request.AppointmentTime,
        ReportExpiryDate = ReportExpiryDate(request.AppointmentDate),
        BookingReference = request.BookingReference.Trim(),
        SourceReceiptNumber = request.SourceReceiptNumber.Trim(),
        ReceiptTotal = request.ReceiptTotal,
        AllocatedAmount = request.AllocatedAmount,
        SupplierInvoiceReference = supplierInvoiceReference,
        Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
        CreatedBy = actor
    };

    public static InspectionRecord ApplyUpdate(InspectionRecord existing, UpdateInspectionRequest request, string actor) => existing with
    {
        Type = request.Type,
        Company = request.Company,
        Status = request.Status,
        IsLorry = request.IsLorry,
        AppointmentDate = request.AppointmentDate,
        AppointmentTime = request.AppointmentTime,
        ReportExpiryDate = ReportExpiryDate(request.AppointmentDate),
        BookingReference = request.BookingReference.Trim(),
        ReceiptTotal = request.ReceiptTotal,
        AllocatedAmount = request.AllocatedAmount,
        Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
        CompletedAt = request.Status == InspectionStatus.Completed ? existing.CompletedAt ?? DateTime.UtcNow : null,
        CompletedBy = request.Status == InspectionStatus.Completed ? actor : null
    };

    public static DateOnly ReportExpiryDate(DateOnly inspectionDate) => inspectionDate.AddMonths(4);

    public static InspectionReminderDates ReminderDates(DateOnly inspectionDate, bool isLorry)
    {
        var expiry = ReportExpiryDate(inspectionDate);
        return new InspectionReminderDates(
            expiry.AddMonths(-2),
            inspectionDate.AddDays(-1),
            expiry.AddDays(-7),
            isLorry ? inspectionDate.AddDays(-7) : null);
    }

    public static ValidationResult ValidateReceiptAllocations(
        decimal receiptTotal,
        IReadOnlyCollection<InspectionReceiptAllocation> allocations)
    {
        if (receiptTotal < 0)
        {
            return new ValidationResult([new ValidationError("inspection_receipt_total_invalid", "Receipt total cannot be negative.")]);
        }

        if (allocations.Count == 0)
        {
            return new ValidationResult([new ValidationError("inspection_receipt_allocation_required", "Allocate the receipt to at least one vehicle.")]);
        }

        if (allocations.Any(item => item.VehicleId == Guid.Empty || item.Amount < 0))
        {
            return new ValidationResult([new ValidationError("inspection_receipt_allocation_invalid", "Each receipt allocation needs a vehicle and a non-negative amount.")]);
        }

        if (allocations.GroupBy(item => item.VehicleId).Any(group => group.Count() > 1))
        {
            return new ValidationResult([new ValidationError("inspection_receipt_vehicle_duplicate", "A vehicle can appear only once in a receipt allocation.")]);
        }

        var allocatedTotal = allocations.Sum(item => item.Amount);
        return allocatedTotal == receiptTotal
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError("inspection_receipt_allocation_mismatch", "Allocated amounts must match the receipt total.")]);
    }

}
