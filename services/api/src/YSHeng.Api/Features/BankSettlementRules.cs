using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class BankSettlementRules
{
    public static SettlementReminder Create(Vehicle vehicle, decimal bankDebt, DateOnly deadline, string bankName, string accountNumber) => new()
    {
        VehicleId = vehicle.Id, OwnerId = vehicle.OwnerId,
        Direction = SettlementDirection.PayBank, BankDebtAmount = bankDebt, Amount = bankDebt,
        Deadline = deadline, BankName = bankName.Trim(), BankAccountNumber = accountNumber.Trim()
    };

    public static SettlementReminder PrepareReplacement(SettlementReminder source, string bankName, string accountNumber)
    {
        if (source.IsPaid || source.SupersededById.HasValue || source.Direction == SettlementDirection.PayBank || source.BankDebtAmount is not > 0)
            throw new InvalidOperationException("Only an open seller settlement with recorded bank debt can be replaced after review.");
        return Create(new Vehicle { Id = source.VehicleId, OwnerId = source.OwnerId }, source.BankDebtAmount.Value, source.Deadline, bankName, accountNumber)
            with { ReplacesSettlementId = source.Id };
    }

    public static ValidationResult Validate(SettlementReminder record)
    {
        var errors = new List<ValidationError>();
        if (record.Direction != SettlementDirection.PayBank || record.BankDebtAmount is not > 0 || record.Amount != record.BankDebtAmount)
            errors.Add(new("bank_settlement_amount_invalid", "Outstanding bank debt must be positive and match the payment amount."));
        if (record.Deadline == default) errors.Add(new("settlement_deadline_required", "Choose the bank settlement deadline."));
        if (string.IsNullOrWhiteSpace(record.BankName) || record.BankName.Length > 200)
            errors.Add(new("settlement_bank_required", "Choose a bank name (maximum 200 characters)."));
        if (string.IsNullOrWhiteSpace(record.BankAccountNumber) || record.BankAccountNumber.Length > 80)
            errors.Add(new("settlement_account_required", "Enter the bank account number (maximum 80 characters)."));
        if (record.IsPaid && (!record.PaymentDocumentId.HasValue || !record.PaidOn.HasValue))
            errors.Add(new("settlement_evidence_required", "Completed bank payments require a payment document and date."));
        return new(errors);
    }

    public static ValidationResult ValidateEvidence(SettlementReminder record, DocumentBlob? document, DateOnly paidOn)
    {
        var errors = new List<ValidationError>();
        if (document is null || document.VehicleId != record.VehicleId || document.Category != FileCategory.BankSettlementPayment || document.BankSettlementId != record.Id || document.PaymentRecordId.HasValue || document.CollectionTransactionId.HasValue ||
            document.OwnershipType != DocumentOwnershipType.Vehicle || document.CustomerId.HasValue || document.OwnerId.HasValue ||
            document.RepairJobId.HasValue || document.DeliveryScheduleId.HasValue || document.LoanApplicationId.HasValue || document.InspectionId.HasValue)
            errors.Add(new("settlement_evidence_invalid", "Upload bank payment evidence linked to this settlement."));
        if (paidOn == default) errors.Add(new("settlement_paid_date_required", "Enter the payment date."));
        return new(errors);
    }
}
