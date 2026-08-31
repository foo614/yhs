import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { activeLoanForVehicle, browserRouteUrl, buildRefurbishmentTableRecords, customerIdFromRouteUrl, DashboardPage, DeliveryPage, filterDeliveryAccountingCharges, filterSupplierMaster, LeadsPage, loanIdFromRouteUrl, LoanPage, ModuleDocumentList, receiptVehicleMatchFromOcr, repairReceiptDraftFromOcr, supplierMasterMatchFromOcr, vehicleIdentityFor, vehicleLoanCustomerId } from "./App";
import type { Customer, DashboardSummary, DeliveryAccountingCharge, DeliverySchedule, Lead, LoanApplication, RepairJob, Supplier, SupplierInvoice, Vehicle, VehicleLookup } from "./api";

describe("browser route state", () => {
  it("formats workflow vehicle identity with plate, year, make, and model", () => {
    const vehicles: VehicleLookup[] = [{
      id: "vehicle-1", plateNumber: "BKC3003", year: 2018, make: "Honda", model: "City E 1.5", stockOwner: "YSHeng", status: "Available"
    }];

    expect(vehicleIdentityFor(vehicles, "vehicle-1")).toEqual({
      plateNumber: "BKC3003",
      description: "2018 Honda City E 1.5"
    });
  });

  it("retains Customer 360 query changes for Back and Forward navigation", () => {
    const customerA = browserRouteUrl({ pathname: "/customer-360", search: "?customerId=customer-a" });
    const customerB = browserRouteUrl({ pathname: "/customer-360", search: "?customerId=customer-b" });

    expect(customerIdFromRouteUrl(customerB)).toBe("customer-b");
    expect(customerIdFromRouteUrl(customerA)).toBe("customer-a");
  });

  it("does not treat unrelated route queries as a Customer 360 selection", () => {
    expect(customerIdFromRouteUrl("/finance?tab=cash-custody")).toBeUndefined();
  });

  it("keeps a direct loan handoff target in the route", () => {
    expect(loanIdFromRouteUrl("/loans?loanId=loan-123")).toBe("loan-123");
    expect(loanIdFromRouteUrl("/loans")).toBeUndefined();
  });

  it("uses the existing loan buyer before requiring a vehicle-level buyer", () => {
    expect(vehicleLoanCustomerId({ customerId: undefined })).toBeUndefined();
    expect(vehicleLoanCustomerId({ customerId: "customer-1" })).toBe("customer-1");
    expect(vehicleLoanCustomerId({ customerId: undefined }, { customerId: "loan-customer" })).toBe("loan-customer");
  });

  it("starts a new sale after a rejected loan instead of reopening the rejected record", () => {
    const loans = [
      { id: "rejected", vehicleId: "vehicle-1", customerId: "old-customer", status: "Rejected" as const, louApproved: false, louDone: false },
      { id: "active", vehicleId: "vehicle-2", customerId: "active-customer", status: "Pending" as const, louApproved: false, louDone: false }
    ];

    expect(activeLoanForVehicle(loans, "vehicle-1")).toBeUndefined();
    expect(activeLoanForVehicle(loans, "vehicle-2")?.id).toBe("active");
  });
});

