using System.Globalization;
using System.Text;
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
            CustomerTinNumber = customer.TinNumber,
            SalesAgentUserId = payment.SalesAgentUserId,
            SalesAgentName = payment.SalesAgentName,
            LoanBankReference = payment.LoanBankReference,
            VehiclePlateNumber = vehicle.PlateNumber,
            VehicleDescription = $"{vehicle.Make} {vehicle.Model} {vehicle.Year}".Trim(),
            InvoiceNumber = invoiceNumber,
            InvoiceDate = AutoCountDateRules.SingaporeAccountingDate(now),
            Amount = payment.NettPrice,
            SalesPrice = payment.SalesPrice,
            InterestAdditionalCharges = payment.InterestAdditionalCharges,
            NcdAmount = payment.NcdAmount,
            WindscreenCharges = payment.WindscreenCharges,
            InsurancePaidOnBehalfAmount = payment.InsurancePaidOnBehalfAmount,
            RoadTaxPaidOnBehalfAmount = payment.RoadTaxPaidOnBehalfAmount,
            AdvancePaidOnBehalfAmount = payment.AdvancePaidOnBehalfAmount,
            CreatedBy = createdBy,
            CreatedAt = now
        };

        return invoice with { Content = CreatePdf(invoice) };
    }

    private static byte[] CreatePdf(FinanceInvoice invoice)
    {
        var invoiceText = new[]
        {
            invoice.InvoiceNumber, invoice.CustomerName, invoice.CustomerPhone, invoice.CustomerAddress,
            invoice.CustomerTinNumber, invoice.SalesAgentName, invoice.LoanBankReference,
            invoice.VehiclePlateNumber, invoice.VehicleDescription
        };
        if (invoiceText.Any(value => !OwnerPurchaseInvoiceRules.IsPdfTextSupported(value)))
            throw new ArgumentException("Sales invoices support Latin and Chinese text only; unsupported characters cannot be safely rendered in the official PDF.", nameof(invoice));

        var page = new StringBuilder();
        BrandedPdf.Header(page, "SALES INVOICE", invoice.InvoiceNumber);
        BrandedPdf.Text(page, 36, 706, 19, "Sales Invoice", bold: true, color: BrandedPdf.Dark);
        BrandedPdf.Text(page, 36, 688, 10, "Vehicle sale and customer payment summary", color: BrandedPdf.Muted);

        BrandedPdf.Fill(page, 36, 574, 523, 88, BrandedPdf.PaleGray);
        Field(page, 56, 636, "INVOICE NUMBER", invoice.InvoiceNumber);
        Field(page, 315, 636, "INVOICE DATE", invoice.InvoiceDate.ToString("dd MMMM yyyy", CultureInfo.InvariantCulture));
        Field(page, 56, 600, "CUSTOMER", Display(invoice.CustomerName));
        Field(page, 315, 600, "PHONE", Display(invoice.CustomerPhone));

        BrandedPdf.Text(page, 36, 548, 9, "BILL TO", bold: true, color: BrandedPdf.Muted);
        BrandedPdf.TextBlock(page, 36, 530, 10, Display(invoice.CustomerAddress), 240, 13, 2, BrandedPdf.Dark);
        BrandedPdf.TextBlock(page, 36, 494, 9, $"TIN: {Display(invoice.CustomerTinNumber)}", 240, 12, 1, BrandedPdf.Muted);
        BrandedPdf.TextBlock(page, 315, 530, 9.5, $"Vehicle: {invoice.VehiclePlateNumber} {invoice.VehicleDescription}".Trim(), 244, 13, 2, BrandedPdf.Dark);
        BrandedPdf.TextBlock(page, 315, 494, 9, $"Sales agent: {Display(invoice.SalesAgentName)}", 244, 12, 1, BrandedPdf.Muted);
        BrandedPdf.TextBlock(page, 315, 478, 9, $"Loan bank reference: {Display(invoice.LoanBankReference)}", 244, 12, 1, BrandedPdf.Muted);

        BrandedPdf.Fill(page, 36, 436, 523, 27, BrandedPdf.Navy);
        BrandedPdf.Text(page, 54, 445, 9, "DESCRIPTION", bold: true, color: "1 1 1");
        BrandedPdf.Text(page, 470, 445, 9, "AMOUNT (RM)", bold: true, color: "1 1 1");
        var rows = new List<(string Label, decimal Amount)>
        {
            ("Vehicle sales price", invoice.SalesPrice),
            ("Interest / additional charges", invoice.InterestAdditionalCharges),
            ("Windscreen charges", invoice.WindscreenCharges),
            ("Less: No Claim Discount (NCD)", -invoice.NcdAmount),
            ("Insurance paid on behalf", invoice.InsurancePaidOnBehalfAmount),
            ("Road tax paid on behalf", invoice.RoadTaxPaidOnBehalfAmount),
            ("Other advance paid on behalf", invoice.AdvancePaidOnBehalfAmount)
        };
        var agreedAdjustment = invoice.Amount - rows.Sum(row => row.Amount);
        if (agreedAdjustment != 0) rows.Add(("Agreed price adjustment", agreedAdjustment));
        var y = 414;
        foreach (var row in rows)
        {
            BrandedPdf.Text(page, 54, y, 10, row.Label, color: BrandedPdf.Dark);
            BrandedPdf.Text(page, 478, y, 10, $"{row.Amount:N2}", color: BrandedPdf.Dark);
            BrandedPdf.Line(page, 36, y - 9, 559, y - 9, BrandedPdf.Rule);
            y -= 30;
        }

        BrandedPdf.Fill(page, 315, 116, 244, 62, BrandedPdf.PaleBlue);
        BrandedPdf.Text(page, 335, 157, 9, "TOTAL AMOUNT PAYABLE", bold: true, color: BrandedPdf.Blue);
        BrandedPdf.Text(page, 335, 129, 22, $"RM {invoice.Amount:N2}", bold: true, color: BrandedPdf.Navy);
        BrandedPdf.Text(page, 36, 152, 9, "PAYMENT SUMMARY", bold: true, color: BrandedPdf.Muted);
        BrandedPdf.Text(page, 36, 132, 10, "The total shown is the agreed nett price for this sale.", color: BrandedPdf.Dark);
        BrandedPdf.Text(page, 315, 92, 8, $"Generated {invoice.CreatedAt:yyyy-MM-dd HH:mm:ss} UTC", color: BrandedPdf.Muted);
        BrandedPdf.Footer(page, invoice.InvoiceNumber, 1, 1, "YS Heng - Customer copy");

        var searchable = new[] { invoice.InvoiceNumber, invoice.CustomerName, Display(invoice.CustomerPhone), Display(invoice.CustomerAddress), Display(invoice.CustomerTinNumber), Display(invoice.SalesAgentName), Display(invoice.LoanBankReference), invoice.VehiclePlateNumber, invoice.VehicleDescription };
        return BrandedPdf.Create([page.ToString()], searchable);
    }

    private static void Field(StringBuilder page, double x, double y, string label, string value)
    {
        BrandedPdf.Text(page, x, y, 8, label, bold: true, color: BrandedPdf.Muted);
        BrandedPdf.TextBlock(page, x, y - 17, 11, value, 224, 13, 2, BrandedPdf.Dark);
    }

    private static string Display(string? value) => string.IsNullOrWhiteSpace(value) ? "-" : value.Replace('\r', ' ').Replace('\n', ' ').Trim();
}
