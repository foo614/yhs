import type { DeliveryReleaseReadiness, DeliverySchedule, VehicleLookup } from "./api";

export const deliveryDocumentCategories = ["DeliveryDocument", "HandoverPhoto", "SignedHandover", "Policy", "RoadTaxReceipt"] as const;

export type DeliveryFilters = {
  keyword?: string;
  status?: DeliverySchedule["status"] | "All";
  readiness?: "All" | "Ready" | "Blocked";
  vehicleId?: string;
};

export function filterDeliverySchedules(
  deliveries: DeliverySchedule[],
  vehicles: VehicleLookup[],
  releaseReadiness: Record<string, DeliveryReleaseReadiness>,
  filters: DeliveryFilters
) {
  const keyword = normalizeFilterValue(filters.keyword);

  return deliveries.filter((delivery) => {
    const vehicle = vehicles.find((item) => item.id === delivery.vehicleId);
    const ready = releaseReadiness[delivery.id]?.isReady ?? canReleaseDelivery(delivery);
    const matchesKeyword = !keyword || matchesFilterValue(keyword, [
      vehicle?.plateNumber,
      delivery.pic,
      delivery.scheduledDate,
      delivery.status
    ]);
    const matchesStatus = !filters.status || filters.status === "All" || delivery.status === filters.status;
    const matchesReadiness = !filters.readiness || filters.readiness === "All" ||
      (filters.readiness === "Ready" ? ready : !ready);
    const matchesVehicle = !filters.vehicleId || delivery.vehicleId === filters.vehicleId;

    return matchesKeyword && matchesStatus && matchesReadiness && matchesVehicle;
  });
}

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
  return delivery.status === "CarPreparation" &&
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
    expiryDatesCurrent(delivery);
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

function normalizeFilterValue(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function matchesFilterValue(keyword: string, values: Array<string | undefined>) {
  return values.some((value) => value?.toLowerCase().includes(keyword));
}