describe("management dashboard", () => {
  it("renders the required KPI labels and keeps projected profit distinct from actual profit", () => {
    const dashboard = {
      totalStock: 3,
      purchaseCost: 156000,
      pendingLoan: 1,
      outstandingPayment: 12000,
      settlementDue: 1,
      repairCost: 1500,
      estimatedProfit: 9000,
      totalProfit: 9000,
      vehicleAging: 1,
      agingBuckets: [{ label: "0-30", count: 1 }, { label: "31-60", count: 1 }, { label: "61+", count: 1 }],
      topSupplier: "Workshop",
      salesPerformance: 1,
      stockStatusMix: [],
      stockOwnerMix: [],
      moneyRiskBreakdown: [{ label: "Outstanding Payment", amount: 12000 }, { label: "Open Debt Recovery", amount: 3000 }],
      workflowBlockers: { byType: [], dueBuckets: [] },
      salesFunnel: { stages: [], conversionRate: 0 },
      topEnquiredVehicles: [],
      repairCostByVehicle: [],
      topSellingModels: [],
      leadTrend: [],
      leadsAwaitingFirstResponse: 0,
      repairWorkInProgress: [],
      realisedProfit: 5000,
      monthlyProfitTrend: [],
      profitBreakdown: [],
      supplierSpendTop: [],
      totalSales: 2,
      actualProfit: 5000,
      outstandingCollection: 15000,
      settlementDueAmount: 2000,
      refurbishment: { finalRepairSpend: 1500, vehicleCount: 1, averageSpendPerVehicle: 1500, workInProgressCount: 1, overdueWorkCount: 0, highestCostVehicles: [] },
      aiDocumentProcessing: {
        scanCount: 8,
        reviewedCount: 5,
        comparedFieldCount: 12,
        correctFieldCount: 9,
        correctedFieldCount: 3,
        accuracyPercent: 75,
        lowConfidenceCount: 2,
        failedCount: 1,
        pendingReviewCount: 3,
        usedThisMonth: 32,
        monthlyRequestLimit: 100,
        remainingThisMonth: 68,
        categories: [
          { category: "IdentityCard", label: "IC", scanCount: 2, reviewedCount: 1, comparedFieldCount: 3, correctFieldCount: 2, correctedFieldCount: 1, accuracyPercent: 66.67, lowConfidenceCount: 1, failedCount: 0 },
          { category: "Voc", label: "VOC", scanCount: 2, reviewedCount: 1, comparedFieldCount: 3, correctFieldCount: 2, correctedFieldCount: 1, accuracyPercent: 66.67, lowConfidenceCount: 0, failedCount: 0 },
          { category: "InvoicesAndReceipts", label: "Invoices & receipts", scanCount: 3, reviewedCount: 2, comparedFieldCount: 6, correctFieldCount: 5, correctedFieldCount: 1, accuracyPercent: 83.33, lowConfidenceCount: 1, failedCount: 0 },
          { category: "SupportingDocuments", label: "Supporting documents", scanCount: 1, reviewedCount: 1, comparedFieldCount: 0, correctFieldCount: 0, correctedFieldCount: 0, accuracyPercent: null, lowConfidenceCount: 0, failedCount: 1 }
        ]
      }
    } satisfies DashboardSummary;

    const markup = renderToStaticMarkup(createElement(DashboardPage, {
      dashboard,
      dashboardLoadError: null,
      reminders: [],
      priorityActions: [{ type: "LeadFollowUp", title: "New enquiry needs first contact", target: "Leads", dueDate: "2026-06-01", subject: "Web lead" }],
      reminderLoadError: null,
      lastCheckedAt: null,
      refreshing: false,
      analyticsPeriod: { from: "2026-06-01", to: "2026-06-30" },
      analyticsRangePreset: "ThisMonth",
      onRefresh: async () => {},
      onAnalyticsPeriodChange: async () => {},
      onNavigate: () => {}
    }));

    expect(markup).toContain("Total Stock / 总库存");
    expect(markup).toContain("Total Sales / 销售总数");
    expect(markup).toContain("Total Profit / 实际利润");
    expect(markup).toContain("Outstanding Collection / 待收总额");
    expect(markup).toContain("Settlement Due / 结算到期");
    expect(markup).toContain("Purchase Cost / 收车成本");
    expect(markup).toContain("Repair Cost / 整备费用");
    expect(markup).toContain("Projected Stock Profit / 库存预计利润");
    expect(markup).toContain("Current unsold stock");
    expect(markup).toContain("New enquiry needs first contact");
    expect(markup).not.toContain("All clear");
    expect(markup).toContain("AI document processing / AI 文件处理");
    expect(markup).toContain("OCR field accuracy / OCR 字段准确率");
    expect(markup).toContain("Invoices &amp; receipts");
    expect(markup).not.toContain("sensitive extracted text");
    expect(markup).not.toContain("Estimated Profit / 预估利润");
    expect(markup).toContain("AI document processing / AI 文件处理");
    expect(markup).toContain("Invoices &amp; receipts");
    expect(markup).not.toContain("identity text");

    const reminderMarkup = renderToStaticMarkup(createElement(DashboardPage, {
      dashboard,
      dashboardLoadError: null,
      reminders: [{
        type: "SettlementDue",
        title: "Settlement deadline due",
        vehiclePlate: "VPK1234",
        vehicleId: "vehicle-1",
        dueDate: "2099-06-01",
        amount: 25000
      }],
      priorityActions: [],
      reminderLoadError: null,
      lastCheckedAt: null,
      refreshing: false,
      analyticsPeriod: { from: "2026-06-01", to: "2026-06-30" },
      analyticsRangePreset: "ThisMonth",
      onRefresh: async () => {},
      onAnalyticsPeriodChange: async () => {},
      onNavigate: () => {}
    }));
    expect(reminderMarkup).toContain("dashboardReminderMobileList");
    expect(reminderMarkup).toContain("Settlement deadline due");
    expect(reminderMarkup).toContain("Open follow-up");

    const emptyMarkup = renderToStaticMarkup(createElement(DashboardPage, {
      dashboard: { ...dashboard, aiDocumentProcessing: { ...dashboard.aiDocumentProcessing!, categories: [] } },
      dashboardLoadError: null,
      reminders: [],
      priorityActions: [],
      reminderLoadError: null,
      lastCheckedAt: null,
      refreshing: false,
      analyticsPeriod: { from: "2026-06-01", to: "2026-06-30" },
      analyticsRangePreset: "ThisMonth",
      onRefresh: async () => {},
      onAnalyticsPeriodChange: async () => {},
      onNavigate: () => {}
    }));
    expect(emptyMarkup).toContain("No OCR activity in this period.");

    const errorMarkup = renderToStaticMarkup(createElement(DashboardPage, {
      dashboard: null,
      dashboardLoadError: "Dashboard request failed",
      reminders: [],
      priorityActions: [],
      reminderLoadError: null,
      lastCheckedAt: null,
      refreshing: false,
      analyticsPeriod: {},
      analyticsRangePreset: "ThisMonth",
      onRefresh: async () => {},
      onAnalyticsPeriodChange: async () => {},
      onNavigate: () => {}
    }));
    expect(errorMarkup).toContain("Dashboard data could not be loaded");
    expect(errorMarkup).not.toContain("identity text");
  });
});

