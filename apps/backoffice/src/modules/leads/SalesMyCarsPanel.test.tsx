import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SalesWorkboard } from "../../api";
import { SalesMyCarsPanel } from "./SalesMyCarsPanel";

const workboard: SalesWorkboard = {
  soldThisMonth: 3,
  inProgressCount: 2,
  availableAgents: [{ id: "agent-1", displayName: "Jason Tan" }],
  items: [{
    vehicleId: "vehicle-1",
    plateNumber: "VPK 1234",
    vehicleLabel: "Toyota Vios",
    salesAgentUserId: "agent-1",
    salesAgentName: "Jason Tan",
    process: "Delivery",
    responsibleDepartment: "Delivery",
    nextAction: "Prepare the car"
  }]
};

describe("Sales My Cars", () => {
  it("shows the sales agent only their useful process summary without finance details", () => {
    const markup = renderToStaticMarkup(createElement(SalesMyCarsPanel, {
      currentUser: { isAuthenticated: true, id: "agent-1", name: "Jason Tan", roles: ["Sales"] },
      initialData: workboard,
      autoLoad: false
    }));

    expect(markup).toContain("Sold this month");
    expect(markup).toContain("Cars in progress");
    expect(markup).toContain("Current process / 当前流程");
    expect(markup).toContain("Responsible team / 负责部门");
    expect(markup).toContain("Prepare the car");
    expect(markup).not.toContain("Invoice");
    expect(markup).not.toContain("Payment");
  });

  it("adds the all-agent filter only for Boss/Admin", () => {
    const bossMarkup = renderToStaticMarkup(createElement(SalesMyCarsPanel, {
      currentUser: { isAuthenticated: true, id: "boss-1", name: "Boss", roles: ["BossAdmin"] },
      initialData: workboard,
      autoLoad: false
    }));
    const salesMarkup = renderToStaticMarkup(createElement(SalesMyCarsPanel, {
      currentUser: { isAuthenticated: true, id: "agent-1", name: "Jason Tan", roles: ["Sales"] },
      initialData: workboard,
      autoLoad: false
    }));

    expect(bossMarkup).toContain("All agents");
    expect(bossMarkup).toContain("Agent / 销售员");
    expect(salesMarkup).not.toContain("All agents");
    expect(salesMarkup).not.toContain("Agent / 销售员");
  });

  it("paginates the Boss mobile all-agent view while keeping the desktop data source complete", () => {
    const items = Array.from({ length: 8 }, (_, index) => ({
      ...workboard.items[0],
      vehicleId: `vehicle-${index + 1}`,
      plateNumber: `TEST ${index + 1}`
    }));
    const markup = renderToStaticMarkup(createElement(SalesMyCarsPanel, {
      currentUser: { isAuthenticated: true, id: "boss-1", name: "Boss", roles: ["BossAdmin"] },
      initialData: { ...workboard, items },
      autoLoad: false
    }));

    expect(markup.match(/salesMyCarsMobileCard/g) ?? []).toHaveLength(6);
    expect(markup).toContain("TEST 8");
    expect(markup).toContain("ant-pagination");
  });
});
