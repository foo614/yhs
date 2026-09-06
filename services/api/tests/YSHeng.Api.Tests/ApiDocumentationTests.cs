using System.Text.RegularExpressions;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class ApiDocumentationTests
{
    [Fact]
    public void Vehicle_updates_preserve_admin_approval_for_non_admin_writes()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));

        Assert.Contains("Property(vehicle => vehicle.BossConfirmed).IsModified = false", program);
        Assert.Contains("!vehicle.BossConfirmed && vehicle.IsPublic", program);
        Assert.Contains("SetProperty(vehicle => vehicle.IsPublic, false)", program);
    }

    [Fact]
    public void Vehicle_and_finance_routes_enforce_the_canonical_approved_selling_price()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));

        var vehicleUpdate = program[
            program.IndexOf("backOffice.MapPut(\"/vehicles/{id:guid}\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapGet(\"/vehicles/{id:guid}/stock-movements\"", StringComparison.Ordinal)];
        Assert.Contains("VehicleApprovalRules.ValidateRepricingReceivableLock", vehicleUpdate);
        Assert.Contains("VehicleApprovalRules.EnforceRepricingApproval", vehicleUpdate);
        Assert.Contains("\"SellingPrice\"", program[program.IndexOf("internal static class StockMovementAudit", StringComparison.Ordinal)..]);

        var legacyCreate = program[
            program.IndexOf("backOffice.MapPost(\"/payments\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPut(\"/payments/{id:guid}\"", StringComparison.Ordinal)];
        Assert.Contains("ValidateLegacyReceivableCreate", legacyCreate);
        Assert.Contains("ApplyLegacyCanonicalSalesPrice", legacyCreate);

        var legacyUpdate = program[
            program.IndexOf("backOffice.MapPut(\"/payments/{id:guid}\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPost(\"/payments/{id:guid}/management-review\"", StringComparison.Ordinal)];
        Assert.Contains("ValidateLegacyPricingUpdate", legacyUpdate);

        var v2Create = program[
            program.IndexOf("backOffice.MapPost(\"/payments/finance-sale\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPost(\"/payments/{id:guid}/nett-price-override/approve\"", StringComparison.Ordinal)];
        Assert.Contains("CreatePayment(request, vehicle", v2Create);
        Assert.Contains("ValidateSale(request, payment, vehicle)", v2Create);
        Assert.Contains("!FinanceV2Rules.RequiresNettPriceApproval(payment)", v2Create);

        var collectionCreate = program[
            program.IndexOf("backOffice.MapPost(\"/payments/{id:guid}/collections\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPost(\"/collection-transactions/{id:guid}/financing-status\"", StringComparison.Ordinal)];
        Assert.Contains("FinanceV2Rules.ValidateCollectionCreate(payment", collectionCreate);

        var collectionReconcile = program[
            program.IndexOf("backOffice.MapPost(\"/collection-transactions/{id:guid}/reconcile\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPost(\"/collection-transactions/{id:guid}/reverse\"", StringComparison.Ordinal)];
        Assert.Contains("FinanceV2Rules.ValidateReconcile(payment", collectionReconcile);

        var financeOptions = program[
            program.IndexOf("backOffice.MapGet(\"/finance/vehicle-options\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPost(\"/owner-intakes/identity-card-preview\"", StringComparison.Ordinal)];
        Assert.Contains("Where(vehicle => vehicle.BossConfirmed)", financeOptions);
    }

    [Fact]
    public void Workflow_approval_actions_are_dedicated_and_boss_admin_only()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));

        Assert.Contains("backOffice.MapPost(\"/repairs/{id:guid}/approval\"", program);
        Assert.Contains("backOffice.MapPost(\"/payments/{id:guid}/management-review\"", program);
        Assert.Contains("RepairApprovalRules.PrepareForCreate(repair)", program);
        Assert.Contains("PaymentManagementReviewRules.PrepareForCreate(payment)", program);
        var repairApprovalRoute = program[program.IndexOf("backOffice.MapPost(\"/repairs/{id:guid}/approval\"", StringComparison.Ordinal)..];
        var managementReviewRoute = program[program.IndexOf("backOffice.MapPost(\"/payments/{id:guid}/management-review\"", StringComparison.Ordinal)..];
        Assert.StartsWith("backOffice.MapPost(\"/repairs/{id:guid}/approval\"", repairApprovalRoute);
        Assert.StartsWith("backOffice.MapPost(\"/payments/{id:guid}/management-review\"", managementReviewRoute);
        Assert.Contains("}).RequireAuthorization(\"BossAdmin\");", repairApprovalRoute[..repairApprovalRoute.IndexOf("backOffice.MapGet(\"/suppliers\"", StringComparison.Ordinal)]);
        Assert.Contains("}).RequireAuthorization(\"BossAdmin\");", managementReviewRoute[..managementReviewRoute.IndexOf("backOffice.MapGet(\"/cash-handovers\"", StringComparison.Ordinal)]);
    }

    [Fact]
    public void Manual_loan_creation_is_boss_admin_only_while_normal_loan_workflow_stays_loans_authorized()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));
        var apiDocumentation = File.ReadAllText(Path.Combine(root, "docs", "API.md"));

        var createRoute = program[
            program.IndexOf("backOffice.MapPost(\"/loans\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPost(\"/loans/{id:guid}/decision\"", StringComparison.Ordinal)];
        var decisionRoute = program[
            program.IndexOf("backOffice.MapPost(\"/loans/{id:guid}/decision\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPut(\"/loans/{id:guid}\"", StringComparison.Ordinal)];
        var updateRoute = program[
            program.IndexOf("backOffice.MapPut(\"/loans/{id:guid}\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapGet(\"/deliveries\"", StringComparison.Ordinal)];
        var documentCheckRoute = program[
            program.IndexOf("backOffice.MapGet(\"/loans/{id:guid}/document-check\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapGet(\"/deliveries/{id:guid}/release-readiness\"", StringComparison.Ordinal)];

        Assert.Contains("}).RequireAuthorization(\"BossAdmin\");", createRoute);
        Assert.DoesNotContain("}).RequireAuthorization(\"Loans\");", createRoute);
        Assert.Contains("}).RequireAuthorization(\"Loans\");", decisionRoute);
        Assert.Contains("}).RequireAuthorization(\"Loans\");", updateRoute);
        Assert.Contains("}).RequireAuthorization(\"Loans\");", documentCheckRoute);
        Assert.Contains("| `POST` | `/api/loans` | `BossAdmin` |", apiDocumentation);
    }

    [Fact]
    public void Loan_update_reloads_a_tracked_row_after_the_vehicle_advisory_lock()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));
        var updateRoute = program[
            program.IndexOf("backOffice.MapPut(\"/loans/{id:guid}\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapGet(\"/deliveries\"", StringComparison.Ordinal)];
        const string advisoryLock = "await using var loanTransaction = await DeliveryConcurrencyLock.BeginVehiclesAsync";
        const string trackedReload = "var existingLoan = await db.LoanApplications.FirstOrDefaultAsync(item => item.Id == id);";
        const string applyUpdate = "db.Entry(existingLoan).CurrentValues.SetValues(loan);";

        Assert.Contains(advisoryLock, updateRoute);
        Assert.Contains(trackedReload, updateRoute);
        Assert.DoesNotContain("var existingLoan = await db.LoanApplications.AsNoTracking()", updateRoute);
        Assert.True(
            updateRoute.IndexOf(advisoryLock, StringComparison.Ordinal) < updateRoute.IndexOf(trackedReload, StringComparison.Ordinal) &&
            updateRoute.IndexOf(trackedReload, StringComparison.Ordinal) < updateRoute.IndexOf(applyUpdate, StringComparison.Ordinal),
            "The row updated through CurrentValues must be tracked after the advisory lock so SaveChanges persists the requested transition.");
    }

    [Fact]
    public void Finance_v2_routes_are_server_owned_authorized_and_serialize_money_transitions()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));
        var seed = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Data", "SeedData.cs"));

        Assert.Contains("backOffice.MapPost(\"/payments/finance-sale\"", program);
        Assert.Contains("backOffice.MapPost(\"/payments/{id:guid}/nett-price-override/approve\"", program);
        Assert.Contains("backOffice.MapPost(\"/payments/{id:guid}/collections\"", program);
        Assert.Contains("backOffice.MapPost(\"/collection-transactions/{id:guid}/reconcile\"", program);
        Assert.Contains("backOffice.MapPost(\"/collection-transactions/{id:guid}/reverse\"", program);
        Assert.Contains("FOR UPDATE", program);
        Assert.Contains("RequireAuthorization(\"BossAdmin\")", program);
        Assert.Contains("IX_PaymentRecords_VehicleId_FinanceV2", seed);
        Assert.Contains("WHERE \"FinanceWorkflowVersion\" = 2", seed);
        Assert.Contains("IX_CollectionTransactions_PaymentRecordId_IdempotencyKey", seed);
        Assert.Contains("UX_CollectionTransactions_ActiveMethod_NormalizedReference", seed);
        Assert.Contains("WHERE \"NormalizedReference\" IS NOT NULL AND \"Status\" <> 2", seed);
        Assert.Contains("LockCollectionReferenceAsync", program);
        Assert.Contains("collection_reconcile_self_approval_forbidden", File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Features", "FinanceV2.cs")));
        Assert.Contains("collection_evidence_required", File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Features", "FinanceV2.cs")));
        Assert.Contains("finance.invoicePdfDownloaded", program);
    }

    [Fact]
    public void Finance_receivable_creation_and_buyer_links_are_serialized_and_collection_evidence_is_scoped()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));
        var seed = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Data", "SeedData.cs"));
        var legacyCreate = program[program.IndexOf("backOffice.MapPost(\"/payments\"", StringComparison.Ordinal)..program.IndexOf("backOffice.MapPut(\"/payments/{id:guid}\"", StringComparison.Ordinal)];
        var v2Create = program[program.IndexOf("backOffice.MapPost(\"/payments/finance-sale\"", StringComparison.Ordinal)..program.IndexOf("backOffice.MapPost(\"/payments/{id:guid}/nett-price-override/approve\"", StringComparison.Ordinal)];

        Assert.Contains("FinanceApi.LockVehicleAsync", legacyCreate);
        Assert.Contains("ValidateReceivableCreate", legacyCreate);
        Assert.Contains("FinanceApi.LockVehicleAsync", v2Create);
        Assert.Contains("ValidateReceivableCreate", v2Create);
        Assert.Contains("finance_v2_buyer_locked", program);
        Assert.Contains("CollectionTransactionId", program);
        Assert.Contains("collection_document_link_invalid", program);
        Assert.Contains("IX_DocumentBlobs_CollectionTransactionId", seed);
    }

    [Fact]
    public void Ocr_usage_is_reserved_before_the_external_provider_is_called()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));

        Assert.True(
            program.IndexOf("aiUsageQuota.ReserveOcrAsync", StringComparison.Ordinal) < program.IndexOf("extractor.AnalyzeAsync", StringComparison.Ordinal),
            "OCR usage must be reserved before the external OCR provider is called.");
    }

    [Fact]
    public void Google_document_ai_is_the_only_registered_runtime_ocr_provider()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));

        Assert.Contains("AddScoped<IOcrExtractor>(services => services.GetRequiredService<GoogleDocumentAiExtractor>())", program);
        Assert.DoesNotContain("LocalMockOcrExtractor", program);
        Assert.DoesNotContain("BaiduUnlimitedOcrExtractor", program);
        Assert.DoesNotContain("Ocr:Provider", program);
    }

    [Fact]
    public void Vehicle_intake_requires_and_atomically_persists_validated_seller_identity_evidence()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));
        var seed = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Data", "SeedData.cs"));
        var intakeRoute = program[program.IndexOf("backOffice.MapPost(\"/vehicle-intakes\"", StringComparison.Ordinal)..program.IndexOf("backOffice.MapPost(\"/vehicles\"", StringComparison.Ordinal)];

        Assert.Contains("form.Files.GetFile(\"identityCard\")", intakeRoute);
        Assert.Contains("UploadPolicy.ValidateOcrImageContent", intakeRoute);
        Assert.Contains("db.DocumentBlobs.Add(identityCardDocument)", intakeRoute);
        Assert.True(
            intakeRoute.IndexOf("db.DocumentBlobs.Add(identityCardDocument)", StringComparison.Ordinal) < intakeRoute.IndexOf("await db.SaveChangesAsync(cancellationToken)", StringComparison.Ordinal),
            "The seller NRIC must be attached before the intake transaction is saved.");
        Assert.Contains("UX_Owners_NormalizedIcNumber", seed);
    }

    [Fact]
    public void Dashboard_ai_document_processing_remains_aggregate_and_boss_admin_only()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));
        var dashboardRoute = program[program.IndexOf("backOffice.MapGet(\"/dashboard/summary\"", StringComparison.Ordinal)..program.IndexOf("backOffice.MapGet(\"/dashboard/reminders\"", StringComparison.Ordinal)];

        Assert.Contains("AiDocumentProcessingMetrics.Create", dashboardRoute);
        Assert.Contains("AiDocumentProcessing = aiDocumentProcessing", dashboardRoute);
        Assert.Contains("}).RequireAuthorization(\"Dashboard\");", dashboardRoute);
        Assert.DoesNotContain("ResultJson", dashboardRoute);
        Assert.DoesNotContain("DocumentBlob", dashboardRoute);
    }

    [Fact]
    public void Api_reference_paths_match_minimal_api_routes()
    {
        var root = FindRepositoryRoot();
        var apiDocs = File.ReadAllText(Path.Combine(root, "docs", "API.md"));
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));

        var documentedPaths = ExtractDocumentedPaths(apiDocs).ToArray();
        var mappedRoutes = ExtractMappedRoutes(program).ToHashSet();
        var implicitIdentityRoutes = new HashSet<string> { NormalizeRoute("/api/auth/login") };

        var missing = documentedPaths
            .Where(path => !mappedRoutes.Contains(path) && !implicitIdentityRoutes.Contains(path))
            .Order()
            .ToArray();

        Assert.True(
            missing.Length == 0,
            $"Documented API path(s) are not mapped in Program.cs: {string.Join(", ", missing)}");
    }

    [Fact]
    public void Api_reference_documents_shared_calendar_and_terminal_collection_evidence_rules()
    {
        var apiDocs = File.ReadAllText(Path.Combine(FindRepositoryRoot(), "docs", "API.md"));
        var calendar = ExtractMarkdownSection(apiDocs, "## Shared Operations Calendar");

        Assert.Contains("`/api/operations-calendar?from=YYYY-MM-DD&to=YYYY-MM-DD`", calendar);
        Assert.Contains("at most 93 days", calendar);
        Assert.Contains("`status`", calendar);
        Assert.Contains("Busy events have null time and status", calendar);
        Assert.Contains("Delivery API authorization is unchanged", calendar);
        Assert.Contains("locked collection is `Pending`", apiDocs);
        var payment = new PaymentRecord { VehicleId = Guid.NewGuid() };
        var collection = new CollectionTransaction { PaymentRecordId = payment.Id, Status = CollectionStatus.Reconciled };
        var statusError = Assert.Single(FinanceV2Rules.ValidateCollectionDocumentUpload(payment, collection, payment.VehicleId, payment.Id).Errors);
        Assert.Contains($"`{statusError.Code}`", apiDocs);
        Assert.Contains("Previously uploaded evidence remains readable", apiDocs);
        Assert.Contains("Windscreen expiry is not release-critical", apiDocs);
        Assert.Contains("`WindscreenPolicy` is optional historical evidence", apiDocs);
        Assert.DoesNotContain("expiry blockers for insurance, road tax, or windscreen insurance", apiDocs);
    }

    [Fact]
    public void Vehicle_photo_delete_is_authorized_composite_scoped_audited_and_documented()
    {
        var root = FindRepositoryRoot();
        var apiDocs = File.ReadAllText(Path.Combine(root, "docs", "API.md"));
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));
        var routeStart = program.IndexOf("backOffice.MapDelete(\"/vehicles/{id:guid}/photos/{photoId:guid}\"", StringComparison.Ordinal);
        var routeEnd = program.IndexOf("backOffice.MapGet(\"/vehicles/{id:guid}/photos\"", routeStart, StringComparison.Ordinal);
        Assert.True(routeStart >= 0 && routeEnd > routeStart, "The scoped vehicle photo DELETE route must remain next to the photo routes.");
        var route = program[routeStart..routeEnd];

        Assert.Contains("item.VehicleId == id && item.Id == photoId", route);
        Assert.Contains("RequireAuthorization(\"Vehicles\")", route);
        Assert.Contains("db.VehiclePhotos.Remove(photo)", route);
        Assert.Contains("ApiAudit.Add(db, context.User, \"vehicle.photo.deleted\", nameof(VehiclePhoto), photo.Id)", route);
        Assert.Equal(1, route.Split("await db.SaveChangesAsync()", StringSplitOptions.None).Length - 1);
        Assert.Contains("vehicle_photo_not_found", route);
        Assert.Contains("| `DELETE` | `/api/vehicles/{id}/photos/{photoId}` | `Vehicles` |", apiDocs);
    }

    [Fact]
    public void Api_reference_enum_values_match_domain_models()
    {
        var root = FindRepositoryRoot();
        var apiDocs = File.ReadAllText(Path.Combine(root, "docs", "API.md"));

        AssertDocumentedEnum<StockOwner>(apiDocs);
        AssertDocumentedEnum<VehicleStatus>(apiDocs);
        AssertDocumentedEnum<LeadStatus>(apiDocs);
        AssertDocumentedEnum<LoanStatus>(apiDocs);
        AssertDocumentedEnum<DeliveryStatus>(apiDocs);
        AssertDocumentedEnum<PaymentStatus>(apiDocs);
        AssertDocumentedEnum<CollectionStatus>(apiDocs);
        AssertDocumentedEnum<CollectionMethod>(apiDocs);
        AssertDocumentedEnum<FinancingStatus>(apiDocs);
        AssertDocumentedEnum<ReceivableStatus>(apiDocs);
        AssertDocumentedEnum<PaymentVoucherStatus>(apiDocs);
        AssertDocumentedEnum<CashHandoverStatus>(apiDocs);
        AssertDocumentedEnum<DebtRecoveryStatus>(apiDocs);
        AssertDocumentedEnum<FileCategory>(apiDocs);
        AssertDocumentedEnum<OcrJobStatus>(apiDocs);
        AssertDocumentedEnum<OcrReviewDecision>(apiDocs);
        AssertDocumentedEnum<AiService>(apiDocs);
        AssertDocumentedEnum<AiUsageStatus>(apiDocs);
        AssertDocumentedEnum<HrEmploymentType>(apiDocs);
        AssertDocumentedEnum<HrAttendanceVerificationMethod>(apiDocs);
    }

    [Fact]
    public void Finance_v2_routes_evidence_and_delivery_ownership_are_documented_and_server_enforced()
    {
        var root = FindRepositoryRoot();
        var apiDocs = File.ReadAllText(Path.Combine(root, "docs", "API.md"));
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));
        var businessRules = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Features", "BusinessRules.cs"));
        var deliveryWorkboard = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Features", "DeliveryWorkboard.cs"));

        Assert.Contains("backOffice.MapPost(\"/payments/finance-sale\"", program);
        Assert.Contains("backOffice.MapPost(\"/payments/{id:guid}/collections\"", program);
        Assert.Contains("backOffice.MapPost(\"/collection-transactions/{id:guid}/reconcile\"", program);
        Assert.Contains("Guid? collectionTransactionId", program);
        Assert.Contains("ValidateCollectionEvidenceContent", program);
        Assert.Contains("PdfDocument.Open", businessRules);
        Assert.Contains("ParsingOptions.LenientParsingOff", businessRules);
        Assert.Contains("var deliveries = await db.DeliverySchedules.AsNoTracking()", program);
        Assert.Matches(new Regex(@"WorkflowStatusRules\.ApplyWorkflowStatus\(\s*vehicle,\s*loans,\s*allPayments,\s*deliveries,\s*invoice is null \? \[\] : \[invoice\],\s*collections\)"), program);
        Assert.Contains("FinanceClearanceRules.ClearedVehicleIds(payments, financeInvoices, collections)", program);
        Assert.True(Regex.Matches(program, @"FinanceClearanceRules\.IsVehicleCleared\(delivery\.VehicleId, payments, financeInvoices, collections\)").Count >= 2);
        Assert.Contains("FinanceClearanceRules.ClearedVehicleIds(paymentList, financeInvoices ?? [], collections ?? [])", deliveryWorkboard);
        Assert.Matches(new Regex(@"SalesWorkboardRules\.Create\(\s*selectedAgentIds,[\s\S]*?financeInvoices:\s*financeInvoices,\s*collections:\s*collections\)"), program);
        Assert.Contains("Finance V2 uses one receivable per vehicle", apiDocs);
        Assert.Contains("Creating the receivable locks the buyer identity", apiDocs);
        Assert.Contains("First-deploy assumption", apiDocs);
        Assert.Contains("A vehicle becomes `Sold` only when that Finance clearance and a released delivery are both present.", apiDocs);
    }

    [Fact]
    public void Finance_v2_download_receivable_buyer_and_delivery_invoice_boundaries_are_server_enforced()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));

        var vehicleUpdateRoute = program[
            program.IndexOf("backOffice.MapPut(\"/vehicles/{id:guid}\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapGet(\"/vehicles/{id:guid}/stock-movements\"", StringComparison.Ordinal)];
        Assert.Contains("DeliveryConcurrencyLock.BeginVehiclesAsync(db, [id])", vehicleUpdateRoute);
        Assert.Contains("FinanceV2Rules.ValidateReceivableBuyer", vehicleUpdateRoute);

        var correctBuyerRoute = program[
            program.IndexOf("backOffice.MapPost(\"/deliveries/{id:guid}/correct-buyer\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPost(\"/deliveries/{id:guid}/request-invoice-update\"", StringComparison.Ordinal)];
        Assert.Contains("DeliveryConcurrencyLock.BeginDeliveryAsync", correctBuyerRoute);
        Assert.Contains("FinanceV2Rules.ValidateReceivableBuyer", correctBuyerRoute);

        var requestInvoiceUpdateRoute = program[
            program.IndexOf("backOffice.MapPost(\"/deliveries/{id:guid}/request-invoice-update\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPost(\"/deliveries/{id:guid}/resolve-invoice-update\"", StringComparison.Ordinal)];
        Assert.Contains("DeliveryConcurrencyLock.BeginDeliveryAsync", requestInvoiceUpdateRoute);
        Assert.Contains("FinanceV2Rules.ValidateDeliveryInvoiceUpdateBoundary", requestInvoiceUpdateRoute);

        var resolveInvoiceUpdateRoute = program[
            program.IndexOf("backOffice.MapPost(\"/deliveries/{id:guid}/resolve-invoice-update\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapGet(\"/repairs\"", StringComparison.Ordinal)];
        Assert.Contains("DeliveryConcurrencyLock.BeginDeliveryAsync", resolveInvoiceUpdateRoute);
        Assert.Contains("DeliveryWorkboardRules.HasOpenInvoiceUpdateRequest(delivery)", resolveInvoiceUpdateRoute);
        Assert.Contains("FinanceV2Rules.ValidateDeliveryInvoiceUpdateBoundary", resolveInvoiceUpdateRoute);

        var legacyPaymentUpdateRoute = program[
            program.IndexOf("backOffice.MapPut(\"/payments/{id:guid}\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPost(\"/payments/{id:guid}/management-review\"", StringComparison.Ordinal)];
        Assert.Contains("FinanceV2Rules.PreserveServerOwnedFields(existingPayment, payment)", legacyPaymentUpdateRoute);

        var invoiceDownloadRoute = program[
            program.IndexOf("backOffice.MapGet(\"/finance-invoices/{invoiceId:guid}/content\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapGet(\"/settlement-reminders\"", StringComparison.Ordinal)];
        var auditIndex = invoiceDownloadRoute.IndexOf("finance.invoiceDownloaded", StringComparison.Ordinal);
        var saveIndex = invoiceDownloadRoute.IndexOf("await db.SaveChangesAsync();", StringComparison.Ordinal);
        var fileIndex = invoiceDownloadRoute.IndexOf("return Results.File", StringComparison.Ordinal);
        Assert.True(auditIndex >= 0 && auditIndex < saveIndex && saveIndex < fileIndex);
        Assert.Contains("}).RequireAuthorization(\"Finance\");", invoiceDownloadRoute);

        var invoiceIssueMethod = program[
            program.IndexOf("public static async Task<FinanceInvoiceIssueResult> IssueInvoiceAsync", StringComparison.Ordinal)..
            program.IndexOf("public static async Task<object> ApplyCollectionMutationAsync", StringComparison.Ordinal)];
        var deliveryGuardIndex = invoiceIssueMethod.IndexOf("ValidateInvoiceIssuanceDeliveryState", StringComparison.Ordinal);
        var existingInvoiceReturnIndex = invoiceIssueMethod.IndexOf("if (existingInvoice is not null)", StringComparison.Ordinal);
        Assert.True(deliveryGuardIndex >= 0 && deliveryGuardIndex < existingInvoiceReturnIndex);
    }

    [Fact]
    public void Finance_vehicle_options_are_minimal_and_finance_authorized()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));
        var financeV2 = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Features", "FinanceV2.cs"));

        var route = program[
            program.IndexOf("backOffice.MapGet(\"/finance/vehicle-options\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPost(\"/vehicles\"", StringComparison.Ordinal)];
        Assert.Contains("FinanceVehicleOptions.ToResponse", route);
        Assert.Contains("RequireAuthorization(\"Finance\")", route);

        var responseContract = financeV2[
            financeV2.IndexOf("public sealed record FinanceVehicleOptionResponse", StringComparison.Ordinal)..
            financeV2.IndexOf("public static class FinanceVehicleOptions", StringComparison.Ordinal)];
        Assert.Contains("decimal SellingPrice", responseContract);
        Assert.Contains("decimal AdditionalCharges", responseContract);
        Assert.DoesNotContain("PurchasePrice", responseContract);
        Assert.DoesNotContain("RefurbishmentTotal", responseContract);
        Assert.DoesNotContain("StockOwner", responseContract);
    }

    [Fact]
    public void Production_startup_ensures_additive_finance_and_repair_receipt_schema_when_seed_data_is_disabled()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));
        var seedData = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Data", "SeedData.cs"));
        var startup = program[
            program.IndexOf("var seedDataEnabled", StringComparison.Ordinal)..
            program.IndexOf("app.Run();", StringComparison.Ordinal)];

        Assert.Contains("else", startup);
        Assert.Contains("await SeedData.EnsureFinanceV2SchemaAsync(app);", startup);
        Assert.Contains("await SeedData.EnsureFinanceRepairEnhancementSchemaAsync(app);", startup);
        Assert.Contains("await SeedData.EnsureRepairReceiptSchemaAsync(app);", startup);
        Assert.Contains("await SeedData.EnsureDeliveryWorkboardSchemaAsync(app);", startup);
        Assert.Contains("public static async Task EnsureFinanceV2SchemaAsync(WebApplication app)", seedData);
        Assert.Contains("await EnsureFinanceV2SchemaAsync(db);", seedData);
        Assert.Contains("public static async Task EnsureFinanceRepairEnhancementSchemaAsync(WebApplication app)", seedData);
        Assert.Contains("await EnsureFinanceRepairEnhancementSchemaAsync(db);", seedData);
        Assert.Contains("public static async Task EnsureRepairReceiptSchemaAsync(WebApplication app)", seedData);
        Assert.Contains("await EnsureRepairReceiptSchemaAsync(db);", seedData);
        Assert.Contains("ALTER TABLE \"SettlementReminders\" ADD COLUMN IF NOT EXISTS \"Direction\"", seedData);
        Assert.Contains("ALTER TABLE \"SettlementReminders\" ADD COLUMN IF NOT EXISTS \"PurchasePriceSnapshot\"", seedData);
        Assert.Contains("ALTER TABLE \"SettlementReminders\" ADD COLUMN IF NOT EXISTS \"BankDebtAmount\"", seedData);
    }

    [Fact]
    public void Settlement_status_and_ocr_repair_receipt_retries_are_snapshot_checked_and_idempotent_only_when_equivalent()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));
        var businessRules = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Features", "BusinessRules.cs"));

        var settlementStatusRoute = program[
            program.IndexOf("backOffice.MapPost(\"/settlement-reminders/{id:guid}/status\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPut(\"/settlement-reminders/{id:guid}\"", StringComparison.Ordinal)];
        Assert.Contains("SettlementStatusUpdateRequest", settlementStatusRoute);
        Assert.Contains("DeliveryConcurrencyLock.BeginVehiclesAsync", settlementStatusRoute);
        Assert.Contains("SettlementRules.MatchesExpectedSnapshot", settlementStatusRoute);
        Assert.Contains("request.ExpectedIsPaid", settlementStatusRoute);
        Assert.Contains("request.IsPaid == existing.IsPaid", settlementStatusRoute);
        Assert.DoesNotContain("request.BankDebtAmount", settlementStatusRoute);
        Assert.DoesNotContain("request.Deadline", settlementStatusRoute);
        Assert.Contains("public sealed record SettlementStatusUpdateRequest", businessRules);

        var ocrReviewRoute = program[
            program.IndexOf("backOffice.MapPut(\"/ocr-jobs/{jobId:guid}/review\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapGet(\"/vehicles/{id:guid}/ocr-jobs\"", StringComparison.Ordinal)];
        Assert.Contains("DeliveryConcurrencyLock.BeginOcrJobAsync", ocrReviewRoute);
        Assert.Contains("OcrReviewRetryRules.MatchesSavedReview", ocrReviewRoute);
        Assert.True(
            ocrReviewRoute.IndexOf("OcrReviewRetryRules.MatchesSavedReview", StringComparison.Ordinal) <
            ocrReviewRoute.IndexOf("ApiAudit.Add(db, context.User, \"document.ocr.reviewed\"", StringComparison.Ordinal));

        var receiptRoute = program[
            program.IndexOf("backOffice.MapPost(\"/repairs/{id:guid}/receipts/confirm\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapGet(\"/suppliers\"", StringComparison.Ordinal)];
        Assert.Contains("DeliveryConcurrencyLock.BeginVehiclesAsync", receiptRoute);
        Assert.Contains("RepairReceiptRules.MatchesSavedReceipt", receiptRoute);
        Assert.True(
            receiptRoute.IndexOf("RepairReceiptRules.MatchesSavedReceipt", StringComparison.Ordinal) <
            receiptRoute.IndexOf("ApiAudit.Add(db, context.User, \"repairReceipt.confirmed\"", StringComparison.Ordinal));
        Assert.Contains("public static class OcrReviewRetryRules", businessRules);
        Assert.Contains("public static bool MatchesSavedReceipt", businessRules);

        var createFromReceiptRoute = program[
            program.IndexOf("backOffice.MapPost(\"/repairs/from-receipt\"", StringComparison.Ordinal)..
            program.IndexOf("backOffice.MapPut(\"/repairs/{id:guid}\"", StringComparison.Ordinal)];
        Assert.Contains("DeliveryConcurrencyLock.BeginRepairReceiptAsync", createFromReceiptRoute);
        Assert.Contains("RepairReceiptRules.MatchesSavedCreate", createFromReceiptRoute);
        Assert.True(
            createFromReceiptRoute.IndexOf("RepairReceiptRules.MatchesSavedCreate", StringComparison.Ordinal) <
            createFromReceiptRoute.IndexOf("ApiAudit.Add(db, context.User, \"repair.created\"", StringComparison.Ordinal));
    }

    [Fact]
    public void Hr_workforce_routes_keep_calendar_private_and_attendance_proxy_bound()
    {
        var root = FindRepositoryRoot();
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));

        Assert.Contains("hr.MapGet(\"/boss-calendar\"", program);
        Assert.Contains("if (!DepartmentAccess.IsBossAdmin(context.User)) return Results.Forbid();", program);
        Assert.Contains("new HrCalendarAvailability(leave.StaffUserId, names.GetValueOrDefault(leave.StaffUserId, \"Staff\"), day)", program);
        Assert.Contains("app.UseForwardedHeaders();", program);
        Assert.Contains("options.ForwardLimit = 1;", program);
        Assert.Contains("FindMatchingAttendanceNetwork(context.Connection.RemoteIpAddress", program);
        Assert.Contains("if (string.IsNullOrWhiteSpace(attendance.Notes))", program);
        Assert.Contains("if (string.Equals(StaffIdentity.CurrentUserId(context), existing.StaffUserId, StringComparison.Ordinal)) return Results.Forbid();", program);
    }

    [Fact]
    public void Api_reference_role_policies_match_authorization_setup()
    {
        var root = FindRepositoryRoot();
        var apiDocs = File.ReadAllText(Path.Combine(root, "docs", "API.md"));
        var program = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Program.cs"));
        var businessRules = File.ReadAllText(Path.Combine(root, "services", "api", "src", "YSHeng.Api", "Features", "BusinessRules.cs"));

        var documentedPolicies = ExtractDocumentedPolicies(apiDocs);
        var configuredPolicies = ExtractConfiguredPolicies(program, businessRules);

        Assert.Equal(
            configuredPolicies.Keys.Order(),
            documentedPolicies.Keys.Order());

        foreach (var (policy, roles) in configuredPolicies)
        {
            Assert.True(
                documentedPolicies.TryGetValue(policy, out var documentedRoles),
                $"docs/API.md is missing the {policy} policy.");
            Assert.True(
                roles.SequenceEqual(documentedRoles),
                $"{policy} roles in docs/API.md differ from Program.cs. Expected: {string.Join(", ", roles)}. Documented: {string.Join(", ", documentedRoles ?? [])}.");
        }
    }

    [Fact]
    public void Api_reference_document_upload_ownership_matches_department_access()
    {
        var root = FindRepositoryRoot();
        var apiDocs = File.ReadAllText(Path.Combine(root, "docs", "API.md"));
        var documentedOwnership = ExtractDocumentUploadOwnership(apiDocs);
        var expectedOwnership = Enum.GetValues<FileCategory>()
            .Where(category => category != FileCategory.VehiclePhoto)
            .ToDictionary(
                category => category.ToString(),
                category => SeedData.Roles
                    .Where(role => DepartmentAccess.CanUploadDocument([role], category))
                    .ToArray(),
                StringComparer.Ordinal);

        Assert.Equal(
            expectedOwnership.Keys.Order(),
            documentedOwnership.Keys.Order());

        foreach (var (category, roles) in expectedOwnership)
        {
            Assert.True(
                documentedOwnership.TryGetValue(category, out var documentedRoles),
                $"docs/API.md is missing document upload ownership for {category}.");
            Assert.True(
                roles.SequenceEqual(documentedRoles),
                $"{category} upload roles in docs/API.md differ from DepartmentAccess.CanUploadDocument. Expected: {string.Join(", ", roles)}. Documented: {string.Join(", ", documentedRoles ?? [])}.");
        }
    }

    private static IEnumerable<string> ExtractDocumentedPaths(string apiDocs)
    {
        var pathPattern = new Regex(@"`(?<path>/(?:health|api)[^`]*)`", RegexOptions.Compiled);
        return pathPattern.Matches(apiDocs)
            .Select(match => match.Groups["path"].Value)
            .Where(path => !path.Contains("*", StringComparison.Ordinal))
            .Where(path => path != "/api/auth")
            .Select(path => path.Split('?')[0])
            .Select(NormalizeRoute)
            .Distinct();
    }

    private static IEnumerable<string> ExtractMappedRoutes(string program)
    {
        foreach (Match match in Regex.Matches(program, @"app\.Map(?:Get|Post|Put|Delete)\(""(?<path>/[^""]+)"""))
        {
            yield return NormalizeRoute(match.Groups["path"].Value);
        }

        foreach (Match match in Regex.Matches(program, @"backOffice\.Map(?:Get|Post|Put|Delete)\(""(?<path>/[^""]+)"""))
        {
            yield return NormalizeRoute($"/api{match.Groups["path"].Value}");
        }

        foreach (Match match in Regex.Matches(program, @"admin\.Map(?:Get|Post|Put|Delete)\(""(?<path>/[^""]+)"""))
        {
            yield return NormalizeRoute($"/api/admin{match.Groups["path"].Value}");
        }

        foreach (Match match in Regex.Matches(program, @"hr\.Map(?:Get|Post|Put|Delete)\(""(?<path>/[^""]+)"""))
        {
            yield return NormalizeRoute($"/api/hr{match.Groups["path"].Value}");
        }
    }

    private static void AssertDocumentedEnum<TEnum>(string apiDocs) where TEnum : struct, Enum
    {
        var enumName = typeof(TEnum).Name;
        var expectedValues = Enum.GetNames<TEnum>();
        var documentedValues = ExtractDocumentedEnumValues(apiDocs, enumName);

        Assert.True(
            expectedValues.SequenceEqual(documentedValues),
            $"{enumName} values in docs/API.md differ from Domain/Models.cs. Expected: {string.Join(", ", expectedValues)}. Documented: {string.Join(", ", documentedValues)}.");
    }

    private static string[] ExtractDocumentedEnumValues(string apiDocs, string enumName)
    {
        var pattern = new Regex(@"^- `" + Regex.Escape(enumName) + @"`: (?<values>.+)$", RegexOptions.Compiled | RegexOptions.Multiline);
        var match = pattern.Match(apiDocs);

        Assert.True(match.Success, $"docs/API.md is missing the {enumName} enum values line.");

        return Regex.Matches(match.Groups["values"].Value, @"`(?<value>[^`]+)`")
            .Select(valueMatch => valueMatch.Groups["value"].Value)
            .ToArray();
    }

    private static Dictionary<string, string[]> ExtractDocumentedPolicies(string apiDocs)
    {
        var policies = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var section = ExtractMarkdownSection(apiDocs, "## Back-Office Role Policies");
        var rowPattern = new Regex(@"^\| `(?<policy>[^`]+)` \| (?<roles>.+) \|\s*$", RegexOptions.Compiled | RegexOptions.Multiline);

        foreach (Match match in rowPattern.Matches(section))
        {
            var roles = Regex.Matches(match.Groups["roles"].Value, @"`(?<role>[^`]+)`")
                .Select(roleMatch => roleMatch.Groups["role"].Value)
                .ToArray();

            if (roles.Length > 0)
            {
                policies[match.Groups["policy"].Value] = roles;
            }
        }

        return policies;
    }

    private static string ExtractMarkdownSection(string markdown, string heading)
    {
        var start = markdown.IndexOf(heading, StringComparison.Ordinal);
        Assert.True(start >= 0, $"docs/API.md is missing the {heading} section.");

        var nextHeading = markdown.IndexOf("\n## ", start + heading.Length, StringComparison.Ordinal);
        return nextHeading >= 0 ? markdown[start..nextHeading] : markdown[start..];
    }

    private static Dictionary<string, string[]> ExtractDocumentUploadOwnership(string apiDocs)
    {
        var section = ExtractMarkdownSubsection(apiDocs, "Document upload ownership:");
        var ownership = new Dictionary<string, string[]>(StringComparer.Ordinal);
        var rowPattern = new Regex(@"^\| (?<categories>.+) \| (?<roles>.+) \|\s*$", RegexOptions.Compiled | RegexOptions.Multiline);

        foreach (Match match in rowPattern.Matches(section))
        {
            var categories = Regex.Matches(match.Groups["categories"].Value, @"`(?<category>[^`]+)`")
                .Select(categoryMatch => categoryMatch.Groups["category"].Value)
                .ToArray();
            var roles = Regex.Matches(match.Groups["roles"].Value, @"`(?<role>[^`]+)`")
                .Select(roleMatch => roleMatch.Groups["role"].Value)
                .ToArray();

            foreach (var category in categories)
            {
                ownership[category] = roles;
            }
        }

        return ownership;
    }

    private static string ExtractMarkdownSubsection(string markdown, string marker)
    {
        var start = markdown.IndexOf(marker, StringComparison.Ordinal);
        Assert.True(start >= 0, $"docs/API.md is missing the {marker} subsection.");

        var nextHeading = markdown.IndexOf("\n## ", start + marker.Length, StringComparison.Ordinal);
        return nextHeading >= 0 ? markdown[start..nextHeading] : markdown[start..];
    }

    private static Dictionary<string, string[]> ExtractConfiguredPolicies(string program, string businessRules)
    {
        return new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["BossAdmin"] = ExtractRequireRoleValues(program, "BossAdmin"),
            ["Dashboard"] = ExtractRequireRoleValues(program, "Dashboard"),
            ["Vehicles"] = ExtractRequireRoleValues(program, "Vehicles", businessRules),
            ["VehicleRead"] = ExtractRequireRoleValues(program, "VehicleRead", businessRules),
            ["CustomerRead"] = ExtractRequireRoleValues(program, "CustomerRead", businessRules),
            ["CustomerProfile"] = ExtractRequireRoleValues(program, "CustomerProfile", businessRules),
            ["OwnerRead"] = ExtractRequireRoleValues(program, "OwnerRead", businessRules),
            ["Sales"] = ExtractRequireRoleValues(program, "Sales"),
            ["Repairs"] = ExtractRequireRoleValues(program, "Repairs"),
            ["Loans"] = ExtractRequireRoleValues(program, "Loans"),
            ["Deliveries"] = ExtractRequireRoleValues(program, "Deliveries"),
            ["Finance"] = ExtractRequireRoleValues(program, "Finance", businessRules),
            ["CashCustody"] = ExtractRequireRoleValues(program, "CashCustody"),
            ["HrSalary"] = ExtractRequireRoleValues(program, "HrSalary", businessRules)
        };
    }

    private static string[] ExtractRequireRoleValues(string program, string policy, string? businessRules = null)
    {
        var pattern = new Regex(@"options\.AddPolicy\(""" + Regex.Escape(policy) + @""", policy => policy\.RequireRole\((?<roles>[^)]+)\)\);", RegexOptions.Compiled);
        var match = pattern.Match(program);

        Assert.True(match.Success, $"Program.cs is missing the {policy} policy.");

        return ExtractRolesExpressionValues(match.Groups["roles"].Value, businessRules);
    }

    private static string[] ExtractRolesExpressionValues(string expression, string? businessRules)
    {
        var directRoles = Regex.Matches(expression, @"""(?<role>[^""]+)""")
            .Select(match => match.Groups["role"].Value)
            .ToArray();

        if (directRoles.Length > 0)
        {
            return directRoles;
        }

        if (businessRules is null)
        {
            return [];
        }

        var accessMatch = Regex.Match(expression, @"DepartmentAccess\.(?<member>[A-Za-z]+)");
        if (accessMatch.Success)
        {
            return ExtractStringArrayMember(businessRules, accessMatch.Groups["member"].Value);
        }

        return [];
    }

    private static string[] ExtractStringArrayMember(string source, string memberName)
    {
        var pattern = new Regex(@"public static readonly string\[\] " + Regex.Escape(memberName) + @" = \[(?<values>[^\]]+)\];", RegexOptions.Compiled);
        var match = pattern.Match(source);

        Assert.True(match.Success, $"BusinessRules.cs is missing DepartmentAccess.{memberName}.");

        return Regex.Matches(match.Groups["values"].Value, @"""(?<value>[^""]+)""")
            .Select(valueMatch => valueMatch.Groups["value"].Value)
            .ToArray();
    }

    private static string NormalizeRoute(string route)
    {
        var withoutEscapedPipes = route.Replace(@"\|", "|", StringComparison.Ordinal);
        return Regex.Replace(withoutEscapedPipes, @"\{[^}]+\}", "{}", RegexOptions.Compiled);
    }

    private static string FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null)
        {
            if (File.Exists(Path.Combine(directory.FullName, "docs", "API.md")) &&
                File.Exists(Path.Combine(directory.FullName, "services", "api", "src", "YSHeng.Api", "Program.cs")))
            {
                return directory.FullName;
            }

            directory = directory.Parent;
        }

        throw new InvalidOperationException("Could not locate repository root from test output directory.");
    }
}
