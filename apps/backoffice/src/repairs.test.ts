import { describe, expect, it } from "vitest";
import type { RepairJob, SupplierInvoice } from "./api";
import { repairCreateBlockReason, repairDocumentCategories, supplierInvoiceCreateBlockReason } from "./repairs";

const baseInvoice: SupplierInvoice = {
  id: "supplier-1",
  vehicleId: "vehicle-1",
  supplierName: "ABC Spray",
  invoiceNumber: "INV-1001",
  plateNumberOnInvoice: "VPK 1234",
  amount: 800
};

const vehicles = [
  { id: "vehicle-1", plateNumber: "VPK1234", make: "Toyota", model: "Vios", stockOwner: "YSHeng" as const, status: "Available" as const }
];

const baseRepair: RepairJob = {
  id: "repair-1",
  vehicleId: "vehicle-1",
  repairPart: "Bumper",
  whatToDo: "Polish bumper",
  cost: 800,
  checklistDone: false
};

describe("repair supplier invoice helpers", () => {
  it("blocks supplier invoices with duplicate supplier and invoice numbers", () => {
    const existing = [
      baseInvoice,
      {
        ...baseInvoice,
        id: "supplier-2",
        invoiceNumber: "INV-1002"
      }
    ];

    expect(supplierInvoiceCreateBlockReason({
      ...baseInvoice,
      id: "supplier-new",
      supplierName: " abc spray ",
      invoiceNumber: " inv-1001 "
    }, existing)).toBe("Supplier invoice number is already used for this supplier.");
  });

  it("blocks supplier invoices with missing supplier, missing invoice, or non-positive amount", () => {
    expect(supplierInvoiceCreateBlockReason({ ...baseInvoice, supplierName: " " })).toBe("Supplier name is required.");
    expect(supplierInvoiceCreateBlockReason({ ...baseInvoice, invoiceNumber: " " })).toBe("Supplier invoice number is required.");
    expect(supplierInvoiceCreateBlockReason({ ...baseInvoice, amount: 0 })).toBe("Supplier invoice amount must be greater than zero.");
    expect(supplierInvoiceCreateBlockReason({ ...baseInvoice, amount: -1 })).toBe("Supplier invoice amount must be greater than zero.");
    expect(supplierInvoiceCreateBlockReason(baseInvoice, [], vehicles)).toBeUndefined();
  });

  it("blocks supplier invoices when the printed plate does not match the selected vehicle", () => {
    expect(supplierInvoiceCreateBlockReason({ ...baseInvoice, plateNumberOnInvoice: "WRONG 999" }, [], vehicles)).toBe("Supplier invoice plate does not match the selected car plate.");
    expect(supplierInvoiceCreateBlockReason({ ...baseInvoice, plateNumberOnInvoice: "vpk-1234" }, [], vehicles)).toBeUndefined();
  });

  it("blocks repair jobs with missing task descriptions or negative costs", () => {
    expect(repairCreateBlockReason({ ...baseRepair, whatToDo: " " })).toBe("Repair task is required.");
    expect(repairCreateBlockReason({ ...baseRepair, cost: -1 })).toBe("Repair cost cannot be negative.");
    expect(repairCreateBlockReason({ ...baseRepair, cost: 0 })).toBeUndefined();
    expect(repairCreateBlockReason(baseRepair)).toBeUndefined();
  });

  it("limits repair uploads to repair invoice documents", () => {
    expect(repairDocumentCategories).toEqual(["RepairInvoice"]);
  });
});
