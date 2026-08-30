using System.Buffers.Binary;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record FinanceSaleRequest(
    Guid VehicleId,
    decimal SalesPrice,
    decimal InterestAdditionalCharges,
    decimal NcdAmount,
    decimal WindscreenCharges,
    decimal? NettPrice,
    string? NettPriceOverrideReason,
    string? SalesAgentUserId = null,
    string? LoanBankReference = null,
    decimal InsurancePaidOnBehalfAmount = 0,
    decimal RoadTaxPaidOnBehalfAmount = 0,
    decimal AdvancePaidOnBehalfAmount = 0);

public sealed record CreateCollectionRequest(
    decimal Amount,
    CollectionMethod Method,
    string? Reference,
    DateOnly? ReceivedDate,
    string? Notes,
    FinancingStatus? FinancingStatus,
    Guid? IdempotencyKey = null);

public sealed record UpdateFinancingStatusRequest(FinancingStatus Status);
public sealed record ReverseCollectionRequest(string Reason);

public sealed record FinanceVehicleOptionResponse(
    Guid Id,
    string PlateNumber,
    string Make,
    string Model,
    VehicleStatus Status,
    Guid? CustomerId,
    decimal SellingPrice,
    decimal AdditionalCharges);

public static class FinanceVehicleOptions
{
    public static FinanceVehicleOptionResponse ToResponse(Vehicle vehicle) =>
        new(
            vehicle.Id,
            vehicle.PlateNumber,
            vehicle.Make,
            vehicle.Model,
            vehicle.Status,
            vehicle.CustomerId,
            vehicle.SellingPrice,
            vehicle.AdditionalCharges);
}

public static class FinanceV2Rules
{
    public const string FormulaVersion = "v2:sales+additional+windscreen+paid-on-behalf-ncd";

    public static decimal CalculateNettPrice(
        decimal salesPrice,
        decimal interestAdditionalCharges,
        decimal ncdAmount,
        decimal windscreenCharges,
        decimal insurancePaidOnBehalfAmount = 0,
        decimal roadTaxPaidOnBehalfAmount = 0,
        decimal advancePaidOnBehalfAmount = 0) =>
        decimal.Round(salesPrice + interestAdditionalCharges + windscreenCharges + insurancePaidOnBehalfAmount + roadTaxPaidOnBehalfAmount + advancePaidOnBehalfAmount - ncdAmount, 2, MidpointRounding.AwayFromZero);

    public static PaymentRecord CreatePayment(FinanceSaleRequest request, Guid customerId, string actorUserId, DateTime now)
    {
        var calculated = CalculateNettPrice(request.SalesPrice, request.InterestAdditionalCharges, request.NcdAmount, request.WindscreenCharges, request.InsurancePaidOnBehalfAmount, request.RoadTaxPaidOnBehalfAmount, request.AdvancePaidOnBehalfAmount);
        var agreed = decimal.Round(request.NettPrice ?? calculated, 2, MidpointRounding.AwayFromZero);
        var variance = decimal.Round(agreed - calculated, 2, MidpointRounding.AwayFromZero);
        return new PaymentRecord
        {
            VehicleId = request.VehicleId,
            CustomerId = customerId,
            NettPrice = agreed,
            CalculatedNettPrice = calculated,
            NettPriceVariance = variance,
            NettPriceOverrideReason = variance == 0 ? null : request.NettPriceOverrideReason?.Trim(),
            NettPriceOverrideRequestedBy = variance == 0 ? null : actorUserId,
            NettPriceOverrideRequestedAt = variance == 0 ? null : now,
            FormulaVersion = FormulaVersion,
            FinanceWorkflowVersion = 2,
            SalesPrice = request.SalesPrice,
            InterestAdditionalCharges = request.InterestAdditionalCharges,
            NcdAmount = request.NcdAmount,
            WindscreenCharges = request.WindscreenCharges,
            SalesAgentUserId = request.SalesAgentUserId?.Trim(),
            LoanBankReference = request.LoanBankReference?.Trim(),
            InsurancePaidOnBehalfAmount = request.InsurancePaidOnBehalfAmount,
            RoadTaxPaidOnBehalfAmount = request.RoadTaxPaidOnBehalfAmount,
            AdvancePaidOnBehalfAmount = request.AdvancePaidOnBehalfAmount,
            CreatedAt = now
        };
    }