describe("repair receipt OCR drafts", () => {
  it("keeps OCR line items separate from operational repair fields", () => {
    const draft = repairReceiptDraftFromOcr(
      { supplierName: "YS Parts", invoiceNumber: "RCPT-1", amount: 380 },
      {
        id: "job-1",
        documentId: "document-1",
        category: "RepairInvoice",
        status: "NeedsReview",
        progress: 100,
        warnings: [],
        createdAt: "2026-08-25T00:00:00Z",
        reviewDecision: "Pending",
        result: {
          documentCategory: "RepairInvoice",
          confidence: 0.9,
          fieldConfidence: {},
          fields: {
            repairPart: "Replace bumper qty 1 RM 180",
            whatToDo: "Replace bumper qty 1 RM 180; Paint bumper qty 1 RM 200"
          },
          rawText: "Replace bumper qty 1 RM 180\nPaint bumper qty 1 RM 200",
          warnings: [],
          lineItems: [
            { description: "Replace bumper", quantity: "1", unit: "PC", unitPrice: "180", amount: "180" },
            { description: "Paint bumper", quantity: "1", unit: "PC", unitPrice: "200", amount: "200" }
          ]
        }
      }
    );

    expect(draft.items).toEqual([
      { description: "Replace bumper", quantity: "1", unit: "PC", unitPrice: 180, amount: 180, sortOrder: 1 },
      { description: "Paint bumper", quantity: "1", unit: "PC", unitPrice: 200, amount: 200, sortOrder: 2 }
    ]);
    expect(draft).not.toHaveProperty("repairPart");
    expect(draft).not.toHaveProperty("whatToDo");
  });
});

