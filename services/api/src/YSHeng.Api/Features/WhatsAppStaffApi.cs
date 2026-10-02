using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;

namespace YSHeng.Api.Features;

public sealed record WhatsAppStaffConnectRequest(string Recipient, string Language, bool ConsentConfirmed, string? StaffUserId = null);
public sealed record WhatsAppStaffDisconnectRequest(string? StaffUserId = null);

public static class WhatsAppStaffApi
{
    private static async Task<string?> ManagedUserAsync(HttpContext context, AppDbContext db, string? target, CancellationToken ct)
    {
        var actor = StaffIdentity.CurrentUserId(context);
        if (string.IsNullOrWhiteSpace(actor) || target?.Length > 128) return null;
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(item => item.Id == actor, ct);
        if (!WhatsAppStaffBindings.Active(user, DateTimeOffset.UtcNow.ToUnixTimeSeconds())) return null;
        var roles = await WhatsAppStaffBindings.RolesAsync(db, actor, ct);
        if (roles.Length == 0) return null;
        if (string.IsNullOrWhiteSpace(target) || target == actor) return actor;
        return roles.Contains("BossAdmin") ? target : null;
    }

    public static async Task<IResult> StatusAsync(HttpContext context, AppDbContext db, WhatsAppAssistantOptions options, string? staffUserId, CancellationToken ct)
    {
        context.Response.Headers.CacheControl = "no-store";
        var user = await ManagedUserAsync(context, db, staffUserId, ct);
        if (user is null) return Results.Forbid();
        return Results.Ok(await WhatsAppStaffBindings.StatusAsync(db, options, user, DateTimeOffset.UtcNow.ToUnixTimeSeconds(), ct));
    }

    public static async Task<IResult> ConnectAsync(HttpContext context, AppDbContext db, WhatsAppAssistantOptions options, WhatsAppStaffConnectRequest request, CancellationToken ct)
    {
        context.Response.Headers.CacheControl = "no-store";
        var user = await ManagedUserAsync(context, db, request.StaffUserId, ct);
        if (user is null) return Results.Forbid();
        if (!options.Ready) return Results.Conflict(new ApiError("WhatsApp staff queries are disabled."));
        try
        {
            var link = await WhatsAppStaffBindings.IssueAsync(db, options, user,
                new(request.Recipient, request.Language, request.ConsentConfirmed), StaffIdentity.CurrentUserId(context), DateTimeOffset.UtcNow.ToUnixTimeSeconds(), ct);
            return Results.Ok(link);
        }
        catch (ArgumentException exception) { return Results.BadRequest(new ApiError(exception.Message)); }
        catch (DbUpdateException) { return Results.Conflict(new ApiError("The connection changed. Refresh its status before trying again.")); }
    }

    public static async Task<IResult> DisconnectAsync(HttpContext context, AppDbContext db, WhatsAppAssistantOptions options, WhatsAppStaffDisconnectRequest request, CancellationToken ct)
    {
        context.Response.Headers.CacheControl = "no-store";
        var user = await ManagedUserAsync(context, db, request.StaffUserId, ct);
        if (user is null) return Results.Forbid();
        if (!options.Ready) return Results.Conflict(new ApiError("WhatsApp staff queries are disabled."));
        await WhatsAppStaffBindings.RevokeAsync(db, user, StaffIdentity.CurrentUserId(context), DateTimeOffset.UtcNow.ToUnixTimeSeconds(), ct);
        return Results.Ok(new { message = "WhatsApp disconnected. Queued queries were suppressed." });
    }
}
