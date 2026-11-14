using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text.Json;

namespace YSHeng.Api.Features;

public sealed record WhatsAppDownloadedMedia(byte[] Content, string MimeType, string FileName);

public sealed class WhatsAppMediaClient : IDisposable
{
    private readonly HttpClient client;
    public WhatsAppMediaClient() : this(new HttpClientHandler { AllowAutoRedirect = false }) { }
    public WhatsAppMediaClient(HttpMessageHandler handler) => client = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(20) };
    public void Dispose() => client.Dispose();
    public static bool ValidId(string value) => value.Length is > 0 and <= 80 && value.All(char.IsAsciiDigit);
    public static bool AllowedDownload(Uri uri) => uri.Scheme == "https" && uri.IsDefaultPort && uri.UserInfo.Length == 0 && uri.Fragment.Length == 0 &&
        uri.Host.Equals("lookaside.fbsbx.com", StringComparison.OrdinalIgnoreCase) && uri.AbsolutePath.StartsWith("/whatsapp_business/attachments/", StringComparison.Ordinal);

    public async Task<WhatsAppDownloadedMedia?> DownloadAsync(WhatsAppAssistantOptions options, string mediaId, CancellationToken ct)
    {
        if (!options.Ready || !ValidId(mediaId)) return null;
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(40));
        ct = deadline.Token;
        try
        {
            using var metadataRequest = new HttpRequestMessage(HttpMethod.Get, $"https://graph.facebook.com/{options.GraphApiVersion}/{mediaId}?phone_number_id={options.PhoneNumberId}");
            metadataRequest.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.AccessToken);
            using var response = await client.SendAsync(metadataRequest, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!response.IsSuccessStatusCode) return null;
            var metadata = await ReadBoundedAsync(response.Content, 16384, ct);
            if (metadata is null) return null;
            using var json = JsonDocument.Parse(metadata);
            var root = json.RootElement;
            if (!root.TryGetProperty("id", out var id) || id.GetString() != mediaId || !root.TryGetProperty("url", out var url) ||
                !Uri.TryCreate(url.GetString(), UriKind.Absolute, out var uri) || !AllowedDownload(uri) ||
                !root.TryGetProperty("file_size", out var size) || !size.TryGetInt64(out var bytes) || bytes is <= 0 or > 10 * 1024 * 1024 ||
                !root.TryGetProperty("mime_type", out var mimeNode) || !root.TryGetProperty("sha256", out var checksum)) return null;
            var mime = mimeNode.GetString();
            if (mime is not ("application/pdf" or "image/jpeg" or "image/png")) return null;
            using var download = new HttpRequestMessage(HttpMethod.Get, uri);
            download.Headers.Authorization = new AuthenticationHeaderValue("Bearer", options.AccessToken);
            using var fileResponse = await client.SendAsync(download, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!fileResponse.IsSuccessStatusCode) return null;
            var content = await ReadBoundedAsync(fileResponse.Content, 10 * 1024 * 1024, ct);
            if (content is null || content.LongLength != bytes) return null;
            var digest = SHA256.HashData(content);
            var hash = checksum.GetString();
            if (!string.Equals(Convert.ToHexString(digest), hash, StringComparison.OrdinalIgnoreCase) && Convert.ToBase64String(digest) != hash) return null;
            return new(content, mime, "document" + (mime == "application/pdf" ? ".pdf" : mime == "image/png" ? ".png" : ".jpg"));
        }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException or JsonException or InvalidOperationException or IOException) { return null; }
    }
    private static async Task<byte[]?> ReadBoundedAsync(HttpContent content, int limit, CancellationToken ct)
    {
        if (content.Headers.ContentLength > limit) return null;
        await using var stream = await content.ReadAsStreamAsync(ct);
        using var buffer = new MemoryStream();
        var chunk = new byte[8192];
        int count;
        while ((count = await stream.ReadAsync(chunk, ct)) > 0)
        {
            if (buffer.Length + count > limit) return null;
            buffer.Write(chunk, 0, count);
        }
        return buffer.ToArray();
    }
}