describe("supplier and refurbishment records", () => {
  it("keeps repair tasks and supplier invoices in the shared operational list", () => {
    const vehicles: VehicleLookup[] = [{
      id: "vehicle-1", plateNumber: "VPK 1234", make: "Toyota", model: "Vios", stockOwner: "YSHeng", status: "Available"
    }];
    const repairs: RepairJob[] = [{
      id: "repair-1", vehicleId: "vehicle-1", repairPart: "Bumper", whatToDo: "Polish bumper", cost: 800, checklistDone: false, createdAt: "2026-08-20T08:00:00Z"
    }];
    const supplierInvoices: SupplierInvoice[] = [{
      id: "invoice-1", vehicleId: "vehicle-1", supplierName: "ABC Spray", invoiceNumber: "INV-1001", amount: 800, createdAt: "2026-08-21T08:00:00Z"
    }];

    const records = buildRefurbishmentTableRecords(repairs, supplierInvoices, vehicles, {});

    expect(records.map((record) => ({ key: record.key, kind: record.kind, plateNumber: record.plateNumber }))).toEqual([
      { key: "repair-repair-1", kind: "repair", plateNumber: "VPK 1234" },
      { key: "supplier-invoice-1", kind: "supplierInvoice", plateNumber: "VPK 1234" }
    ]);
  });
});

describe("module document lists", () => {
  it("can omit OCR results for manual Loan and Delivery evidence workflows", () => {
    const loanMarkup = renderToStaticMarkup(createElement(ModuleDocumentList, {
      vehicleId: "vehicle-1",
      categories: ["Voc", "ApDocument", "StatusReceipt", "LoanDocument"],
      showOcrResults: false
    }));
    const deliveryMarkup = renderToStaticMarkup(createElement(ModuleDocumentList, {
      vehicleId: "vehicle-1",
      categories: ["DeliveryDocument", "Policy", "RoadTaxReceipt"],
      showOcrResults: false
    }));

    expect(loanMarkup).toContain("No uploaded documents for this selected record.");
    expect(loanMarkup).not.toContain("No OCR results for these documents yet.");
    expect(deliveryMarkup).toContain("No uploaded documents for this selected record.");
    expect(deliveryMarkup).not.toContain("No OCR results for these documents yet.");
    expect(loanMarkup).toContain("ant-pro-query-filter");
    expect(deliveryMarkup).toContain("ant-pro-query-filter");
    expect(loanMarkup).toContain("Uploaded / 日期");
    expect(deliveryMarkup).toContain("Uploaded / 日期");
    expect(loanMarkup).not.toContain("Search table records");
    expect(deliveryMarkup).not.toContain("Search table records");
  });

  it("keeps OCR results available to modules that opt in", () => {
    const markup = renderToStaticMarkup(createElement(ModuleDocumentList, {
      vehicleId: "vehicle-1",
      categories: ["RepairInvoice"]
    }));

    expect(markup).toContain("No OCR results for these documents yet.");
  });
});

