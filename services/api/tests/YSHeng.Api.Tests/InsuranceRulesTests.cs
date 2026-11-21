using System.Net;
using System.Net.Http.Json;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using System.Security.Claims;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

// New money-bearing standalone module needs coverage for confirmation authority,
// duplicate confirmations, partial balances and import/data isolation.
public sealed class InsuranceRulesTests
{
    // Exercise the real route pipeline: a UI-only gate would expose private cases
    // or allow JPJ completion without evidence.
    [Fact]
    public async Task Protected_routes_enforce_admin_access_id_match_and_actual_jpj_receipt()
    {
        using var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync();
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddSingleton(new WhatsAppDispatchOptions());
        builder.Services.AddDbContext<AppDbContext>(x => x.UseSqlite(connection));
        builder.Services.AddAuthentication("insurance-test").AddScheme<AuthenticationSchemeOptions, InsuranceTestAuth>("insurance-test", _ => { });
        builder.Services.AddAuthorization(x =>
        {
            x.AddPolicy("BackOffice", p => p.RequireAuthenticatedUser());
            x.AddPolicy("BossAdmin", p => p.RequireRole("BossAdmin"));
            x.AddPolicy("Finance", p => p.RequireRole("BossAdmin", "Finance"));
        });
        await using var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization();
        var api = app.MapGroup("/api").RequireAuthorization("BackOffice");
        InsuranceModule.MapRoutes(api); InsuranceAutoCount.MapRoutes(api); WhatsAppInsurance.MapRoutes(api);
        using (var scope = app.Services.CreateScope()) await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreatedAsync();
        await app.StartAsync(); using var client = app.GetTestClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/insurance")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Role", "Finance");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/insurance")).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "BossAdmin");
        var request = new InsuranceCase { PlateNumber = "SYNTH123", CustomerName = "Synthetic", ExpiryDate = new(2027, 11, 20), RoadTaxMethod = "JPJ", InsuranceAmount = 100 };
        var created = await client.PostAsJsonAsync("/api/insurance", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var view = await created.Content.ReadFromJsonAsync<InsuranceCaseView>(); Assert.NotNull(view);
        Assert.Equal(20, view.Record.RunnerFee);
        var path = "/api/insurance/" + view.Record.Id;
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync(path, view.Record with { Id = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(path, view.Record with { RoadTaxCompleted = true })).StatusCode);
        var completed = await client.PutAsJsonAsync(path, view.Record with { RoadTaxCompleted = true, RoadTaxMethod = "EAuto" });
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        var eauto = await completed.Content.ReadFromJsonAsync<InsuranceCaseView>(); Assert.Equal(0, eauto!.Record.RunnerFee);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(path + "/send-documents", new InsuranceDocumentSendRequest(999, null, []))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path + "/send-documents", new InsuranceDocumentSendRequest(eauto.Record.Version, null, []))).StatusCode);
        var insurerRequest = new InsurancePaymentRequest("final-actual", 80, InsuranceRules.Today, "synthetic payment reference");
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(path + "/insurer-payments", insurerRequest)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(path + "/insurer-payments", insurerRequest)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(path + "/insurer-payments", insurerRequest with { IdempotencyKey = "not-an-installment", Amount = 5 })).StatusCode);
        var beforeRenewal = await client.GetFromJsonAsync<InsuranceCaseView>(path);
        var renewalRequest = new InsuranceRenewRequest(beforeRenewal!.Record.Version, true);
        var renewed = await client.PostAsJsonAsync(path + "/renew", renewalRequest);
        Assert.Equal(HttpStatusCode.OK, renewed.StatusCode);
        var annual = await renewed.Content.ReadFromJsonAsync<InsuranceCaseView>(); Assert.NotNull(annual);
        Assert.NotEqual(view.Record.Id, annual.Record.Id); Assert.Equal("SYNTH123", annual.Record.PlateNumber);
        Assert.Null(annual.Record.CoverStartDate); Assert.Null(annual.Record.InvoiceNumber); Assert.Null(annual.Record.PolicyNumber);
        Assert.Empty(annual.Receipts); Assert.Empty(annual.InsurerPayments); Assert.Equal(0, annual.Record.InsuranceAmount);
        var old = await client.GetFromJsonAsync<InsuranceCaseView>(path); Assert.False(old!.RenewalDue); Assert.Equal(annual.Record.Id, old.Record.RenewedByCaseId);
        var retried = await client.PostAsJsonAsync(path + "/renew", renewalRequest);
        Assert.Equal(annual.Record.Id, (await retried.Content.ReadFromJsonAsync<InsuranceCaseView>())!.Record.Id);
        using var invalid = new MultipartFormDataContent(); invalid.Add(new StringContent("RoadTaxReceipt"), "kind");
        var forged = new ByteArrayContent("not an image"u8.ToArray()); forged.Headers.ContentType = new("image/jpeg"); invalid.Add(forged, "file", "fake.jpg");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync(path + "/attachments", invalid)).StatusCode);
    }

    [Fact]
    public async Task Pending_evidence_never_settles_balance_and_only_boss_can_confirm_partial_payment_once()
    {
        using var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        var item = new InsuranceCase { PlateNumber = "TEST123", CustomerName = "Synthetic", ExpiryDate = new(2027, 1, 31), InsuranceAmount = 100, RunnerFee = 0, InvoiceNumber = "TEST-IV", Version = 1 };
        var receipt = new InsuranceReceipt { CaseId = item.Id, Amount = 30m, InvoiceNumber = "TEST-IV", IdempotencyKey = "partial-one", ReceivedDate = InsuranceRules.Today };
        db.InsuranceCases.Add(item); db.InsuranceReceipts.Add(receipt); await db.SaveChangesAsync();
        Assert.Equal(100, (await InsuranceModule.LoadView(db, item)).Outstanding);
        var finance = new ClaimsPrincipal(new ClaimsIdentity([new(ClaimTypes.Role, "Finance")], "test"));
        Assert.NotNull(await InsuranceModule.ConfirmReceiptAsync(db, item.Id, receipt.Id, finance));
        Assert.Equal("Pending", (await db.InsuranceReceipts.AsNoTracking().SingleAsync()).Status);
        var boss = new ClaimsPrincipal(new ClaimsIdentity([new(ClaimTypes.Role, "BossAdmin"), new(ClaimTypes.Name, "synthetic-admin")], "test"));
        Assert.Null(await InsuranceModule.ConfirmReceiptAsync(db, item.Id, receipt.Id, boss));
        Assert.Null(await InsuranceModule.ConfirmReceiptAsync(db, item.Id, receipt.Id, boss));
        var view = await InsuranceModule.LoadView(db, item);
        Assert.Equal(30, view.Received); Assert.Equal(70, view.Outstanding);
        Assert.Equal("synthetic-admin", view.Receipts.Single().ConfirmedBy);
        Assert.Single(await db.AuditLogs.Where(x => x.Action == "insurance.receiptConfirmed").ToListAsync());
        Assert.Empty(await db.PaymentRecords.ToListAsync()); Assert.Empty(await db.CollectionTransactions.ToListAsync());
    }

    [Fact]
    public async Task A_second_pending_receipt_cannot_overpay_after_another_is_confirmed()
    {
        using var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        var item = new InsuranceCase { PlateNumber = "TEST123", CustomerName = "Synthetic", ExpiryDate = new(2027, 1, 31), InsuranceAmount = 100, RunnerFee = 0, InvoiceNumber = "TEST-IV" };
        var first = new InsuranceReceipt { CaseId = item.Id, Amount = 70, InvoiceNumber = "TEST-IV", IdempotencyKey = "one", ReceivedDate = InsuranceRules.Today };
        var second = new InsuranceReceipt { CaseId = item.Id, Amount = 50, InvoiceNumber = "TEST-IV", IdempotencyKey = "two", ReceivedDate = InsuranceRules.Today };
        db.InsuranceCases.Add(item); db.InsuranceReceipts.AddRange(first, second); await db.SaveChangesAsync();
        var boss = new ClaimsPrincipal(new ClaimsIdentity([new(ClaimTypes.Role, "BossAdmin")], "test"));
        Assert.Null(await InsuranceModule.ConfirmReceiptAsync(db, item.Id, first.Id, boss));
        Assert.NotNull(await InsuranceModule.ConfirmReceiptAsync(db, item.Id, second.Id, boss));
        Assert.Equal(30, (await InsuranceModule.LoadView(db, item)).Outstanding);
    }

    [Theory]
    [InlineData(-1, "Transfer", "PBB")]
    [InlineData(1.001, "Transfer", "PBB")]
    [InlineData(10, "Cash", "PBB")]
    [InlineData(10, "Unknown", "PBB")]
    public void Invalid_stored_receipt_values_cannot_pass_shared_confirmation_validation(decimal amount, string type, string destination)
    {
        var item = new InsuranceCase { InvoiceNumber = "TEST-IV" };
        Assert.NotNull(InsuranceRules.ValidateReceipt(new("test", amount, type, destination, InsuranceRules.Today, "TEST-IV"), item, 100));
    }

    [Fact]
    public void Renewal_is_internal_without_phone_decline_stops_it_and_overdue_stops_when_settled()
    {
        var item = new InsuranceCase { ExpiryDate = new(2027, 3, 31), CoverStartDate = new(2026, 11, 1), CustomerPhone = null };
        Assert.False(InsuranceRules.RenewalDue(item, new(2027, 2, 27)));
        Assert.True(InsuranceRules.RenewalDue(item, new(2027, 2, 28)));
        Assert.False(InsuranceRules.RenewalDue(item with { RenewalDeclined = true }, new(2027, 3, 1)));
        Assert.False(InsuranceRules.PaymentAlert(item, 20, new(2026, 11, 7)));
        Assert.True(InsuranceRules.PaymentAlert(item, 20, new(2026, 11, 8)));
        Assert.False(InsuranceRules.PaymentAlert(item, 0, new(2026, 11, 8)));
        Assert.Equal(0, InsuranceRules.Normalize(item with { RoadTaxMethod = "EAuto", RunnerFee = 20 }).RunnerFee);
    }

    [Fact]
    public void Import_preserves_exact_sample_order_leading_zero_identity_and_blank_phone_and_rejects_ambiguous_mapping()
    {
        string[][] rows = [["Synthetic customer", "001122334455", "test123", "2/10/2026", "TEST INSURER", "COMPREHENSIVE", "55", "R", "source remark", ""]];
        var preview = InsuranceRules.PreviewImport(new(InsuranceRules.ImportHeaders, rows));
        Assert.Empty(preview.Errors); var item = Assert.Single(preview.Records);
        Assert.Equal("001122334455", item.IdentityNumber); Assert.Null(item.CustomerPhone); Assert.Equal(new DateOnly(2026, 10, 2), item.ExpiryDate);
        var annotated = rows[0].ToArray(); annotated[7] = "R (MOTOR)";
        Assert.Contains("R (MOTOR)", InsuranceRules.PreviewImport(new(InsuranceRules.ImportHeaders, [annotated])).Records.Single().Remark);
        annotated[7] = "RUBBISH"; Assert.NotEmpty(InsuranceRules.PreviewImport(new(InsuranceRules.ImportHeaders, [annotated])).Errors);
        Assert.NotEmpty(InsuranceRules.PreviewImport(new(InsuranceRules.ImportHeaders.Reverse().ToArray(), rows)).Errors);
        Assert.NotEmpty(InsuranceRules.PreviewImport(new(InsuranceRules.ImportHeaders, [rows[0], rows[0]])).Errors);
        Assert.NotEmpty(InsuranceRules.PreviewImport(new(InsuranceRules.ImportHeaders, [["too few"]])).Errors);
    }
}

internal sealed class InsuranceTestAuth(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
    : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var role = Request.Headers["X-Test-Role"].ToString();
        if (role.Length == 0) return Task.FromResult(AuthenticateResult.NoResult());
        var identity = new ClaimsIdentity([new(ClaimTypes.Name, "synthetic-admin"), new(ClaimTypes.Role, role)], Scheme.Name);
        return Task.FromResult(AuthenticateResult.Success(new(new ClaimsPrincipal(identity), Scheme.Name)));
    }
}
