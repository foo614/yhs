using System.Text;
using SkiaSharp;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record DeliveryPicOption(string Id, string DisplayName);
public sealed record DeliveryCancelRequest(string Reason);
public sealed record DeliveryInvoiceUpdateRequest(string Reason);
public sealed record DeliveryBuyerCorrectionRequest(Guid CustomerId, string Reason);
public sealed record DeliveryInvoiceUpdateQueueItem(
    Guid Id,
    Guid VehicleId,
    string PlateNumber,
    string VehicleLabel,
    string CustomerName,
    string RequestReason,
    DateTime RequestedAt);

public sealed record DeliveryWorkboardItem(
    Guid Id,
    Guid VehicleId,
    string PlateNumber,
    string VehicleLabel,
    Guid CustomerId,
    string CustomerName,
    string PicUserId,
    string PicName,
    DeliveryType DeliveryType,
    DateOnly ScheduledDate,
    TimeOnly? ScheduledTime,
    string? DeliveryAddress,
    string? TransportMethod,
    string? RescheduleReason,
    string? CancellationReason,
    DeliveryStatus Status,
    DeliveryStage Stage,
    string StageLabel,
    string NextAction,
    string? Blocker,
    bool FinanceCleared,
    bool CanRelease,
    bool Terminal,
    bool PolishDone,
    bool TintedDone,
    bool WashDone,
    bool DocumentsPrepared,
    bool InspectionDone,
    string? InspectionBookingReference,
    string? InspectionReportReference,
    bool NotificationSent,
    bool TwoDayNoticeSent,
    bool InsuranceHandled,
    string? InsurancePolicyReference,
    DateOnly? InsuranceExpiryDate,
    bool RoadTaxHandled,
    string? RoadTaxReceiptReference,
    DateOnly? RoadTaxExpiryDate,
    bool WindscreenInsuranceHandled,
    string? WindscreenPolicyReference,
    DateOnly? WindscreenInsuranceExpiryDate,
    bool HandoverPhotoCaptured,
    bool SignedHandoverReceived,
    bool CustomerAcknowledged,
    bool FinalChecklistConfirmed,
    bool InvoiceUpdateRequested,
    string? InvoiceUpdateRequestReason,
    IReadOnlyList<FileCategory> MissingCategories,
    IReadOnlyList<DeliveryEvidenceItem> Evidence);

public sealed record SalesAgentOption(string Id, string DisplayName);
public sealed record SalesWorkboardItem(
    Guid VehicleId,
    string PlateNumber,
    string VehicleLabel,
    string SalesAgentUserId,
    string SalesAgentName,
    string Process,
    string ResponsibleDepartment,
    string NextAction,
    DateTime? SoldAt);
public sealed record SalesWorkboardResponse(
    int SoldThisMonth,
    int InProgressCount,
    IReadOnlyList<SalesAgentOption> AvailableAgents,
    IReadOnlyList<SalesWorkboardItem> Items);

public sealed record DeliveryContentValidation(bool IsValid, string? MimeType, ValidationError? Error);

public static class DeliveryWorkboardRules
{
    public static bool IsActive(DeliverySchedule delivery) =>
        delivery.Status is not (DeliveryStatus.Released or DeliveryStatus.Cancelled);

    public static bool HasOpenInvoiceUpdateRequest(DeliverySchedule delivery) =>
        delivery.InvoiceUpdateRequestedAt.HasValue &&
        (!delivery.InvoiceUpdateResolvedAt.HasValue || delivery.InvoiceUpdateResolvedAt < delivery.InvoiceUpdateRequestedAt);

    public static ValidationResult ValidateSingleActive(Guid vehicleId, Guid? currentDeliveryId, IEnumerable<DeliverySchedule> deliveries) =>
        deliveries.Any(delivery =>
            delivery.VehicleId == vehicleId &&
            delivery.Id != currentDeliveryId &&
            IsActive(delivery))
            ? new ValidationResult([new ValidationError("delivery_active_exists", "This vehicle already has an active delivery plan.")])
            : new ValidationResult([]);

