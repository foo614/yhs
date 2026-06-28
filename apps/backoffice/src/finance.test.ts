import { describe, expect, it } from "vitest";
import { brokerCommissionCreateBlockReason, canCorrectReconciledPayment, canReconcilePayment, canReopenPaidDailySpend, canReopenPaidSettlement, dailySpendCreateBlockReason, debtRecoveryCreateBlockReason, financeDocumentCategories, paymentCreateBlockReason, paymentRecoveryAction, paymentReconcileBlockReason, paymentVoucherCreateBlockReason, settlementCreateBlockReason } from "./finance";
import type { BrokerCommission, Customer, DailySpend, DebtRecoveryCase, FinanceInvoice, Owner, PaymentRecord, PaymentVoucher, SettlementReminder, VehicleLookup } from "./api";

const basePayment: PaymentRecord = {
  id: "payment-1",
  vehicleId: "vehicle-1",
  nettPrice: 58000,
  status: "Disbursed",
  bossChecked: true,
  documentsPrepared: true,
  checklistValidated: true,
  invoiceGenerated: true,
  autoCountKeyed: true,
  createdAt: "2026-05-30T00:00:00Z"
};

const baseFinanceInvoice: FinanceInvoice = {
  id: "invoice-1",
  paymentRecordId: basePayment.id,
  vehicleId: basePayment.vehicleId,
  customerId: "customer-1",
  invoiceNumber: "INV-1001",
  invoiceDate: "2026-06-01",
  amount: 58000,
  salesPrice: 58000,
  interestAdditionalCharges: 0,
  ncdAmount: 0,
  windscreenCharges: 0,
  contentMimeType: "application/pdf",
  createdBy: "finance-user",
  createdAt: "2026-06-01T00:00:00Z",
  latestSync: {
    id: "sync-1",
    financeInvoiceId: "invoice-1",
    paymentRecordId: basePayment.id,
    status: "Synced",
    externalDocumentNumber: "SI-1001",
    retryCount: 0,
    createdAt: "2026-06-01T00:00:00Z",
    updatedAt: "2026-06-01T00:00:00Z"
  }
};

const baseSettlement: SettlementReminder = {
  id: "settlement-1",
  vehicleId: "vehicle-1",
  amount: 25000,
  deadline: "2026-06-01",
  isPaid: false
};

const baseDailySpend: DailySpend = {
  id: "spend-1",
  description: "Electric Bill",
  amount: 480,
  dueDate: "2026-06-15",
  isPaid: false
};

const vehicleLookup: VehicleLookup[] = [
  { id: "vehicle-1", plateNumber: "VPK1234", make: "Toyota", model: "Vios", stockOwner: "YSHeng", status: "Available" }
];

const customers: Customer[] = [
  { id: "customer-1", name: "Ali Tan", phone: "0123456789" }
];

const owners: Owner[] = [
  { id: "owner-1", name: "Previous Owner", phone: "0198887777" }
];

const baseBrokerCommission: BrokerCommission = {
  id: "commission-1",
  vehicleId: "vehicle-1",
  brokerName: "Ah Chong",
  amount: 1200,
  isPaid: false,
  cp58Required: false,
  cp58Prepared: false
};

const baseDebtRecovery: DebtRecoveryCase = {
  id: "debt-1",
  vehicleId: "vehicle-1",
  customerId: "customer-1",
  balanceAmount: 3200,
  status: "Open",
  followUpDate: "2026-06-01"
};

const basePaymentVoucher: PaymentVoucher = {
  id: "voucher-1",
  vehicleId: "vehicle-1",
  payeeName: "Ah Ming",
  amount: 180,
  purpose: "Outstation Pickup Allowance",
  status: "Pending",
  issuedDate: "2026-06-03"
};

