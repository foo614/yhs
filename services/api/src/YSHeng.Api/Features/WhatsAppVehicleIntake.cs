using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Primitives;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class WhatsAppVehicleIntake
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public const string Template = "create-vehicle\nplate: BKC3003\nchassis: MMBXY12345678901\nengine: 4B11T123456\nmake: Honda\nmodel: Civic\nyear: 2020\nsource: YSHeng\nprice: 80000\nseller: Seller name\nphone: 0123456789\ntin: Seller TIN\nic: Seller IC";

    public static bool TryParse(string argument, out VehicleIntakeRequest? request)
    {
        request = null;
        if (argument.Length > 3000 || argument.Any(c => char.IsControl(c) && c is not '\r' and not '\n')) return false;
        var fields = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in argument.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var parts = line.Split(':', 2, StringSplitOptions.TrimEntries);
            if (parts.Length != 2 || !fields.TryAdd(parts[0], parts[1]) || parts[1].Length > 200) return false;
        }
        string[] required = ["plate", "chassis", "engine", "make", "model", "year", "source", "price", "seller", "phone", "tin"];
        if (required.Any(key => !fields.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value)) || fields.Keys.Any(key => !required.Contains(key.ToLowerInvariant()) && !key.Equals("ic", StringComparison.OrdinalIgnoreCase))) return false;
        if (!int.TryParse(fields["year"], out var year) || !Enum.TryParse<VehiclePurchaseSource>(fields["source"], true, out var source) || !Enum.IsDefined(source) || !Enum.GetNames<VehiclePurchaseSource>().Any(name => name.Equals(fields["source"], StringComparison.OrdinalIgnoreCase)) ||
            !decimal.TryParse(fields["price"], NumberStyles.Number, CultureInfo.InvariantCulture, out var price) || price <= 0 || price > 100_000_000m || decimal.Round(price, 2) != price) return false;
        var owner = new Owner { Name = fields["seller"], Phone = fields["phone"], TinNumber = fields["tin"], IcNumber = ContactRules.NormalizeIcNumber(fields.GetValueOrDefault("ic")) };
        var vehicle = new Vehicle { PlateNumber = VehicleRules.NormalizeMalaysiaPlate(fields["plate"]), ChassisNumber = fields["chassis"].Trim(), EngineNumber = fields["engine"].Trim(), Make = fields["make"], Model = fields["model"], Year = year,
            PurchaseSource = source, StockOwner = source == VehiclePurchaseSource.KSA ? StockOwner.KS : StockOwner.YSHeng,
            SellingPrice = price, OwnerId = owner.Id };
        if (!VehicleRules.ValidateCreate(vehicle).IsValid || !VehicleIntakeOwnerRules.Validate(vehicle, owner, [], requireIc: source == VehiclePurchaseSource.YSHeng).IsValid) return false;
        request = new(vehicle, null, owner);
        return true;
    }

    public static async Task<string> ReplyAsync(AppDbContext db, string argument, Guid bindingId, Guid requestId,
        WhatsAppAssistantOptions options, long now, CancellationToken ct)
    {
        await using var transaction = await WhatsAppStaffBindings.LockAsync(db, ct);
        now = Math.Max(now, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        var identity = await WhatsAppStaffBindings.ResolveAsync(db, options, bindingId, now, ct);
        if (identity is null || !identity.Value.Roles.Contains("BossAdmin")) return "Only the currently linked Boss/Admin can create vehicles.";
        // Expired drafts retain their reference but not copies of private documents or seller details.
        await db.WhatsAppVehicleIntakeDrafts.Where(d => d.BindingId == bindingId && d.State == "Draft" && d.ExpiresAt <= now)
            .ExecuteUpdateAsync(set => set.SetProperty(d => d.State, "Expired").SetProperty(d => d.PayloadJson, "")
                .SetProperty(d => d.VocContent, (byte[]?)null).SetProperty(d => d.IcContent, (byte[]?)null), ct);
        if (argument.StartsWith("confirm ", StringComparison.OrdinalIgnoreCase) && Guid.TryParse(argument[8..], out var token))
        {
            var draft = await db.WhatsAppVehicleIntakeDrafts.SingleOrDefaultAsync(d => d.BindingId == bindingId && d.ConfirmationToken == token, ct);
            if (draft is null) return "Confirmation not found for your account. Request a new preview.";
            if (draft.State == "Confirmed") return "This vehicle was already created. No duplicate was created.";
            if (draft.State != "Draft" || draft.ExpiresAt <= now || draft.ConfirmBefore <= now) return "Preview expired. Request a new preview.";
            var request = JsonSerializer.Deserialize<VehicleIntakeRequest>(draft.PayloadJson, Json)!;
            if (MissingFiles(draft, request) is { } missing) return missing;
            var context = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(
                new[] { new Claim(ClaimTypes.NameIdentifier, identity.Value.Binding.StaffUserId), new Claim(ClaimTypes.Name, identity.Value.Binding.StaffUserId), new Claim(ClaimTypes.Role, "BossAdmin") }, "WhatsApp")) };
            var files = new FormFileCollection();
            files.Add(File("voc", draft.VocContent!, draft.VocMime!));
            if (draft.IcContent is not null) files.Add(File("identityCard", draft.IcContent, draft.IcMime!));
            context.Request.ContentType = "multipart/form-data; boundary=whatsapp-intake";
            context.Request.Form = new FormCollection(new Dictionary<string, StringValues> { ["request"] = draft.PayloadJson }, files);
            var result = await VehicleIntake.CreateCoreAsync(context.Request, db, context, ct, () =>
            {
                draft.State = "Confirmed"; draft.ConfirmedAt = now;
                draft.VocContent = null; draft.IcContent = null;
                // The canonical owner and documents now belong to the intake transaction.
                draft.PayloadJson = "";
            });
            if (result is IStatusCodeHttpResult { StatusCode: 201 })
            {
                await transaction.CommitAsync(ct);
                return $"Vehicle {request.Vehicle.PlateNumber} created. VOC/IC saved with the vehicle. Purchase price can be completed in Back Office.";
            }
            return result is IValueHttpResult { Value: ValidationResult validation }
                ? "Not created: " + string.Join("; ", validation.Errors.Select(error => error.Message))
                : "Not created. Check the intake details in Back Office before trying again.";
        }
        if (argument.StartsWith("preview ", StringComparison.OrdinalIgnoreCase) && Guid.TryParse(argument[8..], out var id))
        {
            var draft = await db.WhatsAppVehicleIntakeDrafts.SingleOrDefaultAsync(d => d.Id == id && d.BindingId == bindingId, ct);
            if (draft is null || draft.State != "Draft" || draft.ExpiresAt <= now) return "Draft unavailable or expired. Send create-vehicle again.";
            var request = JsonSerializer.Deserialize<VehicleIntakeRequest>(draft.PayloadJson, Json)!;
            if (MissingFiles(draft, request) is { } missing) return missing;
            draft.ConfirmationToken = Guid.NewGuid(); draft.ConfirmBefore = now + 300;
            await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
            var owner = request.NewOwner ?? await db.Owners.AsNoTracking().SingleAsync(o => o.Id == request.Vehicle.OwnerId, ct);
            return $"Review {request.Vehicle.PlateNumber}: {request.Vehicle.Year} {request.Vehicle.Make} {request.Vehicle.Model}\nChassis: {request.Vehicle.ChassisNumber} | Engine: {request.Vehicle.EngineNumber}\nSource: {request.Vehicle.PurchaseSource}\nSelling price: RM {request.Vehicle.SellingPrice:N2}\nSeller: {owner.Name} | {owner.Phone}\nTIN: {owner.TinNumber} | IC: {owner.IcNumber}\nVOC received; IC {(draft.IcContent is null ? "not supplied (dealer)" : "received")}.\nConfirm within 5 minutes: create-vehicle confirm {draft.ConfirmationToken}";
        }
        if (!TryParse(argument, out var parsed)) return "Use the existing intake details:\n" + Template + "\nDealer IC is optional. Upload VOC and IC after receiving the draft reference.";
        var existing = await db.WhatsAppVehicleIntakeDrafts.AsNoTracking().SingleOrDefaultAsync(d => d.RequestId == requestId, ct);
        if (existing is not null) return existing.State == "Draft" && existing.ExpiresAt > now ? UploadText(existing.Id) : "This request was already handled. Send a fresh template for a new intake.";
        if (await db.Vehicles.AnyAsync(v => v.PlateNumber.ToUpper().Replace(" ", "").Replace("-", "") == parsed!.Vehicle.PlateNumber, ct)) return "This plate already exists. Open the existing vehicle in Back Office.";
        var selection = VehicleCatalogRules.FindActiveSelection(parsed!.Vehicle.Make, parsed.Vehicle.Model, await db.VehicleCatalogModels.AsNoTracking().ToListAsync(ct));
        if (!VehicleCatalogRules.ValidateSelection(selection).IsValid) return "Make/model does not match the active vehicle catalogue. Check the spelling in Back Office.";
        parsed = parsed with { Vehicle = VehicleCatalogRules.ApplyCanonicalSelection(parsed.Vehicle, selection!) };
        var ownerMatches = await db.Owners.AsNoTracking().Where(o => o.TinNumber == parsed.NewOwner!.TinNumber).ToListAsync(ct);
        if (ownerMatches.Count > 0)
        {
            var matching = ownerMatches.Where(o => o.Name == parsed.NewOwner!.Name && o.Phone == parsed.NewOwner.Phone && ContactRules.NormalizeIcNumber(o.IcNumber) == parsed.NewOwner.IcNumber).ToList();
            if (matching.Count != 1) return "Seller details differ from an existing TIN record. Check the owner in Back Office; existing owner details will not be overwritten.";
            parsed = parsed with { Vehicle = parsed.Vehicle with { OwnerId = matching[0].Id }, NewOwner = null };
        }
        var created = new WhatsAppVehicleIntakeDraft { BindingId = bindingId, RequestId = requestId, PayloadJson = JsonSerializer.Serialize(parsed, Json), ExpiresAt = now + 1800 };
        db.WhatsAppVehicleIntakeDrafts.Add(created);
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        return UploadText(created.Id);
    }

    public static async Task<string> StoreFileAsync(AppDbContext db, Guid bindingId, Guid draftId, string category,
        WhatsAppDownloadedMedia media, WhatsAppAssistantOptions options, long now, CancellationToken ct)
    {
        await using var transaction = await WhatsAppStaffBindings.LockAsync(db, ct);
        now = Math.Max(now, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        var identity = await WhatsAppStaffBindings.ResolveAsync(db, options, bindingId, now, ct);
        if (identity is null || !identity.Value.Roles.Contains("BossAdmin")) return "Your Boss/Admin connection is no longer valid.";
        var draft = await db.WhatsAppVehicleIntakeDrafts.SingleOrDefaultAsync(d => d.Id == draftId && d.BindingId == bindingId, ct);
        if (draft is null || draft.State != "Draft" || draft.ExpiresAt <= now) return "Draft unavailable or expired. File was not saved.";
        if (category is not ("VOC" or "IC")) return "Use a VOC or IC caption with the draft reference.";
        if (!UploadPolicy.IsAllowed(category == "VOC" ? FileCategory.Voc : FileCategory.IdentityCard, media.Content.Length)) return "Document must be at most 10 MB.";
        var validation = category == "VOC" ? UploadPolicy.ValidateVehicleIntakeVocContent(media.FileName, media.MimeType, media.Content)
            : UploadPolicy.ValidateOcrImageContent(media.FileName, media.MimeType, media.Content);
        if (!validation.Result.IsValid) return "File rejected: " + string.Join("; ", validation.Result.Errors.Select(e => e.Message));
        if (category == "VOC") { draft.VocContent = media.Content; draft.VocMime = validation.MimeType; }
        else { draft.IcContent = media.Content; draft.IcMime = validation.MimeType; }
        draft.ConfirmationToken = null; draft.ConfirmBefore = null;
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        return $"{category} saved to this draft. Review before creating: create-vehicle preview {draft.Id}";
    }

    private static string? MissingFiles(WhatsAppVehicleIntakeDraft draft, VehicleIntakeRequest request) => draft.VocContent is null ? "Upload VOC first." : request.Vehicle.PurchaseSource == VehiclePurchaseSource.YSHeng && draft.IcContent is null ? "Upload seller IC first. IC is optional only for dealer purchases." : null;
    private static string UploadText(Guid id) => $"Draft {id} saved for 30 minutes. No vehicle created yet.\nUpload VOC with caption: VOC {id}\nUpload IC with caption: IC {id} (optional for dealer)\nThen send: create-vehicle preview {id}";
    private static FormFile File(string name, byte[] content, string mime) => new(new MemoryStream(content), 0, content.Length, name, name + (mime == "application/pdf" ? ".pdf" : mime == "image/png" ? ".png" : ".jpg")) { Headers = new HeaderDictionary(), ContentType = mime };
}
