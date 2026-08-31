import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL(".", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return [".ts", ".tsx"].includes(extname(entry.name)) ? [path] : [];
  });
}

describe("operational table UI contract", () => {
  it("uses ProTable rather than importing the plain Ant Design Table component", () => {
    const offenders = sourceFiles(sourceRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      const imports = Array.from(source.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']antd["']/gs));
      const importsPlainTable = imports.some((match) => match[1]
        .split(",")
        .map((name) => name.trim())
        .some((name) => /^Table(?:\s+as\s+\w+)?$/.test(name)));

      return importsPlainTable ? [path.slice(sourceRoot.length)] : [];
    });

    expect(offenders).toEqual([]);
  });

  it("routes application tables through the shared searchable ProTable shell", () => {
    const offenders = sourceFiles(sourceRoot).flatMap((path) => {
      if (!path.endsWith(".tsx") || path.endsWith("OperationsProTable.tsx") || path.endsWith(".test.tsx")) return [];
      const source = readFileSync(path, "utf8");
      return /import\s*\{[^}]*\bProTable\b[^}]*\}\s*from\s*["']@ant-design\/pro-components["']/s.test(source)
        ? [path.slice(sourceRoot.length)]
        : [];
    });

    expect(offenders).toEqual([]);
  });

  it("uses ProTable native multi-field search when a page owns filtering", () => {
    const pageOwnedSearchTables = [
      { file: "App.tsx", dataSources: ["filteredSupplierMaster", "refurbishmentRecords", "filteredLoans", "groupedLeadRows", "auditLog", "filteredStaffUsers"] },
      { file: "modules/delivery/DeliveryWorkboardPage.tsx", dataSources: ["filteredItems"] },
      { file: "modules/vehicles/VehiclePage.tsx", dataSources: ["filteredVehicles"] },
      { file: "modules/settings/VehicleCatalogSettings.tsx", dataSources: ["filteredCatalogModels"] },
      { file: "modules/finance/CashCustodyPage.tsx", dataSources: ["filteredHandovers"] },
      { file: "modules/finance/FinancePage.tsx", dataSources: ["filteredPayments", "filteredSettlements", "filteredBrokerCommissions", "filteredDebtRecoveries", "filteredPaymentVouchers", "filteredDailySpends"] },
      { file: "modules/hr/HrSalaryPage.tsx", dataSources: ["filteredAttendance", "filteredLeaveRequests", "filteredLeaveBalances", "filteredLeaveAdjustments", "filteredPayslips"] }
    ];

    for (const { file, dataSources } of pageOwnedSearchTables) {
      const source = readFileSync(join(sourceRoot, file), "utf8");
      for (const dataSource of dataSources) {
        const marker = `dataSource={${dataSource}}`;
        const markerIndex = source.indexOf(marker);
        expect(markerIndex, `${file} must render the ${dataSource} table`).toBeGreaterThanOrEqual(0);
        const tagStart = Math.max(
          source.lastIndexOf("<OperationsProTable", markerIndex),
          source.lastIndexOf("<Table", markerIndex)
        );
        const tagEnd = source.indexOf("/>", markerIndex);
        const tableTag = source.slice(tagStart, tagEnd);
        expect(tableTag, `${file} ${dataSource} table must use the native ProTable search form`).toContain("nativeSearch={");
        expect(tableTag, `${file} ${dataSource} native search is desktop-only because mobile cards keep compact filters`).toContain("nativeSearchDesktopOnly");
      }
    }

    const appSource = readFileSync(join(sourceRoot, "App.tsx"), "utf8");
    const nestedLeadMarker = appSource.indexOf("dataSource={group.leads}");
    const nestedLeadTable = appSource.slice(appSource.lastIndexOf("<Table", nestedLeadMarker), appSource.indexOf("/>", nestedLeadMarker));
    expect(nestedLeadTable, "nested lead rows must rely on their parent table search").toContain("search={false}");
    expect(appSource.match(/search=\{false\}/g), "only the parent-filtered nested lead table may disable its own query form").toHaveLength(1);

    const vehicleSource = readFileSync(join(sourceRoot, "modules/vehicles/VehiclePage.tsx"), "utf8");
    const vehicleMarker = vehicleSource.indexOf("dataSource={filteredVehicles}");
    const vehicleSearch = vehicleSource.slice(vehicleMarker, vehicleSource.indexOf("pagination={{", vehicleMarker));
    for (const field of ["plate", "make", "model", "year"]) expect(vehicleSearch).toContain(`name: "${field}"`);
    expect(vehicleSearch).not.toContain('name: "keyword"');
    expect(vehicleSearch).not.toContain('name: "stockOwner"');
  });

  it("shows the compact page filters only when the native desktop query form is hidden", () => {
    const styles = readFileSync(join(sourceRoot, "styles.css"), "utf8");

    expect(styles).toMatch(/@media \(min-width: 721px\)[\s\S]*?\.pageFilterMobileOnly\s*\{\s*display:\s*none\s*!important;/);
    expect(styles).toMatch(/@media \(max-width: 720px\)[\s\S]*?\.nativeSearchDesktopOnly \.ant-pro-query-filter\s*\{\s*display:\s*none;/);
    expect(styles.match(/\.financeToolbarForm\s*\{\s*display:\s*flex\s*!important;/g)).toHaveLength(1);
    expect(styles).toMatch(/@media \(max-width: 720px\)\s*\{\s*\.financeToolbarForm\s*\{\s*display:\s*flex\s*!important;/);
  });

  it("does not use a generic Search field in production ProTable query forms", () => {
    const offenders = sourceFiles(sourceRoot).flatMap((path) => {
      if (!path.endsWith(".tsx") || path.endsWith(".test.tsx") || path.endsWith("OperationsProTable.tsx")) return [];
      const source = readFileSync(path, "utf8");
      return /name:\s*["']keyword["']|label:\s*["']Search["']/.test(source) ? [path.slice(sourceRoot.length)] : [];
    });

    expect(offenders).toEqual([]);
  });

  it("filters searchable value-label selects by their visible label", () => {
    const offenders = sourceFiles(sourceRoot).flatMap((path) => {
      if (!path.endsWith(".tsx") || path.endsWith(".test.tsx")) return [];
      const source = readFileSync(path, "utf8");
      const selectTags = source.match(/<Select\b[\s\S]*?\/>/g) ?? [];
      return selectTags
        .filter((tag) => /\bshowSearch\b/.test(tag) && /\boptions=/.test(tag) && !/optionFilterProp=["']label["']/.test(tag))
        .map(() => path.slice(sourceRoot.length));
    });

    expect(offenders).toEqual([]);
  });

  it("keeps staff filter bars visible at every responsive width", () => {
    const styles = readFileSync(fileURLToPath(new URL("./styles.css", import.meta.url)), "utf8");

    for (const selector of ["workflowFilterBar", "vehicleOperationFilters", "staffFilterBar", "toolbarForm"]) {
      expect(styles, `${selector} must not be globally hidden`).not.toMatch(
        new RegExp(`\\.${selector}[^{}]*\\{[^}]*display\\s*:\\s*none\\s*!important`, "s")
      );
    }
  });
});
