import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const vehiclePageSource = fs.readFileSync(path.resolve(__dirname, "VehiclePage.tsx"), "utf8");

function vehicleDetailTabSection() {
  const shellStart = vehiclePageSource.indexOf('<div className="fullWidth vehicleDetailTabContent">');
  const tabsStart = vehiclePageSource.lastIndexOf("<Tabs", shellStart);
  const drawerEnd = vehiclePageSource.indexOf("\n      </Drawer>", shellStart);

  expect(tabsStart).toBeGreaterThanOrEqual(0);
  expect(shellStart).toBeGreaterThan(tabsStart);
  expect(drawerEnd).toBeGreaterThan(shellStart);
  return vehiclePageSource.slice(shellStart, drawerEnd);
}

describe("vehicle detail tab layout", () => {
  it("keeps hidden detail panes out of Ant Design Space gap layout", () => {
    const section = vehicleDetailTabSection();

    expect(section.startsWith('<div className="fullWidth vehicleDetailTabContent">')).toBe(true);
    expect(section).not.toContain('<Space direction="vertical" size={16} className="fullWidth">\n          <div hidden={vehicleDetailTab !== "overview"}>');
    expect(section.match(/<div hidden=\{vehicleDetailTab !== "(?:overview|vehicle|people|documents)"\}>/g)).toHaveLength(4);
  });

  it("uses responsive query-filter columns for the narrow Leads drawer", () => {
    const section = vehicleDetailTabSection();
    const leadsStart = section.indexOf('id="vehicle-leads-card"');
    const documentsStart = section.indexOf('hidden={vehicleDetailTab !== "documents"}', leadsStart);
    const leadsSection = section.slice(leadsStart, documentsStart);

    expect(leadsSection).toContain("search={{ span: { xs: 24, sm: 12, md: 8, lg: 6, xl: 6, xxl: 6 } }}");
    expect(leadsSection).toContain("scroll={{ x: 720 }}");
  });
});
