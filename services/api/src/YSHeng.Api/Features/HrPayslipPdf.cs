using System.Globalization;
using System.Text;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record HrPayslipPdf(string FileName, byte[] Content);

public static class HrPayslipPdfFactory
{
    public static HrPayslipPdf Create(HrPayslip payslip, HrPayPeriod period, string staffName, string companyName)
    {
        var month = period.StartDate.ToString("MMMM yyyy", CultureInfo.InvariantCulture);
        var safeName = payslip.StaffName ?? (string.IsNullOrWhiteSpace(staffName) ? payslip.StaffUserId : staffName);
        var fileName = $"payslip-{period.StartDate:yyyy-MM}-{payslip.Id:N}.pdf";
        var published = payslip.Status is HrPayslipStatus.Published or HrPayslipStatus.Generated;
        var page = new StringBuilder();
        const string navy = "0.05 0.18 0.32";
        const string blue = "0.10 0.34 0.58";
        const string paleBlue = "0.92 0.96 0.99";
        const string paleGray = "0.96 0.97 0.98";
        const string dark = "0.10 0.14 0.18";
        const string muted = "0.35 0.40 0.46";
        const string border = "0.84 0.87 0.90";

        Fill(page, 36, 742, 523, 64, navy);
        Text(page, 56, 779, 23, "YS HENG", bold: true, color: "1 1 1");
        Text(page, 57, 761, 8, companyName, color: "0.79 0.88 0.96");
        Text(page, 420, 778, 18, "PAYSLIP", bold: true, color: "1 1 1");
        Text(page, 420, 761, 9, "PRIVATE & CONFIDENTIAL", color: "0.79 0.88 0.96");
        Text(page, 36, 704, 19, "Monthly Payslip", bold: true, color: dark);
        Text(page, 36, 687, 10, "Earnings, deductions and employer contributions.", color: muted);
        Fill(page, 414, 677, 145, 30, published ? paleBlue : "0.99 0.92 0.79");
        Text(page, 426, 688, 11, published ? "SALARY SUMMARY" : "DRAFT", bold: true, color: published ? blue : "0.55 0.31 0.02");

        Fill(page, 36, 568, 523, 90, paleGray);
        Text(page, 56, 638, 8, "EMPLOYEE", bold: true, color: muted);
        TextBlock(page, 56, 621, 11, safeName, 34, 13, dark);
        Text(page, 315, 638, 8, "PAY PERIOD", bold: true, color: muted);
        Text(page, 315, 621, 11, month, color: dark);
        Text(page, 56, 590, 8, "EMPLOYMENT", bold: true, color: muted);
        Text(page, 56, 575, 10, payslip.EmploymentType == HrEmploymentType.Hourly ? $"Hourly | {payslip.WorkedHours:0.##} hours" : $"Monthly | {payslip.WorkingDays} working days", color: dark);
        Text(page, 315, 590, 8, "PERIOD DATES", bold: true, color: muted);
        Text(page, 315, 575, 10, $"{period.StartDate:dd MMM yyyy} - {period.EndDate:dd MMM yyyy}", color: dark);

        Text(page, 56, 545, 9, "EARNINGS", bold: true, color: blue);
        Text(page, 315, 545, 9, "DEDUCTIONS", bold: true, color: blue);
        Line(page, 36, 535, 559, 535, border);
        Row(page, 56, 517, payslip.EmploymentType == HrEmploymentType.Hourly ? "Attendance pay" : "Base salary", payslip.EmploymentType == HrEmploymentType.Hourly ? payslip.AttendancePay : payslip.BaseSalary);
        Row(page, 56, 497, "Overtime pay", payslip.OvertimePay);
        Row(page, 56, 477, "Allowances", payslip.Allowances);
        Row(page, 315, 517, "Unpaid leave", payslip.UnpaidLeaveDeduction);
        Row(page, 315, 497, "Manual deductions", payslip.ManualDeductions);
        Row(page, 315, 477, "Employee EPF", payslip.EmployeeEpf);
        Row(page, 315, 457, "Employee SOCSO", payslip.EmployeeSocso);
        Row(page, 315, 437, "Employee EIS", payslip.EmployeeEis);
        Row(page, 315, 417, "PCB", payslip.Pcb);
        Line(page, 36, 405, 559, 405, border);
        Row(page, 56, 388, "Gross pay", payslip.GrossPay, true);
        Row(page, 315, 388, "Total deductions", payslip.UnpaidLeaveDeduction + payslip.ManualDeductions + HrWorkflowRules.StatutoryDeductions(payslip), true);

        Fill(page, 36, 302, 523, 66, paleBlue);
        Text(page, 56, 346, 9, "NET SALARY", bold: true, color: blue);
        Text(page, 56, 319, 25, $"RM {payslip.NetPay:N2}", bold: true, color: navy);
        Text(page, 315, 343, 9, published ? "EMPLOYEE SALARY SUMMARY" : "DRAFT - NOT APPROVED FOR PAYMENT", bold: true, color: blue);
        TextBlock(page, 315, 327, 9, "Employer contributions below are not deducted from net salary.", 43, 12, muted);

        Text(page, 36, 280, 9, "EMPLOYER CONTRIBUTIONS", bold: true, color: blue);
        Fill(page, 36, 227, 523, 42, paleGray);
        Contribution(page, 56, "Employer EPF", payslip.EmployerEpf);
        Contribution(page, 231, "Employer SOCSO", payslip.EmployerSocso);
        Contribution(page, 406, "Employer EIS", payslip.EmployerEis);
        Text(page, 36, 211, 8, payslip.EmployeeEpf is null ? "Statutory amounts were not recorded for this payslip." : "Statutory amounts are separately recorded for this payroll month.", color: muted);

        Line(page, 36, 83, 559, 83, border);
        Text(page, 36, 62, 8, $"Pay period: {month}", color: muted);
        Text(page, 423, 62, 8, "YS Heng - Employee copy", color: muted);
        return new HrPayslipPdf(fileName, SimplePdf.CreatePage(page.ToString()));
    }

