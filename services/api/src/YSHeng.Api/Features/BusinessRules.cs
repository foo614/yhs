using System.Globalization;
using System.ComponentModel.DataAnnotations;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using SkiaSharp;
using UglyToad.PdfPig;

namespace YSHeng.Api.Features;

public sealed record LeadRequest(Guid VehicleId, string CustomerName, string Phone, string? Message, string? SourcePage = null, string? SourceReferrer = null, string? SourceCampaign = null);
public sealed record ContactEnquiryRequest(string CustomerName, string Phone, string? Message, string? SourcePage = null, string? SourceReferrer = null, string? SourceCampaign = null);
public sealed record ShowroomEnquiryRequest(string VehicleType, string? PreferredBrand, string? PreferredModel, string BudgetRange, string CustomerName, string Phone, string? Email);
public sealed record HrLeaveAdjustmentRequest(string StaffUserId, HrLeaveAdjustmentType Type, HrLeaveAdjustmentDirection Direction, decimal Days, string Reason);
public sealed record HrAttendanceQrChallengeResponse(Guid Id, string Token, DateTime ExpiresAt);
public sealed record HrAttendanceQrRedemptionRequest(string Token, HrAttendanceAction Action);
public sealed record HrBusinessTripDecisionRequest(HrBusinessTripStatus Status, string? DecisionNotes = null);
public sealed record HrOutstationAttendanceRequest(Guid BusinessTripId);
public sealed record HrAttendanceDashboardSummary(
    int CheckedInToday,
    int CheckedOutToday,
    int OpenSessionsToday,
    int OfficeQrSessionsToday,
    int ManualSessionsToday,
    int OutstationSessionsToday,
    int PendingBusinessTripRequests,
    int ActiveOutstationToday,
    int UpcomingApprovedTrips);
public sealed record HrAvailabilityCalendarItem(
    string StaffUserId,
    string StaffDisplayName,
    DateOnly StartDate,
    DateOnly EndDate,
    string Kind,
    string Status,
    string? Location,
    string? Purpose);
public sealed record HrAttendanceReminderPolicyRequest(bool IsEnabled, int LeadHours);
public sealed record HrAttendanceReminderItem(HrAttendanceReminderType Type, string StaffUserId, string Message, DateOnly DueDate);
public sealed record PublicVehicleResponse(Guid Id, string PlateNumber, string Make, string Model, int Year, StockOwner StockOwner, VehicleStatus Status, decimal SellingPrice);
public sealed record PublicVehicleDetailResponse(Guid Id, string PlateNumber, string Make, string Model, int Year, StockOwner StockOwner, VehicleStatus Status, decimal SellingPrice, string? DescriptionMarkdown);
public sealed record PublicVehicleCatalogModelResponse(string Make, string Model);
public sealed record VehicleCatalogModelRequest(string Make, string Model, bool IsActive = true);
public sealed record RepairApprovalRequest(string? Notes);
public sealed record BackOfficeVehicleLookupResponse(Guid Id, string PlateNumber, string Make, string Model, StockOwner StockOwner, VehicleStatus Status, Guid? CustomerId, decimal SellingPrice, decimal AdditionalCharges);
public sealed record DashboardSummary(
    int TotalStock,
    decimal PurchaseCost,
    int PendingLoan,
    decimal OutstandingPayment,
    int SettlementDue,
    decimal RepairCost,
    decimal EstimatedProfit,
    decimal TotalProfit,
    int VehicleAging,
    DashboardAgingBucket[] AgingBuckets,
    string TopSupplier,
    int SalesPerformance,
    DashboardCountSlice[] StockStatusMix,
    DashboardCountSlice[] StockOwnerMix,
    DashboardAmountSlice[] MoneyRiskBreakdown,
    DashboardWorkflowBlockers WorkflowBlockers,
    DashboardSalesFunnel SalesFunnel,
    DashboardCountSlice[] TopEnquiredVehicles,
    DashboardAmountSlice[] RepairCostByVehicle,
    DashboardCountSlice[] TopSellingModels,
    DashboardCountSlice[] LeadTrend,
    int LeadsAwaitingFirstResponse,
    DashboardCountSlice[] RepairWorkInProgress,
    decimal RealisedProfit,
    DashboardProfitTrendSlice[] MonthlyProfitTrend,
    DashboardAmountSlice[] ProfitBreakdown,
    DashboardAmountSlice[] SupplierSpendTop,
    int TotalSales,
    decimal ActualProfit,
    decimal OutstandingCollection,
    decimal SettlementDueAmount,
    DashboardRefurbishmentSummary Refurbishment)
{
    public DashboardAiDocumentProcessing AiDocumentProcessing { get; init; } = DashboardAiDocumentProcessing.Empty;
}

public sealed record DashboardAgingBucket(string Label, int Count);
public sealed record DashboardCountSlice(string Label, int Count);
public sealed record DashboardAmountSlice(string Label, decimal Amount);
public sealed record DashboardProfitTrendSlice(string Label, decimal EstimatedProfit, decimal SoldProfit, int SoldCount);
public sealed record DashboardAnalyticsPeriod(DateOnly? From, DateOnly? To);
public sealed record DashboardRefurbishmentSummary(
    decimal FinalRepairSpend,
    int VehicleCount,
    decimal AverageSpendPerVehicle,
    int WorkInProgressCount,
    int OverdueWorkCount,
    DashboardAmountSlice[] HighestCostVehicles);
public sealed record DashboardAiDocumentCategory(
    string Category,
    string Label,
    int ScanCount,
    int AcceptedCount,
    int RejectedCount,
    int LowConfidenceCount,
    int FailedCount);
public sealed record DashboardAiDocumentProcessing(
    int ScanCount,
    int AcceptedCount,
    int RejectedCount,
    int LowConfidenceCount,
    int FailedCount,
    int PendingReviewCount,
    int UsedThisMonth,
    int MonthlyRequestLimit,
    int RemainingThisMonth,
    DashboardAiDocumentCategory[] Categories)
{
    public static readonly DashboardAiDocumentProcessing Empty = new(0, 0, 0, 0, 0, 0, 0, 0, 0, []);
}
public sealed record DashboardWorkflowBlockers(DashboardCountSlice[] ByType, DashboardCountSlice[] DueBuckets);
public sealed record DashboardSalesFunnel(DashboardCountSlice[] Stages, decimal ConversionRate);
public sealed record DashboardAiDocumentCategory(
    string Category,
    string Label,
    int ScanCount,
    int ReviewedCount,
    int ComparedFieldCount,
    int CorrectFieldCount,
    int CorrectedFieldCount,
    decimal? AccuracyPercent,
    int LowConfidenceCount,
    int FailedCount);
public sealed record DashboardAiDocumentProcessing(
    int ScanCount,
    int ReviewedCount,
    int ComparedFieldCount,
    int CorrectFieldCount,
    int CorrectedFieldCount,
    decimal? AccuracyPercent,
    int LowConfidenceCount,
    int FailedCount,
    int PendingReviewCount,
    int UsedThisMonth,
    int MonthlyRequestLimit,
    int RemainingThisMonth,
    DashboardAiDocumentCategory[] Categories)
{
    public static readonly DashboardAiDocumentProcessing Empty = new(0, 0, 0, 0, 0, null, 0, 0, 0, 0, 0, 0, []);
}
public sealed record SupplierSummary(string SupplierName, int InvoiceCount, decimal TotalAmount);
public sealed record SupplierInvoiceAgingView(Guid InvoiceId, string SupplierName, string InvoiceNumber, Guid VehicleId, SupplierInvoiceAgingStatus Status, DateOnly? DueDate, DateOnly? PaidAt, decimal Amount);
public sealed record ReminderItem(string Type, string Title, string VehiclePlate, Guid VehicleId, DateOnly DueDate, decimal? Amount);
public sealed record PriorityActionItem(string Type, string Title, string Target, DateOnly DueDate, string? Subject = null, decimal? Amount = null);
public sealed record ValidationError(string Code, string Message);
public sealed record ApiError(string Message);
public sealed record ValidationResult(IReadOnlyList<ValidationError> Errors)
{
    public bool IsValid => Errors.Count == 0;
}
public sealed record LoanDocumentCheck(bool IsComplete, IReadOnlyList<FileCategory> MissingCategories);
public sealed record DeliveryEvidenceItem(
    FileCategory Category,
    bool IsPresent,
    Guid? DocumentId,
    string? FileName,
    string? MimeType,
    string? Checksum,
    string? UploadedBy,
    DateTime? UploadedAt);
public sealed record DeliveryDocumentCheck(bool IsComplete, IReadOnlyList<FileCategory> MissingCategories, IReadOnlyList<DeliveryEvidenceItem> Evidence);
public sealed record HealthPayload(string Service, string Status, DateTimeOffset CheckedAt);
public sealed record PublicPhotoPayload(Guid Id, string MimeType, byte[] Bytes);
public sealed record PublicPhotoSummary(Guid Id, string FileName, string MimeType, DateTime UploadedAt, bool IsRepresentativeImage, string? SourceName, string? SourceUrl, string? CreatorAttribution, string? LicenseName, string? LicenseUrl);
public sealed record PhotoThumbnailResult(bool IsValid, byte[]? Thumbnail, ValidationError? Error);

public static class DepartmentAccess
{
    public static readonly string[] VehicleReaders = ["BossAdmin", "Sales", "Loan", "Delivery", "Finance", "Repair"];
    public static readonly string[] VehicleWriters = ["BossAdmin", "Sales"];
    public static readonly string[] CustomerReaders = ["BossAdmin", "Sales", "Loan", "Finance"];
    public static readonly string[] CustomerProfileReaders = ["BossAdmin", "Sales", "Loan", "Delivery", "Finance"];
    public static readonly string[] OwnerReaders = ["BossAdmin", "Sales", "Finance"];
    public static readonly string[] HrManagers = ["BossAdmin", "HrSalary"];

    public static bool CanReadFullVehicleRecords(string role) =>
        VehicleWriters.Contains(role);

    public static bool CanUploadDocument(IEnumerable<string> roles, FileCategory category)
    {
        var roleSet = roles.ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (roleSet.Contains("BossAdmin")) return true;

        return category switch
        {
            FileCategory.PurchaseInvoice or FileCategory.Voc or FileCategory.IdentityCard or FileCategory.ApDocument or FileCategory.StatusReceipt => roleSet.Contains("Sales"),
            FileCategory.LoanDocument => roleSet.Contains("Loan"),
            FileCategory.DeliveryDocument or FileCategory.InspectionReport or FileCategory.HandoverPhoto or FileCategory.SignedHandover or FileCategory.Policy or FileCategory.RoadTaxReceipt or FileCategory.WindscreenPolicy => roleSet.Contains("Delivery"),
            FileCategory.RepairInvoice => roleSet.Contains("Repair"),
            FileCategory.PaymentReceipt or FileCategory.PaymentInvoice => roleSet.Contains("Finance"),
            FileCategory.MedicalCertificate => roleSet.Contains("HrSalary"),
            _ => false
        };
    }

    public static bool IsHrManager(ClaimsPrincipal principal) =>
        principal.IsInRole("BossAdmin") || principal.IsInRole("HrSalary");

    public static bool IsBossAdmin(ClaimsPrincipal principal) => principal.IsInRole("BossAdmin");

    public static bool CanAccessHrStaff(ClaimsPrincipal principal, string staffUserId) =>
        IsHrManager(principal) || string.Equals(principal.FindFirstValue(ClaimTypes.NameIdentifier), staffUserId, StringComparison.Ordinal);
}

public static class DashboardAnalyticsPeriodRules
{
    public static bool TryParse(string? from, string? to, out DashboardAnalyticsPeriod period, out string? error)
    {
        period = new DashboardAnalyticsPeriod(null, null);
        error = null;

        if (string.IsNullOrWhiteSpace(from) && string.IsNullOrWhiteSpace(to)) return true;
        if (string.IsNullOrWhiteSpace(from) || string.IsNullOrWhiteSpace(to))
        {
            error = "Dashboard analytics require both from and to dates in YYYY-MM-DD format.";
            return false;
        }

        if (!DateOnly.TryParseExact(from, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedFrom)
            || !DateOnly.TryParseExact(to, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedTo))
        {
            error = "Dashboard analytics dates must use YYYY-MM-DD format.";
            return false;
        }

        if (parsedFrom > parsedTo)
        {
            error = "Dashboard analytics from date must not be after the to date.";
            return false;
        }

        period = new DashboardAnalyticsPeriod(parsedFrom, parsedTo);
        return true;
    }
}

public static class DocumentOwnershipRules
{
    private static readonly FileCategory[] PersonOwnedCategories =
    [
        FileCategory.PurchaseInvoice,
        FileCategory.Voc,
        FileCategory.IdentityCard,
        FileCategory.ApDocument,
        FileCategory.LoanDocument,
        FileCategory.DeliveryDocument,
        FileCategory.InspectionReport,
        FileCategory.HandoverPhoto,
        FileCategory.SignedHandover,
        FileCategory.Policy,
        FileCategory.RoadTaxReceipt,
        FileCategory.WindscreenPolicy
    ];

    public static DocumentOwnershipType DefaultFor(FileCategory category) => category switch
    {
        FileCategory.PurchaseInvoice or FileCategory.Voc or FileCategory.ApDocument => DocumentOwnershipType.Seller,
        FileCategory.IdentityCard => DocumentOwnershipType.Buyer,
        FileCategory.LoanDocument or
        FileCategory.DeliveryDocument or
        FileCategory.InspectionReport or
        FileCategory.HandoverPhoto or
        FileCategory.SignedHandover or
        FileCategory.Policy or
        FileCategory.RoadTaxReceipt or
        FileCategory.WindscreenPolicy => DocumentOwnershipType.Buyer,
        _ => DocumentOwnershipType.Vehicle
    };

    public static bool AllowsPersonSelection(FileCategory category) => PersonOwnedCategories.Contains(category);

    public static ValidationResult Validate(FileCategory category, Guid? repairJobId, Guid? paymentRecordId)
        => Validate(category, repairJobId, paymentRecordId, null, null, null);

    public static ValidationResult Validate(
        FileCategory category,
        Guid? repairJobId,
        Guid? paymentRecordId,
        DocumentOwnershipType? ownershipType,
        Guid? customerId,
        Guid? ownerId)
    {
        var errors = new List<ValidationError>();
        if (repairJobId.HasValue && paymentRecordId.HasValue)
        {
            errors.Add(new("document_owner_conflict", "A document can be linked to either a repair job or a payment record, not both."));
        }

        if (repairJobId.HasValue && category != FileCategory.RepairInvoice)
        {
            errors.Add(new("repair_document_category_invalid", "Repair job documents must use the RepairInvoice category."));
        }

        if (paymentRecordId.HasValue && category is not (FileCategory.PaymentReceipt or FileCategory.PaymentInvoice))
        {
            errors.Add(new("payment_document_category_invalid", "Payment documents must use the PaymentReceipt or PaymentInvoice category."));
        }

        if (customerId.HasValue && ownerId.HasValue)
        {
            errors.Add(new("document_person_conflict", "A document can be linked to either a seller or a buyer, not both."));
        }

        var resolvedOwnership = ownershipType ?? DefaultFor(category);
        if (resolvedOwnership is DocumentOwnershipType.Seller or DocumentOwnershipType.Buyer && !AllowsPersonSelection(category))
        {
            errors.Add(new("document_person_ownership_invalid", "This document category is owned by the vehicle and cannot be linked to a seller or buyer."));
        }

        if (resolvedOwnership == DocumentOwnershipType.Seller && customerId.HasValue)
        {
            errors.Add(new("document_seller_link_invalid", "Seller-owned documents must link to the selected original owner."));
        }

        if (resolvedOwnership == DocumentOwnershipType.Buyer && ownerId.HasValue)
        {
            errors.Add(new("document_buyer_link_invalid", "Buyer-owned documents must link to the selected customer."));
        }

        if (resolvedOwnership == DocumentOwnershipType.Vehicle && (customerId.HasValue || ownerId.HasValue))
        {
            errors.Add(new("document_vehicle_link_invalid", "Vehicle-owned documents cannot link to a seller or buyer."));
        }

        if (resolvedOwnership == DocumentOwnershipType.Seller && !ownerId.HasValue && ownershipType.HasValue)
        {
            errors.Add(new("document_seller_required", "Select the seller or original owner for this document."));
        }

        if (resolvedOwnership == DocumentOwnershipType.Buyer && !customerId.HasValue && ownershipType.HasValue)
        {
            errors.Add(new("document_buyer_required", "Select the buyer or customer for this document."));
        }

        return new ValidationResult(errors);
    }
}

public static class ApiErrors
{
    public static ApiError RouteIdMismatch(string entityLabel) =>
        new($"Route id and {entityLabel} id do not match.");
}

public static class PublicInventory
{
    public static IEnumerable<Vehicle> Filter(IEnumerable<Vehicle> vehicles) =>
        vehicles.Where(vehicle => vehicle.BossConfirmed && vehicle.IsPublic && vehicle.Status == VehicleStatus.Available);

    public static PublicVehicleResponse ToResponse(Vehicle vehicle) =>
        new(
            vehicle.Id,
            vehicle.PlateNumber,
            vehicle.Make,
            vehicle.Model,
            vehicle.Year,
            vehicle.StockOwner,
            vehicle.Status,
            vehicle.SellingPrice);

