using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record RepairReviewRow(Guid Id, Guid? RepairId, Guid? SupplierInvoiceId, Guid VehicleId, string PlateNumber, string? InvoiceNumber, string? SupplierName, DateOnly? ReceiptDate, decimal Amount, string Status, bool NeedsReview = false);
public sealed record RepairPaymentRequest(DateOnly PaidAt, decimal ExpectedAmount);
public sealed record RepairInvoiceCorrectionResult(bool IsValid, bool AmountChangeAllowed, IReadOnlyList<ValidationError> Errors)
{
    public string? ErrorMessage => Errors.FirstOrDefault()?.Message;
}

public static class RepairReviewRules
{
    public static RepairInvoiceCorrectionResult ValidatePendingInvoiceCorrection(
        RepairJob repair,
        SupplierInvoice existing,
        SupplierInvoice incoming,
        RepairReceipt receipt,
        IReadOnlyList<RepairReceiptItem> receiptItems,
        IReadOnlyList<SupplierInvoice> linkedInvoices)
    {
        var errors = new List<ValidationError>();
        var amountChanged = existing.Amount != incoming.Amount;

        if (repair.ApprovalStatus != RepairApprovalStatus.Pending)
            errors.Add(new ValidationError("repair_correction_pending_only", "Only a pending repair that needs review can be corrected."));
        if (existing.PaidAt.HasValue || incoming.PaidAt != existing.PaidAt)
            errors.Add(new ValidationError("repair_correction_paid", "Paid repair receipts cannot be corrected."));
        if (existing.VehicleId != incoming.VehicleId || incoming.VehicleId != repair.VehicleId)
            errors.Add(new ValidationError("repair_correction_vehicle_mismatch", "The correction must keep the linked vehicle."));
        if (existing.CreatedAt != incoming.CreatedAt)
            errors.Add(new ValidationError("repair_correction_stale", "This receipt changed while you were editing it. Reload before correcting it."));
        if (receipt.RepairJobId != repair.Id ||
            !Same(receipt.InvoiceNumber, existing.InvoiceNumber) ||
            !Same(receipt.SupplierName, existing.SupplierName))
            errors.Add(new ValidationError("repair_correction_link_mismatch", "The correction must preserve the saved receipt link."));

        var itemTotal = receiptItems.Sum(item => item.Amount);
        if (amountChanged)
        {
            var newLinkedTotal = linkedInvoices.Sum(invoice => invoice.Id == existing.Id ? incoming.Amount : invoice.Amount);
            if (!receipt.TotalAmount.HasValue || itemTotal != receipt.TotalAmount.Value || incoming.Amount != receipt.TotalAmount.Value || repair.Cost != newLinkedTotal)
            {
                errors.Add(new ValidationError("repair_correction_amount_review", "Amount corrections must go through receipt review so the receipt items and repair total remain consistent."));
            }
        }

        return new RepairInvoiceCorrectionResult(errors.Count == 0, amountChanged && errors.Count == 0, errors);
    }

    public static IReadOnlyList<RepairReviewRow> Build(IReadOnlyList<RepairJob> repairs, IReadOnlyList<SupplierInvoice> invoices, IReadOnlyList<RepairReceipt> receipts, IReadOnlyList<Vehicle> vehicles)
    {
        var rows = new List<RepairReviewRow>();
        var linkedRepairs = new HashSet<Guid>();
        var links = invoices.ToDictionary(invoice => invoice.Id, invoice =>
        {
            var matches = receipts.Where(receipt => Same(receipt.InvoiceNumber, invoice.InvoiceNumber) && Same(receipt.SupplierName, invoice.SupplierName)
                && repairs.Any(repair => repair.Id == receipt.RepairJobId && repair.VehicleId == invoice.VehicleId)).ToList();
            var uniqueInvoice = invoices.Count(other => other.VehicleId == invoice.VehicleId && Same(other.InvoiceNumber, invoice.InvoiceNumber) && Same(other.SupplierName, invoice.SupplierName)) == 1;
            return matches.Count == 1 && uniqueInvoice ? matches[0] : null;
        });
        foreach (var invoice in invoices)
        {
            var receipt = links[invoice.Id];
            var repair = receipt is null ? null : repairs.First(item => item.Id == receipt.RepairJobId);
            var linkedTotal = repair is null ? 0m : invoices.Where(item => links[item.Id]?.RepairJobId == repair.Id).Sum(item => item.Amount);
            var needsReview = repair is null || receipt!.TotalAmount != invoice.Amount || repair.Cost != linkedTotal;
            if (repair is not null) linkedRepairs.Add(repair.Id);
            var status = invoice.PaidAt.HasValue ? "Paid" : repair?.ApprovalStatus == RepairApprovalStatus.Rejected ? "Rejected" : repair?.ApprovalStatus == RepairApprovalStatus.Approved ? "Approved" : "Submitted";
            rows.Add(new(invoice.Id, repair?.Id, invoice.Id, invoice.VehicleId, vehicles.FirstOrDefault(vehicle => vehicle.Id == invoice.VehicleId)?.PlateNumber ?? "", invoice.InvoiceNumber, invoice.SupplierName, invoice.InvoiceDate, invoice.Amount, status, needsReview));
        }
        foreach (var repair in repairs.Where(repair => !linkedRepairs.Contains(repair.Id)))
        {
            var receipt = receipts.FirstOrDefault(item => item.RepairJobId == repair.Id);
            rows.Add(new(repair.Id, repair.Id, null, repair.VehicleId, vehicles.FirstOrDefault(vehicle => vehicle.Id == repair.VehicleId)?.PlateNumber ?? "", receipt?.InvoiceNumber, receipt?.SupplierName, null, repair.Cost, repair.ApprovalStatus == RepairApprovalStatus.Rejected ? "Rejected" : repair.ApprovalStatus == RepairApprovalStatus.Approved ? "Approved" : "Submitted", true));
        }
        return rows;
    }

    public static bool HasPaidReceipt(RepairJob repair, IReadOnlyList<SupplierInvoice> invoices, IReadOnlyList<RepairReceipt> receipts) =>
        invoices.Any(invoice => invoice.VehicleId == repair.VehicleId && invoice.PaidAt.HasValue && receipts.Any(receipt => receipt.RepairJobId == repair.Id && Same(receipt.InvoiceNumber, invoice.InvoiceNumber) && Same(receipt.SupplierName, invoice.SupplierName)));

    public static bool HasRejectedReceipt(SupplierInvoice invoice, IReadOnlyList<RepairJob> repairs, IReadOnlyList<RepairReceipt> receipts) =>
        receipts.Any(receipt => Same(receipt.InvoiceNumber, invoice.InvoiceNumber) && Same(receipt.SupplierName, invoice.SupplierName) && repairs.Any(repair => repair.Id == receipt.RepairJobId && repair.VehicleId == invoice.VehicleId && repair.ApprovalStatus == RepairApprovalStatus.Rejected));

    private static bool Same(string? left, string? right) => !string.IsNullOrWhiteSpace(left) && !string.IsNullOrWhiteSpace(right)
        && string.Equals(string.Join(" ", left.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)), string.Join(" ", right.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)), StringComparison.OrdinalIgnoreCase);
}
