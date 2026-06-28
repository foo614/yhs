import type { BrokerCommission, Customer, DailySpend, DebtRecoveryCase, FinanceInvoice, Owner, PaymentRecord, PaymentVoucher, SettlementReminder, VehicleLookup } from "./api";

export const financeDocumentCategories = ["PaymentReceipt", "PaymentInvoice"] as const;

export function canReconcilePayment(payment: PaymentRecord, existing: PaymentRecord[] = [], invoice?: FinanceInvoice | null) {
  return paymentReconcileBlockReason(payment, existing, invoice) === undefined;
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

export function paymentCreateBlockReason(payment: PaymentRecord, existing: PaymentRecord[] = [], invoice?: FinanceInvoice | null) {
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

  const invoiceReason = paymentInvoiceSyncBlockReason(invoice);
  if (invoiceReason) {
    return invoiceReason;
  }

  const externalReason = paymentExternalSyncBlockReason(payment, existing);
  if (externalReason) {
    return externalReason;
  }

  return undefined;
}

export function paymentReconcileBlockReason(payment: PaymentRecord, existing: PaymentRecord[] = [], invoice?: FinanceInvoice | null) {
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

  const invoiceReason = paymentInvoiceSyncBlockReason(invoice);
  if (invoiceReason) {
    return invoiceReason;
  }

  if (hasDuplicateReference(payment, existing)) {
    return "Receipt or invoice is already used by another payment.";
  }

  const externalReason = paymentExternalSyncBlockReason(payment, existing);
  if (externalReason) {
    return externalReason;
  }

  return undefined;
}

export function paymentExternalSyncBlockReason(payment: PaymentRecord, existing: PaymentRecord[] = []) {
  const overrideReason = payment.reconciliationOverrideReason?.trim();
  if ((payment.externalSyncStatus ?? "NotSynced") === "Failed" && !overrideReason) {
    return "Failed external sync needs an override reason before reconciliation.";
  }

  if (hasDuplicateExternalDocument(payment, existing)) {
    return "External document number is already used by another payment.";
  }

  if (
    payment.externalDocumentAmount !== undefined &&
    payment.externalDocumentAmount !== payment.nettPrice &&
    !overrideReason
  ) {
    return "External document amount must match nett price unless an override reason is recorded.";
  }

  return undefined;
}

export function paymentRecoveryAction(payment: PaymentRecord, existing: PaymentRecord[] = []) {
  const reason = paymentExternalSyncBlockReason(payment, existing);
  if (!reason) return "Ready for reconciliation.";
  if (reason.includes("Failed external sync")) return "Retry sync or record an override reason.";
  if (reason.includes("External document amount")) return "Correct the external amount or record an override reason.";
  if (reason.includes("External document number")) return "Use a unique external document number.";
  return reason;
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

function paymentInvoiceSyncBlockReason(invoice?: FinanceInvoice | null) {
  if (!invoice) {
    return "Generated sales invoice is required before reconciliation.";
  }

  if (invoice.latestSync?.status !== "Synced") {
    return invoice.latestSync?.status === "Failed"
      ? "AutoCount sync failed; retry before reconciliation."
      : "AutoCount sync must be completed before reconciliation.";
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

function hasDuplicateExternalDocument(payment: PaymentRecord, existing: PaymentRecord[]) {
  const externalDocumentNumber = normalizeReference(payment.externalDocumentNumber);
  if (!externalDocumentNumber) {
    return false;
  }

  return existing.some((item) =>
    item.id !== payment.id &&
    normalizeReference(item.externalDocumentNumber) === externalDocumentNumber
  );
}

function normalizeReference(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}
