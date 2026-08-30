import { describe, expect, it } from "vitest";
import type { VehicleCatalogModel } from "../../api";
import { filterVehicleCatalogModels } from "./VehicleCatalogSettings";

describe("filterVehicleCatalogModels", () => {
  const catalogModels: VehicleCatalogModel[] = [
    { id: "catalog-1", make: "Toyota", model: "Vios", isActive: true },
    { id: "catalog-2", make: "Honda", model: "City", isActive: false },
    { id: "catalog-3", make: "Toyota", model: "Yaris", isActive: true }
  ];

  it("filters catalogue models by keyword and website visibility", () => {
    expect(filterVehicleCatalogModels(catalogModels, { keyword: "toyota" }).map((model) => model.id)).toEqual(["catalog-1", "catalog-3"]);
    expect(filterVehicleCatalogModels(catalogModels, { keyword: "city", status: "hidden" }).map((model) => model.id)).toEqual(["catalog-2"]);
    expect(filterVehicleCatalogModels(catalogModels, { status: "active" }).map((model) => model.id)).toEqual(["catalog-1", "catalog-3"]);
  });
});
