using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using YSHeng.Api.Domain;
using SkiaSharp;

namespace YSHeng.Api.Features;

public sealed record LeadRequest(Guid VehicleId, string CustomerName, string Phone, string? Message);
public sealed record HrLeaveAdjustmentRequest(string StaffUserId, HrLeaveAdjustmentType Type, HrLeaveAdjustmentDirection Direction, decimal Days, string Reason);
public sealed record PublicVehicleResponse(Guid Id, string PlateNumber, string Make, string Model, int Year, StockOwner StockOwner, VehicleStatus Status, decimal SellingPrice);
public sealed record BackOfficeVehicleLookupResponse(Guid Id, string PlateNumber, string Make, string Model, StockOwner StockOwner, VehicleStatus Status);
public sealed record DashboardSummary(
    int TotalStock,
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
    DashboardAmountSlice[] ProfitBreakdown,
    DashboardAmountSlice[] SupplierSpendTop);

public sealed record DashboardAgingBucket(string Label, int Count);
public sealed record DashboardCountSlice(string Label, int Count);
public sealed record DashboardAmountSlice(string Label, decimal Amount);
public sealed record DashboardWorkflowBlockers(DashboardCountSlice[] ByType, DashboardCountSlice[] DueBuckets);
public sealed record DashboardSalesFunnel(DashboardCountSlice[] Stages, decimal ConversionRate);
public sealed record ReminderItem(string Type, string Title, string VehiclePlate, Guid VehicleId, DateOnly DueDate, decimal? Amount);
public sealed record ValidationError(string Code, string Message);
public sealed record ApiError(string Message);
public sealed record ValidationResult(IReadOnlyList<ValidationError> Errors)
{
    public bool IsValid => Errors.Count == 0;
}
public sealed record LoanDocumentCheck(bool IsComplete, IReadOnlyList<FileCategory> MissingCategories);
public sealed record DeliveryDocumentCheck(bool IsComplete, IReadOnlyList<FileCategory> MissingCategories);
public sealed record HealthPayload(string Service, string Status, DateTimeOffset CheckedAt);
public sealed record PublicPhotoPayload(Guid Id, string MimeType, byte[] Bytes);
public sealed record PublicPhotoSummary(Guid Id, string FileName, string MimeType, DateTime UploadedAt);
public sealed record PhotoThumbnailResult(bool IsValid, byte[]? Thumbnail, ValidationError? Error);

public static class DepartmentAccess
{
    public static readonly string[] VehicleReaders = ["BossAdmin", "Sales", "Loan", "Delivery", "Finance", "Repair"];
    public static readonly string[] VehicleWriters = ["BossAdmin", "Sales"];
    public static readonly string[] CustomerReaders = ["BossAdmin", "Sales", "Loan", "Finance"];
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
            FileCategory.PurchaseInvoice or FileCategory.Voc or FileCategory.ApDocument or FileCategory.StatusReceipt => roleSet.Contains("Sales"),
            FileCategory.LoanDocument => roleSet.Contains("Loan"),
            FileCategory.DeliveryDocument or FileCategory.Policy or FileCategory.RoadTaxReceipt => roleSet.Contains("Delivery"),
            FileCategory.RepairInvoice => roleSet.Contains("Repair"),
            FileCategory.PaymentReceipt or FileCategory.PaymentInvoice => roleSet.Contains("Finance"),
            FileCategory.MedicalCertificate => roleSet.Contains("HrSalary"),
            _ => false
        };
    }

    public static bool IsHrManager(ClaimsPrincipal principal) =>
        principal.IsInRole("BossAdmin") || principal.IsInRole("HrSalary");

    public static bool CanAccessHrStaff(ClaimsPrincipal principal, string staffUserId) =>
        IsHrManager(principal) || string.Equals(principal.FindFirstValue(ClaimTypes.NameIdentifier), staffUserId, StringComparison.Ordinal);
}

public static class ApiErrors
{
    public static ApiError RouteIdMismatch(string entityLabel) =>
        new($"Route id and {entityLabel} id do not match.");
}

public static class PublicInventory
{
    public static IEnumerable<Vehicle> Filter(IEnumerable<Vehicle> vehicles) =>
        vehicles.Where(vehicle => vehicle.IsPublic && vehicle.Status == VehicleStatus.Available);

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
            vehicle.Status);
}

