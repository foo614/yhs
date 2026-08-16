import { describe, expect, it } from "vitest";
import { documentChecklistProgress } from "./DocumentUploadChecklist";

describe("documentChecklistProgress", () => {
  it("counts uploaded documents without treating missing items as complete", () => {
    expect(documentChecklistProgress([
      { label: "Policy", isPresent: true },
      { label: "Road Tax Receipt", isPresent: false },
      { label: "Delivery Document", isPresent: false }
    ])).toEqual({ completed: 1, total: 3 });
  });
});
