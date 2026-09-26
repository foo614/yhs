using System.Globalization;
using System.Text.Json;

namespace YSHeng.Api.Features;

// Reads only the existing anonymous public inventory. No staff identity or private API access.
public static class WhatsAppPublicInventory
{
    public static string Format(JsonElement vehicles, string query = "")
    {
        if (vehicles.ValueKind != JsonValueKind.Array) throw new JsonException();
        var terms = query.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var available = vehicles.EnumerateArray().Where(v =>
            v.TryGetProperty("status", out var status) && status.GetString() == "Available")
            .Where(v => terms.All(term =>
                $"{Field(v, "plateNumber")} {Field(v, "make")} {Field(v, "model")}".Contains(term, StringComparison.OrdinalIgnoreCase)))
            .ToArray();
        var lines = available.Take(5).Select(v =>
            $"{Field(v, "year")} {Field(v, "make")} {Field(v, "model")} | {Field(v, "plateNumber")} | RM {v.GetProperty("sellingPrice").GetDecimal().ToString("N0", CultureInfo.InvariantCulture)}");
        return $"YS Heng public inventory: {available.Length} available (showing up to 5)\n" +
            (available.Length == 0 ? "No matching publicly listed vehicles are currently available." : string.Join("\n", lines));
    }

    private static string Field(JsonElement item, string name)
    {
        var text = item.GetProperty(name).ToString();
        return new string(text.Where(c => !char.IsControl(c)).Take(80).ToArray());
    }
}
