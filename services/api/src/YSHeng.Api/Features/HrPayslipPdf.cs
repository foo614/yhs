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
        var safeName = string.IsNullOrWhiteSpace(staffName) ? payslip.StaffUserId : staffName;
        var fileName = $"payslip-{period.StartDate:yyyy-MM}-{payslip.Id:N}.pdf";
        var page = new StringBuilder();
        Text(page, 48, 790, 16, companyName, true);
        Text(page, 48, 772, 9, "MONTHLY SALARY SUMMARY PAYSLIP", true);
        Text(page, 420, 790, 10, "MONTH:", true);
        Text(page, 470, 790, 10, month);
        Line(page, 48, 748, 547, 748);
        Text(page, 62, 726, 10, "Employee", true);
        Text(page, 180, 726, 10, safeName);
        Text(page, 62, 706, 10, "Pay period", true);
        Text(page, 180, 706, 10, period.Name);
        Line(page, 48, 686, 547, 686);

        Text(page, 62, 664, 10, "SALARY", true);
        Text(page, 330, 664, 10, "DEDUCTIONS", true);
        Row(page, 62, 638, "Base salary", payslip.BaseSalary);
        Row(page, 330, 638, "Unpaid leave", payslip.UnpaidLeaveDeduction);
        Row(page, 62, 614, payslip.EmploymentType == HrEmploymentType.Hourly ? "Attendance pay" : "Overtime pay", payslip.EmploymentType == HrEmploymentType.Hourly ? payslip.AttendancePay : payslip.OvertimePay);
        Row(page, 330, 614, "Manual deductions", payslip.ManualDeductions);
        Row(page, 62, 590, "Allowances", payslip.Allowances);
        if (payslip.EmploymentType == HrEmploymentType.Hourly)
            Row(page, 62, 566, $"Worked hours ({payslip.WorkedHours:0.##})", payslip.AttendancePay);
        Line(page, 48, 530, 547, 530);
        Row(page, 62, 506, "Gross pay", payslip.GrossPay, true);
        Row(page, 330, 506, "Total deductions", payslip.UnpaidLeaveDeduction + payslip.ManualDeductions, true);
        Fill(page, 330, 454, 217, 34, "0.92 0.95 0.98");
        Text(page, 342, 466, 11, "NET SALARY", true);
        Text(page, 460, 466, 11, $"RM {payslip.NetPay:N2}", true);
        Text(page, 48, 420, 8, "This payslip includes only configured payroll inputs. Statutory deductions are not calculated in this MVP.");
        Signature(page, 72, 320, "Company authorisation");
        Signature(page, 350, 320, "Employee signature");
        return new HrPayslipPdf(fileName, SimplePdf.CreatePage(page.ToString()));
    }

    private static void Row(StringBuilder page, double x, double y, string label, decimal amount, bool bold = false)
    {
        Text(page, x, y, 10, label, bold);
        Text(page, x + 145, y, 10, $"RM {amount:N2}", bold);
    }

    private static void Signature(StringBuilder page, double x, double y, string label)
    {
        Line(page, x, y, x + 150, y);
        Text(page, x, y - 18, 8, label);
    }

    private static void Fill(StringBuilder page, double x, double y, double width, double height, string color) =>
        page.AppendLine(FormattableString.Invariant($"q {color} rg {x:0.##} {y:0.##} {width:0.##} {height:0.##} re f Q"));

    private static void Line(StringBuilder page, double x1, double y1, double x2, double y2, string color = "0.2 0.2 0.2") =>
        page.AppendLine(FormattableString.Invariant($"q {color} RG 0.7 w {x1:0.##} {y1:0.##} m {x2:0.##} {y2:0.##} l S Q"));

    private static void Text(StringBuilder page, double x, double y, double size, string value, bool bold = false)
    {
        page.AppendLine("BT");
        page.AppendLine($"/{(bold ? "F2" : "F1")} {size.ToString("0.##", CultureInfo.InvariantCulture)} Tf");
        page.AppendLine(FormattableString.Invariant($"{x:0.##} {y:0.##} Td"));
        page.AppendLine($"({SimplePdf.EscapeText(value.Replace('\r', ' ').Replace('\n', ' '))}) Tj");
        page.AppendLine("ET");
    }
}
