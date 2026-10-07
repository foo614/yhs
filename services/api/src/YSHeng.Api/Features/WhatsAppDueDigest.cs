using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record WhatsAppDueDigestSources(
    IReadOnlyCollection<SettlementReminder> Settlements,
    IReadOnlyCollection<DailySpend> DailySpends,
    IReadOnlyCollection<PaymentRecord> Payments,
    IReadOnlyCollection<DebtRecoveryCase> Debts,
    IReadOnlyCollection<DeliverySchedule> Deliveries,
    IReadOnlyCollection<Vehicle> Vehicles,
    IReadOnlyCollection<BrokerCommission>? Commissions = null);

public sealed record WhatsAppDueDigestItem(string Kind, Guid SourceId, DateOnly DueDate, string Label);
public sealed record WhatsAppDueDigestSnapshot(string Body, IReadOnlyList<WhatsAppDueDigestItem> Items, int OverflowCount);
public sealed record WhatsAppDueDigestDiagnostics(int MissingRequiredDate, int UnassignedDelivery, int MissingCommissionDate);

// FOO-193 projection and enqueue adapter. Shared worker/dispatcher registration is added only
// after the staff notification foundation and onboarding changes are integrated.
public static class WhatsAppDueDigest
{
    private const int MaxBodyLength = 1024;
    private const int MaxVisibleItems = 7;
    public const int PageSize = 7;

    public static async Task<WhatsAppDueDigestSources> LoadAsync(AppDbContext db, DateOnly today,
        int leadDays, CancellationToken ct = default)
    {
        if (leadDays is < 1 or > 30) throw new ArgumentOutOfRangeException(nameof(leadDays));
        var through = today.AddDays(leadDays);
        var commissions = await db.BrokerCommissions.AsNoTracking()
            .Where(item => !item.IsPaid && item.Amount > 0 && item.DueDate != null && item.DueDate != DateOnly.MinValue && item.DueDate <= through)
            .ToListAsync(ct);
        var settlements = await db.SettlementReminders.AsNoTracking()
            .Where(item => !item.IsPaid && item.Deadline != default && item.Deadline <= through &&
                item.Direction != SettlementDirection.InternalOffset && item.Amount > 0).ToListAsync(ct);
        var dailySpends = await db.DailySpends.AsNoTracking()
            .Where(item => !item.IsPaid && item.DueDate != default && item.DueDate <= through && item.Amount > 0).ToListAsync(ct);
        var payments = await db.PaymentRecords.AsNoTracking()
            .Where(item => item.Status != PaymentStatus.Reconciled && item.BankFollowUpDate != null &&
                item.BankFollowUpDate <= through).ToListAsync(ct);
        var debts = await db.DebtRecoveryCases.AsNoTracking()
            .Where(item => item.Status != DebtRecoveryStatus.Closed && item.BalanceAmount > 0 &&
                item.FollowUpDate != default && item.FollowUpDate <= through).ToListAsync(ct);
        var deliveries = await db.DeliverySchedules.AsNoTracking()
            .Where(item => item.Status != DeliveryStatus.Released && item.Status != DeliveryStatus.Cancelled &&
                item.Status != DeliveryStatus.BookingInspection && item.ScheduledDate != default &&
                item.ScheduledDate <= through).ToListAsync(ct);
        var vehicleIds = settlements.Select(item => item.VehicleId)
            .Concat(commissions.Select(item => item.VehicleId))
            .Concat(payments.Select(item => item.VehicleId))
            .Concat(debts.Select(item => item.VehicleId))
            .Concat(deliveries.Select(item => item.VehicleId)).Distinct().ToArray();
        var vehicles = await db.Vehicles.AsNoTracking().Where(item => vehicleIds.Contains(item.Id)).ToListAsync(ct);
        return new(settlements, dailySpends, payments, debts, deliveries, vehicles, commissions);
    }

