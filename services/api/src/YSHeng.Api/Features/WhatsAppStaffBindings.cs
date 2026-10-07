using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed class WhatsAppAssistantOptions
{
    public static WhatsAppAssistantOptions Load(IConfiguration configuration)
    {
        var assistant = configuration.GetSection("WhatsAppAssistant");
        var transport = configuration.GetSection("WhatsApp");
        string Value(string name) => assistant[name] ?? transport[name] ?? "";
        return new()
        {
            Enabled = assistant.GetValue("Enabled", false), WebhookEnabled = assistant.GetValue("WebhookEnabled", false),
            TestMode = assistant.GetValue("TestMode", true), TestRecipient = Value("TestRecipient"),
            PhoneNumberId = Value("PhoneNumberId"), BusinessAccountId = Value("BusinessAccountId"),
            GraphApiVersion = Value("GraphApiVersion"), AccessToken = Value("AccessToken"), AppSecret = Value("AppSecret"),
            VerifyToken = Value("VerifyToken"), PerStaffDailyLimit = assistant.GetValue("PerStaffDailyLimit", 100),
            WorkspaceDailyLimit = assistant.GetValue("WorkspaceDailyLimit", 1000),
            PublicSiteUrl = assistant["PublicSiteUrl"] ?? "",
            BusinessDisplayNumber = assistant["BusinessDisplayNumber"] ?? ""
        };
    }
    public bool Enabled { get; init; }
    public bool WebhookEnabled { get; init; }
    public bool TestMode { get; init; } = true;
    public string TestRecipient { get; init; } = "";
    public string PhoneNumberId { get; init; } = "";
    public string BusinessAccountId { get; init; } = "";
    public string GraphApiVersion { get; init; } = "";
    public string AccessToken { get; init; } = "";
    public string AppSecret { get; init; } = "";
    public string VerifyToken { get; init; } = "";
    public int PerStaffDailyLimit { get; init; } = 100;
    public int WorkspaceDailyLimit { get; init; } = 1000;
    public string PublicSiteUrl { get; init; } = "";
    public string BusinessDisplayNumber { get; init; } = "";
    public bool HasBusinessDisplayNumber => Regex.IsMatch(BusinessDisplayNumber, @"\A[1-9][0-9]{7,14}\z");
    public bool Ready => Enabled && WebhookEnabled &&
        Regex.IsMatch(PhoneNumberId, @"\A[0-9]{1,32}\z") && Regex.IsMatch(BusinessAccountId, @"\A[0-9]{1,32}\z") &&
        Regex.IsMatch(GraphApiVersion, @"\Av[0-9]{1,3}\.0\z") && AppSecret.Length is >= 32 and <= 256 && VerifyToken.Length is >= 32 and <= 256 &&
        !string.IsNullOrWhiteSpace(AppSecret) && !string.IsNullOrWhiteSpace(VerifyToken) &&
        !string.IsNullOrWhiteSpace(AccessToken) && AccessToken.Length <= 4096 && !AccessToken.Any(char.IsWhiteSpace) &&
        PerStaffDailyLimit is > 0 and <= 10000 && WorkspaceDailyLimit is > 0 and <= 100000 &&
        (!TestMode || Regex.IsMatch(TestRecipient, @"\A[1-9][0-9]{7,14}\z"));
    public bool Allows(string recipient) => Ready && (!TestMode || recipient == TestRecipient);
}

public sealed record WhatsAppStaffConnection(bool Enabled, string State, string? MaskedNumber = null, string Language = "ms", long? VerifiedAt = null,
    long? ExpiresAt = null, string? InvitationState = null, string? BusinessDisplayNumber = null, bool InvitationAvailable = false,
    long? InvitationCreatedAt = null, IReadOnlyList<string>? InvitationLanguages = null, bool ManualLinkAvailable = false);
public sealed record WhatsAppStaffLinkRequest(string Recipient, string Language = "ms", bool ConsentConfirmed = false, bool ManualLink = false);
public sealed record WhatsAppStaffLinkResult(string Command, long ExpiresAt, string InvitationState, string? BusinessDisplayNumber);

public static class WhatsAppStaffBindings
{
    internal static bool InvitationReadyFor(WhatsAppAssistantOptions assistant, WhatsAppDispatchOptions? dispatch, string language) =>
        dispatch?.InvitationReady == true && dispatch.PhoneNumberId == assistant.PhoneNumberId &&
        dispatch.BusinessAccountId == assistant.BusinessAccountId &&
        dispatch.TemplateFor(WhatsAppStaffInvitation.TemplateKey, language) is not null;

