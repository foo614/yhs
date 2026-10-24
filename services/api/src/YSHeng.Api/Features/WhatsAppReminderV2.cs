using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

// Approved static bodies own the line breaks. Parameters contain only aggregate facts.
public static class WhatsAppReminderV2
{
    public const string Due = "ysheng_due_summary_v2";
    public const string Delivery = "ysheng_delivery_summary_v2";
    public const string Leave = "ysheng_leave_summary_v2";
    public const string Attendance = "ysheng_attendance_summary_v2";

    public static bool Known(string key) => key is Due or Delivery or Leave or Attendance;
    public static string NameFor(string key, string language) => Known(key) ? language switch
    {
        "en_US" => key + "_en",
        "ms" => key + "_ms",
        _ => ""
    } : "";
    public static string? KeyFor(WhatsAppOutbox item) => (item.MessageKind, item.RequiredStaffRole) switch
    {
        ("OutstandingDigest", "BossAdmin") => Due,
        ("OutstandingDigest", "Sales") => Delivery,
        ("LeaveApproval", "BossAdmin" or "HrSalary") => Leave,
        ("AttendanceSummary", "BossAdmin") => Attendance,
        _ => null
    };

    public static string BodyText(string key, string language) => (key, language) switch
    {
        (Due, "en_US") => "YS Heng due work | {{1}}\nDue through: {{2}}\nTotal items: {{3}} | Overdue: {{4}}\nPay seller: {{5}} payments | {{6}}\nCollect from seller: {{7}} payments | {{8}}\nOther due work: {{9}} items\nReview all items in Portal before taking action.",
        (Due, "ms") => "Urusan perlu tindakan YS Heng | {{1}}\nTarikh akhir hingga: {{2}}\nJumlah urusan: {{3}} | Lewat: {{4}}\nBayar penjual: {{5}} bayaran | {{6}}\nKutip daripada penjual: {{7}} bayaran | {{8}}\nUrusan lain: {{9}} urusan\nSemak semua urusan di Portal sebelum mengambil tindakan.",
        (Delivery, "en_US") => "YS Heng assigned deliveries | {{1}}\nDue through: {{2}}\nYour due deliveries: {{3}}\nOverdue: {{4}}\nReview preparation and handover steps in Portal.",
        (Delivery, "ms") => "Penghantaran tugasan YS Heng | {{1}}\nTarikh akhir hingga: {{2}}\nPenghantaran anda: {{3}}\nLewat: {{4}}\nSemak persediaan dan langkah serahan di Portal.",
        (Leave, "en_US") => "YS Heng leave approvals | {{1}}\nPending requests you can review: {{2}}\nEarliest leave starts: {{3}}\nOpen Portal to review all requests and decide.",
        (Leave, "ms") => "Kelulusan cuti YS Heng | {{1}}\nPermohonan menunggu semakan anda: {{2}}\nCuti terawal bermula: {{3}}\nBuka Portal untuk menyemak semua permohonan dan membuat keputusan.",
        (Attendance, "en_US") => "YS Heng attendance | {{1}}\nKnown scheduled: {{2}}\nChecked in (scheduled): {{3}}\nFull-day leave: {{4}}\nOutstation: {{5}}\nPartial/unclear leave: {{6}}\nScheduled without check-in: {{7}}\nUnscheduled check-ins: {{8}}\nSchedule coverage unverified. No check-in is not an absence decision. Review in Portal.",
        (Attendance, "ms") => "Kehadiran YS Heng | {{1}}\nJadual diketahui: {{2}}\nDaftar masuk (berjadual): {{3}}\nCuti penuh: {{4}}\nLuar kawasan: {{5}}\nCuti separa/tidak jelas: {{6}}\nBerjadual belum daftar masuk: {{7}}\nDaftar masuk tanpa jadual: {{8}}\nLiputan jadual tidak disahkan. Belum daftar masuk bukan keputusan ponteng. Semak di Portal.",
        _ => ""
    };

    public static bool ValidManifest(WhatsAppApprovedTemplate template) => template.Name == NameFor(template.Key, template.Language) &&
        template.BodyText == BodyText(template.Key, template.Language) && template.BodyText.Length > 0 &&
        template.PortalUrl == "https://yshenghub.com.my" +
            (template.Key is Leave or Attendance ? "/hr-salary" : template.Key == Delivery ? "/delivery" : "/dashboard");

    public static string? Render(string key, string language, IReadOnlyList<string> values)
    {
        var count = key switch { Due => 9, Delivery => 4, Leave => 3, Attendance => 8, _ => 0 };
        var body = BodyText(key, language);
        if (count == 0 || body.Length == 0 || values.Count != count || values.Any(value =>
            string.IsNullOrWhiteSpace(value) || value.Length > 64 || value.Any(char.IsControl) ||
            value.Contains("  ", StringComparison.Ordinal) || value.Contains('{') || value.Contains('}'))) return null;
        for (var index = 0; index < values.Count; index++)
            body = body.Replace("{{" + (index + 1) + "}}", values[index], StringComparison.Ordinal);
        return body.Length <= 1024 ? body : null;
    }

