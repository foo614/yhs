using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace YSHeng.Api.Domain;

public enum StockOwner { YSHeng, KS }
public enum VehicleStatus { Available, LoanProcessing, Sold }
public enum LeadStatus { New, Contacted, Closed }
public enum LeadClosureOutcome { Sold, Lost, Invalid }
public enum LoanStatus { Draft, Pending, Approved, Rejected, Done }
public enum DeliveryStatus { BookingInspection, Scheduled, Inspection, PreparingDocuments, CarPreparation, ReadyForRelease, Released, Cancelled }
public enum DeliveryType { Standard, Outstation }
public enum PaymentStatus { Pending, Approved, Disbursed, Reconciled }
public enum CollectionStatus { Pending, Reconciled, Reversed }
public enum CollectionMethod { BookingDeposit, DownPayment, BankTransfer, BankDisbursement, Cheque, Card, TradeInCredit, Other, Cash }
public enum FinancingStatus { NotApplicable, Pending, Approved, Disbursed }
public enum ReceivableStatus { Draft, WaitingForApproval, ReadyToCollect, PartiallyPaid, Paid, AttentionNeeded }
public enum PaymentVoucherStatus { Pending, Approved, Paid }
public enum DisbursementMethod { BankTransfer, Cheque, Cash, Other }
public enum SupplierApprovalStatus { Draft, Approved, Inactive }
public enum PurchaseInvoiceLineType { VehiclePurchase, PurchaseProcessing, LatePaymentCharge, Parking, Transport, Refurbishment, Other }
public enum DeliveryAccountingChargeType { Insurance, RoadTax }
public enum AccountingConfirmationStatus { Draft, FinanceConfirmed }
public enum CashHandoverStatus { ReceivedBySales, PendingHandover, HandedOver, Rejected, Receipted }
public enum DebtRecoveryStatus { Open, FollowedUp, Closed }
public enum RepairApprovalStatus { Pending, Approved, Rejected }
public enum SupplierInvoiceAgingStatus { Unmatched, DueSoon, Overdue, Paid }
public enum HrAttendanceStatus { Present, Late, HalfDay, Absent }
public enum HrLeaveType { AnnualLeave, MedicalLeave, EmergencyLeave, UnpaidLeave }
public enum HrLeaveStatus { Pending, Approved, Rejected, Cancelled }
public enum HrPayslipStatus { Draft, Generated }
public enum HrEmploymentType { Monthly, Hourly }
public enum HrAttendanceVerificationMethod { Manual = 0, OfficeQr = 1, Outstation = 2, ManualException = 3, OfficeIp = 4 }
public enum FileCategory { VehiclePhoto, PurchaseInvoice, Voc, IdentityCard, ApDocument, StatusReceipt, LoanDocument, DeliveryDocument, HandoverPhoto, SignedHandover, Policy, RoadTaxReceipt, RepairInvoice, PaymentReceipt, PaymentInvoice, MedicalCertificate, InspectionReport, WindscreenPolicy }
public enum DocumentOwnershipType { Seller, Buyer, Vehicle }
public enum OcrJobStatus { Queued, Analyzing, NeedsReview, Failed, Reviewed }
// Accepted and Rejected are retained only for historical OCR jobs created before
// the review-and-correct workflow. New reviews use Reviewed.
public enum OcrReviewDecision { Pending, Accepted, Rejected, Reviewed }
public enum AiService { Ocr }
public enum AiUsageStatus { Reserved, Succeeded, Failed }

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
    [NotMapped]
    public decimal? RepairCost { get; init; }
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
    public DateTime? SoldAt { get; init; }
}

public sealed record VehicleCatalogModel
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Make { get; init; } = "";
    public string Model { get; init; } = "";
    public bool IsActive { get; init; } = true;
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
    public string? TinNumber { get; init; }
    public string? Email { get; init; }
    public string? Address { get; init; }
    public string? Notes { get; init; }
}

public sealed record Owner
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Name { get; init; } = "";
    public string Phone { get; init; } = "";
    public string? IcNumber { get; init; }
    public string? TinNumber { get; init; }
    public string? Address { get; init; }
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
    public LeadClosureOutcome? ClosureOutcome { get; init; }
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
    public Guid? OwnerId { get; init; }
    public Guid? RepairJobId { get; init; }
    public Guid? PaymentRecordId { get; init; }
    public Guid? CollectionTransactionId { get; init; }
    public Guid? DeliveryScheduleId { get; init; }
    public DocumentOwnershipType OwnershipType { get; init; } = DocumentOwnershipType.Vehicle;
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
    public string? ReviewedResultJson { get; init; }
    public string? ReviewChangesJson { get; init; }
    public int ComparedFieldCount { get; init; }
    public int CorrectFieldCount { get; init; }
}