    public static PaymentRecord PreserveServerOwnedFields(PaymentRecord existing, PaymentRecord update) =>
        update with
        {
            CustomerId = existing.CustomerId,
            CalculatedNettPrice = existing.CalculatedNettPrice,
            NettPriceVariance = existing.NettPriceVariance,
            NettPriceOverrideReason = existing.NettPriceOverrideReason,
            NettPriceOverrideRequestedBy = existing.NettPriceOverrideRequestedBy,
            NettPriceOverrideRequestedAt = existing.NettPriceOverrideRequestedAt,
            NettPriceOverrideApprovedBy = existing.NettPriceOverrideApprovedBy,
            NettPriceOverrideApprovedAt = existing.NettPriceOverrideApprovedAt,
            FormulaVersion = existing.FormulaVersion,
            FinanceWorkflowVersion = existing.FinanceWorkflowVersion
        };

    public static ValidationResult ValidateSale(FinanceSaleRequest request, PaymentRecord payment)
    {
        var errors = new List<ValidationError>();
        if (request.SalesPrice <= 0) errors.Add(new("finance_sales_price_invalid", "Sales price must be greater than zero."));
        if (request.InterestAdditionalCharges < 0) errors.Add(new("finance_additional_charges_invalid", "Interest and additional charges cannot be negative."));
        if (request.NcdAmount < 0) errors.Add(new("finance_ncd_invalid", "NCD amount cannot be negative."));
        if (request.WindscreenCharges < 0) errors.Add(new("finance_windscreen_invalid", "Windscreen charges cannot be negative."));
        if (string.IsNullOrWhiteSpace(request.SalesAgentUserId)) errors.Add(new("finance_sales_agent_required", "Select the responsible sales agent."));
        if (request.InsurancePaidOnBehalfAmount < 0 || request.RoadTaxPaidOnBehalfAmount < 0 || request.AdvancePaidOnBehalfAmount < 0)
        {
            errors.Add(new("finance_paid_on_behalf_invalid", "Paid-on-behalf amounts cannot be negative."));
        }
        if (payment.CalculatedNettPrice <= 0 || payment.NettPrice <= 0) errors.Add(new("finance_nett_price_invalid", "Calculated and agreed nett prices must be greater than zero."));
        if (payment.NettPriceVariance != 0 && string.IsNullOrWhiteSpace(payment.NettPriceOverrideReason))
        {
            errors.Add(new("finance_nett_variance_reason_required", "Explain why the agreed nett price differs from the calculated amount."));
        }
        if (payment.NettPriceOverrideReason?.Length > 500) errors.Add(new("finance_nett_variance_reason_too_long", "Nett price adjustment reason must be 500 characters or fewer."));
        return new ValidationResult(errors);
    }

    public static bool HasApprovedVariance(PaymentRecord payment) =>
        payment.NettPriceVariance == 0 ||
        !string.IsNullOrWhiteSpace(payment.NettPriceOverrideApprovedBy) && payment.NettPriceOverrideApprovedAt.HasValue;

