using System.Net;
using System.Net.Http.Json;
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

public sealed class HrLeaveApprovalPostgresTests
{
    // Pure deduction tests cannot catch tracked-state bugs or concurrent approval overwrites.
    [HrPostgresFact]
    public async Task Approval_uses_uploaded_mc_and_current_balance_once_under_concurrency()
    {
        var config = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES")) { Pooling = false };
        Assert.Contains(config.Host, new[] { "127.0.0.1", "localhost" });
        Assert.Equal("whatsapp_ci", config.Database);
        // Retain the synthetic database for inspection; never reset an existing database.
        var database = "hr_leave_check_" + Guid.NewGuid().ToString("N");
        await using (var connection = new NpgsqlConnection(config.ConnectionString))
        {
            await connection.OpenAsync();
            await using var create = new NpgsqlCommand($"CREATE DATABASE \"{database}\"", connection);
            await create.ExecuteNonQueryAsync();
        }
        config.Database = database;
        await using var factory = new HrFactory(config.ConnectionString);
        using var admin = factory.CreateClient();
        Assert.True((await admin.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "hr-admin@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
        using var staffResponse = await admin.PostAsJsonAsync("/api/admin/users", new { email = "leave-worker@example.test", displayName = "Synthetic leave worker", password = "Synthetic-CI-123!", role = "Sales" });
        Assert.Equal(HttpStatusCode.Created, staffResponse.StatusCode);
        using var staffJson = JsonDocument.Parse(await staffResponse.Content.ReadAsStringAsync());
        var staffId = staffJson.RootElement.GetProperty("id").GetString()!;
        using var staff = factory.CreateClient();
        Assert.True((await staff.PostAsJsonAsync("/api/auth/login?useCookies=true", new { email = "leave-worker@example.test", password = "Synthetic-CI-123!" })).IsSuccessStatusCode);
        var balance = new HrLeaveBalance { StaffUserId = staffId, AnnualLeaveDays = 1, MedicalLeaveDays = 14 };
        Assert.True((await admin.PutAsJsonAsync($"/api/hr/leave-balances/{staffId}", balance)).IsSuccessStatusCode);

        async Task<Guid> Submit(Guid? documentId = null)
        {
            using var response = await staff.PostAsJsonAsync("/api/hr/leave-requests", new { staffUserId = staffId, type = "MedicalLeave", startDate = "2026-10-05", endDate = "2026-10-05", medicalCertificateDocumentId = documentId });
            Assert.Equal(HttpStatusCode.Created, response.StatusCode);
            using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            Assert.Equal("Pending", json.RootElement.GetProperty("status").GetString());
            Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("medicalCertificateDocumentId").ValueKind);
            return json.RootElement.GetProperty("id").GetGuid();
        }
        Task<HttpResponseMessage> Approve(Guid id) => admin.PutAsJsonAsync($"/api/hr/leave-requests/{id}/decision", new { status = "Approved", decisionNotes = "Checked" });

        using var emergency = await staff.PostAsJsonAsync("/api/hr/leave-requests", new { staffUserId = staffId, type = "EmergencyLeave", startDate = "2026-10-05", endDate = "2026-10-05" });
        Assert.Equal(HttpStatusCode.BadRequest, emergency.StatusCode);
        var first = await Submit(Guid.NewGuid());
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.PutAsJsonAsync($"/api/hr/leave-requests/{first}/decision", new { status = "Approved" })).StatusCode);
        var second = await Submit();
        var approvals = await Task.WhenAll(Approve(first), Approve(second));
        Assert.All(approvals, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        foreach (var response in approvals) response.Dispose();
        var repeated = await Task.WhenAll(Approve(first), Approve(first));
        Assert.All(repeated, response => Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode));
        foreach (var response in repeated) response.Dispose();

        var withMc = await Submit();
        using (var form = new MultipartFormDataContent())
        {
            var file = new ByteArrayContent("%PDF-1.4 synthetic MC"u8.ToArray());
            file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
            form.Add(file, "file", "synthetic-mc.pdf");
            Assert.Equal(HttpStatusCode.Created, (await staff.PostAsync($"/api/hr/leave-requests/{withMc}/mc", form)).StatusCode);
        }
        Assert.Equal(HttpStatusCode.OK, (await Approve(withMc)).StatusCode);
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var saved = await db.HrLeaveBalances.AsNoTracking().SingleAsync(item => item.StaffUserId == staffId);
        Assert.Equal(0m, saved.AnnualLeaveDays);
        Assert.Equal(13m, saved.MedicalLeaveDays);
        var leaves = await db.HrLeaveRequests.AsNoTracking().Where(item => item.StaffUserId == staffId).ToListAsync();
        Assert.Single(leaves, item => item.Type == HrLeaveType.AnnualLeave);
        Assert.Single(leaves, item => item.Type == HrLeaveType.UnpaidLeave);
        Assert.Equal(HrLeaveType.MedicalLeave, leaves.Single(item => item.Id == withMc).Type);
        Assert.All(leaves.Where(item => item.Id != withMc), item => Assert.Contains("without an MC", item.DecisionNotes));
        Assert.All(leaves, item => Assert.NotNull(item.ApprovedBy));
    }

    private sealed class HrFactory(string connectionString) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.UseSetting("ConnectionStrings:Default", connectionString);
            builder.UseSetting("SeedData:Enabled", "true");
            builder.UseSetting("SeedAdmin:Email", "hr-admin@example.test");
            builder.UseSetting("SeedAdmin:Password", "Synthetic-CI-123!");
            builder.UseSetting("Worker:Enabled", "false");
            builder.UseSetting("WhatsApp:SendingEnabled", "false");
            builder.UseSetting("WhatsApp:CaptureEnabled", "false");
            builder.ConfigureLogging(logging => logging.ClearProviders());
        }
    }

    private sealed class HrPostgresFactAttribute : FactAttribute
    {
        public HrPostgresFactAttribute()
        {
            if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("WHATSAPP_TEST_POSTGRES")))
                Skip = "Set WHATSAPP_TEST_POSTGRES to an isolated local whatsapp_ci database.";
        }
    }
}
