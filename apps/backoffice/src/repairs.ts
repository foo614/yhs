import type { RepairJob, SupplierInvoice, VehicleLookup } from "./api";

export const repairDocumentCategories = ["RepairInvoice"] as const;
export const repairApprovalThreshold = 1000;

export function supplierInvoiceCreateBlockReason(invoice: SupplierInvoice, existing: SupplierInvoice[] = [], vehicles: VehicleLookup[] = []) {
  if (!invoice.supplierName?.trim()) {
    return "Supplier name is required.";
  }

  if (!invoice.invoiceNumber?.trim()) {
    return "Supplier invoice number is required.";
  }

  if (invoice.amount <= 0) {
    return "Supplier invoice amount must be greater than zero.";
  }

  const vehicle = vehicles.find((item) => item.id === invoice.vehicleId);
  if (invoice.plateNumberOnInvoice?.trim() && vehicle && normalizePlate(invoice.plateNumberOnInvoice) !== normalizePlate(vehicle.plateNumber)) {
    return "Supplier invoice plate does not match the selected car plate.";
  }

  if (existing.some((item) =>
    item.id !== invoice.id &&
    normalizeReference(item.supplierName) === normalizeReference(invoice.supplierName) &&
    normalizeReference(item.invoiceNumber) === normalizeReference(invoice.invoiceNumber)
  )) {
    return "Supplier invoice number is already used for this supplier.";
  }

  return undefined;
}

export function repairCreateBlockReason(repair: RepairJob) {
  if (!repair.whatToDo?.trim()) {
    return "Repair task is required.";
  }

  if (repair.cost < 0) {
    return "Repair cost cannot be negative.";
  }

  if (repair.cost >= repairApprovalThreshold && repair.checklistDone && repair.approvalStatus !== "Approved") {
    return "High-cost repair must be approved before it is completed or treated as final.";
  }

  return undefined;
}

export function isRepairCostFinal(repair: RepairJob) {
  return repair.cost < repairApprovalThreshold || repair.approvalStatus === "Approved";
}

export function supplierInvoiceAgingStatus(invoice: SupplierInvoice, today = todayIsoDate()) {
  if (invoice.paidAt) return "Paid";
  if (!invoice.dueDate) return "Unmatched";
  if (invoice.dueDate < today) return "Overdue";
  return dateDistanceInDays(today, invoice.dueDate) <= 7 ? "DueSoon" : "Unmatched";
}

function normalizeReference(value?: string) {
  return value?.trim().toLowerCase() ?? "";
}

function normalizePlate(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function dateDistanceInDays(from: string, to: string) {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
}
