import { Children, createElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { DeliveryWorkboardItem } from "../../api";
import {
  completedDeliveryStages,
  CurrentStageForm,
  DeliveryDrawerContent,
  DeliveryWorkboardPage,
  canCorrectDeliveryBuyer,
  deliveryForExactDeepLink,
  initialDeliveryFocusResolution,
  deliveryNeedsAction,
  eligibleDeliveryVehicles,
  filterDeliveryQueue,
  hasLockedDeliveryBuyer,
  singaporeDateString,
  deliveryStageLabel,
  filterDeliveryWorkboard,
  deliveryDatePickerValue,
  deliveryDateString,
  deliveryTimePickerValue,
  deliveryTimeString,
  nearestDeliveryFirst
} from "./DeliveryWorkboardPage";
import dayjs from "dayjs";

const baseItem: DeliveryWorkboardItem = {
  id: "delivery-1",
  vehicleId: "vehicle-1",
  plateNumber: "VPK 1234",
  vehicleLabel: "Toyota Vios",
  customerId: "customer-1",
  customerName: "Ali Tan",
  picUserId: "staff-1",
  picName: "Ming Lee",
  deliveryType: "Standard",
  scheduledDate: "2026-08-30",
  scheduledTime: "10:30",
  status: "BookingInspection",
  stage: "PlanDelivery",
  stageLabel: "Plan delivery",
  nextAction: "Prepare delivery documents",
  blocker: "Delivery documents are required.",
  financeCleared: false,
  canRelease: false,
  terminal: false,
  polishDone: false,
  tintedDone: false,
  washDone: false,
  documentsPrepared: false,
  inspectionDone: false,
  notificationSent: false,
  twoDayNoticeSent: false,
  insuranceHandled: false,
  roadTaxHandled: false,
  windscreenInsuranceHandled: false,
  handoverPhotoCaptured: false,
  signedHandoverReceived: false,
  customerAcknowledged: false,
  finalChecklistConfirmed: false,
  missingCategories: ["DeliveryDocument"],
  evidence: []
};

describe("Delivery picker adapters", () => {
  it("round trips stored date/time strings and clears to empty payload values", () => {
    expect(deliveryDateString(deliveryDatePickerValue("2026-08-30"))).toBe("2026-08-30");
    expect(deliveryTimeString(deliveryTimePickerValue("10:30"))).toBe("10:30");
    expect(deliveryDatePickerValue("2026-08-30")?.format("YYYY-MM-DD")).toBe("2026-08-30");
    expect(deliveryTimePickerValue("10:30")?.format("HH:mm")).toBe("10:30");
    expect(deliveryDateString(null)).toBe("");
    expect(deliveryTimeString(null)).toBe("");
    expect(dayjs(deliveryTimePickerValue("10:30")).format("YYYY-MM-DD")).toBe("2000-01-01");
  });
});

const noOp = async () => {};

describe("simple delivery workboard", () => {
  it("keeps both Finance alerts readable across drawer widths", () => {
    const styles = readFileSync(fileURLToPath(new URL("../../styles.css", import.meta.url)), "utf8");

    expect(styles).toMatch(/\.deliveryFinanceGate\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
    expect(styles).toMatch(/\.deliveryFinanceGate \.ant-alert,\s*\.deliveryFinanceGate \.ant-alert-content\s*{[^}]*min-width:\s*0/s);
    expect(styles).toMatch(/\.deliveryFinanceGate \.ant-alert\s*{[^}]*flex-wrap:\s*wrap/s);
    expect(styles).toMatch(/\.deliveryFinanceGate \.ant-alert-action\s*{[^}]*flex:\s*1 0 100%[^}]*margin-inline-start:\s*0/s);
    expect(styles).toMatch(/@media \(max-width:\s*720px\)[\s\S]*?\.deliveryFinanceGate\s*{[^}]*grid-template-columns:\s*1fr/s);
  });

  it("keeps responsive spacing between Handover Finance status and its action", () => {
    const markup = renderToStaticMarkup(createElement(CurrentStageForm, {
      item: { ...baseItem, stage: "Handover", financeCleared: true, canRelease: false },
      picOptions: [],
      saving: false,
      onSave: noOp,
      onUpload: noOp,
      onRelease: () => {},
      onRequestInvoice: () => {}
    }));
    const styles = readFileSync(fileURLToPath(new URL("../../styles.css", import.meta.url)), "utf8");

    expect(markup).toContain('class="deliveryHandoverActions"');
    expect(markup).toContain("Finance cleared / 财务已确认");
    expect(markup).toContain("Save handover checks / 保存交车确认");
    expect(styles).toMatch(/\.deliveryHandoverActions\s*{[^}]*display:\s*grid[^}]*gap:\s*12px/s);
    expect(styles).toMatch(/\.deliveryHandoverActions > \.ant-alert\s*{[^}]*width:\s*100%[^}]*min-width:\s*0/s);
    expect(styles).toMatch(/\.deliveryHandoverActions > \.ant-btn\s*{[^}]*justify-self:\s*start/s);
    expect(styles).toMatch(/@media \(max-width:\s*720px\)[\s\S]*?\.deliveryHandoverActions \.ant-btn,[\s\S]*?width:\s*100%/s);
  });

  it("filters one scannable list by car, stage, and staff-backed PIC", () => {
    const items: DeliveryWorkboardItem[] = [
      baseItem,
      { ...baseItem, id: "delivery-2", vehicleId: "vehicle-2", plateNumber: "WXY 9876", customerName: "Siti Noor", picUserId: "staff-2", stage: "ClearDocuments" }
    ];

    expect(filterDeliveryWorkboard(items, { keyword: "vpk", stage: "PlanDelivery", picUserId: "staff-1" })).toEqual([baseItem]);
    expect(filterDeliveryWorkboard(items, { keyword: "siti" }).map((item) => item.id)).toEqual(["delivery-2"]);
  });

  it("uses three staff-facing stages and collapses only completed stages", () => {
    expect(deliveryStageLabel("PlanDelivery")).toBe("Plan delivery / 安排交车");
    expect(deliveryStageLabel("ClearDocuments")).toBe("Clear documents / 文件确认");
    expect(deliveryStageLabel("Handover")).toBe("Handover / 交车");
    expect(completedDeliveryStages("ClearDocuments")).toEqual(["PlanDelivery"]);
    expect(completedDeliveryStages("Completed")).toEqual(["PlanDelivery", "ClearDocuments", "Handover"]);
  });

  it("orders records by nearest delivery date", () => {
    expect(nearestDeliveryFirst([
      { ...baseItem, id: "later", scheduledDate: "2026-09-02" },
      { ...baseItem, id: "earlier", scheduledDate: "2026-08-28" }
    ]).map((item) => item.id)).toEqual(["earlier", "later"]);
  });

  it("counts only timely staff blockers as needing action", () => {
    expect(deliveryNeedsAction({ ...baseItem, scheduledDate: "2026-08-30" }, "2026-08-27")).toBe(true);
    expect(deliveryNeedsAction({ ...baseItem, scheduledDate: "2026-09-30" }, "2026-08-27")).toBe(false);
    expect(deliveryNeedsAction({ ...baseItem, scheduledDate: "2026-09-30", picUserId: undefined }, "2026-08-27")).toBe(true);
    expect(deliveryNeedsAction({ ...baseItem, scheduledDate: "2026-08-30", stage: "ClearDocuments", blocker: "Waiting for Finance clearance" }, "2026-08-27")).toBe(false);
  });

  it("uses Singapore calendar dates for the This week counter", () => {
    expect(singaporeDateString(new Date("2026-08-26T16:30:00Z"))).toBe("2026-08-27");
  });

  it("keeps older released deliveries searchable after hiding them from the default list", () => {
    const old = { ...baseItem, status: "Released" as const, releasedAt: "2026-08-01T10:00:00Z" };
    expect(filterDeliveryWorkboard([old], {}, "2026-08-27")).toEqual([]);
    expect(filterDeliveryWorkboard([old], { keyword: old.plateNumber }, "2026-08-27")).toEqual([old]);
  });

  it("turns summary counters into focused queue filters", () => {
    const items: DeliveryWorkboardItem[] = [
      baseItem,
      { ...baseItem, id: "delivery-2", deliveryType: "Outstation", deliveryAddress: "Johor Bahru", canRelease: true, blocker: null },
      { ...baseItem, id: "delivery-3", scheduledDate: "2026-09-30", blocker: null }
    ];

    expect(filterDeliveryQueue(items, "ThisWeek", "2026-08-27").map((item) => item.id)).toEqual(["delivery-1", "delivery-2"]);
    expect(filterDeliveryQueue(items, "NeedsAction", "2026-08-27").map((item) => item.id)).toEqual(["delivery-1"]);
    expect(filterDeliveryQueue(items, "Ready", "2026-08-27").map((item) => item.id)).toEqual(["delivery-2"]);
    expect(filterDeliveryQueue(items, "Outstation", "2026-08-27").map((item) => item.id)).toEqual(["delivery-2"]);
  });

  it("allows cancelled-only cars to be rescheduled but excludes active or previously released cars", () => {
    const vehicles = [
      { id: "active", plateNumber: "AAA 1", make: "Toyota", model: "Vios", stockOwner: "YSHeng" as const, status: "LoanProcessing" as const, customerId: "customer-1" },
      { id: "cancelled", plateNumber: "BBB 2", make: "Honda", model: "City", stockOwner: "YSHeng" as const, status: "LoanProcessing" as const, customerId: "customer-2" },
      { id: "released", plateNumber: "CCC 3", make: "Mazda", model: "3", stockOwner: "YSHeng" as const, status: "Available" as const, customerId: "customer-3" },
      { id: "fresh", plateNumber: "DDD 4", make: "Nissan", model: "Almera", stockOwner: "YSHeng" as const, status: "Available" as const, customerId: "customer-4" }
    ];
    const deliveries: DeliveryWorkboardItem[] = [
      { ...baseItem, id: "delivery-active", vehicleId: "active" },
      { ...baseItem, id: "delivery-cancelled", vehicleId: "cancelled", status: "Cancelled", stage: "Cancelled", terminal: true },
      { ...baseItem, id: "delivery-released", vehicleId: "released", status: "Released", stage: "Completed", terminal: true }
    ];

    const loans = [
      { id: "loan-active", vehicleId: "active", customerId: "customer-1", status: "Approved" as const, louApproved: true, louDone: false },
      { id: "loan-cancelled", vehicleId: "cancelled", customerId: "customer-2", status: "Approved" as const, louApproved: true, louDone: false },
      { id: "loan-released", vehicleId: "released", customerId: "customer-3", status: "Done" as const, louApproved: true, louDone: true },
      { id: "loan-fresh", vehicleId: "fresh", customerId: "customer-4", status: "Done" as const, louApproved: true, louDone: true }
    ];

    expect(eligibleDeliveryVehicles(vehicles, deliveries, loans).map((vehicle) => vehicle.id)).toEqual(["cancelled", "fresh"]);
  });

  it("excludes cars whose loan is not approved", () => {
    const vehicles = [{ id: "pending", plateNumber: "AAA 1", make: "Toyota", model: "Vios", stockOwner: "YSHeng" as const, status: "LoanProcessing" as const, customerId: "customer-1" }];
    const loans = [{ id: "loan-pending", vehicleId: "pending", customerId: "customer-1", status: "Pending" as const, louApproved: false, louDone: false }];

    expect(eligibleDeliveryVehicles(vehicles, [], loans)).toEqual([]);
  });

  it("opens an exact delivery deep link instead of another historical schedule for the same vehicle", () => {
    const historical = { ...baseItem, id: "delivery-historical" };
    const current = { ...baseItem, id: "delivery-current" };

    expect(deliveryForExactDeepLink([historical, current], "delivery-current")).toBe(current);
    expect(deliveryForExactDeepLink([historical, current], "delivery-missing")).toBeUndefined();
  });

  it("consumes a delivery link once, while allowing a later URL target and exposing stale links", () => {
    const current = { ...baseItem, id: "delivery-current" };

    expect(initialDeliveryFocusResolution({ items: [current], initialDeliveryId: "delivery-current", loading: false })).toEqual({ kind: "open", delivery: current });
    expect(initialDeliveryFocusResolution({ items: [current], initialDeliveryId: "delivery-current", appliedDeliveryId: "delivery-current", loading: false })).toEqual({ kind: "applied" });
    expect(initialDeliveryFocusResolution({ items: [current], initialDeliveryId: "delivery-new", appliedDeliveryId: "delivery-current", loading: false })).toEqual({ kind: "unavailable" });
    expect(initialDeliveryFocusResolution({ items: [], initialDeliveryId: "delivery-new", loading: true })).toEqual({ kind: "waiting" });
  });

  it("renders a single workboard without a raw delivery status control", () => {
    const markup = renderToStaticMarkup(createElement(DeliveryWorkboardPage, {
      vehicles: [{ id: "vehicle-1", plateNumber: "VPK 1234", make: "Toyota", model: "Vios", stockOwner: "YSHeng", status: "LoanProcessing", customerId: "customer-1" }],
      dashboardFocus: {},
      onClearDashboardFocus: () => {},
      onOpenCustomer: () => {},
      initialItems: [baseItem],
      initialPicOptions: [{ id: "staff-1", displayName: "Ming Lee" }],
      autoLoad: false
    }));

    expect(markup).toContain("Car / 车辆");
    expect(markup).toContain("Customer / PIC");
    expect(markup).toContain("Next action / 下一步");
    expect(markup).toContain("Delivery documents are required.");
    expect(markup).not.toContain("Inspection booking");
    expect(markup).toContain("aria-label=\"Delivery queue filters\"");
    expect(markup).not.toContain(">1 cars<");
    expect(markup).not.toContain("ReadyForRelease");
    expect(markup).not.toContain("BookingInspection");
  });

  it("keeps the editable Delivery plan on the same page", () => {
    const markup = renderToStaticMarkup(createElement(CurrentStageForm, {
      item: baseItem,
      picOptions: [{ id: "staff-1", displayName: "Ming Lee" }],
      saving: false,
      onSave: noOp,
      onUpload: noOp,
      onRelease: () => {},
      onRequestInvoice: () => {}
    }));

    expect(markup).toContain("PIC / 负责人");
    expect(markup).toContain("Delivery date / 交车日期");
    expect(markup).toContain("Save delivery plan / 保存交车安排");
    expect(markup).not.toContain("Inspection booking / 验车预约");
  });

  it("offers legacy buyer locking only to Boss for the vehicle's existing confirmed buyer", () => {
    const vehicle = { id: "vehicle-1", plateNumber: "VPK 1234", make: "Toyota", model: "Vios", stockOwner: "YSHeng" as const, status: "LoanProcessing" as const, customerId: "customer-1" };
    const unlocked = { ...baseItem, customerId: undefined, customerName: "Buyer not locked" };

    expect(canCorrectDeliveryBuyer(unlocked, [vehicle], true)).toBe(true);
    expect(canCorrectDeliveryBuyer({ ...unlocked, customerId: "00000000-0000-0000-0000-000000000000" }, [vehicle], true)).toBe(true);
    expect(canCorrectDeliveryBuyer(unlocked, [vehicle], false)).toBe(false);
    expect(canCorrectDeliveryBuyer(baseItem, [vehicle], true)).toBe(false);
    expect(canCorrectDeliveryBuyer({ ...unlocked, terminal: true }, [vehicle], true)).toBe(false);
    expect(canCorrectDeliveryBuyer(unlocked, [{ ...vehicle, customerId: undefined }], true)).toBe(false);
    expect(hasLockedDeliveryBuyer("00000000-0000-0000-0000-000000000000")).toBe(false);
    expect(hasLockedDeliveryBuyer("customer-1")).toBe(true);
  });

  it("shows the reasoned buyer-lock action beside the unlocked-buyer blocker", () => {
    const markup = renderToStaticMarkup(createElement(DeliveryDrawerContent, {
      item: { ...baseItem, customerId: "00000000-0000-0000-0000-000000000000", customerName: "Buyer not locked", blocker: "Buyer not locked" },
      picOptions: [{ id: "staff-1", displayName: "Ming Lee" }],
      activity: [],
      activityLoading: false,
      saving: false,
      buyerCorrectionAvailable: true,
      onSave: noOp,
      onUpload: noOp,
      onRelease: () => {},
      onRequestInvoice: () => {},
      onCorrectBuyer: () => {}
    }));

    expect(markup).toContain("Buyer not locked");
    expect(markup).toContain("Lock confirmed buyer");
    expect(markup).not.toContain("Select buyer");
  });

  it("keeps Delivery documents and Finance state while omitting the removed notice", () => {
    const clearDocuments: DeliveryWorkboardItem = {
      ...baseItem,
      stage: "ClearDocuments",
      status: "PreparingDocuments",
      nextAction: "Wait for Finance clearance",
      blocker: null,
      invoiceUpdateRequested: true,
      evidence: [{
        category: "DeliveryDocument",
        isPresent: true,
        documentId: "document-1",
        fileName: "handover.pdf",
        mimeType: "application/pdf",
        uploadedBy: "Ming Lee",
        uploadedAt: "2026-08-27T08:30:00Z"
      }]
    };
    const markup = renderToStaticMarkup(createElement(CurrentStageForm, {
      item: clearDocuments,
      picOptions: [],
      saving: false,
      onSave: noOp,
      onUpload: noOp,
      onRelease: () => {},
      onRequestInvoice: () => {}
    }));

    expect(markup).not.toContain("2-day customer notice sent");
    expect(markup).not.toContain("已提前两天通知客户");
    expect(markup).toContain("Evidence reviewed and confirmed / 证据已审核确认");
    expect(markup).toContain("Delivery documents reviewed and confirmed");
    expect(markup).toContain("交车文件已审核确认");
    expect(markup).not.toContain("Delivery documents checked");
    expect(markup).toContain("/api/vehicles/vehicle-1/documents/document-1/content");
    expect(markup).toContain("Preview");
    expect(markup).toContain("Download");
    expect(markup).not.toContain("checksum");
    expect(markup).toContain("Waiting for Finance / 等待财务");
    expect(markup).toContain("Sales Invoice update pending with Finance");
    expect(markup).toContain("Finance has received the request");
    expect(markup).toContain("Request pending");
    expect(markup).not.toContain("Request invoice update");
    expect(markup).not.toContain("Invoice No");
    expect(markup).not.toContain("Windscreen expiry");
    expect(markup).not.toContain("Windscreen cover reviewed");
    expect(markup).not.toContain("Historical windscreen evidence");
  });

  it("does not expose historical windscreen evidence in Delivery UI", () => {
    const markup = renderToStaticMarkup(createElement(DeliveryDrawerContent, {
      item: {
        ...baseItem,
        evidence: [{
          category: "WindscreenPolicy",
          isPresent: true,
          documentId: "historic-windscreen-1",
          fileName: "windscreen-policy.pdf"
        }]
      },
      picOptions: [],
      activity: [],
      activityLoading: false,
      saving: false,
      onSave: noOp,
      onUpload: noOp,
      onRelease: () => {},
      onRequestInvoice: () => {}
    }));

    expect(markup).not.toContain("Historical record / 历史记录");
    expect(markup).not.toContain("Windscreen insurance / 挡风玻璃保险");
    expect(markup).not.toContain("windscreen-policy.pdf");
    expect(markup).not.toContain("historic-windscreen-1");
  });

  it("keeps every uploaded Delivery document visible instead of collapsing history to one file", () => {
    const markup = renderToStaticMarkup(createElement(DeliveryDrawerContent, {
      item: {
        ...baseItem,
        stage: "ClearDocuments",
        evidence: [
          { category: "DeliveryDocument", isPresent: true, documentId: "delivery-doc-1", fileName: "handover.pdf", mimeType: "application/pdf" },
          { category: "DeliveryDocument", isPresent: true, documentId: "delivery-doc-2", fileName: "signed-terms.pdf", mimeType: "application/pdf" }
        ]
      },
      picOptions: [],
      activity: [],
      activityLoading: false,
      saving: false,
      onSave: noOp,
      onUpload: noOp,
      onRelease: () => {},
      onRequestInvoice: () => {}
    }));

    expect(markup).toContain("handover.pdf");
    expect(markup).toContain("signed-terms.pdf");
    expect(markup).toContain("2 received");
  });

  it("keeps earlier completed stages editable until release or cancellation", () => {
    const activeDrawer = DeliveryDrawerContent({
      item: {
        ...baseItem,
        stage: "Handover",
        status: "ReadyForRelease",
        blocker: null,
        inspectionBookingReference: "BOOK-100"
      },
      picOptions: [{ id: "staff-1", displayName: "Ming Lee" }],
      activity: [],
      activityLoading: false,
      saving: false,
      onSave: noOp,
      onUpload: noOp,
      onRelease: () => {},
      onRequestInvoice: () => {}
    });
    const terminalDrawer = DeliveryDrawerContent({
      item: {
        ...baseItem,
        stage: "Completed",
        status: "Released",
        terminal: true,
        blocker: null,
        inspectionBookingReference: "BOOK-100"
      },
      picOptions: [{ id: "staff-1", displayName: "Ming Lee" }],
      activity: [],
      activityLoading: false,
      saving: false,
      onSave: noOp,
      onUpload: noOp,
      onRelease: () => {},
      onRequestInvoice: () => {}
    });
    const getCompletedStageChildren = (drawer: typeof activeDrawer) => {
      const collapse = Children.toArray(drawer.props.children).find((child) =>
        isValidElement<{ items?: unknown }>(child) && Array.isArray(child.props.items));
      if (!collapse || !isValidElement<{ items?: Array<{ children?: unknown }> }>(collapse)) {
        throw new Error("Completed stages are missing from the delivery drawer.");
      }
      return collapse.props.items ?? [];
    };
    const activePanels = getCompletedStageChildren(activeDrawer);
    const terminalPanels = getCompletedStageChildren(terminalDrawer);
    const clearDocumentsPanel = activePanels[1].children as { props: { children: ReactNode } };
    const clearDocumentsChildren = Children.toArray(clearDocumentsPanel.props.children);
    const savedSummaryMarkup = renderToStaticMarkup(clearDocumentsChildren[0] as ReactElement);

    expect(activePanels).toHaveLength(2);
    expect((activePanels[0].children as { type?: unknown }).type).toBe(CurrentStageForm);
    expect((activePanels[1].children as { type?: unknown }).type).not.toBe(CurrentStageForm);
    expect(savedSummaryMarkup).toContain("Document checks saved / 文件确认已保存");
    expect(savedSummaryMarkup).toContain("Next: waiting for Finance clearance before vehicle release.");
    expect((clearDocumentsChildren[1] as { props: { items: Array<{ label: string }> } }).props.items[0].label).toContain("Edit document checks");
    expect(terminalPanels).toHaveLength(3);
    expect(terminalPanels.some((panel) => (panel.children as { type?: unknown }).type === CurrentStageForm)).toBe(false);
  });

  it("shows outstation logistics once in the drawer without repeating the next action", () => {
    const markup = renderToStaticMarkup(createElement(DeliveryDrawerContent, {
      item: {
        ...baseItem,
        blocker: null,
        deliveryType: "Outstation",
        deliveryAddress: "12 Jalan Tun Abdul Razak, Johor Bahru",
        transportMethod: "Company runner"
      },
      picOptions: [{ id: "staff-1", displayName: "Ming Lee" }],
      activity: [],
      activityLoading: false,
      saving: false,
      onSave: noOp,
      onUpload: noOp,
      onRelease: () => {},
      onRequestInvoice: () => {}
    }));

    expect(markup).toContain("12 Jalan Tun Abdul Razak, Johor Bahru");
    expect(markup).toContain("Company runner");
    expect(markup).not.toContain("Next action / 下一步");
    expect(markup.match(/Add inspection booking/g) ?? []).toHaveLength(0);
  });

  it("keeps routine queue actions neutral and shows a short outstation destination", () => {
    const markup = renderToStaticMarkup(createElement(DeliveryWorkboardPage, {
      vehicles: [],
      dashboardFocus: {},
      onClearDashboardFocus: () => {},
      onOpenCustomer: () => {},
      initialItems: [{
        ...baseItem,
        blocker: null,
        nextAction: "Review delivery plan",
        deliveryType: "Outstation",
        deliveryAddress: "12 Jalan Tun Abdul Razak, Johor Bahru, Johor"
      }],
      initialPicOptions: [{ id: "staff-1", displayName: "Ming Lee" }],
      autoLoad: false
    }));

    expect(markup).toContain("Review delivery plan");
    expect(markup).toContain("Outstation · 12 Jalan Tun Abdul Razak, Johor...");
    expect(markup).not.toContain("ant-typography-danger");
  });
});
