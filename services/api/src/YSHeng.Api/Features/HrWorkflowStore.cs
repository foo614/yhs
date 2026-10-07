using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text.Json;
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

    public static async Task<List<HrPayrollCandidate>> BuildPreview(AppDbContext db, HrPayPeriod period)
    {
        var existing = await db.HrPayslips.AsNoTracking().Where(slip => slip.PayPeriodId == period.Id).ToListAsync();
        var profiles = await db.HrPayrollProfiles.AsNoTracking().OrderBy(profile => profile.StaffUserId).ToListAsync();
        var staffNames = await db.Users.AsNoTracking().ToDictionaryAsync(user => user.Id, user => user.DisplayName);
        var leaves = await db.HrLeaveRequests.AsNoTracking().Where(leave => leave.StartDate <= period.EndDate && leave.EndDate >= period.StartDate).ToListAsync();
        var attendance = await db.HrAttendanceRecords.AsNoTracking().Where(record => record.AttendanceDate >= period.StartDate && record.AttendanceDate <= period.EndDate).ToListAsync();
        var corrections = await db.HrAttendanceCorrections.AsNoTracking().Where(item => item.AttendanceDate >= period.StartDate && item.AttendanceDate <= period.EndDate && item.Status == HrCorrectionStatus.Pending).ToListAsync();
        var overlappingStaff = await (from slip in db.HrPayslips.AsNoTracking()
                                      join other in db.HrPayPeriods.AsNoTracking() on slip.PayPeriodId equals other.Id
                                      where other.Id != period.Id && other.StartDate <= period.EndDate && other.EndDate >= period.StartDate
                                      select slip.StaffUserId).Distinct().ToListAsync();
        var result = new List<HrPayrollCandidate>();
        var today = HrWorkflowRules.LocalDate(DateTime.UtcNow);
        foreach (var profile in profiles)
        {
            var old = existing.FirstOrDefault(item => item.StaffUserId == profile.StaffUserId);
            var hasStaff = staffNames.TryGetValue(profile.StaffUserId, out var staffName);
            staffName ??= old?.StaffName ?? profile.StaffUserId;
            var staffLeaves = leaves.Where(item => item.StaffUserId == profile.StaffUserId).OrderBy(item => item.Id).ToList();
            var staffAttendance = attendance.Where(item => item.StaffUserId == profile.StaffUserId).OrderBy(item => item.Id).ToList();
            string? reason = old is not null && IsLocked(old, period, today)
                ? old.Status == HrPayslipStatus.Generated ? "This finalized legacy payslip is locked." : "This payslip is under review or published and cannot be recalculated."
                : !hasStaff ? "The payroll profile references a missing staff account."
                : overlappingStaff.Contains(profile.StaffUserId) ? "An overlapping period already contains payroll for this staff member."
                : corrections.Any(item => item.StaffUserId == profile.StaffUserId) ? "Resolve pending attendance corrections before preparing payroll."
                : profile.EmploymentType == HrEmploymentType.Hourly && staffAttendance.Any(item => item.CheckInAt != null && item.CheckOutAt == null) ? "Resolve incomplete attendance sessions before preparing hourly payroll."
                // Leave days are an aggregate: never guess their distribution across periods.
                : staffLeaves.Any(item => item.Type == HrLeaveType.UnpaidLeave && item.Status == HrLeaveStatus.Approved && (item.StartDate < period.StartDate || item.EndDate > period.EndDate)) ? "Unpaid leave crosses a payroll boundary. Resolve its per-period day allocation before preparing payroll."
                : null;
            if (reason is not null)
            {
                result.Add(new(profile.StaffUserId, staffName, old, null, null, reason, null));
                continue;
            }
            var action = old is null ? "Prepare" : "Recalculate";
            var draft = HrRules.GeneratePayslip(profile, period, staffLeaves, staffAttendance, old?.Id) with
            {
                StaffName = staffName, Status = HrPayslipStatus.Draft, Version = (old?.Version ?? 0) + 1
            };
            // Bind confirmation to the reviewed inputs and original record, not volatile draft IDs/timestamps.
            var token = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new
            {
                CalculationVersion = 1, period, profile, staffName, old, action,
                Leaves = staffLeaves, Attendance = staffAttendance
            })));
            result.Add(new(profile.StaffUserId, staffName, old, draft, action, null, token));
        }
        return result;
    }

    public static async Task<(List<HrPayslip> Drafts, string? Error)> BuildDrafts(AppDbContext db, HrPayPeriod period, HrPayrollPreparationRequest request)
    {
        var selections = request.Selections;
        if (selections is null || selections.Count == 0 || selections.Any(item => item is null || string.IsNullOrWhiteSpace(item.StaffUserId) || string.IsNullOrWhiteSpace(item.PreviewToken) || item.Action is not ("Prepare" or "Recalculate")))
            return ([], "Select staff and review their payslips before confirming preparation.");
        if (selections.Select(item => item.StaffUserId).Distinct(StringComparer.Ordinal).Count() != selections.Count)
            return ([], "Select each staff member only once.");

        var preview = await BuildPreview(db, period);
        var drafts = new List<HrPayslip>();
        foreach (var selection in selections)
        {
            var candidate = preview.FirstOrDefault(item => item.StaffUserId == selection.StaffUserId);
            if (candidate is null) return ([], "A selected payroll profile no longer exists. Refresh the preview.");
            if (candidate.BlockingReason is not null) return ([], $"{candidate.StaffName}: {candidate.BlockingReason}");
            if (candidate.Action != selection.Action || candidate.PreviewToken != selection.PreviewToken)
                return ([], $"{candidate.StaffName}: Payroll changed after preview. Refresh and review the changes before confirming.");
            drafts.Add(candidate.Draft!);
        }
        return (drafts, null);
    }

    private static bool IsLocked(HrPayslip slip, HrPayPeriod period, DateOnly today) =>
        slip.Status != HrPayslipStatus.Draft && !IsLegacyGeneratedRebuildable(slip, period, today);

    private static bool IsLegacyGeneratedRebuildable(HrPayslip slip, HrPayPeriod period, DateOnly today) =>
        slip.Status == HrPayslipStatus.Generated &&
        (period.EndDate >= today || HrWorkflowRules.LocalDate(slip.GeneratedAt) <= period.EndDate);
}
