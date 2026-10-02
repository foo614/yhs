using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public sealed record WhatsAppStockFilter(string Search, decimal? MaximumPrice, int Page)
{
    public const int PageSize = 5;

    public string CommandArgument
    {
        get
        {
            var parts = new List<string>();
            if (Search.Length > 0) parts.Add(Search);
            if (MaximumPrice is { } maximum) parts.Add("under " + maximum.ToString("0.##", CultureInfo.InvariantCulture));
            if (Page > 1) parts.Add("page " + Page.ToString(CultureInfo.InvariantCulture));
            return string.Join(" ", parts);
        }
    }
}

public sealed record WhatsAppDeliveryFilter(string Period, int Page)
{
    public const int PageSize = 5;

    public string CommandArgument => Period + (Page > 1 ? " page " + Page.ToString(CultureInfo.InvariantCulture) : "");
}

public static class WhatsAppStaffSalesQueries
{
    private static readonly Regex PageSuffix = new(@"(?:\A|\s+)page\s+(?<page>[0-9]{1,4})\s*\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex BudgetSuffix = new(@"(?:\A|\s+)under\s+(?<amount>[0-9]{1,9}(?:\.[0-9]{1,2})?)\s*\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex StandalonePage = new(@"(?:\A|\s)page(?:\s|\z)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);
    private static readonly Regex StandaloneBudget = new(@"(?:\A|\s)under(?:\s|\z)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public static bool TryParseStock(string value, out WhatsAppStockFilter filter)
    {
        filter = new("", null, 1);
        var argument = value.Trim();
        var page = 1;
        var pageMatch = PageSuffix.Match(argument);
        if (pageMatch.Success)
        {
            if (!int.TryParse(pageMatch.Groups["page"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out page) || page is < 1 or > 1000)
                return false;
            argument = argument[..pageMatch.Index].TrimEnd();
        }
        else if (StandalonePage.IsMatch(argument))
        {
            return false;
        }

        decimal? maximumPrice = null;
        var budgetMatch = BudgetSuffix.Match(argument);
        if (budgetMatch.Success)
        {
            if (!decimal.TryParse(budgetMatch.Groups["amount"].Value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var maximum) || maximum <= 0)
                return false;
            maximumPrice = maximum;
            argument = argument[..budgetMatch.Index].TrimEnd();
        }
        else if (StandaloneBudget.IsMatch(argument))
        {
            return false;
        }

        if (StandalonePage.IsMatch(argument) || StandaloneBudget.IsMatch(argument))
            return false;

        var search = NormalizeSearch(argument);
        if (search is null || search.Length > 80) return false;
        filter = new(search, maximumPrice, page);
        return filter.CommandArgument.Length <= 114;
    }

    public static bool TryParseDeliveries(string value, out WhatsAppDeliveryFilter filter)
    {
        filter = new("", 1);
        var argument = value.Trim();
        var page = 1;
        var pageMatch = PageSuffix.Match(argument);
        if (pageMatch.Success)
        {
            if (!int.TryParse(pageMatch.Groups["page"].Value, NumberStyles.None, CultureInfo.InvariantCulture, out page) || page is < 1 or > 1000)
                return false;
            argument = argument[..pageMatch.Index].TrimEnd();
        }
        else if (StandalonePage.IsMatch(argument))
        {
            return false;
        }

        var period = argument.ToLowerInvariant() switch
        {
            "today" => "today",
            "tomorrow" => "tomorrow",
            "next7" or "next 7" => "next 7",
            _ => ""
        };
        if (period.Length == 0) return false;
        filter = new(period, page);
        return true;
    }

    public static IQueryable<Vehicle> ApplyStockFilter(IQueryable<Vehicle> vehicles, WhatsAppStockFilter filter)
    {
        foreach (var token in filter.Search.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var fieldToken = token.ToUpperInvariant();
            var compactToken = Compact(fieldToken);
            vehicles = vehicles.Where(item => item.PlateNumber.ToUpper().Contains(fieldToken) ||
                item.Make.ToUpper().Contains(fieldToken) || item.Model.ToUpper().Contains(fieldToken) ||
                item.PlateNumber.ToUpper().Replace(" ", "").Replace("-", "").Contains(compactToken));
        }

        if (filter.MaximumPrice is { } maximumPrice)
            vehicles = vehicles.Where(item => item.SellingPrice > 0 && item.SellingPrice <= maximumPrice);
        return vehicles;
    }

    public static string Price(decimal price, string language) => price > 0
        ? "RM " + price.ToString(decimal.Truncate(price) == price ? "N0" : "N2", CultureInfo.InvariantCulture)
        : WhatsAppStaffQueries.Text(language, "Price on request", "Harga atas permintaan");

    public static string Location(string location, string language) => string.IsNullOrWhiteSpace(location)
        ? WhatsAppStaffQueries.Text(language, "Location not set", "Lokasi belum ditetapkan")
        : Clean(location);

    public static bool TryBuildPublicListingUrl(string? publicSiteUrl, Guid vehicleId, out string url)
    {
        url = "";
        if (string.IsNullOrWhiteSpace(publicSiteUrl) || publicSiteUrl.Length > 512 || !Uri.TryCreate(publicSiteUrl.Trim(), UriKind.Absolute, out var baseUri) ||
            baseUri.Scheme != Uri.UriSchemeHttps || baseUri.Host.Length == 0 || baseUri.UserInfo.Length > 0 ||
            baseUri.Port != 443 || baseUri.Query.Length > 0 || baseUri.Fragment.Length > 0 || baseUri.AbsolutePath != "/" || !IsPublicHost(baseUri.Host))
            return false;

        var builder = new UriBuilder(baseUri) { Path = "/vehicles/" + vehicleId.ToString("D", CultureInfo.InvariantCulture), Query = "", Fragment = "" };
        url = builder.Uri.AbsoluteUri;
        return true;
    }

    public static string Clean(string value)
    {
        var cleaned = Regex.Replace(value, @"[\p{C}\s]+", " ").Trim();
        return cleaned[..Math.Min(80, cleaned.Length)];
    }

    private static string? NormalizeSearch(string value)
    {
        var search = Regex.Replace(value, @"\s+", " ").Trim();
        if (search.Length == 0) return "";
        var tokens = search.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length > 8 || tokens.Any(token => token.Length > 40 || !token.Any(char.IsLetterOrDigit))) return null;
        return string.Join(' ', tokens);
    }

    private static string Compact(string value) => value.Replace(" ", "", StringComparison.Ordinal).Replace("-", "", StringComparison.Ordinal);

    private static bool IsPublicHost(string host)
    {
        var normalized = host.TrimEnd('.').ToLowerInvariant();
        if (normalized is "localhost" || normalized.EndsWith(".localhost", StringComparison.Ordinal) ||
            normalized.EndsWith(".local", StringComparison.Ordinal) || normalized.EndsWith(".internal", StringComparison.Ordinal) ||
            normalized.EndsWith(".lan", StringComparison.Ordinal) || normalized.EndsWith(".home", StringComparison.Ordinal) ||
            normalized.EndsWith(".test", StringComparison.Ordinal) || normalized.EndsWith(".invalid", StringComparison.Ordinal))
            return false;
        return normalized.Length <= 253 && normalized.Contains('.') && Uri.CheckHostName(normalized) == UriHostNameType.Dns;
    }
}
