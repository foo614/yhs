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
    return deliveryBlockedMessage;
  }

  if (delivery.status === "Released" && !isChecklistComplete(delivery)) {
    return deliveryBlockedMessage;
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
    delivery.twoDayNoticeSent &&
    releaseEvidenceComplete(delivery) &&
    expiryDatesCurrent(delivery);
}

function releaseEvidenceComplete(delivery: DeliverySchedule) {
  return delivery.handoverPhotoCaptured &&
    delivery.signedHandoverReceived &&
    delivery.customerAcknowledged &&
    delivery.finalChecklistConfirmed;
}

function expiryDatesCurrent(delivery: DeliverySchedule) {
  return isCurrentOnDeliveryDate(delivery.insuranceExpiryDate, delivery.scheduledDate) &&
    isCurrentOnDeliveryDate(delivery.roadTaxExpiryDate, delivery.scheduledDate) &&
    isCurrentOnDeliveryDate(delivery.windscreenInsuranceExpiryDate, delivery.scheduledDate);
}

function isCurrentOnDeliveryDate(expiryDate: string | undefined, scheduledDate: string) {
  return Boolean(expiryDate) && expiryDate! >= scheduledDate;
}

const deliveryBlockedMessage = "Delivery cannot be marked ready or released until inspection, documents, car preparation, insurance, road tax, windscreen insurance, 2-day notice, release evidence, and current expiry dates are complete.";

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
