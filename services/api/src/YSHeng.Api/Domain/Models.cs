namespace YSHeng.Api.Domain;

public enum StockOwner { YSHeng, KS }
public enum VehicleStatus { Available, LoanProcessing, Sold }
public enum LeadStatus { New, Contacted, Closed }
public enum LoanStatus { Draft, Pending, Approved, Rejected, Done }
public enum DeliveryStatus { BookingInspection, Scheduled, Inspection, PreparingDocuments, CarPreparation, ReadyForRelease, Released }
public enum PaymentStatus { Pending, Approved, Disbursed, Reconciled }
public enum PaymentVoucherStatus { Pending, Approved, Paid }
public enum DebtRecoveryStatus { Open, FollowedUp, Closed }
public enum FileCategory { VehiclePhoto, PurchaseInvoice, Voc, ApDocument, StatusReceipt, LoanDocument, DeliveryDocument, Policy, RoadTaxReceipt, RepairInvoice, PaymentReceipt, PaymentInvoice }

public sealed record Vehicle
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string PlateNumber { get; init; } = "";
    public string Make { get; init; } = "";
    public string Model { get; init; } = "";
    public int Year { get; init; }
    public StockOwner StockOwner { get; init; }
    public VehicleStatus Status { get; init; }
    public bool IsPublic { get; init; }
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
    public LeadStatus Status { get; init; } = LeadStatus.New;
    public DateTime CreatedAt { get; init; } = DateTime.UtcNow;
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
    public DateTime UploadedAt { get; init; } = DateTime.UtcNow;
}

public sealed record DocumentBlob
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid? VehicleId { get; init; }
    public Guid? CustomerId { get; init; }
    public FileCategory Category { get; init; }
    public string FileName { get; init; } = "";
    public string MimeType { get; init; } = "";
    public byte[] Content { get; init; } = [];
    public string Checksum { get; init; } = "";
    public string UploadedBy { get; init; } = "";
    public DateTime UploadedAt { get; init; } = DateTime.UtcNow;
}

public sealed record PurchaseInvoice { public Guid Id { get; init; } = Guid.NewGuid(); public Guid VehicleId { get; init; } public string InvoiceNumber { get; init; } = ""; public decimal Amount { get; init; } }
public sealed record RepairJob { public Guid Id { get; init; } = Guid.NewGuid(); public Guid VehicleId { get; init; } public string RepairPart { get; init; } = ""; public string WhatToDo { get; init; } = ""; public decimal Cost { get; init; } public bool ChecklistDone { get; init; } }
public sealed record SupplierInvoice { public Guid Id { get; init; } = Guid.NewGuid(); public Guid VehicleId { get; init; } public string SupplierName { get; init; } = ""; public string InvoiceNumber { get; init; } = ""; public string? PlateNumberOnInvoice { get; init; } public decimal Amount { get; init; } }

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
    public bool RoadTaxHandled { get; init; }
    public string? RoadTaxReceiptReference { get; init; }
    public bool WindscreenInsuranceHandled { get; init; }
    public string? WindscreenPolicyReference { get; init; }
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
    public decimal SalesPrice { get; init; }
    public decimal InterestAdditionalCharges { get; init; }
    public decimal NcdAmount { get; init; }
    public decimal WindscreenCharges { get; init; }
    public DateOnly? OutstationDeliveryDate { get; init; }
    public string? BankName { get; init; }
    public DateOnly? BankFollowUpDate { get; init; }
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
    public string? Notes { get; init; }
}

public sealed record AuditLog { public Guid Id { get; init; } = Guid.NewGuid(); public string Actor { get; init; } = ""; public string Action { get; init; } = ""; public string EntityName { get; init; } = ""; public Guid EntityId { get; init; } public DateTime CreatedAt { get; init; } = DateTime.UtcNow; }
