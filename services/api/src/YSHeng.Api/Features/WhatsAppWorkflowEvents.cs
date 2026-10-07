using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

// Source events are captured with the source transaction. FOO-200 owns conversion to bound-staff outbox rows.
public static class WhatsAppWorkflowEvents
{
    public const string Intake = "VehicleIntakeSaved";
    public const string PublicationRequest = "PublicationApprovalRequested";
    public const string DeliveryRelease = "DeliveryReleased";
    public const string InvoiceUpdateRequest = "DeliveryInvoiceUpdateRequested";
    public const string ReceiptSaved = "FinanceReceiptSaved";
    public const string ReceiptUpdated = "FinanceReceiptUpdated";
    public const string ReceiptEvidence = "FinanceReceiptEvidenceUploaded";
    public const string OfficialReceiptIssued = "FinanceOfficialReceiptIssued";
    public const string OfficialReceiptVoided = "FinanceOfficialReceiptVoided";

    public static async Task EnsureSchemaAsync(WebApplication app)
    {
        using var scope = app.Services.CreateScope();
        await EnsureSchemaAsync(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public static async Task EnsureSchemaAsync(AppDbContext db, CancellationToken ct = default)
    {
        if (!db.Database.IsNpgsql()) throw new InvalidOperationException("Workflow event schema setup requires PostgreSQL.");
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "WhatsAppWorkflowEvents" (
                "Id" uuid PRIMARY KEY, "EventKey" text NOT NULL, "Category" text NOT NULL,
                "EventKind" text NOT NULL, "SourceId" uuid NOT NULL, "SourceVersion" integer NOT NULL,
                "VehicleId" uuid NOT NULL, "RequiredRole" text NOT NULL, "TargetUserId" text NULL,
                "Summary" text NOT NULL, "State" text NOT NULL, "Diagnostic" text NULL,
                "CreatedAt" bigint NOT NULL, "ExpiresAt" bigint NOT NULL, "ResolvedAt" bigint NULL, "StagedAt" bigint NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_WhatsAppWorkflowEvents_EventKey" ON "WhatsAppWorkflowEvents"("EventKey");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_WhatsAppWorkflowEvents_EventKind_SourceId_SourceVersion"
                ON "WhatsAppWorkflowEvents"("EventKind", "SourceId", "SourceVersion");
            CREATE INDEX IF NOT EXISTS "IX_WhatsAppWorkflowEvents_State_CreatedAt"
                ON "WhatsAppWorkflowEvents"("State", "CreatedAt");
            """, ct);
    }

    public static async Task<WhatsAppWorkflowEvent?> StageAsync(AppDbContext db, string kind, Guid sourceId,
        int version, Vehicle vehicle, string actor, long now, CancellationToken ct = default)
    {
        if (sourceId == Guid.Empty || vehicle.Id == Guid.Empty || version < 1 || !Descriptions.TryGetValue(kind, out var description))
            throw new ArgumentException("Invalid workflow event.");
        var key = $"{kind}:{sourceId:N}:{version}";
        var local = db.WhatsAppWorkflowEvents.Local.SingleOrDefault(item => item.EventKey == key);
        if (local is not null) return local;
        var existing = await db.WhatsAppWorkflowEvents.AsNoTracking().SingleOrDefaultAsync(item => item.EventKey == key, ct);
        if (existing is not null) return existing;
        var target = description.Role == "Sales" ? vehicle.SalesAgentUserId : null;
        string? diagnostic = null;
        if (description.Role == "Sales")
        {
            if (string.IsNullOrWhiteSpace(target)) diagnostic = "No canonical Sales user is assigned to this vehicle.";
            else
            {
                var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(item => item.Id == target, ct);
                if (!WhatsAppStaffBindings.Active(user, now) || !(await WhatsAppStaffBindings.RolesAsync(db, target, ct)).Contains("Sales"))
                    diagnostic = "The canonical Sales assignee is inactive or lacks the Sales role.";
            }
        }
        var row = new WhatsAppWorkflowEvent
        {
            EventKey = key, Category = description.Category, EventKind = kind, SourceId = sourceId,
            SourceVersion = version, VehicleId = vehicle.Id, RequiredRole = description.Role,
            TargetUserId = target, Summary = $"Vehicle {vehicle.PlateNumber}: {description.Text}",
            Diagnostic = diagnostic, CreatedAt = now, ExpiresAt = now + 86400
        };
        db.WhatsAppWorkflowEvents.Add(row);
        db.AuditLogs.Add(new AuditLog { Actor = actor, Action = "whatsapp.workflow.captured", EntityName = nameof(WhatsAppWorkflowEvent), EntityId = row.Id });
        return row;
    }

    public static async Task<int> NextVersionAsync(AppDbContext db, string kind, Guid sourceId, CancellationToken ct = default) =>
        (await db.WhatsAppWorkflowEvents.AsNoTracking().Where(item => item.EventKind == kind && item.SourceId == sourceId)
            .Select(item => (int?)item.SourceVersion).MaxAsync(ct) ?? 0) + 1;

    public static async Task<bool> CurrentFactsAsync(AppDbContext db, WhatsAppWorkflowEvent item,
        string staffUserId, long now, CancellationToken ct = default)
    {
        if (!Descriptions.TryGetValue(item.EventKind, out var description) ||
            description.Role != item.RequiredRole || description.Category != item.Category ||
            item.State != "Pending" || item.ResolvedAt is not null || item.ExpiresAt <= now) return false;
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(row => row.Id == staffUserId, ct);
        if (!WhatsAppStaffBindings.Active(user, now) ||
            !(await WhatsAppStaffBindings.RolesAsync(db, staffUserId, ct)).Contains(item.RequiredRole)) return false;
        var vehicle = await db.Vehicles.AsNoTracking().SingleOrDefaultAsync(row => row.Id == item.VehicleId, ct);
        if (vehicle is null || item.RequiredRole == "Sales" &&
            (item.TargetUserId != staffUserId || vehicle.SalesAgentUserId != staffUserId)) return false;
        return item.EventKind switch
        {
            Intake => item.SourceId == vehicle.Id,
            PublicationRequest => item.SourceId == vehicle.Id && !vehicle.BossConfirmed && !vehicle.IsPublic &&
                vehicle.Status == VehicleStatus.Available,
            DeliveryRelease => await db.DeliverySchedules.AsNoTracking().AnyAsync(row => row.Id == item.SourceId &&
                row.VehicleId == vehicle.Id && row.Status == DeliveryStatus.Released && row.ReleasedAt != null, ct),
            InvoiceUpdateRequest => await db.DeliverySchedules.AsNoTracking().AnyAsync(row => row.Id == item.SourceId &&
                row.VehicleId == vehicle.Id && row.InvoiceUpdateRequestedAt != null && row.InvoiceUpdateResolvedAt == null, ct),
            ReceiptSaved or ReceiptUpdated => await db.PaymentRecords.AsNoTracking().AnyAsync(row => row.Id == item.SourceId &&
                row.VehicleId == vehicle.Id && row.ReceiptNumber != null && row.ReceiptNumber != "", ct),
            ReceiptEvidence => await db.DocumentBlobs.AsNoTracking().AnyAsync(row => row.Id == item.SourceId &&
                row.VehicleId == vehicle.Id && row.PaymentRecordId != null &&
                (row.Category == FileCategory.PaymentReceipt || row.Category == FileCategory.PaymentInvoice), ct),
            OfficialReceiptIssued => await db.OfficialReceipts.AsNoTracking().AnyAsync(row => row.Id == item.SourceId &&
                !row.IsVoided && db.PaymentRecords.Any(payment => payment.Id == row.PaymentRecordId && payment.VehicleId == vehicle.Id), ct),
            OfficialReceiptVoided => await db.OfficialReceipts.AsNoTracking().AnyAsync(row => row.Id == item.SourceId &&
                row.IsVoided && db.PaymentRecords.Any(payment => payment.Id == row.PaymentRecordId && payment.VehicleId == vehicle.Id), ct),
            _ => false
        };
    }

    public static Task<int> ResolvePublicationAsync(AppDbContext db, Guid vehicleId, long now, CancellationToken ct = default) =>
        db.WhatsAppWorkflowEvents.Where(row => row.EventKind == PublicationRequest && row.SourceId == vehicleId && row.ResolvedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.ResolvedAt, now), ct);

    public static Task<int> ResolveInvoiceUpdateAsync(AppDbContext db, Guid deliveryId, long now, CancellationToken ct = default) =>
        db.WhatsAppWorkflowEvents.Where(row => row.EventKind == InvoiceUpdateRequest && row.SourceId == deliveryId && row.ResolvedAt == null)
            .ExecuteUpdateAsync(set => set.SetProperty(row => row.ResolvedAt, now), ct);

    public static Task<bool> HasOpenPublicationRequestAsync(AppDbContext db, Guid vehicleId, long now, CancellationToken ct = default) =>
        db.WhatsAppWorkflowEvents.AsNoTracking().AnyAsync(row => row.EventKind == PublicationRequest &&
            row.SourceId == vehicleId && row.ResolvedAt == null && row.ExpiresAt > now, ct);

    public static string RenderBody(WhatsAppWorkflowEvent item, Vehicle vehicle, string language)
    {
        if (item.VehicleId != vehicle.Id || !Descriptions.ContainsKey(item.EventKind))
            throw new ArgumentException("Workflow event does not match the vehicle.");
        var plate = new string(vehicle.PlateNumber.Where(character => char.IsLetterOrDigit(character) || character is '-' or ' ').ToArray()).Trim();
        if (plate.Length > 24) plate = plate[..24];
        if (plate.Length == 0) plate = "—";
        var malay = language.StartsWith("ms", StringComparison.OrdinalIgnoreCase);
        var copy = malay ? MalayCopy[item.EventKind] : Descriptions[item.EventKind].Text;
        return malay ? $"Kenderaan {plate}: {copy}" : $"Vehicle {plate}: {copy}";
    }

    private static readonly IReadOnlyDictionary<string, string> MalayCopy = new Dictionary<string, string>
    {
        [Intake] = "rekod kemasukan baharu disimpan; semak kenderaan dalam portal.",
        [PublicationRequest] = "kelulusan penyenaraian laman web diminta; semak dalam portal.",
        [DeliveryRelease] = "penyerahan kenderaan telah dilepaskan selepas serahan selesai.",
        [InvoiceUpdateRequest] = "kemas kini invois penyerahan diminta; semak dalam portal.",
        [ReceiptSaved] = "rujukan resit direkodkan; ini bukan pengesahan bayaran selesai.",
        [ReceiptUpdated] = "rujukan resit dikemas kini; semak status bayaran semasa dalam portal.",
        [ReceiptEvidence] = "bukti bayaran dimuat naik; penyelarasan masih tindakan Finance yang berasingan.",
        [OfficialReceiptIssued] = "resit rasmi dikeluarkan; semak status bayaran semasa dalam portal.",
        [OfficialReceiptVoided] = "resit rasmi dibatalkan; semak status semasa dalam portal."
    };

    private static readonly IReadOnlyDictionary<string, (string Category, string Role, string Text)> Descriptions =
        new Dictionary<string, (string, string, string)>
        {
            [Intake] = ("VehicleEvent", "BossAdmin", "new intake saved; review the vehicle in the portal."),
            [PublicationRequest] = ("VehicleEvent", "BossAdmin", "website listing approval requested; review in the portal."),
            [DeliveryRelease] = ("DeliveryEvent", "BossAdmin", "delivery released after completed handover."),
            [InvoiceUpdateRequest] = ("DeliveryEvent", "BossAdmin", "delivery invoice update requested; review in the portal."),
            [ReceiptSaved] = ("FinanceEvent", "Sales", "receipt reference recorded; payment clearance is not implied."),
            [ReceiptUpdated] = ("FinanceEvent", "Sales", "receipt reference updated; check current payment status in the portal."),
            [ReceiptEvidence] = ("FinanceEvent", "Sales", "payment evidence uploaded; reconciliation is still a separate Finance action."),
            [OfficialReceiptIssued] = ("FinanceEvent", "Sales", "official receipt issued; check current payment status in the portal."),
            [OfficialReceiptVoided] = ("FinanceEvent", "Sales", "official receipt voided; check the current status in the portal.")
        };
}