    internal static string[]? Parameters(WhatsAppOutbox item)
    {
        if (item.Audience != "Staff" || item.EventKind != "staff.notification" || KeyFor(item) != item.TemplateVersion ||
            item.TemplateReference.Length > 1024) return null;
        try
        {
            var values = JsonSerializer.Deserialize<string[]>(item.TemplateReference);
            return values is not null && Render(item.TemplateVersion, item.Language, values) is { } body && body == item.Body
                ? values : null;
        }
        catch (JsonException) { return null; }
    }

    // Queue identity and persisted v1 payload remain stable across activation, rollback and retries.
    // Called only after the existing current-facts, binding, consent and role checks pass.
    public static async Task<WhatsAppOutbox> SelectAsync(AppDbContext db, WhatsAppDispatchOptions options,
        WhatsAppOutbox current, long now, CancellationToken ct = default)
    {
        var key = KeyFor(current);
        if (key is null || options.TemplateFor(key, current.Language) is null) return current;
        var today = WhatsAppStaffNotifications.LocalDate(now);
        string[]? values = null;
        if (current.MessageKind == "OutstandingDigest")
        {
            var policy = await db.WhatsAppStaffNotificationPolicies.AsNoTracking()
                .SingleAsync(row => row.Category == current.MessageKind, ct);
            var sources = await WhatsAppDueDigest.LoadAsync(db, today, policy.LeadDays, ct);
            var snapshot = WhatsAppDueDigest.Project(sources, today, policy.LeadDays, current.StaffUserId!,
                current.RequiredStaffRole, language: current.Language);
            if (snapshot is not null) values = DueValues(sources, snapshot, today, policy.LeadDays, current.RequiredStaffRole, current.Language);
        }
        else if (key == Attendance)
        {
            var snapshot = WhatsAppHrNotifications.ProjectAttendance(
                await WhatsAppHrNotifications.LoadAttendanceAsync(db, today, now, ct), today, current.Language);
            values = [Date(today, current.Language), Number(snapshot.Scheduled), Number(snapshot.CheckedIn),
                Number(snapshot.FullDayLeave), Number(snapshot.Outstation), Number(snapshot.PartialLeaveUnknown),
                Number(snapshot.ScheduledWithoutCheckIn), Number(snapshot.UnscheduledCheckIns)];
        }
        else if (key == Leave)
        {
            var facts = await WhatsAppHrNotifications.LoadPendingLeaveFactsAsync(db, ct);
            var snapshot = WhatsAppHrNotifications.ProjectPendingLeave(facts.Requests, current.StaffUserId!,
                current.RequiredStaffRole, today, current.Language);
            if (snapshot?.EarliestStart is { } start)
                values = [Date(today, current.Language), Number(snapshot.Count), Date(start, current.Language)];
        }
        return values is not null && Render(key, current.Language, values) is { } body
            ? current with { TemplateVersion = key, TemplateReference = JsonSerializer.Serialize(values), Body = body }
            : current;
    }

    internal static string[] DueValues(WhatsAppDueDigestSources sources, WhatsAppDueDigestSnapshot snapshot,
        DateOnly today, int leadDays, string role, string language)
    {
        var common = new[] { Date(today, language), Date(today.AddDays(leadDays), language),
            Number(snapshot.Items.Count), Number(snapshot.Items.Count(item => item.DueDate < today)) };
        if (role == "Sales") return common;
        var ids = snapshot.Items.Where(item => item.Kind == "Settlement").Select(item => item.SourceId).ToHashSet();
        var sellers = sources.Settlements.Where(item => ids.Contains(item.Id)).ToArray();
        var pay = sellers.Where(item => item.Direction is SettlementDirection.PaySeller or SettlementDirection.LegacyPaySeller).ToArray();
        var collect = sellers.Where(item => item.Direction == SettlementDirection.CollectFromSeller).ToArray();
        return [.. common, Number(pay.Length), Money(pay.Sum(item => item.Amount)), Number(collect.Length),
            Money(collect.Sum(item => item.Amount)), Number(snapshot.Items.Count - sellers.Length)];
    }

    private static string Number(int value) => value.ToString(CultureInfo.InvariantCulture);
    private static string Money(decimal value) => "RM" + value.ToString(value == decimal.Truncate(value) ? "#,##0" : "#,##0.00", CultureInfo.InvariantCulture);
    private static string Date(DateOnly value, string language) => value.ToString("dd MMM yyyy",
        CultureInfo.GetCultureInfo(language == "ms" ? "ms-MY" : "en-MY"));
}
