using System.Globalization;
using System.IO.Compression;
using System.Security;
using System.Text;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record AutoCountExportInput(
    IReadOnlyList<Vehicle> Vehicles,
    IReadOnlyList<Customer> Customers,
    IReadOnlyList<PurchaseInvoice> PurchaseInvoices,
    IReadOnlyList<SupplierInvoice> SupplierInvoices,
    IReadOnlyList<PaymentRecord> Payments,
    IReadOnlyList<RepairJob> Repairs,
    IReadOnlyList<DailySpend> DailySpends,
    IReadOnlyList<BrokerCommission> BrokerCommissions,
    IReadOnlyList<DebtRecoveryCase> DebtRecoveries,
    IReadOnlyList<PaymentVoucher> PaymentVouchers,
    IReadOnlyList<SettlementReminder> Settlements,
    DateOnly? From,
    DateOnly? To,
    DateTime GeneratedAtUtc,
    IReadOnlyList<FinanceInvoice>? FinanceInvoices = null,
    IReadOnlyList<CollectionTransaction>? Collections = null,
    IReadOnlyList<Supplier>? Suppliers = null,
    IReadOnlyList<DeliveryAccountingCharge>? DeliveryAccountingCharges = null,
    IReadOnlyList<Owner>? Owners = null);

/// <summary>
/// Builds a small, dependency-free Open XML workbook for manual AutoCount mapping.
/// This is intentionally not presented as a verified direct-import file.
/// </summary>
public static class AutoCountExcel
{
    private const string RemarkHeader = "Remark";

