namespace YSHeng.Api.Domain;

public enum StockOwner { YSHeng, KS }
public enum VehicleStatus { Available, LoanProcessing, Sold }
public enum LeadStatus { New, Contacted, Closed }
public enum LoanStatus { Draft, Pending, Approved, Rejected, Done }
public enum DeliveryStatus { BookingInspection, Scheduled, Inspection, PreparingDocuments, CarPreparation, ReadyForRelease, Released }
public enum PaymentStatus { Pending, Approved, Disbursed, Reconciled }
public enum PaymentExternalSyncStatus { NotSynced, Synced, Failed }
public enum AutoCountSyncStatus { Draft, Ready, Submitted, Synced, Failed }
public enum PaymentVoucherStatus { Pending, Approved, Paid }
public enum CashHandoverStatus { ReceivedBySales, PendingHandover, HandedOver, Rejected, Receipted }
public enum DebtRecoveryStatus { Open, FollowedUp, Closed }
public enum RepairApprovalStatus { Pending, Approved, Rejected }
public enum SupplierInvoiceAgingStatus { Unmatched, DueSoon, Overdue, Paid }
public enum HrAttendanceStatus { Present, Late, HalfDay, Absent }
public enum HrLeaveType { AnnualLeave, MedicalLeave, EmergencyLeave, UnpaidLeave }
public enum HrLeaveStatus { Pending, Approved, Rejected, Cancelled }
public enum HrPayslipStatus { Draft, Generated }
public enum FileCategory { VehiclePhoto, PurchaseInvoice, Voc, IdentityCard, ApDocument, StatusReceipt, LoanDocument, DeliveryDocument, Policy, RoadTaxReceipt, RepairInvoice, PaymentReceipt, PaymentInvoice, MedicalCertificate }
public enum OcrJobStatus { Queued, Analyzing, NeedsReview, Failed }
public enum OcrReviewDecision { Pending, Accepted, Rejected }

public sealed record Vehicle
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string PlateNumber { get; init; } = "";
    public string? ChassisNumber { get; init; }
    public string? EngineNumber { get; init; }
    public string Make { get; init; } = "";
    public string Model { get; init; } = "";
    public int Year { get; init; }
    public StockOwner StockOwner { get; init; }
    public string StockLocation { get; init; } = "";
    public VehicleStatus Status { get; init; }
    public bool IsPublic { get; init; }
    public string? PublicDescriptionMarkdown { get; init; }
    public decimal PurchasePrice { get; init; }
    public decimal SellingPrice { get; init; }
    public decimal AdditionalCharges { get; init; }
    public decimal RefurbishmentTotal { get; init; }
    public decimal CommissionTotal { get; init; }
    public bool BossConfirmed { get; init; }
    public decimal ContraRangePrice { get; init; }
    public string? UcdStatus { get; init; }
    public Guid? CustomerId { get; init; }
    public Guid? OwnerId { get; init; }
    public decimal OutstationPickupAllowance { get; init; }
    public DateTime? OutstationPickupScheduledAt { get; init; }
    public string? OutstationPickupBookingSlip { get; init; }
    public DateOnly IntakeDate { get; init; } = DateOnly.FromDateTime(DateTime.UtcNow);
}

public sealed record StockMovement
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid VehicleId { get; init; }
    public string FieldName { get; init; } = "";
    public string PreviousValue { get; init; } = "";
    public string NewValue { get; init; } = "";
    public string Reason { get; init; } = "";
    public string Actor { get; init; } = "";
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public sealed record Customer
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Name { get; init; } = "";
    public string Phone { get; init; } = "";
    public string? IcNumber { get; init; }
    public string? Email { get; init; }
    public string? Address { get; init; }
    public string? Notes { get; init; }
}

public sealed record Owner
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Name { get; init; } = "";
    public string Phone { get; init; } = "";
}

public sealed record Lead
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid VehicleId { get; init; }
    public Guid? CustomerId { get; init; }
    public string CustomerName { get; init; } = "";
    public string Phone { get; init; } = "";
    public string? Message { get; init; }
    public string? SourcePage { get; init; }
    public string? SourceReferrer { get; init; }
    public string? SourceCampaign { get; init; }
    public LeadStatus Status { get; init; } = LeadStatus.New;
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public string? TakenByUserId { get; init; }
    public string? TakenByName { get; init; }
    public DateTime? TakenAt { get; init; }
}

