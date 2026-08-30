import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { VehicleCatalogModel } from "../../api";
import { VehicleCatalogSettings, filterVehicleCatalogModels, vehicleCatalogEmptyText } from "./VehicleCatalogSettings";

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

  it("renders the existing keyword filter as a visible search control", () => {
    const markup = renderToStaticMarkup(createElement(VehicleCatalogSettings));

    expect(markup).toContain('placeholder="Search make or model"');
  });

  it("distinguishes a new catalogue from filters with no matches", () => {
    expect(vehicleCatalogEmptyText(0)).toBe("No catalogue options yet.");
    expect(vehicleCatalogEmptyText(3)).toBe("No catalogue options match the current filters.");
  });
});
