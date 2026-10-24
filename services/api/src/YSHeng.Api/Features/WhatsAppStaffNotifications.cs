using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record WhatsAppStaffPolicyView(string Category, bool Enabled, int LocalMinuteOfDay,
    int LeadDays, int ThresholdPercent, bool SenderReady, bool TemplateReady, bool CategoryReady,
    IReadOnlyList<string> SenderIssues, IReadOnlyList<WhatsAppTemplateReadiness> TemplateReadiness);
public sealed record WhatsAppStaffPolicyUpdate(bool Enabled, int LocalMinuteOfDay, int LeadDays, int ThresholdPercent);
public sealed record WhatsAppStaffHistoryItem(Guid Id, string StaffUserId, string StaffName, string MaskedNumber,
    string Category, string? SubmittedBody, string? SubmittedTemplateName, string? SubmittedLanguage,
    string State, long ScheduledAt, long? AcceptedAt, long? SentAt,
    long? DeliveredAt, long? ReadAt, long? FailedAt, long? SuppressedAt, string? FailureReason, bool CanRetry,
    string? WaitingReason = null);
public sealed record WhatsAppStaffHistoryPage(IReadOnlyList<WhatsAppStaffHistoryItem> Items, int Page, int Total);
public sealed record WhatsAppStaffDiagnostics(int MissingRequiredDate, int UnassignedDelivery,
    int MissingCommissionDate, int EligibleStaff, int ConnectedStaff, int UnroutableWorkflowEvents);

public static class WhatsAppStaffNotifications
{
    // Rebuilds the exact template parameter from authoritative facts before submission.
    // Categories without an integrated validator fail closed even when their policy is enabled.
    public static Task<WhatsAppOutbox?> RefreshAsync(AppDbContext db, WhatsAppOutbox item,
        long now, CancellationToken ct) => RefreshAsync(db, item, now, ct, null, null, null, null);

    private static async Task<WhatsAppOutbox?> RefreshAsync(AppDbContext db, WhatsAppOutbox item,
        long now, CancellationToken ct, WhatsAppStaffNotificationPolicy? policy, WhatsAppDueDigestSources? dueSources,
        WhatsAppAttendanceFacts? attendance, WhatsAppPendingLeaveFacts? pendingLeave)
    {
        string? body = item.MessageKind switch
        {
            "OutstandingDigest" => (await WhatsAppDueDigest.RefreshForDispatchAsync(db, item, now, ct: ct,
                policy: policy, sources: dueSources))?.Body,
            "OcrUsage" => (await WhatsAppOcrUsageAlerts.RefreshForDispatchAsync(db, item, now, ct))?.Body,
            "AttendanceSummary" or "LeaveApproval" => await WhatsAppHrNotifications.RefreshForDispatchAsync(db, item, now, ct,
                policy, attendance, pendingLeave),
            "VehicleEvent" or "DeliveryEvent" or "FinanceEvent" => await WhatsAppWorkflowDispatch.RefreshAsync(db, item, now, ct),
            _ => null
        };
        if (string.IsNullOrWhiteSpace(body) || body.Length > 1024 || body.Any(char.IsControl) ||
            Regex.IsMatch(body, @"(?i)\blink\s+[a-f0-9]{32}\b")) return null;
        return item with { Body = body, TemplateReference = body };
    }

    private static readonly IReadOnlyDictionary<string, string[]> AllowedRoles = new Dictionary<string, string[]>
    {
        ["OutstandingDigest"] = ["BossAdmin", "Sales"],
        ["AttendanceSummary"] = ["BossAdmin"],
        ["LeaveApproval"] = ["BossAdmin", "HrSalary"],
        ["OcrUsage"] = ["BossAdmin"],
        ["VehicleEvent"] = ["BossAdmin", "Sales"],
        ["DeliveryEvent"] = ["BossAdmin", "Sales"],
        // Sales may receive only the whitelisted, amount-free receipt event renderer.
        ["FinanceEvent"] = ["BossAdmin", "Finance", "Sales"]
    };

