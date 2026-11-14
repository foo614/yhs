using System.Security.Claims;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record BrokerDealPriceRequest(decimal Amount);

public static class BrokerDealPriceRules
{
    public static string? Validate(BrokerDealPriceRequest request)
        => request.Amount > 0 && request.Amount <= 10_000_000m
            ? null
            : "Actual deal price must be greater than RM0 and no more than RM10,000,000.";

    public static bool CanUpdate(Vehicle vehicle, ClaimsPrincipal principal, string actorUserId)
        => principal.IsInRole("Sales") &&
           !principal.IsInRole("BossAdmin") &&
           !string.IsNullOrWhiteSpace(actorUserId) &&
           string.Equals(vehicle.SalesAgentUserId, actorUserId, StringComparison.Ordinal);
}
