using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

// Enrollment is deliberately not a Staff notification: no verified binding exists yet.
public static class WhatsAppStaffInvitation
{
    public const string TemplateKey = "staff_invite_v1";
    public const string EventKind = "staff.invitation";
    public static string ReferenceFor(string language) => language == "ms"
        ? "Buka portal YS Heng untuk salin arahan pengesahan WhatsApp sekali guna. Sah dalam 10 minit. Abaikan jika anda tidak memintanya."
        : "Open your YS Heng portal to copy your one-time WhatsApp verification command. Valid for 10 minutes. Ignore if you did not request this.";

    public static WhatsAppOutbox Stage(AppDbContext db, WhatsAppStaffChallenge challenge, long now)
    {
        var item = new WhatsAppOutbox
        {
            IdempotencyKey = WhatsAppStaffBindings.Hash("invite:" + challenge.StaffUserId + ":" + challenge.CodeHash + ":" + now),
            Recipient = challenge.Recipient, TemplateVersion = TemplateKey, TemplateReference = ReferenceFor(challenge.Language),
            EventKind = EventKind, BusinessReference = challenge.CodeHash, Language = challenge.Language,
            Body = ReferenceFor(challenge.Language), State = "Queued", CreatedAt = now, NextAttemptAt = now, ScheduledAt = now,
            ExpiresAt = challenge.ExpiresAt, Audience = "Enrollment", StaffUserId = challenge.StaffUserId,
            MessageKind = "StaffInvitation"
        };
        db.WhatsAppOutbox.Add(item);
        return item;
    }

    public static async Task ResendAsync(AppDbContext db, WhatsAppAssistantOptions assistant, WhatsAppDispatchOptions dispatch,
        string userId, string actor, long now, CancellationToken ct)
    {
        if (!assistant.Ready || !dispatch.InvitationReady || dispatch.PhoneNumberId != assistant.PhoneNumberId ||
            dispatch.BusinessAccountId != assistant.BusinessAccountId)
            throw new ArgumentException("Staff invitation sender is unavailable.");
        await using var transaction = await WhatsAppStaffBindings.LockAsync(db, ct);
        var challenge = await db.WhatsAppStaffChallenges.AsNoTracking().SingleOrDefaultAsync(row => row.StaffUserId == userId, ct);
        if (challenge is null || challenge.ConsumedAt is not null || challenge.ExpiresAt <= now || challenge.FailedAttempts >= 5)
            throw new ArgumentException("The connection command has expired. Start a new setup.");
        var previous = await db.WhatsAppOutbox.AsNoTracking().Where(row => row.Audience == "Enrollment" &&
            row.StaffUserId == userId && row.BusinessReference == challenge.CodeHash)
            .OrderByDescending(row => row.CreatedAt).FirstOrDefaultAsync(ct);
        if (previous is null || previous.CreatedAt + 60 > now)
            throw new ArgumentException("Wait one minute before resending the invitation.");
        if (previous.State is "Queued" or "Sending" or "RetryScheduled" or "UnknownOutcome" or "Sent" or "Delivered" or "Read")
            throw new ArgumentException("The previous invitation is still pending or already delivered.");
        if (!await EligibleAsync(db, previous, assistant, dispatch, now, ct, lockChallenge: true))
            throw new ArgumentException("The connection is no longer eligible. Start a new setup.");
        Stage(db, challenge, now);
        db.AuditLogs.Add(new AuditLog { Actor = actor, Action = "whatsappStaff.invitationResent",
            EntityName = nameof(WhatsAppOutbox), EntityId = Guid.NewGuid() });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    public static async Task<bool> EligibleAsync(AppDbContext db, WhatsAppOutbox item, WhatsAppAssistantOptions assistant,
        WhatsAppDispatchOptions dispatch, long now, CancellationToken ct, bool lockChallenge = false)
    {
        if (!assistant.Ready || !dispatch.InvitationReady || item.Audience != "Enrollment" ||
            item.EventKind != EventKind || item.TemplateVersion != TemplateKey || item.StaffUserId is null ||
            item.BusinessReference.Length != 64 || dispatch.PhoneNumberId != assistant.PhoneNumberId ||
            dispatch.BusinessAccountId != assistant.BusinessAccountId || !assistant.Allows(item.Recipient) || item.ExpiresAt <= now)
            return false;
        if (lockChallenge && await db.WhatsAppStaffChallenges.Where(row => row.StaffUserId == item.StaffUserId &&
                row.CodeHash == item.BusinessReference && row.ConsumedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.FailedAttempts, row => row.FailedAttempts), ct) == 0) return false;
        var challenge = await db.WhatsAppStaffChallenges.AsNoTracking().SingleOrDefaultAsync(row => row.StaffUserId == item.StaffUserId, ct);
        if (challenge is null || challenge.CodeHash != item.BusinessReference || challenge.Recipient != item.Recipient ||
            challenge.PhoneNumberId != assistant.PhoneNumberId || challenge.Language != item.Language ||
            challenge.ConsumedAt is not null || challenge.ExpiresAt <= now || challenge.FailedAttempts >= 5) return false;
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(row => row.Id == item.StaffUserId, ct);
        return WhatsAppStaffBindings.Active(user, now) &&
            WhatsAppStaffBindings.EqualHash(challenge.SecurityStampHash, WhatsAppStaffBindings.Hash(user!.SecurityStamp!)) &&
            (await WhatsAppStaffBindings.RolesAsync(db, item.StaffUserId, ct)).Length > 0 &&
            !await db.WhatsAppStaffBindings.AnyAsync(row => row.RevokedAt == null &&
                (row.StaffUserId == item.StaffUserId || row.PhoneNumberId == assistant.PhoneNumberId && row.Recipient == item.Recipient), ct);
    }
}
