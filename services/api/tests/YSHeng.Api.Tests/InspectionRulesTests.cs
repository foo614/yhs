using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class InspectionRulesTests
{
    [Fact]
    public void Supported_types_match_the_client_inspection_dropdown()
    {
        Assert.Equal([9001, 9002, 9003, 9004, 9011], InspectionRules.SupportedTypes.Select(type => (int)type));
    }

    [Fact]
    public void Report_expiry_and_reminders_use_the_four_month_business_rule()
    {
        var inspectionDate = new DateOnly(2026, 1, 15);

        var dates = InspectionRules.ReminderDates(inspectionDate, isLorry: true);

        Assert.Equal(new DateOnly(2026, 5, 15), InspectionRules.ReportExpiryDate(inspectionDate));
        Assert.Equal(new DateOnly(2026, 3, 15), dates.BookingReminderDate);
        Assert.Equal(new DateOnly(2026, 1, 14), dates.AppointmentReminderDate);
        Assert.Equal(new DateOnly(2026, 5, 8), dates.ReportExpiryReminderDate);
        Assert.Equal(new DateOnly(2026, 1, 8), dates.LorryAppointmentReminderDate);
        Assert.Null(InspectionRules.ReminderDates(inspectionDate, isLorry: false).LorryAppointmentReminderDate);
    }

    [Fact]
    public void Receipt_allocations_must_reconcile_to_the_original_total()
    {
        var first = Guid.NewGuid();
        var second = Guid.NewGuid();

        Assert.True(InspectionRules.ValidateReceiptAllocations(120m,
            [new(first, 70m), new(second, 50m)]).IsValid);
        Assert.False(InspectionRules.ValidateReceiptAllocations(120m,
            [new(first, 70m), new(second, 49m)]).IsValid);
        Assert.False(InspectionRules.ValidateReceiptAllocations(120m,
            [new(first, 120m), new(first, 0m)]).IsValid);
    }

    [Fact]
    public void Split_supplier_references_are_deterministic_for_repeated_exports()
    {
        var ids = new[] { Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid() };

        var first = InspectionRules.SplitSupplierInvoiceReferences("RCPT-2026-001", ids);
        var repeated = InspectionRules.SplitSupplierInvoiceReferences("RCPT-2026-001", ids);

        Assert.Equal(["RCPT-2026-001-1", "RCPT-2026-001-2", "RCPT-2026-001-3"], first);
        Assert.Equal(first, repeated);
        Assert.Empty(InspectionRules.SplitSupplierInvoiceReferences("", ids));
    }

    [Fact]
    public void Next_supplier_reference_does_not_renumber_existing_allocations()
    {
        var existing = new[]
        {
            new YSHeng.Api.Domain.InspectionRecord { VehicleId = Guid.NewGuid(), SourceReceiptNumber = "RCPT-2026-001", SupplierInvoiceReference = "RCPT-2026-001-1" },
            new YSHeng.Api.Domain.InspectionRecord { VehicleId = Guid.NewGuid(), SourceReceiptNumber = "RCPT-2026-001", SupplierInvoiceReference = "RCPT-2026-001-3" }
        };

        Assert.Equal("RCPT-2026-001-4", InspectionRules.NextSupplierInvoiceReference("RCPT-2026-001", existing));
        Assert.Equal("RCPT-2026-001-1", existing[0].SupplierInvoiceReference);
        Assert.Equal("RCPT-2026-001-3", existing[1].SupplierInvoiceReference);
    }

    [Fact]
    public void Update_rejects_unknown_status_values()
    {
        var request = new UpdateInspectionRequest(
            InspectionType.Awalan,
            InspectionCompany.YSHengAuto,
            (InspectionStatus)999,
            false,
            new DateOnly(2026, 1, 15),
            null,
            "BOOK-1",
            100m,
            100m,
            null);

        Assert.Contains(InspectionRules.Validate(request).Errors, error => error.Code == "inspection_status_invalid");
    }

    [Fact]
    public void WhatsApp_reminders_follow_booking_lorry_and_report_expiry_rules_and_stop_when_inactive()
    {
        var bookedLorry = new InspectionRecord
        {
            VehicleId = Guid.NewGuid(), IsLorry = true, Status = InspectionStatus.Booked,
            AppointmentDate = new DateOnly(2026, 1, 15)
        };

        Assert.Equal(["lorry-7days"], WhatsAppInspectionReminders.DueFor(bookedLorry, VehicleStatus.Available, new DateOnly(2026, 1, 8)).Select(item => item.Kind));
        Assert.Equal(["appointment-1day"], WhatsAppInspectionReminders.DueFor(bookedLorry, VehicleStatus.Available, new DateOnly(2026, 1, 14)).Select(item => item.Kind));

        var completed = bookedLorry with { Status = InspectionStatus.Completed };
        Assert.Equal(["expiry-2months"], WhatsAppInspectionReminders.DueFor(completed, VehicleStatus.Available, new DateOnly(2026, 3, 15)).Select(item => item.Kind));
        Assert.Equal(["expiry-7days"], WhatsAppInspectionReminders.DueFor(completed, VehicleStatus.Available, new DateOnly(2026, 5, 8)).Select(item => item.Kind));
        Assert.Empty(WhatsAppInspectionReminders.DueFor(bookedLorry with { Status = InspectionStatus.Cancelled }, VehicleStatus.Available, new DateOnly(2026, 1, 8)));
        Assert.Empty(WhatsAppInspectionReminders.DueFor(bookedLorry, VehicleStatus.Sold, new DateOnly(2026, 1, 8)));
    }

    [Fact]
    public async Task WhatsApp_reminder_refresh_rechecks_current_vehicle_and_inspection_state()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseSqlite(connection).Options);
        await db.Database.EnsureCreatedAsync();
        var vehicle = new Vehicle { PlateNumber = "INSPECT1", Status = VehicleStatus.Available };
        var inspection = new InspectionRecord
        {
            VehicleId = vehicle.Id, Status = InspectionStatus.Booked, IsLorry = false,
            AppointmentDate = new DateOnly(2026, 1, 15), BookingReference = "BOOK-1"
        };
        var now = new DateTimeOffset(2026, 1, 14, 9, 0, 0, TimeSpan.FromHours(8)).ToUnixTimeSeconds();
        db.Vehicles.Add(vehicle);
        db.InspectionRecords.Add(inspection);
        db.WhatsAppOutbox.Add(new WhatsAppOutbox
        {
            Audience = "Staff", StaffUserId = "boss", MessageKind = WhatsAppInspectionReminders.Category,
            RequiredStaffRole = "BossAdmin", BusinessEventKey = $"inspection:{inspection.Id:N}:appointment-1day:2026-01-14",
            State = "Queued", CreatedAt = now, ScheduledAt = now, NextAttemptAt = now, ExpiresAt = now + 3600,
            Recipient = "60111111111", Language = "en_US", Body = "stale body", TemplateReference = "stale body"
        });
        await db.SaveChangesAsync();
        var row = await db.WhatsAppOutbox.SingleAsync();

        Assert.NotNull(await WhatsAppInspectionReminders.RefreshAsync(db, row, now));
        db.Entry(vehicle).CurrentValues.SetValues(vehicle with { Status = VehicleStatus.Sold });
        await db.SaveChangesAsync();
        Assert.Null(await WhatsAppInspectionReminders.RefreshAsync(db, row, now));
        db.Entry(vehicle).CurrentValues.SetValues(vehicle with { Status = VehicleStatus.Available });
        db.Entry(inspection).CurrentValues.SetValues(inspection with { Status = InspectionStatus.Cancelled });
        await db.SaveChangesAsync();
        Assert.Null(await WhatsAppInspectionReminders.RefreshAsync(db, row, now));
    }
}
