using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record WhatsAppAttendanceFacts(
    IReadOnlyCollection<HrWorkSchedule> Schedules,
    IReadOnlyCollection<HrAttendanceRecord> Attendance,
    IReadOnlyCollection<HrLeaveRequest> Leaves,
    IReadOnlyCollection<HrBusinessTrip> Trips,
    IReadOnlyCollection<string> ActiveStaffIds);

public sealed record WhatsAppAttendanceSnapshot(int Scheduled, int CheckedIn, int FullDayLeave,
    int Outstation, int PartialLeaveUnknown, int ScheduledWithoutCheckIn, int UnscheduledCheckIns,
    string Body);

public sealed record WhatsAppPendingLeaveSnapshot(int Count, string Body);

// FOO-195 adapter. Shared worker registration and category readiness are withheld until
// the role map (including HrSalary) and current-facts dispatcher are integrated.
public static class WhatsAppHrNotifications
{
    private const string AttendanceCategory = "AttendanceSummary";
    private const string LeaveCategory = "LeaveApproval";

    public static async Task<WhatsAppAttendanceFacts> LoadAttendanceAsync(AppDbContext db, DateOnly today,
        long now, CancellationToken ct = default)
    {
        var schedules = await db.HrWorkSchedules.AsNoTracking()
            .Where(item => item.AttendanceDate == today).ToListAsync(ct);
        var attendance = await db.HrAttendanceRecords.AsNoTracking()
            .Where(item => item.AttendanceDate == today && item.CheckInAt != null).ToListAsync(ct);
        var leaves = await db.HrLeaveRequests.AsNoTracking()
            .Where(item => item.Status == HrLeaveStatus.Approved && item.StartDate <= today && item.EndDate >= today)
            .ToListAsync(ct);
        var trips = await db.HrBusinessTrips.AsNoTracking()
            .Where(item => item.Status == HrBusinessTripStatus.Approved && item.StartDate <= today && item.EndDate >= today)
            .ToListAsync(ct);
        var candidateIds = schedules.Select(item => item.StaffUserId)
            .Concat(attendance.Select(item => item.StaffUserId)).Distinct().ToArray();
        var users = await db.Users.AsNoTracking().Where(item => candidateIds.Contains(item.Id)).ToListAsync(ct);
        return new(schedules, attendance, leaves, trips,
            users.Where(item => WhatsAppStaffBindings.Active(item, now)).Select(item => item.Id).ToArray());
    }

    public static WhatsAppAttendanceSnapshot ProjectAttendance(WhatsAppAttendanceFacts facts,
        DateOnly today, string language)
    {
        var active = facts.ActiveStaffIds.ToHashSet(StringComparer.Ordinal);
        var scheduled = facts.Schedules.Where(item => item.AttendanceDate == today && active.Contains(item.StaffUserId))
            .Select(item => item.StaffUserId).ToHashSet(StringComparer.Ordinal);
        var checkedIn = facts.Attendance.Where(item => item.AttendanceDate == today && item.CheckInAt != null &&
            active.Contains(item.StaffUserId)).Select(item => item.StaffUserId).ToHashSet(StringComparer.Ordinal);
        var leaves = facts.Leaves.Where(item => item.Status == HrLeaveStatus.Approved &&
            item.StartDate <= today && item.EndDate >= today).GroupBy(item => item.StaffUserId)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        var outstation = facts.Trips.Where(item => item.Status == HrBusinessTripStatus.Approved &&
            item.StartDate <= today && item.EndDate >= today).Select(item => item.StaffUserId)
            .ToHashSet(StringComparer.Ordinal);
        var fullLeave = 0;
        var trip = 0;
        var partial = 0;
        var notCheckedIn = 0;
        foreach (var staff in scheduled)
        {
            if (checkedIn.Contains(staff)) continue;
            if (leaves.TryGetValue(staff, out var staffLeaves))
            {
                // A multi-day fractional request does not identify the partial date.
                // Keep it separate rather than claiming a full-day absence.
                if (staffLeaves.Any(item => item.Days >= item.EndDate.DayNumber - item.StartDate.DayNumber + 1))
                    fullLeave++;
                else partial++;
                continue;
            }
            if (outstation.Contains(staff)) { trip++; continue; }
            notCheckedIn++;
        }
        var checkedScheduled = scheduled.Count(checkedIn.Contains);
        var unscheduledCheckIns = checkedIn.Count(staff => !scheduled.Contains(staff));
        var malay = language == "ms";
        var body = malay
            ? $"YS Heng kehadiran {today:yyyy-MM-dd}: jadual diketahui {scheduled.Count}; daftar masuk {checkedScheduled}; cuti penuh {fullLeave}; luar kawasan {trip}; cuti separa/tidak jelas {partial}; belum daftar masuk berjadual {notCheckedIn}; daftar masuk tanpa jadual {unscheduledCheckIns}. Liputan jadual tidak disahkan; belum daftar masuk bukan keputusan ponteng."
            : $"YS Heng attendance {today:yyyy-MM-dd}: known scheduled {scheduled.Count}; checked in {checkedScheduled}; full-day leave {fullLeave}; outstation {trip}; partial/unclear leave {partial}; scheduled without check-in {notCheckedIn}; unscheduled check-ins {unscheduledCheckIns}. Schedule coverage unverified; no check-in is not an absence decision.";
        return new(scheduled.Count, checkedScheduled, fullLeave, trip, partial, notCheckedIn,
            unscheduledCheckIns, body);
    }

