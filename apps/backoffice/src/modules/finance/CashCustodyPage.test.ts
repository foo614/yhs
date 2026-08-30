import { describe, expect, it } from "vitest";
import type { CashHandover, CashHandoverPaymentLookup } from "../../api";
import { filterCashHandovers } from "./CashCustodyPage";

const handovers: CashHandover[] = [
  {
    id: "handover-1",
    paymentRecordId: "payment-1",
    vehicleId: "vehicle-1",
    customerId: "customer-1",
    amount: 500,
    status: "Receipted",
    collectedByUserId: "sales-1",
    collectedAt: "2099-01-01T00:00:00Z",
    officialReceiptNumber: "OR-1001"
  },
  {
    id: "handover-2",
    paymentRecordId: "payment-2",
    vehicleId: "vehicle-2",
    customerId: "customer-2",
    amount: 800,
    status: "PendingHandover",
    collectedByUserId: "sales-2",
    collectedAt: "2020-01-01T00:00:00Z"
  }
];

const payments: CashHandoverPaymentLookup[] = [
  { paymentRecordId: "payment-1", vehicleId: "vehicle-1", customerId: "customer-1", customerName: "Ali Tan", plateNumber: "VPK 1234", invoiceNumber: "INV-1001", nettPrice: 500 },
  { paymentRecordId: "payment-2", vehicleId: "vehicle-2", customerId: "customer-2", customerName: "Mei Ling", plateNumber: "BKC 3019", invoiceNumber: "INV-2002", nettPrice: 900 }
];

describe("cash custody register filters", () => {
  it("searches compact plates, customers, invoices, and receipts", () => {
    expect(filterCashHandovers(handovers, payments, "VPK1234", "All").map((item) => item.id)).toEqual(["handover-1"]);
    expect(filterCashHandovers(handovers, payments, "mei ling", "All").map((item) => item.id)).toEqual(["handover-2"]);
    expect(filterCashHandovers(handovers, payments, "INV2002", "All").map((item) => item.id)).toEqual(["handover-2"]);
    expect(filterCashHandovers(handovers, payments, "OR1001", "All").map((item) => item.id)).toEqual(["handover-1"]);
  });

  it("filters normal and derived custody states", () => {
    expect(filterCashHandovers(handovers, payments, "", "Receipted").map((item) => item.id)).toEqual(["handover-1"]);
    expect(filterCashHandovers(handovers, payments, "", "Overdue").map((item) => item.id)).toEqual(["handover-2"]);
    expect(filterCashHandovers(handovers, payments, "", "AmountMismatch").map((item) => item.id)).toEqual(["handover-2"]);
  });
});