    private static void Row(StringBuilder page, double x, double y, string label, decimal? amount, bool bold = false)
    {
        Text(page, x, y, 9, label, bold, "0.10 0.14 0.18");
        Text(page, x + 145, y, 9, amount is null ? "Not recorded" : $"RM {amount:N2}", bold, "0.10 0.14 0.18");
    }

    private static void Contribution(StringBuilder page, double x, string label, decimal? amount)
    {
        Text(page, x, 254, 8, label, bold: true, color: "0.35 0.40 0.46");
        Text(page, x, 238, 11, amount is null ? "Not recorded" : $"RM {amount:N2}", color: "0.10 0.14 0.18");
    }

    private static void TextBlock(StringBuilder page, double x, double y, double size, string value, int charactersPerLine, double lineHeight, string color, int maximumLines = 2)
    {
        foreach (var (line, index) in Wrap(value, charactersPerLine).Take(maximumLines).Select((line, index) => (line, index)))
            Text(page, x, y - index * lineHeight, size, line, color: color);
    }

    private static IEnumerable<string> Wrap(string value, int charactersPerLine)
    {
        var words = value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var line = new StringBuilder();
        foreach (var word in words)
        {
            if (line.Length > 0 && line.Length + word.Length + 1 > charactersPerLine)
            {
                yield return line.ToString();
                line.Clear();
            }

            if (line.Length > 0) line.Append(' ');
            line.Append(word);
        }

        if (line.Length > 0) yield return line.ToString();
    }

    private static void Fill(StringBuilder page, double x, double y, double width, double height, string color) =>
        page.AppendLine(FormattableString.Invariant($"q {color} rg {x:0.##} {y:0.##} {width:0.##} {height:0.##} re f Q"));

    private static void Line(StringBuilder page, double x1, double y1, double x2, double y2, string color) =>
        page.AppendLine(FormattableString.Invariant($"q {color} RG 0.7 w {x1:0.##} {y1:0.##} m {x2:0.##} {y2:0.##} l S Q"));

    private static void Text(StringBuilder page, double x, double y, double size, string value, bool bold = false, string color = "0 0 0")
    {
        page.AppendLine("BT");
        page.AppendLine($"/{(bold ? "F2" : "F1")} {size.ToString("0.##", CultureInfo.InvariantCulture)} Tf");
        page.AppendLine($"{color} rg");
        page.AppendLine(FormattableString.Invariant($"{x:0.##} {y:0.##} Td"));
        page.AppendLine($"({SimplePdf.EscapeText(value)}) Tj");
        page.AppendLine("ET");
    }

}