    public static PublicVehicleDetailResponse ToDetailResponse(Vehicle vehicle) =>
        new(
            vehicle.Id,
            vehicle.PlateNumber,
            vehicle.Make,
            vehicle.Model,
            vehicle.Year,
            vehicle.StockOwner,
            vehicle.Status,
            vehicle.SellingPrice,
            vehicle.PublicDescriptionMarkdown);
}

public static class VehicleApprovalRules
{
    public static ValidationResult ValidateCreate(Vehicle vehicle, bool canApprove) =>
        vehicle.BossConfirmed && !canApprove
            ? AdminApprovalRequired()
            : new ValidationResult([]);

    public static ValidationResult ValidateUpdate(Vehicle existing, Vehicle update, bool canApprove) =>
        existing.BossConfirmed != update.BossConfirmed && !canApprove
            ? AdminApprovalRequired()
            : new ValidationResult([]);

    public static Vehicle EnforceVisibility(Vehicle vehicle) =>
        vehicle.BossConfirmed ? vehicle : vehicle with { IsPublic = false };

    private static ValidationResult AdminApprovalRequired() =>
        new([new ValidationError("vehicle_approval_admin_required", "Only Boss/Admin can approve or revoke vehicle approval.")]);
}

public static class VehicleWorkflowRules
{
    public static ValidationResult ValidateCreate(Vehicle vehicle) =>
        vehicle.Status == VehicleStatus.Available
            ? new ValidationResult([])
            : WorkflowOwnedStatus();

    public static ValidationResult ValidateUpdate(Vehicle existing, Vehicle update) =>
        existing.Status == update.Status
            ? new ValidationResult([])
            : WorkflowOwnedStatus();

    private static ValidationResult WorkflowOwnedStatus() =>
        new([new ValidationError("vehicle_status_workflow_owned", "Vehicle status is set by loan and payment workflows, not vehicle intake edits.")]);
}

public static class VehicleCatalogRules
{
    public static VehicleCatalogModel Create(VehicleCatalogModelRequest request) =>
        new()
        {
            Make = request.Make?.Trim() ?? "",
            Model = request.Model?.Trim() ?? "",
            IsActive = request.IsActive
        };

    public static VehicleCatalogModel Update(VehicleCatalogModel existing, VehicleCatalogModelRequest request) =>
        existing with
        {
            Make = request.Make?.Trim() ?? "",
            Model = request.Model?.Trim() ?? "",
            IsActive = request.IsActive
        };

    public static ValidationResult Validate(VehicleCatalogModel item)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(item.Make)) errors.Add(new("catalog_make_required", "Make is required."));
        if (string.IsNullOrWhiteSpace(item.Model)) errors.Add(new("catalog_model_required", "Model is required."));
        if (item.Make.Length > 80) errors.Add(new("catalog_make_too_long", "Make must be 80 characters or fewer."));
        if (item.Model.Length > 80) errors.Add(new("catalog_model_too_long", "Model must be 80 characters or fewer."));
        return new ValidationResult(errors);
    }

    public static bool IsDuplicate(VehicleCatalogModel candidate, IEnumerable<VehicleCatalogModel> existing) =>
        existing.Any(item => item.Id != candidate.Id
            && string.Equals(item.Make, candidate.Make, StringComparison.OrdinalIgnoreCase)
            && string.Equals(item.Model, candidate.Model, StringComparison.OrdinalIgnoreCase));

    public static PublicVehicleCatalogModelResponse ToPublicResponse(VehicleCatalogModel item) =>
        new(item.Make, item.Model);
}

public static class BackOfficeVehicleLookup
{
    public static BackOfficeVehicleLookupResponse ToResponse(Vehicle vehicle) =>
        new(
            vehicle.Id,
            vehicle.PlateNumber,
            vehicle.Make,
            vehicle.Model,
            vehicle.StockOwner,
            vehicle.Status,
            vehicle.CustomerId,
            vehicle.SellingPrice,
            vehicle.AdditionalCharges);
}

public static class PublicVehiclePhotos
{
    public static IReadOnlyList<PublicPhotoSummary> SelectGallery(Guid vehicleId, IEnumerable<VehiclePhoto> photos) =>
        photos
            .Where(item => item.VehicleId == vehicleId)
            .OrderByDescending(item => item.UploadedAt)
            .Select(item => new PublicPhotoSummary(item.Id, item.FileName, item.MimeType, item.UploadedAt, item.IsRepresentativeImage, item.SourceName, item.SourceUrl, item.CreatorAttribution, item.LicenseName, item.LicenseUrl))
            .ToList();

    public static PublicPhotoPayload? SelectPrimary(Guid vehicleId, IEnumerable<VehiclePhoto> photos)
    {
        var photo = photos
            .Where(item => item.VehicleId == vehicleId)
            .OrderByDescending(item => item.UploadedAt)
            .FirstOrDefault();
        if (photo is null) return null;

        return new PublicPhotoPayload(
            photo.Id,
            photo.MimeType,
            photo.Thumbnail is { Length: > 0 } ? photo.Thumbnail : photo.Content);
    }
}

public static class VehicleRules
{
    public static Vehicle NormalizeDateTimes(Vehicle vehicle)
    {
        var normalized = vehicle with
        {
            PublicDescriptionMarkdown = string.IsNullOrWhiteSpace(vehicle.PublicDescriptionMarkdown)
                ? null
                : vehicle.PublicDescriptionMarkdown.Trim()
        };

        return normalized.OutstationPickupScheduledAt is { } pickupAt
            ? normalized with { OutstationPickupScheduledAt = NormalizeDateTime(pickupAt) }
            : normalized;
    }

    public static ValidationResult ValidateIntake(Vehicle vehicle)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(vehicle.PlateNumber))
        {
            errors.Add(new ValidationError("plate_required", "Car plate is required."));
        }

        if (string.IsNullOrWhiteSpace(vehicle.Make))
        {
            errors.Add(new ValidationError("make_required", "Vehicle make is required."));
        }

        if (string.IsNullOrWhiteSpace(vehicle.Model))
        {
            errors.Add(new ValidationError("model_required", "Vehicle model is required."));
        }

        if (vehicle.Year is < 1900 or > 2100)
        {
            errors.Add(new ValidationError("invalid_year", "Vehicle year must be between 1900 and 2100."));
        }

        if (vehicle.PurchasePrice < 0)
        {
            errors.Add(new ValidationError("invalid_purchase_price", "Purchase price cannot be negative."));
        }

        if (vehicle.SellingPrice <= 0)
        {
            errors.Add(new ValidationError("invalid_selling_price", "Selling price must be greater than zero."));
        }

        if (vehicle.AdditionalCharges < 0)
        {
            errors.Add(new ValidationError("invalid_additional_charges", "Additional charges cannot be negative."));
        }

        if (vehicle.RefurbishmentTotal < 0)
        {
            errors.Add(new ValidationError("invalid_refurbishment_total", "Refurbishment total cannot be negative."));
        }

        if (vehicle.CommissionTotal < 0)
        {
            errors.Add(new ValidationError("invalid_commission_total", "Commission total cannot be negative."));
        }

        if (vehicle.ContraRangePrice < 0)
        {
            errors.Add(new ValidationError("invalid_contra_range_price", "Contra range price cannot be negative."));
        }

        if (vehicle.OutstationPickupAllowance < 0)
        {
            errors.Add(new ValidationError("invalid_outstation_pickup_allowance", "Outstation pickup allowance cannot be negative."));
        }

        if (vehicle.PublicDescriptionMarkdown?.Length > 6000)
        {
            errors.Add(new ValidationError("public_description_too_long", "Public vehicle description must be 6,000 characters or fewer."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateUniquePlate(Vehicle incoming, IEnumerable<Vehicle> existing)
    {
        var normalizedPlate = incoming.PlateNumber.Trim();
        var isDuplicate = existing.Any(vehicle =>
            vehicle.Id != incoming.Id &&
            vehicle.PlateNumber.Trim().Equals(normalizedPlate, StringComparison.OrdinalIgnoreCase));

        return isDuplicate
            ? new ValidationResult([new ValidationError("duplicate_plate", "Car plate already exists in inventory.")])
            : new ValidationResult([]);
    }

    public static ValidationResult ValidateContactLinks(Vehicle vehicle, IEnumerable<Customer> customers, IEnumerable<Owner> owners, IEnumerable<LoanApplication>? loans = null, bool requireOwner = false)
    {
        var errors = new List<ValidationError>();
        var activeLoans = (loans ?? []).Where(loan => loan.VehicleId == vehicle.Id && WorkflowStatusRules.IsActiveLoan(loan)).ToList();
        if (vehicle.CustomerId is { } customerId && !customers.Any(customer => customer.Id == customerId))
        {
            errors.Add(new ValidationError("customer_not_found", "Vehicle customer must be an existing customer record."));
        }
        else if (activeLoans.Count > 0 && vehicle.CustomerId is null)
        {
            errors.Add(new ValidationError("vehicle_customer_active_loan_required", "Vehicle customer cannot be cleared while an active loan exists."));
        }
        else if (vehicle.CustomerId is { } linkedCustomerId && activeLoans.Any(loan => loan.CustomerId != linkedCustomerId))
        {
            errors.Add(new ValidationError("vehicle_customer_loan_mismatch", "Vehicle customer must match every active loan customer for this vehicle."));
        }

        if (vehicle.OwnerId is { } ownerId && !owners.Any(owner => owner.Id == ownerId))
        {
            errors.Add(new ValidationError("owner_not_found", "Vehicle owner must be an existing owner record."));
        }
        else if (requireOwner && vehicle.OwnerId is null)
        {
            errors.Add(new ValidationError("vehicle_owner_required", "Vehicle owner is required before completing new intake."));
        }

        return new ValidationResult(errors);
    }

    private static DateTime NormalizeDateTime(DateTime value) =>
        value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
}

public static class HealthStatus
{
    public static HealthPayload Create(DateTimeOffset checkedAt) =>
        new("YS Heng API", "ok", checkedAt);

    public static ReadinessPayload CreateReadiness(bool databaseConnected, DateTimeOffset checkedAt) =>
        new("YS Heng API", databaseConnected ? "ready" : "degraded", databaseConnected, checkedAt);
}

public sealed record ReadinessPayload(string Service, string Status, bool DatabaseConnected, DateTimeOffset CheckedAt);

public static class SecurityHeaders
{
    public const string ContentTypeOptions = "nosniff";
    public const string FrameOptions = "DENY";
    public const string ReferrerPolicy = "no-referrer";
    public const string PermissionsPolicy = "camera=(), microphone=(), geolocation=()";

    public static void Apply(IHeaderDictionary headers)
    {
        headers["X-Content-Type-Options"] = ContentTypeOptions;
        headers["X-Frame-Options"] = FrameOptions;
        headers["Referrer-Policy"] = ReferrerPolicy;
        headers["Permissions-Policy"] = PermissionsPolicy;
    }
}

public static class RuntimeMode
{
    public static bool ShouldSeed(bool workerEnabled, bool seedEnabled) => seedEnabled && !workerEnabled;
}

public static class LeadCapture
{
    public static readonly Guid GeneralContactVehicleId = Guid.Empty;
    public const string InStoreQrSource = "in-store-qr";

    public static Lead Create(LeadRequest request)
    {
        if (request.VehicleId == Guid.Empty) throw new ArgumentException("Vehicle is required.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.CustomerName)) throw new ArgumentException("Customer name is required.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.Phone)) throw new ArgumentException("Phone is required.", nameof(request));

        return new Lead
        {
            VehicleId = request.VehicleId,
            CustomerName = request.CustomerName.Trim(),
            Phone = request.Phone.Trim(),
            Message = request.Message?.Trim(),
            SourcePage = TrimToNull(request.SourcePage, 500),
            SourceReferrer = TrimToNull(request.SourceReferrer, 500),
            SourceCampaign = TrimToNull(request.SourceCampaign, 500),
            Status = LeadStatus.New
        };
    }

    public static Lead CreateContactEnquiry(ContactEnquiryRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.CustomerName)) throw new ArgumentException("Customer name is required.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.Phone)) throw new ArgumentException("Phone is required.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.Message)) throw new ArgumentException("Message is required.", nameof(request));

        return new Lead
        {
            VehicleId = GeneralContactVehicleId,
            CustomerName = request.CustomerName.Trim(),
            Phone = request.Phone.Trim(),
            Message = TrimToNull(request.Message, 2000),
            SourcePage = TrimToNull(request.SourcePage, 500),
            SourceReferrer = TrimToNull(request.SourceReferrer, 500),
            SourceCampaign = TrimToNull(request.SourceCampaign, 500),
            Status = LeadStatus.New
        };
    }

    public static Lead CreateShowroomEnquiry(ShowroomEnquiryRequest request) => new()
    {
        VehicleId = GeneralContactVehicleId,
        CustomerName = request.CustomerName.Trim(),
        Phone = request.Phone.Trim(),
        Message = $"In-store QR enquiry\nVehicle type: {request.VehicleType.Trim()}\nPreferred brand: {DisplayValue(request.PreferredBrand)}\nPreferred model: {DisplayValue(request.PreferredModel)}\nBudget: {request.BudgetRange.Trim()}\nEmail: {DisplayValue(request.Email)}",
        SourcePage = "/showroom-enquiry",
        SourceCampaign = InStoreQrSource,
        Status = LeadStatus.New
    };

    private static string? TrimToNull(string? value, int maxLength)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrWhiteSpace(trimmed)) return null;
        return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
    }

    private static string DisplayValue(string? value) => string.IsNullOrWhiteSpace(value) ? "Not specified" : value.Trim();
}