    public static WhatsAppPendingLeaveSnapshot? ProjectPendingLeave(IEnumerable<HrLeaveRequest> requests,
        string recipientUserId, string recipientRole, DateOnly today, string language,
        IReadOnlyDictionary<string, string>? staffNames = null)
    {
        if (recipientRole is not ("BossAdmin" or "HrSalary")) return null;
        var items = requests.Where(item => item.Status == HrLeaveStatus.Pending &&
                item.StaffUserId != recipientUserId && item.StartDate != default && item.EndDate >= item.StartDate)
            .OrderBy(item => item.StartDate).ThenBy(item => item.Id).ToArray();
        if (items.Length == 0) return null;
        var malay = language == "ms";
        var body = new StringBuilder(malay
            ? $"YS Heng kelulusan cuti tertunda {today:yyyy-MM-dd}: "
            : $"YS Heng pending leave approvals {today:yyyy-MM-dd}: ");
        var shown = 0;
        foreach (var item in items.Take(5))
        {
            var name = staffNames is not null && staffNames.TryGetValue(item.StaffUserId, out var found)
                ? SafeName(found) : "staff";
            var segment = $"{(shown == 0 ? "" : "; ")}{name} {item.StartDate:yyyy-MM-dd}–{item.EndDate:yyyy-MM-dd}";
            if (body.Length + segment.Length + 90 > 1024) break;
            body.Append(segment);
            shown++;
        }
        if (shown == 0) return null;
        if (items.Length > shown) body.Append(malay ? $"; +{items.Length - shown} lagi di portal HR" :
            $"; +{items.Length - shown} more in the HR portal");
        return new(items.Length, body.ToString());
    }

    public static async Task<WhatsAppPendingLeaveSnapshot?> LoadPendingLeaveAsync(AppDbContext db,
        string recipientUserId, string recipientRole, DateOnly today, string language, CancellationToken ct = default)
    {
        if (recipientRole is not ("BossAdmin" or "HrSalary")) return null;
        var pending = await db.HrLeaveRequests.AsNoTracking()
            .Where(item => item.Status == HrLeaveStatus.Pending && item.StaffUserId != recipientUserId)
            .ToListAsync(ct);
        var actionable = new List<HrLeaveRequest>();
        foreach (var item in pending)
            if (HrRules.ValidateLeaveDecision(item, HrLeaveStatus.Approved).IsValid &&
                !await HrWorkflowStore.HasLockedPayrollRange(db, item.StaffUserId, item.StartDate, item.EndDate))
                actionable.Add(item);
        var staffIds = actionable.Select(item => item.StaffUserId).Distinct().ToArray();
        var names = await db.Users.AsNoTracking().Where(item => staffIds.Contains(item.Id))
            .ToDictionaryAsync(item => item.Id, item => item.DisplayName, ct);
        return ProjectPendingLeave(actionable, recipientUserId, recipientRole, today, language, names);
    }

