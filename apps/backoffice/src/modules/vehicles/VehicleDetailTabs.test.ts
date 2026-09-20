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

  it("uses mobile lead cards and compact filters while retaining the desktop table", () => {
    const section = vehicleDetailTabSection();
    const leadsStart = section.indexOf('id="vehicle-leads-card"');
    const documentsStart = section.indexOf('hidden={vehicleDetailTab !== "documents"}', leadsStart);
    const leadsSection = section.slice(leadsStart, documentsStart);

    expect(leadsSection).toContain('aria-label="Search leads for this vehicle"');
    expect(leadsSection).toContain('className="mobileRecordList vehicleLeadMobileList"');
    expect(leadsSection).toContain('className="desktopDataTable nativeSearchDesktopOnly"');
    expect(leadsSection).toContain("scroll={{ x: 720 }}");
  });

  it("uses bilingual buyer wording for every document-owner label", () => {
    const section = vehicleDetailTabSection();
    const buyerLabel = "Buyer / 买家";

    expect(section.match(new RegExp(buyerLabel, "g"))).toHaveLength(4);
    expect(section).toContain('{ key: "Buyer", label: "Buyer / 买家" }');
    expect(section).toContain('{documentOwnershipTab === "Seller" ? "Previous owner / 原车主" : "Buyer / 买家"}');
    expect(section).toContain('<Form.Item label={documentOwnershipTab === "Seller" ? "Previous owner / 原车主" : "Buyer / 买家"}>');
    expect(section).toContain('message={`Link a ${documentOwnershipTab === "Seller" ? "previous owner" : "Buyer / 买家"} before uploading`}');
    expect(section).not.toContain("Buyer / Customer");
    expect(section).not.toContain("buyer / customer");
    expect(vehiclePageSource).toContain("return `Buyer / 买家: ${contactFor(customers, document.customerId)}`;");
  });
});
