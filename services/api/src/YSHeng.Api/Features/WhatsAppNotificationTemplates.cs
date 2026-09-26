namespace YSHeng.Api.Features;

// Draft wording for previews. This catalog does not assert Meta approval.
public static class WhatsAppNotificationTemplates
{
    public static string Language(string? language) => language switch
    {
        null or "" or "ms" => "ms",
        "en" or "en_US" => "en_US",
        _ => throw new ArgumentException("Only Bahasa Malaysia and English are supported.")
    };

    public static string Render(string template, string? language, string reference)
    {
        if (string.IsNullOrWhiteSpace(reference) || reference.Length > 80 || reference.Any(char.IsControl))
            throw new ArgumentException("A bounded business reference is required.");
        var english = Language(language) == "en_US";
        var body = (template, english) switch
        {
            ("enquiry_ack_v1", false) => $"Terima kasih kerana menghubungi YS Heng. Pertanyaan anda {reference} telah diterima. Pasukan kami akan menghubungi anda.",
            ("enquiry_ack_v1", true) => $"Thank you for contacting YS Heng. We have received your enquiry {reference}. Our team will contact you.",
            ("business_update_v1", false) => $"YS Heng: Terdapat kemas kini untuk rujukan {reference}. Sila hubungi pasukan kami untuk maklumat lanjut.",
            ("business_update_v1", true) => $"YS Heng: There is an update for reference {reference}. Please contact our team for details.",
            ("receipt_ready_v1", false) => $"YS Heng: Resit rasmi {reference} telah tersedia. Sila hubungi pasukan kami untuk mendapatkannya.",
            ("receipt_ready_v1", true) => $"YS Heng: Official receipt {reference} is ready. Please contact our team to obtain it.",
            _ => throw new ArgumentException("Unknown notification template.")
        };
        return body + (english ? " Reply STOP to stop notifications." : " Balas STOP untuk berhenti menerima pemberitahuan.");
    }
}
