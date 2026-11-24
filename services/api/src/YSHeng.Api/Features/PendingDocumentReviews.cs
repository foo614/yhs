using System.Security.Claims;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record PendingDocumentReview(Guid JobId, Guid DocumentId, Guid VehicleId, string Plate,
    string FileName, FileCategory Category, DateTime CreatedAt, string Source, Guid RecordId, string Path);
public sealed record PendingDocumentReviewQueue(IReadOnlyList<PendingDocumentReview> Items);

public static class PendingDocumentReviews
{
    public static void MapPendingDocumentReviews(this RouteGroupBuilder routes)
    {
        routes.MapGet("/dashboard/document-reviews", async (AppDbContext db, HttpContext context, CancellationToken ct) =>
            Results.Ok(await ReadAsync(db, context.User, StaffIdentity.CurrentUserId(context), ct)))
            .RequireAuthorization("Dashboard");
        routes.MapGet("/dashboard/document-reviews/{jobId:guid}", async (Guid jobId, AppDbContext db, HttpContext context, CancellationToken ct) =>
        {
            var queue = await ReadAsync(db, context.User, StaffIdentity.CurrentUserId(context), ct);
            var item = queue.Items.FirstOrDefault(item => item.JobId == jobId);
            return item is null
                ? Results.Conflict(new ApiError("This document review is no longer available. Refresh the pending review list."))
                : Results.Ok(item);
        }).RequireAuthorization("Dashboard");
    }

    public static async Task<PendingDocumentReviewQueue> ReadAsync(AppDbContext db, ClaimsPrincipal user, string userId, CancellationToken ct)
    {
        var pending = await db.OcrJobs.AsNoTracking()
            .Where(job => job.Status == OcrJobStatus.NeedsReview && job.ReviewDecision == OcrReviewDecision.Pending)
            .OrderBy(job => job.CreatedAt).ThenBy(job => job.Id).ToListAsync(ct);
        if (pending.Count == 0) return new([]);
        var documentIds = pending.Select(job => job.DocumentId).Distinct().ToArray();
        var latest = (await db.OcrJobs.AsNoTracking().Where(job => documentIds.Contains(job.DocumentId))
            .Select(job => new { job.Id, job.DocumentId, job.CreatedAt }).ToListAsync(ct))
            .GroupBy(job => job.DocumentId)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(job => job.CreatedAt).ThenByDescending(job => job.Id).First().Id);
        // The queue needs metadata only; original bytes and extracted values remain behind their existing endpoints.
        var documents = await db.DocumentBlobs.AsNoTracking()
            .Where(document => documentIds.Contains(document.Id) && document.Content != Array.Empty<byte>())
            .Select(document => new DocumentBlob {
                Id = document.Id, VehicleId = document.VehicleId, CustomerId = document.CustomerId,
                LoanApplicationId = document.LoanApplicationId, RepairJobId = document.RepairJobId,
                Category = document.Category, OwnershipType = document.OwnershipType, FileName = document.FileName
            }).ToDictionaryAsync(document => document.Id, ct);
        var vehicleIds = documents.Values.Where(document => document.VehicleId.HasValue).Select(document => document.VehicleId!.Value).Distinct().ToArray();
        var vehicles = await db.Vehicles.AsNoTracking().Where(vehicle => vehicleIds.Contains(vehicle.Id)).ToDictionaryAsync(vehicle => vehicle.Id, ct);
        var loans = await db.LoanApplications.AsNoTracking().Where(loan => vehicleIds.Contains(loan.VehicleId)).ToListAsync(ct);
        var repairs = await db.RepairJobs.AsNoTracking().Where(repair => vehicleIds.Contains(repair.VehicleId)).ToDictionaryAsync(repair => repair.Id, ct);
        var receipts = await db.RepairReceipts.AsNoTracking().Where(receipt => documentIds.Contains(receipt.DocumentId) || repairs.Keys.Contains(receipt.RepairJobId)).ToListAsync(ct);
        var invoices = await db.SupplierInvoices.AsNoTracking().Where(invoice => vehicleIds.Contains(invoice.VehicleId)).ToListAsync(ct);
        var reviewedLouIds = await db.LoanBankLouDocuments.AsNoTracking()
            .Where(lou => documentIds.Contains(lou.DocumentId) && lou.ReviewedAt.HasValue).Select(lou => lou.DocumentId).ToListAsync(ct);
        var roles = SeedData.Roles.Where(user.IsInRole).ToArray();
        var items = new List<PendingDocumentReview>();
        foreach (var job in pending)
        {
            if (latest[job.DocumentId] != job.Id || !documents.TryGetValue(job.DocumentId, out var document) ||
                document.Category != job.Category || !UsableResult(job) ||
                !document.VehicleId.HasValue || !vehicles.TryGetValue(document.VehicleId.Value, out var vehicle) ||
                !DepartmentAccess.CanUploadDocument(roles, document.Category) ||
                !LoanDocumentRules.CanAccessDocument(document, vehicle, loans, user, userId)) continue;
            if (document.Category == FileCategory.RepairInvoice && document.RepairJobId is { } repairId &&
                repairs.TryGetValue(repairId, out var repair) && repair.VehicleId == vehicle.Id &&
                (user.IsInRole("BossAdmin") || user.IsInRole("Repair")) && repair.ApprovalStatus == RepairApprovalStatus.Pending &&
                !receipts.Any(receipt => receipt.DocumentId == document.Id) && !RepairReviewRules.HasPaidReceipt(repair, invoices, receipts))
            {
                items.Add(new(job.Id, document.Id, vehicle.Id, vehicle.PlateNumber, document.FileName, job.Category,
                    job.CreatedAt, "Repair", repairId, $"/repairs?repairId={repairId}&ocrJobId={job.Id}"));
            }
            else if (document.Category == FileCategory.LoanDocument && document.LoanApplicationId is { } loanId &&
                loans.FirstOrDefault(loan => loan.Id == loanId) is { } loan && loan.VehicleId == vehicle.Id &&
                loan.CustomerId == vehicle.CustomerId && document.CustomerId == loan.CustomerId &&
                loan.Status is not (LoanStatus.Done or LoanStatus.Rejected) && LoanDecisionRules.CanProcess(loan, user, userId) &&
                !reviewedLouIds.Contains(document.Id))
            {
                items.Add(new(job.Id, document.Id, vehicle.Id, vehicle.PlateNumber, document.FileName, job.Category,
                    job.CreatedAt, "Loan", loanId, $"/loans?loanId={loanId}&ocrJobId={job.Id}"));
            }
        }
        return new(items);
    }

    private static bool UsableResult(OcrJob job)
    {
        try
        {
            var result = JsonSerializer.Deserialize<OcrExtractionResult>(job.ResultJson);
            return result?.DocumentCategory == job.Category && result.Fields is not null &&
                (result.LineItems is null || result.LineItems.All(item => item is not null)) &&
                (result.Fields.Any(field => !string.IsNullOrWhiteSpace(field.Value)) || result.LineItems?.Count > 0);
        }
        catch (JsonException) { return false; }
    }
}
