import { Form } from "antd";
import type { NamePath } from "antd/es/form/interface";
import type { FieldData } from "rc-field-form/lib/interface";
import type { ReactNode } from "react";

/**
 * Business text is conventionally stored in uppercase. Keep this allowlist
 * explicit so credentials, emails, URLs, opaque technical values, enums, and
 * authored Markdown retains its original form.
 */
export const uppercaseBusinessFieldNames = new Set([
  "name",
  "customerName",
  "ownerName",
  "sellerName",
  "displayName",
  "companyName",
  "supplierName",
  "contactPerson",
  "address",
  "sellerAddress",
  "deliveryAddress",
  "transportMethod",
  "description",
  "bankName",
  "brokerName",
  "payeeName",
  "location",
  "purpose",
  "reason",
  "rejectionReason",
  "nettPriceOverrideReason",
  "notes",
  "label",
  "whatToDo",
  "make",
  "model",
  "chassisNumber",
  "engineNumber",
  "plateNumber",
  "plateNumberOnInvoice",
  "invoiceNumber",
  "receiptNumber",
  "reference",
  "referenceNumber",
  "paymentReference",
  "paymentEvidenceReference",
  "loanBankReference",
  "chequeNumber",
  "registrationNumber",
  "tinNumber",
  "sellerTinNumber",
  "autoCountCreditorCode",
  "bookingSlipReference",
  "outstationPickupBookingSlip",
  "inspectionReportReference",
  "inspectionBookingReference",
  "insuranceReference",
  "roadTaxReference",
  "windscreenReference"
]);

function fieldNameKey(name: NamePath | undefined) {
  if (typeof name === "string") return name;
  if (Array.isArray(name) && typeof name[name.length - 1] === "string") return name[name.length - 1] as string;
  return undefined;
}

export function normalizeBusinessTextValue(name: NamePath | undefined, value: unknown) {
  const key = fieldNameKey(name);
  return key && uppercaseBusinessFieldNames.has(key) && typeof value === "string"
    ? value.toUpperCase()
    : value;
}

export function normalizeBusinessTextFields(fields: FieldData[]) {
  return fields
    .map((field) => ({ ...field, value: normalizeBusinessTextValue(field.name, field.value) }))
    .filter((field, index) => field.value !== fields[index].value);
}

export function normalizeBusinessTextFormChange(
  name: string,
  info: { changedFields: FieldData[]; forms: Record<string, { setFields: (fields: FieldData[]) => void }> }
) {
  const form = info.forms[name];
  if (!form) return;

  const normalizedFields = normalizeBusinessTextFields(info.changedFields);
  if (normalizedFields.length > 0) form.setFields(normalizedFields);
}

export function BusinessTextFormProvider({ children }: { children: ReactNode }) {
  return (
      <Form.Provider
        onFormChange={normalizeBusinessTextFormChange}
    >
      {children}
    </Form.Provider>
  );
}