    public static DeliveryWorkboardItem CreateItem(
        DeliverySchedule delivery,
        Vehicle vehicle,
        Customer customer,
        bool financeCleared,
        IEnumerable<DocumentBlob> documents,
        DateOnly? today = null)
    {
        var documentCheck = DeliveryDocumentRules.CheckCompleteness(delivery, documents);
        var stage = StageFor(delivery, financeCleared, documentCheck, today);
        var nextAction = NextAction(delivery, financeCleared, documentCheck, stage, today);
        var blocker = Blocker(delivery, financeCleared, documentCheck, stage, today);
        var canRelease = CanRelease(delivery, financeCleared, documentCheck, today);

        return new DeliveryWorkboardItem(
            delivery.Id,
            vehicle.Id,
            vehicle.PlateNumber,
            $"{vehicle.Make} {vehicle.Model}".Trim(),
            customer.Id,
            customer.Name,
            delivery.PicUserId ?? "",
            delivery.Pic,
            delivery.DeliveryType,
            delivery.ScheduledDate,
            delivery.ScheduledTime,
            delivery.DeliveryAddress,
            delivery.TransportMethod,
            delivery.RescheduleReason,
            delivery.CancellationReason,
            delivery.Status,
            stage,
            LabelFor(stage),
            nextAction,
            blocker,
            financeCleared,
            canRelease,
            !IsActive(delivery),
            delivery.PolishDone,
            delivery.TintedDone,
            delivery.WashDone,
            delivery.DocumentsPrepared,
            delivery.InspectionDone,
            delivery.InspectionBookingReference,
            delivery.InspectionReportReference,
            delivery.NotificationSent,
            delivery.TwoDayNoticeSent,
            delivery.InsuranceHandled,
            delivery.InsurancePolicyReference,
            delivery.InsuranceExpiryDate,
            delivery.RoadTaxHandled,
            delivery.RoadTaxReceiptReference,
            delivery.RoadTaxExpiryDate,
            delivery.WindscreenInsuranceHandled,
            delivery.WindscreenPolicyReference,
            delivery.WindscreenInsuranceExpiryDate,
            delivery.HandoverPhotoCaptured,
            delivery.SignedHandoverReceived,
            delivery.CustomerAcknowledged,
            delivery.FinalChecklistConfirmed,
            HasOpenInvoiceUpdateRequest(delivery),
            HasOpenInvoiceUpdateRequest(delivery) ? delivery.InvoiceUpdateRequestReason : null,
            documentCheck.MissingCategories,
            documentCheck.Evidence);
    }

    public static DeliveryStage StageFor(DeliverySchedule delivery, bool financeCleared, DeliveryDocumentCheck documents, DateOnly? today = null)
    {
        if (delivery.Status == DeliveryStatus.Released) return DeliveryStage.Completed;
        if (delivery.Status == DeliveryStatus.Cancelled) return DeliveryStage.Cancelled;
        if (!delivery.CustomerId.HasValue || string.IsNullOrWhiteSpace(delivery.PicUserId)) return DeliveryStage.PlanDelivery;
        if (delivery.ScheduledDate == default || !delivery.ScheduledTime.HasValue) return DeliveryStage.PlanDelivery;
        if (string.IsNullOrWhiteSpace(delivery.InspectionBookingReference)) return DeliveryStage.PlanDelivery;
        if (!PreparationComplete(delivery, documents)) return DeliveryStage.PrepareCar;
        if (!DocumentsClear(delivery, financeCleared, documents, today)) return DeliveryStage.ClearDocuments;
        return DeliveryStage.Handover;
    }

    public static bool CanRelease(DeliverySchedule delivery, bool financeCleared, DeliveryDocumentCheck documents, DateOnly? today = null) =>
        IsActive(delivery) &&
        delivery.CustomerId.HasValue &&
        !string.IsNullOrWhiteSpace(delivery.PicUserId) &&
        delivery.ScheduledDate != default &&
        delivery.ScheduledTime.HasValue &&
        !string.IsNullOrWhiteSpace(delivery.InspectionBookingReference) &&
        !HasOpenInvoiceUpdateRequest(delivery) &&
        financeCleared &&
        documents.IsComplete &&
        DeliveryRules.IsReadyForRelease(delivery, today);

    public static string LabelFor(DeliveryStage stage) => stage switch
    {
        DeliveryStage.PlanDelivery => "Plan delivery",
        DeliveryStage.PrepareCar => "Prepare car",
        DeliveryStage.ClearDocuments => "Clear documents",
        DeliveryStage.Handover => "Handover",
        DeliveryStage.Completed => "Completed",
        DeliveryStage.Cancelled => "Cancelled",
        _ => stage.ToString()
    };

