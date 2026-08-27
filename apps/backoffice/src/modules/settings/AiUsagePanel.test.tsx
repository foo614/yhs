import { describe, expect, it } from "vitest";
import { aiUsageSnapshotDescriptionData, ocrOperationalGuidanceItems } from "./AiUsagePanelContent";

describe("AI usage settings guidance", () => {
  it("supplies only supported OCR guidance and the required human review instruction", () => {
    const guidance = ocrOperationalGuidanceItems.map((item) => item.text).join(" ");
    expect(guidance).toContain("identity cards, VOCs, and purchase, repair, payment invoices or receipts");
    expect(guidance).toContain("results are a draft");
    expect(guidance).toContain("PDFs, blurry or incomplete photos");
  });

  it("maps the live OCR usage snapshot into description values", () => {
    expect(aiUsageSnapshotDescriptionData({
      usedThisMonth: 12,
      remainingThisMonth: 88,
      limit: {
        id: "ocr-limit",
        service: "Ocr",
        isEnabled: true,
        monthlyRequestLimit: 100,
        perStaffDailyRequestLimit: 5,
        updatedAt: "2026-08-25T09:10:00Z",
        updatedBy: "Boss Admin"
      }
    })).toEqual({ usedThisMonth: 12, remainingThisMonth: 88, updatedAt: "2026-08-25 09:10", updatedBy: "Boss Admin" });
  });
});
