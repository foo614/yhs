import { describe, expect, it } from "vitest";
import { inspectionTypeLabel, inspectionTypeOptions } from "./inspectionTypes";

describe("inspection type API round trip", () => {
  it("retains the selected type label when the API serializes its enum name", () => {
    for (const option of inspectionTypeOptions) {
      expect(inspectionTypeLabel(option.name)).toBe(inspectionTypeLabel(option.value));
      expect(inspectionTypeLabel(option.name)).toContain(String(option.value));
    }
  });
});
