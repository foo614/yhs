import { describe, expect, it } from "vitest";
import { canMarkDeliveryReady, canMarkNotificationSent, canMarkTwoDayNoticeSent, canReleaseDelivery, deliveryCreateBlockReason, deliveryDocumentCategories, markDeliveryReady, markNotificationSent, markTwoDayNoticeSent } from "./delivery";
import type { DeliverySchedule } from "./api";

const baseDelivery: DeliverySchedule = {
  id: "delivery-1",
  vehicleId: "vehicle-1",
  pic: "Ah Ming",
  status: "Scheduled",
  scheduledDate: "2026-06-03",
  polishDone: false,
  tintedDone: false,
  washDone: false,
  documentsPrepared: false,
  inspectionDone: false,
  notificationSent: false,
  twoDayNoticeSent: false,
  insuranceHandled: false,
  insurancePolicyReference: undefined,
  roadTaxHandled: false,
  roadTaxReceiptReference: undefined,
  windscreenInsuranceHandled: false
};

const completeDelivery: DeliverySchedule = {
  ...baseDelivery,
  inspectionDone: true,
  inspectionBookingReference: "BOOK-1001",
  inspectionReportReference: "INSPECT-1001",
  documentsPrepared: true,
  polishDone: true,
  tintedDone: true,
  washDone: true,
  notificationSent: true,
  twoDayNoticeSent: true,
  insuranceHandled: true,
  insurancePolicyReference: "POL-1001",
  roadTaxHandled: true,
  roadTaxReceiptReference: "RT-1001",
  windscreenInsuranceHandled: true,
  windscreenPolicyReference: "WS-1001"
};

describe("delivery workflow helpers", () => {
  it("allows marking the 2-day notice only before it has been sent", () => {
    expect(canMarkTwoDayNoticeSent(baseDelivery)).toBe(true);
    expect(canMarkTwoDayNoticeSent({ ...baseDelivery, twoDayNoticeSent: true })).toBe(false);
  });

  it("marks the 2-day notice without changing release checklist state", () => {
    const result = markTwoDayNoticeSent(baseDelivery);

    expect(result.twoDayNoticeSent).toBe(true);
    expect(result.status).toBe("Scheduled");
    expect(result.inspectionDone).toBe(false);
    expect(result.documentsPrepared).toBe(false);
  });

  it("tracks the general delivery notification separately from the 2-day notice", () => {
    expect(canMarkNotificationSent(baseDelivery)).toBe(true);
    expect(canMarkNotificationSent({ ...baseDelivery, notificationSent: true })).toBe(false);

    const result = markNotificationSent(baseDelivery);

    expect(result.notificationSent).toBe(true);
    expect(result.twoDayNoticeSent).toBe(false);
    expect(result.status).toBe("Scheduled");
  });

  it("allows release only when delivery, insurance, and road tax handover checks are ready", () => {
    const readyDelivery: DeliverySchedule = {
      ...completeDelivery,
      status: "ReadyForRelease"
    };

    expect(canReleaseDelivery(baseDelivery)).toBe(false);
    expect(canReleaseDelivery(readyDelivery)).toBe(true);
    expect(canReleaseDelivery({ ...readyDelivery, insuranceHandled: false })).toBe(false);
    expect(canReleaseDelivery({ ...readyDelivery, roadTaxHandled: false })).toBe(false);
    expect(canReleaseDelivery({ ...readyDelivery, windscreenInsuranceHandled: false })).toBe(false);
    expect(canReleaseDelivery({ ...readyDelivery, inspectionReportReference: " " })).toBe(false);
    expect(canReleaseDelivery({ ...readyDelivery, status: "Released" })).toBe(false);
  });

  it("allows marking ready only after the delivery checklist is complete", () => {
    const checklistComplete: DeliverySchedule = {
      ...completeDelivery,
      status: "CarPreparation"
    };

    expect(canMarkDeliveryReady(baseDelivery)).toBe(false);
    expect(canMarkDeliveryReady(checklistComplete)).toBe(true);
    expect(canMarkDeliveryReady({ ...checklistComplete, inspectionReportReference: undefined })).toBe(false);
    expect(canMarkDeliveryReady({ ...checklistComplete, roadTaxHandled: false })).toBe(false);
    expect(canMarkDeliveryReady({ ...checklistComplete, status: "ReadyForRelease" })).toBe(false);

    const ready = markDeliveryReady(checklistComplete);
    expect(ready.status).toBe("ReadyForRelease");
    expect(ready.inspectionDone).toBe(true);
    expect(markDeliveryReady({ ...checklistComplete, washDone: false }).washDone).toBe(false);
  });

  it("blocks delivery submissions with missing PIC or schedule date", () => {
    expect(deliveryCreateBlockReason({ ...baseDelivery, pic: " " })).toBe("Delivery PIC is required.");
    expect(deliveryCreateBlockReason({ ...baseDelivery, scheduledDate: " " })).toBe("Delivery schedule date is required.");
    expect(deliveryCreateBlockReason({ ...baseDelivery, inspectionDone: true })).toBe("Inspection report reference is required after inspection is complete.");
    expect(deliveryCreateBlockReason(baseDelivery)).toBeUndefined();
  });

  it("limits delivery uploads to delivery-owned handover document categories", () => {
    expect(deliveryDocumentCategories).toEqual(["DeliveryDocument", "Policy", "RoadTaxReceipt"]);
  });

  it("blocks manual ready-for-release submissions until the checklist is complete", () => {
    expect(deliveryCreateBlockReason({
      ...completeDelivery,
      status: "ReadyForRelease",
      roadTaxHandled: false
    })).toBe("Delivery cannot be marked ready until inspection, inspection report, documents, car preparation, insurance, road tax, windscreen insurance, and 2-day notice are complete.");

    expect(deliveryCreateBlockReason({
      ...completeDelivery,
      status: "ReadyForRelease"
    })).toBeUndefined();
  });

  it("blocks manual released submissions until the checklist is complete", () => {
    expect(deliveryCreateBlockReason({
      ...completeDelivery,
      status: "Released",
      windscreenInsuranceHandled: false
    })).toBe("Delivery cannot be released until inspection, inspection report, documents, car preparation, insurance, road tax, windscreen insurance, and 2-day notice are complete.");

    expect(deliveryCreateBlockReason({
      ...completeDelivery,
      status: "Released"
    })).toBeUndefined();
  });
});
