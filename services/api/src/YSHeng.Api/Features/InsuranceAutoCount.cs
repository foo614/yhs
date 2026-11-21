using System.Globalization;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record InsuranceCopyRows(string Book, string[] Columns, string[][] Rows,
    string Clipboard, IReadOnlyList<string> Blockers, Dictionary<string, string> Headers, string[] Notes);

public static class InsuranceAutoCount
{
    private static readonly string[] AutoColumns = ["Item Code", "Acc. No.", "Description", "Further", "UOM", "Qty", "Unit Price", "Discount", "Total"];
    private static readonly string[] AutomotiveColumns = ["Item Code", "Acc. No.", "Description", "Further", "Qty", "Unit Price", "Discount", "Total", "Classification"];
    private static readonly string[] ApColumns = ["Purchase A/C", "Description", "Amount"];
    private static readonly string[] PaymentColumns = ["Payment Method", "Cheque No.", "Payment Amount", "Bank Charge", "To Bank Rate", "Payment By", "Is RCHQ", "RCHQ Date"];

    public static void MapRoutes(RouteGroupBuilder api)
    {
        var group = api.MapGroup("/insurance").RequireAuthorization("BossAdmin");
        group.MapGet("/{id:guid}/autocount", async (Guid id, string kind, Guid? receiptId, AppDbContext db, CancellationToken ct) =>
        {
            var record = await db.InsuranceCases.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id, ct);
            if (record is null) return Results.NotFound();
            if (kind is not ("PurchaseInsurance" or "PurchaseRoadTax" or "PurchaseOther" or "CustomerSales" or "AutomotiveAP" or "Receipt"))
                return Results.BadRequest(new { message = "Choose a supported AutoCount document." });
            var payments = await db.InsuranceInsurerPayments.AsNoTracking().Where(x => x.CaseId == id).ToListAsync(ct);
            var receipt = receiptId is { } rid ? await db.InsuranceReceipts.AsNoTracking().SingleOrDefaultAsync(x => x.Id == rid && x.CaseId == id, ct) : null;
            var hasJpjReceipt = await db.InsuranceAttachments.AnyAsync(x => x.CaseId == id && x.Kind == "RoadTaxReceipt", ct);
            return Results.Ok(Build(record, kind, payments.Sum(x => x.Amount), payments.Count > 0, receipt, hasJpjReceipt));
        });
        group.MapGet("/autocount-monthly", async (string month, AppDbContext db, CancellationToken ct) =>
        {
            if (!DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var first))
                return Results.BadRequest(new { message = "Month must use YYYY-MM." });
            var end = first.AddMonths(1);
            var records = await db.InsuranceCases.AsNoTracking().Where(x => x.Company == "Automotive" && x.CoverStartDate >= first && x.CoverStartDate < end)
                .OrderBy(x => x.CoverStartDate).ThenBy(x => x.PlateNumber).ToListAsync(ct);
            return Results.Ok(Monthly(records, month));
        });
    }

    public static InsuranceCopyRows Build(InsuranceCase record, string kind, decimal insurerPaid = 0,
        bool hasInsurerPayment = false, InsuranceReceipt? receipt = null, bool hasJpjReceipt = false)
    {
        var blockers = new List<string>();
        var rows = new List<string[]>();
        var headers = new Dictionary<string, string> { ["Car Plate No."] = record.PlateNumber, ["Invoice No."] = "<<New>>" };
        var notes = new List<string> { "Review the target company book, header values and detail columns before pasting. AutoCount generates its own document number. Physical paste has not been verified." };
        var automotive = record.Company == "Automotive";
        var columns = AutoColumns;
        var book = "YS Heng Auto";
        var plate = record.PlateNumber;
        if (string.IsNullOrWhiteSpace(plate)) blockers.Add("Plate is required.");
        void Line(string item, string account, string description, decimal amount, decimal discount = 0, bool automotiveLine = false) => rows.Add(automotiveLine
            ? [item, account, description, "", "1", Money(amount), discount == 0 ? "" : Money(discount), Money(amount - discount), "006"]
            : [item, account, description, "", "UNIT", "1", Money(amount), discount == 0 ? "" : Money(discount), Money(amount - discount)]);
        switch (kind)
        {
            case "PurchaseInsurance":
                if (!hasInsurerPayment || insurerPaid <= 0) blockers.Add("Record the actual insurer payment before copying the purchase invoice.");
                if (record.CaseType == "BankArranged") blockers.Add("Bank-arranged cover has no Auto insurer purchase invoice.");
                if (insurerPaid > record.InsuranceAmount) blockers.Add("Actual insurer payment exceeds policy amount. Review the amounts.");
                if (string.IsNullOrWhiteSpace(record.PolicyNumber) || record.CoverStartDate is null) blockers.Add("Policy number and cover start date are required.");
                headers["Creditor"] = record.Insurer;
                headers["Supplier Invoice No"] = record.InsurerInvoiceNumber ?? "";
                headers["Policy No"] = record.PolicyNumber ?? "";
                headers["Date"] = record.CoverStartDate?.ToString("yyyy-MM-dd") ?? "";
                Line("INS-MV", "4001-I002", $"INSURANCE FOR M/V - {plate}", record.InsuranceAmount);
                Line("COMM", "5C00-0000", $"COMMISSION (INSURANCE) - {plate}", -(record.InsuranceAmount - insurerPaid));
                break;
            case "PurchaseRoadTax":
                if (record.RoadTaxAmount <= 0) blockers.Add("Road-tax amount is required.");
                if (record.RoadTaxMethod == "JPJ" && !hasJpjReceipt) blockers.Add("Upload the JPJ receipt first.");
                Line("ROAD TAX", "4001-R002", $"ROAD TAX - {plate}", record.RoadTaxAmount);
                notes.Add("Copy the source receipt number separately into Supplier Invoice No and Supplier D/O No; review JPJ or Puspakom creditor.");
                break;
            case "PurchaseOther":
                foreach (var charge in record.OtherCharges)
                {
                    if (!OtherDescriptions.TryGetValue(charge.ItemCode, out var description)) { blockers.Add("Unverified other-charge item: " + charge.ItemCode); continue; }
                    Line(charge.ItemCode, "4001-M002", $"{description} - {plate}", charge.Amount);
                }
                break;
            case "CustomerSales":
                book = automotive ? "YS Heng Automotive Sdn Bhd" : book;
                columns = automotive ? AutomotiveColumns : AutoColumns;
                headers["Debtor"] = record.CustomerName;
                headers["Source invoice"] = record.InvoiceNumber ?? "";
                if (record.InsuranceAmount > 0) Line(automotive ? "INSURANCE (MV)" : "INS-MV", "4001-I001",
                    $"{(automotive ? "INSURANCE FOR MOTOR VEHICLE" : "INSURANCE FOR M/V")} - {plate}", record.InsuranceAmount, record.Discount, automotive);
                else if (record.Discount > 0) blockers.Add("Insurance discount requires an insurance line.");
                if (record.RoadTaxAmount > 0) Line("ROAD TAX", "4001-R001", $"ROAD TAX - {plate}", record.RoadTaxAmount, automotiveLine: automotive);
                if (record.RoadTaxMethod == "JPJ" && record.RunnerFee > 0)
                {
                    if (automotive) blockers.Add("Automotive runner-fee account is unconfirmed. Formal copy is blocked.");
                    Line("PROCESSING FEE", automotive ? "" : "5020-001", $"RUNNER FEE - {plate}", record.RunnerFee, automotiveLine: automotive);
                }
                foreach (var charge in record.OtherCharges)
                {
                    if (!record.SpecialJpjSale || automotive) { blockers.Add("Other customer sales charge mapping requires review."); continue; }
                    if (!OtherDescriptions.TryGetValue(charge.ItemCode, out var description)) { blockers.Add("Unverified other-charge item: " + charge.ItemCode); continue; }
                    Line(charge.ItemCode, "4001-M001", $"{description} - {plate}", charge.Amount);
                }
                break;
            case "AutomotiveAP":
                book = "YS Heng Automotive Sdn Bhd";
                columns = ApColumns;
                if (!automotive) blockers.Add("A/P is only for Automotive cases.");
                var bankArranged = record.CaseType == "BankArranged";
                if (bankArranged && (record.RoadTaxAmount > 0 || record.OtherCharges.Length > 0)) blockers.Add("Bank-arranged A/P with mixed road-tax/other charges needs separate supplier allocation review before copying.");
                if (bankArranged && (string.IsNullOrWhiteSpace(record.BankCreditorName) || string.IsNullOrWhiteSpace(record.BankInvoiceNumber))) blockers.Add("Bank-arranged A/P requires the actual bank creditor and bank invoice reference.");
                if (!bankArranged && string.IsNullOrWhiteSpace(record.IntercompanyInvoiceNumber)) blockers.Add("Enter the Auto intercompany sales invoice number as Supplier IV No.");
                headers["Supplier IV No."] = (bankArranged ? record.BankInvoiceNumber : record.IntercompanyInvoiceNumber) ?? "";
                headers["Ref. No. 2"] = plate;
                headers["Creditor"] = bankArranged ? record.BankCreditorName ?? "" : "YS HENG AUTO";
                if (record.InsuranceAmount > 0) rows.Add(["4001-I002", $"INSURANCE (PAID) ON BEHALF - {plate}", Money(record.InsuranceAmount)]);
                if (record.RoadTaxAmount > 0) rows.Add(["4001-R002", $"ROAD TAX (PAID) ON BEHALF - {plate}", Money(record.RoadTaxAmount)]);
                foreach (var charge in record.OtherCharges)
                {
                    var mapping = charge.ItemCode switch { "STMS/E-SERAHAN" => ("6000-0000", "OWNERSHIP PROCESSING FEE"), "INTERCHANGE NUMBER" => ("4001-M002", "INTERCHANGE"), _ => ("", "") };
                    if (mapping.Item1.Length == 0) { blockers.Add("Unverified Automotive A/P charge: " + charge.ItemCode); continue; }
                    rows.Add([mapping.Item1, $"{mapping.Item2} - {plate}", Money(charge.Amount)]);
                }
                break;
            case "Receipt":
                columns = PaymentColumns;
                if (receipt is null || receipt.CaseId != record.Id || receipt.Status != "Confirmed" || receipt.ConfirmedAt is null || string.IsNullOrWhiteSpace(receipt.ConfirmedBy)) blockers.Add("Only a verified receipt belonging to this case can be copied.");
                else
                {
                    book = receipt.Company == "Automotive" ? "YS Heng Automotive Sdn Bhd" : "YS Heng Auto";
                    if (receipt.Company != record.Company || string.IsNullOrWhiteSpace(receipt.InvoiceNumber)) blockers.Add("Receipt invoice/book must match the case.");
                    if (receipt.DepositAccount is not ("Cash" or "PBB")) blockers.Add("Confirm the actual deposit destination (Cash or PBB).");
                    headers["Invoice to knock off manually"] = receipt.InvoiceNumber;
                    headers["Date"] = receipt.ReceivedDate.ToString("yyyy-MM-dd");
                    headers["Paid By"] = record.CustomerName;
                    headers["Description"] = $"INSURANCE & ROAD TAX - {plate}";
                    rows.Add([receipt.DepositAccount, "-", Money(receipt.Amount), "0.00", "1", "", "False", ""]);
                }
                notes.Add("Copy only the top Payment Row. Select the lower Knock-off invoice manually in AutoCount. Original payment type is stored separately.");
                break;
            default: blockers.Add("Unsupported document."); break;
        }
        if (rows.Count == 0) blockers.Add("No eligible detail lines.");
        return Result(book, columns, rows, blockers, headers, notes);
    }

    public static InsuranceCopyRows Monthly(IReadOnlyList<InsuranceCase> records, string month)
    {
        var rows = new List<string[]>();
        var blockers = new List<string>();
        foreach (var record in records)
        {
            if (record.InsuranceAmount > 0 && record.CaseType != "BankArranged") rows.Add(AutoLine("INS-MV", "4001-I001", $"INSURANCE FOR M/V - {record.PlateNumber}", record.InsuranceAmount));
            if (record.RoadTaxAmount > 0) rows.Add(AutoLine("ROAD TAX", "4001-R001", $"ROAD TAX - {record.PlateNumber}", record.RoadTaxAmount));
            foreach (var charge in record.OtherCharges)
            {
                if (!OtherDescriptions.TryGetValue(charge.ItemCode, out var description)) { blockers.Add("Unverified item: " + charge.ItemCode); continue; }
                rows.Add(AutoLine(charge.ItemCode, "4001-M001", $"{description} - {record.PlateNumber}", charge.Amount));
            }
        }
        if (rows.Count == 0) blockers.Add("No eligible cases in the selected cover-start month.");
        return Result("YS Heng Auto", AutoColumns, rows, blockers,
            new() { ["Debtor"] = "YS HENG AUTOMOTIVE SDN BHD", ["Month"] = month, ["Invoice No."] = "<<New>>" },
            ["Monthly intercompany sales retains individual vehicle lines. Record the saved Auto invoice number on each Automotive A/P case. Physical paste has not been verified."]);
    }

    private static readonly Dictionary<string, string> OtherDescriptions = new(StringComparer.Ordinal)
    {
        ["LICENSE"] = "DRIVER LICENSE", ["INTERCHANGE NUMBER"] = "INTERCHANGE NUMBER", ["STMS/E-SERAHAN"] = "TUNTUTAN HAK MILIK", ["SAMAN"] = "SAMAN", ["TENDER"] = "TENDER NUMBER"
    };
    private static string[] AutoLine(string item, string account, string description, decimal amount) => [item, account, description, "", "UNIT", "1", Money(amount), "", Money(amount)];
    private static string Money(decimal amount) => amount.ToString("0.00", CultureInfo.InvariantCulture);
    private static InsuranceCopyRows Result(string book, string[] columns, List<string[]> rows, List<string> blockers, Dictionary<string, string> headers, IEnumerable<string> notes)
    {
        static string Clean(string value) => value.Replace('\t', ' ').Replace('\r', ' ').Replace('\n', ' ');
        var safeRows = rows.Select(row => row.Select(Clean).ToArray()).ToArray();
        return new(book, columns, safeRows, blockers.Count == 0 ? string.Join('\n', safeRows.Select(row => string.Join('\t', row))) : "", blockers.Distinct().ToArray(), headers, notes.ToArray());
    }
}
