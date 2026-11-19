using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;

namespace YSHeng.Api.Features;

public sealed record HrLeaveCalculation(
    decimal Days,
    IReadOnlyList<DateOnly> ScheduledDates,
    IReadOnlyList<DateOnly> HolidayDates);

public static class HrLeaveCalculationService
{
    public static async Task<HrLeaveCalculation> CalculateAsync(
        AppDbContext db,
        string staffUserId,
        DateOnly startDate,
        DateOnly endDate,
        string startSession,
        string endSession,
        CancellationToken cancellationToken = default)
    {
        var scheduledDates = await db.HrWorkSchedules.AsNoTracking()
            .Where(item => item.StaffUserId == staffUserId && item.AttendanceDate >= startDate && item.AttendanceDate <= endDate)
            .Select(item => item.AttendanceDate)
            .OrderBy(item => item)
            .ToListAsync(cancellationToken);
        var holidayDates = await db.HrPublicHolidays.AsNoTracking()
            .Where(item => item.StateCode == "JHR" && item.Date >= startDate && item.Date <= endDate)
            .Select(item => item.Date)
            .Distinct()
            .OrderBy(item => item)
            .ToListAsync(cancellationToken);
        var days = HrRules.CalculateLeaveDays(startDate, endDate, startSession, endSession, scheduledDates, holidayDates);
        return new HrLeaveCalculation(days, scheduledDates, holidayDates);
    }
}
