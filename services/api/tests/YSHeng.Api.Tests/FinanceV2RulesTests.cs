using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class FinanceV2RulesTests
{
    [Fact]
    public void Nett_price_formula_is_server_owned_and_rounded_to_two_decimals()
    {
        Assert.Equal(50_600.13m, FinanceV2Rules.CalculateNettPrice(50_000.125m, 1_000.004m, 500m, 100m));
    }

    [Fact]
    public void Variance_requires_reason_and_requester_cannot_approve_their_own_adjustment()
    {
        var request = new FinanceSaleRequest(Guid.NewGuid(), 50_000m, 1_000m, 500m, 100m, 50_500m, null);
        var vehicle = new Vehicle { Id = request.VehicleId, SellingPrice = 50_000m, BossConfirmed = true };
        var payment = FinanceV2Rules.CreatePayment(request, vehicle, Guid.NewGuid(), "finance-1", DateTime.UtcNow);

        Assert.Contains(FinanceV2Rules.ValidateSale(request, payment, vehicle).Errors, error => error.Code == "finance_nett_variance_reason_required");
        Assert.Contains(FinanceV2Rules.ValidateVarianceApproval(payment, "finance-1").Errors, error => error.Code == "finance_variance_self_approval_forbidden");
        Assert.Contains(FinanceV2Rules.ValidateVarianceApproval(payment, "boss-2").Errors, error => error.Code == "finance_nett_variance_reason_required");

        var reasoned = FinanceV2Rules.CreatePayment(
            request with { NettPriceOverrideReason = "Approved negotiated total" },
            vehicle,
            Guid.NewGuid(),
            "finance-1",
            DateTime.UtcNow);
        Assert.True(FinanceV2Rules.ValidateVarianceApproval(reasoned, "boss-2").IsValid);
    }

    [Fact]
    public void Finance_sale_uses_the_locked_vehicle_price_and_rejects_a_lower_submitted_price()
    {
        var vehicle = new Vehicle { Id = Guid.NewGuid(), SellingPrice = 15_000m, BossConfirmed = true };
        var request = new FinanceSaleRequest(vehicle.Id, 10_000m, 0, 0, 0, null, null, "sales-1");

        var payment = FinanceV2Rules.CreatePayment(request, vehicle, Guid.NewGuid(), "finance-1", DateTime.UtcNow);
        var validation = FinanceV2Rules.ValidateSale(request, payment, vehicle);

        Assert.Equal(15_000m, payment.SalesPrice);
        Assert.Equal(15_000m, payment.NettPrice);
        Assert.Contains(validation.Errors, error => error.Code == "finance_sales_price_mismatch");
    }

    [Fact]
    public void Finance_sale_rejects_an_unapproved_vehicle()
    {
        var vehicle = new Vehicle { Id = Guid.NewGuid(), SellingPrice = 15_000m, BossConfirmed = false };
        var request = new FinanceSaleRequest(vehicle.Id, 15_000m, 0, 0, 0, null, null, "sales-1");
        var payment = FinanceV2Rules.CreatePayment(request, vehicle, Guid.NewGuid(), "finance-1", DateTime.UtcNow);

        Assert.Contains(
            FinanceV2Rules.ValidateSale(request, payment, vehicle).Errors,
            error => error.Code == "finance_vehicle_not_approved");
    }

    [Fact]
    public void Invoice_issuance_rechecks_approval_and_the_current_vehicle_price()
    {
        var payment = V2Payment(15_000m);
        var vehicle = new Vehicle { Id = payment.VehicleId, SellingPrice = 15_000m, BossConfirmed = true };

        Assert.True(FinanceV2Rules.ValidateCanonicalVehicleForInvoice(payment, vehicle).IsValid);
        Assert.Contains(
            FinanceV2Rules.ValidateCanonicalVehicleForInvoice(payment, vehicle with { BossConfirmed = false }).Errors,
            error => error.Code == "finance_vehicle_not_approved");
        Assert.Contains(
            FinanceV2Rules.ValidateCanonicalVehicleForInvoice(payment, vehicle with { SellingPrice = 10_000m }).Errors,
            error => error.Code == "finance_sales_price_changed");
    }

    [Fact]
    public void Positive_ncd_requires_reason_and_distinct_maker_checker_approval()
    {
        var vehicle = new Vehicle { Id = Guid.NewGuid(), SellingPrice = 15_000m, BossConfirmed = true };
        var request = new FinanceSaleRequest(vehicle.Id, 15_000m, 0, 500m, 0, null, null, "sales-1");
        var payment = FinanceV2Rules.CreatePayment(request, vehicle, Guid.NewGuid(), "finance-1", DateTime.UtcNow);

        Assert.Equal(0m, payment.NettPriceVariance);
        Assert.True(FinanceV2Rules.RequiresNettPriceApproval(payment));
        Assert.Contains(
            FinanceV2Rules.ValidateSale(request, payment, vehicle).Errors,
            error => error.Code == "finance_nett_variance_reason_required");
        Assert.Contains(
            FinanceV2Rules.ValidateVarianceApproval(payment, "finance-1").Errors,
            error => error.Code == "finance_variance_self_approval_forbidden");
        Assert.Contains(
            FinanceV2Rules.ValidateInvoiceEligibility(payment, null).Errors,
            error => error.Code == "finance_variance_approval_required");

        var reasoned = FinanceV2Rules.CreatePayment(
            request with { NettPriceOverrideReason = "Customer NCD entitlement verified" },
            vehicle,
            Guid.NewGuid(),
            "finance-1",
            DateTime.UtcNow);
        var approved = reasoned with { NettPriceOverrideApprovedBy = "boss-2", NettPriceOverrideApprovedAt = DateTime.UtcNow };
        Assert.True(FinanceV2Rules.ValidateVarianceApproval(reasoned, "boss-2").IsValid);
        Assert.True(FinanceV2Rules.ValidateSale(request with { NettPriceOverrideReason = "Customer NCD entitlement verified" }, reasoned, vehicle).IsValid);
        Assert.True(FinanceV2Rules.ValidateInvoiceEligibility(approved, null).IsValid);
    }

    [Fact]
    public void Existing_positive_ncd_invoice_cannot_create_or_reconcile_collections_without_approval()
    {
        var payment = V2Payment(14_500m) with { SalesPrice = 15_000m, NcdAmount = 500m };
        var invoice = InvoiceFor(payment);
        var request = new CreateCollectionRequest(14_500m, CollectionMethod.BankTransfer, "BANK-15", null, null, null);
        var collection = CollectionFor(payment, 14_500m, CollectionStatus.Pending, "BANK-15") with { CreatedBy = "finance-1" };

        Assert.Contains(
            FinanceV2Rules.ValidateCollectionCreate(payment, invoice, request, []).Errors,
            error => error.Code == "finance_variance_approval_required");
        Assert.Contains(
            FinanceV2Rules.ValidateReconcile(payment, collection, "finance-2", hasLinkedEvidence: true).Errors,
            error => error.Code == "finance_variance_approval_required");
        Assert.Contains(
            FinanceV2Rules.ValidateVarianceApproval(payment, "boss-1").Errors,
            error => error.Code == "finance_variance_request_metadata_required");

        var approved = payment with
        {
            NettPriceOverrideReason = "Historical NCD entitlement verified",
            NettPriceOverrideRequestedBy = "finance-1",
            NettPriceOverrideRequestedAt = DateTime.UtcNow.AddMinutes(-1),
            NettPriceOverrideApprovedBy = "boss-1",
            NettPriceOverrideApprovedAt = DateTime.UtcNow
        };
        Assert.True(FinanceV2Rules.ValidateCollectionCreate(approved, invoice, request, []).IsValid);
        Assert.True(FinanceV2Rules.ValidateReconcile(approved, collection, "finance-2", hasLinkedEvidence: true).IsValid);
    }

    [Fact]
    public void Legacy_receivable_cannot_start_below_approved_price_and_terms_are_immutable_after_creation()
    {
        var vehicle = new Vehicle { Id = Guid.NewGuid(), SellingPrice = 15_000m, BossConfirmed = true };
        var lower = new PaymentRecord { VehicleId = vehicle.Id, NettPrice = 10_000m };
        var canonical = new PaymentRecord { VehicleId = vehicle.Id, NettPrice = 15_000m };

        Assert.Contains(
            FinanceRules.ValidateLegacyReceivableCreate(lower, vehicle).Errors,
            error => error.Code == "finance_legacy_nett_price_mismatch");
        Assert.Contains(
            FinanceRules.ValidateLegacyReceivableCreate(canonical with { NettPrice = 20_000m }, vehicle).Errors,
            error => error.Code == "finance_legacy_nett_price_mismatch");
        Assert.Contains(
            FinanceRules.ValidateLegacyReceivableCreate(canonical, vehicle with { BossConfirmed = false }).Errors,
            error => error.Code == "finance_vehicle_not_approved");
        Assert.Contains(
            FinanceRules.ValidateLegacyReceivableCreate(canonical with { NcdAmount = 500m }, vehicle).Errors,
            error => error.Code == "finance_legacy_price_components_require_v2");
        Assert.Equal(15_000m, FinanceRules.ApplyLegacyCanonicalSalesPrice(lower, vehicle).SalesPrice);
        Assert.Contains(
            FinanceRules.ValidateLegacyPricingUpdate(canonical, canonical with { NettPrice = 10_000m }).Errors,
            error => error.Code == "finance_legacy_price_immutable");
        Assert.True(FinanceRules.ValidateLegacyPricingUpdate(canonical, canonical with { InvoiceNumber = "INV-1" }).IsValid);
    }

    [Fact]
    public void Pending_allocations_reserve_capacity_but_only_reconciled_collections_reduce_balance()
    {
        var payment = V2Payment(100m);
        var invoice = InvoiceFor(payment);
        var pending = CollectionFor(payment, 40m, CollectionStatus.Pending, "DEP-1");

        Assert.Equal(0m, FinanceV2Rules.CollectedAmount([pending]));
        Assert.Equal(100m, FinanceV2Rules.Balance(payment, [pending]));
        Assert.Equal(60m, FinanceV2Rules.AvailableToAllocate(payment, [pending]));
        Assert.Equal(ReceivableStatus.ReadyToCollect, FinanceV2Rules.DeriveReceivableStatus(payment, invoice, [pending]));

        var overAllocation = new CreateCollectionRequest(61m, CollectionMethod.BankTransfer, "NEXT", null, null, null);
        Assert.Contains(FinanceV2Rules.ValidateCollectionCreate(payment, invoice, overAllocation, [pending]).Errors, error => error.Code == "collection_over_allocation");

        var reconciled = pending with { Status = CollectionStatus.Reconciled };
        Assert.Equal(40m, FinanceV2Rules.CollectedAmount([reconciled]));
        Assert.Equal(60m, FinanceV2Rules.Balance(payment, [reconciled]));
        Assert.Equal(ReceivableStatus.PartiallyPaid, FinanceV2Rules.DeriveReceivableStatus(payment, invoice, [reconciled]));
    }

    [Fact]
    public void Duplicate_active_reference_is_case_insensitive_and_reversed_reference_can_be_reused()
    {
        var payment = V2Payment(100m);
        var invoice = InvoiceFor(payment);
        var existing = CollectionFor(payment, 10m, CollectionStatus.Pending, " bank-123 ");
        var request = new CreateCollectionRequest(10m, CollectionMethod.BankTransfer, "BANK-123", null, null, null);

        Assert.Contains(FinanceV2Rules.ValidateCollectionCreate(payment, invoice, request, [existing]).Errors, error => error.Code == "collection_reference_duplicate");
        Assert.True(FinanceV2Rules.ValidateCollectionCreate(payment, invoice, request, [existing with { Status = CollectionStatus.Reversed }]).IsValid);
    }

    [Fact]
    public void Active_method_and_reference_are_unique_across_receivables_but_other_methods_can_reuse_the_reference()
    {
        var payment = V2Payment(100m);
        var invoice = InvoiceFor(payment);
        var otherPayment = V2Payment(100m);
        var activeElsewhere = CollectionFor(otherPayment, 10m, CollectionStatus.Pending, " transfer-77 ");
        var duplicate = new CreateCollectionRequest(10m, CollectionMethod.BankTransfer, "TRANSFER-77", null, null, null);
        var differentMethod = duplicate with { Method = CollectionMethod.Cheque };

        Assert.Contains(
            FinanceV2Rules.ValidateCollectionCreate(payment, invoice, duplicate, [], [activeElsewhere]).Errors,
            error => error.Code == "collection_reference_duplicate");
        Assert.True(FinanceV2Rules.ValidateCollectionCreate(payment, invoice, differentMethod, [], [activeElsewhere]).IsValid);
    }

    [Fact]
    public void Collection_retry_key_and_canonical_fingerprint_make_exact_retries_safe()
    {
        var payment = V2Payment(100m);
        var key = Guid.NewGuid();
        var request = new CreateCollectionRequest(10m, CollectionMethod.BankTransfer, " bank-123 ", null, " Proof checked ", null, key);

        var collection = FinanceV2Rules.CreateCollection(payment.Id, request, "finance-1", new DateTime(2026, 8, 27, 1, 0, 0, DateTimeKind.Utc));

        Assert.Equal(key, collection.IdempotencyKey);
        Assert.Equal("BANK-123", collection.NormalizedReference);
        Assert.True(FinanceV2Rules.IsExactCollectionRetry(collection, request with { Reference = "BANK-123", Notes = "Proof checked" }));
        Assert.False(FinanceV2Rules.IsExactCollectionRetry(collection, request with { Amount = 11m }));
    }

    [Fact]
    public void Noncash_collections_require_reference_and_bank_disbursement_always_starts_pending()
    {
        var payment = V2Payment(100m);
        var invoice = InvoiceFor(payment);
        var elevatedBankStatus = new CreateCollectionRequest(10m, CollectionMethod.BankDisbursement, "BANK-88", null, null, FinancingStatus.Approved);

        foreach (var method in Enum.GetValues<CollectionMethod>().Where(method => method != CollectionMethod.Cash))
        {
            var missingReference = new CreateCollectionRequest(10m, method, null, null, null, null);
            Assert.Contains(FinanceV2Rules.ValidateCollectionCreate(payment, invoice, missingReference, []).Errors, error => error.Code == "collection_reference_required");
        }
        Assert.Contains(FinanceV2Rules.ValidateCollectionCreate(payment, invoice, elevatedBankStatus, []).Errors, error => error.Code == "collection_financing_status_must_start_pending");
        Assert.Equal(
            FinancingStatus.Pending,
            FinanceV2Rules.CreateCollection(payment.Id, elevatedBankStatus, "finance-1", DateTime.UtcNow).FinancingStatus);
    }

    [Fact]
    public void Collection_enums_are_validated_before_persistence_or_transition()
    {
        var payment = V2Payment(100m);
        var invoice = InvoiceFor(payment);
        var request = new CreateCollectionRequest(10m, (CollectionMethod)999, "BAD-1", null, null, (FinancingStatus)999);
        var collection = CollectionFor(payment, 10m, CollectionStatus.Pending, "BANK-1");

        var createValidation = FinanceV2Rules.ValidateCollectionCreate(payment, invoice, request, []);
        Assert.Contains(createValidation.Errors, error => error.Code == "collection_method_invalid");
        Assert.Contains(createValidation.Errors, error => error.Code == "collection_financing_status_invalid");
        Assert.Contains(
            FinanceV2Rules.ValidateFinancingTransition(collection, (FinancingStatus)999).Errors,
            error => error.Code == "collection_financing_status_invalid");
    }

    [Fact]
    public void Collection_recorder_cannot_reconcile_their_own_entry()
    {
        var payment = V2Payment(100m);
        var collection = CollectionFor(payment, 10m, CollectionStatus.Pending, "BANK-1") with { CreatedBy = "finance-1" };

        Assert.Contains(
            FinanceV2Rules.ValidateReconcile(payment, collection, "finance-1", hasLinkedEvidence: true).Errors,
            error => error.Code == "collection_reconcile_self_approval_forbidden");
        Assert.True(FinanceV2Rules.ValidateReconcile(payment, collection, "finance-2", hasLinkedEvidence: true).IsValid);
        Assert.Contains(
            FinanceV2Rules.ValidateReconcile(payment, collection, "finance-2", hasLinkedEvidence: false).Errors,
            error => error.Code == "collection_evidence_required");
    }

    [Fact]
    public void Collection_activity_requires_the_same_buyer_on_vehicle_receivable_and_invoice()
    {
        var payment = V2Payment(100m);
        var invoice = InvoiceFor(payment);
        var vehicle = new Vehicle { Id = payment.VehicleId, CustomerId = payment.CustomerId };

        Assert.True(FinanceV2Rules.ValidateCanonicalBuyer(payment, invoice, vehicle).IsValid);
        Assert.Contains(
            FinanceV2Rules.ValidateCanonicalBuyer(payment, invoice with { CustomerId = Guid.NewGuid() }, vehicle).Errors,
            error => error.Code == "finance_canonical_buyer_mismatch");
    }

    [Fact]
    public void Finance_v2_receivable_customer_allows_safe_repair_but_rejects_another_buyer()
    {
        var receivableCustomerId = Guid.NewGuid();
        var receivable = new PaymentRecord { CustomerId = receivableCustomerId, FinanceWorkflowVersion = 2 };
        var legacyPayment = new PaymentRecord { CustomerId = Guid.NewGuid(), FinanceWorkflowVersion = 1 };

        Assert.True(FinanceV2Rules.ValidateReceivableBuyer(Guid.NewGuid(), []).IsValid);
        Assert.True(FinanceV2Rules.ValidateReceivableBuyer(Guid.NewGuid(), [legacyPayment]).IsValid);
        Assert.True(FinanceV2Rules.ValidateReceivableBuyer(receivableCustomerId, [receivable]).IsValid);
        Assert.Contains(
            FinanceV2Rules.ValidateReceivableBuyer(Guid.NewGuid(), [receivable]).Errors,
            error => error.Code == "finance_receivable_buyer_immutable");
        Assert.Contains(
            FinanceV2Rules.ValidateReceivableBuyer(null, [receivable]).Errors,
            error => error.Code == "finance_receivable_buyer_immutable");
    }

    [Fact]
    public void Immutable_invoice_blocks_delivery_update_requests_and_open_requests_block_issuance()
    {
        var vehicleId = Guid.NewGuid();
        var requestedAt = DateTime.UtcNow;
        var activeOpenRequest = new DeliverySchedule
        {
            VehicleId = vehicleId,
            Status = DeliveryStatus.BookingInspection,
            InvoiceUpdateRequestedAt = requestedAt
        };
        var resolvedRequest = activeOpenRequest with { InvoiceUpdateResolvedAt = requestedAt.AddMinutes(1) };
        var releasedOpenRequest = activeOpenRequest with { Status = DeliveryStatus.Released };
        var otherVehicleOpenRequest = activeOpenRequest with { VehicleId = Guid.NewGuid() };

        Assert.True(FinanceV2Rules.ValidateDeliveryInvoiceUpdateBoundary(null).IsValid);
        Assert.Contains(
            FinanceV2Rules.ValidateDeliveryInvoiceUpdateBoundary(new FinanceInvoice { VehicleId = vehicleId }).Errors,
            error => error.Code == "finance_invoice_immutable");
        Assert.Contains(
            FinanceV2Rules.ValidateInvoiceIssuanceDeliveryState(vehicleId, [activeOpenRequest]).Errors,
            error => error.Code == "finance_invoice_update_open");
        Assert.True(FinanceV2Rules.ValidateInvoiceIssuanceDeliveryState(vehicleId, [resolvedRequest]).IsValid);
        Assert.True(FinanceV2Rules.ValidateInvoiceIssuanceDeliveryState(vehicleId, [releasedOpenRequest]).IsValid);
        Assert.True(FinanceV2Rules.ValidateInvoiceIssuanceDeliveryState(vehicleId, [otherVehicleOpenRequest]).IsValid);
    }

    [Fact]
    public void Legacy_update_cannot_forge_server_owned_finance_v2_fields()
    {
        var createdAt = DateTime.UtcNow.AddDays(-2);
        var approvedAt = DateTime.UtcNow.AddDays(-1);
        var existing = new PaymentRecord
        {
            CustomerId = Guid.NewGuid(),
            NettPrice = 100m,
            CalculatedNettPrice = 90m,
            NettPriceVariance = 10m,
            NettPriceOverrideReason = "Stored reason",
            NettPriceOverrideRequestedBy = "finance-1",
            NettPriceOverrideRequestedAt = createdAt,
            NettPriceOverrideApprovedBy = "boss-1",
            NettPriceOverrideApprovedAt = approvedAt,
            FormulaVersion = "legacy-stored",
            FinanceWorkflowVersion = 1
        };
        var forged = existing with
        {
            CustomerId = Guid.NewGuid(),
            NettPrice = 125m,
            CalculatedNettPrice = 125m,
            NettPriceVariance = 0,
            NettPriceOverrideReason = "Forged",
            NettPriceOverrideRequestedBy = "attacker",
            NettPriceOverrideRequestedAt = DateTime.UtcNow,
            NettPriceOverrideApprovedBy = "attacker",
            NettPriceOverrideApprovedAt = DateTime.UtcNow,
            FormulaVersion = FinanceV2Rules.FormulaVersion,
            FinanceWorkflowVersion = 2
        };

        var preserved = FinanceV2Rules.PreserveServerOwnedFields(existing, forged);

        Assert.Equal(existing.CustomerId, preserved.CustomerId);
        Assert.Equal(existing.CalculatedNettPrice, preserved.CalculatedNettPrice);
        Assert.Equal(existing.NettPriceVariance, preserved.NettPriceVariance);
        Assert.Equal(existing.NettPriceOverrideReason, preserved.NettPriceOverrideReason);
        Assert.Equal(existing.NettPriceOverrideRequestedBy, preserved.NettPriceOverrideRequestedBy);
        Assert.Equal(existing.NettPriceOverrideRequestedAt, preserved.NettPriceOverrideRequestedAt);
        Assert.Equal(existing.NettPriceOverrideApprovedBy, preserved.NettPriceOverrideApprovedBy);
        Assert.Equal(existing.NettPriceOverrideApprovedAt, preserved.NettPriceOverrideApprovedAt);
        Assert.Equal(existing.FormulaVersion, preserved.FormulaVersion);
        Assert.Equal(existing.FinanceWorkflowVersion, preserved.FinanceWorkflowVersion);
        Assert.Equal(forged.NettPrice, preserved.NettPrice);
    }

    [Fact]
    public void Finance_vehicle_options_expose_invoice_defaults_without_purchase_values()
    {
        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(),
            PlateNumber = "VPK1234",
            Make = "Toyota",
            Model = "Vios",
            Status = VehicleStatus.Available,
            CustomerId = Guid.NewGuid(),
            SellingPrice = 58_000m,
            AdditionalCharges = 750m,
            PurchasePrice = 40_000m
        };

        var option = FinanceVehicleOptions.ToResponse(vehicle);

        Assert.Equal(vehicle.Id, option.Id);
        Assert.Equal(vehicle.PlateNumber, option.PlateNumber);
        Assert.Equal(vehicle.CustomerId, option.CustomerId);
        Assert.Equal(vehicle.SellingPrice, option.SellingPrice);
        Assert.Equal(vehicle.AdditionalCharges, option.AdditionalCharges);
    }

    [Fact]
    public void A_vehicle_can_have_only_one_receivable_across_legacy_and_v2()
    {
        var vehicleId = Guid.NewGuid();
        var legacy = new PaymentRecord { VehicleId = vehicleId, FinanceWorkflowVersion = 1, NettPrice = 100m };

        Assert.Contains(
            FinanceV2Rules.ValidateReceivableCreate(vehicleId, [legacy]).Errors,
            error => error.Code == "finance_receivable_exists");
        Assert.True(FinanceV2Rules.ValidateReceivableCreate(vehicleId, [legacy], legacy.Id).IsValid);
    }

    [Fact]
    public void Full_reconciled_balance_settles_v2_receivable_and_reversal_reopens_it()
    {
        var payment = V2Payment(100m);
        var invoice = InvoiceFor(payment);
        var paid = CollectionFor(payment, 100m, CollectionStatus.Reconciled, "FULL");

        Assert.Equal(PaymentStatus.Reconciled, FinanceV2Rules.DerivePaymentStatus(payment, [paid]));
        Assert.Equal(ReceivableStatus.Paid, FinanceV2Rules.DeriveReceivableStatus(payment, invoice, [paid]));
        Assert.True(FinanceV2Rules.IsReceivableSettled(payment, invoice, [paid]));

        var reversed = paid with { Status = CollectionStatus.Reversed, ReversalReason = "Bank reversal" };
        Assert.Equal(100m, FinanceV2Rules.Balance(payment, [reversed]));
        var reopenedPayment = payment with { Status = FinanceV2Rules.DerivePaymentStatus(payment, [reversed]) };
        Assert.Equal(PaymentStatus.Pending, reopenedPayment.Status);
        Assert.False(FinanceV2Rules.IsReceivableSettled(payment, invoice, [reversed]));
        var soldVehicle = new Vehicle { Id = payment.VehicleId, Status = VehicleStatus.Sold, SoldAt = DateTime.UtcNow };
        var reopenedVehicle = WorkflowStatusRules.ApplyWorkflowStatus(soldVehicle, [], [reopenedPayment]);
        Assert.Equal(VehicleStatus.Available, reopenedVehicle.Status);
        Assert.Equal(soldVehicle.SoldAt, reopenedVehicle.SoldAt);
    }

    [Fact]
    public void Dashboard_uses_reconciled_v2_balance_and_preserves_legacy_outstanding_behavior()
    {
        var v2 = V2Payment(100m);
        var legacyOpen = new PaymentRecord { VehicleId = Guid.NewGuid(), NettPrice = 50m, Status = PaymentStatus.Pending };
        var legacyPaid = new PaymentRecord { VehicleId = Guid.NewGuid(), NettPrice = 75m, Status = PaymentStatus.Reconciled };
        var reconciled = CollectionFor(v2, 40m, CollectionStatus.Reconciled, "REC");
        var pending = CollectionFor(v2, 20m, CollectionStatus.Pending, "PENDING");

        var summary = DashboardMetrics.Create([], [], [], [v2, legacyOpen, legacyPaid], [], [], [], [], [], [], [], [], new DateOnly(2026, 8, 27), collections: [reconciled, pending]);

        Assert.Equal(110m, summary.OutstandingPayment);
        Assert.Equal(110m, summary.OutstandingCollection);

        var reversedSummary = DashboardMetrics.Create([], [], [], [v2], [], [], [], [], [], [], [], [], new DateOnly(2026, 8, 27), collections: [reconciled with { Status = CollectionStatus.Reversed }]);
        Assert.Equal(100m, reversedSummary.OutstandingPayment);
    }

    [Fact]
    public void V2_receivable_settlement_requires_invoice_and_approved_adjustment()
    {
        var adjusted = V2Payment(100m) with
        {
            CalculatedNettPrice = 110m,
            NettPriceVariance = -10m,
            NettPriceOverrideReason = "Agreed discount",
            NettPriceOverrideRequestedBy = "finance-1",
            NettPriceOverrideRequestedAt = DateTime.UtcNow.AddMinutes(-1)
        };
        var paid = CollectionFor(adjusted, 100m, CollectionStatus.Reconciled, "PAID");
        Assert.False(FinanceV2Rules.IsReceivableSettled(adjusted, InvoiceFor(adjusted), [paid]));
        Assert.True(FinanceV2Rules.IsReceivableSettled(adjusted with { NettPriceOverrideApprovedBy = "boss-2", NettPriceOverrideApprovedAt = DateTime.UtcNow }, InvoiceFor(adjusted), [paid]));

        var vehicle = new Vehicle { Id = adjusted.VehicleId, Status = VehicleStatus.Available };
        var legacy = new PaymentRecord { VehicleId = vehicle.Id, NettPrice = 100m, Status = PaymentStatus.Reconciled };
        Assert.Equal(VehicleStatus.Available, WorkflowStatusRules.ApplyWorkflowStatus(vehicle, [], [legacy]).Status);
        var releasedDelivery = new DeliverySchedule { VehicleId = vehicle.Id, Status = DeliveryStatus.Released };
        Assert.Equal(VehicleStatus.Sold, WorkflowStatusRules.ApplyWorkflowStatus(vehicle, [], [legacy], [releasedDelivery]).Status);
    }

    [Fact]
    public void Invoice_factory_uses_expected_number_and_captures_immutable_display_values()
    {
        var payment = V2Payment(50_600m);
        var vehicle = new Vehicle { Id = payment.VehicleId, PlateNumber = "ABC1234", Make = "Toyota", Model = "Vios", Year = 2022, CustomerId = payment.CustomerId };
        var customer = new Customer { Id = payment.CustomerId!.Value, Name = "Ali", Phone = "0123", Address = "KL" };
        var now = new DateTime(2026, 8, 27, 1, 2, 3, DateTimeKind.Utc);

        var invoice = FinanceInvoiceFactory.Create(payment, vehicle, customer, FinanceInvoiceFactory.NumberFor(now, 42), "finance-1", now);

        Assert.Equal("YSH-INV-2026-000042", invoice.InvoiceNumber);
        Assert.Equal("Ali", invoice.CustomerName);
        Assert.Equal("ABC1234", invoice.VehiclePlateNumber);
        Assert.StartsWith("%PDF-", System.Text.Encoding.ASCII.GetString(invoice.Content));
    }

    [Fact]
    public void V2_cash_is_rejected_from_both_generic_collection_and_legacy_cash_custody()
    {
        var payment = V2Payment(100m);
        var invoice = InvoiceFor(payment);
        var request = new CreateCollectionRequest(100m, CollectionMethod.Cash, null, null, null, null);
        Assert.Contains(FinanceV2Rules.ValidateCollectionCreate(payment, invoice, request, []).Errors, error => error.Code == "finance_cash_custody_required");

        var vehicle = new Vehicle { Id = payment.VehicleId, CustomerId = payment.CustomerId };
        Assert.Contains(CashCustodyRules.ValidateCreate(new CashHandoverCreateRequest(payment.Id, 100m, null), payment, vehicle).Errors, error => error.Code == "finance_v2_cash_not_supported");
    }

    private static PaymentRecord V2Payment(decimal amount) => new()
    {
        VehicleId = Guid.NewGuid(),
        CustomerId = Guid.NewGuid(),
        NettPrice = amount,
        CalculatedNettPrice = amount,
        FormulaVersion = FinanceV2Rules.FormulaVersion,
        FinanceWorkflowVersion = 2,
        SalesPrice = amount
    };

    private static FinanceInvoice InvoiceFor(PaymentRecord payment) => new()
    {
        PaymentRecordId = payment.Id,
        VehicleId = payment.VehicleId,
        CustomerId = payment.CustomerId!.Value,
        InvoiceNumber = "YSH-INV-2026-000001",
        Amount = payment.NettPrice
    };

    private static CollectionTransaction CollectionFor(PaymentRecord payment, decimal amount, CollectionStatus status, string reference) => new()
    {
        PaymentRecordId = payment.Id,
        Amount = amount,
        Method = CollectionMethod.BankTransfer,
        Status = status,
        Reference = reference
    };
}