    public static async Task<string?> RefreshForDispatchAsync(AppDbContext db, WhatsAppOutbox queued,
        long now, CancellationToken ct = default)
    {
        if (queued.Audience != "Staff" || queued.StaffUserId is null || queued.ExpiresAt <= now ||
            queued.BusinessEventKey != WhatsAppStaffNotifications.LocalDate(now).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture))
            return null;
        var day = WhatsAppStaffNotifications.LocalDate(now);
        var policy = await db.WhatsAppStaffNotificationPolicies.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Category == queued.MessageKind && item.Enabled, ct);
        if (policy is null || now < WhatsAppStaffNotifications.LocalDayDueAt(day, policy.LocalMinuteOfDay)) return null;
        if (queued.MessageKind == AttendanceCategory && queued.RequiredStaffRole == "BossAdmin")
            return ProjectAttendance(await LoadAttendanceAsync(db, day, now, ct), day, queued.Language).Body;
        if (queued.MessageKind == LeaveCategory && queued.RequiredStaffRole is "BossAdmin" or "HrSalary")
            return (await LoadPendingLeaveAsync(db, queued.StaffUserId, queued.RequiredStaffRole,
                day, queued.Language, ct))?.Body;
        return null;
    }

    public static async Task<int> EnqueueCurrentDayAsync(AppDbContext db, WhatsAppAssistantOptions assistant,
        long now, string actor, CancellationToken ct = default)
    {
        var day = WhatsAppStaffNotifications.LocalDate(now);
        var policies = await db.WhatsAppStaffNotificationPolicies.AsNoTracking()
            .Where(item => (item.Category == AttendanceCategory || item.Category == LeaveCategory) && item.Enabled)
            .ToListAsync(ct);
        var bindings = await db.WhatsAppStaffBindings.AsNoTracking()
            .Where(item => item.VerifiedAt > 0 && item.RevokedAt == null).ToListAsync(ct);
        var observed = 0;
        foreach (var binding in bindings)
        {
            var resolved = await WhatsAppStaffBindings.ResolveAsync(db, assistant, binding.Id, now, ct);
            if (resolved is null) continue;
            foreach (var policy in policies)
            {
                if (now < WhatsAppStaffNotifications.LocalDayDueAt(day, policy.LocalMinuteOfDay)) continue;
                var role = policy.Category == AttendanceCategory
                    ? resolved.Value.Roles.Contains("BossAdmin") ? "BossAdmin" : null
                    : resolved.Value.Roles.Contains("BossAdmin") ? "BossAdmin" :
                        resolved.Value.Roles.Contains("HrSalary") ? "HrSalary" : null;
                if (role is null) continue;
                var body = policy.Category == AttendanceCategory
                    ? ProjectAttendance(await LoadAttendanceAsync(db, day, now, ct), day, binding.Language).Body
                    : (await LoadPendingLeaveAsync(db, binding.StaffUserId, role, day, binding.Language, ct))?.Body;
                if (body is not null && await StageAsync(db, binding, policy.Category, role, body,
                    day, policy.LocalMinuteOfDay, now, actor, ct) is not null) observed++;
            }
        }
        return observed;
    }

    private static async Task<WhatsAppOutbox?> StageAsync(AppDbContext db, WhatsAppStaffBinding binding,
        string category, string role, string body, DateOnly day, int minute, long now, string actor, CancellationToken ct)
    {
        if (body.Length is 0 or > 1024 || body.Any(char.IsControl)) return null;
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(
            $"staff|hr|{category}|{day:yyyy-MM-dd}|{binding.StaffUserId}")));
        var existing = await db.WhatsAppOutbox.AsNoTracking().SingleOrDefaultAsync(item => item.IdempotencyKey == key, ct);
        if (existing is not null) return existing;
        var row = new WhatsAppOutbox
        {
            Audience = "Staff", StaffBindingId = binding.Id, StaffUserId = binding.StaffUserId,
            Recipient = binding.Recipient, IdempotencyKey = key, MessageKind = category,
            RequiredStaffRole = role, BusinessEventKey = day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            BusinessEventVersion = 1, EventKind = "staff.notification", TemplateVersion = "staff_notice_v1",
            TemplateReference = body, Body = body, Language = binding.Language, State = "Queued",
            CreatedAt = now, ScheduledAt = WhatsAppStaffNotifications.LocalDayDueAt(day, minute),
            NextAttemptAt = now, ExpiresAt = WhatsAppStaffNotifications.LocalDayDueAt(day.AddDays(1), 0)
        };
        db.WhatsAppOutbox.Add(row);
        db.AuditLogs.Add(new AuditLog { Actor = actor, Action = "whatsapp.staff.hr.queued",
            EntityName = nameof(WhatsAppOutbox), EntityId = row.Id });
        try { await db.SaveChangesAsync(ct); return row; }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            var raced = await db.WhatsAppOutbox.AsNoTracking()
                .SingleOrDefaultAsync(item => item.IdempotencyKey == key, ct);
            if (raced is null) throw;
            return raced;
        }
    }

    private static string SafeName(string? value)
    {
        var name = new string((value ?? "staff").Where(c => !char.IsControl(c) && c is not ';' and not ':' and not '[' and not ']')
            .Take(32).ToArray()).Trim();
        return name.Length == 0 ? "staff" : name;
    }
}
