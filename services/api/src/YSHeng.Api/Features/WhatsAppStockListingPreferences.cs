using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record WhatsAppStockListingPreferencesInput(int Weekday, int LocalMinuteOfDay, string[]? RecipientUserIds);
public sealed record WhatsAppStockListingRecipient(string UserId, string DisplayName);
public sealed record WhatsAppStockListingPreferencesView(int Weekday, int LocalMinuteOfDay, string[] RecipientUserIds,
    IReadOnlyList<WhatsAppStockListingRecipient> EligibleRecipients, string DeliveryState);

public static class WhatsAppStockListingPreferencesStore
{
    private static readonly Guid SettingsId = new("4105ded8-ab0e-43ae-9df6-8c990f34a134");

    public static async Task<WhatsAppStockListingPreferencesView> ReadAsync(AppDbContext db,
        WhatsAppAssistantOptions assistant, long now, CancellationToken ct)
    {
        var row = await db.WhatsAppStockListingPreferences.AsNoTracking()
            .SingleOrDefaultAsync(item => item.Id == SettingsId, ct);
        return View(row ?? new(), await EligibleRecipientsAsync(db, assistant, now, ct));
    }

    public static async Task<WhatsAppStockListingPreferencesView?> UpdateAsync(AppDbContext db,
        WhatsAppAssistantOptions assistant, WhatsAppStockListingPreferencesInput input, string actor, long now, CancellationToken ct)
    {
        if (input.Weekday is < 0 or > 6 || input.LocalMinuteOfDay is < 0 or >= 1440 ||
            input.RecipientUserIds is null || input.RecipientUserIds.Any(string.IsNullOrWhiteSpace) ||
            input.RecipientUserIds.Distinct(StringComparer.Ordinal).Count() != input.RecipientUserIds.Length) return null;

        await using var transaction = await WhatsAppStaffBindings.LockAsync(db, ct);
        var recipients = await EligibleRecipientsAsync(db, assistant, now, ct);
        var eligibleIds = recipients.Select(item => item.UserId).ToHashSet(StringComparer.Ordinal);
        if (!input.RecipientUserIds.All(eligibleIds.Contains)) return null;

        var row = new WhatsAppStockListingPreferences
        {
            Id = SettingsId,
            Weekday = input.Weekday,
            LocalMinuteOfDay = input.LocalMinuteOfDay,
            RecipientUserIdsJson = JsonSerializer.Serialize(input.RecipientUserIds)
        };
        var existing = await db.WhatsAppStockListingPreferences.SingleOrDefaultAsync(item => item.Id == SettingsId, ct);
        if (existing is null) db.WhatsAppStockListingPreferences.Add(row);
        else db.Entry(existing).CurrentValues.SetValues(row);
        db.AuditLogs.Add(new AuditLog { Actor = actor, Action = "whatsapp.stockListing.preferencesUpdated",
            EntityName = nameof(WhatsAppStockListingPreferences), EntityId = SettingsId });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return View(row, recipients);
    }

    private static WhatsAppStockListingPreferencesView View(WhatsAppStockListingPreferences row,
        IReadOnlyList<WhatsAppStockListingRecipient> recipients) =>
        new(row.Weekday, row.LocalMinuteOfDay, JsonSerializer.Deserialize<string[]>(row.RecipientUserIdsJson) ?? [],
            recipients, "XlsxTemplateUnsupported");

    private static async Task<IReadOnlyList<WhatsAppStockListingRecipient>> EligibleRecipientsAsync(AppDbContext db,
        WhatsAppAssistantOptions assistant, long now, CancellationToken ct)
    {
        if (!assistant.Ready) return [];
        var candidates = await (from binding in db.WhatsAppStaffBindings.AsNoTracking()
                                join user in db.Users.AsNoTracking() on binding.StaffUserId equals user.Id
                                join membership in db.UserRoles.AsNoTracking() on user.Id equals membership.UserId
                                join role in db.Roles.AsNoTracking() on membership.RoleId equals role.Id
                                where binding.RevokedAt == null && role.Name == "BossAdmin"
                                orderby user.DisplayName, user.Id
                                select new { binding, user }).ToListAsync(ct);
        return candidates.Where(row => WhatsAppStaffBindings.IsCurrent(assistant, row.binding, row.user, ["BossAdmin"], now))
            .Select(row => new WhatsAppStockListingRecipient(row.user.Id, row.user.DisplayName)).ToArray();
    }
}
