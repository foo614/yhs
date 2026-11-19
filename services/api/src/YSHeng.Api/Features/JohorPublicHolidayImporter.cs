using System.Net;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record OfficialJohorHoliday(DateOnly Date, string Name);

public sealed record JohorHolidayImportDocument(
    string SourceTitle,
    string SourceUrl,
    IReadOnlyList<OfficialJohorHoliday> Holidays);

public static class JohorPublicHolidayParser
{
    private static readonly Regex TitlePattern = new(@"(?<year>20\d{2})", RegexOptions.Compiled);
    private static readonly Regex TablePattern = new(@"(?is)<table\b[^>]*>(?<body>.*?)</table>", RegexOptions.Compiled);
    private static readonly Regex RowPattern = new(@"(?is)<tr\b[^>]*>(?<body>.*?)</tr>", RegexOptions.Compiled);
    private static readonly Regex CellPattern = new(@"(?is)<td\b[^>]*>(?<body>.*?)</td>", RegexOptions.Compiled);
    private static readonly Regex DatePattern = new(@"(?<day>\d{1,2})/(?<month>\d{1,2})/(?<year>\d{4})", RegexOptions.Compiled);
    private static readonly Regex TagPattern = new("<[^>]+>", RegexOptions.Compiled);
    private static readonly Regex WhitespacePattern = new(@"\s+", RegexOptions.Compiled);

    public static JohorHolidayImportDocument Parse(string html, int expectedYear, string sourceUrl)
    {
        if (string.IsNullOrWhiteSpace(html)) throw new FormatException("The official Johor holiday page was empty.");
        if (expectedYear is < 2000 or > 2100) throw new FormatException("The requested holiday year is outside the supported range.");

        var decoded = WebUtility.HtmlDecode(html);
        var titleMatch = Regex.Match(decoded, @"(?is)<title\b[^>]*>(?<title>.*?)</title>");
        var sourceTitle = Clean(titleMatch.Success ? titleMatch.Groups["title"].Value : "");
        var titleYear = TitlePattern.Match(sourceTitle);
        if (!titleYear.Success || int.Parse(titleYear.Groups["year"].Value) != expectedYear)
            throw new FormatException($"The official Johor page is not for {expectedYear}.");

        var pageText = Clean(decoded);
        if (!pageText.Contains("Apabila Hari Kelepasan jatuh pada Hari Kelepasan Mingguan", StringComparison.OrdinalIgnoreCase)
            || !pageText.Contains("Jika Hari Kelepasan Am jatuh pada hari Sabtu", StringComparison.OrdinalIgnoreCase)
            || !pageText.Contains("Rujukan", StringComparison.OrdinalIgnoreCase))
            throw new FormatException("The official Johor holiday page is incomplete.");

        var table = TablePattern.Matches(decoded)
            .Select(match => match.Groups["body"].Value)
            .FirstOrDefault(body =>
            {
                var header = Clean(body);
                return header.Contains("Hari Kelepasan Am", StringComparison.OrdinalIgnoreCase)
                    && header.Contains("Tarikh", StringComparison.OrdinalIgnoreCase);
            });
        if (string.IsNullOrWhiteSpace(table)) throw new FormatException("The official Johor holiday table was not found.");

        var holidays = new List<OfficialJohorHoliday>();
        foreach (Match row in RowPattern.Matches(table))
        {
            var cells = CellPattern.Matches(row.Groups["body"].Value)
                .Select(cell => Clean(cell.Groups["body"].Value))
                .ToArray();
            if (cells.Length == 0) continue;
            if (cells.Length < 3) throw new FormatException("The official Johor holiday table contains a partial row.");

            var dateMatch = DatePattern.Match(cells[2]);
            if (!dateMatch.Success) throw new FormatException("The official Johor holiday table contains an unreadable date.");
            if (!DateOnly.TryParse($"{dateMatch.Groups["year"].Value}-{dateMatch.Groups["month"].Value}-{dateMatch.Groups["day"].Value}", out var date))
                throw new FormatException("The official Johor holiday table contains an invalid date.");
            if (date.Year != expectedYear) throw new FormatException("The official Johor holiday table contains a wrong-year date.");

            var name = Regex.Replace(cells[1], @"\s*\*+\s*$", "").Trim();
            if (string.IsNullOrWhiteSpace(name)) throw new FormatException("The official Johor holiday table contains an unnamed date.");
            holidays.Add(new OfficialJohorHoliday(date, name));
        }

        if (holidays.Count < 10) throw new FormatException("The official Johor holiday table appears empty or partial.");
        if (expectedYear == 2026 && holidays.Count != 18) throw new FormatException("The official Johor 2026 holiday table is incomplete.");
        if (holidays.Select(item => item.Date).Distinct().Count() != holidays.Count)
            throw new FormatException("The official Johor holiday table contains duplicate dates.");

        return new JohorHolidayImportDocument(sourceTitle, sourceUrl, holidays.OrderBy(item => item.Date).ToArray());
    }

