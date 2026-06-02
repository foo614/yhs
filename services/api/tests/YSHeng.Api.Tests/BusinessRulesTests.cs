using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class BusinessRulesTests
{
    [Fact]
    public void Security_headers_apply_defensive_api_defaults()
    {
        var headers = new HeaderDictionary();

        SecurityHeaders.Apply(headers);

        Assert.Equal("nosniff", headers["X-Content-Type-Options"]);
        Assert.Equal("DENY", headers["X-Frame-Options"]);
        Assert.Equal("no-referrer", headers["Referrer-Policy"]);
        Assert.Equal("camera=(), microphone=(), geolocation=()", headers["Permissions-Policy"]);
    }

    [Fact]
    public void Public_inventory_only_includes_visible_available_vehicles()
    {
        var vehicles = new[]
        {
            VehicleSeed.Available(publicVisible: true),
            VehicleSeed.Available(publicVisible: false),
            VehicleSeed.Sold(publicVisible: true),
            VehicleSeed.LoanProcessing(publicVisible: true)
        };

        var result = PublicInventory.Filter(vehicles).ToList();

        Assert.Single(result);
        Assert.Equal(VehicleStatus.Available, result[0].Status);
        Assert.True(result[0].IsPublic);
    }

    [Fact]
    public void Public_vehicle_response_excludes_internal_pricing_fields()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            PurchasePrice = 42000m,
            AdditionalCharges = 600m,
            RefurbishmentTotal = 3500m,
            CommissionTotal = 1200m,
            SellingPrice = 58000m
        };

        var result = PublicInventory.ToResponse(vehicle);

        Assert.Equal(vehicle.Id, result.Id);
        Assert.Equal(vehicle.PlateNumber, result.PlateNumber);
        Assert.Equal(vehicle.SellingPrice, result.SellingPrice);
        Assert.DoesNotContain(result.GetType().GetProperties(), property => property.Name is "PurchasePrice" or "AdditionalCharges" or "RefurbishmentTotal" or "CommissionTotal" or "IsPublic");
    }

    [Fact]
    public void Backoffice_vehicle_lookup_excludes_internal_pricing_fields()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            PurchasePrice = 42000m,
            AdditionalCharges = 600m,
            RefurbishmentTotal = 3500m,
            CommissionTotal = 1200m,
            SellingPrice = 58000m
        };

        var result = BackOfficeVehicleLookup.ToResponse(vehicle);

        Assert.Equal(vehicle.Id, result.Id);
        Assert.Equal(vehicle.PlateNumber, result.PlateNumber);
        Assert.Equal(vehicle.Make, result.Make);
        Assert.Equal(vehicle.Model, result.Model);
        Assert.Equal(vehicle.Status, result.Status);
        Assert.DoesNotContain(result.GetType().GetProperties(), property => property.Name is "PurchasePrice" or "SellingPrice" or "AdditionalCharges" or "RefurbishmentTotal" or "CommissionTotal" or "IsPublic");
    }

    [Fact]
    public void Lead_capture_requires_customer_contact_and_vehicle()
    {
        var request = new LeadRequest(Guid.NewGuid(), "Ali Tan", "0123456789", "Trade-in question");

        var lead = LeadCapture.Create(request);

        Assert.Equal(request.VehicleId, lead.VehicleId);
        Assert.Equal("Ali Tan", lead.CustomerName);
        Assert.Equal("0123456789", lead.Phone);
        Assert.Equal(LeadStatus.New, lead.Status);
    }

    [Fact]
    public void Public_lead_validation_requires_visible_available_vehicle()
    {
        var vehicleId = Guid.NewGuid();
        var request = new LeadRequest(vehicleId, "Ali Tan", "0123456789", "Trade-in question");
        var vehicles = new[]
        {
            VehicleSeed.Available(publicVisible: false) with { Id = vehicleId },
            VehicleSeed.Available(publicVisible: true)
        };

        var result = WorkflowReferenceRules.ValidatePublicLead(request, vehicles);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "vehicle_not_public");
    }

    [Fact]
    public void Public_lead_validation_requires_customer_name_and_phone()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var request = new LeadRequest(vehicle.Id, " ", "", "Trade-in question");

        var result = WorkflowReferenceRules.ValidatePublicLead(request, [vehicle]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "customer_name_required");
        Assert.Contains(result.Errors, error => error.Code == "phone_required");
    }

    [Fact]
    public void Backoffice_lead_validation_requires_customer_name_phone_and_vehicle()
    {
        var lead = new Lead
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            CustomerName = " ",
            Phone = "",
            Status = LeadStatus.Contacted
        };

        var result = LeadRules.ValidateBackOfficeLead(lead, [VehicleSeed.Available(publicVisible: true)], []);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "customer_name_required");
        Assert.Contains(result.Errors, error => error.Code == "phone_required");
        Assert.Contains(result.Errors, error => error.Code == "vehicle_not_found");
    }

    [Fact]
    public void Backoffice_lead_validation_rejects_unknown_customer_link()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var lead = new Lead
        {
            Id = Guid.NewGuid(),
            VehicleId = vehicle.Id,
            CustomerId = Guid.NewGuid(),
            CustomerName = "Ali Tan",
            Phone = "0123456789",
            Status = LeadStatus.Contacted
        };

        var result = LeadRules.ValidateBackOfficeLead(lead, [vehicle], []);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "customer_not_found");
    }

    [Fact]
    public void Customer_validation_requires_name_and_phone()
    {
        var customer = new Customer { Name = " ", Phone = "" };

        var result = ContactRules.ValidateCustomer(customer);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "customer_name_required");
        Assert.Contains(result.Errors, error => error.Code == "customer_phone_required");
    }

    [Fact]
    public void Customer_validation_rejects_duplicate_phone()
    {
        var existing = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var incoming = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan 2", Phone = " 012-345 6789 " };

        var result = ContactRules.ValidateUniqueCustomerPhone(incoming, [existing]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "duplicate_customer_phone");
    }

    [Fact]
    public void Customer_validation_allows_update_with_same_phone_on_same_record()
    {
        var customerId = Guid.NewGuid();
        var existing = new Customer { Id = customerId, Name = "Ali Tan", Phone = "0123456789" };
        var incoming = existing with { Name = "Ali Tan Updated", Phone = " 012-345 6789 " };

        var result = ContactRules.ValidateUniqueCustomerPhone(incoming, [existing]);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Owner_validation_requires_name_and_phone()
    {
        var owner = new Owner { Name = "", Phone = " " };

        var result = ContactRules.ValidateOwner(owner);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "owner_name_required");
        Assert.Contains(result.Errors, error => error.Code == "owner_phone_required");
    }

    [Fact]
    public void Owner_validation_rejects_duplicate_phone()
    {
        var existing = new Owner { Id = Guid.NewGuid(), Name = "Mr Tan", Phone = "0123456789" };
        var incoming = new Owner { Id = Guid.NewGuid(), Name = "Mr Tan 2", Phone = " 012-345 6789 " };

        var result = ContactRules.ValidateUniqueOwnerPhone(incoming, [existing]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "duplicate_owner_phone");
    }

    [Fact]
    public void Owner_validation_allows_update_with_same_phone_on_same_record()
    {
        var ownerId = Guid.NewGuid();
        var existing = new Owner { Id = ownerId, Name = "Mr Tan", Phone = "0123456789" };
        var incoming = existing with { Name = "Mr Tan Updated", Phone = " 012-345 6789 " };

        var result = ContactRules.ValidateUniqueOwnerPhone(incoming, [existing]);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Vehicle_contact_links_reject_unknown_customer_or_owner()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            CustomerId = Guid.NewGuid(),
            OwnerId = Guid.NewGuid()
        };

        var result = VehicleRules.ValidateContactLinks(vehicle, [], []);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "customer_not_found");
        Assert.Contains(result.Errors, error => error.Code == "owner_not_found");
    }

    [Fact]
    public void Loan_validation_requires_existing_vehicle_and_customer()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var loan = new LoanApplication
        {
            VehicleId = vehicle.Id,
            CustomerId = Guid.NewGuid(),
            Status = LoanStatus.Pending
        };

        var result = WorkflowReferenceRules.ValidateLoan(loan, [vehicle], [customer]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "customer_not_found");
        Assert.DoesNotContain(result.Errors, error => error.Code == "vehicle_not_found");
    }

    [Fact]
    public void Loan_validation_requires_submitted_date_for_active_follow_up_status()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var loan = new LoanApplication
        {
            VehicleId = vehicle.Id,
            CustomerId = customer.Id,
            Status = LoanStatus.Pending,
            SubmittedAt = null
        };

        var result = WorkflowReferenceRules.ValidateLoan(loan, [vehicle], [customer]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "loan_submitted_date_required");
    }

    [Fact]
    public void Loan_validation_requires_lou_approval_before_lou_done()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var loan = new LoanApplication
        {
            VehicleId = vehicle.Id,
            CustomerId = customer.Id,
            Status = LoanStatus.Done,
            SubmittedAt = new DateOnly(2026, 5, 30),
            LouApproved = false,
            LouDone = true
        };

        var result = WorkflowReferenceRules.ValidateLoan(loan, [vehicle], [customer]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "lou_approval_required");
    }

    [Fact]
    public void Loan_validation_requires_lou_approval_for_approved_status()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var loan = new LoanApplication
        {
            VehicleId = vehicle.Id,
            CustomerId = customer.Id,
            Status = LoanStatus.Approved,
            SubmittedAt = new DateOnly(2026, 5, 30),
            LouApproved = false
        };

        var result = WorkflowReferenceRules.ValidateLoan(loan, [vehicle], [customer]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "lou_approval_required");
    }

    [Fact]
    public void Loan_validation_requires_lou_done_for_done_status()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var loan = new LoanApplication
        {
            VehicleId = vehicle.Id,
            CustomerId = customer.Id,
            Status = LoanStatus.Done,
            SubmittedAt = new DateOnly(2026, 5, 30),
            LouApproved = true,
            LouDone = false
        };

        var result = WorkflowReferenceRules.ValidateLoan(loan, [vehicle], [customer]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "lou_done_required");
    }

    [Fact]
    public void Vehicle_link_validation_rejects_unknown_vehicle()
    {
        var result = WorkflowReferenceRules.ValidateVehicleLink(Guid.NewGuid(), [VehicleSeed.Available(publicVisible: true)]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "vehicle_not_found");
    }

    [Fact]
    public void Vehicle_intake_validation_requires_identity_fields()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            PlateNumber = " ",
            Make = "",
            Model = "",
            Year = 1800
        };

        var result = VehicleRules.ValidateIntake(vehicle);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "plate_required");
        Assert.Contains(result.Errors, error => error.Code == "make_required");
        Assert.Contains(result.Errors, error => error.Code == "model_required");
        Assert.Contains(result.Errors, error => error.Code == "invalid_year");
    }

    [Fact]
    public void Vehicle_intake_validation_requires_sane_prices()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            PurchasePrice = -1m,
            SellingPrice = 0m,
            AdditionalCharges = -1m,
            RefurbishmentTotal = -1m,
            CommissionTotal = -1m,
            ContraRangePrice = -1m
        };

        var result = VehicleRules.ValidateIntake(vehicle);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "invalid_purchase_price");
        Assert.Contains(result.Errors, error => error.Code == "invalid_selling_price");
        Assert.Contains(result.Errors, error => error.Code == "invalid_additional_charges");
        Assert.Contains(result.Errors, error => error.Code == "invalid_refurbishment_total");
        Assert.Contains(result.Errors, error => error.Code == "invalid_commission_total");
        Assert.Contains(result.Errors, error => error.Code == "invalid_contra_range_price");
    }

    [Fact]
    public void Vehicle_intake_validation_rejects_negative_outstation_pickup_allowance()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            OutstationPickupAllowance = -1m,
            OutstationPickupScheduledAt = new DateTime(2026, 6, 3, 10, 30, 0, DateTimeKind.Utc),
            OutstationPickupBookingSlip = "BOOK-1001"
        };

        var result = VehicleRules.ValidateIntake(vehicle);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "invalid_outstation_pickup_allowance");
    }

    [Fact]
    public void Vehicle_outstation_pickup_schedule_normalization_treats_unspecified_times_as_utc()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            OutstationPickupScheduledAt = new DateTime(2026, 6, 3, 10, 30, 0, DateTimeKind.Unspecified)
        };

        var result = VehicleRules.NormalizeDateTimes(vehicle);

        Assert.Equal(DateTimeKind.Utc, result.OutstationPickupScheduledAt?.Kind);
        Assert.Equal(new DateTime(2026, 6, 3, 10, 30, 0, DateTimeKind.Utc), result.OutstationPickupScheduledAt);
    }

    [Fact]
    public void Vehicle_intake_validation_rejects_duplicate_plate_number()
    {
        var existing = VehicleSeed.Available(publicVisible: true) with
        {
            Id = Guid.NewGuid(),
            PlateNumber = "VPK1234"
        };
        var incoming = VehicleSeed.Available(publicVisible: true) with
        {
            Id = Guid.NewGuid(),
            PlateNumber = " vpk1234 "
        };

        var result = VehicleRules.ValidateUniquePlate(incoming, [existing]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "duplicate_plate");
    }

    [Fact]
    public void Loan_workflow_hides_vehicle_from_public_inventory()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var loan = new LoanApplication
        {
            VehicleId = vehicle.Id,
            CustomerId = Guid.NewGuid(),
            Status = LoanStatus.Pending
        };

        var result = WorkflowStatusRules.ApplyLoanStatus(vehicle, loan);

        Assert.Equal(VehicleStatus.LoanProcessing, result.Status);
        Assert.False(result.IsPublic);
    }

    [Fact]
    public void Reconciled_payment_marks_vehicle_sold_and_private()
    {
        var vehicle = VehicleSeed.LoanProcessing(publicVisible: false);
        var payment = new PaymentRecord
        {
            VehicleId = vehicle.Id,
            NettPrice = 58000m,
            Status = PaymentStatus.Reconciled
        };

        var result = WorkflowStatusRules.ApplyPaymentStatus(vehicle, payment);

        Assert.Equal(VehicleStatus.Sold, result.Status);
        Assert.False(result.IsPublic);
    }

    [Fact]
    public void Reversing_final_reconciled_payment_returns_sold_vehicle_to_loan_processing()
    {
        var vehicle = VehicleSeed.Sold(publicVisible: false);
        var payment = new PaymentRecord
        {
            VehicleId = vehicle.Id,
            NettPrice = 58000m,
            Status = PaymentStatus.Disbursed
        };

        var result = WorkflowStatusRules.ApplyPaymentStatus(vehicle, [payment]);

        Assert.Equal(VehicleStatus.LoanProcessing, result.Status);
        Assert.False(result.IsPublic);
    }

    [Fact]
    public void Payment_validation_rejects_non_positive_nett_price()
    {
        var payment = new PaymentRecord
        {
            VehicleId = Guid.NewGuid(),
            NettPrice = 0m,
            Status = PaymentStatus.Pending
        };

        var result = FinanceRules.ValidatePayment(payment);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "invalid_nett_price");
    }

    [Fact]
    public void Payment_validation_rejects_negative_invoice_detail_amounts()
    {
        var payment = new PaymentRecord
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            NettPrice = 58000m,
            Status = PaymentStatus.Pending,
            SalesPrice = -1m,
            InterestAdditionalCharges = -1m,
            NcdAmount = -1m,
            WindscreenCharges = -1m
        };

        var result = FinanceRules.ValidatePayment(payment);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "invalid_sales_price");
        Assert.Contains(result.Errors, error => error.Code == "invalid_interest_additional_charges");
        Assert.Contains(result.Errors, error => error.Code == "invalid_ncd_amount");
        Assert.Contains(result.Errors, error => error.Code == "invalid_windscreen_charges");
    }

    [Fact]
    public void Reconciled_payment_requires_receipt_and_invoice_references()
    {
        var payment = new PaymentRecord
        {
            VehicleId = Guid.NewGuid(),
            NettPrice = 58000m,
            Status = PaymentStatus.Reconciled,
            BossChecked = true,
            DocumentsPrepared = true,
            ChecklistValidated = true,
            InvoiceGenerated = true,
            AutoCountKeyed = true,
            ReceiptNumber = " ",
            InvoiceNumber = ""
        };

        var result = FinanceRules.ValidatePayment(payment);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "receipt_number_required");
        Assert.Contains(result.Errors, error => error.Code == "payment_invoice_number_required");
    }

    [Fact]
    public void Reconciled_payment_requires_boss_check()
    {
        var payment = new PaymentRecord
        {
            VehicleId = Guid.NewGuid(),
            NettPrice = 58000m,
            Status = PaymentStatus.Reconciled,
            ReceiptNumber = "RCPT-1001",
            InvoiceNumber = "INV-1001",
            DocumentsPrepared = true,
            ChecklistValidated = true,
            InvoiceGenerated = true,
            AutoCountKeyed = true,
            BossChecked = false
        };

        var result = FinanceRules.ValidatePayment(payment);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "payment_boss_check_required");
    }

    [Fact]
    public void Reconciled_payment_requires_finance_checklist_steps()
    {
        var payment = new PaymentRecord
        {
            VehicleId = Guid.NewGuid(),
            NettPrice = 58000m,
            Status = PaymentStatus.Reconciled,
            ReceiptNumber = "RCPT-1001",
            InvoiceNumber = "INV-1001",
            BossChecked = true
        };

        var result = FinanceRules.ValidatePayment(payment);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "payment_documents_prepared_required");
        Assert.Contains(result.Errors, error => error.Code == "payment_checklist_validated_required");
        Assert.Contains(result.Errors, error => error.Code == "payment_invoice_generated_required");
        Assert.Contains(result.Errors, error => error.Code == "payment_autocount_keyed_required");
    }

    [Fact]
    public void Reconciled_payment_rejects_duplicate_receipt_and_invoice_references()
    {
        var existing = new[]
        {
            new PaymentRecord
            {
                Id = Guid.NewGuid(),
                VehicleId = Guid.NewGuid(),
                NettPrice = 58000m,
                Status = PaymentStatus.Reconciled,
                ReceiptNumber = "RCPT-1001",
                InvoiceNumber = "INV-1001",
                BossChecked = true,
                DocumentsPrepared = true,
                ChecklistValidated = true,
                InvoiceGenerated = true,
                AutoCountKeyed = true
            }
        };
        var payment = new PaymentRecord
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            NettPrice = 58000m,
            Status = PaymentStatus.Reconciled,
            ReceiptNumber = " rcpt-1001 ",
            InvoiceNumber = " inv-1001 ",
            BossChecked = true,
            DocumentsPrepared = true,
            ChecklistValidated = true,
            InvoiceGenerated = true,
            AutoCountKeyed = true
        };

        var result = FinanceRules.ValidatePayment(payment, existing);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "duplicate_receipt_number");
        Assert.Contains(result.Errors, error => error.Code == "duplicate_payment_invoice_number");
    }

    [Fact]
    public void Loan_follow_up_is_due_after_three_days_in_pending_status()
    {
        var loan = new LoanApplication
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            CustomerId = Guid.NewGuid(),
            Status = LoanStatus.Pending,
            SubmittedAt = new DateOnly(2026, 5, 20)
        };

        Assert.True(ReminderRules.IsLoanFollowUpDue(loan, new DateOnly(2026, 5, 23)));
        Assert.False(ReminderRules.IsLoanFollowUpDue(loan, new DateOnly(2026, 5, 22)));
    }

    [Fact]
    public void Settlement_reminder_is_due_on_or_before_deadline_when_unpaid()
    {
        var settlement = new SettlementReminder
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            Amount = 25000m,
            Deadline = new DateOnly(2026, 6, 1),
            IsPaid = false
        };

        Assert.True(ReminderRules.IsSettlementDue(settlement, new DateOnly(2026, 6, 1)));
        Assert.False(ReminderRules.IsSettlementDue(settlement with { IsPaid = true }, new DateOnly(2026, 6, 1)));
    }

    [Fact]
    public void Settlement_validation_rejects_non_positive_amount()
    {
        var settlement = new SettlementReminder
        {
            VehicleId = Guid.NewGuid(),
            Amount = -1m,
            Deadline = new DateOnly(2026, 6, 1),
            IsPaid = false
        };

        var result = FinanceRules.ValidateSettlement(settlement);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "invalid_settlement_amount");
    }

    [Fact]
    public void Settlement_validation_rejects_missing_deadline()
    {
        var settlement = new SettlementReminder
        {
            VehicleId = Guid.NewGuid(),
            Amount = 25000m,
            Deadline = default,
            IsPaid = false
        };

        var result = FinanceRules.ValidateSettlement(settlement);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "settlement_deadline_required");
    }

    [Fact]
    public void Settlement_validation_rejects_unknown_owner_link()
    {
        var settlement = new SettlementReminder
        {
            VehicleId = Guid.NewGuid(),
            OwnerId = Guid.NewGuid(),
            Amount = 25000m,
            Deadline = new DateOnly(2026, 6, 1),
            IsPaid = false
        };

        var result = FinanceRules.ValidateSettlement(settlement, []);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "unknown_settlement_owner");
    }

    [Fact]
    public void Reminder_inbox_combines_loan_settlement_and_delivery_alerts()
    {
        var vehicleId = Guid.NewGuid();
        var today = new DateOnly(2026, 6, 1);
        var reminders = ReminderInbox.Create(
            [new LoanApplication { Id = Guid.NewGuid(), VehicleId = vehicleId, CustomerId = Guid.NewGuid(), Status = LoanStatus.Pending, SubmittedAt = today.AddDays(-3) }],
            [new DeliverySchedule { Id = Guid.NewGuid(), VehicleId = vehicleId, Pic = "Ah Ming", Status = DeliveryStatus.Scheduled, ScheduledDate = today.AddDays(2) }],
            [new SettlementReminder { Id = Guid.NewGuid(), VehicleId = vehicleId, Amount = 25000m, Deadline = today, IsPaid = false }],
            [new PaymentRecord { Id = Guid.NewGuid(), VehicleId = vehicleId, NettPrice = 58000m, Status = PaymentStatus.Disbursed, BankName = "Maybank", BankFollowUpDate = today, CreatedAt = new DateTime(2026, 6, 1, 0, 0, 0, DateTimeKind.Utc) }],
            [new DailySpend { Id = Guid.NewGuid(), Description = "Electric Bill", Amount = 480m, DueDate = today, IsPaid = false }],
            [new DebtRecoveryCase { Id = Guid.NewGuid(), VehicleId = vehicleId, CustomerId = Guid.NewGuid(), BalanceAmount = 3200m, Status = DebtRecoveryStatus.Open, FollowUpDate = today }],
            [new PaymentVoucher { Id = Guid.NewGuid(), VehicleId = vehicleId, PayeeName = "Driver", Amount = 180m, Purpose = "Outstation Pickup Allowance", IssuedDate = today, Status = PaymentVoucherStatus.Pending }],
            [VehicleSeed.Available(publicVisible: true) with { Id = vehicleId, PlateNumber = "VPK1234" }],
            today);

        Assert.Equal(8, reminders.Count);
        Assert.Contains(reminders, reminder => reminder.Type == "LoanFollowUp" && reminder.VehiclePlate == "VPK1234");
        Assert.Contains(reminders, reminder => reminder.Type == "DeliveryPreparation" && reminder.DueDate == today.AddDays(2));
        Assert.Contains(reminders, reminder => reminder.Type == "SettlementDue" && reminder.Amount == 25000m);
        Assert.Contains(reminders, reminder => reminder.Type == "PaymentBankFollowUp" && reminder.DueDate == today && reminder.Amount == 58000m);
        Assert.Contains(reminders, reminder => reminder.Type == "PaymentStatusFollowUp" && reminder.DueDate == today && reminder.Amount == 58000m);
        Assert.Contains(reminders, reminder => reminder.Type == "DailySpendDue" && reminder.VehiclePlate == "General" && reminder.Amount == 480m);
        Assert.Contains(reminders, reminder => reminder.Type == "DebtRecoveryFollowUp" && reminder.VehiclePlate == "VPK1234" && reminder.Amount == 3200m);
        Assert.Contains(reminders, reminder => reminder.Type == "PaymentVoucherFollowUp" && reminder.VehiclePlate == "VPK1234" && reminder.Amount == 180m);
    }

    [Fact]
    public void Reminder_inbox_filters_by_type_and_due_bucket()
    {
        var vehicleId = Guid.NewGuid();
        var today = new DateOnly(2026, 6, 1);
        var reminders = new[]
        {
            new ReminderItem("LoanFollowUp", "Loan", "VPK1234", vehicleId, today.AddDays(-1), null),
            new ReminderItem("SettlementDue", "Settlement", "VPK1234", vehicleId, today, 25000m),
            new ReminderItem("DeliveryPreparation", "Delivery", "VPK1234", vehicleId, today.AddDays(2), null)
        };

        Assert.Equal(["Loan"], ReminderInbox.Filter(reminders, "LoanFollowUp", "Overdue", today).Select(reminder => reminder.Title));
        Assert.Equal(["Settlement"], ReminderInbox.Filter(reminders, "All", "DueToday", today).Select(reminder => reminder.Title));
        Assert.Equal(["Delivery"], ReminderInbox.Filter(reminders, null, "Upcoming", today).Select(reminder => reminder.Title));
        Assert.Empty(ReminderInbox.Filter(reminders, "SettlementDue", "Overdue", today));
        Assert.True(ReminderInbox.IsValidDueFilter("DueToday"));
        Assert.False(ReminderInbox.IsValidDueFilter("Soon"));
    }

    [Fact]
    public void Payment_voucher_follow_up_is_due_until_paid()
    {
        var voucher = new PaymentVoucher
        {
            VehicleId = Guid.NewGuid(),
            PayeeName = "Driver",
            Amount = 180m,
            Purpose = "Outstation Pickup Allowance",
            IssuedDate = new DateOnly(2026, 6, 1),
            Status = PaymentVoucherStatus.Approved
        };

        Assert.True(ReminderRules.IsPaymentVoucherFollowUpDue(voucher, new DateOnly(2026, 6, 1)));
        Assert.False(ReminderRules.IsPaymentVoucherFollowUpDue(voucher, new DateOnly(2026, 5, 31)));
        Assert.False(ReminderRules.IsPaymentVoucherFollowUpDue(voucher with { Status = PaymentVoucherStatus.Paid }, new DateOnly(2026, 6, 1)));
    }

    [Fact]
    public void Daily_spend_validation_requires_description_amount_and_due_date()
    {
        var spend = new DailySpend
        {
            Description = " ",
            Amount = 0m,
            DueDate = default
        };

        var result = FinanceRules.ValidateDailySpend(spend);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "daily_spend_description_required");
        Assert.Contains(result.Errors, error => error.Code == "invalid_daily_spend_amount");
        Assert.Contains(result.Errors, error => error.Code == "daily_spend_due_date_required");
    }

    [Fact]
    public void Delivery_preparation_reminder_stops_after_two_day_notice_is_sent()
    {
        var delivery = new DeliverySchedule
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            Pic = "Ah Ming",
            Status = DeliveryStatus.Scheduled,
            ScheduledDate = new DateOnly(2026, 6, 3),
            TwoDayNoticeSent = true
        };

        Assert.False(ReminderRules.IsDeliveryPreparationDue(delivery, new DateOnly(2026, 6, 1)));
    }

    [Fact]
    public void Upload_policy_enforces_file_size_limits()
    {
        Assert.True(UploadPolicy.IsAllowed(FileCategory.VehiclePhoto, 3 * 1024 * 1024));
        Assert.False(UploadPolicy.IsAllowed(FileCategory.VehiclePhoto, 9 * 1024 * 1024));
        Assert.True(UploadPolicy.IsAllowed(FileCategory.LoanDocument, 8 * 1024 * 1024));
        Assert.False(UploadPolicy.IsAllowed(FileCategory.LoanDocument, 16 * 1024 * 1024));
        Assert.True(UploadPolicy.MultipartBodyLimit > UploadPolicy.DocumentLimit);
    }

    [Fact]
    public void Document_upload_validation_rejects_vehicle_photo_category()
    {
        var result = UploadPolicy.ValidateDocumentCategory(FileCategory.VehiclePhoto);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "invalid_document_category");
    }

    [Fact]
    public void Photo_upload_validation_rejects_unsupported_image_bytes()
    {
        var result = PhotoUploadRules.CreateThumbnail([1, 2, 3, 4]);

        Assert.False(result.IsValid);
        Assert.Equal("unsupported_image", result.Error?.Code);
        Assert.Null(result.Thumbnail);
    }

    [Fact]
    public void Profit_calculation_subtracts_refurbishment_commission_and_charges()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            PurchasePrice = 42000m,
            SellingPrice = 58000m,
            AdditionalCharges = 600m,
            RefurbishmentTotal = 3500m,
            CommissionTotal = 1200m,
            OutstationPickupAllowance = 180m
        };

        Assert.Equal(11720m, ProfitCalculator.EstimatedProfit(vehicle));
    }

    [Fact]
    public void Dashboard_metrics_use_repair_jobs_for_repair_cost_and_profit()
    {
        var vehicleId = Guid.NewGuid();
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            Id = vehicleId,
            PurchasePrice = 42000m,
            SellingPrice = 58000m,
            AdditionalCharges = 600m,
            RefurbishmentTotal = 3500m,
            CommissionTotal = 1200m
        };
        var repairs = new[]
        {
            new RepairJob { VehicleId = vehicleId, WhatToDo = "Paint touch-up", Cost = 450m },
            new RepairJob { VehicleId = vehicleId, WhatToDo = "Interior clean", Cost = 550m }
        };

        var summary = DashboardMetrics.Create(
            [vehicle],
            [],
            [],
            [],
            repairs,
            [
                new SupplierInvoice { VehicleId = vehicleId, SupplierName = "ABC Spray", InvoiceNumber = "S-1", Amount = 500m },
                new SupplierInvoice { VehicleId = vehicleId, SupplierName = "Tint Shop", InvoiceNumber = "S-2", Amount = 1500m }
            ],
            [],
            [],
            [
                new Lead { VehicleId = vehicleId, CustomerName = "Ali", Phone = "012", Status = LeadStatus.Closed },
                new Lead { VehicleId = vehicleId, CustomerName = "Tan", Phone = "013", Status = LeadStatus.New }
            ],
            new DateOnly(2026, 5, 30));

        Assert.Equal(1000m, summary.RepairCost);
        Assert.Equal(14400m, summary.EstimatedProfit);
        Assert.Equal(summary.EstimatedProfit, summary.TotalProfit);
        Assert.Equal("Tint Shop", summary.TopSupplier);
        Assert.Equal(1, summary.SalesPerformance);
    }

    [Fact]
    public void Dashboard_metrics_use_broker_commissions_for_profit_when_present()
    {
        var vehicleId = Guid.NewGuid();
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            Id = vehicleId,
            PurchasePrice = 42000m,
            SellingPrice = 58000m,
            AdditionalCharges = 600m,
            RefurbishmentTotal = 3500m,
            CommissionTotal = 1200m
        };

        var summary = DashboardMetrics.Create(
            [vehicle],
            [],
            [],
            [],
            [],
            [],
            [new BrokerCommission { VehicleId = vehicleId, BrokerName = "Ah Chong", Amount = 1800m }],
            [],
            [],
            new DateOnly(2026, 5, 30));

        Assert.Equal(11300m, summary.EstimatedProfit);
        Assert.Equal(summary.EstimatedProfit, summary.TotalProfit);
    }

    [Fact]
    public void Dashboard_metrics_use_payment_vouchers_for_pickup_allowance_profit_when_present()
    {
        var vehicleId = Guid.NewGuid();
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            Id = vehicleId,
            PurchasePrice = 42000m,
            SellingPrice = 58000m,
            AdditionalCharges = 600m,
            RefurbishmentTotal = 3500m,
            CommissionTotal = 1200m,
            OutstationPickupAllowance = 100m
        };

        var summary = DashboardMetrics.Create(
            [vehicle],
            [],
            [],
            [],
            [],
            [],
            [],
            [new PaymentVoucher { VehicleId = vehicleId, PayeeName = "Driver", Amount = 180m, Purpose = "Outstation Pickup Allowance", IssuedDate = new DateOnly(2026, 6, 3) }],
            [],
            new DateOnly(2026, 5, 30));

        Assert.Equal(11720m, summary.EstimatedProfit);
        Assert.Equal(summary.EstimatedProfit, summary.TotalProfit);
    }

    [Fact]
    public void Dashboard_metrics_group_unsold_stock_into_aging_buckets()
    {
        var today = new DateOnly(2026, 6, 1);
        var summary = DashboardMetrics.Create(
            [
                VehicleSeed.Available(publicVisible: true) with { IntakeDate = today.AddDays(-10) },
                VehicleSeed.LoanProcessing(publicVisible: false) with { IntakeDate = today.AddDays(-45) },
                VehicleSeed.Available(publicVisible: false) with { IntakeDate = today.AddDays(-75) },
                VehicleSeed.Sold(publicVisible: false) with { IntakeDate = today.AddDays(-90) }
            ],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            [],
            today);

        Assert.Equal(3, summary.TotalStock);
        Assert.Equal(1, summary.VehicleAging);
        Assert.Contains(summary.AgingBuckets, bucket => bucket.Label == "0-30" && bucket.Count == 1);
        Assert.Contains(summary.AgingBuckets, bucket => bucket.Label == "31-60" && bucket.Count == 1);
        Assert.Contains(summary.AgingBuckets, bucket => bucket.Label == "61+" && bucket.Count == 1);
    }

    [Fact]
    public void Broker_commission_validation_requires_vehicle_broker_and_positive_amount()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var commission = new BrokerCommission
        {
            VehicleId = Guid.NewGuid(),
            BrokerName = " ",
            Amount = 0m
        };

        var result = FinanceRules.ValidateBrokerCommission(commission, [vehicle]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "vehicle_not_found");
        Assert.Contains(result.Errors, error => error.Code == "broker_name_required");
        Assert.Contains(result.Errors, error => error.Code == "invalid_broker_commission_amount");
    }

    [Fact]
    public void Broker_commission_validation_requires_cp58_before_prepared()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var commission = new BrokerCommission
        {
            VehicleId = vehicle.Id,
            BrokerName = "Ah Chong",
            Amount = 1200m,
            Cp58Required = false,
            Cp58Prepared = true
        };

        var result = FinanceRules.ValidateBrokerCommission(commission, [vehicle]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "cp58_required_missing");
    }

    [Fact]
    public void Debt_recovery_validation_requires_vehicle_customer_balance_and_follow_up_date()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var debt = new DebtRecoveryCase
        {
            VehicleId = Guid.NewGuid(),
            CustomerId = Guid.NewGuid(),
            BalanceAmount = 0m,
            FollowUpDate = default
        };

        var result = FinanceRules.ValidateDebtRecovery(debt, [vehicle], [customer]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "vehicle_not_found");
        Assert.Contains(result.Errors, error => error.Code == "customer_not_found");
        Assert.Contains(result.Errors, error => error.Code == "invalid_debt_balance_amount");
        Assert.Contains(result.Errors, error => error.Code == "debt_follow_up_date_required");
    }

    [Fact]
    public void Payment_voucher_validation_requires_vehicle_payee_amount_purpose_and_issued_date()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var voucher = new PaymentVoucher
        {
            VehicleId = Guid.NewGuid(),
            PayeeName = " ",
            Amount = 0m,
            Purpose = " ",
            IssuedDate = default
        };

        var result = FinanceRules.ValidatePaymentVoucher(voucher, [vehicle]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "vehicle_not_found");
        Assert.Contains(result.Errors, error => error.Code == "payment_voucher_payee_required");
        Assert.Contains(result.Errors, error => error.Code == "invalid_payment_voucher_amount");
        Assert.Contains(result.Errors, error => error.Code == "payment_voucher_purpose_required");
        Assert.Contains(result.Errors, error => error.Code == "payment_voucher_issued_date_required");
    }

    [Fact]
    public void Repair_validation_rejects_blank_task_and_negative_cost()
    {
        var repair = new RepairJob
        {
            VehicleId = Guid.NewGuid(),
            WhatToDo = " ",
            Cost = -1m
        };

        var result = RepairRules.Validate(repair);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "repair_task_required");
        Assert.Contains(result.Errors, error => error.Code == "invalid_repair_cost");
    }

    [Fact]
    public void Supplier_invoice_validation_rejects_duplicate_invoice_for_same_supplier()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var existing = new[]
        {
            new SupplierInvoice
            {
                Id = Guid.NewGuid(),
            VehicleId = vehicle.Id,
            SupplierName = "ABC Spray",
            InvoiceNumber = "INV-1001",
            PlateNumberOnInvoice = vehicle.PlateNumber,
            Amount = 800m
            }
        };
        var incoming = existing[0] with
        {
            Id = Guid.NewGuid(),
            SupplierName = " ABC Spray ",
            InvoiceNumber = " inv-1001 ",
            Amount = 900m
        };

        var result = SupplierInvoiceRules.Validate(incoming, existing, [vehicle]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "duplicate_invoice");
    }

    [Fact]
    public void Supplier_invoice_validation_rejects_wrong_plate_printed_on_invoice()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var incoming = new SupplierInvoice
        {
            Id = Guid.NewGuid(),
            VehicleId = vehicle.Id,
            SupplierName = "Tint Shop",
            InvoiceNumber = "T-200",
            PlateNumberOnInvoice = "WRONG-999",
            Amount = 650m
        };

        var result = SupplierInvoiceRules.Validate(incoming, [], [vehicle]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "supplier_invoice_plate_mismatch");
    }

    [Fact]
    public void Supplier_invoice_validation_rejects_unknown_car_plate_link()
    {
        var incoming = new SupplierInvoice
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            SupplierName = "Tint Shop",
            InvoiceNumber = "T-200",
            Amount = 650m
        };

        var result = SupplierInvoiceRules.Validate(incoming, [], [VehicleSeed.Available(publicVisible: true)]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "vehicle_not_found");
    }

    [Fact]
    public void Supplier_invoice_validation_requires_supplier_and_invoice_number()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var incoming = new SupplierInvoice
        {
            Id = Guid.NewGuid(),
            VehicleId = vehicle.Id,
            SupplierName = " ",
            InvoiceNumber = "",
            Amount = 650m
        };

        var result = SupplierInvoiceRules.Validate(incoming, [], [vehicle]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "supplier_name_required");
        Assert.Contains(result.Errors, error => error.Code == "invoice_number_required");
    }

    [Fact]
    public void Purchase_invoice_validation_requires_vehicle_invoice_number_and_positive_amount()
    {
        var incoming = new PurchaseInvoice
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            InvoiceNumber = " ",
            Amount = 0m
        };

        var result = PurchaseInvoiceRules.Validate(incoming, [], [VehicleSeed.Available(publicVisible: true)]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "vehicle_not_found");
        Assert.Contains(result.Errors, error => error.Code == "purchase_invoice_number_required");
        Assert.Contains(result.Errors, error => error.Code == "invalid_purchase_invoice_amount");
    }

    [Fact]
    public void Purchase_invoice_validation_rejects_duplicate_invoice_with_normalized_number()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true);
        var existing = new[]
        {
            new PurchaseInvoice
            {
                Id = Guid.NewGuid(),
                VehicleId = vehicle.Id,
                InvoiceNumber = "PI-1001",
                Amount = 40000m
            }
        };
        var incoming = new PurchaseInvoice
        {
            Id = Guid.NewGuid(),
            VehicleId = vehicle.Id,
            InvoiceNumber = " pi-1001 ",
            Amount = 40000m
        };

        var result = PurchaseInvoiceRules.Validate(incoming, existing, [vehicle]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "duplicate_purchase_invoice");
    }

    [Fact]
    public void Loan_document_check_requires_ic_voc_and_loan_document()
    {
        var loan = new LoanApplication
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            CustomerId = Guid.NewGuid(),
            Status = LoanStatus.Pending,
            SubmittedAt = new DateOnly(2026, 5, 30)
        };
        var documents = new[]
        {
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = loan.CustomerId, Category = FileCategory.Voc },
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = loan.CustomerId, Category = FileCategory.LoanDocument }
        };

        var result = LoanDocumentRules.CheckCompleteness(loan, documents);

        Assert.False(result.IsComplete);
        Assert.Contains(FileCategory.StatusReceipt, result.MissingCategories);
    }

    [Fact]
    public void Loan_document_check_requires_ap_document()
    {
        var loan = new LoanApplication
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            CustomerId = Guid.NewGuid(),
            Status = LoanStatus.Pending,
            SubmittedAt = new DateOnly(2026, 5, 30)
        };
        var documents = new[]
        {
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = loan.CustomerId, Category = FileCategory.Voc },
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = loan.CustomerId, Category = FileCategory.StatusReceipt },
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = loan.CustomerId, Category = FileCategory.LoanDocument }
        };

        var result = LoanDocumentRules.CheckCompleteness(loan, documents);

        Assert.False(result.IsComplete);
        Assert.Contains(FileCategory.ApDocument, result.MissingCategories);
    }

    [Fact]
    public void Delivery_is_ready_only_when_release_checklist_is_complete()
    {
        var delivery = new DeliverySchedule
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            Pic = "Ah Ming",
            Status = DeliveryStatus.ReadyForRelease,
            ScheduledDate = new DateOnly(2026, 6, 3),
            PolishDone = true,
            TintedDone = true,
            WashDone = true,
            DocumentsPrepared = true,
            InspectionDone = true,
            InspectionReportReference = "INSPECT-1001",
            TwoDayNoticeSent = true,
            InsuranceHandled = true,
            RoadTaxHandled = true,
            WindscreenInsuranceHandled = true
        };

        Assert.True(DeliveryRules.IsReadyForRelease(delivery));
        Assert.False(DeliveryRules.IsReadyForRelease(delivery with { WashDone = false }));
        Assert.False(DeliveryRules.IsReadyForRelease(delivery with { InsuranceHandled = false }));
        Assert.False(DeliveryRules.IsReadyForRelease(delivery with { RoadTaxHandled = false }));
        Assert.False(DeliveryRules.IsReadyForRelease(delivery with { WindscreenInsuranceHandled = false }));
        Assert.False(DeliveryRules.IsReadyForRelease(delivery with { InspectionReportReference = " " }));
    }

    [Fact]
    public void Delivery_notification_flag_is_tracked_separately_from_two_day_notice()
    {
        var delivery = new DeliverySchedule
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            Pic = "Ah Ming",
            Status = DeliveryStatus.Scheduled,
            ScheduledDate = new DateOnly(2026, 6, 3),
            NotificationSent = true,
            TwoDayNoticeSent = false
        };

        Assert.True(delivery.NotificationSent);
        Assert.False(delivery.TwoDayNoticeSent);
        Assert.False(DeliveryRules.IsReadyForRelease(delivery));
    }

    [Fact]
    public void Delivery_validation_rejects_release_when_checklist_is_incomplete()
    {
        var delivery = new DeliverySchedule
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            Pic = "Ah Ming",
            Status = DeliveryStatus.Released,
            ScheduledDate = new DateOnly(2026, 6, 3),
            PolishDone = true,
            TintedDone = true,
            WashDone = false,
            DocumentsPrepared = true,
            InspectionDone = true,
            InspectionReportReference = "INSPECT-1001",
            TwoDayNoticeSent = true,
            InsuranceHandled = true,
            RoadTaxHandled = true,
            WindscreenInsuranceHandled = true
        };

        var result = DeliveryRules.ValidateRelease(delivery);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "delivery_not_ready");
    }

    [Fact]
    public void Delivery_validation_rejects_ready_for_release_when_checklist_is_incomplete()
    {
        var delivery = new DeliverySchedule
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            Pic = "Ah Ming",
            Status = DeliveryStatus.ReadyForRelease,
            ScheduledDate = new DateOnly(2026, 6, 3),
            PolishDone = true,
            TintedDone = true,
            WashDone = false,
            DocumentsPrepared = true,
            InspectionDone = true,
            InspectionReportReference = "INSPECT-1001",
            TwoDayNoticeSent = true,
            InsuranceHandled = true,
            RoadTaxHandled = true,
            WindscreenInsuranceHandled = true
        };

        var result = DeliveryRules.Validate(delivery);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "delivery_not_ready");
    }

    [Fact]
    public void Delivery_document_check_requires_policy_and_road_tax_receipt_for_release()
    {
        var delivery = new DeliverySchedule
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            Pic = "Ah Ming",
            Status = DeliveryStatus.ReadyForRelease,
            ScheduledDate = new DateOnly(2026, 6, 3)
        };
        var documents = new[]
        {
            new DocumentBlob { VehicleId = delivery.VehicleId, Category = FileCategory.Policy }
        };

        var result = DeliveryDocumentRules.CheckCompleteness(delivery, documents);

        Assert.False(result.IsComplete);
        Assert.Contains(FileCategory.RoadTaxReceipt, result.MissingCategories);
        Assert.DoesNotContain(FileCategory.Policy, result.MissingCategories);
    }

    [Fact]
    public void Delivery_validation_requires_pic_and_schedule_date()
    {
        var delivery = new DeliverySchedule
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            Pic = " ",
            Status = DeliveryStatus.Scheduled,
            ScheduledDate = default
        };

        var result = DeliveryRules.Validate(delivery);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "delivery_pic_required");
        Assert.Contains(result.Errors, error => error.Code == "delivery_schedule_required");
    }

    [Fact]
    public void Delivery_validation_requires_report_reference_after_inspection()
    {
        var delivery = new DeliverySchedule
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            Pic = "Ah Ming",
            Status = DeliveryStatus.Inspection,
            ScheduledDate = new DateOnly(2026, 6, 3),
            InspectionDone = true,
            InspectionReportReference = " "
        };

        var result = DeliveryRules.Validate(delivery);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "inspection_report_required");
    }

    [Fact]
    public void Health_status_identifies_service_and_utc_timestamp()
    {
        var now = new DateTimeOffset(2026, 5, 30, 0, 30, 0, TimeSpan.Zero);

        var health = HealthStatus.Create(now);

        Assert.Equal("YS Heng API", health.Service);
        Assert.Equal("ok", health.Status);
        Assert.Equal(now, health.CheckedAt);
    }

    [Fact]
    public void Api_error_helper_returns_structured_route_id_mismatch_message()
    {
        var error = ApiErrors.RouteIdMismatch("supplier invoice");

        Assert.Equal("Route id and supplier invoice id do not match.", error.Message);
    }

    [Fact]
    public void Public_photo_selection_uses_latest_thumbnail_for_vehicle()
    {
        var vehicleId = Guid.NewGuid();
        var older = new VehiclePhoto
        {
            Id = Guid.NewGuid(),
            VehicleId = vehicleId,
            FileName = "older.jpg",
            MimeType = "image/jpeg",
            Content = [1],
            Thumbnail = [9],
            UploadedAt = new DateTime(2026, 5, 29, 8, 0, 0, DateTimeKind.Utc)
        };
        var newer = older with
        {
            Id = Guid.NewGuid(),
            FileName = "newer.jpg",
            Content = [2],
            Thumbnail = [8],
            UploadedAt = new DateTime(2026, 5, 30, 8, 0, 0, DateTimeKind.Utc)
        };

        var selected = PublicVehiclePhotos.SelectPrimary(vehicleId, [older, newer]);

        Assert.NotNull(selected);
        Assert.Equal(newer.Id, selected.Id);
        Assert.Equal([8], selected.Bytes);
        Assert.Equal("image/jpeg", selected.MimeType);
    }

    [Fact]
    public void Public_photo_selection_returns_null_when_vehicle_has_no_photo()
    {
        var selected = PublicVehiclePhotos.SelectPrimary(Guid.NewGuid(), []);

        Assert.Null(selected);
    }

    [Fact]
    public void Audit_trail_records_actor_action_entity_and_timestamp()
    {
        var vehicleId = Guid.NewGuid();
        var now = new DateTime(2026, 5, 30, 9, 30, 0, DateTimeKind.Utc);

        var log = AuditTrail.Record("seed", "vehicle.created", nameof(Vehicle), vehicleId, now);

        Assert.Equal("seed", log.Actor);
        Assert.Equal("vehicle.created", log.Action);
        Assert.Equal(nameof(Vehicle), log.EntityName);
        Assert.Equal(vehicleId, log.EntityId);
        Assert.Equal(now, log.CreatedAt);
    }

    [Fact]
    public void Audit_trail_uses_authenticated_staff_name_when_available()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, "admin@ysheng.local")],
            authenticationType: "Identity.Application"));

        var actor = AuditTrail.ActorFrom(principal);

        Assert.Equal("admin@ysheng.local", actor);
    }

    [Fact]
    public void Uploaded_blob_metadata_records_authenticated_uploader()
    {
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.Name, "admin@ysheng.local")],
            authenticationType: "Identity.Application"));

        var uploader = UploadMetadata.UploaderFrom(principal);

        Assert.Equal("admin@ysheng.local", uploader);
    }

    [Fact]
    public void Runtime_seed_runs_for_api_but_not_worker_process()
    {
        Assert.True(RuntimeMode.ShouldSeed(workerEnabled: false, seedEnabled: true));
        Assert.False(RuntimeMode.ShouldSeed(workerEnabled: false, seedEnabled: false));
        Assert.False(RuntimeMode.ShouldSeed(workerEnabled: true, seedEnabled: true));
    }

    [Fact]
    public void Readiness_payload_reflects_database_connectivity()
    {
        var ready = HealthStatus.CreateReadiness(databaseConnected: true, DateTimeOffset.UnixEpoch);
        var notReady = HealthStatus.CreateReadiness(databaseConnected: false, DateTimeOffset.UnixEpoch);

        Assert.Equal("ready", ready.Status);
        Assert.True(ready.DatabaseConnected);
        Assert.Equal("degraded", notReady.Status);
        Assert.False(notReady.DatabaseConnected);
    }

    [Fact]
    public void Staff_user_validation_requires_identity_fields_and_known_role()
    {
        var result = StaffUserRules.ValidateCreate(new CreateStaffUserRequest("", " ", "", "Unknown"), SeedData.Roles);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "staff_email_required");
        Assert.Contains(result.Errors, error => error.Code == "staff_display_name_required");
        Assert.Contains(result.Errors, error => error.Code == "staff_password_required");
        Assert.Contains(result.Errors, error => error.Code == "staff_role_invalid");
    }

    [Fact]
    public void Staff_role_update_validation_requires_at_least_one_known_role()
    {
        var emptyResult = StaffUserRules.ValidateRoleUpdate(new UpdateStaffUserRolesRequest([]), SeedData.Roles);
        var invalidResult = StaffUserRules.ValidateRoleUpdate(new UpdateStaffUserRolesRequest(["Finance", "Unknown"]), SeedData.Roles);

        Assert.False(emptyResult.IsValid);
        Assert.Contains(emptyResult.Errors, error => error.Code == "staff_roles_required");
        Assert.False(invalidResult.IsValid);
        Assert.Contains(invalidResult.Errors, error => error.Code == "staff_role_invalid");
    }

    [Fact]
    public void Staff_password_reset_validation_requires_strong_new_password()
    {
        var emptyResult = StaffUserRules.ValidatePasswordReset(new ResetStaffPasswordRequest(" "));
        var shortResult = StaffUserRules.ValidatePasswordReset(new ResetStaffPasswordRequest("short"));
        var validResult = StaffUserRules.ValidatePasswordReset(new ResetStaffPasswordRequest("NewPass123!"));

        Assert.False(emptyResult.IsValid);
        Assert.Contains(emptyResult.Errors, error => error.Code == "staff_password_required");
        Assert.False(shortResult.IsValid);
        Assert.Contains(shortResult.Errors, error => error.Code == "staff_password_too_short");
        Assert.True(validResult.IsValid);
    }

    [Fact]
    public void Department_access_allows_loan_staff_to_read_customers_for_loan_selection()
    {
        Assert.Contains("Loan", DepartmentAccess.CustomerReaders);
        Assert.Contains("Sales", DepartmentAccess.CustomerReaders);
        Assert.Contains("Finance", DepartmentAccess.CustomerReaders);
        Assert.Contains("BossAdmin", DepartmentAccess.CustomerReaders);
    }

    [Fact]
    public void Department_access_allows_workflow_staff_to_read_vehicle_lookup_without_mutation_rights()
    {
        Assert.Contains("Sales", DepartmentAccess.VehicleReaders);
        Assert.Contains("Loan", DepartmentAccess.VehicleReaders);
        Assert.Contains("Delivery", DepartmentAccess.VehicleReaders);
        Assert.Contains("Finance", DepartmentAccess.VehicleReaders);
        Assert.Contains("Repair", DepartmentAccess.VehicleReaders);
        Assert.Contains("BossAdmin", DepartmentAccess.VehicleWriters);
        Assert.Contains("Sales", DepartmentAccess.VehicleWriters);
        Assert.DoesNotContain("Loan", DepartmentAccess.VehicleWriters);
        Assert.DoesNotContain("Finance", DepartmentAccess.VehicleWriters);
    }

    [Fact]
    public void Department_access_limits_full_vehicle_records_to_vehicle_writers()
    {
        Assert.True(DepartmentAccess.CanReadFullVehicleRecords("BossAdmin"));
        Assert.True(DepartmentAccess.CanReadFullVehicleRecords("Sales"));
        Assert.False(DepartmentAccess.CanReadFullVehicleRecords("Loan"));
        Assert.False(DepartmentAccess.CanReadFullVehicleRecords("Delivery"));
        Assert.False(DepartmentAccess.CanReadFullVehicleRecords("Finance"));
        Assert.False(DepartmentAccess.CanReadFullVehicleRecords("Repair"));
    }

    [Fact]
    public void Department_access_allows_document_uploads_by_workflow_category()
    {
        Assert.True(DepartmentAccess.CanUploadDocument(["Sales"], FileCategory.Voc));
        Assert.True(DepartmentAccess.CanUploadDocument(["Loan"], FileCategory.LoanDocument));
        Assert.True(DepartmentAccess.CanUploadDocument(["Delivery"], FileCategory.Policy));
        Assert.True(DepartmentAccess.CanUploadDocument(["Delivery"], FileCategory.RoadTaxReceipt));
        Assert.True(DepartmentAccess.CanUploadDocument(["Repair"], FileCategory.RepairInvoice));
        Assert.True(DepartmentAccess.CanUploadDocument(["Finance"], FileCategory.PaymentReceipt));
        Assert.True(DepartmentAccess.CanUploadDocument(["Finance"], FileCategory.PaymentInvoice));
        Assert.True(DepartmentAccess.CanUploadDocument(["BossAdmin"], FileCategory.Policy));
        Assert.False(DepartmentAccess.CanUploadDocument(["Loan"], FileCategory.Policy));
        Assert.False(DepartmentAccess.CanUploadDocument(["Delivery"], FileCategory.PurchaseInvoice));
        Assert.False(DepartmentAccess.CanUploadDocument(["Sales"], FileCategory.PaymentReceipt));
    }

    [Fact]
    public void Reminder_worker_retries_when_database_schema_is_not_ready()
    {
        Assert.True(ReminderWorkerPolicy.IsMissingSchemaErrorCode("42P01"));
        Assert.False(ReminderWorkerPolicy.IsMissingSchemaErrorCode("23505"));
    }

    [Fact]
    public void Payment_bank_follow_up_is_due_on_or_before_follow_up_date()
    {
        var payment = new PaymentRecord
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            NettPrice = 58000m,
            Status = PaymentStatus.Disbursed,
            BankName = "Maybank",
            BankFollowUpDate = new DateOnly(2026, 6, 1)
        };

        Assert.True(ReminderRules.IsPaymentBankFollowUpDue(payment, new DateOnly(2026, 6, 1)));
        Assert.False(ReminderRules.IsPaymentBankFollowUpDue(payment, new DateOnly(2026, 5, 31)));
        Assert.False(ReminderRules.IsPaymentBankFollowUpDue(payment with { Status = PaymentStatus.Reconciled }, new DateOnly(2026, 6, 1)));
    }

    [Fact]
    public void Payment_status_follow_up_is_due_for_unreconciled_workflow_statuses()
    {
        var payment = new PaymentRecord
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            NettPrice = 58000m,
            Status = PaymentStatus.Approved,
            CreatedAt = new DateTime(2026, 6, 1, 8, 30, 0, DateTimeKind.Utc)
        };

        Assert.True(ReminderRules.IsPaymentStatusFollowUpDue(payment, new DateOnly(2026, 6, 1)));
        Assert.False(ReminderRules.IsPaymentStatusFollowUpDue(payment, new DateOnly(2026, 5, 31)));
        Assert.False(ReminderRules.IsPaymentStatusFollowUpDue(payment with { Status = PaymentStatus.Reconciled }, new DateOnly(2026, 6, 1)));
    }
}

internal static class VehicleSeed
{
    public static Vehicle Available(bool publicVisible) => new()
    {
        Id = Guid.NewGuid(),
        PlateNumber = "VPK1234",
        Make = "Toyota",
        Model = "Vios",
        Year = 2021,
        StockOwner = StockOwner.YSHeng,
        Status = VehicleStatus.Available,
        IsPublic = publicVisible,
        PurchasePrice = 42000m,
        SellingPrice = 58000m,
        BossConfirmed = true,
        ContraRangePrice = 56000m,
        UcdStatus = "Ready"
    };

    public static Vehicle Sold(bool publicVisible) => Available(publicVisible) with { Status = VehicleStatus.Sold };

    public static Vehicle LoanProcessing(bool publicVisible) => Available(publicVisible) with { Status = VehicleStatus.LoanProcessing };
}
