import { describe, expect, it } from "vitest";
import { effectiveRepairCost, estimatedVehicleProfit, filterOperationIntakeVehicles, getVehicleWorkflowState, vehicleCustomerEditPolicy, vehicleDetailsPersonCreateFlags, vehicleDocumentAllowsPersonSelection, vehicleDocumentCategoriesForOwnership, vehicleDocumentOwnershipDefault, vehicleDocumentsForOwnership, vehicleFromCreateIntakeValues, vehicleLoanHandoffBuyerPolicy, vehicleLoanHandoffStep, vehicleSoldInAnalyticsPeriod, vehicleStatusLabel } from "./VehiclePage";
import type { Lead, LoanApplication, PurchaseInvoice, RepairJob, Vehicle, VehicleDocument } from "../../api";

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

describe("vehicleSoldInAnalyticsPeriod", () => {
  it("uses the Singapore sale date for dashboard sold drill-downs", () => {
    const soldVehicle = { ...baseVehicle, status: "Sold" as const, soldAt: "2026-05-31T17:00:00.000Z" };

    expect(vehicleSoldInAnalyticsPeriod(soldVehicle, { from: "2026-06-01", to: "2026-06-01" })).toBe(true);
    expect(vehicleSoldInAnalyticsPeriod(soldVehicle, { from: "2026-05-31", to: "2026-05-31" })).toBe(false);
    expect(vehicleSoldInAnalyticsPeriod({ ...soldVehicle, soldAt: undefined }, { from: "2026-06-01", to: "2026-06-01" })).toBe(false);
  });
});

describe("vehicle repair cost display", () => {
  it("uses the server final-repair value first, then final repairs, then the intake fallback for the same profit calculation", () => {
    const repairs: RepairJob[] = [
      { id: "repair-1", vehicleId: baseVehicle.id, repairPart: "Paint", whatToDo: "Polish", cost: 450, checklistDone: false, approvalStatus: "Pending" },
      { id: "repair-2", vehicleId: baseVehicle.id, repairPart: "Paint", whatToDo: "Paint", cost: 1500, checklistDone: true, approvalStatus: "Pending" }
    ];

    expect(effectiveRepairCost(baseVehicle, repairs)).toBe(450);
    expect(effectiveRepairCost({ ...baseVehicle, repairCost: 900 }, repairs)).toBe(900);
    expect(effectiveRepairCost({ ...baseVehicle, id: "vehicle-no-repairs" }, repairs)).toBe(1200);
    expect(estimatedVehicleProfit(baseVehicle, effectiveRepairCost({ ...baseVehicle, repairCost: 900 }, repairs))).toBe(4800);
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
  it("locks a retained canonical buyer before starting a new loan after rejection", () => {
    expect(vehicleLoanHandoffBuyerPolicy({ customerId: "former-buyer" })).toEqual({
      locked: true,
      allowedCustomerIds: ["former-buyer"]
    });
    expect(vehicleLoanHandoffBuyerPolicy({ customerId: undefined })).toEqual({ locked: false, allowedCustomerIds: [] });
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

describe("vehicle linked-person creation", () => {
  it("routes New Customer to the vehicle customer link update", () => {
    expect(vehicleDetailsPersonCreateFlags("customer")).toEqual({ customer: true, owner: false });
  });

  it("routes New Owner to the vehicle owner link update", () => {
    expect(vehicleDetailsPersonCreateFlags("owner")).toEqual({ customer: false, owner: true });
  });
});

describe("vehicle status labels", () => {
  it("renders vehicle status values in English without changing enum values", () => {
    expect(vehicleStatusLabel).toEqual({
      Available: "Available",
      LoanProcessing: "Loan in progress",
      Sold: "Sold"
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

describe("vehicleFromCreateIntakeValues", () => {
  const intakeValues = {
    plateNumber: "VAA1001",
    make: "Toyota",
    model: "Vios",
    year: 2022,
    bossConfirmed: true,
    isPublic: true
  };

  it("keeps new vehicles Available and defaults the stock owner", () => {
    expect(vehicleFromCreateIntakeValues(intakeValues, false, "vehicle-new")).toMatchObject({
      id: "vehicle-new",
      status: "Available",
      stockOwner: "YSHeng",
      bossConfirmed: false,
      isPublic: false
    });
  });

  it("keeps new vehicles hidden even when management approves intake", () => {
    expect(vehicleFromCreateIntakeValues(intakeValues, true, "vehicle-new")).toMatchObject({
      bossConfirmed: true,
      isPublic: false
    });
  });
});

describe("vehicle document ownership", () => {
  it("uses the approved defaults and only offers person selection for person-owned categories", () => {
    expect(vehicleDocumentOwnershipDefault("IdentityCard")).toBe("Buyer");
    expect(vehicleDocumentOwnershipDefault("PurchaseInvoice")).toBe("Seller");
    expect(vehicleDocumentOwnershipDefault("Voc")).toBe("Seller");
    expect(vehicleDocumentOwnershipDefault("ApDocument")).toBe("Seller");
    expect(vehicleDocumentOwnershipDefault("LoanDocument")).toBe("Buyer");
    expect(vehicleDocumentOwnershipDefault("DeliveryDocument")).toBe("Buyer");
    expect(vehicleDocumentOwnershipDefault("Policy")).toBe("Buyer");
    expect(vehicleDocumentOwnershipDefault("RepairInvoice")).toBe("Vehicle");
    expect(vehicleDocumentAllowsPersonSelection("IdentityCard")).toBe(true);
    expect(vehicleDocumentAllowsPersonSelection("PurchaseInvoice")).toBe(true);
    expect(vehicleDocumentAllowsPersonSelection("LoanDocument")).toBe(true);
    expect(vehicleDocumentAllowsPersonSelection("RepairInvoice")).toBe(false);
  });

  it("keeps IdentityCard available in both person tabs without duplicating history", () => {
    const documents = [
      { id: "seller-ic", category: "IdentityCard", ownershipType: "Seller" },
      { id: "buyer-ic", category: "IdentityCard", ownershipType: "Buyer" },
      { id: "repair", category: "RepairInvoice", ownershipType: "Vehicle" }
    ] as VehicleDocument[];

    expect(vehicleDocumentCategoriesForOwnership("Seller")).toEqual(["PurchaseInvoice", "Voc", "IdentityCard", "ApDocument"]);
    expect(vehicleDocumentCategoriesForOwnership("Buyer")).toEqual(["IdentityCard", "LoanDocument", "DeliveryDocument", "Policy"]);
    expect(vehicleDocumentsForOwnership(documents, "Seller", "IdentityCard").map((document) => document.id)).toEqual(["seller-ic"]);
    expect(vehicleDocumentsForOwnership(documents, "Buyer", "IdentityCard").map((document) => document.id)).toEqual(["buyer-ic"]);
    expect(vehicleDocumentsForOwnership(documents, "Vehicle", "RepairInvoice").map((document) => document.id)).toEqual(["repair"]);
  });
});
