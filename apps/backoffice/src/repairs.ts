import type { RepairJob, SupplierInvoice, VehicleLookup } from "./api";

export const repairDocumentCategories = ["RepairInvoice"] as const;
export const repairApprovalThreshold = 1000;

export type RefurbishmentRecord =
  | { key: string; kind: "repair"; repair: RepairJob }
  | { key: string; kind: "supplierInvoice"; invoice: SupplierInvoice };

export type RefurbishmentFilters = {
  keyword?: string;
  kind?: "All" | "Repair" | "SupplierInvoice";
  state?: "All" | "Open" | "Done";
};

export function refurbishmentDetailsSelection(record: RefurbishmentRecord) {
  return record.kind === "repair"
    ? { repairId: record.repair.id, supplierInvoiceId: undefined }
    : { repairId: undefined, supplierInvoiceId: record.invoice.id };
}

export function filterRefurbishmentRecords(
  repairs: RepairJob[],
  supplierInvoices: SupplierInvoice[],
  vehicles: VehicleLookup[],
  filters: RefurbishmentFilters
): RefurbishmentRecord[] {
  const keyword = normalizeReference(filters.keyword);
  const records: RefurbishmentRecord[] = [
    ...repairs.map((repair) => ({ key: `repair-${repair.id}`, kind: "repair" as const, repair })),
    ...supplierInvoices.map((invoice) => ({ key: `supplier-${invoice.id}`, kind: "supplierInvoice" as const, invoice }))
  ];

  return records.filter((record) => {
    const vehicleId = record.kind === "repair" ? record.repair.vehicleId : record.invoice.vehicleId;
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    const done = record.kind === "repair" ? record.repair.checklistDone : Boolean(record.invoice.paidAt);
    const matchesKeyword = !keyword || matchesRefurbishmentKeyword(record, vehicle?.plateNumber, keyword);
    const matchesKind = !filters.kind || filters.kind === "All" ||
      (filters.kind === "Repair" ? record.kind === "repair" : record.kind === "supplierInvoice");
    const matchesState = !filters.state || filters.state === "All" ||
      (filters.state === "Done" ? done : !done);

    return matchesKeyword && matchesKind && matchesState;
  });
}

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

function matchesRefurbishmentKeyword(record: RefurbishmentRecord, plateNumber: string | undefined, keyword: string) {
  const values = record.kind === "repair"
    ? [plateNumber, record.repair.whatToDo, record.repair.repairPart]
    : [plateNumber, record.invoice.supplierName, record.invoice.invoiceNumber, record.invoice.plateNumberOnInvoice];

  const compactKeyword = normalizeCompactSearchValue(keyword);

  return values.some((value) => {
    const normalizedValue = normalizeReference(value);
    return normalizedValue.includes(keyword) ||
      (Boolean(compactKeyword) && normalizeCompactSearchValue(normalizedValue).includes(compactKeyword));
  });
}

function normalizeCompactSearchValue(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
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
