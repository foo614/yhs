using System.Globalization;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class WhatsAppStaffSettlementCommands
{
    private const long PreviewLifetimeSeconds = 300;

    public static bool TryParsePreview(string argument, out string plate, out decimal amount, out DateOnly deadline,
        out string bankName, out string accountNumber)
    {
        plate = ""; amount = 0; deadline = default; bankName = ""; accountNumber = "";
        var parts = argument.Trim().Split('|', StringSplitOptions.None);
        if (parts.Length != 5 || parts.Any(part => string.IsNullOrWhiteSpace(part) || part.Any(char.IsControl))) return false;
        plate = NormalizePlate(parts[0]);
        if (plate.Length is 0 or > 20 || plate.Any(character => !char.IsLetterOrDigit(character))) return false;
        if (!decimal.TryParse(parts[1].Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out amount) || amount <= 0 || amount > 100_000_000m || decimal.Round(amount, 2) != amount) return false;
        if (!DateOnly.TryParseExact(parts[2].Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out deadline) || deadline == default) return false;
        bankName = parts[3].Trim(); accountNumber = parts[4].Trim();
        return bankName.Length <= 200 && accountNumber.Length <= 80;
    }

    public static bool TryParseConfirmation(string argument, out Guid draftId) => Guid.TryParse(argument.Trim(), out draftId) && draftId != Guid.Empty;

    public static async Task<string> ReplyAsync(AppDbContext db, WhatsAppStaffIntent intent, string language, long now,
        Guid bindingId, string staffUserId, WhatsAppAssistantOptions options, CancellationToken ct = default, Guid? requestId = null)
    {
        if (!string.Equals(intent.Name, "settlement-update", StringComparison.Ordinal)) return WhatsAppStaffQueries.Text(language, "Unsupported settlement update command.", "Arahan kemas kini penyelesaian tidak disokong.");
        if (intent.Argument.StartsWith("confirm ", StringComparison.OrdinalIgnoreCase)) return await ConfirmAsync(db, intent.Argument[8..], language, now, bindingId, staffUserId, options, ct);
        return await PreviewAsync(db, intent.Argument, language, now, bindingId, requestId, staffUserId, options, ct);
    }

    private static async Task<string> PreviewAsync(AppDbContext db, string argument, string language, long now, Guid bindingId, Guid? requestId, string staffUserId, WhatsAppAssistantOptions options, CancellationToken ct)
    {
        if (!TryParsePreview(argument, out var plate, out var proposedAmount, out var proposedDeadline, out var proposedBank, out var proposedAccount)) return WhatsAppStaffQueries.Text(language, "Use: settlement-update <plate> | <amount> | <yyyy-mm-dd> | <bank> | <account>", "Guna: settlement-update <plat> | <jumlah> | <yyyy-mm-dd> | <bank> | <akaun>");
        if (await WhatsAppStaffBindings.ResolveAsync(db, options, bindingId, now, ct) is not { } identity || !identity.Roles.Contains("BossAdmin") || identity.Binding.StaffUserId != staffUserId) return InvalidConnection(language);
        var vehicles = await db.Vehicles.AsNoTracking().Where(vehicle => vehicle.PlateNumber.ToUpper().Replace(" ", "").Replace("-", "") == plate).Take(2).ToListAsync(ct);
        if (vehicles.Count == 0) return WhatsAppStaffQueries.Text(language, "No matching vehicle.", "Tiada kenderaan yang sepadan.");
        if (vehicles.Count > 1) return WhatsAppStaffQueries.Text(language, "Multiple vehicles match. Use a more specific plate.", "Beberapa kenderaan sepadan. Guna plat yang lebih khusus.");
        var vehicle = vehicles[0];
        var settlements = await db.SettlementReminders.AsNoTracking().Where(item => item.VehicleId == vehicle.Id && item.Direction == SettlementDirection.PayBank && !item.IsPaid && item.SupersededById == null).Take(2).ToListAsync(ct);
        if (settlements.Count == 0) return WhatsAppStaffQueries.Text(language, "No open bank settlement for this vehicle.", "Tiada settlement bank terbuka untuk kereta ini.");
        if (settlements.Count > 1) return WhatsAppStaffQueries.Text(language, "Multiple open bank settlements need manual review.", "Ada lebih daripada satu settlement bank terbuka. Sila semak secara manual.");
        var source = settlements[0];
        if (source.BankDebtAmount is not > 0 || string.IsNullOrWhiteSpace(source.BankName) || string.IsNullOrWhiteSpace(source.BankAccountNumber)) return WhatsAppStaffQueries.Text(language, "This bank settlement is missing details. Update it in Back Office first.", "Butiran settlement bank ini belum lengkap. Update di Back Office dahulu.");
        var key = requestId is { } id && id != Guid.Empty ? $"request:{id:N}" : $"preview:{bindingId:N}:{source.Id:N}:{source.BankDebtAmount.Value.ToString(CultureInfo.InvariantCulture)}:{source.Deadline:yyyy-MM-dd}:{proposedAmount.ToString(CultureInfo.InvariantCulture)}:{proposedDeadline:yyyy-MM-dd}:{proposedBank}:{proposedAccount}";
        var existing = await db.WhatsAppSettlementUpdateDrafts.AsNoTracking().SingleOrDefaultAsync(item => item.IdempotencyKey == key, ct);
        if (existing is { State: "Confirmed" }) return WhatsAppStaffQueries.Text(language, $"This request was already applied to {existing.PlateNumber}: {Money(existing.ProposedBankDebtAmount)} due {existing.ProposedDeadline:yyyy-MM-dd}.", "Permintaan ini sudah dibuat.");
        if (existing is not null && existing.ExpiresAt > now) return PreviewText(existing, language);
        if (existing is not null) return WhatsAppStaffQueries.Text(language, "This settlement preview expired. Send the settlement-update command again.", "Pratonton settlement ini sudah tamat. Hantar arahan settlement-update sekali lagi.");
        var draft = new WhatsAppSettlementUpdateDraft { IdempotencyKey = key, BindingId = bindingId, SettlementId = source.Id, VehicleId = vehicle.Id, PlateNumber = vehicle.PlateNumber, OriginalBankDebtAmount = source.BankDebtAmount.Value, OriginalAmount = source.Amount, OriginalDeadline = source.Deadline, OriginalBankName = source.BankName, OriginalBankAccountNumber = source.BankAccountNumber, ProposedBankDebtAmount = proposedAmount, ProposedDeadline = proposedDeadline, ProposedBankName = proposedBank, ProposedBankAccountNumber = proposedAccount, CreatedAt = now, ExpiresAt = now + PreviewLifetimeSeconds };
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        db.WhatsAppSettlementUpdateDrafts.Add(draft);
        try { await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); }
        catch (DbUpdateException exception) when (FinanceApi.IsUniqueViolation(exception))
        {
            await transaction.RollbackAsync(ct);
            var concurrent = await db.WhatsAppSettlementUpdateDrafts.AsNoTracking().SingleOrDefaultAsync(item => item.IdempotencyKey == key, ct);
            if (concurrent is null) return WhatsAppStaffQueries.Text(language, "The settlement preview was not saved. Try again.", "Pratonton settlement tidak dapat disimpan. Cuba lagi.");
            return concurrent.State == "Confirmed" ? WhatsAppStaffQueries.Text(language, $"This request was already applied to {concurrent.PlateNumber}: {Money(concurrent.ProposedBankDebtAmount)} due {concurrent.ProposedDeadline:yyyy-MM-dd}.", "Permintaan ini sudah dibuat.") : concurrent.ExpiresAt > now ? PreviewText(concurrent, language) : WhatsAppStaffQueries.Text(language, "This settlement preview expired. Send the command again.", "Pratonton settlement ini sudah tamat. Hantar arahan sekali lagi.");
        }
        return PreviewText(draft, language);
    }

    private static async Task<string> ConfirmAsync(AppDbContext db, string argument, string language, long now, Guid bindingId, string staffUserId, WhatsAppAssistantOptions options, CancellationToken ct)
    {
        if (!TryParseConfirmation(argument, out var draftId)) return WhatsAppStaffQueries.Text(language, "Use: settlement-update confirm <preview id>.", "Guna: settlement-update confirm <id pratonton>.");
        var confirmationStarted = System.Diagnostics.Stopwatch.GetTimestamp();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        if (await WhatsAppStaffBindings.ResolveAsync(db, options, bindingId, now, ct) is not { } identity || !identity.Roles.Contains("BossAdmin") || identity.Binding.StaffUserId != staffUserId) return InvalidConnection(language);
        var draftQuery = db.Database.IsNpgsql() ? db.WhatsAppSettlementUpdateDrafts.FromSqlInterpolated($"SELECT * FROM \"WhatsAppSettlementUpdateDrafts\" WHERE \"Id\" = {draftId} AND \"BindingId\" = {bindingId} FOR UPDATE") : db.WhatsAppSettlementUpdateDrafts.Where(item => item.Id == draftId && item.BindingId == bindingId);
        var draft = await draftQuery.SingleOrDefaultAsync(ct);
        if (draft is null) return WhatsAppStaffQueries.Text(language, "This settlement preview was not found.", "Pratonton settlement ini tidak dijumpai.");
        if (draft.State == "Confirmed") return WhatsAppStaffQueries.Text(language, $"Already updated {draft.PlateNumber}: {Money(draft.ProposedBankDebtAmount)} due {draft.ProposedDeadline:yyyy-MM-dd}.", "Settlement ini sudah dikemas kini.");
        if (draft.State != "Preview") return WhatsAppStaffQueries.Text(language, "This settlement preview is no longer valid. Send the command again.", "Pratonton settlement ini tidak lagi sah. Hantar arahan sekali lagi.");
        if (draft.ExpiresAt <= now) { db.Entry(draft).CurrentValues.SetValues(draft with { State = "Expired" }); await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return WhatsAppStaffQueries.Text(language, "This settlement preview expired. Send the command again.", "Pratonton settlement ini sudah tamat. Hantar arahan sekali lagi."); }
        var vehicleQuery = db.Database.IsNpgsql() ? db.Vehicles.FromSqlInterpolated($"SELECT * FROM \"Vehicles\" WHERE \"Id\" = {draft.VehicleId} FOR UPDATE") : db.Vehicles.Where(item => item.Id == draft.VehicleId);
        var vehicle = await vehicleQuery.SingleOrDefaultAsync(ct);
        var settlementQuery = db.Database.IsNpgsql() ? db.SettlementReminders.FromSqlInterpolated($"SELECT * FROM \"SettlementReminders\" WHERE \"Id\" = {draft.SettlementId} FOR UPDATE") : db.SettlementReminders.Where(item => item.Id == draft.SettlementId);
        var settlement = await settlementQuery.SingleOrDefaultAsync(ct);
        if (vehicle is null || settlement is null || settlement.VehicleId != draft.VehicleId) return WhatsAppStaffQueries.Text(language, "The vehicle or settlement is no longer available.", "Kereta atau settlement ini sudah tiada.");
        if (settlement.Direction != SettlementDirection.PayBank || settlement.IsPaid || settlement.SupersededById.HasValue || settlement.BankDebtAmount != draft.OriginalBankDebtAmount || settlement.Amount != draft.OriginalAmount || settlement.Deadline != draft.OriginalDeadline || settlement.BankName != draft.OriginalBankName || settlement.BankAccountNumber != draft.OriginalBankAccountNumber)
        {
            db.Entry(draft).CurrentValues.SetValues(draft with { State = "Stale" }); await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
            return WhatsAppStaffQueries.Text(language, "The bank settlement changed after this preview. Create a new preview.", "Settlement bank berubah selepas pratonton ini. Buat pratonton baru.");
        }
        var updated = settlement with { Amount = draft.ProposedBankDebtAmount, BankDebtAmount = draft.ProposedBankDebtAmount, Deadline = draft.ProposedDeadline, BankName = draft.ProposedBankName.Trim(), BankAccountNumber = draft.ProposedBankAccountNumber.Trim() };
        if (!BankSettlementRules.Validate(updated).IsValid) return WhatsAppStaffQueries.Text(language, "The proposed settlement details are invalid. Update them and try again.", "Butiran settlement yang dicadangkan tidak sah. Update dan cuba lagi.");
        var mutationTime = now + (long)System.Diagnostics.Stopwatch.GetElapsedTime(confirmationStarted).TotalSeconds;
        if (draft.ExpiresAt <= mutationTime) return WhatsAppStaffQueries.Text(language, "This settlement preview expired. Send the command again.", "Pratonton settlement ini sudah tamat. Hantar arahan sekali lagi.");
        if (await WhatsAppStaffBindings.ResolveAsync(db, options, bindingId, mutationTime, ct) is not { } current || !current.Roles.Contains("BossAdmin") || current.Binding.StaffUserId != staffUserId) return InvalidConnection(language);
        db.Entry(settlement).CurrentValues.SetValues(updated);
        ApiAudit.Add(db, staffUserId, "bankSettlement.updatedByWhatsApp", nameof(SettlementReminder), settlement.Id);
        db.Entry(draft).CurrentValues.SetValues(draft with { State = "Confirmed", ConfirmedBy = staffUserId, ConfirmedByUserId = staffUserId, ConfirmedAt = now });
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        return WhatsAppStaffQueries.Text(language, $"Updated {vehicle.PlateNumber}: {Money(draft.ProposedBankDebtAmount)} due {draft.ProposedDeadline:yyyy-MM-dd}, bank {draft.ProposedBankName}, account {MaskAccount(draft.ProposedBankAccountNumber)}.", $"Dikemas kini {vehicle.PlateNumber}: {Money(draft.ProposedBankDebtAmount)} pada {draft.ProposedDeadline:yyyy-MM-dd}, bank {draft.ProposedBankName}, akaun {MaskAccount(draft.ProposedBankAccountNumber)}.");
    }

    private static string PreviewText(WhatsAppSettlementUpdateDraft draft, string language) => WhatsAppStaffQueries.Text(language, $"Settlement preview for {draft.PlateNumber}\nOutstanding bank debt: {Money(draft.ProposedBankDebtAmount)}\nDeadline: {draft.ProposedDeadline:yyyy-MM-dd}\nBank: {draft.ProposedBankName}\nAccount: {MaskAccount(draft.ProposedBankAccountNumber)}\nConfirm within 5 minutes: settlement-update confirm {draft.Id}", $"Pratonton settlement {draft.PlateNumber}\nHutang bank tertunggak: {Money(draft.ProposedBankDebtAmount)}\nTarikh akhir: {draft.ProposedDeadline:yyyy-MM-dd}\nBank: {draft.ProposedBankName}\nAkaun: {MaskAccount(draft.ProposedBankAccountNumber)}\nSahkan dalam 5 minit: settlement-update confirm {draft.Id}");
    private static string InvalidConnection(string language) => WhatsAppStaffQueries.Text(language, "Your Boss/Admin WhatsApp connection is no longer valid.", "Sambungan WhatsApp Boss/Admin anda tidak lagi sah.");
    private static string NormalizePlate(string value) => value.Trim().ToUpperInvariant().Replace(" ", "").Replace("-", "");
    private static string MaskAccount(string value) => value.Length <= 4 ? "****" : "****" + value[^4..];
    private static string Money(decimal value) => $"RM {value:N2}";
}