    public static string NextAction(DeliverySchedule delivery, bool financeCleared, DeliveryDocumentCheck documents, DeliveryStage? resolvedStage = null, DateOnly? today = null)
    {
        var stage = resolvedStage ?? StageFor(delivery, financeCleared, documents, today);
        if (stage == DeliveryStage.Completed) return "Released";
        if (stage == DeliveryStage.Cancelled) return "Cancelled";
        if (!delivery.CustomerId.HasValue) return "Buyer not locked";
        if (string.IsNullOrWhiteSpace(delivery.PicUserId)) return "Assign delivery PIC";
        if (delivery.ScheduledDate == default) return "Set delivery date";
        if (!delivery.ScheduledTime.HasValue) return "Set delivery time";
        if (string.IsNullOrWhiteSpace(delivery.InspectionBookingReference)) return "Add inspection booking";
        if (!delivery.InspectionDone) return "Complete inspection";
        if (documents.MissingCategories.Contains(FileCategory.InspectionReport)) return "Upload inspection report";
        if (!delivery.PolishDone) return "Mark polish complete";
        if (!delivery.TintedDone) return "Mark tint complete";
        if (!delivery.WashDone) return "Mark car wash complete";
        if (!delivery.DocumentsPrepared || documents.MissingCategories.Contains(FileCategory.DeliveryDocument)) return "Prepare delivery documents";
        if (!delivery.InsuranceHandled || documents.MissingCategories.Contains(FileCategory.Policy)) return "Clear insurance";
        if (!delivery.RoadTaxHandled || documents.MissingCategories.Contains(FileCategory.RoadTaxReceipt)) return "Clear road tax";
        if (!delivery.WindscreenInsuranceHandled || documents.MissingCategories.Contains(FileCategory.WindscreenPolicy)) return "Clear windscreen insurance";
        if (DeliveryRules.ExpiredDeliveryDocuments(delivery, today).Count > 0) return "Update expired coverage";
        if (!delivery.TwoDayNoticeSent) return "Notify customer";
        if (!financeCleared) return "Wait for Finance clearance";
        if (HasOpenInvoiceUpdateRequest(delivery)) return "Wait for Finance invoice update";
        if (documents.MissingCategories.Contains(FileCategory.HandoverPhoto)) return "Upload handover photo";
        if (documents.MissingCategories.Contains(FileCategory.SignedHandover)) return "Upload signed handover";
        if (!delivery.CustomerAcknowledged) return "Confirm customer acknowledgement";
        if (!delivery.FinalChecklistConfirmed) return "Confirm final checklist";
        return "Release vehicle";
    }

    public static string? Blocker(DeliverySchedule delivery, bool financeCleared, DeliveryDocumentCheck documents, DeliveryStage? resolvedStage = null, DateOnly? today = null)
    {
        var action = NextAction(delivery, financeCleared, documents, resolvedStage, today);
        return action switch
        {
            "Buyer not locked" => "Delivery buyer is not locked or no longer matches the vehicle.",
            "Assign delivery PIC" => "Delivery PIC is missing or inactive.",
            "Wait for Finance clearance" => "Finance has not cleared payment yet.",
            "Wait for Finance invoice update" => "Finance has not resolved the invoice update request yet.",
            "Update expired coverage" => string.Join("; ", DeliveryRules.ExpiredDeliveryDocuments(delivery, today)),
            _ => null
        };
    }

    private static bool PreparationComplete(DeliverySchedule delivery, DeliveryDocumentCheck documents) =>
        delivery.InspectionDone &&
        !documents.MissingCategories.Contains(FileCategory.InspectionReport) &&
        delivery.PolishDone &&
        delivery.TintedDone &&
        delivery.WashDone;

    private static bool DocumentsClear(DeliverySchedule delivery, bool financeCleared, DeliveryDocumentCheck documents, DateOnly? today) =>
        delivery.DocumentsPrepared &&
        !documents.MissingCategories.Contains(FileCategory.DeliveryDocument) &&
        delivery.InsuranceHandled &&
        !documents.MissingCategories.Contains(FileCategory.Policy) &&
        delivery.RoadTaxHandled &&
        !documents.MissingCategories.Contains(FileCategory.RoadTaxReceipt) &&
        delivery.WindscreenInsuranceHandled &&
        !documents.MissingCategories.Contains(FileCategory.WindscreenPolicy) &&
        DeliveryRules.ExpiredDeliveryDocuments(delivery, today).Count == 0 &&
        delivery.TwoDayNoticeSent &&
        financeCleared &&
        !HasOpenInvoiceUpdateRequest(delivery);
}

public static class DeliveryMutationRules
{
    public static string VehicleAdvisoryLockKey(Guid vehicleId) => $"delivery-vehicle:{vehicleId:N}";
    public static string DeliveryAdvisoryLockKey(Guid deliveryId) => $"delivery:{deliveryId:N}";

    public static IReadOnlyList<Guid> OrderedVehicleLockIds(IEnumerable<Guid> vehicleIds) =>
        vehicleIds.Distinct().Order().ToList();

