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
        BrandedPdf.Header(page, "SALES INVOICE", invoice.InvoiceNumber, "OFFICIAL INVOICE");
        BrandedPdf.Text(page, 36, 704, 19, "Sales Invoice", bold: true, color: BrandedPdf.Dark);
        BrandedPdf.Text(page, 36, 687, 10, "Vehicle sale and customer payment summary", color: BrandedPdf.Muted);

        BrandedPdf.Fill(page, 36, 582, 523, 76, BrandedPdf.PaleGray);
        Field(page, 56, 632, "INVOICE NUMBER", invoice.InvoiceNumber);
        Field(page, 315, 632, "ISSUED DATE", invoice.InvoiceDate.ToString("dd MMMM yyyy", CultureInfo.InvariantCulture));
        Field(page, 56, 596, "CUSTOMER", Display(invoice.CustomerName));
        Field(page, 315, 596, "PHONE", Display(invoice.CustomerPhone));

        BrandedPdf.Text(page, 36, 550, 9, "BILL TO / CUSTOMER DETAILS", bold: true, color: BrandedPdf.Muted);
        BrandedPdf.Text(page, 315, 550, 9, "VEHICLE DETAILS", bold: true, color: BrandedPdf.Muted);
        BrandedPdf.TextBlock(page, 36, 532, 10, Display(invoice.CustomerAddress), 240, 13, 2, BrandedPdf.Dark);
        BrandedPdf.TextBlock(page, 36, 500, 9, $"TIN: {Display(invoice.CustomerTinNumber)}", 240, 12, 1, BrandedPdf.Muted);
        BrandedPdf.TextBlock(page, 315, 532, 10, $"Vehicle: {invoice.VehiclePlateNumber} {invoice.VehicleDescription}".Trim(), 244, 13, 2, BrandedPdf.Dark);
        BrandedPdf.TextBlock(page, 315, 500, 9, $"Sales agent: {Display(invoice.SalesAgentName)}", 244, 12, 1, BrandedPdf.Muted);
        BrandedPdf.TextBlock(page, 315, 484, 9, $"Loan bank reference: {Display(invoice.LoanBankReference)}", 244, 12, 1, BrandedPdf.Muted);

        BrandedPdf.Line(page, 36, 458, 559, 458, BrandedPdf.Rule);
        BrandedPdf.Fill(page, 36, 426, 523, 27, BrandedPdf.Navy);
        BrandedPdf.Text(page, 54, 435, 9, "DESCRIPTION", bold: true, color: "1 1 1");
        BrandedPdf.Text(page, 470, 435, 9, "AMOUNT (RM)", bold: true, color: "1 1 1");
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
        var y = 404;
        foreach (var row in rows)
        {
            BrandedPdf.Text(page, 54, y, 10, row.Label, color: BrandedPdf.Dark);
            BrandedPdf.Text(page, 478, y, 10, $"{row.Amount:N2}", color: BrandedPdf.Dark);
            BrandedPdf.Line(page, 36, y - 9, 559, y - 9, BrandedPdf.Rule);
            y -= 30;
        }

        BrandedPdf.Fill(page, 36, 146, 523, 78, BrandedPdf.PaleBlue);
        BrandedPdf.Text(page, 56, 199, 9, "AMOUNT PAYABLE", bold: true, color: BrandedPdf.Blue);
        BrandedPdf.Text(page, 56, 169, 25, $"RM {invoice.Amount:N2}", bold: true, color: BrandedPdf.Navy);
        BrandedPdf.Text(page, 315, 199, 9, "AMOUNT IN WORDS", bold: true, color: BrandedPdf.Blue);
        BrandedPdf.TextBlock(page, 315, 181, 10, AmountInWords(invoice.Amount), 220, 13, 3, BrandedPdf.Dark);
        BrandedPdf.Text(page, 36, 119, 9, "PAYMENT SUMMARY", bold: true, color: BrandedPdf.Muted);
        BrandedPdf.Text(page, 36, 101, 10, "The total shown is the agreed nett price for this sale.", color: BrandedPdf.Dark);
        BrandedPdf.Text(page, 36, 82, 8, $"Generated {invoice.CreatedAt:yyyy-MM-dd HH:mm:ss} UTC", color: BrandedPdf.Muted);
        BrandedPdf.Footer(page, invoice.InvoiceNumber, 1, 1, "YS Heng - Customer copy");

        var searchable = new[] { invoice.InvoiceNumber, invoice.CustomerName, Display(invoice.CustomerPhone), Display(invoice.CustomerAddress), Display(invoice.CustomerTinNumber), Display(invoice.SalesAgentName), Display(invoice.LoanBankReference), invoice.VehiclePlateNumber, invoice.VehicleDescription };
        return BrandedPdf.Create([page.ToString()], searchable);
    }

    private static void Field(StringBuilder page, double x, double y, string label, string value)
    {
        BrandedPdf.Text(page, x, y, 8, label, bold: true, color: BrandedPdf.Muted);
        BrandedPdf.TextBlock(page, x, y - 17, 11, value, 224, 13, 2, BrandedPdf.Dark);
    }

    private static string AmountInWords(decimal amount)
    {
        var rounded = decimal.Round(amount, 2, MidpointRounding.AwayFromZero);
        var whole = decimal.ToInt64(decimal.Truncate(rounded));
        var sen = decimal.ToInt32((rounded - whole) * 100m);
        return $"Ringgit Malaysia {WholeNumberInWords(whole)} and Sen {WholeNumberInWords(sen)} Only";
    }

    private static string WholeNumberInWords(long number)
    {
        if (number == 0) return "Zero";

        var scales = new[]
        {
            (1_000_000_000_000L, "Trillion"),
            (1_000_000_000L, "Billion"),
            (1_000_000L, "Million"),
            (1_000L, "Thousand")
        };
        var words = new StringBuilder();
        foreach (var (value, name) in scales)
        {
            if (number < value) continue;
            Append(words, WholeNumberInWords(number / value));
            Append(words, name);
            number %= value;
        }

        if (number >= 100)
        {
            Append(words, WholeNumberInWords(number / 100));
            Append(words, "Hundred");
            number %= 100;
        }

        if (number >= 20)
        {
            var tens = new[] { "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety" };
            Append(words, tens[number / 10]);
            number %= 10;
        }

        if (number > 0)
        {
            var belowTwenty = new[] { "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen" };
            Append(words, belowTwenty[number]);
        }

        return words.ToString();
    }

    private static void Append(StringBuilder builder, string value)
    {
        if (builder.Length > 0) builder.Append(' ');
        builder.Append(value);
    }

    private static string Display(string? value) => string.IsNullOrWhiteSpace(value) ? "-" : value.Replace('\r', ' ').Replace('\n', ' ').Trim();
}
