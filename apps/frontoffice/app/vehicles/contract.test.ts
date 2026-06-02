import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("frontoffice public vehicle contract types", () => {
  it("keeps public stock owner and vehicle status unions aligned with backend enums", () => {
    const root = findRepositoryRoot();
    const domainModels = readFileSync(join(root, "services", "api", "src", "YSHeng.Api", "Domain", "Models.cs"), "utf8");
    const service = readFileSync(join(root, "apps", "frontoffice", "app", "vehicles", "service.ts"), "utf8");

    expect(extractDomainEnumValues(domainModels, "StockOwner")).toEqual(extractTypeUnionValues(service, "PublicStockOwner"));
    expect(extractDomainEnumValues(domainModels, "VehicleStatus")).toEqual(extractTypeUnionValues(service, "PublicVehicleStatus"));
  });

  it("keeps public API service paths mapped by the backend", () => {
    const root = findRepositoryRoot();
    const service = readFileSync(join(root, "apps", "frontoffice", "app", "vehicles", "service.ts"), "utf8");
    const program = readFileSync(join(root, "services", "api", "src", "YSHeng.Api", "Program.cs"), "utf8");
    const backendRoutes = extractBackendRoutes(program);

    const missingRoutes = extractClientApiPaths(service)
      .filter((path) => !backendRoutes.has(path));

    expect(missingRoutes).toEqual([]);
  });
});

function extractDomainEnumValues(source: string, enumName: string) {
  const match = new RegExp(`public enum ${enumName} \\{ (?<values>[^}]+) \\}`).exec(source);
  expect(match?.groups?.values, `Missing backend enum ${enumName}`).toBeTruthy();

  return match!.groups!.values.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function extractTypeUnionValues(source: string, typeName: string) {
  const match = new RegExp(`export type ${typeName} = (?<values>[^;]+);`).exec(source);
  expect(match?.groups?.values, `Missing frontoffice service type ${typeName}`).toBeTruthy();

  return [...match!.groups!.values.matchAll(/"(?<value>[^"]+)"/g)]
    .map((valueMatch) => valueMatch.groups!.value);
}

function extractClientApiPaths(source: string) {
  return [...source.matchAll(/(?:"|`)(?<path>\/api\/[^"`]+)(?:"|`)/g)]
    .map((match) => normalizeRoute(match.groups!.path))
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .sort();
}

function extractBackendRoutes(program: string) {
  const routes = new Set<string>();

  for (const match of program.matchAll(/app\.Map(?:Get|Post|Put|Delete)\("(?<path>\/[^"]+)"/g)) {
    routes.add(normalizeRoute(match.groups!.path));
  }

  return routes;
}

function normalizeRoute(route: string) {
  return route
    .split("?")[0]
    .replaceAll(/\$\{[^}]+\}/g, "{}")
    .replaceAll(/\{[^}]+\}/g, "{}");
}

function findRepositoryRoot() {
  let directory = dirname(fileURLToPath(import.meta.url));

  while (true) {
    if (
      existsSync(join(directory, "docs", "API.md")) &&
      existsSync(join(directory, "services", "api", "src", "YSHeng.Api", "Domain", "Models.cs"))
    ) {
      return directory;
    }

    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error("Could not locate repository root.");
    }

    directory = parent;
  }
}