    public static WhatsAppDueDigestSnapshot? Project(WhatsAppDueDigestSources sources, DateOnly today,
        int leadDays, string staffUserId, string requiredRole, Uri? workboardUrl = null, string language = "en_US")
    {
        if (leadDays is < 1 or > 30) throw new ArgumentOutOfRangeException(nameof(leadDays));
        if (string.IsNullOrWhiteSpace(staffUserId) || requiredRole is not ("BossAdmin" or "Sales")) return null;
        var through = today.AddDays(leadDays);
        var malay = language == "ms";
        var vehicleById = sources.Vehicles.ToDictionary(item => item.Id);
        var items = new List<WhatsAppDueDigestItem>();
        bool Due(DateOnly date) => date != default && date <= through;
        string Plate(Guid vehicleId) => vehicleById.TryGetValue(vehicleId, out var vehicle)
            ? SafePlate(vehicle.PlateNumber) : "vehicle";

        if (requiredRole == "BossAdmin")
        {
            foreach (var commission in (sources.Commissions ?? []).Where(item => !item.IsPaid && item.Amount > 0 && item.DueDate is { } date && Due(date)))
                items.Add(new("Commission", commission.Id, commission.DueDate!.Value,
                    $"{(malay ? "Komisen" : "Commission")} {Plate(commission.VehicleId)} RM{Money(commission.Amount)}"));
            foreach (var settlement in sources.Settlements.Where(item => !item.IsPaid && item.Amount > 0 && Due(item.Deadline) &&
                item.Direction is SettlementDirection.LegacyPaySeller or SettlementDirection.PaySeller or SettlementDirection.CollectFromSeller))
                items.Add(new("Settlement", settlement.Id, settlement.Deadline,
                    $"{(settlement.Direction == SettlementDirection.CollectFromSeller ? (malay ? "Kutip daripada penjual" : "Collect from seller") : (malay ? "Bayar kepada penjual" : "Pay seller"))} {Plate(settlement.VehicleId)} RM{Money(settlement.Amount)}"));
            foreach (var spend in sources.DailySpends.Where(item => !item.IsPaid && item.Amount > 0 && Due(item.DueDate)))
                items.Add(new("DailySpend", spend.Id, spend.DueDate, $"{(malay ? "Perbelanjaan" : "Expense")} RM{Money(spend.Amount)}"));
            foreach (var payment in sources.Payments.Where(item => item.Status != PaymentStatus.Reconciled &&
                item.BankFollowUpDate is { } date && Due(date)))
                items.Add(new("BankFollowUp", payment.Id, payment.BankFollowUpDate!.Value,
                    $"{(malay ? "Susulan bank" : "Bank follow-up")} {Plate(payment.VehicleId)}"));
            foreach (var debt in sources.Debts.Where(item => item.Status != DebtRecoveryStatus.Closed &&
                item.BalanceAmount > 0 && Due(item.FollowUpDate)))
                items.Add(new("DebtFollowUp", debt.Id, debt.FollowUpDate,
                    $"{(malay ? "Susulan hutang" : "Debt follow-up")} {Plate(debt.VehicleId)}"));
        }

        foreach (var delivery in sources.Deliveries.Where(item => DeliveryWorkboardRules.IsActive(item) &&
            item.Status != DeliveryStatus.BookingInspection &&
            Due(item.ScheduledDate) && vehicleById.ContainsKey(item.VehicleId)))
        {
            var vehicle = vehicleById[delivery.VehicleId];
            // Only the durable vehicle sales assignment may receive an Agent digest.
            if (requiredRole == "Sales" && vehicle.SalesAgentUserId != staffUserId) continue;
            var kind = delivery.Status == DeliveryStatus.ReadyForRelease
                ? (malay ? "Serahan dirancang" : "Planned handover")
                : (malay ? "Persediaan penghantaran" : "Delivery preparation");
            var plate = SafePlate(vehicle.PlateNumber);
            items.Add(new("Delivery", delivery.Id, delivery.ScheduledDate,
                $"{kind} {plate} — {(malay ? "semak langkah: " : "check steps: ")}delivery {plate}"));
        }

        if (items.Count == 0) return null;
        var ordered = items.OrderBy(item => item.DueDate).ThenBy(item => item.Kind, StringComparer.Ordinal)
            .ThenBy(item => item.SourceId).ToArray();
        var body = new StringBuilder($"YS Heng {(malay ? "urusan tertunggak" : "outstanding")} {today:yyyy-MM-dd}: ");
        var shown = 0;
        foreach (var item in ordered.Take(MaxVisibleItems))
        {
            var segment = $"{(shown == 0 ? "" : "; ")}{Bucket(item.DueDate, today, malay)} {item.Label} ({item.DueDate:yyyy-MM-dd})";
            if (body.Length + segment.Length + 90 > MaxBodyLength) break;
            body.Append(segment);
            shown++;
        }
        if (shown == 0) throw new InvalidOperationException("A due item exceeded the notification text limit.");
        var overflow = ordered.Length - shown;
        if (overflow > 0)
        {
            body.Append(malay ? $"; +{overflow} lagi — hantar due page 1" : $"; +{overflow} more — send due page 1");
            if (SafeWorkboardLink(workboardUrl) is { } link && body.Length + link.Length + 2 <= MaxBodyLength)
                body.Append(": ").Append(link);
        }
        return new(body.ToString(), ordered, overflow);
    }

