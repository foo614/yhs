import type { SettlementExpectedState, SettlementReminder } from "./api";

export function settlementExpectedState(settlement: SettlementReminder): SettlementExpectedState {
  return {
    expectedAmount: settlement.amount,
    expectedDirection: settlement.direction ?? "LegacyPaySeller",
    expectedBankDebtAmount: settlement.bankDebtAmount ?? null,
    expectedDeadline: settlement.deadline,
    expectedIsPaid: settlement.isPaid
  };
}

export function settlementPreview(purchasePrice: number, bankDebtAmount: number) {
  if (!Number.isFinite(purchasePrice) || purchasePrice <= 0 || !Number.isFinite(bankDebtAmount) || bankDebtAmount < 0) return undefined;
  const difference = Math.round(purchasePrice * 100) - Math.round(bankDebtAmount * 100);
  return {
    amount: Math.abs(difference) / 100,
    direction: difference > 0 ? "PaySeller" as const : difference < 0 ? "CollectFromSeller" as const : "InternalOffset" as const
  };
}

export function settlementDirectionLabel(direction: SettlementReminder["direction"]) {
  if (direction === "CollectFromSeller") return "Collect from seller / 向卖家收款";
  if (direction === "InternalOffset") return "Internal offset / 内部对冲";
  return "Pay seller / 付卖家";
}

export function settlementCompletionLabel(settlement: Pick<SettlementReminder, "direction">) {
  if (settlement.direction === "CollectFromSeller") return "Confirm received";
  if (settlement.direction === "InternalOffset") return "Confirm offset";
  return "Confirm paid";
}

export function settlementStatusLabel(settlement: Pick<SettlementReminder, "direction" | "isPaid">) {
  if (settlement.direction === "CollectFromSeller") return settlement.isPaid ? "Received" : "To collect";
  if (settlement.direction === "InternalOffset") return settlement.isPaid ? "Offset confirmed" : "Offset to confirm";
  return settlement.isPaid ? "Paid" : "To pay";
}

export function settlementTotals(settlements: SettlementReminder[]) {
  return settlements.filter((item) => !item.isPaid).reduce((totals, item) => {
    if (item.direction === "InternalOffset") totals.offsets += 1;
    else if (item.direction === "CollectFromSeller") totals.toCollect += item.amount;
    else totals.toPay += item.amount;
    return totals;
  }, { toPay: 0, toCollect: 0, offsets: 0 });
}
