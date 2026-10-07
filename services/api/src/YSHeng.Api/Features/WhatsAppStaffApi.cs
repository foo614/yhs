using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;

namespace YSHeng.Api.Features;

public sealed record WhatsAppStaffConnectRequest(string Recipient, string Language, bool ConsentConfirmed, string? StaffUserId = null,
    bool ManualLink = false);
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
        => await StatusAsync(context, db, options, null, staffUserId, ct);

    public static async Task<IResult> StatusAsync(HttpContext context, AppDbContext db, WhatsAppAssistantOptions options,
        WhatsAppDispatchOptions? dispatch, string? staffUserId, CancellationToken ct)
    {
        context.Response.Headers.CacheControl = "no-store";
        var user = await ManagedUserAsync(context, db, staffUserId, ct);
        if (user is null) return Results.Forbid();
        return Results.Ok(await WhatsAppStaffBindings.StatusAsync(db, options, user, DateTimeOffset.UtcNow.ToUnixTimeSeconds(), ct, dispatch));
    }

    public static async Task<IResult> ConnectAsync(HttpContext context, AppDbContext db, WhatsAppAssistantOptions options, WhatsAppStaffConnectRequest request, CancellationToken ct)
        => await ConnectAsync(context, db, options, null, request, ct);

    public static async Task<IResult> ConnectAsync(HttpContext context, AppDbContext db, WhatsAppAssistantOptions options,
        WhatsAppDispatchOptions? dispatch, WhatsAppStaffConnectRequest request, CancellationToken ct)
    {
        context.Response.Headers.CacheControl = "no-store";
        var user = await ManagedUserAsync(context, db, request.StaffUserId, ct);
        if (user is null) return Results.Forbid();
        if (!options.Ready) return Results.Conflict(new ApiError("WhatsApp staff queries are disabled."));
        if (request.ManualLink && (!options.HasBusinessDisplayNumber ||
            WhatsAppStaffBindings.AnyInvitationReady(options, dispatch)))
            return Results.Conflict(new ApiError("Manual linking is unavailable while an invitation can be sent or the business number is not configured."));
        if (!request.ManualLink && dispatch is not null && !dispatch.InvitationReady)
            return Results.Conflict(new ApiError("Staff invitation sending is not enabled or its approved template is unavailable."));
        try
        {
            var link = await WhatsAppStaffBindings.IssueAsync(db, options, user,
                new(request.Recipient, request.Language, request.ConsentConfirmed, request.ManualLink),
                StaffIdentity.CurrentUserId(context), DateTimeOffset.UtcNow.ToUnixTimeSeconds(), ct, dispatch);
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

    public static async Task<IResult> ResendInvitationAsync(HttpContext context, AppDbContext db, WhatsAppAssistantOptions options,
        WhatsAppDispatchOptions dispatch, WhatsAppStaffDisconnectRequest request, CancellationToken ct)
    {
        context.Response.Headers.CacheControl = "no-store";
        var user = await ManagedUserAsync(context, db, request.StaffUserId, ct);
        if (user is null) return Results.Forbid();
        try
        {
            await WhatsAppStaffInvitation.ResendAsync(db, options, dispatch, user, StaffIdentity.CurrentUserId(context),
                DateTimeOffset.UtcNow.ToUnixTimeSeconds(), ct);
            return Results.Ok(new { message = "Invitation queued. The one-time command is unchanged." });
        }
        catch (ArgumentException exception) { return Results.Conflict(new ApiError(exception.Message)); }
    }
}
