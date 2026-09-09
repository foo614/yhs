using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record CashHandoverCreateRequest(Guid PaymentRecordId, decimal Amount, string? Notes, Guid? IdempotencyKey = null);
public sealed record CashHandoverRejectionRequest(string Reason);
public sealed record CashHandoverPaymentLookup(
    Guid PaymentRecordId,
    Guid VehicleId,
    Guid CustomerId,
    string CustomerName,
    string PlateNumber,
    string? InvoiceNumber,
    decimal NettPrice,
    decimal AvailableAmount,
    int FinanceWorkflowVersion);

public sealed record CashHandoverRegisterItem(
    Guid Id,
    Guid PaymentRecordId,
    Guid? CollectionTransactionId,
    Guid VehicleId,
    Guid CustomerId,
    decimal Amount,
    CashHandoverStatus Status,
    long Version,
    string PlateNumber,
    string CustomerName,
    string? PaymentInvoiceNumber,
    decimal? PaymentNettPrice,
    PaymentStatus? PaymentStatus,
    CollectionStatus? CollectionStatus,
    bool TransactionMatches,
    bool CanRejectTransaction,
    string? RejectBlockReason,
    string CollectedByUserId,
    string CollectedByName,
    DateTime CollectedAt,
    DateTime? HandoverRequestedAt,
    string? HandedOverByUserId,
    string? HandedOverByName,
    string? HandedOverToUserId,
    string? HandedOverToName,
    DateTime? HandedOverAt,
    string? AcceptedByUserId,
    string? AcceptedByName,
    DateTime? AcceptedAt,
    string? RejectedByUserId,
    string? RejectedByName,
    DateTime? RejectedAt,
    string? RejectionReason,
    string? Notes,
    Guid? OfficialReceiptId,
    string? OfficialReceiptNumber);

public static class CashHandoverRegisterFactory
{
    public static CashHandoverRegisterItem Create(
        CashHandover handover,
        PaymentRecord? payment,
        CollectionTransaction? collection,
        Vehicle? vehicle,
        Customer? customer,
        IReadOnlyDictionary<string, string> actorNames)
    {
        string ActorName(string? userId) =>
            string.IsNullOrWhiteSpace(userId)
                ? ""
                : actorNames.TryGetValue(userId, out var displayName) && !string.IsNullOrWhiteSpace(displayName)
                    ? displayName
                    : userId;

        var rejectValidation = payment is null
            ? new ValidationResult([new ValidationError("cash_handover_payment_unavailable", "The linked payment is unavailable. Escalate this custody record without changing Finance totals.")])
            : CashCustodyRules.ValidateRejectTransaction(handover, payment, collection);

        return new CashHandoverRegisterItem(
            handover.Id,
            handover.PaymentRecordId,
            handover.CollectionTransactionId,
            handover.VehicleId,
            handover.CustomerId,
            handover.Amount,
            handover.Status,
            handover.Version,
            vehicle?.PlateNumber ?? handover.VehicleId.ToString(),
            customer?.Name ?? handover.CustomerId.ToString(),
            payment?.InvoiceNumber,
            payment?.NettPrice,
            payment?.Status,
            collection?.Status,
            payment is not null && vehicle is not null && CashCustodyRules.ValidateRecordedTransaction(handover, payment, vehicle, collection).IsValid,
            rejectValidation.IsValid,
            rejectValidation.Errors.FirstOrDefault()?.Message,
            handover.CollectedByUserId,
            ActorName(handover.CollectedByUserId),
            handover.CollectedAt,
            handover.HandoverRequestedAt,
            handover.HandedOverByUserId,
            string.IsNullOrWhiteSpace(handover.HandedOverByUserId) ? null : ActorName(handover.HandedOverByUserId),
            handover.HandedOverToUserId,
            ActorName(handover.HandedOverToUserId),
            handover.HandedOverAt,
            handover.AcceptedByUserId,
            ActorName(handover.AcceptedByUserId),
            handover.AcceptedAt,
            handover.RejectedByUserId,
            ActorName(handover.RejectedByUserId),
            handover.RejectedAt,
            handover.RejectionReason,
            handover.Notes,
            handover.OfficialReceiptId,
            handover.OfficialReceiptNumber);
    }
}

