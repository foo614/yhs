import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { canApplyVehicleUploadLoad, canStartVehicleUploadLoad, effectiveCommissionCost, effectivePickupAllowanceCost, effectiveRepairCost, estimatedVehicleProfit, filterOperationIntakeVehicles, filterVehiclesForDashboardFocus, getVehicleWorkflowState, identityCardEnding, IntakeChecklistCard, ownerFromIdentityCardReview, ownerIdentityCardReadFailed, ownerPurchaseInvoiceGenerationBlockReason, possibleOwnersForIdentityReview, PurchaseInvoiceHistory, purchaseInvoiceCreateInitialValues, purchaseInvoiceFromCreateValues, savePurchaseInvoiceRecord, settlementFromVehicleIntakeValues, vehicleCustomerEditPolicy, vehicleDetailsPersonCreateFlags, vehicleDocumentAllowsPersonSelection, vehicleDocumentCategoriesForOwnership, vehicleDocumentOwnershipDefault, vehicleDocumentOwnershipSelection, vehicleDocumentsForOwnership, vehicleFromCreateIntakeValues, vehicleFromEditValues, vehicleIntakeChecklistTab, vehicleLoanHandoffBuyerPolicy, vehicleLoanHandoffStep, vehiclePhotoDeleteConfirmationText, vehicleSellingPriceChanged, vehicleSellingPriceEditPolicy, vehicleSoldInAnalyticsPeriod, vehicleStatusLabel } from "./VehiclePage";
import type { BrokerCommission, Lead, LoanApplication, PaymentVoucher, PurchaseInvoice, RepairJob, Supplier, Vehicle, VehicleDocument } from "../../api";

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
    expect(filterOperationIntakeVehicles(vehicles, purchaseInvoices, leads, { keyword: "VAA1001 Vios 2022" }).map((vehicle) => vehicle.id)).toEqual(["vehicle-1"]);
    expect(filterOperationIntakeVehicles([{ ...baseVehicle, plateNumber: "VAA 1001" }], purchaseInvoices, leads, { keyword: "VAA1001 Vios 2022" }).map((vehicle) => vehicle.id)).toEqual(["vehicle-1"]);
    expect(filterOperationIntakeVehicles(vehicles, purchaseInvoices, leads, { stockOwner: "KS", approval: "pending", outstationPickup: "scheduled" }).map((vehicle) => vehicle.id)).toEqual(["vehicle-2"]);
    expect(filterOperationIntakeVehicles(vehicles, purchaseInvoices, leads, { ownerLink: "missing", customerLink: "missing", invoiceLink: "missing" }).map((vehicle) => vehicle.id)).toEqual(["vehicle-2"]);
    expect(filterOperationIntakeVehicles(vehicles, purchaseInvoices, leads, { leadActivity: "active" }).map((vehicle) => vehicle.id)).toEqual(["vehicle-1"]);
    expect(filterOperationIntakeVehicles(vehicles, purchaseInvoices, leads, { leadActivity: "none" }).map((vehicle) => vehicle.id)).toEqual(["vehicle-2", "vehicle-3"]);
  });

  it("combines the structured plate, make, model, and year fields", () => {
    expect(filterOperationIntakeVehicles(vehicles, purchaseInvoices, leads, {
      plate: "VAA 1001",
      make: "Toyota",
      model: "Vios",
      year: 2022
    }).map((vehicle) => vehicle.id)).toEqual(["vehicle-1"]);
    expect(filterOperationIntakeVehicles(vehicles, purchaseInvoices, leads, { make: "Toyota", model: "City" })).toEqual([]);
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

describe("dashboard vehicle focus", () => {
  it("keeps the projected-profit drill-down scoped to unsold stock", () => {
    expect(filterVehiclesForDashboardFocus(vehicles, "profit").map((vehicle) => vehicle.id)).toEqual(["vehicle-1", "vehicle-2"]);
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

describe("vehicle projected profit", () => {
  it("uses linked commission and payment-voucher records instead of vehicle snapshot fields", () => {
    const vehicle = { ...baseVehicle, commissionTotal: 900, outstationPickupAllowance: 600 };
    const brokerCommissions: BrokerCommission[] = [
      { id: "commission-1", vehicleId: vehicle.id, brokerName: "Broker A", amount: 100, isPaid: false, cp58Required: false, cp58Prepared: false },
      { id: "commission-2", vehicleId: vehicle.id, brokerName: "Broker B", amount: 150, isPaid: true, cp58Required: false, cp58Prepared: false }
    ];
    const paymentVouchers: PaymentVoucher[] = [
      { id: "voucher-1", vehicleId: vehicle.id, payeeName: "Driver A", amount: 80, purpose: "Pickup", status: "Approved", issuedDate: "2026-06-01" },
      { id: "voucher-2", vehicleId: vehicle.id, payeeName: "Driver B", amount: 120, purpose: "Pickup", status: "Paid", issuedDate: "2026-06-02" }
    ];

    const commissionCost = effectiveCommissionCost(vehicle, brokerCommissions);
    const pickupAllowanceCost = effectivePickupAllowanceCost(vehicle, paymentVouchers);

    expect(commissionCost).toBe(250);
    expect(pickupAllowanceCost).toBe(200);
    expect(estimatedVehicleProfit(vehicle, vehicle.refurbishmentTotal, commissionCost, pickupAllowanceCost)).toBe(4850);
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

describe("vehicle intake checklist navigation", () => {
  it("maps every operational checklist action to its existing detail tab", () => {
    expect(vehicleIntakeChecklistTab("owner")).toBe("overview");
    expect(vehicleIntakeChecklistTab("purchase-invoice")).toBe("documents");
    expect(vehicleIntakeChecklistTab("captured-data")).toBe("documents");
    expect(vehicleIntakeChecklistTab("management-approval")).toBe("vehicle");
    expect(vehicleIntakeChecklistTab("ucd")).toBe("vehicle");
    expect(vehicleIntakeChecklistTab("outstation-pickup")).toBe("vehicle");
    expect(vehicleIntakeChecklistTab("sales-leads")).toBe("people");
  });

  it("activates the whole card by click, Enter, or Space without nesting another control", () => {
    let activations = 0;
    const element = IntakeChecklistCard({
      className: "ready",
      actionLabel: "Open owner / 查看原车主",
      onActivate: () => { activations += 1; },
      children: createElement("strong", null, "Owner name")
    });
    const props = element.props as {
      role: string;
      tabIndex: number;
      onClick: () => void;
      onKeyDown: (event: { key: string; preventDefault: () => void }) => void;
    };
    let prevented = 0;

    expect(props.role).toBe("button");
    expect(props.tabIndex).toBe(0);
    props.onClick();
    props.onKeyDown({ key: "Enter", preventDefault: () => { prevented += 1; } });
    props.onKeyDown({ key: " ", preventDefault: () => { prevented += 1; } });
    props.onKeyDown({ key: "Escape", preventDefault: () => { prevented += 1; } });

    expect(activations).toBe(3);
    expect(prevented).toBe(2);
    expect(renderToStaticMarkup(element)).not.toContain("<button");
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

  it("sends bank debt and the reviewed price, leaving owner, direction and amount server-owned", () => {
    expect(settlementFromVehicleIntakeValues({
      ...intakeValues,
      ownerId: "owner-1",
      purchasePrice: 49_900,
      bankDebtAmount: 35_000,
      prepareSettlement: true,
      settlementDeadline: "2026-09-01"
    }, "vehicle-new", "settlement-new")).toEqual({
      bankDebtAmount: 35_000,
      expectedPurchasePrice: 49_900,
      deadline: "2026-09-01"
    });
  });

  it("does not create a settlement when the staff member leaves it for Finance", () => {
    expect(settlementFromVehicleIntakeValues({ ...intakeValues, prepareSettlement: false }, "vehicle-new", "settlement-new")).toBeUndefined();
  });
});

describe("approved vehicle selling price controls", () => {
  it("locks an approved selling price for Sales while leaving Boss/Admin a warned reprice path", () => {
    expect(vehicleSellingPriceEditPolicy(baseVehicle, false)).toEqual({ locked: true, warnsBeforeReprice: false });
    expect(vehicleSellingPriceEditPolicy(baseVehicle, true)).toEqual({ locked: false, warnsBeforeReprice: true });
    expect(vehicleSellingPriceChanged(58_000, 58_000)).toBe(false);
    expect(vehicleSellingPriceChanged(58_000, 58_000.001)).toBe(true);
    expect(vehicleSellingPriceChanged(58_000, 57_500)).toBe(true);
  });

  it("ignores a crafted Sales price change after approval", () => {
    const result = vehicleFromEditValues({ ...baseVehicle, sellingPrice: 50_000 }, baseVehicle, false);

    expect(result).toMatchObject({ sellingPrice: 58_000, bossConfirmed: true, isPublic: true });
  });

  it("revokes approval and public visibility when Boss/Admin reprices an approved vehicle", () => {
    const result = vehicleFromEditValues({ ...baseVehicle, sellingPrice: 57_500 }, baseVehicle, true);

    expect(result).toMatchObject({ sellingPrice: 57_500, bossConfirmed: false, isPublic: false });
  });
});

describe("previous owner identity review", () => {
  it("creates a trimmed owner draft and formats a 12-digit IC number", () => {
    expect(ownerFromIdentityCardReview({
      name: "  Lim Owner  ",
      phone: " 019-888 7777 ",
      icNumber: "900101011234",
      address: "  12 Jalan Demo  "
    }, "owner-new")).toEqual({
      id: "owner-new",
      name: "Lim Owner",
      phone: "019-888 7777",
      icNumber: "900101-01-1234",
      address: "12 Jalan Demo"
    });
  });

  it("does not copy an IC-shaped OCR value into the owner address", () => {
    for (const address of ["900101-01-1234", "IC: 900101-01-1234", "NRIC 900101-01-1234"]) {
      expect(ownerFromIdentityCardReview({
        name: "Lim Owner",
        phone: "019-888 7777",
        icNumber: "900101011234",
        address
      }, "owner-new").address).toBeUndefined();
    }
  });

  it("keeps a real address even when its street and postcode digits total twelve", () => {
    expect(ownerFromIdentityCardReview({
      name: "Lim Owner",
      phone: "019-888 7777",
      icNumber: "900101011234",
      address: "NO 12 JALAN 34 TAMAN 567 50000 KUALA LUMPUR"
    }, "owner-new").address).toBe("NO 12 JALAN 34 TAMAN 567 50000 KUALA LUMPUR");
  });

  it("removes only an IC-only header from a multiline OCR address", () => {
    expect(ownerFromIdentityCardReview({
      name: "Lim Owner",
      phone: "019-888 7777",
      icNumber: "900101011234",
      address: "900101-01-1234\nNO 12 JALAN 34 TAMAN 567\n50000 KUALA LUMPUR"
    }, "owner-new").address).toBe("NO 12 JALAN 34 TAMAN 567\n50000 KUALA LUMPUR");
  });

  it("removes an IC label only when an actual address follows the ID", () => {
    expect(ownerFromIdentityCardReview({
      name: "Lim Owner",
      phone: "019-888 7777",
      icNumber: "900101011234",
      address: "IC: 900101-01-1234\nNO 12 JALAN 34 TAMAN 567\n50000 KUALA LUMPUR"
    }, "owner-new").address).toBe("NO 12 JALAN 34 TAMAN 567\n50000 KUALA LUMPUR");
  });

  it("suggests exact normalized name matches for manual duplicate review", () => {
    const owners = [
      { id: "owner-1", name: "Lim   Owner", phone: "0198887777" },
      { id: "owner-2", name: "Different Owner", phone: "0112223333" }
    ];

    expect(possibleOwnersForIdentityReview(owners, " lim owner ").map((owner) => owner.id)).toEqual(["owner-1"]);
  });

  it("shows the unreadable recovery state only when OCR found no useful identity fields", () => {
    expect(ownerIdentityCardReadFailed({
      result: {
        documentCategory: "IdentityCard",
        confidence: 0,
        fieldConfidence: {},
        fields: {},
        rawText: "",
        warnings: ["Automatic reading was unavailable."]
      }
    })).toBe(true);

    expect(ownerIdentityCardReadFailed({
      result: {
        documentCategory: "IdentityCard",
        confidence: 0.7,
        fieldConfidence: { icNumber: 0.7 },
        fields: { icNumber: "900101011234" },
        rawText: "900101011234",
        warnings: []
      }
    })).toBe(false);
  });

  it("shows only the final four NRIC digits in the compact owner summary", () => {
    expect(identityCardEnding("900101-01-1234")).toBe("1234");
    expect(identityCardEnding(undefined)).toBeUndefined();
  });
});

describe("vehicle document ownership", () => {
  it("defaults the document party to the previous owner while preserving an explicit Buyer selection", () => {
    expect(vehicleDocumentOwnershipSelection()).toBe("Seller");
    expect(vehicleDocumentOwnershipSelection("Buyer", "Seller")).toBe("Buyer");
    expect(vehicleDocumentOwnershipSelection(undefined, "Buyer")).toBe("Buyer");
  });

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
    expect(vehicleDocumentAllowsPersonSelection("PurchaseInvoice")).toBe(false);
    expect(vehicleDocumentAllowsPersonSelection("LoanDocument")).toBe(true);
    expect(vehicleDocumentAllowsPersonSelection("RepairInvoice")).toBe(false);
  });

  it("keeps IdentityCard available in both person tabs without duplicating history", () => {
    const documents = [
      { id: "historic-purchase-invoice", category: "PurchaseInvoice", ownershipType: "Seller" },
      { id: "seller-ic", category: "IdentityCard", ownershipType: "Seller" },
      { id: "buyer-ic", category: "IdentityCard", ownershipType: "Buyer" },
      { id: "repair", category: "RepairInvoice", ownershipType: "Vehicle" }
    ] as VehicleDocument[];

    expect(vehicleDocumentCategoriesForOwnership("Seller")).toEqual(["PurchaseInvoice", "Voc", "IdentityCard", "ApDocument"]);
    expect(vehicleDocumentCategoriesForOwnership("Buyer")).toEqual(["IdentityCard", "LoanDocument", "DeliveryDocument", "Policy"]);
    expect(vehicleDocumentCategoriesForOwnership("Seller", documents)).toEqual(["PurchaseInvoice", "Voc", "IdentityCard", "ApDocument"]);
    expect(vehicleDocumentsForOwnership(documents, "Seller", "IdentityCard").map((document) => document.id)).toEqual(["seller-ic"]);
    expect(vehicleDocumentsForOwnership(documents, "Buyer", "IdentityCard").map((document) => document.id)).toEqual(["buyer-ic"]);
    expect(vehicleDocumentsForOwnership(documents, "Vehicle", "RepairInvoice").map((document) => document.id)).toEqual(["repair"]);
  });
});

describe("structured purchase invoice entry", () => {
  const activeSupplier: Supplier = {
    id: "supplier-active",
    companyName: "Active Motors",
    address: "Supplier address",
    phone: "0123456789",
    status: "Active"
  };
  const inactiveSupplier: Supplier = { ...activeSupplier, id: "supplier-inactive", companyName: "Inactive Motors", status: "Inactive" };

  it("renders the reachable formal-generation action and keeps legacy helper defaults available", () => {
    const markup = renderToStaticMarkup(createElement(PurchaseInvoiceHistory, {
      invoices: [],
      columns: [],
      pagination: { pageSize: 5 },
      onGenerate: () => undefined
    }));
    const initialValues = purchaseInvoiceCreateInitialValues("vehicle-2", [inactiveSupplier, activeSupplier]);

    expect(markup).toContain("Generate Purchase Invoice");
    expect(markup).not.toContain("Reset");
    expect(markup).not.toContain("Search");
    expect(initialValues.vehicleId).toBe("vehicle-2");
    expect(initialValues.supplierId).toBe("supplier-active");
    expect(initialValues.lines).toEqual([{ lineType: "VehiclePurchase", description: "Vehicle purchase", capitaliseIntoVehicleCost: true }]);
  });

  it("blocks formal owner generation until the approved intake has a previous owner, source data, and a positive price", () => {
    expect(ownerPurchaseInvoiceGenerationBlockReason({ bossConfirmed: false, ownerId: "owner-1", purchasePrice: 42000, intakeDate: "2026-09-05" }, { id: "owner-1", name: "Owner", phone: "0123456789" })).toContain("approved");
    expect(ownerPurchaseInvoiceGenerationBlockReason({ bossConfirmed: true, ownerId: undefined, purchasePrice: 42000, intakeDate: "2026-09-05" }, undefined)).toContain("previous owner");
    expect(ownerPurchaseInvoiceGenerationBlockReason({ bossConfirmed: true, ownerId: "owner-1", purchasePrice: 0, intakeDate: "2026-09-05" }, { id: "owner-1", name: "Owner", phone: "0123456789" })).toContain("greater than zero");
    expect(ownerPurchaseInvoiceGenerationBlockReason({ bossConfirmed: true, ownerId: "owner-1", purchasePrice: 42000, intakeDate: "2026-09-05" }, { id: "owner-1", name: "Owner", phone: "0123456789" })).toBeUndefined();
  });

  it("maps entered values into the structured record with GUID line ids", () => {
    const invoiceId = "550e8400-e29b-41d4-a716-446655440000";
    const lineId = "550e8400-e29b-41d4-a716-446655440001";
    const invoice = purchaseInvoiceFromCreateValues({
      vehicleId: "vehicle-2",
      supplierId: "supplier-approved",
      invoiceNumber: "INV-2002",
      invoiceDate: dayjs("2026-09-06"),
      purchaseDate: dayjs("2026-09-05"),
      paymentReference: "PAY-2002",
      lines: [{ lineType: "VehiclePurchase", description: "Honda City", amount: 42000, capitaliseIntoVehicleCost: true }]
    }, invoiceId, () => lineId);

    expect(invoice).toMatchObject({
      id: invoiceId,
      vehicleId: "vehicle-2",
      supplierId: "supplier-approved",
      invoiceNumber: "INV-2002",
      invoiceDate: "2026-09-06",
      purchaseDate: "2026-09-05",
      paymentReference: "PAY-2002",
      amount: 42000,
      accountingStatus: "Draft"
    });
    expect(invoice.lines).toEqual([expect.objectContaining({ id: lineId, purchaseInvoiceId: invoiceId, description: "Honda City", amount: 42000 })]);
    expect(invoice.lines?.every((line) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(line.id))).toBe(true);
  });

  it("keeps the create form open when the API rejects without leaking a rejected promise", async () => {
    const invoice = purchaseInvoiceFromCreateValues({
      vehicleId: "vehicle-2",
      invoiceNumber: "INV-2002",
      invoiceDate: dayjs("2026-09-06"),
      lines: [{ lineType: "VehiclePurchase", description: "Honda City", amount: 42000 }]
    }, "550e8400-e29b-41d4-a716-446655440000", () => "550e8400-e29b-41d4-a716-446655440001");

    await expect(savePurchaseInvoiceRecord(invoice, async () => {
      throw new Error("duplicate invoice");
    })).resolves.toBe(false);
  });
});

describe("vehicle upload load generations", () => {
  it("does not let an A upload completion invalidate a pending B load", () => {
    let currentRequestId = 0;
    const bRequestId = canStartVehicleUploadLoad("vehicle-b", "vehicle-b") ? ++currentRequestId : 0;

    expect(canStartVehicleUploadLoad("vehicle-a", "vehicle-b")).toBe(false);
    expect(canStartVehicleUploadLoad("", "vehicle-b")).toBe(false);
    expect(currentRequestId).toBe(bRequestId);
    expect(canApplyVehicleUploadLoad(bRequestId, currentRequestId, "vehicle-b", "vehicle-b")).toBe(true);
  });

  it("still rejects an older same-vehicle result after a newer request starts", () => {
    expect(canApplyVehicleUploadLoad(1, 2, "vehicle-a", "vehicle-a")).toBe(false);
    expect(canApplyVehicleUploadLoad(2, 2, "vehicle-a", "vehicle-a")).toBe(true);
  });
});

describe("vehicle photo delete confirmation", () => {
  it("names the selected file and explains permanent gallery removal", () => {
    const text = vehiclePhotoDeleteConfirmationText("front-photo.png");

    expect(text).toContain("front-photo.png");
    expect(text).toContain("permanently");
    expect(text).toContain("public gallery");
  });
});