    public static byte[] Export(AutoCountExportInput input)
    {
        var sourceVehicles = input.Vehicles.ToDictionary(vehicle => vehicle.Id);
        var sourcePayments = input.Payments.ToDictionary(payment => payment.Id);
        var financeInvoices = input.FinanceInvoices ?? [];
        var collections = input.Collections ?? [];
        var selectedPurchaseInvoices = input.PurchaseInvoices
            .Where(invoice => InPeriod(EffectiveDate(Present(invoice.InvoiceDate), sourceVehicles, invoice.VehicleId), input.From, input.To)).ToList();
        var selectedSupplierInvoices = input.SupplierInvoices
            .Where(invoice => InPeriod(EffectiveDate(Present(invoice.InvoiceDate) ?? Present(invoice.PaidAt) ?? Present(invoice.DueDate), sourceVehicles, invoice.VehicleId), input.From, input.To)).ToList();
        var selectedPayments = input.Payments
            .Where(payment => InPeriod(AutoCountDateRules.SingaporeAccountingDate(payment.CreatedAt), input.From, input.To)).ToList();
        var selectedRepairs = input.Repairs
            .Where(repair => InPeriod(EffectiveDate(null, sourceVehicles, repair.VehicleId), input.From, input.To)).ToList();
        var selectedDailySpends = input.DailySpends
            .Where(spend => InPeriod(spend.DueDate, input.From, input.To)).ToList();
        var selectedBrokerCommissions = input.BrokerCommissions
            .Where(commission => InPeriod(EffectiveDate(null, sourceVehicles, commission.VehicleId), input.From, input.To)).ToList();
        var selectedDebtRecoveries = input.DebtRecoveries
            .Where(debt => InPeriod(EffectiveDate(Present(debt.FollowUpDate), sourceVehicles, debt.VehicleId), input.From, input.To)).ToList();
        var selectedPaymentVouchers = input.PaymentVouchers
            .Where(voucher => InPeriod(EffectiveDate(Present(voucher.IssuedDate), sourceVehicles, voucher.VehicleId), input.From, input.To)).ToList();
        var selectedSettlements = input.Settlements
            .Where(settlement => InPeriod(EffectiveDate(Present(settlement.Deadline), sourceVehicles, settlement.VehicleId), input.From, input.To)).ToList();
        var selectedFinanceInvoices = financeInvoices
            .Where(invoice => InPeriod(invoice.InvoiceDate, input.From, input.To)).ToList();
        var selectedCollections = collections
            .Where(collection => InPeriod(collection.ReceivedDate, input.From, input.To)).ToList();

        var referencedVehicleIds = input.Vehicles
            .Where(vehicle => InPeriod(vehicle.IntakeDate, input.From, input.To))
            .Select(vehicle => vehicle.Id)
            .ToHashSet();
        foreach (var vehicleId in selectedPurchaseInvoices.Select(invoice => invoice.VehicleId)
                     .Concat(selectedSupplierInvoices.Select(invoice => invoice.VehicleId))
                     .Concat(selectedPayments.Select(payment => payment.VehicleId))
                     .Concat(selectedRepairs.Select(repair => repair.VehicleId))
                     .Concat(selectedBrokerCommissions.Select(commission => commission.VehicleId))
                     .Concat(selectedDebtRecoveries.Select(debt => debt.VehicleId))
                     .Concat(selectedPaymentVouchers.Select(voucher => voucher.VehicleId))
                     .Concat(selectedSettlements.Select(settlement => settlement.VehicleId))
                     .Concat(selectedFinanceInvoices.Select(invoice => invoice.VehicleId))
                     .Concat(selectedCollections.Select(collection => sourcePayments.GetValueOrDefault(collection.PaymentRecordId)?.VehicleId ?? Guid.Empty)))
        {
            referencedVehicleIds.Add(vehicleId);
        }

        // A referenced master row must travel with its transaction even when the master date is outside the selected period.
        var includedVehicles = input.Vehicles.Where(vehicle => referencedVehicleIds.Contains(vehicle.Id)).ToList();
        var includedCustomerIds = includedVehicles.Where(vehicle => vehicle.CustomerId.HasValue).Select(vehicle => vehicle.CustomerId!.Value)
            .Concat(selectedFinanceInvoices.Select(invoice => invoice.CustomerId)).ToHashSet();
        var includedCustomers = input.Customers
            .Where(customer => includedCustomerIds.Contains(customer.Id))
            .OrderBy(customer => customer.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
        var includedOwnerIds = includedVehicles.Where(vehicle => vehicle.OwnerId.HasValue).Select(vehicle => vehicle.OwnerId!.Value).ToHashSet();
        var includedOwners = (input.Owners ?? []).Where(owner => includedOwnerIds.Contains(owner.Id)).OrderBy(owner => owner.Name, StringComparer.OrdinalIgnoreCase).ToList();

        var selectedInput = input with
        {
            Vehicles = includedVehicles,
            Customers = includedCustomers,
            Owners = includedOwners,
            PurchaseInvoices = selectedPurchaseInvoices,
            SupplierInvoices = selectedSupplierInvoices,
            Payments = selectedPayments,
            Repairs = selectedRepairs,
            DailySpends = selectedDailySpends,
            BrokerCommissions = selectedBrokerCommissions,
            DebtRecoveries = selectedDebtRecoveries,
            PaymentVouchers = selectedPaymentVouchers,
            Settlements = selectedSettlements,
            FinanceInvoices = selectedFinanceInvoices,
            Collections = selectedCollections
        };
        var vehicleLookup = selectedInput.Vehicles.ToDictionary(vehicle => vehicle.Id);

        var sheets = new List<Sheet>
        {
            new("Manifest", ManifestRows(selectedInput, includedVehicles, includedCustomers)),
            new("Customers", CustomerRows(includedCustomers)),
            new("Vehicles", VehicleRows(includedVehicles)),
            new("Purchases", PurchaseRows(selectedInput, vehicleLookup)),
            new("Payments", PaymentRows(selectedInput, vehicleLookup)),
            new("Expenses", ExpenseRows(selectedInput, vehicleLookup)),
            new("SalesInvoices", SalesInvoiceRows(selectedInput, vehicleLookup)),
            // Collections are period-scoped, but their invoice reference may belong to an earlier period.
            new("Collections", CollectionRows(selectedInput, vehicleLookup, sourcePayments, financeInvoices)),
            new("Suppliers", SupplierRows(selectedInput.Suppliers ?? [])),
            new("Owners", OwnerRows(selectedInput.Owners ?? [])),
            new("SalesLines", SalesLineRows(selectedInput, vehicleLookup)),
            new("DeliveryCharges", DeliveryAccountingChargeRows(selectedInput, vehicleLookup))
        };

        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            WriteEntry(archive, "[Content_Types].xml", ContentTypesXml(sheets.Count));
            WriteEntry(archive, "_rels/.rels", RootRelationshipsXml());
            WriteEntry(archive, "xl/workbook.xml", WorkbookXml(sheets));
            WriteEntry(archive, "xl/_rels/workbook.xml.rels", WorkbookRelationshipsXml(sheets.Count));
            WriteEntry(archive, "xl/styles.xml", StylesXml());
            for (var index = 0; index < sheets.Count; index++)
            {
                WriteEntry(archive, $"xl/worksheets/sheet{index + 1}.xml", WorksheetXml(sheets[index].Rows));
            }
        }

        return output.ToArray();
    }

