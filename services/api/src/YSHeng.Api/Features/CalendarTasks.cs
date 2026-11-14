using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record CalendarTaskRequest(
    string Title,
    string? Description,
    DateOnly StartDate,
    DateOnly EndDate,
    string AssignedToUserId);

public sealed record CalendarTaskStatusRequest(CalendarTaskStatus Status);

public sealed record CalendarTaskNotificationEvent(
    string EventType,
    Guid TaskId,
    string Title,
    string AssignedToUserId,
    string AssignedToName,
    DateOnly StartDate,
    DateOnly EndDate);

public static class CalendarTaskRules
{
    public static string? Validate(CalendarTaskRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Trim().Length > 160)
            return "Task title is required and must be at most 160 characters.";
        if (request.Description?.Length > 2000)
            return "Task description must be at most 2,000 characters.";
        if (request.EndDate < request.StartDate)
            return "Task end date must be on or after the start date.";
        if (request.EndDate.DayNumber - request.StartDate.DayNumber > 366)
            return "Task timeline cannot be longer than 367 days.";
        if (string.IsNullOrWhiteSpace(request.AssignedToUserId))
            return "Select an active staff member to assign the task.";
        return null;
    }

    public static bool CanManage(ClaimsPrincipal principal) => principal.IsInRole("BossAdmin");

    public static bool CanReadTask(CalendarTask task, ClaimsPrincipal principal, string? currentUserId)
        => principal.IsInRole("BossAdmin") ||
           (!string.IsNullOrWhiteSpace(currentUserId) && task.AssignedToUserId == currentUserId);

    public static bool IsSupportedStatus(CalendarTaskStatus status)
        => status is CalendarTaskStatus.Open or CalendarTaskStatus.Done or CalendarTaskStatus.Cancelled;

    public static async Task<AppUser?> ResolveActiveAssigneeAsync(UserManager<AppUser> userManager, string userId)
    {
        if (string.IsNullOrWhiteSpace(userId)) return null;
        var user = await userManager.FindByIdAsync(userId.Trim());
        if (user is null || user.LockoutEnd is not null && user.LockoutEnd > DateTimeOffset.UtcNow) return null;
        var roles = await userManager.GetRolesAsync(user);
        return roles.Intersect(SeedData.Roles, StringComparer.Ordinal).Any() ? user : null;
    }

    public static CalendarTaskNotificationEvent ToNotificationEvent(CalendarTask task)
        => new("calendar.task.created", task.Id, task.Title, task.AssignedToUserId, task.AssignedToName,
            task.StartDate, task.EndDate);
}
