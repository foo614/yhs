import type { PurchaseInvoice, Vehicle } from "./api";

const malaysiaRegistrationPattern = /^(?:[A-Z]+(?:_[A-Z]+)*[1-9][0-9]{0,3}[A-Z]?|[0-9]{1,3}-[0-9]{1,3}-[A-Z]{2,4})$/;
export const malaysiaPlateFormatMessage = "Enter a valid Malaysia registration number, for example BKC3003 or MALAYSIA1.";

export function normalizeMalaysiaPlate(value?: string) {
  return value
    ?.normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "") ?? "";
}

export function isMalaysiaPlateFormat(value?: string) {
  const normalized = normalizeMalaysiaPlate(value);
  return normalized.length <= 16 && malaysiaRegistrationPattern.test(normalized);
}

export function vehicleCreateBlockReason(vehicle: Vehicle, existing: Vehicle[] = []) {
  if (!vehicle.plateNumber?.trim()) {
    return "Car plate is required.";
  }

  if (!isMalaysiaPlateFormat(vehicle.plateNumber)) {
    return malaysiaPlateFormatMessage;
  }

  if (!vehicle.make?.trim()) {
    return "Vehicle make is required.";
  }

  if (!vehicle.model?.trim()) {
    return "Vehicle model is required.";
  }

  if (vehicle.year < 1900 || vehicle.year > 2100) {
    return "Vehicle year must be between 1900 and 2100.";
  }

  if (vehicle.purchasePrice < 0) {
    return "Purchase price cannot be negative.";
  }

  if (vehicle.sellingPrice <= 0) {
    return "Selling price must be greater than zero.";
  }

  if (vehicle.additionalCharges < 0) {
    return "Additional charges cannot be negative.";
  }

  if (vehicle.refurbishmentTotal < 0) {
    return "Refurbishment total cannot be negative.";
  }

  if (vehicle.commissionTotal < 0) {
    return "Commission cannot be negative.";
  }

  if ((vehicle.contraRangePrice ?? 0) < 0) {
    return "Contra range price cannot be negative.";
  }

  if ((vehicle.outstationPickupAllowance ?? 0) < 0) {
    return "Outstation pickup allowance cannot be negative.";
  }

  if (existing.some((item) => item.id !== vehicle.id && normalizeMalaysiaPlate(item.plateNumber) === normalizeMalaysiaPlate(vehicle.plateNumber))) {
    return "Car plate already exists in inventory.";
  }

  return undefined;
}

export function purchaseInvoiceCreateBlockReason(invoice: PurchaseInvoice, existing: PurchaseInvoice[] = []) {
  if (!invoice.invoiceNumber?.trim()) {
    return "Purchase invoice number is required.";
  }

  if (invoice.amount <= 0) {
    return "Purchase invoice amount must be greater than zero.";
  }

  if (existing.some((item) => item.id !== invoice.id && normalizeReference(item.invoiceNumber) === normalizeReference(invoice.invoiceNumber))) {
    return "Purchase invoice number is already used.";
  }

  return undefined;
}

function normalizeReference(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}