    public static string FormatPage(WhatsAppDueDigestSnapshot? snapshot, DateOnly today, int page, string language)
    {
        var malay = language == "ms";
        if (snapshot is null) return malay ? "Tiada urusan tertunggak dalam tempoh ini." : "No due items in this period.";
        var offset = (page - 1) * PageSize;
        var rows = snapshot.Items.Skip(offset).Take(PageSize).ToArray();
        if (rows.Length == 0)
            return malay ? $"Tiada urusan pada halaman {page}. Jumlah {snapshot.Items.Count} urusan." :
                $"No due items on page {page}. {snapshot.Items.Count} items in total.";
        var last = offset + rows.Length;
        var heading = malay ? $"Urusan tertunggak ({offset + 1}-{last} daripada {snapshot.Items.Count}):" :
            $"Due items ({offset + 1}-{last} of {snapshot.Items.Count}):";
        var lines = rows.Select(item => $"{Bucket(item.DueDate, today, malay)} {item.Label} ({item.DueDate:yyyy-MM-dd})");
        var reply = heading + "\n" + string.Join("\n", lines);
        if (last < snapshot.Items.Count)
            reply += "\n" + (malay ? "Seterusnya: " : "Next: ") + $"due page {page + 1}";
        return reply;
    }

    public static async Task<WhatsAppDueDigestSnapshot?> RefreshForDispatchAsync(AppDbContext db,
        WhatsAppOutbox queued, long now, Uri? workboardUrl = null, CancellationToken ct = default)
    {
        if (queued.Audience != "Staff" || queued.MessageKind != "OutstandingDigest" ||
            queued.StaffUserId is null || queued.RequiredStaffRole is not ("BossAdmin" or "Sales") ||
            queued.ScheduledAt > now || queued.ExpiresAt <= now) return null;
        var today = WhatsAppStaffNotifications.LocalDate(now);
        if (queued.BusinessEventKey != today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)) return null;
        var policy = await db.WhatsAppStaffNotificationPolicies.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Category == "OutstandingDigest" && item.Enabled, ct);
        if (policy is null || now < WhatsAppStaffNotifications.LocalDayDueAt(today, policy.LocalMinuteOfDay)) return null;
        var sources = await LoadAsync(db, today, policy.LeadDays, ct);
        return Project(sources, today, policy.LeadDays, queued.StaffUserId, queued.RequiredStaffRole, workboardUrl,
            queued.Language);
    }

    public static async Task<WhatsAppOutbox?> EnqueueCurrentDayAsync(AppDbContext db, WhatsAppAssistantOptions assistant,
        Guid bindingId, long now, string actor, Uri? workboardUrl = null, CancellationToken ct = default)
    {
        var policy = await db.WhatsAppStaffNotificationPolicies.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Category == "OutstandingDigest" && item.Enabled, ct);
        if (policy is null) return null;
        var today = WhatsAppStaffNotifications.LocalDate(now);
        if (now < WhatsAppStaffNotifications.LocalDayDueAt(today, policy.LocalMinuteOfDay)) return null;
        var resolved = await WhatsAppStaffBindings.ResolveAsync(db, assistant, bindingId, now, ct);
        if (resolved is null) return null;
        var role = resolved.Value.Roles.Contains("BossAdmin") ? "BossAdmin" :
            resolved.Value.Roles.Contains("Sales") ? "Sales" : null;
        if (role is null) return null;
        var sources = await LoadAsync(db, today, policy.LeadDays, ct);
        var snapshot = Project(sources, today, policy.LeadDays, resolved.Value.Binding.StaffUserId, role, workboardUrl,
            resolved.Value.Binding.Language);
        if (snapshot is null) return null;
        var staged = await WhatsAppStaffNotifications.StageCurrentDayDigestAsync(db, assistant, bindingId,
            "OutstandingDigest", role, snapshot.Body, 1, now, actor, ct);
        if (staged is null || db.Entry(staged).State == EntityState.Detached) return staged;
        try { await db.SaveChangesAsync(ct); return staged; }
        catch (DbUpdateException)
        {
            // A concurrent scheduler may have inserted the same daily delivery key.
            // Only a matching durable key resolves this race; unrelated failures propagate.
            db.ChangeTracker.Clear();
            var existing = await db.WhatsAppOutbox.AsNoTracking()
                .SingleOrDefaultAsync(item => item.IdempotencyKey == staged.IdempotencyKey, ct);
            if (existing is null) throw;
            return existing;
        }
    }

    public static async Task<int> EnqueueForVerifiedBindingsAsync(AppDbContext db,
        WhatsAppAssistantOptions assistant, long now, string actor, Uri? workboardUrl = null,
        CancellationToken ct = default)
    {
        var ids = await db.WhatsAppStaffBindings.AsNoTracking()
            .Where(item => item.VerifiedAt > 0 && item.RevokedAt == null)
            .Select(item => item.Id).ToArrayAsync(ct);
        var staged = 0;
        foreach (var id in ids)
        {
            // EnqueueCurrentDayAsync rechecks the policy, role, binding and assignment.
            if (await EnqueueCurrentDayAsync(db, assistant, id, now, actor, workboardUrl, ct) is not null)
                staged++;
        }
        return staged;
    }

    public static async Task<WhatsAppDueDigestDiagnostics> DiagnosticsAsync(AppDbContext db,
        CancellationToken ct = default)
    {
        // Payment bank-follow-up is optional, so its absence is not a missing-date issue.
        var missingSettlement = await db.SettlementReminders.CountAsync(item => !item.IsPaid && item.Amount > 0 &&
            item.Direction != SettlementDirection.InternalOffset && item.Deadline == default, ct);
        var missingExpense = await db.DailySpends.CountAsync(item => !item.IsPaid && item.Amount > 0 &&
            item.DueDate == default, ct);
        var missingDebt = await db.DebtRecoveryCases.CountAsync(item => item.Status != DebtRecoveryStatus.Closed &&
            item.BalanceAmount > 0 && item.FollowUpDate == default, ct);
        var missingDelivery = await db.DeliverySchedules.CountAsync(item => item.Status != DeliveryStatus.Released &&
            item.Status != DeliveryStatus.Cancelled && item.Status != DeliveryStatus.BookingInspection &&
            item.ScheduledDate == default, ct);
        var unassignedDelivery = await db.DeliverySchedules.CountAsync(item => item.Status != DeliveryStatus.Released &&
            item.Status != DeliveryStatus.Cancelled && item.Status != DeliveryStatus.BookingInspection &&
            item.ScheduledDate != default && !db.Vehicles.Any(vehicle => vehicle.Id == item.VehicleId &&
                vehicle.SalesAgentUserId != null && vehicle.SalesAgentUserId != ""), ct);
        var missingCommission = await db.BrokerCommissions.CountAsync(item => !item.IsPaid && item.Amount > 0 &&
            (item.DueDate == null || item.DueDate == DateOnly.MinValue), ct);
        return new(missingSettlement + missingExpense + missingDebt + missingDelivery, unassignedDelivery, missingCommission);
    }

    private static string Bucket(DateOnly dueDate, DateOnly today, bool malay) => dueDate < today
        ? (malay ? "LEWAT" : "OVERDUE") : dueDate == today ? (malay ? "HARI INI" : "TODAY") : (malay ? "AKAN DATANG" : "NEXT");
    private static string Money(decimal amount) => amount.ToString("0.00", CultureInfo.InvariantCulture);
    private static string SafePlate(string? value)
    {
        var plate = Regex.Replace(value ?? "", "[^A-Za-z0-9-]", "").ToUpperInvariant();
        return plate.Length is > 0 and <= 16 ? plate : "vehicle";
    }
    private static string? SafeWorkboardLink(Uri? uri) => uri is { IsAbsoluteUri: true } &&
        uri.Scheme == Uri.UriSchemeHttps && uri.UserInfo.Length == 0 && uri.Query.Length == 0 &&
        uri.Fragment.Length == 0 && uri.AbsoluteUri.Length <= 180 ? uri.AbsoluteUri : null;
}
