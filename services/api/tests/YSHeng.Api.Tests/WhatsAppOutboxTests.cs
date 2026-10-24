using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Net;
using System.Net.Http.Json;
using System.Collections.Concurrent;
using System.Data.Common;
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
    [InlineData("approved")]
    [InlineData("missing")]
    [InlineData("unapproved")]
    [InlineData("wrong-body")]
    [InlineData("wrong-origin")]
    [InlineData("wrong-name")]
    [InlineData("unsuffixed")]
    [InlineData("wrong-language")]
    [InlineData("duplicate")]
    public async Task Reminder_v2_activation_preserves_full_counts_privacy_and_one_daily_send(string mode)
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        var day = WhatsAppStaffNotifications.LocalDate(Now);
        var now = WhatsAppStaffNotifications.LocalDayDueAt(day, 600);
        foreach (var category in new[] { "OutstandingDigest", "LeaveApproval", "AttendanceSummary" })
            await WhatsAppStaffNotifications.UpdatePolicyAsync(db, category, new(true, 0, category == "OutstandingDigest" ? 3 : 0, 0), "admin", now);
        for (var index = 0; index < 12; index++)
        {
            db.SettlementReminders.Add(new SettlementReminder { Deadline = day.AddDays(-index), Amount = 50000,
                Direction = SettlementDirection.PaySeller });
            db.HrLeaveRequests.Add(new HrLeaveRequest { StaffUserId = "PRIVATE_STAFF", StartDate = day.AddDays(index),
                EndDate = day.AddDays(index), Days = 1, Reason = "PRIVATE_MEDICAL_REASON" });
        }
        db.HrLeaveRequests.Add(new HrLeaveRequest { StaffUserId = "staff-notification", StartDate = day.AddDays(-1), EndDate = day, Days = 2 });
        db.SettlementReminders.Add(new SettlementReminder { Deadline = day, Amount = 1234.5m, Direction = SettlementDirection.CollectFromSeller });
        db.SettlementReminders.Add(new SettlementReminder { Deadline = day, Amount = 99999, Direction = SettlementDirection.InternalOffset });
        db.SettlementReminders.Add(new SettlementReminder { Deadline = day, Amount = 99999, IsPaid = true, Direction = SettlementDirection.PaySeller });
        db.DailySpends.Add(new DailySpend { DueDate = day, Amount = 20 });
        await db.SaveChangesAsync();
        await WhatsAppDueDigest.EnqueueForVerifiedBindingsAsync(db, assistant, now, "scheduler");
        await WhatsAppHrNotifications.EnqueueCurrentDayAsync(db, assistant, now, "scheduler");
        var entries = new List<WhatsAppApprovedTemplate>(StaffDispatch().Templates);
        foreach (var key in new[] { WhatsAppReminderV2.Due, WhatsAppReminderV2.Leave, WhatsAppReminderV2.Attendance })
        {
            if (mode == "missing") continue;
            var language = mode == "wrong-language" ? "en_US" : "ms";
            var name = mode == "wrong-name" ? key + "_en" : mode == "unsuffixed" ? key : WhatsAppReminderV2.NameFor(key, language);
            var entry = new WhatsAppApprovedTemplate { Key = key, Name = name, Language = language,
                Approved = mode != "unapproved", ApprovalEvidence = "synthetic exact-body and button approval",
                BodyText = mode == "wrong-body" ? "Unapproved text" : WhatsAppReminderV2.BodyText(key, language),
                PortalUrl = (mode == "wrong-origin" ? "https://wrong.example.test" : "https://yshenghub.com.my") +
                    (key == WhatsAppReminderV2.Due ? "/dashboard" : "/hr-salary") };
            entries.Add(entry);
            if (mode == "duplicate") entries.Add(entry);
        }
        var dispatch = StaffDispatch(entries.ToArray());
        var submitted = new List<WhatsAppOutbox>();
        for (var index = 0; index < 3; index++)
            Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, dispatch, (item, _) =>
            {
                submitted.Add(item);
                if (mode == "approved")
                {
                    Assert.True(WhatsAppReminderV2.Known(item.TemplateVersion));
                    Assert.NotNull(WhatsAppReminderV2.Parameters(item));
                    Assert.DoesNotContain(';', item.Body);
                    Assert.DoesNotContain("PRIVATE", item.TemplateReference);
                    Assert.DoesNotContain("PRIVATE", item.Body);
                }
                else Assert.Equal("staff_notice_v1", item.TemplateVersion);
                return Task.FromResult(new WhatsAppSendResult("Accepted", "wamid.v2-" + item.MessageKind));
            }, now, assistant: assistant, refreshStaff: WhatsAppStaffNotifications.RefreshAsync));
        if (mode == "approved")
        {
            var due = submitted.Single(item => item.MessageKind == "OutstandingDigest");
            Assert.Equal(new[] { "14", "11", "12", "RM600,000", "1", "RM1,234.50", "1" }, WhatsAppReminderV2.Parameters(due)![2..]);
            var leave = submitted.Single(item => item.MessageKind == "LeaveApproval");
            Assert.Equal("12", WhatsAppReminderV2.Parameters(leave)![1]);
            Assert.Equal(WhatsAppReminderV2.Parameters(leave)![0], WhatsAppReminderV2.Parameters(leave)![2]);
        }
        // Reopening with the opposite config simulates activation/rollback and worker restart.
        await using var restarted = fixture.Open();
        await WhatsAppDueDigest.EnqueueForVerifiedBindingsAsync(restarted, assistant, now, "scheduler-restart");
        await WhatsAppHrNotifications.EnqueueCurrentDayAsync(restarted, assistant, now, "scheduler-restart");
        Assert.Equal(3, await restarted.WhatsAppOutbox.CountAsync());
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(restarted, StaffDispatch(), (_, _) =>
            throw new InvalidOperationException("Already accepted daily event must not send again"), now,
            assistant: assistant, refreshStaff: WhatsAppStaffNotifications.RefreshAsync));
        Assert.All(await restarted.WhatsAppOutbox.AsNoTracking().ToListAsync(), row =>
        {
            Assert.Equal("staff_notice_v1", row.TemplateVersion);
            Assert.Equal(1, row.Attempts);
            Assert.Equal("Accepted", row.State);
            Assert.NotNull(row.SubmittedBody);
            Assert.Equal(mode == "approved" ? WhatsAppReminderV2.NameFor(WhatsAppReminderV2.KeyFor(row)!, row.Language) :
                "approved_staff_notice", row.SubmittedTemplateName);
        });
    }

    [Fact]
    public async Task Reminder_v2_sales_summary_contains_only_assigned_deliveries_and_no_finance()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var day = WhatsAppStaffNotifications.LocalDate(Now);
        var vehicle = new Vehicle { SalesAgentUserId = "sales", PlateNumber = "PRIVATE_PLATE" };
        var other = new Vehicle { SalesAgentUserId = "other" };
        db.Vehicles.AddRange(vehicle, other);
        db.DeliverySchedules.AddRange(new DeliverySchedule { VehicleId = vehicle.Id, ScheduledDate = day, Status = DeliveryStatus.Scheduled },
            new DeliverySchedule { VehicleId = other.Id, ScheduledDate = day, Status = DeliveryStatus.Scheduled });
        db.SettlementReminders.Add(new SettlementReminder { Deadline = day, Amount = 99999, Direction = SettlementDirection.PaySeller });
        await db.SaveChangesAsync();
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "OutstandingDigest", new(true, 0, 3, 0), "admin", Now);
        var template = new WhatsAppApprovedTemplate { Key = WhatsAppReminderV2.Delivery, Name = "ysheng_delivery_summary_v2_en",
            Language = "en_US", Approved = true, ApprovalEvidence = "synthetic approval",
            BodyText = WhatsAppReminderV2.BodyText(WhatsAppReminderV2.Delivery, "en_US"), PortalUrl = "https://yshenghub.com.my/delivery" };
        var current = new WhatsAppOutbox { Audience = "Staff", EventKind = "staff.notification", MessageKind = "OutstandingDigest",
            StaffUserId = "sales", RequiredStaffRole = "Sales", Language = "en_US" };
        var selected = await WhatsAppReminderV2.SelectAsync(db, StaffDispatch(template), current, Now);
        Assert.Equal(new[] { "1", "0" }, WhatsAppReminderV2.Parameters(selected)![2..]);
        Assert.DoesNotContain("99999", selected.TemplateReference);
        Assert.DoesNotContain("PRIVATE", selected.Body);
        Assert.Null(WhatsAppReminderV2.Parameters(selected with { RequiredStaffRole = "Finance" }));
    }

    [Theory]
    [InlineData("RateLimited", "RetryScheduled", true)]
    [InlineData("UnknownOutcome", "UnknownOutcome", false)]
    [InlineData("Rejected", "DeadLetter", false)]
    public async Task Reminder_v2_never_falls_back_after_submission_and_only_explicit_rate_rejection_can_retry(
        string outcome, string state, bool retry)
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        var day = WhatsAppStaffNotifications.LocalDate(Now);
        var now = WhatsAppStaffNotifications.LocalDayDueAt(day, 600);
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "OutstandingDigest", new(true, 0, 3, 0), "admin", now);
        db.DailySpends.Add(new DailySpend { DueDate = day, Amount = 20 });
        await db.SaveChangesAsync();
        await WhatsAppDueDigest.EnqueueForVerifiedBindingsAsync(db, assistant, now, "scheduler");
        var templates = StaffDispatch().Templates.Append(new WhatsAppApprovedTemplate { Key = WhatsAppReminderV2.Due,
            Name = "ysheng_due_summary_v2_ms", Language = "ms", Approved = true, ApprovalEvidence = "synthetic approval",
            BodyText = WhatsAppReminderV2.BodyText(WhatsAppReminderV2.Due, "ms"), PortalUrl = "https://yshenghub.com.my/dashboard" }).ToArray();
        var calls = 0;
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, StaffDispatch(templates), (item, _) =>
        {
            calls++;
            Assert.Equal(WhatsAppReminderV2.Due, item.TemplateVersion);
            return Task.FromResult(new WhatsAppSendResult(outcome));
        }, now, assistant: assistant, refreshStaff: WhatsAppStaffNotifications.RefreshAsync));
        Assert.Equal(1, calls);
        Assert.Equal(state, (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
        Assert.Equal(retry, await WhatsAppNotificationDispatcher.DispatchOneAsync(db, StaffDispatch(), (item, _) =>
        {
            calls++;
            Assert.Equal("staff_notice_v1", item.TemplateVersion);
            return Task.FromResult(new WhatsAppSendResult("Accepted", "wamid.after-rollback"));
        }, now + 300, assistant: assistant, refreshStaff: WhatsAppStaffNotifications.RefreshAsync));
        Assert.Equal(retry ? 2 : 1, calls);
        Assert.Equal(1, await db.WhatsAppOutbox.CountAsync());
    }

    [Theory]
    [InlineData(0, 0)]
    [InlineData(10, 1)]
    public async Task Former_RM_limits_do_not_block_submission_or_change_historical_usage(long monthly, long cost)
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var options = WhatsAppDispatchTestData.Options(daily: 3, monthly: monthly, costConfirmed: false);
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "synthetic approval", Now);
        db.WhatsAppDispatchBudgetSettings.Add(new WhatsAppDispatchBudgetSetting
        {
            DailyAttemptLimit = 3, MonthlyBudgetSen = monthly, MaximumCostPerAttemptSen = cost
        });
        var date = DateTimeOffset.FromUnixTimeSeconds(Now).ToOffset(TimeSpan.FromHours(8));
        var monthlyPeriod = $"month:{date:yyyy-MM}";
        db.WhatsAppDispatchUsage.Add(new WhatsAppDispatchUsage
        {
            Period = monthlyPeriod, Attempts = 30, ReservedCostSen = 3000
        });
        db.WhatsAppOutbox.Add(WhatsAppDispatchTestData.Item());
        await db.SaveChangesAsync();
        var calls = 0;
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, options, (_, _) =>
        {
            calls++;
            return Task.FromResult(new WhatsAppSendResult("Accepted", "wamid.synthetic-daily-only"));
        }, Now));
        Assert.Equal(1, calls);
        Assert.Equal("Accepted", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
        var history = await db.WhatsAppDispatchUsage.AsNoTracking().SingleAsync(row => row.Period == monthlyPeriod);
        Assert.Equal(30, history.Attempts);
        Assert.Equal(3000, history.ReservedCostSen);
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, options, (_, _) =>
            throw new InvalidOperationException("Provider acceptance must not be submitted twice"), Now + 1));
    }

    [Fact]
    public async Task Staff_history_explains_daily_cap_without_sending_or_allocating_more()
    {
        await using var fixture = await Fixture.Create();
        var assistant = StaffAssistant();
        var dispatch = StaffDispatch();
        await using (var db = fixture.Open())
        {
            await AddStaffBinding(db, assistant);
            await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "OutstandingDigest", new(true, 540, 3, 0), "admin", Now);
            var binding = await db.WhatsAppStaffBindings.SingleAsync();
            await WhatsAppStaffNotifications.StageAsync(db, assistant, binding.Id, "OutstandingDigest", "BossAdmin",
                WhatsAppStaffNotifications.LocalDate(Now).ToString("yyyy-MM-dd"), 1, "Current synthetic digest", Now, Now + 3600, Now, "scheduler");
            db.DailySpends.Add(new DailySpend { DueDate = WhatsAppStaffNotifications.LocalDate(Now), Amount = 20 });
            var date = DateTimeOffset.FromUnixTimeSeconds(Now).ToOffset(TimeSpan.FromHours(8));
            db.WhatsAppDispatchUsage.Add(new WhatsAppDispatchUsage
            {
                Period = $"day:{date:yyyy-MM-dd}",
                Attempts = dispatch.DailyAttemptLimit
            });
            await db.SaveChangesAsync();
        }
        // A new context represents a worker restart; neither the hold nor usage can be lost.
        await using var restarted = fixture.Open();
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(restarted, dispatch, (_, _) =>
            throw new InvalidOperationException("A daily-limit-held message must not reach the provider"), Now,
            assistant: assistant, refreshStaff: WhatsAppStaffNotifications.RefreshAsync));
        var history = await WhatsAppStaffNotifications.HistoryAsync(restarted, null, null, null, null, null, 1, Now,
            dispatch: dispatch, assistant: assistant);
        var item = Assert.Single(history.Items);
        Assert.Equal("Queued", item.State);
        Assert.Contains("Daily provider-attempt limit reached", item.WaitingReason);
        var queued = await restarted.WhatsAppOutbox.AsNoTracking().SingleAsync();
        Assert.Equal(0, queued.Attempts);
        Assert.Null(queued.SubmittedBody);
        Assert.DoesNotContain(await restarted.AuditLogs.ToListAsync(), row => row.Action == "whatsapp.Sending");
        // Saved limits must clear history's hold immediately, matching the worker without a restart.
        Assert.True(await WhatsAppDispatchBudget.UpdateAsync(restarted,
            new(dispatch.DailyAttemptLimit + 1), "boss", Now));
        var afterLimitChange = await WhatsAppStaffNotifications.HistoryAsync(restarted, null, null, null, null, null, 1, Now,
            dispatch: dispatch, assistant: assistant);
        Assert.Contains("Waiting for the background sender", Assert.Single(afterLimitChange.Items).WaitingReason);
    }

    [Theory]
    [InlineData("OutstandingDigest")]
    [InlineData("LeaveApproval")]
    public async Task Daily_reminder_with_no_remaining_business_items_is_suppressed_before_submission(string category)
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        var day = WhatsAppStaffNotifications.LocalDate(Now);
        var now = WhatsAppStaffNotifications.LocalDayDueAt(day, 600);
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, category, new(true, 0, category == "OutstandingDigest" ? 3 : 0, 0), "admin", now);
        db.DailySpends.Add(new DailySpend { DueDate = day, Amount = 20 });
        db.HrLeaveRequests.Add(new HrLeaveRequest { StaffUserId = "another-staff", StartDate = day, EndDate = day, Days = 1 });
        await db.SaveChangesAsync();
        if (category == "OutstandingDigest") await WhatsAppDueDigest.EnqueueForVerifiedBindingsAsync(db, assistant, now, "scheduler");
        else await WhatsAppHrNotifications.EnqueueCurrentDayAsync(db, assistant, now, "scheduler");
        Assert.Single(await db.WhatsAppOutbox.AsNoTracking().ToListAsync());
        await db.DailySpends.ExecuteUpdateAsync(set => set.SetProperty(row => row.IsPaid, true));
        await db.HrLeaveRequests.ExecuteUpdateAsync(set => set.SetProperty(row => row.Status, HrLeaveStatus.Approved));
        var date = DateTimeOffset.FromUnixTimeSeconds(now).ToOffset(TimeSpan.FromHours(8));
        db.WhatsAppDispatchUsage.Add(new WhatsAppDispatchUsage { Period = $"month:{date:yyyy-MM}", ReservedCostSen = 100 });
        await db.SaveChangesAsync();
        var history = await WhatsAppStaffNotifications.HistoryAsync(db, null, null, null, null, null, 1, now,
            dispatch: StaffDispatch(), assistant: assistant);
        Assert.Contains("current business facts no longer allow", Assert.Single(history.Items).WaitingReason);
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, StaffDispatch(), (_, _) =>
            throw new InvalidOperationException("Empty current facts must never reach the provider"), now,
            assistant: assistant, refreshStaff: WhatsAppStaffNotifications.RefreshAsync));
        var item = await db.WhatsAppOutbox.AsNoTracking().SingleAsync();
        Assert.Equal("Suppressed", item.State);
        Assert.Null(item.SubmittedBody);
        Assert.Equal(0, item.Attempts);
    }

    [Fact]
    public async Task Staff_history_reports_the_exact_missing_language_template_without_leaking_sender_secrets()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "OutstandingDigest", new(true, 540, 3, 0), "admin", Now);
        var binding = await db.WhatsAppStaffBindings.SingleAsync();
        await WhatsAppStaffNotifications.StageAsync(db, assistant, binding.Id, "OutstandingDigest", "BossAdmin",
            "template-test", 1, "PRIVATE synthetic draft", Now, Now + 3600, Now, "scheduler");
        await db.SaveChangesAsync();
        var dispatch = StaffDispatch(new WhatsAppApprovedTemplate { Key = "staff_notice_v1", Language = "en_US",
            Name = "approved_english_notice", Approved = true, ApprovalEvidence = "synthetic approval" });
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, dispatch, (_, _) =>
            throw new InvalidOperationException("A different approved language must not send this message"), Now,
            assistant: assistant, refreshStaff: WhatsAppStaffNotifications.RefreshAsync));
        var history = await WhatsAppStaffNotifications.HistoryAsync(db, null, null, null, null, null, 1, Now,
            dispatch: dispatch, assistant: assistant);
        Assert.Contains("No approved ms template", Assert.Single(history.Items).WaitingReason);
        var json = JsonSerializer.Serialize(history);
        Assert.DoesNotContain(dispatch.AccessToken, json);
        Assert.DoesNotContain("PRIVATE synthetic draft", json);
    }

    [Fact]
    public async Task Staff_history_batches_daily_facts_and_excludes_payroll_locked_leave_before_daily_limit_advice()
    {
        // More recipients/requests must not multiply payroll reads on an operator's history page.
        // Locked leave must not keep a reminder eligible or suggest increasing the daily limit.
        var queries = new SelectCounter();
        await using var fixture = await Fixture.Create(queries);
        await using var db = fixture.Open();
        var assistant = StaffAssistant(testMode: false);
        await AddStaffBinding(db, assistant);
        var firstBinding = await db.WhatsAppStaffBindings.AsNoTracking().SingleAsync();
        var secondBinding = firstBinding with { Id = Guid.NewGuid(), StaffUserId = "second-boss", Recipient = "60123456780" };
        db.Users.AddRange(new AppUser { Id = secondBinding.StaffUserId, UserName = "second-boss", DisplayName = "Second boss", SecurityStamp = "synthetic-stamp" },
            new AppUser { Id = "applicant", UserName = "applicant", DisplayName = "Actionable staff" },
            new AppUser { Id = "locked-applicant", UserName = "locked-applicant", DisplayName = "Locked staff" });
        db.UserRoles.Add(new IdentityUserRole<string> { UserId = secondBinding.StaffUserId, RoleId = "notification-boss" });
        db.WhatsAppStaffBindings.Add(secondBinding);
        var day = WhatsAppStaffNotifications.LocalDate(Now);
        db.HrLeaveRequests.Add(new HrLeaveRequest { StaffUserId = "applicant", StartDate = day, EndDate = day, Days = 1 });
        db.WhatsAppDispatchUsage.Add(new WhatsAppDispatchUsage { Period = $"day:{day:yyyy-MM-dd}", Attempts = StaffDispatch().DailyAttemptLimit });
        await db.SaveChangesAsync();
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "LeaveApproval", new(true, 0, 0, 0), "admin", Now);
        await WhatsAppStaffNotifications.StageCurrentDayDigestAsync(db, assistant, firstBinding.Id, "LeaveApproval", "BossAdmin", "Synthetic pending leave", 1, Now, "scheduler");
        await db.SaveChangesAsync();
        queries.Count = 0;
        var before = await WhatsAppStaffNotifications.HistoryAsync(db, null, null, null, null, null, 1, Now,
            dispatch: StaffDispatch(), assistant: assistant);
        Assert.Contains("Daily provider-attempt limit", Assert.Single(before.Items).WaitingReason);
        var singleReads = queries.Count;

        for (var index = 0; index < 20; index++)
            db.HrLeaveRequests.Add(new HrLeaveRequest { StaffUserId = "applicant", StartDate = day.AddDays(index + 1), EndDate = day.AddDays(index + 1), Days = 1 });
        var period = new HrPayPeriod { Name = "Locked", StartDate = day, EndDate = day };
        db.HrPayPeriods.Add(period);
        db.HrPayslips.Add(new HrPayslip { StaffUserId = "locked-applicant", PayPeriodId = period.Id, Status = HrPayslipStatus.PendingFinance });
        db.HrLeaveRequests.Add(new HrLeaveRequest { StaffUserId = "locked-applicant", StartDate = day, EndDate = day, Days = 1 });
        await WhatsAppStaffNotifications.StageCurrentDayDigestAsync(db, assistant, secondBinding.Id, "LeaveApproval", "BossAdmin", "Synthetic pending leave", 1, Now, "scheduler");
        await db.SaveChangesAsync();
        queries.Count = 0;
        var multiple = await WhatsAppStaffNotifications.HistoryAsync(db, null, null, null, null, null, 1, Now,
            dispatch: StaffDispatch(), assistant: assistant);
        Assert.Equal(2, multiple.Items.Count);
        Assert.All(multiple.Items, item => Assert.Contains("Daily provider-attempt limit", item.WaitingReason));
        Assert.Equal(singleReads, queries.Count);

        await db.HrLeaveRequests.Where(item => item.StaffUserId == "applicant").ExecuteDeleteAsync();
        var lockedOnly = await WhatsAppStaffNotifications.HistoryAsync(db, null, null, null, null, null, 1, Now,
            dispatch: StaffDispatch(), assistant: assistant);
        Assert.All(lockedOnly.Items, item => Assert.Contains("current business facts no longer allow", item.WaitingReason));
    }

    [Fact]
    public async Task Background_workers_schedule_and_submit_all_due_daily_categories_once_without_an_admin_request()
    {
        await using var fixture = await Fixture.Create();
        var assistant = StaffAssistant();
        var dispatch = StaffDispatch();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var day = WhatsAppStaffNotifications.LocalDate(now);
        await using (var db = fixture.Open())
        {
            await AddStaffBinding(db, assistant);
            foreach (var category in new[] { "OutstandingDigest", "AttendanceSummary", "LeaveApproval" })
                await WhatsAppStaffNotifications.UpdatePolicyAsync(db, category, new(true, 0, category == "OutstandingDigest" ? 3 : 0, 0), "admin", now);
            db.DailySpends.Add(new DailySpend { DueDate = day, Amount = 20 });
            db.HrLeaveRequests.Add(new HrLeaveRequest { StaffUserId = "another-staff", StartDate = day,
                EndDate = day, Days = 1, Type = HrLeaveType.AnnualLeave });
            await db.SaveChangesAsync();
        }
        var submitted = new ConcurrentQueue<string>();
        var complete = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        using var sender = new WhatsAppTemplateSender(new HttpClient(new StaffTemplateHandler(body =>
        {
            submitted.Enqueue(body);
            if (submitted.Count == 3) complete.TrySetResult();
        })));
        await using var services = new ServiceCollection().AddScoped(_ => fixture.Open()).BuildServiceProvider();
        using var scheduler = new WhatsAppStaffProactiveWorker(services.GetRequiredService<IServiceScopeFactory>(), assistant,
            NullLogger<WhatsAppStaffProactiveWorker>.Instance);
        using var worker = new WhatsAppNotificationWorker(services.GetRequiredService<IServiceScopeFactory>(), dispatch,
            assistant, sender, NullLogger<WhatsAppNotificationWorker>.Instance);
        await scheduler.StartAsync(default);
        await worker.StartAsync(default);
        try
        {
            await complete.Task.WaitAsync(TimeSpan.FromSeconds(25));
            await using var check = fixture.Open();
            for (var attempt = 0; attempt < 100 && await check.WhatsAppOutbox.CountAsync(row => row.State == "Accepted") < 3; attempt++)
                await Task.Delay(25);
            Assert.Equal(3, await check.WhatsAppOutbox.CountAsync(row => row.State == "Accepted"));
        }
        finally { await worker.StopAsync(default); await scheduler.StopAsync(default); }
        Assert.Equal(3, submitted.Count);
        Assert.Contains(submitted, body => body.Contains("Perbelanjaan RM20.00"));
        Assert.Contains(submitted, body => body.Contains("kehadiran"));
        Assert.Contains(submitted, body => body.Contains("kelulusan cuti"));
        await using var reopened = fixture.Open();
        await WhatsAppDueDigest.EnqueueForVerifiedBindingsAsync(reopened, assistant, now, "restarted-scheduler");
        await WhatsAppHrNotifications.EnqueueCurrentDayAsync(reopened, assistant, now, "restarted-scheduler");
        Assert.Equal(3, await reopened.WhatsAppOutbox.CountAsync());
        Assert.All(await reopened.WhatsAppOutbox.AsNoTracking().ToListAsync(), row =>
        {
            Assert.Equal(1, row.Attempts);
            Assert.False(string.IsNullOrWhiteSpace(row.SubmittedBody));
        });
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(reopened, dispatch, (_, _) =>
            throw new InvalidOperationException("Accepted reminders must not be submitted again"), now,
            assistant: assistant, refreshStaff: WhatsAppStaffNotifications.RefreshAsync));
    }

    private sealed class StaffTemplateHandler(Action<string> submitted) : HttpMessageHandler
    {
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            using var payload = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            Assert.Equal("template", payload.RootElement.GetProperty("type").GetString());
            var template = payload.RootElement.GetProperty("template");
            Assert.Equal("approved_staff_notice", template.GetProperty("name").GetString());
            submitted(template.GetProperty("components")[0].GetProperty("parameters")[0].GetProperty("text").GetString()!);
            return new(HttpStatusCode.OK) { Content = JsonContent.Create(new { messages = new[] { new { id = "wamid.synthetic-" + Guid.NewGuid() } } }) };
        }
    }

    [Fact]
    public async Task Disabled_assistant_diagnostics_work_before_binding_schema_was_initialized()
    {
        // Upgraded installations with assistant off must still load admin diagnostics.
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await db.Database.ExecuteSqlRawAsync("DROP TABLE \"WhatsAppStaffBindings\"");
        var result = await WhatsAppStaffNotifications.DiagnosticsAsync(db, new WhatsAppAssistantOptions(), Now);
        Assert.Equal(0, result.ConnectedStaff);
    }

    [Fact]
    public void Ocr_usage_warning_threshold_and_zero_limit_use_existing_utc_period()
    {
        var reset = new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc);
        Assert.Null(WhatsAppOcrUsageAlerts.Project("workspace-monthly", "2026-10", 89, 100, 90, reset, "en_US"));
        Assert.NotNull(WhatsAppOcrUsageAlerts.Project("workspace-monthly", "2026-10", 89, 90, 90, reset, "en_US"));
        Assert.Null(WhatsAppOcrUsageAlerts.Project("workspace-monthly", "2026-10", 90, 0, 90, reset, "en_US"));
        var warning = WhatsAppOcrUsageAlerts.Project("workspace-monthly", "2026-10", 90, 100, 90, reset, "en_US");
        Assert.NotNull(warning);
        Assert.Equal(90, warning.Percent);
        Assert.Contains("90/100 (90%)", warning.Body);
        Assert.Contains("2026-11-01 08:00 SGT", warning.Body);
        var malay = WhatsAppOcrUsageAlerts.Project("staff-daily", "staff:2026-10-07", 9, 10, 90,
            new DateTime(2026, 10, 8, 0, 0, 0, DateTimeKind.Utc), "ms", "Synthetic [Staff]");
        Assert.Contains("OCR harian staf", malay!.Body);
        Assert.DoesNotContain("[Staff]", malay.Body);
        Assert.Contains("2026-10-08 08:00 SGT", malay.Body);
        var alice = WhatsAppOcrUsageAlerts.Project("staff-daily", "alice:2026-10-07", 9, 10, 90,
            reset, "en_US", "Alice [Ops]\nTeam");
        var bob = WhatsAppOcrUsageAlerts.Project("staff-daily", "bob:2026-10-07", 9, 10, 90,
            reset, "en_US", "Bob [Finance]\rTeam");
        Assert.Contains("[Alice OpsTeam]", alice!.Body);
        Assert.Contains("[Bob FinanceTeam]", bob!.Body);
        Assert.NotEqual(alice.Body, bob.Body);
        Assert.DoesNotContain('\n', alice.Body);
        Assert.DoesNotContain('\r', bob.Body);
    }

    [Fact]
    public async Task Ocr_usage_alerts_are_boss_only_deduped_across_rebind_and_refresh_current_limit()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var utc = new DateTimeOffset(2026, 10, 7, 1, 0, 0, TimeSpan.Zero);
        var now = utc.ToUnixTimeSeconds();
        db.AiServiceLimits.Add(new AiServiceLimit { Service = AiService.Ocr, MonthlyRequestLimit = 10,
            PerStaffDailyRequestLimit = 100 });
        db.WhatsAppStaffNotificationPolicies.Add(new WhatsAppStaffNotificationPolicy
            { Category = "OcrUsage", Enabled = true, ThresholdPercent = 90 });
        db.Roles.AddRange(new IdentityRole("BossAdmin") { Id = "boss-role", NormalizedName = "BOSSADMIN" },
            new IdentityRole("Sales") { Id = "sales-role", NormalizedName = "SALES" });
        var assistant = new WhatsAppAssistantOptions
        {
            Enabled = true, WebhookEnabled = true, TestMode = false, PhoneNumberId = "123", BusinessAccountId = "456",
            GraphApiVersion = "v25.0", AppSecret = new string('s', 32), VerifyToken = new string('v', 32),
            AccessToken = "synthetic-token"
        };
        foreach (var (id, role, phone) in new[]
        {
            ("boss-one", "boss-role", "60123456789"), ("boss-two", "boss-role", "60123456780"),
            ("sales-one", "sales-role", "60123456781")
        })
        {
            const string stamp = "synthetic-stamp";
            db.Users.Add(new AppUser { Id = id, UserName = id, DisplayName = id, SecurityStamp = stamp });
            db.UserRoles.Add(new IdentityUserRole<string> { UserId = id, RoleId = role });
            db.WhatsAppStaffBindings.Add(new WhatsAppStaffBinding { StaffUserId = id, Recipient = phone,
                PhoneNumberId = "123", SecurityStampHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(stamp))),
                Language = id == "boss-two" ? "ms" : "en_US", VerifiedAt = now - 100 });
        }
        for (var i = 0; i < 8; i++) db.AiUsageRecords.Add(new AiUsageRecord
            { Service = AiService.Ocr, StaffUserId = "sales-one", RequestedAt = utc.UtcDateTime, Status = AiUsageStatus.Failed });
        await db.SaveChangesAsync();
        Assert.Equal(0, await WhatsAppOcrUsageAlerts.EvaluateAsync(db, assistant, now, "test"));
        db.AiUsageRecords.Add(new AiUsageRecord
            { Service = AiService.Ocr, StaffUserId = "sales-one", RequestedAt = utc.UtcDateTime });
        await db.SaveChangesAsync();
        Assert.Equal(2, await WhatsAppOcrUsageAlerts.EvaluateAsync(db, assistant, now, "test"));
        var rows = await db.WhatsAppOutbox.AsNoTracking().ToListAsync();
        Assert.Equal(2, rows.Count);
        Assert.All(rows, row => Assert.Equal("BossAdmin", row.RequiredStaffRole));
        Assert.DoesNotContain(rows, row => row.StaffUserId == "sales-one");
        Assert.Contains(rows, row => row.Language == "ms" && row.Body.Contains("bulanan organisasi"));
        Assert.All(rows, row => Assert.Equal("Queued", row.State));
        var firstBinding = await db.WhatsAppStaffBindings.SingleAsync(item => item.StaffUserId == "boss-one");
        db.Entry(firstBinding).CurrentValues.SetValues(firstBinding with { RevokedAt = now + 1 });
        db.WhatsAppStaffBindings.Add(firstBinding with { Id = Guid.NewGuid(), RevokedAt = null,
            VerifiedAt = now + 1 });
        await db.SaveChangesAsync();
        await WhatsAppOcrUsageAlerts.EvaluateAsync(db, assistant, now + 2, "test");
        Assert.Equal(2, await db.WhatsAppOutbox.CountAsync());
        var limit = await db.AiServiceLimits.SingleAsync();
        db.Entry(limit).CurrentValues.SetValues(limit with { MonthlyRequestLimit = 100 });
        await db.SaveChangesAsync();
        Assert.Null(await WhatsAppOcrUsageAlerts.RefreshForDispatchAsync(db, rows[0], now + 3));
        db.Entry(limit).CurrentValues.SetValues(limit with { MonthlyRequestLimit = 9 });
        await db.SaveChangesAsync();
        Assert.NotNull(await WhatsAppOcrUsageAlerts.RefreshForDispatchAsync(db, rows[0], now + 4));
        await WhatsAppOcrUsageAlerts.EvaluateAsync(db, assistant, now + 4, "test");
        Assert.Equal(2, await db.WhatsAppOutbox.CountAsync());
        var nextMonth = new DateTimeOffset(2026, 11, 2, 1, 0, 0, TimeSpan.Zero);
        for (var i = 0; i < 9; i++) db.AiUsageRecords.Add(new AiUsageRecord
            { Service = AiService.Ocr, StaffUserId = "sales-one", RequestedAt = nextMonth.UtcDateTime });
        db.Entry(limit).CurrentValues.SetValues(limit with { IsEnabled = false });
        await db.SaveChangesAsync();
        Assert.Equal(0, await WhatsAppOcrUsageAlerts.EvaluateAsync(db, assistant, nextMonth.ToUnixTimeSeconds(), "test"));
        db.Entry(limit).CurrentValues.SetValues(limit with { IsEnabled = true });
        await db.SaveChangesAsync();
        Assert.Equal(2, await WhatsAppOcrUsageAlerts.EvaluateAsync(db, assistant, nextMonth.ToUnixTimeSeconds(), "recovery"));
        Assert.Equal(4, await db.WhatsAppOutbox.CountAsync());
        Assert.Null(await WhatsAppOcrUsageAlerts.RefreshForDispatchAsync(db, rows[0], nextMonth.ToUnixTimeSeconds()));
    }

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

    [Theory]
    [InlineData(false, true, 3, 30, true)]
    [InlineData(true, false, 3, 30, true)]
    public async Task Production_configuration_gates_precede_database_access(bool enabled, bool approved, int daily, long monthly, bool costConfirmed)
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().Options);
        var options = WhatsAppDispatchTestData.Options(enabled: enabled, approved: approved, daily: daily, monthly: monthly, costConfirmed: costConfirmed);
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, options, (_, _) => throw new InvalidOperationException("must not send"), Now));
    }

    [Theory]
    [InlineData(0, 30)]
    public async Task Invalid_server_default_daily_limit_blocks_until_admin_configures_it(int daily, long monthly)
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(db,
            WhatsAppDispatchTestData.Options(daily: daily, monthly: monthly),
            (_, _) => throw new InvalidOperationException("must not send"), Now));
    }

    [Theory]
    [InlineData("Accepted", "Accepted")]
    [InlineData("Rejected", "DeadLetter")]
    [InlineData("UnknownOutcome", "UnknownOutcome")]
    [InlineData("RateLimited", "RetryScheduled")]
    public async Task Production_dispatch_counts_attempts_and_records_acceptance_without_claiming_delivery(string outcome, string expected)
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "synthetic approval", Now);
        var row = WhatsAppDispatchTestData.Item(); db.WhatsAppOutbox.Add(row); await db.SaveChangesAsync();
        var calls = 0;
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, WhatsAppDispatchTestData.Options(), (_, _) =>
        {
            calls++; return Task.FromResult(new WhatsAppSendResult(outcome, outcome == "Accepted" ? "wamid.business" : null));
        }, Now));
        var saved = await db.WhatsAppOutbox.AsNoTracking().SingleAsync();
        Assert.Equal(expected, saved.State); Assert.Equal(1, saved.Attempts); Assert.Equal(1, calls);
        Assert.Equal(1, await db.WhatsAppDispatchUsage.CountAsync(item => item.Attempts == 1 && item.ReservedCostSen == 0));
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, WhatsAppDispatchTestData.Options(), (_, _) => throw new Exception("must not send again"), Now));
    }

    [Theory]
    [InlineData(1, 0)]
    [InlineData(1, 10)]
    public async Task Daily_cap_survives_worker_context_changes_with_inert_RM_limits(int daily, long monthly)
    {
        await using var fixture = await Fixture.Create();
        await using (var db = fixture.Open())
        {
            await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "synthetic approval", Now);
            db.WhatsAppOutbox.AddRange(WhatsAppDispatchTestData.Item(), WhatsAppDispatchTestData.Item()); await db.SaveChangesAsync();
            Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, WhatsAppDispatchTestData.Options(daily: daily, monthly: monthly),
                (_, _) => Task.FromResult(new WhatsAppSendResult("Accepted", "wamid.first")), Now));
        }
        await using var restarted = fixture.Open();
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(restarted, WhatsAppDispatchTestData.Options(daily: daily, monthly: monthly),
            (_, _) => throw new Exception("daily cap must survive restart"), Now + 1));
        Assert.Single(await restarted.WhatsAppOutbox.Where(item => item.State == "HeldForApproval").ToListAsync());
    }

    [Fact]
    public async Task Admin_daily_limit_override_is_persisted_audited_and_applied_without_restart()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var options = WhatsAppDispatchTestData.Options(daily: 0, monthly: 100);
        var initial = await WhatsAppDispatchBudget.ViewAsync(db, options, Now);
        Assert.False(initial.AdminConfigured);
        Assert.Equal(0, initial.DailyAttemptLimit);
        Assert.False((await WhatsAppDispatchBudget.OptionsAsync(db, options)).Ready);
        Assert.False(await WhatsAppDispatchBudget.UpdateAsync(db, new(0), "boss", Now));
        Assert.Empty(await db.WhatsAppDispatchBudgetSettings.ToListAsync());

        Assert.True(await WhatsAppDispatchBudget.UpdateAsync(db, new(1), "boss", Now));
        Assert.True((await WhatsAppDispatchBudget.OptionsAsync(db, options)).Ready);
        Assert.False(options.Ready); // Effective limits must not mutate the singleton defaults.
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "synthetic approval", Now);
        db.WhatsAppOutbox.AddRange(WhatsAppDispatchTestData.Item(), WhatsAppDispatchTestData.Item());
        await db.SaveChangesAsync();
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, options,
            (effectiveOptions, _, _) =>
            {
                Assert.True(effectiveOptions.Ready);
                Assert.Equal(1, effectiveOptions.DailyAttemptLimit);
                return Task.FromResult(new WhatsAppSendResult("Accepted", "wamid.first"));
            }, Now));
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, options,
            (_, _) => throw new Exception("admin daily limit must block the second attempt"), Now + 1));
        var blocked = await WhatsAppDispatchBudget.ViewAsync(db, options, Now + 1);
        Assert.True(blocked.AdminConfigured);
        Assert.Contains("Daily provider-attempt limit reached", blocked.BlockedReason);
        Assert.Equal(0, blocked.DailyRemainingAttempts);

        // A daily-cap edit must preserve existing compatibility fields rather than zeroing history.
        var legacy = await db.WhatsAppDispatchBudgetSettings.SingleAsync();
        db.Entry(legacy).CurrentValues.SetValues(legacy with { MonthlyBudgetSen = 30000, MaximumCostPerAttemptSen = 100 });
        await db.SaveChangesAsync();
        Assert.True(await WhatsAppDispatchBudget.UpdateAsync(db, new(2), "boss", Now + 2));
        var preserved = await db.WhatsAppDispatchBudgetSettings.AsNoTracking().SingleAsync();
        Assert.Equal(30000, preserved.MonthlyBudgetSen);
        Assert.Equal(100, preserved.MaximumCostPerAttemptSen);
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, options,
            (_, _) => Task.FromResult(new WhatsAppSendResult("Accepted", "wamid.second")), Now + 2));
        Assert.Equal(2, await db.AuditLogs.CountAsync(item => item.Action == "whatsapp.dispatch_limits.updated"));
    }

    [Fact]
    public async Task Rate_rejection_is_bounded_and_unknown_leases_are_never_reclaimed()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "synthetic approval", Now);
        db.WhatsAppOutbox.Add(WhatsAppDispatchTestData.Item()); await db.SaveChangesAsync();
        var calls = 0;
        foreach (var time in new[] { Now, Now + 30, Now + 150 })
            Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, WhatsAppDispatchTestData.Options(), (_, _) =>
            { calls++; return Task.FromResult(new WhatsAppSendResult("RateLimited")); }, time));
        Assert.Equal(3, calls); Assert.Equal("DeadLetter", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
        await db.WhatsAppOutbox.ExecuteUpdateAsync(set => set.SetProperty(item => item.State, "Sending").SetProperty(item => item.LeaseUntil, Now));
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, WhatsAppDispatchTestData.Options(), (_, _) => throw new Exception("must not resend"), Now + 151));
        Assert.Equal("UnknownOutcome", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
    }

    [Theory]
    [InlineData(false, "ms", 1)]
    [InlineData(true, "en_US", 1)]
    [InlineData(true, "ms", -1)]
    public async Task Withdrawn_changed_language_or_expired_drafts_never_send(bool consent, string language, int expiry)
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, consent, "synthetic choice", Now, language: language);
        db.WhatsAppOutbox.Add(WhatsAppDispatchTestData.Item() with { ExpiresAt = Now + expiry }); await db.SaveChangesAsync();
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, WhatsAppDispatchTestData.Options(), (_, _) => throw new Exception("ineligible recipient"), Now));
        Assert.Equal("Suppressed", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
        Assert.False(await db.WhatsAppDispatchUsage.AnyAsync(item => item.Attempts > 0));
    }

    [Fact]
    public async Task Voided_receipt_and_legacy_drafts_cannot_be_released()
    {
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "synthetic approval", Now);
        var customer = new Customer { Phone = Recipient }; var payment = new PaymentRecord { CustomerId = customer.Id };
        var receipt = new OfficialReceipt { PaymentRecordId = payment.Id, IsVoided = true };
        db.Customers.Add(customer); db.PaymentRecords.Add(payment); db.OfficialReceipts.Add(receipt);
        db.WhatsAppOutbox.Add(WhatsAppDispatchTestData.Item() with { EventKind = "receipt.issued", TemplateVersion = "receipt_ready_v1", BusinessReference = receipt.Id.ToString("D") });
        db.WhatsAppOutbox.Add(WhatsAppDispatchTestData.Item() with { TemplateReference = "" }); await db.SaveChangesAsync();
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, WhatsAppDispatchTestData.Options(key: "receipt_ready_v1"), (_, _) => throw new Exception("voided receipt"), Now));
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, WhatsAppDispatchTestData.Options(), (_, _) => throw new Exception("legacy replay"), Now));
    }

    [Theory]
    [InlineData("DeadLetter", 1, true)]
    [InlineData("DeadLetter", 3, false)]
    [InlineData("UnknownOutcome", 1, false)]
    [InlineData("Accepted", 1, false)]
    public async Task Business_manual_retry_keeps_attempt_count_and_blocks_ambiguous_or_exhausted_work(string state, int attempts, bool expected)
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "synthetic choice", now);
        var item = WhatsAppDispatchTestData.Item() with { State = state, Attempts = attempts, ExpiresAt = now + 3600 };
        db.WhatsAppOutbox.Add(item); await db.SaveChangesAsync();
        Assert.Equal(expected, Assert.Single(await WhatsAppAdministration.ListAsync(db, null, 1, null, options: WhatsAppDispatchTestData.Options())).CanRetry);
        Assert.Equal(expected, await WhatsAppAdministration.RetryBusinessAsync(db, item.Id, WhatsAppDispatchTestData.Options(), "authenticated-test-admin", now));
        Assert.Equal(attempts, (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).Attempts);
        Assert.Equal(expected ? 1 : 0, await db.AuditLogs.CountAsync(row => row.Actor == "authenticated-test-admin" && row.Action == "whatsapp.manual_retry"));
    }

    [Fact]
    public async Task Notification_callback_rejects_unsigned_and_oversized_payloads_before_database_access()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().Options);
        var context = new Microsoft.AspNetCore.Http.DefaultHttpContext();
        context.Request.Body = new MemoryStream(System.Text.Encoding.UTF8.GetBytes("{}"));
        var result = await WhatsAppNotificationWebhook.ReceiveAsync(context.Request, db, WhatsAppDispatchTestData.Options(), default);
        Assert.Equal(401, ((Microsoft.AspNetCore.Http.IStatusCodeHttpResult)result).StatusCode);
        context.Request.Body = new MemoryStream(new byte[WhatsAppWebhookProbe.MaxBodyBytes + 1]);
        result = await WhatsAppNotificationWebhook.ReceiveAsync(context.Request, db, WhatsAppDispatchTestData.Options(), default);
        Assert.Equal(413, ((Microsoft.AspNetCore.Http.IStatusCodeHttpResult)result).StatusCode);
        context.Request.ContentLength = WhatsAppWebhookProbe.MaxBodyBytes + 1;
        context.Request.Body = new MemoryStream(System.Text.Encoding.UTF8.GetBytes("{}"));
        result = await WhatsAppNotificationWebhook.ReceiveAsync(context.Request, db, WhatsAppDispatchTestData.Options(), default);
        Assert.Equal(401, ((Microsoft.AspNetCore.Http.IStatusCodeHttpResult)result).StatusCode);
        result = WhatsAppNotificationWebhook.Challenge(WhatsAppDispatchTestData.Options(), "subscribe", "wrong", "123");
        Assert.Equal(401, ((Microsoft.AspNetCore.Http.IStatusCodeHttpResult)result).StatusCode);
    }

    [Fact]
    public async Task Notification_callback_matches_sender_and_known_message_and_merges_without_regression()
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        var item = WhatsAppDispatchTestData.Item() with { State = "Accepted", ProviderMessageId = "wamid.business" };
        db.WhatsAppOutbox.Add(item); await db.SaveChangesAsync();
        using var wrong = System.Text.Json.JsonDocument.Parse(Callback(status: "read", sender: "999"));
        Assert.True(await WhatsAppNotificationWebhook.ApplyAsync(db, wrong.RootElement, WhatsAppDispatchTestData.Options(), Now));
        Assert.Equal("Accepted", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
        foreach (var status in new[] { "read", "sent", "failed", "delivered", "read" })
        {
            using var body = System.Text.Json.JsonDocument.Parse(Callback(status: status));
            Assert.True(await WhatsAppNotificationWebhook.ApplyAsync(db, body.RootElement, WhatsAppDispatchTestData.Options(), Now));
        }
        Assert.Equal("Read", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
        var confirmed = await db.WhatsAppOutbox.AsNoTracking().SingleAsync();
        Assert.Equal(Now, confirmed.ReadAt);
        Assert.Equal(Now, confirmed.DeliveredAt);
        Assert.Equal(Now, confirmed.SentAt);
        Assert.Equal(1, await db.AuditLogs.CountAsync(row => row.Action == "whatsapp.Read" && row.Actor == "whatsapp-webhook"));
        using var unknown = System.Text.Json.JsonDocument.Parse(Callback(status: "read", id: "wamid.unknown"));
        Assert.True(await WhatsAppNotificationWebhook.ApplyAsync(db, unknown.RootElement, WhatsAppDispatchTestData.Options(), Now));
        Assert.Single(await db.WhatsAppOutbox.ToListAsync());
    }

    [Fact]
    public async Task Signed_stop_revokes_and_suppresses_once_without_recording_raw_payload()
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, true, "synthetic approval", Now);
        db.WhatsAppOutbox.Add(WhatsAppDispatchTestData.Item()); await db.SaveChangesAsync();
        var payload = System.Text.Encoding.UTF8.GetBytes(Callback(command: "STOP"));
        var context = new Microsoft.AspNetCore.Http.DefaultHttpContext();
        context.Request.Headers["X-Hub-Signature-256"] = "sha256=" + Convert.ToHexString(System.Security.Cryptography.HMACSHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes("test-secret"), payload)).ToLowerInvariant();
        foreach (var repeat in new[] { 1, 2 })
        {
            context.Request.Body = new MemoryStream(payload);
            var result = await WhatsAppNotificationWebhook.ReceiveAsync(context.Request, db, WhatsAppDispatchTestData.Options(), default);
            Assert.Equal(200, ((Microsoft.AspNetCore.Http.IStatusCodeHttpResult)result).StatusCode);
        }
        Assert.False((await db.WhatsAppConsents.AsNoTracking().SingleAsync()).OptedIn);
        Assert.Equal("Suppressed", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
        Assert.Equal(1, await db.AuditLogs.CountAsync(row => row.Action == "whatsapp.consent.revoked"));
    }

    [Fact]
    public async Task Callback_before_acceptance_requests_retry_without_persisting_unknown_provider_id()
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        db.WhatsAppOutbox.Add(WhatsAppDispatchTestData.Item() with { State = "Sending", LeaseUntil = Now + 120 }); await db.SaveChangesAsync();
        using var body = System.Text.Json.JsonDocument.Parse(Callback(status: "delivered"));
        Assert.False(await WhatsAppNotificationWebhook.ApplyAsync(db, body.RootElement, WhatsAppDispatchTestData.Options(), Now));
        Assert.Null((await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).ProviderMessageId);
    }

    private static string Callback(string? status = null, string command = "stop", string sender = "12345", string id = "wamid.business") =>
        System.Text.Json.JsonSerializer.Serialize(new { @object = "whatsapp_business_account", entry = new[] { new { id = "45678", changes = new[] { new
        {
            field = "messages", value = new { metadata = new { phone_number_id = sender },
                messages = status is null ? new[] { new { id = "wamid.inbound", from = Recipient, type = "text", text = new { body = command } } } : [],
                statuses = status is not null ? new[] { new { id, recipient_id = Recipient, status } } : [] }
        } } } } });

    [Fact]
    public async Task Staff_and_customer_with_same_number_keep_independent_consent_and_queue_actions()
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "OutstandingDigest", new(true, 540, 3, 0), "admin", Now);
        var binding = await db.WhatsAppStaffBindings.SingleAsync();
        var staged = await WhatsAppStaffNotifications.StageAsync(db, assistant, binding.Id, "OutstandingDigest", "BossAdmin",
            "2027-01-01", 1, "Current synthetic digest", Now, Now + 3600, Now, "admin");
        Assert.NotNull(staged);
        await db.SaveChangesAsync();
        await WhatsAppOutboxStore.SetConsentAsync(db, Recipient, false, "customer withdrawal", Now + 1);
        Assert.Equal("Queued", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
        Assert.Empty(await WhatsAppAdministration.ListAsync(db, null, 1, Recipient));
        Assert.False(await WhatsAppAdministration.SuppressAsync(db, staged!.Id, "admin"));
        await WhatsAppStaffBindings.RevokeAsync(db, "staff-notification", "staff", Now + 2);
        Assert.Equal("Suppressed", (await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
    }

    [Fact]
    public async Task Staff_send_rechecks_exact_role_and_records_only_submitted_content()
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "OutstandingDigest", new(true, 540, 3, 0), "admin", Now);
        var binding = await db.WhatsAppStaffBindings.SingleAsync();
        var first = await WhatsAppStaffNotifications.StageAsync(db, assistant, binding.Id, "OutstandingDigest", "BossAdmin",
            "2027-01-01", 1, "Private boss digest", Now, Now + 3600, Now, "admin");
        await db.SaveChangesAsync();
        var duplicate = await WhatsAppStaffNotifications.StageAsync(db, assistant, binding.Id, "OutstandingDigest", "BossAdmin",
            "2027-01-01", 1, "Changed facts", Now, Now + 3600, Now, "admin");
        Assert.Equal(first!.Id, duplicate!.Id);
        await db.UserRoles.Where(row => row.UserId == "staff-notification").ExecuteDeleteAsync();
        db.Roles.Add(new IdentityRole("Sales") { Id = "notification-sales", NormalizedName = "SALES" });
        db.UserRoles.Add(new IdentityUserRole<string> { UserId = "staff-notification", RoleId = "notification-sales" });
        await db.SaveChangesAsync();
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, StaffDispatch(), (_, _) =>
            throw new InvalidOperationException("Boss-only content must not send"), Now, assistant: assistant,
            currentStaffFacts: (_, _, _) => Task.FromResult(true)));
        var suppressed = await db.WhatsAppOutbox.AsNoTracking().SingleAsync();
        Assert.Equal("Suppressed", suppressed.State);
        Assert.Null(suppressed.SubmittedBody);
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, StaffDispatch(), (_, _) =>
            throw new InvalidOperationException("No second send"), Now, assistant: assistant,
            currentStaffFacts: (_, _, _) => Task.FromResult(true)));
    }

    [Fact]
    public async Task Staff_accepted_send_preserves_exact_payload_snapshot_and_filtered_history()
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "OutstandingDigest", new(true, 540, 3, 0), "admin", Now);
        var binding = await db.WhatsAppStaffBindings.SingleAsync();
        var item = await WhatsAppStaffNotifications.StageAsync(db, assistant, binding.Id, "OutstandingDigest", "BossAdmin",
            "2027-01-02", 1, "Synthetic current facts", Now, Now + 3600, Now, "admin");
        await db.SaveChangesAsync();
        Assert.Null((await db.WhatsAppOutbox.AsNoTracking().SingleAsync()).SubmittedBody);
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, StaffDispatch(), (row, _) =>
        {
            Assert.Equal("Synthetic current facts", row.TemplateReference);
            return Task.FromResult(new WhatsAppSendResult("Accepted", "wamid.synthetic-staff"));
        }, Now, assistant: assistant, currentStaffFacts: (_, _, _) => Task.FromResult(true)));
        var accepted = await db.WhatsAppOutbox.AsNoTracking().SingleAsync();
        Assert.Equal("Accepted", accepted.State);
        Assert.Equal(Now, accepted.AcceptedAt);
        Assert.Equal("Synthetic current facts", accepted.SubmittedBody);
        Assert.Equal("approved_staff_notice", accepted.SubmittedTemplateName);
        Assert.Equal("ms", accepted.SubmittedLanguage);
        Assert.False(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, StaffDispatch(), (_, _) =>
            throw new InvalidOperationException("Duplicate submission"), Now, assistant: assistant,
            currentStaffFacts: (_, _, _) => Task.FromResult(true)));
        var history = await WhatsAppStaffNotifications.HistoryAsync(db, null, null, "staff-notification", "OutstandingDigest",
            "Accepted", 1, Now);
        var displayed = Assert.Single(history.Items);
        Assert.Equal(item!.Id, displayed.Id);
        Assert.Equal("***6789", displayed.MaskedNumber);
        Assert.Equal("Synthetic staff", displayed.StaffName);
        Assert.Equal("Synthetic current facts", displayed.SubmittedBody);
        Assert.False(displayed.CanRetry);
        Assert.Empty((await WhatsAppStaffNotifications.HistoryAsync(db, null, null, "staff-notification", "OcrUsage",
            null, 1, Now)).Items);
    }

    [Fact]
    public async Task Staff_dispatch_submits_refreshed_due_parameter_after_one_item_is_paid()
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "OutstandingDigest", new(true, 540, 3, 0), "admin", Now);
        var day = WhatsAppStaffNotifications.LocalDate(Now);
        var vehicle = new Vehicle { PlateNumber = "FRESH123" };
        var settlement = new SettlementReminder { VehicleId = vehicle.Id, Deadline = day, Amount = 100,
            Direction = SettlementDirection.PaySeller };
        db.Vehicles.Add(vehicle);
        db.SettlementReminders.Add(settlement);
        db.DailySpends.Add(new DailySpend { DueDate = day, Amount = 20 });
        await db.SaveChangesAsync();
        var binding = await db.WhatsAppStaffBindings.SingleAsync();
        await WhatsAppStaffNotifications.StageCurrentDayDigestAsync(db, assistant, binding.Id, "OutstandingDigest",
            "BossAdmin", "STALE boss body", 1, Now, "admin");
        await db.SaveChangesAsync();
        await db.SettlementReminders.Where(item => item.Id == settlement.Id)
            .ExecuteUpdateAsync(set => set.SetProperty(item => item.IsPaid, true));
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, StaffDispatch(), (row, _) =>
        {
            Assert.Contains("Perbelanjaan RM20.00", row.TemplateReference);
            Assert.DoesNotContain("STALE", row.TemplateReference);
            Assert.DoesNotContain("FRESH123", row.TemplateReference);
            Assert.Equal(row.TemplateReference, row.Body);
            return Task.FromResult(new WhatsAppSendResult("Accepted", "wamid.refreshed"));
        }, Now, assistant: assistant, refreshStaff: WhatsAppStaffNotifications.RefreshAsync));
        var sent = await db.WhatsAppOutbox.AsNoTracking().SingleAsync();
        Assert.Equal("Accepted", sent.State);
        Assert.Equal(sent.TemplateReference, sent.SubmittedBody);
        Assert.Equal(sent.Body, sent.SubmittedBody);
        Assert.Equal("approved_staff_notice", sent.SubmittedTemplateName);
    }

    [Fact]
    public async Task Staff_dispatch_suppresses_reassigned_delivery_without_submitting_stale_body()
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "OutstandingDigest", new(true, 540, 3, 0), "admin", Now);
        await db.UserRoles.Where(row => row.UserId == "staff-notification").ExecuteDeleteAsync();
        db.Roles.Add(new IdentityRole("Sales") { Id = "notification-sales-reassign", NormalizedName = "SALES" });
        db.UserRoles.Add(new IdentityUserRole<string> { UserId = "staff-notification", RoleId = "notification-sales-reassign" });
        var vehicle = new Vehicle { PlateNumber = "ASSIGN123", SalesAgentUserId = "staff-notification" };
        var delivery = new DeliverySchedule { VehicleId = vehicle.Id, ScheduledDate = WhatsAppStaffNotifications.LocalDate(Now),
            Status = DeliveryStatus.Scheduled };
        db.Vehicles.Add(vehicle); db.DeliverySchedules.Add(delivery);
        await db.SaveChangesAsync();
        var binding = await db.WhatsAppStaffBindings.SingleAsync();
        await WhatsAppStaffNotifications.StageCurrentDayDigestAsync(db, assistant, binding.Id, "OutstandingDigest",
            "Sales", "STALE assignment", 1, Now, "admin");
        await db.SaveChangesAsync();
        await db.Vehicles.Where(item => item.Id == vehicle.Id)
            .ExecuteUpdateAsync(set => set.SetProperty(item => item.SalesAgentUserId, "another-sales"));
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, StaffDispatch(), (_, _) =>
            throw new InvalidOperationException("Reassigned Sales body must not be sent"), Now,
            assistant: assistant, refreshStaff: WhatsAppStaffNotifications.RefreshAsync));
        var suppressed = await db.WhatsAppOutbox.AsNoTracking().SingleAsync();
        Assert.Equal("Suppressed", suppressed.State);
        Assert.Null(suppressed.SubmittedBody);
    }

    [Fact]
    public async Task Ocr_quota_commit_survives_warning_evaluation_failure()
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        db.AiServiceLimits.Add(new AiServiceLimit { Service = AiService.Ocr, MonthlyRequestLimit = 10,
            PerStaffDailyRequestLimit = 10 });
        await db.SaveChangesAsync();
        using var provider = new ServiceCollection().BuildServiceProvider();
        var quota = new AiUsageQuotaService(db, provider.GetRequiredService<IServiceScopeFactory>(),
            StaffAssistant(), NullLogger<AiUsageQuotaService>.Instance);
        var result = await quota.ReserveOcrAsync(Guid.NewGuid(), "synthetic-staff");
        Assert.True(result.IsAllowed);
        Assert.Single(await db.AiUsageRecords.AsNoTracking().ToListAsync());
    }

    [Fact]
    public async Task Staff_daily_schedule_uses_saved_local_time_and_disabled_defaults()
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        var defaults = await WhatsAppStaffNotifications.PoliciesAsync(db, StaffDispatch());
        Assert.All(defaults, policy => Assert.False(policy.Enabled));
        Assert.Equal(540, defaults.Single(policy => policy.Category == "LeaveApproval").LocalMinuteOfDay);
        Assert.True(await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "LeaveApproval", new(true, 615, 0, 0), "admin", Now));
        Assert.False(await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "VehicleEvent", new(true, 615, 0, 0), "admin", Now));
        var day = WhatsAppStaffNotifications.LocalDate(Now);
        var dueAt = WhatsAppStaffNotifications.LocalDayDueAt(day, 615);
        var binding = await db.WhatsAppStaffBindings.SingleAsync();
        Assert.Null(await WhatsAppStaffNotifications.StageCurrentDayDigestAsync(db, assistant, binding.Id, "LeaveApproval",
            "BossAdmin", "Current approvals", 1, dueAt - 1, "admin"));
        var staged = await WhatsAppStaffNotifications.StageCurrentDayDigestAsync(db, assistant, binding.Id,
            "LeaveApproval", "BossAdmin", "Current approvals", 1, dueAt, "admin");
        Assert.Equal(dueAt, staged!.ScheduledAt);
        Assert.Equal(WhatsAppStaffNotifications.LocalDayDueAt(day.AddDays(1), 0), staged.ExpiresAt);
    }

    [Fact]
    public async Task Staff_daily_key_is_user_category_day_scoped_even_when_role_changes()
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        db.Roles.Add(new IdentityRole("Sales") { Id = "notification-sales-daily", NormalizedName = "SALES" });
        db.UserRoles.Add(new IdentityUserRole<string>
            { UserId = "staff-notification", RoleId = "notification-sales-daily" });
        await db.SaveChangesAsync();
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "OutstandingDigest", new(true, 540, 3, 0), "admin", Now);
        var binding = await db.WhatsAppStaffBindings.SingleAsync();
        var sales = await WhatsAppStaffNotifications.StageCurrentDayDigestAsync(db, assistant, binding.Id,
            "OutstandingDigest", "Sales", "Synthetic Sales projection", 1, Now, "scheduler");
        await db.SaveChangesAsync();
        var boss = await WhatsAppStaffNotifications.StageCurrentDayDigestAsync(db, assistant, binding.Id,
            "OutstandingDigest", "BossAdmin", "Synthetic Boss projection", 1, Now, "scheduler");
        Assert.Equal(sales!.Id, boss!.Id);
        Assert.Equal(1, await db.WhatsAppOutbox.CountAsync());
    }

    [Fact]
    public async Task Staff_dispatch_skips_older_unapproved_language_and_submits_exact_approved_template()
    {
        await using var fixture = await Fixture.Create(); await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        await db.WhatsAppStaffBindings.ExecuteUpdateAsync(set => set.SetProperty(row => row.Language, "en_US"));
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "OutstandingDigest", new(true, 540, 3, 0), "admin", Now);
        var binding = await db.WhatsAppStaffBindings.SingleAsync();
        var approved = await WhatsAppStaffNotifications.StageAsync(db, assistant, binding.Id,
            "OutstandingDigest", "BossAdmin", "today", 1, "Current synthetic reminder", Now, Now + 3600, Now,
            "scheduler");
        Assert.NotNull(approved);
        db.WhatsAppOutbox.Add(approved! with { Id = Guid.NewGuid(), IdempotencyKey = Guid.NewGuid().ToString("N"),
            Language = "ms", CreatedAt = Now - 1 });
        await db.SaveChangesAsync();
        var options = StaffDispatch(new WhatsAppApprovedTemplate
            { Key = "staff_notice_v1", Language = "ms", Name = "draft_staff_notice" },
            new WhatsAppApprovedTemplate { Key = "staff_notice_v1", Language = "en_US", Name = "approved_staff_notice",
                Approved = true, ApprovalEvidence = "synthetic approval" });
        var calls = 0;
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, options, (_, _) =>
        {
            calls++;
            return Task.FromResult(new WhatsAppSendResult("Accepted", "wamid.synthetic-exact"));
        }, Now, assistant: assistant, currentStaffFacts: (_, _, _) => Task.FromResult(true)));
        Assert.Equal(1, calls);
        var rows = await db.WhatsAppOutbox.AsNoTracking().ToListAsync();
        Assert.Equal("Queued", Assert.Single(rows, row => row.Language == "ms").State);
        var sent = Assert.Single(rows, row => row.Language == "en_US");
        Assert.Equal("Accepted", sent.State);
        Assert.Equal("approved_staff_notice", sent.SubmittedTemplateName);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task Workflow_receipt_dispatch_is_amount_free_deduplicated_and_assignment_bound(bool reassign)
    {
        // The new FinanceEvent/Sales route must never admit arbitrary finance bodies
        // or deliver an old receipt event after a vehicle's Sales assignment changes.
        await using var fixture = await Fixture.Create();
        await using var db = fixture.Open();
        var assistant = StaffAssistant();
        await AddStaffBinding(db, assistant);
        db.Roles.Add(new IdentityRole("Sales") { Id = "workflow-sales", NormalizedName = "SALES" });
        db.UserRoles.Add(new IdentityUserRole<string> { UserId = "staff-notification", RoleId = "workflow-sales" });
        var vehicle = new Vehicle { PlateNumber = "WFT123", SalesAgentUserId = "staff-notification" };
        var payment = new PaymentRecord { VehicleId = vehicle.Id, ReceiptNumber = "PRIVATE_REFERENCE", NettPrice = 43210 };
        db.Vehicles.Add(vehicle);
        db.PaymentRecords.Add(payment);
        await db.SaveChangesAsync();
        await WhatsAppStaffNotifications.UpdatePolicyAsync(db, "FinanceEvent", new(true, 0, 0, 0), "admin", Now);
        await WhatsAppWorkflowEvents.StageAsync(db, WhatsAppWorkflowEvents.ReceiptSaved, payment.Id, 1, vehicle, "synthetic", Now);
        await db.SaveChangesAsync();
        Assert.Equal(1, await WhatsAppWorkflowDispatch.EnqueueAsync(db, assistant, Now));
        Assert.Equal(0, await WhatsAppWorkflowDispatch.EnqueueAsync(db, assistant, Now + 1));
        if (reassign)
            await db.Vehicles.Where(row => row.Id == vehicle.Id).ExecuteUpdateAsync(set => set.SetProperty(row => row.SalesAgentUserId, "other-sales"));
        var calls = 0;
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(db, StaffDispatch(), (row, _) =>
        {
            calls++;
            Assert.DoesNotContain("PRIVATE", row.TemplateReference);
            Assert.DoesNotContain("43210", row.TemplateReference);
            Assert.Contains("WFT123", row.TemplateReference);
            return Task.FromResult(new WhatsAppSendResult("Accepted", "wamid.synthetic.workflow"));
        }, Now + 2, assistant: assistant, refreshStaff: WhatsAppStaffNotifications.RefreshAsync));
        var delivered = await db.WhatsAppOutbox.AsNoTracking().SingleAsync();
        Assert.Equal(reassign ? 0 : 1, calls);
        Assert.Equal(reassign ? "Suppressed" : "Accepted", delivered.State);
        if (reassign) Assert.Null(delivered.SubmittedBody);
        else Assert.Equal(delivered.TemplateReference, delivered.SubmittedBody);
    }

    private static WhatsAppAssistantOptions StaffAssistant(bool testMode = true) => new()
    {
        Enabled = true, WebhookEnabled = true, TestMode = testMode, TestRecipient = Recipient,
        PhoneNumberId = "12345", BusinessAccountId = "45678", GraphApiVersion = "v25.0",
        AppSecret = new string('s', 32), VerifyToken = new string('v', 32), AccessToken = "synthetic-token"
    };

    private static WhatsAppDispatchOptions StaffDispatch(params WhatsAppApprovedTemplate[] templates) => new()
    {
        StaffCaptureEnabled = true, StaffSendingEnabled = true, WebhookEnabled = true, SenderApproved = true,
        SenderApprovalEvidence = "synthetic approved sender", GraphApiVersion = "v25.0", PhoneNumberId = "12345",
        BusinessAccountId = "45678", AccessToken = "synthetic-token", AppSecret = "synthetic-secret",
        VerifyToken = "synthetic-verify", BudgetOwner = "synthetic budget", DailyAttemptLimit = 10,
        MonthlyBudgetSen = 100, MaximumCostPerAttemptSen = 10, CostCeilingConfirmed = true,
        Templates = templates.Length == 0
            ? [new WhatsAppApprovedTemplate { Key = "staff_notice_v1", Name = "approved_staff_notice",
                Language = "ms", Approved = true, ApprovalEvidence = "synthetic approved template" }]
            : templates
    };

    private static async Task AddStaffBinding(AppDbContext db, WhatsAppAssistantOptions assistant)
    {
        db.Users.Add(new AppUser { Id = "staff-notification", UserName = "staff-notification", DisplayName = "Synthetic staff",
            SecurityStamp = "synthetic-stamp" });
        db.Roles.Add(new IdentityRole("BossAdmin") { Id = "notification-boss", NormalizedName = "BOSSADMIN" });
        db.UserRoles.Add(new IdentityUserRole<string> { UserId = "staff-notification", RoleId = "notification-boss" });
        await db.SaveChangesAsync();
        var issued = await WhatsAppStaffBindings.IssueAsync(db, assistant, "staff-notification",
            new(Recipient, "ms", true), "synthetic actor", Now);
        Assert.True(await WhatsAppStaffBindings.VerifyAsync(db, assistant, Recipient, issued.Command[5..], "notification-link", Now));
    }

    private sealed class Fixture(SqliteConnection anchor, DbContextOptions<AppDbContext> options) : IAsyncDisposable
    {
        public AppDbContext Open() => new(options);
        public static async Task<Fixture> Create(params IInterceptor[] interceptors)
        {
            var connectionString = $"Data Source={Guid.NewGuid():N};Mode=Memory;Cache=Shared";
            var anchor = new SqliteConnection(connectionString); await anchor.OpenAsync();
            var options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connectionString).AddInterceptors(interceptors).Options;
            await using var db = new AppDbContext(options); await db.Database.EnsureCreatedAsync();
            return new(anchor, options);
        }
        public ValueTask DisposeAsync() => anchor.DisposeAsync();
    }

    private sealed class SelectCounter : DbCommandInterceptor
    {
        public int Count { get; set; }
        public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(DbCommand command,
            CommandEventData eventData, InterceptionResult<DbDataReader> result, CancellationToken cancellationToken = default)
        {
            if (command.CommandText.TrimStart().StartsWith("SELECT", StringComparison.OrdinalIgnoreCase)) Count++;
            return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
        }
    }
}

