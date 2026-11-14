using System.Globalization;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class WhatsAppStaffPriceCommands
{
    private const long PreviewLifetimeSeconds = 300;

    public static bool TryParsePreview(string argument, out string plate, out decimal price)
    {
        plate = "";
        price = 0;
        var parts = argument.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length != 2) return false;
        plate = parts[0].ToUpperInvariant().Replace("-", "");
        if (plate.Length is 0 or > 20 || plate.Any(character => !char.IsLetterOrDigit(character))) return false;
        return decimal.TryParse(parts[1], NumberStyles.Number, CultureInfo.InvariantCulture, out price) &&
            price > 0 && price <= 100_000_000m && decimal.Round(price, 2) == price;
    }

    public static bool TryParseConfirmation(string argument, out Guid draftId) =>
        Guid.TryParse(argument.Trim(), out draftId) && draftId != Guid.Empty;

    public static async Task<string> ReplyAsync(AppDbContext db, WhatsAppStaffIntent intent, string language, long now,
        Guid bindingId, string staffUserId, WhatsAppAssistantOptions options, CancellationToken ct = default, Guid? requestId = null)
    {
        if (!string.Equals(intent.Name, "price", StringComparison.Ordinal))
            return WhatsAppStaffQueries.Text(language, "Unsupported price command.", "Arahan harga tidak disokong.");
        if (intent.Argument.StartsWith("confirm ", StringComparison.OrdinalIgnoreCase))
            return await ConfirmAsync(db, intent.Argument[8..], language, now, bindingId, staffUserId, options, ct);
        return await PreviewAsync(db, intent.Argument, language, now, bindingId, requestId, options, ct);
    }

    private static async Task<string> PreviewAsync(AppDbContext db, string argument, string language, long now, Guid bindingId, Guid? requestId, WhatsAppAssistantOptions options, CancellationToken ct)
    {
        if (!TryParsePreview(argument, out var plate, out var proposed))
            return WhatsAppStaffQueries.Text(language, "Use: price <plate> <new asking price>. Example: price ABC1234 50000",
                "Guna: price <plat> <harga jualan baru>. Contoh: price ABC1234 50000");

        if (await WhatsAppStaffBindings.ResolveAsync(db, options, bindingId, now, ct) is not { } identity || !identity.Roles.Contains("BossAdmin"))
            return WhatsAppStaffQueries.Text(language, "Your Boss/Admin WhatsApp connection is no longer valid.", "Sambungan WhatsApp Boss/Admin anda tidak lagi sah.");
        var vehicles = await db.Vehicles.AsNoTracking()
            .Where(vehicle => vehicle.PlateNumber.ToUpper().Replace(" ", "").Replace("-", "") == plate)
            .Take(2).ToListAsync(ct);
        if (vehicles.Count == 0)
            return WhatsAppStaffQueries.Text(language, "No matching vehicle.", "Tiada kenderaan yang sepadan.");
        if (vehicles.Count > 1)
            return WhatsAppStaffQueries.Text(language, "Multiple vehicles match. Use a more specific plate.", "Beberapa kenderaan sepadan. Guna plat yang lebih khusus.");

        var vehicle = vehicles[0];
        var key = requestId is { } id && id != Guid.Empty
            ? $"request:{id:N}"
            : $"preview:{bindingId:N}:{vehicle.Id:N}:{vehicle.SellingPrice.ToString(CultureInfo.InvariantCulture)}:{proposed.ToString(CultureInfo.InvariantCulture)}";
        var existing = await db.WhatsAppPriceUpdateDrafts.AsNoTracking().SingleOrDefaultAsync(item => item.IdempotencyKey == key, ct);
        if (existing is { State: "Confirmed" })
            return WhatsAppStaffQueries.Text(language, $"This request was already applied to {existing.PlateNumber}: {Money(existing.ProposedSellingPrice)}.",
                $"Permintaan ini sudah dibuat untuk {existing.PlateNumber}: {Money(existing.ProposedSellingPrice)}.");
        if (existing is not null && existing.ExpiresAt > now)
            return PreviewText(existing, language);
        if (existing is not null)
            return WhatsAppStaffQueries.Text(language, "This price preview expired. Send the price command again.", "Pratonton harga ini sudah tamat. Hantar arahan price sekali lagi.");

        var draft = new WhatsAppPriceUpdateDraft
        {
            IdempotencyKey = key,
            BindingId = bindingId,
            VehicleId = vehicle.Id,
            PlateNumber = vehicle.PlateNumber,
            OriginalSellingPrice = vehicle.SellingPrice,
            ProposedSellingPrice = proposed,
            CreatedAt = now,
            ExpiresAt = now + PreviewLifetimeSeconds
        };
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        db.WhatsAppPriceUpdateDrafts.Add(draft);
        try
        {
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
        }
        catch (DbUpdateException exception) when (FinanceApi.IsUniqueViolation(exception))
        {
            await transaction.RollbackAsync(ct);
            var concurrent = await db.WhatsAppPriceUpdateDrafts.AsNoTracking().SingleOrDefaultAsync(item => item.IdempotencyKey == key, ct);
            if (concurrent is null)
                return WhatsAppStaffQueries.Text(language, "The preview was not saved. Try again.", "Pratonton tidak dapat disimpan. Cuba lagi.");
            if (concurrent.State == "Confirmed")
                return WhatsAppStaffQueries.Text(language, $"This request was already applied to {concurrent.PlateNumber}: {Money(concurrent.ProposedSellingPrice)}.",
                    $"Permintaan ini sudah dibuat untuk {concurrent.PlateNumber}: {Money(concurrent.ProposedSellingPrice)}.");
            return concurrent.ExpiresAt > now ? PreviewText(concurrent, language) :
                WhatsAppStaffQueries.Text(language, "This price preview expired. Send the price command again.", "Pratonton harga ini sudah tamat. Hantar arahan price sekali lagi.");
        }
        return PreviewText(draft, language);
    }

    private static async Task<string> ConfirmAsync(AppDbContext db, string argument, string language, long now, Guid bindingId, string staffUserId, WhatsAppAssistantOptions options, CancellationToken ct)
    {
        if (!TryParseConfirmation(argument, out var draftId))
            return WhatsAppStaffQueries.Text(language, "Use: price confirm <preview id>.", "Guna: price confirm <id pratonton>.");

        var confirmationStarted = System.Diagnostics.Stopwatch.GetTimestamp();
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        if (await WhatsAppStaffBindings.ResolveAsync(db, options, bindingId, now, ct) is not { } identity || !identity.Roles.Contains("BossAdmin") || identity.Binding.StaffUserId != staffUserId)
            return WhatsAppStaffQueries.Text(language, "Your Boss/Admin WhatsApp connection is no longer valid.", "Sambungan WhatsApp Boss/Admin anda tidak lagi sah.");
        var draftQuery = db.Database.IsNpgsql()
            ? db.WhatsAppPriceUpdateDrafts.FromSqlInterpolated($"SELECT * FROM \"WhatsAppPriceUpdateDrafts\" WHERE \"Id\" = {draftId} AND \"BindingId\" = {bindingId} FOR UPDATE")
            : db.WhatsAppPriceUpdateDrafts.Where(item => item.Id == draftId && item.BindingId == bindingId);
        var draft = await draftQuery.SingleOrDefaultAsync(ct);
        if (draft is null)
            return WhatsAppStaffQueries.Text(language, "This price preview was not found.", "Pratonton harga ini tidak dijumpai.");
        if (draft.State == "Confirmed")
            return WhatsAppStaffQueries.Text(language, $"Already updated {draft.PlateNumber} to {Money(draft.ProposedSellingPrice)}.",
                $"Sudah dikemas kini {draft.PlateNumber} kepada {Money(draft.ProposedSellingPrice)}.");
        if (draft.State != "Preview")
            return WhatsAppStaffQueries.Text(language, "This preview is no longer valid. Send the price command again.", "Pratonton ini tidak lagi sah. Hantar arahan price sekali lagi.");
        if (draft.ExpiresAt <= now)
        {
            db.Entry(draft).CurrentValues.SetValues(draft with { State = "Expired" });
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return WhatsAppStaffQueries.Text(language, "This preview expired. Send the price command again.", "Pratonton ini sudah tamat. Hantar arahan price sekali lagi.");
        }

        var vehicleQuery = db.Database.IsNpgsql()
            ? db.Vehicles.FromSqlInterpolated($"SELECT * FROM \"Vehicles\" WHERE \"Id\" = {draft.VehicleId} FOR UPDATE")
            : db.Vehicles.Where(item => item.Id == draft.VehicleId);
        var vehicle = await vehicleQuery.SingleOrDefaultAsync(ct);
        if (vehicle is null)
            return WhatsAppStaffQueries.Text(language, "The vehicle is no longer available.", "Kenderaan ini sudah tidak tersedia.");
        if (vehicle.SellingPrice != draft.OriginalSellingPrice)
        {
            db.Entry(draft).CurrentValues.SetValues(draft with { State = "Stale" });
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return WhatsAppStaffQueries.Text(language, "The asking price changed after this preview. Create a new preview.", "Harga jualan berubah selepas pratonton ini. Buat pratonton baru.");
        }
        if (await db.PaymentRecords.AsNoTracking().AnyAsync(payment => payment.VehicleId == vehicle.Id, ct))
            return WhatsAppStaffQueries.Text(language, "This vehicle has a finance record, so its asking price cannot be changed here.", "Kenderaan ini sudah ada rekod kewangan, jadi harga jualan tidak boleh diubah di sini.");

        // Locks can wait behind other transactions; revalidate identity after that wait.
        var mutationTime = now + (long)System.Diagnostics.Stopwatch.GetElapsedTime(confirmationStarted).TotalSeconds;
        if (draft.ExpiresAt <= mutationTime)
            return WhatsAppStaffQueries.Text(language, "This preview expired. Send the price command again.", "Pratonton ini sudah tamat. Hantar arahan price sekali lagi.");
        if (await WhatsAppStaffBindings.ResolveAsync(db, options, bindingId, mutationTime, ct) is not { } current ||
            !current.Roles.Contains("BossAdmin") || current.Binding.StaffUserId != staffUserId)
            return WhatsAppStaffQueries.Text(language, "Your Boss/Admin WhatsApp connection is no longer valid.", "Sambungan WhatsApp Boss/Admin anda tidak lagi sah.");
        var updated = vehicle with { SellingPrice = draft.ProposedSellingPrice };
        db.Entry(vehicle).CurrentValues.SetValues(updated);
        var actor = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, staffUserId)]));
        StockMovementAudit.AddChanges(db, vehicle, updated, actor, "WhatsApp Boss price update");
        ApiAudit.Add(db, staffUserId, "vehicle.sellingPriceUpdatedByWhatsApp", nameof(Vehicle), vehicle.Id);
        db.Entry(draft).CurrentValues.SetValues(draft with
        {
            State = "Confirmed",
            ConfirmedBy = staffUserId,
            ConfirmedByUserId = staffUserId,
            ConfirmedAt = now
        });
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return WhatsAppStaffQueries.Text(language, $"Updated {vehicle.PlateNumber}: {Money(draft.OriginalSellingPrice)} → {Money(draft.ProposedSellingPrice)}.",
            $"Dikemas kini {vehicle.PlateNumber}: {Money(draft.OriginalSellingPrice)} → {Money(draft.ProposedSellingPrice)}.");
    }

    private static string PreviewText(WhatsAppPriceUpdateDraft draft, string language) =>
        WhatsAppStaffQueries.Text(language,
            $"Price preview for {draft.PlateNumber}\nCurrent asking price: {Money(draft.OriginalSellingPrice)}\nNew asking price: {Money(draft.ProposedSellingPrice)}\nConfirm within 5 minutes: price confirm {draft.Id}",
            $"Pratonton harga {draft.PlateNumber}\nHarga jualan semasa: {Money(draft.OriginalSellingPrice)}\nHarga jualan baru: {Money(draft.ProposedSellingPrice)}\nSahkan dalam 5 minit: price confirm {draft.Id}");

    private static string Money(decimal value) => $"RM {value:N2}";
}
