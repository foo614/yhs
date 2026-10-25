using Microsoft.EntityFrameworkCore;
using YSHeng.Api.Data;
using YSHeng.Api.Domain;

namespace YSHeng.Api.Features;

public static class CollectionAgeingQueries
{
    public static async Task<IReadOnlyList<CollectionAgeingRecord>> ReadAsync(AppDbContext db, CancellationToken cancellationToken)
    {
        // Project only balance inputs: never load invoice PDFs, customer details or evidence.
        var payments = await db.PaymentRecords.AsNoTracking()
            .Select(payment => new PaymentRecord { Id = payment.Id, VehicleId = payment.VehicleId, FinanceWorkflowVersion = payment.FinanceWorkflowVersion, Status = payment.Status, NettPrice = payment.NettPrice })
            .ToListAsync(cancellationToken);
        var collections = await db.CollectionTransactions.AsNoTracking()
            .Where(collection => collection.Status == CollectionStatus.Reconciled)
            .Select(collection => new CollectionTransaction { PaymentRecordId = collection.PaymentRecordId, Amount = collection.Amount, Status = collection.Status })
            .ToListAsync(cancellationToken);
        var collectionsByPayment = collections.ToLookup(collection => collection.PaymentRecordId);
        var debts = await db.DebtRecoveryCases.AsNoTracking()
            .Where(debt => debt.Status != DebtRecoveryStatus.Closed)
            .Select(debt => new { debt.Id, debt.VehicleId, debt.BalanceAmount })
            .ToListAsync(cancellationToken);

        // Neither source stores a contractual due date. Follow-up/issue dates are not substitutes.
        return payments.Select(payment => new CollectionAgeingRecord("PaymentRecord", payment.Id, payment.VehicleId,
                payment.FinanceWorkflowVersion == 2
                    ? FinanceV2Rules.Balance(payment, collectionsByPayment[payment.Id])
                    : payment.Status != PaymentStatus.Reconciled ? payment.NettPrice : 0m, null))
            .Concat(debts.Select(debt => new CollectionAgeingRecord("DebtRecoveryCase", debt.Id, debt.VehicleId, debt.BalanceAmount, null)))
            .Where(record => record.Amount != 0m)
            .OrderBy(record => record.SourceType).ThenBy(record => record.SourceId)
            .ToArray();
    }
}
