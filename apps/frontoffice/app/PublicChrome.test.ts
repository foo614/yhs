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
    expect(copy).toContain('{ label: "Used Cars in Kluang", href: "/used-cars-kluang" }');
    expect(copy).toContain('{ label: "Car Loan Guide for Kluang", href: "/car-loan-kluang" }');
    expect(copy).toContain('{ label: "Trade-In Car Guide for Kluang", href: "/trade-in-car-kluang" }');
    expect(copy).toContain('{ label: "Used Cars Under RM30,000", href: "/vehicles?maxPrice=30000" }');
  });

  it("uses verifiable bilingual homepage content instead of unsupported ratings or service claims", () => {
    const page = readFileSync(join(appRoot, "page.tsx"), "utf8");
    const copy = readFileSync(join(appRoot, "i18n.ts"), "utf8");
    const contact = readFileSync(join(appRoot, "contact", "ContactPageClient.tsx"), "utf8");
    const vehicleCard = readFileSync(join(appRoot, "vehicles", "VehicleCard.tsx"), "utf8");
    const vehicleDetail = readFileSync(join(appRoot, "vehicles", "[id]", "page.tsx"), "utf8");
    const publicContent = `${page}\n${copy}\n${contact}\n${vehicleCard}\n${vehicleDetail}`;

    expect(copy).toContain("YS HENG AUTOMOTIVE SDN BHD is a used-car dealership in Kluang, Johor, Malaysia");
    expect(copy).toContain("YS HENG AUTOMOTIVE SDN BHD 是一家位于马来西亚柔佛州居銮（Kluang, Johor, Malaysia）的二手车经销商");
    expect(copy).toContain('kicker: "Used Car Dealer in Kluang"');
    expect(copy).toContain('kicker: "居銮二手车商"');
    expect(copy).toContain('readyCars: "available cars"');
    expect(copy).toContain('readyCars: "个可询问车源"');
    expect(page).toContain("t.home.evidenceItems.map");
    expect(copy).toContain('{ title: "Current available inventory"');
    expect(copy).toContain('{ title: "Published selling prices"');
    expect(copy).toContain('{ title: "Viewing details"');
    expect(copy).toContain('{ title: "Formal lender terms"');
    expect(publicContent).not.toMatch(/500\+|Customer Reviews|Not yet rated|Updated daily|Same-day follow-up|Ready-to-view|Ready stock|Preparation tracking|Release readiness|Number Plate Bidding|Insurance Agency|light repair|body and paint|Malaysia Used Car Dealer|Inspection & Preparation|Inspection, preparation|workshop preparation|workshop support|客户评价|每日更新|现货车源|现车可询问|车牌竞标|保险代理|钣喷|马来西亚二手车商|检查与整备/i);
    expect(vehicleDetail).not.toContain("currentYear");
    expect(vehicleDetail).not.toContain("ageText");
    expect(page).not.toContain("testimonialPanel");
    expect(page).not.toContain("<Star");
    expect(contact).not.toContain("reviewSnippet");
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

  it("gives mobile footer links a full-height touch target", () => {
    const styles = readFileSync(join(appRoot, "styles.css"), "utf8");

    expect(styles).toMatch(/\.atelierFooter a\s*\{[^}]*min-height:\s*44px;[^}]*padding:\s*6px 0;/s);
  });
});
