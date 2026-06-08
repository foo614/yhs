using System.Text.RegularExpressions;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;
using YSHeng.Api.Features;
using Xunit;

namespace YSHeng.Api.Tests;

public sealed class ApiDocumentationTests
{
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
        AssertDocumentedEnum<PaymentVoucherStatus>(apiDocs);
        AssertDocumentedEnum<DebtRecoveryStatus>(apiDocs);
        AssertDocumentedEnum<FileCategory>(apiDocs);
        AssertDocumentedEnum<OcrJobStatus>(apiDocs);
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
        var rowPattern = new Regex(@"^\| `(?<policy>[^`]+)` \| (?<roles>.+) \|$", RegexOptions.Compiled | RegexOptions.Multiline);

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
        var rowPattern = new Regex(@"^\| (?<categories>.+) \| (?<roles>.+) \|$", RegexOptions.Compiled | RegexOptions.Multiline);

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
            ["OwnerRead"] = ExtractRequireRoleValues(program, "OwnerRead", businessRules),
            ["Sales"] = ExtractRequireRoleValues(program, "Sales"),
            ["Repairs"] = ExtractRequireRoleValues(program, "Repairs"),
            ["Loans"] = ExtractRequireRoleValues(program, "Loans"),
            ["Deliveries"] = ExtractRequireRoleValues(program, "Deliveries"),
            ["Finance"] = ExtractRequireRoleValues(program, "Finance", businessRules),
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
