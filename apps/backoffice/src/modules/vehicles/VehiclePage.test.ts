import { describe, expect, it } from "vitest";
import { filterOperationIntakeVehicles, getVehicleWorkflowState, vehicleCustomerEditPolicy, vehicleLoanHandoffStep } from "./VehiclePage";
import type { Lead, LoanApplication, PurchaseInvoice, Vehicle } from "../../api";

const baseVehicle: Vehicle = {
  id: "vehicle-1",
  plateNumber: "VAA1001",
  make: "Toyota",
  model: "Vios",
  year: 2022,
  stockOwner: "YSHeng",
  stockLocation: "Main Yard",
  status: "Available",
  isPublic: true,
  purchasePrice: 52000,
  sellingPrice: 58000,
  additionalCharges: 500,
  refurbishmentTotal: 1200,
  commissionTotal: 800,
  bossConfirmed: true,
  contraRangePrice: 56000,
  ucdStatus: "Ready",
  ownerId: "owner-1",
  customerId: "customer-1"
};

const vehicles: Vehicle[] = [
  baseVehicle,
  {
    ...baseVehicle,
    id: "vehicle-2",
    plateNumber: "WBB2002",
    make: "Honda",
    model: "City",
    stockOwner: "KS",
    status: "LoanProcessing",
    isPublic: false,
    bossConfirmed: false,
    ownerId: undefined,
    customerId: undefined,
    outstationPickupScheduledAt: "2026-06-08T09:30:00"
  },
  {
    ...baseVehicle,
    id: "vehicle-3",
    plateNumber: "JCC3003",
    make: "Perodua",
    model: "Myvi",
    status: "Sold",
    isPublic: false,
    ownerId: "owner-2",
    customerId: undefined
  }
];

const purchaseInvoices: PurchaseInvoice[] = [
  { id: "invoice-1", vehicleId: "vehicle-1", invoiceNumber: "PI-001", amount: 52000 }
];

const leads: Lead[] = [
  { id: "lead-1", vehicleId: "vehicle-1", customerName: "Ali", phone: "0123456789", status: "New", createdAt: "2026-06-08T00:00:00Z" },
  { id: "lead-2", vehicleId: "vehicle-3", customerName: "Closed Lead", phone: "0199999999", status: "Closed", createdAt: "2026-06-08T00:00:00Z" }
];

describe("filterOperationIntakeVehicles", () => {
  it("filters by keyword, workflow state, linked records, invoices, outstation pickup, and active leads", () => {
    expect(filterOperationIntakeVehicles(vehicles, purchaseInvoices, leads, { keyword: "vios", status: "Available" }).map((vehicle) => vehicle.id)).toEqual(["vehicle-1"]);
    expect(filterOperationIntakeVehicles(vehicles, purchaseInvoices, leads, { stockOwner: "KS", approval: "pending", outstationPickup: "scheduled" }).map((vehicle) => vehicle.id)).toEqual(["vehicle-2"]);
    expect(filterOperationIntakeVehicles(vehicles, purchaseInvoices, leads, { ownerLink: "missing", customerLink: "missing", invoiceLink: "missing" }).map((vehicle) => vehicle.id)).toEqual(["vehicle-2"]);
    expect(filterOperationIntakeVehicles(vehicles, purchaseInvoices, leads, { leadActivity: "active" }).map((vehicle) => vehicle.id)).toEqual(["vehicle-1"]);
    expect(filterOperationIntakeVehicles(vehicles, purchaseInvoices, leads, { leadActivity: "none" }).map((vehicle) => vehicle.id)).toEqual(["vehicle-2", "vehicle-3"]);
  });
});

describe("vehicleLoanHandoffStep", () => {
  it("opens an existing loan without asking for the buyer again", () => {
    expect(vehicleLoanHandoffStep({ status: "LoanProcessing", customerId: undefined })).toBe("open-existing");
  });

  it("routes available stock through buyer selection and confirmation", () => {
    expect(vehicleLoanHandoffStep({ status: "Available", customerId: undefined })).toBe("select-buyer");
    expect(vehicleLoanHandoffStep({ status: "Available", customerId: "customer-1" })).toBe("confirm-start");
  });
});

describe("vehicleCustomerEditPolicy", () => {
  const activeLoan: LoanApplication = { id: "loan-1", vehicleId: "vehicle-1", customerId: "customer-1", status: "Pending", louApproved: false, louDone: false };

  it("lets staff repair a missing canonical buyer using only the active loan customer", () => {
    expect(vehicleCustomerEditPolicy({ id: "vehicle-1", customerId: undefined }, [activeLoan])).toEqual({
      locked: false,
      allowedCustomerIds: ["customer-1"]
    });
  });

  it("locks an established canonical buyer while the loan stays active", () => {
    expect(vehicleCustomerEditPolicy({ id: "vehicle-1", customerId: "customer-1" }, [activeLoan])).toEqual({
      locked: true,
      allowedCustomerIds: ["customer-1"]
    });
  });
});

describe("getVehicleWorkflowState", () => {
  it("uses one state model for approval, publishing, buyer linking, and loans", () => {
    expect(getVehicleWorkflowState({ status: "Available", bossConfirmed: false, isPublic: false, customerId: undefined }).nextLabel).toBe("Review Approval");
    expect(getVehicleWorkflowState({ status: "Available", bossConfirmed: true, isPublic: false, customerId: undefined }).action).toBe("publish");
    expect(getVehicleWorkflowState({ status: "Available", bossConfirmed: true, isPublic: true, customerId: undefined }).nextLabel).toBe("Link Buyer");
    expect(getVehicleWorkflowState({ status: "Available", bossConfirmed: true, isPublic: true, customerId: "customer-1" }).action).toBe("start-loan");
    expect(getVehicleWorkflowState({ status: "LoanProcessing", bossConfirmed: true, isPublic: false, customerId: "customer-1" }).nextLabel).toBe("Open Loan");
    expect(getVehicleWorkflowState({ status: "Sold", bossConfirmed: true, isPublic: false, customerId: "customer-1" }).action).toBe("none");
  });
});
