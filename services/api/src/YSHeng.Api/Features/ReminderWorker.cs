using Microsoft.EntityFrameworkCore;
using Npgsql;
using YSHeng.Api.Data;

namespace YSHeng.Api.Features;

public sealed class ReminderWorker(IServiceScopeFactory scopeFactory, ILogger<ReminderWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var today = DateOnly.FromDateTime(DateTime.UtcNow);
                var loans = await db.LoanApplications.AsNoTracking().ToListAsync(stoppingToken);
                var settlements = await db.SettlementReminders.AsNoTracking().ToListAsync(stoppingToken);
                var deliveries = await db.DeliverySchedules.AsNoTracking().ToListAsync(stoppingToken);
                var payments = await db.PaymentRecords.AsNoTracking().ToListAsync(stoppingToken);
                var dailySpends = await db.DailySpends.AsNoTracking().ToListAsync(stoppingToken);
                var debtRecoveries = await db.DebtRecoveryCases.AsNoTracking().ToListAsync(stoppingToken);
                var paymentVouchers = await db.PaymentVouchers.AsNoTracking().ToListAsync(stoppingToken);

                logger.LogInformation(
                    "Reminder scan: {LoanCount} loan follow-ups, {SettlementCount} settlement reminders, {DeliveryCount} delivery notices, {PaymentCount} payment bank follow-ups, {PaymentStatusCount} payment status follow-ups, {DailySpendCount} daily spend reminders, {DebtRecoveryCount} debt recovery follow-ups, {PaymentVoucherCount} payment voucher follow-ups.",
                    loans.Count(loan => ReminderRules.IsLoanFollowUpDue(loan, today)),
                    settlements.Count(settlement => ReminderRules.IsSettlementDue(settlement, today)),
                    deliveries.Count(delivery => ReminderRules.IsDeliveryPreparationDue(delivery, today)),
                    payments.Count(payment => ReminderRules.IsPaymentBankFollowUpDue(payment, today)),
                    payments.Count(payment => ReminderRules.IsPaymentStatusFollowUpDue(payment, today)),
                    dailySpends.Count(spend => ReminderRules.IsDailySpendDue(spend, today)),
                    debtRecoveries.Count(debt => ReminderRules.IsDebtRecoveryFollowUpDue(debt, today)),
                    paymentVouchers.Count(voucher => ReminderRules.IsPaymentVoucherFollowUpDue(voucher, today)));

                await Task.Delay(TimeSpan.FromHours(6), stoppingToken);
            }
            catch (PostgresException exception) when (ReminderWorkerPolicy.IsMissingSchemaErrorCode(exception.SqlState))
            {
                logger.LogWarning("Reminder worker is waiting for the database schema to be created.");
                await Task.Delay(ReminderWorkerPolicy.SchemaRetryDelay, stoppingToken);
            }
        }
    }
}

public static class ReminderWorkerPolicy
{
    public static readonly TimeSpan SchemaRetryDelay = TimeSpan.FromSeconds(10);

    public static bool IsMissingSchemaErrorCode(string? sqlState) => sqlState == PostgresErrorCodes.UndefinedTable;
}