public static class PublicVehiclePhotos
{
    public static IReadOnlyList<PublicPhotoSummary> SelectGallery(Guid vehicleId, IEnumerable<VehiclePhoto> photos) =>
        photos
            .Where(item => item.VehicleId == vehicleId)
            .OrderByDescending(item => item.UploadedAt)
            .Select(item => new PublicPhotoSummary(item.Id, item.FileName, item.MimeType, item.UploadedAt))
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
    public static Vehicle NormalizeDateTimes(Vehicle vehicle) =>
        vehicle.OutstationPickupScheduledAt is { } pickupAt
            ? vehicle with { OutstationPickupScheduledAt = NormalizeDateTime(pickupAt) }
            : vehicle;

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

    public static ValidationResult ValidateContactLinks(Vehicle vehicle, IEnumerable<Customer> customers, IEnumerable<Owner> owners)
    {
        var errors = new List<ValidationError>();
        if (vehicle.CustomerId is { } customerId && !customers.Any(customer => customer.Id == customerId))
        {
            errors.Add(new ValidationError("customer_not_found", "Vehicle customer must be an existing customer record."));
        }

        if (vehicle.OwnerId is { } ownerId && !owners.Any(owner => owner.Id == ownerId))
        {
            errors.Add(new ValidationError("owner_not_found", "Vehicle owner must be an existing owner record."));
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
            Status = LeadStatus.New
        };
    }
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

        if (!vehicles.Any(vehicle => vehicle.Id == lead.VehicleId))
        {
            errors.Add(new ValidationError("vehicle_not_found", "Lead must be linked to an existing vehicle."));
        }

