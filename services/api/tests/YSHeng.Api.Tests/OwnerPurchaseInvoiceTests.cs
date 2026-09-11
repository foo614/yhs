using System.IO.Compression;
using System.Text;
using UglyToad.PdfPig;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class OwnerPurchaseInvoiceTests
{
    [Fact]
    public void Initial_issue_uses_canonical_owner_intake_price_and_unicode_pdf()
    {
        var vehicle = Vehicle(ownerId: Guid.NewGuid());
        var owner = Owner(vehicle.OwnerId!.Value, "王小明");
        var request = new GenerateOwnerPurchaseInvoiceRequest(owner.Id, vehicle.PurchasePrice, vehicle.IntakeDate);

        Assert.True(OwnerPurchaseInvoiceRules.ValidateGeneration(request, vehicle, owner).IsValid);

        var draft = OwnerPurchaseInvoiceFactory.CreateInitial(vehicle, owner, "YSH-PINV-2026-000042", new DateOnly(2026, 9, 6), "sales-1", new DateTime(2026, 9, 6, 2, 0, 0, DateTimeKind.Utc));

        Assert.Equal(PurchaseInvoiceSourceType.OwnerAcquisition, draft.Invoice.SourceType);
        Assert.Equal(owner.Id, draft.Invoice.OwnerId);
        Assert.Equal(1, draft.Invoice.CurrentRevisionNumber);
        Assert.Equal(vehicle.PurchasePrice, draft.Invoice.Amount);
        Assert.Equal(vehicle.IntakeDate, draft.Invoice.PurchaseDate);
        Assert.Equal(PurchaseInvoiceLineType.VehiclePurchase, Assert.Single(draft.Lines).LineType);
        Assert.Equal(vehicle.PurchasePrice, draft.Lines[0].Amount);
        Assert.Equal("王小明", draft.Revision.SellerName);
        var pdf = Encoding.ASCII.GetString(draft.Revision.Content);
        Assert.Contains("738B", pdf);
        Assert.DoesNotContain("?", pdf);
        Assert.Contains("/UniGB-UCS2-H", pdf);
    }

    [Fact]
    public void Generation_requires_boss_confirmed_current_owner_price_and_intake()
    {
        var vehicle = Vehicle(ownerId: Guid.NewGuid()) with { BossConfirmed = false, PurchasePrice = 0m };
        var owner = Owner(vehicle.OwnerId!.Value, "Owner One");
        var request = new GenerateOwnerPurchaseInvoiceRequest(Guid.NewGuid(), 51_000m, vehicle.IntakeDate.AddDays(1));

        var result = OwnerPurchaseInvoiceRules.ValidateGeneration(request, vehicle, owner);

        Assert.Contains(result.Errors, error => error.Code == "purchase_invoice_intake_not_approved");
        Assert.Contains(result.Errors, error => error.Code == "purchase_invoice_purchase_price_required");
        Assert.Contains(result.Errors, error => error.Code == "purchase_invoice_owner_changed");
        Assert.Contains(result.Errors, error => error.Code == "purchase_invoice_purchase_price_changed");
        Assert.Contains(result.Errors, error => error.Code == "purchase_invoice_intake_date_changed");
    }

    [Fact]
    public void Generation_source_changes_are_conflicts_but_invalid_canonical_intake_is_not()
    {
        var vehicle = Vehicle(ownerId: Guid.NewGuid());
        var owner = Owner(vehicle.OwnerId!.Value, "Owner One");

        var stale = OwnerPurchaseInvoiceRules.ValidateGeneration(
            new GenerateOwnerPurchaseInvoiceRequest(owner.Id, vehicle.PurchasePrice + 1m, vehicle.IntakeDate),
            vehicle,
            owner);
        var invalidCanonical = OwnerPurchaseInvoiceRules.ValidateGeneration(
            new GenerateOwnerPurchaseInvoiceRequest(owner.Id, vehicle.PurchasePrice + 1m, vehicle.IntakeDate),
            vehicle with { PurchasePrice = 0m },
            owner);

        Assert.Contains(stale.Errors, error => error.Code == "purchase_invoice_purchase_price_changed");
        Assert.True(OwnerPurchaseInvoiceRules.IsGenerationSourceStale(stale));
        Assert.False(OwnerPurchaseInvoiceRules.IsGenerationSourceStale(invalidCanonical));
    }

    [Fact]
    public void Formal_owner_invoices_require_two_decimal_amounts_before_pdf_generation()
    {
        var vehicle = Vehicle(ownerId: Guid.NewGuid());
        var owner = Owner(vehicle.OwnerId!.Value, "Owner One");
        var impreciseGeneration = OwnerPurchaseInvoiceRules.ValidateGeneration(
            new GenerateOwnerPurchaseInvoiceRequest(owner.Id, 50_000.001m, vehicle.IntakeDate),
            vehicle with { PurchasePrice = 50_000.001m },
            owner);
        var impreciseRevision = RevisionRequest(
            [
                new PurchaseInvoiceRevisionLineRequest(PurchaseInvoiceLineType.Other, "Part one", 0.004m, false),
                new PurchaseInvoiceRevisionLineRequest(PurchaseInvoiceLineType.Other, "Part two", 0.004m, false),
                new PurchaseInvoiceRevisionLineRequest(PurchaseInvoiceLineType.Other, "Part three", 0.004m, false)
            ]);
        var preciseVehicle = vehicle with { PurchasePrice = 50_000.01m };
        var preciseGeneration = OwnerPurchaseInvoiceRules.ValidateGeneration(
            new GenerateOwnerPurchaseInvoiceRequest(owner.Id, preciseVehicle.PurchasePrice, preciseVehicle.IntakeDate),
            preciseVehicle,
            owner);
        var preciseRevision = RevisionRequest(
            [
                new PurchaseInvoiceRevisionLineRequest(PurchaseInvoiceLineType.Other, "Part one", 0.01m, false),
                new PurchaseInvoiceRevisionLineRequest(PurchaseInvoiceLineType.Other, "Part two", 0.01m, false),
                new PurchaseInvoiceRevisionLineRequest(PurchaseInvoiceLineType.Other, "Part three", 0.01m, false)
            ]);

        Assert.Contains(impreciseGeneration.Errors, error => error.Code == "purchase_invoice_purchase_price_precision_invalid");
        Assert.Contains(OwnerPurchaseInvoiceRules.ValidateRevision(impreciseRevision).Errors, error => error.Code == "purchase_invoice_revision_line_precision_invalid");
        Assert.True(preciseGeneration.IsValid);
        Assert.True(OwnerPurchaseInvoiceRules.ValidateRevision(preciseRevision).IsValid);

        var initial = OwnerPurchaseInvoiceFactory.CreateInitial(preciseVehicle, owner, "YSH-PINV-2026-000080", new DateOnly(2026, 9, 6), "sales@example.test", DateTime.UtcNow);
        var revised = OwnerPurchaseInvoiceFactory.CreateRevision(initial.Invoice, initial.Revision, preciseRevision, "sales@example.test", DateTime.UtcNow);
        var pdf = Encoding.ASCII.GetString(revised.Revision.Content);
        Assert.Equal(0.03m, revised.Revision.Amount);
        Assert.Contains("Total: RM 0.03", pdf);
        Assert.Contains("RM 0.01", pdf);
    }

    [Fact]
    public void Revision_keeps_source_identity_and_resets_only_the_current_accounting_review()
    {
        var vehicle = Vehicle(ownerId: Guid.NewGuid());
        var owner = Owner(vehicle.OwnerId!.Value, "Owner One");
        var initial = OwnerPurchaseInvoiceFactory.CreateInitial(vehicle, owner, "YSH-PINV-2026-000043", new DateOnly(2026, 9, 6), "sales-1", DateTime.UtcNow);
        var current = initial.Revision with
        {
            AccountingStatus = AccountingConfirmationStatus.FinanceConfirmed,
            AccountingConfirmedBy = "finance-1",
            AccountingConfirmedAt = new DateTime(2026, 9, 6, 3, 0, 0, DateTimeKind.Utc)
        };
        var invoice = initial.Invoice with
        {
            AccountingStatus = AccountingConfirmationStatus.FinanceConfirmed,
            AccountingConfirmedBy = "finance-1",
            AccountingConfirmedAt = current.AccountingConfirmedAt
        };
        var request = new CreatePurchaseInvoiceRevisionRequest(
            1,
            "Corrected processing fee",
            new DateOnly(2026, 9, 7),
            vehicle.IntakeDate,
            "BANK-123",
            new PurchaseInvoiceRevisionSeller("Owner corrected", "0123456789", null, "TIN-1", null),
            [
                new PurchaseInvoiceRevisionLineRequest(PurchaseInvoiceLineType.VehiclePurchase, "Vehicle", 50_000m, true),
                new PurchaseInvoiceRevisionLineRequest(PurchaseInvoiceLineType.PurchaseProcessing, "Processing", 500m, true)
            ]);

        Assert.True(OwnerPurchaseInvoiceRules.ValidateRevision(request).IsValid);
        var revision = OwnerPurchaseInvoiceFactory.CreateRevision(invoice, current, request, "sales-2", new DateTime(2026, 9, 7, 1, 0, 0, DateTimeKind.Utc));

        Assert.Equal(2, revision.Invoice.CurrentRevisionNumber);
        Assert.Equal(50_500m, revision.Invoice.Amount);
        Assert.Equal(AccountingConfirmationStatus.Draft, revision.Invoice.AccountingStatus);
        Assert.Null(revision.Invoice.AccountingConfirmedBy);
        Assert.Equal(current.SourceVehicleId, revision.Revision.SourceVehicleId);
        Assert.Equal(current.SourceOwnerId, revision.Revision.SourceOwnerId);
        Assert.Equal(current.InvoiceNumber, revision.Revision.InvoiceNumber);
        Assert.Equal(AccountingConfirmationStatus.FinanceConfirmed, current.AccountingStatus);
        Assert.Equal("Corrected processing fee", revision.Revision.Reason);
        Assert.Equal(50_500m, revision.Lines.Sum(line => line.Amount));
    }

    [Fact]
    public void Revision_validation_rejects_missing_reason_invalid_lines_and_unsupported_pdf_text()
    {
        var invalid = new CreatePurchaseInvoiceRevisionRequest(
            0,
            " ",
            default,
            default,
            null,
            new PurchaseInvoiceRevisionSeller("🙂", " ", null, null, null),
            [new PurchaseInvoiceRevisionLineRequest(PurchaseInvoiceLineType.Other, "", 0m, false)]);

        var result = OwnerPurchaseInvoiceRules.ValidateRevision(invalid);

        Assert.Contains(result.Errors, error => error.Code == "purchase_invoice_revision_required");
        Assert.Contains(result.Errors, error => error.Code == "purchase_invoice_revision_reason_required");
        Assert.Contains(result.Errors, error => error.Code == "purchase_invoice_revision_line_invalid");
        Assert.Contains(result.Errors, error => error.Code == "purchase_invoice_pdf_text_unsupported");
    }

    [Fact]
    public void Revision_validation_rejects_unknown_line_types_and_extreme_amounts_without_overflowing()
    {
        var request = new CreatePurchaseInvoiceRevisionRequest(
            1,
            "Correct an imported amount",
            new DateOnly(2026, 9, 7),
            new DateOnly(2026, 9, 1),
            null,
            new PurchaseInvoiceRevisionSeller("Owner", "0123456789", null, null, null),
            [
                new PurchaseInvoiceRevisionLineRequest((PurchaseInvoiceLineType)999, "Unknown type", decimal.MaxValue, false),
                new PurchaseInvoiceRevisionLineRequest(PurchaseInvoiceLineType.Other, "Also too large", decimal.MaxValue, false)
            ]);

        var result = OwnerPurchaseInvoiceRules.ValidateRevision(request);

        Assert.Contains(result.Errors, error => error.Code == "purchase_invoice_revision_line_invalid");
        Assert.DoesNotContain(result.Errors, error => error.Code == "purchase_invoice_revision_total_invalid" && error.Message.Contains("overflow", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Legacy_writes_cannot_claim_system_owner_invoice_numbers_but_can_preserve_existing_ones()
    {
        var legacy = new PurchaseInvoice { InvoiceNumber = " ysh-pinv-2026-000001 " };

        Assert.Contains(OwnerPurchaseInvoiceRules.ValidateLegacyWrite(legacy).Errors, error => error.Code == "purchase_invoice_official_number_reserved");
        Assert.True(OwnerPurchaseInvoiceRules.ValidateLegacyWrite(legacy, "YSH-PINV-2026-000001").IsValid);
    }

    [Fact]
    public void Pdf_wraps_and_paginates_without_truncating_supported_chinese_text()
    {
        var revision = new PurchaseInvoiceRevision
        {
            InvoiceNumber = "YSH-PINV-2026-000099",
            RevisionNumber = 2,
            InvoiceDate = new DateOnly(2026, 9, 6),
            PurchaseDate = new DateOnly(2026, 9, 1),
            SellerName = "王小明",
            SellerPhone = "0123456789",
            VehiclePlateNumber = "ABC1234",
            VehicleDescription = "Test Car",
            Amount = 90m,
            CreatedBy = "sales-1",
            Reason = "末尾说明"
        };
        var lines = Enumerable.Range(1, 90).Select(index => new PurchaseInvoiceRevisionLine
        {
            PurchaseInvoiceRevisionId = revision.Id,
            SortOrder = index,
            LineType = PurchaseInvoiceLineType.Other,
            Description = $"第{index}项测试说明和很长的中文内容",
            Amount = 1m
        }).ToList();

        var content = OwnerPurchaseInvoicePdf.Create(revision, lines);
        var pdf = Encoding.ASCII.GetString(content);

        Assert.True(System.Text.RegularExpressions.Regex.Matches(pdf, "/Type /Page /Parent").Count > 1);
        Assert.Contains(Convert.ToHexString(Encoding.BigEndianUnicode.GetBytes("末尾说明")), pdf);
        Assert.Contains("/BaseFont /Helvetica", pdf);
        Assert.Contains("0.055 0.18 0.16 rg", pdf);
        Assert.Contains("0.91 0.96 0.95 rg", pdf);
        Assert.Contains("Invoice YSH-PINV-2026-000099  |  Version 2  |  Page 1 of", pdf);
        using var document = PdfDocument.Open(content, ParsingOptions.LenientParsingOff);
        Assert.True(document.NumberOfPages > 1);
        for (var pageNumber = 1; pageNumber <= document.NumberOfPages; pageNumber++) _ = document.GetPage(pageNumber);
        Assert.True(UploadPolicy.ValidateVehicleIntakeVocContent("invoice.pdf", "application/pdf", content).Result.IsValid);
    }

    [Fact]
    public void New_revision_actor_uses_immutable_display_and_identity_values()
    {
        var vehicle = Vehicle(ownerId: Guid.NewGuid());
        var owner = Owner(vehicle.OwnerId!.Value, "Owner One");
        var draft = OwnerPurchaseInvoiceFactory.CreateInitial(
            vehicle,
            owner,
            "YSH-PINV-2026-000078",
            new DateOnly(2026, 9, 6),
            "sales@example.test",
            DateTime.UtcNow,
            "identity-123");

        Assert.Equal("sales@example.test", draft.Revision.CreatedBy);
        Assert.Equal("identity-123", draft.Revision.CreatedByUserId);
        Assert.Contains("Prepared by: sales@example.test", Encoding.ASCII.GetString(draft.Revision.Content));
    }

    [Fact]
    public void Generated_purchase_invoice_pdf_passes_the_strict_voc_pdf_parser()
    {
        var vehicle = Vehicle(ownerId: Guid.NewGuid());
        var owner = Owner(vehicle.OwnerId!.Value, "Owner One");
        var draft = OwnerPurchaseInvoiceFactory.CreateInitial(vehicle, owner, "YSH-PINV-2026-000079", new DateOnly(2026, 9, 6), "sales@example.test", DateTime.UtcNow);

        using var document = PdfDocument.Open(draft.Revision.Content, ParsingOptions.LenientParsingOff);
        Assert.Equal(1, document.NumberOfPages);
        _ = document.GetPage(1);
        Assert.True(UploadPolicy.ValidateVehicleIntakeVocContent("invoice.pdf", "application/pdf", draft.Revision.Content).Result.IsValid);
    }

    [Fact]
    public void AutoCount_export_labels_owner_acquisition_without_supplier_or_creditor_guessing()
    {
        var vehicle = Vehicle(ownerId: Guid.NewGuid());
        var owner = Owner(vehicle.OwnerId!.Value, "Owner Snapshot");
        var draft = OwnerPurchaseInvoiceFactory.CreateInitial(vehicle, owner, "YSH-PINV-2026-000077", new DateOnly(2026, 9, 6), "sales-1", DateTime.UtcNow);
        var snapshot = draft.Revision with { Lines = draft.Lines };
        var invoice = draft.Invoice with { CurrentRevision = snapshot, Lines = OwnerPurchaseInvoiceFactory.ToCurrentLines(snapshot) };
        var input = new AutoCountExportInput([vehicle], [], [invoice], [], [], [], [], [], [], [], [], null, null, DateTime.UtcNow);

        using var archive = new ZipArchive(new MemoryStream(AutoCountExcel.Export(input)), ZipArchiveMode.Read);
        using var stream = archive.GetEntry("xl/worksheets/sheet4.xml")!.Open();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        var worksheet = reader.ReadToEnd();

        Assert.Contains("OwnerAcquisition", worksheet);
        Assert.Contains("Owner Snapshot", worksheet);
        Assert.Contains("Do not create or guess a Supplier or AutoCount creditor code", worksheet);
        Assert.Contains("CurrentRevision", worksheet);
    }

    private static Vehicle Vehicle(Guid ownerId) => new()
    {
        PlateNumber = "ABC1234",
        Make = "Toyota",
        Model = "Vios",
        Year = 2022,
        OwnerId = ownerId,
        BossConfirmed = true,
        PurchasePrice = 50_000m,
        IntakeDate = new DateOnly(2026, 9, 1)
    };

    private static Owner Owner(Guid id, string name) => new()
    {
        Id = id,
        Name = name,
        Phone = "0123456789"
    };

    private static CreatePurchaseInvoiceRevisionRequest RevisionRequest(IReadOnlyList<PurchaseInvoiceRevisionLineRequest> lines) => new(
        1,
        "Correction",
        new DateOnly(2026, 9, 7),
        new DateOnly(2026, 9, 1),
        null,
        new PurchaseInvoiceRevisionSeller("Owner One", "0123456789", null, null, null),
        lines);
}
