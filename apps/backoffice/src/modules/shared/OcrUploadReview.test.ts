import { describe, expect, it } from "vitest";
import { isOcrImageMimeType, ocrFieldConflicts, resolveOcrReviewValues, type OcrReviewValues } from "./OcrUploadReview";

describe("OCR review conflicts", () => {
  it("accepts only OCR-supported image MIME types", () => {
    expect(isOcrImageMimeType("image/jpeg")).toBe(true);
    expect(isOcrImageMimeType("image/png")).toBe(true);
    expect(isOcrImageMimeType("image/webp")).toBe(true);
    expect(isOcrImageMimeType("application/pdf")).toBe(false);
    expect(isOcrImageMimeType("image/gif")).toBe(false);
  });

  const fields = [
    { name: "customerName", label: "Customer Name" },
    { name: "icNumber", label: "IC Number" },
    { name: "address", label: "Address" }
  ];

  it("requires an explicit choice before replacing a current record value", () => {
    const current: OcrReviewValues = { customerName: "Ali Tan", icNumber: "900101-01-1234", address: "1 Jalan Lama" };
    const extracted: OcrReviewValues = { customerName: "Ali Tan", icNumber: "900101-01-1234", address: "2 Jalan Baru" };

    const conflicts = ocrFieldConflicts(fields, current, extracted);

    expect(conflicts).toEqual([expect.objectContaining({ name: "address", existingValue: "1 Jalan Lama", extractedValue: "2 Jalan Baru" })]);
    expect(resolveOcrReviewValues(extracted, conflicts, {})).toEqual({ ...extracted, address: "1 Jalan Lama" });
    expect(resolveOcrReviewValues(extracted, conflicts, { address: "ocr" })).toEqual(extracted);
  });
});
