import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("operational table UI contract", () => {
  it("keeps staff filter bars visible at every responsive width", () => {
    const styles = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");

    for (const selector of ["workflowFilterBar", "vehicleOperationFilters", "staffFilterBar", "toolbarForm"]) {
      expect(styles, `${selector} must not be globally hidden`).not.toMatch(
        new RegExp(`\\.${selector}[^{}]*\\{[^}]*display\\s*:\\s*none\\s*!important`, "s")
      );
    }
  });
});
