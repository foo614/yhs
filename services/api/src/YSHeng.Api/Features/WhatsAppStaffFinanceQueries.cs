using System.Globalization;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record WhatsAppFinancePeriod(DateOnly From, DateOnly To);

public static class WhatsAppStaffFinanceQueries
{
    public static async Task<string> ReplyAsync(
        AppDbContext db,
        WhatsAppStaffIntent intent,
        IReadOnlyCollection<string> roles,
        string language,
        long now,
        CancellationToken ct = default)
    {
        if (!WhatsAppStaffQueries.Permitted(intent, roles))
            return WhatsAppStaffQueries.Text(language, "Your role cannot access this query.", "Peranan anda tidak dibenarkan mengakses pertanyaan ini.");

        return intent.Name switch
        {
            "collections" => await CollectionsAsync(db, intent.Argument, language, now, ct),
            "settlement" => await SettlementAsync(db, intent.Argument, language, now, ct),
            "profit" or "dashboard" => await ProfitAsync(db, intent.Name == "dashboard", intent.Argument, language, now, ct),
            _ => WhatsAppStaffQueries.Text(language, "Unsupported finance query. Send help.", "Pertanyaan kewangan tidak disokong. Hantar help.")
        };
    }

    public static bool TryParsePeriod(string argument, DateOnly today, out WhatsAppFinancePeriod period)
    {
        period = new(today, today);
        var value = string.Join(' ', argument.Trim().ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));
        DateOnly from;
        DateOnly to;
        if (value == "today")
        {
            from = to = today;
        }
        else if (value is "" or "month")
        {
            from = new DateOnly(today.Year, today.Month, 1);
            to = today;
        }
        else if (value is "pastmonth" or "past month")
        {
            to = new DateOnly(today.Year, today.Month, 1).AddDays(-1);
            from = new DateOnly(to.Year, to.Month, 1);
        }
        else if (DateTime.TryParseExact(value, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out var month))
        {
            from = new DateOnly(month.Year, month.Month, 1);
            if (from > today) return false;
            to = from.Year == today.Year && from.Month == today.Month
                ? today
                : new DateOnly(from.Year, from.Month, DateTime.DaysInMonth(from.Year, from.Month));
        }
        else
        {
            var parts = value.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length != 2 ||
                !DateOnly.TryParseExact(parts[0], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out from) ||
                !DateOnly.TryParseExact(parts[1], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out to))
                return false;
        }

        if (from > to || to > today || to.DayNumber - from.DayNumber >= 366) return false;
        period = new(from, to);
        return true;
    }

    private static async Task<string> CollectionsAsync(AppDbContext db, string plate, string language, long now, CancellationToken ct)
    {
        var vehicles = await ExactVehicles(db, plate, ct);
        if (vehicles.Count == 0) return Text(language, "No matching vehicle.", "Tiada kenderaan yang sepadan.");
        if (vehicles.Count > 1) return ReviewFinance(language, "Multiple vehicles match this plate.", "Beberapa kenderaan sepadan dengan plat ini.");
        var vehicle = vehicles[0];
        var payments = await db.PaymentRecords.AsNoTracking().Where(item => item.VehicleId == vehicle.Id).Select(item => new PaymentRecord
        {
            Id = item.Id, VehicleId = item.VehicleId, CustomerId = item.CustomerId, NettPrice = item.NettPrice,
            FinanceWorkflowVersion = item.FinanceWorkflowVersion, Status = item.Status
        }).ToListAsync(ct);
        var v2 = payments.Where(item => item.FinanceWorkflowVersion == 2).ToList();
        if (v2.Count > 1) return ReviewFinance(language, "Multiple Finance V2 receivables were found.", "Beberapa rekod belum terima Finance V2 ditemui.");
        if (v2.Count == 0)
        {
            if (payments.Count == 0) return Text(language,
                $"{Clean(vehicle.PlateNumber)} — Customer collections\nNo receivable recorded.",
                $"{Clean(vehicle.PlateNumber)} — Kutipan pelanggan\nTiada rekod belum terima.");
            if (payments.Count > 1) return ReviewFinance(language, "Multiple legacy finance records were found.", "Beberapa rekod kewangan lama ditemui.");
            var legacy = payments[0];
            return Text(language,
                $"{Clean(vehicle.PlateNumber)} — Customer collections\nLegacy record\nSaved amount: {Money(legacy.NettPrice)}\nSaved status: {Words(legacy.Status.ToString())}\nReconciled and outstanding amounts are unavailable for this legacy record.",
                $"{Clean(vehicle.PlateNumber)} — Kutipan pelanggan\nRekod lama\nAmaun disimpan: {Money(legacy.NettPrice)}\nStatus disimpan: {MalayStatus(legacy.Status.ToString())}\nAmaun diselaraskan dan tertunggak tidak tersedia untuk rekod lama ini.");
        }

        var payment = v2[0];
        var invoices = await db.FinanceInvoices.AsNoTracking().Where(item => item.PaymentRecordId == payment.Id).Select(item => new FinanceInvoice
        {
            Id = item.Id, PaymentRecordId = item.PaymentRecordId, VehicleId = item.VehicleId, CustomerId = item.CustomerId, Amount = item.Amount
        }).Take(2).ToListAsync(ct);
        if (invoices.Count != 1 || !FinanceV2Rules.ValidateCanonicalBuyer(payment, invoices.SingleOrDefault(), vehicle).IsValid || invoices[0].Amount != payment.NettPrice)
            return ReviewFinance(language, "The receivable, invoice and current buyer do not match.", "Rekod belum terima, invois dan pembeli semasa tidak sepadan.");
        var collections = await db.CollectionTransactions.AsNoTracking().Where(item => item.PaymentRecordId == payment.Id).Select(item => new CollectionTransaction
        {
            PaymentRecordId = item.PaymentRecordId, Amount = item.Amount, Status = item.Status
        }).ToListAsync(ct);
        var reconciled = FinanceV2Rules.CollectedAmount(collections);
        var pending = decimal.Round(collections.Where(item => item.Status == CollectionStatus.Pending).Sum(item => item.Amount), 2, MidpointRounding.AwayFromZero);
        var outstanding = FinanceV2Rules.Balance(payment, collections);
        var date = BusinessClock.SingaporeDate(DateTimeOffset.FromUnixTimeSeconds(now));
        return Text(language,
            $"{Clean(vehicle.PlateNumber)} — Customer collections\nReceivable: {Money(payment.NettPrice)}\nReconciled: {Money(reconciled)}\nOutstanding: {Money(outstanding)}\nPending collections: {Money(pending)} (not deducted)\nAs at {Date(date, language)}, Malaysia time",
            $"{Clean(vehicle.PlateNumber)} — Kutipan pelanggan\nBelum terima: {Money(payment.NettPrice)}\nDiselaraskan: {Money(reconciled)}\nTertunggak: {Money(outstanding)}\nKutipan menunggu: {Money(pending)} (belum ditolak)\nSetakat {Date(date, language)}, waktu Malaysia");
    }

    private static async Task<string> SettlementAsync(AppDbContext db, string plate, string language, long now, CancellationToken ct)
    {
        var vehicles = await ExactVehicles(db, plate, ct);
        if (vehicles.Count == 0) return Text(language, "No matching vehicle.", "Tiada kenderaan yang sepadan.");
        if (vehicles.Count > 1) return ReviewFinance(language, "Multiple vehicles match this plate.", "Beberapa kenderaan sepadan dengan plat ini.");
        var vehicle = vehicles[0];
        var settlements = await db.SettlementReminders.AsNoTracking().Where(item => item.VehicleId == vehicle.Id).Select(item => new SettlementReminder
        {
            VehicleId = item.VehicleId, OwnerId = item.OwnerId, Direction = item.Direction, PurchasePriceSnapshot = item.PurchasePriceSnapshot,
            BankDebtAmount = item.BankDebtAmount, Amount = item.Amount, Deadline = item.Deadline, IsPaid = item.IsPaid
        }).Take(2).ToListAsync(ct);
        if (settlements.Count == 0) return Text(language,
            $"{Clean(vehicle.PlateNumber)} — Seller settlement\nNo seller settlement recorded.",
            $"{Clean(vehicle.PlateNumber)} — Penyelesaian penjual\nTiada penyelesaian penjual direkodkan.");
        if (settlements.Count > 1) return ReviewFinance(language, "Multiple seller settlements were found.", "Beberapa penyelesaian penjual ditemui.");
        var settlement = settlements[0];
        var owners = settlement.OwnerId is { } ownerId
            ? await db.Owners.AsNoTracking().Where(item => item.Id == ownerId).Select(item => new Owner { Id = item.Id }).ToListAsync(ct)
            : [];
        if (!FinanceRules.ValidateSettlement(settlement, owners).IsValid)
            return ReviewFinance(language, "The saved seller-settlement snapshot is inconsistent.", "Snapshot penyelesaian penjual yang disimpan tidak konsisten.");
        var today = BusinessClock.SingaporeDate(DateTimeOffset.FromUnixTimeSeconds(now));
        var direction = settlement.Direction switch
        {
            SettlementDirection.LegacyPaySeller => Text(language, "Pay seller (legacy saved record)", "Bayar penjual (rekod lama disimpan)"),
            SettlementDirection.PaySeller => Text(language, "Pay seller", "Bayar penjual"),
            SettlementDirection.CollectFromSeller => Text(language, "Collect from seller", "Kutip daripada penjual"),
            SettlementDirection.InternalOffset => Text(language, "Internal offset", "Pelarasan dalaman"),
            _ => throw new InvalidOperationException("Settlement direction passed validation but is not supported.")
        };
        var status = settlement.IsPaid
            ? Text(language, "Marked completed", "Ditandakan selesai")
            : settlement.Deadline < today && SettlementRules.RequiresReminder(settlement)
                ? Text(language, "Overdue — outstanding", "Lewat — tertunggak")
                : Text(language, "Outstanding", "Tertunggak");
        return Text(language,
            $"{Clean(vehicle.PlateNumber)} — Seller settlement\nDirection: {direction}\nRecorded amount: {Money(settlement.Amount)}\nDeadline: {Date(settlement.Deadline, language)}\nStatus: {status}",
            $"{Clean(vehicle.PlateNumber)} — Penyelesaian penjual\nArah: {direction}\nAmaun direkodkan: {Money(settlement.Amount)}\nTarikh akhir: {Date(settlement.Deadline, language)}\nStatus: {status}");
    }

    private static async Task<string> ProfitAsync(AppDbContext db, bool dashboard, string argument, string language, long now, CancellationToken ct)
    {
        var today = BusinessClock.SingaporeDate(DateTimeOffset.FromUnixTimeSeconds(now));
        if (!TryParsePeriod(argument, today, out var period))
            return Text(language,
                "Invalid period. Use today, month, pastmonth, YYYY-MM, or two inclusive YYYY-MM-DD dates (maximum 366 days, no future dates).",
                "Tempoh tidak sah. Gunakan today, month, pastmonth, YYYY-MM, atau dua tarikh YYYY-MM-DD inklusif (maksimum 366 hari, tiada tarikh masa hadapan).");

        var vehicles = await db.Vehicles.AsNoTracking().Select(item => new Vehicle
        {
            Id = item.Id, PlateNumber = item.PlateNumber, Make = item.Make, Model = item.Model, Status = item.Status,
            PurchasePrice = item.PurchasePrice, ModifiedPurchasePrice = item.ModifiedPurchasePrice, SellingPrice = item.SellingPrice,
            AdditionalCharges = item.AdditionalCharges, RefurbishmentTotal = item.RefurbishmentTotal, CommissionTotal = item.CommissionTotal,
            OutstationPickupAllowance = item.OutstationPickupAllowance, IntakeDate = item.IntakeDate, SoldAt = item.SoldAt,
            CustomerId = item.CustomerId
        }).ToListAsync(ct);
        var repairs = await db.RepairJobs.AsNoTracking().Select(item => new RepairJob
        {
            VehicleId = item.VehicleId, Cost = item.Cost, ApprovalStatus = item.ApprovalStatus,
            ChecklistDone = item.ChecklistDone, ExpectedCompletionDate = item.ExpectedCompletionDate, CreatedAt = item.CreatedAt
        }).ToListAsync(ct);
        var commissions = await db.BrokerCommissions.AsNoTracking()
            .Select(item => new BrokerCommission { VehicleId = item.VehicleId, Amount = item.Amount }).ToListAsync(ct);
        var vouchers = await db.PaymentVouchers.AsNoTracking()
            .Select(item => new PaymentVoucher { VehicleId = item.VehicleId, Amount = item.Amount }).ToListAsync(ct);
        var summary = DashboardMetrics.Create(
            vehicles, [], [], [], [], repairs, [], commissions, vouchers, [], [], [], today, period.From, period.To, []);
        var range = Range(period, language);
        var reply = Text(language,
            $"Sold-vehicle margin — {range} (Malaysia)\nVehicles sold: {summary.TotalSales}\nMargin: {Money(summary.ActualProfit)}\nBased on recorded prices and costs; not cash profit.\nHistorical margins can change when recorded costs change.",
            $"Margin kenderaan dijual — {range} (Malaysia)\nKenderaan dijual: {summary.TotalSales}\nMargin: {Money(summary.ActualProfit)}\nBerdasarkan harga dan kos yang direkodkan; bukan untung tunai.\nMargin sejarah boleh berubah apabila kos direkodkan berubah.");
        if (!dashboard) return reply;

        var payments = await db.PaymentRecords.AsNoTracking().Select(item => new PaymentRecord
        {
            Id = item.Id, VehicleId = item.VehicleId, CustomerId = item.CustomerId, NettPrice = item.NettPrice,
            FinanceWorkflowVersion = item.FinanceWorkflowVersion, Status = item.Status
        }).ToListAsync(ct);
        var invoices = await db.FinanceInvoices.AsNoTracking().Select(item => new FinanceInvoice
        {
            Id = item.Id, PaymentRecordId = item.PaymentRecordId, VehicleId = item.VehicleId, CustomerId = item.CustomerId, Amount = item.Amount
        }).ToListAsync(ct);
        var collections = await db.CollectionTransactions.AsNoTracking().Select(item => new CollectionTransaction
        {
            PaymentRecordId = item.PaymentRecordId, Amount = item.Amount, Status = item.Status
        }).ToListAsync(ct);
        var settlements = await db.SettlementReminders.AsNoTracking().Select(item => new SettlementReminder
        {
            VehicleId = item.VehicleId, OwnerId = item.OwnerId, Direction = item.Direction, PurchasePriceSnapshot = item.PurchasePriceSnapshot,
            BankDebtAmount = item.BankDebtAmount, Amount = item.Amount, Deadline = item.Deadline, IsPaid = item.IsPaid
        }).ToListAsync(ct);
        var owners = await db.Owners.AsNoTracking().Select(item => new Owner { Id = item.Id }).ToListAsync(ct);
        var vehiclesById = vehicles.GroupBy(vehicle => vehicle.Id).ToDictionary(group => group.Key, group => group.ToList());
        var invoicesByPayment = invoices.GroupBy(invoice => invoice.PaymentRecordId).ToDictionary(group => group.Key, group => group.ToList());
        var validV2Payments = payments.Where(payment =>
        {
            var matchingInvoices = invoicesByPayment.GetValueOrDefault(payment.Id) ?? [];
            var matchingVehicles = vehiclesById.GetValueOrDefault(payment.VehicleId) ?? [];
            return payment.FinanceWorkflowVersion == 2 && matchingInvoices.Count == 1 && matchingVehicles.Count == 1 &&
                matchingInvoices[0].Amount == payment.NettPrice &&
                FinanceV2Rules.ValidateCanonicalBuyer(payment, matchingInvoices[0], matchingVehicles[0]).IsValid;
        }).ToList();
        var settlementGroups = settlements.GroupBy(item => item.VehicleId).ToList();
        var validSettlements = settlementGroups.Where(group => group.Count() == 1 && FinanceRules.ValidateSettlement(group.Single(), owners).IsValid).Select(group => group.Single()).ToList();
        var settlementReviewCount = settlementGroups.Count - validSettlements.Count;
        var reconciledByPayment = collections.GroupBy(item => item.PaymentRecordId).ToDictionary(group => group.Key, group => (IEnumerable<CollectionTransaction>)group);
        var receivables = validV2Payments.Sum(payment => FinanceV2Rules.Balance(payment, reconciledByPayment.GetValueOrDefault(payment.Id) ?? []));
        var sellerPayable = validSettlements.Where(item => !item.IsPaid && SettlementRules.IsPayable(item)).Sum(item => item.Amount);
        var sellerCollectable = validSettlements.Where(item => !item.IsPaid && item.Direction == SettlementDirection.CollectFromSeller).Sum(item => item.Amount);
        var reviewCount = payments.Count(item => item.FinanceWorkflowVersion != 2) + payments.Count(item => item.FinanceWorkflowVersion == 2 && !validV2Payments.Any(valid => valid.Id == item.Id));
        var partial = reviewCount > 0 || settlementReviewCount > 0;
        reply += Text(language,
            $"\n\n{(partial ? "Validated current balances (partial)" : "Validated current balances")}\nValidated Finance V2 customer receivables: {Money(receivables)}\nValidated seller settlements to pay: {Money(sellerPayable)}\nValidated seller settlements to collect: {Money(sellerCollectable)}",
            $"\n\n{(partial ? "Baki semasa disahkan (sebahagian)" : "Baki semasa disahkan")}\nBelum terima pelanggan Finance V2 yang disahkan: {Money(receivables)}\nPenyelesaian penjual disahkan untuk dibayar: {Money(sellerPayable)}\nPenyelesaian penjual disahkan untuk dikutip: {Money(sellerCollectable)}");
        if (partial)
            reply += Text(language,
                $"\nExcluded from these subtotals: {reviewCount} legacy or mismatched receivable record(s), {settlementReviewCount} ambiguous or inconsistent settlement vehicle(s). Review Finance in Back Office.",
                $"\nDikecualikan daripada jumlah kecil ini: {reviewCount} rekod belum terima lama atau tidak sepadan, {settlementReviewCount} kenderaan dengan penyelesaian kabur atau tidak konsisten. Semak Finance di Back Office.");
        return reply;
    }

    private static Task<List<Vehicle>> ExactVehicles(AppDbContext db, string plate, CancellationToken ct) =>
        db.Vehicles.AsNoTracking().Where(item => item.PlateNumber.ToUpper().Replace(" ", "").Replace("-", "") == plate)
            .Select(item => new Vehicle { Id = item.Id, PlateNumber = item.PlateNumber, Year = item.Year, Make = item.Make, Model = item.Model, CustomerId = item.CustomerId })
            .Take(2).ToListAsync(ct);

    private static string ReviewFinance(string language, string english, string malay) =>
        Text(language, english + " Review Finance in Back Office.", malay + " Semak Finance di Back Office.");

    private static string Text(string language, string english, string malay) => WhatsAppStaffQueries.Text(language, english, malay);
    private static string Clean(string value) => WhatsAppStaffSalesQueries.Clean(value);
    private static string Money(decimal value) => "RM " + value.ToString("N2", CultureInfo.GetCultureInfo("en-MY"));
    private static string Words(string value) => System.Text.RegularExpressions.Regex.Replace(value, "([a-z])([A-Z])", "$1 $2");
    private static string MalayStatus(string value) => value switch { "Pending" => "Menunggu", "Approved" => "Diluluskan", "Disbursed" => "Dikeluarkan", "Reconciled" => "Diselaraskan", _ => Words(value) };
    private static string Date(DateOnly date, string language) => date.ToString("d MMM yyyy", CultureInfo.GetCultureInfo(language == "ms" ? "ms-MY" : "en-MY"));
    private static string Range(WhatsAppFinancePeriod period, string language) => period.From == period.To
        ? Date(period.From, language)
        : $"{Date(period.From, language)}–{Date(period.To, language)}";
}