public sealed record VehiclePhoto
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid VehicleId { get; init; }
    public string FileName { get; init; } = "";
    public string MimeType { get; init; } = "";
    public byte[] Content { get; init; } = [];
    public byte[]? Thumbnail { get; init; }
    public string Checksum { get; init; } = "";
    public string UploadedBy { get; init; } = "";
    public bool IsRepresentativeImage { get; init; }
    public string? SourceName { get; init; }
    public string? SourceUrl { get; init; }
    public string? CreatorAttribution { get; init; }
    public string? LicenseName { get; init; }
    public string? LicenseUrl { get; init; }
    public DateTime UploadedAt { get; init; } = DateTime.UtcNow;
}

public sealed record DocumentBlob
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid? VehicleId { get; init; }
    public Guid? CustomerId { get; init; }
    public Guid? RepairJobId { get; init; }
    public Guid? PaymentRecordId { get; init; }
    public FileCategory Category { get; init; }
    public string FileName { get; init; } = "";
    public string MimeType { get; init; } = "";
    public byte[] Content { get; init; } = [];
    public string Checksum { get; init; } = "";
    public string UploadedBy { get; init; } = "";
    public DateTime UploadedAt { get; init; } = DateTime.UtcNow;
}

public sealed record OcrJob
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid DocumentId { get; init; }
    public FileCategory Category { get; init; }
    public OcrJobStatus Status { get; init; } = OcrJobStatus.Queued;
    public int Progress { get; init; }
    public string ResultJson { get; init; } = "";
    public string[] Warnings { get; init; } = [];
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; init; }
    public OcrReviewDecision ReviewDecision { get; init; } = OcrReviewDecision.Pending;
    public string? ReviewNotes { get; init; }
    public string? ReviewedBy { get; init; }
    public DateTime? ReviewedAt { get; init; }
}

public sealed record PurchaseInvoice { public Guid Id { get; init; } = Guid.NewGuid(); public Guid VehicleId { get; init; } public string InvoiceNumber { get; init; } = ""; public decimal Amount { get; init; } }
public sealed record RepairJob { public Guid Id { get; init; } = Guid.NewGuid(); public Guid VehicleId { get; init; } public string RepairPart { get; init; } = ""; public string WhatToDo { get; init; } = ""; public decimal Cost { get; init; } public bool ChecklistDone { get; init; } public RepairApprovalStatus ApprovalStatus { get; init; } = RepairApprovalStatus.Approved; public string? ApprovalNotes { get; init; } public string? ApprovedBy { get; init; } public DateTime? ApprovedAt { get; init; } }
public sealed record SupplierInvoice { public Guid Id { get; init; } = Guid.NewGuid(); public Guid VehicleId { get; init; } public string SupplierName { get; init; } = ""; public string InvoiceNumber { get; init; } = ""; public string? PlateNumberOnInvoice { get; init; } public decimal Amount { get; init; } public DateOnly? DueDate { get; init; } public DateOnly? PaidAt { get; init; } }

public sealed record LoanApplication
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid VehicleId { get; init; }
    public Guid CustomerId { get; init; }
    public LoanStatus Status { get; init; } = LoanStatus.Draft;
    public bool LouApproved { get; init; }
    public bool LouDone { get; init; }
    public DateOnly? SubmittedAt { get; init; }
}

public sealed record DeliverySchedule
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid VehicleId { get; init; }
    public string Pic { get; init; } = "";
    public DeliveryStatus Status { get; init; } = DeliveryStatus.BookingInspection;
    public DateOnly ScheduledDate { get; init; }
    public bool PolishDone { get; init; }
    public bool TintedDone { get; init; }
    public bool WashDone { get; init; }
    public bool DocumentsPrepared { get; init; }
    public bool InspectionDone { get; init; }
    public string? InspectionBookingReference { get; init; }
    public string? InspectionReportReference { get; init; }
    public bool NotificationSent { get; init; }
    public bool TwoDayNoticeSent { get; init; }
    public bool InsuranceHandled { get; init; }
    public string? InsurancePolicyReference { get; init; }
    public DateOnly? InsuranceExpiryDate { get; init; }
    public bool RoadTaxHandled { get; init; }
    public string? RoadTaxReceiptReference { get; init; }
    public DateOnly? RoadTaxExpiryDate { get; init; }
    public bool WindscreenInsuranceHandled { get; init; }
    public string? WindscreenPolicyReference { get; init; }
    public DateOnly? WindscreenInsuranceExpiryDate { get; init; }
    public bool HandoverPhotoCaptured { get; init; }
    public bool SignedHandoverReceived { get; init; }
    public bool CustomerAcknowledged { get; init; }
    public bool FinalChecklistConfirmed { get; init; }
}

