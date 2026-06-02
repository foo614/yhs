import { describe, expect, it } from "vitest";
import type { PurchaseInvoice, Vehicle } from "./api";
import { purchaseInvoiceCreateBlockReason, vehicleCreateBlockReason } from "./vehicles";

const baseInvoice: PurchaseInvoice = {
  id: "purchase-1",
  vehicleId: "vehicle-1",
  invoiceNumber: "PI-1001",
  amount: 42000
};

const baseVehicle: Vehicle = {
  id: "vehicle-1",
  plateNumber: "VPK1234",
  make: "Toyota",
  model: "Vios",
  year: 2021,
  stockOwner: "YSHeng",
  status: "Available",
  isPublic: true,
  purchasePrice: 42000,
  sellingPrice: 58000,
  additionalCharges: 600,
  refurbishmentTotal: 3500,
  commissionTotal: 1200,
  bossConfirmed: true,
  contraRangePrice: 56000,
  ucdStatus: "Ready"
};

describe("vehicle purchase workflow helpers", () => {
  it("blocks purchase invoices with duplicate invoice numbers", () => {
    const existing = [
      baseInvoice,
      {
        ...baseInvoice,
        id: "purchase-2",
        invoiceNumber: "PI-1002"
      }
    ];

    expect(purchaseInvoiceCreateBlockReason({
      ...baseInvoice,
      id: "purchase-new",
      invoiceNumber: " pi-1001 "
    }, existing)).toBe("Purchase invoice number is already used.");
  });

  it("blocks purchase invoices with missing invoice numbers or non-positive amounts", () => {
    expect(purchaseInvoiceCreateBlockReason({ ...baseInvoice, invoiceNumber: " " })).toBe("Purchase invoice number is required.");
    expect(purchaseInvoiceCreateBlockReason({ ...baseInvoice, amount: 0 })).toBe("Purchase invoice amount must be greater than zero.");
    expect(purchaseInvoiceCreateBlockReason({ ...baseInvoice, amount: -1 })).toBe("Purchase invoice amount must be greater than zero.");
    expect(purchaseInvoiceCreateBlockReason(baseInvoice)).toBeUndefined();
  });

  it("blocks vehicle intake with missing identity, invalid year, or invalid prices", () => {
    expect(vehicleCreateBlockReason({ ...baseVehicle, plateNumber: " " })).toBe("Car plate is required.");
    expect(vehicleCreateBlockReason({ ...baseVehicle, make: " " })).toBe("Vehicle make is required.");
    expect(vehicleCreateBlockReason({ ...baseVehicle, model: " " })).toBe("Vehicle model is required.");
    expect(vehicleCreateBlockReason({ ...baseVehicle, year: 1899 })).toBe("Vehicle year must be between 1900 and 2100.");
    expect(vehicleCreateBlockReason({ ...baseVehicle, purchasePrice: -1 })).toBe("Purchase price cannot be negative.");
    expect(vehicleCreateBlockReason({ ...baseVehicle, sellingPrice: 0 })).toBe("Selling price must be greater than zero.");
    expect(vehicleCreateBlockReason({ ...baseVehicle, additionalCharges: -1 })).toBe("Additional charges cannot be negative.");
    expect(vehicleCreateBlockReason({ ...baseVehicle, refurbishmentTotal: -1 })).toBe("Refurbishment total cannot be negative.");
    expect(vehicleCreateBlockReason({ ...baseVehicle, commissionTotal: -1 })).toBe("Commission cannot be negative.");
    expect(vehicleCreateBlockReason({ ...baseVehicle, contraRangePrice: -1 })).toBe("Contra range price cannot be negative.");
    expect(vehicleCreateBlockReason({ ...baseVehicle, outstationPickupAllowance: -1 })).toBe("Outstation pickup allowance cannot be negative.");
    expect(vehicleCreateBlockReason(baseVehicle)).toBeUndefined();
  });

  it("blocks vehicle intake with duplicate car plates", () => {
    expect(vehicleCreateBlockReason({
      ...baseVehicle,
      id: "vehicle-new",
      plateNumber: " vpk1234 "
    }, [baseVehicle])).toBe("Car plate already exists in inventory.");
  });
});
