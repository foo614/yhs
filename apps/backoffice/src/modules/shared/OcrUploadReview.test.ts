import { describe, expect, it, vi } from "vitest";
import type { OcrJob } from "../../api";
import { groupOcrFields, isOcrImageMimeType, isOcrUploadMimeType, ocrFailureMessage, ocrFieldConflicts, ocrSupportsLineItems, repairLineItemsFromRawText, runOcrApplySteps, type OcrApplyProgress, type OcrReviewValues } from "./OcrUploadReview";

describe("OCR partial-save recovery", () => {
  const reviewedJob: OcrJob = { id: "reviewed-job", documentId: "document", category: "Voc", status: "Reviewed", progress: 100, warnings: [], createdAt: "2026-09-07T00:00:00Z", reviewDecision: "Reviewed" };

  it("retries a failed target save without submitting the completed review again", async () => {
    const progress: OcrApplyProgress = { targetApplied: false };
    const applyTarget = vi.fn().mockRejectedValueOnce(new Error("Vehicle save failed")).mockResolvedValue(undefined);
    const saveReview = vi.fn().mockResolvedValue(reviewedJob);
    const changed = vi.fn();
    await expect(runOcrApplySteps(progress, false, applyTarget, saveReview, changed)).rejects.toThrow("Vehicle save failed");
    expect(progress).toEqual({ targetApplied: false, reviewedJob });
    await runOcrApplySteps(progress, false, applyTarget, saveReview, changed);
    expect(saveReview).toHaveBeenCalledTimes(1);
    expect(applyTarget).toHaveBeenCalledTimes(2);
    expect(applyTarget).toHaveBeenLastCalledWith(reviewedJob);
    expect(progress.targetApplied).toBe(true);
  });

  it("retries review failure after a repair receipt save without creating another receipt", async () => {
    const progress: OcrApplyProgress = { targetApplied: false };
    const applyTarget = vi.fn().mockResolvedValue(undefined);
    const saveReview = vi.fn().mockRejectedValueOnce(new Error("Review save failed")).mockResolvedValue(reviewedJob);
    await expect(runOcrApplySteps(progress, true, applyTarget, saveReview, vi.fn())).rejects.toThrow("Review save failed");
    expect(progress).toEqual({ targetApplied: true });
    await runOcrApplySteps(progress, true, applyTarget, saveReview, vi.fn());
    expect(applyTarget).toHaveBeenCalledTimes(1);
    expect(saveReview).toHaveBeenCalledTimes(2);
    expect(progress.reviewedJob).toBe(reviewedJob);
  });

  it("does not apply results when the selected record changes during review", async () => {
    const progress: OcrApplyProgress = { targetApplied: false };
    const applyTarget = vi.fn();
    const changed = vi.fn();
    await runOcrApplySteps(progress, false, applyTarget, async () => reviewedJob, changed, () => false);
    expect(applyTarget).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
});

describe("OCR review conflicts", () => {
  it("accepts only OCR-supported image MIME types", () => {
    expect(isOcrImageMimeType("image/jpeg")).toBe(true);
    expect(isOcrImageMimeType("image/png")).toBe(true);
    expect(isOcrImageMimeType("image/webp")).toBe(true);
    expect(isOcrImageMimeType("application/pdf")).toBe(false);
    expect(isOcrImageMimeType("image/gif")).toBe(false);
  });

  it("accepts VOC PDFs without broadening the identity-card or repair image contract", () => {
    expect(isOcrUploadMimeType("Voc", "application/pdf")).toBe(true);
    expect(isOcrUploadMimeType("Voc", "image/jpeg")).toBe(true);
    expect(isOcrUploadMimeType("IdentityCard", "application/pdf")).toBe(false);
    expect(isOcrUploadMimeType("RepairInvoice", "application/pdf")).toBe(false);
    expect(isOcrUploadMimeType("Voc", "text/html")).toBe(false);
  });

  it("does not treat numbers in identity cards or VOCs as receipt line items", () => {
    expect(ocrSupportsLineItems("IdentityCard")).toBe(false);
    expect(ocrSupportsLineItems("Voc")).toBe(false);
    expect(ocrSupportsLineItems("RepairInvoice")).toBe(true);
    expect(ocrSupportsLineItems("PaymentReceipt")).toBe(true);
  });

  const fields = [
    { name: "customerName", label: "Customer Name" },
    { name: "icNumber", label: "IC Number" },
    { name: "address", label: "Address" }
  ];

  it("surfaces current-record differences for staff to correct in the review form", () => {
    const current: OcrReviewValues = { customerName: "Ali Tan", icNumber: "900101-01-1234", address: "1 Jalan Lama" };
    const extracted: OcrReviewValues = { customerName: "Ali Tan", icNumber: "900101-01-1234", address: "2 Jalan Baru" };

    const conflicts = ocrFieldConflicts(fields, current, extracted);

    expect(conflicts).toEqual([expect.objectContaining({ name: "address", existingValue: "1 Jalan Lama", extractedValue: "2 Jalan Baru" })]);
  });

  it("keeps related OCR fields together in their configured review sections", () => {
    const groups = groupOcrFields([
      { name: "supplierName", label: "Supplier", section: { key: "supplier", title: "Supplier details" } },
      { name: "supplierPhone", label: "Supplier phone", section: { key: "supplier", title: "Supplier details" } },
      { name: "invoiceNumber", label: "Invoice", section: { key: "receipt", title: "Receipt details" } }
    ]);

    expect(groups.map((group) => ({ key: group.key, fields: group.fields.map((field) => field.name) }))).toEqual([
      { key: "supplier", fields: ["supplierName", "supplierPhone"] },
      { key: "receipt", fields: ["invoiceNumber"] }
    ]);
  });

  it("keeps quantity, unit, unit price, and line amount together on each receipt row", () => {
    const items = repairLineItemsFromRawText([
      "50 HD 2PLY FRONT SCREEN 1 SQF 130.00 130.00",
      "CARWALES SOFTWIPER14 1 PC 7.50 7.50",
      "Total 137.50"
    ].join("\n"));

    expect(items).toEqual([
      expect.objectContaining({ description: "50 HD 2PLY FRONT SCREEN", quantity: "1", unit: "SQF", unitPrice: "130.00", amount: "130.00" }),
      expect.objectContaining({ description: "CARWALES SOFTWIPER14", quantity: "1", unit: "PC", unitPrice: "7.50", amount: "7.50" })
    ]);
  });

  it("keeps a unitless receipt row structured instead of adding its values to the description", () => {
    const [item] = repairLineItemsFromRawText("DASHCAM FRONT & REAR (OWNER GOODS) 1 60.00 60.00");

    expect(item).toEqual(expect.objectContaining({
      description: "DASHCAM FRONT & REAR (OWNER GOODS)",
      quantity: "1",
      unitPrice: "60.00",
      amount: "60.00"
    }));
    expect(item?.unit).toBeUndefined();
  });

  it("explains a failed OCR job instead of presenting empty details as ready", () => {
    expect(ocrFailureMessage({
      status: "Failed",
      result: null,
      warnings: ["Local OCR mock cannot read image files."]
    })).toBe("Local OCR mock cannot read image files.");
    expect(ocrFailureMessage({ status: "NeedsReview", result: null, warnings: [] })).toBe("OCR returned no usable values. Enter the details manually or try a clearer document.");
  });
});
