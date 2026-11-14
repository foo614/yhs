export const inspectionTypeOptions = [
  { value: 9001, label: "9001 · Awalan" },
  { value: 9002, label: "9002 · Berkala" },
  { value: 9003, label: "9003 · Khas" },
  { value: 9004, label: "9004 · Berkala Semula" },
  { value: 9011, label: "9011 · Pertukaran Hak Milik" }
] as const;

export type InspectionTypeCode = (typeof inspectionTypeOptions)[number]["value"];

export function inspectionTypeLabel(code: number | null | undefined) {
  return inspectionTypeOptions.find(option => option.value === code)?.label ?? "Unknown inspection type";
}
