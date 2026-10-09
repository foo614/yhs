namespace YSHeng.Api.Features;

public sealed record WhatsAppStaffService(string Name, string Group, string MalayGroup, string Purpose, string MalayPurpose,
    string Syntax, string MalaySyntax, string Example, string? Advanced = null, string? MalayAdvanced = null);

public static class WhatsAppStaffCommandHelp
{
    // IDs are fixed names without plates, secrets or staff data.
    public const string SelectionPrefix = "service:";
    public static readonly IReadOnlyList<WhatsAppStaffService> Services =
    [
        new("stock", "Vehicles", "Kenderaan", "Find cars for sale", "Cari kereta untuk dijual", "stock [words] [under amount] [page N]", "stock [kata] [under jumlah] [page N]", "stock Honda", "Add under 50000 for a maximum price; page 2 shows more.", "Tambah under 50000 untuk had harga; page 2 memaparkan hasil seterusnya."),
        new("vehicle", "Vehicles", "Kenderaan", "Check a car's status, price and location", "Semak status, harga dan lokasi kereta", "vehicle <plate>", "vehicle <plat>", "vehicle ABC1234"),
        new("share", "Vehicles", "Kenderaan", "Get a public listing to share", "Dapatkan iklan awam untuk dikongsi", "share <plate>", "share <plat>", "share ABC1234"),
        new("loan", "Loans and delivery", "Pinjaman dan serahan", "Check loan progress and the next step", "Semak kemajuan pinjaman dan langkah seterusnya", "loan <plate>", "loan <plat>", "loan ABC1234"),
        new("delivery", "Loans and delivery", "Pinjaman dan serahan", "Check if a car is ready for handover", "Semak sama ada kereta sedia untuk diserahkan", "delivery <plate>", "delivery <plat>", "delivery ABC1234"),
        new("deliveries", "Loans and delivery", "Pinjaman dan serahan", "View tomorrow's deliveries", "Lihat serahan esok", "deliveries today | tomorrow | next 7 [page N]", "deliveries today | tomorrow | next 7 [page N]", "deliveries tomorrow", "Use today, tomorrow, or next 7; page 2 shows more.", "Gunakan today, tomorrow, atau next 7; page 2 memaparkan hasil seterusnya."),
        new("collections", "Finance", "Kewangan", "Check customer payments still owed", "Semak bayaran pelanggan yang masih tertunggak", "collections <plate>", "collections <plat>", "collections ABC1234"),
        new("settlement", "Finance", "Kewangan", "Check payment to or from a car seller", "Semak bayaran kepada atau daripada penjual kereta", "settlement <plate>", "settlement <plat>", "settlement ABC1234"),
        new("profit", "Management", "Pengurusan", "See this month's sales margin", "Lihat margin jualan bulan ini", "profit [period]", "profit [tempoh]", "profit month", "Also use today, pastmonth, YYYY-MM, or two inclusive YYYY-MM-DD dates (start then end), for example profit 2026-09-01 2026-09-30. Recorded costs can change historical margin.", "Boleh juga guna today, pastmonth, YYYY-MM, atau dua tarikh YYYY-MM-DD inklusif (mula kemudian akhir), contohnya profit 2026-09-01 2026-09-30. Kos direkodkan boleh mengubah margin sejarah."),
        new("dashboard", "Management", "Pengurusan", "See this month's sales margin and current balances", "Lihat margin jualan bulan ini dan baki semasa", "dashboard [period]", "dashboard [tempoh]", "dashboard", "Defaults to month-to-date. Also use today, month, pastmonth, YYYY-MM, or two inclusive YYYY-MM-DD dates. Balances are current, not historical snapshots.", "Lalai kepada bulan semasa. Boleh juga guna today, month, pastmonth, YYYY-MM, atau dua tarikh YYYY-MM-DD inklusif. Baki adalah semasa, bukan gambaran sejarah.")
    ];

    public static IReadOnlyList<WhatsAppStaffService> Allowed(IReadOnlyCollection<string> roles) =>
        Services.Where(service => WhatsAppStaffQueries.Permitted(new(service.Name), roles)).ToArray();

    public static WhatsAppStaffIntent? ParseSelection(string? id)
    {
        if (id is null || !id.StartsWith(SelectionPrefix, StringComparison.Ordinal)) return null;
        var name = id[SelectionPrefix.Length..];
        return Services.Any(service => service.Name == name) ? new("service", name) : null;
    }

