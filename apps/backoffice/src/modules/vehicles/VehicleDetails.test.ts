import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("vehicle reapproval notice layout contract", () => {
  it("spans the vehicle details form grid", () => {
    const styles = readFileSync(fileURLToPath(new URL("./VehicleDetails.css", import.meta.url)), "utf8");
    const noticeRule = styles.match(/\.vehicleReapprovalNotice\s*\{([^}]*)\}/s);

    expect(noticeRule, "the reapproval notice needs a scoped layout rule").not.toBeNull();
    expect(noticeRule?.[1]).toMatch(/grid-column\s*:\s*1\s*\/\s*-1\s*;/);
  });
});