    public static ValidationResult ValidateCreateEligibility(Vehicle vehicle, IEnumerable<DeliverySchedule> deliveries)
    {
        if (vehicle.Status == VehicleStatus.Sold)
        {
            return new ValidationResult([new ValidationError("delivery_vehicle_sold", "A sold vehicle cannot have a new delivery plan.")]);
        }
        if (deliveries.Any(delivery => delivery.VehicleId == vehicle.Id && delivery.Status == DeliveryStatus.Released))
        {
            return new ValidationResult([new ValidationError("delivery_already_released", "This vehicle has already been released and cannot have another delivery plan.")]);
        }
        return new ValidationResult([]);
    }

    public static ValidationResult ValidateVehicleCustomerChange(
        Vehicle existing,
        Vehicle update,
        IEnumerable<DeliverySchedule> deliveries)
    {
        if (existing.CustomerId == update.CustomerId) return new ValidationResult([]);
        return deliveries.Any(delivery =>
                delivery.VehicleId == existing.Id &&
                delivery.Status != DeliveryStatus.Cancelled)
            ? new ValidationResult([new ValidationError(
                "vehicle_customer_delivery_locked",
                "The confirmed buyer is locked by delivery history. Use the controlled delivery buyer correction action.")])
            : new ValidationResult([]);
    }

    public static DateOnly? AuthoritativeOutstationDate(Guid vehicleId, IEnumerable<DeliverySchedule> deliveries)
    {
        var delivery = deliveries
            .Where(item => item.VehicleId == vehicleId && item.Status != DeliveryStatus.Cancelled)
            .OrderBy(item => item.Status == DeliveryStatus.Released)
            .ThenByDescending(item => item.ReleasedAt)
            .ThenByDescending(item => item.ScheduledDate)
            .FirstOrDefault();
        return delivery?.DeliveryType == DeliveryType.Outstation ? delivery.ScheduledDate : null;
    }

    public static DeliverySchedule PrepareCreate(DeliverySchedule incoming, Guid customerId, string picUserId, string picName) => incoming with
    {
        Id = Guid.NewGuid(),
        CustomerId = customerId,
        PicUserId = picUserId,
        Pic = picName,
        Status = DeliveryStatus.BookingInspection,
        RescheduleReason = null,
        CancellationReason = null,
        InspectionBookingReference = null,
        PolishDone = false,
        TintedDone = false,
        WashDone = false,
        DocumentsPrepared = false,
        InspectionDone = false,
        InspectionReportReference = null,
        NotificationSent = false,
        TwoDayNoticeSent = false,
        InsuranceHandled = false,
        InsurancePolicyReference = null,
        InsuranceExpiryDate = null,
        RoadTaxHandled = false,
        RoadTaxReceiptReference = null,
        RoadTaxExpiryDate = null,
        WindscreenInsuranceHandled = false,
        WindscreenPolicyReference = null,
        WindscreenInsuranceExpiryDate = null,
        HandoverPhotoCaptured = false,
        SignedHandoverReceived = false,
        CustomerAcknowledged = false,
        FinalChecklistConfirmed = false,
        ReleasedAt = null,
        ReleasedByUserId = null,
        InvoiceUpdateRequestedAt = null,
        InvoiceUpdateRequestedByUserId = null,
        InvoiceUpdateRequestReason = null,
        InvoiceUpdateResolvedAt = null,
        InvoiceUpdateResolvedByUserId = null
    };

    public static DeliverySchedule PrepareUpdate(DeliverySchedule existing, DeliverySchedule incoming, string picUserId, string picName) => incoming with
    {
        Id = existing.Id,
        VehicleId = existing.VehicleId,
        CustomerId = existing.CustomerId,
        PicUserId = picUserId,
        Pic = picName,
        Status = existing.Status,
        RescheduleReason = ScheduleChanged(existing, incoming)
            ? incoming.RescheduleReason?.Trim()
            : existing.RescheduleReason,
        CancellationReason = existing.CancellationReason,
        HandoverPhotoCaptured = existing.HandoverPhotoCaptured,
        SignedHandoverReceived = existing.SignedHandoverReceived,
        ReleasedAt = existing.ReleasedAt,
        ReleasedByUserId = existing.ReleasedByUserId,
        InvoiceUpdateRequestedAt = existing.InvoiceUpdateRequestedAt,
        InvoiceUpdateRequestedByUserId = existing.InvoiceUpdateRequestedByUserId,
        InvoiceUpdateRequestReason = existing.InvoiceUpdateRequestReason,
        InvoiceUpdateResolvedAt = existing.InvoiceUpdateResolvedAt,
        InvoiceUpdateResolvedByUserId = existing.InvoiceUpdateResolvedByUserId
    };

    public static bool ScheduleChanged(DeliverySchedule before, DeliverySchedule after) =>
        before.ScheduledDate != after.ScheduledDate ||
        before.ScheduledTime != after.ScheduledTime ||
        before.DeliveryType != after.DeliveryType ||
        !string.Equals(before.DeliveryAddress?.Trim(), after.DeliveryAddress?.Trim(), StringComparison.Ordinal) ||
        !string.Equals(before.TransportMethod?.Trim(), after.TransportMethod?.Trim(), StringComparison.Ordinal);

