using System.Security.Cryptography;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Xunit;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;

namespace YSHeng.Api.Tests;

public sealed class WhatsAppStaffAssistantTests
{
    [Fact]
    public async Task One_time_link_requires_the_intended_phone_and_replay_does_not_duplicate_binding_or_reply()
    {
        await using var fixture = await Fixture.Create();
        var issued = await fixture.Issue();
        var code = issued.Command[5..];
        Assert.False(await WhatsAppStaffBindings.VerifyAsync(fixture.Db, fixture.Options, "60188888888", code, "wrong-phone", fixture.Now));
        Assert.Equal(0, (await fixture.Db.WhatsAppStaffChallenges.SingleAsync()).FailedAttempts);
        Assert.True(await fixture.Verify(issued));
        Assert.True(await fixture.Verify(issued));
        Assert.Single(await fixture.Db.WhatsAppStaffBindings.ToListAsync());
        Assert.Single(await fixture.Db.WhatsAppStaffRequests.ToListAsync());
        Assert.DoesNotContain(code, JsonSerializer.Serialize(await fixture.Db.WhatsAppStaffChallenges.SingleAsync()));
        Assert.Equal("Connected", (await WhatsAppStaffBindings.StatusAsync(fixture.Db, fixture.Options, "staff", fixture.Now)).State);
    }

