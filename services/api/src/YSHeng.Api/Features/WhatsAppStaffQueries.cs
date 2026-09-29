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
        if (name is "help" or "menu" or "test" or "stop" or "berhenti")
            return argument.Length == 0 ? new(name is "menu" or "help" ? "help" : name == "berhenti" ? "stop" : name) : null;
        if (name == "link") return Regex.IsMatch(argument, @"\A[A-Fa-f0-9]{32}\z") ? new(name, argument.ToUpperInvariant()) : null;
        if (name == "language") return argument.ToLowerInvariant() switch { "en" => new(name, "en_US"), "ms" => new(name, "ms"), _ => null };
        if (name == "stock") return WhatsAppStaffSalesQueries.TryParseStock(argument, out var stock) ? new(name, stock.CommandArgument) : null;
        if (name == "deliveries") return WhatsAppStaffSalesQueries.TryParseDeliveries(argument, out var deliveries) ? new(name, deliveries.CommandArgument) : null;
        if (name is "vehicle" or "share" or "loan" or "delivery" or "collections" or "settlement")
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
    private static string Clean(string value) => WhatsAppStaffSalesQueries.Clean(value);
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

    public static async Task<string> ReplyAsync(AppDbContext db, WhatsAppStaffIntent intent, string language, long now,
        CancellationToken ct = default, string? publicSiteUrl = null)
    {
        var bm = language == "ms";
        var culture = CultureInfo.GetCultureInfo(bm ? "ms-MY" : "en-MY");
        if (intent.Name == "linked") return Text(language, "WhatsApp connected. Send help to see available commands.", "WhatsApp disambungkan. Hantar help untuk melihat arahan yang tersedia.");
        if (intent.Name == "test") return Text(language, "YS Heng staff connection is working.", "Sambungan kakitangan YS Heng berfungsi.");
        if (intent.Name == "language") return Text(language, "Assistant language set to English.", "Bahasa pembantu ditetapkan kepada Bahasa Malaysia.");
        if (intent.Name == "help") return Text(language,
            "YS Heng staff commands\nhelp / menu - Show this menu\nstock [words] [under 50000] [page N] - Public stock\nvehicle <plate> - Status, asking price and stock location\nshare <plate> - Share-safe vehicle details\nloan <plate> - Loan progress and next action\ndelivery <plate> - Delivery readiness and next action\ndeliveries today / tomorrow / next 7 [page N] - Upcoming handovers\nlanguage en / language ms - Change language\ntest - Check connection\nstop - Disconnect WhatsApp\n\nExamples: stock Toyota Vios under 50000 page 1; share ABC1234; deliveries tomorrow page 1\nThe under amount is inclusive. Queries are read-only. Finance queries are not available here.",
            "Arahan kakitangan YS Heng\nhelp / menu - Paparkan menu\nstock [kata carian] [under 50000] [page N] - Stok awam\nvehicle <plat> - Status, harga jualan dan lokasi stok\nshare <plat> - Butiran kenderaan selamat untuk dikongsi\nloan <plat> - Kemajuan pinjaman dan tindakan seterusnya\ndelivery <plat> - Persediaan penyerahan dan tindakan seterusnya\ndeliveries today / tomorrow / next 7 [page N] - Jadual penyerahan\nlanguage en / language ms - Tukar bahasa\ntest - Semak sambungan\nstop - Putuskan sambungan WhatsApp\n\nContoh: stock Toyota Vios under 50000 page 1; share ABC1234; deliveries tomorrow page 1\nJumlah under adalah inklusif. Pertanyaan baca sahaja. Pertanyaan kewangan tidak tersedia di sini.");
        if (intent.Name is "collections" or "settlement" or "profit" or "dashboard")
            return Text(language, "This finance query is not available yet.", "Pertanyaan kewangan ini belum tersedia.");
        var vehicles = db.Vehicles.AsNoTracking();
        if (intent.Name == "stock")
        {
            if (!WhatsAppStaffSalesQueries.TryParseStock(intent.Argument, out var filter))
                return Text(language, "Unsupported stock query. Send help.", "Pertanyaan stok tidak disokong. Hantar help.");
            var available = vehicles.Where(item => item.BossConfirmed && item.IsPublic && item.Status == VehicleStatus.Available);
            var filtered = WhatsAppStaffSalesQueries.ApplyStockFilter(available, filter);
            var count = await filtered.CountAsync(ct);
            var rows = await filtered.OrderBy(item => item.PlateNumber).ThenBy(item => item.Id)
                .Skip((filter.Page - 1) * WhatsAppStockFilter.PageSize).Take(WhatsAppStockFilter.PageSize)
                .Select(item => new WhatsAppVehicleSummary(item.Id, item.PlateNumber, item.Year, item.Make, item.Model, item.Status, item.SellingPrice, item.StockLocation))
                .ToListAsync(ct);
            if (rows.Count == 0)
                return count == 0 ? Text(language, "No matching public stock.", "Tiada stok awam yang sepadan.") :
                    Text(language, $"No public stock on page {filter.Page}. There are {count} matching vehicles.", $"Tiada stok awam pada halaman {filter.Page}. Terdapat {count} kenderaan yang sepadan.");
            var first = (filter.Page - 1) * WhatsAppStockFilter.PageSize + 1;
            var last = first + rows.Count - 1;
            var reply = Text(language, $"Public stock ({first}-{last} of {count}):", $"Stok awam ({first}-{last} daripada {count}):") + "\n" +
                string.Join("\n", rows.Select(item => StockLabel(item, language)));
            if (last < count)
                reply += filter.Page < 1000
                    ? "\n" + Text(language, "Next: ", "Seterusnya: ") + "stock " + new WhatsAppStockFilter(filter.Search, filter.MaximumPrice, filter.Page + 1).CommandArgument
                    : "\n" + Text(language, "More matches remain; narrow the search.", "Masih ada padanan; kecilkan carian.");
            return reply;
        }
        if (intent.Name == "deliveries")
        {
            if (!WhatsAppStaffSalesQueries.TryParseDeliveries(intent.Argument, out var filter))
                return Text(language, "Unsupported deliveries query. Send help.", "Pertanyaan penyerahan tidak disokong. Hantar help.");
            var today = BusinessClock.SingaporeDate(DateTimeOffset.FromUnixTimeSeconds(now));
            var end = filter.Period switch
            {
                "today" => today,
                "tomorrow" => today.AddDays(1),
                _ => today.AddDays(6)
            };
            var start = filter.Period == "tomorrow" ? today.AddDays(1) : today;
            var query = db.DeliverySchedules.AsNoTracking().Where(item => item.ScheduledDate >= start && item.ScheduledDate <= end &&
                item.Status != DeliveryStatus.BookingInspection && item.Status != DeliveryStatus.Cancelled && item.Status != DeliveryStatus.Released);
            var summaries = query.Join(vehicles, delivery => delivery.VehicleId, vehicle => vehicle.Id, (delivery, vehicle) => new
                { delivery.Id, vehicle.PlateNumber, delivery.ScheduledDate, delivery.ScheduledTime, delivery.Status });
            var count = await summaries.CountAsync(ct);
            var rows = await summaries.OrderBy(item => item.ScheduledDate).ThenBy(item => item.ScheduledTime).ThenBy(item => item.Id)
                .Skip((filter.Page - 1) * WhatsAppDeliveryFilter.PageSize).Take(WhatsAppDeliveryFilter.PageSize).ToListAsync(ct);
            if (rows.Count == 0)
                return count == 0 ? Text(language, "No scheduled handovers in this period.", "Tiada penyerahan dijadualkan dalam tempoh ini.") :
                    Text(language, $"No handovers on page {filter.Page}. There are {count} matching handovers.", $"Tiada penyerahan pada halaman {filter.Page}. Terdapat {count} penyerahan yang sepadan.");
            var first = (filter.Page - 1) * WhatsAppDeliveryFilter.PageSize + 1;
            var last = first + rows.Count - 1;
            var reply = Text(language, $"Scheduled handovers ({first}-{last} of {count}, Malaysia time):", $"Penyerahan dijadualkan ({first}-{last} daripada {count}, waktu Malaysia):") + "\n" +
                string.Join("\n", rows.Select(item => $"{Clean(item.PlateNumber)} | {item.ScheduledDate.ToString("dd MMM yyyy", culture)} | {item.ScheduledTime?.ToString("HH:mm", culture) ?? Text(language, "Time not set", "Masa belum ditetapkan")} | {Status(item.Status.ToString(), language)}"));
            if (last < count)
                reply += filter.Page < 1000
                    ? "\n" + Text(language, "Next: ", "Seterusnya: ") + "deliveries " + new WhatsAppDeliveryFilter(filter.Period, filter.Page + 1).CommandArgument
                    : "\n" + Text(language, "More handovers remain; narrow the period.", "Masih ada penyerahan; kecilkan tempoh.");
            return reply;
        }
        if (intent.Name == "share")
        {
            var shared = await vehicles.Where(item => item.BossConfirmed && item.IsPublic && item.Status == VehicleStatus.Available &&
                    item.PlateNumber.ToUpper().Replace(" ", "").Replace("-", "") == intent.Argument)
                .Select(item => new WhatsAppPublicVehicleSummary(item.Id, item.PlateNumber, item.Year, item.Make, item.Model, item.SellingPrice))
                .Take(2).ToListAsync(ct);
            if (shared.Count == 0) return Text(language, "No matching public vehicle.", "Tiada kenderaan awam yang sepadan.");
            if (shared.Count > 1) return Text(language, "Multiple public vehicles match. Check the vehicle workboard.", "Beberapa kenderaan awam sepadan. Semak papan kerja kenderaan.");
            var vehicle = shared[0];
            var listing = WhatsAppStaffSalesQueries.TryBuildPublicListingUrl(publicSiteUrl, vehicle.Id, out var url)
                ? Text(language, "Public listing: ", "Senarai awam: ") + url
                : Text(language, "Public listing link is unavailable.", "Pautan senarai awam tidak tersedia.");
            return Text(language, "Share-ready vehicle\n", "Kenderaan sedia untuk dikongsi\n") +
                $"{Clean(vehicle.Plate)} | {vehicle.Year} {Clean(vehicle.Make)} {Clean(vehicle.Model)}\n" +
                Text(language, "Asking price: ", "Harga jualan: ") + WhatsAppStaffSalesQueries.Price(vehicle.SellingPrice, language) + "\n" + listing;
        }
        var matches = await vehicles.Where(item => item.PlateNumber.ToUpper().Replace(" ", "").Replace("-", "") == intent.Argument).Take(2)
            .Select(item => new WhatsAppVehicleSummary(item.Id, item.PlateNumber, item.Year, item.Make, item.Model, item.Status, item.SellingPrice, item.StockLocation)).ToListAsync(ct);
        if (matches.Count == 0) return Text(language, "No matching vehicle.", "Tiada kenderaan yang sepadan.");
        if (matches.Count > 1) return Text(language, "Multiple vehicles match. Check the vehicle workboard.", "Beberapa kenderaan sepadan. Semak papan kerja kenderaan.");
        var found = matches[0];
        var heading = Label(found) + "\n";
        if (intent.Name == "vehicle") return heading + "Status: " + Status(found.Status.ToString(), language) + "\n" +
            Text(language, "Asking price: ", "Harga jualan: ") + WhatsAppStaffSalesQueries.Price(found.SellingPrice, language) + "\n" +
            Text(language, "Stock location: ", "Lokasi stok: ") + WhatsAppStaffSalesQueries.Location(found.StockLocation, language);
        if (intent.Name == "loan")
            return heading + await WhatsAppStaffProgressQueries.ReplyLoanAsync(db, found.Id, language, ct);
        if (intent.Name == "delivery")
            return heading + await WhatsAppStaffProgressQueries.ReplyDeliveryAsync(db, found.Id, language, now, ct);
        return Text(language, "Unsupported query. Send help.", "Pertanyaan tidak disokong. Hantar help.");
    }

    private static string StockLabel(WhatsAppVehicleSummary vehicle, string language) =>
        $"{Clean(vehicle.Plate)} | {vehicle.Year} {Clean(vehicle.Make)} {Clean(vehicle.Model)} | " +
        Text(language, "Asking price: ", "Harga jualan: ") + WhatsAppStaffSalesQueries.Price(vehicle.SellingPrice, language);

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

public sealed record WhatsAppVehicleSummary(Guid Id, string Plate, int Year, string Make, string Model, VehicleStatus Status, decimal SellingPrice = 0, string StockLocation = "");
public sealed record WhatsAppPublicVehicleSummary(Guid Id, string Plate, int Year, string Make, string Model, decimal SellingPrice);
public sealed record WhatsAppDeliverySummary(DateOnly ScheduledDate, TimeOnly? ScheduledTime, DeliveryStatus Status, DateTime? ReleasedAt);