public sealed record AiServiceLimit
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public AiService Service { get; init; }
    public bool IsEnabled { get; init; } = true;
    public int MonthlyRequestLimit { get; init; } = 300;
    public int PerStaffDailyRequestLimit { get; init; } = 25;
    public DateTime UpdatedAt { get; init; } = DateTime.UtcNow;
    public string UpdatedBy { get; init; } = "System";
}

public sealed record AiUsageRecord
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public AiService Service { get; init; }
    public Guid SourceDocumentId { get; init; }
    public string StaffUserId { get; init; } = "";
    public AiUsageStatus Status { get; init; } = AiUsageStatus.Reserved;
    public DateTime RequestedAt { get; init; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; init; }
}

public sealed record Supplier
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string CompanyName { get; init; } = "";
    public string? RegistrationNumber { get; init; }
    public string? TinNumber { get; init; }
    public string Address { get; init; } = "";
    public string Phone { get; init; } = "";
    public string? ContactPerson { get; init; }
    public string? AutoCountCreditorCode { get; init; }
    public SupplierApprovalStatus ApprovalStatus { get; init; } = SupplierApprovalStatus.Draft;
    public string CreatedBy { get; init; } = "";
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public string? ApprovedBy { get; init; }
    public DateTime? ApprovedAt { get; init; }
}

public sealed record PurchaseInvoice
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid VehicleId { get; init; }
    public Guid? SupplierId { get; init; }
    public string InvoiceNumber { get; init; } = "";
    public DateOnly InvoiceDate { get; init; } = DateOnly.FromDateTime(DateTime.UtcNow);
    public DateOnly? PurchaseDate { get; init; }
    public string? PaymentReference { get; init; }
    public decimal Amount { get; init; }
    public AccountingConfirmationStatus AccountingStatus { get; init; } = AccountingConfirmationStatus.Draft;
    public string? AccountingConfirmedBy { get; init; }
    public DateTime? AccountingConfirmedAt { get; init; }
    [NotMapped]
    public IReadOnlyList<PurchaseInvoiceLine> Lines { get; init; } = [];
}

public sealed record PurchaseInvoiceLine
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid PurchaseInvoiceId { get; init; }
    public PurchaseInvoiceLineType LineType { get; init; }
    public string Description { get; init; } = "";
    public decimal Amount { get; init; }
    public bool CapitaliseIntoVehicleCost { get; init; }
}
public sealed record RepairJob { public Guid Id { get; init; } = Guid.NewGuid(); public Guid VehicleId { get; init; } public string RepairPart { get; init; } = ""; public string WhatToDo { get; init; } = ""; public decimal Cost { get; init; } public bool ChecklistDone { get; init; } public string? AssignedTo { get; init; } public DateOnly? StartedOn { get; init; } public DateOnly? ExpectedCompletionDate { get; init; } public RepairApprovalStatus ApprovalStatus { get; init; } = RepairApprovalStatus.Approved; public string? ApprovalNotes { get; init; } public string? ApprovedBy { get; init; } public DateTime? ApprovedAt { get; init; } public DateTime CreatedAt { get; init; } = DateTime.UtcNow; }
public sealed record RepairReceipt { public Guid Id { get; init; } = Guid.NewGuid(); public Guid RepairJobId { get; init; } public Guid DocumentId { get; init; } public string? SupplierName { get; init; } public string? InvoiceNumber { get; init; } public decimal? TotalAmount { get; init; } public DateTime CreatedAt { get; init; } = DateTime.UtcNow; }
public sealed record RepairReceiptItem { public Guid Id { get; init; } = Guid.NewGuid(); public Guid RepairReceiptId { get; init; } public string Description { get; init; } = ""; public string? RepairPart { get; init; } public decimal Amount { get; init; } public int SortOrder { get; init; } }
public sealed record ConfirmRepairReceiptRequest(Guid DocumentId, string? SupplierName, string? InvoiceNumber, decimal? TotalAmount, IReadOnlyList<ConfirmRepairReceiptItemRequest> Items);
public sealed record ConfirmRepairReceiptItemRequest(string Description, string? RepairPart, decimal Amount, int SortOrder);
public sealed record SupplierInvoice { public Guid Id { get; init; } = Guid.NewGuid(); public Guid VehicleId { get; init; } public Guid? SupplierId { get; init; } public string SupplierName { get; init; } = ""; public string InvoiceNumber { get; init; } = ""; public string? PlateNumberOnInvoice { get; init; } public DateOnly? InvoiceDate { get; init; } public decimal Amount { get; init; } public DateOnly? DueDate { get; init; } public DateOnly? PaidAt { get; init; } public DateTime CreatedAt { get; init; } = DateTime.UtcNow; }
public sealed record CreateRepairWithReceiptRequest(RepairJob Repair, SupplierInvoice Invoice, ConfirmRepairReceiptRequest Receipt);
public sealed record CreateRepairWithReceiptResponse(RepairJob Repair, SupplierInvoice Invoice, RepairReceipt Receipt, IReadOnlyList<RepairReceiptItem> Items);

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
    public Guid? CustomerId { get; init; }
    public string Pic { get; init; } = "";
    public DeliveryStatus Status { get; init; } = DeliveryStatus.BookingInspection;
    public DeliveryType DeliveryType { get; init; } = DeliveryType.Standard;
    public DateOnly ScheduledDate { get; init; }
    public TimeOnly? ScheduledTime { get; init; }
    public string? DeliveryAddress { get; init; }
    public string? TransportMethod { get; init; }
    public string? RescheduleReason { get; init; }
    public string? CancellationReason { get; init; }
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
    public DateTime? ReleasedAt { get; init; }
    public string? ReleasedByUserId { get; init; }
}

