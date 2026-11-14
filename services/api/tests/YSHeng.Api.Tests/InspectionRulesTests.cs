using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
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
    public void Manual_supplier_invoice_reference_is_preserved_without_automatic_suffixing()
    {
        var request = new CreateInspectionRequest(
            Guid.NewGuid(),
            InspectionType.Awalan,
            InspectionCompany.YSHengAuto,
            false,
            new DateOnly(2026, 1, 15),
            null,
            "BOOK-1",
            "RECEIPT-1",
            100m,
            100m,
            null,
            "  Supplier-INV-77  ");

        var inspection = InspectionRules.PrepareCreate(request, "boss", request.SupplierInvoiceReference!.Trim());

        Assert.Equal("Supplier-INV-77", inspection.SupplierInvoiceReference);
        Assert.Equal("RECEIPT-1", inspection.SourceReceiptNumber);
    }

    [Fact]
    public void Inspection_export_uses_the_exact_company_mapping_and_allocated_amount()
    {
        var vehicle = new Vehicle { Id = Guid.Parse("00000000-0000-0000-0000-000000000101"), PlateNumber = "ABC101" };
        var inspection = new InspectionRecord
        {
            Id = Guid.Parse("00000000-0000-0000-0000-000000000201"), VehicleId = vehicle.Id, Company = InspectionCompany.YSHengAutomotive,
            Type = InspectionType.PertukaranHakMilik, AppointmentDate = new DateOnly(2026, 11, 14), BookingReference = "BOOK-101",
            SourceReceiptNumber = "RECEIPT-SHARED", SupplierInvoiceReference = "INV-101 (2)", ReceiptTotal = 250m, AllocatedAmount = 125m
        };

        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.ExportInspection(new(
            [inspection], [vehicle], InspectionCompany.YSHengAutomotive))), ZipArchiveMode.Read);
        var row = Assert.Single(SheetRows(archive, "InspectionBookings"));

        Assert.Equal("4T00-P004", row["CreditorCode"]);
        Assert.Equal("PUSPAKOM SDN BHD", row["CreditorName"]);
        Assert.Equal("INSPECTION (PUSPAKOM)", row["ItemCode"]);
        Assert.Equal("6100-0000", row["AccountCode"]);
        Assert.Equal("UNIT", row["UOM"]);
        Assert.Equal("RECEIPT-SHARED", row["SourceReceiptNumber"]);
        Assert.Equal("INV-101 (2)", row["SupplierInvoiceReference"]);
        Assert.Equal("INV-101 (2)", row["SupplierDONumber"]);
        Assert.Equal("125.00", row["AllocatedAmount"]);
        Assert.Equal("", row["AutoCountInvoiceNumber"]);
        Assert.Contains(NativeRows(archive, "PI_0001"), item => item.Count == 2 && item[0] == "Description" && item[1] == "9011 - PERTUKARAN HAK MILIK");
    }

    [Fact]
    public void Inspection_export_is_company_isolated_and_keeps_each_vehicle_allocation()
    {
        var firstVehicle = new Vehicle { Id = Guid.Parse("00000000-0000-0000-0000-000000000111"), PlateNumber = "ABC111" };
        var secondVehicle = new Vehicle { Id = Guid.Parse("00000000-0000-0000-0000-000000000112"), PlateNumber = "ABC112" };
        var inspections = new[]
        {
            Inspection(firstVehicle, InspectionCompany.YSHengAuto, "INV-111", 70m),
            Inspection(secondVehicle, InspectionCompany.YSHengAuto, "INV-112", 50m),
            Inspection(firstVehicle, InspectionCompany.YSHengAutomotive, "INV-113", 999m)
        };

        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.ExportInspection(new(
            inspections, [firstVehicle, secondVehicle], InspectionCompany.YSHengAuto))), ZipArchiveMode.Read);
        var rows = SheetRows(archive, "InspectionBookings");

        Assert.Equal(2, rows.Count);
        Assert.Equal(["ABC111", "ABC112"], rows.Select(row => row["CarPlate"]));
        Assert.Equal(["70.00", "50.00"], rows.Select(row => row["AllocatedAmount"]));
        Assert.DoesNotContain(rows, row => row["SupplierInvoiceReference"] == "INV-113");
        Assert.Equal(2, SheetRows(archive, "PasteGuide").Count);
    }

    [Fact]
    public void Inspection_export_is_stable_and_blocks_invalid_rows_without_a_false_pi_sheet()
    {
        var vehicle = new Vehicle { Id = Guid.Parse("00000000-0000-0000-0000-000000000121"), PlateNumber = "ABC121" };
        var valid = Inspection(vehicle, InspectionCompany.YSHengAuto, "INV-121", 100m);
        var invalid = Inspection(vehicle, InspectionCompany.YSHengAuto, "", 100m) with { Id = Guid.Parse("00000000-0000-0000-0000-000000000222") };
        var input = new InspectionAutoCountExportInput([valid, invalid], [vehicle], InspectionCompany.YSHengAuto);

        var first = AutoCountExcel.ExportInspection(input);
        var second = AutoCountExcel.ExportInspection(input);
        Assert.Equal(first, second);

        using var archive = new ZipArchive(new MemoryStream(first), ZipArchiveMode.Read);
        Assert.Single(WorkbookSheetNames(archive), name => name == "PI_0001");
        Assert.Contains(SheetRows(archive, "PasteGuide"), row => row["ReviewStatus"] == "BlockedForPaste" && row["Sheet"] == "");
    }

    [Fact]
    public void Supplier_invoice_check_is_case_insensitive_trimmed_and_suggests_next_root_suffix()
    {
        var existing = new[]
        {
            new InspectionRecord { SupplierInvoiceReference = "  INV-77  " },
            new InspectionRecord { SupplierInvoiceReference = "INV-77 (1)" },
            new InspectionRecord { SupplierInvoiceReference = "INV-77 (3)" }
        };

        var duplicate = InspectionRules.CheckSupplierInvoiceReference(" inv-77 (1) ", existing);
        var available = InspectionRules.CheckSupplierInvoiceReference(" new-invoice ", existing);

        Assert.False(duplicate.Available);
        Assert.Equal("inv-77 (2)", duplicate.SuggestedInvoiceNumber);
        Assert.True(available.Available);
        Assert.Null(available.SuggestedInvoiceNumber);
    }

    private static InspectionRecord Inspection(Vehicle vehicle, InspectionCompany company, string invoice, decimal amount) => new()
    {
        VehicleId = vehicle.Id, Company = company, Type = InspectionType.Awalan, AppointmentDate = new DateOnly(2026, 11, 14),
        BookingReference = $"BOOK-{vehicle.PlateNumber}", SourceReceiptNumber = "RECEIPT-SHARED", SupplierInvoiceReference = invoice,
        ReceiptTotal = 120m, AllocatedAmount = amount
    };

    private static List<Dictionary<string, string>> SheetRows(ZipArchive archive, string sheetName)
    {
        var rows = NativeRows(archive, sheetName);
        var headers = rows[0];
        return rows.Skip(1).Select(row => headers.Select((header, index) => (header, value: row.ElementAtOrDefault(index) ?? ""))
            .ToDictionary(cell => cell.header, cell => cell.value)).ToList();
    }

    private static List<List<string>> NativeRows(ZipArchive archive, string sheetName)
    {
        XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        var sheets = XDocument.Parse(Read(archive, "xl/workbook.xml")).Descendants(ns + "sheet").ToList();
        var index = sheets.FindIndex(sheet => (string?)sheet.Attribute("name") == sheetName);
        Assert.True(index >= 0);
        return XDocument.Parse(Read(archive, $"xl/worksheets/sheet{index + 1}.xml")).Descendants(ns + "row")
            .Select(row => row.Elements(ns + "c").Select(cell => cell.Value).ToList()).ToList();
    }

    private static List<string> WorkbookSheetNames(ZipArchive archive)
    {
        XNamespace ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        return XDocument.Parse(Read(archive, "xl/workbook.xml")).Descendants(ns + "sheet")
            .Select(sheet => (string)sheet.Attribute("name")!).ToList();
    }

    private static string Read(ZipArchive archive, string path)
    {
        using var stream = archive.GetEntry(path)!.Open();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }

    [Fact]
    public void Create_validation_requires_manual_supplier_invoice_reference()
    {
        var request = new CreateInspectionRequest(
            Guid.NewGuid(),
            InspectionType.Awalan,
            InspectionCompany.YSHengAuto,
            false,
            new DateOnly(2026, 1, 15),
            null,
            "BOOK-1",
            "RECEIPT-1",
            100m,
            100m,
            null);

        Assert.Contains(InspectionRules.Validate(request, []).Errors,
            error => error.Code == "inspection_supplier_invoice_reference_required");
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