public static class LeadRules
{
    public static ValidationResult ValidateBackOfficeLead(Lead lead, IEnumerable<Vehicle> vehicles, IEnumerable<Customer> customers)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(lead.CustomerName))
        {
            errors.Add(new ValidationError("customer_name_required", "Customer name is required."));
        }

        if (string.IsNullOrWhiteSpace(lead.Phone))
        {
            errors.Add(new ValidationError("phone_required", "Phone is required."));
        }

        if (lead.VehicleId != LeadCapture.GeneralContactVehicleId && !vehicles.Any(vehicle => vehicle.Id == lead.VehicleId))
        {
            errors.Add(new ValidationError("vehicle_not_found", "Lead must be linked to an existing vehicle."));
        }

        if (lead.CustomerId is { } customerId && !customers.Any(customer => customer.Id == customerId))
        {
            errors.Add(new ValidationError("customer_not_found", "Lead customer link must reference an existing customer."));
        }

        if (lead.Status == LeadStatus.Closed && lead.ClosureOutcome is null)
        {
            errors.Add(new ValidationError("lead_closure_outcome_required", "Choose Sold, Lost, or Invalid before closing a lead."));
        }

        if (lead.Status != LeadStatus.Closed && lead.ClosureOutcome is not null)
        {
            errors.Add(new ValidationError("lead_closure_outcome_invalid", "A closure outcome is allowed only when the lead is closed."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateStatusOwner(Lead existing, Lead incoming, string currentUserId, bool canManageAll = false)
    {
        if (string.IsNullOrWhiteSpace(currentUserId))
        {
            return new ValidationResult([new ValidationError("lead_user_required", "A signed-in staff user is required to update a lead.")]);
        }

        if (!string.IsNullOrWhiteSpace(existing.TakenByUserId) &&
            !string.Equals(existing.TakenByUserId, currentUserId, StringComparison.Ordinal) &&
            !canManageAll)
        {
            return new ValidationResult([new ValidationError("lead_assignee_required", "Only the assigned sales agent or Admin can update this lead.")]);
        }

        return new ValidationResult([]);
    }

    public static Lead ApplyBackOfficeUpdate(Lead existing, Lead incoming, string currentUserId, string currentUserName, DateTime now)
    {
        var takenByUserId = existing.TakenByUserId;
        var takenByName = existing.TakenByName;
        var takenAt = existing.TakenAt;
        if (incoming.Status == LeadStatus.New)
        {
            takenByUserId = null;
            takenByName = null;
            takenAt = null;
        }
        else if (string.IsNullOrWhiteSpace(takenByUserId))
        {
            takenByUserId = currentUserId;
            takenByName = string.IsNullOrWhiteSpace(currentUserName) ? currentUserId : currentUserName.Trim();
            takenAt = now;
        }

        return incoming with
        {
            VehicleId = existing.VehicleId,
            CreatedAt = existing.CreatedAt,
            SourcePage = existing.SourcePage,
            SourceReferrer = existing.SourceReferrer,
            SourceCampaign = existing.SourceCampaign,
            ClosureOutcome = incoming.Status == LeadStatus.Closed ? incoming.ClosureOutcome : null,
            TakenByUserId = takenByUserId,
            TakenByName = takenByName,
            TakenAt = takenAt
        };
    }
}

public static class ContactRules
{
    public static ValidationResult ValidateCustomer(Customer customer)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(customer.Name))
        {
            errors.Add(new ValidationError("customer_name_required", "Customer name is required."));
        }

        if (string.IsNullOrWhiteSpace(customer.Phone))
        {
            errors.Add(new ValidationError("customer_phone_required", "Customer phone is required."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateUniqueCustomerPhone(Customer incoming, IEnumerable<Customer> existing)
    {
        return existing.Any(customer => customer.Id != incoming.Id && SamePhone(customer.Phone, incoming.Phone))
            ? new ValidationResult([new ValidationError("duplicate_customer_phone", "Customer phone already exists.")])
            : new ValidationResult([]);
    }

    public static ValidationResult ValidateOwner(Owner owner)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(owner.Name))
        {
            errors.Add(new ValidationError("owner_name_required", "Owner name is required."));
        }

        if (string.IsNullOrWhiteSpace(owner.Phone))
        {
            errors.Add(new ValidationError("owner_phone_required", "Owner phone is required."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateUniqueOwnerPhone(Owner incoming, IEnumerable<Owner> existing)
    {
        return existing.Any(owner => owner.Id != incoming.Id && SamePhone(owner.Phone, incoming.Phone))
            ? new ValidationResult([new ValidationError("duplicate_owner_phone", "Owner phone already exists.")])
            : new ValidationResult([]);
    }

    private static bool SamePhone(string left, string right)
    {
        var normalizedLeft = NormalizePhone(left);
        var normalizedRight = NormalizePhone(right);
        return normalizedLeft.Length > 0 &&
            string.Equals(normalizedLeft, normalizedRight, StringComparison.OrdinalIgnoreCase);
    }

    private static string NormalizePhone(string phone) =>
        new(phone.Where(char.IsLetterOrDigit).ToArray());
}

public static class StaffUserRules
{
    public static ValidationResult ValidateCreate(CreateStaffUserRequest request, IEnumerable<string> allowedRoles)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(request.Email))
        {
            errors.Add(new ValidationError("staff_email_required", "Staff email is required."));
        }

        if (string.IsNullOrWhiteSpace(request.DisplayName))
        {
            errors.Add(new ValidationError("staff_display_name_required", "Staff display name is required."));
        }

        if (string.IsNullOrWhiteSpace(request.Password))
        {
            errors.Add(new ValidationError("staff_password_required", "Initial password is required."));
        }

        if (!allowedRoles.Contains(request.Role))
        {
            errors.Add(new ValidationError("staff_role_invalid", "Staff role must be one of the configured department roles."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateRoleUpdate(UpdateStaffUserRolesRequest request, IEnumerable<string> allowedRoles)
    {
        var errors = new List<ValidationError>();
        var roles = request.Roles ?? [];
        if (roles.Length == 0)
        {
            errors.Add(new ValidationError("staff_roles_required", "At least one staff role is required."));
        }

        if (roles.Any(role => !allowedRoles.Contains(role)))
        {
            errors.Add(new ValidationError("staff_role_invalid", "Staff roles must be configured department roles."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateUpdate(UpdateStaffUserRequest request)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(request.DisplayName))
        {
            errors.Add(new ValidationError("staff_display_name_required", "Staff display name is required."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidatePasswordReset(ResetStaffPasswordRequest request)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(request.Password))
        {
            errors.Add(new ValidationError("staff_password_required", "New password is required."));
        }
        else if (request.Password.Trim().Length < 8)
        {
            errors.Add(new ValidationError("staff_password_too_short", "New password must be at least 8 characters."));
        }

        return new ValidationResult(errors);
    }
}

public static class HrRules
{
    public static ValidationResult ValidateAttendanceReminderPolicy(HrAttendanceReminderPolicyRequest request)
    {
        var errors = new List<ValidationError>();
        if (request.LeadHours < 0 || request.LeadHours > 720) errors.Add(new ValidationError("attendance_reminder_lead_hours_invalid", "Reminder lead hours must be between 0 and 720."));
        return new ValidationResult(errors);
    }
    public static ValidationResult ValidateBusinessTrip(HrBusinessTrip trip)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(trip.StaffUserId)) errors.Add(new ValidationError("staff_user_required", "Staff user is required."));
        if (trip.EndDate < trip.StartDate) errors.Add(new ValidationError("business_trip_date_range_invalid", "Business trip end date cannot be before start date."));
        if (string.IsNullOrWhiteSpace(trip.Location)) errors.Add(new ValidationError("business_trip_location_required", "Business trip location is required."));
        if (string.IsNullOrWhiteSpace(trip.Purpose)) errors.Add(new ValidationError("business_trip_purpose_required", "Business trip purpose is required."));
        return new ValidationResult(errors);
    }

    public static bool BusinessTripCoversDate(HrBusinessTrip trip, DateOnly date) => trip.Status == HrBusinessTripStatus.Approved && trip.StartDate <= date && trip.EndDate >= date;

    public static bool DatesOverlap(DateOnly firstStart, DateOnly firstEnd, DateOnly secondStart, DateOnly secondEnd) => firstStart <= secondEnd && secondStart <= firstEnd;

    public static string CreateAttendanceQrToken() => Base64Url(RandomNumberGenerator.GetBytes(32));

    public static string HashAttendanceQrToken(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static ValidationResult ValidateAttendanceQrRedemption(HrAttendanceQrRedemptionRequest request)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(request.Token))
        {
            errors.Add(new ValidationError("attendance_qr_token_required", "Attendance QR token is required."));
        }

        if (!Enum.IsDefined(request.Action))
        {
            errors.Add(new ValidationError("attendance_qr_action_invalid", "Attendance QR action is invalid."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateCheckIn(HrAttendanceRecord? openSession)
    {
        var errors = new List<ValidationError>();
        if (openSession is not null)
        {
            errors.Add(new ValidationError("attendance_open_session_exists", "Check out before starting another attendance session."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateCheckOut(HrAttendanceRecord? openSession)
    {
        var errors = new List<ValidationError>();
        if (openSession?.CheckInAt is null)
        {
            errors.Add(new ValidationError("attendance_open_session_required", "Check in before checking out."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateAttendance(HrAttendanceRecord attendance)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(attendance.StaffUserId))
        {
            errors.Add(new ValidationError("staff_user_required", "Staff user is required."));
        }

        if (attendance.CheckOutAt is not null && attendance.CheckInAt is not null && attendance.CheckOutAt < attendance.CheckInAt)
        {
            errors.Add(new ValidationError("attendance_checkout_before_checkin", "Check-out cannot be before check-in."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateLeaveRequest(HrLeaveRequest request)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(request.StaffUserId))
        {
            errors.Add(new ValidationError("staff_user_required", "Staff user is required."));
        }

        if (request.EndDate < request.StartDate)
        {
            errors.Add(new ValidationError("leave_date_range_invalid", "Leave end date cannot be before start date."));
        }

        if (request.Days <= 0)
        {
            errors.Add(new ValidationError("leave_days_invalid", "Leave days must be greater than zero."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateLeaveDecision(HrLeaveRequest request, HrLeaveStatus? proposedStatus = null)
    {
        var errors = new List<ValidationError>();
        if (request.Status != HrLeaveStatus.Pending)
        {
            errors.Add(new ValidationError("leave_already_decided", "Leave request has already been decided."));
        }

        if (proposedStatus is not null && proposedStatus is not HrLeaveStatus.Approved and not HrLeaveStatus.Rejected)
        {
            errors.Add(new ValidationError("leave_decision_invalid", "Leave requests can only be approved or rejected."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateLeaveCancellation(HrLeaveRequest request)
    {
        var errors = new List<ValidationError>();
        if (request.Status != HrLeaveStatus.Pending)
        {
            errors.Add(new ValidationError("leave_cancel_not_pending", "Only pending leave requests can be cancelled."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateMedicalCertificateUpload(HrLeaveRequest request)
    {
        var errors = new List<ValidationError>();
        if (request.Type != HrLeaveType.MedicalLeave)
        {
            errors.Add(new ValidationError("mc_only_for_medical_leave", "Medical certificate upload is only available for medical leave."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateLeaveBalance(HrLeaveBalance balance)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(balance.StaffUserId))
        {
            errors.Add(new ValidationError("staff_user_required", "Staff user is required."));
        }

        if (balance.AnnualLeaveDays < 0 || balance.MedicalLeaveDays < 0)
        {
            errors.Add(new ValidationError("leave_balance_negative", "Leave balances cannot be negative."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateLeavePolicy(HrLeavePolicy policy)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(policy.Role))
        {
            errors.Add(new ValidationError("leave_policy_role_required", "Leave policy role is required."));
        }

        if (policy.AnnualLeaveDays < 0 || policy.MedicalLeaveDays < 0)
        {
            errors.Add(new ValidationError("leave_policy_negative", "Leave policy days cannot be negative."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateLeaveAdjustment(HrLeaveAdjustment adjustment)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(adjustment.StaffUserId))
        {
            errors.Add(new ValidationError("staff_user_required", "Staff user is required."));
        }

        if (adjustment.Days <= 0)
        {
            errors.Add(new ValidationError("leave_adjustment_days_invalid", "Adjustment days must be greater than zero."));
        }

        if (string.IsNullOrWhiteSpace(adjustment.Reason))
        {
            errors.Add(new ValidationError("leave_adjustment_reason_required", "Adjustment reason is required."));
        }

        if (adjustment.AnnualLeaveAfter < 0 || adjustment.MedicalLeaveAfter < 0)
        {
            errors.Add(new ValidationError("leave_adjustment_negative_balance", "Adjustment cannot make leave balance negative."));
        }

        return new ValidationResult(errors);
    }

    public static HrLeaveAdjustment BuildLeaveAdjustment(HrLeaveBalance balance, HrLeaveAdjustmentRequest request, string actor)
    {
        var annualAfter = balance.AnnualLeaveDays;
        var medicalAfter = balance.MedicalLeaveDays;
        var signedDays = request.Direction == HrLeaveAdjustmentDirection.Increase ? request.Days : -request.Days;
        if (request.Type == HrLeaveAdjustmentType.AnnualLeave)
        {
            annualAfter += signedDays;
        }
        else
        {
            medicalAfter += signedDays;
        }

        return new HrLeaveAdjustment
        {
            StaffUserId = request.StaffUserId,
            Type = request.Type,
            Direction = request.Direction,
            Days = request.Days,
            AnnualLeaveBefore = balance.AnnualLeaveDays,
            MedicalLeaveBefore = balance.MedicalLeaveDays,
            AnnualLeaveAfter = annualAfter,
            MedicalLeaveAfter = medicalAfter,
            Reason = request.Reason,
            AdjustedBy = actor,
            CreatedAt = DateTime.UtcNow
        };
    }

    public static ValidationResult ValidatePayrollProfile(HrPayrollProfile profile)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(profile.StaffUserId))
        {
            errors.Add(new ValidationError("staff_user_required", "Staff user is required."));
        }

        if (profile.MonthlyBaseSalary < 0 || profile.HourlyRate < 0 || profile.OvertimeHours < 0 || profile.OvertimeRate < 0 || profile.Allowances < 0 || profile.ManualDeductions < 0)
        {
            errors.Add(new ValidationError("payroll_amount_negative", "Payroll amounts cannot be negative."));
        }

        if (profile.EmploymentType == HrEmploymentType.Hourly && profile.HourlyRate <= 0)
        {
            errors.Add(new ValidationError("hourly_rate_required", "Hourly workers need an hourly rate greater than zero."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidatePayPeriod(HrPayPeriod period)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(period.Name))
        {
            errors.Add(new ValidationError("pay_period_name_required", "Pay period name is required."));
        }

        if (period.EndDate < period.StartDate)
        {
            errors.Add(new ValidationError("pay_period_date_range_invalid", "Pay period end date cannot be before start date."));
        }

        if (period.WorkingDays <= 0)
        {
            errors.Add(new ValidationError("working_days_invalid", "Working days must be greater than zero."));
        }

        return new ValidationResult(errors);
    }

    public static decimal ApprovedLeaveDays(IEnumerable<HrLeaveRequest> leaves, string staffUserId, HrLeaveType type, HrPayPeriod period) =>
        leaves
            .Where(leave => leave.StaffUserId == staffUserId && leave.Type == type && leave.Status == HrLeaveStatus.Approved)
            .Where(leave => leave.StartDate <= period.EndDate && leave.EndDate >= period.StartDate)
            .Sum(leave => leave.Days);

    public static HrLeaveBalance ApplyApprovedLeave(HrLeaveBalance balance, HrLeaveRequest request)
    {
        if (request.Status != HrLeaveStatus.Approved)
        {
            return balance;
        }

        return request.Type switch
        {
            HrLeaveType.AnnualLeave => balance with { AnnualLeaveDays = Math.Max(0, balance.AnnualLeaveDays - request.Days) },
            HrLeaveType.MedicalLeave => balance with { MedicalLeaveDays = Math.Max(0, balance.MedicalLeaveDays - request.Days) },
            _ => balance
        };
    }

    public static HrPayslip GeneratePayslip(HrPayrollProfile profile, HrPayPeriod period, IEnumerable<HrLeaveRequest> leaveRequests, Guid? id = null) =>
        GeneratePayslip(profile, period, leaveRequests, [], id);

    public static HrPayslip GeneratePayslip(HrPayrollProfile profile, HrPayPeriod period, IEnumerable<HrLeaveRequest> leaveRequests, IEnumerable<HrAttendanceRecord> attendanceRecords, Guid? id = null)
    {
        if (profile.EmploymentType == HrEmploymentType.Hourly)
        {
            var workedHours = Math.Round(CompletedWorkedHours(attendanceRecords, profile.StaffUserId, period), 2, MidpointRounding.AwayFromZero);
            var attendancePay = Math.Round(workedHours * profile.HourlyRate, 2, MidpointRounding.AwayFromZero);
            var hourlyGross = Math.Round(attendancePay + profile.Allowances, 2, MidpointRounding.AwayFromZero);
            var hourlyNet = Math.Round(hourlyGross - profile.ManualDeductions, 2, MidpointRounding.AwayFromZero);
            return new HrPayslip
            {
                Id = id ?? Guid.NewGuid(),
                StaffUserId = profile.StaffUserId,
                PayPeriodId = period.Id,
                Status = HrPayslipStatus.Generated,
                EmploymentType = HrEmploymentType.Hourly,
                HourlyRate = profile.HourlyRate,
                WorkedHours = workedHours,
                AttendancePay = attendancePay,
                Allowances = profile.Allowances,
                ManualDeductions = profile.ManualDeductions,
                GrossPay = hourlyGross,
                NetPay = hourlyNet,
                GeneratedAt = DateTime.UtcNow
            };
        }

        var dailySalary = Math.Round(profile.MonthlyBaseSalary / period.WorkingDays, 2, MidpointRounding.AwayFromZero);
        var unpaidLeaveDays = ApprovedLeaveDays(leaveRequests, profile.StaffUserId, HrLeaveType.UnpaidLeave, period);
        var unpaidLeaveDeduction = Math.Round(dailySalary * unpaidLeaveDays, 2, MidpointRounding.AwayFromZero);
        var overtimePay = Math.Round(profile.OvertimeHours * profile.OvertimeRate, 2, MidpointRounding.AwayFromZero);
        var gross = Math.Round(profile.MonthlyBaseSalary + overtimePay + profile.Allowances, 2, MidpointRounding.AwayFromZero);
        var net = Math.Round(gross - unpaidLeaveDeduction - profile.ManualDeductions, 2, MidpointRounding.AwayFromZero);

        return new HrPayslip
        {
            Id = id ?? Guid.NewGuid(),
            StaffUserId = profile.StaffUserId,
            PayPeriodId = period.Id,
            Status = HrPayslipStatus.Generated,
            EmploymentType = HrEmploymentType.Monthly,
            BaseSalary = profile.MonthlyBaseSalary,
            WorkingDays = period.WorkingDays,
            DailySalary = dailySalary,
            UnpaidLeaveDays = unpaidLeaveDays,
            UnpaidLeaveDeduction = unpaidLeaveDeduction,
            OvertimePay = overtimePay,
            Allowances = profile.Allowances,
            ManualDeductions = profile.ManualDeductions,
            GrossPay = gross,
            NetPay = net,
            GeneratedAt = DateTime.UtcNow
        };
    }

    public static ValidationResult ValidateAttendanceNetwork(HrAttendanceNetwork network)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(network.Label)) errors.Add(new ValidationError("attendance_network_label_required", "Office network label is required."));
        if (!TryParseCidr(network.Cidr, out _, out _)) errors.Add(new ValidationError("attendance_network_cidr_invalid", "Office network must use a valid CIDR range."));
        return new ValidationResult(errors);
    }

    public static HrAttendanceNetwork? FindMatchingAttendanceNetwork(IPAddress? clientAddress, IEnumerable<HrAttendanceNetwork> networks)
    {
        if (clientAddress is null) return null;
        var normalizedClientAddress = clientAddress.IsIPv4MappedToIPv6 ? clientAddress.MapToIPv4() : clientAddress;
        return networks.FirstOrDefault(network => network.IsActive && TryParseCidr(network.Cidr, out var networkAddress, out var prefixLength) && IsWithinCidr(normalizedClientAddress, networkAddress, prefixLength));
    }

    public static decimal CompletedWorkedHours(IEnumerable<HrAttendanceRecord> attendance, string staffUserId, HrPayPeriod period) =>
        attendance
            .Where(record => record.StaffUserId == staffUserId && record.AttendanceDate >= period.StartDate && record.AttendanceDate <= period.EndDate)
            .Where(record => record.Status != HrAttendanceStatus.Absent && record.CheckInAt is not null && record.CheckOutAt is not null)
            .Sum(record => (decimal)(record.CheckOutAt!.Value - record.CheckInAt!.Value).TotalHours);

    private static bool TryParseCidr(string? value, out IPAddress networkAddress, out int prefixLength)
    {
        networkAddress = IPAddress.None;
        prefixLength = 0;
        var parts = value?.Trim().Split('/', StringSplitOptions.TrimEntries) ?? [];
        if (parts.Length != 2 || !IPAddress.TryParse(parts[0], out var parsedNetworkAddress) || !int.TryParse(parts[1], out prefixLength)) return false;
        networkAddress = parsedNetworkAddress;
        return prefixLength >= 0 && prefixLength <= networkAddress.GetAddressBytes().Length * 8;
    }

    private static bool IsWithinCidr(IPAddress candidate, IPAddress networkAddress, int prefixLength)
    {
        if (candidate.AddressFamily != networkAddress.AddressFamily) return false;
        var candidateBytes = candidate.GetAddressBytes();
        var networkBytes = networkAddress.GetAddressBytes();
        for (var bit = 0; bit < prefixLength; bit++)
        {
            var byteIndex = bit / 8;
            var bitMask = 1 << (7 - bit % 8);
            if ((candidateBytes[byteIndex] & bitMask) != (networkBytes[byteIndex] & bitMask)) return false;
        }
        return true;
    }
}

public static class WorkflowReferenceRules
{
    private static readonly HashSet<string> ShowroomVehicleTypes = ["Sedan", "SUV", "MPV", "Pickup"];
    private static readonly HashSet<string> ShowroomBudgetRanges = ["Under RM30k", "RM30k–RM50k", "RM50k–RM80k", "RM80k+"];
    private static readonly EmailAddressAttribute EmailAddressValidator = new();
    public static ValidationResult ValidatePublicLead(LeadRequest request, IEnumerable<Vehicle> vehicles)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(request.CustomerName))
        {
            errors.Add(new ValidationError("customer_name_required", "Customer name is required."));
        }

        if (string.IsNullOrWhiteSpace(request.Phone))
        {
            errors.Add(new ValidationError("phone_required", "Phone is required."));
        }

        var vehicle = vehicles.FirstOrDefault(item => item.Id == request.VehicleId);
        if (vehicle is null)
        {
            errors.Add(new ValidationError("vehicle_not_found", "Lead must be linked to an existing vehicle."));
            return new ValidationResult(errors);
        }

        if (vehicle is not { BossConfirmed: true, IsPublic: true, Status: VehicleStatus.Available })
        {
            errors.Add(new ValidationError("vehicle_not_public", "Lead vehicle is not available on the public website."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidatePublicContactEnquiry(ContactEnquiryRequest request)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(request.CustomerName))
        {
            errors.Add(new ValidationError("customer_name_required", "Customer name is required."));
        }

        if (string.IsNullOrWhiteSpace(request.Phone))
        {
            errors.Add(new ValidationError("phone_required", "Phone is required."));
        }

        if (string.IsNullOrWhiteSpace(request.Message))
        {
            errors.Add(new ValidationError("message_required", "Message is required."));
        }
        else if (request.Message.Trim().Length > 2000)
        {
            errors.Add(new ValidationError("message_too_long", "Message must be 2,000 characters or fewer."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateShowroomEnquiry(ShowroomEnquiryRequest request)
    {
        var errors = new List<ValidationError>();
        if (!ShowroomVehicleTypes.Contains(request.VehicleType?.Trim() ?? "")) errors.Add(new ValidationError("vehicle_type_invalid", "Choose a valid vehicle type."));
        if (!ShowroomBudgetRanges.Contains(request.BudgetRange?.Trim() ?? "")) errors.Add(new ValidationError("budget_range_invalid", "Choose a valid budget range."));
        if (string.IsNullOrWhiteSpace(request.CustomerName)) errors.Add(new ValidationError("customer_name_required", "Customer name is required."));
        else if (request.CustomerName.Trim().Length > 120) errors.Add(new ValidationError("customer_name_too_long", "Customer name must be 120 characters or fewer."));
        if (string.IsNullOrWhiteSpace(request.Phone)) errors.Add(new ValidationError("phone_required", "Phone is required."));
        else if (request.Phone.Trim().Length > 64) errors.Add(new ValidationError("phone_too_long", "Phone must be 64 characters or fewer."));
        if (!string.IsNullOrWhiteSpace(request.PreferredBrand) && request.PreferredBrand.Trim().Length > 80) errors.Add(new ValidationError("preferred_brand_too_long", "Preferred brand must be 80 characters or fewer."));
        if (!string.IsNullOrWhiteSpace(request.PreferredModel) && request.PreferredModel.Trim().Length > 100) errors.Add(new ValidationError("preferred_model_too_long", "Preferred model must be 100 characters or fewer."));
        if (!string.IsNullOrWhiteSpace(request.Email) && (request.Email.Trim().Length > 320 || !EmailAddressValidator.IsValid(request.Email.Trim()))) errors.Add(new ValidationError("email_invalid", "Enter a valid email address."));
        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateLoan(LoanApplication loan, IEnumerable<Vehicle> vehicles, IEnumerable<Customer> customers, IEnumerable<LoanApplication>? existingLoans = null)
    {
        var errors = new List<ValidationError>();
        var linkedVehicle = vehicles.FirstOrDefault(vehicle => vehicle.Id == loan.VehicleId);
        if (linkedVehicle is null)
        {
            errors.Add(new ValidationError("vehicle_not_found", "Loan must be linked to an existing car plate."));
        }
        else if (linkedVehicle.CustomerId is { } vehicleCustomerId && vehicleCustomerId != loan.CustomerId)
        {
            errors.Add(new ValidationError("vehicle_customer_mismatch", "Loan customer must match the customer linked to the selected vehicle."));
        }
        else if (linkedVehicle.CustomerId is null && (existingLoans ?? []).Any(existingLoan =>
            existingLoan.Id != loan.Id &&
            existingLoan.VehicleId == loan.VehicleId &&
            WorkflowStatusRules.IsActiveLoan(existingLoan) &&
            existingLoan.CustomerId != loan.CustomerId))
        {
            errors.Add(new ValidationError("legacy_vehicle_customer_conflict", "Unassigned vehicle already has a loan for another customer."));
        }

        if (!customers.Any(customer => customer.Id == loan.CustomerId))
        {
            errors.Add(new ValidationError("customer_not_found", "Loan must be linked to an existing customer."));
        }

        if (loan.Status is (LoanStatus.Pending or LoanStatus.Approved or LoanStatus.Done) && loan.SubmittedAt is null)
        {
            errors.Add(new ValidationError("loan_submitted_date_required", "Submitted date is required for active loan follow-up."));
        }

        if ((loan.LouDone || loan.Status is LoanStatus.Approved or LoanStatus.Done) && !loan.LouApproved)
        {
            errors.Add(new ValidationError("lou_approval_required", "LOU must be approved before the loan can be approved."));
        }

        if (loan.Status is LoanStatus.Done && !loan.LouDone)
        {
            errors.Add(new ValidationError("lou_done_required", "LOU must be marked done before the loan can be completed."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateVehicleLink(Guid vehicleId, IEnumerable<Vehicle> vehicles)
    {
        return vehicles.Any(vehicle => vehicle.Id == vehicleId)
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError("vehicle_not_found", "Record must be linked to an existing car plate.")]);
    }

    public static ValidationResult ValidateCanonicalBuyer(Guid vehicleId, IEnumerable<Vehicle> vehicles, IEnumerable<Customer> customers, string workflow)
    {
        var vehicle = vehicles.FirstOrDefault(item => item.Id == vehicleId);
        if (vehicle is null)
        {
            return new ValidationResult([new ValidationError("vehicle_not_found", $"{workflow} must be linked to an existing car plate.")]);
        }

        if (vehicle.CustomerId is not { } customerId)
        {
            return new ValidationResult([new ValidationError("vehicle_customer_required", $"{workflow} requires a confirmed buyer on the vehicle.")]);
        }

        return customers.Any(customer => customer.Id == customerId)
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError("customer_not_found", $"{workflow} buyer must be an existing customer.")]);
    }
}

public static class LoanMutationRules
{
    public static ValidationResult ValidateIdentity(LoanApplication existing, LoanApplication update) =>
        existing.VehicleId == update.VehicleId
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError(
                "loan_vehicle_locked",
                "Loan vehicle identity cannot be changed after the loan is created.")]);
}

public static class WorkflowStatusRules
{
    public static bool IsActiveLoan(LoanApplication loan) =>
        loan.Status is LoanStatus.Pending or LoanStatus.Approved or LoanStatus.Done;

    public static Vehicle ApplyLoanStatus(Vehicle vehicle, LoanApplication loan)
    {
        if (IsActiveLoan(loan))
        {
            return vehicle with { CustomerId = vehicle.CustomerId ?? loan.CustomerId, Status = VehicleStatus.LoanProcessing, IsPublic = false };
        }

        return vehicle;
    }

    public static Vehicle ApplyWorkflowStatus(
        Vehicle vehicle,
        IEnumerable<LoanApplication> loans,
        IEnumerable<PaymentRecord> payments,
        IEnumerable<DeliverySchedule>? deliveries = null)
    {
        var deliveryList = (deliveries ?? []).ToList();
        var financeCleared = payments.Any(payment => payment.VehicleId == vehicle.Id && payment.Status == PaymentStatus.Reconciled);
        var releasedAt = deliveryList
            .Where(delivery => delivery.VehicleId == vehicle.Id && delivery.Status == DeliveryStatus.Released)
            .Select(delivery => delivery.ReleasedAt)
            .Where(timestamp => timestamp.HasValue)
            .OrderBy(timestamp => timestamp)
            .FirstOrDefault();
        var released = deliveryList.Any(delivery => delivery.VehicleId == vehicle.Id && delivery.Status == DeliveryStatus.Released);
        if (financeCleared && released)
        {
            return vehicle with { Status = VehicleStatus.Sold, IsPublic = false, SoldAt = vehicle.SoldAt ?? releasedAt ?? DateTime.UtcNow };
        }

        var activeLoan = loans.FirstOrDefault(loan => loan.VehicleId == vehicle.Id && IsActiveLoan(loan));
        if (activeLoan is not null)
        {
            return ApplyLoanStatus(vehicle, activeLoan);
        }

        return vehicle.Status is VehicleStatus.LoanProcessing or VehicleStatus.Sold
            ? vehicle with { Status = VehicleStatus.Available, IsPublic = false }
            : vehicle;
    }

    public static Vehicle ApplyPaymentStatus(Vehicle vehicle, PaymentRecord payment, IEnumerable<DeliverySchedule>? deliveries = null)
    {
        return ApplyPaymentStatus(vehicle, [payment], deliveries);
    }

    public static Vehicle ApplyPaymentStatus(Vehicle vehicle, IEnumerable<PaymentRecord> payments, IEnumerable<DeliverySchedule>? deliveries = null)
    {
        var deliveryList = (deliveries ?? []).ToList();
        var releasedAt = deliveryList
            .Where(delivery => delivery.VehicleId == vehicle.Id && delivery.Status == DeliveryStatus.Released)
            .Select(delivery => delivery.ReleasedAt)
            .Where(timestamp => timestamp.HasValue)
            .OrderBy(timestamp => timestamp)
            .FirstOrDefault();
        if (payments.Any(payment => payment.VehicleId == vehicle.Id && payment.Status == PaymentStatus.Reconciled) &&
            deliveryList.Any(delivery => delivery.VehicleId == vehicle.Id && delivery.Status == DeliveryStatus.Released))
        {
            return vehicle with { Status = VehicleStatus.Sold, IsPublic = false, SoldAt = vehicle.SoldAt ?? releasedAt ?? DateTime.UtcNow };
        }

        return vehicle.Status == VehicleStatus.Sold
            ? vehicle with { Status = VehicleStatus.LoanProcessing, IsPublic = false }
            : vehicle;
    }
}

public static class AuditTrail
{
    public static string ActorFrom(ClaimsPrincipal principal) =>
        string.IsNullOrWhiteSpace(principal.Identity?.Name)
            ? "system"
            : principal.Identity.Name.Trim();

    public static AuditLog Record(string actor, string action, string entityName, Guid entityId, DateTime createdAt) =>
        new()
        {
            Actor = string.IsNullOrWhiteSpace(actor) ? "system" : actor.Trim(),
            Action = action.Trim(),
            EntityName = entityName.Trim(),
            EntityId = entityId,
            CreatedAt = createdAt
        };
}

public static class ReminderRules
{
    public static bool IsLoanFollowUpDue(LoanApplication loan, DateOnly today) =>
        loan is { Status: LoanStatus.Pending, SubmittedAt: not null } &&
        loan.SubmittedAt.Value.AddDays(3) <= today;

    public static bool IsSettlementDue(SettlementReminder reminder, DateOnly today) =>
        !reminder.IsPaid && reminder.Deadline <= today;

    public static bool IsDailySpendDue(DailySpend spend, DateOnly today) =>
        !spend.IsPaid && spend.DueDate <= today;

    public static bool IsDeliveryPreparationDue(DeliverySchedule delivery, DateOnly today) =>
        DeliveryWorkboardRules.IsActive(delivery) &&
        !delivery.TwoDayNoticeSent &&
        delivery.ScheduledDate.AddDays(-2) <= today;

    public static bool IsPaymentBankFollowUpDue(PaymentRecord payment, DateOnly today) =>
        payment.Status != PaymentStatus.Reconciled &&
        payment.BankFollowUpDate is { } followUpDate &&
        followUpDate <= today;

    public static bool IsPaymentStatusFollowUpDue(PaymentRecord payment, DateOnly today) =>
        payment.Status is PaymentStatus.Pending or PaymentStatus.Approved or PaymentStatus.Disbursed &&
        DateOnly.FromDateTime(payment.CreatedAt.ToUniversalTime()) <= today;

    public static bool IsDebtRecoveryFollowUpDue(DebtRecoveryCase debt, DateOnly today) =>
        debt.Status != DebtRecoveryStatus.Closed &&
        debt.BalanceAmount > 0 &&
        debt.FollowUpDate <= today;

    public static bool IsPaymentVoucherFollowUpDue(PaymentVoucher voucher, DateOnly today) =>
        voucher.Status is PaymentVoucherStatus.Pending or PaymentVoucherStatus.Approved &&
        voucher.IssuedDate <= today;
}

public static class ReminderInbox
{
    public const int DailySpendDueSoonDays = 10;

    private static readonly HashSet<string> DueFilters = new(StringComparer.OrdinalIgnoreCase)
    {
        "All",
        "Overdue",
        "DueToday",
        "DueSoon",
        "Upcoming"
    };

    public static IReadOnlyList<ReminderItem> Create(
        IEnumerable<LoanApplication> loans,
        IEnumerable<DeliverySchedule> deliveries,
        IEnumerable<SettlementReminder> settlements,
        IEnumerable<PaymentRecord> payments,
        IEnumerable<DailySpend> dailySpends,
        IEnumerable<DebtRecoveryCase> debtRecoveries,
        IEnumerable<PaymentVoucher> paymentVouchers,
        IEnumerable<Vehicle> vehicles,
        DateOnly today)
    {
        var vehicleById = vehicles.ToDictionary(vehicle => vehicle.Id);
        var reminders = new List<ReminderItem>();

        foreach (var loan in loans.Where(loan => ReminderRules.IsLoanFollowUpDue(loan, today)))
        {
            reminders.Add(new ReminderItem(
                "LoanFollowUp",
                "3-day loan follow-up",
                PlateFor(vehicleById, loan.VehicleId),
                loan.VehicleId,
                loan.SubmittedAt!.Value.AddDays(3),
                null));
        }

        foreach (var delivery in deliveries.Where(delivery => ReminderRules.IsDeliveryPreparationDue(delivery, today)))
        {
            reminders.Add(new ReminderItem(
                "DeliveryPreparation",
                "2-day delivery preparation",
                PlateFor(vehicleById, delivery.VehicleId),
                delivery.VehicleId,
                delivery.ScheduledDate,
                null));
        }

        foreach (var settlement in settlements.Where(settlement => ReminderRules.IsSettlementDue(settlement, today)))
        {
            reminders.Add(new ReminderItem(
                "SettlementDue",
                "Settlement deadline due",
                PlateFor(vehicleById, settlement.VehicleId),
                settlement.VehicleId,
                settlement.Deadline,
                settlement.Amount));
        }

        foreach (var payment in payments.Where(payment => ReminderRules.IsPaymentBankFollowUpDue(payment, today)))
        {
            reminders.Add(new ReminderItem(
                "PaymentBankFollowUp",
                "Bank payment follow-up",
                PlateFor(vehicleById, payment.VehicleId),
                payment.VehicleId,
                payment.BankFollowUpDate!.Value,
                payment.NettPrice));
        }

        foreach (var payment in payments.Where(payment => ReminderRules.IsPaymentStatusFollowUpDue(payment, today)))
        {
            reminders.Add(new ReminderItem(
                "PaymentStatusFollowUp",
                $"Payment status follow-up: {payment.Status}",
                PlateFor(vehicleById, payment.VehicleId),
                payment.VehicleId,
                DateOnly.FromDateTime(payment.CreatedAt.ToUniversalTime()),
                payment.NettPrice));
        }

        foreach (var spend in dailySpends.Where(spend => ReminderRules.IsDailySpendDue(spend, today) || IsDailySpendDueSoon(spend, today)))
        {
            reminders.Add(new ReminderItem(
                "DailySpendDue",
                $"Daily spend due: {spend.Description}",
                "General",
                Guid.Empty,
                spend.DueDate,
                spend.Amount));
        }

        foreach (var debt in debtRecoveries.Where(debt => ReminderRules.IsDebtRecoveryFollowUpDue(debt, today)))
        {
            reminders.Add(new ReminderItem(
                "DebtRecoveryFollowUp",
                "Customer balance follow-up",
                PlateFor(vehicleById, debt.VehicleId),
                debt.VehicleId,
                debt.FollowUpDate,
                debt.BalanceAmount));
        }

        foreach (var voucher in paymentVouchers.Where(voucher => ReminderRules.IsPaymentVoucherFollowUpDue(voucher, today)))
        {
            reminders.Add(new ReminderItem(
                "PaymentVoucherFollowUp",
                $"Payment voucher follow-up: {voucher.Status}",
                PlateFor(vehicleById, voucher.VehicleId),
                voucher.VehicleId,
                voucher.IssuedDate,
                voucher.Amount));
        }

        return reminders.OrderBy(reminder => reminder.DueDate).ThenBy(reminder => reminder.Type).ToList();
    }

    public static bool IsValidDueFilter(string? due) =>
        string.IsNullOrWhiteSpace(due) || DueFilters.Contains(due);

    public static bool IsDailySpendDueSoon(DailySpend spend, DateOnly today) =>
        !spend.IsPaid &&
        spend.DueDate > today &&
        spend.DueDate <= today.AddDays(DailySpendDueSoonDays);

    public static bool IsDueSoon(ReminderItem reminder, DateOnly today) =>
        reminder.Type == "DailySpendDue" &&
        reminder.DueDate > today &&
        reminder.DueDate <= today.AddDays(DailySpendDueSoonDays);

    public static IReadOnlyList<ReminderItem> Filter(IEnumerable<ReminderItem> reminders, string? type, string? due, DateOnly today)
    {
        var normalizedType = string.IsNullOrWhiteSpace(type) || string.Equals(type, "All", StringComparison.OrdinalIgnoreCase)
            ? null
            : type.Trim();
        var normalizedDue = string.IsNullOrWhiteSpace(due) ? "All" : due.Trim();

        return reminders
            .Where(reminder => normalizedType is null || string.Equals(reminder.Type, normalizedType, StringComparison.OrdinalIgnoreCase))
            .Where(reminder => normalizedDue.ToUpperInvariant() switch
            {
                "OVERDUE" => reminder.DueDate < today,
                "DUETODAY" => reminder.DueDate == today,
                "DUESOON" => IsDueSoon(reminder, today),
                "UPCOMING" => reminder.DueDate > today && !IsDueSoon(reminder, today),
                _ => true
            })
            .OrderBy(reminder => reminder.DueDate)
            .ThenBy(reminder => reminder.Type)
            .ToList();
    }

    private static string PlateFor(IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) =>
        vehicles.TryGetValue(vehicleId, out var vehicle) ? vehicle.PlateNumber : "Unknown";
}

public static class FinanceRules
{
    public static ValidationResult ValidatePayment(PaymentRecord payment)
    {
        return ValidatePayment(payment, []);
    }

    public static ValidationResult ValidatePayment(
        PaymentRecord payment,
        IEnumerable<PaymentRecord> existing)
    {
        var errors = new List<ValidationError>();
        if (payment.NettPrice <= 0)
        {
            errors.Add(new ValidationError("invalid_nett_price", "Payment nett price must be greater than zero."));
        }

        if (payment.SalesPrice < 0)
        {
            errors.Add(new ValidationError("invalid_sales_price", "Payment sales price cannot be negative."));
        }

        if (payment.InterestAdditionalCharges < 0)
        {
            errors.Add(new ValidationError("invalid_interest_additional_charges", "Interest and additional charges cannot be negative."));
        }

        if (payment.NcdAmount < 0)
        {
            errors.Add(new ValidationError("invalid_ncd_amount", "NCD amount cannot be negative."));
        }

        if (payment.WindscreenCharges < 0)
        {
            errors.Add(new ValidationError("invalid_windscreen_charges", "Windscreen charges cannot be negative."));
        }

        if (payment.Status == PaymentStatus.Reconciled)
        {
            if (!payment.BossChecked)
            {
                errors.Add(new ValidationError("payment_boss_check_required", "Boss check is required before payment reconciliation."));
            }

            if (!payment.DocumentsPrepared)
            {
                errors.Add(new ValidationError("payment_documents_prepared_required", "Finance documents must be prepared before payment reconciliation."));
            }

            if (!payment.ChecklistValidated)
            {
                errors.Add(new ValidationError("payment_checklist_validated_required", "Finance checklist must be validated before payment reconciliation."));
            }

            if (string.IsNullOrWhiteSpace(payment.ReceiptNumber))
            {
                errors.Add(new ValidationError("receipt_number_required", "Receipt number is required before payment reconciliation."));
            }

            if (string.IsNullOrWhiteSpace(payment.InvoiceNumber))
            {
                errors.Add(new ValidationError("payment_invoice_number_required", "Invoice number is required before payment reconciliation."));
            }

            if (!string.IsNullOrWhiteSpace(payment.ReceiptNumber))
            {
                var receiptNumber = payment.ReceiptNumber.Trim();
                if (existing.Any(item =>
                    item.Id != payment.Id &&
                    !string.IsNullOrWhiteSpace(item.ReceiptNumber) &&
                    item.ReceiptNumber.Trim().Equals(receiptNumber, StringComparison.OrdinalIgnoreCase)))
                {
                    errors.Add(new ValidationError("duplicate_receipt_number", "Receipt number already exists on another payment."));
                }
            }

            if (!string.IsNullOrWhiteSpace(payment.InvoiceNumber))
            {
                var invoiceNumber = payment.InvoiceNumber.Trim();
                if (existing.Any(item =>
                    item.Id != payment.Id &&
                    !string.IsNullOrWhiteSpace(item.InvoiceNumber) &&
                    item.InvoiceNumber.Trim().Equals(invoiceNumber, StringComparison.OrdinalIgnoreCase)))
                {
                    errors.Add(new ValidationError("duplicate_payment_invoice_number", "Payment invoice number already exists on another payment."));
                }
            }

        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateSettlement(SettlementReminder settlement) =>
        ValidateSettlement(settlement, []);

    public static ValidationResult ValidateSettlement(SettlementReminder settlement, IEnumerable<Owner> owners)
    {
        var errors = new List<ValidationError>();
        if (settlement.Amount <= 0)
        {
            errors.Add(new ValidationError("invalid_settlement_amount", "Settlement amount must be greater than zero."));
        }

        if (settlement.Deadline == default)
        {
            errors.Add(new ValidationError("settlement_deadline_required", "Settlement deadline is required."));
        }

        if (settlement.OwnerId is { } ownerId && !owners.Any(owner => owner.Id == ownerId))
        {
            errors.Add(new ValidationError("unknown_settlement_owner", "Settlement owner must reference an existing previous owner."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateDailySpend(DailySpend spend)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(spend.Description))
        {
            errors.Add(new ValidationError("daily_spend_description_required", "Daily spend description is required."));
        }

        if (spend.Amount <= 0)
        {
            errors.Add(new ValidationError("invalid_daily_spend_amount", "Daily spend amount must be greater than zero."));
        }

        if (spend.DueDate == default)
        {
            errors.Add(new ValidationError("daily_spend_due_date_required", "Daily spend due date is required."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateBrokerCommission(BrokerCommission commission, IEnumerable<Vehicle> vehicles)
    {
        var errors = new List<ValidationError>();
        if (!vehicles.Any(vehicle => vehicle.Id == commission.VehicleId))
        {
            errors.Add(new ValidationError("vehicle_not_found", "Broker commission must be linked to an existing car plate."));
        }

        if (string.IsNullOrWhiteSpace(commission.BrokerName))
        {
            errors.Add(new ValidationError("broker_name_required", "Broker name is required."));
        }

        if (commission.Amount <= 0)
        {
            errors.Add(new ValidationError("invalid_broker_commission_amount", "Broker commission amount must be greater than zero."));
        }

        if (commission.Cp58Prepared && !commission.Cp58Required)
        {
            errors.Add(new ValidationError("cp58_required_missing", "CP58 cannot be marked prepared unless CP58 is required."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateDebtRecovery(DebtRecoveryCase debt, IEnumerable<Vehicle> vehicles, IEnumerable<Customer> customers)
    {
        var errors = new List<ValidationError>();
        if (!vehicles.Any(vehicle => vehicle.Id == debt.VehicleId))
        {
            errors.Add(new ValidationError("vehicle_not_found", "Debt recovery case must be linked to an existing car plate."));
        }

        if (!customers.Any(customer => customer.Id == debt.CustomerId))
        {
            errors.Add(new ValidationError("customer_not_found", "Debt recovery case must be linked to an existing customer."));
        }

        if (debt.BalanceAmount <= 0)
        {
            errors.Add(new ValidationError("invalid_debt_balance_amount", "Debt recovery balance amount must be greater than zero."));
        }

        if (debt.FollowUpDate == default)
        {
            errors.Add(new ValidationError("debt_follow_up_date_required", "Debt recovery follow-up date is required."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidatePaymentVoucher(PaymentVoucher voucher, IEnumerable<Vehicle> vehicles)
    {
        var errors = new List<ValidationError>();
        if (!vehicles.Any(vehicle => vehicle.Id == voucher.VehicleId))
        {
            errors.Add(new ValidationError("vehicle_not_found", "Payment voucher must be linked to an existing car plate."));
        }

        if (string.IsNullOrWhiteSpace(voucher.PayeeName))
        {
            errors.Add(new ValidationError("payment_voucher_payee_required", "Payment voucher payee is required."));
        }

        if (voucher.Amount <= 0)
        {
            errors.Add(new ValidationError("invalid_payment_voucher_amount", "Payment voucher amount must be greater than zero."));
        }

        if (string.IsNullOrWhiteSpace(voucher.Purpose))
        {
            errors.Add(new ValidationError("payment_voucher_purpose_required", "Payment voucher purpose is required."));
        }

        if (voucher.IssuedDate == default)
        {
            errors.Add(new ValidationError("payment_voucher_issued_date_required", "Payment voucher issued date is required."));
        }

        if (string.IsNullOrWhiteSpace(voucher.SourceAccountCode))
        {
            errors.Add(new ValidationError("payment_voucher_source_account_required", "Payment voucher source bank or cash account is required."));
        }

        if (string.IsNullOrWhiteSpace(voucher.AccountingAccountCode))
        {
            errors.Add(new ValidationError("payment_voucher_account_required", "Payment voucher accounting account is required."));
        }

        if (voucher.PaymentMethod == DisbursementMethod.Cheque && string.IsNullOrWhiteSpace(voucher.ChequeNumber))
        {
            errors.Add(new ValidationError("payment_voucher_cheque_number_required", "Cheque number is required for cheque payments."));
        }

        if (voucher.BankChargeAmount < 0)
        {
            errors.Add(new ValidationError("invalid_payment_voucher_bank_charge", "Bank charge cannot be negative."));
        }

        if (voucher.BankChargeAmount > 0 && string.IsNullOrWhiteSpace(voucher.BankChargeAccountCode))
        {
            errors.Add(new ValidationError("payment_voucher_bank_charge_account_required", "Bank charge account is required when a bank charge is entered."));
        }

        return new ValidationResult(errors);
    }
}

public static class PriorityActionQueue
{
    public static IReadOnlyList<PriorityActionItem> Create(
        IEnumerable<string> roles,
        IEnumerable<LoanApplication> loans,
        IEnumerable<DeliverySchedule> deliveries,
        IEnumerable<SettlementReminder> settlements,
        IEnumerable<PaymentRecord> payments,
        IEnumerable<DailySpend> dailySpends,
        IEnumerable<DebtRecoveryCase> debtRecoveries,
        IEnumerable<PaymentVoucher> paymentVouchers,
        IEnumerable<RepairJob> repairs,
        IEnumerable<Lead> leads,
        IEnumerable<HrLeaveRequest> leaveRequests,
        IEnumerable<Vehicle> vehicles,
        DateOnly today)
    {
        var roleSet = roles.ToHashSet(StringComparer.Ordinal);
        var isBoss = roleSet.Contains("BossAdmin");
        var vehicleById = vehicles.ToDictionary(vehicle => vehicle.Id);
        var items = new List<PriorityActionItem>();
        var reminders = ReminderInbox.Create(loans, deliveries, settlements, payments, dailySpends, debtRecoveries, paymentVouchers, vehicles, today);

        void AddReminders(IEnumerable<ReminderItem> source, string target) =>
            items.AddRange(source.Select(item => new PriorityActionItem(item.Type, item.Title, target, item.DueDate, item.VehiclePlate, item.Amount)));

        if (isBoss || roleSet.Contains("Loan")) AddReminders(reminders.Where(item => item.Type == "LoanFollowUp"), "Loans");
        if (isBoss || roleSet.Contains("Delivery")) AddReminders(reminders.Where(item => item.Type == "DeliveryPreparation"), "Delivery");
        if (isBoss || roleSet.Contains("Finance")) AddReminders(reminders.Where(item => item.Type is "SettlementDue" or "PaymentBankFollowUp" or "PaymentStatusFollowUp" or "DailySpendDue" or "DebtRecoveryFollowUp" or "PaymentVoucherFollowUp"), "Finance");
        if (isBoss || roleSet.Contains("Finance"))
        {
            items.AddRange(deliveries
                .Where(DeliveryWorkboardRules.HasOpenInvoiceUpdateRequest)
                .Select(delivery => new PriorityActionItem(
                    "DeliveryInvoiceUpdate",
                    "Delivery requested an invoice update",
                    "Finance",
                    delivery.InvoiceUpdateRequestedAt.HasValue
                        ? BusinessClock.SingaporeDate(new DateTimeOffset(DateTime.SpecifyKind(delivery.InvoiceUpdateRequestedAt.Value, DateTimeKind.Utc)))
                        : today,
                    vehicleById.TryGetValue(delivery.VehicleId, out var vehicle)
                        ? $"{vehicle.PlateNumber}: {delivery.InvoiceUpdateRequestReason}"
                        : delivery.InvoiceUpdateRequestReason)));
        }

        if (isBoss || roleSet.Contains("Sales"))
        {
            items.AddRange(leads.Where(lead => lead.Status == LeadStatus.New)
                .Select(lead => new PriorityActionItem("LeadFollowUp", "New enquiry needs first contact", "Leads", DateOnly.FromDateTime(lead.CreatedAt.ToUniversalTime()), lead.CustomerName)));
        }

        if (isBoss || roleSet.Contains("Repair"))
        {
            items.AddRange(repairs.Where(repair => !repair.ChecklistDone)
                .Select(repair => new PriorityActionItem(
                    "RepairWorkInProgress",
                    repair.ExpectedCompletionDate is { } expected && expected < today ? "Repair work overdue" : "Repair work in progress",
                    "Repairs",
                    repair.ExpectedCompletionDate ?? DateOnly.FromDateTime(repair.CreatedAt.ToUniversalTime()),
                    vehicleById.TryGetValue(repair.VehicleId, out var vehicle) ? vehicle.PlateNumber : "Unknown")));
        }

        if (isBoss || roleSet.Contains("HrSalary"))
        {
            items.AddRange(leaveRequests.Where(request => request.Status == HrLeaveStatus.Pending)
                .Select(request => new PriorityActionItem("LeaveApproval", "Leave request awaiting decision", "HrSalary", request.StartDate, request.Type.ToString())));
        }

        return items.OrderBy(item => item.DueDate).ThenBy(item => item.Type).ToList();
    }
}

public static class PaymentManagementReviewRules
{
    public static PaymentRecord PrepareForCreate(PaymentRecord payment) =>
        payment with { BossChecked = false };

    public static PaymentRecord ApplyManagementReview(PaymentRecord payment) =>
        payment with { BossChecked = true };

    public static PaymentRecord PrepareForUpdate(PaymentRecord existing, PaymentRecord update) =>
        update with
        {
            BossChecked = HasMaterialChanges(existing, update) ? false : existing.BossChecked,
            CreatedAt = existing.CreatedAt
        };

    public static bool HasMaterialChanges(PaymentRecord existing, PaymentRecord update) =>
        existing.VehicleId != update.VehicleId ||
        existing.NettPrice != update.NettPrice ||
        !string.Equals(existing.ReceiptNumber?.Trim(), update.ReceiptNumber?.Trim(), StringComparison.Ordinal) ||
        !string.Equals(existing.InvoiceNumber?.Trim(), update.InvoiceNumber?.Trim(), StringComparison.Ordinal) ||
        existing.SalesPrice != update.SalesPrice ||
        existing.InterestAdditionalCharges != update.InterestAdditionalCharges ||
        existing.NcdAmount != update.NcdAmount ||
        existing.WindscreenCharges != update.WindscreenCharges ||
        existing.OutstationDeliveryDate != update.OutstationDeliveryDate ||
        !string.Equals(existing.BankName?.Trim(), update.BankName?.Trim(), StringComparison.Ordinal) ||
        existing.BankFollowUpDate != update.BankFollowUpDate ||
        existing.DocumentsPrepared != update.DocumentsPrepared ||
        existing.ChecklistValidated != update.ChecklistValidated;

    public static bool HasInvoiceRelatedChanges(PaymentRecord existing, PaymentRecord update) =>
        existing.NettPrice != update.NettPrice ||
        !string.Equals(existing.InvoiceNumber?.Trim(), update.InvoiceNumber?.Trim(), StringComparison.Ordinal) ||
        existing.SalesPrice != update.SalesPrice ||
        existing.InterestAdditionalCharges != update.InterestAdditionalCharges ||
        existing.NcdAmount != update.NcdAmount ||
        existing.WindscreenCharges != update.WindscreenCharges;

    public static ValidationResult ValidateIdentity(PaymentRecord existing, PaymentRecord update) =>
        existing.VehicleId == update.VehicleId
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError(
                "payment_vehicle_locked",
                "Payment vehicle identity cannot be changed after the payment is created.")]);
}

public static class UploadPolicy
{
    public const long VehiclePhotoLimit = 5 * 1024 * 1024;
    public const long DocumentLimit = 10 * 1024 * 1024;
    public const long MultipartBodyLimit = DocumentLimit + 1024 * 1024;

    public static bool IsAllowed(FileCategory category, long byteLength) =>
        byteLength > 0 && byteLength <= LimitFor(category);

    public static ValidationResult ValidateDocumentCategory(FileCategory category) =>
        category == FileCategory.VehiclePhoto
            ? new ValidationResult([new ValidationError("invalid_document_category", "Vehicle photos must be uploaded through the photo endpoint.")])
            : new ValidationResult([]);

    public static (ValidationResult Result, string? MimeType) ValidateCollectionEvidenceContent(
        string fileName,
        string? declaredMimeType,
        ReadOnlySpan<byte> bytes)
    {
        var detectedMimeType = DetectCollectionEvidenceMimeType(bytes);
        if (detectedMimeType is null || !IsStructurallyValidCollectionEvidence(detectedMimeType, bytes))
        {
            return (new ValidationResult([new ValidationError(
                "collection_evidence_content_invalid",
                "Collection evidence must be a valid PDF, JPEG, PNG, or WebP file.")]), null);
        }

        var normalizedDeclaredMimeType = declaredMimeType?.Split(';', 2)[0].Trim().ToLowerInvariant() switch
        {
            "image/jpg" => "image/jpeg",
            { Length: > 0 } value => value,
            _ => null
        };
        if (!string.Equals(normalizedDeclaredMimeType, detectedMimeType, StringComparison.Ordinal))
        {
            return (new ValidationResult([new ValidationError(
                "collection_evidence_mime_mismatch",
                "The uploaded evidence content does not match its declared file type.")]), null);
        }

        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var extensionMatches = detectedMimeType switch
        {
            "application/pdf" => extension == ".pdf",
            "image/jpeg" => extension is ".jpg" or ".jpeg",
            "image/png" => extension == ".png",
            "image/webp" => extension == ".webp",
            _ => false
        };
        if (!extensionMatches)
        {
            return (new ValidationResult([new ValidationError(
                "collection_evidence_extension_mismatch",
                "The uploaded evidence filename does not match its verified file type.")]), null);
        }

        return (new ValidationResult([]), detectedMimeType);
    }

    public static long LimitFor(FileCategory category) =>
        category == FileCategory.VehiclePhoto ? VehiclePhotoLimit : DocumentLimit;

    private static string? DetectCollectionEvidenceMimeType(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length >= 5 && bytes[..5].SequenceEqual("%PDF-"u8)) return "application/pdf";
        if (bytes.Length >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF) return "image/jpeg";
        if (bytes.Length >= 8 && bytes[..8].SequenceEqual(new byte[] { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A })) return "image/png";
        if (bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes.Slice(8, 4).SequenceEqual("WEBP"u8)) return "image/webp";
        return null;
    }

    private static bool IsStructurallyValidCollectionEvidence(string mimeType, ReadOnlySpan<byte> bytes) =>
        mimeType == "application/pdf" ? IsStructurallyValidPdf(bytes) : IsDecodableReceiptImage(mimeType, bytes);

    private static bool IsDecodableReceiptImage(string mimeType, ReadOnlySpan<byte> bytes)
    {
        try
        {
            using var data = SKData.CreateCopy(bytes.ToArray());
            using var codec = SKCodec.Create(data);
            if (codec is null) return false;
            SKEncodedImageFormat? expectedFormat = mimeType switch
            {
                "image/jpeg" => SKEncodedImageFormat.Jpeg,
                "image/png" => SKEncodedImageFormat.Png,
                "image/webp" => SKEncodedImageFormat.Webp,
                _ => null
            };
            var info = codec.Info;
            if (expectedFormat is null || codec.EncodedFormat != expectedFormat.Value || info.Width <= 0 || info.Height <= 0 || info.Width > 10_000 || info.Height > 10_000 || (long)info.Width * info.Height > 40_000_000)
            {
                return false;
            }

            using var bitmap = new SKBitmap(info);
            return codec.GetPixels(info, bitmap.GetPixels()) == SKCodecResult.Success;
        }
        catch (Exception exception) when (exception is ArgumentException or InvalidOperationException or OverflowException)
        {
            return false;
        }
    }

    private static bool IsStructurallyValidPdf(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length < 8 || bytes.Length > DocumentLimit ||
            !bytes[..5].SequenceEqual("%PDF-"u8) || bytes[5] is < (byte)'1' or > (byte)'2' ||
            bytes[6] != (byte)'.' || bytes[7] is < (byte)'0' or > (byte)'9')
        {
            return false;
        }

        try
        {
            using var document = PdfDocument.Open(bytes.ToArray(), ParsingOptions.LenientParsingOff);
            if (document.NumberOfPages is < 1 or > 100) return false;

            for (var pageNumber = 1; pageNumber <= document.NumberOfPages; pageNumber++)
            {
                _ = document.GetPage(pageNumber);
            }

            return true;
        }
        catch (Exception exception) when (exception is not OutOfMemoryException)
        {
            return false;
        }
    }
}

public static class UploadMetadata
{
    public static string UploaderFrom(ClaimsPrincipal principal) =>
        AuditTrail.ActorFrom(principal);
}

public static class PhotoUploadRules
{
    public static PhotoThumbnailResult CreateThumbnail(byte[] bytes)
    {
        try
        {
            using var bitmap = SKBitmap.Decode(bytes);
            if (bitmap is null)
            {
                return UnsupportedImage();
            }

            var scale = Math.Min(420d / bitmap.Width, 280d / bitmap.Height);
            scale = Math.Min(scale, 1d);
            var width = Math.Max(1, (int)Math.Round(bitmap.Width * scale));
            var height = Math.Max(1, (int)Math.Round(bitmap.Height * scale));
            using var resized = bitmap.Resize(new SKImageInfo(width, height), SKSamplingOptions.Default);
            using var image = SKImage.FromBitmap(resized ?? bitmap);
            using var encoded = image.Encode(SKEncodedImageFormat.Jpeg, 82);
            return encoded is null
                ? UnsupportedImage()
                : new PhotoThumbnailResult(true, encoded.ToArray(), null);
        }
        catch (ArgumentException)
        {
            return UnsupportedImage();
        }
        catch (InvalidOperationException)
        {
            return UnsupportedImage();
        }
    }

    private static PhotoThumbnailResult UnsupportedImage() =>
        new(false, null, new ValidationError("unsupported_image", "Vehicle photo must be a supported image file."));
}

public static class ProfitCalculator
{
    public static decimal EstimatedProfit(Vehicle vehicle) =>
        EstimatedProfit(vehicle, vehicle.RefurbishmentTotal, vehicle.CommissionTotal, vehicle.OutstationPickupAllowance);

    public static decimal EstimatedProfit(Vehicle vehicle, decimal repairCost) =>
        EstimatedProfit(vehicle, repairCost, vehicle.CommissionTotal, vehicle.OutstationPickupAllowance);

    public static decimal EstimatedProfit(Vehicle vehicle, decimal repairCost, decimal commissionCost) =>
        EstimatedProfit(vehicle, repairCost, commissionCost, vehicle.OutstationPickupAllowance);

    public static decimal EstimatedProfit(Vehicle vehicle, decimal repairCost, decimal commissionCost, decimal pickupAllowanceCost) =>
        vehicle.SellingPrice + vehicle.AdditionalCharges - vehicle.PurchasePrice - repairCost - commissionCost - pickupAllowanceCost;
}

public static class RepairRules
{
    public const decimal ApprovalThreshold = 1000m;

    public static ValidationResult Validate(RepairJob repair)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(repair.WhatToDo))
        {
            errors.Add(new ValidationError("repair_task_required", "Repair task is required."));
        }

        if (repair.Cost < 0)
        {
            errors.Add(new ValidationError("invalid_repair_cost", "Repair cost cannot be negative."));
        }

        if (repair.StartedOn is { } startedOn && repair.ExpectedCompletionDate is { } expectedCompletionDate && expectedCompletionDate < startedOn)
        {
            errors.Add(new ValidationError("repair_completion_date_invalid", "Expected completion date cannot be before the repair start date."));
        }

        if (repair.Cost >= ApprovalThreshold && repair.ChecklistDone && repair.ApprovalStatus != RepairApprovalStatus.Approved)
        {
            errors.Add(new ValidationError("repair_approval_required", "High-cost repair must be approved before it is completed or treated as final."));
        }

        return new ValidationResult(errors);
    }

    public static bool IsCostFinal(RepairJob repair) =>
        repair.Cost < ApprovalThreshold || repair.ApprovalStatus == RepairApprovalStatus.Approved;
}

public static class VehicleRepairCosts
{
    public static IReadOnlyDictionary<Guid, decimal> ByVehicle(IEnumerable<RepairJob> repairs) =>
        repairs
            .Where(RepairRules.IsCostFinal)
            .GroupBy(repair => repair.VehicleId)
            .ToDictionary(group => group.Key, group => group.Sum(repair => repair.Cost));

    public static decimal EffectiveCost(Vehicle vehicle, IReadOnlyDictionary<Guid, decimal> costsByVehicle) =>
        costsByVehicle.TryGetValue(vehicle.Id, out var repairJobCost)
            ? repairJobCost
            : vehicle.RefurbishmentTotal;
}

public static class RepairReceiptRules
{
    public static ValidationResult Validate(ConfirmRepairReceiptRequest receipt)
    {
        if (receipt.Items is null || receipt.Items.Count == 0 || receipt.Items.Any(item => string.IsNullOrWhiteSpace(item.Description) || item.Amount < 0))
        {
            return new ValidationResult([new ValidationError("repair_receipt_items_invalid", "Add at least one repair receipt item with a description and non-negative amount.")]);
        }

        return new ValidationResult([]);
    }
}

public static class RepairApprovalRules
{
    public static RepairJob PrepareForCreate(RepairJob repair) =>
        repair with
        {
            ApprovalStatus = RepairApprovalStatus.Pending,
            ApprovalNotes = null,
            ApprovedBy = null,
            ApprovedAt = null
        };

    public static RepairJob PrepareForUpdate(RepairJob existing, RepairJob update)
    {
        var changed = HasMaterialChanges(existing, update);
        return update with
        {
            ApprovalStatus = changed ? RepairApprovalStatus.Pending : existing.ApprovalStatus,
            ApprovalNotes = changed ? null : existing.ApprovalNotes,
            ApprovedBy = changed ? null : existing.ApprovedBy,
            ApprovedAt = changed ? null : existing.ApprovedAt
        };
    }

    public static RepairJob Approve(RepairJob repair, RepairApprovalRequest request, ClaimsPrincipal actor) =>
        repair with
        {
            ApprovalStatus = RepairApprovalStatus.Approved,
            ApprovalNotes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            ApprovedBy = AuditTrail.ActorFrom(actor),
            ApprovedAt = DateTime.UtcNow
        };

    public static bool HasMaterialChanges(RepairJob existing, RepairJob update) =>
        existing.VehicleId != update.VehicleId ||
        !string.Equals(existing.RepairPart?.Trim(), update.RepairPart?.Trim(), StringComparison.Ordinal) ||
        !string.Equals(existing.WhatToDo?.Trim(), update.WhatToDo?.Trim(), StringComparison.Ordinal) ||
        existing.Cost != update.Cost;
}

public static class SupplierInvoiceRules
{
    public static ValidationResult Validate(SupplierInvoice incoming, IEnumerable<SupplierInvoice> existing, IEnumerable<Vehicle> vehicles)
    {
        var errors = new List<ValidationError>();
        var linkedVehicle = vehicles.FirstOrDefault(vehicle => vehicle.Id == incoming.VehicleId);
        if (linkedVehicle is null)
        {
            errors.Add(new ValidationError("vehicle_not_found", "Supplier invoice must be linked to an existing car plate."));
        }

        if (string.IsNullOrWhiteSpace(incoming.SupplierName))
        {
            errors.Add(new ValidationError("supplier_name_required", "Supplier name is required."));
        }

        if (string.IsNullOrWhiteSpace(incoming.InvoiceNumber))
        {
            errors.Add(new ValidationError("invoice_number_required", "Supplier invoice number is required."));
        }

        var supplierName = incoming.SupplierName.Trim();
        var invoiceNumber = incoming.InvoiceNumber.Trim();
        var isDuplicate = existing.Any(invoice =>
            invoice.Id != incoming.Id &&
            invoice.SupplierName.Trim().Equals(supplierName, StringComparison.OrdinalIgnoreCase) &&
            invoice.InvoiceNumber.Trim().Equals(invoiceNumber, StringComparison.OrdinalIgnoreCase));
        if (isDuplicate)
        {
            errors.Add(new ValidationError("duplicate_invoice", "Supplier invoice number already exists for this supplier."));
        }

        if (incoming.Amount <= 0)
        {
            errors.Add(new ValidationError("invalid_amount", "Supplier invoice amount must be greater than zero."));
        }

        if (linkedVehicle is not null &&
            !string.IsNullOrWhiteSpace(incoming.PlateNumberOnInvoice) &&
            !NormalizePlate(incoming.PlateNumberOnInvoice).Equals(NormalizePlate(linkedVehicle.PlateNumber), StringComparison.OrdinalIgnoreCase))
        {
            errors.Add(new ValidationError("supplier_invoice_plate_mismatch", "Supplier invoice plate does not match the selected car plate."));
        }

        return new ValidationResult(errors);
    }

    public static IEnumerable<SupplierSummary> CreateSupplierSummaries(IEnumerable<SupplierInvoice> invoices) =>
        invoices
            .Where(invoice => !string.IsNullOrWhiteSpace(invoice.SupplierName))
            .GroupBy(invoice => invoice.SupplierName.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => new SupplierSummary(group.First().SupplierName.Trim(), group.Count(), group.Sum(invoice => invoice.Amount)))
            .OrderBy(item => item.SupplierName);

    public static SupplierInvoiceAgingView CreateAgingView(SupplierInvoice invoice, DateOnly today) =>
        new(
            invoice.Id,
            invoice.SupplierName,
            invoice.InvoiceNumber,
            invoice.VehicleId,
            AgingStatus(invoice, today),
            invoice.DueDate,
            invoice.PaidAt,
            invoice.Amount);

    public static SupplierInvoiceAgingStatus AgingStatus(SupplierInvoice invoice, DateOnly today)
    {
        if (invoice.PaidAt is not null) return SupplierInvoiceAgingStatus.Paid;
        if (invoice.DueDate is null) return SupplierInvoiceAgingStatus.Unmatched;
        if (invoice.DueDate < today) return SupplierInvoiceAgingStatus.Overdue;
        return invoice.DueDate.Value.DayNumber - today.DayNumber <= 7
            ? SupplierInvoiceAgingStatus.DueSoon
            : SupplierInvoiceAgingStatus.Unmatched;
    }

    private static string NormalizePlate(string value) =>
        new(value.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());
}

public static class SupplierRules
{
    public static ValidationResult Validate(Supplier incoming, IEnumerable<Supplier> existing)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(incoming.CompanyName)) errors.Add(new ValidationError("supplier_company_name_required", "Supplier company name is required."));
        if (string.IsNullOrWhiteSpace(incoming.Address)) errors.Add(new ValidationError("supplier_address_required", "Supplier address is required."));
        if (string.IsNullOrWhiteSpace(incoming.Phone)) errors.Add(new ValidationError("supplier_phone_required", "Supplier phone is required."));
        if (existing.Any(item => item.Id != incoming.Id && item.CompanyName.Trim().Equals(incoming.CompanyName.Trim(), StringComparison.OrdinalIgnoreCase)))
        {
            errors.Add(new ValidationError("duplicate_supplier", "A supplier with this company name already exists."));
        }
        if (!string.IsNullOrWhiteSpace(incoming.AutoCountCreditorCode) && existing.Any(item => item.Id != incoming.Id && string.Equals(item.AutoCountCreditorCode?.Trim(), incoming.AutoCountCreditorCode.Trim(), StringComparison.OrdinalIgnoreCase)))
        {
            errors.Add(new ValidationError("duplicate_autocount_creditor_code", "This AutoCount creditor code is already assigned to another supplier."));
        }
        return new ValidationResult(errors);
    }
}

public static class DeliveryAccountingChargeRules
{
    public static ValidationResult Validate(DeliveryAccountingCharge charge, DeliverySchedule? delivery, Supplier? supplier)
    {
        var errors = new List<ValidationError>();
        if (delivery is null || delivery.VehicleId != charge.VehicleId) errors.Add(new ValidationError("delivery_charge_delivery_invalid", "Accounting charge must match an existing delivery and car plate."));
        if (charge.SupplierId.HasValue && supplier is null) errors.Add(new ValidationError("delivery_charge_supplier_not_found", "Selected supplier was not found."));
        if (string.IsNullOrWhiteSpace(charge.ProviderName)) errors.Add(new ValidationError("delivery_charge_provider_required", "Insurance or road-tax provider is required."));
        if (charge.InvoiceDate == default) errors.Add(new ValidationError("delivery_charge_invoice_date_required", "Invoice date is required."));
        if (charge.Amount <= 0) errors.Add(new ValidationError("delivery_charge_amount_invalid", "Amount must be greater than zero."));
        return new ValidationResult(errors);
    }
}

public static class FinanceCsv
{
    public static string ExportPayments(IEnumerable<PaymentRecord> payments, IEnumerable<Vehicle> vehicles)
    {
        var vehicleLookup = vehicles.ToDictionary(vehicle => vehicle.Id, vehicle => vehicle.PlateNumber);
        var rows = new List<string>
        {
            "PaymentId,CarPlate,Status,NettPrice,ReceiptNumber,InvoiceNumber,SalesPrice,InterestAdditionalCharges,NcdAmount,WindscreenCharges,OutstationDeliveryDate,BankName,BankFollowUpDate,CreatedAt"
        };

        rows.AddRange(payments
            .OrderByDescending(payment => payment.CreatedAt)
            .Select(payment => string.Join(",", new[]
            {
                Csv(payment.Id.ToString()),
                Csv(vehicleLookup.TryGetValue(payment.VehicleId, out var plate) ? plate : ""),
                Csv(payment.Status.ToString()),
                Csv(payment.NettPrice.ToString("0.00", CultureInfo.InvariantCulture)),
                Csv(payment.ReceiptNumber),
                Csv(payment.InvoiceNumber),
                Csv(payment.SalesPrice.ToString("0.00", CultureInfo.InvariantCulture)),
                Csv(payment.InterestAdditionalCharges.ToString("0.00", CultureInfo.InvariantCulture)),
                Csv(payment.NcdAmount.ToString("0.00", CultureInfo.InvariantCulture)),
                Csv(payment.WindscreenCharges.ToString("0.00", CultureInfo.InvariantCulture)),
                Csv(payment.OutstationDeliveryDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
                Csv(payment.BankName),
                Csv(payment.BankFollowUpDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)),
                Csv(payment.CreatedAt.ToString("O", CultureInfo.InvariantCulture))
            })));

        return string.Join(Environment.NewLine, rows) + Environment.NewLine;
    }

    private static string Csv(string? value)
    {
        var text = value ?? "";
        return text.Contains(',') || text.Contains('"') || text.Contains('\n') || text.Contains('\r')
            ? $"\"{text.Replace("\"", "\"\"", StringComparison.Ordinal)}\""
            : text;
    }
}

public static class PurchaseInvoiceRules
{
    public static ValidationResult Validate(PurchaseInvoice incoming, IEnumerable<PurchaseInvoice> existing, IEnumerable<Vehicle> vehicles)
    {
        var errors = new List<ValidationError>();
        if (!vehicles.Any(vehicle => vehicle.Id == incoming.VehicleId))
        {
            errors.Add(new ValidationError("vehicle_not_found", "Purchase invoice must be linked to an existing car plate."));
        }

        if (string.IsNullOrWhiteSpace(incoming.InvoiceNumber))
        {
            errors.Add(new ValidationError("purchase_invoice_number_required", "Purchase invoice number is required."));
        }

        var invoiceNumber = incoming.InvoiceNumber.Trim();
        var isDuplicate = existing.Any(invoice =>
            invoice.Id != incoming.Id &&
            invoice.InvoiceNumber.Trim().Equals(invoiceNumber, StringComparison.OrdinalIgnoreCase));
        if (isDuplicate)
        {
            errors.Add(new ValidationError("duplicate_purchase_invoice", "Purchase invoice number already exists."));
        }

        if (incoming.Amount <= 0)
        {
            errors.Add(new ValidationError("invalid_purchase_invoice_amount", "Purchase invoice amount must be greater than zero."));
        }

        if (incoming.InvoiceDate == default)
        {
            errors.Add(new ValidationError("purchase_invoice_date_required", "Purchase invoice date is required."));
        }

        if (incoming.Lines.Count == 0)
        {
            errors.Add(new ValidationError("purchase_invoice_lines_required", "Add at least one classified purchase invoice line."));
        }
        else
        {
            if (incoming.Lines.Any(line => string.IsNullOrWhiteSpace(line.Description) || line.Amount <= 0))
            {
                errors.Add(new ValidationError("purchase_invoice_line_invalid", "Every purchase invoice line needs a description and amount greater than zero."));
            }
            if (incoming.Lines.Sum(line => line.Amount) != incoming.Amount)
            {
                errors.Add(new ValidationError("purchase_invoice_line_total_mismatch", "Purchase invoice line amounts must equal the invoice total."));
            }
        }

        return new ValidationResult(errors);
    }
}

public static class LoanDocumentRules
{
    private static readonly FileCategory[] RequiredCategories =
    [
        FileCategory.StatusReceipt,
        FileCategory.Voc,
        FileCategory.ApDocument,
        FileCategory.LoanDocument
    ];

    public static LoanDocumentCheck CheckCompleteness(LoanApplication loan, IEnumerable<DocumentBlob> documents)
    {
        var attachedCategories = documents
            .Where(document => document.VehicleId == loan.VehicleId && document.CustomerId == loan.CustomerId)
            .Select(document => document.Category)
            .ToHashSet();
        var missing = RequiredCategories.Where(category => !attachedCategories.Contains(category)).ToList();
        return new LoanDocumentCheck(missing.Count == 0, missing);
    }

    public static ValidationResult ValidateCompletion(LoanApplication loan, IEnumerable<DocumentBlob> documents)
    {
        var check = CheckCompleteness(loan, documents);
        return check.IsComplete
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError(
                "loan_documents_incomplete",
                $"Loan cannot be marked done until these buyer documents are uploaded for this vehicle: {string.Join(", ", check.MissingCategories)}.")]);
    }
}

public static class DeliveryRules
{
    public static bool IsReadyForRelease(DeliverySchedule delivery, DateOnly? releaseDate = null) =>
        delivery.InspectionDone &&
        delivery.DocumentsPrepared &&
        delivery.PolishDone &&
        delivery.TintedDone &&
        delivery.WashDone &&
        delivery.InsuranceHandled &&
        delivery.RoadTaxHandled &&
        delivery.WindscreenInsuranceHandled &&
        delivery.TwoDayNoticeSent &&
        delivery.CustomerAcknowledged &&
        delivery.FinalChecklistConfirmed &&
        ExpiredDeliveryDocuments(delivery, releaseDate).Count == 0;

    public static IReadOnlyList<string> ExpiredDeliveryDocuments(DeliverySchedule delivery, DateOnly? releaseDate = null)
    {
        var issues = new List<string>();
        var comparisonDate = releaseDate.HasValue && releaseDate.Value > delivery.ScheduledDate ? releaseDate.Value : delivery.ScheduledDate;
        AddExpiryIssue(issues, delivery.InsuranceExpiryDate, comparisonDate, "Insurance policy");
        AddExpiryIssue(issues, delivery.RoadTaxExpiryDate, comparisonDate, "Road tax");
        AddExpiryIssue(issues, delivery.WindscreenInsuranceExpiryDate, comparisonDate, "Windscreen insurance");
        return issues;
    }

    public static ValidationResult Validate(DeliverySchedule delivery)
    {
        var errors = new List<ValidationError>();
        if (string.IsNullOrWhiteSpace(delivery.Pic))
        {
            errors.Add(new ValidationError("delivery_pic_required", "Delivery PIC is required."));
        }

        if (delivery.ScheduledDate == default)
        {
            errors.Add(new ValidationError("delivery_schedule_required", "Delivery schedule date is required."));
        }

        if (delivery.Status == DeliveryStatus.Cancelled && string.IsNullOrWhiteSpace(delivery.CancellationReason))
        {
            errors.Add(new ValidationError("delivery_cancellation_reason_required", "Give a cancellation reason before cancelling delivery."));
        }

        if (delivery.DeliveryType == DeliveryType.Outstation)
        {
            if (string.IsNullOrWhiteSpace(delivery.DeliveryAddress))
            {
                errors.Add(new ValidationError("outstation_delivery_address_required", "Outstation delivery requires the destination address."));
            }

            if (string.IsNullOrWhiteSpace(delivery.TransportMethod))
            {
                errors.Add(new ValidationError("outstation_transport_required", "Outstation delivery requires the transport method."));
            }
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateTransition(DeliverySchedule existing, DeliverySchedule update)
    {
        if (existing.Status == DeliveryStatus.Released)
        {
            return new ValidationResult([new ValidationError("delivery_terminal_status", "Released delivery is read-only and cannot be changed.")]);
        }
        if (existing.Status == DeliveryStatus.Cancelled)
        {
            return new ValidationResult([new ValidationError("delivery_terminal_status", "Cancelled delivery cannot be changed. Create a new delivery schedule instead.")]);
        }
        if (existing.Status == update.Status) return new ValidationResult([]);

        if (update.Status == DeliveryStatus.Cancelled) return new ValidationResult([]);
        var statuses = new[]
        {
            DeliveryStatus.BookingInspection,
            DeliveryStatus.Scheduled,
            DeliveryStatus.Inspection,
            DeliveryStatus.PreparingDocuments,
            DeliveryStatus.CarPreparation,
            DeliveryStatus.ReadyForRelease,
            DeliveryStatus.Released
        };
        var existingIndex = Array.IndexOf(statuses, existing.Status);
        var updateIndex = Array.IndexOf(statuses, update.Status);
        if (updateIndex == existingIndex + 1) return new ValidationResult([]);
        if (updateIndex < existingIndex && !string.IsNullOrWhiteSpace(update.RescheduleReason)) return new ValidationResult([]);
        return new ValidationResult([new ValidationError("delivery_transition_invalid", "Move delivery one stage at a time. Give a reschedule/rework reason when moving it back.")]);
    }

    public static ValidationResult ValidateRelease(DeliverySchedule delivery)
    {
        if (delivery.Status != DeliveryStatus.Released)
        {
            return new ValidationResult([]);
        }

        var readyVersion = delivery with { Status = DeliveryStatus.ReadyForRelease };
        return IsReadyForRelease(readyVersion)
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError("delivery_not_ready", DeliveryReleaseBlockedMessage)]);
    }

    private static void AddExpiryIssue(ICollection<string> issues, DateOnly? expiryDate, DateOnly scheduledDate, string label)
    {
        if (expiryDate is null)
        {
            issues.Add($"{label} expiry date missing");
            return;
        }

        if (expiryDate < scheduledDate)
        {
            issues.Add($"{label} expired before scheduled delivery");
        }
    }

    public const string DeliveryNotReadyMessage = "Delivery cannot be marked ready until inspection, inspection report, documents, car preparation, insurance, road tax, windscreen insurance, 2-day notice, release evidence, and current expiry dates are complete.";
    public const string DeliveryReleaseBlockedMessage = "Delivery cannot be released until inspection, inspection report, documents, car preparation, insurance, road tax, windscreen insurance, 2-day notice, release evidence, and current expiry dates are complete.";
}

public static class DeliveryDocumentRules
{
    private static readonly FileCategory[] RequiredCategories =
    [
        FileCategory.DeliveryDocument,
        FileCategory.InspectionReport,
        FileCategory.HandoverPhoto,
        FileCategory.SignedHandover,
        FileCategory.Policy,
        FileCategory.RoadTaxReceipt,
        FileCategory.WindscreenPolicy
    ];

    public static DeliveryDocumentCheck CheckCompleteness(DeliverySchedule delivery, IEnumerable<DocumentBlob> documents)
    {
        var deliveryDocuments = documents
            .Where(document =>
                document.VehicleId == delivery.VehicleId &&
                document.DeliveryScheduleId == delivery.Id &&
                document.CustomerId == delivery.CustomerId)
            .ToList();
        var evidence = RequiredCategories
            .Select(category =>
            {
                var document = deliveryDocuments
                    .Where(item => item.Category == category)
                    .OrderByDescending(item => item.UploadedAt)
                    .FirstOrDefault();
                return new DeliveryEvidenceItem(
                    category,
                    document is not null,
                    document?.Id,
                    document?.FileName,
                    document?.MimeType,
                    document?.Checksum,
                    document?.UploadedBy,
                    document?.UploadedAt);
            })
            .ToList();
        var missing = evidence.Where(item => !item.IsPresent).Select(item => item.Category).ToList();
        return new DeliveryDocumentCheck(missing.Count == 0, missing, evidence);
    }

    public static ValidationResult ValidateReadyDocuments(DeliverySchedule delivery, IEnumerable<DocumentBlob> documents)
    {
        if (delivery.Status is not (DeliveryStatus.ReadyForRelease or DeliveryStatus.Released))
        {
            return new ValidationResult([]);
        }

        var check = CheckCompleteness(delivery, documents);
        return check.IsComplete
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError("delivery_documents_incomplete", "Delivery requires delivery documents, inspection report, handover evidence, insurance policy, road tax, and windscreen policy uploaded for this delivery and buyer before release.")]);
    }
}

public static class BusinessClock
{
    private static readonly TimeZoneInfo SingaporeTimeZone = FindSingaporeTimeZone();

    public static DateOnly Today() => SingaporeDate(DateTimeOffset.UtcNow);

    public static DateOnly SingaporeDate(DateTimeOffset instant) =>
        DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instant, SingaporeTimeZone).DateTime);

    private static TimeZoneInfo FindSingaporeTimeZone()
    {
        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Asia/Singapore");
        }
        catch (TimeZoneNotFoundException)
        {
            return TimeZoneInfo.FindSystemTimeZoneById("Singapore Standard Time");
        }
    }
}

public static class AiDocumentProcessingMetrics
{
    private const decimal CheckCarefullyConfidenceThreshold = 0.75m;

    private static readonly (string Category, string Label)[] Categories =
    [
        ("IdentityCard", "IC"),
        ("Voc", "VOC"),
        ("InvoicesAndReceipts", "Invoices & receipts"),
        ("SupportingDocuments", "Supporting documents")
    ];

    public static DashboardAiDocumentProcessing Create(
        IEnumerable<OcrJob> jobs,
        AiUsageLimitSnapshot usage,
        DateOnly? analyticsFrom = null,
        DateOnly? analyticsTo = null)
    {
        var jobList = jobs.ToList();
        var periodJobs = jobList
            .Where(job => IsInAnalyticsRange(BusinessClock.SingaporeDate(new DateTimeOffset(DateTime.SpecifyKind(job.CreatedAt, DateTimeKind.Utc))), analyticsFrom, analyticsTo))
            .ToArray();
        var categories = Categories
            .Select(category => CreateCategory(category.Category, category.Label, periodJobs))
            .ToArray();

        return new DashboardAiDocumentProcessing(
            periodJobs.Length,
            periodJobs.Count(job => job.ReviewDecision == OcrReviewDecision.Accepted),
            periodJobs.Count(job => job.ReviewDecision == OcrReviewDecision.Rejected),
            periodJobs.Count(IsLowConfidence),
            periodJobs.Count(job => job.Status == OcrJobStatus.Failed),
            jobList.Count(job => job.Status == OcrJobStatus.NeedsReview && job.ReviewDecision == OcrReviewDecision.Pending),
            usage.UsedThisMonth,
            usage.Limit.MonthlyRequestLimit,
            usage.RemainingThisMonth,
            categories);
    }

    private static DashboardAiDocumentCategory CreateCategory(string category, string label, IEnumerable<OcrJob> jobs)
    {
        var categoryJobs = jobs.Where(job => CategoryFor(job.Category) == category).ToArray();
        return new DashboardAiDocumentCategory(
            category,
            label,
            categoryJobs.Length,
            categoryJobs.Count(job => job.ReviewDecision == OcrReviewDecision.Accepted),
            categoryJobs.Count(job => job.ReviewDecision == OcrReviewDecision.Rejected),
            categoryJobs.Count(IsLowConfidence),
            categoryJobs.Count(job => job.Status == OcrJobStatus.Failed));
    }

    private static string CategoryFor(FileCategory category) => category switch
    {
        FileCategory.IdentityCard => "IdentityCard",
        FileCategory.Voc => "Voc",
        FileCategory.PurchaseInvoice or FileCategory.RepairInvoice or FileCategory.PaymentReceipt or FileCategory.PaymentInvoice => "InvoicesAndReceipts",
        _ => "SupportingDocuments"
    };

    private static bool IsLowConfidence(OcrJob job)
    {
        if (string.IsNullOrWhiteSpace(job.ResultJson)) return false;
        try
        {
            return JsonSerializer.Deserialize<OcrExtractionResult>(job.ResultJson)?.Confidence < CheckCarefullyConfidenceThreshold;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool IsInAnalyticsRange(DateOnly value, DateOnly? from, DateOnly? to) =>
        (from is null || value >= from) && (to is null || value <= to);
}

public static class DashboardMetrics
{
    public static DashboardSummary Create(
        IEnumerable<Vehicle> vehicles,
        IEnumerable<LoanApplication> loans,
        IEnumerable<DeliverySchedule> deliveries,
        IEnumerable<PaymentRecord> payments,
        IEnumerable<SettlementReminder> settlements,
        IEnumerable<RepairJob> repairs,
        IEnumerable<SupplierInvoice> supplierInvoices,
        IEnumerable<BrokerCommission> brokerCommissions,
        IEnumerable<PaymentVoucher> paymentVouchers,
        IEnumerable<DailySpend> dailySpends,
        IEnumerable<DebtRecoveryCase> debtRecoveries,
        IEnumerable<Lead> leads,
        DateOnly today,
        DateOnly? analyticsFrom = null,
        DateOnly? analyticsTo = null,
        IEnumerable<CollectionTransaction>? collections = null)
    {
        var vehicleList = vehicles.ToList();
        var loanList = loans.ToList();
        var deliveryList = deliveries.ToList();
        var paymentList = payments.ToList();
        var collectionsByPayment = (collections ?? [])
            .GroupBy(collection => collection.PaymentRecordId)
            .ToDictionary(group => group.Key, group => (IReadOnlyList<CollectionTransaction>)group.ToList());
        var settlementList = settlements.ToList();
        var repairList = repairs.ToList();
        var supplierInvoiceList = supplierInvoices.ToList();
        var brokerCommissionList = brokerCommissions.ToList();
        var paymentVoucherList = paymentVouchers.ToList();
        var dailySpendList = dailySpends.ToList();
        var debtRecoveryList = debtRecoveries.ToList();
        var leadList = leads.ToList();
        var vehicleById = vehicleList.ToDictionary(vehicle => vehicle.Id);
        var analyticsLeadList = leadList.Where(lead => IsInAnalyticsRange(LeadDate(lead), analyticsFrom, analyticsTo)).ToList();
        var analyticsRepairList = repairList.Where(repair => IsInAnalyticsRange(RepairDate(repair), analyticsFrom, analyticsTo)).ToList();
        var analyticsSoldVehicles = vehicleList
            .Where(vehicle => vehicle.Status == VehicleStatus.Sold && !IsDashboardSmokeTestVehicle(vehicle))
            .Where(vehicle => analyticsFrom is null && analyticsTo is null || SoldDate(vehicle) is { } soldDate && IsInAnalyticsRange(soldDate, analyticsFrom, analyticsTo))
            .ToList();
        var trendStart = new DateOnly((analyticsFrom ?? today.AddMonths(-5)).Year, (analyticsFrom ?? today.AddMonths(-5)).Month, 1);
        var trendEnd = new DateOnly((analyticsTo ?? today).Year, (analyticsTo ?? today).Month, 1);
        var trendMonths = Enumerable.Range(0, ((trendEnd.Year - trendStart.Year) * 12) + trendEnd.Month - trendStart.Month + 1)
            .Select(offset => trendStart.AddMonths(offset))
            .ToArray();
        var supplierSpendTop = supplierInvoiceList
            .Where(invoice => !string.IsNullOrWhiteSpace(invoice.SupplierName))
            .GroupBy(invoice => invoice.SupplierName.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => new DashboardAmountSlice(group.First().SupplierName.Trim(), group.Sum(invoice => invoice.Amount)))
            .OrderByDescending(item => item.Amount)
            .ThenBy(item => item.Label)
            .Take(5)
            .ToArray();
        var topSupplier = supplierSpendTop.FirstOrDefault()?.Label ?? "-";
        var repairCostsByVehicle = VehicleRepairCosts.ByVehicle(repairList);
        var topEnquiredVehicles = analyticsLeadList
            .Where(lead => vehicleById.ContainsKey(lead.VehicleId))
            .GroupBy(lead => lead.VehicleId)
            .Select(group => new DashboardCountSlice(VehicleLabel(vehicleById[group.Key]), group.Count()))
            .OrderByDescending(item => item.Count)
            .ThenBy(item => item.Label)
            .Take(5)
            .ToArray();
        var topSellingModels = analyticsSoldVehicles
            .GroupBy(VehicleModelLabel, StringComparer.OrdinalIgnoreCase)
            .Select(group => new DashboardCountSlice(group.Key, group.Count()))
            .OrderByDescending(item => item.Count)
            .ThenBy(item => item.Label)
            .Take(5)
            .ToArray();
        var leadTrend = trendMonths
            .Select(month => new DashboardCountSlice(
                month.ToString("MMM yy", CultureInfo.InvariantCulture),
                analyticsLeadList.Count(lead => LeadDate(lead) >= month && LeadDate(lead) < month.AddMonths(1))))
            .ToArray();
        var leadsAwaitingFirstResponse = analyticsLeadList.Count(lead =>
            lead.Status == LeadStatus.New && lead.CreatedAt <= DateTime.UtcNow.AddHours(-24));
        var repairWorkInProgress = repairList
            .Where(repair => !repair.ChecklistDone && vehicleById.ContainsKey(repair.VehicleId))
            .GroupBy(repair => repair.VehicleId)
            .Select(group => new DashboardCountSlice(VehicleLabel(vehicleById[group.Key]), group.Count()))
            .OrderByDescending(item => item.Count)
            .ThenBy(item => item.Label)
            .Take(5)
            .ToArray();
        var commissionsByVehicle = brokerCommissionList
            .GroupBy(commission => commission.VehicleId)
            .ToDictionary(group => group.Key, group => group.Sum(commission => commission.Amount));
        var pickupAllowancesByVehicle = paymentVoucherList
            .GroupBy(voucher => voucher.VehicleId)
            .ToDictionary(group => group.Key, group => group.Sum(voucher => voucher.Amount));

        decimal EffectiveRepairCost(Vehicle vehicle) =>
            VehicleRepairCosts.EffectiveCost(vehicle, repairCostsByVehicle);

        decimal EffectiveCommissionCost(Vehicle vehicle) =>
            commissionsByVehicle.TryGetValue(vehicle.Id, out var commissionCost)
                ? commissionCost
                : vehicle.CommissionTotal;

        decimal EffectivePickupAllowanceCost(Vehicle vehicle) =>
            pickupAllowancesByVehicle.TryGetValue(vehicle.Id, out var pickupAllowanceCost)
                ? pickupAllowanceCost
                : vehicle.OutstationPickupAllowance;

        var unsoldVehicles = vehicleList.Where(vehicle => vehicle.Status != VehicleStatus.Sold).ToList();
        var repairCostByVehicle = unsoldVehicles
            .Select(vehicle => new DashboardAmountSlice(VehicleLabel(vehicle), EffectiveRepairCost(vehicle)))
            .Where(item => item.Amount > 0)
            .OrderByDescending(item => item.Amount)
            .ThenBy(item => item.Label)
            .Take(5)
            .ToArray();
        var finalRepairCostsInPeriod = analyticsRepairList
            .Where(RepairRules.IsCostFinal)
            .GroupBy(repair => repair.VehicleId)
            .ToDictionary(group => group.Key, group => group.Sum(repair => repair.Cost));
        var refurbishmentHighestCostVehicles = finalRepairCostsInPeriod
            .Where(item => vehicleById.ContainsKey(item.Key))
            .Select(item => new DashboardAmountSlice(VehicleLabel(vehicleById[item.Key]), item.Value))
            .OrderByDescending(item => item.Amount)
            .ThenBy(item => item.Label)
            .Take(5)
            .ToArray();
        var refurbishmentFinalRepairSpend = finalRepairCostsInPeriod.Values.Sum();
        var refurbishment = new DashboardRefurbishmentSummary(
            FinalRepairSpend: refurbishmentFinalRepairSpend,
            VehicleCount: finalRepairCostsInPeriod.Count,
            AverageSpendPerVehicle: finalRepairCostsInPeriod.Count == 0 ? 0m : decimal.Round(refurbishmentFinalRepairSpend / finalRepairCostsInPeriod.Count, 2),
            WorkInProgressCount: analyticsRepairList.Count(repair => !repair.ChecklistDone),
            OverdueWorkCount: analyticsRepairList.Count(repair => !repair.ChecklistDone && repair.ExpectedCompletionDate is { } expectedCompletion && expectedCompletion < today),
            HighestCostVehicles: refurbishmentHighestCostVehicles);

        var agingBuckets = new[]
        {
            new DashboardAgingBucket("0-30", unsoldVehicles.Count(vehicle => AgeInDays(vehicle, today) <= 30)),
            new DashboardAgingBucket("31-60", unsoldVehicles.Count(vehicle => AgeInDays(vehicle, today) is > 30 and <= 60)),
            new DashboardAgingBucket("61+", unsoldVehicles.Count(vehicle => AgeInDays(vehicle, today) > 60))
        };

        var totalProfit = unsoldVehicles.Sum(vehicle => ProfitCalculator.EstimatedProfit(vehicle, EffectiveRepairCost(vehicle), EffectiveCommissionCost(vehicle), EffectivePickupAllowanceCost(vehicle)));
        var realisedProfit = vehicleList.Where(vehicle => vehicle.Status == VehicleStatus.Sold).Sum(vehicle => ProfitCalculator.EstimatedProfit(vehicle, EffectiveRepairCost(vehicle), EffectiveCommissionCost(vehicle), EffectivePickupAllowanceCost(vehicle)));
        var actualProfit = analyticsSoldVehicles.Sum(vehicle => ProfitCalculator.EstimatedProfit(vehicle, EffectiveRepairCost(vehicle), EffectiveCommissionCost(vehicle), EffectivePickupAllowanceCost(vehicle)));
        var monthlyProfitTrend = trendMonths
            .Select(month =>
            {
                var soldVehicles = analyticsSoldVehicles.Where(vehicle => SoldMonth(vehicle) == month).ToArray();
                var stockIntroduced = vehicleList.Where(vehicle => vehicle.Status != VehicleStatus.Sold && IsInAnalyticsRange(vehicle.IntakeDate, analyticsFrom, analyticsTo) && vehicle.IntakeDate >= month && vehicle.IntakeDate < month.AddMonths(1));
                return new DashboardProfitTrendSlice(
                    month.ToString("MMM yy", CultureInfo.InvariantCulture),
                    stockIntroduced.Sum(vehicle => ProfitCalculator.EstimatedProfit(vehicle, EffectiveRepairCost(vehicle), EffectiveCommissionCost(vehicle), EffectivePickupAllowanceCost(vehicle))),
                    soldVehicles.Sum(vehicle => ProfitCalculator.EstimatedProfit(vehicle, EffectiveRepairCost(vehicle), EffectiveCommissionCost(vehicle), EffectivePickupAllowanceCost(vehicle))),
                    soldVehicles.Length);
            })
            .ToArray();
        var outstandingPayment = paymentList.Sum(payment => payment.FinanceWorkflowVersion == 2
            ? FinanceV2Rules.Balance(payment, collectionsByPayment.GetValueOrDefault(payment.Id) ?? [])
            : payment.Status != PaymentStatus.Reconciled ? payment.NettPrice : 0m);
        var openDebtRecovery = debtRecoveryList.Where(debt => debt.Status != DebtRecoveryStatus.Closed).Sum(debt => debt.BalanceAmount);
        var dueSettlements = settlementList.Where(settlement => ReminderRules.IsSettlementDue(settlement, today)).ToArray();
        var settlementDue = dueSettlements.Length;
        var settlementDueAmount = dueSettlements.Sum(settlement => settlement.Amount);
        var reminderItems = ReminderInbox.Create(
            loanList,
            deliveryList,
            settlementList,
            paymentList,
            dailySpendList,
            debtRecoveryList,
            paymentVoucherList,
            vehicleList,
            today);
        var stockStatusMix = Enum.GetValues<VehicleStatus>()
            .Select(status => new DashboardCountSlice(status.ToString(), vehicleList.Count(vehicle => vehicle.Status == status)))
            .ToArray();
        var stockOwnerMix = Enum.GetValues<StockOwner>()
            .Select(owner => new DashboardCountSlice(owner.ToString(), vehicleList.Count(vehicle => vehicle.StockOwner == owner)))
            .ToArray();
        var moneyRiskBreakdown = new[]
        {
            new DashboardAmountSlice("Outstanding Payment", outstandingPayment),
            new DashboardAmountSlice("Unpaid Settlement", settlementList.Where(settlement => !settlement.IsPaid).Sum(settlement => settlement.Amount)),
            new DashboardAmountSlice("Open Debt Recovery", openDebtRecovery),
            new DashboardAmountSlice("Unpaid Daily Spend", dailySpendList.Where(spend => !spend.IsPaid).Sum(spend => spend.Amount)),
            new DashboardAmountSlice("Open Payment Voucher", paymentVoucherList.Where(voucher => voucher.Status != PaymentVoucherStatus.Paid).Sum(voucher => voucher.Amount))
        };
        var workflowBlockers = new DashboardWorkflowBlockers(
            ByType: reminderItems
                .GroupBy(reminder => reminder.Type)
                .Select(group => new DashboardCountSlice(group.Key, group.Count()))
                .OrderByDescending(item => item.Count)
                .ThenBy(item => item.Label)
                .ToArray(),
            DueBuckets:
            [
                new DashboardCountSlice("Overdue", ReminderInbox.Filter(reminderItems, null, "Overdue", today).Count),
                new DashboardCountSlice("DueToday", ReminderInbox.Filter(reminderItems, null, "DueToday", today).Count),
                new DashboardCountSlice("DueSoon", ReminderInbox.Filter(reminderItems, null, "DueSoon", today).Count),
                new DashboardCountSlice("Upcoming", ReminderInbox.Filter(reminderItems, null, "Upcoming", today).Count)
            ]);
        var salesStages = Enum.GetValues<LeadStatus>()
            .Select(status => new DashboardCountSlice(status.ToString(), analyticsLeadList.Count(lead => lead.Status == status)))
            .ToArray();
        var salesFunnel = new DashboardSalesFunnel(
            salesStages,
            analyticsLeadList.Count == 0 ? 0m : decimal.Round(analyticsLeadList.Count(lead => lead.Status == LeadStatus.Closed) * 100m / analyticsLeadList.Count, 1));
        var totalRevenue = unsoldVehicles.Sum(vehicle => vehicle.SellingPrice + vehicle.AdditionalCharges);
        var purchaseCost = unsoldVehicles.Sum(vehicle => vehicle.PurchasePrice);
        var repairCost = unsoldVehicles.Sum(EffectiveRepairCost);
        var commissionCost = unsoldVehicles.Sum(EffectiveCommissionCost);
        var pickupAllowanceCost = unsoldVehicles.Sum(EffectivePickupAllowanceCost);
        var profitBreakdown = new[]
        {
            new DashboardAmountSlice("Selling + Charges", totalRevenue),
            new DashboardAmountSlice("Purchase Cost", purchaseCost),
            new DashboardAmountSlice("Repair Cost", repairCost),
            new DashboardAmountSlice("Commission", commissionCost),
            new DashboardAmountSlice("Pickup Allowance", pickupAllowanceCost),
            new DashboardAmountSlice("Estimated Profit", totalProfit)
        };

        return new DashboardSummary(
            TotalStock: unsoldVehicles.Count,
            PurchaseCost: purchaseCost,
            PendingLoan: loanList.Count(loan => loan.Status == LoanStatus.Pending),
            OutstandingPayment: outstandingPayment,
            SettlementDue: settlementDue,
            RepairCost: repairCost,
            EstimatedProfit: totalProfit,
            TotalProfit: totalProfit,
            VehicleAging: agingBuckets.First(bucket => bucket.Label == "61+").Count,
            AgingBuckets: agingBuckets,
            TopSupplier: topSupplier,
            SalesPerformance: leadList.Count(lead => lead.Status == LeadStatus.Closed),
            StockStatusMix: stockStatusMix,
            StockOwnerMix: stockOwnerMix,
            MoneyRiskBreakdown: moneyRiskBreakdown,
            WorkflowBlockers: workflowBlockers,
            SalesFunnel: salesFunnel,
            TopEnquiredVehicles: topEnquiredVehicles,
            RepairCostByVehicle: repairCostByVehicle,
            TopSellingModels: topSellingModels,
            LeadTrend: leadTrend,
            LeadsAwaitingFirstResponse: leadsAwaitingFirstResponse,
            RepairWorkInProgress: repairWorkInProgress,
            RealisedProfit: realisedProfit,
            MonthlyProfitTrend: monthlyProfitTrend,
            ProfitBreakdown: profitBreakdown,
            SupplierSpendTop: supplierSpendTop,
            TotalSales: analyticsSoldVehicles.Count,
            ActualProfit: actualProfit,
            OutstandingCollection: outstandingPayment + openDebtRecovery,
            SettlementDueAmount: settlementDueAmount,
            Refurbishment: refurbishment);
    }

    private static string VehicleLabel(Vehicle vehicle) => $"{vehicle.PlateNumber} · {VehicleModelLabel(vehicle)}";

    private static bool IsDashboardSmokeTestVehicle(Vehicle vehicle) =>
        string.Equals(vehicle.Make, "Smoke", StringComparison.OrdinalIgnoreCase)
        || vehicle.Model.StartsWith("Workflow", StringComparison.OrdinalIgnoreCase);

    private static string VehicleModelLabel(Vehicle vehicle) => $"{vehicle.Make.Trim()} {vehicle.Model.Trim()}".Trim();

    private static DateOnly LeadDate(Lead lead)
    {
        var createdAtUtc = lead.CreatedAt.Kind switch
        {
            DateTimeKind.Utc => lead.CreatedAt,
            DateTimeKind.Local => lead.CreatedAt.ToUniversalTime(),
            _ => DateTime.SpecifyKind(lead.CreatedAt, DateTimeKind.Utc)
        };
        return BusinessClock.SingaporeDate(new DateTimeOffset(createdAtUtc));
    }

    private static bool IsInAnalyticsRange(DateOnly value, DateOnly? from, DateOnly? to) =>
        (!from.HasValue || value >= from.Value) && (!to.HasValue || value <= to.Value);

    private static DateOnly RepairDate(RepairJob repair) => SingaporeDate(repair.CreatedAt);

    private static DateOnly? SoldDate(Vehicle vehicle) => vehicle.SoldAt is { } soldAt
        ? SingaporeDate(soldAt)
        : null;

    private static DateOnly? SoldMonth(Vehicle vehicle) => SoldDate(vehicle) is { } soldDate
        ? new DateOnly(soldDate.Year, soldDate.Month, 1)
        : null;

    private static DateOnly SingaporeDate(DateTime value)
    {
        var utcValue = value.Kind switch
        {
            DateTimeKind.Utc => value,
            DateTimeKind.Local => value.ToUniversalTime(),
            _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
        };
        return BusinessClock.SingaporeDate(new DateTimeOffset(utcValue));
    }

    private static int AgeInDays(Vehicle vehicle, DateOnly today) => Math.Max(0, today.DayNumber - vehicle.IntakeDate.DayNumber);
}
