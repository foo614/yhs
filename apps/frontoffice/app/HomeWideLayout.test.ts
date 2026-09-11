import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = dirname(fileURLToPath(import.meta.url));

describe("home wide-screen layout", () => {
  it("uses the same expanded container for the hero and post-hero content", () => {
    const styles = readFileSync(join(appRoot, "styles.css"), "utf8");
    const wideScreenStart = styles.lastIndexOf("@media (min-width: 1600px)");
    const wideScreenRules = styles.slice(wideScreenStart, styles.indexOf("@media (max-width: 1120px)", wideScreenStart));

    expect(wideScreenRules).toContain(".featuredInventorySection");
    expect(wideScreenRules).toContain("width: min(1680px, calc(100% - 80px))");
    expect(wideScreenRules).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
  });
});
