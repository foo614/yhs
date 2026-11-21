using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using Xunit;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Tests;

/// Exercises the document endpoints through the real auth and route pipeline.
/// The test uses an isolated PostgreSQL database and never sends OCR/WhatsApp traffic.
public sealed class LoanDocumentAuthorizationPostgresTests
{
    // Prevent partial buyer/IC saves, unauthorized broker intake, and duplicate financial cases.
    [Fact]
    public async Task Buyer_intake_is_atomic_authorized_and_retry_safe_for_finance_and_cash()
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES"));
        if (string.IsNullOrWhiteSpace(connection.Host)) return;
        Assert.Contains(connection.Host, new[] { "127.0.0.1", "localhost" });
        Assert.Equal("whatsapp_ci", connection.Database);
        var database = "loan_intake_" + Guid.NewGuid().ToString("N");
        connection.Pooling = false;
        await using var adminConnection = new NpgsqlConnection(connection.ConnectionString);
        await adminConnection.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", adminConnection)) await create.ExecuteNonQueryAsync();
        connection.Database = database;
        var environmentKeys = new[] { "ConnectionStrings__Default", "SeedData__Enabled", "SeedAdmin__Email", "SeedAdmin__Password", "Worker__Enabled", "WhatsApp__SendingEnabled", "WhatsApp__CaptureEnabled" };
        var previous = environmentKeys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
        try
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__Default", connection.ConnectionString);
            Environment.SetEnvironmentVariable("SeedData__Enabled", "true");
            Environment.SetEnvironmentVariable("SeedAdmin__Email", "admin@example.test");
            Environment.SetEnvironmentVariable("SeedAdmin__Password", "Synthetic-CI-123!");
            Environment.SetEnvironmentVariable("Worker__Enabled", "false");
            Environment.SetEnvironmentVariable("WhatsApp__SendingEnabled", "false");
            Environment.SetEnvironmentVariable("WhatsApp__CaptureEnabled", "false");
            await using var factory = new LoanDocumentApplicationFactory();
            using var admin = factory.CreateClient();
            Assert.True((await admin.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "admin@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
            var brokerId = await CreateStaffAsync(admin, "intake-broker@example.test", "Sales");
            await CreateStaffAsync(admin, "intake-other@example.test", "Sales");
            await CreateStaffAsync(admin, "intake-loan@example.test", "Loan");
            using var broker = factory.CreateClient();
            using var other = factory.CreateClient();
            using var loanStaff = factory.CreateClient();
            foreach (var (client, email) in new[] { (broker, "intake-broker@example.test"), (other, "intake-other@example.test"), (loanStaff, "intake-loan@example.test") })
                Assert.True((await client.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email, password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
            var vehicle = new Vehicle { PlateNumber = "INTAKE-1", Make = "Synthetic", Model = "Intake", Year = 2026, SalesAgentUserId = brokerId };
            var cashVehicle = vehicle with { Id = Guid.NewGuid(), PlateNumber = "INTAKE-CASH" };
            int originalCustomers;
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.AddRange(vehicle, cashVehicle);
                await db.SaveChangesAsync();
                originalCustomers = await db.Customers.CountAsync();
            }
            var input = new YSHeng.Api.Features.LoanBuyerIntakeInput(vehicle.Id, false, null, "Synthetic Intake Buyer", "900101000001", "0109999001", "Synthetic address", null, 45000m, null, NewLoanId: Guid.NewGuid());
            Assert.Equal(HttpStatusCode.Forbidden, (await PostIntakeAsync(other, input)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await PostIntakeAsync(loanStaff, input)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await PostIntakeAsync(broker, input with { FinalSellingPrice = null })).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await PostIntakeAsync(broker, input, invalidFile: true)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await PostIntakeAsync(broker, input, omitFile: true)).StatusCode);
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                Assert.Equal(originalCustomers, await db.Customers.CountAsync());
                Assert.False(await db.LoanApplications.AnyAsync(row => row.VehicleId == vehicle.Id));
                Assert.False(await db.DocumentBlobs.AnyAsync(row => row.VehicleId == vehicle.Id));
                Assert.Null((await db.Vehicles.FindAsync(vehicle.Id))!.CustomerId);
            }
            var concurrentCreates = await Task.WhenAll(PostIntakeAsync(broker, input), PostIntakeAsync(broker, input));
            using var created = concurrentCreates[0];
            using var concurrentReplay = concurrentCreates[1];
            Assert.Equal(HttpStatusCode.OK, created.StatusCode);
            Assert.Equal(HttpStatusCode.OK, concurrentReplay.StatusCode);
            var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
            jsonOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
            var result = await created.Content.ReadFromJsonAsync<YSHeng.Api.Features.LoanBuyerIntakeResult>(jsonOptions);
            Assert.NotNull(result!.Loan);
            Assert.Equal(LoanStatus.Pending, result.Loan.Status);
            Assert.Equal(input.NewLoanId, result.Loan.Id);
            Assert.Equal(HttpStatusCode.OK, (await PostIntakeAsync(broker, input)).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await PostIntakeAsync(broker, input with { CustomerId = result.Customer.Id, NewLoanId = Guid.NewGuid() })).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await PostIntakeAsync(broker, input with { FinalSellingPrice = 46000m })).StatusCode);
            var cashInput = input with { VehicleId = cashVehicle.Id, CashBuyer = true, CustomerId = result.Customer.Id, FinalSellingPrice = null, NewLoanId = null };
            Assert.Equal(HttpStatusCode.BadRequest, (await PostIntakeAsync(admin, cashInput with { IdentityCardDocumentId = Guid.NewGuid() }, omitFile: true)).StatusCode);
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                cashInput = cashInput with { IdentityCardDocumentId = await db.DocumentBlobs.Where(row => row.VehicleId == vehicle.Id && row.Category == FileCategory.IdentityCard).Select(row => row.Id).SingleAsync() };
            }
            using var cashCreated = await PostIntakeAsync(admin, cashInput, omitFile: true);
            Assert.Equal(HttpStatusCode.OK, cashCreated.StatusCode);
            var cashResult = await cashCreated.Content.ReadFromJsonAsync<YSHeng.Api.Features.LoanBuyerIntakeResult>(jsonOptions);
            Assert.Null(cashResult!.Loan);
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                Assert.Equal(originalCustomers + 1, await db.Customers.CountAsync());
                Assert.Equal(1, await db.LoanApplications.CountAsync(row => row.VehicleId == vehicle.Id));
                Assert.False(await db.LoanApplications.AnyAsync(row => row.VehicleId == cashVehicle.Id));
                Assert.Equal(1, await db.DocumentBlobs.CountAsync(row => row.VehicleId == vehicle.Id && row.CustomerId == result.Customer.Id && row.UploadedBy == brokerId));
                Assert.Equal(result.Customer.Id, (await db.Vehicles.FindAsync(cashVehicle.Id))!.CustomerId);
                Assert.Equal(VehicleStatus.LoanProcessing, (await db.Vehicles.FindAsync(vehicle.Id))!.Status);
                Assert.True(await db.AuditLogs.AnyAsync(row => row.EntityId == result.Loan.Id && row.Actor == "intake-broker@example.test"));
            }
            // A historical buyer VOC must not consume the first upload or replace a deleted original.
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.DocumentBlobs.Add(new DocumentBlob { VehicleId = vehicle.Id, CustomerId = result.Customer.Id, Category = FileCategory.Voc });
                await db.SaveChangesAsync();
            }
            var documentPath = $"/api/vehicles/{vehicle.Id}/documents?loanApplicationId={result.Loan!.Id}&category=";
            async Task<HttpResponseMessage> UploadAsync(string category)
            {
                using var form = new MultipartFormDataContent();
                var file = new ByteArrayContent("%PDF-1.4 synthetic document"u8.ToArray());
                file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
                form.Add(file, "file", "synthetic.pdf");
                return await admin.PostAsync(documentPath + category, form);
            }
            using var prematureEdit = await UploadAsync("LoanEditedDocument");
            Assert.Equal(HttpStatusCode.Conflict, prematureEdit.StatusCode);
            using var originalUpload = await UploadAsync("LoanOriginalDocument");
            Assert.Equal(HttpStatusCode.Created, originalUpload.StatusCode);
            using var originalJson = JsonDocument.Parse(await originalUpload.Content.ReadAsStringAsync());
            var originalId = originalJson.RootElement.GetProperty("id").GetGuid();
            using var duplicateOriginal = await UploadAsync("LoanOriginalDocument");
            Assert.Equal(HttpStatusCode.Conflict, duplicateOriginal.StatusCode);
            using var editUpload = await UploadAsync("LoanEditedDocument");
            Assert.Equal(HttpStatusCode.Created, editUpload.StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/vehicles/{vehicle.Id}/loan-documents/{originalId}")).StatusCode);
            using var check = JsonDocument.Parse(await admin.GetStringAsync($"/api/loans/{result.Loan.Id}/document-check"));
            Assert.False(check.RootElement.GetProperty("isComplete").GetBoolean());

            LoanStatus statusBeforePreview;
            bool louApprovedBeforePreview;
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var loan = await db.LoanApplications.FindAsync(result.Loan.Id);
                statusBeforePreview = loan!.Status;
                louApprovedBeforePreview = loan.LouApproved;
            }
            async Task<Guid> UploadLouPreviewAsync()
            {
                using var form = new MultipartFormDataContent();
                var file = new ByteArrayContent(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="));
                file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
                form.Add(file, "file", "synthetic-lou.png");
                using var response = await admin.PostAsync($"/api/vehicles/{vehicle.Id}/documents?category=LoanDocument&loanApplicationId={result.Loan.Id}&louPreview=true", form);
                Assert.Equal(HttpStatusCode.Created, response.StatusCode);
                using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
                return json.RootElement.GetProperty("id").GetGuid();
            }
            var previewDocumentId = await UploadLouPreviewAsync();
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var loan = await db.LoanApplications.FindAsync(result.Loan.Id);
                Assert.Equal(statusBeforePreview, loan!.Status);
                Assert.Equal(louApprovedBeforePreview, loan.LouApproved);
            }
            foreach (var unauthorized in new[] { broker, loanStaff })
            {
                using var denied = await unauthorized.PostAsJsonAsync($"/api/loans/{result.Loan.Id}/banks/from-document/{previewDocumentId}",
                    new { bankName = "Synthetic Bank", loanAmount = 45000m, interestRate = 3.5m, tenureMonths = 84, useAsFinal = true });
                Assert.Equal(HttpStatusCode.Forbidden, denied.StatusCode);
            }
            using var incompleteReview = await admin.PostAsJsonAsync($"/api/loans/{result.Loan.Id}/banks/from-document/{previewDocumentId}", new { bankName = "Synthetic Bank", loanAmount = 0m, interestRate = 3.5m, tenureMonths = 84, terms = "Terms" });
            Assert.Equal(HttpStatusCode.BadRequest, incompleteReview.StatusCode);
            using var review = await admin.PostAsJsonAsync($"/api/loans/{result.Loan.Id}/banks/from-document/{previewDocumentId}", new { bankName = "Synthetic Bank", loanAmount = 45000m, interestRate = 3.5m, tenureMonths = 84, terms = "Terms", useAsFinal = true });
            Assert.Equal(HttpStatusCode.Created, review.StatusCode);
            using var reviewJson = JsonDocument.Parse(await review.Content.ReadAsStringAsync());
            var reviewedBankId = reviewJson.RootElement.GetProperty("id").GetGuid();
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var loan = await db.LoanApplications.FindAsync(result.Loan.Id);
                Assert.Equal(LoanStatus.Approved, loan!.Status);
                Assert.True(loan.LouApproved);
                Assert.Equal("Synthetic Bank", loan.LoanBank);
                Assert.Equal(45000m, loan.LoanAmount);
                Assert.Equal(3.5m, loan.InterestRate);
                Assert.Equal(84, loan.LoanTenureMonths);
                Assert.Equal("Terms", loan.LoanTerms);
            }
            using var replay = await admin.PostAsJsonAsync($"/api/loans/{result.Loan.Id}/banks/from-document/{previewDocumentId}", new { bankName = "Synthetic Bank", loanAmount = 45000m, interestRate = 3.5m, tenureMonths = 84, terms = "Terms" });
            Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
            Assert.Equal(reviewedBankId, JsonDocument.Parse(await replay.Content.ReadAsStringAsync()).RootElement.GetProperty("id").GetGuid());
            var duplicatePreviewId = await UploadLouPreviewAsync();
            using var duplicateBank = await admin.PostAsJsonAsync($"/api/loans/{result.Loan.Id}/banks/from-document/{duplicatePreviewId}", new { bankName = "Synthetic Bank", loanAmount = 45000m, interestRate = 3.5m, tenureMonths = 84, terms = "Terms" });
            Assert.Equal(HttpStatusCode.BadRequest, duplicateBank.StatusCode);
            using var secondBank = await admin.PostAsJsonAsync($"/api/loans/{result.Loan.Id}/banks", new { loanApplicationId = result.Loan.Id, bankName = "Second Bank", loanAmount = 40000m, interestRate = 4m, tenureMonths = 60, terms = "Second terms" });
            Assert.Equal(HttpStatusCode.Created, secondBank.StatusCode);
            using var secondBankJson = JsonDocument.Parse(await secondBank.Content.ReadAsStringAsync());
            var secondBankId = secondBankJson.RootElement.GetProperty("id").GetGuid();
            var secondPreviewId = await UploadLouPreviewAsync();
            using var conflictingFinal = await admin.PostAsJsonAsync($"/api/loans/{result.Loan.Id}/banks/from-document/{secondPreviewId}", new { bankName = "Second Bank", loanAmount = 40000m, interestRate = 4m, tenureMonths = 60, terms = "Second terms", useAsFinal = true });
            Assert.Equal(HttpStatusCode.Conflict, conflictingFinal.StatusCode);
            using var secondReview = await admin.PostAsJsonAsync($"/api/loans/{result.Loan.Id}/banks/from-document/{secondPreviewId}", new { bankName = "Second Bank", bankOptionId = secondBankId, loanAmount = 40000m, interestRate = 4m, tenureMonths = 60, terms = "Second terms" });
            Assert.Equal(HttpStatusCode.Created, secondReview.StatusCode);
            var editedPreviewId = await UploadLouPreviewAsync();
            using var editedReview = await admin.PostAsJsonAsync($"/api/loans/{result.Loan.Id}/banks/from-document/{editedPreviewId}", new { bankName = "Second Bank", bankOptionId = secondBankId, loanAmount = 41000m, interestRate = 4m, tenureMonths = 60, terms = "Edited terms" });
            Assert.Equal(HttpStatusCode.Created, editedReview.StatusCode);
            using var editedReviewJson = JsonDocument.Parse(await editedReview.Content.ReadAsStringAsync());
            Assert.Equal(secondPreviewId, editedReviewJson.RootElement.GetProperty("louDocumentId").GetGuid());
            Assert.Equal(editedPreviewId, editedReviewJson.RootElement.GetProperty("editedLouDocumentId").GetGuid());
            using var editedReplay = await admin.PostAsJsonAsync($"/api/loans/{result.Loan.Id}/banks/from-document/{editedPreviewId}", new { bankOptionId = secondBankId });
            Assert.Equal(HttpStatusCode.OK, editedReplay.StatusCode);
            using var wrongBankReplay = await admin.PostAsJsonAsync($"/api/loans/{result.Loan.Id}/banks/from-document/{editedPreviewId}", new { bankOptionId = reviewedBankId });
            Assert.Equal(HttpStatusCode.Conflict, wrongBankReplay.StatusCode);
        }
        finally
        {
            foreach (var (key, value) in previous) Environment.SetEnvironmentVariable(key, value);
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", adminConnection);
            await drop.ExecuteNonQueryAsync();
        }
    }

    private static Task<HttpResponseMessage> PostIntakeAsync(HttpClient client, YSHeng.Api.Features.LoanBuyerIntakeInput input, bool invalidFile = false, bool omitFile = false)
    {
        var form = new MultipartFormDataContent();
        form.Add(JsonContent.Create(input), "input");
        if (!omitFile)
        {
            var bytes = invalidFile ? new byte[] { 1, 2, 3 } : Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=");
            var file = new ByteArrayContent(bytes);
            file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
            form.Add(file, "identityCard", "synthetic-ic.png");
        }
        return client.PostAsync("/api/loans/intake", form);
    }

    [Fact]
    public async Task Non_taker_loan_staff_and_other_broker_cannot_read_or_review_linked_case_documents()
    {
        var connection = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES"));
        if (string.IsNullOrWhiteSpace(connection.Host)) return;
        Assert.Contains(connection.Host, new[] { "127.0.0.1", "localhost" });
        Assert.Equal("whatsapp_ci", connection.Database);

        var database = "loan_document_auth_" + Guid.NewGuid().ToString("N");
        connection.Pooling = false;
        await using var adminConnection = new NpgsqlConnection(connection.ConnectionString);
        await adminConnection.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", adminConnection)) await create.ExecuteNonQueryAsync();
        connection.Database = database;

        var environmentKeys = new[] { "ConnectionStrings__Default", "SeedData__Enabled", "SeedAdmin__Email", "SeedAdmin__Password", "Worker__Enabled", "WhatsApp__SendingEnabled", "WhatsApp__CaptureEnabled" };
        var previous = environmentKeys.ToDictionary(key => key, Environment.GetEnvironmentVariable);
        try
        {
            Environment.SetEnvironmentVariable("ConnectionStrings__Default", connection.ConnectionString);
            Environment.SetEnvironmentVariable("SeedData__Enabled", "true");
            Environment.SetEnvironmentVariable("SeedAdmin__Email", "admin@example.test");
            Environment.SetEnvironmentVariable("SeedAdmin__Password", "Synthetic-CI-123!");
            Environment.SetEnvironmentVariable("Worker__Enabled", "false");
            Environment.SetEnvironmentVariable("WhatsApp__SendingEnabled", "false");
            Environment.SetEnvironmentVariable("WhatsApp__CaptureEnabled", "false");

            await using var factory = new LoanDocumentApplicationFactory();
            using var admin = factory.CreateClient();
            Assert.True((await admin.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "admin@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
            var loanTakerId = await CreateStaffAsync(admin, "loan-taker@example.test", "Loan");
            var otherLoanId = await CreateStaffAsync(admin, "loan-other@example.test", "Loan");
            var brokerId = await CreateStaffAsync(admin, "broker-a@example.test", "Sales");
            var otherBrokerId = await CreateStaffAsync(admin, "broker-b@example.test", "Sales");

            var fixture = await SeedCaseAsync(factory.Services, loanTakerId, brokerId);
            using var otherLoan = factory.CreateClient();
            using var otherBroker = factory.CreateClient();
            Assert.True((await otherLoan.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "loan-other@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
            Assert.True((await otherBroker.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "broker-b@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);

            await AssertDocumentHiddenAsync(otherLoan, fixture.VehicleId, fixture.EditedDocumentId, fixture.EditedJobId);
            await AssertDocumentHiddenAsync(otherBroker, fixture.VehicleId, fixture.OriginalDocumentId, fixture.OriginalJobId);

            // Bank workflow regression: no actor may bypass bank submission, LOU proof or final terms selection.
            using var broker = factory.CreateClient();
            Assert.True((await broker.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "broker-a@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
            Guid loanId;
            using (var scope = factory.Services.CreateScope()) loanId = await scope.ServiceProvider.GetRequiredService<AppDbContext>().LoanApplications.Where(row => row.VehicleId == fixture.VehicleId).Select(row => row.Id).SingleAsync();
            var bankPath = $"/api/loans/{loanId}/banks";
            Assert.Equal(HttpStatusCode.OK, (await broker.GetAsync(bankPath)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await otherLoan.GetAsync(bankPath)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await broker.PostAsJsonAsync(bankPath, new LoanBankOption { BankName = "Forbidden" })).StatusCode);
            using var bankResponse = await admin.PostAsJsonAsync(bankPath, new LoanBankOption { BankName = "Synthetic Bank" });
            Assert.Equal(HttpStatusCode.Created, bankResponse.StatusCode);
            var bank = await bankResponse.Content.ReadFromJsonAsync<LoanBankOption>(new JsonSerializerOptions(JsonSerializerDefaults.Web) { Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() } });
            var actionPath = bankPath + $"/{bank!.Id}";
            Assert.Equal(HttpStatusCode.BadRequest, (await broker.PostAsync(actionPath + "/select-final", null)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync(actionPath + "/approve", null)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync(actionPath + "/submit", null)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync(actionPath + "/approve", null)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await broker.PostAsync(actionPath + "/approve", null)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await otherLoan.PostAsync(actionPath + "/approve", null)).StatusCode);
            async Task<HttpResponseMessage> UploadBankLouAsync(bool edited = false)
            {
                using var form = new MultipartFormDataContent();
                var file = new ByteArrayContent(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="));
                file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
                form.Add(file, "file", edited ? "edited-lou.png" : "original-lou.png");
                return await admin.PostAsync($"/api/vehicles/{fixture.VehicleId}/documents?category=LoanDocument&loanApplicationId={loanId}&loanBankOptionId={bank.Id}&louEdited={edited}", form);
            }
            using var prematureEditedLou = await UploadBankLouAsync(edited: true);
            Assert.Equal(HttpStatusCode.BadRequest, prematureEditedLou.StatusCode);
            using var louForm = new MultipartFormDataContent();
            var louFile = new ByteArrayContent(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="));
            louFile.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
            louForm.Add(louFile, "file", "synthetic-lou.png");
            using var louResponse = await admin.PostAsync($"/api/vehicles/{fixture.VehicleId}/documents?category=LoanDocument&loanApplicationId={loanId}&loanBankOptionId={bank.Id}", louForm);
            Assert.True(louResponse.StatusCode == HttpStatusCode.Created, await louResponse.Content.ReadAsStringAsync());
            using var louJson = JsonDocument.Parse(await louResponse.Content.ReadAsStringAsync());
            var originalLouId = louJson.RootElement.GetProperty("id").GetGuid();
            using (var scope = factory.Services.CreateScope()) Assert.Equal(LoanStatus.Submitted, (await scope.ServiceProvider.GetRequiredService<AppDbContext>().LoanApplications.FindAsync(loanId))!.Status);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsync(actionPath + "/approve", null)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync(actionPath, bank with { LoanAmount = 40000, InterestRate = 3, TenureMonths = 60 })).StatusCode);
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                Assert.Equal(LoanBankOptionStatus.Submitted, (await db.LoanBankOptions.FindAsync(bank.Id))!.Status);
                Assert.Equal(1, await db.DocumentBlobs.CountAsync(row => row.LoanApplicationId == loanId && row.Category == FileCategory.LoanDocument));
            }
            using var taker = factory.CreateClient();
            Assert.True((await taker.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "loan-taker@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
            Assert.Equal(HttpStatusCode.OK, (await taker.PostAsync(actionPath + "/approve", null)).StatusCode);
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var approved = (await db.LoanBankOptions.FindAsync(bank.Id))!;
                Assert.Equal(LoanBankOptionStatus.Approved, approved.Status);
                Assert.Equal(originalLouId, approved.LouDocumentId);
                Assert.Null(approved.EditedLouDocumentId);
                Assert.False(approved.IsSelected);
                Assert.Equal(1, await db.DocumentBlobs.CountAsync(row => row.LoanApplicationId == loanId && row.Category == FileCategory.LoanDocument));
            }
            using var replacementOriginal = await UploadBankLouAsync();
            Assert.Equal(HttpStatusCode.Conflict, replacementOriginal.StatusCode);
            using var editedLou = await UploadBankLouAsync(edited: true);
            Assert.True(editedLou.StatusCode == HttpStatusCode.Created, await editedLou.Content.ReadAsStringAsync());
            using var editedLouJson = JsonDocument.Parse(await editedLou.Content.ReadAsStringAsync());
            var editedLouId = editedLouJson.RootElement.GetProperty("id").GetGuid();
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var approved = (await db.LoanBankOptions.FindAsync(bank.Id))!;
                Assert.Equal(originalLouId, approved.LouDocumentId);
                Assert.Equal(editedLouId, approved.EditedLouDocumentId);
                Assert.Equal(2, await db.DocumentBlobs.CountAsync(row => row.LoanApplicationId == loanId && row.Category == FileCategory.LoanDocument));
            }
            foreach (var evidenceId in new[] { originalLouId, editedLouId })
            {
                Assert.Equal(HttpStatusCode.OK, (await taker.GetAsync($"/api/vehicles/{fixture.VehicleId}/documents/{evidenceId}/content")).StatusCode);
                Assert.Equal(HttpStatusCode.BadRequest, (await admin.DeleteAsync($"/api/vehicles/{fixture.VehicleId}/loan-documents/{evidenceId}")).StatusCode);
            }
            Assert.Equal(HttpStatusCode.OK, (await broker.PostAsync(actionPath + "/select-final", null)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await taker.PostAsync(actionPath + "/approve", null)).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await otherBroker.PostAsync(actionPath + "/select-final", null)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync($"/api/loans/{loanId}/decision", new LoanDecisionRequest(LoanStatus.Approved, null))).StatusCode);
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var selectedLoan = await db.LoanApplications.FindAsync(loanId);
                Assert.Equal(LoanStatus.Approved, selectedLoan!.Status);
                Assert.Equal(40000, selectedLoan.LoanAmount);
                Assert.Equal("Synthetic Bank", selectedLoan.LoanBank);
                Assert.True((await db.LoanBankOptions.FindAsync(bank.Id))!.IsSelected);
            }

            // Manual decisions must not accept checklist files, edited-only proof or another case's LOU.
            var invalidCaseLou = new DocumentBlob { VehicleId = fixture.VehicleId, Category = FileCategory.LoanDocument };
            var invalidVehicleLou = new DocumentBlob { LoanApplicationId = loanId, Category = FileCategory.LoanDocument };
            var blockedBank = new LoanBankOption { LoanApplicationId = loanId, BankName = "Evidence guard bank", LoanAmount = 40000, InterestRate = 3, TenureMonths = 60, Status = LoanBankOptionStatus.Submitted, SubmittedAt = DateTime.UtcNow, EditedLouDocumentId = editedLouId };
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.AddRange(invalidCaseLou, invalidVehicleLou, blockedBank);
                await db.SaveChangesAsync();
            }
            var blockedAction = bankPath + $"/{blockedBank.Id}/approve";
            foreach (Guid? invalidOriginal in new Guid?[] { null, fixture.OriginalDocumentId, invalidCaseLou.Id, invalidVehicleLou.Id })
            {
                using (var scope = factory.Services.CreateScope())
                {
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var current = (await db.LoanBankOptions.FindAsync(blockedBank.Id))!;
                    db.Entry(current).CurrentValues.SetValues(current with { LouDocumentId = invalidOriginal });
                    await db.SaveChangesAsync();
                }
                Assert.Equal(HttpStatusCode.BadRequest, (await taker.PostAsync(blockedAction, null)).StatusCode);
            }
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var current = (await db.LoanBankOptions.FindAsync(blockedBank.Id))!;
                db.Entry(current).CurrentValues.SetValues(current with { LouDocumentId = originalLouId });
                var vehicle = (await db.Vehicles.FindAsync(fixture.VehicleId))!;
                db.Entry(vehicle).CurrentValues.SetValues(vehicle with { CustomerId = null });
                await db.SaveChangesAsync();
            }
            Assert.Equal(HttpStatusCode.Conflict, (await taker.PostAsync(blockedAction, null)).StatusCode);
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var currentLoan = (await db.LoanApplications.FindAsync(loanId))!;
                var vehicle = (await db.Vehicles.FindAsync(fixture.VehicleId))!;
                db.Entry(vehicle).CurrentValues.SetValues(vehicle with { CustomerId = currentLoan.CustomerId });
                db.Entry(currentLoan).CurrentValues.SetValues(currentLoan with { Status = LoanStatus.Done });
                await db.SaveChangesAsync();
            }
            Assert.Equal(HttpStatusCode.BadRequest, (await taker.PostAsync(blockedAction, null)).StatusCode);
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var currentLoan = (await db.LoanApplications.FindAsync(loanId))!;
                db.Entry(currentLoan).CurrentValues.SetValues(currentLoan with { Status = LoanStatus.Approved });
                await db.SaveChangesAsync();
            }

            // A rejected bank is terminal, and only the last rejected active bank rejects the case.
            var rejectionLoan = new LoanApplication { Status = LoanStatus.Pending, SubmittedAt = DateOnly.FromDateTime(DateTime.UtcNow), TakenByUserId = loanTakerId };
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var source = await db.LoanApplications.FindAsync(loanId);
                var rejectionVehicle = new Vehicle { PlateNumber = "REJECT-BANKS", Make = "Synthetic", Model = "Rejection", Year = 2026, CustomerId = source!.CustomerId, SalesAgentUserId = brokerId };
                rejectionLoan = rejectionLoan with { VehicleId = rejectionVehicle.Id, CustomerId = source.CustomerId };
                db.AddRange(rejectionVehicle, rejectionLoan);
                await db.SaveChangesAsync();
            }
            var rejectedBanks = new List<LoanBankOption>();
            foreach (var name in new[] { "Rejected A", "Rejected B" })
            {
                using var createdBank = await admin.PostAsJsonAsync($"/api/loans/{rejectionLoan.Id}/banks", new LoanBankOption { BankName = name });
                Assert.Equal(HttpStatusCode.Created, createdBank.StatusCode);
                var rejectionBank = (await createdBank.Content.ReadFromJsonAsync<LoanBankOption>(new JsonSerializerOptions(JsonSerializerDefaults.Web) { Converters = { new System.Text.Json.Serialization.JsonStringEnumConverter() } }))!;
                rejectedBanks.Add(rejectionBank);
                Assert.Equal(HttpStatusCode.OK, (await admin.PostAsync($"/api/loans/{rejectionLoan.Id}/banks/{rejectionBank.Id}/submit", null)).StatusCode);
            }
            for (var index = 0; index < rejectedBanks.Count; index++)
            {
                var rejectionBank = rejectedBanks[index];
                var rejectionPath = $"/api/loans/{rejectionLoan.Id}/banks/{rejectionBank.Id}";
                Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync(rejectionPath + "/reject", new { rejectionReason = "Synthetic bank decline" })).StatusCode);
                Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync(rejectionPath, rejectionBank with { LoanAmount = 40000, InterestRate = 3, TenureMonths = 60 })).StatusCode);
                using var scope = factory.Services.CreateScope();
                Assert.Equal(index == 0 ? LoanStatus.Submitted : LoanStatus.Rejected, (await scope.ServiceProvider.GetRequiredService<AppDbContext>().LoanApplications.FindAsync(rejectionLoan.Id))!.Status);
            }

            // An unlinked legacy VOC remains available to an authorized intake role.
            using var vehicleDocs = JsonDocument.Parse(await otherBroker.GetStringAsync($"/api/vehicles/{fixture.VehicleId}/documents"));
            Assert.Contains(vehicleDocs.RootElement.EnumerateArray(), row => row.GetProperty("id").GetGuid() == fixture.LegacyVocId);
            await AssertDeliveryVocPrivacyAsync(factory, admin);
        }
        finally
        {
            foreach (var (key, value) in previous) Environment.SetEnvironmentVariable(key, value);
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", adminConnection);
            await drop.ExecuteNonQueryAsync();
        }
    }

    // Delivery must retain its buyer-owned VOC without gaining access to Loan evidence.
    private static async Task AssertDeliveryVocPrivacyAsync(LoanDocumentApplicationFactory factory, HttpClient admin)
    {
        var deliveryUserId = await CreateStaffAsync(admin, "delivery-voc@example.test", "Delivery");
        using var deliveryClient = factory.CreateClient();
        Assert.True((await deliveryClient.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "delivery-voc@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
        foreach (var financed in new[] { false, true })
        {
            var customer = new Customer { Name = "Synthetic delivery VOC buyer", Phone = financed ? "0100000071" : "0100000072" };
            var vehicle = new Vehicle { PlateNumber = financed ? "DEL-VOC-FIN" : "DEL-VOC-CASH", Make = "Synthetic", Model = "Delivery", Year = 2026, CustomerId = customer.Id };
            var delivery = new DeliverySchedule { VehicleId = vehicle.Id, CustomerId = customer.Id, PicUserId = deliveryUserId, Pic = "Synthetic Delivery", ScheduledDate = new DateOnly(2026, 11, 20), Status = DeliveryStatus.Scheduled };
            var loan = new LoanApplication { VehicleId = vehicle.Id, CustomerId = customer.Id, Status = LoanStatus.Done, SubmittedAt = new DateOnly(2026, 11, 1) };
            var privateVoc = new DocumentBlob { VehicleId = vehicle.Id, CustomerId = customer.Id, LoanApplicationId = loan.Id, Category = FileCategory.Voc, OwnershipType = DocumentOwnershipType.Buyer, FileName = "loan-private.png", MimeType = "image/png", Content = [1, 2, 3], UploadedBy = "synthetic-loan" };
            using (var scope = factory.Services.CreateScope())
            {
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                db.AddRange(customer, vehicle, delivery);
                if (financed) db.AddRange(loan, privateVoc);
                await db.SaveChangesAsync();
            }
            using var form = new MultipartFormDataContent();
            var file = new ByteArrayContent(Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="));
            file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("image/png");
            form.Add(file, "file", "delivery-voc.png");
            using var upload = await deliveryClient.PostAsync($"/api/vehicles/{vehicle.Id}/documents?category=Voc&deliveryScheduleId={delivery.Id}", form);
            Assert.Equal(HttpStatusCode.Created, upload.StatusCode);
            using var uploadedJson = JsonDocument.Parse(await upload.Content.ReadAsStringAsync());
            var documentId = uploadedJson.RootElement.GetProperty("id").GetGuid();
            Assert.Equal(HttpStatusCode.OK, (await deliveryClient.GetAsync($"/api/vehicles/{vehicle.Id}/documents/{documentId}/content")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/api/vehicles/{vehicle.Id}/documents/{documentId}/content")).StatusCode);
            using var documents = JsonDocument.Parse(await deliveryClient.GetStringAsync($"/api/vehicles/{vehicle.Id}/documents"));
            Assert.Contains(documents.RootElement.EnumerateArray(), row => row.GetProperty("id").GetGuid() == documentId);
            if (financed)
            {
                Assert.DoesNotContain(documents.RootElement.EnumerateArray(), row => row.GetProperty("id").GetGuid() == privateVoc.Id);
                Assert.Equal(HttpStatusCode.Forbidden, (await deliveryClient.GetAsync($"/api/vehicles/{vehicle.Id}/documents/{privateVoc.Id}/content")).StatusCode);
            }
        }
    }

    private static async Task<string> CreateStaffAsync(HttpClient admin, string email, string role)
    {
        using var response = await admin.PostAsJsonAsync("/api/admin/users", new { email, displayName = email, password = "Synthetic-CI-123!", role });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return json.RootElement.GetProperty("id").GetString()!;
    }

    private static async Task<(Guid VehicleId, Guid OriginalDocumentId, Guid EditedDocumentId, Guid LegacyVocId, Guid OriginalJobId, Guid EditedJobId)> SeedCaseAsync(IServiceProvider services, string loanTakerId, string brokerId)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var customer = new Customer { Name = "Loan privacy test customer", Phone = "0100000000" };
        var vehicle = new Vehicle { PlateNumber = "AUTH-LOAN-1", Make = "Synthetic", Model = "Privacy", Year = 2026, CustomerId = customer.Id, SalesAgentUserId = brokerId, Status = VehicleStatus.LoanProcessing };
        var loan = new LoanApplication { VehicleId = vehicle.Id, CustomerId = customer.Id, Status = LoanStatus.Pending, SubmittedAt = new DateOnly(2026, 11, 1), TakenByUserId = loanTakerId, TakenByName = "Loan Taker" };
        var original = new DocumentBlob { VehicleId = vehicle.Id, CustomerId = customer.Id, LoanApplicationId = loan.Id, Category = FileCategory.LoanOriginalDocument, OwnershipType = DocumentOwnershipType.Buyer, FileName = "original.pdf", MimeType = "application/pdf", Content = [1, 2, 3], Checksum = Convert.ToHexString(SHA256.HashData([1, 2, 3])), UploadedBy = brokerId };
        var edited = new DocumentBlob { VehicleId = vehicle.Id, CustomerId = customer.Id, LoanApplicationId = loan.Id, Category = FileCategory.LoanEditedDocument, OwnershipType = DocumentOwnershipType.Buyer, FileName = "edited.pdf", MimeType = "application/pdf", Content = [4, 5, 6], Checksum = Convert.ToHexString(SHA256.HashData([4, 5, 6])), UploadedBy = loanTakerId };
        var legacy = new DocumentBlob { VehicleId = vehicle.Id, Category = FileCategory.Voc, OwnershipType = DocumentOwnershipType.Vehicle, FileName = "intake-voc.pdf", MimeType = "application/pdf", Content = [7, 8, 9], Checksum = Convert.ToHexString(SHA256.HashData([7, 8, 9])), UploadedBy = brokerId };
        var originalJob = new OcrJob { DocumentId = original.Id, Category = original.Category, Status = OcrJobStatus.NeedsReview, ResultJson = "{}" };
        var editedJob = new OcrJob { DocumentId = edited.Id, Category = edited.Category, Status = OcrJobStatus.NeedsReview, ResultJson = "{}" };
        db.AddRange(customer, vehicle, loan, original, edited, legacy, originalJob, editedJob);
        await db.SaveChangesAsync();
        return (vehicle.Id, original.Id, edited.Id, legacy.Id, originalJob.Id, editedJob.Id);
    }

    private static async Task AssertDocumentHiddenAsync(HttpClient client, Guid vehicleId, Guid documentId, Guid jobId)
    {
        using var list = JsonDocument.Parse(await client.GetStringAsync($"/api/vehicles/{vehicleId}/documents"));
        Assert.DoesNotContain(list.RootElement.EnumerateArray(), row => row.GetProperty("id").GetGuid() == documentId);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/vehicles/{vehicleId}/documents/{documentId}/content")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsync($"/api/documents/{documentId}/ocr-jobs", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PutAsJsonAsync($"/api/ocr-jobs/{jobId}/review", new { result = new { fields = new Dictionary<string, string?>() }, notes = "not-authorized" })).StatusCode);
    }

    private sealed class LoanDocumentApplicationFactory : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureLogging(logging => logging.ClearProviders());
        }
    }
}
