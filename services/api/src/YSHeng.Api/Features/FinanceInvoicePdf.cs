using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class FinanceInvoiceFactory
{
    public static string NumberFor(DateTime now, long sequence)
    {
        var businessDate = AutoCountDateRules.SingaporeAccountingDate(now);
        return $"YSH-INV-{businessDate.Year}-{sequence:000000}";
    }

    public static FinanceInvoice Create(PaymentRecord payment, Vehicle vehicle, Customer customer, string invoiceNumber, string createdBy, DateTime now)
    {
        var invoice = new FinanceInvoice
        {
            PaymentRecordId = payment.Id,
            VehicleId = vehicle.Id,
            CustomerId = customer.Id,
            CustomerName = customer.Name,
            CustomerPhone = customer.Phone,
            CustomerAddress = customer.Address,
            VehiclePlateNumber = vehicle.PlateNumber,
            VehicleDescription = $"{vehicle.Make} {vehicle.Model} {vehicle.Year}".Trim(),
            InvoiceNumber = invoiceNumber,
            InvoiceDate = AutoCountDateRules.SingaporeAccountingDate(now),
            Amount = payment.NettPrice,
            SalesPrice = payment.SalesPrice,
            InterestAdditionalCharges = payment.InterestAdditionalCharges,
            NcdAmount = payment.NcdAmount,
            WindscreenCharges = payment.WindscreenCharges,
            CreatedBy = createdBy,
            CreatedAt = now
        };

        return invoice with
        {
            Content = SimplePdf.Create(
                $"YS Heng Sales Invoice {invoice.InvoiceNumber}",
                [
                    $"Invoice No: {invoice.InvoiceNumber}",
                    $"Invoice Date: {invoice.InvoiceDate:yyyy-MM-dd}",
                    $"Customer: {invoice.CustomerName}",
                    $"Phone: {invoice.CustomerPhone ?? "-"}",
                    $"Address: {invoice.CustomerAddress ?? "-"}",
                    $"Vehicle: {invoice.VehiclePlateNumber} {invoice.VehicleDescription}".Trim(),
                    $"Sales Price: RM {invoice.SalesPrice:N2}",
                    $"Interest / Additional Charges: RM {invoice.InterestAdditionalCharges:N2}",
                    $"Windscreen Charges: RM {invoice.WindscreenCharges:N2}",
                    $"Less NCD: RM {invoice.NcdAmount:N2}",
                    $"Calculated Nett Price: RM {payment.CalculatedNettPrice:N2}",
                    $"Agreed Nett Price: RM {invoice.Amount:N2}",
                    $"Formula: {payment.FormulaVersion}"
                ])
        };
    }
}
