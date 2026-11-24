using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Npgsql;
using Xunit;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;

namespace YSHeng.Api.Tests;

public sealed class PendingDocumentReviewPostgresTests
{
    // Protect private document metadata and prevent stale resumed reviews from changing already-applied records.
    [PendingReviewPostgresFact]
    public async Task Pending_queue_is_authorized_actionable_and_resumes_original_jobs_without_duplicate_application()
    {
        var configuration = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES"));
        Assert.Contains(configuration.Host, new[] { "localhost", "127.0.0.1" });
        Assert.Equal("whatsapp_ci", configuration.Database);
        configuration.Pooling = false;
        var database = "pending_review_" + Guid.NewGuid().ToString("N");
        await using var adminConnection = new NpgsqlConnection(configuration.ConnectionString);
        await adminConnection.OpenAsync();
        await using (var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", adminConnection)) await create.ExecuteNonQueryAsync();
        configuration.Database = database;
        try
        {
            await using var factory = new PendingReviewApplicationFactory(configuration.ConnectionString);
            using var anonymous = factory.CreateClient();
            using var admin = factory.CreateClient();
            Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "review-admin@example.test", password = "Synthetic-CI-123!" })).StatusCode);
            using var staffCreation = await admin.PostAsJsonAsync("/api/admin/users", new { email = "review-repair@example.test", displayName = "Synthetic Repair", password = "Synthetic-CI-123!", role = "Repair" });
            Assert.Equal(HttpStatusCode.Created, staffCreation.StatusCode);
            using var repairStaff = factory.CreateClient();
            Assert.Equal(HttpStatusCode.OK, (await repairStaff.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "review-repair@example.test", password = "Synthetic-CI-123!" })).StatusCode);
            var fixture = await SeedAsync(factory.Services);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/dashboard/document-reviews")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/dashboard/document-reviews/{fixture.RepairJob.Id}")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await repairStaff.GetAsync("/api/dashboard/document-reviews")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await repairStaff.GetAsync($"/api/dashboard/document-reviews/{fixture.RepairJob.Id}")).StatusCode);

            using (var queue = JsonDocument.Parse(await admin.GetStringAsync("/api/dashboard/document-reviews")))
            {
                var rows = queue.RootElement.GetProperty("items").EnumerateArray().ToArray();
                Assert.True(new HashSet<Guid> { fixture.RepairJob.Id, fixture.LoanJob.Id }.SetEquals(rows.Select(row => row.GetProperty("jobId").GetGuid())));
                Assert.Equal(new[] { "items" }, queue.RootElement.EnumerateObject().Select(property => property.Name).ToArray());
                var repairRow = Assert.Single(rows, row => row.GetProperty("source").GetString() == "Repair");
                Assert.Equal("repair-original.png", repairRow.GetProperty("fileName").GetString());
                Assert.Equal($"/repairs?repairId={fixture.Repair.Id}&ocrJobId={fixture.RepairJob.Id}", repairRow.GetProperty("path").GetString());
                Assert.DoesNotContain("rawText", queue.RootElement.GetRawText());
                Assert.DoesNotContain("fields", queue.RootElement.GetRawText());
            }
            Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync($"/api/dashboard/document-reviews/{fixture.RepairJob.Id}")).StatusCode);
            using (var source = await admin.GetAsync($"/api/vehicles/{fixture.Vehicle.Id}/documents/{fixture.RepairDocument.Id}/content"))
            {
                Assert.Equal(HttpStatusCode.OK, source.StatusCode);
                Assert.Equal(fixture.RepairDocument.Content, await source.Content.ReadAsByteArrayAsync());
            }
            using (var job = JsonDocument.Parse(await admin.GetStringAsync($"/api/ocr-jobs/{fixture.RepairJob.Id}")))
                Assert.Equal(fixture.RepairDocument.Id, job.RootElement.GetProperty("documentId").GetGuid());

            // A record that closes after the queue loads cannot be resumed from the stale list.
            await SetRepairStatusAsync(factory.Services, fixture.Repair.Id, RepairApprovalStatus.Rejected);
            Assert.Equal(HttpStatusCode.Conflict, (await admin.GetAsync($"/api/dashboard/document-reviews/{fixture.RepairJob.Id}")).StatusCode);
            await SetRepairStatusAsync(factory.Services, fixture.Repair.Id, RepairApprovalStatus.Pending);
            var receipt = new ConfirmRepairReceiptRequest(fixture.RepairDocument.Id, "Synthetic Supplier", "REVIEW-1", 100m,
                [new("Repair item", null, 100m, 0)]);
            var receiptResponses = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => admin.PostAsJsonAsync($"/api/repairs/{fixture.Repair.Id}/receipts/confirm", receipt)));
            Assert.All(receiptResponses, response => Assert.True(response.IsSuccessStatusCode));
            Assert.Single(receiptResponses, response => response.StatusCode == HttpStatusCode.Created);
            foreach (var response in receiptResponses) response.Dispose();
            var conflictReceipt = receipt with { TotalAmount = 150m, Items = [new("Changed item", null, 150m, 0)] };
            Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync($"/api/repairs/{fixture.Repair.Id}/receipts/confirm", conflictReceipt)).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await admin.GetAsync($"/api/dashboard/document-reviews/{fixture.RepairJob.Id}")).StatusCode);
            var review = new OcrReviewRequest(new(new() { ["amount"] = "100", ["supplierName"] = "Synthetic Supplier" }), "Synthetic saved review");
            Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/ocr-jobs/{fixture.RepairJob.Id}/review", review)).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/ocr-jobs/{fixture.RepairJob.Id}/review", review)).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsJsonAsync($"/api/ocr-jobs/{fixture.RepairJob.Id}/review", review with { Result = new(new() { ["amount"] = "999" }) })).StatusCode);

            // Concurrent reviews of the same bank-linked file preserve one snapshot; differing terms lose safely.
            var loanRequests = new[] {
                new LoanLouReviewRequest("Synthetic Bank", 80000m, 3m, 60, "Terms", fixture.Bank.Id),
                new LoanLouReviewRequest("Synthetic Bank", 81000m, 3m, 60, "Terms", fixture.Bank.Id)
            };
            var loanResponses = await Task.WhenAll(loanRequests.Select(request => admin.PostAsJsonAsync($"/api/loans/{fixture.Loan.Id}/banks/from-document/{fixture.LoanDocument.Id}", request)));
            var winningIndex = Array.FindIndex(loanResponses, response => response.StatusCode == HttpStatusCode.OK);
            Assert.InRange(winningIndex, 0, 1);
            Assert.Equal(HttpStatusCode.Conflict, loanResponses[1 - winningIndex].StatusCode);
            foreach (var response in loanResponses) response.Dispose();
            Assert.Equal(HttpStatusCode.OK, (await admin.PostAsJsonAsync($"/api/loans/{fixture.Loan.Id}/banks/from-document/{fixture.LoanDocument.Id}", loanRequests[winningIndex])).StatusCode);
            var clearedRequiredAmount = loanRequests[winningIndex] with { LoanAmount = null, RequireCompleteTerms = true };
            Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync($"/api/loans/{fixture.Loan.Id}/banks/from-document/{fixture.LoanDocument.Id}", clearedRequiredAmount)).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync($"/api/loans/{fixture.Loan.Id}/banks/from-document/{fixture.LoanDocument.Id}",
                new LoanLouReviewRequest(null, null, null, null, null, fixture.Bank.Id, RequireCompleteTerms: true))).StatusCode);
            Assert.Equal(HttpStatusCode.Conflict, (await admin.GetAsync($"/api/dashboard/document-reviews/{fixture.LoanJob.Id}")).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/ocr-jobs/{fixture.LoanJob.Id}/review", new OcrReviewRequest(new(new() { ["loanAmount"] = loanRequests[winningIndex].LoanAmount!.Value.ToString(System.Globalization.CultureInfo.InvariantCulture) }), "Synthetic loan review"))).StatusCode);
            using (var queue = JsonDocument.Parse(await admin.GetStringAsync("/api/dashboard/document-reviews")))
                Assert.Empty(queue.RootElement.GetProperty("items").EnumerateArray());
            using var scope = factory.Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            Assert.Equal(1, await db.RepairReceipts.CountAsync(item => item.DocumentId == fixture.RepairDocument.Id));
            var savedReceiptId = (await db.RepairReceipts.SingleAsync(receipt => receipt.DocumentId == fixture.RepairDocument.Id)).Id;
            Assert.Equal(100m, (await db.RepairReceiptItems.SingleAsync(item => item.RepairReceiptId == savedReceiptId)).Amount);
            Assert.Equal(1, await db.LoanBankOptions.CountAsync(item => item.LouDocumentId == fixture.LoanDocument.Id));
            Assert.Equal(loanRequests[winningIndex].LoanAmount, (await db.LoanBankOptions.SingleAsync(item => item.LouDocumentId == fixture.LoanDocument.Id)).LoanAmount);
            Assert.All(await db.OcrJobs.Where(item => item.Id == fixture.RepairJob.Id || item.Id == fixture.LoanJob.Id).ToListAsync(), job => Assert.Equal(OcrReviewDecision.Reviewed, job.ReviewDecision));
        }
        finally
        {
            await using var drop = new NpgsqlCommand($"DROP DATABASE \"{database}\" WITH (FORCE)", adminConnection);
            await drop.ExecuteNonQueryAsync();
        }
    }

    private static async Task SetRepairStatusAsync(IServiceProvider services, Guid id, RepairApprovalStatus status)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var repair = await db.RepairJobs.SingleAsync(item => item.Id == id);
        db.Entry(repair).CurrentValues.SetValues(repair with { ApprovalStatus = status });
        await db.SaveChangesAsync();
    }

    private static async Task<Fixture> SeedAsync(IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var customer = new Customer { Name = "Synthetic Review Buyer", Phone = "0100000000" };
        var vehicle = new Vehicle { PlateNumber = "REVIEW-TEST", Make = "Synthetic", Model = "Review", Year = 2026, CustomerId = customer.Id };
        var repair = new RepairJob { VehicleId = vehicle.Id, ApprovalStatus = RepairApprovalStatus.Pending };
        var loan = new LoanApplication { VehicleId = vehicle.Id, CustomerId = customer.Id, Status = LoanStatus.Pending };
        var repairDocument = new DocumentBlob { VehicleId = vehicle.Id, RepairJobId = repair.Id, Category = FileCategory.RepairInvoice, FileName = "repair-original.png", MimeType = "image/png", Content = [1, 2, 3] };
        var loanDocument = new DocumentBlob { VehicleId = vehicle.Id, CustomerId = customer.Id, LoanApplicationId = loan.Id, Category = FileCategory.LoanDocument, OwnershipType = DocumentOwnershipType.Buyer, FileName = "loan-original.pdf", MimeType = "application/pdf", Content = [4, 5, 6] };
        static OcrJob Job(DocumentBlob document) => new() { DocumentId = document.Id, Category = document.Category, Status = OcrJobStatus.NeedsReview,
            ResultJson = JsonSerializer.Serialize(new OcrExtractionResult(document.Category, .9m, [], new() { ["amount"] = "100" }, "PRIVATE OCR TEXT", [])), CreatedAt = new DateTime(2026, 11, 20, 10, 0, 0, DateTimeKind.Utc) };
        var validLineItems = new[] { new OcrLineItem("Repair item", "1", "100", "100", .9m, "Repair item 100") };
        var repairJob = Job(repairDocument) with { ResultJson = JsonSerializer.Serialize(new OcrExtractionResult(repairDocument.Category, .9m, [], [], "PRIVATE OCR TEXT", [], validLineItems)) };
        var loanJob = Job(loanDocument);
        var bank = new LoanBankOption { LoanApplicationId = loan.Id, BankName = "Synthetic Bank", LouDocumentId = loanDocument.Id };
        db.AddRange(customer, vehicle, repair, loan, bank, repairDocument, loanDocument, repairJob, loanJob,
            new LoanBankLouDocument { BankOptionId = bank.Id, DocumentId = loanDocument.Id });
        var unsupported = repairDocument with { Id = Guid.NewGuid(), Category = FileCategory.IdentityCard, RepairJobId = null };
        var unlinked = repairDocument with { Id = Guid.NewGuid(), RepairJobId = null };
        var closedRepair = repair with { Id = Guid.NewGuid(), ApprovalStatus = RepairApprovalStatus.Approved };
        var closedDocument = repairDocument with { Id = Guid.NewGuid(), RepairJobId = closedRepair.Id };
        var malformed = repairDocument with { Id = Guid.NewGuid() };
        var superseded = repairDocument with { Id = Guid.NewGuid() };
        var oldJob = Job(superseded);
        var replacement = oldJob with { Id = Guid.NewGuid(), CreatedAt = oldJob.CreatedAt.AddMinutes(1), Status = OcrJobStatus.Reviewed, ReviewDecision = OcrReviewDecision.Reviewed };
        var applied = repairDocument with { Id = Guid.NewGuid() };
        var closedLoan = loan with { Id = Guid.NewGuid(), Status = LoanStatus.Done };
        var closedLoanDocument = loanDocument with { Id = Guid.NewGuid(), LoanApplicationId = closedLoan.Id };
        var wrongBuyer = loanDocument with { Id = Guid.NewGuid(), CustomerId = null };
        var missingFields = repairDocument with { Id = Guid.NewGuid() };
        var nullLineItem = repairDocument with { Id = Guid.NewGuid() };
        db.AddRange(unsupported, unlinked, closedRepair, closedDocument, malformed, superseded, applied, closedLoan, closedLoanDocument, wrongBuyer, missingFields, nullLineItem);
        db.AddRange(Job(unsupported), Job(unlinked), Job(closedDocument), Job(malformed) with { ResultJson = "{}" }, oldJob, replacement,
            Job(applied), Job(closedLoanDocument), Job(wrongBuyer),
            Job(missingFields) with { ResultJson = JsonSerializer.Serialize(new OcrExtractionResult(missingFields.Category, .9m, [], null!, "", [], validLineItems)) },
            Job(nullLineItem) with { ResultJson = JsonSerializer.Serialize(new { DocumentCategory = nullLineItem.Category, Fields = new Dictionary<string, string?> { ["amount"] = "100" }, LineItems = new OcrLineItem?[] { null } }) });
        db.RepairReceipts.Add(new RepairReceipt { RepairJobId = repair.Id, DocumentId = applied.Id, TotalAmount = 50m });
        await db.SaveChangesAsync();
        return new(vehicle, repair, loan, bank, repairDocument, loanDocument, repairJob, loanJob);
    }

    private sealed record Fixture(Vehicle Vehicle, RepairJob Repair, LoanApplication Loan, LoanBankOption Bank, DocumentBlob RepairDocument, DocumentBlob LoanDocument, OcrJob RepairJob, OcrJob LoanJob);

    private sealed class PendingReviewApplicationFactory(string connectionString) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureLogging(logging => logging.ClearProviders());
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?> {
                ["ConnectionStrings:Default"] = connectionString, ["SeedData:Enabled"] = "true",
                ["SeedAdmin:Email"] = "review-admin@example.test", ["SeedAdmin:Password"] = "Synthetic-CI-123!",
                ["Worker:Enabled"] = "false", ["WhatsApp:SendingEnabled"] = "false", ["WhatsApp:CaptureEnabled"] = "false",
                ["WhatsAppAssistant:Enabled"] = "false"
            }));
        }
    }

    private sealed class PendingReviewPostgresFactAttribute : FactAttribute
    {
        public PendingReviewPostgresFactAttribute()
        {
            if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES")))
                Skip = "Requires the isolated local PostgreSQL test service; never uses application data.";
        }
    }
}