    internal static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    internal static bool EqualHash(string first, string second) => first.Length == second.Length &&
        CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(first), Encoding.UTF8.GetBytes(second));
    internal static bool Active(AppUser? user, long now) => user is not null && !string.IsNullOrEmpty(user.SecurityStamp) &&
        (user.LockoutEnd is null || user.LockoutEnd <= DateTimeOffset.FromUnixTimeSeconds(now));
    internal static async Task<string[]> RolesAsync(AppDbContext db, string userId, CancellationToken ct) =>
        await db.UserRoles.AsNoTracking().Where(item => item.UserId == userId)
            .Join(db.Roles.AsNoTracking(), item => item.RoleId, role => role.Id, (_, role) => role.Name!)
            .Where(role => SeedData.Roles.Contains(role)).ToArrayAsync(ct);

    internal static async Task<IDbContextTransaction> LockAsync(AppDbContext db, CancellationToken ct)
    {
        var transaction = await db.Database.BeginTransactionAsync(ct);
        try
        {
            if (db.Database.IsNpgsql()) await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(4141171)", ct);
            return transaction;
        }
        catch { await transaction.DisposeAsync(); throw; }
    }

    internal static void Audit(AppDbContext db, Guid id, string action, string actor) => db.AuditLogs.Add(new AuditLog
    {
        EntityId = id, EntityName = nameof(WhatsAppStaffBinding), Actor = actor, Action = "whatsappStaff." + action
    });

    public static async Task<WhatsAppStaffConnection> StatusAsync(AppDbContext db, WhatsAppAssistantOptions options,
        string userId, long now, CancellationToken ct = default, WhatsAppDispatchOptions? dispatch = null)
    {
        if (!options.Ready) return new(false, "Disabled", InvitationLanguages: []);
        var manualAvailable = options.HasBusinessDisplayNumber;
        string[] languages = [.. new[] { "ms", "en_US" }.Where(language => InvitationReadyFor(options, dispatch, language))];
        var binding = await db.WhatsAppStaffBindings.AsNoTracking().SingleOrDefaultAsync(item => item.StaffUserId == userId && item.RevokedAt == null, ct);
        if (binding is not null)
        {
            var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(item => item.Id == userId, ct);
            var verified = Active(user, now) && EqualHash(binding.SecurityStampHash, Hash(user!.SecurityStamp!)) &&
                (await RolesAsync(db, userId, ct)).Length > 0 && options.Allows(binding.Recipient) && binding.PhoneNumberId == options.PhoneNumberId;
            return new(true, verified ? "Connected" : "RelinkRequired", Mask(binding.Recipient), binding.Language,
                binding.VerifiedAt, InvitationLanguages: [], ManualLinkAvailable: manualAvailable);
        }
        var challenge = await db.WhatsAppStaffChallenges.AsNoTracking().SingleOrDefaultAsync(item => item.StaffUserId == userId, ct);
        if (challenge is { ConsumedAt: null } && challenge.ExpiresAt > now && challenge.FailedAttempts < 5)
        {
            var invite = await db.WhatsAppOutbox.AsNoTracking().Where(item => item.Audience == "Enrollment" &&
                item.StaffUserId == userId && item.BusinessReference == challenge.CodeHash)
                .OrderByDescending(item => item.CreatedAt).Select(item => new { item.State, item.CreatedAt }).FirstOrDefaultAsync(ct);
            return new(true, "AwaitingVerification", Mask(challenge.Recipient), challenge.Language, null,
                challenge.ExpiresAt, invite?.State ?? "NotRequested", manualAvailable ? options.BusinessDisplayNumber : null,
                invite is not null && languages.Contains(challenge.Language), invite?.CreatedAt, languages, manualAvailable);
        }
        return new(true, "Disconnected", InvitationAvailable: languages.Length > 0, InvitationLanguages: languages,
            ManualLinkAvailable: manualAvailable);
    }

    public static async Task<WhatsAppStaffLinkResult> IssueAsync(AppDbContext db, WhatsAppAssistantOptions options,
        string userId, WhatsAppStaffLinkRequest request, string actor, long now, CancellationToken ct = default,
        WhatsAppDispatchOptions? dispatch = null)
    {
        var recipient = WhatsAppOutboxStore.NormalizeRecipient(request.Recipient);
        if (!options.Allows(recipient) || !request.ConsentConfirmed || request.Language is not ("ms" or "en_US"))
            throw new ArgumentException("Confirm consent, a supported language and an eligible phone number.");
        var invitationReady = InvitationReadyFor(options, dispatch, request.Language);
        if (request.ManualLink)
        {
            if (!options.HasBusinessDisplayNumber || invitationReady)
                throw new ArgumentException("Manual linking is unavailable while an invitation can be sent or the business number is not configured.");
        }
        else if (dispatch is not null && !invitationReady)
            throw new ArgumentException("An approved invitation template is unavailable for the selected language.");
        await using var transaction = await LockAsync(db, ct);
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(item => item.Id == userId, ct);
        if (!Active(user, now) || (await RolesAsync(db, userId, ct)).Length == 0) throw new ArgumentException("Staff account is unavailable.");
        if (await db.WhatsAppStaffBindings.AnyAsync(item => item.RevokedAt == null &&
            (item.StaffUserId == userId || item.PhoneNumberId == options.PhoneNumberId && item.Recipient == recipient), ct))
            throw new ArgumentException("Disconnect the existing connection before linking this account or number.");
        var prior = await db.WhatsAppStaffChallenges.SingleOrDefaultAsync(item => item.StaffUserId == userId, ct);
        if (prior is not null && now < prior.CreatedAt + 60) throw new ArgumentException("Wait one minute before requesting another connection code.");
        var inWindow = prior is not null && now < prior.IssueWindowStart + 3600;
        if (inWindow && prior!.IssuesInWindow >= 5) throw new ArgumentException("Connection code limit reached. Try again later.");
        // A high-entropy command avoids sending an OTP and is never persisted or audited in clear text.
        var code = Convert.ToHexString(RandomNumberGenerator.GetBytes(16));
        var challenge = new WhatsAppStaffChallenge
        {
            StaffUserId = userId, Recipient = recipient, PhoneNumberId = options.PhoneNumberId,
            CodeHash = Hash(code), SecurityStampHash = Hash(user!.SecurityStamp!), Language = request.Language,
            CreatedAt = now, ExpiresAt = now + 600, IssueWindowStart = inWindow ? prior!.IssueWindowStart : now,
            IssuesInWindow = inWindow ? prior!.IssuesInWindow + 1 : 1
        };
        if (prior is null) db.WhatsAppStaffChallenges.Add(challenge);
        else db.Entry(prior).CurrentValues.SetValues(challenge);
        await db.WhatsAppOutbox.Where(item => item.Audience == "Enrollment" && item.StaffUserId == userId &&
            (item.State == "Queued" || item.State == "RetryScheduled"))
            .ExecuteUpdateAsync(set => set.SetProperty(item => item.State, "Suppressed")
                .SetProperty(item => item.SuppressedAt, now).SetProperty(item => item.FailureReason, "Invitation replaced"), ct);
        if (dispatch is not null && !request.ManualLink)
        {
            if (!dispatch.InvitationReady || dispatch.PhoneNumberId != options.PhoneNumberId ||
                dispatch.BusinessAccountId != options.BusinessAccountId)
                throw new ArgumentException("Staff invitation sender is unavailable.");
            WhatsAppStaffInvitation.Stage(db, challenge, now);
        }
        Audit(db, Guid.NewGuid(), "linkRequested", actor);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new("link " + code, challenge.ExpiresAt, request.ManualLink ? "NotRequested" : dispatch is null ? "Unavailable" : "Queued",
            options.HasBusinessDisplayNumber ? options.BusinessDisplayNumber : null);
    }

    public static async Task<bool> VerifyAsync(AppDbContext db, WhatsAppAssistantOptions options, string recipient,
        string code, string eventKey, long now, CancellationToken ct = default)
    {
        if (!options.Allows(recipient) || !Regex.IsMatch(code, @"\A[A-Fa-f0-9]{32}\z")) return false;
        await using var transaction = await LockAsync(db, ct);
        if (await db.WhatsAppStaffRequests.AnyAsync(item => item.EventKey == eventKey, ct)) return true;
        var candidates = await db.WhatsAppStaffChallenges.Where(item => item.Recipient == recipient &&
            item.PhoneNumberId == options.PhoneNumberId && item.ExpiresAt > now && item.ConsumedAt == null && item.FailedAttempts < 5).ToListAsync(ct);
        var suppliedHash = Hash(code.ToUpperInvariant());
        var challenge = candidates.SingleOrDefault(item => EqualHash(item.CodeHash, suppliedHash));
        if (challenge is null)
        {
            if (candidates.Count == 1)
            {
                db.Entry(candidates[0]).CurrentValues.SetValues(candidates[0] with { FailedAttempts = candidates[0].FailedAttempts + 1 });
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
            }
            return false;
        }
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(item => item.Id == challenge.StaffUserId, ct);
        if (!Active(user, now) || !EqualHash(challenge.SecurityStampHash, Hash(user!.SecurityStamp!)) ||
            (await RolesAsync(db, user.Id, ct)).Length == 0) return false;
        if (await db.WhatsAppStaffBindings.AnyAsync(item => item.RevokedAt == null &&
            (item.StaffUserId == user.Id || item.Recipient == recipient && item.PhoneNumberId == options.PhoneNumberId), ct)) return false;
        var consumed = await db.WhatsAppStaffChallenges.Where(item => item.StaffUserId == user.Id &&
            item.CodeHash == challenge.CodeHash && item.ConsumedAt == null && item.ExpiresAt > now && item.FailedAttempts < 5)
            .ExecuteUpdateAsync(set => set.SetProperty(item => item.ConsumedAt, now), ct);
        if (consumed == 0) return false;
        var binding = new WhatsAppStaffBinding
        {
            StaffUserId = user.Id, Recipient = recipient, PhoneNumberId = options.PhoneNumberId,
            SecurityStampHash = challenge.SecurityStampHash, Language = challenge.Language, VerifiedAt = now
        };
        db.WhatsAppStaffBindings.Add(binding);
        db.WhatsAppStaffRequests.Add(new WhatsAppStaffRequest
        {
            EventKey = eventKey, BindingId = binding.Id, Intent = "linked", CreatedAt = now, ExpiresAt = now + 300
        });
        Audit(db, binding.Id, "linked", user.Id);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return true;
    }

    public static async Task RevokeAsync(AppDbContext db, string userId, string actor, long now, CancellationToken ct = default, long? verifiedBefore = null)
    {
        await using var transaction = await LockAsync(db, ct);
        var cutoff = verifiedBefore ?? long.MaxValue;
        var bindings = await db.WhatsAppStaffBindings.Where(item => item.StaffUserId == userId && item.RevokedAt == null && item.VerifiedAt <= cutoff).ToListAsync(ct);
        foreach (var binding in bindings)
        {
            db.Entry(binding).CurrentValues.SetValues(binding with { RevokedAt = now });
            await db.WhatsAppStaffRequests.Where(item => item.BindingId == binding.Id && item.State == "Queued")
                .ExecuteUpdateAsync(set => set.SetProperty(item => item.State, "Suppressed"), ct);
            await db.WhatsAppOutbox.Where(item => item.Audience == "Staff" && item.StaffBindingId == binding.Id &&
                (item.State == "Queued" || item.State == "RetryScheduled"))
                .ExecuteUpdateAsync(set => set.SetProperty(item => item.State, "Suppressed")
                    .SetProperty(item => item.SuppressedAt, now)
                    .SetProperty(item => item.FailureReason, "Staff connection revoked"), ct);
            Audit(db, binding.Id, "revoked", actor);
        }
        await db.WhatsAppStaffChallenges.Where(item => item.StaffUserId == userId && item.ConsumedAt == null && item.CreatedAt <= cutoff)
            .ExecuteUpdateAsync(set => set.SetProperty(item => item.ConsumedAt, now), ct);
        await db.WhatsAppOutbox.Where(item => item.Audience == "Enrollment" && item.StaffUserId == userId &&
            (item.State == "Queued" || item.State == "RetryScheduled"))
            .ExecuteUpdateAsync(set => set.SetProperty(item => item.State, "Suppressed")
                .SetProperty(item => item.SuppressedAt, now).SetProperty(item => item.FailureReason, "Connection cancelled"), ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
    }

    internal static async Task<(WhatsAppStaffBinding Binding, string[] Roles)?> ResolveAsync(AppDbContext db,
        WhatsAppAssistantOptions options, Guid bindingId, long now, CancellationToken ct)
    {
        var binding = await db.WhatsAppStaffBindings.AsNoTracking().SingleOrDefaultAsync(item => item.Id == bindingId && item.RevokedAt == null, ct);
        if (binding is null || binding.PhoneNumberId != options.PhoneNumberId || !options.Allows(binding.Recipient)) return null;
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(item => item.Id == binding.StaffUserId, ct);
        if (!Active(user, now) || !EqualHash(binding.SecurityStampHash, Hash(user!.SecurityStamp!))) return null;
        var roles = await RolesAsync(db, user!.Id, ct);
        return roles.Length == 0 ? null : (binding, roles);
    }

    private static string Mask(string recipient) => "***" + recipient[^Math.Min(recipient.Length, 4)..];
}