    private static string Clean(string value) =>
        WhitespacePattern.Replace(TagPattern.Replace(WebUtility.HtmlDecode(value), " "), " ").Trim();
}

public static class JohorPublicHolidayImportRules
{
    public static readonly TimeSpan RetryDelay = TimeSpan.FromDays(1);
    public static readonly TimeSpan SuccessRecheckDelay = TimeSpan.FromDays(7);

    public static bool IsDue(HrPublicHolidayImportStatus? status, DateTime now) =>
        status is null || status.NextAttemptAt is null || status.NextAttemptAt <= now;

    public static bool CanAutoUpdate(HrPublicHoliday holiday) =>
        string.Equals(holiday.CreatedBy, "system", StringComparison.OrdinalIgnoreCase)
        && string.Equals(holiday.UpdatedBy, "system", StringComparison.OrdinalIgnoreCase);

    public static IReadOnlyList<ImportedJohorHoliday> ExpandSubstitutes(IEnumerable<OfficialJohorHoliday> holidays)
    {
        var original = holidays.OrderBy(item => item.Date).ToArray();
        var dates = original.Select(item => item.Date).ToHashSet();
        var result = original.Select(item => new ImportedJohorHoliday(item.Date, item.Name, false, null)).ToList();
        foreach (var holiday in original.Where(item => item.Date.DayOfWeek == DayOfWeek.Sunday))
        {
            var replacement = holiday.Date.AddDays(1);
            while (replacement.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday || dates.Contains(replacement)) replacement = replacement.AddDays(1);
            dates.Add(replacement);
            result.Add(new ImportedJohorHoliday(replacement, $"{holiday.Name} (replacement day)", true, $"Replacement for Sunday {holiday.Date:dd MMMM yyyy}."));
        }

        return result.OrderBy(item => item.Date).ToArray();
    }
}

public sealed record ImportedJohorHoliday(DateOnly Date, string Name, bool IsSubstitute, string? Notes);

