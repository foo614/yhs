using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record BankSettlementRequest(Guid VehicleId, decimal BankDebtAmount, DateOnly Deadline, string BankName, string BankAccountNumber, Guid? ReplacesSettlementId = null);
public sealed record BankSettlementCompletionRequest(Guid PaymentDocumentId, DateOnly PaidOn, decimal ExpectedBankDebtAmount, DateOnly ExpectedDeadline, string ExpectedBankName, string ExpectedBankAccountNumber);
public sealed record BankSettlementUpdateRequest(decimal BankDebtAmount, DateOnly Deadline, string BankName, string BankAccountNumber, decimal ExpectedBankDebtAmount, DateOnly ExpectedDeadline, string ExpectedBankName, string ExpectedBankAccountNumber);
