using YSHeng.Api.Data;

namespace YSHeng.Api.Features;

// Recovery runs independently of provider sending. Policies and sender flags default off;
// each adapter uses durable database keys so replicas and restarts cannot duplicate a day.
public sealed class WhatsAppStaffProactiveWorker(IServiceScopeFactory scopes,
    WhatsAppAssistantOptions assistant, ILogger<WhatsAppStaffProactiveWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        do
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            await TryRunAsync("due", async db => await WhatsAppDueDigest.EnqueueForVerifiedBindingsAsync(
                db, assistant, now, "whatsapp-proactive", ct: stoppingToken), stoppingToken);
            await TryRunAsync("hr", async db => await WhatsAppHrNotifications.EnqueueCurrentDayAsync(
                db, assistant, now, "whatsapp-proactive", stoppingToken), stoppingToken);
            await WhatsAppOcrUsageRecovery.TryEvaluateAsync(scopes, assistant, logger, stoppingToken);
            await TryRunAsync("workflow", db => WhatsAppWorkflowDispatch.EnqueueAsync(db, assistant, now, stoppingToken), stoppingToken);
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }

    private async Task TryRunAsync(string category, Func<AppDbContext, Task<int>> run, CancellationToken ct)
    {
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            await run(scope.ServiceProvider.GetRequiredService<AppDbContext>());
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        catch (Exception)
        {
            // Do not log exception objects: provider/DB details may contain private content.
            logger.LogWarning("Staff WhatsApp {Category} recovery failed; it will retry on the next tick.", category);
        }
    }
}

public static class WhatsAppOcrUsageRecovery
{
    public static async Task TryEvaluateAsync(IServiceScopeFactory scopes, WhatsAppAssistantOptions assistant,
        ILogger logger, CancellationToken ct = default, TimeSpan? maxDuration = null)
    {
        if (!assistant.Ready) return;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        if (maxDuration is { } duration) timeout.CancelAfter(duration);
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            await WhatsAppOcrUsageAlerts.EvaluateAsync(db, assistant,
                DateTimeOffset.UtcNow.ToUnixTimeSeconds(), "ocr-usage-alert", timeout.Token);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        catch (OperationCanceledException)
        {
            logger.LogWarning("OCR WhatsApp warning evaluation timed out; recovery will retry.");
        }
        catch (Exception)
        {
            logger.LogWarning("OCR WhatsApp warning evaluation failed; recovery will retry.");
        }
    }
}
