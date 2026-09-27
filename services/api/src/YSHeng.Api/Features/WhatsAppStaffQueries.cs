using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record WhatsAppStaffIntent(string Name, string Argument = "");

public static class WhatsAppStaffQueries
{
    public static WhatsAppStaffIntent? Parse(string text)
    {
        text = text.Trim();
        if (text.Length is 0 or > 120 || text.Any(char.IsControl)) return null;
        var parts = text.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries);
        var name = parts[0].ToLowerInvariant();
        var argument = parts.Length == 2 ? parts[1].Trim() : "";
        if (name is "help" or "test" or "stop" or "berhenti") return argument.Length == 0 ? new(name == "berhenti" ? "stop" : name) : null;
        if (name == "link") return Regex.IsMatch(argument, @"\A[A-Fa-f0-9]{32}\z") ? new(name, argument.ToUpperInvariant()) : null;
        if (name == "language") return argument.ToLowerInvariant() switch { "en" => new(name, "en_US"), "ms" => new(name, "ms"), _ => null };
        if (name == "stock") return argument.Length <= 80 ? new(name, argument) : null;
        if (name == "deliveries") return argument.ToLowerInvariant() switch { "today" => new(name, "today"), "next7" or "next 7" => new(name, "next 7"), _ => null };
        if (name is "vehicle" or "loan" or "delivery" or "collections" or "settlement")
        {
            var plate = argument.ToUpperInvariant().Replace(" ", "").Replace("-", "");
            return Regex.IsMatch(plate, @"\A[A-Z0-9]{1,20}\z") ? new(name, plate) : null;
        }
        if (name is "profit" or "dashboard") return argument.ToLowerInvariant() is "today" or "month" ? new(name, argument.ToLowerInvariant()) : null;
        return null;
    }

    public static bool Permitted(WhatsAppStaffIntent intent, IReadOnlyCollection<string> roles) =>
        roles.Any(SeedData.Roles.Contains) && (intent.Name switch
        {
            "collections" or "settlement" => roles.Contains("Finance") || roles.Contains("BossAdmin"),
            "profit" or "dashboard" => roles.Contains("BossAdmin"),
            _ => true
        });

    public static string Text(string language, string english, string malay) => language == "ms" ? malay : english;
    private static string Clean(string value)
    {
        var cleaned = Regex.Replace(value, @"[\p{C}\s]+", " ").Trim();
        return cleaned[..Math.Min(80, cleaned.Length)];
    }
    private static string Label(WhatsAppVehicleSummary vehicle) => $"{Clean(vehicle.Plate)} | {vehicle.Year} {Clean(vehicle.Make)} {Clean(vehicle.Model)}";
    private static string Status(string value, string language) => language == "ms" ? value switch
    {
        "Available" => "Tersedia", "LoanProcessing" => "Pinjaman dalam proses", "Sold" => "Dijual",
        "Draft" => "Draf", "Pending" => "Menunggu", "Approved" => "Diluluskan", "Rejected" => "Ditolak", "Done" => "Selesai",
        "BookingInspection" => "Pemeriksaan dirancang", "Scheduled" => "Dijadualkan", "Inspection" => "Pemeriksaan",
        "PreparingDocuments" => "Penyediaan dokumen", "CarPreparation" => "Penyediaan kenderaan",
        "ReadyForRelease" => "Sedia untuk penyerahan", "Released" => "Diserahkan", "Cancelled" => "Dibatalkan",
        _ => value
    } : Regex.Replace(value, "([a-z])([A-Z])", "$1 $2");

    public static async Task<string> ReplyAsync(AppDbContext db, WhatsAppStaffIntent intent, string language, long now, CancellationToken ct = default)
    {
        var bm = language == "ms";
        var culture = CultureInfo.GetCultureInfo(bm ? "ms-MY" : "en-MY");
        if (intent.Name == "linked") return Text(language, "WhatsApp connected. Send help to see available commands.", "WhatsApp disambungkan. Hantar help untuk melihat arahan yang tersedia.");
        if (intent.Name == "test") return Text(language, "YS Heng staff connection is working.", "Sambungan kakitangan YS Heng berfungsi.");
        if (intent.Name == "language") return Text(language, "Assistant language set to English.", "Bahasa pembantu ditetapkan kepada Bahasa Malaysia.");
        if (intent.Name == "help") return Text(language,
            "YS Heng staff commands\nhelp - Show this menu\nstock [search] - Public stock\nvehicle <plate> - Vehicle status\nloan <plate> - Loan progress\ndelivery <plate> - Delivery date and status\ndeliveries today / deliveries next 7 - Upcoming handovers\nlanguage en / language ms - Change language\ntest - Check connection\nstop - Disconnect WhatsApp\n\nQueries are read-only. Finance queries are not yet available.",
            "Arahan kakitangan YS Heng\nhelp - Paparkan menu\nstock [carian] - Stok awam\nvehicle <plat> - Status kenderaan\nloan <plat> - Kemajuan pinjaman\ndelivery <plat> - Tarikh dan status penyerahan\ndeliveries today / deliveries next 7 - Jadual penyerahan\nlanguage en / language ms - Tukar bahasa\ntest - Semak sambungan\nstop - Putuskan sambungan WhatsApp\n\nPertanyaan baca sahaja. Pertanyaan kewangan belum tersedia.");
        if (intent.Name is "collections" or "settlement" or "profit" or "dashboard")
            return Text(language, "This finance query is not available yet.", "Pertanyaan kewangan ini belum tersedia.");
        var vehicles = db.Vehicles.AsNoTracking();
        if (intent.Name == "stock")
        {
            var search = intent.Argument.ToUpperInvariant();
            var available = vehicles.Where(item => item.BossConfirmed && item.IsPublic && item.Status == VehicleStatus.Available);
            if (search.Length > 0) available = available.Where(item => item.PlateNumber.ToUpper().Contains(search) || item.Make.ToUpper().Contains(search) || item.Model.ToUpper().Contains(search));
            var rows = await available.OrderBy(item => item.PlateNumber).Take(5).Select(item => new WhatsAppVehicleSummary(item.Id, item.PlateNumber, item.Year, item.Make, item.Model, item.Status)).ToListAsync(ct);
            return rows.Count == 0 ? Text(language, "No matching public stock.", "Tiada stok awam yang sepadan.") :
                Text(language, "Public stock (up to 5):", "Stok awam (sehingga 5):") + "\n" + string.Join("\n", rows.Select(Label));
        }
        if (intent.Name == "deliveries")
        {
            var today = BusinessClock.SingaporeDate(DateTimeOffset.FromUnixTimeSeconds(now));
            var end = intent.Argument == "today" ? today : today.AddDays(6);
            var query = db.DeliverySchedules.AsNoTracking().Where(item => item.ScheduledDate >= today && item.ScheduledDate <= end &&
                item.Status != DeliveryStatus.BookingInspection && item.Status != DeliveryStatus.Cancelled && item.Status != DeliveryStatus.Released);
            var summaries = query.Join(vehicles, delivery => delivery.VehicleId, vehicle => vehicle.Id, (delivery, vehicle) => new
                { delivery.Id, vehicle.PlateNumber, delivery.ScheduledDate, delivery.ScheduledTime, delivery.Status });
            var count = await summaries.CountAsync(ct);
            var rows = await summaries.OrderBy(item => item.ScheduledDate).ThenBy(item => item.ScheduledTime).ThenBy(item => item.Id).Take(5).ToListAsync(ct);
            if (rows.Count == 0) return Text(language, "No scheduled handovers in this period.", "Tiada penyerahan dijadualkan dalam tempoh ini.");
            return Text(language, $"Scheduled handovers ({rows.Count} of {count}, Malaysia time):", $"Penyerahan dijadualkan ({rows.Count} daripada {count}, waktu Malaysia):") + "\n" +
                string.Join("\n", rows.Select(item => $"{Clean(item.PlateNumber)} | {item.ScheduledDate.ToString("dd MMM yyyy", culture)} | {item.ScheduledTime?.ToString("HH:mm", culture) ?? Text(language, "Time not set", "Masa belum ditetapkan")} | {Status(item.Status.ToString(), language)}"));
        }
        var matches = await vehicles.Where(item => item.PlateNumber.ToUpper().Replace(" ", "").Replace("-", "") == intent.Argument).Take(2)
            .Select(item => new WhatsAppVehicleSummary(item.Id, item.PlateNumber, item.Year, item.Make, item.Model, item.Status)).ToListAsync(ct);
        if (matches.Count == 0) return Text(language, "No matching vehicle.", "Tiada kenderaan yang sepadan.");
        if (matches.Count > 1) return Text(language, "Multiple vehicles match. Check the vehicle workboard.", "Beberapa kenderaan sepadan. Semak papan kerja kenderaan.");
        var found = matches[0];
        var heading = Label(found) + "\n";
        if (intent.Name == "vehicle") return heading + "Status: " + Status(found.Status.ToString(), language);
        if (intent.Name == "loan")
        {
            var loans = await db.LoanApplications.AsNoTracking().Where(item => item.VehicleId == found.Id).Take(2)
                .Select(item => new { item.Status, item.SubmittedAt }).ToListAsync(ct);
            if (loans.Count == 0) return heading + Text(language, "No loan record.", "Tiada rekod pinjaman.");
            if (loans.Count > 1) return heading + Text(language, "Multiple loan records. Check the loan workboard.", "Beberapa rekod pinjaman. Semak papan kerja pinjaman.");
            return heading + "Status: " + Status(loans[0].Status.ToString(), language) + (loans[0].SubmittedAt is { } date
                ? "\n" + Text(language, "Submitted: ", "Dihantar: ") + date.ToString("dd MMM yyyy", culture) : "");
        }
        if (intent.Name == "delivery")
        {
            var schedules = await db.DeliverySchedules.AsNoTracking().Where(item => item.VehicleId == found.Id)
                .Select(item => new WhatsAppDeliverySummary(item.ScheduledDate, item.ScheduledTime, item.Status, item.ReleasedAt)).ToListAsync(ct);
            return heading + FormatDelivery(schedules, language);
        }
        return Text(language, "Unsupported query. Send help.", "Pertanyaan tidak disokong. Hantar help.");
    }

    public static string FormatDelivery(IReadOnlyList<WhatsAppDeliverySummary> rows, string language)
    {
        var active = rows.Where(item => item.Status is not (DeliveryStatus.Cancelled or DeliveryStatus.Released)).ToArray();
        var released = rows.Where(item => item.Status == DeliveryStatus.Released).ToArray();
        if (active.Length > 1 || active.Length == 0 && released.Length > 1)
            return Text(language, "Multiple delivery records. Check the delivery workboard.", "Beberapa rekod penyerahan. Semak papan kerja penyerahan.");
        var row = active.SingleOrDefault() ?? released.SingleOrDefault();
        if (row is null) return rows.Count == 0 ? Text(language, "Delivery date not set.", "Tarikh penyerahan belum ditetapkan.") :
            Text(language, "No active delivery. Previous plan cancelled.", "Tiada penyerahan aktif. Pelan terdahulu dibatalkan.");
        var culture = CultureInfo.GetCultureInfo(language == "ms" ? "ms-MY" : "en-MY");
        if (row.Status == DeliveryStatus.Released)
            return row.ReleasedAt is { } actual ? Text(language, "Released on: ", "Diserahkan pada: ") +
                new DateTimeOffset(DateTime.SpecifyKind(actual, DateTimeKind.Utc)).ToOffset(TimeSpan.FromHours(8)).ToString("dd MMM yyyy HH:mm", culture) + Text(language, " (Malaysia time)", " (waktu Malaysia)") :
                Text(language, "Status: Released; actual release time not recorded.", "Status: Diserahkan; masa penyerahan sebenar tidak direkodkan.");
        var status = "Status: " + Status(row.Status.ToString(), language);
        if (row.ScheduledDate == default) return status + "\n" + Text(language, "Delivery date not set.", "Tarikh penyerahan belum ditetapkan.");
        var label = row.Status == DeliveryStatus.BookingInspection ? Text(language, "Planned date: ", "Tarikh dirancang: ") : Text(language, "Scheduled date: ", "Tarikh dijadualkan: ");
        return status + "\n" + label + row.ScheduledDate.ToString("dd MMM yyyy", culture) + "\n" +
            (row.ScheduledTime is { } time ? Text(language, "Time: ", "Masa: ") + time.ToString("HH:mm", culture) + Text(language, " (Malaysia time)", " (waktu Malaysia)") : Text(language, "Time not set.", "Masa belum ditetapkan."));
    }
}

public sealed record WhatsAppVehicleSummary(Guid Id, string Plate, int Year, string Make, string Model, VehicleStatus Status);
public sealed record WhatsAppDeliverySummary(DateOnly ScheduledDate, TimeOnly? ScheduledTime, DeliveryStatus Status, DateTime? ReleasedAt);