    [Fact]
    public async Task Link_expiry_failure_limit_and_issuance_cooldown_are_enforced()
    {
        await using var fixture = await Fixture.Create();
        var issued = await fixture.Issue();
        await Assert.ThrowsAsync<ArgumentException>(() => fixture.Issue());
        Assert.False(await fixture.Verify(issued, now: fixture.Now + 600));
        for (var attempt = 0; attempt < 5; attempt++)
            Assert.False(await WhatsAppStaffBindings.VerifyAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new string('F', 32), "invalid-" + attempt, fixture.Now));
        Assert.False(await fixture.Verify(issued));
        Assert.Empty(await fixture.Db.WhatsAppStaffBindings.ToListAsync());
        Assert.Equal(5, (await fixture.Db.WhatsAppStaffChallenges.SingleAsync()).FailedAttempts);
    }

    [Fact]
    public async Task An_occupied_number_is_not_transferred_and_revocation_preserves_history()
    {
        await using var fixture = await Fixture.Create();
        await fixture.AddStaff("second", "Sales");
        var first = await fixture.Issue();
        var second = await fixture.Issue("second");
        Assert.True(await fixture.Verify(first));
        Assert.False(await fixture.Verify(second, "second-event"));
        Assert.Equal("staff", (await fixture.Db.WhatsAppStaffBindings.SingleAsync()).StaffUserId);
        await WhatsAppStaffBindings.RevokeAsync(fixture.Db, "staff", "staff", fixture.Now + 1);
        Assert.True(await fixture.Verify(second, "second-event", fixture.Now + 2));
        var bindings = await fixture.Db.WhatsAppStaffBindings.ToListAsync();
        Assert.Equal(2, bindings.Count);
        Assert.Single(bindings, item => item.RevokedAt == null && item.StaffUserId == "second");
        Assert.Single(bindings, item => item.RevokedAt != null && item.StaffUserId == "staff");
    }

    [Theory]
    [InlineData("lockout")]
    [InlineData("stamp")]
    [InlineData("roles")]
    [InlineData("revoke")]
    public async Task Current_identity_changes_suppress_queued_answers(string change)
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        if (change == "revoke") await WhatsAppStaffBindings.RevokeAsync(fixture.Db, "staff", "staff", fixture.Now);
        else
        {
            var user = await fixture.Db.Users.SingleAsync();
            if (change == "lockout") user.LockoutEnd = DateTimeOffset.MaxValue;
            if (change == "stamp") user.SecurityStamp = "changed-synthetic-stamp";
            if (change == "roles") fixture.Db.UserRoles.RemoveRange(await fixture.Db.UserRoles.ToListAsync());
            await fixture.Db.SaveChangesAsync();
        }
        var sends = 0;
        await WhatsAppStaffQueue.DispatchOneAsync(fixture.Db, fixture.Options, (_, _, _) =>
        { sends++; return Task.FromResult(new WhatsAppSendResult("Accepted", "synthetic")); }, fixture.Now);
        Assert.Equal(0, sends);
        Assert.Equal("Suppressed", (await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync()).State);
    }

    [Fact]
    public async Task Signed_stop_takes_precedence_and_does_not_change_customer_notification_consent()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        fixture.Db.WhatsAppConsents.Add(new WhatsAppConsent { Recipient = fixture.Options.TestRecipient, OptedIn = true, Evidence = "synthetic customer opt-in" });
        await fixture.Db.SaveChangesAsync();
        await fixture.Db.WhatsAppStaffBindings.ExecuteUpdateAsync(set => set.SetProperty(item => item.VerifiedAt, fixture.Now - 4000));
        using var payload = fixture.Payload(("help", fixture.Now), ("stop", fixture.Now - 3600), ("language en", fixture.Now));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, payload.RootElement, fixture.Now));
        Assert.NotNull((await fixture.Db.WhatsAppStaffBindings.AsNoTracking().SingleAsync()).RevokedAt);
        Assert.Equal("Suppressed", (await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync()).State);
        Assert.True((await fixture.Db.WhatsAppConsents.SingleAsync()).OptedIn);
    }

    [Fact]
    public async Task Duplicate_events_send_once_and_ambiguous_outcomes_are_not_replayed()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        await fixture.DispatchAccepted();
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("test"), "same-event", fixture.Now));
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("test"), "same-event", fixture.Now));
        var sends = 0;
        await WhatsAppStaffQueue.DispatchOneAsync(fixture.Db, fixture.Options, (_, _, _) =>
        { sends++; return Task.FromResult(new WhatsAppSendResult("UnknownOutcome")); }, fixture.Now);
        Assert.False(await WhatsAppStaffQueue.DispatchOneAsync(fixture.Db, fixture.Options, (_, _, _) =>
        { sends++; return Task.FromResult(new WhatsAppSendResult("Accepted", "unexpected")); }, fixture.Now));
        Assert.Equal(1, sends);
        Assert.Single(await fixture.Db.WhatsAppStaffRequests.Where(item => item.State == "UnknownOutcome").ToListAsync());
    }

    [Fact]
    public async Task Sales_reads_minimal_loan_delivery_and_vehicle_summaries_without_customer_or_financial_fields()
    {
        await using var fixture = await Fixture.Create();
        var vehicle = new Vehicle { PlateNumber = "TEST123", Year = 2021, Make = "Toyota", Model = "Vios", PurchasePrice = 777777, Status = VehicleStatus.LoanProcessing };
        fixture.Db.Vehicles.Add(vehicle);
        fixture.Db.LoanApplications.Add(new LoanApplication { VehicleId = vehicle.Id, Status = LoanStatus.Rejected, RejectionReason = "PRIVATE-REJECTION", CustomerId = Guid.NewGuid() });
        fixture.Db.DeliverySchedules.Add(new DeliverySchedule { VehicleId = vehicle.Id, Status = DeliveryStatus.Scheduled, ScheduledDate = new DateOnly(2026, 10, 2), DeliveryAddress = "PRIVATE-ADDRESS", InsurancePolicyReference = "PRIVATE-POLICY" });
        await fixture.Db.SaveChangesAsync();
        foreach (var command in new[] { "vehicle test123", "loan TEST-123", "delivery TEST123" })
        {
            var intent = Assert.IsType<WhatsAppStaffIntent>(WhatsAppStaffQueries.Parse(command));
            Assert.True(WhatsAppStaffQueries.Permitted(intent, ["Sales"]));
            var reply = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, intent, "en_US", fixture.Now);
            Assert.Contains("TEST123", reply);
            Assert.DoesNotContain("PRIVATE", reply);
            Assert.DoesNotContain("777777", reply);
        }
        Assert.False(WhatsAppStaffQueries.Permitted(new("collections", "TEST123"), ["Sales"]));
        Assert.False(WhatsAppStaffQueries.Permitted(new("settlement", "TEST123"), ["Loan"]));
        Assert.False(WhatsAppStaffQueries.Permitted(new("profit", "month"), ["Finance"]));
        Assert.True(WhatsAppStaffQueries.Permitted(new("collections", "TEST123"), ["Finance"]));
        Assert.True(WhatsAppStaffQueries.Permitted(new("profit", "month"), ["BossAdmin"]));
        Assert.DoesNotContain("• collections", WhatsAppStaffQueries.Help("en_US", ["Sales"]));
        Assert.Contains("• collections", WhatsAppStaffQueries.Help("en_US", ["Finance"]));
        Assert.DoesNotContain("• profit", WhatsAppStaffQueries.Help("en_US", ["Finance"]));
        Assert.Contains("• profit", WhatsAppStaffQueries.Help("en_US", ["BossAdmin"]));
        Assert.Contains("cannot access", await WhatsAppStaffFinanceQueries.ReplyAsync(fixture.Db, new("profit", "month"), ["Finance"], "en_US", fixture.Now));
    }

    [Fact]
    public async Task Finance_plate_queries_use_authoritative_collection_states_and_saved_settlement_snapshots()
    {
        // Prevents pending, reversed, void-receipt metadata or legacy rows from changing a Finance V2 receivable balance.
        await using var fixture = await Fixture.Create();
        var customerId = Guid.NewGuid();
        var owner = new Owner { Name = "Synthetic seller", Phone = "PRIVATE OWNER PHONE" };
        var vehicle = new Vehicle { PlateNumber = "FIN-123", Year = 2022, Make = "Toyota", Model = "Vios", CustomerId = customerId };
        var payment = new PaymentRecord { VehicleId = vehicle.Id, CustomerId = customerId, FinanceWorkflowVersion = 2, NettPrice = 50_000m, FormulaVersion = FinanceV2Rules.FormulaVersion };
        fixture.Db.Owners.Add(owner);
        fixture.Db.Vehicles.Add(vehicle);
        fixture.Db.PaymentRecords.AddRange(
            new PaymentRecord { VehicleId = vehicle.Id, FinanceWorkflowVersion = 1, NettPrice = 999_999m, Status = PaymentStatus.Reconciled },
            payment);
        fixture.Db.FinanceInvoices.Add(new FinanceInvoice
        {
            PaymentRecordId = payment.Id, VehicleId = vehicle.Id, CustomerId = customerId, Amount = payment.NettPrice,
            CustomerName = "PRIVATE CUSTOMER", CustomerPhone = "PRIVATE PHONE", LoanBankReference = "PRIVATE BANK", InvoiceNumber = "SYN-FIN-1"
        });
        fixture.Db.CollectionTransactions.AddRange(
            new CollectionTransaction { PaymentRecordId = payment.Id, Amount = 45_000m, Status = CollectionStatus.Reconciled, OfficialReceiptVoided = true, Notes = "PRIVATE RECONCILED" },
            new CollectionTransaction { PaymentRecordId = payment.Id, Amount = 2_000m, Status = CollectionStatus.Pending, Notes = "PRIVATE PENDING" },
            new CollectionTransaction { PaymentRecordId = payment.Id, Amount = 3_000m, Status = CollectionStatus.Reversed, Notes = "PRIVATE REVERSED" });
        fixture.Db.SettlementReminders.Add(new SettlementReminder
        {
            VehicleId = vehicle.Id, OwnerId = owner.Id, Direction = SettlementDirection.CollectFromSeller, PurchasePriceSnapshot = 20_000m,
            BankDebtAmount = 20_800m, Amount = 800m, Deadline = new DateOnly(2026, 9, 29)
        });
        await fixture.Db.SaveChangesAsync();
        var now = new DateTimeOffset(2026, 9, 30, 12, 0, 0, TimeSpan.FromHours(8)).ToUnixTimeSeconds();

        var collections = await WhatsAppStaffFinanceQueries.ReplyAsync(fixture.Db, new("collections", "FIN123"), ["Finance"], "en_US", now);
        Assert.Contains("Receivable: RM 50,000.00", collections);
        Assert.Contains("Reconciled: RM 45,000.00", collections);
        Assert.Contains("Outstanding: RM 5,000.00", collections);
        Assert.Contains("Pending collections: RM 2,000.00 (not deducted)", collections);
        Assert.DoesNotContain("999,999", collections);
        Assert.DoesNotContain("PRIVATE", collections);

        var settlement = await WhatsAppStaffFinanceQueries.ReplyAsync(fixture.Db, new("settlement", "FIN123"), ["Finance"], "en_US", now);
        Assert.Contains("Direction: Collect from seller", settlement);
        Assert.Contains("Recorded amount: RM 800.00", settlement);
        Assert.Contains("Status: Overdue — outstanding", settlement);
        Assert.DoesNotContain("20,800", settlement);
    }

    [Fact]
    public async Task Finance_queries_distinguish_missing_records_from_saved_zero_and_reject_canonical_mismatch()
    {
        // Prevents an absent or mismatched money record from being reported as a trustworthy zero balance.
        await using var fixture = await Fixture.Create();
        var empty = new Vehicle { PlateNumber = "EMPTY1", Year = 2020, Make = "Perodua", Model = "Myvi" };
        var offset = new Vehicle { PlateNumber = "OFFSET1", Year = 2021, Make = "Honda", Model = "City" };
        var customerId = Guid.NewGuid();
        var owner = new Owner { Name = "Synthetic seller", Phone = "PRIVATE OWNER PHONE" };
        var mismatch = new Vehicle { PlateNumber = "MISMATCH1", Year = 2022, Make = "Toyota", Model = "Vios", CustomerId = customerId };
        var orphan = new Vehicle { PlateNumber = "ORPHAN1", Year = 2022, Make = "Toyota", Model = "Yaris" };
        var legacyZero = new Vehicle { PlateNumber = "LEGACY0", Year = 2019, Make = "Proton", Model = "Saga" };
        var payment = new PaymentRecord { VehicleId = mismatch.Id, CustomerId = customerId, FinanceWorkflowVersion = 2, NettPrice = 10_000m };
        fixture.Db.Owners.Add(owner);
        fixture.Db.Vehicles.AddRange(empty, offset, mismatch, orphan, legacyZero);
        fixture.Db.SettlementReminders.Add(new SettlementReminder
        {
            VehicleId = offset.Id, OwnerId = owner.Id, Direction = SettlementDirection.InternalOffset, PurchasePriceSnapshot = 20_000m,
            BankDebtAmount = 20_000m, Amount = 0m, Deadline = new DateOnly(2026, 9, 30)
        });
        fixture.Db.SettlementReminders.AddRange(
            new SettlementReminder { VehicleId = orphan.Id, OwnerId = Guid.NewGuid(), Direction = SettlementDirection.PaySeller, PurchasePriceSnapshot = 20_000m, BankDebtAmount = 19_000m, Amount = 1_000m, Deadline = new DateOnly(2026, 9, 30) },
            new SettlementReminder { VehicleId = legacyZero.Id, Direction = SettlementDirection.LegacyPaySeller, Amount = 0m, Deadline = new DateOnly(2026, 9, 30) });
        fixture.Db.PaymentRecords.Add(payment);
        fixture.Db.FinanceInvoices.Add(new FinanceInvoice { PaymentRecordId = payment.Id, VehicleId = mismatch.Id, CustomerId = Guid.NewGuid(), Amount = payment.NettPrice, InvoiceNumber = "SYN-MISMATCH" });
        await fixture.Db.SaveChangesAsync();
        var now = new DateTimeOffset(2026, 9, 30, 12, 0, 0, TimeSpan.FromHours(8)).ToUnixTimeSeconds();

        Assert.Contains("No seller settlement recorded", await WhatsAppStaffFinanceQueries.ReplyAsync(fixture.Db, new("settlement", "EMPTY1"), ["Finance"], "en_US", now));
        var zero = await WhatsAppStaffFinanceQueries.ReplyAsync(fixture.Db, new("settlement", "OFFSET1"), ["Finance"], "en_US", now);
        Assert.Contains("Direction: Internal offset", zero);
        Assert.Contains("Recorded amount: RM 0.00", zero);
        Assert.Contains("Review Finance in Back Office", await WhatsAppStaffFinanceQueries.ReplyAsync(fixture.Db, new("settlement", "ORPHAN1"), ["Finance"], "en_US", now));
        Assert.Contains("Review Finance in Back Office", await WhatsAppStaffFinanceQueries.ReplyAsync(fixture.Db, new("settlement", "LEGACY0"), ["Finance"], "en_US", now));
        var invalid = await WhatsAppStaffFinanceQueries.ReplyAsync(fixture.Db, new("collections", "MISMATCH1"), ["Finance"], "en_US", now);
        Assert.Contains("Review Finance in Back Office", invalid);
        Assert.DoesNotContain("RM 0.00", invalid);
    }

    [Fact]
    public void Finance_periods_are_inclusive_bounded_and_use_month_to_date()
    {
        // Prevents future, reversed or overlong ranges from returning a plausible but wrong management figure.
        var today = new DateOnly(2026, 9, 30);
        Assert.True(WhatsAppStaffFinanceQueries.TryParsePeriod("", today, out var month));
        Assert.Equal(new DateOnly(2026, 9, 1), month.From);
        Assert.Equal(today, month.To);
        Assert.True(WhatsAppStaffFinanceQueries.TryParsePeriod("2026-09", today, out var current));
        Assert.Equal(today, current.To);
        Assert.True(WhatsAppStaffFinanceQueries.TryParsePeriod("past month", today, out var past));
        Assert.Equal(new DateOnly(2026, 8, 1), past.From);
        Assert.Equal(new DateOnly(2026, 8, 31), past.To);
        Assert.True(WhatsAppStaffFinanceQueries.TryParsePeriod("2025-09-30 2026-09-30", today, out _));
        Assert.False(WhatsAppStaffFinanceQueries.TryParsePeriod("2025-09-29 2026-09-30", today, out _));
        Assert.False(WhatsAppStaffFinanceQueries.TryParsePeriod("2026-09-30 2026-09-29", today, out _));
        Assert.False(WhatsAppStaffFinanceQueries.TryParsePeriod("2026-10", today, out _));
        Assert.False(WhatsAppStaffFinanceQueries.TryParsePeriod("9999-12", today, out _));
        Assert.False(WhatsAppStaffFinanceQueries.TryParsePeriod("2026-02-30 2026-03-01", today, out _));
    }

    [Fact]
    public async Task Profit_uses_Malaysia_sold_date_and_period_actual_margin_instead_of_all_time_profit()
    {
        // Prevents a dated Boss reply from leaking the existing all-time RealisedProfit value into a period result.
        await using var fixture = await Fixture.Create();
        var inside = new Vehicle
        {
            PlateNumber = "SOLDIN", Year = 2021, Make = "Toyota", Model = "Vios", Status = VehicleStatus.Sold,
            PurchasePrice = 20_000m, SellingPrice = 30_000m, SoldAt = new DateTime(2026, 9, 29, 16, 0, 0, DateTimeKind.Utc)
        };
        var outside = new Vehicle
        {
            PlateNumber = "SOLDOUT", Year = 2020, Make = "Honda", Model = "City", Status = VehicleStatus.Sold,
            PurchasePrice = 10_000m, SellingPrice = 20_000m, SoldAt = new DateTime(2026, 9, 29, 15, 59, 59, DateTimeKind.Utc)
        };
        var missingDate = new Vehicle { PlateNumber = "NODATE", Year = 2019, Make = "Perodua", Model = "Myvi", Status = VehicleStatus.Sold, PurchasePrice = 1_000m, SellingPrice = 9_000m };
        fixture.Db.Vehicles.AddRange(inside, outside, missingDate);
        fixture.Db.RepairJobs.Add(new RepairJob { VehicleId = inside.Id, WhatToDo = "Synthetic repair", Cost = 1_000m });
        fixture.Db.BrokerCommissions.Add(new BrokerCommission { VehicleId = inside.Id, BrokerName = "Synthetic broker", Amount = 500m });
        fixture.Db.PaymentVouchers.Add(new PaymentVoucher { VehicleId = inside.Id, PayeeName = "Synthetic driver", Purpose = "Pickup", Amount = 100m, IssuedDate = new DateOnly(2026, 9, 1) });
        var owner = new Owner { Name = "Synthetic seller", Phone = "PRIVATE OWNER PHONE" };
        fixture.Db.Owners.Add(owner);
        fixture.Db.SettlementReminders.AddRange(
            new SettlementReminder { VehicleId = inside.Id, OwnerId = owner.Id, Direction = SettlementDirection.PaySeller, PurchasePriceSnapshot = 20_000m, BankDebtAmount = 19_000m, Amount = 1_000m, Deadline = new DateOnly(2026, 9, 30) },
            new SettlementReminder { VehicleId = inside.Id, OwnerId = owner.Id, Direction = SettlementDirection.PaySeller, PurchasePriceSnapshot = 20_000m, BankDebtAmount = 19_000m, Amount = 1_000m, Deadline = new DateOnly(2026, 9, 30) });
        await fixture.Db.SaveChangesAsync();
        var now = new DateTimeOffset(2026, 9, 30, 12, 0, 0, TimeSpan.FromHours(8)).ToUnixTimeSeconds();

        var reply = await WhatsAppStaffFinanceQueries.ReplyAsync(fixture.Db, new("profit", "today"), ["BossAdmin"], "en_US", now);
        Assert.Contains("Vehicles sold: 1", reply);
        Assert.Contains("Margin: RM 8,400.00", reply);
        Assert.Contains("not cash profit", reply);
        Assert.Contains("Historical margins can change", reply);
        Assert.DoesNotContain("18,400", reply);
        var dashboard = await WhatsAppStaffFinanceQueries.ReplyAsync(fixture.Db, new("dashboard", "today"), ["BossAdmin"], "en_US", now);
        Assert.Contains("Validated current balances (partial)", dashboard);
        Assert.Contains("Validated seller settlements to pay: RM 0.00", dashboard);
        Assert.Contains("1 ambiguous or inconsistent settlement vehicle(s)", dashboard);
    }

    [Fact]
    public async Task Stock_search_uses_all_words_and_pages_with_inclusive_budget_and_price_on_request()
    {
        await using var fixture = await Fixture.Create();
        var vehicles = Enumerable.Range(1, 7).Select(index => new Vehicle
        {
            Id = Guid.NewGuid(), PlateNumber = $"P{index:000}", Year = 2020 + index, Make = "Toyota", Model = "Vios",
            SellingPrice = index switch { 1 => 50000m, 2 => 49999.99m, 3 => 0m, _ => 51000m },
            Status = VehicleStatus.Available, IsPublic = true, BossConfirmed = true
        }).ToArray();
        fixture.Db.Vehicles.AddRange(vehicles);
        fixture.Db.Vehicles.Add(new Vehicle { PlateNumber = "CITY01", Year = 2022, Make = "Toyota", Model = "City", SellingPrice = 40000, Status = VehicleStatus.Available, IsPublic = true, BossConfirmed = true });
        await fixture.Db.SaveChangesAsync();

        var budget = Assert.IsType<WhatsAppStaffIntent>(WhatsAppStaffQueries.Parse("stock Toyota Vios under 50000 page 1"));
        var budgetReply = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, budget, "en_US", fixture.Now);
        Assert.Contains("1-2 of 2", budgetReply);
        Assert.Contains("RM 50,000", budgetReply);
        Assert.Contains("RM 49,999.99", budgetReply);
        Assert.DoesNotContain("P003", budgetReply);

        var first = Assert.IsType<WhatsAppStaffIntent>(WhatsAppStaffQueries.Parse("stock Toyota Vios"));
        var firstReply = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, first, "en_US", fixture.Now);
        Assert.Contains("1-5 of 7", firstReply);
        Assert.Contains("Price on request", firstReply);
        Assert.Contains("Next: stock Toyota Vios page 2", firstReply);

        var second = Assert.IsType<WhatsAppStaffIntent>(WhatsAppStaffQueries.Parse("stock Toyota Vios page 2"));
        var secondReply = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, second, "en_US", fixture.Now);
        Assert.Contains("6-7 of 7", secondReply);
        Assert.Contains("P006", secondReply);
        Assert.Contains("P007", secondReply);
        Assert.DoesNotContain("Next:", secondReply);
    }

    [Fact]
    public async Task Vehicle_and_share_show_safe_sales_details_and_validate_public_listing_origin()
    {
        await using var fixture = await Fixture.Create();
        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(), PlateNumber = "SAFE123", Year = 2021, Make = "Toyota", Model = "Vios", SellingPrice = 55000,
            PurchasePrice = 777777, StockLocation = "PRIVATE-BAY", Status = VehicleStatus.Available, IsPublic = true, BossConfirmed = true,
            CustomerId = Guid.NewGuid()
        };
        fixture.Db.Vehicles.Add(vehicle);
        fixture.Db.Vehicles.AddRange(
            new Vehicle { PlateNumber = "PRIVATE1", Year = 2021, Make = "Toyota", Model = "Vios", SellingPrice = 50000, Status = VehicleStatus.Available, IsPublic = false, BossConfirmed = true },
            new Vehicle { PlateNumber = "SOLD001", Year = 2021, Make = "Toyota", Model = "Vios", SellingPrice = 50000, Status = VehicleStatus.Sold, IsPublic = true, BossConfirmed = true },
            new Vehicle { PlateNumber = "UNCONF1", Year = 2021, Make = "Toyota", Model = "Vios", SellingPrice = 50000, Status = VehicleStatus.Available, IsPublic = true, BossConfirmed = false });
        await fixture.Db.SaveChangesAsync();

        var internalReply = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, new("vehicle", "SAFE123"), "en_US", fixture.Now,
            publicSiteUrl: "https://sales.example.com");
        Assert.Contains("RM 55,000", internalReply);
        Assert.Contains("PRIVATE-BAY", internalReply);
        Assert.Contains($"https://sales.example.com/vehicles/{vehicle.Id:D}", internalReply);
        Assert.DoesNotContain("777777", internalReply);
        foreach (var plate in new[] { "PRIVATE1", "SOLD001", "UNCONF1" })
            Assert.DoesNotContain("Public listing:", await WhatsAppStaffQueries.ReplyAsync(fixture.Db,
                new("vehicle", plate), "en_US", fixture.Now, publicSiteUrl: "https://sales.example.com"));

        var shareReply = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, new("share", "SAFE123"), "en_US", fixture.Now, publicSiteUrl: "https://sales.example.com");
        Assert.Contains("2021 Toyota Vios", shareReply);
        Assert.Contains("RM 55,000", shareReply);
        Assert.Contains($"https://sales.example.com/vehicles/{vehicle.Id:D}", shareReply);
        Assert.DoesNotContain("PRIVATE-BAY", shareReply);
        Assert.DoesNotContain("777777", shareReply);
        var malayShare = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, new("share", "SAFE123"), "ms", fixture.Now, publicSiteUrl: "https://sales.example.com");
        Assert.Contains("Harga jualan", malayShare);
        foreach (var plate in new[] { "PRIVATE1", "SOLD001", "UNCONF1" })
            Assert.Contains("No matching public vehicle", await WhatsAppStaffQueries.ReplyAsync(fixture.Db, new("share", plate), "en_US", fixture.Now));

        var invalid = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, new("share", "SAFE123"), "en_US", fixture.Now, publicSiteUrl: "http://localhost:3000");
        Assert.Contains("unavailable", invalid, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("localhost", invalid, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Deliveries_support_tomorrow_only_and_include_the_last_page()
    {
        await using var fixture = await Fixture.Create();
        var today = BusinessClock.SingaporeDate(DateTimeOffset.FromUnixTimeSeconds(fixture.Now));
        var vehicle = new Vehicle { PlateNumber = "DEL001", Year = 2022, Make = "Toyota", Model = "Vios", Status = VehicleStatus.Available };
        fixture.Db.Vehicles.Add(vehicle);
        fixture.Db.DeliverySchedules.Add(new DeliverySchedule { VehicleId = vehicle.Id, ScheduledDate = today, Status = DeliveryStatus.Scheduled });
        for (var index = 0; index < 6; index++)
        {
            var next = new Vehicle { PlateNumber = $"TMR{index:000}", Year = 2020, Make = "Honda", Model = "City", Status = VehicleStatus.Available };
            fixture.Db.Vehicles.Add(next);
            fixture.Db.DeliverySchedules.Add(new DeliverySchedule { VehicleId = next.Id, ScheduledDate = today.AddDays(1), ScheduledTime = new TimeOnly(9 + index, 0), Status = DeliveryStatus.Scheduled });
        }
        await fixture.Db.SaveChangesAsync();

        var pageOne = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, new("deliveries", "tomorrow page 1"), "en_US", fixture.Now);
        Assert.Contains("1-5 of 6", pageOne);
        Assert.DoesNotContain("DEL001", pageOne);
        Assert.Contains("Next: deliveries tomorrow page 2", pageOne);

        var pageTwo = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, new("deliveries", "tomorrow page 2"), "en_US", fixture.Now);
        Assert.Contains("6-6 of 6", pageTwo);
        Assert.Contains("TMR005", pageTwo);
        Assert.DoesNotContain("Next:", pageTwo);
    }

    [Theory]
    [InlineData("stock under 0")]
    [InlineData("stock under fifty")]
    [InlineData("stock under 50000 page 0")]
    [InlineData("stock page two")]
    [InlineData("deliveries tomorrow page 0")]
    [InlineData("next")]
    public void Sales_command_filters_reject_invalid_price_and_bare_continuation(string command) => Assert.Null(WhatsAppStaffQueries.Parse(command));

    [Fact]
    public void Menu_is_a_distinct_interactive_intent_and_delivery_pages_are_canonical()
    {
        Assert.Equal("menu", Assert.IsType<WhatsAppStaffIntent>(WhatsAppStaffQueries.Parse("menu")).Name);
        Assert.Equal("next 7 page 2", Assert.IsType<WhatsAppStaffIntent>(WhatsAppStaffQueries.Parse("deliveries next 7 page 2")).Argument);
        Assert.Equal("page 2", Assert.IsType<WhatsAppStaffIntent>(WhatsAppStaffQueries.Parse("stock page 2")).Argument);
    }

    [Fact]
    public async Task Interactive_selection_is_fixed_deduplicated_and_checked_against_current_roles()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        await fixture.DispatchAccepted();
        using var payload = JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            @object = "whatsapp_business_account",
            entry = new[] { new { id = fixture.Options.BusinessAccountId, changes = new[] { new { field = "messages", value = new
            {
                metadata = new { phone_number_id = fixture.Options.PhoneNumberId },
                messages = new[] { new
                {
                    id = "interactive-once", from = fixture.Options.TestRecipient, type = "interactive",
                    timestamp = fixture.Now.ToString(), interactive = new { type = "list_reply", list_reply = new { id = "service:collections" } }
                } }
            } } } } }
        }));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, payload.RootElement, fixture.Now));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, payload.RootElement, fixture.Now));
        var request = await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync(item => item.Intent == "service");
        Assert.Equal("service", request.Intent);
        Assert.Equal("collections", request.Argument);
        var reply = await fixture.DispatchAccepted();
        Assert.Contains("cannot access", reply);
        Assert.Null(WhatsAppStaffCommandHelp.ParseSelection("service:collections:ABC1234"));
        Assert.Null(WhatsAppStaffCommandHelp.ParseSelection("service:private"));
    }

    [Fact]
    public async Task Finance_role_removed_before_menu_dispatch_does_not_receive_finance_service_guidance()
    {
        await using var fixture = await Fixture.Create();
        fixture.Db.Roles.Add(new IdentityRole("Finance") { Id = "Finance", NormalizedName = "FINANCE" });
        fixture.Db.UserRoles.Add(new IdentityUserRole<string> { UserId = "staff", RoleId = "Finance" });
        await fixture.Db.SaveChangesAsync();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        await fixture.DispatchAccepted();
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient,
            new("service", "collections"), "stale-selection", fixture.Now));
        await fixture.Db.UserRoles.Where(item => item.RoleId == "Finance").ExecuteDeleteAsync();
        var reply = await fixture.DispatchAccepted();
        Assert.Contains("cannot access", reply);
        Assert.DoesNotContain("collections ABC1234", reply);
    }

    [Fact]
    public void Service_catalogue_matches_typed_commands_and_role_counts()
    {
        Assert.Equal(6, WhatsAppStaffCommandHelp.Allowed(["Sales"]).Count);
        Assert.Equal(8, WhatsAppStaffCommandHelp.Allowed(["Finance"]).Count);
        Assert.Equal(10, WhatsAppStaffCommandHelp.Allowed(["BossAdmin"]).Count);
        Assert.Equal(10, WhatsAppStaffCommandHelp.Allowed(["Sales", "Finance", "BossAdmin"]).Count);
        foreach (var service in WhatsAppStaffCommandHelp.Services)
        {
            Assert.Equal(service.Name, WhatsAppStaffQueries.Parse(service.Example)?.Name);
            Assert.Equal(service.Name, WhatsAppStaffCommandHelp.ParseSelection("service:" + service.Name)?.Argument);
        }
        Assert.InRange(WhatsAppStaffQueries.Help("en_US", ["BossAdmin"]).Length, 1, 3500);
        Assert.InRange(WhatsAppStaffQueries.Help("ms", ["BossAdmin"]).Length, 1, 3500);
    }

    [Fact]
    public async Task Verified_staff_mistype_gets_bounded_usage_without_storing_raw_text()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        await fixture.DispatchAccepted();
        using var payload = fixture.Payload(("vehicle", fixture.Now));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, payload.RootElement, fixture.Now));
        var request = await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync(item => item.Intent == "usage");
        Assert.Equal("usage", request.Intent);
        Assert.Equal("vehicle", request.Argument);
        Assert.DoesNotContain("vehicle\n", request.Argument);
        var reply = await fixture.DispatchAccepted();
        Assert.Contains("vehicle ABC1234", reply);
    }

    [Fact]
    public async Task Recovery_never_replies_before_binding_or_after_revocation()
    {
        await using var fixture = await Fixture.Create();
        using var unbound = fixture.Payload(("what is PRIVATE-RAW", fixture.Now));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, unbound.RootElement, fixture.Now));
        Assert.Empty(await fixture.Db.WhatsAppStaffRequests.AsNoTracking().ToListAsync());

        Assert.True(await fixture.Verify(await fixture.Issue()));
        await fixture.DispatchAccepted();
        await WhatsAppStaffBindings.RevokeAsync(fixture.Db, "staff", "test", fixture.Now + 1);
        using var revoked = fixture.Payload(("what is PRIVATE-RAW", fixture.Now + 1));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, revoked.RootElement, fixture.Now + 1));
        Assert.Empty(await fixture.Db.WhatsAppStaffRequests.AsNoTracking().Where(item => item.Intent == "usage").ToListAsync());
    }

    [Fact]
    public async Task Bound_unknown_text_is_recovered_without_persisting_or_echoing_raw_content()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        await fixture.DispatchAccepted();
        using var payload = fixture.Payload(("please reveal PRIVATE-RAW", fixture.Now));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, payload.RootElement, fixture.Now));
        var request = await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync(item => item.Intent == "usage");
        Assert.Equal("", request.Argument);
        Assert.DoesNotContain("PRIVATE-RAW", JsonSerializer.Serialize(request));
        var reply = await fixture.DispatchAccepted();
        Assert.DoesNotContain("PRIVATE-RAW", reply);
        Assert.Contains("help", reply, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Recovery_is_rate_limited_per_staff_for_one_minute()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        await fixture.DispatchAccepted();
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("usage", ""), "usage-one", fixture.Now));
        Assert.False(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("usage", ""), "usage-two", fixture.Now + 1));
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("usage", ""), "usage-three", fixture.Now + 61));
        var requests = await fixture.Db.WhatsAppStaffRequests.AsNoTracking().Where(item => item.Intent == "usage").ToListAsync();
        Assert.Equal(2, requests.Count);
    }

    [Fact]
    public async Task Recovery_remains_inside_the_staff_daily_quota()
    {
        await using var fixture = await Fixture.Create(limit: 2);
        Assert.True(await fixture.Verify(await fixture.Issue()));
        await fixture.DispatchAccepted();
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("usage", ""), "daily-one", fixture.Now));
        Assert.False(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("usage", ""), "daily-two", fixture.Now + 61));
    }

    [Fact]
    public void Delivery_dates_distinguish_planned_cancelled_and_actual_release()
    {
        var date = new DateOnly(2026, 10, 2);
        Assert.Contains("Planned date", WhatsAppStaffQueries.FormatDelivery([new(date, null, DeliveryStatus.BookingInspection, null)], "en_US"));
        Assert.Contains("Time not set", WhatsAppStaffQueries.FormatDelivery([new(date, null, DeliveryStatus.Scheduled, null)], "en_US"));
        Assert.Contains("Previous plan cancelled", WhatsAppStaffQueries.FormatDelivery([new(date, null, DeliveryStatus.Cancelled, null)], "en_US"));
        var missing = WhatsAppStaffQueries.FormatDelivery([new(date, null, DeliveryStatus.Released, null)], "en_US");
        Assert.Contains("not recorded", missing);
        Assert.DoesNotContain("02 Oct", missing);
        var actual = WhatsAppStaffQueries.FormatDelivery([new(date, null, DeliveryStatus.Released, new DateTime(2026, 10, 3, 1, 30, 0))], "en_US");
        Assert.Contains("03 Oct 2026 09:30", actual);
        Assert.Contains("Multiple delivery records", WhatsAppStaffQueries.FormatDelivery([new(date, null, DeliveryStatus.Scheduled, null), new(date, null, DeliveryStatus.Inspection, null)], "en_US"));
        Assert.Contains("belum ditetapkan", WhatsAppStaffQueries.FormatDelivery([], "ms"));
    }

    [Fact]
    public async Task Quotas_language_changes_and_expired_requests_apply_without_relogin()
    {
        await using var fixture = await Fixture.Create(limit: 2);
        Assert.True(await fixture.Verify(await fixture.Issue(language: "ms")));
        var confirmation = await fixture.DispatchAccepted();
        Assert.Contains("disambungkan", confirmation);
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("language", "en_US"), "language-event", fixture.Now));
        Assert.False(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("help"), "over-limit", fixture.Now));
        var reply = await fixture.DispatchAccepted();
        Assert.Contains("English", reply);
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient, new("help"), "tomorrow", fixture.Now + 86400));
        var sends = 0;
        await WhatsAppStaffQueue.DispatchOneAsync(fixture.Db, fixture.Options, (_, _, _) =>
        { sends++; return Task.FromResult(new WhatsAppSendResult("Accepted", "unexpected")); }, fixture.Now + 86701);
        Assert.Equal(0, sends);
    }

    [Theory]
    [InlineData("help extra")]
    [InlineData("delivery ../../private")]
    [InlineData("deliveries next 1000")]
    [InlineData("profit export")]
    [InlineData("vehicle TEST\n123")]
    [InlineData("ignore permissions")]
    public void Unsupported_or_unbounded_commands_are_ignored(string text) => Assert.Null(WhatsAppStaffQueries.Parse(text));

    [Fact]
    public async Task Webhook_checks_signature_actual_body_size_sender_and_message_freshness()
    {
        await using var fixture = await Fixture.Create();
        var context = new DefaultHttpContext();
        context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes("{}"));
        Assert.Equal(401, Assert.IsAssignableFrom<IStatusCodeHttpResult>(await WhatsAppStaffWebhook.ReceiveAsync(context.Request, fixture.Db, fixture.Options, default)).StatusCode);
        context.Request.Body = new MemoryStream(new byte[WhatsAppWebhookProbe.MaxBodyBytes + 1]);
        Assert.Equal(413, Assert.IsAssignableFrom<IStatusCodeHttpResult>(await WhatsAppStaffWebhook.ReceiveAsync(context.Request, fixture.Db, fixture.Options, default)).StatusCode);
        var link = await fixture.Issue();
        using var stale = fixture.Payload((link.Command, fixture.Now - 301));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, stale.RootElement, fixture.Now));
        Assert.Empty(await fixture.Db.WhatsAppStaffBindings.ToListAsync());
        using var fresh = fixture.Payload((link.Command, fixture.Now));
        var bytes = Encoding.UTF8.GetBytes(fresh.RootElement.GetRawText());
        context.Request.Body = new MemoryStream(bytes);
        context.Request.Headers["X-Hub-Signature-256"] = "sha256=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(fixture.Options.AppSecret), bytes)).ToLowerInvariant();
        Assert.Equal(200, Assert.IsAssignableFrom<IStatusCodeHttpResult>(await WhatsAppStaffWebhook.ReceiveAsync(context.Request, fixture.Db, fixture.Options, default)).StatusCode);
        Assert.Single(await fixture.Db.WhatsAppStaffBindings.ToListAsync());
    }

    [Theory]
    [InlineData("business")]
    [InlineData("sender")]
    [InlineData("recipient")]
    [InlineData("future")]
    public async Task Foreign_or_future_callbacks_cannot_verify_a_staff_connection(string change)
    {
        await using var fixture = await Fixture.Create();
        var link = await fixture.Issue();
        using var payload = fixture.Payload((link.Command, change == "future" ? fixture.Now + 31 : fixture.Now));
        var text = payload.RootElement.GetRawText();
        if (change == "business") text = text.Replace("\"456\"", "\"999\"");
        if (change == "sender") text = text.Replace("\"123\"", "\"999\"");
        if (change == "recipient") text = text.Replace(fixture.Options.TestRecipient, "60188888888");
        using var changed = JsonDocument.Parse(text);
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, changed.RootElement, fixture.Now));
        Assert.Empty(await fixture.Db.WhatsAppStaffBindings.ToListAsync());
        Assert.Equal(0, (await fixture.Db.WhatsAppStaffChallenges.SingleAsync()).FailedAttempts);
    }

    [Fact]
    public async Task Portal_management_checks_current_database_roles_and_masks_the_phone()
    {
        await using var fixture = await Fixture.Create();
        await fixture.AddStaff("other", "Sales");
        var context = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "staff"), new Claim(ClaimTypes.Role, "BossAdmin")], "synthetic"))
        };
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.ForbidHttpResult>(await WhatsAppStaffApi.StatusAsync(context, fixture.Db, fixture.Options, "other", default));
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.ForbidHttpResult>(await WhatsAppStaffApi.ConnectAsync(context, fixture.Db, fixture.Options, new(fixture.Options.TestRecipient, "ms", true, "other"), default));
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.ForbidHttpResult>(await WhatsAppStaffApi.DisconnectAsync(context, fixture.Db, fixture.Options, new("other"), default));
        var self = await WhatsAppStaffApi.ConnectAsync(context, fixture.Db, fixture.Options, new(fixture.Options.TestRecipient, "ms", true), default);
        var code = Assert.IsType<WhatsAppStaffLinkResult>(Assert.IsAssignableFrom<IValueHttpResult>(self).Value);
        Assert.Equal("no-store", context.Response.Headers.CacheControl);
        Assert.True(await fixture.Verify(code));
        var state = Assert.IsType<WhatsAppStaffConnection>(Assert.IsAssignableFrom<IValueHttpResult>(await WhatsAppStaffApi.StatusAsync(context, fixture.Db, fixture.Options, null, default)).Value);
        Assert.Equal("***9999", state.MaskedNumber);
        Assert.Equal("Connected", state.State);
        await WhatsAppStaffApi.DisconnectAsync(context, fixture.Db, fixture.Options, new(), default);
        Assert.NotNull((await fixture.Db.WhatsAppStaffBindings.SingleAsync()).RevokedAt);
    }

    [Fact]
    public async Task Invitation_is_staged_with_challenge_without_secret_and_verified_number_connects()
    {
        await using var fixture = await Fixture.Create();
        var dispatch = InvitationDispatch();
        var result = await WhatsAppStaffApi.ConnectAsync(fixture.Context("staff"), fixture.Db, fixture.Options,
            dispatch, new(fixture.Options.TestRecipient, "ms", true), default);
        var link = Assert.IsType<WhatsAppStaffLinkResult>(Assert.IsAssignableFrom<IValueHttpResult>(result).Value);
        var invitation = await fixture.Db.WhatsAppOutbox.SingleAsync();
        Assert.Equal("Enrollment", invitation.Audience);
        Assert.Equal("Queued", invitation.State);
        Assert.Equal("staff_invite_v1", invitation.TemplateVersion);
        Assert.DoesNotContain(link.Command[5..], invitation.Body);
        Assert.DoesNotContain(link.Command[5..], invitation.TemplateReference);
        Assert.Equal(fixture.Now + 600, invitation.ExpiresAt);
        var status = await WhatsAppStaffBindings.StatusAsync(fixture.Db, fixture.Options, "staff", fixture.Now, dispatch: dispatch);
        Assert.Equal("AwaitingVerification", status.State);
        Assert.Equal("Queued", status.InvitationState);
        Assert.True(status.InvitationAvailable);
        Assert.True(await fixture.Verify(link));
        Assert.Equal("Connected", (await WhatsAppStaffBindings.StatusAsync(fixture.Db, fixture.Options, "staff", fixture.Now, dispatch: dispatch)).State);
    }

    [Fact]
    public async Task Invitation_status_advertises_only_exact_ready_languages()
    {
        await using var fixture = await Fixture.Create();
        var dispatch = InvitationDispatchFor("en_US");
        var disconnected = await WhatsAppStaffBindings.StatusAsync(fixture.Db, fixture.Options, "staff", fixture.Now,
            dispatch: dispatch);
        Assert.True(disconnected.InvitationAvailable);
        Assert.Equal(["en_US"], disconnected.InvitationLanguages);
        await Assert.ThrowsAsync<ArgumentException>(() => WhatsAppStaffBindings.IssueAsync(fixture.Db, fixture.Options,
            "staff", new(fixture.Options.TestRecipient, "ms", true), "synthetic", fixture.Now, dispatch: dispatch));
        Assert.Empty(await fixture.Db.WhatsAppStaffChallenges.ToListAsync());
        var issued = await WhatsAppStaffBindings.IssueAsync(fixture.Db, fixture.Options, "staff",
            new(fixture.Options.TestRecipient, "en_US", true), "synthetic", fixture.Now, dispatch: dispatch);
        Assert.Equal("Queued", issued.InvitationState);
        var awaiting = await WhatsAppStaffBindings.StatusAsync(fixture.Db, fixture.Options, "staff", fixture.Now,
            dispatch: dispatch);
        Assert.True(awaiting.InvitationAvailable);
        Assert.Equal(["en_US"], awaiting.InvitationLanguages);
    }

    [Fact]
    public async Task Manual_link_without_invitation_requires_same_number_inbound_verification_and_never_queues_outbound()
    {
        await using var fixture = await Fixture.Create(businessDisplayNumber: "60123456789");
        var dispatch = new WhatsAppDispatchOptions();
        var disconnected = await WhatsAppStaffBindings.StatusAsync(fixture.Db, fixture.Options, "staff", fixture.Now,
            dispatch: dispatch);
        Assert.True(disconnected.ManualLinkAvailable);
        Assert.False(disconnected.InvitationAvailable);
        Assert.Empty(disconnected.InvitationLanguages!);
        var result = await WhatsAppStaffApi.ConnectAsync(fixture.Context("staff"), fixture.Db, fixture.Options,
            dispatch, new(fixture.Options.TestRecipient, "ms", true, ManualLink: true), default);
        var link = Assert.IsType<WhatsAppStaffLinkResult>(Assert.IsAssignableFrom<IValueHttpResult>(result).Value);
        Assert.Equal("NotRequested", link.InvitationState);
        Assert.Empty(await fixture.Db.WhatsAppOutbox.ToListAsync());
        var pending = await WhatsAppStaffBindings.StatusAsync(fixture.Db, fixture.Options, "staff", fixture.Now,
            dispatch: dispatch);
        Assert.Equal("NotRequested", pending.InvitationState);
        Assert.False(pending.InvitationAvailable);
        Assert.Null(pending.InvitationCreatedAt);
        var repeated = await WhatsAppStaffApi.ConnectAsync(fixture.Context("staff"), fixture.Db, fixture.Options,
            dispatch, new(fixture.Options.TestRecipient, "ms", true, ManualLink: true), default);
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.BadRequest<ApiError>>(repeated);
        Assert.Equal(1, (await fixture.Db.WhatsAppStaffChallenges.SingleAsync()).IssuesInWindow);
        Assert.False(await WhatsAppStaffBindings.VerifyAsync(fixture.Db, fixture.Options, "60188888888",
            link.Command[5..], "wrong-number", fixture.Now));
        using var inbound = fixture.Payload((link.Command, fixture.Now));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, inbound.RootElement, fixture.Now));
        Assert.Empty(await fixture.Db.WhatsAppOutbox.ToListAsync());
        Assert.Equal("Connected", (await WhatsAppStaffBindings.StatusAsync(fixture.Db, fixture.Options,
            "staff", fixture.Now, dispatch: dispatch)).State);
    }

    [Fact]
    public async Task Manual_link_rejects_missing_consent_unavailable_inbound_or_display_and_cannot_bypass_ready_invitation()
    {
        await using var fixture = await Fixture.Create(businessDisplayNumber: "60123456789");
        var unavailable = new WhatsAppDispatchOptions();
        var noConsent = await WhatsAppStaffApi.ConnectAsync(fixture.Context("staff"), fixture.Db, fixture.Options,
            unavailable, new(fixture.Options.TestRecipient, "ms", false, ManualLink: true), default);
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.BadRequest<ApiError>>(noConsent);
        var unauthorized = await WhatsAppStaffApi.ConnectAsync(fixture.Context("unknown"), fixture.Db, fixture.Options,
            unavailable, new(fixture.Options.TestRecipient, "ms", true, ManualLink: true), default);
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.ForbidHttpResult>(unauthorized);
        var readyInvitation = await WhatsAppStaffApi.ConnectAsync(fixture.Context("staff"), fixture.Db, fixture.Options,
            InvitationDispatch(), new(fixture.Options.TestRecipient, "ms", true, ManualLink: true), default);
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.Conflict<ApiError>>(readyInvitation);
        var otherLanguageManual = await WhatsAppStaffApi.ConnectAsync(fixture.Context("staff"), fixture.Db, fixture.Options,
            InvitationDispatch(), new(fixture.Options.TestRecipient, "en_US", true, ManualLink: true), default);
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.Conflict<ApiError>>(otherLanguageManual);
        Assert.Empty(await fixture.Db.WhatsAppStaffChallenges.ToListAsync());
        Assert.Empty(await fixture.Db.WhatsAppOutbox.ToListAsync());
        await using var noDisplay = await Fixture.Create();
        var missingDisplay = await WhatsAppStaffApi.ConnectAsync(noDisplay.Context("staff"), noDisplay.Db, noDisplay.Options,
            unavailable, new(noDisplay.Options.TestRecipient, "ms", true, ManualLink: true), default);
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.Conflict<ApiError>>(missingDisplay);
        await using var inboundOff = await Fixture.Create(enabled: false, businessDisplayNumber: "60123456789");
        var disabled = await WhatsAppStaffApi.ConnectAsync(inboundOff.Context("staff"), inboundOff.Db, inboundOff.Options,
            unavailable, new(inboundOff.Options.TestRecipient, "ms", true, ManualLink: true), default);
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.Conflict<ApiError>>(disabled);
        Assert.False((await WhatsAppStaffBindings.StatusAsync(inboundOff.Db, inboundOff.Options, "staff", inboundOff.Now,
            dispatch: unavailable)).ManualLinkAvailable);
        Assert.Empty(await inboundOff.Db.WhatsAppStaffChallenges.ToListAsync());
    }

    [Fact]
    public async Task Invitation_requires_approved_gate_and_rechecks_role_before_send()
    {
        await using var fixture = await Fixture.Create();
        var context = fixture.Context("staff");
        var rejected = await WhatsAppStaffApi.ConnectAsync(context, fixture.Db, fixture.Options,
            new WhatsAppDispatchOptions(), new(fixture.Options.TestRecipient, "ms", true), default);
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.Conflict<ApiError>>(rejected);
        Assert.Empty(await fixture.Db.WhatsAppStaffChallenges.ToListAsync());
        Assert.Empty(await fixture.Db.WhatsAppOutbox.ToListAsync());
        var dispatch = InvitationDispatch();
        var missingLanguage = await WhatsAppStaffApi.ConnectAsync(context, fixture.Db, fixture.Options, dispatch,
            new(fixture.Options.TestRecipient, "en_US", true), default);
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.BadRequest<ApiError>>(missingLanguage);
        Assert.Empty(await fixture.Db.WhatsAppStaffChallenges.ToListAsync());
        var duplicate = InvitationDispatch(new WhatsAppApprovedTemplate { Key = "staff_invite_v1",
            Name = "duplicate_invite", Language = "ms", Approved = true, ApprovalEvidence = "synthetic approval" });
        var duplicateLanguage = await WhatsAppStaffApi.ConnectAsync(context, fixture.Db, fixture.Options, duplicate,
            new(fixture.Options.TestRecipient, "ms", true), default);
        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.Conflict<ApiError>>(duplicateLanguage);
        Assert.Empty(await fixture.Db.WhatsAppStaffChallenges.ToListAsync());
        Assert.Empty(await fixture.Db.WhatsAppOutbox.ToListAsync());
        var accepted = await WhatsAppStaffApi.ConnectAsync(context, fixture.Db, fixture.Options, dispatch,
            new(fixture.Options.TestRecipient, "ms", true), default);
        Assert.IsType<WhatsAppStaffLinkResult>(Assert.IsAssignableFrom<IValueHttpResult>(accepted).Value);
        await fixture.Db.UserRoles.ExecuteDeleteAsync();
        var calls = 0;
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(fixture.Db, dispatch,
            (_, _) => { calls++; return Task.FromResult(new WhatsAppSendResult("Accepted", "wamid.synthetic")); },
            fixture.Now, assistant: fixture.Options));
        Assert.Equal(0, calls);
        Assert.Equal("Suppressed", (await fixture.Db.WhatsAppOutbox.AsNoTracking().SingleAsync()).State);
    }

    [Fact]
    public async Task Invitation_resend_keeps_the_same_challenge_and_obeys_cooldown_and_outcome()
    {
        await using var fixture = await Fixture.Create();
        var dispatch = InvitationDispatch();
        var issued = await WhatsAppStaffBindings.IssueAsync(fixture.Db, fixture.Options, "staff",
            new(fixture.Options.TestRecipient, "ms", true), "synthetic", fixture.Now, dispatch: dispatch);
        await Assert.ThrowsAsync<ArgumentException>(() => WhatsAppStaffInvitation.ResendAsync(fixture.Db, fixture.Options,
            dispatch, "staff", "synthetic", fixture.Now + 59, default));
        await Assert.ThrowsAsync<ArgumentException>(() => WhatsAppStaffInvitation.ResendAsync(fixture.Db, fixture.Options,
            dispatch, "staff", "synthetic", fixture.Now + 61, default));
        await fixture.Db.WhatsAppOutbox.ExecuteUpdateAsync(set => set.SetProperty(row => row.State, "DeadLetter"));
        await WhatsAppStaffInvitation.ResendAsync(fixture.Db, fixture.Options, dispatch, "staff", "synthetic", fixture.Now + 61, default);
        var invitations = await fixture.Db.WhatsAppOutbox.AsNoTracking().OrderBy(row => row.CreatedAt).ToListAsync();
        Assert.Equal(2, invitations.Count);
        Assert.Equal("Queued", invitations[1].State);
        Assert.Equal(invitations[0].BusinessReference, invitations[1].BusinessReference);
        Assert.DoesNotContain(issued.Command[5..], invitations[1].TemplateReference);
        Assert.Equal(issued.ExpiresAt, invitations[1].ExpiresAt);
        await Assert.ThrowsAsync<ArgumentException>(() => WhatsAppStaffInvitation.ResendAsync(fixture.Db, fixture.Options,
            dispatch, "staff", "synthetic", fixture.Now + 121, default));
    }

    [Fact]
    public async Task Approved_invitation_payload_contains_generic_localized_text_but_never_the_command()
    {
        await using var fixture = await Fixture.Create();
        var dispatch = InvitationDispatch(new WhatsAppApprovedTemplate { Key = "staff_notice_v1",
            Name = "unapproved_notice", Language = "en_US" });
        var issued = await WhatsAppStaffBindings.IssueAsync(fixture.Db, fixture.Options, "staff",
            new(fixture.Options.TestRecipient, "ms", true), "synthetic", fixture.Now, dispatch: dispatch);
        var item = await fixture.Db.WhatsAppOutbox.AsNoTracking().SingleAsync();
        string? payload = null;
        using var sender = new WhatsAppTemplateSender(new HttpClient(new SyntheticHandler(request =>
        {
            payload = request.Content!.ReadAsStringAsync().GetAwaiter().GetResult();
            return new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            { Content = new StringContent("{\"messages\":[{\"id\":\"wamid.synthetic-invite\"}]}" ) };
        })));
        var result = await sender.SendAsync(dispatch, item);
        Assert.Equal("Accepted", result.Outcome);
        Assert.Contains("approved_staff_invite", payload);
        Assert.Contains("Buka portal YS Heng", payload);
        Assert.DoesNotContain(issued.Command[5..], payload);
        Assert.DoesNotContain(item.BusinessReference, payload);
    }

    [Fact]
    public async Task Invitation_history_distinguishes_provider_acceptance_from_sent_callback()
    {
        await using var fixture = await Fixture.Create();
        var dispatch = InvitationDispatch();
        var issued = await WhatsAppStaffBindings.IssueAsync(fixture.Db, fixture.Options, "staff",
            new(fixture.Options.TestRecipient, "ms", true), "synthetic", fixture.Now, dispatch: dispatch);
        Assert.True(await WhatsAppNotificationDispatcher.DispatchOneAsync(fixture.Db, dispatch,
            (_, _) => Task.FromResult(new WhatsAppSendResult("Accepted", "wamid.synthetic-invite")),
            fixture.Now, assistant: fixture.Options));
        var accepted = await WhatsAppStaffNotifications.HistoryAsync(fixture.Db, null, null, "staff", "StaffInvitation",
            null, 1, fixture.Now);
        var row = Assert.Single(accepted.Items);
        Assert.Equal("Accepted", row.State);
        Assert.Null(row.SentAt);
        Assert.DoesNotContain(issued.Command[5..], row.SubmittedBody);
        using var callback = JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            @object = "whatsapp_business_account",
            entry = new[] { new { id = dispatch.BusinessAccountId, changes = new[] { new { field = "messages", value = new
            {
                metadata = new { phone_number_id = dispatch.PhoneNumberId },
                statuses = new[] { new { id = "wamid.synthetic-invite", recipient_id = fixture.Options.TestRecipient,
                    status = "sent", timestamp = fixture.Now.ToString() } }
            } } } } }
        }));
        Assert.True(await WhatsAppNotificationWebhook.ApplyAsync(fixture.Db, callback.RootElement, dispatch, fixture.Now));
        var sent = await WhatsAppStaffNotifications.HistoryAsync(fixture.Db, null, null, "staff", "StaffInvitation",
            null, 1, fixture.Now);
        Assert.Equal("Sent", Assert.Single(sent.Items).State);
        Assert.NotNull(Assert.Single(sent.Items).SentAt);
    }

    private static WhatsAppDispatchOptions InvitationDispatch(params WhatsAppApprovedTemplate[] extraTemplates) =>
        InvitationDispatchFor("ms", extraTemplates);

    private static WhatsAppDispatchOptions InvitationDispatchFor(string language, params WhatsAppApprovedTemplate[] extraTemplates) => new()
    {
        InvitationEnabled = true, WebhookEnabled = true, SenderApproved = true,
        SenderApprovalEvidence = "synthetic approval", GraphApiVersion = "v25.0", PhoneNumberId = "123",
        BusinessAccountId = "456", AccessToken = "synthetic-token", AppSecret = new string('s', 32),
        VerifyToken = new string('v', 32), BudgetOwner = "synthetic budget", DailyAttemptLimit = 10,
        MonthlyBudgetSen = 100, MaximumCostPerAttemptSen = 10, CostCeilingConfirmed = true,
        Templates = [new WhatsAppApprovedTemplate { Key = "staff_invite_v1", Name = "approved_staff_invite",
            Language = language, Approved = true, ApprovalEvidence = "synthetic template approval" }, ..extraTemplates]
    };

    [Fact]
    public async Task Production_mode_allows_self_links_for_distinct_staff_numbers_and_keeps_role_scope()
    {
        await using var fixture = await Fixture.Create(testMode: false);
        await fixture.AddStaff("second", "Sales");
        const string firstRecipient = "60111111111";
        const string secondRecipient = "60122222222";

        var firstContext = fixture.Context("staff");
        var firstResult = Assert.IsType<WhatsAppStaffLinkResult>(Assert.IsAssignableFrom<IValueHttpResult>(await WhatsAppStaffApi.ConnectAsync(
            firstContext, fixture.Db, fixture.Options, new(firstRecipient, "en_US", true), default)).Value);
        var secondContext = fixture.Context("second");
        var secondResult = Assert.IsType<WhatsAppStaffLinkResult>(Assert.IsAssignableFrom<IValueHttpResult>(await WhatsAppStaffApi.ConnectAsync(
            secondContext, fixture.Db, fixture.Options, new(secondRecipient, "en_US", true), default)).Value);

        Assert.IsType<Microsoft.AspNetCore.Http.HttpResults.ForbidHttpResult>(await WhatsAppStaffApi.ConnectAsync(
            firstContext, fixture.Db, fixture.Options, new(secondRecipient, "en_US", true, "second"), default));
        Assert.True(await fixture.Verify(firstResult, "production-first-link", recipient: firstRecipient));
        Assert.True(await fixture.Verify(secondResult, "production-second-link", recipient: secondRecipient));

        const string unboundRecipient = "60133333333";
        using var unbound = fixture.Payload(unboundRecipient, ("help", fixture.Now));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, unbound.RootElement, fixture.Now));
        Assert.DoesNotContain(await fixture.Db.WhatsAppStaffRequests.AsNoTracking().ToListAsync(), item => item.Intent == "help");
        Assert.False(WhatsAppStaffQueries.Permitted(new("profit", "month"), ["Sales"]));
    }

    [Fact]
    public async Task Upcoming_deliveries_use_the_Malaysia_date_and_exclude_preliminary_or_terminal_records()
    {
        await using var fixture = await Fixture.Create();
        var today = BusinessClock.SingaporeDate(DateTimeOffset.FromUnixTimeSeconds(fixture.Now));
        for (var i = 0; i < 9; i++)
        {
            var vehicle = new Vehicle { PlateNumber = "SYN" + i, Year = 2020, Make = "Synthetic", Model = "Car" };
            fixture.Db.Vehicles.Add(vehicle);
            fixture.Db.DeliverySchedules.Add(new DeliverySchedule { VehicleId = vehicle.Id, ScheduledDate = today.AddDays(i < 6 ? 0 : 6), ScheduledTime = new TimeOnly(9, i), Status = i < 6 ? DeliveryStatus.Scheduled : i == 6 ? DeliveryStatus.Cancelled : i == 7 ? DeliveryStatus.Released : DeliveryStatus.BookingInspection });
        }
        var outside = new Vehicle { PlateNumber = "OUTSIDE", Year = 2020, Make = "Synthetic", Model = "Car" };
        fixture.Db.Vehicles.Add(outside);
        fixture.Db.DeliverySchedules.Add(new DeliverySchedule { VehicleId = outside.Id, ScheduledDate = today.AddDays(7), Status = DeliveryStatus.Scheduled });
        await fixture.Db.SaveChangesAsync();
        var reply = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, WhatsAppStaffQueries.Parse("deliveries next7")!, "ms", fixture.Now);
        Assert.Contains("5 daripada 6", reply);
        Assert.Contains("Dijadualkan", reply);
        foreach (var excluded in new[] { "SYN5", "SYN6", "SYN7", "SYN8", "OUTSIDE" }) Assert.DoesNotContain(excluded, reply);
    }

    [Fact]
    public async Task Due_pages_recover_more_than_seven_overdue_items_without_exposing_finance_or_other_sales_work()
    {
        await using var fixture = await Fixture.Create();
        var today = WhatsAppStaffNotifications.LocalDate(fixture.Now);
        fixture.Db.WhatsAppStaffNotificationPolicies.Add(new WhatsAppStaffNotificationPolicy
            { Category = "OutstandingDigest", Enabled = true, LocalMinuteOfDay = 540, LeadDays = 3 });
        for (var i = 0; i < 9; i++)
        {
            var vehicle = new Vehicle { PlateNumber = $"OWN{i}", SalesAgentUserId = "staff" };
            fixture.Db.Vehicles.Add(vehicle);
            fixture.Db.DeliverySchedules.Add(new DeliverySchedule
                { VehicleId = vehicle.Id, Status = DeliveryStatus.Scheduled, ScheduledDate = today.AddDays(i - 10) });
        }
        var other = new Vehicle { PlateNumber = "OTHER123", SalesAgentUserId = "other" };
        fixture.Db.Vehicles.Add(other);
        fixture.Db.DeliverySchedules.Add(new DeliverySchedule
            { VehicleId = other.Id, Status = DeliveryStatus.Scheduled, ScheduledDate = today.AddDays(-1) });
        fixture.Db.SettlementReminders.Add(new SettlementReminder
            { VehicleId = other.Id, Direction = SettlementDirection.PaySeller, Deadline = today.AddDays(-1), Amount = 777777 });
        await fixture.Db.SaveChangesAsync();

        Assert.Null(WhatsAppStaffQueries.Parse("due page"));
        Assert.False(WhatsAppStaffQueries.Permitted(new("due", "1"), ["Finance"]));
        Assert.True(WhatsAppStaffQueries.Permitted(new("due", "1"), ["Sales"]));
        Assert.Contains("due page 1", WhatsAppStaffQueries.Help("en_US", ["Sales"]));
        Assert.DoesNotContain("due page 1", WhatsAppStaffQueries.Help("en_US", ["Finance"]));
        Assert.Equal(6, WhatsAppStaffCommandHelp.Allowed(["Sales"]).Count);
        Assert.Equal(8, WhatsAppStaffCommandHelp.Allowed(["Finance"]).Count);
        Assert.Equal(10, WhatsAppStaffCommandHelp.Allowed(["BossAdmin"]).Count);

        var sources = await WhatsAppDueDigest.LoadAsync(fixture.Db, today, 3);
        var digest = WhatsAppDueDigest.Project(sources, today, 3, "staff", "Sales");
        Assert.NotNull(digest);
        Assert.Equal(9, digest.Items.Count);
        Assert.Contains("due page 1", digest.Body);
        var first = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, WhatsAppStaffQueries.Parse("due page 1")!,
            "en_US", fixture.Now, roles: ["Sales"], staffUserId: "staff");
        var second = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, WhatsAppStaffQueries.Parse("due page 2")!,
            "en_US", fixture.Now, roles: ["Sales"], staffUserId: "staff");
        Assert.Contains("1-7 of 9", first);
        Assert.Contains("Next: due page 2", first);
        Assert.Contains("8-9 of 9", second);
        for (var i = 0; i < 9; i++) Assert.Contains($"OWN{i}", first + second);
        Assert.DoesNotContain("OTHER123", first + second);
        Assert.DoesNotContain("777777", first + second);
        Assert.DoesNotContain("RM", first + second);
        var boss = await WhatsAppStaffQueries.ReplyAsync(fixture.Db, WhatsAppStaffQueries.Parse("due page 2")!,
            "en_US", fixture.Now, roles: ["BossAdmin"], staffUserId: "boss");
        Assert.Contains("RM777777", boss);

        Assert.True(await fixture.Verify(await fixture.Issue()));
        await fixture.DispatchAccepted(); // linked acknowledgement
        Assert.True(await WhatsAppStaffQueue.EnqueueAsync(fixture.Db, fixture.Options, fixture.Options.TestRecipient,
            WhatsAppStaffQueries.Parse("due page 2")!, "due-page-event", fixture.Now));
        Assert.Contains("OWN8", await fixture.DispatchAccepted());
    }

    [Fact]
    public async Task Signed_statuses_require_recipient_correlation_and_never_regress_read_state()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        await fixture.DispatchAccepted();
        var request = await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync();
        async Task Status(string recipient, string state)
        {
            using var json = JsonDocument.Parse(JsonSerializer.Serialize(new
            {
                @object = "whatsapp_business_account", entry = new[] { new { id = fixture.Options.BusinessAccountId, changes = new[] { new { field = "messages", value = new
                {
                    metadata = new { phone_number_id = fixture.Options.PhoneNumberId }, statuses = new[] { new { id = request.ProviderMessageId, recipient_id = recipient, status = state } }
                } } } } }
            }));
            Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, json.RootElement, fixture.Now));
        }
        await Status("60188888888", "read");
        Assert.Equal("Accepted", (await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync()).State);
        await Status(fixture.Options.TestRecipient, "read");
        await Status(fixture.Options.TestRecipient, "delivered");
        await Status(fixture.Options.TestRecipient, "failed");
        Assert.Equal("Read", (await fixture.Db.WhatsAppStaffRequests.AsNoTracking().SingleAsync()).State);
    }

    [Fact]
    public async Task Stop_after_the_query_batch_limit_still_revokes_the_connection()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        using var payload = fixture.Payload(Enumerable.Repeat(("help", fixture.Now), 20).Append(("stop", fixture.Now)).ToArray());
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, payload.RootElement, fixture.Now));
        Assert.NotNull((await fixture.Db.WhatsAppStaffBindings.SingleAsync()).RevokedAt);
        Assert.All(await fixture.Db.WhatsAppStaffRequests.AsNoTracking().ToListAsync(), request => Assert.Equal("Suppressed", request.State));
    }

    [Fact]
    public async Task Replayed_old_stop_does_not_withdraw_a_new_connection()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        using var payload = fixture.Payload(("stop", fixture.Now - 4000), ("help", fixture.Now));
        Assert.True(await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, payload.RootElement, fixture.Now));
        Assert.Null((await fixture.Db.WhatsAppStaffBindings.AsNoTracking().SingleAsync()).RevokedAt);
        Assert.Contains(await fixture.Db.WhatsAppStaffRequests.AsNoTracking().ToListAsync(), request => request.Intent == "help");
    }

    [Fact]
    public async Task Stop_wins_when_Meta_cannot_distinguish_same_second_link_order()
    {
        await using var fixture = await Fixture.Create();
        Assert.True(await fixture.Verify(await fixture.Issue()));
        using var payload = fixture.Payload(("stop", fixture.Now));
        await WhatsAppStaffWebhook.ProcessAsync(fixture.Db, fixture.Options, payload.RootElement, fixture.Now);
        Assert.NotNull((await fixture.Db.WhatsAppStaffBindings.AsNoTracking().SingleAsync()).RevokedAt);
    }

    [Fact]
    public async Task Disabled_assistant_does_not_require_its_schema_or_read_unsigned_bodies()
    {
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite("Data Source=:memory:").Options);
        var disabled = new WhatsAppAssistantOptions();
        Assert.Equal("Disabled", (await WhatsAppStaffBindings.StatusAsync(db, disabled, "staff", 1)).State);
        Assert.False(await WhatsAppStaffQueue.EnqueueAsync(db, disabled, "60199999999", new("help"), "disabled", 1));
        Assert.False(await WhatsAppStaffQueue.DispatchOneAsync(db, disabled, (_, _, _) => throw new Exception("disabled assistant attempted a send"), 1));
        Assert.Equal(404, Assert.IsAssignableFrom<IStatusCodeHttpResult>(await WhatsAppStaffWebhook.ReceiveAsync(new DefaultHttpContext().Request, db, disabled, default)).StatusCode);
    }

    [Theory]
    [InlineData("AppSecret")]
    [InlineData("VerifyToken")]
    public void Whitespace_only_credentials_keep_the_assistant_disabled(string key)
    {
        var values = new Dictionary<string, string?>
        {
            ["WhatsAppAssistant:Enabled"] = "true", ["WhatsAppAssistant:WebhookEnabled"] = "true",
            ["WhatsAppAssistant:TestRecipient"] = "60199999999", ["WhatsAppAssistant:PhoneNumberId"] = "123",
            ["WhatsAppAssistant:BusinessAccountId"] = "456", ["WhatsAppAssistant:GraphApiVersion"] = "v25.0",
            ["WhatsAppAssistant:AccessToken"] = "synthetic-token", ["WhatsAppAssistant:AppSecret"] = new('s', 32),
            ["WhatsAppAssistant:VerifyToken"] = new('v', 32)
        };
        Assert.True(WhatsAppAssistantOptions.Load(new ConfigurationBuilder().AddInMemoryCollection(values).Build()).Ready);
        values["WhatsAppAssistant:" + key] = new(' ', 32);
        Assert.False(WhatsAppAssistantOptions.Load(new ConfigurationBuilder().AddInMemoryCollection(values).Build()).Ready);
    }

    [Theory]
    [InlineData(200, "{\"messages\":[{\"id\":\"synthetic-provider-id\"}]}", "Accepted")]
    [InlineData(200, "not-json", "UnknownOutcome")]
    [InlineData(429, "{\"error\":\"synthetic\"}", "ProviderRejected")]
    [InlineData(302, "", "ProviderRejected")]
    public async Task Sender_submits_once_and_distinguishes_accepted_from_ambiguous_results(int status, string body, string outcome)
    {
        await using var fixture = await Fixture.Create();
        var handler = new SyntheticHandler(request =>
        {
            Assert.Equal("graph.facebook.com", request.RequestUri!.Host);
            Assert.Equal("/v25.0/123/messages", request.RequestUri.AbsolutePath);
            Assert.Equal("synthetic-token", request.Headers.Authorization!.Parameter);
            return new HttpResponseMessage((System.Net.HttpStatusCode)status) { Content = new StringContent(body) };
        });
        using var sender = new WhatsAppStaffSender(new HttpClient(handler));
        Assert.Equal(outcome, (await sender.SendAsync(fixture.Options, fixture.Options.TestRecipient, "Synthetic answer", default)).Outcome);
        Assert.Equal(1, handler.Calls);
        Assert.Equal("Disabled", (await sender.SendAsync(fixture.Options, "60188888888", "Synthetic answer", default)).Outcome);
        Assert.Equal("InvalidReply", (await sender.SendAsync(fixture.Options, fixture.Options.TestRecipient, new string('A', 3501), default)).Outcome);
        Assert.Equal(1, handler.Calls);
    }

    [Theory]
    [InlineData("{\"error\":{\"code\":131047,\"error_subcode\":2494010,\"message\":\"PRIVATE_REPLY recipient 60199999999 synthetic-token\"}}", 131047, 2494010, "Unknown", "Unknown")]
    [InlineData("{\"error\":{\"code\":\"SECRET_META_CODE\",\"error_subcode\":\"SECRET_META_SUBCODE\"}}", null, null, "Unknown", "Unknown")]
    [InlineData("{\"error\":{\"code\":100,\"message\":\"(#100) The parameter messaging_product is required. PRIVATE_REPLY\"}}", 100, null, "MissingRequiredParameter", "messaging_product")]
    [InlineData("{\"error\":{\"code\":100,\"message\":\"(#100) Param text must be a JSON object.\"}}", 100, null, "InvalidOrUnsupportedParameter", "text")]
    [InlineData("{\"error\":{\"code\":100,\"message\":\"Invalid parameter\",\"error_data\":{\"details\":\"The parameter 'to' is invalid: 60199999999 PRIVATE_REPLY\"}}}", 100, null, "InvalidOrUnsupportedParameter", "to")]
    [InlineData("{\"error\":{\"code\":100,\"message\":\"Invalid parameter\",\"error_data\":{\"details\":\"The parameter 'to' is required. PRIVATE_REPLY\"}}}", 100, null, "MissingRequiredParameter", "to")]
    [InlineData("{\"error\":{\"code\":100,\"message\":\"Invalid parameter\",\"error_data\":{\"details\":\"Param recipient_type must be a string. PRIVATE_REPLY\"}}}", 100, null, "InvalidOrUnsupportedParameter", "recipient_type")]
    [InlineData("{\"error\":{\"code\":100,\"message\":\"Param type must be a string. PRIVATE_REPLY\"}}", 100, null, "InvalidOrUnsupportedParameter", "type")]
    [InlineData("{\"error\":{\"code\":100,\"message\":\"Invalid parameter\",\"error_data\":{\"details\":\"The parameter 'private-key-XYZ' is invalid: PRIVATE_REPLY\"}}}", 100, null, "InvalidOrUnsupportedParameter", "Unknown")]
    [InlineData("{\"error\":{\"code\":100,\"message\":\"Unsupported post request. Object with ID 123 does not exist.\"}}", 100, null, "UnknownOrInaccessibleObject", "Unknown")]
    [InlineData("{\"error\":{\"code\":190,\"message\":\"Error validating access token: synthetic-token\"}}", 190, null, "InvalidAccessToken", "Unknown")]
    [InlineData("{\"error\":{\"code\":10,\"message\":\"Permissions error: PRIVATE_REPLY\"}}", 10, null, "PermissionDenied", "Unknown")]
    [InlineData("{\"error\":{\"code\":131030,\"message\":\"Recipient phone number not in allowed list: 60199999999\"}}", 131030, null, "RecipientRestricted", "Unknown")]
    [InlineData("{\"error\":{\"code\":131047,\"message\":\"Re-engagement message outside the 24-hour customer service window.\"}}", 131047, null, "SessionWindowClosed", "Unknown")]
    [InlineData("{\"error\":{\"code\":131047,\"message\":\"(#131047) Re-engagement message\",\"error_data\":{\"details\":\"Message failed to send because more than 24 hours have passed since the customer last replied. PRIVATE_REPLY 60199999999\"}}}", 131047, null, "SessionWindowClosed", "Unknown")]
    [InlineData("{\"error\":{\"code\":131047,\"message\":\"(#131047) Re-engagement message\",\"error_data\":{\"details\":\"PRIVATE_REPLY recipient 60199999999\"}}}", 131047, null, "Unknown", "Unknown")]
    [InlineData("{\"error\":{\"code\":100,\"message\":\"PRIVATE_REPLY says token to 60199999999 is missing required parameter\"}}", 100, null, "Unknown", "Unknown")]
    public async Task Rejected_staff_reply_logs_only_allowlisted_reason_and_numeric_provider_codes(string body, int? code, int? subcode,
        string reason, string field)
    {
        await using var fixture = await Fixture.Create();
        var logger = new CapturingSenderLogger();
        var handler = new SyntheticHandler(_ => new HttpResponseMessage(System.Net.HttpStatusCode.BadRequest)
        {
            Content = new StringContent(body)
        });
        using var sender = new WhatsAppStaffSender(new HttpClient(handler), logger);

        var result = await sender.SendAsync(fixture.Options, fixture.Options.TestRecipient, "PRIVATE_REPLY", default);

        Assert.Equal("ProviderRejected", result.Outcome);
        Assert.Equal(400, result.HttpStatusCode);
        Assert.Equal(1, handler.Calls);
        var warning = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Warning, warning.Level);
        Assert.Equal(400, warning.Fields["HttpStatusCode"]);
        Assert.Equal(code, warning.Fields["MetaErrorCode"]);
        Assert.Equal(subcode, warning.Fields["MetaErrorSubcode"]);
        Assert.Equal(reason, warning.Fields["MetaErrorReason"]);
        Assert.Equal(field, warning.Fields["MetaErrorField"]);
        Assert.Null(warning.Exception);
        Assert.Contains("Staff WhatsApp provider rejected reply", warning.Message);
        foreach (var secret in new[] { "PRIVATE_REPLY", fixture.Options.TestRecipient, "synthetic-token", "SECRET_META_CODE", "SECRET_META_SUBCODE" })
            Assert.DoesNotContain(secret, warning.Message + string.Join(' ', warning.Fields.Values.Select(value => value?.ToString())), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("malformed")]
    [InlineData("oversized")]
    [InlineData("read-failure")]
    public async Task Rejected_staff_reply_preserves_outcome_when_diagnostic_body_cannot_be_read(string mode)
    {
        await using var fixture = await Fixture.Create();
        var logger = new CapturingSenderLogger();
        var handler = new SyntheticHandler(_ =>
        {
            HttpContent content = mode == "malformed" ? new StringContent("not-json") :
                new StreamContent(new DiagnosticStream(Encoding.UTF8.GetBytes(new string('X', 5000)), mode == "read-failure"));
            if (mode != "malformed") Assert.Null(content.Headers.ContentLength);
            return new HttpResponseMessage(System.Net.HttpStatusCode.BadGateway) { Content = content };
        });
        using var sender = new WhatsAppStaffSender(new HttpClient(handler), logger);

        var result = await sender.SendAsync(fixture.Options, fixture.Options.TestRecipient, "Synthetic answer", default);

        Assert.Equal("ProviderRejected", result.Outcome);
        Assert.Equal(502, result.HttpStatusCode);
        Assert.Equal(1, handler.Calls);
        var warning = Assert.Single(logger.Entries);
        Assert.Equal(502, warning.Fields["HttpStatusCode"]);
        Assert.Null(warning.Fields["MetaErrorCode"]);
        Assert.Null(warning.Fields["MetaErrorSubcode"]);
        Assert.Equal("Unknown", warning.Fields["MetaErrorReason"]);
        Assert.Equal("Unknown", warning.Fields["MetaErrorField"]);
        Assert.Null(warning.Exception);
    }

    [Theory]
    [InlineData(200, "{\"messages\":[{\"id\":\"synthetic-provider-id\"}]}", 1)]
    [InlineData(400, "{\"error\":\"synthetic-invalid-list\"}", 2)]
    [InlineData(200, "not-json", 1)]
    public async Task Interactive_sender_uses_native_bounded_list_and_only_definite_rejection_falls_back(int status, string body, int expectedCalls)
    {
        await using var fixture = await Fixture.Create();
        var payloads = new List<JsonDocument>();
        var handler = new SyntheticHandler(request =>
        {
            payloads.Add(JsonDocument.Parse(request.Content!.ReadAsStringAsync().GetAwaiter().GetResult()));
            return new HttpResponseMessage((System.Net.HttpStatusCode)(status == 400 && payloads.Count == 2 ? 200 : status))
            {
                Content = new StringContent(status == 400 && payloads.Count == 2
                    ? "{\"messages\":[{\"id\":\"synthetic-fallback\"}]}" : body)
            };
        });
        using var sender = new WhatsAppStaffSender(new HttpClient(handler));
        var outbound = new WhatsAppStaffOutbound(WhatsAppStaffQueries.Help("ms", ["BossAdmin"]), "ms",
            WhatsAppStaffCommandHelp.Allowed(["BossAdmin"]));
        var result = await sender.SendAsync(fixture.Options, fixture.Options.TestRecipient, outbound, default);
        Assert.Equal(expectedCalls, handler.Calls);
        var menu = payloads[0].RootElement;
        Assert.Equal("interactive", menu.GetProperty("type").GetString());
        var sections = menu.GetProperty("interactive").GetProperty("action").GetProperty("sections").EnumerateArray();
        Assert.Equal(10, sections.Sum(section => section.GetProperty("rows").GetArrayLength()));
        Assert.Equal("Disabled", (await sender.SendAsync(fixture.Options, "60188888888", outbound, default)).Outcome);
        if (expectedCalls == 2) Assert.Equal("text", payloads[1].RootElement.GetProperty("type").GetString());
        foreach (var payload in payloads) payload.Dispose();
        Assert.Equal(status == 200 && body == "not-json" ? "UnknownOutcome" : "Accepted", result.Outcome);
    }

    private sealed class SyntheticHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
    {
        public int Calls { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Calls++;
            return Task.FromResult(respond(request));
        }
    }

    private sealed class CapturingSenderLogger : ILogger<WhatsAppStaffSender>
    {
        public List<(LogLevel Level, string Message, IReadOnlyDictionary<string, object?> Fields, Exception? Exception)> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            var fields = state is IEnumerable<KeyValuePair<string, object?>> values
                ? values.ToDictionary(item => item.Key, item => item.Value)
                : new Dictionary<string, object?>();
            Entries.Add((logLevel, formatter(state, exception), fields, exception));
        }
    }

    private sealed class DiagnosticStream(byte[] buffer, bool failRead) : MemoryStream(buffer)
    {
        public override bool CanSeek => false;
        public override long Length => throw new NotSupportedException();
        public override ValueTask<int> ReadAsync(Memory<byte> destination, CancellationToken cancellationToken = default) =>
            failRead ? ValueTask.FromException<int>(new IOException("Synthetic body read failure")) :
                base.ReadAsync(destination, cancellationToken);
        public override Task<int> ReadAsync(byte[] destination, int offset, int count, CancellationToken cancellationToken) =>
            failRead ? Task.FromException<int>(new IOException("Synthetic body read failure")) :
                base.ReadAsync(destination, offset, count, cancellationToken);
    }

    private sealed class Fixture(SqliteConnection connection, AppDbContext db, WhatsAppAssistantOptions options) : IAsyncDisposable
    {
        public AppDbContext Db { get; } = db;
        public WhatsAppAssistantOptions Options { get; } = options;
        public long Now { get; } = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        public static async Task<Fixture> Create(bool testMode = true, int limit = 100, bool enabled = true,
            string businessDisplayNumber = "")
        {
            var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync();
            var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
            await db.Database.EnsureCreatedAsync();
            var fixture = new Fixture(connection, db, new WhatsAppAssistantOptions
            {
                Enabled = enabled, WebhookEnabled = true, TestRecipient = "60199999999", PhoneNumberId = "123", BusinessAccountId = "456",
                GraphApiVersion = "v25.0", AppSecret = new string('s', 32), VerifyToken = new string('v', 32), AccessToken = "synthetic-token",
                TestMode = testMode,
                PerStaffDailyLimit = limit, BusinessDisplayNumber = businessDisplayNumber
            });
            await fixture.AddStaff("staff", "Sales");
            return fixture;
        }
        public async Task AddStaff(string id, string role)
        {
            var existing = await Db.Roles.SingleOrDefaultAsync(item => item.Name == role);
            existing ??= new IdentityRole(role) { Id = role, NormalizedName = role.ToUpperInvariant() };
            if (Db.Entry(existing).State == EntityState.Detached) Db.Roles.Add(existing);
            Db.Users.Add(new AppUser { Id = id, UserName = id, SecurityStamp = "synthetic-stamp-" + id });
            Db.UserRoles.Add(new IdentityUserRole<string> { UserId = id, RoleId = existing.Id });
            await Db.SaveChangesAsync();
        }
        public Task<WhatsAppStaffLinkResult> Issue(string user = "staff", string language = "en_US", string? recipient = null) =>
            WhatsAppStaffBindings.IssueAsync(Db, Options, user, new(recipient ?? Options.TestRecipient, language, true), "synthetic-actor", Now);
        public Task<bool> Verify(WhatsAppStaffLinkResult issued, string key = "link-event", long? now = null, string? recipient = null) =>
            WhatsAppStaffBindings.VerifyAsync(Db, Options, recipient ?? Options.TestRecipient, issued.Command[5..], key, now ?? Now);
        public async Task<string> DispatchAccepted()
        {
            var reply = "";
            await WhatsAppStaffQueue.DispatchOneAsync(Db, Options, (_, body, _) =>
            { reply = body; return Task.FromResult(new WhatsAppSendResult("Accepted", "synthetic-" + Guid.NewGuid())); }, Now);
            return reply;
        }
        public JsonDocument Payload(params (string Text, long Timestamp)[] messages) => Payload(Options.TestRecipient, messages);
        public JsonDocument Payload(string recipient, params (string Text, long Timestamp)[] messages) => JsonDocument.Parse(JsonSerializer.Serialize(new
        {
            @object = "whatsapp_business_account",
            entry = new[] { new { id = Options.BusinessAccountId, changes = new[] { new { field = "messages", value = new
            {
                metadata = new { phone_number_id = Options.PhoneNumberId },
                messages = messages.Select((message, index) => new { id = "synthetic-" + index, from = recipient, type = "text", timestamp = message.Timestamp.ToString(), text = new { body = message.Text } }).ToArray()
            } } } } }
        }));
        public DefaultHttpContext Context(string userId, params string[] roles)
        {
            var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, userId) };
            claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));
            return new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "synthetic")) };
        }
        public async ValueTask DisposeAsync() { await Db.DisposeAsync(); await connection.DisposeAsync(); }
    }
}