    public static ValidationResult ValidateVarianceApproval(PaymentRecord payment, string actorUserId)
    {
        var errors = new List<ValidationError>();
        if (payment.FinanceWorkflowVersion != 2) errors.Add(new("finance_v2_required", "This approval is only available for Finance V2 sales."));
        if (payment.NettPriceVariance == 0) errors.Add(new("finance_variance_not_required", "This sale has no nett price adjustment to approve."));
        if (string.Equals(payment.NettPriceOverrideRequestedBy, actorUserId, StringComparison.Ordinal))
        {
            errors.Add(new("finance_variance_self_approval_forbidden", "The person who requested the nett price adjustment cannot approve it."));
        }
        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateInvoiceEligibility(PaymentRecord payment, FinanceInvoice? existingInvoice)
    {
        var errors = new List<ValidationError>();
        if (payment.FinanceWorkflowVersion != 2) errors.Add(new("finance_v2_required", "Invoice generation through this route is only available for Finance V2 sales."));
        if (payment.CustomerId is null) errors.Add(new("finance_buyer_required", "Confirm the buyer before issuing the invoice."));
        if (payment.NettPrice <= 0 || payment.CalculatedNettPrice <= 0) errors.Add(new("finance_nett_price_invalid", "A positive calculated and agreed nett price is required."));
        if (!HasApprovedVariance(payment)) errors.Add(new("finance_variance_approval_required", "Boss/Admin approval is required before issuing an adjusted-price invoice."));
        if (existingInvoice is not null && existingInvoice.PaymentRecordId != payment.Id) errors.Add(new("finance_invoice_conflict", "The existing invoice does not belong to this payment."));
        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateReceivableCreate(Guid vehicleId, IEnumerable<PaymentRecord> existingPayments, Guid? currentPaymentId = null)
    {
        var errors = existingPayments.Any(item => item.VehicleId == vehicleId && item.Id != currentPaymentId)
            ? new[] { new ValidationError("finance_receivable_exists", "A finance receivable already exists for this vehicle.") }
            : [];
        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateReceivableBuyer(Guid? proposedCustomerId, IEnumerable<PaymentRecord> payments)
    {
        var receivableCustomerIds = payments
            .Where(payment => payment.FinanceWorkflowVersion == 2)
            .Select(payment => payment.CustomerId)
            .Distinct()
            .Take(2)
            .ToArray();
        var valid = receivableCustomerIds.Length == 0 ||
            receivableCustomerIds.Length == 1 &&
            receivableCustomerIds[0].HasValue &&
            proposedCustomerId == receivableCustomerIds[0];
        return valid
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError(
                "finance_receivable_buyer_immutable",
                "The confirmed buyer must match the customer stored on the Finance V2 receivable.")]);
    }

    public static ValidationResult ValidateDeliveryInvoiceUpdateBoundary(FinanceInvoice? invoice) =>
        invoice is null
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError(
                "finance_invoice_immutable",
                "This vehicle already has an immutable Finance V2 invoice. Delivery invoice-update requests cannot be opened or closed after issuance.")]);

    public static ValidationResult ValidateInvoiceIssuanceDeliveryState(Guid vehicleId, IEnumerable<DeliverySchedule> deliveries) =>
        deliveries.Any(delivery =>
            delivery.VehicleId == vehicleId &&
            DeliveryWorkboardRules.IsActive(delivery) &&
            DeliveryWorkboardRules.HasOpenInvoiceUpdateRequest(delivery))
            ? new ValidationResult([new ValidationError(
                "finance_invoice_update_open",
                "Resolve or cancel the active Delivery invoice-update request before issuing the immutable Finance V2 invoice.")])
            : new ValidationResult([]);

    public static ValidationResult ValidateCanonicalBuyer(PaymentRecord payment, FinanceInvoice? invoice, Vehicle? vehicle)
    {
        var valid = invoice is not null &&
            vehicle is not null &&
            payment.CustomerId is { } paymentCustomerId &&
            vehicle.CustomerId == paymentCustomerId &&
            invoice.CustomerId == paymentCustomerId &&
            invoice.PaymentRecordId == payment.Id &&
            invoice.VehicleId == payment.VehicleId &&
            vehicle.Id == payment.VehicleId;
        return valid
            ? new ValidationResult([])
            : new ValidationResult([new ValidationError(
                "finance_canonical_buyer_mismatch",
                "The vehicle buyer, receivable customer, and invoice customer must still match before collection activity can continue.")]);
    }

    public static decimal CollectedAmount(IEnumerable<CollectionTransaction> collections) =>
        decimal.Round(collections.Where(item => item.Status == CollectionStatus.Reconciled).Sum(item => item.Amount), 2, MidpointRounding.AwayFromZero);

    public static decimal ActiveAllocatedAmount(IEnumerable<CollectionTransaction> collections) =>
        decimal.Round(collections.Where(item => item.Status != CollectionStatus.Reversed).Sum(item => item.Amount), 2, MidpointRounding.AwayFromZero);

    public static decimal Balance(PaymentRecord payment, IEnumerable<CollectionTransaction> collections) =>
        decimal.Round(Math.Max(0, payment.NettPrice - CollectedAmount(collections)), 2, MidpointRounding.AwayFromZero);

    public static decimal AvailableToAllocate(PaymentRecord payment, IEnumerable<CollectionTransaction> collections) =>
        decimal.Round(Math.Max(0, payment.NettPrice - ActiveAllocatedAmount(collections)), 2, MidpointRounding.AwayFromZero);

    public static ValidationResult ValidateCollectionCreate(
        PaymentRecord payment,
        FinanceInvoice? invoice,
        CreateCollectionRequest request,
        IEnumerable<CollectionTransaction> existingCollections,
        IEnumerable<CollectionTransaction>? referenceCollections = null)
    {
        var paymentCollections = existingCollections.ToList();
        var errors = new List<ValidationError>();
        if (payment.FinanceWorkflowVersion != 2) errors.Add(new("finance_v2_required", "Partial collections are only available for Finance V2 sales."));
        if (invoice is null) errors.Add(new("finance_invoice_required", "Issue the invoice before recording a collection."));
        if (!Enum.IsDefined(typeof(CollectionMethod), request.Method)) errors.Add(new("collection_method_invalid", "Select a valid collection method."));
        if (request.FinancingStatus is { } financingStatus && !Enum.IsDefined(typeof(FinancingStatus), financingStatus))
        {
            errors.Add(new("collection_financing_status_invalid", "Select a valid financing status."));
        }
        if (request.IdempotencyKey == Guid.Empty) errors.Add(new("collection_idempotency_key_invalid", "Collection retry key must be a non-empty UUID."));
        if (request.Method == CollectionMethod.Cash) errors.Add(new("finance_cash_custody_required", "Record cash through Cash Custody so the existing handover and maker-checker controls remain in force."));
        if (request.Amount <= 0) errors.Add(new("collection_amount_invalid", "Collection amount must be greater than zero."));
        if (request.Amount > AvailableToAllocate(payment, paymentCollections)) errors.Add(new("collection_over_allocation", "Collection amount exceeds the remaining amount available to allocate."));
        var normalizedReference = NormalizeReference(request.Reference);
        if (RequiresTraceableReference(request.Method) && normalizedReference is null)
        {
            errors.Add(new("collection_reference_required", "Enter a traceable transaction or supporting document reference before recording this collection."));
        }
        if (normalizedReference is not null && (referenceCollections ?? paymentCollections).Any(item =>
                item.Status != CollectionStatus.Reversed &&
                item.Method == request.Method &&
                string.Equals(item.NormalizedReference ?? NormalizeReference(item.Reference), normalizedReference, StringComparison.Ordinal)))
        {
            errors.Add(new("collection_reference_duplicate", "This collection method and reference are already used by an active collection."));
        }
        if (request.Method == CollectionMethod.BankDisbursement && request.FinancingStatus is not null and not FinancingStatus.Pending)
        {
            errors.Add(new("collection_financing_status_must_start_pending", "A new bank disbursement must start as Pending and progress through the audited approval actions."));
        }
        if (request.Method != CollectionMethod.BankDisbursement && request.FinancingStatus is not null and not FinancingStatus.NotApplicable)
        {
            errors.Add(new("collection_financing_status_invalid", "Financing status only applies to bank disbursement collections."));
        }
        if (request.Reference?.Trim().Length > 200) errors.Add(new("collection_reference_too_long", "Collection reference must be 200 characters or fewer."));
        if (request.Notes?.Trim().Length > 1000) errors.Add(new("collection_notes_too_long", "Collection notes must be 1,000 characters or fewer."));
        return new ValidationResult(errors);
    }

    public static CollectionTransaction CreateCollection(Guid paymentRecordId, CreateCollectionRequest request, string actorUserId, DateTime now) =>
        new()
        {
            PaymentRecordId = paymentRecordId,
            IdempotencyKey = request.IdempotencyKey ?? Guid.NewGuid(),
            IdempotencyFingerprint = CollectionRequestFingerprint(request),
            Amount = decimal.Round(request.Amount, 2, MidpointRounding.AwayFromZero),
            Method = request.Method,
            FinancingStatus = request.Method == CollectionMethod.BankDisbursement
                ? FinancingStatus.Pending
                : FinancingStatus.NotApplicable,
            Reference = string.IsNullOrWhiteSpace(request.Reference) ? null : request.Reference.Trim(),
            NormalizedReference = NormalizeReference(request.Reference),
            ReceivedDate = request.ReceivedDate ?? AutoCountDateRules.SingaporeAccountingDate(now),
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim(),
            CreatedBy = actorUserId,
            CreatedAt = now
        };

    public static string? NormalizeReference(string? reference) =>
        string.IsNullOrWhiteSpace(reference) ? null : reference.Trim().ToUpperInvariant();

    public static bool RequiresTraceableReference(CollectionMethod method) =>
        Enum.IsDefined(typeof(CollectionMethod), method) && method != CollectionMethod.Cash;

    public static string CollectionRequestFingerprint(CreateCollectionRequest request)
    {
        var financingStatus = request.Method == CollectionMethod.BankDisbursement
            ? request.FinancingStatus ?? FinancingStatus.Pending
            : FinancingStatus.NotApplicable;
        var canonical = string.Join('\n',
            decimal.Round(request.Amount, 2, MidpointRounding.AwayFromZero).ToString("0.00", CultureInfo.InvariantCulture),
            ((int)request.Method).ToString(CultureInfo.InvariantCulture),
            NormalizeReference(request.Reference) ?? "<none>",
            request.ReceivedDate?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "<auto>",
            string.IsNullOrWhiteSpace(request.Notes) ? "<none>" : request.Notes.Trim(),
            ((int)financingStatus).ToString(CultureInfo.InvariantCulture));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical)));
    }

    public static bool IsExactCollectionRetry(CollectionTransaction existing, CreateCollectionRequest request) =>
        string.Equals(existing.IdempotencyFingerprint, CollectionRequestFingerprint(request), StringComparison.Ordinal);

    public static long CollectionReferenceLockKey(CollectionMethod method, string normalizedReference)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"finance-collection:{(int)method}:{normalizedReference}"));
        return BinaryPrimitives.ReadInt64LittleEndian(bytes);
    }

    public static ValidationResult ValidateFinancingTransition(CollectionTransaction collection, FinancingStatus target)
    {
        var errors = new List<ValidationError>();
        if (!Enum.IsDefined(typeof(FinancingStatus), target)) errors.Add(new("collection_financing_status_invalid", "Select a valid financing status."));
        if (!Enum.IsDefined(typeof(FinancingStatus), collection.FinancingStatus)) errors.Add(new("collection_financing_status_invalid", "The stored financing status is invalid and requires review."));
        if (!Enum.IsDefined(typeof(CollectionMethod), collection.Method)) errors.Add(new("collection_method_invalid", "The stored collection method is invalid and requires review."));
        if (collection.Status == CollectionStatus.Reversed) errors.Add(new("collection_reversed", "A reversed collection cannot be updated."));
        if (collection.Method != CollectionMethod.BankDisbursement) errors.Add(new("collection_financing_not_applicable", "Financing status only applies to bank disbursement collections."));
        var valid = target == collection.FinancingStatus ||
            collection.FinancingStatus == FinancingStatus.Pending && target == FinancingStatus.Approved ||
            collection.FinancingStatus == FinancingStatus.Approved && target == FinancingStatus.Disbursed;
        if (!valid) errors.Add(new("collection_financing_transition_invalid", "Financing status must progress from Pending to Approved to Disbursed."));
        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateReconcile(CollectionTransaction collection, string actorUserId, bool hasLinkedEvidence)
    {
        var errors = new List<ValidationError>();
        if (!Enum.IsDefined(typeof(CollectionMethod), collection.Method)) errors.Add(new("collection_method_invalid", "The stored collection method is invalid and requires review."));
        if (!Enum.IsDefined(typeof(FinancingStatus), collection.FinancingStatus)) errors.Add(new("collection_financing_status_invalid", "The stored financing status is invalid and requires review."));
        if (collection.Status == CollectionStatus.Reversed) errors.Add(new("collection_reversed", "A reversed collection cannot be reconciled."));
        if (string.Equals(collection.CreatedBy, actorUserId, StringComparison.Ordinal))
        {
            errors.Add(new("collection_reconcile_self_approval_forbidden", "The staff member who recorded this collection cannot reconcile it."));
        }
        if (RequiresTraceableReference(collection.Method) && NormalizeReference(collection.Reference) is null)
        {
            errors.Add(new("collection_reference_required", "A traceable transaction or supporting document reference is required before reconciliation."));
        }
        if (!hasLinkedEvidence)
        {
            errors.Add(new("collection_evidence_required", "Upload a Payment Receipt or Payment Invoice linked to this collection before reconciliation."));
        }
        if (collection.Method == CollectionMethod.BankDisbursement && collection.FinancingStatus != FinancingStatus.Disbursed)
        {
            errors.Add(new("collection_not_disbursed", "Bank financing must be disbursed before the collection can be reconciled."));
        }
        return new ValidationResult(errors);
    }

    public static ValidationResult ValidateReverse(CollectionTransaction collection, string? reason)
    {
        var errors = new List<ValidationError>();
        if (collection.Status == CollectionStatus.Reversed) errors.Add(new("collection_already_reversed", "This collection is already reversed."));
        if (string.IsNullOrWhiteSpace(reason)) errors.Add(new("collection_reversal_reason_required", "A reversal reason is required."));
        if (reason?.Trim().Length > 500) errors.Add(new("collection_reversal_reason_too_long", "Reversal reason must be 500 characters or fewer."));
        return new ValidationResult(errors);
    }

    public static PaymentStatus DerivePaymentStatus(PaymentRecord payment, IEnumerable<CollectionTransaction> collections)
    {
        var active = collections.Where(item => item.Status != CollectionStatus.Reversed).ToList();
        if (CollectedAmount(active) >= payment.NettPrice) return PaymentStatus.Reconciled;
        if (active.Any(item => item.FinancingStatus == FinancingStatus.Disbursed)) return PaymentStatus.Disbursed;
        if (active.Any(item => item.FinancingStatus == FinancingStatus.Approved)) return PaymentStatus.Approved;
        return PaymentStatus.Pending;
    }

    public static ReceivableStatus DeriveReceivableStatus(PaymentRecord payment, FinanceInvoice? invoice, IEnumerable<CollectionTransaction> collections)
    {
        if (payment.FinanceWorkflowVersion != 2) return payment.Status == PaymentStatus.Reconciled ? ReceivableStatus.Paid : ReceivableStatus.Draft;
        if (invoice is null) return HasApprovedVariance(payment) ? ReceivableStatus.Draft : ReceivableStatus.WaitingForApproval;
        if (ActiveAllocatedAmount(collections) > payment.NettPrice) return ReceivableStatus.AttentionNeeded;
        if (Balance(payment, collections) == 0) return ReceivableStatus.Paid;
        if (CollectedAmount(collections) > 0) return ReceivableStatus.PartiallyPaid;
        return ReceivableStatus.ReadyToCollect;
    }

    public static bool IsReceivableSettled(PaymentRecord payment, FinanceInvoice? invoice, IEnumerable<CollectionTransaction> collections) =>
        payment.FinanceWorkflowVersion == 2 &&
        invoice is not null &&
        HasApprovedVariance(payment) &&
        payment.NettPrice > 0 &&
        Balance(payment, collections) == 0;
}