public sealed record DeliveryAccountingCharge
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid DeliveryScheduleId { get; init; }
    public Guid VehicleId { get; init; }
    public DeliveryAccountingChargeType ChargeType { get; init; }
    public Guid? SupplierId { get; init; }
    public string ProviderName { get; init; } = "";
    public string? ReferenceNumber { get; init; }
    public DateOnly InvoiceDate { get; init; } = DateOnly.FromDateTime(DateTime.UtcNow);
    public decimal Amount { get; init; }
    public bool PaidOnBehalf { get; init; }
    public Guid? DocumentId { get; init; }
    public AccountingConfirmationStatus AccountingStatus { get; init; } = AccountingConfirmationStatus.Draft;
    public string UpdatedBy { get; init; } = "";
    public DateTime UpdatedAt { get; init; } = DateTime.UtcNow;
    public string? AccountingConfirmedBy { get; init; }
    public DateTime? AccountingConfirmedAt { get; init; }
}

public sealed record PaymentRecord
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid VehicleId { get; init; }
    public Guid? CustomerId { get; init; }
    public decimal NettPrice { get; init; }
    public decimal CalculatedNettPrice { get; init; }
    public decimal NettPriceVariance { get; init; }
    public string? NettPriceOverrideReason { get; init; }
    public string? NettPriceOverrideRequestedBy { get; init; }
    public DateTime? NettPriceOverrideRequestedAt { get; init; }
    public string? NettPriceOverrideApprovedBy { get; init; }
    public DateTime? NettPriceOverrideApprovedAt { get; init; }
    public string FormulaVersion { get; init; } = "legacy";
    public int FinanceWorkflowVersion { get; init; } = 1;
    public PaymentStatus Status { get; init; } = PaymentStatus.Pending;
    public string? ReceiptNumber { get; init; }
    public string? InvoiceNumber { get; init; }
    public bool BossChecked { get; init; }
    public bool DocumentsPrepared { get; init; }
    public bool ChecklistValidated { get; init; }
    public decimal SalesPrice { get; init; }
    public decimal InterestAdditionalCharges { get; init; }
    public decimal NcdAmount { get; init; }
    public decimal WindscreenCharges { get; init; }
    public DateOnly? OutstationDeliveryDate { get; init; }
    public string? BankName { get; init; }
    public DateOnly? BankFollowUpDate { get; init; }
    public string? SalesAgentUserId { get; init; }
    public string? SalesAgentName { get; init; }
    public string? LoanBankReference { get; init; }
    public decimal InsurancePaidOnBehalfAmount { get; init; }
    public decimal RoadTaxPaidOnBehalfAmount { get; init; }
    public decimal AdvancePaidOnBehalfAmount { get; init; }
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public sealed record FinanceInvoice
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid PaymentRecordId { get; init; }
    public Guid VehicleId { get; init; }
    public Guid CustomerId { get; init; }
    public string CustomerName { get; init; } = "";
    public string? CustomerPhone { get; init; }
    public string? CustomerAddress { get; init; }
    public string? CustomerTinNumber { get; init; }
    public string? SalesAgentUserId { get; init; }
    public string? SalesAgentName { get; init; }
    public string? LoanBankReference { get; init; }
    public string VehiclePlateNumber { get; init; } = "";
    public string VehicleDescription { get; init; } = "";
    public string InvoiceNumber { get; init; } = "";
    public DateOnly InvoiceDate { get; init; } = DateOnly.FromDateTime(DateTime.UtcNow);
    public decimal Amount { get; init; }
    public decimal SalesPrice { get; init; }
    public decimal InterestAdditionalCharges { get; init; }
    public decimal NcdAmount { get; init; }
    public decimal WindscreenCharges { get; init; }
    public decimal InsurancePaidOnBehalfAmount { get; init; }
    public decimal RoadTaxPaidOnBehalfAmount { get; init; }
    public decimal AdvancePaidOnBehalfAmount { get; init; }
    public byte[] Content { get; init; } = [];
    public string ContentMimeType { get; init; } = "application/pdf";
    public string CreatedBy { get; init; } = "";
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
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
    public DisbursementMethod PaymentMethod { get; init; } = DisbursementMethod.BankTransfer;
    public string SourceAccountCode { get; init; } = "";
    public string? ChequeNumber { get; init; }
    public string? PaymentReference { get; init; }
    public decimal BankChargeAmount { get; init; }
    public string? BankChargeAccountCode { get; init; }
    public string AccountingAccountCode { get; init; } = "";
    public string CreatedBy { get; init; } = "";
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public string? ApprovedBy { get; init; }
    public DateTime? ApprovedAt { get; init; }
    public string? PaidBy { get; init; }
    public DateTime? PaidAt { get; init; }
    public string? PaymentEvidenceReference { get; init; }
    public string? Notes { get; init; }
}

