import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const apiTypeByDomainEnum = {
  StockOwner: "StockOwner",
  VehicleStatus: "VehicleStatus",
  LeadStatus: "LeadStatus",
  LoanStatus: "LoanStatus",
  DeliveryStatus: "DeliveryStatus",
  PaymentStatus: "PaymentStatus",
  PaymentVoucherStatus: "PaymentVoucherStatus",
  DebtRecoveryStatus: "DebtRecoveryStatus"
} as const;

describe("backoffice API contract types", () => {
  it("keeps workflow enum unions aligned with backend domain enums", () => {
    const root = findRepositoryRoot();
    const domainModels = readFileSync(join(root, "services", "api", "src", "YSHeng.Api", "Domain", "Models.cs"), "utf8");
    const apiClient = readFileSync(join(root, "apps", "backoffice", "src", "api.ts"), "utf8");

    for (const [domainEnum, apiType] of Object.entries(apiTypeByDomainEnum)) {
      expect(extractDomainEnumValues(domainModels, domainEnum)).toEqual(extractTypeUnionValues(apiClient, apiType));
    }
  });

  it("keeps upload document categories aligned with backend file categories except VehiclePhoto", () => {
    const root = findRepositoryRoot();
    const domainModels = readFileSync(join(root, "services", "api", "src", "YSHeng.Api", "Domain", "Models.cs"), "utf8");
    const apiClient = readFileSync(join(root, "apps", "backoffice", "src", "api.ts"), "utf8");

    const uploadCategories = extractDomainEnumValues(domainModels, "FileCategory")
      .filter((category) => category !== "VehiclePhoto");

    expect(uploadCategories).toEqual(extractTypeUnionValues(apiClient, "DocumentCategory"));
  });

  it("keeps staff role unions aligned with backend identity seed roles", () => {
    const root = findRepositoryRoot();
    const seedData = readFileSync(join(root, "services", "api", "src", "YSHeng.Api", "Data", "SeedData.cs"), "utf8");
    const apiClient = readFileSync(join(root, "apps", "backoffice", "src", "api.ts"), "utf8");

    expect(extractSeedRoles(seedData)).toEqual(extractTypeUnionValues(apiClient, "StaffRole"));
  });

  it("keeps back-office API client paths mapped by the backend", () => {
    const root = findRepositoryRoot();
    const apiClient = readFileSync(join(root, "apps", "backoffice", "src", "api.ts"), "utf8");
    const program = readFileSync(join(root, "services", "api", "src", "YSHeng.Api", "Program.cs"), "utf8");
    const backendRoutes = extractBackendRoutes(program);
    const identityRoutes = new Set(["/api/auth/login"]);

    const missingRoutes = extractClientApiPaths(apiClient)
      .filter((path) => !backendRoutes.has(path) && !identityRoutes.has(path));

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
  expect(match?.groups?.values, `Missing backoffice API type ${typeName}`).toBeTruthy();

  return [...match!.groups!.values.matchAll(/"(?<value>[^"]+)"/g)]
    .map((valueMatch) => valueMatch.groups!.value);
}

function extractSeedRoles(source: string) {
  const match = /public static readonly string\[\] Roles = \[(?<values>[^\]]+)\];/.exec(source);
  expect(match?.groups?.values, "Missing backend SeedData.Roles").toBeTruthy();

  return [...match!.groups!.values.matchAll(/"(?<value>[^"]+)"/g)]
    .map((valueMatch) => valueMatch.groups!.value);
}

function extractClientApiPaths(source: string) {
  return [...source.matchAll(/(?:"|`)(?<path>\/api\/[^"`]+)(?:"|`)/g)]
    .map((match) => normalizeRoute(match.groups!.path))
    .filter((path) => !path.includes("$"))
    .filter((path, index, paths) => paths.indexOf(path) === index)
    .sort();
}

function extractBackendRoutes(program: string) {
  const routes = new Set<string>();

  for (const match of program.matchAll(/app\.Map(?:Get|Post|Put|Delete)\("(?<path>\/[^"]+)"/g)) {
    routes.add(normalizeRoute(match.groups!.path));
  }

  for (const match of program.matchAll(/backOffice\.Map(?:Get|Post|Put|Delete)\("(?<path>\/[^"]+)"/g)) {
    routes.add(normalizeRoute(`/api${match.groups!.path}`));
  }

  for (const match of program.matchAll(/admin\.Map(?:Get|Post|Put|Delete)\("(?<path>\/[^"]+)"/g)) {
    routes.add(normalizeRoute(`/api/admin${match.groups!.path}`));
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