public sealed class JohorPublicHolidayImporter(
    AppDbContext db,
    HttpClient httpClient,
    ILogger<JohorPublicHolidayImporter> logger)
{
    public const int SupportedYear = 2026;
    public const string SourceUrl = "https://www.johor.gov.my/rakyat/cuti-umum-2";
    private const string StateCode = "JHR";
    // Share the HR mutation lock so manual corrections cannot race an import.
    private const string AdvisoryLockSql = "SELECT pg_advisory_xact_lock(1772026)";

    public async Task<JohorHolidayImportResult?> RunIfDueAsync(CancellationToken cancellationToken)
    {
        var year = HrBusinessClock.Today().Year;
        if (year != SupportedYear)
        {
            logger.LogInformation("Johor public holiday import is deferred for {Year}; only {SupportedYear} is currently verified.", year, SupportedYear);
            return null;
        }
        var now = DateTime.UtcNow;
        var claim = await TryClaimAsync(year, now, cancellationToken);
        if (claim is null) return null;

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, SourceUrl);
            request.Headers.UserAgent.ParseAdd("YSHeng-HR-Holiday-Importer/1.0");
            using var response = await httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            response.EnsureSuccessStatusCode();
            var html = await response.Content.ReadAsStringAsync(cancellationToken);
            var document = JohorPublicHolidayParser.Parse(html, year, SourceUrl);
            return await CompleteSuccessAsync(claim, document, cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return await CompleteFailureAsync(claim, "The official Johor holiday request timed out.", cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException or FormatException or InvalidOperationException)
        {
            return await CompleteFailureAsync(claim, exception.Message, cancellationToken);
        }
    }

    private async Task<ImportClaim?> TryClaimAsync(int year, DateTime now, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await AcquireAdvisoryLockAsync(cancellationToken);
        var existing = await db.HrPublicHolidayImportStatuses.FirstOrDefaultAsync(item => item.StateCode == StateCode && item.Year == year, cancellationToken);
        if (!JohorPublicHolidayImportRules.IsDue(existing, now)) return null;

        var attemptAt = now;
        var attemptId = Guid.NewGuid();
        var status = existing is null
            ? new HrPublicHolidayImportStatus { StateCode = StateCode, Year = year, Status = "Running", LastAttemptAt = attemptAt, LastAttemptId = attemptId, NextAttemptAt = attemptAt.Add(JohorPublicHolidayImportRules.RetryDelay), SourceTitle = $"Cuti Umum Johor {year}", SourceUrl = SourceUrl }
            : existing with { Status = "Running", LastAttemptAt = attemptAt, LastAttemptId = attemptId, NextAttemptAt = attemptAt.Add(JohorPublicHolidayImportRules.RetryDelay), LastError = null, UpdatedAt = attemptAt, UpdatedBy = "system" };
        if (existing is null) db.HrPublicHolidayImportStatuses.Add(status); else db.Entry(existing).CurrentValues.SetValues(status);
        ApiAudit.Add(db, "system", "hr.publicHoliday.import.started", nameof(HrPublicHolidayImportStatus), status.Id);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return new ImportClaim(status.Id, year, attemptAt, attemptId);
    }

    private async Task<JohorHolidayImportResult> CompleteSuccessAsync(ImportClaim claim, JohorHolidayImportDocument document, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await AcquireAdvisoryLockAsync(cancellationToken);
        var status = await db.HrPublicHolidayImportStatuses.FirstOrDefaultAsync(item => item.Id == claim.StatusId && item.LastAttemptId == claim.AttemptId && item.Status == "Running", cancellationToken);
        if (status is null) return new JohorHolidayImportResult("Superseded", 0, 0, null);

        var existing = await db.HrPublicHolidays.Where(item => item.StateCode == StateCode && item.Year == claim.Year).ToListAsync(cancellationToken);
        var importedItems = JohorPublicHolidayImportRules.ExpandSubstitutes(document.Holidays);
        var fetchedKeys = importedItems.Select(item => (item.Date, item.IsSubstitute)).ToHashSet();
        var removedSystemRows = existing
            .Where(item => JohorPublicHolidayImportRules.CanAutoUpdate(item) && !fetchedKeys.Contains((item.Date, item.IsSubstitute)))
            .ToArray();
        if (removedSystemRows.Length > 0)
        {
            var conflictAt = DateTime.UtcNow;
            var conflict = status with
            {
                Status = "Conflict",
                LastAttemptId = null,
                NextAttemptAt = conflictAt.Add(JohorPublicHolidayImportRules.SuccessRecheckDelay),
                ImportedCount = 0,
                SkippedManualCount = 0,
                SourceTitle = document.SourceTitle,
                SourceUrl = document.SourceUrl,
                LastError = $"The official notice removed or moved {removedSystemRows.Length} system-managed holiday record(s). No records were changed; review the conflict before applying the new dates.",
                UpdatedAt = conflictAt,
                UpdatedBy = "system"
            };
            db.Entry(status).CurrentValues.SetValues(conflict);
            ApiAudit.Add(db, "system", "hr.publicHoliday.import.conflict", nameof(HrPublicHolidayImportStatus), status.Id);
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            logger.LogWarning("Johor public holiday import for {Year} found {ConflictCount} moved or removed system rows; no holiday rows changed.", claim.Year, removedSystemRows.Length);
            return new JohorHolidayImportResult(conflict.Status, 0, 0, conflict.LastError);
        }

        var imported = 0;
        var skippedManual = 0;
        foreach (var item in importedItems)
        {
            var current = existing.FirstOrDefault(row => row.Date == item.Date && row.IsSubstitute == item.IsSubstitute);
            if (current is not null && !JohorPublicHolidayImportRules.CanAutoUpdate(current))
            {
                skippedManual++;
                continue;
            }

            if (current is null)
            {
                db.HrPublicHolidays.Add(new HrPublicHoliday
                {
                    StateCode = StateCode,
                    Year = claim.Year,
                    Date = item.Date,
                    Name = item.Name,
                    IsSubstitute = item.IsSubstitute,
                    SourceTitle = document.SourceTitle,
                    SourceUrl = document.SourceUrl,
                    Notes = item.Notes,
                    CreatedBy = "system",
                    UpdatedBy = "system"
                });
            }
            else
            {
                db.Entry(current).CurrentValues.SetValues(current with
                {
                    Year = claim.Year,
                    Name = item.Name,
                    SourceTitle = document.SourceTitle,
                    SourceUrl = document.SourceUrl,
                    Notes = item.Notes,
                    UpdatedBy = "system",
                    UpdatedAt = DateTime.UtcNow
                });
            }
            imported++;
        }

        var completedAt = DateTime.UtcNow;
        var completed = status with
        {
            Status = "Succeeded",
            LastSuccessAt = completedAt,
            LastAttemptId = null,
            NextAttemptAt = completedAt.Add(JohorPublicHolidayImportRules.SuccessRecheckDelay),
            ConsecutiveFailures = 0,
            ImportedCount = imported,
            SkippedManualCount = skippedManual,
            SourceTitle = document.SourceTitle,
            SourceUrl = document.SourceUrl,
            LastError = null,
            UpdatedAt = completedAt,
            UpdatedBy = "system"
        };
        db.Entry(status).CurrentValues.SetValues(completed);
        ApiAudit.Add(db, "system", "hr.publicHoliday.import.succeeded", nameof(HrPublicHolidayImportStatus), status.Id);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        logger.LogInformation("Imported {ImportedCount} Johor public holidays for {Year}; preserved {SkippedManualCount} manual records.", imported, claim.Year, skippedManual);
        return new JohorHolidayImportResult(completed.Status, imported, skippedManual, null);
    }

    private async Task<JohorHolidayImportResult> CompleteFailureAsync(ImportClaim claim, string error, CancellationToken cancellationToken)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        await AcquireAdvisoryLockAsync(cancellationToken);
        var status = await db.HrPublicHolidayImportStatuses.FirstOrDefaultAsync(item => item.Id == claim.StatusId && item.LastAttemptId == claim.AttemptId && item.Status == "Running", cancellationToken);
        if (status is null) return new JohorHolidayImportResult("Superseded", 0, 0, error);
        var failedAt = DateTime.UtcNow;
        var failed = status with
        {
            Status = "Failed",
            LastAttemptId = null,
            NextAttemptAt = failedAt.Add(JohorPublicHolidayImportRules.RetryDelay),
            ConsecutiveFailures = status.ConsecutiveFailures + 1,
            LastError = error.Length > 500 ? error[..500] : error,
            UpdatedAt = failedAt,
            UpdatedBy = "system"
        };
        db.Entry(status).CurrentValues.SetValues(failed);
        ApiAudit.Add(db, "system", "hr.publicHoliday.import.failed", nameof(HrPublicHolidayImportStatus), status.Id);
        await db.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        logger.LogWarning("Johor public holiday import failed for {Year}: {Error}", claim.Year, error);
        return new JohorHolidayImportResult(failed.Status, 0, 0, error);
    }

    private async Task AcquireAdvisoryLockAsync(CancellationToken cancellationToken)
    {
        if (db.Database.IsNpgsql()) await db.Database.ExecuteSqlRawAsync(AdvisoryLockSql, cancellationToken);
    }

    private sealed record ImportClaim(Guid StatusId, int Year, DateTime AttemptAt, Guid AttemptId);
}

public sealed record JohorHolidayImportResult(string Status, int ImportedCount, int SkippedManualCount, string? Error);

public sealed class JohorPublicHolidayImportWorker(IServiceScopeFactory scopeFactory, ILogger<JohorPublicHolidayImportWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await RunOnceAsync(stoppingToken);
        using var timer = new PeriodicTimer(TimeSpan.FromDays(1));
        while (await timer.WaitForNextTickAsync(stoppingToken)) await RunOnceAsync(stoppingToken);
    }

    private async Task RunOnceAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var importer = scope.ServiceProvider.GetRequiredService<JohorPublicHolidayImporter>();
            await importer.RunIfDueAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (PostgresException exception) when (exception.SqlState == PostgresErrorCodes.UndefinedTable)
        {
            logger.LogWarning("Johor public holiday importer is waiting for the database schema.");
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Johor public holiday importer run failed before a persisted status could be updated.");
        }
    }
}
