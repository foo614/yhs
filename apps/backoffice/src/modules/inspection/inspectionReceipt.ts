import type { InspectionRecord } from "../../api";

function invoiceRoot(value: string) {
  return value.trim().replace(/ \(\d+\)$/, "").trim();
}

export function inspectionReceiptNumber(
  invoiceNumber: string,
  records: Pick<InspectionRecord, "sourceReceiptNumber" | "supplierInvoiceReference">[]
) {
  const root = invoiceRoot(invoiceNumber);
  const normalizedRoot = root.toUpperCase();
  const sources = new Map<string, string>();
  for (const record of records) {
    const source = record.sourceReceiptNumber.trim();
    if (invoiceRoot(record.supplierInvoiceReference).toUpperCase() === normalizedRoot
      || source.toUpperCase() === normalizedRoot) {
      sources.set(source.toUpperCase(), source);
    }
  }
  if (sources.size > 1 || sources.has("")) {
    throw new Error("This invoice matches conflicting original receipts. Ask Admin to confirm the receipt link before creating this booking. / 此发票对应的原收据不一致，请先让管理员确认关联。");
  }
  return sources.values().next().value ?? root;
}
