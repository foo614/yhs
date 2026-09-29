namespace YSHeng.Api.Features;

public static class WhatsAppStaffCommandHelp
{
    // Keep only a fixed command name, never the message or a possibly mistyped link secret.
    public static WhatsAppStaffIntent? RecoveryIntent(string text)
    {
        text = text.Trim();
        if (text.Length is 0 or > 120 || text.Any(char.IsControl)) return null;
        var name = text.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries)[0].ToLowerInvariant();
        var command = name is "stock" or "vehicle" or "share" or "loan" or "delivery" or "deliveries" or "collections" or "settlement" or "profit" or "dashboard" or "language" or "link" or "stop" ? name : "";
        return new("usage", command);
    }

    public static string Reply(string command, string language, IReadOnlyCollection<string> roles)
    {
        if (command is "collections" or "settlement" or "profit" or "dashboard" &&
            !WhatsAppStaffQueries.Permitted(new(command), roles)) command = "";
        var example = command switch
        {
            "stock" => "stock toyota vios under 50000 page 1",
            "vehicle" or "share" or "loan" or "delivery" or "collections" or "settlement" => command + " ABC1234",
            "profit" or "dashboard" => command + " month",
            "deliveries" => "deliveries tomorrow page 1",
            "language" => "language en / language ms",
            "stop" => "stop",
            _ => "help"
        };
        if (command == "link") return WhatsAppStaffQueries.Text(language,
            "Copy the complete link command from your staff WhatsApp settings. Send help for other commands.",
            "Salin arahan link penuh daripada tetapan WhatsApp kakitangan anda. Hantar help untuk arahan lain.");
        return WhatsAppStaffQueries.Text(language,
            "Command not recognised or incomplete. Try: " + example + ". Send help for examples.",
            "Arahan tidak dikenali atau tidak lengkap. Cuba: " + example + ". Hantar help untuk contoh.");
    }
}