    public static string ActivitySummary(DeliverySchedule before, DeliverySchedule after)
    {
        if (ScheduleChanged(before, after)) return $"Delivery rescheduled: {after.RescheduleReason?.Trim()}";
        if (!string.Equals(before.PicUserId, after.PicUserId, StringComparison.Ordinal)) return $"PIC assigned to {after.Pic}";

        var changed = new List<string>();
        AddChanged(changed, before.InspectionBookingReference, after.InspectionBookingReference, "inspection booking");
        AddChanged(changed,
            before.InspectionDone != after.InspectionDone ||
            !string.Equals(before.InspectionReportReference?.Trim(), after.InspectionReportReference?.Trim(), StringComparison.Ordinal),
            "inspection");
        AddChanged(changed, before.PolishDone, after.PolishDone, "polish");
        AddChanged(changed, before.TintedDone, after.TintedDone, "tint");
        AddChanged(changed, before.WashDone, after.WashDone, "car wash");
        AddChanged(changed, before.DocumentsPrepared, after.DocumentsPrepared, "delivery documents");
        AddChanged(changed,
            before.InsuranceHandled != after.InsuranceHandled ||
            before.InsuranceExpiryDate != after.InsuranceExpiryDate ||
            !string.Equals(before.InsurancePolicyReference?.Trim(), after.InsurancePolicyReference?.Trim(), StringComparison.Ordinal),
            "insurance");
        AddChanged(changed,
            before.RoadTaxHandled != after.RoadTaxHandled ||
            before.RoadTaxExpiryDate != after.RoadTaxExpiryDate ||
            !string.Equals(before.RoadTaxReceiptReference?.Trim(), after.RoadTaxReceiptReference?.Trim(), StringComparison.Ordinal),
            "road tax");
        AddChanged(changed,
            before.WindscreenInsuranceHandled != after.WindscreenInsuranceHandled ||
            before.WindscreenInsuranceExpiryDate != after.WindscreenInsuranceExpiryDate ||
            !string.Equals(before.WindscreenPolicyReference?.Trim(), after.WindscreenPolicyReference?.Trim(), StringComparison.Ordinal),
            "windscreen insurance");
        AddChanged(changed,
            before.NotificationSent != after.NotificationSent || before.TwoDayNoticeSent != after.TwoDayNoticeSent,
            "customer notice");
        AddChanged(changed, before.CustomerAcknowledged, after.CustomerAcknowledged, "customer acknowledgement");
        AddChanged(changed, before.FinalChecklistConfirmed, after.FinalChecklistConfirmed, "final checklist");
        return changed.Count == 0 ? "Delivery details updated" : $"Updated {string.Join(", ", changed)}";
    }

    public static ValidationResult ValidateReschedule(DeliverySchedule before, DeliverySchedule after)
    {
        if (!ScheduleChanged(before, after)) return new ValidationResult([]);
        if (string.IsNullOrWhiteSpace(after.RescheduleReason))
        {
            return new ValidationResult([new ValidationError("delivery_reschedule_reason_required", "Give a reason when changing the delivery schedule.")]);
        }
        return after.RescheduleReason.Trim().Length > 500
            ? new ValidationResult([new ValidationError("delivery_reschedule_reason_too_long", "Reschedule reason must be 500 characters or fewer.")])
            : new ValidationResult([]);
    }

    public static ValidationResult ValidateActiveSchedule(DeliverySchedule delivery) =>
        !delivery.ScheduledTime.HasValue
            ? new ValidationResult([new ValidationError("delivery_schedule_time_required", "Delivery schedule time is required.")])
            : new ValidationResult([]);

    public static ValidationResult ValidateReason(string? reason, string code, string message)
    {
        if (string.IsNullOrWhiteSpace(reason)) return new ValidationResult([new ValidationError(code, message)]);
        return reason.Trim().Length > 500
            ? new ValidationResult([new ValidationError($"{code}_too_long", "Reason must be 500 characters or fewer.")])
            : new ValidationResult([]);
    }

    private static void AddChanged<T>(ICollection<string> changes, T before, T after, string label)
    {
        if (!EqualityComparer<T>.Default.Equals(before, after)) changes.Add(label);
    }

    private static void AddChanged(ICollection<string> changes, bool isChanged, string label)
    {
        if (isChanged) changes.Add(label);
    }
}