public sealed record MarkPaymentVoucherPaidRequest(string PaymentEvidenceReference);

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

public sealed record CollectionTransaction
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid PaymentRecordId { get; init; }
    public Guid IdempotencyKey { get; init; } = Guid.NewGuid();
    [JsonIgnore]
    public string IdempotencyFingerprint { get; init; } = "";
    public decimal Amount { get; init; }
    public CollectionMethod Method { get; init; }
    public CollectionStatus Status { get; init; } = CollectionStatus.Pending;
    public FinancingStatus FinancingStatus { get; init; } = FinancingStatus.NotApplicable;
    public string? Reference { get; init; }
    [JsonIgnore]
    public string? NormalizedReference { get; init; }
    public DateOnly ReceivedDate { get; init; } = DateOnly.FromDateTime(DateTime.UtcNow);
    public string? Notes { get; init; }
    public string CreatedBy { get; init; } = "";
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
    public string? ReconciledBy { get; init; }
    public DateTime? ReconciledAt { get; init; }
    public string? ReversedBy { get; init; }
    public DateTime? ReversedAt { get; init; }
    public string? ReversalReason { get; init; }
}

public sealed record HrAttendanceRecord
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string StaffUserId { get; init; } = "";
    public DateOnly AttendanceDate { get; init; } = DateOnly.FromDateTime(DateTime.UtcNow);
    public DateTime? CheckInAt { get; init; }
    public DateTime? CheckOutAt { get; init; }
    public HrAttendanceStatus Status { get; init; } = HrAttendanceStatus.Present;
    public HrAttendanceVerificationMethod VerificationMethod { get; init; } = HrAttendanceVerificationMethod.Manual;
    public string? OfficeNetworkLabel { get; init; }
    public string? Notes { get; init; }
}

public sealed record HrAttendanceNetwork
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string Label { get; init; } = "";
    public string Cidr { get; init; } = "";
    public bool IsActive { get; init; } = true;
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
}

public sealed record HrCalendarAvailability(string StaffUserId, string StaffName, DateOnly Date, string Status = "Unavailable");

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
    public HrEmploymentType EmploymentType { get; init; } = HrEmploymentType.Monthly;
    public decimal MonthlyBaseSalary { get; init; }
    public decimal HourlyRate { get; init; }
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
    public HrEmploymentType EmploymentType { get; init; } = HrEmploymentType.Monthly;
    public decimal BaseSalary { get; init; }
    public decimal HourlyRate { get; init; }
    public decimal WorkedHours { get; init; }
    public decimal AttendancePay { get; init; }
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