        if (lead.CustomerId is { } customerId && !customers.Any(customer => customer.Id == customerId))
        {
            errors.Add(new ValidationError("customer_not_found", "Lead customer link must reference an existing customer."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateStatusOwner(Lead existing, Lead incoming, string currentUserId)
    {
        if (existing.Status == incoming.Status)
        {
            return new ValidationResult([]);
        }

        if (string.IsNullOrWhiteSpace(currentUserId))
        {
            return new ValidationResult([new ValidationError("lead_user_required", "A signed-in staff user is required to change lead status.")]);
        }

        if (!string.IsNullOrWhiteSpace(existing.TakenByUserId) &&
            !string.Equals(existing.TakenByUserId, currentUserId, StringComparison.Ordinal))
        {
            return new ValidationResult([new ValidationError("lead_assignee_required", "Only the staff member who took this lead can change its status.")]);
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
            CreatedAt = existing.CreatedAt,
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

    public static ValidationResult ValidateLeaveDecision(HrLeaveRequest request)
    {
        var errors = new List<ValidationError>();
        if (request.Status != HrLeaveStatus.Pending)
        {
            errors.Add(new ValidationError("leave_already_decided", "Leave request has already been decided."));
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

        if (profile.MonthlyBaseSalary < 0 || profile.OvertimeHours < 0 || profile.OvertimeRate < 0 || profile.Allowances < 0 || profile.ManualDeductions < 0)
        {
            errors.Add(new ValidationError("payroll_amount_negative", "Payroll amounts cannot be negative."));
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

    public static HrPayslip GeneratePayslip(HrPayrollProfile profile, HrPayPeriod period, IEnumerable<HrLeaveRequest> leaveRequests, Guid? id = null)
    {
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
}

public static class WorkflowReferenceRules
{
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

        if (vehicle is not { IsPublic: true, Status: VehicleStatus.Available })
        {
            errors.Add(new ValidationError("vehicle_not_public", "Lead vehicle is not available on the public website."));
        }

        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateLoan(LoanApplication loan, IEnumerable<Vehicle> vehicles, IEnumerable<Customer> customers)
    {
        var errors = new List<ValidationError>();
        if (!vehicles.Any(vehicle => vehicle.Id == loan.VehicleId))
        {
            errors.Add(new ValidationError("vehicle_not_found", "Loan must be linked to an existing car plate."));
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
}

public static class WorkflowStatusRules
{
    public static Vehicle ApplyLoanStatus(Vehicle vehicle, LoanApplication loan)
    {
        if (loan.Status is LoanStatus.Pending or LoanStatus.Approved or LoanStatus.Done)
        {
            return vehicle with { Status = VehicleStatus.LoanProcessing, IsPublic = false };
        }

        return vehicle;
    }

    public static Vehicle ApplyPaymentStatus(Vehicle vehicle, PaymentRecord payment)
    {
        return ApplyPaymentStatus(vehicle, [payment]);
    }

    public static Vehicle ApplyPaymentStatus(Vehicle vehicle, IEnumerable<PaymentRecord> payments)
    {
        if (payments.Any(payment => payment.VehicleId == vehicle.Id && payment.Status == PaymentStatus.Reconciled))
        {
            return vehicle with { Status = VehicleStatus.Sold, IsPublic = false };
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
        delivery.Status != DeliveryStatus.Released &&
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
    private static readonly HashSet<string> DueFilters = new(StringComparer.OrdinalIgnoreCase)
    {
        "All",
        "Overdue",
        "DueToday",
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

        foreach (var spend in dailySpends.Where(spend => ReminderRules.IsDailySpendDue(spend, today)))
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
                "UPCOMING" => reminder.DueDate > today,
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

    public static ValidationResult ValidatePayment(PaymentRecord payment, IEnumerable<PaymentRecord> existing)
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

            if (!payment.InvoiceGenerated)
            {
                errors.Add(new ValidationError("payment_invoice_generated_required", "Payment invoice must be generated before reconciliation."));
            }

            if (!payment.AutoCountKeyed)
            {
                errors.Add(new ValidationError("payment_autocount_keyed_required", "AutoCount key-in must be marked before payment reconciliation."));
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

        return new ValidationResult(errors);
    }
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

    public static long LimitFor(FileCategory category) =>
        category == FileCategory.VehiclePhoto ? VehiclePhotoLimit : DocumentLimit;
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

        return new ValidationResult(errors);
    }
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

    private static string NormalizePlate(string value) =>
        new(value.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());
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
            .Where(document => document.VehicleId == loan.VehicleId || document.CustomerId == loan.CustomerId)
            .Select(document => document.Category)
            .ToHashSet();
        var missing = RequiredCategories.Where(category => !attachedCategories.Contains(category)).ToList();
        return new LoanDocumentCheck(missing.Count == 0, missing);
    }
}

public static class DeliveryRules
{
    public static bool IsReadyForRelease(DeliverySchedule delivery) =>
        delivery.Status == DeliveryStatus.ReadyForRelease &&
        delivery.InspectionDone &&
        !string.IsNullOrWhiteSpace(delivery.InspectionReportReference) &&
        delivery.DocumentsPrepared &&
        delivery.PolishDone &&
        delivery.TintedDone &&
        delivery.WashDone &&
        delivery.InsuranceHandled &&
        delivery.RoadTaxHandled &&
        delivery.WindscreenInsuranceHandled &&
        delivery.TwoDayNoticeSent;

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

        if (delivery.InspectionDone && string.IsNullOrWhiteSpace(delivery.InspectionReportReference))
        {
            errors.Add(new ValidationError("inspection_report_required", "Inspection report reference is required after inspection is complete."));
        }

        if (delivery.Status == DeliveryStatus.ReadyForRelease && !IsReadyForRelease(delivery))
        {
            errors.Add(new ValidationError("delivery_not_ready", DeliveryNotReadyMessage));
        }

        return new ValidationResult(errors);
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

    public const string DeliveryNotReadyMessage = "Delivery cannot be marked ready until inspection, inspection report, documents, car preparation, insurance, road tax, windscreen insurance, and 2-day notice are complete.";
    public const string DeliveryReleaseBlockedMessage = "Delivery cannot be released until inspection, inspection report, documents, car preparation, insurance, road tax, windscreen insurance, and 2-day notice are complete.";
}

public static class DeliveryDocumentRules
{
    private static readonly FileCategory[] RequiredCategories =
    [
        FileCategory.Policy,
        FileCategory.RoadTaxReceipt
    ];

    public static DeliveryDocumentCheck CheckCompleteness(DeliverySchedule delivery, IEnumerable<DocumentBlob> documents)
    {
        var attachedCategories = documents
            .Where(document => document.VehicleId == delivery.VehicleId)
            .Select(document => document.Category)
            .ToHashSet();
        var missing = RequiredCategories.Where(category => !attachedCategories.Contains(category)).ToList();
        return new DeliveryDocumentCheck(missing.Count == 0, missing);
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
            : new ValidationResult([new ValidationError("delivery_documents_incomplete", "Delivery requires uploaded Policy and Road Tax Receipt before release.")]);
    }
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
        DateOnly today)
    {
        var vehicleList = vehicles.ToList();
        var loanList = loans.ToList();
        var deliveryList = deliveries.ToList();
        var paymentList = payments.ToList();
        var settlementList = settlements.ToList();
        var repairList = repairs.ToList();
        var supplierInvoiceList = supplierInvoices.ToList();
        var brokerCommissionList = brokerCommissions.ToList();
        var paymentVoucherList = paymentVouchers.ToList();
        var dailySpendList = dailySpends.ToList();
        var debtRecoveryList = debtRecoveries.ToList();
        var leadList = leads.ToList();
        var supplierSpendTop = supplierInvoiceList
            .Where(invoice => !string.IsNullOrWhiteSpace(invoice.SupplierName))
            .GroupBy(invoice => invoice.SupplierName.Trim(), StringComparer.OrdinalIgnoreCase)
            .Select(group => new DashboardAmountSlice(group.First().SupplierName.Trim(), group.Sum(invoice => invoice.Amount)))
            .OrderByDescending(item => item.Amount)
            .ThenBy(item => item.Label)
            .Take(5)
            .ToArray();
        var topSupplier = supplierSpendTop.FirstOrDefault()?.Label ?? "-";
        var repairCostsByVehicle = repairList
            .GroupBy(repair => repair.VehicleId)
            .ToDictionary(group => group.Key, group => group.Sum(repair => repair.Cost));
        var commissionsByVehicle = brokerCommissionList
            .GroupBy(commission => commission.VehicleId)
            .ToDictionary(group => group.Key, group => group.Sum(commission => commission.Amount));
        var pickupAllowancesByVehicle = paymentVoucherList
            .GroupBy(voucher => voucher.VehicleId)
            .ToDictionary(group => group.Key, group => group.Sum(voucher => voucher.Amount));

        decimal EffectiveRepairCost(Vehicle vehicle) =>
            repairCostsByVehicle.TryGetValue(vehicle.Id, out var repairJobCost)
                ? repairJobCost
                : vehicle.RefurbishmentTotal;

        decimal EffectiveCommissionCost(Vehicle vehicle) =>
            commissionsByVehicle.TryGetValue(vehicle.Id, out var commissionCost)
                ? commissionCost
                : vehicle.CommissionTotal;

        decimal EffectivePickupAllowanceCost(Vehicle vehicle) =>
            pickupAllowancesByVehicle.TryGetValue(vehicle.Id, out var pickupAllowanceCost)
                ? pickupAllowanceCost
                : vehicle.OutstationPickupAllowance;

        var unsoldVehicles = vehicleList.Where(vehicle => vehicle.Status != VehicleStatus.Sold).ToList();
        var agingBuckets = new[]
        {
            new DashboardAgingBucket("0-30", unsoldVehicles.Count(vehicle => AgeInDays(vehicle, today) <= 30)),
            new DashboardAgingBucket("31-60", unsoldVehicles.Count(vehicle => AgeInDays(vehicle, today) is > 30 and <= 60)),
            new DashboardAgingBucket("61+", unsoldVehicles.Count(vehicle => AgeInDays(vehicle, today) > 60))
        };

        var totalProfit = vehicleList.Sum(vehicle => ProfitCalculator.EstimatedProfit(vehicle, EffectiveRepairCost(vehicle), EffectiveCommissionCost(vehicle), EffectivePickupAllowanceCost(vehicle)));
        var outstandingPayment = paymentList.Where(payment => payment.Status != PaymentStatus.Reconciled).Sum(payment => payment.NettPrice);
        var settlementDue = settlementList.Count(settlement => ReminderRules.IsSettlementDue(settlement, today));
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
            new DashboardAmountSlice("Open Debt Recovery", debtRecoveryList.Where(debt => debt.Status != DebtRecoveryStatus.Closed).Sum(debt => debt.BalanceAmount)),
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
                new DashboardCountSlice("Upcoming", ReminderInbox.Filter(reminderItems, null, "Upcoming", today).Count)
            ]);
        var salesStages = Enum.GetValues<LeadStatus>()
            .Select(status => new DashboardCountSlice(status.ToString(), leadList.Count(lead => lead.Status == status)))
            .ToArray();
        var salesFunnel = new DashboardSalesFunnel(
            salesStages,
            leadList.Count == 0 ? 0m : decimal.Round(leadList.Count(lead => lead.Status == LeadStatus.Closed) * 100m / leadList.Count, 1));
        var totalRevenue = vehicleList.Sum(vehicle => vehicle.SellingPrice + vehicle.AdditionalCharges);
        var purchaseCost = vehicleList.Sum(vehicle => vehicle.PurchasePrice);
        var repairCost = vehicleList.Sum(EffectiveRepairCost);
        var commissionCost = vehicleList.Sum(EffectiveCommissionCost);
        var pickupAllowanceCost = vehicleList.Sum(EffectivePickupAllowanceCost);
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
            ProfitBreakdown: profitBreakdown,
            SupplierSpendTop: supplierSpendTop);
    }

    private static int AgeInDays(Vehicle vehicle, DateOnly today) => Math.Max(0, today.DayNumber - vehicle.IntakeDate.DayNumber);
}