    private static IReadOnlyList<IReadOnlyList<string>> ManifestRows(AutoCountExportInput input, IReadOnlyList<Vehicle> vehicles, IReadOnlyList<Customer> customers)
    {
        var from = input.From?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "Not set";
        var to = input.To?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "Not set";
        return
        [
            ["AutoCount V2 mapping workbook", "Value"],
            ["Workbook purpose", "Manual mapping aid for AutoCount 2.2 review; this is not a verified direct AutoCount import."],
            ["Generated at (UTC)", input.GeneratedAtUtc.ToString("O", CultureInfo.InvariantCulture)],
            ["Period from (inclusive)", from],
            ["Period to (inclusive)", to],
            ["Category sheets", "Customers, Owners, Suppliers, Vehicles, Purchases, Payments, Expenses, SalesInvoices, SalesLines, DeliveryCharges, Collections"],
            ["Vehicles included", vehicles.Count.ToString(CultureInfo.InvariantCulture)],
            ["Customers included", customers.Count.ToString(CultureInfo.InvariantCulture)],
            ["Data boundary", "Only values currently persisted in YS Heng are included; no tax code is inferred."],
            ["Approved classification mapping", "Vehicle/car = 025; insurance = 006; road tax = 006. Classification is separate from TaxCode."],
            ["Approved account mapping", "Vehicle sale 5500-0000; insurance sale 4001-I001; road-tax sale 4001-R001; vehicle purchase 6P00-0000; purchase processing 6P00-1000; parking 6T00-1000; refurbishment 6R00-0000; insurance paid on behalf 4001-I002; loan application fee 8000-L002."],
            ["Mapping limitation", "TaxCode remains blank until Finance confirms the approved AutoCount tax-code mapping."],
            ["Period note", "Records without their own date use the linked vehicle intake date where available; PaymentRecord.CreatedAt is converted to Asia/Singapore accounting date; referenced vehicle/customer masters are retained."],
            ["Cell typing", "Money and whole-number fields are emitted as numeric XLSX cells where practical; identifiers, dates, statuses and Remarks remain text."],
            ["Review instruction", "Check every Remark field and confirm the AutoCount 2.2 template/account mapping before any manual import."]
        ];
    }

