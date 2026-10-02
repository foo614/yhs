using System.Globalization;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class WhatsAppStaffProgressQueries
{
    private static string T(string language, string english, string malay) => WhatsAppStaffQueries.Text(language, english, malay);

    public static async Task<string> ReplyLoanAsync(AppDbContext db, Guid vehicleId, string language, CancellationToken ct)
    {
        var buyer = await db.Vehicles.Where(item => item.Id == vehicleId).Select(item => item.CustomerId).SingleAsync(ct);
        if (buyer is null)
            return T(language, "Current buyer not confirmed. Next: ask Sales to confirm the buyer before checking loan progress.", "Pembeli semasa belum disahkan. Seterusnya: minta Sales mengesahkan pembeli sebelum menyemak pinjaman.");
        var loans = await db.LoanApplications.AsNoTracking().Where(item => item.VehicleId == vehicleId && item.CustomerId == buyer).ToListAsync(ct);
        if (loans.Count == 0)
            return T(language, "No loan record for the current buyer. Next: confirm with Sales whether this is a cash sale or a loan application is needed.", "Tiada rekod pinjaman untuk pembeli semasa. Seterusnya: sahkan dengan Sales sama ada jualan tunai atau permohonan pinjaman diperlukan.");
        // Rejected attempts are history when exactly one non-rejected application remains for this buyer.
        var active = loans.Where(item => item.Status != LoanStatus.Rejected).ToArray();
        if (active.Length > 1 || active.Length == 0 && loans.Count > 1)
            return T(language, "Multiple loan records for the current buyer. Next: ask the Loan team to identify the current application.", "Beberapa rekod pinjaman untuk pembeli semasa. Seterusnya: minta pasukan Loan mengenal pasti permohonan semasa.");
        var loan = active.SingleOrDefault() ?? loans.Single();
        var status = loan.Status switch
        {
            LoanStatus.Draft => T(language, "Draft", "Draf"),
            LoanStatus.Pending => T(language, "Pending", "Menunggu"),
            LoanStatus.Approved => T(language, "Approved", "Diluluskan"),
            LoanStatus.Rejected => T(language, "Rejected", "Ditolak"),
            LoanStatus.Done => T(language, "Done", "Selesai"),
            _ => T(language, "Check with Loan team", "Semak dengan pasukan Loan")
        };
        var reply = "Status: " + status;
        if (loan.SubmittedAt is { } submitted)
            reply += "\n" + T(language, "Submitted: ", "Dihantar: ") + submitted.ToString("dd MMM yyyy", CultureInfo.GetCultureInfo(language == "ms" ? "ms-MY" : "en-MY"));
        if (loan.Status == LoanStatus.Rejected)
            return reply + "\n" + T(language, "Next: contact the Loan team to review alternatives with the buyer.", "Seterusnya: hubungi pasukan Loan untuk menyemak pilihan bersama pembeli.");
        if (loan.Status == LoanStatus.Done)
            return reply + "\n" + T(language, "Next: coordinate the handover date with Delivery. Loan completion is not release approval.", "Seterusnya: selaraskan tarikh penyerahan dengan Delivery. Pinjaman selesai bukan kelulusan pelepasan.");

        var documents = await db.DocumentBlobs.AsNoTracking().Where(item => item.VehicleId == vehicleId &&
                (item.LoanApplicationId == loan.Id || item.LoanApplicationId == null && item.CustomerId == buyer))
            .Select(item => new DocumentBlob { VehicleId = item.VehicleId, CustomerId = item.CustomerId,
                LoanApplicationId = item.LoanApplicationId, Category = item.Category }).ToListAsync(ct);
        var check = LoanDocumentRules.CheckCompleteness(loan, documents);
        if (!check.IsComplete)
            reply += "\n" + T(language, "Missing checklist documents: ", "Dokumen senarai semak belum lengkap: ") + string.Join(", ", check.MissingCategories.Select(item => Category(item, language)));
        var next = loan.Status switch
        {
            LoanStatus.Draft => T(language, "Next: Loan team to prepare and submit the application.", "Seterusnya: pasukan Loan menyediakan dan menghantar permohonan."),
            LoanStatus.Pending => T(language, "Next: Loan team to follow up on the application decision.", "Seterusnya: pasukan Loan membuat susulan keputusan permohonan."),
            _ when !check.IsComplete => T(language, "Next: Loan team to complete the document checklist.", "Seterusnya: pasukan Loan melengkapkan senarai semak dokumen."),
            _ when !loan.LouApproved || !loan.LouDone => T(language, "Next: Loan team to complete the LOU steps.", "Seterusnya: pasukan Loan melengkapkan langkah LOU."),
            _ => T(language, "Next: Loan team to confirm completion in the workboard.", "Seterusnya: pasukan Loan mengesahkan penyelesaian dalam papan kerja.")
        };
        return reply + "\n" + next;
    }

    public static async Task<string> ReplyDeliveryAsync(AppDbContext db, Guid vehicleId, string language, long now, CancellationToken ct)
    {
        var rows = await db.DeliverySchedules.AsNoTracking().Where(item => item.VehicleId == vehicleId).ToListAsync(ct);
        var summary = WhatsAppStaffQueries.FormatDelivery(rows.Select(item => new WhatsAppDeliverySummary(item.ScheduledDate, item.ScheduledTime, item.Status, item.ReleasedAt)).ToArray(), language);
        var active = rows.Where(item => item.Status is not (DeliveryStatus.Cancelled or DeliveryStatus.Released)).ToArray();
        if (active.Length != 1) return summary;
        var delivery = active[0];
        var buyer = await db.Vehicles.Where(item => item.Id == vehicleId).Select(item => item.CustomerId).SingleAsync(ct);
        if (buyer is null || buyer != delivery.CustomerId)
            return summary + "\n" + T(language, "Preparation not confirmed: current buyer needs checking by Delivery. Do not promise release.", "Persediaan belum disahkan: pembeli semasa perlu disemak oleh Delivery. Jangan janjikan pelepasan.");
        var documents = await db.DocumentBlobs.AsNoTracking().Where(item => item.VehicleId == vehicleId && item.DeliveryScheduleId == delivery.Id && item.CustomerId == buyer)
            .Select(item => new DocumentBlob { VehicleId = item.VehicleId, CustomerId = item.CustomerId,
                DeliveryScheduleId = item.DeliveryScheduleId, Category = item.Category }).ToListAsync(ct);
        return summary + "\n" + Preparation(delivery, documents, BusinessClock.SingaporeDate(DateTimeOffset.FromUnixTimeSeconds(now)), language);
    }

    public static string Preparation(DeliverySchedule delivery, IEnumerable<DocumentBlob> documents, DateOnly today, string language)
    {
        var blockers = new List<string>();
        void Missing(bool done, string english, string malay) { if (!done) blockers.Add(T(language, english, malay)); }
        Missing(delivery.ScheduledDate != default, "delivery date", "tarikh penyerahan");
        Missing(delivery.InspectionDone, "inspection", "pemeriksaan");
        Missing(delivery.DocumentsPrepared, "document preparation", "penyediaan dokumen");
        Missing(delivery.PolishDone, "polish", "gilap");
        Missing(delivery.TintedDone, "tinting", "tinted");
        Missing(delivery.WashDone, "wash", "cuci");
        Missing(delivery.InsuranceHandled, "insurance processing", "urusan insurans");
        Missing(delivery.RoadTaxHandled, "road tax processing", "urusan cukai jalan");
        Missing(delivery.TwoDayNoticeSent, "two-day notice", "notis dua hari");
        Missing(delivery.CustomerAcknowledged, "customer acknowledgement", "pengesahan pelanggan");
        Missing(delivery.FinalChecklistConfirmed, "final checklist", "senarai semak akhir");
        var documentsCheck = DeliveryDocumentRules.CheckCompleteness(delivery, documents);
        if (!documentsCheck.IsComplete)
            blockers.Add(T(language, "missing uploads: ", "muat naik belum lengkap: ") + string.Join(", ", documentsCheck.MissingCategories.Select(item => Category(item, language))));
        if (DeliveryRules.ExpiredDeliveryDocuments(delivery, today).Count > 0)
            blockers.Add(T(language, "insurance/road tax validity needs checking", "kesahan insurans/cukai jalan perlu disemak"));
        var ready = delivery.ScheduledDate != default && DeliveryRules.IsReadyForRelease(delivery, today) && documentsCheck.IsComplete;
        var result = ready
            ? T(language, "Preparation checklist complete.", "Senarai semak persediaan lengkap.")
            : T(language, "Preparation incomplete: ", "Persediaan belum lengkap: ") + string.Join("; ", blockers) + ".";
        return result + "\n" + T(language, "Next: Delivery team must confirm final release authorization in the workboard. This query does not approve release.", "Seterusnya: pasukan Delivery mesti mengesahkan kebenaran pelepasan akhir dalam papan kerja. Pertanyaan ini tidak meluluskan pelepasan.");
    }

    private static string Category(FileCategory category, string language) => category switch
    {
        FileCategory.StatusReceipt => T(language, "status receipt", "resit status"),
        FileCategory.Voc => "VOC", FileCategory.ApDocument => T(language, "AP document", "dokumen AP"),
        FileCategory.LoanDocument => T(language, "loan document", "dokumen pinjaman"),
        FileCategory.DeliveryDocument => T(language, "delivery document", "dokumen penyerahan"),
        FileCategory.InspectionReport => T(language, "inspection report", "laporan pemeriksaan"),
        FileCategory.HandoverPhoto => T(language, "handover photo", "foto penyerahan"),
        FileCategory.SignedHandover => T(language, "signed handover", "penyerahan bertandatangan"),
        FileCategory.Policy => T(language, "insurance policy", "polisi insurans"),
        FileCategory.RoadTaxReceipt => T(language, "road tax receipt", "resit cukai jalan"),
        _ => T(language, "required document", "dokumen diperlukan")
    };
}
