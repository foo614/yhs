using System.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record UpdateAiServiceLimitRequest(
    bool IsEnabled,
    int MonthlyRequestLimit,
    int PerStaffDailyRequestLimit);

public sealed record AiUsageLimitSnapshot(
    AiServiceLimit Limit,
    int UsedThisMonth,
    int RemainingThisMonth);

public sealed record AiUsageReservation(
    bool IsAllowed,
    string? Message,
    Guid? UsageRecordId);

public static class AiUsageLimitRules
{
    public static string[] Validate(UpdateAiServiceLimitRequest request)
    {
        var errors = new List<string>();
        if (request.MonthlyRequestLimit is < 0 or > 100_000)
        {
            errors.Add("Monthly AI request limit must be between 0 and 100,000.");
        }
        if (request.PerStaffDailyRequestLimit is < 0 or > 10_000)
        {
            errors.Add("Per-staff daily AI request limit must be between 0 and 10,000.");
        }
        return errors.ToArray();
    }
}

public sealed class AiUsageQuotaService(AppDbContext db)
{
    public async Task<AiUsageLimitSnapshot> GetOcrSnapshotAsync(CancellationToken cancellationToken = default)
    {
        var limit = await GetOcrLimitAsync(cancellationToken);
        var now = DateTime.UtcNow;
        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var usedThisMonth = await db.AiUsageRecords.CountAsync(
            record => record.Service == AiService.Ocr && record.RequestedAt >= monthStart,
            cancellationToken);
        return new AiUsageLimitSnapshot(limit, usedThisMonth, Math.Max(0, limit.MonthlyRequestLimit - usedThisMonth));
    }

    public async Task<AiServiceLimit> UpdateOcrLimitAsync(
        UpdateAiServiceLimitRequest request,
        string updatedBy,
        CancellationToken cancellationToken = default)
    {
        var limit = await GetOcrLimitAsync(cancellationToken);
        var updated = limit with
        {
            IsEnabled = request.IsEnabled,
            MonthlyRequestLimit = request.MonthlyRequestLimit,
            PerStaffDailyRequestLimit = request.PerStaffDailyRequestLimit,
            UpdatedAt = DateTime.UtcNow,
            UpdatedBy = updatedBy
        };
        db.Entry(limit).CurrentValues.SetValues(updated);
        await db.SaveChangesAsync(cancellationToken);
        return updated;
    }

    public async Task<AiUsageReservation> ReserveOcrAsync(
        Guid sourceDocumentId,
        string staffUserId,
        CancellationToken cancellationToken = default)
    {
        for (var attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, cancellationToken);
                var limit = await db.AiServiceLimits.SingleAsync(item => item.Service == AiService.Ocr, cancellationToken);
                var now = DateTime.UtcNow;
                var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
                var dayStart = now.Date;
                var monthlyUsed = await db.AiUsageRecords.CountAsync(
                    record => record.Service == AiService.Ocr && record.RequestedAt >= monthStart,
                    cancellationToken);
                var staffUsedToday = await db.AiUsageRecords.CountAsync(
                    record => record.Service == AiService.Ocr && record.StaffUserId == staffUserId && record.RequestedAt >= dayStart,
                    cancellationToken);

                if (!limit.IsEnabled)
                {
                    await transaction.CommitAsync(cancellationToken);
                    return new AiUsageReservation(false, "OCR is currently disabled by an administrator.", null);
                }
                if (monthlyUsed >= limit.MonthlyRequestLimit)
                {
                    await transaction.CommitAsync(cancellationToken);
                    return new AiUsageReservation(false, "The monthly OCR limit has been reached. Ask an administrator to adjust the AI usage limit.", null);
                }
                if (staffUsedToday >= limit.PerStaffDailyRequestLimit)
                {
                    await transaction.CommitAsync(cancellationToken);
                    return new AiUsageReservation(false, "Your daily OCR limit has been reached. Ask an administrator to adjust the AI usage limit.", null);
                }

                var usage = new AiUsageRecord
                {
                    Service = AiService.Ocr,
                    SourceDocumentId = sourceDocumentId,
                    StaffUserId = staffUserId,
                    RequestedAt = now
                };
                db.AiUsageRecords.Add(usage);
                await db.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
                return new AiUsageReservation(true, null, usage.Id);
            }
            catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.SerializationFailure })
            {
                db.ChangeTracker.Clear();
            }
        }

        return new AiUsageReservation(false, "OCR is busy. Please try again.", null);
    }

    public async Task MarkCompletedAsync(Guid usageRecordId, bool succeeded, CancellationToken cancellationToken = default)
    {
        var usage = await db.AiUsageRecords.FirstOrDefaultAsync(record => record.Id == usageRecordId, cancellationToken);
        if (usage is null) return;

        var completed = usage with
        {
            Status = succeeded ? AiUsageStatus.Succeeded : AiUsageStatus.Failed,
            CompletedAt = DateTime.UtcNow
        };
        db.Entry(usage).CurrentValues.SetValues(completed);
        await db.SaveChangesAsync(cancellationToken);
    }

    private async Task<AiServiceLimit> GetOcrLimitAsync(CancellationToken cancellationToken)
    {
        var limit = await db.AiServiceLimits.SingleOrDefaultAsync(item => item.Service == AiService.Ocr, cancellationToken);
        if (limit is not null) return limit;

        limit = new AiServiceLimit { Service = AiService.Ocr };
        db.AiServiceLimits.Add(limit);
        await db.SaveChangesAsync(cancellationToken);
        return limit;
    }
}
