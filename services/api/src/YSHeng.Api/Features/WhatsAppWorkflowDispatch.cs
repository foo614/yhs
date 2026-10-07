using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

// Converts committed source events, never an HTTP request preview, to staff notifications.
public static class WhatsAppWorkflowDispatch
{
    public static async Task<int> EnqueueAsync(AppDbContext db, WhatsAppAssistantOptions assistant,
        long now, CancellationToken ct = default)
    {
        if (!assistant.Ready) return 0;
        var enabled = await db.WhatsAppStaffNotificationPolicies.AsNoTracking().Where(row => row.Enabled)
            .Select(row => row.Category).ToArrayAsync(ct);
        var events = await db.WhatsAppWorkflowEvents.AsNoTracking().Where(row => row.State == "Pending" &&
            row.ResolvedAt == null && row.ExpiresAt > now && enabled.Contains(row.Category))
            .OrderBy(row => row.CreatedAt).ThenBy(row => row.Id).ToListAsync(ct);
        var bindings = await db.WhatsAppStaffBindings.AsNoTracking().Where(row => row.RevokedAt == null && row.VerifiedAt > 0)
            .ToListAsync(ct);
        var staged = 0;
        foreach (var source in events)
        {
            var vehicle = await db.Vehicles.AsNoTracking().SingleOrDefaultAsync(row => row.Id == source.VehicleId, ct);
            if (vehicle is null) continue;
            foreach (var binding in bindings)
            {
                if (source.RequiredRole == "Sales" && source.TargetUserId != binding.StaffUserId) continue;
                var resolved = await WhatsAppStaffBindings.ResolveAsync(db, assistant, binding.Id, now, ct);
                if (resolved is null || !await WhatsAppWorkflowEvents.CurrentFactsAsync(db, source, binding.StaffUserId, now, ct)) continue;
                var body = WhatsAppWorkflowEvents.RenderBody(source, vehicle, binding.Language);
                if (!ValidBody(body)) continue;
                var key = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"staff|workflow|{source.Id:N}|{binding.StaffUserId}")));
                if (await db.WhatsAppOutbox.AnyAsync(row => row.IdempotencyKey == key, ct)) continue;
                var row = new WhatsAppOutbox
                {
                    IdempotencyKey = key, Audience = "Staff", StaffBindingId = binding.Id, StaffUserId = binding.StaffUserId,
                    Recipient = binding.Recipient, RequiredStaffRole = source.RequiredRole, MessageKind = source.Category,
                    BusinessEventKey = $"workflow:{source.Id:N}", BusinessEventVersion = source.SourceVersion,
                    EventKind = "staff.notification", TemplateVersion = "staff_notice_v1", TemplateReference = body,
                    Body = body, Language = binding.Language, State = "Queued", CreatedAt = now,
                    ScheduledAt = source.CreatedAt, NextAttemptAt = now, ExpiresAt = source.ExpiresAt
                };
                db.WhatsAppOutbox.Add(row);
                db.AuditLogs.Add(new AuditLog { Actor = "whatsapp-workflow", Action = "whatsapp.workflow.queued",
                    EntityName = nameof(WhatsAppOutbox), EntityId = row.Id });
                try { await db.SaveChangesAsync(ct); staged++; }
                catch (DbUpdateException)
                {
                    db.ChangeTracker.Clear();
                    if (!await db.WhatsAppOutbox.AnyAsync(item => item.IdempotencyKey == key, ct)) throw;
                }
            }
        }
        return staged;
    }

    public static async Task<string?> RefreshAsync(AppDbContext db, WhatsAppOutbox row, long now, CancellationToken ct = default)
    {
        if (row.Audience != "Staff" || row.StaffUserId is null || row.ExpiresAt <= now ||
            !row.BusinessEventKey.StartsWith("workflow:", StringComparison.Ordinal) ||
            !Guid.TryParseExact(row.BusinessEventKey[9..], "N", out var id)) return null;
        var source = await db.WhatsAppWorkflowEvents.AsNoTracking().SingleOrDefaultAsync(item => item.Id == id, ct);
        if (source is null || source.Category != row.MessageKind || source.RequiredRole != row.RequiredStaffRole ||
            source.SourceVersion != row.BusinessEventVersion ||
            !await WhatsAppWorkflowEvents.CurrentFactsAsync(db, source, row.StaffUserId, now, ct)) return null;
        var vehicle = await db.Vehicles.AsNoTracking().SingleAsync(item => item.Id == source.VehicleId, ct);
        var body = WhatsAppWorkflowEvents.RenderBody(source, vehicle, row.Language);
        return ValidBody(body) ? body : null;
    }

    private static bool ValidBody(string body) => !string.IsNullOrWhiteSpace(body) && body.Length <= 1024 && !body.Any(char.IsControl);
}
