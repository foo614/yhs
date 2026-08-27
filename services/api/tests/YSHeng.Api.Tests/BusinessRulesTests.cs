using System.Security.Claims;
using System.Net;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class BusinessRulesTests
{
    [Fact]
    public void Ai_usage_limit_validation_allows_zero_as_a_hard_stop_and_rejects_invalid_limits()
    {
        Assert.Empty(AiUsageLimitRules.Validate(new UpdateAiServiceLimitRequest(true, 0, 0)));

        var errors = AiUsageLimitRules.Validate(new UpdateAiServiceLimitRequest(true, -1, 10_001));

        Assert.Equal(2, errors.Length);
    }

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
            VehicleSeed.Available(publicVisible: true) with { BossConfirmed = false },
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
    public void Vehicle_approval_can_only_change_for_boss_admin_and_unapproved_stock_is_private()
    {
        var pending = VehicleSeed.Available(publicVisible: true) with { BossConfirmed = false };
        var approved = pending with { BossConfirmed = true };

        var salesCreate = VehicleApprovalRules.ValidateCreate(approved, canApprove: false);
        var salesUpdate = VehicleApprovalRules.ValidateUpdate(pending, approved, canApprove: false);
        var adminUpdate = VehicleApprovalRules.ValidateUpdate(pending, approved, canApprove: true);
        var gated = VehicleApprovalRules.EnforceVisibility(pending);

        Assert.Contains(salesCreate.Errors, error => error.Code == "vehicle_approval_admin_required");
        Assert.Contains(salesUpdate.Errors, error => error.Code == "vehicle_approval_admin_required");
        Assert.True(adminUpdate.IsValid);
        Assert.False(gated.IsPublic);
    }

    [Fact]
    public void Vehicle_crud_cannot_claim_workflow_owned_statuses()
    {
        var existing = VehicleSeed.Available(publicVisible: false);
        var create = VehicleWorkflowRules.ValidateCreate(existing with { Status = VehicleStatus.LoanProcessing });
        var update = VehicleWorkflowRules.ValidateUpdate(existing, existing with { Status = VehicleStatus.Sold });

        Assert.Contains(create.Errors, error => error.Code == "vehicle_status_workflow_owned");
        Assert.Contains(update.Errors, error => error.Code == "vehicle_status_workflow_owned");
    }

    [Fact]
    public void Vehicle_catalog_normalizes_and_rejects_duplicate_make_model_pairs()
    {
        var existing = new VehicleCatalogModel { Make = "Toyota", Model = "Vios" };
        var incoming = VehicleCatalogRules.Create(new VehicleCatalogModelRequest(" toyota ", " vios "));

        var validation = VehicleCatalogRules.Validate(incoming);

        Assert.True(validation.IsValid);
        Assert.Equal("toyota", incoming.Make);
        Assert.Equal("vios", incoming.Model);
        Assert.True(VehicleCatalogRules.IsDuplicate(incoming, [existing]));
    }

    [Fact]
    public void Vehicle_catalog_public_response_excludes_internal_status()
    {
        var item = new VehicleCatalogModel { Make = "Honda", Model = "City", IsActive = false };

        var response = VehicleCatalogRules.ToPublicResponse(item);

        Assert.Equal("Honda", response.Make);
        Assert.Equal("City", response.Model);
        Assert.DoesNotContain(response.GetType().GetProperties(), property => property.Name == "IsActive");
    }

    [Fact]
    public void Malaysia_vehicle_catalog_seed_is_clean_and_contains_common_local_models()
    {
        var keys = MalaysiaVehicleCatalog.Models
            .Select(item => MalaysiaVehicleCatalog.Key(item.Make, item.Model))
            .ToList();

        Assert.Equal(198, MalaysiaVehicleCatalog.Models.Count);
        Assert.Equal(keys.Count, keys.Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.All(MalaysiaVehicleCatalog.Models, item =>
        {
            Assert.False(string.IsNullOrWhiteSpace(item.Make));
            Assert.False(string.IsNullOrWhiteSpace(item.Model));
        });
        Assert.Contains(("Perodua", "Myvi"), MalaysiaVehicleCatalog.Models);
        Assert.Contains(("Proton", "Saga"), MalaysiaVehicleCatalog.Models);
        Assert.Contains(("Toyota", "Vios"), MalaysiaVehicleCatalog.Models);
        Assert.Contains(("Honda", "City"), MalaysiaVehicleCatalog.Models);
    }

    [Fact]
    public void Public_vehicle_response_excludes_internal_pricing_fields()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            CustomerId = Guid.NewGuid(),
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
    public void Public_vehicle_detail_response_includes_only_the_marketing_description()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            PublicDescriptionMarkdown = "## Ready stock\n\n- Reverse camera",
            PurchasePrice = 42000m,
            CommissionTotal = 1200m
        };

        var result = PublicInventory.ToDetailResponse(vehicle);

        Assert.Equal(vehicle.PublicDescriptionMarkdown, result.DescriptionMarkdown);
        Assert.DoesNotContain(result.GetType().GetProperties(), property => property.Name is "PurchasePrice" or "CommissionTotal" or "IsPublic");
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
        Assert.Equal(vehicle.CustomerId, result.CustomerId);
        Assert.DoesNotContain(result.GetType().GetProperties(), property => property.Name is "PurchasePrice" or "SellingPrice" or "AdditionalCharges" or "RefurbishmentTotal" or "CommissionTotal" or "IsPublic");
    }

    [Fact]
    public void Customer_profile_uses_the_canonical_customer_id_and_scopes_sensitive_sections_by_role()
    {
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789", IcNumber = "900101-01-1234", Email = "ali@example.test", Address = "Demo address" };
        var vehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = customer.Id, PlateNumber = "WXY1234" };
        var loan = new LoanApplication { CustomerId = customer.Id, VehicleId = vehicle.Id, Status = LoanStatus.Pending };
        var delivery = new DeliverySchedule { VehicleId = vehicle.Id, Pic = "Delivery Team", ScheduledDate = new DateOnly(2026, 8, 20), Status = DeliveryStatus.Scheduled, InsuranceHandled = true };
        var payment = new PaymentRecord { VehicleId = vehicle.Id, NettPrice = 55000m, Status = PaymentStatus.Approved, ReceiptNumber = "R-100" };
        var invoice = new FinanceInvoice { CustomerId = customer.Id, VehicleId = vehicle.Id, PaymentRecordId = payment.Id, InvoiceNumber = "INV-100", Amount = 55000m };
        var handover = new CashHandover { CustomerId = customer.Id, VehicleId = vehicle.Id, PaymentRecordId = payment.Id, Amount = 55000m, CollectedByUserId = "sales-1" };
        var receipt = new OfficialReceipt { CashHandoverId = handover.Id, PaymentRecordId = payment.Id, ReceiptNumber = "YSR-100", Amount = 55000m };
        var documents = new[]
        {
            new DocumentBlob { VehicleId = vehicle.Id, Category = FileCategory.IdentityCard, FileName = "ic.png", MimeType = "image/png", Checksum = "ic" },
            new DocumentBlob { VehicleId = vehicle.Id, Category = FileCategory.Policy, FileName = "policy.pdf", MimeType = "application/pdf", Checksum = "policy" }
        };
        var lead = new Lead { CustomerId = customer.Id, VehicleId = vehicle.Id, CustomerName = customer.Name, Phone = customer.Phone };

        var deliveryProfile = CustomerProfileFactory.Create(customer, ["Delivery"], [vehicle], [loan], [delivery], [payment], [invoice], [handover], [receipt], documents, [lead]);
        var financeProfile = CustomerProfileFactory.Create(customer, ["Finance"], [vehicle], [loan], [delivery], [payment], [invoice], [handover], [receipt], documents, [lead]);

        Assert.Equal(customer.Id, deliveryProfile.Contact.Id);
        Assert.Equal(customer.Name, deliveryProfile.Contact.Name);
        Assert.Equal(customer.Phone, deliveryProfile.Contact.Phone);
        Assert.Null(deliveryProfile.Contact.IcNumber);
        Assert.Null(deliveryProfile.Contact.Email);
        Assert.Empty(deliveryProfile.Loans);
        Assert.Single(deliveryProfile.Deliveries);
        Assert.Empty(deliveryProfile.Payments);
        Assert.Empty(deliveryProfile.Enquiries);
        Assert.Single(deliveryProfile.Documents);
        Assert.Equal(FileCategory.Policy, deliveryProfile.Documents[0].Category);
        Assert.Contains(deliveryProfile.MissingDocuments, item => item.Category == FileCategory.RoadTaxReceipt);

        Assert.Equal(customer.IcNumber, financeProfile.Contact.IcNumber);
        Assert.Single(financeProfile.Payments);
        Assert.Single(financeProfile.Invoices);
        Assert.Single(financeProfile.OfficialReceipts);
        Assert.Empty(financeProfile.Deliveries);
        Assert.Empty(financeProfile.Documents);
        Assert.Empty(financeProfile.Enquiries);
    }

    [Fact]
    public void Customer_profile_includes_an_unassigned_vehicle_linked_by_loan_without_cross_linking_other_customers()
    {
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var otherCustomer = new Customer { Id = Guid.NewGuid(), Name = "Bea Lim", Phone = "0198765432" };
        var legacyVehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = null, PlateNumber = "WXY1234" };
        var otherVehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = otherCustomer.Id, PlateNumber = "ABC5678" };
        var legacyLoan = new LoanApplication { CustomerId = customer.Id, VehicleId = legacyVehicle.Id, Status = LoanStatus.Draft };
        var profile = CustomerProfileFactory.Create(
            customer,
            ["BossAdmin"],
            [legacyVehicle, otherVehicle],
            [legacyLoan],
            [new DeliverySchedule { VehicleId = legacyVehicle.Id, Pic = "Delivery", ScheduledDate = new DateOnly(2026, 8, 20) }, new DeliverySchedule { VehicleId = otherVehicle.Id, Pic = "Delivery", ScheduledDate = new DateOnly(2026, 8, 21) }],
            [new PaymentRecord { VehicleId = legacyVehicle.Id }, new PaymentRecord { VehicleId = otherVehicle.Id }],
            [],
            [],
            [],
            [new DocumentBlob { VehicleId = legacyVehicle.Id, Category = FileCategory.Voc }, new DocumentBlob { VehicleId = otherVehicle.Id, Category = FileCategory.Voc }],
            []);

        Assert.Equal([legacyVehicle.Id], profile.Vehicles.Select(vehicle => vehicle.Id));
        Assert.Equal([legacyVehicle.Id], profile.Deliveries.Select(delivery => delivery.VehicleId));
        Assert.Equal([legacyVehicle.Id], profile.Payments.Select(payment => payment.VehicleId));
        Assert.Equal([legacyVehicle.Id], profile.Documents.Select(document => document.VehicleId));
    }

    [Fact]
    public void Customer_profile_excludes_an_unassigned_vehicle_with_loans_for_multiple_customers()
    {
        var firstCustomer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var secondCustomer = new Customer { Id = Guid.NewGuid(), Name = "Bea Lim", Phone = "0198765432" };
        var legacyVehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = null };
        var firstLoan = new LoanApplication { CustomerId = firstCustomer.Id, VehicleId = legacyVehicle.Id, Status = LoanStatus.Draft };
        var secondLoan = new LoanApplication { CustomerId = secondCustomer.Id, VehicleId = legacyVehicle.Id, Status = LoanStatus.Draft };

        var firstProfile = CustomerProfileFactory.Create(firstCustomer, ["BossAdmin"], [legacyVehicle], [firstLoan, secondLoan], [], [], [], [], [], [], []);
        var secondProfile = CustomerProfileFactory.Create(secondCustomer, ["BossAdmin"], [legacyVehicle], [firstLoan, secondLoan], [], [], [], [], [], [], []);

        Assert.Empty(firstProfile.Vehicles);
        Assert.Empty(firstProfile.Loans);
        Assert.Empty(secondProfile.Vehicles);
        Assert.Empty(secondProfile.Loans);
    }

    [Fact]
    public void Customer_profile_scopes_voc_reminders_to_each_linked_vehicle()
    {
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var vehicleWithVoc = VehicleSeed.Available(publicVisible: false) with { CustomerId = customer.Id, PlateNumber = "WXY1234" };
        var vehicleMissingVoc = VehicleSeed.Available(publicVisible: false) with { CustomerId = customer.Id, PlateNumber = "ABC5678" };

        var profile = CustomerProfileFactory.Create(
            customer,
            ["Sales"],
            [vehicleWithVoc, vehicleMissingVoc],
            [],
            [],
            [],
            [],
            [],
            [],
            [new DocumentBlob { VehicleId = vehicleWithVoc.Id, Category = FileCategory.Voc }],
            []);

        var vocReminders = profile.MissingDocuments.Where(item => item.Category == FileCategory.Voc).ToList();
        var reminder = Assert.Single(vocReminders);
        Assert.Equal(vehicleMissingVoc.Id, reminder.VehicleId);
    }

    [Fact]
    public void Customer_profile_options_keep_duplicate_names_distinct_by_id()
    {
        var first = new Customer { Id = Guid.NewGuid(), Name = "Alex Lim", Phone = "0111111111" };
        var second = new Customer { Id = Guid.NewGuid(), Name = "Alex Lim", Phone = "0222222222" };

        var options = CustomerProfileFactory.CreateOptions([first, second]);

        Assert.Equal(2, options.Count);
        Assert.Contains(options, option => option.Id == first.Id && option.Name == "Alex Lim");
        Assert.Contains(options, option => option.Id == second.Id && option.Name == "Alex Lim");
    }

    [Fact]
    public void Lead_capture_requires_customer_contact_and_vehicle()
    {
        var request = new LeadRequest(Guid.NewGuid(), "Ali Tan", "0123456789", "Trade-in question", " /vehicles/abc?utm_source=fb ", " https://example.test/ad ", " utm_source=fb ");

        var lead = LeadCapture.Create(request);

        Assert.Equal(request.VehicleId, lead.VehicleId);
        Assert.Equal("Ali Tan", lead.CustomerName);
        Assert.Equal("0123456789", lead.Phone);
        Assert.Equal("/vehicles/abc?utm_source=fb", lead.SourcePage);
        Assert.Equal("https://example.test/ad", lead.SourceReferrer);
        Assert.Equal("utm_source=fb", lead.SourceCampaign);
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
    public void Public_lead_validation_rejects_unapproved_vehicle()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true) with { BossConfirmed = false };
        var request = new LeadRequest(vehicle.Id, "Ali Tan", "0123456789", "Trade-in question");

        var result = WorkflowReferenceRules.ValidatePublicLead(request, [vehicle]);

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
    public void Public_contact_enquiry_requires_customer_contact_and_message()
    {
        var request = new ContactEnquiryRequest(" Ali Tan ", " 0123456789 ", " Trade-in question ", " /contact ");

        var validation = WorkflowReferenceRules.ValidatePublicContactEnquiry(request);
        var lead = LeadCapture.CreateContactEnquiry(request);

        Assert.True(validation.IsValid);
        Assert.Equal(Guid.Empty, lead.VehicleId);
        Assert.Equal("Ali Tan", lead.CustomerName);
        Assert.Equal("0123456789", lead.Phone);
        Assert.Equal("Trade-in question", lead.Message);
        Assert.Equal("/contact", lead.SourcePage);
    }

    [Fact]
    public void Public_contact_enquiry_validation_requires_customer_contact_and_message()
    {
        var result = WorkflowReferenceRules.ValidatePublicContactEnquiry(new ContactEnquiryRequest(" ", "", " "));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "customer_name_required");
        Assert.Contains(result.Errors, error => error.Code == "phone_required");
        Assert.Contains(result.Errors, error => error.Code == "message_required");
    }

    [Fact]
    public void Showroom_enquiry_captures_a_general_lead_with_a_server_owned_qr_source()
    {
        var request = new ShowroomEnquiryRequest(" SUV ", " Toyota ", " Harrier ", " RM50k–RM80k ", " Ali Tan ", " 0123456789 ", " ali@example.com ");

        var validation = WorkflowReferenceRules.ValidateShowroomEnquiry(request);
        var lead = LeadCapture.CreateShowroomEnquiry(request);

        Assert.True(validation.IsValid);
        Assert.Equal(Guid.Empty, lead.VehicleId);
        Assert.Equal("Ali Tan", lead.CustomerName);
        Assert.Equal("0123456789", lead.Phone);
        Assert.Equal("in-store-qr", lead.SourceCampaign);
        Assert.Equal("/showroom-enquiry", lead.SourcePage);
        Assert.Contains("Vehicle type: SUV", lead.Message);
        Assert.Contains("Email: ali@example.com", lead.Message);
    }

    [Fact]
    public void Showroom_enquiry_rejects_invalid_choices_and_contact_details()
    {
        var result = WorkflowReferenceRules.ValidateShowroomEnquiry(new ShowroomEnquiryRequest("Coupe", "", "", "Any budget", "", "", "not-an-email"));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "vehicle_type_invalid");
        Assert.Contains(result.Errors, error => error.Code == "budget_range_invalid");
        Assert.Contains(result.Errors, error => error.Code == "customer_name_required");
        Assert.Contains(result.Errors, error => error.Code == "phone_required");
        Assert.Contains(result.Errors, error => error.Code == "email_invalid");
    }

    [Fact]
    public void Public_contact_enquiry_message_is_limited_to_2000_characters()
    {
        var result = WorkflowReferenceRules.ValidatePublicContactEnquiry(new ContactEnquiryRequest("Ali Tan", "0123456789", new string('x', 2001)));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "message_too_long");
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
    public void Backoffice_lead_status_change_requires_original_taker()
    {
        var existing = new Lead
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            CustomerName = "Ali Tan",
            Phone = "0123456789",
            Status = LeadStatus.Contacted,
            TakenByUserId = "staff-1",
            TakenByName = "Jason Tan",
            TakenAt = DateTime.UtcNow.AddHours(-1)
        };
        var incoming = existing with { Status = LeadStatus.Closed };

        var result = LeadRules.ValidateStatusOwner(existing, incoming, "staff-2");

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "lead_assignee_required");
    }

    [Fact]
    public void Backoffice_lead_status_change_allows_original_taker()
    {
        var existing = new Lead
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            CustomerName = "Ali Tan",
            Phone = "0123456789",
            Status = LeadStatus.Contacted,
            TakenByUserId = "staff-1",
            TakenByName = "Jason Tan",
            TakenAt = DateTime.UtcNow.AddHours(-1)
        };
        var incoming = existing with { Status = LeadStatus.Closed };

        var result = LeadRules.ValidateStatusOwner(existing, incoming, "staff-1");

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Backoffice_lead_update_assigns_first_taker_on_status_change()
    {
        var createdAt = DateTime.UtcNow.AddDays(-2);
        var existing = new Lead
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            CustomerName = "Ali Tan",
            Phone = "0123456789",
            Status = LeadStatus.New,
            CreatedAt = createdAt,
            SourcePage = "/vehicles/vehicle-1",
            SourceReferrer = "https://example.test/",
            SourceCampaign = "utm_source=facebook"
        };
        var incoming = existing with { Status = LeadStatus.Contacted };
        var takenAt = DateTime.UtcNow;

        var result = LeadRules.ApplyBackOfficeUpdate(existing, incoming, "staff-1", "Jason Tan", takenAt);

        Assert.Equal(LeadStatus.Contacted, result.Status);
        Assert.Equal(createdAt, result.CreatedAt);
        Assert.Equal("/vehicles/vehicle-1", result.SourcePage);
        Assert.Equal("https://example.test/", result.SourceReferrer);
        Assert.Equal("utm_source=facebook", result.SourceCampaign);
        Assert.Equal("staff-1", result.TakenByUserId);
        Assert.Equal("Jason Tan", result.TakenByName);
        Assert.Equal(takenAt, result.TakenAt);
    }

    [Fact]
    public void Backoffice_lead_update_clears_taker_when_released_to_new()
    {
        var existing = new Lead
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            CustomerName = "Ali Tan",
            Phone = "0123456789",
            Status = LeadStatus.Contacted,
            TakenByUserId = "staff-1",
            TakenByName = "Jason Tan",
            TakenAt = DateTime.UtcNow.AddHours(-1)
        };
        var incoming = existing with { Status = LeadStatus.New };

        var result = LeadRules.ApplyBackOfficeUpdate(existing, incoming, "staff-1", "Jason Tan", DateTime.UtcNow);

        Assert.Equal(LeadStatus.New, result.Status);
        Assert.Null(result.TakenByUserId);
        Assert.Null(result.TakenByName);
        Assert.Null(result.TakenAt);
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
    public void Hr_payslip_uses_working_days_for_daily_salary_and_unpaid_leave()
    {
        var profile = new HrPayrollProfile
        {
            StaffUserId = "staff-1",
            MonthlyBaseSalary = 2200m,
            OvertimeHours = 2m,
            OvertimeRate = 15m,
            Allowances = 100m,
            ManualDeductions = 20m
        };
        var period = new HrPayPeriod
        {
            Id = Guid.NewGuid(),
            Name = "June 2026",
            StartDate = new DateOnly(2026, 6, 1),
            EndDate = new DateOnly(2026, 6, 30),
            WorkingDays = 22
        };
        var leave = new HrLeaveRequest
        {
            StaffUserId = "staff-1",
            Type = HrLeaveType.UnpaidLeave,
            Status = HrLeaveStatus.Approved,
            StartDate = new DateOnly(2026, 6, 10),
            EndDate = new DateOnly(2026, 6, 10),
            Days = 1m
        };

        var payslip = HrRules.GeneratePayslip(profile, period, [leave]);

        Assert.Equal(100m, payslip.DailySalary);
        Assert.Equal(100m, payslip.UnpaidLeaveDeduction);
        Assert.Equal(2330m, payslip.GrossPay);
        Assert.Equal(2210m, payslip.NetPay);
    }

    [Fact]
    public void Hr_hourly_payslip_uses_completed_eligible_attendance_with_allowances_and_deductions()
    {
        var profile = new HrPayrollProfile
        {
            StaffUserId = "daily-worker",
            EmploymentType = HrEmploymentType.Hourly,
            HourlyRate = 10m,
            Allowances = 5m,
            ManualDeductions = 3m
        };
        var period = new HrPayPeriod
        {
            Id = Guid.NewGuid(),
            Name = "June 2026",
            StartDate = new DateOnly(2026, 6, 1),
            EndDate = new DateOnly(2026, 6, 30),
            WorkingDays = 22
        };
        var attendance = new[]
        {
            new HrAttendanceRecord { StaffUserId = "daily-worker", AttendanceDate = new DateOnly(2026, 6, 2), Status = HrAttendanceStatus.Present, CheckInAt = new DateTime(2026, 6, 2, 9, 0, 0, DateTimeKind.Utc), CheckOutAt = new DateTime(2026, 6, 2, 17, 0, 0, DateTimeKind.Utc) },
            new HrAttendanceRecord { StaffUserId = "daily-worker", AttendanceDate = new DateOnly(2026, 6, 3), Status = HrAttendanceStatus.Late, CheckInAt = new DateTime(2026, 6, 3, 10, 0, 0, DateTimeKind.Utc), CheckOutAt = new DateTime(2026, 6, 3, 14, 0, 0, DateTimeKind.Utc) },
            new HrAttendanceRecord { StaffUserId = "daily-worker", AttendanceDate = new DateOnly(2026, 6, 4), Status = HrAttendanceStatus.Absent, CheckInAt = new DateTime(2026, 6, 4, 9, 0, 0, DateTimeKind.Utc), CheckOutAt = new DateTime(2026, 6, 4, 18, 0, 0, DateTimeKind.Utc) },
            new HrAttendanceRecord { StaffUserId = "daily-worker", AttendanceDate = new DateOnly(2026, 7, 1), Status = HrAttendanceStatus.Present, CheckInAt = new DateTime(2026, 7, 1, 9, 0, 0, DateTimeKind.Utc), CheckOutAt = new DateTime(2026, 7, 1, 13, 0, 0, DateTimeKind.Utc) }
        };

        var payslip = HrRules.GeneratePayslip(profile, period, [], attendance);

        Assert.Equal(HrEmploymentType.Hourly, payslip.EmploymentType);
        Assert.Equal(12m, payslip.WorkedHours);
        Assert.Equal(120m, payslip.AttendancePay);
        Assert.Equal(125m, payslip.GrossPay);
        Assert.Equal(122m, payslip.NetPay);
    }

    [Fact]
    public void Hr_attendance_network_matches_active_cidr_without_accepting_other_ranges()
    {
        var networks = new[]
        {
            new HrAttendanceNetwork { Label = "Showroom", Cidr = "203.0.113.0/24", IsActive = true },
            new HrAttendanceNetwork { Label = "Old office", Cidr = "198.51.100.0/24", IsActive = false }
        };

        Assert.Equal("Showroom", HrRules.FindMatchingAttendanceNetwork(IPAddress.Parse("203.0.113.42"), networks)?.Label);
        Assert.Null(HrRules.FindMatchingAttendanceNetwork(IPAddress.Parse("198.51.100.42"), networks));
        Assert.Null(HrRules.FindMatchingAttendanceNetwork(IPAddress.Parse("192.0.2.42"), networks));
        Assert.False(HrRules.ValidateAttendanceNetwork(new HrAttendanceNetwork { Label = "Bad", Cidr = "203.0.113.0/99" }).IsValid);
    }

    [Fact]
    public void Hr_leave_approval_updates_al_and_mc_balances_only()
    {
        var balance = new HrLeaveBalance { StaffUserId = "staff-1", AnnualLeaveDays = 8m, MedicalLeaveDays = 14m };

        var annual = HrRules.ApplyApprovedLeave(balance, new HrLeaveRequest { StaffUserId = "staff-1", Type = HrLeaveType.AnnualLeave, Status = HrLeaveStatus.Approved, Days = 2m });
        var medical = HrRules.ApplyApprovedLeave(annual, new HrLeaveRequest { StaffUserId = "staff-1", Type = HrLeaveType.MedicalLeave, Status = HrLeaveStatus.Approved, Days = 1m });
        var unpaid = HrRules.ApplyApprovedLeave(medical, new HrLeaveRequest { StaffUserId = "staff-1", Type = HrLeaveType.UnpaidLeave, Status = HrLeaveStatus.Approved, Days = 1m });

        Assert.Equal(6m, unpaid.AnnualLeaveDays);
        Assert.Equal(13m, unpaid.MedicalLeaveDays);
    }

    [Fact]
    public void Hr_leave_cancellation_only_allows_pending_requests()
    {
        var pending = HrRules.ValidateLeaveCancellation(new HrLeaveRequest { StaffUserId = "staff-1", Status = HrLeaveStatus.Pending, StartDate = new DateOnly(2026, 6, 10), EndDate = new DateOnly(2026, 6, 10), Days = 1m });
        var approved = HrRules.ValidateLeaveCancellation(new HrLeaveRequest { StaffUserId = "staff-1", Status = HrLeaveStatus.Approved, StartDate = new DateOnly(2026, 6, 10), EndDate = new DateOnly(2026, 6, 10), Days = 1m });

        Assert.True(pending.IsValid);
        Assert.False(approved.IsValid);
    }

    [Fact]
    public void Hr_attendance_rejects_check_in_when_session_is_open()
    {
        var openSession = new HrAttendanceRecord
        {
            StaffUserId = "staff-1",
            AttendanceDate = new DateOnly(2026, 6, 7),
            CheckInAt = new DateTime(2026, 6, 7, 9, 0, 0, DateTimeKind.Utc)
        };

        var result = HrRules.ValidateCheckIn(openSession);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "attendance_open_session_exists");
    }

    [Fact]
    public void Hr_attendance_allows_check_in_after_previous_session_closed()
    {
        var result = HrRules.ValidateCheckIn(null);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Hr_attendance_requires_check_in_before_check_out()
    {
        var result = HrRules.ValidateCheckOut(null);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "attendance_open_session_required");
    }

    [Fact]
    public void Hr_attendance_allows_check_out_for_open_session()
    {
        var openSession = new HrAttendanceRecord
        {
            StaffUserId = "staff-1",
            AttendanceDate = new DateOnly(2026, 6, 7),
            CheckInAt = new DateTime(2026, 6, 7, 9, 0, 0, DateTimeKind.Utc)
        };

        var result = HrRules.ValidateCheckOut(openSession);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Hr_attendance_qr_validation_requires_a_token_and_valid_action()
    {
        var result = HrRules.ValidateAttendanceQrRedemption(new HrAttendanceQrRedemptionRequest("", (HrAttendanceAction)99));

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "attendance_qr_token_required");
        Assert.Contains(result.Errors, error => error.Code == "attendance_qr_action_invalid");
    }

    [Fact]
    public void Hr_attendance_qr_hash_is_deterministic_without_exposing_the_token()
    {
        const string token = "test-office-token";

        var first = HrRules.HashAttendanceQrToken(token);
        var second = HrRules.HashAttendanceQrToken(token);

        Assert.Equal(first, second);
        Assert.NotEqual(token, first);
        Assert.DoesNotContain("/", first);
    }

    [Fact]
    public void Hr_leave_decision_rejects_already_decided_request()
    {
        var existing = new HrLeaveRequest
        {
            StaffUserId = "staff-1",
            Type = HrLeaveType.AnnualLeave,
            Status = HrLeaveStatus.Approved,
            StartDate = new DateOnly(2026, 6, 8),
            EndDate = new DateOnly(2026, 6, 8),
            Days = 1m
        };

        var result = HrRules.ValidateLeaveDecision(existing);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "leave_already_decided");
    }

    [Fact]
    public void Hr_medical_certificate_upload_requires_medical_leave()
    {
        var existing = new HrLeaveRequest
        {
            StaffUserId = "staff-1",
            Type = HrLeaveType.AnnualLeave,
            Status = HrLeaveStatus.Pending,
            StartDate = new DateOnly(2026, 6, 8),
            EndDate = new DateOnly(2026, 6, 8),
            Days = 1m
        };

        var result = HrRules.ValidateMedicalCertificateUpload(existing);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "mc_only_for_medical_leave");
    }

    [Fact]
    public void Hr_access_allows_owner_or_hr_manager_only()
    {
        var owner = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "staff-1")], "Test"));
        var otherStaff = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "staff-2")], "Test"));
        var hr = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "hr-1"), new Claim(ClaimTypes.Role, "HrSalary")], "Test"));

        Assert.True(DepartmentAccess.CanAccessHrStaff(owner, "staff-1"));
        Assert.False(DepartmentAccess.CanAccessHrStaff(otherStaff, "staff-1"));
        Assert.True(DepartmentAccess.CanAccessHrStaff(hr, "staff-1"));
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
    public void Vehicle_customer_reassignment_rejects_conflicting_existing_loan()
    {
        var loanCustomer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var differentCustomer = new Customer { Id = Guid.NewGuid(), Name = "Bea Lim", Phone = "0198765432" };
        var vehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = differentCustomer.Id };
        var loan = new LoanApplication { VehicleId = vehicle.Id, CustomerId = loanCustomer.Id, Status = LoanStatus.Pending };

        var result = VehicleRules.ValidateContactLinks(vehicle, [loanCustomer, differentCustomer], [], [loan]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "vehicle_customer_loan_mismatch");
    }

    [Fact]
    public void Vehicle_customer_cannot_be_cleared_while_an_active_loan_exists()
    {
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var vehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = null };
        var loan = new LoanApplication { VehicleId = vehicle.Id, CustomerId = customer.Id, Status = LoanStatus.Pending };

        var result = VehicleRules.ValidateContactLinks(vehicle, [customer], [], [loan]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "vehicle_customer_active_loan_required");
    }

    [Fact]
    public void Rejected_loan_does_not_block_vehicle_customer_reassignment()
    {
        var formerCustomer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var newCustomer = new Customer { Id = Guid.NewGuid(), Name = "Bea Lim", Phone = "0198765432" };
        var vehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = newCustomer.Id };
        var rejectedLoan = new LoanApplication { VehicleId = vehicle.Id, CustomerId = formerCustomer.Id, Status = LoanStatus.Rejected };

        var result = VehicleRules.ValidateContactLinks(vehicle, [formerCustomer, newCustomer], [], [rejectedLoan]);

        Assert.True(result.IsValid);
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
    public void Loan_validation_rejects_a_vehicle_assigned_to_another_customer_but_allows_an_unassigned_legacy_vehicle()
    {
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var otherCustomer = new Customer { Id = Guid.NewGuid(), Name = "Bea Lim", Phone = "0198765432" };
        var assignedVehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = otherCustomer.Id };
        var unassignedVehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = null };
        var mismatchedLoan = new LoanApplication { VehicleId = assignedVehicle.Id, CustomerId = customer.Id };
        var legacyLoan = new LoanApplication { VehicleId = unassignedVehicle.Id, CustomerId = customer.Id };

        var mismatchResult = WorkflowReferenceRules.ValidateLoan(mismatchedLoan, [assignedVehicle, unassignedVehicle], [customer, otherCustomer]);
        var legacyResult = WorkflowReferenceRules.ValidateLoan(legacyLoan, [assignedVehicle, unassignedVehicle], [customer, otherCustomer]);

        Assert.Contains(mismatchResult.Errors, error => error.Code == "vehicle_customer_mismatch");
        Assert.True(legacyResult.IsValid);
    }

    [Fact]
    public void Loan_validation_rejects_a_second_customer_for_an_unassigned_vehicle()
    {
        var firstCustomer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var secondCustomer = new Customer { Id = Guid.NewGuid(), Name = "Bea Lim", Phone = "0198765432" };
        var legacyVehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = null };
        var firstLoan = new LoanApplication { CustomerId = firstCustomer.Id, VehicleId = legacyVehicle.Id, Status = LoanStatus.Pending };
        var secondLoan = new LoanApplication { CustomerId = secondCustomer.Id, VehicleId = legacyVehicle.Id };

        var result = WorkflowReferenceRules.ValidateLoan(secondLoan, [legacyVehicle], [firstCustomer, secondCustomer], [firstLoan]);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "legacy_vehicle_customer_conflict");
    }

    [Fact]
    public void Rejected_loan_does_not_reserve_an_unassigned_vehicle_for_its_old_customer()
    {
        var firstCustomer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var secondCustomer = new Customer { Id = Guid.NewGuid(), Name = "Bea Lim", Phone = "0198765432" };
        var vehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = null };
        var rejectedLoan = new LoanApplication { CustomerId = firstCustomer.Id, VehicleId = vehicle.Id, Status = LoanStatus.Rejected };
        var newLoan = new LoanApplication { CustomerId = secondCustomer.Id, VehicleId = vehicle.Id, Status = LoanStatus.Pending, SubmittedAt = new DateOnly(2026, 8, 19) };

        var result = WorkflowReferenceRules.ValidateLoan(newLoan, [vehicle], [firstCustomer, secondCustomer], [rejectedLoan]);

        Assert.True(result.IsValid);
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
    public void Vehicle_intake_validation_limits_public_marketing_description_length()
    {
        var result = VehicleRules.ValidateIntake(VehicleSeed.Available(publicVisible: true) with
        {
            PublicDescriptionMarkdown = new string('x', 6001)
        });

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "public_description_too_long");
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
        Assert.Equal(loan.CustomerId, result.CustomerId);
    }

    [Fact]
    public void Delivery_and_reconciliation_require_a_canonical_existing_buyer()
    {
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var vehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = null };

        var missingBuyer = WorkflowReferenceRules.ValidateCanonicalBuyer(vehicle.Id, [vehicle], [customer], "Delivery");
        var unknownBuyer = WorkflowReferenceRules.ValidateCanonicalBuyer(vehicle.Id, [vehicle with { CustomerId = Guid.NewGuid() }], [customer], "Payment reconciliation");
        var validBuyer = WorkflowReferenceRules.ValidateCanonicalBuyer(vehicle.Id, [vehicle with { CustomerId = customer.Id }], [customer], "Delivery");

        Assert.Contains(missingBuyer.Errors, error => error.Code == "vehicle_customer_required");
        Assert.Contains(unknownBuyer.Errors, error => error.Code == "customer_not_found");
        Assert.True(validBuyer.IsValid);
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
            BossChecked = false
        };

        var result = FinanceRules.ValidatePayment(payment);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "payment_boss_check_required");
    }

    [Fact]
    public void Payment_management_review_is_server_owned_and_material_edits_invalidate_it()
    {
        var payment = new PaymentRecord
        {
            VehicleId = Guid.NewGuid(),
            NettPrice = 58000m,
            BossChecked = true,
            ReceiptNumber = "RCPT-1001",
            InvoiceNumber = "INV-1001"
        };

        var created = PaymentManagementReviewRules.PrepareForCreate(payment);
        var unchanged = PaymentManagementReviewRules.PrepareForUpdate(payment, payment with { BossChecked = false });
        var changedCreatedAt = PaymentManagementReviewRules.PrepareForUpdate(payment, payment with { CreatedAt = payment.CreatedAt.AddDays(7), BossChecked = true });
        var editedAmount = PaymentManagementReviewRules.PrepareForUpdate(payment, payment with { NettPrice = 59000m, BossChecked = true });
        var editedDocuments = PaymentManagementReviewRules.PrepareForUpdate(payment, payment with { DocumentsPrepared = true, BossChecked = true });
        var editedChecklist = PaymentManagementReviewRules.PrepareForUpdate(payment, payment with { ChecklistValidated = true, BossChecked = true });

        Assert.False(created.BossChecked);
        Assert.True(unchanged.BossChecked);
        Assert.Equal(payment.CreatedAt, changedCreatedAt.CreatedAt);
        Assert.True(changedCreatedAt.BossChecked);
        Assert.False(editedAmount.BossChecked);
        Assert.False(editedDocuments.BossChecked);
        Assert.False(editedChecklist.BossChecked);
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
    }

    [Fact]
    public void Reconciled_payment_does_not_require_accounting_system_sync()
    {
        var payment = new PaymentRecord
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            NettPrice = 58000m,
            Status = PaymentStatus.Reconciled,
            ReceiptNumber = "RCPT-1001",
            InvoiceNumber = "INV-1001",
            BossChecked = true,
            DocumentsPrepared = true,
            ChecklistValidated = true
        };

        Assert.True(FinanceRules.ValidatePayment(payment).IsValid);
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
                ChecklistValidated = true
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
            ChecklistValidated = true
        };

        var result = FinanceRules.ValidatePayment(payment, existing);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "duplicate_receipt_number");
        Assert.Contains(result.Errors, error => error.Code == "duplicate_payment_invoice_number");
    }

    [Fact]
    public void Finance_csv_exports_sensitive_payment_rows_with_escaping()
    {
        var vehicle = VehicleSeed.Available(publicVisible: false);
        var payment = new PaymentRecord
        {
            Id = Guid.NewGuid(),
            VehicleId = vehicle.Id,
            NettPrice = 58000m,
            Status = PaymentStatus.Disbursed,
            ReceiptNumber = "RCPT-1001",
            InvoiceNumber = "INV-1001",
            BankName = "Maybank, Kluang"
        };

        var csv = FinanceCsv.ExportPayments([payment], [vehicle]);

        Assert.Contains("PaymentId,CarPlate,Status,NettPrice", csv);
        Assert.Contains("\"Maybank, Kluang\"", csv);
        Assert.Contains(vehicle.PlateNumber, csv);
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
    public void Daily_spend_reminders_include_only_unpaid_items_due_within_ten_calendar_days()
    {
        var today = new DateOnly(2026, 6, 1);
        var reminders = ReminderInbox.Create(
            [], [], [], [],
            [
                new DailySpend { Description = "Overdue", Amount = 100m, DueDate = today.AddDays(-1), IsPaid = false },
                new DailySpend { Description = "Today", Amount = 200m, DueDate = today, IsPaid = false },
                new DailySpend { Description = "Day ten", Amount = 300m, DueDate = today.AddDays(10), IsPaid = false },
                new DailySpend { Description = "Day eleven", Amount = 400m, DueDate = today.AddDays(11), IsPaid = false },
                new DailySpend { Description = "Paid", Amount = 500m, DueDate = today.AddDays(5), IsPaid = true }
            ],
            [], [], [], today);

        Assert.Equal(3, reminders.Count);
        Assert.Contains(reminders, reminder => reminder.Title == "Daily spend due: Overdue" && reminder.DueDate == today.AddDays(-1));
        Assert.Contains(reminders, reminder => reminder.Title == "Daily spend due: Today" && reminder.DueDate == today);
        Assert.Contains(reminders, reminder => reminder.Title == "Daily spend due: Day ten" && reminder.DueDate == today.AddDays(10));
        Assert.DoesNotContain(reminders, reminder => reminder.Title.Contains("Day eleven") || reminder.Title.Contains("Paid"));
        Assert.Equal(["Daily spend due: Day ten"], ReminderInbox.Filter(reminders, "DailySpendDue", "DueSoon", today).Select(reminder => reminder.Title));
        Assert.Equal(["Daily spend due: Overdue"], ReminderInbox.Filter(reminders, "DailySpendDue", "Overdue", today).Select(reminder => reminder.Title));
        Assert.Equal(["Daily spend due: Today"], ReminderInbox.Filter(reminders, "DailySpendDue", "DueToday", today).Select(reminder => reminder.Title));
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
        Assert.True(ReminderInbox.IsValidDueFilter("DueSoon"));
        Assert.False(ReminderInbox.IsValidDueFilter("Soon"));
    }

    [Fact]
    public void Priority_actions_only_include_the_signed_in_roles_work_queue()
    {
        var today = new DateOnly(2026, 6, 1);
        var vehicle = new Vehicle { Id = Guid.NewGuid(), PlateNumber = "VPK1234" };
        var actions = PriorityActionQueue.Create(
            ["Loan", "HrSalary"],
            [new LoanApplication { VehicleId = vehicle.Id, CustomerId = Guid.NewGuid(), Status = LoanStatus.Pending, SubmittedAt = today.AddDays(-3) }],
            [new DeliverySchedule { VehicleId = vehicle.Id, Pic = "Delivery", Status = DeliveryStatus.Scheduled, ScheduledDate = today.AddDays(2) }],
            [new SettlementReminder { VehicleId = vehicle.Id, Amount = 10m, Deadline = today, IsPaid = false }],
            [], [], [], [],
            [],
            [new Lead { VehicleId = vehicle.Id, CustomerName = "New lead", Phone = "0123456789", Status = LeadStatus.New }],
            [new HrLeaveRequest { StaffUserId = "staff-1", Status = HrLeaveStatus.Pending, StartDate = today, EndDate = today, Days = 1m }],
            [vehicle],
            today);

        Assert.Contains(actions, action => action.Type == "LoanFollowUp" && action.Target == "Loans");
        Assert.Contains(actions, action => action.Type == "LeaveApproval" && action.Target == "HrSalary");
        Assert.DoesNotContain(actions, action => action.Target is "Delivery" or "Finance" or "Leads" or "Repairs");
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
    public void Document_ownership_validation_requires_one_compatible_workflow_record()
    {
        var repairId = Guid.NewGuid();
        var paymentId = Guid.NewGuid();

        var conflict = DocumentOwnershipRules.Validate(FileCategory.RepairInvoice, repairId, paymentId);
        var invalidRepairCategory = DocumentOwnershipRules.Validate(FileCategory.PaymentReceipt, repairId, null);
        var invalidPaymentCategory = DocumentOwnershipRules.Validate(FileCategory.Voc, null, paymentId);
        var validRepair = DocumentOwnershipRules.Validate(FileCategory.RepairInvoice, repairId, null);
        var validPayment = DocumentOwnershipRules.Validate(FileCategory.PaymentReceipt, null, paymentId);

        Assert.False(conflict.IsValid);
        Assert.Contains(conflict.Errors, error => error.Code == "document_owner_conflict");
        Assert.Contains(invalidRepairCategory.Errors, error => error.Code == "repair_document_category_invalid");
        Assert.Contains(invalidPaymentCategory.Errors, error => error.Code == "payment_document_category_invalid");
        Assert.True(validRepair.IsValid);
        Assert.True(validPayment.IsValid);
    }

    [Fact]
    public void Vehicle_document_ownership_defaults_match_the_approved_categories()
    {
        Assert.Equal(DocumentOwnershipType.Buyer, DocumentOwnershipRules.DefaultFor(FileCategory.IdentityCard));
        Assert.Equal(DocumentOwnershipType.Seller, DocumentOwnershipRules.DefaultFor(FileCategory.PurchaseInvoice));
        Assert.Equal(DocumentOwnershipType.Seller, DocumentOwnershipRules.DefaultFor(FileCategory.Voc));
        Assert.Equal(DocumentOwnershipType.Seller, DocumentOwnershipRules.DefaultFor(FileCategory.ApDocument));
        Assert.Equal(DocumentOwnershipType.Vehicle, DocumentOwnershipRules.DefaultFor(FileCategory.StatusReceipt));
        Assert.Equal(DocumentOwnershipType.Buyer, DocumentOwnershipRules.DefaultFor(FileCategory.LoanDocument));
        Assert.Equal(DocumentOwnershipType.Buyer, DocumentOwnershipRules.DefaultFor(FileCategory.DeliveryDocument));
        Assert.Equal(DocumentOwnershipType.Buyer, DocumentOwnershipRules.DefaultFor(FileCategory.Policy));
        Assert.Equal(DocumentOwnershipType.Vehicle, DocumentOwnershipRules.DefaultFor(FileCategory.RoadTaxReceipt));
        Assert.Equal(DocumentOwnershipType.Vehicle, DocumentOwnershipRules.DefaultFor(FileCategory.RepairInvoice));
    }

    [Fact]
    public void Vehicle_document_ownership_validation_requires_the_matching_linked_person()
    {
        var sellerId = Guid.NewGuid();
        var buyerId = Guid.NewGuid();
        var validSeller = DocumentOwnershipRules.Validate(FileCategory.PurchaseInvoice, null, null, DocumentOwnershipType.Seller, null, sellerId);
        var missingBuyer = DocumentOwnershipRules.Validate(FileCategory.IdentityCard, null, null, DocumentOwnershipType.Buyer, null, null);
        var vehicleWithPerson = DocumentOwnershipRules.Validate(FileCategory.RepairInvoice, null, null, DocumentOwnershipType.Vehicle, buyerId, null);

        Assert.True(validSeller.IsValid);
        Assert.Contains(missingBuyer.Errors, error => error.Code == "document_buyer_required");
        Assert.Contains(vehicleWithPerson.Errors, error => error.Code == "document_vehicle_link_invalid");
    }

    [Fact]
    public void Cash_custody_requires_matching_amount_and_separation_of_duties()
    {
        var customerId = Guid.NewGuid();
        var vehicle = VehicleSeed.Available(publicVisible: false) with { CustomerId = customerId };
        var payment = new PaymentRecord { Id = Guid.NewGuid(), VehicleId = vehicle.Id, NettPrice = 58000m };
        var request = new CashHandoverCreateRequest(payment.Id, 58000m, "Customer paid cash at showroom");
        var handover = new CashHandover
        {
            PaymentRecordId = payment.Id,
            VehicleId = vehicle.Id,
            CustomerId = customerId,
            Amount = request.Amount,
            CollectedByUserId = "sales-1",
            Status = CashHandoverStatus.ReceivedBySales
        };

        Assert.True(CashCustodyRules.ValidateCreate(request, payment, vehicle).IsValid);
        Assert.Contains(CashCustodyRules.ValidateCreate(request with { Amount = 57000m }, payment, vehicle).Errors, error => error.Code == "cash_handover_amount_mismatch");
        Assert.True(CashCustodyRules.ValidateRequestHandover(handover, "sales-1").IsValid);
        Assert.Contains(CashCustodyRules.ValidateHandOver(handover with { Status = CashHandoverStatus.PendingHandover }, "sales-1").Errors, error => error.Code == "cash_handover_self_approval_forbidden");
        Assert.True(CashCustodyRules.ValidateHandOver(handover with { Status = CashHandoverStatus.PendingHandover }, "finance-1").IsValid);
        Assert.True(CashCustodyRules.ValidateAccept(handover with { Status = CashHandoverStatus.HandedOver }, "finance-1").IsValid);
        Assert.Contains(CashCustodyRules.ValidateReject(handover with { Status = CashHandoverStatus.HandedOver }, "finance-1", " ").Errors, error => error.Code == "cash_handover_rejection_reason_required");
    }

    [Fact]
    public void Official_receipt_is_stable_and_contains_a_pdf_for_the_accepted_handover()
    {
        var handover = new CashHandover
        {
            Id = Guid.Parse("efb192b3-c5f8-41ec-827f-56769a8c5f59"),
            PaymentRecordId = Guid.NewGuid(),
            Amount = 58000m
        };
        var vehicle = VehicleSeed.Available(publicVisible: false);
        var customer = new Customer { Id = Guid.NewGuid(), Name = "Ali Tan", Phone = "0123456789" };
        var now = new DateTime(2026, 8, 8, 9, 30, 0, DateTimeKind.Utc);

        var first = OfficialReceiptFactory.Create(handover, vehicle, customer, "finance-1", now);
        var second = OfficialReceiptFactory.Create(handover, vehicle, customer, "finance-1", now.AddHours(1));

        Assert.Equal(first.ReceiptNumber, second.ReceiptNumber);
        Assert.Equal("YSR-20260808-EFB192", first.ReceiptNumber);
        Assert.StartsWith("%PDF-", System.Text.Encoding.ASCII.GetString(first.Content));
        Assert.Equal(handover.Amount, first.Amount);
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
    public void Business_clock_uses_the_singapore_calendar_day()
    {
        Assert.Equal(
            new DateOnly(2026, 6, 2),
            BusinessClock.SingaporeDate(new DateTimeOffset(2026, 6, 1, 17, 0, 0, TimeSpan.Zero)));
        Assert.Equal(
            new DateOnly(2026, 6, 1),
            BusinessClock.SingaporeDate(new DateTimeOffset(2026, 6, 1, 15, 59, 59, TimeSpan.Zero)));
    }

    [Fact]
    public void Dashboard_analytics_period_requires_an_inclusive_iso_date_pair()
    {
        Assert.True(DashboardAnalyticsPeriodRules.TryParse("2026-06-01", "2026-06-30", out var period, out var error));
        Assert.Equal(new DateOnly(2026, 6, 1), period.From);
        Assert.Equal(new DateOnly(2026, 6, 30), period.To);
        Assert.Null(error);
        Assert.False(DashboardAnalyticsPeriodRules.TryParse("2026-06-01", null, out _, out var missingPairError));
        Assert.Contains("both from and to", missingPairError);
        Assert.False(DashboardAnalyticsPeriodRules.TryParse("2026-06-30", "2026-06-01", out _, out var invertedError));
        Assert.Contains("must not be after", invertedError);
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
            [],
            repairs,
            [
                new SupplierInvoice { VehicleId = vehicleId, SupplierName = "ABC Spray", InvoiceNumber = "S-1", Amount = 500m },
                new SupplierInvoice { VehicleId = vehicleId, SupplierName = "Tint Shop", InvoiceNumber = "S-2", Amount = 1500m }
            ],
            [],
            [],
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
    public void Vehicle_repair_cost_uses_final_repair_total_then_refurbishment_fallback()
    {
        var vehicle = VehicleSeed.Available(publicVisible: true) with
        {
            Id = Guid.NewGuid(),
            RefurbishmentTotal = 1200m,
            RepairCost = 9999m
        };
        var repairs = new[]
        {
            new RepairJob { VehicleId = vehicle.Id, WhatToDo = "Polish", Cost = 450m },
            new RepairJob { VehicleId = vehicle.Id, WhatToDo = "Paint", Cost = 1500m, ChecklistDone = true, ApprovalStatus = RepairApprovalStatus.Pending }
        };

        var costs = VehicleRepairCosts.ByVehicle(repairs);

        Assert.Equal(450m, VehicleRepairCosts.EffectiveCost(vehicle, costs));
        Assert.Equal(1200m, VehicleRepairCosts.EffectiveCost(vehicle with { Id = Guid.NewGuid() }, costs));
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
            [],
            [new BrokerCommission { VehicleId = vehicleId, BrokerName = "Ah Chong", Amount = 1800m }],
            [],
            [],
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
            [],
            [new PaymentVoucher { VehicleId = vehicleId, PayeeName = "Driver", Amount = 180m, Purpose = "Outstation Pickup Allowance", IssuedDate = new DateOnly(2026, 6, 3) }],
            [],
            [],
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
    public void Dashboard_metrics_create_chart_ready_management_insights()
    {
        var today = new DateOnly(2026, 6, 1);
        var availableVehicleId = Guid.NewGuid();
        var loanVehicleId = Guid.NewGuid();
        var soldVehicleId = Guid.NewGuid();
        var vehicles = new[]
        {
            VehicleSeed.Available(publicVisible: true) with
            {
                Id = availableVehicleId,
                StockOwner = StockOwner.YSHeng,
                PurchasePrice = 42000m,
                SellingPrice = 58000m,
                AdditionalCharges = 600m,
                RefurbishmentTotal = 3500m,
                CommissionTotal = 1200m,
                OutstationPickupAllowance = 100m
            },
            VehicleSeed.LoanProcessing(publicVisible: false) with
            {
                Id = loanVehicleId,
                StockOwner = StockOwner.KS,
                PurchasePrice = 30000m,
                SellingPrice = 42000m,
                AdditionalCharges = 300m,
                RefurbishmentTotal = 2000m,
                CommissionTotal = 900m
            },
            VehicleSeed.Sold(publicVisible: false) with
            {
                Id = soldVehicleId,
                StockOwner = StockOwner.KS,
                PurchasePrice = 20000m,
                SellingPrice = 30000m,
                RefurbishmentTotal = 1000m,
                CommissionTotal = 500m
            },
            VehicleSeed.Sold(publicVisible: false) with
            {
                Id = Guid.NewGuid(),
                Make = "Smoke",
                Model = "Workflow",
                StockOwner = StockOwner.KS
            }
        };

        var summary = DashboardMetrics.Create(
            vehicles,
            [new LoanApplication { VehicleId = loanVehicleId, CustomerId = Guid.NewGuid(), Status = LoanStatus.Pending, SubmittedAt = today.AddDays(-4) }],
            [new DeliverySchedule { VehicleId = loanVehicleId, Pic = "Ah Ming", Status = DeliveryStatus.Scheduled, ScheduledDate = today.AddDays(2) }],
            [
                new PaymentRecord { VehicleId = loanVehicleId, NettPrice = 58000m, Status = PaymentStatus.Disbursed, BankFollowUpDate = today, CreatedAt = new DateTime(2026, 5, 31, 0, 0, 0, DateTimeKind.Utc) },
                new PaymentRecord { VehicleId = soldVehicleId, NettPrice = 30000m, Status = PaymentStatus.Reconciled, CreatedAt = new DateTime(2026, 5, 28, 0, 0, 0, DateTimeKind.Utc) }
            ],
            [
                new SettlementReminder { VehicleId = availableVehicleId, Amount = 25000m, Deadline = today, IsPaid = false },
                new SettlementReminder { VehicleId = soldVehicleId, Amount = 12000m, Deadline = today, IsPaid = true }
            ],
            [new RepairJob { VehicleId = availableVehicleId, WhatToDo = "Paint", Cost = 450m }],
            [
                new SupplierInvoice { VehicleId = availableVehicleId, SupplierName = "ABC Spray", InvoiceNumber = "S-1", Amount = 500m },
                new SupplierInvoice { VehicleId = loanVehicleId, SupplierName = "Tint Shop", InvoiceNumber = "S-2", Amount = 1500m },
                new SupplierInvoice { VehicleId = soldVehicleId, SupplierName = "ABC Spray", InvoiceNumber = "S-3", Amount = 700m }
            ],
            [new BrokerCommission { VehicleId = availableVehicleId, BrokerName = "Broker A", Amount = 1800m }],
            [
                new PaymentVoucher { VehicleId = availableVehicleId, PayeeName = "Driver", Amount = 180m, Purpose = "Outstation Pickup Allowance", IssuedDate = today, Status = PaymentVoucherStatus.Approved },
                new PaymentVoucher { VehicleId = soldVehicleId, PayeeName = "Runner", Amount = 90m, Purpose = "JPJ", IssuedDate = today, Status = PaymentVoucherStatus.Paid }
            ],
            [new DailySpend { Description = "Electric", Amount = 480m, DueDate = today, IsPaid = false }],
            [
                new DebtRecoveryCase { VehicleId = loanVehicleId, CustomerId = Guid.NewGuid(), BalanceAmount = 3200m, Status = DebtRecoveryStatus.Open, FollowUpDate = today },
                new DebtRecoveryCase { VehicleId = soldVehicleId, CustomerId = Guid.NewGuid(), BalanceAmount = 1000m, Status = DebtRecoveryStatus.Closed, FollowUpDate = today }
            ],
            [
                new Lead { VehicleId = availableVehicleId, CustomerName = "Ali", Phone = "012", Status = LeadStatus.New, CreatedAt = new DateTime(2026, 6, 1, 1, 0, 0, DateTimeKind.Utc) },
                new Lead { VehicleId = availableVehicleId, CustomerName = "Aminah", Phone = "015", Status = LeadStatus.Contacted, CreatedAt = new DateTime(2026, 5, 15, 1, 0, 0, DateTimeKind.Utc) },
                new Lead { VehicleId = loanVehicleId, CustomerName = "Tan", Phone = "013", Status = LeadStatus.Contacted, CreatedAt = new DateTime(2026, 4, 15, 1, 0, 0, DateTimeKind.Utc) },
                new Lead { VehicleId = soldVehicleId, CustomerName = "Lim", Phone = "014", Status = LeadStatus.Closed, CreatedAt = new DateTime(2026, 6, 1, 2, 0, 0, DateTimeKind.Utc) },
                new Lead { VehicleId = LeadCapture.GeneralContactVehicleId, CustomerName = "Lee", Phone = "016", Status = LeadStatus.New, CreatedAt = new DateTime(2026, 6, 1, 3, 0, 0, DateTimeKind.Utc) }
            ],
            today);

        Assert.Contains(summary.StockStatusMix, item => item.Label == "Available" && item.Count == 1);
        Assert.Contains(summary.StockStatusMix, item => item.Label == "LoanProcessing" && item.Count == 1);
        Assert.Contains(summary.StockStatusMix, item => item.Label == "Sold" && item.Count == 2);
        Assert.Contains(summary.StockOwnerMix, item => item.Label == "YSHeng" && item.Count == 1);
        Assert.Contains(summary.StockOwnerMix, item => item.Label == "KS" && item.Count == 3);
        Assert.Contains(summary.MoneyRiskBreakdown, item => item.Label == "Outstanding Payment" && item.Amount == 58000m);
        Assert.Contains(summary.MoneyRiskBreakdown, item => item.Label == "Unpaid Settlement" && item.Amount == 25000m);
        Assert.Contains(summary.MoneyRiskBreakdown, item => item.Label == "Open Debt Recovery" && item.Amount == 3200m);
        Assert.Contains(summary.MoneyRiskBreakdown, item => item.Label == "Unpaid Daily Spend" && item.Amount == 480m);
        Assert.Contains(summary.MoneyRiskBreakdown, item => item.Label == "Open Payment Voucher" && item.Amount == 180m);
        Assert.Contains(summary.WorkflowBlockers.ByType, item => item.Label == "DeliveryPreparation" && item.Count == 1);
        Assert.Contains(summary.WorkflowBlockers.DueBuckets, item => item.Label == "Overdue" && item.Count == 2);
        Assert.Contains(summary.WorkflowBlockers.DueBuckets, item => item.Label == "DueToday" && item.Count == 5);
        Assert.Contains(summary.WorkflowBlockers.DueBuckets, item => item.Label == "Upcoming" && item.Count == 1);
        Assert.Contains(summary.SalesFunnel.Stages, item => item.Label == "Closed" && item.Count == 1);
        Assert.Equal(20m, summary.SalesFunnel.ConversionRate);
        Assert.Equal(2, summary.TopEnquiredVehicles[0].Count);
        Assert.Contains(vehicles[0].PlateNumber, summary.TopEnquiredVehicles[0].Label);
        Assert.Equal(3, summary.RepairCostByVehicle.Length);
        Assert.Equal(2000m, summary.RepairCostByVehicle[0].Amount);
        Assert.Contains(vehicles[1].PlateNumber, summary.RepairCostByVehicle[0].Label);
        Assert.Single(summary.TopSellingModels);
        Assert.Equal(1, summary.TopSellingModels[0].Count);
        Assert.DoesNotContain(summary.TopSellingModels, item => item.Label == "Smoke Workflow");
        Assert.Equal(6, summary.LeadTrend.Length);
        Assert.Equal("Jun 26", summary.LeadTrend[^1].Label);
        Assert.Equal(3, summary.LeadTrend[^1].Count);
        Assert.Contains(summary.ProfitBreakdown, item => item.Label == "Repair Cost" && item.Amount == summary.RepairCost);
        Assert.Contains(summary.ProfitBreakdown, item => item.Label == "Estimated Profit" && item.Amount == summary.TotalProfit);
        Assert.Equal(["Tint Shop", "ABC Spray"], summary.SupplierSpendTop.Select(item => item.Label).ToArray());
    }

    [Fact]
    public void Dashboard_metrics_scope_sales_profit_and_refurbishment_to_the_selected_singapore_period()
    {
        var today = new DateOnly(2026, 6, 2);
        var soldInsidePeriodId = Guid.NewGuid();
        var soldOutsidePeriodId = Guid.NewGuid();
        var vehicles = new[]
        {
            VehicleSeed.Sold(publicVisible: false) with
            {
                Id = soldInsidePeriodId,
                Make = "Toyota",
                Model = "Vios",
                PurchasePrice = 20000m,
                SellingPrice = 30000m,
                CommissionTotal = 500m,
                SoldAt = new DateTime(2026, 5, 31, 17, 0, 0, DateTimeKind.Utc)
            },
            VehicleSeed.Sold(publicVisible: false) with
            {
                Id = soldOutsidePeriodId,
                Make = "Honda",
                Model = "City",
                PurchasePrice = 15000m,
                SellingPrice = 25000m,
                SoldAt = new DateTime(2026, 5, 31, 15, 59, 59, DateTimeKind.Utc)
            }
        };

        var summary = DashboardMetrics.Create(
            vehicles,
            [], [],
            [new PaymentRecord { VehicleId = soldInsidePeriodId, NettPrice = 15000m, Status = PaymentStatus.Pending }],
            [
                new SettlementReminder { VehicleId = soldInsidePeriodId, Amount = 2000m, Deadline = today, IsPaid = false },
                new SettlementReminder { VehicleId = soldOutsidePeriodId, Amount = 900m, Deadline = today.AddDays(1), IsPaid = false }
            ],
            [
                new RepairJob { VehicleId = soldInsidePeriodId, WhatToDo = "Paint", Cost = 1000m, ChecklistDone = false, ExpectedCompletionDate = today.AddDays(-1), CreatedAt = new DateTime(2026, 6, 1, 2, 0, 0, DateTimeKind.Utc) },
                new RepairJob { VehicleId = soldOutsidePeriodId, WhatToDo = "Tyres", Cost = 800m, ChecklistDone = true, CreatedAt = new DateTime(2026, 5, 31, 2, 0, 0, DateTimeKind.Utc) }
            ],
            [], [], [], [],
            [new DebtRecoveryCase { VehicleId = soldInsidePeriodId, CustomerId = Guid.NewGuid(), BalanceAmount = 3000m, Status = DebtRecoveryStatus.Open, FollowUpDate = today }],
            [new Lead { VehicleId = soldInsidePeriodId, CustomerName = "Ali", Phone = "012", Status = LeadStatus.Closed, CreatedAt = new DateTime(2026, 5, 31, 17, 0, 0, DateTimeKind.Utc) }],
            today,
            new DateOnly(2026, 6, 1),
            today);

        Assert.Equal(1, summary.TotalSales);
        Assert.Equal(8500m, summary.ActualProfit);
        Assert.Equal(18000m, summary.OutstandingCollection);
        Assert.Equal(1, summary.SettlementDue);
        Assert.Equal(2000m, summary.SettlementDueAmount);
        Assert.Equal(1000m, summary.Refurbishment.FinalRepairSpend);
        Assert.Equal(1, summary.Refurbishment.VehicleCount);
        Assert.Equal(1000m, summary.Refurbishment.AverageSpendPerVehicle);
        Assert.Equal(1, summary.Refurbishment.WorkInProgressCount);
        Assert.Equal(1, summary.Refurbishment.OverdueWorkCount);
        Assert.Single(summary.Refurbishment.HighestCostVehicles);
        Assert.Contains(summary.TopSellingModels, item => item.Label == "Toyota Vios" && item.Count == 1);
        Assert.Single(summary.LeadTrend);
        Assert.Equal("Jun 26", summary.LeadTrend[0].Label);
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
    public void Repair_receipt_validation_requires_named_nonnegative_items()
    {
        var invalid = new ConfirmRepairReceiptRequest(
            Guid.NewGuid(),
            "Workshop",
            "INV-1",
            100m,
            [new ConfirmRepairReceiptItemRequest(" ", null, -1m, 1)]);
        var valid = new ConfirmRepairReceiptRequest(
            Guid.NewGuid(),
            "Workshop",
            "INV-1",
            100m,
            [new ConfirmRepairReceiptItemRequest("Replace wiper", "Wiper", 100m, 1)]);

        Assert.False(RepairReceiptRules.Validate(invalid).IsValid);
        Assert.Contains(RepairReceiptRules.Validate(invalid).Errors, error => error.Code == "repair_receipt_items_invalid");
        Assert.True(RepairReceiptRules.Validate(valid).IsValid);
    }

    [Fact]
    public void Repair_validation_requires_approval_before_high_cost_completion()
    {
        var repair = new RepairJob
        {
            VehicleId = Guid.NewGuid(),
            WhatToDo = "Gearbox repair",
            Cost = 1500m,
            ChecklistDone = true,
            ApprovalStatus = RepairApprovalStatus.Pending
        };

        var result = RepairRules.Validate(repair);

        Assert.False(result.IsValid);
        Assert.Contains(result.Errors, error => error.Code == "repair_approval_required");
        Assert.False(RepairRules.IsCostFinal(repair));
        Assert.True(RepairRules.IsCostFinal(repair with { ApprovalStatus = RepairApprovalStatus.Approved }));
    }

    [Fact]
    public void Dashboard_metrics_show_uncontacted_leads_and_incomplete_repair_work()
    {
        var vehicleId = Guid.NewGuid();
        var vehicle = VehicleSeed.Available(publicVisible: true) with { Id = vehicleId, PlateNumber = "VPK1234", Make = "Toyota", Model = "Vios" };

        var summary = DashboardMetrics.Create(
            [vehicle], [], [], [], [],
            [new RepairJob { VehicleId = vehicleId, WhatToDo = "Paint touch-up", ChecklistDone = false }],
            [], [], [], [], [],
            [
                new Lead { VehicleId = vehicleId, CustomerName = "Ali", Phone = "012", Status = LeadStatus.New, CreatedAt = DateTime.UtcNow.AddHours(-25) },
                new Lead { VehicleId = vehicleId, CustomerName = "Tan", Phone = "013", Status = LeadStatus.Contacted, CreatedAt = DateTime.UtcNow.AddHours(-48) }
            ],
            new DateOnly(2026, 5, 30));

        Assert.Equal(1, summary.LeadsAwaitingFirstResponse);
        Assert.Contains(summary.RepairWorkInProgress, item => item.Label == "VPK1234 · Toyota Vios" && item.Count == 1);
    }

    [Fact]
    public void Repair_approval_is_server_owned_and_material_changes_reset_it()
    {
        var clientSupplied = new RepairJob
        {
            VehicleId = Guid.NewGuid(),
            RepairPart = "Gearbox",
            WhatToDo = "Replace gearbox",
            Cost = 1500m,
            ApprovalStatus = RepairApprovalStatus.Approved,
            ApprovalNotes = "Client supplied",
            ApprovedBy = "repair@example.test",
            ApprovedAt = DateTime.UtcNow
        };
        var created = RepairApprovalRules.PrepareForCreate(clientSupplied);
        var approved = RepairApprovalRules.Approve(
            created,
            new RepairApprovalRequest("Budget confirmed"),
            new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "boss@example.test")], "Test")));
        var edited = RepairApprovalRules.PrepareForUpdate(approved, approved with { Cost = 1600m, ApprovalStatus = RepairApprovalStatus.Approved });

        Assert.Equal(RepairApprovalStatus.Pending, created.ApprovalStatus);
        Assert.Null(created.ApprovedBy);
        Assert.Null(created.ApprovedAt);
        Assert.Equal("boss@example.test", approved.ApprovedBy);
        Assert.NotNull(approved.ApprovedAt);
        Assert.Equal(RepairApprovalStatus.Pending, edited.ApprovalStatus);
        Assert.Null(edited.ApprovedBy);
        Assert.Null(edited.ApprovedAt);
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
    public void Supplier_invoice_helpers_create_master_summary_and_aging_view()
    {
        var vehicleId = Guid.NewGuid();
        var invoices = new[]
        {
            new SupplierInvoice { VehicleId = vehicleId, SupplierName = "ABC Spray", InvoiceNumber = "S-1", Amount = 500m, DueDate = new DateOnly(2026, 6, 9) },
            new SupplierInvoice { VehicleId = vehicleId, SupplierName = " abc spray ", InvoiceNumber = "S-2", Amount = 700m, PaidAt = new DateOnly(2026, 6, 10) },
            new SupplierInvoice { VehicleId = vehicleId, SupplierName = "Tint Shop", InvoiceNumber = "T-1", Amount = 300m, DueDate = new DateOnly(2026, 6, 15) }
        };

        var summaries = SupplierInvoiceRules.CreateSupplierSummaries(invoices).ToArray();
        var overdue = SupplierInvoiceRules.CreateAgingView(invoices[0], new DateOnly(2026, 6, 10));
        var paid = SupplierInvoiceRules.CreateAgingView(invoices[1], new DateOnly(2026, 6, 10));
        var dueSoon = SupplierInvoiceRules.CreateAgingView(invoices[2], new DateOnly(2026, 6, 10));

        Assert.Contains(summaries, item => item.SupplierName == "ABC Spray" && item.InvoiceCount == 2 && item.TotalAmount == 1200m);
        Assert.Equal(SupplierInvoiceAgingStatus.Overdue, overdue.Status);
        Assert.Equal(SupplierInvoiceAgingStatus.Paid, paid.Status);
        Assert.Equal(SupplierInvoiceAgingStatus.DueSoon, dueSoon.Status);
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
    public void Loan_completion_requires_documents_for_the_current_vehicle_and_buyer()
    {
        var loan = new LoanApplication
        {
            VehicleId = Guid.NewGuid(),
            CustomerId = Guid.NewGuid(),
            Status = LoanStatus.Done,
            SubmittedAt = new DateOnly(2026, 5, 30),
            LouApproved = true,
            LouDone = true
        };
        var documents = new[]
        {
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = loan.CustomerId, Category = FileCategory.StatusReceipt },
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = loan.CustomerId, Category = FileCategory.Voc },
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = loan.CustomerId, Category = FileCategory.ApDocument },
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = Guid.NewGuid(), Category = FileCategory.LoanDocument }
        };

        var check = LoanDocumentRules.CheckCompleteness(loan, documents);
        var completion = LoanDocumentRules.ValidateCompletion(loan, documents);

        Assert.Contains(FileCategory.LoanDocument, check.MissingCategories);
        Assert.Contains(completion.Errors, error => error.Code == "loan_documents_incomplete" && error.Message.Contains("LoanDocument", StringComparison.Ordinal));
    }

    [Fact]
    public void Legacy_documents_without_buyer_ownership_do_not_complete_a_loan()
    {
        var loan = new LoanApplication { VehicleId = Guid.NewGuid(), CustomerId = Guid.NewGuid() };
        var legacyDocuments = new[]
        {
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = null, Category = FileCategory.StatusReceipt },
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = null, Category = FileCategory.Voc },
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = null, Category = FileCategory.ApDocument },
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = null, Category = FileCategory.LoanDocument }
        };

        var result = LoanDocumentRules.CheckCompleteness(loan, legacyDocuments);

        Assert.False(result.IsComplete);
        Assert.Equal(4, result.MissingCategories.Count);
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
    public void Loan_document_check_does_not_use_another_vehicle_voc_for_the_same_customer()
    {
        var customerId = Guid.NewGuid();
        var loan = new LoanApplication
        {
            VehicleId = Guid.NewGuid(),
            CustomerId = customerId,
            Status = LoanStatus.Pending,
            SubmittedAt = new DateOnly(2026, 5, 30)
        };
        var documents = new[]
        {
            new DocumentBlob { VehicleId = Guid.NewGuid(), CustomerId = customerId, Category = FileCategory.Voc },
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = customerId, Category = FileCategory.StatusReceipt },
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = customerId, Category = FileCategory.ApDocument },
            new DocumentBlob { VehicleId = loan.VehicleId, CustomerId = customerId, Category = FileCategory.LoanDocument }
        };

        var result = LoanDocumentRules.CheckCompleteness(loan, documents);

        Assert.False(result.IsComplete);
        Assert.Contains(FileCategory.Voc, result.MissingCategories);
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
            InsuranceExpiryDate = new DateOnly(2026, 6, 30),
            RoadTaxHandled = true,
            RoadTaxExpiryDate = new DateOnly(2026, 6, 30),
            WindscreenInsuranceHandled = true,
            WindscreenInsuranceExpiryDate = new DateOnly(2026, 6, 30),
            HandoverPhotoCaptured = true,
            SignedHandoverReceived = true,
            CustomerAcknowledged = true,
            FinalChecklistConfirmed = true
        };

        Assert.True(DeliveryRules.IsReadyForRelease(delivery));
        Assert.False(DeliveryRules.IsReadyForRelease(delivery with { WashDone = false }));
        Assert.False(DeliveryRules.IsReadyForRelease(delivery with { InsuranceHandled = false }));
        Assert.False(DeliveryRules.IsReadyForRelease(delivery with { RoadTaxHandled = false }));
        Assert.False(DeliveryRules.IsReadyForRelease(delivery with { WindscreenInsuranceHandled = false }));
        Assert.False(DeliveryRules.IsReadyForRelease(delivery with { InspectionReportReference = " " }));
        Assert.False(DeliveryRules.IsReadyForRelease(delivery with { SignedHandoverReceived = false }));
        Assert.False(DeliveryRules.IsReadyForRelease(delivery with { RoadTaxExpiryDate = new DateOnly(2026, 6, 1) }));
        Assert.Contains("Signed handover document", DeliveryRules.MissingReleaseEvidence(delivery with { SignedHandoverReceived = false }));
        Assert.Contains("Road tax expired before scheduled delivery", DeliveryRules.ExpiredDeliveryDocuments(delivery with { RoadTaxExpiryDate = new DateOnly(2026, 6, 1) }));
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
    public void Delivery_document_check_requires_delivery_handover_policy_and_road_tax_evidence_for_release()
    {
        var delivery = new DeliverySchedule
        {
            Id = Guid.NewGuid(),
            VehicleId = Guid.NewGuid(),
            Pic = "Ah Ming",
            Status = DeliveryStatus.ReadyForRelease,
            ScheduledDate = new DateOnly(2026, 6, 3)
        };
        var oldPolicy = new DocumentBlob
        {
            VehicleId = delivery.VehicleId,
            Category = FileCategory.Policy,
            FileName = "old-policy.pdf",
            UploadedBy = "delivery@ysheng.local",
            UploadedAt = new DateTime(2026, 6, 1, 8, 0, 0, DateTimeKind.Utc)
        };
        var latestPolicy = oldPolicy with
        {
            Id = Guid.NewGuid(),
            FileName = "latest-policy.pdf",
            Checksum = "policy-checksum",
            UploadedAt = new DateTime(2026, 6, 2, 8, 0, 0, DateTimeKind.Utc)
        };
        var documents = new[]
        {
            oldPolicy,
            latestPolicy
        };

        var result = DeliveryDocumentRules.CheckCompleteness(delivery, documents);

        Assert.False(result.IsComplete);
        Assert.Contains(FileCategory.DeliveryDocument, result.MissingCategories);
        Assert.Contains(FileCategory.RoadTaxReceipt, result.MissingCategories);
        Assert.DoesNotContain(FileCategory.Policy, result.MissingCategories);
        var policyEvidence = result.Evidence.First(item => item.Category == FileCategory.Policy);
        Assert.True(policyEvidence.IsPresent);
        Assert.Equal(latestPolicy.Id, policyEvidence.DocumentId);
        Assert.Equal("latest-policy.pdf", policyEvidence.FileName);
        Assert.Equal("policy-checksum", policyEvidence.Checksum);
        Assert.Equal("delivery@ysheng.local", policyEvidence.UploadedBy);
        var roadTaxEvidence = result.Evidence.First(item => item.Category == FileCategory.RoadTaxReceipt);
        Assert.False(roadTaxEvidence.IsPresent);
        Assert.Null(roadTaxEvidence.DocumentId);
        var deliveryEvidence = result.Evidence.First(item => item.Category == FileCategory.DeliveryDocument);
        Assert.False(deliveryEvidence.IsPresent);
        Assert.Null(deliveryEvidence.DocumentId);
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
    public void Public_photo_gallery_returns_vehicle_photos_newest_first()
    {
        var vehicleId = Guid.NewGuid();
        var otherVehicleId = Guid.NewGuid();
        var older = new VehiclePhoto
        {
            Id = Guid.NewGuid(),
            VehicleId = vehicleId,
            FileName = "older.jpg",
            MimeType = "image/jpeg",
            Content = [1],
            UploadedAt = new DateTime(2026, 5, 29, 8, 0, 0, DateTimeKind.Utc)
        };
        var newer = older with
        {
            Id = Guid.NewGuid(),
            FileName = "newer.jpg",
            UploadedAt = new DateTime(2026, 5, 30, 8, 0, 0, DateTimeKind.Utc)
        };
        var unrelated = older with { Id = Guid.NewGuid(), VehicleId = otherVehicleId, FileName = "other.jpg" };

        var gallery = PublicVehiclePhotos.SelectGallery(vehicleId, [older, unrelated, newer]);

        Assert.Equal([newer.Id, older.Id], gallery.Select(photo => photo.Id).ToArray());
        Assert.Equal(["newer.jpg", "older.jpg"], gallery.Select(photo => photo.FileName).ToArray());
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
    public void Local_mock_ocr_extracts_purchase_invoice_fields_from_uploaded_text()
    {
        var vehicle = VehicleSeed.Available(publicVisible: false) with { PlateNumber = "VPK1234" };
        var document = new DocumentBlob
        {
            VehicleId = vehicle.Id,
            Category = FileCategory.PurchaseInvoice,
            FileName = "purchase.txt",
            MimeType = "text/plain",
            Content = System.Text.Encoding.UTF8.GetBytes("Purchase invoice PI-1001 plate VPK1234 amount RM 52000.00")
        };

        var result = new LocalMockOcrExtractor().Analyze(document, [vehicle]);

        Assert.Equal(FileCategory.PurchaseInvoice, result.DocumentCategory);
        Assert.Equal("PI-1001", result.Fields["invoiceNumber"]);
        Assert.Equal("VPK1234", result.Fields["plateNumber"]);
        Assert.Equal("52000.00", result.Fields["amount"]);
        Assert.True(result.Confidence > 0);
    }

    [Fact]
    public void Local_mock_ocr_extracts_typed_identity_card_fields_without_invoice_values()
    {
        var document = new DocumentBlob
        {
            Category = FileCategory.IdentityCard,
            FileName = "ic.txt",
            MimeType = "text/plain",
            Content = System.Text.Encoding.UTF8.GetBytes("Identity Card Name Ali Tan IC 900101-01-1234 Address 12 Jalan Demo")
        };

        var result = new LocalMockOcrExtractor().Analyze(document, []);

        Assert.Equal("900101-01-1234", result.Fields["icNumber"]);
        Assert.Equal("Ali Tan", result.Fields["customerName"]);
        Assert.Equal("12 Jalan Demo", result.Fields["address"]);
        Assert.Null(result.Fields["invoiceNumber"]);
        Assert.Null(result.Fields["amount"]);
    }

    [Fact]
    public void Local_mock_ocr_rejects_image_files_instead_of_decoding_image_bytes_as_text()
    {
        var document = new DocumentBlob
        {
            Category = FileCategory.IdentityCard,
            FileName = "ic.jpg",
            MimeType = "image/jpeg",
            Content = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]
        };

        var error = Assert.Throws<InvalidOperationException>(() => new LocalMockOcrExtractor().Analyze(document, []));

        Assert.Contains("cannot read image files", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void MyKad_parser_ignores_a_misread_card_header_and_starts_the_address_at_its_house_number()
    {
        var document = new DocumentBlob { Category = FileCategory.IdentityCard, MimeType = "image/jpeg" };
        var text = "KAD PENGENALAN\nSAAANMALAYSIAN\n900101-01-123 NO 12\nJALAN DEMO 4\nTAMAN CONTOH\n50000 KUALA LUMPUR\nALEX TAN\nWARGANEGARA\nLELAKI";

        var result = OcrExtractionParser.Analyze(document, [], text, 0.9m, []);

        Assert.Equal("ALEX TAN", result.Fields["customerName"]);
        Assert.Equal("NO 12 JALAN DEMO 4 TAMAN CONTOH 50000 KUALA LUMPUR", result.Fields["address"]);
        Assert.Equal("900101-01-123", result.Fields["icNumber"]);
        Assert.Contains(result.Warnings, warning => warning.Contains("appears incomplete", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Local_mock_ocr_extracts_typed_voc_fields_without_invoice_values()
    {
        var vehicle = VehicleSeed.Available(publicVisible: false) with { PlateNumber = "WXY1234" };
        var document = new DocumentBlob
        {
            VehicleId = vehicle.Id,
            Category = FileCategory.Voc,
            FileName = "voc.txt",
            MimeType = "text/plain",
            Content = System.Text.Encoding.UTF8.GetBytes("Vehicle Ownership Certificate Registration WXY1234 Chassis MMBXUFG2WNH123456 Engine 4B11T123456 Make Proton Model X70 Year 2024 Owner Ali Tan")
        };

        var result = new LocalMockOcrExtractor().Analyze(document, [vehicle]);

        Assert.Equal("WXY1234", result.Fields["plateNumber"]);
        Assert.Equal("MMBXUFG2WNH123456", result.Fields["chassisNumber"]);
        Assert.Equal("4B11T123456", result.Fields["engineNumber"]);
        Assert.Equal("Proton", result.Fields["make"]);
        Assert.Equal("X70", result.Fields["model"]);
        Assert.Equal("2024", result.Fields["year"]);
        Assert.Equal("Ali Tan", result.Fields["ownerName"]);
        Assert.Null(result.Fields["invoiceNumber"]);
    }

    [Fact]
    public void Local_mock_ocr_extracts_repair_invoice_supplier_and_plate()
    {
        var vehicle = VehicleSeed.Available(publicVisible: false) with { PlateNumber = "ABC1234" };
        var document = new DocumentBlob
        {
            VehicleId = vehicle.Id,
            Category = FileCategory.RepairInvoice,
            FileName = "repair.txt",
            MimeType = "text/plain",
            Content = System.Text.Encoding.UTF8.GetBytes("Brilliant Spray\nSupplier invoice SUP-7788 plate ABC1234 total RM 880\nRepair part: Bumper\nDescription: Paint bumper and polish\n1. Replace bumper qty 1 RM 180\n2. Paint bumper qty 1 RM 200\nTotal 380")
        };

        var result = new LocalMockOcrExtractor().Analyze(document, [vehicle]);

        Assert.Equal("Brilliant Spray", result.Fields["supplierName"]);
        Assert.Equal("SUP-7788", result.Fields["invoiceNumber"]);
        Assert.Equal("ABC1234", result.Fields["plateNumberOnInvoice"]);
        Assert.Equal("380", result.Fields["amount"]);
        Assert.DoesNotContain("repairPart", result.Fields.Keys, StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain("whatToDo", result.Fields.Keys, StringComparer.OrdinalIgnoreCase);
        Assert.Equal(["Replace bumper qty 1 RM 180", "Paint bumper qty 1 RM 200"], result.LineItems?.Select(item => item.Description));
    }

    [Fact]
    public void Google_document_ai_keeps_repair_line_items_out_of_repair_master_fields()
    {
        var extraction = OcrExtractionParser.Analyze(
            new DocumentBlob { Category = FileCategory.RepairInvoice },
            [],
            "Repair invoice",
            0.9m,
            []);

        var result = GoogleDocumentAiEntityMapper.Apply(extraction, [
            new GoogleDocumentAiEntity("line_item/description", "Replace driver seat foam", 0.91m),
            new GoogleDocumentAiEntity("line_item/description", "Repair driver backrest", 0.87m)
        ]);

        Assert.DoesNotContain("repairPart", result.Fields.Keys, StringComparer.OrdinalIgnoreCase);
        Assert.DoesNotContain("whatToDo", result.Fields.Keys, StringComparer.OrdinalIgnoreCase);
        Assert.Equal(["Replace driver seat foam", "Repair driver backrest"], result.LineItems?.Select(item => item.Description));
    }

    [Fact]
    public void Local_mock_ocr_extracts_finance_receipt_fields()
    {
        var vehicle = VehicleSeed.Available(publicVisible: false);
        var document = new DocumentBlob
        {
            VehicleId = vehicle.Id,
            Category = FileCategory.PaymentReceipt,
            FileName = "receipt.txt",
            MimeType = "text/plain",
            Content = System.Text.Encoding.UTF8.GetBytes("Receipt RCPT-9001 Maybank amount RM 58000 date 2026-06-08")
        };

        var result = new LocalMockOcrExtractor().Analyze(document, [vehicle]);

        Assert.Equal("RCPT-9001", result.Fields["receiptNumber"]);
        Assert.Equal("Maybank", result.Fields["bankName"]);
        Assert.Equal("58000", result.Fields["nettPrice"]);
        Assert.Equal("2026-06-08", result.Fields["documentDate"]);
    }

    [Fact]
    public async Task Baidu_unlimited_ocr_extractor_sends_image_to_openai_compatible_endpoint()
    {
        string? requestBody = null;
        Uri? requestUri = null;
        var handler = new StubHttpMessageHandler(async request =>
        {
            requestUri = request.RequestUri;
            requestBody = request.Content is null ? null : await request.Content.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    """
                    data: {"choices":[{"delta":{"content":"Purchase invoice PI-1001 plate VPK1234 "}}]}

                    data: {"choices":[{"delta":{"content":"amount RM 52000.00"}}]}

                    data: [DONE]

                    """,
                    Encoding.UTF8,
                    "text/event-stream")
            };
        });
        var client = new BaiduUnlimitedOcrClient(
            new HttpClient(handler),
            Options.Create(new BaiduUnlimitedOcrOptions { Endpoint = "http://ocr.local:10000", RequestTimeoutSeconds = 30 }));
        var extractor = new BaiduUnlimitedOcrExtractor(client);
        var vehicle = VehicleSeed.Available(publicVisible: false) with { PlateNumber = "VPK1234" };
        var document = new DocumentBlob
        {
            VehicleId = vehicle.Id,
            Category = FileCategory.PurchaseInvoice,
            FileName = "purchase.png",
            MimeType = "image/png",
            Content = [1, 2, 3]
        };

        var result = await extractor.AnalyzeAsync(document, [vehicle]);

        Assert.Equal("http://ocr.local:10000/v1/chat/completions", requestUri?.ToString());
        Assert.Contains(@"""model"":""Unlimited-OCR""", requestBody);
        Assert.Contains(@"""image_mode"":""gundam""", requestBody);
        Assert.Contains("data:image/png;base64,AQID", requestBody);
        Assert.Equal("PI-1001", result.Fields["invoiceNumber"]);
        Assert.Equal("VPK1234", result.Fields["plateNumber"]);
        Assert.Equal("52000.00", result.Fields["amount"]);
        Assert.Contains(result.Warnings, warning => warning.Contains("Baidu Unlimited-OCR", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Google_document_ai_extractor_uses_specialized_invoice_processor_and_mapped_entities()
    {
        string? requestBody = null;
        string? authorization = null;
        Uri? requestUri = null;
        var handler = new StubHttpMessageHandler(async request =>
        {
            requestUri = request.RequestUri;
            authorization = request.Headers.Authorization?.ToString();
            requestBody = request.Content is null ? null : await request.Content.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    """
                    {
                      "document": {
                        "text": "Purchase invoice OCR-FALLBACK plate VPK1234 amount RM 1.00",
                        "entities": [
                          { "type": "invoice_id", "mentionText": "PI-1001", "confidence": 0.98 },
                          { "type": "supplier_name", "mentionText": "YS Parts", "confidence": 0.91 },
                          {
                            "type": "total_amount",
                            "mentionText": "RM 52,000.00",
                            "confidence": 0.96,
                            "normalizedValue": { "moneyValue": { "currencyCode": "MYR", "units": "52000", "nanos": 0 } }
                          }
                        ],
                        "pages": [{ "tokens": [{ "layout": { "confidence": 0.94 } }] }]
                      }
                    }
                    """,
                    Encoding.UTF8,
                    "application/json")
            };
        });
        var client = new GoogleDocumentAiClient(
            new HttpClient(handler),
            new FixedGoogleAccessTokenProvider("test-access-token"),
            Options.Create(new GoogleDocumentAiOptions
            {
                ProjectId = "ysheng-ocr",
                Location = "asia-southeast1",
                DefaultProcessorId = "general-processor",
                InvoiceProcessorId = "invoice-processor",
                RequestTimeoutSeconds = 30
            }));
        var extractor = new GoogleDocumentAiExtractor(client);
        var vehicle = VehicleSeed.Available(publicVisible: false) with { PlateNumber = "VPK1234" };
        var document = new DocumentBlob
        {
            VehicleId = vehicle.Id,
            Category = FileCategory.PurchaseInvoice,
            FileName = "purchase.png",
            MimeType = "image/png",
            Content = [1, 2, 3]
        };

        var result = await extractor.AnalyzeAsync(document, [vehicle]);

        Assert.Equal(
            "https://asia-southeast1-documentai.googleapis.com/v1/projects/ysheng-ocr/locations/asia-southeast1/processors/invoice-processor:process",
            requestUri?.ToString());
        Assert.Equal("Bearer test-access-token", authorization);
        Assert.Contains("\"content\":\"AQID\"", requestBody);
        Assert.Contains("\"mimeType\":\"image/png\"", requestBody);
        Assert.DoesNotContain("test-access-token", requestBody);
        Assert.Equal("PI-1001", result.Fields["invoiceNumber"]);
        Assert.Equal("YS Parts", result.Fields["supplierName"]);
        Assert.Equal("52000", result.Fields["amount"]);
        Assert.Equal(0.98m, result.FieldConfidence["invoiceNumber"]);
        Assert.DoesNotContain(result.Warnings, warning => warning.Contains("default OCR processor", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Google_document_ai_uses_default_processor_with_warning_when_expense_processor_is_missing()
    {
        Uri? requestUri = null;
        var handler = new StubHttpMessageHandler(request =>
        {
            requestUri = request.RequestUri;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    """{"document":{"text":"Receipt RCPT-1001 amount RM 50.00","pages":[]}}""",
                    Encoding.UTF8,
                    "application/json")
            });
        });
        var client = new GoogleDocumentAiClient(
            new HttpClient(handler),
            new FixedGoogleAccessTokenProvider("test-access-token"),
            Options.Create(new GoogleDocumentAiOptions
            {
                ProjectId = "ysheng-ocr",
                DefaultProcessorId = "general-processor"
            }));
        var document = new DocumentBlob
        {
            Category = FileCategory.PaymentReceipt,
            FileName = "receipt.jpg",
            MimeType = "image/jpeg",
            Content = [4, 5, 6]
        };

        var recognition = await client.RecognizeAsync(document);

        Assert.Contains("/processors/general-processor:process", requestUri?.AbsolutePath);
        Assert.Contains(recognition.Warnings, warning => warning.Contains("specialized expense processor", StringComparison.Ordinal));
        Assert.Contains(recognition.Warnings, warning => warning.Contains("did not return confidence", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Google_document_ai_rejects_missing_configuration_before_sending_document()
    {
        var handler = new StubHttpMessageHandler(_ => throw new InvalidOperationException("HTTP request should not be sent."));
        var client = new GoogleDocumentAiClient(
            new HttpClient(handler),
            new FixedGoogleAccessTokenProvider("test-access-token"),
            Options.Create(new GoogleDocumentAiOptions()));
        var document = new DocumentBlob
        {
            Category = FileCategory.Voc,
            FileName = "voc.png",
            MimeType = "image/png",
            Content = [1]
        };

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() => client.RecognizeAsync(document));

        Assert.Equal("Google Document AI project ID is not configured.", error.Message);
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

internal sealed class StubHttpMessageHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler;

    public StubHttpMessageHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> handler)
        : this((request, _) => handler(request))
    {
    }

    public StubHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler)
    {
        this.handler = handler;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
        handler(request, cancellationToken);
}

internal sealed class FixedGoogleAccessTokenProvider(string accessToken) : IGoogleAccessTokenProvider
{
    public Task<string> GetAccessTokenAsync(CancellationToken cancellationToken = default) => Task.FromResult(accessToken);
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
