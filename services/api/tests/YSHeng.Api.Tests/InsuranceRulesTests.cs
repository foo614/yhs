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
    // Payment evidence and confirmation remain case-scoped even when the invoice
    // is managed externally; hidden legacy references must survive ordinary edits.
    [Fact]
    public async Task Receipts_allow_omitted_invoice_and_preserve_legacy_references_and_money_guards()
    {
        using var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync();
        var builder = WebApplication.CreateBuilder(); builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connection));
        builder.Services.AddAuthentication("insurance-test").AddScheme<AuthenticationSchemeOptions, InsuranceTestAuth>("insurance-test", _ => { });
        builder.Services.AddAuthorization(options =>
        {
            options.AddPolicy("BackOffice", policy => policy.RequireAuthenticatedUser());
            options.AddPolicy("BossAdmin", policy => policy.RequireRole("BossAdmin"));
            options.AddPolicy("Finance", policy => policy.RequireRole("BossAdmin", "Finance"));
        });
        await using var app = builder.Build(); app.UseAuthentication(); app.UseAuthorization();
        var api = app.MapGroup("/api").RequireAuthorization("BackOffice"); InsuranceModule.MapRoutes(api); InsuranceAutoCount.MapRoutes(api);
        using (var scope = app.Services.CreateScope()) await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.EnsureCreatedAsync();
        await app.StartAsync(); using var client = app.GetTestClient(); client.DefaultRequestHeaders.Add("X-Test-Role", "BossAdmin");
        var request = new InsuranceCase { PlateNumber = "NOIV123", CustomerName = "Synthetic", ExpiryDate = new(2027, 11, 20), InsuranceAmount = 100m };
        var created = await client.PostAsJsonAsync("/api/insurance", request); Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var item = (await created.Content.ReadFromJsonAsync<InsuranceCaseView>())!.Record;
        var path = "/api/insurance/" + item.Id;
        var omitted = new { idempotencyKey = "no-invoice", amount = 30m, paymentType = "Transfer", depositAccount = "PBB", receivedDate = InsuranceRules.Today };
        var preview = await client.PostAsJsonAsync(path + "/receipts/preview", omitted); Assert.Equal(HttpStatusCode.OK, preview.StatusCode);
        var receipt = (await preview.Content.ReadFromJsonAsync<InsuranceReceipt>())!; Assert.Equal("", receipt.InvoiceNumber);
        var replay = await client.PostAsJsonAsync(path + "/receipts/preview", omitted);
        Assert.Equal(receipt.Id, (await replay.Content.ReadFromJsonAsync<InsuranceReceipt>())!.Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path + "/receipts/" + receipt.Id + "/confirm", new { confirmed = false })).StatusCode);
        for (var attempt = 0; attempt < 2; attempt++) Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync(path + "/receipts/" + receipt.Id + "/confirm", new { confirmed = true })).StatusCode);
        var view = (await client.GetFromJsonAsync<InsuranceCaseView>(path))!; Assert.Equal(30m, view.Received); Assert.Equal(70m, view.Outstanding);
        var copied = (await client.GetFromJsonAsync<InsuranceCopyRows>(path + "/autocount?kind=Receipt&receiptId=" + receipt.Id))!; Assert.Empty(copied.Blockers); Assert.NotEmpty(copied.Clipboard);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path + "/receipts/preview", new InsuranceReceiptRequest("overpaid", 71m, "Transfer", "PBB", InsuranceRules.Today))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path + "/receipts/preview", new InsuranceReceiptRequest("evidence", 1m, "Transfer", "PBB", InsuranceRules.Today, EvidenceAttachmentId: Guid.NewGuid()))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(path + "/receipts/preview", new InsuranceReceiptRequest("long", 1m, "Transfer", "PBB", InsuranceRules.Today, new string('X', 101)))).StatusCode);
        var external = await client.PostAsJsonAsync(path + "/receipts/preview", new InsuranceReceiptRequest("external", 1m, "Transfer", "PBB", InsuranceRules.Today, " EXT-IV "));
        Assert.Equal(HttpStatusCode.OK, external.StatusCode); Assert.Equal("EXT-IV", (await external.Content.ReadFromJsonAsync<InsuranceReceipt>())!.InvoiceNumber);
        var legacyCreate = await client.PostAsJsonAsync("/api/insurance", request with { InvoiceNumber = "LEGACY-IV", IntercompanyInvoiceNumber = "LEGACY-AUTO", InsurerInvoiceNumber = "KEEP-INSURER" });
        var legacy = (await legacyCreate.Content.ReadFromJsonAsync<InsuranceCaseView>())!.Record; var legacyPath = "/api/insurance/" + legacy.Id;
        var fallback = await client.PostAsJsonAsync(legacyPath + "/receipts/preview", omitted);
        var fallbackReceipt = (await fallback.Content.ReadFromJsonAsync<InsuranceReceipt>())!; Assert.Equal("LEGACY-IV", fallbackReceipt.InvoiceNumber);
        var fallbackReplay = await client.PostAsJsonAsync(legacyPath + "/receipts/preview", new InsuranceReceiptRequest("no-invoice", 30m, "Transfer", "PBB", InsuranceRules.Today, "LEGACY-IV"));
        Assert.Equal(fallbackReceipt.Id, (await fallbackReplay.Content.ReadFromJsonAsync<InsuranceReceipt>())!.Id);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync(legacyPath + "/receipts/preview", new InsuranceReceiptRequest("mismatch", 1m, "Transfer", "PBB", InsuranceRules.Today, "WRONG-IV"))).StatusCode);
        var edited = await client.PutAsJsonAsync(legacyPath, legacy with { InvoiceNumber = null, IntercompanyInvoiceNumber = null, Remark = "Unrelated edit" });
        Assert.Equal(HttpStatusCode.OK, edited.StatusCode); legacy = (await edited.Content.ReadFromJsonAsync<InsuranceCaseView>())!.Record;
        Assert.Equal("LEGACY-IV", legacy.InvoiceNumber); Assert.Equal("LEGACY-AUTO", legacy.IntercompanyInvoiceNumber); Assert.Equal("KEEP-INSURER", legacy.InsurerInvoiceNumber);
        var body = System.Text.Json.JsonSerializer.SerializeToNode(legacy, new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))!.AsObject();
        body.Remove("invoiceNumber"); body.Remove("intercompanyInvoiceNumber");
        var omittedEdit = await client.PutAsJsonAsync(legacyPath, body); Assert.Equal(HttpStatusCode.OK, omittedEdit.StatusCode);
        var preserved = (await omittedEdit.Content.ReadFromJsonAsync<InsuranceCaseView>())!.Record;
        Assert.Equal("LEGACY-IV", preserved.InvoiceNumber); Assert.Equal("LEGACY-AUTO", preserved.IntercompanyInvoiceNumber);
    }

    // Prevents unauthorized financial download and exporting values that no longer
    // match the reviewed month, including blocked or empty financial mappings.
    [Fact]
    public async Task Monthly_workbook_requires_admin_and_current_unblocked_preview_fingerprint()
    {
        using var connection = new SqliteConnection("Data Source=:memory:"); await connection.OpenAsync();
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connection));
        builder.Services.AddAuthentication("insurance-test").AddScheme<AuthenticationSchemeOptions, InsuranceTestAuth>("insurance-test", _ => { });
        builder.Services.AddAuthorization(options =>
        {
            options.AddPolicy("BackOffice", policy => policy.RequireAuthenticatedUser());
            options.AddPolicy("BossAdmin", policy => policy.RequireRole("BossAdmin"));
        });
        await using var app = builder.Build();
        app.UseAuthentication(); app.UseAuthorization();
        InsuranceAutoCount.MapRoutes(app.MapGroup("/api").RequireAuthorization("BackOffice"));
        var included = new InsuranceCase { PlateNumber = "SYNTH1", Company = "Automotive", CoverStartDate = new(2026, 11, 1), InsuranceAmount = 100m };
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); await db.Database.EnsureCreatedAsync();
            db.AddRange(included, included with { Id = Guid.NewGuid(), Company = "Auto", PlateNumber = "EXCLUDE-AUTO" },
                included with { Id = Guid.NewGuid(), CoverStartDate = new(2026, 10, 31), PlateNumber = "EXCLUDE-MONTH" });
            await db.SaveChangesAsync();
        }
        await app.StartAsync(); using var client = app.GetTestClient();
        const string path = "/api/insurance/autocount-monthly.xlsx?month=2026-11";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(path)).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Role", "Finance");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "BossAdmin");
        foreach (var invalid in new[] { path, path + "&expectedFingerprint=invalid", "/api/insurance/autocount-monthly.xlsx?month=2026-13&expectedFingerprint=" + new string('0', 64), "/api/insurance/autocount-monthly.xlsx?month=9999-12&expectedFingerprint=" + new string('0', 64) })
        {
            var response = await client.GetAsync(invalid);
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.True((await response.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("message").GetString()!.Length > 0);
        }
        var preview = await client.GetFromJsonAsync<InsuranceCopyRows>("/api/insurance/autocount-monthly?month=2026-11"); Assert.NotNull(preview);
        Assert.Single(preview.Rows); Assert.Contains("SYNTH1", preview.Rows[0][2]);
        var downloaded = await client.GetAsync(path + "&expectedFingerprint=" + preview.Fingerprint);
        Assert.Equal(HttpStatusCode.OK, downloaded.StatusCode);
        Assert.Equal("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", downloaded.Content.Headers.ContentType!.MediaType);
        Assert.Contains("insurance-intercompany-2026-11.xlsx", downloaded.Content.Headers.ContentDisposition!.ToString());
        Assert.Equal("no-store", downloaded.Headers.CacheControl!.ToString());
        Assert.NotEmpty(await downloaded.Content.ReadAsByteArrayAsync());
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await db.InsuranceCases.Where(record => record.Id == included.Id).ExecuteUpdateAsync(set => set.SetProperty(record => record.InsuranceAmount, 200m));
        }
        Assert.Equal(HttpStatusCode.Conflict, (await client.GetAsync(path + "&expectedFingerprint=" + preview.Fingerprint)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.GetAsync("/api/insurance/autocount-monthly.xlsx?month=2026-12&expectedFingerprint=" + preview.Fingerprint)).StatusCode);
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var current = await db.InsuranceCases.SingleAsync(record => record.Id == included.Id);
            db.Entry(current).CurrentValues.SetValues(current with { OtherCharges = [new("UNVERIFIED", "Do not map", 10)] });
            await db.SaveChangesAsync();
        }
        var blocked = await client.GetFromJsonAsync<InsuranceCopyRows>("/api/insurance/autocount-monthly?month=2026-11");
        Assert.NotEmpty(blocked!.Blockers);
        Assert.Equal(HttpStatusCode.Conflict, (await client.GetAsync(path + "&expectedFingerprint=" + blocked.Fingerprint)).StatusCode);
    }

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
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/insurance/charge-items")).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-Role", "Finance");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/insurance")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/insurance/charge-items")).StatusCode);
        client.DefaultRequestHeaders.Remove("X-Test-Role"); client.DefaultRequestHeaders.Add("X-Test-Role", "BossAdmin");
        var catalog = await client.GetFromJsonAsync<InsuranceChargeItem[]>("/api/insurance/charge-items");
        Assert.Equal(5, catalog!.Length);
        Assert.Equal("DRIVER LICENSE", Assert.Single(catalog, item => item.ItemCode == "LICENSE").Description);
        var request = new InsuranceCase { PlateNumber = "SYNTH123", CustomerName = "Synthetic", ExpiryDate = new(2027, 11, 20), RoadTaxMethod = "JPJ", InsuranceAmount = 100,
            OtherCharges = [new("LICENSE", "Forged caller description", 0)] };
        var created = await client.PostAsJsonAsync("/api/insurance", request);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var view = await created.Content.ReadFromJsonAsync<InsuranceCaseView>(); Assert.NotNull(view);
        Assert.Equal(20, view.Record.RunnerFee);
        Assert.Equal("DRIVER LICENSE", view.Record.OtherCharges.Single().Description);
        var path = "/api/insurance/" + view.Record.Id;
        // Legacy descriptions are not rewritten by unrelated saves or amount edits.
        using (var scope = app.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var saved = await db.InsuranceCases.SingleAsync(item => item.Id == view.Record.Id);
            db.Entry(saved).CurrentValues.SetValues(saved with { OtherCharges = [new("LICENSE", "Legacy custom description", 0), new("LEGACY CODE", "Legacy unknown description", 0)] });
            await db.SaveChangesAsync();
        }
        view = await client.GetFromJsonAsync<InsuranceCaseView>(path); Assert.NotNull(view);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync(path, view.Record with { Id = Guid.NewGuid() })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(path, view.Record with { RoadTaxCompleted = true })).StatusCode);
        var completed = await client.PutAsJsonAsync(path, view.Record with { RoadTaxCompleted = true, RoadTaxMethod = "EAuto" });
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        var eauto = await completed.Content.ReadFromJsonAsync<InsuranceCaseView>(); Assert.Equal(0, eauto!.Record.RunnerFee);
        Assert.Equal(new[] { "Legacy custom description", "Legacy unknown description" }, eauto.Record.OtherCharges.Select(charge => charge.Description));
        var amountEdit = await client.PutAsJsonAsync(path, eauto.Record with { OtherCharges = eauto.Record.OtherCharges.Select(charge => charge with { Amount = 1 }).ToArray() });
        Assert.Equal(HttpStatusCode.OK, amountEdit.StatusCode);
        eauto = await amountEdit.Content.ReadFromJsonAsync<InsuranceCaseView>(); Assert.NotNull(eauto);
        Assert.Equal(new[] { "Legacy custom description", "Legacy unknown description" }, eauto.Record.OtherCharges.Select(charge => charge.Description));
        var unknown = await client.PutAsJsonAsync(path, eauto.Record with { OtherCharges = [new("NEW UNKNOWN", "Caller text", 1)] });
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.True((await unknown.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>()).GetProperty("message").GetString()!.Length > 0);
        var newCode = await client.PutAsJsonAsync(path, eauto.Record with { OtherCharges = [new("TENDER", "Forged caller text", 1)] });
        Assert.Equal(HttpStatusCode.OK, newCode.StatusCode);
        eauto = await newCode.Content.ReadFromJsonAsync<InsuranceCaseView>(); Assert.NotNull(eauto);
        Assert.Equal("TENDER NUMBER", eauto.Record.OtherCharges.Single().Description);
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
        var legacyHeaders = new[] { "NAME", "IC NO.", "VEHICLE NO.", "EXP DATE", "INSURANCE", "COVERAGE", "NCD", "RENEWAL/NEW", "REMARK", "Customer Phone Number" };
        var layouts = new[] { InsuranceRules.ImportHeaders, legacyHeaders, legacyHeaders[..9] };
        for (var i = 0; i < layouts.Length; i++)
        {
            var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["NAME"] = "Synthetic import", ["IC NO."] = "001122334455", ["CUSTOMER PHONE NUMBER"] = "001234567890",
                ["VEHICLE NO."] = $"IMPMAP{i}", ["EXP DATE"] = "2/10/2027", ["INSURANCE"] = "TEST INSURER",
                ["COVERAGE"] = "COMPREHENSIVE", ["NCD"] = "55", ["RENEWAL/NEW"] = "R", ["REMARK"] = "synthetic import"
            };
            var import = new InsuranceImportRequest(layouts[i], [layouts[i].Select(header => values[header]).ToArray()], $"header-map-{i}");
            var importPreview = await client.PostAsJsonAsync("/api/insurance/import/preview", import);
            Assert.Empty((await importPreview.Content.ReadFromJsonAsync<InsuranceImportPreview>())!.Errors);
            var confirmedImport = await client.PostAsJsonAsync("/api/insurance/import/confirm", import);
            Assert.Equal(HttpStatusCode.OK, confirmedImport.StatusCode);
            var imported = Assert.Single((await confirmedImport.Content.ReadFromJsonAsync<InsuranceCase[]>())!);
            var persisted = (await client.GetFromJsonAsync<InsuranceCaseView>($"/api/insurance/{imported.Id}"))!.Record;
            Assert.Equal("001122334455", persisted.IdentityNumber); Assert.Equal($"IMPMAP{i}", persisted.PlateNumber);
            Assert.Equal(i == 2 ? null : "001234567890", persisted.CustomerPhone);
        }
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
    public void Import_maps_preferred_legacy_and_no_phone_headers_without_shifting_personal_data()
    {
        var preferred = new[] { "NAME", "IC NO.", "CUSTOMER PHONE NUMBER", "VEHICLE NO.", "EXP DATE", "INSURANCE", "COVERAGE", "NCD", "RENEWAL/NEW", "REMARK" };
        var legacy = new[] { "NAME", "IC NO.", "VEHICLE NO.", "EXP DATE", "INSURANCE", "COVERAGE", "NCD", "RENEWAL/NEW", "REMARK", "Customer Phone Number" };
        var values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["NAME"] = "Synthetic customer", ["IC NO."] = "001122334455", ["CUSTOMER PHONE NUMBER"] = "001234567890",
            ["VEHICLE NO."] = "test123", ["EXP DATE"] = "2/10/2026", ["INSURANCE"] = "TEST INSURER",
            ["COVERAGE"] = "COMPREHENSIVE", ["NCD"] = "55", ["RENEWAL/NEW"] = "R (MOTOR)", ["REMARK"] = "source remark"
        };
        foreach (var headers in new[] { preferred, legacy, legacy[..9], preferred.Reverse().ToArray() })
        {
            var preview = InsuranceRules.PreviewImport(new(headers, [headers.Select(header => values[header]).ToArray()]));
            Assert.Empty(preview.Errors); var item = Assert.Single(preview.Records);
            Assert.Equal("Synthetic customer", item.CustomerName); Assert.Equal("001122334455", item.IdentityNumber);
            Assert.Equal("TEST123", item.PlateNumber); Assert.Equal(new DateOnly(2026, 10, 2), item.ExpiryDate);
            Assert.Equal("TEST INSURER", item.Insurer); Assert.Equal("COMPREHENSIVE", item.Coverage); Assert.Equal(55m, item.Ncd);
            Assert.Equal(headers.Length == 9 ? null : "001234567890", item.CustomerPhone);
            Assert.Contains("source remark", item.Remark); Assert.Contains("R (MOTOR)", item.Remark);
        }
        var blankPhone = preferred.Select(header => header == "CUSTOMER PHONE NUMBER" ? "" : values[header]).ToArray();
        var blank = InsuranceRules.PreviewImport(new(preferred, [blankPhone]));
        Assert.Empty(blank.Errors); Assert.Null(blank.Records.Single().CustomerPhone);
        var renewalIndex = Array.IndexOf(preferred, "RENEWAL/NEW");
        var invalidRenewal = blankPhone.ToArray(); invalidRenewal[renewalIndex] = "RUBBISH";
        Assert.NotEmpty(InsuranceRules.PreviewImport(new(preferred, [invalidRenewal])).Errors);
        var duplicateHeaders = preferred.ToArray(); duplicateHeaders[2] = "ic no.";
        Assert.NotEmpty(InsuranceRules.PreviewImport(new(duplicateHeaders, [blankPhone])).Errors);
        var unknownHeaders = preferred.ToArray(); unknownHeaders[2] = "UNKNOWN PHONE";
        Assert.NotEmpty(InsuranceRules.PreviewImport(new(unknownHeaders, [blankPhone])).Errors);
        Assert.NotEmpty(InsuranceRules.PreviewImport(new(preferred.Where(header => header != "IC NO.").ToArray(), [blankPhone[..9]])).Errors);
        Assert.NotEmpty(InsuranceRules.PreviewImport(new(preferred, [blankPhone[..9]])).Errors);
        Assert.NotEmpty(InsuranceRules.PreviewImport(new(legacy[..9], [blankPhone])).Errors);
        Assert.NotEmpty(InsuranceRules.PreviewImport(new(preferred, [blankPhone, blankPhone])).Errors);
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
