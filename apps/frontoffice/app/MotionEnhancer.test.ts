import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appRoot = dirname(fileURLToPath(import.meta.url));

describe("frontoffice motion enhancer contract", () => {
  it("wires scroll reveal motion through the root layout", () => {
    const motionPath = join(appRoot, "MotionEnhancer.tsx");
    const layout = readFileSync(join(appRoot, "layout.tsx"), "utf8");
    const styles = readFileSync(join(appRoot, "styles.css"), "utf8");

    expect(existsSync(motionPath)).toBe(true);

    const motionEnhancer = readFileSync(motionPath, "utf8");

    expect(motionEnhancer).toContain('"use client"');
    expect(motionEnhancer).toContain("usePathname()");
    expect(motionEnhancer).toContain("IntersectionObserver");
    expect(motionEnhancer).toContain("motionReady");
    expect(motionEnhancer).toContain("motionReveal");
    expect(motionEnhancer).toContain("prefers-reduced-motion: reduce");
    expect(layout).toContain("import { MotionEnhancer } from \"./MotionEnhancer\";");
    expect(layout).toContain("<MotionEnhancer />");
    expect(styles).toContain(".motionReady .motionReveal");
    expect(styles).toContain(".motionReveal.isVisible");
  });
});
