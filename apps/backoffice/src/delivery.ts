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
    return "Delivery cannot be marked ready until inspection, inspection report, documents, car preparation, insurance, road tax, windscreen insurance, 2-day notice, release evidence, and current expiry dates are complete.";
  }

  if (delivery.status === "Released" && !isChecklistComplete(delivery)) {
    return "Delivery cannot be released until inspection, inspection report, documents, car preparation, insurance, road tax, windscreen insurance, 2-day notice, release evidence, and current expiry dates are complete.";
  }

  return undefined;
}

export function missingReleaseEvidence(delivery: DeliverySchedule) {
  const missing: string[] = [];
  if (!delivery.handoverPhotoCaptured) {
    missing.push("Handover photo");
  }
  if (!delivery.signedHandoverReceived) {
    missing.push("Signed handover document");
  }
  if (!delivery.customerAcknowledged) {
    missing.push("Customer acknowledgement");
  }
  if (!delivery.finalChecklistConfirmed) {
    missing.push("Final checklist confirmation");
  }
  return missing;
}

export function expiredDeliveryDocuments(delivery: DeliverySchedule) {
  const issues: string[] = [];
  addExpiryIssue(issues, delivery.insuranceExpiryDate, delivery.scheduledDate, "Insurance policy");
  addExpiryIssue(issues, delivery.roadTaxExpiryDate, delivery.scheduledDate, "Road tax");
  addExpiryIssue(issues, delivery.windscreenInsuranceExpiryDate, delivery.scheduledDate, "Windscreen insurance");
  return issues;
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
    missingReleaseEvidence(delivery).length === 0 &&
    expiredDeliveryDocuments(delivery).length === 0;
}

function addExpiryIssue(issues: string[], expiryDate: string | undefined, scheduledDate: string, label: string) {
  const normalizedExpiry = expiryDate?.trim();
  if (!normalizedExpiry) {
    issues.push(`${label} expiry date missing`);
    return;
  }

  if (normalizedExpiry < scheduledDate) {
    issues.push(`${label} expires before delivery date`);
  }
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
