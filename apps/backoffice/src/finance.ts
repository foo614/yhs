import type { BrokerCommission, CollectionCreateInput, Customer, DailySpend, DebtRecoveryCase, FinanceSaleInput, Owner, PaymentRecord, PaymentVoucher, ReceivableStatus, SettlementReminder, VehicleLookup } from "./api";

export const financeDocumentCategories = ["PaymentReceipt", "PaymentInvoice"] as const;

export function isFinanceV2(payment: PaymentRecord) {
  return (payment.financeWorkflowVersion ?? 1) >= 2;
}

export function calculateFinanceNettPrice(values: Pick<FinanceSaleInput, "salesPrice" | "interestAdditionalCharges" | "ncdAmount" | "windscreenCharges" | "insurancePaidOnBehalfAmount" | "roadTaxPaidOnBehalfAmount" | "advancePaidOnBehalfAmount">) {
  return roundMoney(values.salesPrice + values.interestAdditionalCharges + values.windscreenCharges
    + (values.insurancePaidOnBehalfAmount ?? 0) + (values.roadTaxPaidOnBehalfAmount ?? 0) + (values.advancePaidOnBehalfAmount ?? 0) - values.ncdAmount);
}

export function financeSaleBlockReason(input: FinanceSaleInput, vehicles: VehicleLookup[] = []) {
  if (!vehicles.some((vehicle) => vehicle.id === input.vehicleId && Boolean(vehicle.customerId))) return "Select a vehicle with a confirmed buyer.";
  if (!input.salesAgentUserId?.trim()) return "Select the responsible sales agent.";
  if ([input.salesPrice, input.interestAdditionalCharges, input.ncdAmount, input.windscreenCharges].some((amount) => amount < 0)) return "Invoice amounts cannot be negative.";
  if ([input.insurancePaidOnBehalfAmount ?? 0, input.roadTaxPaidOnBehalfAmount ?? 0, input.advancePaidOnBehalfAmount ?? 0].some((amount) => amount < 0)) return "Paid-on-behalf amounts cannot be negative.";

  const calculated = calculateFinanceNettPrice(input);
  const agreed = input.nettPrice ?? calculated;
  if (calculated <= 0 || agreed <= 0) return "Invoice total must be greater than zero.";
  if (roundMoney(agreed - calculated) !== 0 && !input.nettPriceOverrideReason?.trim()) return "Explain the price adjustment before sending it for approval.";
  return undefined;
}

export function collectionCreateBlockReason(payment: PaymentRecord, input: CollectionCreateInput) {
  const available = payment.availableToAllocate ?? payment.balanceAmount ?? payment.nettPrice;
  if (input.amount <= 0) return "Payment amount must be greater than zero.";
  if (input.amount > available) return `Payment amount cannot exceed the available balance of RM ${available.toFixed(2)}.`;
  if (!input.receivedDate?.trim()) return "Received date is required.";
  if (!input.reference?.trim()) return "Enter a traceable payment reference.";
  if (input.method === "BankDisbursement" && input.financingStatus !== "Pending") return "New bank financing must start as Pending.";
  return undefined;
}

export function receivableStatusLabel(status: ReceivableStatus | undefined) {
  return ({ Draft: "Draft", WaitingForApproval: "Price approval needed", ReadyToCollect: "Ready to collect", PartiallyPaid: "Partially paid", Paid: "Paid", AttentionNeeded: "Needs attention" } satisfies Record<ReceivableStatus, string>)[status ?? "Draft"];
}

export function receivableStatusColor(status: ReceivableStatus | undefined) {
  return ({ Draft: "default", WaitingForApproval: "gold", ReadyToCollect: "blue", PartiallyPaid: "orange", Paid: "green", AttentionNeeded: "red" } satisfies Record<ReceivableStatus, string>)[status ?? "Draft"];
}

export function canReconcilePayment(payment: PaymentRecord, existing: PaymentRecord[] = []) {
  return paymentReconcileBlockReason(payment, existing) === undefined;
}

export function canCorrectReconciledPayment(payment: PaymentRecord) {
  return payment.status === "Reconciled";
}

export function canReopenPaidSettlement(settlement: SettlementReminder) {
  return settlement.isPaid;
}

export function canReopenPaidDailySpend(spend: DailySpend) {
  return spend.isPaid;
}

export function paymentCreateBlockReason(payment: PaymentRecord, existing: PaymentRecord[] = []) {
  if (payment.nettPrice <= 0) {
    return "Payment nett price must be greater than zero.";
  }

  if ((payment.salesPrice ?? 0) < 0) {
    return "Payment sales price cannot be negative.";
  }

  if ((payment.interestAdditionalCharges ?? 0) < 0) {
    return "Interest and additional charges cannot be negative.";
  }

  if ((payment.ncdAmount ?? 0) < 0) {
    return "NCD amount cannot be negative.";
  }

  if ((payment.windscreenCharges ?? 0) < 0) {
    return "Windscreen charges cannot be negative.";
  }

  if (hasDuplicateReference(payment, existing)) {
    return "Receipt or invoice is already used by another payment.";
  }

  if (payment.status !== "Reconciled") {
    return undefined;
  }

  if (!payment.receiptNumber?.trim() || !payment.invoiceNumber?.trim()) {
    return "Receipt and invoice are required before reconciliation.";
  }

  if (!payment.bossChecked) {
    return "Management review is required before reconciliation.";
  }

  const checklistReason = paymentChecklistBlockReason(payment);
  if (checklistReason) {
    return checklistReason;
  }

  return undefined;
}