    public static IReadOnlyCollection<string> Categories => AllowedRoles.Keys.ToArray();

    public static long LocalDayDueAt(DateOnly day, int localMinuteOfDay)
    {
        if (localMinuteOfDay is < 0 or >= 1440) throw new ArgumentOutOfRangeException(nameof(localMinuteOfDay));
        var local = day.ToDateTime(TimeOnly.MinValue).AddMinutes(localMinuteOfDay);
        return new DateTimeOffset(local, TimeSpan.FromHours(8)).ToUnixTimeSeconds();
    }

    public static DateOnly LocalDate(long now) => DateOnly.FromDateTime(DateTimeOffset.FromUnixTimeSeconds(now)
        .ToOffset(TimeSpan.FromHours(8)).DateTime);

    public static bool RoleAllowed(string category, IEnumerable<string> roles) =>
        AllowedRoles.TryGetValue(category, out var allowed) && roles.Intersect(allowed, StringComparer.Ordinal).Any();

    public static async Task<WhatsAppOutbox?> StageAsync(AppDbContext db, WhatsAppAssistantOptions assistant,
        Guid bindingId, string category, string requiredRole, string businessEventKey, int businessEventVersion, string body,
        long dueAt, long expiresAt, long now, string actor, CancellationToken ct = default)
    {
        if (!AllowedRoles.TryGetValue(category, out var allowedRoles) || !allowedRoles.Contains(requiredRole) ||
            string.IsNullOrWhiteSpace(businessEventKey) || businessEventKey.Length > 256 ||
            businessEventVersion < 1 || string.IsNullOrWhiteSpace(body) || body.Length > 1024 ||
            body.Any(char.IsControl) || Regex.IsMatch(body, @"(?i)\blink\s+[a-f0-9]{32}\b") ||
            dueAt > expiresAt || expiresAt <= now)
            throw new ArgumentException("Invalid staff notification.");
        var policy = await db.WhatsAppStaffNotificationPolicies.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Category == category, ct);
        if (policy?.Enabled != true) return null;
        var resolved = await WhatsAppStaffBindings.ResolveAsync(db, assistant, bindingId, now, ct);
        if (resolved is null || !resolved.Value.Roles.Contains(requiredRole)) return null;
        var binding = resolved.Value.Binding;
        // Daily user/category/date keys survive phone rebinds. The database unique index
        // arbitrates concurrent schedulers; event categories retain binding scope.
        var daily = category is "OutstandingDigest" or "AttendanceSummary" or "LeaveApproval";
        object recipientScope = daily ? binding.StaffUserId : binding.Id;
        var keyMaterial = JsonSerializer.Serialize(new object?[] { "staff", recipientScope, category,
            daily ? null : requiredRole, businessEventKey, businessEventVersion });
        var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(keyMaterial)));
        var existing = await db.WhatsAppOutbox.AsNoTracking().SingleOrDefaultAsync(item => item.IdempotencyKey == key, ct);
        if (existing is not null) return existing;
        var item = new WhatsAppOutbox
        {
            Audience = "Staff", StaffBindingId = binding.Id, StaffUserId = binding.StaffUserId,
            Recipient = binding.Recipient, IdempotencyKey = key, MessageKind = category, RequiredStaffRole = requiredRole,
            BusinessEventKey = businessEventKey, BusinessEventVersion = businessEventVersion,
            EventKind = "staff.notification", TemplateVersion = "staff_notice_v1", TemplateReference = body,
            Body = body, Language = binding.Language, State = "Queued", CreatedAt = now,
            ScheduledAt = dueAt, NextAttemptAt = Math.Max(dueAt, now), ExpiresAt = expiresAt
        };
        db.WhatsAppOutbox.Add(item);
        db.AuditLogs.Add(new AuditLog { Actor = actor, Action = "whatsapp.staff.queued", EntityName = nameof(WhatsAppOutbox), EntityId = item.Id });
        return item;
    }

    // A recovered daily scheduler may enqueue only today's digest. Earlier days have expired;
    // callers must rebuild today's facts before passing body into this method.
    public static async Task<WhatsAppOutbox?> StageCurrentDayDigestAsync(AppDbContext db, WhatsAppAssistantOptions assistant,
        Guid bindingId, string category, string requiredRole, string body, int version, long now, string actor, CancellationToken ct = default)
    {
        if (category is not ("OutstandingDigest" or "AttendanceSummary" or "LeaveApproval")) throw new ArgumentException("Not a daily digest.");
        var day = LocalDate(now);
        var policy = await db.WhatsAppStaffNotificationPolicies.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Category == category && item.Enabled, ct);
        if (policy is null) return null;
        var dueAt = LocalDayDueAt(day, policy.LocalMinuteOfDay);
        if (now < dueAt) return null;
        return await StageAsync(db, assistant, bindingId, category, requiredRole, day.ToString("yyyy-MM-dd"), version, body,
            dueAt, LocalDayDueAt(day.AddDays(1), 0), now, actor, ct);
    }

    public static async Task<IReadOnlyList<WhatsAppStaffPolicyView>> PoliciesAsync(AppDbContext db,
        WhatsAppDispatchOptions dispatch, CancellationToken ct = default)
    {
        var rows = await db.WhatsAppStaffNotificationPolicies.AsNoTracking().ToListAsync(ct);
        return AllowedRoles.Keys.Select(category =>
        {
            var row = rows.SingleOrDefault(item => item.Category == category);
            var minute = category is "OutstandingDigest" or "LeaveApproval" ? 540 : category == "AttendanceSummary" ? 600 : 0;
            return new WhatsAppStaffPolicyView(category, row?.Enabled ?? false, row?.LocalMinuteOfDay ?? minute,
                row?.LeadDays ?? (category == "OutstandingDigest" ? 3 : 0),
                row?.ThresholdPercent ?? (category == "OcrUsage" ? 90 : 0), dispatch.StaffSenderReady,
                dispatch.TemplateFor("staff_notice_v1", "ms") is not null ||
                    dispatch.TemplateFor("staff_notice_v1", "en_US") is not null,
                true, dispatch.StaffSenderIssues(),
                [dispatch.TemplateReadiness("staff_notice_v1", "ms"), dispatch.TemplateReadiness("staff_notice_v1", "en_US")]);
        }).ToArray();
    }

    public static async Task<WhatsAppStaffDiagnostics> DiagnosticsAsync(AppDbContext db,
        WhatsAppAssistantOptions assistant, long now, CancellationToken ct = default)
    {
        var due = await WhatsAppDueDigest.DiagnosticsAsync(db, ct);
        var unroutable = await db.WhatsAppWorkflowEvents.CountAsync(row => row.State == "Pending" &&
            row.ResolvedAt == null && row.ExpiresAt > now && row.Diagnostic != null, ct);
        var roleNames = AllowedRoles.Values.SelectMany(roles => roles).Distinct(StringComparer.Ordinal).ToArray();
        var roleIds = await db.Roles.AsNoTracking().Where(role => roleNames.Contains(role.Name!))
            .Select(role => role.Id).ToArrayAsync(ct);
        var eligibleIds = await db.UserRoles.AsNoTracking().Where(row => roleIds.Contains(row.RoleId))
            .Select(row => row.UserId).Distinct().ToArrayAsync(ct);
        var users = await db.Users.AsNoTracking().Where(user => eligibleIds.Contains(user.Id)).ToListAsync(ct);
        var activeIds = users.Where(user => WhatsAppStaffBindings.Active(user, now))
            .Select(user => user.Id).ToHashSet(StringComparer.Ordinal);
        // Existing installations may never have initialized assistant tables.
        // Disabled configuration cannot have an eligible connection in any case.
        if (!assistant.Ready)
            return new(due.MissingRequiredDate, due.UnassignedDelivery, due.MissingCommissionDate, activeIds.Count, 0, unroutable);
        var bindings = await db.WhatsAppStaffBindings.AsNoTracking()
            .Where(binding => binding.VerifiedAt > 0 && binding.RevokedAt == null).ToListAsync(ct);
        var connectedIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var binding in bindings.Where(binding => activeIds.Contains(binding.StaffUserId)))
            if (await WhatsAppStaffBindings.ResolveAsync(db, assistant, binding.Id, now, ct) is not null)
                connectedIds.Add(binding.StaffUserId);
        return new(due.MissingRequiredDate, due.UnassignedDelivery, due.MissingCommissionDate,
            activeIds.Count, connectedIds.Count, unroutable);
    }

    public static async Task<bool> UpdatePolicyAsync(AppDbContext db, string category, WhatsAppStaffPolicyUpdate request,
        string actor, long now, CancellationToken ct = default)
    {
        if (!AllowedRoles.ContainsKey(category) || request.LocalMinuteOfDay is < 0 or >= 1440 ||
            (category is not ("OutstandingDigest" or "AttendanceSummary" or "LeaveApproval") && request.LocalMinuteOfDay != 0) ||
            (category == "OutstandingDigest" ? request.LeadDays is < 1 or > 30 : request.LeadDays != 0) ||
            (category == "OcrUsage" ? request.ThresholdPercent is < 1 or > 100 : request.ThresholdPercent != 0)) return false;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var row = await db.WhatsAppStaffNotificationPolicies.SingleOrDefaultAsync(item => item.Category == category, ct);
        var next = new WhatsAppStaffNotificationPolicy
        {
            Category = category, Enabled = request.Enabled, LocalMinuteOfDay = request.LocalMinuteOfDay,
            LeadDays = request.LeadDays, ThresholdPercent = request.ThresholdPercent, UpdatedAt = now
        };
        if (row is null) db.WhatsAppStaffNotificationPolicies.Add(next);
        else db.Entry(row).CurrentValues.SetValues(next);
        db.AuditLogs.Add(new AuditLog { Actor = actor, Action = "whatsapp.staff.policy.updated", EntityName = nameof(WhatsAppStaffNotificationPolicy), EntityId = Guid.NewGuid() });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return true;
    }

    public static async Task<WhatsAppStaffHistoryPage> HistoryAsync(AppDbContext db, DateOnly? from, DateOnly? to,
        string? staffUserId, string? category, string? status, int page, long now, CancellationToken ct = default,
        WhatsAppDispatchOptions? dispatch = null, WhatsAppAssistantOptions? assistant = null)
    {
        if (page is < 1 or > 10000 || from > to || (from.HasValue && to.HasValue && to.Value.DayNumber - from.Value.DayNumber > 365) ||
            (category is not null && category != "StaffInvitation" && !AllowedRoles.ContainsKey(category)) ||
            (status is not null && status is not ("Queued" or "Sending" or "Accepted" or "Sent" or "Delivered" or "Read" or "Failed" or "Suppressed" or "DeadLetter" or "RetryScheduled" or "UnknownOutcome")) ||
            staffUserId?.Length > 128) throw new ArgumentException("Invalid history filter.");
        var query = db.WhatsAppOutbox.AsNoTracking().Where(item => item.Audience == "Staff" ||
            item.Audience == "Enrollment" && item.EventKind == WhatsAppStaffInvitation.EventKind);
        if (from.HasValue) { var start = LocalDayDueAt(from.Value, 0); query = query.Where(item => item.CreatedAt >= start); }
        if (to.HasValue) { var end = LocalDayDueAt(to.Value.AddDays(1), 0); query = query.Where(item => item.CreatedAt < end); }
        if (staffUserId is not null) query = query.Where(item => item.StaffUserId == staffUserId);
        if (category is not null) query = query.Where(item => item.MessageKind == category);
        if (status is not null) query = query.Where(item => item.State == status);
        var total = await query.CountAsync(ct);
        var rows = await (from item in query.OrderByDescending(item => item.CreatedAt).ThenBy(item => item.Id)
            .Skip((page - 1) * 25).Take(25)
            join user in db.Users.AsNoTracking() on item.StaffUserId equals user.Id into users
            from user in users.DefaultIfEmpty()
            select new { item, StaffName = user == null ? "Former staff" : user.DisplayName }).ToListAsync(ct);
        var waiting = dispatch is not null && assistant is not null
            ? await WaitingReasonsAsync(db, rows.Select(row => row.item).ToArray(), dispatch, assistant, now, ct)
            : new Dictionary<Guid, string>();
        return new(rows.Select(row => new WhatsAppStaffHistoryItem(row.item.Id, row.item.StaffUserId ?? "",
            row.StaffName, "***" + row.item.Recipient[^Math.Min(4, row.item.Recipient.Length)..], row.item.MessageKind,
            row.item.SubmittedBody, row.item.SubmittedTemplateName, row.item.SubmittedLanguage,
            row.item.State, row.item.ScheduledAt, row.item.AcceptedAt, row.item.SentAt,
            row.item.DeliveredAt, row.item.ReadAt, row.item.FailedAt, row.item.SuppressedAt,
            row.item.FailureReason, false, waiting.GetValueOrDefault(row.item.Id))).ToArray(), page, total);
    }

    private static async Task<Dictionary<Guid, string>> WaitingReasonsAsync(AppDbContext db,
        IReadOnlyCollection<WhatsAppOutbox> rows, WhatsAppDispatchOptions dispatch, WhatsAppAssistantOptions assistant,
        long now, CancellationToken ct)
    {
        var pending = rows.Where(row => row.State is "Queued" or "HeldForApproval" or "RetryScheduled" or "Sending").ToArray();
        if (pending.Length == 0) return [];
        dispatch = await WhatsAppDispatchBudget.OptionsAsync(db, dispatch, ct);
        var date = DateTimeOffset.FromUnixTimeSeconds(now).ToOffset(TimeSpan.FromHours(8));
        var daily = "day:" + date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        var usage = await db.WhatsAppDispatchUsage.AsNoTracking().Where(row => row.Period == daily)
            .ToDictionaryAsync(row => row.Period, ct);
        var policies = await db.WhatsAppStaffNotificationPolicies.AsNoTracking().ToDictionaryAsync(row => row.Category, ct);
        var bindingIds = pending.Where(row => row.StaffBindingId.HasValue).Select(row => row.StaffBindingId!.Value).ToArray();
        var bindings = await db.WhatsAppStaffBindings.AsNoTracking().Where(row => bindingIds.Contains(row.Id))
            .ToDictionaryAsync(row => row.Id, ct);
        var userIds = pending.Select(row => row.StaffUserId).OfType<string>().Distinct().ToArray();
        var users = await db.Users.AsNoTracking().Where(row => userIds.Contains(row.Id)).ToDictionaryAsync(row => row.Id, ct);
        var roleRows = await (from membership in db.UserRoles.AsNoTracking()
            join role in db.Roles.AsNoTracking() on membership.RoleId equals role.Id
            where userIds.Contains(membership.UserId)
            select new { membership.UserId, role.Name }).ToListAsync(ct);
        var roles = roleRows.ToLookup(row => row.UserId, row => row.Name ?? "");
        var limitReason = WhatsAppNotificationDispatcher.DailyLimitBlockReason(dispatch.DailyAttemptLimit,
            usage.GetValueOrDefault(daily)?.Attempts ?? 0);
        WhatsAppDueDigestSources? dueSources = null;
        WhatsAppAttendanceFacts? attendance = null;
        WhatsAppPendingLeaveFacts? pendingLeave = null;
        var reasons = new Dictionary<Guid, string>();
        foreach (var row in pending) reasons[row.Id] = await ReasonAsync(row);
        return reasons;

        async Task<string> ReasonAsync(WhatsAppOutbox row)
        {
            if (row.State == "Sending") return row.LeaseUntil > now
                ? "Provider submission is in progress. Do not retry."
                : "The previous submission outcome needs background reconciliation. Do not retry.";
            if (row.ExpiresAt <= now) return "This reminder has expired and will not be sent.";
            if (row.Audience == "Staff")
            {
                if (policies.GetValueOrDefault(row.MessageKind)?.Enabled != true)
                    return "This reminder category is off. Ask an admin to review reminder settings.";
                if (row.StaffBindingId is null || !bindings.TryGetValue(row.StaffBindingId.Value, out var binding) ||
                    row.StaffUserId is null || !users.TryGetValue(row.StaffUserId, out var user) ||
                    !WhatsAppStaffBindings.IsCurrent(assistant, binding, user, roles[user.Id], now) ||
                    binding.StaffUserId != row.StaffUserId || binding.Recipient != row.Recipient || binding.Language != row.Language ||
                    !RoleAllowed(row.MessageKind, [row.RequiredStaffRole]) || !roles[user.Id].Contains(row.RequiredStaffRole) ||
                    binding.PhoneNumberId != dispatch.PhoneNumberId)
                    return "The recipient connection or required role has changed. Check My WhatsApp and staff access.";
                if (!dispatch.StaffSenderReady)
                    return string.Join(" ", dispatch.StaffSenderIssues()) + " Ask an operator to review the sender configuration.";
            }
            else if (!dispatch.InvitationSenderReady)
                return "Invitation sending is unavailable. Ask an operator to review the invitation sender configuration.";
            if (dispatch.TemplateFor(row) is null)
                return $"No approved {row.Language} template is configured for this message. Ask an operator to check its template mapping.";
            if (string.IsNullOrWhiteSpace(row.TemplateReference)) return "This record has no valid message content and cannot be sent.";
            if (row.Attempts >= 3) return "The maximum sending attempts have been reached; this record cannot be sent again.";
            if (row.NextAttemptAt > now) return row.State == "RetryScheduled"
                ? "Waiting for the scheduled retry after the provider rate limit."
                : "Waiting for the scheduled sending time.";
            if (row.Audience == "Staff")
            {
                // Reuse dispatch validators, sharing current daily facts across recipients.
                // Opening history never stages or submits work.
                if (row.MessageKind == "OutstandingDigest")
                    dueSources ??= await WhatsAppDueDigest.LoadAsync(db, LocalDate(now), policies[row.MessageKind].LeadDays, ct);
                else if (row.MessageKind == "AttendanceSummary")
                    attendance ??= await WhatsAppHrNotifications.LoadAttendanceAsync(db, LocalDate(now), now, ct);
                else if (row.MessageKind == "LeaveApproval")
                    pendingLeave ??= await WhatsAppHrNotifications.LoadPendingLeaveFactsAsync(db, ct);
                if (await RefreshAsync(db, row, now, ct, policies[row.MessageKind], dueSources, attendance, pendingLeave) is null)
                    return "The current business facts no longer allow this reminder. It will be suppressed without sending.";
            }
            if (row.Audience == "Enrollment" && !await WhatsAppStaffInvitation.EligibleAsync(db, row, assistant, dispatch, now, ct))
                return "This invitation is no longer eligible. Check whether verification is complete or the connection was replaced.";
            return limitReason ?? "Waiting for the background sender. If this persists, ask an operator to check dispatcher health.";
        }
    }
}
