using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record CashHandoverCreateRequest(Guid PaymentRecordId, decimal Amount, string? Notes);
public sealed record CashHandoverRejectionRequest(string Reason);
public sealed record CashHandoverPaymentLookup(Guid PaymentRecordId, Guid VehicleId, Guid CustomerId, string CustomerName, string PlateNumber, string? InvoiceNumber, decimal NettPrice);

public static class CashCustodyRules
{
    public static ValidationResult ValidateCreate(CashHandoverCreateRequest request, PaymentRecord? payment, Vehicle? vehicle)
    {
        var errors = new List<ValidationError>();
        if (payment is null) errors.Add(new("payment_not_found", "Cash handover must reference an existing payment."));
        else if (payment.FinanceWorkflowVersion == 2) errors.Add(new("finance_v2_cash_not_supported", "Finance V2 cash collection is not available yet. Do not use legacy Cash Custody because it cannot reduce the V2 invoice balance."));
        if (vehicle is null) errors.Add(new("vehicle_not_found", "Cash handover payment must reference an existing vehicle."));
        else if (vehicle.CustomerId is null) errors.Add(new("customer_required", "Cash handover vehicle must be linked to a customer."));
        if (request.Amount <= 0) errors.Add(new("cash_handover_amount_invalid", "Cash handover amount must be greater than zero."));
        if (payment is not null && request.Amount != payment.NettPrice) errors.Add(new("cash_handover_amount_mismatch", "Cash handover amount must match the payment nett price."));
        if (request.Notes?.Trim().Length > 1000) errors.Add(new("cash_handover_notes_too_long", "Cash handover notes must be 1,000 characters or fewer."));
        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateRequestHandover(CashHandover handover, string actorUserId) =>
        ValidateCollectorAction(handover, actorUserId, CashHandoverStatus.ReceivedBySales, "cash_handover_request_invalid", "Only the recorded collector can request this cash handover.");

    public static ValidationResult ValidateHandOver(CashHandover handover, string actorUserId) =>
        ValidateFinanceAction(handover, actorUserId, CashHandoverStatus.PendingHandover, "cash_handover_transfer_invalid", "Cash handover must be pending before it is received by admin.");

    public static ValidationResult ValidateAccept(CashHandover handover, string actorUserId) =>
        ValidateFinanceAction(handover, actorUserId, CashHandoverStatus.HandedOver, "cash_handover_accept_invalid", "Cash handover must be handed over before it can be accepted.");

    public static ValidationResult ValidateRecordedAmount(CashHandover handover, PaymentRecord payment) =>
        handover.Amount == payment.NettPrice
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError("cash_handover_amount_mismatch", "Cash handover amount no longer matches the payment nett price.")]);

    public static ValidationResult ValidateReject(CashHandover handover, string actorUserId, string? reason)
    {
        var result = ValidateFinanceAction(handover, actorUserId, CashHandoverStatus.HandedOver, "cash_handover_reject_invalid", "Cash handover must be handed over before it can be rejected.");
        var errors = result.Errors.ToList();
        if (string.IsNullOrWhiteSpace(reason)) errors.Add(new("cash_handover_rejection_reason_required", "A rejection reason is required."));
        return new ValidationResult(errors);
    }

    private static ValidationResult ValidateCollectorAction(CashHandover handover, string actorUserId, CashHandoverStatus expectedStatus, string code, string message)
    {
        var errors = new List<ValidationError>();
        if (handover.Status != expectedStatus) errors.Add(new(code, message));
        if (!string.Equals(handover.CollectedByUserId, actorUserId, StringComparison.Ordinal)) errors.Add(new("cash_handover_collector_required", "Only the recorded collector can perform this action."));
        return new ValidationResult(errors);
    }

    private static ValidationResult ValidateFinanceAction(CashHandover handover, string actorUserId, CashHandoverStatus expectedStatus, string code, string message)
    {
        var errors = new List<ValidationError>();
        if (handover.Status != expectedStatus) errors.Add(new(code, message));
        if (string.Equals(handover.CollectedByUserId, actorUserId, StringComparison.Ordinal)) errors.Add(new("cash_handover_self_approval_forbidden", "The collector cannot receive, accept, or reject their own cash handover."));
        return new ValidationResult(errors);
    }
}

public static class OfficialReceiptFactory
{
    public static OfficialReceipt Create(CashHandover handover, Vehicle vehicle, Customer customer, string createdBy, DateTime now)
    {
        var receiptNumber = $"YSR-{now:yyyyMMdd}-{handover.Id.ToString("N")[..6].ToUpperInvariant()}";
        var receipt = new OfficialReceipt
        {
            CashHandoverId = handover.Id,
            PaymentRecordId = handover.PaymentRecordId,
            ReceiptNumber = receiptNumber,
            Amount = handover.Amount,
            CreatedBy = createdBy,
            CreatedAt = now
        };

        return receipt with
        {
            Content = SimplePdf.Create(
                $"YS Heng Official Receipt {receipt.ReceiptNumber}",
                [
                    $"Receipt No: {receipt.ReceiptNumber}",
                    $"Receipt Date: {now:yyyy-MM-dd}",
                    $"Customer: {customer.Name}",
                    $"Phone: {customer.Phone}",
                    $"Vehicle: {vehicle.PlateNumber} {vehicle.Make} {vehicle.Model} {vehicle.Year}".Trim(),
                    $"Payment Id: {handover.PaymentRecordId}",
                    $"Cash Handover Id: {handover.Id}",
                    $"Amount Received: RM {handover.Amount:N2}",
                    $"Accepted By: {createdBy}"
                ])
        };
    }
}