describe("finance workflow helpers", () => {
  it("allows reconciliation only when receipt and invoice references are present", () => {
    expect(canReconcilePayment({
      ...basePayment,
      receiptNumber: "RCPT-1001",
      invoiceNumber: "INV-1001"
    }, [], baseFinanceInvoice)).toBe(true);

    expect(canReconcilePayment({ ...basePayment, receiptNumber: " ", invoiceNumber: "INV-1001" })).toBe(false);
    expect(canReconcilePayment({ ...basePayment, receiptNumber: "RCPT-1001", invoiceNumber: "" })).toBe(false);
  });

  it("explains why a payment cannot be reconciled", () => {
    expect(paymentReconcileBlockReason({ ...basePayment, receiptNumber: "", invoiceNumber: "" })).toBe("Receipt and invoice are required before reconciliation.");
    expect(paymentReconcileBlockReason({ ...basePayment, receiptNumber: "RCPT-1001", invoiceNumber: "INV-1001" }, [], baseFinanceInvoice)).toBeUndefined();
    expect(paymentReconcileBlockReason({ ...basePayment, status: "Reconciled" })).toBe("Payment is already reconciled.");
  });

  it("requires boss check before reconciliation", () => {
    const payment = { ...basePayment, receiptNumber: "RCPT-1001", invoiceNumber: "INV-1001", bossChecked: false };

    expect(canReconcilePayment(payment)).toBe(false);
    expect(paymentReconcileBlockReason(payment)).toBe("Management review is required before reconciliation.");
  });

  it("requires finance checklist steps before reconciliation", () => {
    const base = { ...basePayment, receiptNumber: "RCPT-1001", invoiceNumber: "INV-1001" };

    expect(paymentReconcileBlockReason({ ...base, documentsPrepared: false })).toBe("Finance documents must be prepared before reconciliation.");
    expect(paymentReconcileBlockReason({ ...base, checklistValidated: false })).toBe("Finance checklist must be validated before reconciliation.");
    expect(paymentReconcileBlockReason({ ...base, invoiceGenerated: false })).toBe("Generated sales invoice is required before reconciliation.");
    expect(paymentReconcileBlockReason(base, [], { ...baseFinanceInvoice, latestSync: { ...baseFinanceInvoice.latestSync!, status: "Failed" } })).toBe("AutoCount sync failed; retry before reconciliation.");
  });

  it("blocks reconciliation when receipt or invoice references already exist", () => {
    const existing: PaymentRecord[] = [
      {
        ...basePayment,
        id: "payment-2",
        status: "Reconciled",
        receiptNumber: "RCPT-1001",
        invoiceNumber: "INV-1001"
      }
    ];

    const duplicate = {
      ...basePayment,
      receiptNumber: " rcpt-1001 ",
      invoiceNumber: " inv-1001 "
    };

    const invoice = { ...baseFinanceInvoice, paymentRecordId: duplicate.id };

    expect(canReconcilePayment(duplicate, existing, invoice)).toBe(false);
    expect(paymentReconcileBlockReason(duplicate, existing, invoice)).toBe("Receipt or invoice is already used by another payment.");
  });

  it("blocks failed or mismatched external sync without an override reason", () => {
    const payment = {
      ...basePayment,
      receiptNumber: "RCPT-1001",
      invoiceNumber: "INV-1001",
      externalSyncStatus: "Failed" as const
    };

    expect(paymentReconcileBlockReason(payment, [], baseFinanceInvoice)).toBe("Failed external sync needs an override reason before reconciliation.");
    expect(paymentRecoveryAction(payment)).toBe("Retry sync or record an override reason.");
    expect(paymentReconcileBlockReason({
      ...payment,
      externalSyncStatus: "Synced",
      externalDocumentAmount: 57000
    }, [], baseFinanceInvoice)).toBe("External document amount must match nett price unless an override reason is recorded.");
    expect(paymentReconcileBlockReason({
      ...payment,
      reconciliationOverrideReason: "Manager approved bank rounding check"
    }, [], baseFinanceInvoice)).toBeUndefined();
  });

  it("blocks duplicate external document numbers", () => {
    const existing: PaymentRecord[] = [{ ...basePayment, id: "payment-2", externalDocumentNumber: "EXT-1001" }];

    expect(paymentReconcileBlockReason({
      ...basePayment,
      receiptNumber: "RCPT-1001",
      invoiceNumber: "INV-1001",
      externalDocumentNumber: " ext-1001 "
    }, existing, baseFinanceInvoice)).toBe("External document number is already used by another payment.");
  });

  it("blocks creating a payment with duplicate receipt or invoice references", () => {
    const existing: PaymentRecord[] = [
      {
        ...basePayment,
        id: "payment-2",
        status: "Reconciled",
        receiptNumber: "RCPT-1001",
        invoiceNumber: "INV-1001"
      }
    ];

    expect(paymentCreateBlockReason({
      ...basePayment,
      id: "payment-new",
      status: "Reconciled",
      receiptNumber: " rcpt-1001 ",
      invoiceNumber: " inv-1001 "
    }, existing)).toBe("Receipt or invoice is already used by another payment.");

    expect(paymentCreateBlockReason({
      ...basePayment,
      id: "payment-new",
      status: "Disbursed",
      receiptNumber: " rcpt-1001 ",
      invoiceNumber: " inv-1001 "
    }, existing)).toBe("Receipt or invoice is already used by another payment.");
  });

  it("does not treat missing receipt and invoice references as duplicates", () => {
    const existing: PaymentRecord[] = [
      {
        ...basePayment,
        id: "payment-2",
        receiptNumber: undefined,
        invoiceNumber: undefined
      }
    ];

    expect(paymentCreateBlockReason({
      ...basePayment,
      id: "payment-new",
      receiptNumber: undefined,
      invoiceNumber: undefined
    }, existing)).toBeUndefined();
  });

  it("blocks creating a payment with non-positive nett price", () => {
    expect(paymentCreateBlockReason({ ...basePayment, nettPrice: 0 })).toBe("Payment nett price must be greater than zero.");
    expect(paymentCreateBlockReason({ ...basePayment, nettPrice: -1 })).toBe("Payment nett price must be greater than zero.");
    expect(paymentCreateBlockReason(basePayment)).toBeUndefined();
  });

  it("blocks negative invoice detail amounts", () => {
    expect(paymentCreateBlockReason({ ...basePayment, salesPrice: -1 })).toBe("Payment sales price cannot be negative.");
    expect(paymentCreateBlockReason({ ...basePayment, interestAdditionalCharges: -1 })).toBe("Interest and additional charges cannot be negative.");
    expect(paymentCreateBlockReason({ ...basePayment, ncdAmount: -1 })).toBe("NCD amount cannot be negative.");
    expect(paymentCreateBlockReason({ ...basePayment, windscreenCharges: -1 })).toBe("Windscreen charges cannot be negative.");
  });

  it("allows correction only after payment has been reconciled", () => {
    expect(canCorrectReconciledPayment({ ...basePayment, status: "Reconciled" })).toBe(true);
    expect(canCorrectReconciledPayment({ ...basePayment, status: "Disbursed" })).toBe(false);
    expect(canCorrectReconciledPayment({ ...basePayment, status: "Pending" })).toBe(false);
  });

  it("blocks settlement reminder creation with missing deadline or non-positive amount", () => {
    expect(settlementCreateBlockReason({ ...baseSettlement, amount: 0 })).toBe("Settlement amount must be greater than zero.");
    expect(settlementCreateBlockReason({ ...baseSettlement, deadline: " " })).toBe("Settlement deadline is required.");
    expect(settlementCreateBlockReason(baseSettlement)).toBeUndefined();
  });

  it("blocks settlement reminder creation with an unknown owner link", () => {
    expect(settlementCreateBlockReason({ ...baseSettlement, ownerId: "missing-owner" }, owners)).toBe("Settlement owner must reference an existing previous owner.");
    expect(settlementCreateBlockReason({ ...baseSettlement, ownerId: "owner-1" }, owners)).toBeUndefined();
  });

  it("allows reopening only after a settlement has been marked paid", () => {
    expect(canReopenPaidSettlement({ ...baseSettlement, isPaid: true })).toBe(true);
    expect(canReopenPaidSettlement({ ...baseSettlement, isPaid: false })).toBe(false);
  });

  it("blocks daily spend creation with missing description, amount, or due date", () => {
    expect(dailySpendCreateBlockReason({ ...baseDailySpend, description: " " })).toBe("Daily spend description is required.");
    expect(dailySpendCreateBlockReason({ ...baseDailySpend, amount: 0 })).toBe("Daily spend amount must be greater than zero.");
    expect(dailySpendCreateBlockReason({ ...baseDailySpend, dueDate: " " })).toBe("Daily spend due date is required.");
    expect(dailySpendCreateBlockReason(baseDailySpend)).toBeUndefined();
  });

  it("allows reopening only after a daily spend has been marked paid", () => {
    expect(canReopenPaidDailySpend({ ...baseDailySpend, isPaid: true })).toBe(true);
    expect(canReopenPaidDailySpend({ ...baseDailySpend, isPaid: false })).toBe(false);
  });

  it("blocks broker commission creation with missing vehicle, broker, or amount", () => {
    expect(brokerCommissionCreateBlockReason({ ...baseBrokerCommission, vehicleId: "missing" }, vehicleLookup)).toBe("Broker commission must be linked to an existing car plate.");
    expect(brokerCommissionCreateBlockReason({ ...baseBrokerCommission, brokerName: " " }, vehicleLookup)).toBe("Broker name is required.");
    expect(brokerCommissionCreateBlockReason({ ...baseBrokerCommission, amount: 0 }, vehicleLookup)).toBe("Broker commission amount must be greater than zero.");
    expect(brokerCommissionCreateBlockReason({ ...baseBrokerCommission, cp58Prepared: true }, vehicleLookup)).toBe("CP58 cannot be marked prepared unless CP58 is required.");
    expect(brokerCommissionCreateBlockReason(baseBrokerCommission, vehicleLookup)).toBeUndefined();
    expect(brokerCommissionCreateBlockReason({ ...baseBrokerCommission, cp58Required: true, cp58Prepared: true }, vehicleLookup)).toBeUndefined();
  });

  it("blocks debt recovery creation with missing vehicle, customer, balance, or follow-up date", () => {
    expect(debtRecoveryCreateBlockReason({ ...baseDebtRecovery, vehicleId: "missing" }, vehicleLookup, customers)).toBe("Debt recovery case must be linked to an existing car plate.");
    expect(debtRecoveryCreateBlockReason({ ...baseDebtRecovery, customerId: "missing" }, vehicleLookup, customers)).toBe("Debt recovery case must be linked to an existing customer.");
    expect(debtRecoveryCreateBlockReason({ ...baseDebtRecovery, balanceAmount: 0 }, vehicleLookup, customers)).toBe("Debt recovery balance amount must be greater than zero.");
    expect(debtRecoveryCreateBlockReason({ ...baseDebtRecovery, followUpDate: " " }, vehicleLookup, customers)).toBe("Debt recovery follow-up date is required.");
    expect(debtRecoveryCreateBlockReason(baseDebtRecovery, vehicleLookup, customers)).toBeUndefined();
  });

  it("blocks payment voucher creation with missing vehicle, payee, amount, purpose, or issued date", () => {
    expect(paymentVoucherCreateBlockReason({ ...basePaymentVoucher, vehicleId: "missing" }, vehicleLookup)).toBe("Payment voucher must be linked to an existing car plate.");
    expect(paymentVoucherCreateBlockReason({ ...basePaymentVoucher, payeeName: " " }, vehicleLookup)).toBe("Payment voucher payee is required.");
    expect(paymentVoucherCreateBlockReason({ ...basePaymentVoucher, amount: 0 }, vehicleLookup)).toBe("Payment voucher amount must be greater than zero.");
    expect(paymentVoucherCreateBlockReason({ ...basePaymentVoucher, purpose: " " }, vehicleLookup)).toBe("Payment voucher purpose is required.");
    expect(paymentVoucherCreateBlockReason({ ...basePaymentVoucher, issuedDate: " " }, vehicleLookup)).toBe("Payment voucher issued date is required.");
    expect(paymentVoucherCreateBlockReason(basePaymentVoucher, vehicleLookup)).toBeUndefined();
  });

  it("limits finance uploads to receipt and invoice documents", () => {
    expect(financeDocumentCategories).toEqual(["PaymentReceipt", "PaymentInvoice"]);
  });
});
