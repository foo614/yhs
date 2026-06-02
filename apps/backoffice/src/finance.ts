import type { BrokerCommission, Customer, DailySpend, DebtRecoveryCase, Owner, PaymentRecord, PaymentVoucher, SettlementReminder, VehicleLookup } from "./api";

export const financeDocumentCategories = ["PaymentReceipt", "PaymentInvoice"] as const;

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

  if (payment.status !== "Reconciled") {
    return undefined;
  }

  if (!payment.receiptNumber?.trim() || !payment.invoiceNumber?.trim()) {
    return "Receipt and invoice are required before reconciliation.";
  }

  if (!payment.bossChecked) {
    return "Boss check is required before reconciliation.";
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

export function paymentReconcileBlockReason(payment: PaymentRecord, existing: PaymentRecord[] = []) {
  if (payment.status === "Reconciled") {
    return "Payment is already reconciled.";
  }

  if (!payment.receiptNumber?.trim() || !payment.invoiceNumber?.trim()) {
    return "Receipt and invoice are required before reconciliation.";
  }

  if (!payment.bossChecked) {
    return "Boss check is required before reconciliation.";
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

  if (!payment.invoiceGenerated) {
    return "Payment invoice must be generated before reconciliation.";
  }

  if (!payment.autoCountKeyed) {
    return "AutoCount key-in must be marked before reconciliation.";
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

    return normalizeReference(item.receiptNumber) === receiptNumber || normalizeReference(item.invoiceNumber) === invoiceNumber;
  });
}

function normalizeReference(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}
