import type { DeliverySchedule } from "./api";

export const deliveryDocumentCategories = ["DeliveryDocument", "Policy", "RoadTaxReceipt"] as const;

export function canMarkTwoDayNoticeSent(delivery: DeliverySchedule) {
  return !delivery.twoDayNoticeSent;
}

export function canMarkNotificationSent(delivery: DeliverySchedule) {
  return !delivery.notificationSent;
}

export function canReleaseDelivery(delivery: DeliverySchedule) {
  return delivery.status === "ReadyForRelease" &&
    isChecklistComplete(delivery);
}

export function canMarkDeliveryReady(delivery: DeliverySchedule) {
  return delivery.status !== "ReadyForRelease" &&
    delivery.status !== "Released" &&
    isChecklistComplete(delivery);
}

export function deliveryCreateBlockReason(delivery: DeliverySchedule) {
  if (!delivery.pic?.trim()) {
    return "Delivery PIC is required.";
  }

  if (!delivery.scheduledDate?.trim()) {
    return "Delivery schedule date is required.";
  }

  if (delivery.inspectionDone && !delivery.inspectionReportReference?.trim()) {
    return "Inspection report reference is required after inspection is complete.";
  }

  if (delivery.status === "ReadyForRelease" && !canReleaseDelivery(delivery)) {
    return "Delivery cannot be marked ready until inspection, inspection report, documents, car preparation, insurance, road tax, windscreen insurance, and 2-day notice are complete.";
  }

  if (delivery.status === "Released" && !isChecklistComplete(delivery)) {
    return "Delivery cannot be released until inspection, inspection report, documents, car preparation, insurance, road tax, windscreen insurance, and 2-day notice are complete.";
  }

  return undefined;
}

function isChecklistComplete(delivery: DeliverySchedule) {
  return delivery.inspectionDone &&
    Boolean(delivery.inspectionReportReference?.trim()) &&
    delivery.documentsPrepared &&
    delivery.polishDone &&
    delivery.tintedDone &&
    delivery.washDone &&
    delivery.insuranceHandled &&
    delivery.roadTaxHandled &&
    delivery.windscreenInsuranceHandled &&
    delivery.twoDayNoticeSent;
}

export function markTwoDayNoticeSent(delivery: DeliverySchedule): DeliverySchedule {
  return {
    ...delivery,
    twoDayNoticeSent: true
  };
}

export function markNotificationSent(delivery: DeliverySchedule): DeliverySchedule {
  return {
    ...delivery,
    notificationSent: true
  };
}

export function markDeliveryReady(delivery: DeliverySchedule): DeliverySchedule {
  return {
    ...delivery,
    status: "ReadyForRelease"
  };
}