internal static class WhatsAppDispatchTestData
{
    internal static WhatsAppDispatchOptions Options(bool enabled = true, bool approved = true, int daily = 3, long monthly = 100,
        bool costConfirmed = true, string language = "ms", string key = "enquiry_ack_v1") => new()
    {
        CaptureEnabled = true, SendingEnabled = enabled, WebhookEnabled = true, SenderApproved = true,
        SenderApprovalEvidence = "mock sender approval", GraphApiVersion = "v25.0", PhoneNumberId = "12345", BusinessAccountId = "45678",
        AccessToken = "test-token", AppSecret = "test-secret", VerifyToken = "test-verify", BudgetOwner = "synthetic budget owner",
        DailyAttemptLimit = daily, MonthlyBudgetSen = monthly, MaximumCostPerAttemptSen = 10, CostCeilingConfirmed = costConfirmed,
        Templates = [new() { Key = key, Name = "approved_enquiry_v1", Language = language, Approved = approved, ApprovalEvidence = "mock template approval" }]
    };
    internal static WhatsAppOutbox Item()
    {
        var id = Guid.NewGuid();
        return new() { IdempotencyKey = id.ToString("N"), Recipient = "60123456789", TemplateVersion = "enquiry_ack_v1", TemplateReference = id.ToString("N"),
            EventKind = "enquiry.created", BusinessReference = id.ToString("D"), Language = "ms", Body = "PRIVATE_BODY", State = "HeldForApproval",
            CreatedAt = 1800000000, NextAttemptAt = 1800000000, ExpiresAt = 1800000000 + 3600 };
    }
}