public static class CashCustodyRules
{
    public static ValidationResult ValidateCreate(
        CashHandoverCreateRequest request,
        PaymentRecord? payment,
        Vehicle? vehicle,
        FinanceInvoice? invoice = null,
        IEnumerable<CollectionTransaction>? collections = null)
    {
        var errors = new List<ValidationError>();
        if (payment is null) errors.Add(new("payment_not_found", "Cash handover must reference an existing payment."));
        if (vehicle is null) errors.Add(new("vehicle_not_found", "Cash handover payment must reference an existing vehicle."));
        else if (vehicle.CustomerId is null) errors.Add(new("customer_required", "Cash handover vehicle must be linked to a customer."));
        if (request.Amount <= 0) errors.Add(new("cash_handover_amount_invalid", "Cash handover amount must be greater than zero."));
        if (request.Amount != decimal.Round(request.Amount, 2, MidpointRounding.AwayFromZero)) errors.Add(new("cash_handover_amount_precision_invalid", "Cash handover amount must use no more than two decimal places."));
        if (request.Notes?.Trim().Length > 1000) errors.Add(new("cash_handover_notes_too_long", "Cash handover notes must be 1,000 characters or fewer."));
        if (payment is null) return new ValidationResult(errors);

        if (payment.FinanceWorkflowVersion == 2)
        {
            if (request.IdempotencyKey is null || request.IdempotencyKey == Guid.Empty)
            {
                errors.Add(new("cash_handover_idempotency_key_required", "Finance V2 cash collection requires a non-empty retry key."));
            }
            errors.AddRange(FinanceV2Rules.ValidateCanonicalBuyer(payment, invoice, vehicle).Errors);
            if (!FinanceV2Rules.HasApprovedVariance(payment))
            {
                errors.Add(new("finance_variance_approval_required", "Boss/Admin approval is required before recording cash for an NCD or adjusted nett price."));
            }
            if (request.Amount > FinanceV2Rules.AvailableToAllocate(payment, collections ?? []))
            {
                errors.Add(new("cash_handover_over_allocation", "Cash amount exceeds the remaining invoice balance available to collect."));
            }
        }
        else
        {
            if (payment.Status == PaymentStatus.Reconciled) errors.Add(new("cash_handover_payment_reconciled", "Cash custody cannot start after the payment is already reconciled."));
            if (request.Amount != payment.NettPrice) errors.Add(new("cash_handover_amount_mismatch", "Legacy cash handover amount must match the payment nett price."));
        }
        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateResponsibleSales(PaymentRecord payment, string actorUserId) =>
        payment.FinanceWorkflowVersion != 2 || string.Equals(payment.SalesAgentUserId, actorUserId, StringComparison.Ordinal)
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError("cash_handover_responsible_sales_required", "Only the Sales user assigned to this Finance V2 sale can record its physical cash.")]);

    public static ValidationResult ValidateRejectTransaction(CashHandover handover, PaymentRecord payment, CollectionTransaction? collection)
    {
        if (payment.FinanceWorkflowVersion != 2) return new ValidationResult([]);
        var valid = handover.PaymentRecordId == payment.Id &&
            handover.CollectionTransactionId is not null &&
            collection is not null &&
            collection.Id == handover.CollectionTransactionId &&
            collection.PaymentRecordId == payment.Id &&
            collection.Method == CollectionMethod.Cash &&
            collection.Status == CollectionStatus.Pending;
        return valid
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError("cash_handover_collection_link_mismatch", "The linked pending cash collection is unavailable. Escalate this custody record without changing Finance totals.")]);
    }

    public static CollectionTransaction CreateV2Collection(CashHandoverCreateRequest request, string actorUserId, DateTime now) =>
        FinanceV2Rules.CreateCollection(
            request.PaymentRecordId,
            new CreateCollectionRequest(request.Amount, CollectionMethod.Cash, null, AutoCountDateRules.SingaporeAccountingDate(now), request.Notes, FinancingStatus.NotApplicable, request.IdempotencyKey),
            actorUserId,
            now);

    public static bool IsExactV2Retry(CollectionTransaction collection, CashHandoverCreateRequest request) =>
        collection.Method == CollectionMethod.Cash &&
        collection.Amount == decimal.Round(request.Amount, 2, MidpointRounding.AwayFromZero) &&
        string.Equals(collection.Notes ?? "", request.Notes?.Trim() ?? "", StringComparison.Ordinal);

    public static ValidationResult ValidateRequestHandover(CashHandover handover, string actorUserId) =>
        ValidateCollectorAction(handover, actorUserId, CashHandoverStatus.ReceivedBySales, "cash_handover_request_invalid", "Only the recorded collector can request this cash handover.");

    public static ValidationResult ValidateHandOver(CashHandover handover, string actorUserId) =>
        ValidateFinanceAction(handover, actorUserId, CashHandoverStatus.PendingHandover, "cash_handover_transfer_invalid", "Cash handover must be pending before Finance records physical receipt.");

    public static ValidationResult ValidateAccept(CashHandover handover, string actorUserId) =>
        ValidateFinanceAction(handover, actorUserId, CashHandoverStatus.HandedOver, "cash_handover_accept_invalid", "Cash handover must be handed over before it can be accepted.", requireIndependentChecker: true);

    public static ValidationResult ValidateRecordedTransaction(CashHandover handover, PaymentRecord payment, Vehicle vehicle, CollectionTransaction? collection)
    {
        var errors = new List<ValidationError>();
        if (handover.PaymentRecordId != payment.Id || handover.VehicleId != payment.VehicleId)
        {
            errors.Add(new("cash_handover_payment_link_mismatch", "Cash handover no longer matches the recorded payment and vehicle."));
        }
        if (vehicle.Id != handover.VehicleId || vehicle.CustomerId != handover.CustomerId || payment.CustomerId is { } paymentCustomerId && paymentCustomerId != handover.CustomerId)
        {
            errors.Add(new("cash_handover_customer_link_mismatch", "Cash handover no longer matches the vehicle's confirmed customer."));
        }
        if (payment.FinanceWorkflowVersion == 2)
        {
            if (handover.CollectionTransactionId is null || collection is null || collection.Id != handover.CollectionTransactionId || collection.PaymentRecordId != payment.Id || collection.Method != CollectionMethod.Cash)
            {
                errors.Add(new("cash_handover_collection_link_mismatch", "Finance V2 cash handover no longer matches its collection transaction."));
            }
            else
            {
                if (collection.Amount != handover.Amount) errors.Add(new("cash_handover_amount_mismatch", "Cash handover amount no longer matches the linked collection."));
                var expectedStatus = handover.Status switch
                {
                    CashHandoverStatus.Receipted => CollectionStatus.Reconciled,
                    CashHandoverStatus.Rejected => CollectionStatus.Reversed,
                    _ => CollectionStatus.Pending
                };
                if (collection.Status != expectedStatus) errors.Add(new("cash_handover_collection_status_mismatch", "Cash custody and Finance V2 collection states no longer match."));
            }
        }
        else if (handover.Amount != payment.NettPrice)
        {
            errors.Add(new("cash_handover_amount_mismatch", "Cash handover amount no longer matches the legacy payment nett price."));
        }
        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateReject(CashHandover handover, string actorUserId, string? reason)
    {
        var result = ValidateFinanceAction(handover, actorUserId, CashHandoverStatus.HandedOver, "cash_handover_reject_invalid", "Cash handover must be handed over before it can be rejected.", requireIndependentChecker: true);
        var errors = result.Errors.ToList();
        if (string.IsNullOrWhiteSpace(reason)) errors.Add(new("cash_handover_rejection_reason_required", "A rejection reason is required."));
        else if (reason.Trim().Length > 1000) errors.Add(new("cash_handover_rejection_reason_too_long", "Rejection reason must be 1,000 characters or fewer."));
        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateLegacyPaymentUpdate(PaymentRecord existing, PaymentRecord update, CashHandover? handover)
    {
        if (handover is null) return new ValidationResult([]);
        var errors = new List<ValidationError>();
        if (existing.VehicleId != update.VehicleId) errors.Add(new("cash_handover_payment_vehicle_locked", "Payment vehicle cannot change after physical cash has been recorded."));
        if (existing.NettPrice != update.NettPrice) errors.Add(new("cash_handover_payment_amount_locked", "Payment nett price cannot change after physical cash has been recorded."));
        if (update.Status == PaymentStatus.Reconciled && handover.Status != CashHandoverStatus.Receipted) errors.Add(new("cash_handover_custody_incomplete", "Physical cash must be accepted into Finance custody before this payment can be reconciled."));
        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateVehicleUpdate(Vehicle existing, Vehicle update, CashHandover? handover) =>
        handover is null || existing.CustomerId == update.CustomerId
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError("cash_handover_customer_locked", "Vehicle customer cannot change after physical cash has been recorded.")]);

    private static ValidationResult ValidateCollectorAction(CashHandover handover, string actorUserId, CashHandoverStatus expectedStatus, string code, string message)
    {
        var errors = new List<ValidationError>();
        if (handover.Status != expectedStatus) errors.Add(new(code, message));
        if (!string.Equals(handover.CollectedByUserId, actorUserId, StringComparison.Ordinal)) errors.Add(new("cash_handover_collector_required", "Only the recorded collector can perform this action."));
        return new ValidationResult(errors);
    }

    private static ValidationResult ValidateFinanceAction(CashHandover handover, string actorUserId, CashHandoverStatus expectedStatus, string code, string message, bool requireIndependentChecker = false)
    {
        var errors = new List<ValidationError>();
        if (handover.Status != expectedStatus) errors.Add(new(code, message));
        if (string.Equals(handover.CollectedByUserId, actorUserId, StringComparison.Ordinal)) errors.Add(new("cash_handover_self_approval_forbidden", "The collector cannot receive, accept, or reject their own cash handover."));
        if (requireIndependentChecker && string.IsNullOrWhiteSpace(handover.HandedOverToUserId)) errors.Add(new("cash_handover_receiver_required", "Finance receipt must identify the receiving user before custody can be accepted or rejected."));
        if (requireIndependentChecker && string.Equals(handover.HandedOverToUserId, actorUserId, StringComparison.Ordinal)) errors.Add(new("cash_handover_checker_required", "A different Finance or Boss/Admin user must accept or reject custody."));
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