public static class DeliveryEvidenceUploadRules
{
    public static bool IsDeliveryCategory(FileCategory category) => category is
        FileCategory.DeliveryDocument or
        FileCategory.InspectionReport or
        FileCategory.HandoverPhoto or
        FileCategory.SignedHandover or
        FileCategory.Policy or
        FileCategory.RoadTaxReceipt or
        FileCategory.WindscreenPolicy;

    public static DeliveryContentValidation ValidateAndDetect(FileCategory category, byte[] bytes)
    {
        if (!IsDeliveryCategory(category)) return new DeliveryContentValidation(true, null, null);

        var mimeType = DetectAndValidateMimeType(bytes);
        var allowed = category == FileCategory.HandoverPhoto
            ? mimeType is "image/jpeg" or "image/png" or "image/webp"
            : mimeType is "application/pdf" or "image/jpeg" or "image/png";
        return allowed
            ? new DeliveryContentValidation(true, mimeType, null)
            : new DeliveryContentValidation(false, null, new ValidationError(
                "delivery_evidence_content_invalid",
                category == FileCategory.HandoverPhoto
                    ? "Handover photo must be a JPEG, PNG, or WebP image."
                    : "Delivery evidence must be a PDF, JPEG, or PNG file."));
    }

    private static string? DetectAndValidateMimeType(byte[] bytes)
    {
        if (IsStructurallyValidPdf(bytes)) return "application/pdf";
        try
        {
            using var data = SKData.CreateCopy(bytes);
            using var codec = SKCodec.Create(data);
            if (codec is null || codec.Info.Width <= 0 || codec.Info.Height <= 0) return null;
            if ((long)codec.Info.Width * codec.Info.Height > 50_000_000) return null;
            var mimeType = codec.EncodedFormat switch
            {
                SKEncodedImageFormat.Jpeg => "image/jpeg",
                SKEncodedImageFormat.Png => "image/png",
                SKEncodedImageFormat.Webp => "image/webp",
                _ => null
            };
            if (mimeType is null) return null;
            using var bitmap = SKBitmap.Decode(bytes);
            return bitmap is { Width: > 0, Height: > 0 } ? mimeType : null;
        }
        catch
        {
            return null;
        }
    }

    private static bool IsStructurallyValidPdf(byte[] bytes)
    {
        if (bytes.Length < 64 || !bytes.AsSpan(0, 5).SequenceEqual("%PDF-"u8)) return false;
        var span = bytes.AsSpan();
        var eofIndex = span.LastIndexOf("%%EOF"u8);
        if (eofIndex < 0 || eofIndex < bytes.Length - 1024) return false;
        foreach (var value in span[(eofIndex + 5)..])
        {
            if (value != (byte)' ' && value != (byte)'\t' && value != (byte)'\r' && value != (byte)'\n' && value != 0) return false;
        }

        var text = Encoding.ASCII.GetString(bytes);
        var hasObject = text.Contains(" obj", StringComparison.Ordinal) && text.Contains("endobj", StringComparison.Ordinal);
        var hasRoot = text.Contains("/Root", StringComparison.Ordinal) || text.Contains("/Type /Catalog", StringComparison.Ordinal);
        var hasClassicXref = text.Contains("xref", StringComparison.Ordinal) && text.Contains("trailer", StringComparison.Ordinal);
        var hasXrefStream = text.Contains("/Type /XRef", StringComparison.Ordinal) || text.Contains("/Type/XRef", StringComparison.Ordinal);
        return hasObject && hasRoot && (hasClassicXref || hasXrefStream);
    }
}

public static class DeliveryInvoiceUpdateQueueRules
{
    public static IReadOnlyList<DeliveryInvoiceUpdateQueueItem> Create(
        IEnumerable<DeliverySchedule> deliveries,
        IEnumerable<Vehicle> vehicles,
        IEnumerable<Customer> customers)
    {
        var vehicleById = vehicles.ToDictionary(vehicle => vehicle.Id);
        var customerById = customers.ToDictionary(customer => customer.Id);
        return deliveries
            .Where(delivery => DeliveryWorkboardRules.IsActive(delivery) && DeliveryWorkboardRules.HasOpenInvoiceUpdateRequest(delivery))
            .Select(delivery =>
            {
                if (!delivery.CustomerId.HasValue ||
                    !vehicleById.TryGetValue(delivery.VehicleId, out var vehicle) ||
                    vehicle.CustomerId != delivery.CustomerId ||
                    !customerById.TryGetValue(delivery.CustomerId.Value, out var customer) ||
                    !delivery.InvoiceUpdateRequestedAt.HasValue ||
                    string.IsNullOrWhiteSpace(delivery.InvoiceUpdateRequestReason))
                {
                    return null;
                }
                return new DeliveryInvoiceUpdateQueueItem(
                    delivery.Id,
                    delivery.VehicleId,
                    vehicle.PlateNumber,
                    $"{vehicle.Make} {vehicle.Model}".Trim(),
                    customer.Name,
                    delivery.InvoiceUpdateRequestReason,
                    delivery.InvoiceUpdateRequestedAt.Value);
            })
            .Where(item => item is not null)
            .Cast<DeliveryInvoiceUpdateQueueItem>()
            .OrderBy(item => item.RequestedAt)
            .ToList();
    }
}

