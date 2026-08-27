import type { AiUsageLimitSnapshot } from "../../api";

export const ocrOperationalGuidanceItems = [
  { label: "Use for:", text: "clear image photos of identity cards, VOCs, and purchase, repair, payment invoices or receipts." },
  { label: "Expect:", text: "OCR can suggest details such as customer or vehicle identifiers, invoice or receipt numbers, dates, amounts, supplier, and bank details." },
  { label: "Always review:", text: "results are a draft. Check every value and confirm it in the target workflow before saving." },
  { label: "Do not use:", text: "PDFs, blurry or incomplete photos, or documents outside those supported workflows. Enter those details manually." }
] as const;

export function aiUsageSnapshotDescriptionData(snapshot: AiUsageLimitSnapshot) {
  return {
    usedThisMonth: snapshot.usedThisMonth,
    remainingThisMonth: snapshot.remainingThisMonth,
    updatedAt: snapshot.limit.updatedAt.slice(0, 16).replace("T", " "),
    updatedBy: snapshot.limit.updatedBy
  };
}
