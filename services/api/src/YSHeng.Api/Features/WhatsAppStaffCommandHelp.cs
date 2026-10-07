namespace YSHeng.Api.Features;

public sealed record WhatsAppStaffService(string Name, string Group, string MalayGroup, string Purpose, string MalayPurpose,
    string Syntax, string MalaySyntax, string Example, string? Advanced = null, string? MalayAdvanced = null);

public static class WhatsAppStaffCommandHelp
{
    // IDs are fixed names without plates, secrets or staff data.
    public const string SelectionPrefix = "service:";
    public static readonly IReadOnlyList<WhatsAppStaffService> Services =
    [
        new("stock", "Vehicles", "Kenderaan", "Find available public stock", "Cari stok awam yang tersedia", "stock [words] [under amount] [page N]", "stock [kata] [under jumlah] [page N]", "stock Toyota Vios under 50000 page 1", "Use under 50000 for a maximum price; page 2 shows more.", "Gunakan under 50000 untuk had harga; page 2 memaparkan hasil seterusnya."),
        new("vehicle", "Vehicles", "Kenderaan", "Check vehicle status, price and location", "Semak status, harga dan lokasi kenderaan", "vehicle <plate>", "vehicle <plat>", "vehicle ABC1234"),
        new("share", "Vehicles", "Kenderaan", "Get public details and listing link to share", "Dapatkan butiran dan pautan awam untuk dikongsi", "share <plate>", "share <plat>", "share ABC1234"),
        new("loan", "Loans and delivery", "Pinjaman dan serahan", "Check loan progress and next action", "Semak kemajuan pinjaman dan tindakan seterusnya", "loan <plate>", "loan <plat>", "loan ABC1234"),
        new("delivery", "Loans and delivery", "Pinjaman dan serahan", "Check handover readiness and next action", "Semak persediaan serahan dan tindakan seterusnya", "delivery <plate>", "delivery <plat>", "delivery ABC1234"),
        new("deliveries", "Loans and delivery", "Pinjaman dan serahan", "See upcoming handovers", "Lihat serahan akan datang", "deliveries today | tomorrow | next 7 [page N]", "deliveries today | tomorrow | next 7 [page N]", "deliveries tomorrow page 1", "Use today, tomorrow, or next 7; page 2 shows more.", "Gunakan today, tomorrow, atau next 7; page 2 memaparkan hasil seterusnya."),
        new("collections", "Finance", "Kewangan", "Check customer collections", "Semak kutipan pelanggan", "collections <plate>", "collections <plat>", "collections ABC1234"),
        new("settlement", "Finance", "Kewangan", "Check seller settlement", "Semak penyelesaian penjual", "settlement <plate>", "settlement <plat>", "settlement ABC1234"),
        new("profit", "Management", "Pengurusan", "See sold-vehicle margin", "Lihat margin kenderaan dijual", "profit [period]", "profit [tempoh]", "profit month", "Periods: today, month, pastmonth, YYYY-MM, or YYYY-MM-DD YYYY-MM-DD.", "Tempoh: today, month, pastmonth, YYYY-MM, atau YYYY-MM-DD YYYY-MM-DD."),
        new("dashboard", "Management", "Pengurusan", "See margin and current balances", "Lihat margin dan baki semasa", "dashboard [period]", "dashboard [tempoh]", "dashboard 2026-10-01 2026-10-07", "Periods: today, month, pastmonth, YYYY-MM, or YYYY-MM-DD YYYY-MM-DD.", "Tempoh: today, month, pastmonth, YYYY-MM, atau YYYY-MM-DD YYYY-MM-DD.")
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
        var lines = new List<string>
        {
            bm ? $"YS Heng · {allowed.Count} pertanyaan tersedia" : $"YS Heng · {allowed.Count} available enquiries",
            bm ? "Hantar arahan lengkap di bawah. Taip menu untuk pilih perkhidmatan." : "Send a complete command below. Type menu to choose a service."
        };
        foreach (var group in allowed.GroupBy(service => service.Group))
        {
            lines.Add("");
            lines.Add(bm ? group.First().MalayGroup : group.Key);
            foreach (var service in group)
            {
                lines.Add($"• {service.Name} — {(bm ? service.MalayPurpose : service.Purpose)}");
                lines.Add($"  {(bm ? "Contoh" : "Example")}: {service.Example}");
            }
        }
        lines.Add("");
        lines.Add(bm ? "Lain-lain: help (panduan), menu (pilihan), language en / language ms (bahasa), test (sambungan), stop (putuskan)." :
            "Utilities: help (guide), menu (services), language en / language ms (language), test (connection), stop (disconnect).");
        if (roles.Contains("BossAdmin") || roles.Contains("Sales"))
            lines.Add(roles.Contains("BossAdmin")
                ? (bm ? "Urusan tertunggak: due [page N] — semua urusan semasa termasuk yang lewat. Contoh: due page 1."
                    : "Due items: due [page N] — all current and overdue items. Example: due page 1.")
                : (bm ? "Urusan tertunggak: due [page N] — serahan kenderaan anda sahaja termasuk yang lewat. Contoh: due page 1."
                    : "Due items: due [page N] — only your assigned handovers, including overdue. Example: due page 1."));
        lines.Add(bm ? "Pertanyaan ini baca sahaja." : "These enquiries are read-only.");
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
            return WhatsAppStaffQueries.Text(language, "Try: due page 1. Send help for all commands.",
                "Cuba: due page 1. Hantar help untuk semua arahan.");
        var example = command switch { "language" => "language en", "stop" => "stop", _ => "help" };
        return WhatsAppStaffQueries.Text(language,
            "Command not recognised or unavailable. Try: " + example + ".",
            "Arahan tidak dikenali atau tidak tersedia. Cuba: " + example + ".");
    }
}