public static class SalesWorkboardRules
{
    public static SalesWorkboardResponse Create(
        IReadOnlyCollection<string> selectedAgentUserIds,
        DateOnly today,
        IEnumerable<Vehicle> vehicles,
        IEnumerable<Lead> leads,
        IEnumerable<LoanApplication> loans,
        IEnumerable<RepairJob> repairs,
        IEnumerable<DeliverySchedule> deliveries,
        IEnumerable<PaymentRecord> payments,
        IReadOnlyList<SalesAgentOption> availableAgents,
        bool includeUnassigned = false,
        IEnumerable<FinanceInvoice>? financeInvoices = null,
        IEnumerable<CollectionTransaction>? collections = null)
    {
        var leadList = leads.ToList();
        var vehicleById = vehicles.ToDictionary(vehicle => vehicle.Id);
        var activeLeadAssignments = leadList
            .Where(lead =>
                lead.Status != LeadStatus.Closed &&
                !string.IsNullOrWhiteSpace(lead.TakenByUserId) &&
                vehicleById.TryGetValue(lead.VehicleId, out var vehicle) &&
                string.IsNullOrWhiteSpace(vehicle.SalesAgentUserId))
            .GroupBy(lead => new { lead.VehicleId, AgentUserId = lead.TakenByUserId! })
            .Select(group =>
            {
                var latest = group.OrderByDescending(lead => lead.TakenAt ?? lead.CreatedAt).First();
                return new AgentVehicleAssignment(vehicleById[group.Key.VehicleId], group.Key.AgentUserId, latest.TakenByName ?? group.Key.AgentUserId);
            });
        var durableAssignments = vehicleById.Values
            .Where(vehicle => !string.IsNullOrWhiteSpace(vehicle.SalesAgentUserId))
            .Select(vehicle => new AgentVehicleAssignment(vehicle, vehicle.SalesAgentUserId!, vehicle.SalesAgentName ?? vehicle.SalesAgentUserId!));
        var legacySoldAssignments = vehicleById.Values
            .Where(vehicle => vehicle.Status == VehicleStatus.Sold && string.IsNullOrWhiteSpace(vehicle.SalesAgentUserId))
            .Select(vehicle =>
            {
                var soldLead = leadList
                    .Where(lead => lead.VehicleId == vehicle.Id && lead.ClosureOutcome == LeadClosureOutcome.Sold && !string.IsNullOrWhiteSpace(lead.TakenByUserId))
                    .OrderByDescending(lead => lead.TakenAt ?? lead.CreatedAt)
                    .FirstOrDefault();
                return soldLead is null ? null : new AgentVehicleAssignment(vehicle, soldLead.TakenByUserId!, soldLead.TakenByName ?? soldLead.TakenByUserId!);
            })
            .Where(assignment => assignment is not null)
            .Cast<AgentVehicleAssignment>();
        var unassignedAssignments = includeUnassigned
            ? leadList
                .Where(lead =>
                    lead.Status != LeadStatus.Closed &&
                    string.IsNullOrWhiteSpace(lead.TakenByUserId) &&
                    vehicleById.TryGetValue(lead.VehicleId, out var vehicle) &&
                    string.IsNullOrWhiteSpace(vehicle.SalesAgentUserId))
                .Select(lead => new AgentVehicleAssignment(vehicleById[lead.VehicleId], "", "Unassigned"))
                .Concat(vehicleById.Values
                    .Where(vehicle =>
                        vehicle.Status == VehicleStatus.Sold &&
                        string.IsNullOrWhiteSpace(vehicle.SalesAgentUserId) &&
                        !leadList.Any(lead => lead.VehicleId == vehicle.Id && lead.ClosureOutcome == LeadClosureOutcome.Sold && !string.IsNullOrWhiteSpace(lead.TakenByUserId)))
                    .Select(vehicle => new AgentVehicleAssignment(vehicle, "", "Unassigned")))
            : [];
        var vehicleAssignments = activeLeadAssignments
            .Concat(durableAssignments)
            .Concat(legacySoldAssignments)
            .Concat(unassignedAssignments)
            .Where(item => string.IsNullOrWhiteSpace(item.AgentUserId) || selectedAgentUserIds.Contains(item.AgentUserId, StringComparer.Ordinal))
            .GroupBy(item => new { item.Vehicle.Id, item.AgentUserId })
            .Select(group => group.First())
            .ToList();
        var loanList = loans.ToList();
        var repairList = repairs.ToList();
        var deliveryList = deliveries.ToList();
        var paymentList = payments.ToList();
        var financeClearedVehicleIds = FinanceClearanceRules.ClearedVehicleIds(paymentList, financeInvoices ?? [], collections ?? []);
        var financeV2VehicleIds = paymentList
            .Where(payment => payment.FinanceWorkflowVersion == 2)
            .Select(payment => payment.VehicleId)
            .ToHashSet();
        var items = vehicleAssignments
            .Select(item => CreateItem(
                item.Vehicle,
                item.AgentUserId,
                item.AgentName,
                leadList,
                loanList,
                repairList,
                deliveryList,
                financeClearedVehicleIds.Contains(item.Vehicle.Id),
                financeV2VehicleIds.Contains(item.Vehicle.Id)))
            .ToList();
        var soldThisMonth = items.Where(item =>
            item.Process == "Completed" &&
            item.SoldAt is { } soldAt &&
            BusinessClock.SingaporeDate(new DateTimeOffset(DateTime.SpecifyKind(soldAt, DateTimeKind.Utc))).Year == today.Year &&
            BusinessClock.SingaporeDate(new DateTimeOffset(DateTime.SpecifyKind(soldAt, DateTimeKind.Utc))).Month == today.Month)
            .Select(item => item.VehicleId)
            .Distinct()
            .Count();
        return new SalesWorkboardResponse(
            soldThisMonth,
            items.Where(item => item.Process != "Completed").Select(item => item.VehicleId).Distinct().Count(),
            availableAgents,
            items.OrderBy(item => item.Process == "Completed").ThenBy(item => item.PlateNumber).ToList());
    }

