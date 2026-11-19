using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using System.Net;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using YSHeng.Api.Data;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class JohorPublicHolidayImporterTests
{
    [Fact]
    public void Parser_accepts_named_current_year_table_and_derives_sunday_replacements()
    {
        var html = Page(2027, [
            ("Hari Thaipusam **", "07/02/2027"),
            ("Tahun Baru Cina", "06/02/2027"),
            ("Hari Raya Puasa", "10/04/2027"),
            ("Hari Pekerja", "01/05/2027"),
            ("Hari Wesak", "20/05/2027"),
            ("Hari Keputeraan Agong", "07/06/2027"),
            ("Awal Muharram", "08/07/2027"),
            ("Hari Hol", "21/07/2027"),
            ("Maulidur Rasul", "15/08/2027"),
            ("Hari Kebangsaan", "31/08/2027")
        ]);

        var document = JohorPublicHolidayParser.Parse(html, 2027, JohorPublicHolidayImporter.SourceUrl);
        var imported = JohorPublicHolidayImportRules.ExpandSubstitutes(document.Holidays);

        Assert.Equal(10, document.Holidays.Count);
        Assert.Contains(document.Holidays, item => item.Name == "Hari Thaipusam");
        Assert.Contains(imported, item => item.IsSubstitute && item.Date == new DateOnly(2027, 2, 8));
    }

    [Fact]
    public void Parser_rejects_wrong_year_empty_partial_and_duplicate_source_data()
    {
        var rows = Enumerable.Range(1, 10).Select(index => ($"Holiday {index}", $"{index:00}/01/2026")).ToArray();
        Assert.Throws<FormatException>(() => JohorPublicHolidayParser.Parse(Page(2026, rows), 2027, JohorPublicHolidayImporter.SourceUrl));
        Assert.Throws<FormatException>(() => JohorPublicHolidayParser.Parse(Page(2027, rows[..9]), 2027, JohorPublicHolidayImporter.SourceUrl));

        var duplicate = rows[..9].Append(("Duplicate", "01/01/2026")).ToArray();
        Assert.Throws<FormatException>(() => JohorPublicHolidayParser.Parse(Page(2026, duplicate), 2026, JohorPublicHolidayImporter.SourceUrl));
    }

    [Fact]
    public void Import_rules_preserve_manual_rows_and_retry_failed_runs_daily_then_recheck_success_weekly()
    {
        var manual = new HrPublicHoliday { CreatedBy = "boss-1", UpdatedBy = "boss-1" };
        var managed = new HrPublicHoliday { CreatedBy = "system", UpdatedBy = "system" };
        var now = new DateTime(2026, 11, 19, 12, 0, 0, DateTimeKind.Utc);
        var failed = new HrPublicHolidayImportStatus { Status = "Failed", NextAttemptAt = now.AddHours(1) };
        var succeeded = new HrPublicHolidayImportStatus { Status = "Succeeded", NextAttemptAt = now.AddDays(7) };

        Assert.False(JohorPublicHolidayImportRules.CanAutoUpdate(manual));
        Assert.True(JohorPublicHolidayImportRules.CanAutoUpdate(managed));
        Assert.False(JohorPublicHolidayImportRules.IsDue(failed, now));
        Assert.True(JohorPublicHolidayImportRules.IsDue(failed, now.AddDays(1)));
        Assert.False(JohorPublicHolidayImportRules.IsDue(succeeded, now.AddDays(6)));
        Assert.True(JohorPublicHolidayImportRules.IsDue(succeeded, now.AddDays(7)));
    }

    [Fact]
    public void Leave_calculation_input_is_bounded_and_safe_at_date_range_edges()
    {
        Assert.False(HrRules.ValidateLeaveCalculationInput(new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 2), "NOPE", "PM").IsValid);
        Assert.False(HrRules.ValidateLeaveCalculationInput(new DateOnly(2026, 1, 1), new DateOnly(2027, 1, 3), "AM", "PM").IsValid);
        Assert.True(HrRules.ValidateLeaveCalculationInput(new DateOnly(2026, 1, 1), new DateOnly(2026, 1, 2), "AM", "PM").IsValid);
        var days = HrRules.CalculateLeaveDays(DateOnly.MaxValue, DateOnly.MaxValue, "AM", "PM", [], []);
        Assert.Equal(1m, days);
    }

    [Fact]
    public async Task Live_official_johor_page_matches_verified_2026_shape_when_enabled()
    {
        if (Environment.GetEnvironmentVariable("JOHOR_LIVE_IMPORT_TEST") != "1") return;
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
        client.DefaultRequestHeaders.UserAgent.ParseAdd("YSHeng-HR-Holiday-Importer-Test/1.0");
        var html = await client.GetStringAsync(JohorPublicHolidayImporter.SourceUrl);
        var document = JohorPublicHolidayParser.Parse(html, JohorPublicHolidayImporter.SupportedYear, JohorPublicHolidayImporter.SourceUrl);
        Assert.Equal(18, document.Holidays.Count);
        Assert.Equal("Cuti Umum Johor 2026", document.SourceTitle);
    }

    [PostgresFact]
    public async Task Postgres_import_is_idempotent_preserves_manual_rows_and_records_failure()
    {
        var config = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES")) { Pooling = false };
        Assert.Contains(config.Host, new[] { "127.0.0.1", "localhost" });
        Assert.Equal("whatsapp_ci", config.Database);
        var database = "johor_holiday_check_" + Guid.NewGuid().ToString("N");
        await using var admin = new NpgsqlConnection(config.ConnectionString);
        await admin.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", admin)) await create.ExecuteNonQueryAsync();
        config.Database = database;
        var options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(config.ConnectionString).Options;
        try
        {
            await using (var setup = new AppDbContext(options))
            {
                await setup.Database.EnsureCreatedAsync();
                await setup.Database.ExecuteSqlRawAsync("ALTER TABLE \"HrPublicHolidayImportStatuses\" DROP COLUMN IF EXISTS \"LastAttemptId\";");
                await SeedData.EnsureHrSchemaAsync(setup);
                await SeedData.EnsureHrSchemaAsync(setup);
                var existing = await setup.HrPublicHolidays.SingleAsync(item => item.Date == new DateOnly(2026, 2, 1) && !item.IsSubstitute);
                setup.Entry(existing).CurrentValues.SetValues(existing with
                {
                    Name = "Boss override", SourceTitle = "Boss notice", SourceUrl = "https://example.invalid/manual",
                    CreatedBy = "boss-1", UpdatedBy = "boss-1"
                });
                await setup.SaveChangesAsync();
            }

            using var successClient = new HttpClient(new StubHttpHandler(Page(2026, Verified2026Rows()), HttpStatusCode.OK));
            await using (var db = new AppDbContext(options))
            {
                var importer = new JohorPublicHolidayImporter(db, successClient, NullLogger<JohorPublicHolidayImporter>.Instance);
                var result = await importer.RunIfDueAsync(default);
                Assert.NotNull(result);
                Assert.Equal("Succeeded", result.Status);
                Assert.Equal(1, result.SkippedManualCount);
                Assert.Equal(22, await db.HrPublicHolidays.CountAsync());
                var manual = await db.HrPublicHolidays.SingleAsync(item => item.Date == new DateOnly(2026, 2, 1) && !item.IsSubstitute);
                Assert.Equal("Boss override", manual.Name);

                var status = await db.HrPublicHolidayImportStatuses.SingleAsync();
                db.Entry(status).CurrentValues.SetValues(status with { NextAttemptAt = DateTime.UtcNow.AddMinutes(-1) });
                await db.SaveChangesAsync();
                result = await importer.RunIfDueAsync(default);
                Assert.Equal("Succeeded", result?.Status);
                Assert.Equal(22, await db.HrPublicHolidays.CountAsync());
            }

            using var failureClient = new HttpClient(new StubHttpHandler("", HttpStatusCode.ServiceUnavailable));
            await using (var db = new AppDbContext(options))
            {
                var status = await db.HrPublicHolidayImportStatuses.SingleAsync();
                db.Entry(status).CurrentValues.SetValues(status with { NextAttemptAt = DateTime.UtcNow.AddMinutes(-1) });
                await db.SaveChangesAsync();
                var importer = new JohorPublicHolidayImporter(db, failureClient, NullLogger<JohorPublicHolidayImporter>.Instance);
                var result = await importer.RunIfDueAsync(default);
                Assert.Equal("Failed", result?.Status);
                Assert.Equal(22, await db.HrPublicHolidays.CountAsync());
            }
        }
        finally
        {
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", admin);
            await drop.ExecuteNonQueryAsync();
        }
    }

    private static string Page(int year, IEnumerable<(string Name, string Date)> rows) =>
        $"<html><head><title>Cuti Umum Johor {year}</title></head><body><table><thead><tr><th>Bil</th><th>Hari Kelepasan Am</th><th>Tarikh</th><th>Hari</th></tr></thead><tbody>{string.Join("", rows.Select((row, index) => $"<tr><td>{index + 1}.</td><td>{row.Name}</td><td>{row.Date}</td><td>Hari</td></tr>"))}</tbody></table><p>Apabila Hari Kelepasan jatuh pada Hari Kelepasan Mingguan (Ahad), maka hari tersebut digantikan dengan hari bekerja berikutnya.</p><p>Jika Hari Kelepasan Am jatuh pada hari Sabtu ianya tidak diganti.</p><p>Rujukan: Surat edaran rasmi cuti umum negeri.</p></body></html>";

    private static (string Name, string Date)[] Verified2026Rows() =>
    [
        ("Hari Thaipusam", "01/02/2026"), ("Tahun Baru Cina", "17/02/2026"), ("Tahun Baru Cina Hari Kedua", "18/02/2026"),
        ("Awal Ramadhan", "19/02/2026"), ("Hari Raya Puasa", "21/03/2026"), ("Hari Raya Puasa Hari Kedua", "22/03/2026"),
        ("Hari Keputeraan Rasmi DYMM Sultan Johor", "23/03/2026"), ("Hari Pekerja", "01/05/2026"), ("Hari Raya Qurban", "27/05/2026"),
        ("Hari Wesak", "31/05/2026"), ("Hari Keputeraan Agong", "01/06/2026"), ("Awal Muharram", "17/06/2026"),
        ("Hari Hol", "21/07/2026"), ("Maulidur Rasul", "25/08/2026"), ("Hari Kebangsaan", "31/08/2026"),
        ("Hari Malaysia", "16/09/2026"), ("Hari Deepavali", "08/11/2026"), ("Hari Krismas", "25/12/2026")
    ];

    private sealed class StubHttpHandler(string body, HttpStatusCode status) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(body) });
    }

    private sealed class PostgresFactAttribute : FactAttribute
    {
        public PostgresFactAttribute()
        {
            if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES")))
                Skip = "Requires the isolated PostgreSQL CI service; never uses an application database.";
        }
    }
}