public sealed record PaymentRecord
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid VehicleId { get; init; }
    public decimal NettPrice { get; init; }
    public PaymentStatus Status { get; init; } = PaymentStatus.Pending;
    public string? ReceiptNumber { get; init; }
    public string? InvoiceNumber { get; init; }
    public bool BossChecked { get; init; }
    public bool DocumentsPrepared { get; init; }
    public bool ChecklistValidated { get; init; }
    public bool InvoiceGenerated { get; init; }
    public bool AutoCountKeyed { get; init; }
    public PaymentExternalSyncStatus ExternalSyncStatus { get; init; } = PaymentExternalSyncStatus.NotSynced;
    public string? ExternalDocumentNumber { get; init; }
    public decimal? ExternalDocumentAmount { get; init; }
    public string? ReconciliationOverrideReason { get; init; }
    public string? ReconciliationOverrideBy { get; init; }
    public DateTime? ReconciliationOverrideAt { get; init; }
    public decimal SalesPrice { get; init; }
    public decimal InterestAdditionalCharges { get; init; }
    public decimal NcdAmount { get; init; }
    public decimal WindscreenCharges { get; init; }
    public DateOnly? OutstationDeliveryDate { get; init; }
    public string? BankName { get; init; }
    public DateOnly? BankFollowUpDate { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public sealed record FinanceInvoice
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid PaymentRecordId { get; init; }
    public Guid VehicleId { get; init; }
    public Guid CustomerId { get; init; }
    public string InvoiceNumber { get; init; } = "";
    public DateOnly InvoiceDate { get; init; } = DateOnly.FromDateTime(DateTime.UtcNow);
    public decimal Amount { get; init; }
    public decimal SalesPrice { get; init; }
    public decimal InterestAdditionalCharges { get; init; }
    public decimal NcdAmount { get; init; }
    public decimal WindscreenCharges { get; init; }
    public byte[] Content { get; init; } = [];
    public string ContentMimeType { get; init; } = "application/pdf";
    public string CreatedBy { get; init; } = "";
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public sealed record AutoCountSyncJob
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid FinanceInvoiceId { get; init; }
    public Guid PaymentRecordId { get; init; }
    public AutoCountSyncStatus Status { get; init; } = AutoCountSyncStatus.Draft;
    public string? ExternalDocumentId { get; init; }
    public string? ExternalDocumentNumber { get; init; }
    public string? ResponseSummary { get; init; }
    public string? LastError { get; init; }
    public int RetryCount { get; init; }
    public string? SubmittedBy { get; init; }
    public DateTime? SubmittedAt { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; init; } = DateTime.UtcNow;
}

public sealed record SettlementReminder
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid VehicleId { get; init; }
    public Guid? OwnerId { get; init; }
    public decimal Amount { get; init; }
    public DateOnly Deadline { get; init; }
    public bool IsPaid { get; init; }
}

public sealed record DailySpend
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Description { get; init; } = "";
    public decimal Amount { get; init; }
    public DateOnly DueDate { get; init; }
    public bool IsPaid { get; init; }
}

public sealed record BrokerCommission
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid VehicleId { get; init; }
    public string BrokerName { get; init; } = "";
    public decimal Amount { get; init; }
    public bool IsPaid { get; init; }
    public bool Cp58Required { get; init; }
    public bool Cp58Prepared { get; init; }
}

public sealed record DebtRecoveryCase
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid VehicleId { get; init; }
    public Guid CustomerId { get; init; }
    public decimal BalanceAmount { get; init; }
    public DebtRecoveryStatus Status { get; init; } = DebtRecoveryStatus.Open;
    public DateOnly FollowUpDate { get; init; }
    public string? Notes { get; init; }
}

public sealed record PaymentVoucher
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid VehicleId { get; init; }
    public string PayeeName { get; init; } = "";
    public decimal Amount { get; init; }
    public string Purpose { get; init; } = "";
    public PaymentVoucherStatus Status { get; init; } = PaymentVoucherStatus.Pending;
    public DateOnly IssuedDate { get; init; }
    public string? Notes { get; init; }
}

public sealed record CashHandover
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid PaymentRecordId { get; init; }
    public Guid VehicleId { get; init; }
    public Guid CustomerId { get; init; }
    public decimal Amount { get; init; }
    public CashHandoverStatus Status { get; init; } = CashHandoverStatus.ReceivedBySales;
    public string CollectedByUserId { get; init; } = "";
    public DateTime CollectedAt { get; init; } = DateTime.UtcNow;
    public DateTime? HandoverRequestedAt { get; init; }
    public string? HandedOverToUserId { get; init; }
    public DateTime? HandedOverAt { get; init; }
    public string? AcceptedByUserId { get; init; }
    public DateTime? AcceptedAt { get; init; }
    public string? RejectedByUserId { get; init; }
    public DateTime? RejectedAt { get; init; }
    public string? RejectionReason { get; init; }
    public string? Notes { get; init; }
    public Guid? OfficialReceiptId { get; init; }
    public string? OfficialReceiptNumber { get; init; }
}

