using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record CustomerProfileOption(Guid Id, string Name);
public sealed record CustomerProfileContact(Guid Id, string Name, string? Phone, string? IcNumber, string? Email, string? Address, string? Notes);
public sealed record CustomerProfileVehicle(Guid Id, string PlateNumber, string Make, string Model, int Year, VehicleStatus Status);
public sealed record CustomerProfileLoan(Guid Id, Guid VehicleId, LoanStatus Status, bool LouApproved, bool LouDone, DateOnly? SubmittedAt);
public sealed record CustomerProfileDelivery(
    Guid Id,
    Guid VehicleId,
    DeliveryStatus Status,
    DateOnly ScheduledDate,
    string Pic,
    bool InsuranceHandled,
    string? InsurancePolicyReference,
    DateOnly? InsuranceExpiryDate,
    bool RoadTaxHandled,
    string? RoadTaxReceiptReference,
    DateOnly? RoadTaxExpiryDate,
    bool WindscreenInsuranceHandled,
    string? WindscreenPolicyReference,
    DateOnly? WindscreenInsuranceExpiryDate);
public sealed record CustomerProfilePayment(Guid Id, Guid VehicleId, decimal NettPrice, PaymentStatus Status, string? ReceiptNumber, string? InvoiceNumber, DateTime CreatedAt);
public sealed record CustomerProfileInvoice(Guid Id, Guid PaymentRecordId, Guid VehicleId, string InvoiceNumber, DateOnly InvoiceDate, decimal Amount);
public sealed record CustomerProfileReceipt(Guid CashHandoverId, Guid Id, Guid PaymentRecordId, string ReceiptNumber, decimal Amount, DateTime CreatedAt);
public sealed record CustomerProfileDocument(Guid Id, Guid VehicleId, FileCategory Category, string FileName, string MimeType, string Checksum, string UploadedBy, DateTime UploadedAt);
public sealed record CustomerProfileEnquiry(Guid Id, Guid VehicleId, LeadStatus Status, string? Message, string? SourcePage, DateTime CreatedAt);
public sealed record CustomerProfileMissingDocument(Guid? VehicleId, FileCategory Category, string Message);
public sealed record CustomerProfilePermissions(bool CanViewIdentity, bool CanViewLoans, bool CanViewDelivery, bool CanViewFinance, bool CanViewDocuments, bool CanViewEnquiries);
public sealed record CustomerProfile(
    CustomerProfileContact Contact,
    IReadOnlyList<CustomerProfileVehicle> Vehicles,
    IReadOnlyList<CustomerProfileLoan> Loans,
    IReadOnlyList<CustomerProfileDelivery> Deliveries,
    IReadOnlyList<CustomerProfilePayment> Payments,
    IReadOnlyList<CustomerProfileInvoice> Invoices,
    IReadOnlyList<CustomerProfileReceipt> OfficialReceipts,
    IReadOnlyList<CustomerProfileDocument> Documents,
    IReadOnlyList<CustomerProfileEnquiry> Enquiries,
    IReadOnlyList<CustomerProfileMissingDocument> MissingDocuments,
    CustomerProfilePermissions Permissions);

public sealed record CustomerProfileFinanceSelection(
    IReadOnlyList<PaymentRecord> Payments,
    IReadOnlyList<FinanceInvoice> Invoices);

public static class CustomerProfileFinanceRules
{
    public static CustomerProfileFinanceSelection Select(
        Guid customerId,
        IEnumerable<Vehicle> vehicles,
        IEnumerable<PaymentRecord> payments,
        IEnumerable<FinanceInvoice> invoices)
    {
        var invoiceList = invoices.ToList();
        var ownedInvoices = invoiceList.Where(invoice => invoice.CustomerId == customerId).ToList();
        var ownedPaymentIds = ownedInvoices.Select(invoice => invoice.PaymentRecordId).ToHashSet();
        var conflictingPaymentIds = invoiceList
            .Where(invoice => invoice.CustomerId != customerId)
            .Select(invoice => invoice.PaymentRecordId)
            .ToHashSet();
        var canonicalVehicleIds = vehicles
            .Where(vehicle => vehicle.CustomerId == customerId)
            .Select(vehicle => vehicle.Id)
            .ToHashSet();
        var ownedPayments = payments
            .Where(payment =>
                ownedPaymentIds.Contains(payment.Id) ||
                (canonicalVehicleIds.Contains(payment.VehicleId) && !conflictingPaymentIds.Contains(payment.Id)))
            .ToList();
        return new CustomerProfileFinanceSelection(ownedPayments, ownedInvoices);
    }
}

public static class CustomerProfileFactory
{
    public static IReadOnlyList<CustomerProfileOption> CreateOptions(IEnumerable<Customer> customers) =>
        customers
            .OrderBy(customer => customer.Name)
            .Select(customer => new CustomerProfileOption(customer.Id, customer.Name))
            .ToList();

