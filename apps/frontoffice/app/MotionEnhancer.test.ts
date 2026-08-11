import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = dirname(fileURLToPath(import.meta.url));

describe("frontoffice motion enhancer contract", () => {
  it("wires scroll reveal motion through the root layout", () => {
    const motionPath = join(appRoot, "MotionEnhancer.tsx");
    const layout = readFileSync(join(appRoot, "layout.tsx"), "utf8");
    const page = readFileSync(join(appRoot, "page.tsx"), "utf8");
    const styles = readFileSync(join(appRoot, "styles.css"), "utf8");

    expect(existsSync(motionPath)).toBe(true);

    const motionEnhancer = readFileSync(motionPath, "utf8");

    expect(motionEnhancer).toContain('"use client"');
    expect(motionEnhancer).toContain("usePathname()");
    expect(motionEnhancer).toContain("useGSAP");
    expect(motionEnhancer).toContain("contextSafe");
    expect(motionEnhancer).toContain("gsap.registerPlugin(useGSAP)");
    expect(motionEnhancer).toContain("const scope = useRef<HTMLDivElement>(null)");
    expect(motionEnhancer).toContain("{ scope, dependencies: [pathname], revertOnUpdate: true }");
    expect(motionEnhancer).toContain('from "gsap"');
    expect(motionEnhancer).toContain("IntersectionObserver");
    expect(motionEnhancer).toContain('querySelector<HTMLElement>(".atelierHero")');
    expect(motionEnhancer).toContain('querySelectorAll<HTMLElement>(".heroPriceTagMotion")');
    expect(motionEnhancer).toContain('ease: "bounce.out"');
    expect(motionEnhancer).toContain("gsap.fromTo");
    expect(motionEnhancer).toContain('clearProps: "opacity,visibility,transform"');
    expect(motionEnhancer).toContain("prefers-reduced-motion: reduce");
    expect(motionEnhancer.indexOf("prefers-reduced-motion: reduce")).toBeLessThan(motionEnhancer.indexOf("gsap.timeline"));
    expect(motionEnhancer).not.toContain('classList.add("motionReady")');
    expect(motionEnhancer).not.toContain('classList.add("motionReveal")');
    expect(motionEnhancer).not.toContain("ScrollTrigger");
    expect(layout).toContain("import { MotionEnhancer } from \"./MotionEnhancer\";");
    expect(layout).toContain("<MotionEnhancer>{children}</MotionEnhancer>");
    expect(page).toContain('hero-price-bay-option2@2x.png');
    expect(page).toContain("<HeroPriceTags language={language} vehicles={heroVehicles} />");
    expect(page).toContain('hrefWithSearch("/vehicles", language, { make: vehicle.make, maxPrice: String(vehicle.sellingPrice) })');
    expect(page).toContain('className="heroBrowseAction"');
    expect(page).toContain('import { HeroVehicleFilters } from "./HeroVehicleFilters";');
    expect(page).toContain("getPublicVehicleCatalog()");
    expect(page).toContain("catalogModelsFromVehicles");
    expect(page).toContain("distinctYears");
    expect(styles).toContain(".heroPriceTagMotion");
    expect(styles).toContain(".heroPriceTags");
    expect(styles).toContain(".heroBrowseAction");
    expect(styles).toContain(".heroInventorySummary");
    expect(styles).toContain("@media (min-width: 1600px)");
    expect(styles).toContain("width: min(62vw, 1200px)");
    expect(styles).not.toContain(".motionReady .motionReveal");
    expect(styles).not.toContain(".motionReveal.isVisible");
    expect(styles).not.toMatch(/@keyframes motionRise\s*{\s*from\s*{\s*opacity:\s*0;/);
  });
});
