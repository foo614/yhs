using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Features;
using YSHeng.Api.Domain;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class WhatsAppOutboxTests
{
    private const string Recipient = "60123456789";
    private const long Now = 1800000000;

    [Theory]
    [InlineData("+60123456789", true)]
    [InlineData("60123456789", true)]
    [InlineData("invalid", false)]
    [InlineData(null, false)]
    public async Task Retry_visibility_uses_normalized_valid_configuration(string? configured, bool expected)
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "test choice", now);
        await WhatsAppOutboxStore.EnqueueTestAsync(db, "event", Recipient, "test", now);
        await db.WhatsAppOutbox.ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "DeadLetter"));
        Assert.Equal(expected, Assert.Single(await WhatsAppAdministration.ListAsync(db, null, 1, configured)).CanRetry);
    }

    [Fact]
    public async Task Concurrent_revocation_waits_for_business_commit_then_suppresses_its_draft()
    {
        var path = Path.Combine(Path.GetTempPath(), "ysheng-whatsapp-" + Guid.NewGuid().ToString("N") + ".db");
        var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite($"Data Source={path};Pooling=False;Default Timeout=10").Options;
        try
        {
            await using var db = new AppDbContext(options);
            await db.Database.EnsureCreatedAsync();
            await db.Database.ExecuteSqlRawAsync("PRAGMA journal_mode=WAL;");
            await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "explicit choice", Now);
            await using var transaction = await db.Database.BeginTransactionAsync();
            await WhatsAppBusinessEvents.StageEnquiryAsync(db, new Lead { Phone = Recipient }, true);
            var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            var revocation = Task.Run(async () =>
            {
                await using var other = new AppDbContext(options);
                started.SetResult();
                await WhatsAppOutboxStore.SetConsentAsync(other, Recipient, false, "concurrent withdrawal", Now + 1);
            });
            await started.Task;
            await Task.Delay(100);
            Assert.False(revocation.IsCompleted);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
            await revocation.WaitAsync(TimeSpan.FromSeconds(15));
            Assert.False((await db.WhatsAppConsents.AsNoTracking().SingleAsync()).OptedIn);
            Assert.Equal("Suppressed", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
        }
        finally
        {
            File.Delete(path);
            File.Delete(path + "-wal");
            File.Delete(path + "-shm");
        }
    }

    [Fact]
    public async Task Loan_notifications_require_an_actual_transition_and_omit_decision_details()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var customer = new Customer { Phone = Recipient };
        db.Customers.Add(customer); await db.SaveChangesAsync();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "explicit choice", Now);
        var before = new LoanApplication { CustomerId = customer.Id, Status = LoanStatus.Pending };
        var after = before with { Status = LoanStatus.Rejected, RejectionReason = "PRIVATE_REASON" };
        await using var transaction = await db.Database.BeginTransactionAsync();
        await WhatsAppBusinessEvents.StageLoanStatusAsync(db, before, after, true, "loan-staff");
        await db.SaveChangesAsync();
        await WhatsAppBusinessEvents.StageLoanStatusAsync(db, after, after, true, "loan-staff");
        await db.SaveChangesAsync();
        var row = await db.WhatsAppOutbox.SingleAsync();
        Assert.Equal("loan.status_changed", row.EventKind);
        Assert.Equal("HeldForApproval", row.State);
        Assert.DoesNotContain("PRIVATE_REASON", row.Body);
        Assert.DoesNotContain("Rejected", row.Body);
    }

    [Theory]
    [InlineData(false, true, 0)]
    [InlineData(true, false, 0)]
    [InlineData(true, true, 1)]
    public async Task Real_enquiry_capture_requires_feature_and_recorded_consent(bool enabled, bool consent, int expected)
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, consent, "explicit choice", Now);
        var lead = new Lead { Phone = Recipient, CustomerName = "Synthetic", Message = "PRIVATE free text" };
        await using var transaction = await db.Database.BeginTransactionAsync();
        db.Leads.Add(lead);
        await WhatsAppBusinessEvents.StageEnquiryAsync(db, lead, enabled);
        await WhatsAppBusinessEvents.StageEnquiryAsync(db, lead, enabled);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        Assert.Equal(expected, await db.WhatsAppOutbox.CountAsync());
        if (expected == 0) return;
        var row = await db.WhatsAppOutbox.SingleAsync();
        Assert.Equal("HeldForApproval", row.State);
        Assert.Equal("ms", row.Language);
        Assert.Equal(lead.Id.ToString("D"), row.BusinessReference);
        Assert.DoesNotContain("PRIVATE", row.Body);
        Assert.False(await WhatsAppOutboxStore.DispatchOneTestAsync(db, Recipient, (_, _) => throw new InvalidOperationException("Must not send drafts"), Now));
        Assert.False(await WhatsAppOutboxStore.RetryDeadLetterTestAsync(db, row.Id, Recipient, Now));
    }

    [Fact]
    public async Task Business_event_and_audit_are_atomic_with_actual_entity_save_and_rollback()
    {
        await using var fixture = await Fixture.Create();
        await using (var db = fixture.Open())
        {
            await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "explicit choice", Now);
            await using var transaction = await db.Database.BeginTransactionAsync();
            var lead = new Lead { Phone = Recipient };
            db.Leads.Add(lead);
            await WhatsAppBusinessEvents.StageEnquiryAsync(db, lead, true);
            await db.SaveChangesAsync();
            await transaction.RollbackAsync();
        }
        await using var check = fixture.Open();
        Assert.Empty(await check.Leads.ToListAsync());
        Assert.Empty(await check.WhatsAppOutbox.ToListAsync());
        Assert.Empty(await check.AuditLogs.Where(row => row.EntityName == nameof(WhatsAppOutbox)).ToListAsync());
    }

    [Fact]
    public async Task Issued_receipt_uses_payment_customer_and_language_and_void_suppresses_draft()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var customer = new Customer { Phone = Recipient, Name = "Private name" };
        var payment = new PaymentRecord { CustomerId = customer.Id };
        var receipt = new OfficialReceipt { PaymentRecordId = payment.Id, ReceiptNumber = "OR-TEST", Amount = 87654 };
        db.Customers.Add(customer); db.PaymentRecords.Add(payment); await db.SaveChangesAsync();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "explicit receipt approval", Now, language: "en_US", actor: "staff-test");
        await using var transaction = await db.Database.BeginTransactionAsync();
        db.OfficialReceipts.Add(receipt);
        await WhatsAppBusinessEvents.StageReceiptAsync(db, receipt, true, "staff-test");
        await db.SaveChangesAsync();
        await WhatsAppBusinessEvents.StageReceiptAsync(db, receipt, true, "staff-test");
        await db.SaveChangesAsync();
        var row = await db.WhatsAppOutbox.SingleAsync();
        Assert.Contains("Official receipt OR-TEST", row.Body);
        Assert.DoesNotContain("87654", row.Body);
        Assert.DoesNotContain("Private name", row.Body);
        Assert.Equal("HeldForApproval", row.State);
        Assert.Contains(await db.AuditLogs.ToListAsync(), audit => audit.EntityId == row.Id && audit.Actor == "staff-test");
        await WhatsAppBusinessEvents.StageReceiptVoidedAsync(db, receipt.Id, true, "staff-test");
        await db.SaveChangesAsync();
        Assert.Equal("Suppressed", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
    }

    [Fact]
    public async Task Revoking_consent_suppresses_business_drafts_and_records_authenticated_actor()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "explicit choice", Now);
        await using (var transaction = await db.Database.BeginTransactionAsync())
        {
            await WhatsAppBusinessEvents.StageEnquiryAsync(db, new Lead { Phone = Recipient }, true);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, false, "customer withdrawal", Now + 1, actor: "admin-test");
        Assert.Equal("Suppressed", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
        Assert.Contains(await db.AuditLogs.ToListAsync(), audit => audit.Actor == "admin-test" && audit.Action == "whatsapp.consent.revoked");
    }

    [Fact]
    public async Task Administration_masks_recipients_and_refuses_retry_of_business_or_accepted_messages()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "explicit choice", now);
        await using (var transaction = await db.Database.BeginTransactionAsync())
        {
            await WhatsAppBusinessEvents.StageEnquiryAsync(db, new Lead { Phone = Recipient }, true);
            await db.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        var listed = Assert.Single(await WhatsAppAdministration.ListAsync(db, null, 1, Recipient));
        Assert.Equal("***6789", listed.Recipient);
        Assert.False(listed.CanRetry);
        Assert.True(listed.CanSuppress);
        await db.WhatsAppOutbox.ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "DeadLetter"));
        Assert.False(await WhatsAppOutboxStore.RetryDeadLetterTestAsync(db, listed.Id, Recipient, now));
        var testId = await WhatsAppOutboxStore.EnqueueTestAsync(db, "accepted", Recipient, "test", now);
        await db.WhatsAppOutbox.Where(row => row.Id == testId).ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "DeadLetter").SetProperty(row => row.ProviderMessageId, "accepted-id"));
        Assert.False(await WhatsAppOutboxStore.RetryDeadLetterTestAsync(db, testId, Recipient, now));
        Assert.False(await WhatsAppAdministration.SuppressAsync(db, testId, "admin-test"));
    }

    [Fact]
    public async Task Preview_defaults_to_malay_and_persists_english_choice_without_regranting_consent()
    {
        await using var fixture = await Fixture.Create();
        await using (var db = fixture.Open())
        {
            await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "test approval", Now);
            await WhatsAppOutboxStore.EnqueuePreviewAsync(db, "malay", Recipient, null, "enquiry_ack_v1", Now);
            var first = await db.WhatsAppOutbox.SingleAsync();
            Assert.Equal("ms", first.Language);
            Assert.Contains("Pertanyaan anda", first.Body);
            await WhatsAppOutboxStore.EnqueuePreviewAsync(db, "english", Recipient, "en", null, Now);
        }
        await using var reopened = fixture.Open();
        await WhatsAppOutboxStore.EnqueuePreviewAsync(reopened, "receipt", Recipient, null, "receipt_ready_v1", Now);
        Assert.Contains(await reopened.WhatsAppOutbox.ToListAsync(), row => row.Language == "en_US" && row.Body.Contains("Official receipt"));
        await WhatsAppOutboxStore.SetConsentAsync(reopened, Recipient, false, "STOP", Now + 1);
        await WhatsAppOutboxStore.EnqueuePreviewAsync(reopened, "blocked", Recipient, "ms", null, Now + 2);
        var consent = await reopened.WhatsAppConsents.SingleAsync();
        Assert.False(consent.OptedIn);
        Assert.Equal("en_US", consent.Language);
        Assert.Equal(3, await reopened.WhatsAppOutbox.CountAsync());
    }

    [Fact]
    public async Task Duplicate_language_callback_does_not_revert_newer_preference()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "test approval", Now);
        await WhatsAppOutboxStore.EnqueuePreviewAsync(db, "first", Recipient, "en", null, Now);
        await WhatsAppOutboxStore.EnqueuePreviewAsync(db, "second", Recipient, "ms", null, Now + 1);
        await WhatsAppOutboxStore.EnqueuePreviewAsync(db, "first", Recipient, "en", null, Now + 2);
        Assert.Equal("ms", (await db.WhatsAppConsents.SingleAsync()).Language);
        Assert.Equal(2, await db.WhatsAppOutbox.CountAsync());
        Assert.Throws<ArgumentException>(() => WhatsAppNotificationTemplates.Render("enquiry_ack_v1", "zh", "TEST"));
    }

    [Fact]
    public async Task Duplicate_event_survives_context_restart_and_has_one_queued_audit()
    {
        await using var fixture = await Fixture.Create();
        Guid first;
        await using (var db = fixture.Open()) first = await WhatsAppOutboxStore.EnqueueTestAsync(db, "event", Recipient, "stock", Now);
        await using var reopened = fixture.Open();
        Assert.Equal(first, await WhatsAppOutboxStore.EnqueueTestAsync(reopened, "event", "+" + Recipient, "stock", Now));
        Assert.Equal(1, await reopened.WhatsAppOutbox.CountAsync());
        Assert.Equal(1, await reopened.AuditLogs.CountAsync(item => item.Action == "whatsapp.queued"));
    }

    [Fact]
    public async Task Staged_notification_and_audit_roll_back_with_callers_transaction()
    {
        await using var fixture = await Fixture.Create();
        await using (var db = fixture.Open())
        {
            await using var tx = await db.Database.BeginTransactionAsync();
            WhatsAppOutboxStore.Stage(db, "event", Recipient, "stock", Now, Now + 300);
            await db.SaveChangesAsync();
            await tx.RollbackAsync();
        }
        await using var check = fixture.Open();
        Assert.Empty(await check.WhatsAppOutbox.ToListAsync());
        Assert.Empty(await check.AuditLogs.ToListAsync());
    }

    [Fact]
    public async Task Opt_out_persists_and_suppresses_pending_and_future_sends()
    {
        await using var fixture = await Fixture.Create();
        await using (var db = fixture.Open())
        {
            await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "test approval", Now);
            await WhatsAppOutboxStore.EnqueueTestAsync(db, "first", Recipient, "stock", Now);
            await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, false, "STOP", Now + 1);
        }
        await using var reopened = fixture.Open();
        Assert.False((await reopened.WhatsAppConsents.SingleAsync()).OptedIn);
        Assert.Equal("Suppressed", (await reopened.WhatsAppOutbox.SingleAsync()).State);
        await WhatsAppOutboxStore.EnqueueTestAsync(reopened, "second", Recipient, "stock", Now + 2);
        var calls = 0;
        await WhatsAppOutboxStore.DispatchOneTestAsync(reopened, Recipient, (_, _) => { calls++; return Task.FromResult(new WhatsAppTestResult("Accepted", "id")); }, Now + 3);
        Assert.Equal(0, calls);
        Assert.All(await reopened.WhatsAppOutbox.AsNoTracking().ToListAsync(), row => Assert.Equal("Suppressed", row.State));
    }

    [Theory]
    [InlineData("60199999999", 0)]
    [InlineData(Recipient, 301)]
    public async Task Allowlist_and_expiry_block_dispatch(string allowed, int delay)
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "test approval", Now);
        await WhatsAppOutboxStore.EnqueueTestAsync(db, "event", Recipient, "stock", Now);
        await WhatsAppOutboxStore.DispatchOneTestAsync(db, allowed, (_, _) => throw new Xunit.Sdk.XunitException("Must not send"), Now + delay);
        Assert.Equal("Suppressed", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
    }

    [Fact]
    public async Task A_second_worker_cannot_send_a_claimed_notification()
    {
        await using var fixture = await Fixture.Create();
        await using var first = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(first, Recipient, true, "test approval", Now);
        await WhatsAppOutboxStore.EnqueueTestAsync(first, "event", Recipient, "stock", Now);
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var finish = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = 0;
        var dispatch = WhatsAppOutboxStore.DispatchOneTestAsync(first, Recipient, async (_, _) =>
        {
            calls++; started.SetResult(); await finish.Task; return new("Accepted", "provider-id");
        }, Now);
        await started.Task;
        await using var second = fixture.Open();
        Assert.False(await WhatsAppOutboxStore.DispatchOneTestAsync(second, Recipient, (_, _) => { calls++; return Task.FromResult(new WhatsAppTestResult("Accepted", "duplicate")); }, Now));
        finish.SetResult(); await dispatch;
        Assert.Equal(1, calls);
        Assert.Equal("Accepted", (await second.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
    }

    [Fact]
    public async Task Explicit_rate_limit_retries_are_bounded_and_delayed()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "test approval", Now);
        await WhatsAppOutboxStore.EnqueueTestAsync(db, "event", Recipient, "stock", Now);
        var calls = 0;
        Task<WhatsAppTestResult> Send(YSHeng.Api.Domain.WhatsAppOutbox _, CancellationToken ct) { calls++; return Task.FromResult(new WhatsAppTestResult("ProviderRejected", HttpStatusCode: 429)); }
        await WhatsAppOutboxStore.DispatchOneTestAsync(db, Recipient, Send, Now);
        Assert.False(await WhatsAppOutboxStore.DispatchOneTestAsync(db, Recipient, Send, Now + 1));
        await WhatsAppOutboxStore.DispatchOneTestAsync(db, Recipient, Send, Now + 30);
        await WhatsAppOutboxStore.DispatchOneTestAsync(db, Recipient, Send, Now + 90);
        Assert.Equal(3, calls);
        Assert.Equal("DeadLetter", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
    }

    [Theory]
    [InlineData("UnknownOutcome", null)]
    [InlineData("ProviderRejected", 500)]
    public async Task Ambiguous_outcomes_are_not_retried(string outcome, int? status)
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "test approval", Now);
        await WhatsAppOutboxStore.EnqueueTestAsync(db, "event", Recipient, "stock", Now);
        await WhatsAppOutboxStore.DispatchOneTestAsync(db, Recipient, (_, _) => Task.FromResult(new WhatsAppTestResult(outcome, HttpStatusCode: status)), Now);
        Assert.False(await WhatsAppOutboxStore.DispatchOneTestAsync(db, Recipient, (_, _) => throw new InvalidOperationException(), Now + 200));
        Assert.Equal("UnknownOutcome", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
    }

    [Fact]
    public async Task Delivery_tracking_is_durable_and_does_not_regress()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "test approval", Now);
        await WhatsAppOutboxStore.EnqueueTestAsync(db, "event", Recipient, "stock", Now);
        await WhatsAppOutboxStore.DispatchOneTestAsync(db, Recipient, (_, _) => Task.FromResult(new WhatsAppTestResult("Accepted", "message")), Now);
        await WhatsAppOutboxStore.ApplyStatusAsync(db, Recipient, new("message", "delivered"));
        await WhatsAppOutboxStore.ApplyStatusAsync(db, Recipient, new("message", "sent"));
        await WhatsAppOutboxStore.ApplyStatusAsync(db, Recipient, new("message", "failed"));
        Assert.Equal("Delivered", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
        Assert.Equal(1, await db.AuditLogs.CountAsync(row => row.Action == "whatsapp.Delivered"));
    }

    [Fact]
    public async Task A_crashed_sending_claim_is_quarantined_without_resending()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.EnqueueTestAsync(db, "crash", Recipient, "stock", Now);
        await db.WhatsAppOutbox.ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "Sending").SetProperty(row => row.LeaseUntil, Now + 120));
        Assert.False(await WhatsAppOutboxStore.DispatchOneTestAsync(db, Recipient, (_, _) => throw new InvalidOperationException(), Now + 121));
        Assert.Equal("UnknownOutcome", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
        Assert.Equal(1, await db.AuditLogs.CountAsync(row => row.Action == "whatsapp.UnknownOutcome"));
    }

    [Theory]
    [InlineData("DeadLetter", true, 1, true)]
    [InlineData("DeadLetter", false, 1, false)]
    [InlineData("DeadLetter", true, 301, false)]
    [InlineData("UnknownOutcome", true, 1, false)]
    [InlineData("Delivered", true, 1, false)]
    public async Task Manual_retry_cannot_bypass_consent_expiry_or_unknown_outcome(string state, bool consent, int age, bool expected)
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, consent, "test choice", Now);
        var id = await WhatsAppOutboxStore.EnqueueTestAsync(db, "event", Recipient, "stock", Now);
        await db.WhatsAppOutbox.ExecuteUpdateAsync(set => set.SetProperty(row => row.State, state));
        Assert.False(await WhatsAppOutboxStore.RetryDeadLetterTestAsync(db, id, "60199999999", Now + age));
        Assert.Equal(expected, await WhatsAppOutboxStore.RetryDeadLetterTestAsync(db, id, Recipient, Now + age));
        Assert.Equal(expected ? 1 : 0, await db.AuditLogs.CountAsync(row => row.Action == "whatsapp.manual_retry"));
    }

    private sealed class Fixture(SqliteConnection anchor, DbContextOptions<AppDbContext> options) : IAsyncDisposable
    {
        public AppDbContext Open() => new(options);
        public static async Task<Fixture> Create()
        {
            var connectionString = $"Data Source={Guid.NewGuid():N};Mode=Memory;Cache=Shared";
            var anchor = new SqliteConnection(connectionString); await anchor.OpenAsync();
            var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connectionString).Options;
            await using var db = new AppDbContext(options); await db.Database.EnsureCreatedAsync();
            return new(anchor, options);
        }
        public ValueTask DisposeAsync() => anchor.DisposeAsync();
    }
}
