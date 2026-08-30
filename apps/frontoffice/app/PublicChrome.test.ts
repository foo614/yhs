import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = dirname(fileURLToPath(import.meta.url));

describe("public chrome mobile motion contract", () => {
  it("renders only footer links with explicit destinations", () => {
    const publicChrome = readFileSync(join(appRoot, "PublicChrome.tsx"), "utf8");
    const copy = readFileSync(join(appRoot, "i18n.ts"), "utf8");

    expect(publicChrome).not.toContain("footerHref");
    expect(publicChrome).toContain('item.href.startsWith("http")');
    expect(copy).not.toContain("Privacy Policy");
    expect(copy).not.toContain("Terms of Service");
    expect(copy).not.toContain("Buying Guide");
    expect(copy).not.toContain("FAQ");
  });

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

  it("keeps short landscape viewports compact and fully navigable", () => {
    const styles = readFileSync(join(appRoot, "styles.css"), "utf8");
    const landscapeQuery = "@media (orientation: landscape) and (max-height: 700px) and (max-width: 1120px)";
    const landscapeStart = styles.indexOf(landscapeQuery);
    const landscapeEnd = styles.indexOf("@media (orientation: landscape)", landscapeStart + landscapeQuery.length);

    expect(landscapeStart).toBeGreaterThanOrEqual(0);
    expect(landscapeEnd).toBeGreaterThan(landscapeStart);

    const landscapeStyles = styles.slice(landscapeStart, landscapeEnd);

    expect(landscapeStyles).toContain(".atelierHeader .atelierBrand {");
    expect(landscapeStyles).toContain(".atelierHeader .atelierBrand img {");
    expect(landscapeStyles).toContain("max-height: calc(100dvh - 72px)");
    expect(landscapeStyles).toContain("overflow-y: auto");
    expect(landscapeStyles).toMatch(/\.atelierMobileNav\s*{\s*display:\s*none;/);
    expect(landscapeStyles).toMatch(/\.heroIntro\s*{[^}]*max-width:\s*350px;/);
  });

  it("keeps the motion layer safe for reduced-motion users", () => {
    const styles = readFileSync(join(appRoot, "styles.css"), "utf8");

    expect(styles).toContain("@keyframes motionRise");
    expect(styles).toContain("@keyframes heroDrift");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("animation: none !important");
  });
});