public sealed record OfficialReceipt
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid CashHandoverId { get; init; }
    public Guid PaymentRecordId { get; init; }
    public string ReceiptNumber { get; init; } = "";
    public decimal Amount { get; init; }
    public byte[] Content { get; init; } = [];
    public string ContentMimeType { get; init; } = "application/pdf";
    public string CreatedBy { get; init; } = "";
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public sealed record HrAttendanceRecord
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string StaffUserId { get; init; } = "";
    public DateOnly AttendanceDate { get; init; } = DateOnly.FromDateTime(DateTime.UtcNow);
    public DateTime? CheckInAt { get; init; }
    public DateTime? CheckOutAt { get; init; }
    public HrAttendanceStatus Status { get; init; } = HrAttendanceStatus.Present;
    public string? Notes { get; init; }
}

public sealed record HrLeaveRequest
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string StaffUserId { get; init; } = "";
    public HrLeaveType Type { get; init; } = HrLeaveType.AnnualLeave;
    public HrLeaveStatus Status { get; init; } = HrLeaveStatus.Pending;
    public DateOnly StartDate { get; init; }
    public DateOnly EndDate { get; init; }
    public decimal Days { get; init; }
    public string? Reason { get; init; }
    public Guid? MedicalCertificateDocumentId { get; init; }
    public string? ApprovedBy { get; init; }
    public DateTime? ApprovedAt { get; init; }
    public string? DecisionNotes { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public sealed record HrLeaveBalance
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string StaffUserId { get; init; } = "";
    public decimal AnnualLeaveDays { get; init; }
    public decimal MedicalLeaveDays { get; init; }
    public string? Notes { get; init; }
}

public sealed record HrLeavePolicy
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Role { get; init; } = "";
    public decimal AnnualLeaveDays { get; init; }
    public decimal MedicalLeaveDays { get; init; }
    public string? Notes { get; init; }
}

public enum HrLeaveAdjustmentType
{
    AnnualLeave = 0,
    MedicalLeave = 1
}

public enum HrLeaveAdjustmentDirection
{
    Increase = 0,
    Decrease = 1
}

public sealed record HrLeaveAdjustment
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string StaffUserId { get; init; } = "";
    public HrLeaveAdjustmentType Type { get; init; } = HrLeaveAdjustmentType.AnnualLeave;
    public HrLeaveAdjustmentDirection Direction { get; init; } = HrLeaveAdjustmentDirection.Increase;
    public decimal Days { get; init; }
    public decimal AnnualLeaveBefore { get; init; }
    public decimal MedicalLeaveBefore { get; init; }
    public decimal AnnualLeaveAfter { get; init; }
    public decimal MedicalLeaveAfter { get; init; }
    public string Reason { get; init; } = "";
    public string AdjustedBy { get; init; } = "";
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public sealed record HrPayrollProfile
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string StaffUserId { get; init; } = "";
    public decimal MonthlyBaseSalary { get; init; }
    public decimal OvertimeHours { get; init; }
    public decimal OvertimeRate { get; init; }
    public decimal Allowances { get; init; }
    public decimal ManualDeductions { get; init; }
    public string? Notes { get; init; }
}

public sealed record HrPayPeriod
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Name { get; init; } = "";
    public DateOnly StartDate { get; init; }
    public DateOnly EndDate { get; init; }
    public int WorkingDays { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public sealed record HrPayslip
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string StaffUserId { get; init; } = "";
    public Guid PayPeriodId { get; init; }
    public HrPayslipStatus Status { get; init; } = HrPayslipStatus.Generated;
    public decimal BaseSalary { get; init; }
    public int WorkingDays { get; init; }
    public decimal DailySalary { get; init; }
    public decimal UnpaidLeaveDays { get; init; }
    public decimal UnpaidLeaveDeduction { get; init; }
    public decimal OvertimePay { get; init; }
    public decimal Allowances { get; init; }
    public decimal ManualDeductions { get; init; }
    public decimal GrossPay { get; init; }
    public decimal NetPay { get; init; }
    public DateTime GeneratedAt { get; init; } = DateTime.UtcNow;
}

public sealed record AuditLog { public Guid Id { get; init; } = Guid.NewGuid(); public string Actor { get; init; } = ""; public string Action { get; init; } = ""; public string EntityName { get; init; } = ""; public Guid EntityId { get; init; } public DateTime CreatedAt { get; init; } = DateTime.UtcNow; }
