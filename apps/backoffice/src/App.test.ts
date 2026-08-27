import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { activeLoanForVehicle, browserRouteUrl, customerIdFromRouteUrl, DashboardPage, DeliveryPage, loanIdFromRouteUrl, LoanPage, ModuleDocumentList, repairReceiptDraftFromOcr, vehicleLoanCustomerId } from "./App";
import type { Customer, DashboardSummary, DeliverySchedule, LoanApplication, VehicleLookup } from "./api";

describe("browser route state", () => {
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
      refurbishment: { finalRepairSpend: 1500, vehicleCount: 1, averageSpendPerVehicle: 1500, workInProgressCount: 1, overdueWorkCount: 0, highestCostVehicles: [] }
    } satisfies DashboardSummary;

    const markup = renderToStaticMarkup(createElement(DashboardPage, {
      dashboard,
      dashboardLoadError: null,
      reminders: [],
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
    expect(markup).not.toContain("Estimated Profit / 预估利润");
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
            { description: "Replace bumper qty 1 RM 180", amount: "180" },
            { description: "Paint bumper qty 1 RM 200", amount: "200" }
          ]
        }
      }
    );

    expect(draft.items).toEqual([
      { description: "Replace bumper qty 1 RM 180", repairPart: "Replace bumper qty 1 RM 180", amount: 180, sortOrder: 1 },
      { description: "Paint bumper qty 1 RM 200", repairPart: "Paint bumper qty 1 RM 200", amount: 200, sortOrder: 2 }
    ]);
    expect(draft).not.toHaveProperty("repairPart");
    expect(draft).not.toHaveProperty("whatToDo");
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
  });

  it("keeps OCR results available to modules that opt in", () => {
    const markup = renderToStaticMarkup(createElement(ModuleDocumentList, {
      vehicleId: "vehicle-1",
      categories: ["RepairInvoice"]
    }));

    expect(markup).toContain("No OCR results for these documents yet.");
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
  const deliveries: DeliverySchedule[] = [{
    id: "delivery-1", vehicleId: "vehicle-1", pic: "Ah Ming", status: "Scheduled", scheduledDate: "2026-08-26",
    polishDone: false, tintedDone: false, washDone: false, documentsPrepared: false, inspectionDone: false,
    notificationSent: false, twoDayNoticeSent: false, insuranceHandled: false, roadTaxHandled: false, windscreenInsuranceHandled: false
  }];

  it("renders explicit local Query and Reset controls instead of an inert ProTable query form", () => {
    const loanMarkup = renderToStaticMarkup(createElement(LoanPage, {
      vehicles, customers, loans, roles: ["Loan"], dashboardFocus: {}, onClearDashboardFocus: () => {}, onBackToList: () => {}, onCreate: () => {}, onUpdate: () => {}, onUploadDocument: async () => {}
    }));
    const deliveryMarkup = renderToStaticMarkup(createElement(DeliveryPage, {
      vehicles, deliveries, dashboardFocus: {}, onClearDashboardFocus: () => {}, onCreate: () => {}, onUpdate: () => {}, onOpenCustomer: () => {}, onUploadDocument: async () => {}
    }));

    for (const markup of [loanMarkup, deliveryMarkup]) {
      expect(markup).toContain("Query");
      expect(markup).toContain("Reset");
      expect(markup).not.toContain("ant-pro-query-filter");
    }
  });
});
