using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using YSHeng.Api.Features;
using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;

var builder = WebApplication.CreateBuilder(Array.Empty<string>());
builder.Configuration.AddUserSecrets<WhatsAppProbeSecrets>(optional: true);
// Avoid logging verification tokens from query strings or any incoming message payload.
builder.Logging.ClearProviders();
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = WhatsAppWebhookProbe.MaxBodyBytes);
builder.WebHost.UseUrls("http://127.0.0.1:5099");
var config = builder.Configuration.GetSection("WhatsApp");
var secret = config["AppSecret"] ?? "";
var verifyToken = config["VerifyToken"] ?? "";
var recipient = config["TestRecipient"] ?? "";
var phoneId = config["PhoneNumberId"] ?? "";
var accessToken = config["AccessToken"] ?? "";
var version = config["GraphApiVersion"] ?? "";
if (string.IsNullOrWhiteSpace(secret) || verifyToken.Length < 32 ||
    !Regex.IsMatch(recipient, @"\A[1-9][0-9]{7,14}\z") || !Regex.IsMatch(phoneId, @"\A[0-9]{1,32}\z") ||
    !Regex.IsMatch(version, @"\Av[0-9]{1,3}\.0\z") || string.IsNullOrWhiteSpace(accessToken))
{
    Console.WriteLine("Probe not started: configure AppSecret, VerifyToken, TestRecipient, PhoneNumberId, GraphApiVersion and AccessToken in user secrets.");
    return;
}

