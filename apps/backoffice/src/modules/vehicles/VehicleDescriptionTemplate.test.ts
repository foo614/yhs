import { describe, expect, it } from "vitest";
import type { Vehicle } from "../../api";
import { neutralVehicleDescriptionTemplate, vehicleFromEditValues } from "./VehiclePage";

const vehicle: Vehicle = {
  id: "vehicle-template-test", plateNumber: "JAB1234", make: "Perodua", model: "Myvi", year: 2020,
  stockOwner: "YSHeng", status: "Available", isPublic: false,
  purchasePrice: 20000, sellingPrice: 30000, additionalCharges: 0, refurbishmentTotal: 0, commissionTotal: 0
};

describe("vehicle description template", () => {
  it("contains neutral editable fields without inventing vehicle claims", () => {
    expect(neutralVehicleDescriptionTemplate).toContain("## Vehicle highlights");
    expect(neutralVehicleDescriptionTemplate).toContain("- Year:");
    expect(neutralVehicleDescriptionTemplate).toContain("- Make & model:");
    expect(neutralVehicleDescriptionTemplate).toContain("- Engine:");
    expect(neutralVehicleDescriptionTemplate).not.toMatch(/warranty|accident|flood|loan|service history/i);
  });

  it("does not save the untouched template when updating a vehicle with no description", () => {
    const result = vehicleFromEditValues({ ...vehicle, publicDescriptionMarkdown: neutralVehicleDescriptionTemplate }, vehicle, false);
    expect(result.publicDescriptionMarkdown).toBeUndefined();
  });

  it("preserves a staff-edited description", () => {
    const description = "## Vehicle highlights\n\n- Year: 2020\n- Make & model: Perodua Myvi";
    const result = vehicleFromEditValues({ ...vehicle, publicDescriptionMarkdown: description }, vehicle, false);
    expect(result.publicDescriptionMarkdown).toBe(description);
  });

  it("preserves an existing description when the edit omits it", () => {
    const current = { ...vehicle, publicDescriptionMarkdown: "Viewing by appointment." };
    expect(vehicleFromEditValues(vehicle, current, false).publicDescriptionMarkdown).toBe(current.publicDescriptionMarkdown);
  });
});