    private static IReadOnlyList<IReadOnlyList<string>> CustomerRows(IReadOnlyList<Customer> customers)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "CustomerName", "Phone", "IcNumber", "TinNumber", "Email", "Address", RemarkHeader } };
        rows.AddRange(customers.Select(customer => new[] {
            customer.Id.ToString(), customer.Name, customer.Phone, customer.IcNumber ?? "", customer.TinNumber ?? "", customer.Email ?? "", customer.Address ?? "",
            string.IsNullOrWhiteSpace(customer.Address) ? "Address is not persisted; confirm AutoCount customer master mapping." : "Customer/account code mapping not verified."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> OwnerRows(IReadOnlyList<Owner> owners)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "OwnerName", "Phone", "IcNumber", "TinNumber", "Address", RemarkHeader } };
        rows.AddRange(owners.Select(owner => new[] {
            owner.Id.ToString(), owner.Name, owner.Phone, owner.IcNumber ?? "", owner.TinNumber ?? "", owner.Address ?? "",
            "Previous-owner master details for settlement review; confirm the AutoCount creditor/account mapping before import."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> VehicleRows(IReadOnlyList<Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "CarPlate", "ChassisNumber", "EngineNumber", "Make", "Model", "Year", "StockOwner", "StockLocation", "Status", "PurchasePrice", "SellingPrice", "AdditionalCharges", "RefurbishmentTotal", "CommissionTotal", "CustomerId", "OwnerId", "IntakeDate", RemarkHeader }
        };
        rows.AddRange(vehicles.Select(vehicle => new[] {
            vehicle.Id.ToString(), vehicle.PlateNumber, vehicle.ChassisNumber ?? "", vehicle.EngineNumber ?? "", vehicle.Make, vehicle.Model, vehicle.Year.ToString(CultureInfo.InvariantCulture), vehicle.StockOwner.ToString(), vehicle.StockLocation, vehicle.Status.ToString(),
            Money(vehicle.PurchasePrice), Money(vehicle.SellingPrice), Money(vehicle.AdditionalCharges), Money(vehicle.RefurbishmentTotal), Money(vehicle.CommissionTotal),
            vehicle.CustomerId?.ToString() ?? "", vehicle.OwnerId?.ToString() ?? "", vehicle.IntakeDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            "Vehicle classification 025. TaxCode remains blank until Finance confirms it."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> SupplierRows(IReadOnlyList<Supplier> suppliers)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "CompanyName", "RegistrationNumber", "TinNumber", "Address", "Phone", "ContactPerson", "AutoCountCreditorCode", "ApprovalStatus", RemarkHeader } };
        rows.AddRange(suppliers.OrderBy(supplier => supplier.CompanyName).Select(supplier => new[] {
            supplier.Id.ToString(), supplier.CompanyName, supplier.RegistrationNumber ?? "", supplier.TinNumber ?? "", supplier.Address, supplier.Phone,
            supplier.ContactPerson ?? "", supplier.AutoCountCreditorCode ?? "", supplier.ApprovalStatus.ToString(),
            supplier.ApprovalStatus == SupplierApprovalStatus.Approved ? "Approved supplier master." : "Draft supplier; do not import until Finance approval."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> PurchaseRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var suppliers = (input.Suppliers ?? []).ToDictionary(supplier => supplier.Id);
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "Category", "CarPlate", "InvoiceNumber", "SupplierName", "InvoiceDate", "PurchaseDate", "PaymentReference", "LineType", "Description", "AccountCode", "UOM", "Amount", "CapitaliseIntoVehicleCost", "AccountingStatus", "TaxCode", RemarkHeader } };
        rows.AddRange(input.PurchaseInvoices.SelectMany(invoice => (invoice.Lines.Count > 0 ? invoice.Lines : [new PurchaseInvoiceLine { Id = invoice.Id, PurchaseInvoiceId = invoice.Id, LineType = PurchaseInvoiceLineType.Other, Description = "Legacy purchase invoice - classify before import", Amount = invoice.Amount }]).Select(line => new[] {
            line.Id.ToString(), "PurchaseInvoice", PlateFor(vehicles, invoice.VehicleId), invoice.InvoiceNumber,
            invoice.SupplierId.HasValue && suppliers.TryGetValue(invoice.SupplierId.Value, out var supplier) ? supplier.CompanyName : "",
            Date(invoice.InvoiceDate), Date(invoice.PurchaseDate), invoice.PaymentReference ?? "", line.LineType.ToString(), line.Description,
            PurchaseAccountCode(line.LineType), "UNIT", Money(line.Amount), line.CapitaliseIntoVehicleCost ? "Yes" : "No", invoice.AccountingStatus.ToString(), "",
            "Account follows the approved workbook mapping where available; TaxCode is intentionally blank pending Finance confirmation."
        })));
        rows.AddRange(input.SupplierInvoices.Select(invoice => new[] {
            invoice.Id.ToString(), "SupplierInvoice", PlateFor(vehicles, invoice.VehicleId), invoice.InvoiceNumber, invoice.SupplierName, Date(invoice.InvoiceDate), "", "", "Other", invoice.PlateNumberOnInvoice ?? "", "", "UNIT", Money(invoice.Amount), "No", "", "", "Supplier invoice needs Finance account and TaxCode review."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> PaymentRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "CarPlate", "Status", "NettPrice", "ReceiptNumber", "InvoiceNumber", "SalesPrice", "InterestAdditionalCharges", "NcdAmount", "WindscreenCharges", "SalesAgent", "LoanBankReference", "InsurancePaidOnBehalfAmount", "RoadTaxPaidOnBehalfAmount", "AdvancePaidOnBehalfAmount", "OutstationDeliveryDate", "BankName", "BankFollowUpDate", "CreatedAt", RemarkHeader } };
        rows.AddRange(input.Payments.OrderByDescending(payment => payment.CreatedAt).Select(payment => new[] {
            payment.Id.ToString(), PlateFor(vehicles, payment.VehicleId), payment.Status.ToString(), Money(payment.NettPrice), payment.ReceiptNumber ?? "", payment.InvoiceNumber ?? "", Money(payment.SalesPrice), Money(payment.InterestAdditionalCharges), Money(payment.NcdAmount), Money(payment.WindscreenCharges), payment.SalesAgentName ?? "", payment.LoanBankReference ?? "", Money(payment.InsurancePaidOnBehalfAmount), Money(payment.RoadTaxPaidOnBehalfAmount), Money(payment.AdvancePaidOnBehalfAmount), Date(payment.OutstationDeliveryDate), payment.BankName ?? "", Date(payment.BankFollowUpDate), AutoCountDateRules.SingaporeAccountingDate(payment.CreatedAt).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            "Manual review required; this workbook is a mapping aid and not a verified direct AutoCount import."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> ExpenseRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>> { new[] { "SourceId", "Category", "CarPlate", "Description", "Amount", "EffectiveDate", "Status", RemarkHeader } };
        rows.AddRange(input.Repairs.Select(repair => new[] {
            repair.Id.ToString(), "Repair", PlateFor(vehicles, repair.VehicleId), $"{repair.RepairPart} - {repair.WhatToDo}".Trim(" -".ToCharArray()), Money(repair.Cost), VehicleDate(vehicles, repair.VehicleId), repair.ApprovalStatus.ToString(), "Repair expense/account mapping is not verified; source has no repair date."
        }));
        rows.AddRange(input.DailySpends.Select(spend => new[] {
            spend.Id.ToString(), "DailySpend", "", spend.Description, Money(spend.Amount), Date(Present(spend.DueDate)), spend.IsPaid ? "Paid" : "Due", "Expense account/tax mapping is not verified."
        }));
        rows.AddRange(input.BrokerCommissions.Select(commission => new[] {
            commission.Id.ToString(), "BrokerCommission", PlateFor(vehicles, commission.VehicleId), commission.BrokerName, Money(commission.Amount), VehicleDate(vehicles, commission.VehicleId), commission.IsPaid ? "Paid" : "Unpaid", "Broker/account mapping is not verified; source has no commission date."
        }));
        rows.AddRange(input.DebtRecoveries.Select(debt => new[] {
            debt.Id.ToString(), "DebtRecovery", PlateFor(vehicles, debt.VehicleId), debt.Notes ?? "Balance recovery", Money(debt.BalanceAmount), EffectiveDateText(Present(debt.FollowUpDate), vehicles, debt.VehicleId), debt.Status.ToString(), "Debt recovery is operational data; accounting treatment is not verified."
        }));
        rows.AddRange(input.PaymentVouchers.Select(voucher => new[] {
            voucher.Id.ToString(), "PaymentVoucher", PlateFor(vehicles, voucher.VehicleId), $"{voucher.PayeeName}: {voucher.Purpose} | {voucher.PaymentMethod} | Source {voucher.SourceAccountCode} | Account {voucher.AccountingAccountCode} | Ref {voucher.ChequeNumber ?? voucher.PaymentReference ?? "-"} | Bank charge {Money(voucher.BankChargeAmount)} ({voucher.BankChargeAccountCode ?? "-"})", Money(voucher.Amount), EffectiveDateText(Present(voucher.IssuedDate), vehicles, voucher.VehicleId), voucher.Status.ToString(), voucher.Status == PaymentVoucherStatus.Paid ? "Paid with maker-checker evidence captured; TaxCode still needs Finance mapping." : "Do not post until the voucher is paid."
        }));
        rows.AddRange(input.Settlements.Select(settlement => new[] {
            settlement.Id.ToString(), "Settlement", PlateFor(vehicles, settlement.VehicleId), "Previous owner settlement", Money(settlement.Amount), EffectiveDateText(Present(settlement.Deadline), vehicles, settlement.VehicleId), settlement.IsPaid ? "Paid" : "Due", "Settlement account mapping is not verified."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> SalesInvoiceRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "InvoiceNumber", "InvoiceDate", "CustomerId", "CustomerName", "CarPlate", "Amount", "SalesPrice", "InterestAdditionalCharges", "NcdAmount", "WindscreenCharges", "CreatedBy", RemarkHeader }
        };
        rows.AddRange((input.FinanceInvoices ?? []).OrderBy(invoice => invoice.InvoiceDate).Select(invoice => new[] {
            invoice.Id.ToString(), invoice.InvoiceNumber, Date(invoice.InvoiceDate), invoice.CustomerId.ToString(), invoice.CustomerName,
            string.IsNullOrWhiteSpace(invoice.VehiclePlateNumber) ? PlateFor(vehicles, invoice.VehicleId) : invoice.VehiclePlateNumber,
            Money(invoice.Amount), Money(invoice.SalesPrice), Money(invoice.InterestAdditionalCharges), Money(invoice.NcdAmount), Money(invoice.WindscreenCharges), invoice.CreatedBy,
            "YS Heng-issued invoice. Confirm AutoCount customer, account and tax mapping before manual entry or import."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> SalesLineRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "InvoiceNumber", "InvoiceDate", "CustomerTinNumber", "SalesAgent", "LoanBankReference", "CarPlate", "ItemCode", "Description", "AccountCode", "ClassificationCode", "TaxCode", "Amount", RemarkHeader }
        };
        foreach (var invoice in (input.FinanceInvoices ?? []).OrderBy(item => item.InvoiceDate))
        {
            var plate = string.IsNullOrWhiteSpace(invoice.VehiclePlateNumber) ? PlateFor(vehicles, invoice.VehicleId) : invoice.VehiclePlateNumber;
            rows.Add(new[] { invoice.Id.ToString(), invoice.InvoiceNumber, Date(invoice.InvoiceDate), invoice.CustomerTinNumber ?? "", invoice.SalesAgentName ?? "", invoice.LoanBankReference ?? "", plate, plate, $"Vehicle sale - {plate}", "5500-0000", "025", "", Money(invoice.SalesPrice), "Vehicle account/classification follows the approved workbook. TaxCode is intentionally blank." });
            if (invoice.InterestAdditionalCharges != 0)
            {
                rows.Add(new[] { invoice.Id.ToString(), invoice.InvoiceNumber, Date(invoice.InvoiceDate), invoice.CustomerTinNumber ?? "", invoice.SalesAgentName ?? "", invoice.LoanBankReference ?? "", plate, "ADDITIONAL CHARGES", "Interest / additional charges", "", "", "", Money(invoice.InterestAdditionalCharges), "Finance must select the approved AutoCount item, account, classification and TaxCode before import." });
            }
            if (invoice.WindscreenCharges != 0)
            {
                rows.Add(new[] { invoice.Id.ToString(), invoice.InvoiceNumber, Date(invoice.InvoiceDate), invoice.CustomerTinNumber ?? "", invoice.SalesAgentName ?? "", invoice.LoanBankReference ?? "", plate, "WINDSCREEN", "Windscreen charges", "", "", "", Money(invoice.WindscreenCharges), "Finance must select the approved AutoCount item, account, classification and TaxCode before import." });
            }
            if (invoice.NcdAmount != 0)
            {
                rows.Add(new[] { invoice.Id.ToString(), invoice.InvoiceNumber, Date(invoice.InvoiceDate), invoice.CustomerTinNumber ?? "", invoice.SalesAgentName ?? "", invoice.LoanBankReference ?? "", plate, "NCD", "NCD deduction", "", "", "", Money(-invoice.NcdAmount), "Finance must select the approved AutoCount item, account, classification and TaxCode before import." });
            }
            if (invoice.InsurancePaidOnBehalfAmount > 0)
            {
                rows.Add(new[] { invoice.Id.ToString(), invoice.InvoiceNumber, Date(invoice.InvoiceDate), invoice.CustomerTinNumber ?? "", invoice.SalesAgentName ?? "", invoice.LoanBankReference ?? "", plate, "INSURANCE (MV)", "Insurance paid on behalf", "4001-I001", "006", "", Money(invoice.InsurancePaidOnBehalfAmount), "Insurance account/classification follows the approved workbook. TaxCode is intentionally blank." });
            }
            if (invoice.RoadTaxPaidOnBehalfAmount > 0)
            {
                rows.Add(new[] { invoice.Id.ToString(), invoice.InvoiceNumber, Date(invoice.InvoiceDate), invoice.CustomerTinNumber ?? "", invoice.SalesAgentName ?? "", invoice.LoanBankReference ?? "", plate, "ROAD TAX", "Road tax paid on behalf", "4001-R001", "006", "", Money(invoice.RoadTaxPaidOnBehalfAmount), "Road-tax account/classification follows the approved workbook. TaxCode is intentionally blank." });
            }
            if (invoice.AdvancePaidOnBehalfAmount > 0)
            {
                rows.Add(new[] { invoice.Id.ToString(), invoice.InvoiceNumber, Date(invoice.InvoiceDate), invoice.CustomerTinNumber ?? "", invoice.SalesAgentName ?? "", invoice.LoanBankReference ?? "", plate, "ADVANCE", "Other advance paid on behalf", "", "", "", Money(invoice.AdvancePaidOnBehalfAmount), "Finance must select the approved AutoCount item, account, classification and TaxCode before import." });
            }
        }
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> DeliveryAccountingChargeRows(AutoCountExportInput input, IReadOnlyDictionary<Guid, Vehicle> vehicles)
    {
        var suppliers = (input.Suppliers ?? []).ToDictionary(supplier => supplier.Id);
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "CarPlate", "ChargeType", "Provider", "SupplierCreditorCode", "InvoiceDate", "ReferenceNumber", "Amount", "PaidOnBehalf", "PurchaseAccountCode", "ClassificationCode", "TaxCode", "AccountingStatus", RemarkHeader }
        };
        rows.AddRange((input.DeliveryAccountingCharges ?? []).OrderBy(charge => charge.InvoiceDate).Select(charge => new[] {
            charge.Id.ToString(), PlateFor(vehicles, charge.VehicleId), charge.ChargeType.ToString(), charge.ProviderName,
            charge.SupplierId.HasValue && suppliers.TryGetValue(charge.SupplierId.Value, out var supplier) ? supplier.AutoCountCreditorCode ?? "" : "",
            Date(charge.InvoiceDate), charge.ReferenceNumber ?? "", Money(charge.Amount), charge.PaidOnBehalf ? "Yes" : "No",
            charge.ChargeType == DeliveryAccountingChargeType.Insurance ? "4001-I002" : "", "006", "", charge.AccountingStatus.ToString(),
            charge.AccountingStatus == AccountingConfirmationStatus.FinanceConfirmed ? "Finance confirmed; TaxCode remains a separate unresolved field." : "Draft only; do not import."
        }));
        return rows;
    }

    private static IReadOnlyList<IReadOnlyList<string>> CollectionRows(
        AutoCountExportInput input,
        IReadOnlyDictionary<Guid, Vehicle> vehicles,
        IReadOnlyDictionary<Guid, PaymentRecord> payments,
        IReadOnlyList<FinanceInvoice> invoiceLookup)
    {
        var invoices = invoiceLookup.ToDictionary(invoice => invoice.PaymentRecordId);
        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "SourceId", "PaymentRecordId", "InvoiceNumber", "CarPlate", "ReceivedDate", "Amount", "Method", "CollectionStatus", "FinancingStatus", "Reference", "CreatedBy", "ReconciledBy", "ReconciledAt", "ReversalReason", RemarkHeader }
        };
        rows.AddRange((input.Collections ?? []).OrderBy(collection => collection.ReceivedDate).Select(collection =>
        {
            payments.TryGetValue(collection.PaymentRecordId, out var payment);
            invoices.TryGetValue(collection.PaymentRecordId, out var invoice);
            var remark = collection.Status switch
            {
                CollectionStatus.Reconciled => "Reconciled in YS Heng; confirm bank and AutoCount receipt/account mapping before posting.",
                CollectionStatus.Reversed => "Reversed in YS Heng; do not post as an active receipt. Review any matching AutoCount entry.",
                _ => "Pending reconciliation in YS Heng; do not treat as a completed receipt."
            };
            return new[] {
                collection.Id.ToString(), collection.PaymentRecordId.ToString(), invoice?.InvoiceNumber ?? "",
                payment is null ? "" : PlateFor(vehicles, payment.VehicleId), Date(collection.ReceivedDate), Money(collection.Amount),
                collection.Method.ToString(), collection.Status.ToString(), collection.FinancingStatus.ToString(), collection.Reference ?? "",
                collection.CreatedBy, collection.ReconciledBy ?? "", collection.ReconciledAt?.ToString("O", CultureInfo.InvariantCulture) ?? "", collection.ReversalReason ?? "", remark
            };
        }));
        return rows;
    }

    private static string VehicleDate(IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) => vehicles.TryGetValue(vehicleId, out var vehicle) ? Date(vehicle.IntakeDate) : "";
    private static string PlateFor(IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) => vehicles.TryGetValue(vehicleId, out var vehicle) ? vehicle.PlateNumber : "";
    private static DateOnly? EffectiveDate(DateOnly? ownDate, IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) => ownDate ?? (vehicles.TryGetValue(vehicleId, out var vehicle) ? vehicle.IntakeDate : null);
    private static string EffectiveDateText(DateOnly? ownDate, IReadOnlyDictionary<Guid, Vehicle> vehicles, Guid vehicleId) => Date(EffectiveDate(ownDate, vehicles, vehicleId));
    private static string Money(decimal value) => value.ToString("0.00", CultureInfo.InvariantCulture);
    private static string PurchaseAccountCode(PurchaseInvoiceLineType lineType) => lineType switch
    {
        PurchaseInvoiceLineType.VehiclePurchase => "6P00-0000",
        PurchaseInvoiceLineType.PurchaseProcessing => "6P00-1000",
        PurchaseInvoiceLineType.Parking => "6T00-1000",
        PurchaseInvoiceLineType.Refurbishment => "6R00-0000",
        _ => ""
    };
    private static string Date(DateOnly? value) => value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "";
    private static DateOnly? Present(DateOnly value) => value == default ? null : value;
    private static DateOnly? Present(DateOnly? value) => value is { } date && date != default ? date : null;
    private static bool InPeriod(DateOnly? date, DateOnly? from, DateOnly? to) => from is null && to is null || date.HasValue && (!from.HasValue || date.Value >= from.Value) && (!to.HasValue || date.Value <= to.Value);

    private sealed record Sheet(string Name, IReadOnlyList<IReadOnlyList<string>> Rows);

    private static void WriteEntry(ZipArchive archive, string path, string content)
    {
        var entry = archive.CreateEntry(path, CompressionLevel.Optimal);
        using var writer = new StreamWriter(entry.Open(), new UTF8Encoding(false));
        writer.Write(content);
    }

    private static string WorksheetXml(IReadOnlyList<IReadOnlyList<string>> rows)
    {
        var builder = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetData>");
        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            builder.Append($"<row r=\"{rowIndex + 1}\">");
            for (var columnIndex = 0; columnIndex < rows[rowIndex].Count; columnIndex++)
            {
                var reference = $"{ColumnName(columnIndex + 1)}{rowIndex + 1}";
                var value = rows[rowIndex][columnIndex] ?? "";
                var header = rows[0].Count > columnIndex ? rows[0][columnIndex] : "";
                if (rowIndex > 0 && IsNumericColumn(header) && decimal.TryParse(value, NumberStyles.Number, CultureInfo.InvariantCulture, out var numericValue))
                {
                    builder.Append($"<c r=\"{reference}\" t=\"n\"><v>{numericValue.ToString("0.####################", CultureInfo.InvariantCulture)}</v></c>");
                }
                else
                {
                    builder.Append($"<c r=\"{reference}\" t=\"inlineStr\"><is><t xml:space=\"preserve\">{Xml(value)}</t></is></c>");
                }
            }
            builder.Append("</row>");
        }
        return builder.Append("</sheetData></worksheet>").ToString();
    }

    private static string WorkbookXml(IReadOnlyList<Sheet> sheets)
    {
        var builder = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets>");
        for (var index = 0; index < sheets.Count; index++) builder.Append($"<sheet name=\"{Xml(sheets[index].Name)}\" sheetId=\"{index + 1}\" r:id=\"rId{index + 1}\"/>");
        return builder.Append("</sheets></workbook>").ToString();
    }

    private static string WorkbookRelationshipsXml(int sheetCount) =>
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">" +
        string.Concat(Enumerable.Range(1, sheetCount).Select(index => $"<Relationship Id=\"rId{index}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet{index}.xml\"/>")) +
        $"<Relationship Id=\"rId{sheetCount + 1}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>";

    private static string ContentTypesXml(int sheetCount) =>
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>" +
        string.Concat(Enumerable.Range(1, sheetCount).Select(index => $"<Override PartName=\"/xl/worksheets/sheet{index}.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>")) +
        "</Types>";

    private static string RootRelationshipsXml() => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>";
    private static string StylesXml() => "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><fonts count=\"1\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts><fills count=\"2\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill></fills><borders count=\"1\"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\"/></cellStyleXfs><cellXfs count=\"1\"><xf numFmtId=\"0\" fontId=\"0\" fillId=\"0\" borderId=\"0\" xfId=\"0\"/></cellXfs></styleSheet>";
    private static string Xml(string value) => SecurityElement.Escape(value) ?? "";
    private static bool IsNumericColumn(string header) => header is "Year" or "PurchasePrice" or "SellingPrice" or "AdditionalCharges" or "RefurbishmentTotal" or "CommissionTotal" or "Amount" or "NettPrice" or "SalesPrice" or "InterestAdditionalCharges" or "NcdAmount" or "WindscreenCharges";

    private static string ColumnName(int column)
    {
        var name = new StringBuilder();
        while (column > 0)
        {
            column--;
            name.Insert(0, (char)('A' + column % 26));
            column /= 26;
        }
        return name.ToString();
    }
}

public static class AutoCountDateRules
{
    private static readonly TimeZoneInfo SingaporeTimeZone = ResolveSingaporeTimeZone();

    public static DateOnly SingaporeAccountingDate(DateTime value)
    {
        var utc = value.Kind == DateTimeKind.Local
            ? value.ToUniversalTime()
            : DateTime.SpecifyKind(value, DateTimeKind.Utc);
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utc, SingaporeTimeZone));
    }

    public static string PeriodLabel(DateOnly? from, DateOnly? to) =>
        from is null && to is null
            ? "all"
            : $"{from?.ToString("yyyyMMdd", CultureInfo.InvariantCulture) ?? "start"}-{to?.ToString("yyyyMMdd", CultureInfo.InvariantCulture) ?? "end"}";

    public static bool IsValidPeriod(DateOnly? from, DateOnly? to) => !from.HasValue || !to.HasValue || from <= to;

    private static TimeZoneInfo ResolveSingaporeTimeZone()
    {
        foreach (var id in new[] { "Asia/Singapore", "Singapore Standard Time" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (TimeZoneNotFoundException)
            {
                // Try the other platform-specific identifier.
            }
            catch (InvalidTimeZoneException)
            {
                // Try the other platform-specific identifier.
            }
        }

        return TimeZoneInfo.Utc;
    }
}
