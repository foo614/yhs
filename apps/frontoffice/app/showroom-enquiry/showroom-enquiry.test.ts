import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { showroomBudgetRanges, showroomStepError, showroomVehicleTypes } from "./showroom-enquiry";

const showroomRoot = dirname(fileURLToPath(import.meta.url));

describe("showroom enquiry flow rules", () => {
  it("keeps the approved tap-first vehicle and budget choices", () => {
    expect(showroomVehicleTypes).toEqual(["Sedan", "SUV", "MPV", "Pickup"]);
    expect(showroomBudgetRanges).toEqual(["Under RM30k", "RM30k–RM50k", "RM50k–RM80k", "RM80k+"]);
  });

  it("requires only the relevant choice or contact information at each step", () => {
    const values = { vehicleType: "", budgetRange: "", customerName: "", phone: "", consent: false };
    expect(showroomStepError(1, values)).toContain("vehicle");
    expect(showroomStepError(2, { ...values, vehicleType: "SUV" })).toContain("budget");
    expect(showroomStepError(3, { ...values, vehicleType: "SUV", budgetRange: "RM30k–RM50k" })).toContain("name");
    expect(showroomStepError(3, { ...values, vehicleType: "SUV", budgetRange: "RM30k–RM50k", customerName: "Ali" })).toContain("phone");
    expect(showroomStepError(3, { ...values, vehicleType: "SUV", budgetRange: "RM30k–RM50k", customerName: "Ali", phone: "0123456789" })).toContain("confirm");
  });

  it("uses the supplied Canvas crops rather than the homepage hero asset", () => {
    const flow = readFileSync(join(showroomRoot, "ShowroomEnquiryFlow.tsx"), "utf8");
    const styles = readFileSync(join(showroomRoot, "..", "styles.css"), "utf8");
    const assets = ["canvas-direction-one.png", "canvas-hero.png", "canvas-sedan.png", "canvas-suv.png", "canvas-mpv.png", "canvas-pickup.png"]
      .map((name) => join(showroomRoot, "..", "..", "public", "showroom-enquiry", name));

    expect(assets.every(existsSync)).toBe(true);
    expect(flow).toContain('src="/showroom-enquiry/canvas-hero.png"');
    expect(flow).toContain('image: "/showroom-enquiry/canvas-sedan.png"');
    expect(flow).toContain('image: "/showroom-enquiry/canvas-pickup.png"');
    expect(flow).not.toContain('src="/hero-price-bay-option2.png"');
    expect(styles).toContain('canvas-direction-one.png');
  });

  it("turns Direction 1 into a wide four-tile layout on desktop without changing its mobile Canvas treatment", () => {
    const styles = readFileSync(join(showroomRoot, "..", "styles.css"), "utf8");

    expect(styles).toContain("@media (min-width: 900px)");
    expect(styles).toContain("max-width: 1248px");
    expect(styles).toContain("width: min(100%, 1248px)");
    expect(styles).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(styles).toContain("@media (max-width: 639px)");
    expect(styles).toContain("width: auto;");
    expect(styles).toContain('canvas-direction-one.png');
  });
});