describe("supplier and refurbishment search records", () => {
  it("keeps repair tasks and supplier invoices in the same searchable list", () => {
    const vehicles: VehicleLookup[] = [{
      id: "vehicle-1", plateNumber: "VPK 1234", make: "Toyota", model: "Vios", stockOwner: "YSHeng", status: "Available"
    }];
    const repairs: RepairJob[] = [{
      id: "repair-1", vehicleId: "vehicle-1", repairPart: "Bumper", whatToDo: "Polish bumper", cost: 800, checklistDone: false, createdAt: "2026-08-20T08:00:00Z"
    }];
    const supplierInvoices: SupplierInvoice[] = [{
      id: "invoice-1", vehicleId: "vehicle-1", supplierName: "ABC Spray", invoiceNumber: "INV-1001", amount: 800, createdAt: "2026-08-21T08:00:00Z"
    }];

    expect(buildRefurbishmentTableRecords(repairs, supplierInvoices, vehicles, {}).map((record) => ({
      key: record.key,
      kind: record.kind,
      plateNumber: record.plateNumber
    }))).toEqual([
      { key: "repair-repair-1", kind: "repair", plateNumber: "VPK 1234" },
      { key: "supplier-invoice-1", kind: "supplierInvoice", plateNumber: "VPK 1234" }
    ]);
  });

  it("searches supplier master values and approval status", () => {
    const suppliers: Supplier[] = [{
      id: "supplier-1", companyName: "ABC Auto Parts", registrationNumber: "REG-1001", tinNumber: "TIN-2002", address: "Johor", phone: "012-3456789", autoCountCreditorCode: "CRED-001", approvalStatus: "Approved"
    }];

    expect(filterSupplierMaster(suppliers, "0123456789", "All")).toEqual(suppliers);
    expect(filterSupplierMaster(suppliers, "CRED001", "Approved")).toEqual(suppliers);
    expect(filterSupplierMaster(suppliers, "ABC", "Draft")).toEqual([]);
  });

  it("matches an OCR supplier by a unique master identifier or exact normalized company name", () => {
    const suppliers: Supplier[] = [{
      id: "supplier-1", companyName: "LK Tint & Car Accessories Sdn. Bhd.", registrationNumber: "201901234567", tinNumber: "C1234567890", address: "Johor", phone: "016-7334699", approvalStatus: "Approved"
    }];

    expect(supplierMasterMatchFromOcr(suppliers, "LK TINT CAR ACCESSORIES SDN BHD")).toEqual(suppliers[0]);
    expect(supplierMasterMatchFromOcr(suppliers, "LK TINT")).toBeUndefined();
    expect(supplierMasterMatchFromOcr(suppliers, {
      companyName: "LK TINT & CAR ACCESORIES",
      phone: "016 733-4699",
      tinNumber: "C1234567890"
    })).toEqual(suppliers[0]);
  });

  it("does not auto-match a receipt supplier when its OCR identifiers point to different master records", () => {
    const suppliers: Supplier[] = [
      { id: "supplier-1", companyName: "LK Tint", address: "Johor", phone: "016-7334699", approvalStatus: "Approved" },
      { id: "supplier-2", companyName: "LK Accessories", address: "Johor", tinNumber: "C1234567890", phone: "012-3333333", approvalStatus: "Approved" }
    ];

    expect(supplierMasterMatchFromOcr(suppliers, {
      companyName: "LK TINT & CAR ACCESORIES",
      phone: "016-7334699",
      tinNumber: "C1234567890"
    })).toBeUndefined();
  });

  it("shows whether a receipt plate matches the selected car without changing the uploaded document link", () => {
    const vehicles: VehicleLookup[] = [
      { id: "vehicle-1", plateNumber: "BKC3003", make: "Toyota", model: "Vios", stockOwner: "YSHeng", status: "Available" },
      { id: "vehicle-2", plateNumber: "PRU6955", make: "Honda", model: "City", stockOwner: "YSHeng", status: "Available" }
    ];

    expect(receiptVehicleMatchFromOcr(vehicles, "vehicle-1", "BKC 3003")).toEqual({ kind: "matched", vehicle: vehicles[0] });
    expect(receiptVehicleMatchFromOcr(vehicles, "vehicle-1", "PRU6955")).toEqual({ kind: "different", vehicle: vehicles[1] });
    expect(receiptVehicleMatchFromOcr(vehicles, "vehicle-1", "UNKNOWN 1")).toEqual({ kind: "notFound", plate: "UNKNOWN 1" });
  });

  it("searches delivery accounting values using the displayed plate and status", () => {
    const vehicles: VehicleLookup[] = [{ id: "vehicle-1", plateNumber: "VPK 1234", make: "Toyota", model: "Vios", stockOwner: "YSHeng", status: "Available" }];
    const charges: DeliveryAccountingCharge[] = [{
      id: "charge-1", deliveryScheduleId: "delivery-1", vehicleId: "vehicle-1", chargeType: "Insurance", providerName: "ABC Insurance", referenceNumber: "POL-1001", invoiceDate: "2026-08-25", amount: 800, paidOnBehalf: true, accountingStatus: "FinanceConfirmed"
    }];

    expect(filterDeliveryAccountingCharges(charges, vehicles, "VPK1234", "All")).toEqual(charges);
    expect(filterDeliveryAccountingCharges(charges, vehicles, "POL1001", "FinanceConfirmed")).toEqual(charges);
    expect(filterDeliveryAccountingCharges(charges, vehicles, "ABC", "Draft")).toEqual([]);
  });
});