    public static CustomerProfile Create(
        Customer customer,
        IEnumerable<string> roles,
        IEnumerable<Vehicle> vehicles,
        IEnumerable<LoanApplication> loans,
        IEnumerable<DeliverySchedule> deliveries,
        IEnumerable<PaymentRecord> payments,
        IEnumerable<FinanceInvoice> invoices,
        IEnumerable<CashHandover> handovers,
        IEnumerable<OfficialReceipt> receipts,
        IEnumerable<DocumentBlob> documents,
        IEnumerable<Lead> leads)
    {
        var roleSet = roles.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var canViewIdentity = roleSet.Overlaps(DepartmentAccess.CustomerReaders);
        var canViewLoans = roleSet.Contains("BossAdmin") || roleSet.Contains("Loan");
        var canViewDelivery = roleSet.Contains("BossAdmin") || roleSet.Contains("Delivery");
        var canViewFinance = roleSet.Contains("BossAdmin") || roleSet.Contains("Finance");
        var canViewEnquiries = roleSet.Contains("BossAdmin") || roleSet.Contains("Sales");

        var loanList = loans.ToList();
        var deliveryList = deliveries.ToList();
        var customerLoans = loanList.Where(loan => loan.CustomerId == customer.Id).ToList();
        var customerLoanVehicleIds = customerLoans.Select(loan => loan.VehicleId).ToHashSet();
        var unambiguousLegacyVehicleIds = loanList
            .Where(loan => customerLoanVehicleIds.Contains(loan.VehicleId))
            .GroupBy(loan => loan.VehicleId)
            .Where(group => group.All(loan => loan.CustomerId == customer.Id))
            .Select(group => group.Key)
            .ToHashSet();
        var exactDeliveryVehicleIds = deliveryList
            .Where(delivery => delivery.CustomerId == customer.Id)
            .Select(delivery => delivery.VehicleId)
            .ToHashSet();
        var profileVehicles = vehicles
            .Where(vehicle =>
                vehicle.CustomerId == customer.Id ||
                exactDeliveryVehicleIds.Contains(vehicle.Id) ||
                (vehicle.CustomerId is null && unambiguousLegacyVehicleIds.Contains(vehicle.Id)))
            .OrderByDescending(vehicle => vehicle.IntakeDate)
            .ThenBy(vehicle => vehicle.PlateNumber)
            .ToList();
        var vehicleIds = profileVehicles.Select(vehicle => vehicle.Id).ToHashSet();
        var profileLoans = customerLoans.Where(loan => vehicleIds.Contains(loan.VehicleId)).OrderByDescending(loan => loan.SubmittedAt).ToList();
        var vehicleById = profileVehicles.ToDictionary(vehicle => vehicle.Id);
        var profileDeliveries = deliveryList
            .Where(delivery =>
                vehicleIds.Contains(delivery.VehicleId) &&
                (delivery.CustomerId == customer.Id ||
                 (delivery.CustomerId is null &&
                  vehicleById.TryGetValue(delivery.VehicleId, out var vehicle) &&
                  (vehicle.CustomerId == customer.Id ||
                   (vehicle.CustomerId is null && unambiguousLegacyVehicleIds.Contains(vehicle.Id))) &&
                  !loanList.Any(loan => loan.VehicleId == delivery.VehicleId && loan.CustomerId != customer.Id))))
            .OrderByDescending(delivery => delivery.ScheduledDate)
            .ToList();
        var financeSelection = CustomerProfileFinanceRules.Select(customer.Id, profileVehicles, payments, invoices);
        var profilePayments = financeSelection.Payments.OrderByDescending(payment => payment.CreatedAt).ToList();
        var profileInvoices = financeSelection.Invoices.OrderByDescending(invoice => invoice.InvoiceDate).ToList();
        var profileHandovers = handovers.Where(handover => handover.CustomerId == customer.Id).ToList();
        var handoverIds = profileHandovers.Select(handover => handover.Id).ToHashSet();
        var profileDeliveryIds = profileDeliveries.Select(delivery => delivery.Id).ToHashSet();
        var profileDocuments = documents
            .Where(document => document.VehicleId is { } vehicleId && vehicleIds.Contains(vehicleId))
            .Where(document =>
                DeliveryEvidenceUploadRules.IsDeliveryCategory(document.Category)
                    ? document.CustomerId == customer.Id &&
                      document.DeliveryScheduleId.HasValue &&
                      profileDeliveryIds.Contains(document.DeliveryScheduleId.Value)
                    : document.OwnershipType == DocumentOwnershipType.Buyer
                        ? document.CustomerId == customer.Id
                        : !document.CustomerId.HasValue)
            .ToList();
        var visibleDocuments = profileDocuments
            .Where(document => DepartmentAccess.CanUploadDocument(roleSet, document.Category))
            .OrderByDescending(document => document.UploadedAt)
            .ToList();
        var canViewDocuments = visibleDocuments.Count > 0 || roleSet.Any(role => Enum.GetValues<FileCategory>().Any(category => DepartmentAccess.CanUploadDocument([role], category)));

        return new CustomerProfile(
            new CustomerProfileContact(
                customer.Id,
                customer.Name,
                canViewIdentity || canViewDelivery ? customer.Phone : null,
                canViewIdentity ? customer.IcNumber : null,
                canViewIdentity ? customer.Email : null,
                canViewIdentity ? customer.Address : null,
                canViewIdentity ? customer.Notes : null),
            profileVehicles.Select(vehicle => new CustomerProfileVehicle(vehicle.Id, vehicle.PlateNumber, vehicle.Make, vehicle.Model, vehicle.Year, vehicle.Status)).ToList(),
            canViewLoans
                ? profileLoans.Select(loan => new CustomerProfileLoan(loan.Id, loan.VehicleId, loan.Status, loan.LouApproved, loan.LouDone, loan.SubmittedAt)).ToList()
                : [],
            canViewDelivery
                ? profileDeliveries.Select(delivery => new CustomerProfileDelivery(
                    delivery.Id, delivery.VehicleId, delivery.Status, delivery.ScheduledDate, delivery.Pic,
                    delivery.InsuranceHandled, delivery.InsurancePolicyReference, delivery.InsuranceExpiryDate,
                    delivery.RoadTaxHandled, delivery.RoadTaxReceiptReference, delivery.RoadTaxExpiryDate,
                    delivery.WindscreenInsuranceHandled, delivery.WindscreenPolicyReference, delivery.WindscreenInsuranceExpiryDate)).ToList()
                : [],
            canViewFinance
                ? profilePayments.Select(payment => new CustomerProfilePayment(payment.Id, payment.VehicleId, payment.NettPrice, payment.Status, payment.ReceiptNumber, payment.InvoiceNumber, payment.CreatedAt)).ToList()
                : [],
            canViewFinance
                ? profileInvoices.Select(invoice => new CustomerProfileInvoice(invoice.Id, invoice.PaymentRecordId, invoice.VehicleId, invoice.InvoiceNumber, invoice.InvoiceDate, invoice.Amount)).ToList()
                : [],
            canViewFinance
                ? receipts.Where(receipt => handoverIds.Contains(receipt.CashHandoverId))
                    .OrderByDescending(receipt => receipt.CreatedAt)
                    .Select(receipt => new CustomerProfileReceipt(receipt.CashHandoverId, receipt.Id, receipt.PaymentRecordId, receipt.ReceiptNumber, receipt.Amount, receipt.CreatedAt)).ToList()
                : [],
            visibleDocuments.Select(document => new CustomerProfileDocument(
                document.Id,
                document.VehicleId!.Value,
                document.Category,
                document.FileName,
                document.MimeType,
                document.Checksum,
                document.UploadedBy,
                document.UploadedAt)).ToList(),
            canViewEnquiries
                ? leads.Where(lead => lead.CustomerId == customer.Id).OrderByDescending(lead => lead.CreatedAt)
                    .Select(lead => new CustomerProfileEnquiry(lead.Id, lead.VehicleId, lead.Status, lead.Message, lead.SourcePage, lead.CreatedAt)).ToList()
                : [],
            MissingDocuments(roleSet, vehicleIds, profileLoans, profileDeliveries, profileDocuments),
            new CustomerProfilePermissions(canViewIdentity, canViewLoans, canViewDelivery, canViewFinance, canViewDocuments, canViewEnquiries));
    }

