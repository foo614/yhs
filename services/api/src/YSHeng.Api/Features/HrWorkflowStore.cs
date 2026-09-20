using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class HrWorkflowStore
{
    public static async Task<string?> ValidateDraftSource(AppDbContext db, HrPayslip slip)
    {
        var period = await db.HrPayPeriods.AsNoTracking().FirstAsync(item => item.Id == slip.PayPeriodId);
        if (period.EndDate >= HrWorkflowRules.LocalDate(DateTime.UtcNow)) return "Submit payroll after the pay period has ended so attendance is complete.";
        var profile = await db.HrPayrollProfiles.AsNoTracking().FirstOrDefaultAsync(item => item.StaffUserId == slip.StaffUserId);
        if (profile is null) return "The payroll profile no longer exists.";
        if (await db.HrAttendanceCorrections.AnyAsync(item => item.StaffUserId == slip.StaffUserId && item.Status == HrCorrectionStatus.Pending && item.AttendanceDate >= period.StartDate && item.AttendanceDate <= period.EndDate)) return "Resolve pending attendance corrections before submitting.";
        var leaves = await db.HrLeaveRequests.AsNoTracking().Where(item => item.StaffUserId == slip.StaffUserId && item.StartDate <= period.EndDate && item.EndDate >= period.StartDate).ToListAsync();
        if (leaves.Any(item => item.Type == HrLeaveType.UnpaidLeave && item.Status == HrLeaveStatus.Approved && (item.StartDate < period.StartDate || item.EndDate > period.EndDate))) return "Resolve cross-period unpaid leave before submitting payroll.";
        if (leaves.Any(item => item.Status == HrLeaveStatus.Pending)) return "Resolve pending leave requests before submitting.";
        var attendance = await db.HrAttendanceRecords.AsNoTracking().Where(item => item.StaffUserId == slip.StaffUserId && item.AttendanceDate >= period.StartDate && item.AttendanceDate <= period.EndDate).ToListAsync();
        if (profile.EmploymentType == HrEmploymentType.Hourly && attendance.Any(item => item.CheckInAt != null && item.CheckOutAt == null)) return "Resolve incomplete attendance before submitting.";
        var current = HrRules.GeneratePayslip(profile, period, leaves, attendance);
        if (current.EmploymentType != slip.EmploymentType || current.BaseSalary != slip.BaseSalary || current.HourlyRate != slip.HourlyRate || current.WorkedHours != slip.WorkedHours || current.OvertimePay != slip.OvertimePay || current.Allowances != slip.Allowances || current.ManualDeductions != slip.ManualDeductions || current.UnpaidLeaveDeduction != slip.UnpaidLeaveDeduction || current.GrossPay != slip.GrossPay)
            return "Payroll inputs changed after preparation. Regenerate and recheck statutory amounts before submitting.";
        return null;
    }
    public static Task<bool> HasLockedPayroll(AppDbContext db, string staffId, DateOnly date) => HasLockedPayrollRange(db, staffId, date, date);

    public static async Task<bool> HasLockedPayrollRange(AppDbContext db, string staffId, DateOnly start, DateOnly end)
    {
        var candidates = await (from slip in db.HrPayslips.AsNoTracking()
                                join period in db.HrPayPeriods.AsNoTracking() on slip.PayPeriodId equals period.Id
                                where slip.StaffUserId == staffId && slip.Status != HrPayslipStatus.Draft && period.StartDate <= end && period.EndDate >= start
                                select new { Slip = slip, Period = period }).ToListAsync();
        var today = HrWorkflowRules.LocalDate(DateTime.UtcNow);
        return candidates.Any(item => IsLocked(item.Slip, item.Period, today));
    }

    public static async Task<(List<HrPayslip> Drafts, string? Error)> BuildDrafts(AppDbContext db, HrPayPeriod period)
    {
        var existing = await db.HrPayslips.AsNoTracking().Where(slip => slip.PayPeriodId == period.Id).ToListAsync();

        var profiles = await db.HrPayrollProfiles.AsNoTracking().ToListAsync();
        if (profiles.Count == 0) return ([], "Configure at least one payroll profile first.");
        var leaves = await db.HrLeaveRequests.AsNoTracking().Where(leave => leave.StartDate <= period.EndDate && leave.EndDate >= period.StartDate).ToListAsync();
        var attendance = await db.HrAttendanceRecords.AsNoTracking().Where(record => record.AttendanceDate >= period.StartDate && record.AttendanceDate <= period.EndDate).ToListAsync();
        var corrections = await db.HrAttendanceCorrections.AsNoTracking().Where(item => item.AttendanceDate >= period.StartDate && item.AttendanceDate <= period.EndDate && item.Status == HrCorrectionStatus.Pending).ToListAsync();
        var result = new List<HrPayslip>();
        var today = HrWorkflowRules.LocalDate(DateTime.UtcNow);
        foreach (var profile in profiles)
        {
            var old = existing.FirstOrDefault(item => item.StaffUserId == profile.StaffUserId);
            if (old is not null && IsLocked(old, period, today)) continue;
            if (await (from slip in db.HrPayslips join other in db.HrPayPeriods on slip.PayPeriodId equals other.Id where slip.StaffUserId == profile.StaffUserId && other.Id != period.Id && other.StartDate <= period.EndDate && other.EndDate >= period.StartDate select slip.Id).AnyAsync()) return ([], "An overlapping period already contains payroll for this staff member.");
            if (corrections.Any(item => item.StaffUserId == profile.StaffUserId)) return ([], "Resolve pending attendance corrections before preparing payroll.");
            if (profile.EmploymentType == HrEmploymentType.Hourly && attendance.Any(item => item.StaffUserId == profile.StaffUserId && item.CheckInAt != null && item.CheckOutAt == null)) return ([], "Resolve incomplete attendance sessions before preparing hourly payroll.");
            // Days are currently an aggregate: never guess their distribution across periods.
            if (leaves.Any(item => item.StaffUserId == profile.StaffUserId && item.Type == HrLeaveType.UnpaidLeave && item.Status == HrLeaveStatus.Approved && (item.StartDate < period.StartDate || item.EndDate > period.EndDate))) return ([], "Unpaid leave crosses a payroll boundary. HR must resolve its per-period day allocation before generating payroll.");
            var staffName = await db.Users.Where(user => user.Id == profile.StaffUserId).Select(user => user.DisplayName).FirstOrDefaultAsync();
            if (staffName is null) return ([], "A payroll profile references a missing staff account. HR must resolve it first.");
            result.Add(HrRules.GeneratePayslip(profile, period, leaves, attendance, old?.Id) with { StaffName = staffName, Status = HrPayslipStatus.Draft, Version = (old?.Version ?? 0) + 1 });
        }
        return result.Count == 0 ? ([], "No editable drafts remain in this period. Reviewed and legacy payslips are preserved.") : (result, null);
    }

    private static bool IsLocked(HrPayslip slip, HrPayPeriod period, DateOnly today) =>
        slip.Status != HrPayslipStatus.Draft && !IsLegacyGeneratedRebuildable(slip, period, today);

    private static bool IsLegacyGeneratedRebuildable(HrPayslip slip, HrPayPeriod period, DateOnly today) =>
        slip.Status == HrPayslipStatus.Generated &&
        (period.EndDate >= today || HrWorkflowRules.LocalDate(slip.GeneratedAt) <= period.EndDate);
}
