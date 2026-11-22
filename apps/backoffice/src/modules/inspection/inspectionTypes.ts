export const inspectionTypeOptions = [
  { value: 9001, label: "9001 · Awalan / 初次检验" },
  { value: 9002, label: "9002 · Berkala / 定期检验" },
  { value: 9003, label: "9003 · Khas / 特别检验" },
  { value: 9004, label: "9004 · Berkala Semula / 定期复检" },
  { value: 9011, label: "9011 · Pertukaran Hak Milik / 过户检验" }
] as const;

export type InspectionTypeCode = (typeof inspectionTypeOptions)[number]["value"];

export function inspectionTypeLabel(code: number | null | undefined) {
  if (code == null) return "Not applicable / 不适用";
  return inspectionTypeOptions.find(option => option.value === code)?.label ?? "Unknown inspection type / 未知验车类型";
}