    private static IReadOnlyList<CustomerProfileMissingDocument> MissingDocuments(
        IReadOnlySet<string> roles,
        IReadOnlySet<Guid> vehicleIds,
        IReadOnlyList<LoanApplication> loans,
        IReadOnlyList<DeliverySchedule> deliveries,
        IReadOnlyList<DocumentBlob> documents)
    {
        var missing = new List<CustomerProfileMissingDocument>();
        if (DepartmentAccess.CanUploadDocument(roles, FileCategory.IdentityCard) && !documents.Any(document => document.Category == FileCategory.IdentityCard))
        {
            missing.Add(new(null, FileCategory.IdentityCard, "Identity card upload is missing from the linked vehicle history."));
        }

        if (DepartmentAccess.CanUploadDocument(roles, FileCategory.Voc))
        {
            foreach (var vehicleId in vehicleIds)
            {
                if (!documents.Any(document => document.VehicleId == vehicleId && document.Category == FileCategory.Voc))
                {
                    missing.Add(new(vehicleId, FileCategory.Voc, "VOC upload is missing from this vehicle's history."));
                }
            }
        }

        if (roles.Contains("BossAdmin") || roles.Contains("Loan"))
        {
            foreach (var loan in loans)
            {
                foreach (var category in LoanDocumentRules.CheckCompleteness(loan, documents).MissingCategories)
                {
                    missing.Add(new(loan.VehicleId, category, $"Loan documentation is missing {category}."));
                }
            }
        }

        if (roles.Contains("BossAdmin") || roles.Contains("Delivery"))
        {
            foreach (var delivery in deliveries)
            {
                foreach (var category in DeliveryDocumentRules.CheckCompleteness(delivery, documents).MissingCategories)
                {
                    missing.Add(new(delivery.VehicleId, category, $"Delivery documentation is missing {category}."));
                }
            }
        }

        return missing
            .DistinctBy(item => new { item.VehicleId, item.Category })
            .ToList();
    }
}