    public static string Guide(string language, IReadOnlyCollection<string> roles)
    {
        var allowed = Allowed(roles);
        var bm = language == "ms";
        var enquiryCount = allowed.Count + (roles.Contains("BossAdmin") || roles.Contains("Sales") ? 1 : 0);
        var lines = new List<string>
        {
            bm ? $"YS Heng · {enquiryCount} pertanyaan tersedia" : $"YS Heng · {enquiryCount} available enquiries",
            bm ? "Salin arahan selepas anak panah. Taip menu untuk pilih perkhidmatan." : "Copy the command after each arrow. Type menu to choose a service."
        };
        foreach (var group in allowed.GroupBy(service => service.Group))
        {
            lines.Add("");
            var icon = group.Key switch { "Vehicles" => "🚗", "Loans and delivery" => "📋", "Finance" => "💰", _ => "📊" };
            lines.Add(icon + " " + (bm ? group.First().MalayGroup : group.Key));
            foreach (var service in group)
            {
                lines.Add($"• {(bm ? service.MalayPurpose : service.Purpose)} → {service.Example}");
                if (service.Name == "profit")
                {
                    lines.Add(bm ? "• Margin jualan lalu → profit 2026-09-01 2026-09-30" :
                        "• Past sales margin → profit 2026-09-01 2026-09-30");
                    lines.Add(bm ? "  Tarikh: YYYY-MM-DD mula, kemudian YYYY-MM-DD akhir (inklusif)." :
                        "  Dates: YYYY-MM-DD start, then YYYY-MM-DD end (inclusive).");
                }
            }
        }
        lines.Add("");
        if (roles.Contains("BossAdmin") || roles.Contains("Sales"))
        {
            lines.Add(bm ? "⏰ Urusan perlu tindakan" : "⏰ Due work");
            lines.Add(roles.Contains("BossAdmin")
                ? (bm ? "• Lihat semua urusan semasa dan lewat → due" : "• See all current and overdue work → due")
                : (bm ? "• Lihat serahan anda yang perlu tindakan, termasuk yang lewat → due" : "• See your assigned handovers due, including overdue → due"));
            lines.Add("");
        }
        lines.Add(bm ? "🛠️ Lain-lain" : "🛠️ Other commands");
        lines.Add(bm ? "• Lihat panduan ini → help" : "• See this guide → help");
        lines.Add(bm ? "• Pilih daripada senarai → menu" : "• Choose from a list → menu");
        lines.Add(bm ? "• Pilih bahasa Inggeris → language en" : "• Change to English → language en");
        lines.Add(bm ? "• Pilih Bahasa Malaysia → language ms" : "• Change to Malay → language ms");
        lines.Add(bm ? "• Semak sambungan → test" : "• Check your connection → test");
        lines.Add(bm ? "• Putuskan akaun WhatsApp anda → stop" : "• Disconnect your WhatsApp account → stop");
        lines.Add(bm ? "Gantikan Honda dengan jenama/model, dan ABC1234 dengan plat kereta sebenar. Ikut arahan seterusnya jika ada lebih banyak hasil." :
            "Replace Honda with a make/model, and ABC1234 with a real plate. Follow the next command shown if there are more results.");
        lines.Add(bm ? "Hanya arahan yang dibenarkan untuk peranan anda dipaparkan. Pertanyaan ini baca sahaja." :
            "Only commands allowed for your staff role are shown. Enquiries are read-only.");
        return string.Join('\n', lines);
    }

    public static string ServiceGuide(string command, string language, IReadOnlyCollection<string> roles)
    {
        var service = Services.SingleOrDefault(item => item.Name == command);
        if (service is null || !WhatsAppStaffQueries.Permitted(new(command), roles))
            return WhatsAppStaffQueries.Text(language, "This service is unavailable. Send help for your current commands.", "Perkhidmatan ini tidak tersedia. Hantar help untuk arahan semasa anda.");
        var bm = language == "ms";
        var detail = bm ? service.MalayAdvanced : service.Advanced;
        return (bm ? service.MalayPurpose : service.Purpose) + "\n" +
            (bm ? "Cara guna: " + service.MalaySyntax : "Syntax: " + service.Syntax) + "\n" +
            (bm ? "Contoh: " : "Example: ") + service.Example +
            (detail is null ? "" : "\n" + detail);
    }

    // Keep only a fixed command name, never the message or a mistyped link secret.
    public static WhatsAppStaffIntent? RecoveryIntent(string text)
    {
        text = text.Trim();
        if (text.Length is 0 or > 120 || text.Any(char.IsControl)) return null;
        var name = text.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries)[0].ToLowerInvariant();
        var command = Services.Any(service => service.Name == name) || name is "language" or "link" or "stop" or "due" ? name : "";
        return new("usage", command);
    }

    public static string Reply(string command, string language, IReadOnlyCollection<string> roles)
    {
        var service = Services.SingleOrDefault(item => item.Name == command && WhatsAppStaffQueries.Permitted(new(item.Name), roles));
        if (service is not null)
            return WhatsAppStaffQueries.Text(language, "Complete command needed. Try: ", "Arahan lengkap diperlukan. Cuba: ") + service.Example +
                WhatsAppStaffQueries.Text(language, ". Send help for all commands.", ". Hantar help untuk semua arahan.");
        if (command == "link") return WhatsAppStaffQueries.Text(language,
            "Copy the complete link command from your staff WhatsApp settings. Send help for other commands.",
            "Salin arahan link penuh daripada tetapan WhatsApp kakitangan anda. Hantar help untuk arahan lain.");
        if (command == "due" && (roles.Contains("BossAdmin") || roles.Contains("Sales")))
            return WhatsAppStaffQueries.Text(language, "Try: due. Send help for all commands.",
                "Cuba: due. Hantar help untuk semua arahan.");
        var example = command switch { "language" => "language en", "stop" => "stop", _ => "help" };
        return WhatsAppStaffQueries.Text(language,
            "Command not recognised or unavailable. Try: " + example + ".",
            "Arahan tidak dikenali atau tidak tersedia. Cuba: " + example + ".");
    }
}
