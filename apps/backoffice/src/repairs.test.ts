import { describe, expect, it } from "vitest";
import type { RepairJob, SupplierInvoice } from "./api";
import { filterRefurbishmentRecords, isRepairCostFinal, repairCreateBlockReason, repairDocumentCategories, supplierInvoiceAgingStatus, supplierInvoiceCreateBlockReason } from "./repairs";

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

  it("requires approval before high-cost repairs are final", () => {
    const highCostRepair = { ...baseRepair, cost: 1500, checklistDone: true, approvalStatus: "Pending" as const };

    expect(repairCreateBlockReason(highCostRepair)).toBe("High-cost repair must be approved before it is completed or treated as final.");
    expect(isRepairCostFinal(highCostRepair)).toBe(false);
    expect(repairCreateBlockReason({ ...highCostRepair, approvalStatus: "Approved" })).toBeUndefined();
    expect(isRepairCostFinal({ ...highCostRepair, approvalStatus: "Approved" })).toBe(true);
  });

  it("labels supplier invoice aging states", () => {
    expect(supplierInvoiceAgingStatus({ ...baseInvoice, dueDate: undefined, paidAt: undefined }, "2026-06-10")).toBe("Unmatched");
    expect(supplierInvoiceAgingStatus({ ...baseInvoice, dueDate: "2026-06-09" }, "2026-06-10")).toBe("Overdue");
    expect(supplierInvoiceAgingStatus({ ...baseInvoice, dueDate: "2026-06-15" }, "2026-06-10")).toBe("DueSoon");
    expect(supplierInvoiceAgingStatus({ ...baseInvoice, dueDate: "2026-06-09", paidAt: "2026-06-10" }, "2026-06-10")).toBe("Paid");
  });

  it("limits repair uploads to repair invoice documents", () => {
    expect(repairDocumentCategories).toEqual(["RepairInvoice"]);
  });

  it("filters combined refurbishment records by user-facing keyword, kind, and state", () => {
    const records = filterRefurbishmentRecords(
      [{ ...baseRepair, checklistDone: true }, { ...baseRepair, id: "repair-2", whatToDo: "Replace tyre", repairPart: "Tyre" }],
      [{ ...baseInvoice, paidAt: "2026-06-10" }, { ...baseInvoice, id: "supplier-2", supplierName: "Windscreen Pro", invoiceNumber: "WS-22" }],
      vehicles,
      { keyword: "abc spray", kind: "SupplierInvoice", state: "Done" }
    );

    expect(records).toEqual([{ key: "supplier-supplier-1", kind: "supplierInvoice", invoice: { ...baseInvoice, paidAt: "2026-06-10" } }]);
    expect(filterRefurbishmentRecords([baseRepair], [baseInvoice], vehicles, { state: "Open" }).map((record) => record.key))
      .toEqual(["repair-repair-1", "supplier-supplier-1"]);
  });

  it("keeps all combined refurbishment records with no filters", () => {
    expect(filterRefurbishmentRecords([baseRepair], [baseInvoice], vehicles, {}).map((record) => record.key))
      .toEqual(["repair-repair-1", "supplier-supplier-1"]);
  });

  it("filters repair records by the selected car plate", () => {
    const repairVehicle = { ...vehicles[0], id: "vehicle-2", plateNumber: "BKC3003" };
    const repair = { ...baseRepair, id: "repair-2", vehicleId: repairVehicle.id };

    expect(filterRefurbishmentRecords([baseRepair, repair], [], [vehicles[0], repairVehicle], { keyword: "bkc3003" }).map((record) => record.key))
      .toEqual(["repair-repair-2"]);
  });
});
