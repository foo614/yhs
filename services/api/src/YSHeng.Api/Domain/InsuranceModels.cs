using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace YSHeng.Api.Domain;

public sealed record InsuranceCharge(string ItemCode, string Description, decimal Amount);

public sealed record InsuranceCase
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public string PlateNumber { get; init; } = "";
    public string CustomerName { get; init; } = "";
    public string? CustomerPhone { get; init; }
    public string? IdentityNumber { get; init; }
    public string CaseType { get; init; } = "New";
    public string Company { get; init; } = "Automotive";
    public string Insurer { get; init; } = "";
    public string Coverage { get; init; } = "";
    public decimal? Ncd { get; init; }
    public string? Remark { get; init; }
    public DateOnly ExpiryDate { get; init; }
    public DateOnly? CoverStartDate { get; init; }
    public string? PolicyNumber { get; init; }
    public bool RenewalDeclined { get; init; }
    public Guid? RenewedByCaseId { get; init; }
    public string RoadTaxMethod { get; init; } = "None";
    public int RoadTaxMonths { get; init; } = 12;
    public DateOnly? RoadTaxExpiryDate { get; init; }
    public bool RoadTaxCompleted { get; init; }
    public decimal InsuranceAmount { get; init; }
    public decimal RoadTaxAmount { get; init; }
    public decimal RunnerFee { get; init; } = 20m;
    public decimal Discount { get; init; }
    [JsonIgnore] public string OtherChargesJson { get; init; } = "[]";
    [NotMapped] public InsuranceCharge[] OtherCharges
    {
        get => JsonSerializer.Deserialize<InsuranceCharge[]>(OtherChargesJson) ?? [];
        init => OtherChargesJson = JsonSerializer.Serialize(value ?? []);
    }
    public string? InvoiceNumber { get; init; }
    public string? InsurerInvoiceNumber { get; init; }
    public string? IntercompanyInvoiceNumber { get; init; }
    public string? BankCreditorName { get; init; }
    public string? BankInvoiceNumber { get; init; }
    public bool SpecialJpjSale { get; init; }
    public string? ImportKey { get; init; }
    [JsonIgnore] public string? ImportBatchKey { get; init; }
    [JsonIgnore] public string? ImportFingerprint { get; init; }
    public long Version { get; init; }
    public string CreatedBy { get; init; } = "";
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; init; } = DateTimeOffset.UtcNow;
}

public sealed record InsuranceAttachment
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid CaseId { get; init; }
    public string Kind { get; init; } = "Other";
    public string FileName { get; init; } = "";
    public string MimeType { get; init; } = "";
    public string Checksum { get; init; } = "";
    [JsonIgnore] public byte[] Content { get; init; } = [];
    public string UploadedBy { get; init; } = "";
    public DateTimeOffset UploadedAt { get; init; } = DateTimeOffset.UtcNow;
}

public sealed record InsuranceReceipt
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid CaseId { get; init; }
    public string IdempotencyKey { get; init; } = "";
    public decimal Amount { get; init; }
    public string PaymentType { get; init; } = "Transfer";
    public string DepositAccount { get; init; } = "PBB";
    public DateOnly ReceivedDate { get; init; }
    public Guid? EvidenceAttachmentId { get; init; }
    public string InvoiceNumber { get; init; } = "";
    public string Company { get; init; } = "Automotive";
    public string Status { get; init; } = "Pending";
    public string CreatedBy { get; init; } = "";
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
    public string? ConfirmedBy { get; init; }
    public DateTimeOffset? ConfirmedAt { get; init; }
}

public sealed record InsuranceInsurerPayment
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid CaseId { get; init; }
    public string IdempotencyKey { get; init; } = "";
    public decimal Amount { get; init; }
    public DateOnly PaidDate { get; init; }
    public string Reference { get; init; } = "";
    public string ConfirmedBy { get; init; } = "";
    public DateTimeOffset ConfirmedAt { get; init; } = DateTimeOffset.UtcNow;
}
