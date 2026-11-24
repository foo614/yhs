import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL(".", import.meta.url));

function source(path: string) {
  return readFileSync(join(sourceRoot, path), "utf8");
}

describe("back-office information banner UI contract", () => {
  it("keeps the repair receipt flow separated without a tall explanatory alert", () => {
    const app = source("App.tsx");
    const styles = source("styles.css");

    expect(styles).toMatch(/\.repairReceiptFlow\s*\{[^}]*display:\s*grid;[^}]*gap:\s*10px;/s);
    expect(app).toContain("Receipt scanning fills supplier and amount details only. Enter the repair instructions below.");
    expect(app).not.toContain("Receipt OCR stays separate from the repair instructions.");
  });

  it("uses compact routine banners for visible feedback", () => {
    const compactBannerFiles = [
      "App.tsx",
      "modules/customers/Customer360Page.tsx",
      "modules/settings/ShowroomEnquiryQrSettings.tsx"
    ];

    for (const path of compactBannerFiles) {
      expect(source(path), `${path} must use the compact routine-info treatment`).toContain("operationalInfoAlert");
    }

  });
});