    private static SalesWorkboardItem CreateItem(
        Vehicle vehicle,
        string salesAgentUserId,
        string salesAgentName,
        IReadOnlyList<Lead> leads,
        IReadOnlyList<LoanApplication> loans,
        IReadOnlyList<RepairJob> repairs,
        IReadOnlyList<DeliverySchedule> deliveries,
        bool financeCleared,
        bool hasFinanceV2Receivable)
    {
        string process;
        string department;
        string nextAction;
        var released = deliveries.Any(delivery => delivery.VehicleId == vehicle.Id && delivery.Status == DeliveryStatus.Released);
        var completed = hasFinanceV2Receivable
            ? released && financeCleared
            : vehicle.Status == VehicleStatus.Sold || (released && financeCleared);
        if (completed)
        {
            (process, department, nextAction) = ("Completed", "Sales", "Sale completed");
        }
        else if (released || (hasFinanceV2Receivable && vehicle.Status == VehicleStatus.Sold && !financeCleared))
        {
            (process, department, nextAction) = ("Delivery", "Finance", "Wait for Finance clearance");
        }
        else if (deliveries.Any(delivery => delivery.VehicleId == vehicle.Id && DeliveryWorkboardRules.IsActive(delivery)))
        {
            (process, department, nextAction) = ("Delivery", "Delivery", "Follow delivery workboard");
        }
        else if (repairs.Any(repair => repair.VehicleId == vehicle.Id && !repair.ChecklistDone))
        {
            (process, department, nextAction) = ("Preparation", "Repair", "Complete vehicle preparation");
        }
        else if (loans.Any(loan => loan.VehicleId == vehicle.Id && loan.Status == LoanStatus.Done))
        {
            (process, department, nextAction) = ("Preparation", "Delivery", "Plan vehicle delivery");
        }
        else if (financeCleared)
        {
            (process, department, nextAction) = ("Delivery", "Delivery", "Plan vehicle delivery");
        }
        else if (loans.Any(loan => loan.VehicleId == vehicle.Id && loan.Status is LoanStatus.Pending or LoanStatus.Approved))
        {
            (process, department, nextAction) = ("Loan", "Loan", "Follow loan application");
        }
        else if (leads.Any(lead => lead.VehicleId == vehicle.Id && lead.Status != LeadStatus.Closed))
        {
            (process, department, nextAction) = ("Lead", "Sales", "Follow customer lead");
        }
        else
        {
            (process, department, nextAction) = ("Sale confirmed", "Sales", "Start next process");
        }

        return new SalesWorkboardItem(
            vehicle.Id,
            vehicle.PlateNumber,
            $"{vehicle.Make} {vehicle.Model}".Trim(),
            salesAgentUserId,
            salesAgentName,
            process,
            department,
            nextAction,
            vehicle.SoldAt);
    }

    private sealed record AgentVehicleAssignment(Vehicle Vehicle, string AgentUserId, string AgentName);
}
