import { describe, expect, it } from "vitest";
import { inspectionReceiptNumber } from "./inspectionReceipt";

describe("inspection receipt grouping from one invoice input", () => {
  it("groups manually suffixed invoices under the original receipt without rewriting the invoice", () => {
    expect(inspectionReceiptNumber(" INV-77 (2) ", [])).toBe("INV-77");
    expect(inspectionReceiptNumber("INV-77", [])).toBe("INV-77");
    expect(inspectionReceiptNumber("INV-77 (COPY)", [])).toBe("INV-77 (COPY)");
  });

  it("retains a legacy original receipt for later vehicle allocations including cancelled history", () => {
    expect(inspectionReceiptNumber("inv-77 (2)", [
      { sourceReceiptNumber: "RECEIPT-1", supplierInvoiceReference: "INV-77" },
      { sourceReceiptNumber: "receipt-1", supplierInvoiceReference: "INV-77 (1)" }
    ]).toUpperCase()).toBe("RECEIPT-1");
  });

  it("uses an existing original receipt even when its legacy invoice number differs", () => {
    expect(inspectionReceiptNumber("RECEIPT-1 (1)", [
      { sourceReceiptNumber: "RECEIPT-1", supplierInvoiceReference: "OTHER-INVOICE" }
    ])).toBe("RECEIPT-1");
  });

  it("blocks ambiguous historical groups instead of bypassing allocation totals", () => {
    expect(() => inspectionReceiptNumber("INV-77 (2)", [
      { sourceReceiptNumber: "RECEIPT-1", supplierInvoiceReference: "INV-77" },
      { sourceReceiptNumber: "RECEIPT-2", supplierInvoiceReference: "INV-77 (1)" }
    ])).toThrow("conflicting original receipts");
  });
});