using var sender = new WhatsAppTestSender();
using var inventoryClient = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(8), MaxResponseContentBufferSize = 1048576 };
using var gate = new SemaphoreSlim(1, 1);
var stateDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "YSHeng", "WhatsAppProbe");
Directory.CreateDirectory(stateDirectory);
string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
var optOutPath = Path.Combine(stateDirectory, Hash(phoneId + ":" + recipient) + ".optout");
var dbOptions = new DbContextOptionsBuilder<AppDbContext>().UseSqlite($"Data Source={Path.Combine(stateDirectory, "queue.db")}").Options;
// Local operator commands do not expose phone numbers or message bodies.
if (args.Contains("--queue-status") || args.Contains("--retry-dead-letter"))
{
    await using var db = new AppDbContext(dbOptions);
    if (args.Contains("--queue-status"))
    {
        var rows = await db.WhatsAppOutbox.AsNoTracking().OrderByDescending(row => row.CreatedAt).Take(20)
            .Select(row => new { row.Id, row.State, row.Attempts }).ToListAsync();
        Console.WriteLine(JsonSerializer.Serialize(rows));
    }
    else
    {
        FileStream retryLock;
        try { retryLock = new FileStream(Path.Combine(stateDirectory, "queue.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
        catch (IOException)
        {
            Console.WriteLine("Retry refused: stop the test host before using the local retry command.");
            return;
        }
        using (retryLock)
        {
            var index = System.Array.IndexOf(args, "--retry-dead-letter");
            var retried = index + 1 < args.Length && Guid.TryParse(args[index + 1], out var id) && !File.Exists(optOutPath) &&
                await WhatsAppOutboxStore.RetryDeadLetterTestAsync(db, id, recipient, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
            Console.WriteLine(retried ? "Eligible failed test message queued for audited retry." : "Retry refused: requires an unexpired, consented test-recipient dead letter.");
        }
    }
    return;
}
// One local process owns this test store. Existing opt-out markers remain authoritative.
using var instanceLock = new FileStream(Path.Combine(stateDirectory, "queue.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
await using (var db = new AppDbContext(dbOptions))
{
    await db.Database.EnsureCreatedAsync();
    // Additive upgrade of this isolated SQLite test store; preserve consent and outbox history.
    await db.Database.OpenConnectionAsync();
    await using (var schema = db.Database.GetDbConnection().CreateCommand())
    {
        schema.CommandText = "PRAGMA table_info('WhatsAppConsents')";
        var hasLanguage = false;
        await using (var columns = await schema.ExecuteReaderAsync())
            while (await columns.ReadAsync()) hasLanguage |= columns.GetString(1) == "Language";
        if (!hasLanguage)
            await db.Database.ExecuteSqlRawAsync("ALTER TABLE WhatsAppConsents ADD COLUMN Language TEXT NOT NULL DEFAULT 'ms'");
    }
    await using (var schema = db.Database.GetDbConnection().CreateCommand())
    {
        schema.CommandText = "PRAGMA table_info('WhatsAppOutbox')";
        var columns = new HashSet<string>();
        await using (var reader = await schema.ExecuteReaderAsync())
            while (await reader.ReadAsync()) columns.Add(reader.GetString(1));
        if (!columns.Contains("EventKind")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE WhatsAppOutbox ADD COLUMN EventKind TEXT NOT NULL DEFAULT 'test'");
        if (!columns.Contains("BusinessReference")) await db.Database.ExecuteSqlRawAsync("ALTER TABLE WhatsAppOutbox ADD COLUMN BusinessReference TEXT NOT NULL DEFAULT ''");
    }
    if (!await db.WhatsAppConsents.AnyAsync(row => row.Recipient == recipient))
        await WhatsAppOutboxStore.SetConsentAsync(db, recipient, !File.Exists(optOutPath), "User-authorized isolated WhatsApp API test", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
}
var sendOptions = new WhatsAppTestOptions
{
    Enabled = true, RecipientConsentConfirmed = true, TestRecipient = recipient,
    PhoneNumberId = phoneId, GraphApiVersion = version, AccessToken = accessToken
};
var app = builder.Build();

app.MapGet("/webhooks/whatsapp", (HttpRequest request) =>
{
    var challenge = request.Query["hub.challenge"].ToString();
    if (request.Query["hub.mode"] != "subscribe" || challenge.Length is 0 or > 200 ||
        !WhatsAppWebhookProbe.VerifyToken(request.Query["hub.verify_token"], verifyToken)) return Results.Unauthorized();
    Console.WriteLine("Webhook verification succeeded.");
    return Results.Text(challenge, "text/plain");
});

app.MapPost("/webhooks/whatsapp", async (HttpContext context) =>
{
    byte[] bytes;
    using (var buffer = new MemoryStream())
    {
        var chunk = new byte[8192];
        int count;
        while ((count = await context.Request.Body.ReadAsync(chunk, context.RequestAborted)) > 0)
        {
            if (buffer.Length + count > WhatsAppWebhookProbe.MaxBodyBytes) return Results.StatusCode(413);
            buffer.Write(chunk, 0, count);
        }
        bytes = buffer.ToArray();
    }
    if (!WhatsAppWebhookProbe.VerifySignature(bytes, context.Request.Headers["X-Hub-Signature-256"], secret)) return Results.Unauthorized();
    IReadOnlyList<WhatsAppProbeCommand> commands;
    IReadOnlyList<WhatsAppProbeStatus> statuses;
    try
    {
        using var json = JsonDocument.Parse(bytes);
        commands = WhatsAppWebhookProbe.ReadCommands(json.RootElement, phoneId, recipient, DateTimeOffset.UtcNow);
        statuses = WhatsAppWebhookProbe.ReadStatuses(json.RootElement, phoneId, recipient);
    }
    catch (JsonException) { return Results.BadRequest(); }

    await gate.WaitAsync(app.Lifetime.ApplicationStopping);
    try
    {
        await using var db = new AppDbContext(dbOptions);
        foreach (var status in statuses)
        {
            await WhatsAppOutboxStore.ApplyStatusAsync(db, recipient, status);
            var path = Path.Combine(stateDirectory, Hash(phoneId + ":" + status.MessageId) + ".delivery");
            // Only correlate accepted sends from this probe. Never persist raw provider messages or errors.
            if (!File.Exists(path)) continue;
            var current = await File.ReadAllTextAsync(path);
            var next = WhatsAppWebhookProbe.MergeStatus(current, status.Status);
            if (next == current) continue;
            await File.WriteAllTextAsync(path, next);
            Console.WriteLine($"Test delivery status: {next}.");
        }
        // An opt-out anywhere in a batch takes precedence over all test commands in that batch.
        if (commands.Any(command => command.OptOut))
        {
            await File.WriteAllTextAsync(optOutPath, "Opted out of test replies.");
            await WhatsAppOutboxStore.SetConsentAsync(db, recipient, false, "Signed inbound STOP command", DateTimeOffset.UtcNow.ToUnixTimeSeconds());
            Console.WriteLine("Test recipient opted out. Queued replies suppressed.");
        }
        foreach (var command in commands.Where(command => !command.OptOut))
        {
            if (File.Exists(optOutPath)) continue;
            var marker = Path.Combine(stateDirectory, Hash(phoneId + ":" + command.MessageId) + ".seen");
            if (File.Exists(marker)) continue; // Preserve pre-queue deduplication history.
            if (command.Language is not null || command.Template is not null)
            {
                await WhatsAppOutboxStore.EnqueuePreviewAsync(db, phoneId + ":" + command.MessageId, recipient,
                    command.Language, command.Template, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
                Console.WriteLine("Signed notification preview command processed.");
                continue;
            }
            string reply;
            if (command.Inventory)
            {
                try
                {
                    var jsonText = await inventoryClient.GetStringAsync("https://yshenghub.com.my/api/public/vehicles", app.Lifetime.ApplicationStopping);
                    using var inventory = JsonDocument.Parse(jsonText);
                    reply = WhatsAppPublicInventory.Format(inventory.RootElement, command.Query);
                }
                catch (Exception) when (!app.Lifetime.ApplicationStopping.IsCancellationRequested)
                {
                    reply = "Public inventory is temporarily unavailable. Please try again later.";
                }
            }
            else reply = "YS Heng test connection successful. Your message was received.";
            await WhatsAppOutboxStore.EnqueueTestAsync(db, phoneId + ":" + command.MessageId, recipient, reply, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
            Console.WriteLine("Signed test command persisted in outbox.");
        }
    }
    catch (Exception) when (!app.Lifetime.ApplicationStopping.IsCancellationRequested)
    {
        Console.WriteLine("Probe processing failed; details suppressed. No automatic resend.");
        return Results.StatusCode(503);
    }
    finally { gate.Release(); }
    return Results.Ok();
});

var dispatcher = Task.Run(async () =>
{
    var stopping = app.Lifetime.ApplicationStopping;
    try
    {
        while (!stopping.IsCancellationRequested)
        {
            await gate.WaitAsync(stopping);
            try
            {
                await using var db = new AppDbContext(dbOptions);
                if (File.Exists(optOutPath) && await db.WhatsAppConsents.AnyAsync(row => row.Recipient == recipient && row.OptedIn, stopping))
                    await WhatsAppOutboxStore.SetConsentAsync(db, recipient, false, "Persisted test opt-out marker", DateTimeOffset.UtcNow.ToUnixTimeSeconds(), stopping);
                await WhatsAppOutboxStore.DispatchOneTestAsync(db, recipient, async (item, ct) =>
                {
                    var result = await sender.SendInventoryReplyAsync(sendOptions, item.Body, ct);
                    Console.WriteLine($"Queued test reply outcome: {result.Outcome}; HTTP: {result.HttpStatusCode}.");
                    return result;
                }, DateTimeOffset.UtcNow.ToUnixTimeSeconds(), stopping);
            }
            catch (Exception) when (!stopping.IsCancellationRequested)
            {
                Console.WriteLine("Queue dispatch deferred; details suppressed.");
            }
            finally { gate.Release(); }
            await Task.Delay(TimeSpan.FromSeconds(1), stopping);
        }
    }
    catch (OperationCanceledException) when (stopping.IsCancellationRequested) { }
});
Console.WriteLine("Test webhook ready on loopback port 5099. Durable queue enabled for the configured test recipient; no per-run reply cap.");
await app.RunAsync();
await dispatcher;

internal sealed class WhatsAppProbeSecrets { }
