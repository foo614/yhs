import { describe, expect, it } from "vitest";
import { neutralVehicleDescriptionTemplate } from "./VehiclePage";

describe("vehicle description template", () => {
  it("contains neutral editable fields without inventing vehicle claims", () => {
    expect(neutralVehicleDescriptionTemplate).toContain("## Vehicle highlights");
    expect(neutralVehicleDescriptionTemplate).toContain("- Year:");
    expect(neutralVehicleDescriptionTemplate).toContain("- Make & model:");
    expect(neutralVehicleDescriptionTemplate).toContain("- Engine:");
    expect(neutralVehicleDescriptionTemplate).not.toMatch(/warranty|accident|flood|loan|service history/i);
  });
});
