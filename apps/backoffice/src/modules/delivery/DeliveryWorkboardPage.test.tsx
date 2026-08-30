import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DeliveryWorkboardItem } from "../../api";
import {
  completedDeliveryStages,
  CurrentStageForm,
  DeliveryDrawerContent,
  DeliveryWorkboardPage,
  canCorrectDeliveryBuyer,
  deliveryNeedsAction,
  eligibleDeliveryVehicles,
  filterDeliveryQueue,
  hasLockedDeliveryBuyer,
  singaporeDateString,
  deliveryStageLabel,
  filterDeliveryWorkboard
} from "./DeliveryWorkboardPage";

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
  nextAction: "Add inspection booking",
  blocker: "Inspection booking is required.",
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
  missingCategories: ["InspectionReport"],
  evidence: []
};

const noOp = async () => {};

describe("simple delivery workboard", () => {
  it("filters one scannable list by car, stage, and staff-backed PIC", () => {
    const items: DeliveryWorkboardItem[] = [
      baseItem,
      { ...baseItem, id: "delivery-2", vehicleId: "vehicle-2", plateNumber: "WXY 9876", customerName: "Siti Noor", picUserId: "staff-2", stage: "PrepareCar" }
    ];

    expect(filterDeliveryWorkboard(items, { keyword: "vpk", stage: "PlanDelivery", picUserId: "staff-1" })).toEqual([baseItem]);
    expect(filterDeliveryWorkboard(items, { keyword: "siti" }).map((item) => item.id)).toEqual(["delivery-2"]);
  });

  it("uses four staff-facing stages and collapses only completed stages", () => {
    expect(deliveryStageLabel("PlanDelivery")).toBe("Plan delivery / 安排交车");
    expect(deliveryStageLabel("PrepareCar")).toBe("Prepare car / 准备车辆");
    expect(deliveryStageLabel("ClearDocuments")).toBe("Clear documents / 文件确认");
    expect(deliveryStageLabel("Handover")).toBe("Handover / 交车");
    expect(completedDeliveryStages("ClearDocuments")).toEqual(["PlanDelivery", "PrepareCar"]);
    expect(completedDeliveryStages("Completed")).toEqual(["PlanDelivery", "PrepareCar", "ClearDocuments", "Handover"]);
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

    expect(eligibleDeliveryVehicles(vehicles, deliveries).map((vehicle) => vehicle.id)).toEqual(["cancelled", "fresh"]);
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
    expect(markup).toContain("Inspection booking is required.");
    expect(markup).toContain("aria-label=\"Delivery queue filters\"");
    expect(markup).not.toContain(">1 cars<");
    expect(markup).not.toContain("ReadyForRelease");
    expect(markup).not.toContain("BookingInspection");
  });

  it("keeps Plan focused on PIC and inspection booking while rescheduling stays a reasoned action", () => {
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
    expect(markup).toContain("Inspection booking / 验车预约");
    expect(markup).toContain("More → Reschedule");
    expect(markup).not.toContain("type=\"date\"");
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

  it("shows one customer notice and a read-only Finance invoice request state", () => {
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

    expect(markup).toContain("2-day customer notice sent");
    expect(markup).not.toContain("Customer notified");
    expect(markup).toContain("Evidence reviewed and confirmed / 证据已审核确认");
    expect(markup).toContain("Delivery documents reviewed and confirmed");
    expect(markup).not.toContain("Delivery documents checked");
    expect(markup).toContain("/api/vehicles/vehicle-1/documents/document-1/content");
    expect(markup).not.toContain("checksum");
    expect(markup).toContain("Waiting for Finance / 等待财务");
    expect(markup).toContain("Request sent to Finance");
    expect(markup).not.toContain("Invoice No");
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