describe("workflow list query controls", () => {
  const vehicles: VehicleLookup[] = [{
    id: "vehicle-1", plateNumber: "VPK 1234", make: "Toyota", model: "Vios", stockOwner: "YSHeng", status: "LoanProcessing", customerId: "customer-1"
  }];
  const customers: Customer[] = [{ id: "customer-1", name: "Ah Ming", phone: "012-1234567" }];
  const loans: LoanApplication[] = [{
    id: "loan-1", vehicleId: "vehicle-1", customerId: "customer-1", status: "Pending", louApproved: false, louDone: false, submittedAt: "2026-08-25"
  }];
  it("keeps compact mobile filters while loan tables expose the native desktop query form", () => {
    const loanMarkup = renderToStaticMarkup(createElement(LoanPage, {
      vehicles, customers, loans, roles: ["Loan"], dashboardFocus: {}, onClearDashboardFocus: () => {}, onBackToList: () => {}, onCreate: () => {}, onUpdate: () => {}, onDecide: async () => {}, onUploadDocument: async () => {}
    }));
    const deliveryMarkup = renderToStaticMarkup(createElement(DeliveryPage, {
      vehicles, dashboardFocus: {}, onClearDashboardFocus: () => {}, onOpenCustomer: () => {}
    }));

    expect(loanMarkup).toContain("Search plate, customer, phone, status");
    expect(deliveryMarkup).toContain("Search plate, customer or PIC");
    expect(loanMarkup).toContain("pageFilterMobileOnly");
    expect(loanMarkup).toContain("nativeSearchDesktopOnly");
    expect(loanMarkup).toContain("ant-pro-query-filter");
    expect(deliveryMarkup).toContain("pageFilterMobileOnly");
  });
});

describe("lead search controls", () => {
  it("renders a visible search for customer, phone, plate, and message", () => {
    const vehicles: Vehicle[] = [{
      id: "vehicle-1",
      plateNumber: "VPK 1234",
      make: "Toyota",
      model: "Vios",
      year: 2022,
      stockOwner: "YSHeng",
      status: "Available",
      isPublic: true,
      purchasePrice: 52000,
      sellingPrice: 58000,
      additionalCharges: 0,
      refurbishmentTotal: 0,
      commissionTotal: 0
    }];
    const leads: Lead[] = [{
      id: "lead-1", vehicleId: "vehicle-1", customerName: "Ah Ming", phone: "012-1234567", message: "Weekend test drive", status: "New", createdAt: "2026-08-25T00:00:00Z"
    }];

    const markup = renderToStaticMarkup(createElement(LeadsPage, {
      currentUser: null,
      vehicles,
      customers: [],
      leads,
      onCreateCustomer: async () => {},
      onUpdate: () => {}
    }));

    expect(markup).toContain("Search leads by customer, phone, plate, or message");
    expect(markup).toContain("Customer, phone, plate, or message");
    expect(markup).toContain("pageFilterMobileOnly");
    expect(markup).toContain("nativeSearchDesktopOnly");
    expect(markup).toContain("ant-pro-query-filter");
  });
});