export function paymentReconcileBlockReason(payment: PaymentRecord, existing: PaymentRecord[] = []) {
  if (payment.status === "Reconciled") {
    return "Payment is already reconciled.";
  }

  if (!payment.receiptNumber?.trim() || !payment.invoiceNumber?.trim()) {
    return "Receipt and invoice are required before reconciliation.";
  }

  if (!payment.bossChecked) {
    return "Management review is required before reconciliation.";
  }

  const checklistReason = paymentChecklistBlockReason(payment);
  if (checklistReason) {
    return checklistReason;
  }

  if (hasDuplicateReference(payment, existing)) {
    return "Receipt or invoice is already used by another payment.";
  }

  return undefined;
}

export function settlementCreateBlockReason(settlement: SettlementReminder, owners: Owner[] = []) {
  if (settlement.amount <= 0) {
    return "Settlement amount must be greater than zero.";
  }

  if (!settlement.deadline?.trim()) {
    return "Settlement deadline is required.";
  }

  if (settlement.ownerId && !owners.some((owner) => owner.id === settlement.ownerId)) {
    return "Settlement owner must reference an existing previous owner.";
  }

  return undefined;
}

function paymentChecklistBlockReason(payment: PaymentRecord) {
  if (!payment.documentsPrepared) {
    return "Finance documents must be prepared before reconciliation.";
  }

  if (!payment.checklistValidated) {
    return "Finance checklist must be validated before reconciliation.";
  }

  return undefined;
}

export function dailySpendCreateBlockReason(spend: DailySpend) {
  if (!spend.description?.trim()) {
    return "Daily spend description is required.";
  }

  if (spend.amount <= 0) {
    return "Daily spend amount must be greater than zero.";
  }

  if (!spend.dueDate?.trim()) {
    return "Daily spend due date is required.";
  }

  return undefined;
}

export function brokerCommissionCreateBlockReason(commission: BrokerCommission, vehicles: VehicleLookup[] = []) {
  if (!vehicles.some((vehicle) => vehicle.id === commission.vehicleId)) {
    return "Broker commission must be linked to an existing car plate.";
  }

  if (!commission.brokerName?.trim()) {
    return "Broker name is required.";
  }

  if (commission.amount <= 0) {
    return "Broker commission amount must be greater than zero.";
  }

  if (commission.cp58Prepared && !commission.cp58Required) {
    return "CP58 cannot be marked prepared unless CP58 is required.";
  }

  return undefined;
}

export function debtRecoveryCreateBlockReason(debt: DebtRecoveryCase, vehicles: VehicleLookup[] = [], customers: Customer[] = []) {
  if (!vehicles.some((vehicle) => vehicle.id === debt.vehicleId)) {
    return "Debt recovery case must be linked to an existing car plate.";
  }

  if (!customers.some((customer) => customer.id === debt.customerId)) {
    return "Debt recovery case must be linked to an existing customer.";
  }

  if (debt.balanceAmount <= 0) {
    return "Debt recovery balance amount must be greater than zero.";
  }

  if (!debt.followUpDate?.trim()) {
    return "Debt recovery follow-up date is required.";
  }

  return undefined;
}

export function paymentVoucherCreateBlockReason(voucher: PaymentVoucher, vehicles: VehicleLookup[] = []) {
  if (!vehicles.some((vehicle) => vehicle.id === voucher.vehicleId)) {
    return "Payment voucher must be linked to an existing car plate.";
  }

  if (!voucher.payeeName?.trim()) {
    return "Payment voucher payee is required.";
  }

  if (voucher.amount <= 0) {
    return "Payment voucher amount must be greater than zero.";
  }

  if (!voucher.purpose?.trim()) {
    return "Payment voucher purpose is required.";
  }

  if (!voucher.issuedDate?.trim()) {
    return "Payment voucher issued date is required.";
  }
  if (!voucher.paymentMethod) return "Select a payment method.";
  if (!voucher.sourceAccountCode?.trim()) return "Bank or cash source account is required.";
  if (!voucher.accountingAccountCode?.trim()) return "Accounting account is required.";
  if (voucher.paymentMethod === "Cheque" && !voucher.chequeNumber?.trim()) return "Cheque number is required for cheque payment.";
  if ((voucher.bankChargeAmount ?? 0) < 0) return "Bank charge cannot be negative.";
  if ((voucher.bankChargeAmount ?? 0) > 0 && !voucher.bankChargeAccountCode?.trim()) return "Bank charge account is required.";

  return undefined;
}

function hasDuplicateReference(payment: PaymentRecord, existing: PaymentRecord[]) {
  const receiptNumber = normalizeReference(payment.receiptNumber);
  const invoiceNumber = normalizeReference(payment.invoiceNumber);

  return existing.some((item) => {
    if (item.id === payment.id) {
      return false;
    }

    return (!!receiptNumber && normalizeReference(item.receiptNumber) === receiptNumber) ||
      (!!invoiceNumber && normalizeReference(item.invoiceNumber) === invoiceNumber);
  });
}

function normalizeReference(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
