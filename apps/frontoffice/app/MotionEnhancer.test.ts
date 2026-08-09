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
    expect(motionEnhancer).toContain('hero.classList.add("heroAmbient")');
    expect(motionEnhancer).toContain('querySelector(".heroInventorySignal")');
    expect(motionEnhancer).toContain("gsap.fromTo");
    expect(motionEnhancer).toContain('clearProps: "opacity,visibility,transform"');
    expect(motionEnhancer).toContain("prefers-reduced-motion: reduce");
    expect(motionEnhancer.indexOf("prefers-reduced-motion: reduce")).toBeLessThan(motionEnhancer.indexOf("gsap.timeline"));
    expect(motionEnhancer).not.toContain('classList.add("motionReady")');
    expect(motionEnhancer).not.toContain('classList.add("motionReveal")');
    expect(motionEnhancer).not.toContain("ScrollTrigger");
    expect(layout).toContain("import { MotionEnhancer } from \"./MotionEnhancer\";");
    expect(layout).toContain("<MotionEnhancer>{children}</MotionEnhancer>");
    expect(page).toContain("inventoryCount={vehicles.length}");
    expect(page).toContain("!unavailable && inventoryCount > 0");
    expect(page).toContain('hrefWithLanguage("/vehicles", language)');
    expect(styles).toContain(".atelierHero.heroAmbient .heroMedia");
    expect(styles).not.toContain(".atelierHero.heroAmbient .heroFloatCard");
    expect(styles).not.toContain(".motionReady .motionReveal");
    expect(styles).not.toContain(".motionReveal.isVisible");
    expect(styles).not.toMatch(/@keyframes motionRise\s*{\s*from\s*{\s*opacity:\s*0;/);
  });
});
