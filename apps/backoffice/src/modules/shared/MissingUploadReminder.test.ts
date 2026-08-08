import { describe, expect, it } from "vitest";
import { missingUploadItems } from "./MissingUploadReminder";

describe("missingUploadItems", () => {
  it("keeps only optional uploads that are still missing", () => {
    expect(missingUploadItems([
      { label: "VOC", isPresent: true },
      { label: "AP Document", isPresent: false },
      { label: "Loan Document", isPresent: false }
    ])).toEqual([
      { label: "AP Document", isPresent: false },
      { label: "Loan Document", isPresent: false }
    ]);
  });

  it("returns an empty list once every upload is present", () => {
    expect(missingUploadItems([
      { label: "Policy", isPresent: true },
      { label: "Road Tax Receipt", isPresent: true }
    ])).toEqual([]);
  });
});
