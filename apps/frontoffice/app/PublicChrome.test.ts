import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = dirname(fileURLToPath(import.meta.url));

describe("public chrome mobile motion contract", () => {
  it("keeps the mobile drawer wired to hamburger state", () => {
    const publicChrome = readFileSync(join(appRoot, "PublicChrome.tsx"), "utf8");
    const styles = readFileSync(join(appRoot, "styles.css"), "utf8");

    expect(publicChrome).toContain("const [mobileMenuOpen, setMobileMenuOpen]");
    expect(publicChrome).toContain("aria-expanded={mobileMenuOpen}");
    expect(publicChrome).toContain('className={mobileMenuOpen ? "mobileDrawer open" : "mobileDrawer"}');
    expect(publicChrome).toContain("onClick={() => setMobileMenuOpen((open) => !open)}");
    expect(publicChrome).toContain("onClick={closeMobileMenu}");
    expect(styles).toContain(".mobileDrawer.open");
    expect(styles).toContain(".mobileDrawerBackdrop.open");
  });

  it("keeps the motion layer safe for reduced-motion users", () => {
    const styles = readFileSync(join(appRoot, "styles.css"), "utf8");

    expect(styles).toContain("@keyframes motionRise");
    expect(styles).toContain("@keyframes heroDrift");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("animation: none !important");
  });
});
