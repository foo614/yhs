using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class WhatsAppNotificationDispatcher
{
    public static bool Supported(WhatsAppOutbox item) => item.Audience == "Enrollment"
        ? item.EventKind == WhatsAppStaffInvitation.EventKind && item.TemplateVersion == WhatsAppStaffInvitation.TemplateKey &&
          item.MessageKind == "StaffInvitation" && item.StaffBindingId is null && item.StaffUserId is not null &&
          item.TemplateReference == WhatsAppStaffInvitation.ReferenceFor(item.Language)
        : item.Audience == "Staff"
        ? item.EventKind == "staff.notification" && item.TemplateVersion == "staff_notice_v1" &&
          WhatsAppStaffNotifications.Categories.Contains(item.MessageKind)
        : item.Audience == "Customer" && (item.EventKind, item.TemplateVersion) is
          ("enquiry.created", "enquiry_ack_v1") or ("loan.status_changed", "business_update_v1") or ("receipt.issued", "receipt_ready_v1");

    public static async Task<bool> DispatchOneAsync(AppDbContext db, WhatsAppDispatchOptions options,
        Func<WhatsAppOutbox, CancellationToken, Task<WhatsAppSendResult>> send, long now, CancellationToken ct = default,
        WhatsAppAssistantOptions? assistant = null,
        Func<AppDbContext, WhatsAppOutbox, CancellationToken, Task<bool>>? currentStaffFacts = null,
        Func<AppDbContext, WhatsAppOutbox, long, CancellationToken, Task<WhatsAppOutbox?>>? refreshStaff = null)
    {
        // This gate precedes any database access, including on installations without WhatsApp tables.
        if (!options.Ready && !options.StaffReady && !options.InvitationReady) return false;
        WhatsAppOutbox? candidate;
        var attempt = 0;
        await using (var claim = await db.Database.BeginTransactionAsync(ct))
        {
            // A shared database row serializes claims AND budget reservations across API replicas.
            // Both PostgreSQL and the isolated SQLite test database support this insert.
            await EnsureUsageAsync(db, "dispatch-lock", ct);
            await db.WhatsAppDispatchUsage.Where(row => row.Period == "dispatch-lock")
                .ExecuteUpdateAsync(set => set.SetProperty(row => row.Attempts, row => row.Attempts), ct);
            var stale = await db.WhatsAppOutbox.Where(row => row.EventKind != "test" && row.State == "Sending" && row.LeaseUntil <= now)
                .Select(row => row.Id).ToListAsync(ct);
            foreach (var id in stale)
            {
                await db.WhatsAppOutbox.Where(row => row.Id == id && row.State == "Sending" && row.LeaseUntil <= now)
                    .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "UnknownOutcome"), ct);
                Audit(db, id, "UnknownOutcome");
            }
            var ms = options.Templates.Where(template => template.Language == "ms").Select(template => template.Key).ToArray();
            var en = options.Templates.Where(template => template.Language == "en_US").Select(template => template.Key).ToArray();
            candidate = await db.WhatsAppOutbox.AsNoTracking().Where(row => row.EventKind != "test" && row.ProviderMessageId == null &&
                ((row.Audience == "Customer" && options.Ready) || (row.Audience == "Staff" && options.StaffReady) ||
                 (row.Audience == "Enrollment" && options.InvitationReady)) &&
                (row.State == "HeldForApproval" || row.State == "Queued" || row.State == "RetryScheduled") && row.TemplateReference != "" && row.NextAttemptAt <= now &&
                ((row.Language == "ms" && ms.Contains(row.TemplateVersion)) || (row.Language == "en_US" && en.Contains(row.TemplateVersion))))
                .OrderBy(row => row.CreatedAt).ThenBy(row => row.Id).FirstOrDefaultAsync(ct);
            if (candidate is null)
            {
                await db.SaveChangesAsync(ct);
                await claim.CommitAsync(ct);
                return false;
            }
            if (!Supported(candidate) || candidate.ExpiresAt <= now || candidate.Attempts >= 3 ||
                (candidate.Audience == "Customer" && (!Guid.TryParseExact(candidate.BusinessReference, "D", out _) ||
                !await db.WhatsAppConsents.AnyAsync(row => row.Recipient == candidate.Recipient && row.OptedIn && row.Language == candidate.Language, ct) ||
                !await ReceiptEligibleAsync(db, candidate, ct))) ||
                (candidate.Audience == "Staff" && await StaffEligibleAsync(db, candidate, options, assistant, now, ct,
                    currentStaffFacts, refreshStaff) is null) ||
                (candidate.Audience == "Enrollment" && (assistant is null ||
                    !await WhatsAppStaffInvitation.EligibleAsync(db, candidate, assistant, options, now, ct))))
            {
                await db.WhatsAppOutbox.Where(row => row.Id == candidate.Id).ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "Suppressed")
                    .SetProperty(row => row.SuppressedAt, now).SetProperty(row => row.FailureReason, "Eligibility changed or notification expired"), ct);
                Audit(db, candidate.Id, "Suppressed");
                await db.SaveChangesAsync(ct);
                await claim.CommitAsync(ct);
                return true;
            }
            // Malaysia calendar boundaries; every attempted request reserves the reviewed worst-case cost.
            var date = DateTimeOffset.FromUnixTimeSeconds(now).ToOffset(TimeSpan.FromHours(8));
            var daily = "day:" + date.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
            var monthly = "month:" + date.ToString("yyyy-MM", System.Globalization.CultureInfo.InvariantCulture);
            await EnsureUsageAsync(db, daily, ct);
            await EnsureUsageAsync(db, monthly, ct);
            var day = await db.WhatsAppDispatchUsage.AsNoTracking().SingleAsync(row => row.Period == daily, ct);
            var month = await db.WhatsAppDispatchUsage.AsNoTracking().SingleAsync(row => row.Period == monthly, ct);
            if (day.Attempts >= options.DailyAttemptLimit || month.ReservedCostSen > options.MonthlyBudgetSen - options.MaximumCostPerAttemptSen)
            {
                await db.SaveChangesAsync(ct);
                await claim.CommitAsync(ct);
                return false;
            }
            attempt = candidate.Attempts + 1;
            var claimed = await db.WhatsAppOutbox.Where(row => row.Id == candidate.Id && row.State == candidate.State && row.Attempts == candidate.Attempts)
                .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "Sending").SetProperty(row => row.Attempts, attempt)
                    .SetProperty(row => row.LeaseUntil, now + 120), ct);
            if (claimed == 0)
            {
                await db.SaveChangesAsync(ct);
                await claim.CommitAsync(ct);
                return true;
            }
            foreach (var period in new[] { daily, monthly })
                await db.WhatsAppDispatchUsage.Where(row => row.Period == period).ExecuteUpdateAsync(set =>
                    set.SetProperty(row => row.Attempts, row => row.Attempts + 1)
                    .SetProperty(row => row.ReservedCostSen, row => row.ReservedCostSen + options.MaximumCostPerAttemptSen), ct);
            Audit(db, candidate.Id, "Sending");
            await db.SaveChangesAsync(ct);
            await claim.CommitAsync(ct);
        }

        // Serialize the final consent decision with withdrawal, separately from the business transaction.
        // This per-recipient lock lasts at most the bounded provider request, never the global budget lock.
        await using var submission = await db.Database.BeginTransactionAsync(ct);
        var consented = candidate.Audience == "Customer" && await db.WhatsAppConsents
            .Where(row => row.Recipient == candidate.Recipient && row.OptedIn && row.Language == candidate.Language)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.UpdatedAt, row => row.UpdatedAt), ct) > 0;
        var refreshed = candidate.Audience == "Staff" ? await StaffEligibleAsync(db, candidate, options, assistant, now, ct,
            currentStaffFacts, refreshStaff, lockBinding: true) : null;
        var staffEligible = refreshed is not null;
        if (refreshed is not null) candidate = refreshed;
        var invitationEligible = candidate.Audience == "Enrollment" && assistant is not null &&
            await WhatsAppStaffInvitation.EligibleAsync(db, candidate, assistant, options, now, ct, lockChallenge: true);
        var owned = await db.WhatsAppOutbox.AnyAsync(row => row.Id == candidate.Id && row.Attempts == attempt && row.State == "Sending", ct);
        var eligible = (consented || staffEligible || invitationEligible) && owned && candidate.ExpiresAt > now &&
            (candidate.Audience != "Customer" || await ReceiptEligibleAsync(db, candidate, ct, lockReceipt: true));
        WhatsAppSendResult result;
        if (!eligible) result = new("Suppressed");
        else
        {
            try
            {
                if (candidate.Audience is "Staff" or "Enrollment")
                {
                    var approvedTemplate = options.TemplateFor(candidate)!;
                    await db.WhatsAppOutbox.Where(row => row.Id == candidate.Id && row.State == "Sending")
                        .ExecuteUpdateAsync(set => set.SetProperty(row => row.TemplateReference, candidate.TemplateReference)
                            .SetProperty(row => row.Body, candidate.Body)
                            .SetProperty(row => row.SubmittedBody, candidate.TemplateReference)
                            .SetProperty(row => row.SubmittedTemplateName, approvedTemplate.Name)
                            .SetProperty(row => row.SubmittedLanguage, approvedTemplate.Language), ct);
                }
                result = await send(candidate, ct);
            }
            catch (Exception) { result = new("UnknownOutcome"); }
        }
        var state = result.Outcome switch
        {
            "Accepted" when !string.IsNullOrWhiteSpace(result.MessageId) => "Accepted",
            "RateLimited" when attempt < 3 => "RetryScheduled",
            "RateLimited" or "Rejected" => "DeadLetter",
            "Suppressed" or "Disabled" or "TemplateNotApproved" or "InvalidRecipient" => "Suppressed",
            _ => "UnknownOutcome"
        };
        var providerId = state == "Accepted" ? result.MessageId : null;
        // Do not let cancellation discard acceptance evidence. A failed DB commit leaves a lease for recovery.
        var changed = await db.WhatsAppOutbox.Where(row => row.Id == candidate.Id && row.Attempts == attempt &&
            (row.State == "Sending" || row.State == "UnknownOutcome"))
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.State, state).SetProperty(row => row.ProviderMessageId, providerId)
                .SetProperty(row => row.NextAttemptAt, now + (attempt == 1 ? 30 : 120))
                .SetProperty(row => row.AcceptedAt, state == "Accepted" ? now : (long?)null)
                .SetProperty(row => row.SuppressedAt, state == "Suppressed" ? now : (long?)null)
                .SetProperty(row => row.FailedAt, state == "DeadLetter" ? now : (long?)null)
                .SetProperty(row => row.FailureReason, state == "DeadLetter" ? "Provider rejected message" :
                    state == "Suppressed" ? "Eligibility or template unavailable" : null), CancellationToken.None);
        if (changed > 0) Audit(db, candidate.Id, state);
        await db.SaveChangesAsync(CancellationToken.None);
        await submission.CommitAsync(CancellationToken.None);
        return true;
    }

    private static Task<int> EnsureUsageAsync(AppDbContext db, string period, CancellationToken ct) => db.Database.ExecuteSqlInterpolatedAsync($"""
        INSERT INTO "WhatsAppDispatchUsage" ("Period", "Attempts", "ReservedCostSen")
        VALUES ({period}, 0, 0) ON CONFLICT ("Period") DO NOTHING;
        """, ct);

    private static async Task<WhatsAppOutbox?> StaffEligibleAsync(AppDbContext db, WhatsAppOutbox item,
        WhatsAppDispatchOptions options, WhatsAppAssistantOptions? assistant, long now, CancellationToken ct,
        Func<AppDbContext, WhatsAppOutbox, CancellationToken, Task<bool>>? currentStaffFacts,
        Func<AppDbContext, WhatsAppOutbox, long, CancellationToken, Task<WhatsAppOutbox?>>? refreshStaff,
        bool lockBinding = false)
    {
        if (assistant is null || item.StaffBindingId is null || item.StaffUserId is null ||
            item.MessageKind.Length == 0) return null;
        if (lockBinding && await db.WhatsAppStaffBindings.Where(row => row.Id == item.StaffBindingId && row.RevokedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.VerifiedAt, row => row.VerifiedAt), ct) == 0) return null;
        var resolved = await WhatsAppStaffBindings.ResolveAsync(db, assistant, item.StaffBindingId.Value, now, ct);
        var allowed = resolved is not null && resolved.Value.Binding.PhoneNumberId == options.PhoneNumberId &&
            resolved.Value.Binding.StaffUserId == item.StaffUserId &&
            resolved.Value.Binding.Recipient == item.Recipient && resolved.Value.Binding.Language == item.Language &&
            WhatsAppStaffNotifications.RoleAllowed(item.MessageKind, [item.RequiredStaffRole]) &&
            resolved.Value.Roles.Contains(item.RequiredStaffRole) &&
            await db.WhatsAppStaffNotificationPolicies.AnyAsync(row => row.Category == item.MessageKind && row.Enabled, ct);
        if (!allowed) return null;
        if (refreshStaff is not null) return await refreshStaff(db, item, now, ct);
        return currentStaffFacts is not null && await currentStaffFacts(db, item, ct) ? item : null;
    }

    private static async Task<bool> ReceiptEligibleAsync(AppDbContext db, WhatsAppOutbox item, CancellationToken ct, bool lockReceipt = false)
    {
        if (item.EventKind != "receipt.issued") return true;
        if (!Guid.TryParseExact(item.BusinessReference, "D", out var id)) return false;
        if (lockReceipt)
            return await db.OfficialReceipts.Where(row => row.Id == id && !row.IsVoided)
                .ExecuteUpdateAsync(set => set.SetProperty(row => row.IsVoided, row => row.IsVoided), ct) > 0;
        return await db.OfficialReceipts.AnyAsync(row => row.Id == id && !row.IsVoided, ct);
    }

    private static void Audit(AppDbContext db, Guid id, string state) => db.AuditLogs.Add(new AuditLog
        { Actor = "whatsapp-dispatch", Action = "whatsapp." + state, EntityName = nameof(WhatsAppOutbox), EntityId = id });
}

public sealed class WhatsAppNotificationWorker(IServiceScopeFactory scopes, WhatsAppDispatchOptions options,
    WhatsAppAssistantOptions assistant,
    WhatsAppTemplateSender sender, ILogger<WhatsAppNotificationWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(5));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                await WhatsAppNotificationDispatcher.DispatchOneAsync(db, options,
                    (item, ct) => sender.SendAsync(options, item, ct), DateTimeOffset.UtcNow.ToUnixTimeSeconds(), stoppingToken,
                    assistant, refreshStaff: WhatsAppStaffNotifications.RefreshAsync);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception)
            {
                // No exception object: database/provider details may contain recipients or credentials.
                logger.LogWarning("WhatsApp dispatch iteration failed; pending leases require reconciliation.");
            }
        }
    }
}
