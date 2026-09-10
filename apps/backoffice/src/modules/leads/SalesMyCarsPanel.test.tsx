import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SalesWorkboard } from "../../api";
import { filterSalesMyCars, SalesMyCarsPanel } from "./SalesMyCarsPanel";

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

describe("Cars I’m Handling", () => {
  it("filters the loaded workboard by practical sales keywords", () => {
    const items = [
      workboard.items[0],
      { ...workboard.items[0], vehicleId: "vehicle-2", plateNumber: "WXY 5678", nextAction: "Collect signed handover" }
    ];

    expect(filterSalesMyCars(items, "wxy").map((item) => item.vehicleId)).toEqual(["vehicle-2"]);
    expect(filterSalesMyCars(items, "handover").map((item) => item.vehicleId)).toEqual(["vehicle-2"]);
    expect(filterSalesMyCars(items, " ")).toEqual(items);
  });

  it("shows the sales agent only their useful process summary without finance details", () => {
    const markup = renderToStaticMarkup(createElement(SalesMyCarsPanel, {
      currentUser: { isAuthenticated: true, id: "agent-1", name: "Jason Tan", roles: ["Sales"] },
      initialData: workboard,
      autoLoad: false
    }));

    expect(markup).toContain("Sold this month");
    expect(markup).toContain("Cars in progress");
    expect(markup).toContain("Current process / 当前流程");
    expect(markup).toContain("Cars I’m Handling / 我负责的车辆");
    expect(markup).toContain("Plate, model or next action");
    expect(markup).toContain("Search Cars I’m Handling");
    expect(markup).toContain("salesMyCarsFilterBar");
    expect(markup).toContain("salesMyCarsTable");
    const salesTableHead = markup.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? "";
    expect(salesTableHead.match(/<th(?:\s|>)/g) ?? []).toHaveLength(3);
    expect(salesTableHead).toContain("Car / 车辆");
    expect(salesTableHead).toContain("Current process / 当前流程");
    expect(salesTableHead).toContain("Current handoff / 当前跟进");
    expect(markup.includes("ant-pro-query-filter")).toBe(false);
    expect(markup).toContain("Current handoff / 当前跟进");
    expect(markup).toContain("Delivery");
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
    const bossTableHead = bossMarkup.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? "";
    expect(bossTableHead.match(/<th(?:\s|>)/g) ?? []).toHaveLength(4);
    expect(bossTableHead).toContain("Current handoff / 当前跟进");
    expect(salesMarkup).not.toContain("All agents");
    expect(salesMarkup).not.toContain("Agent / 销售员");
    expect(salesMarkup).not.toContain("Jason Tan");
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

  it("uses the handling hierarchy in the mobile card and empty state", () => {
    const markup = renderToStaticMarkup(createElement(SalesMyCarsPanel, {
      currentUser: { isAuthenticated: true, id: "agent-1", name: "Jason Tan", roles: ["Sales"] },
      initialData: workboard,
      autoLoad: false
    }));
    const emptyMarkup = renderToStaticMarkup(createElement(SalesMyCarsPanel, {
      currentUser: { isAuthenticated: true, id: "agent-1", name: "Jason Tan", roles: ["Sales"] },
      initialData: { ...workboard, items: [] },
      autoLoad: false
    }));

    expect(markup).toContain("Current process / 当前流程");
    expect(markup).toContain("Current handoff / 当前跟进");
    const mobileCard = markup.match(/<article class="salesMyCarsMobileCard"[\s\S]*?<\/article>/)?.[0] ?? "";
    expect(mobileCard.indexOf("Current process / 当前流程")).toBeGreaterThanOrEqual(0);
    expect(mobileCard.indexOf("Current handoff / 当前跟进")).toBeGreaterThan(mobileCard.indexOf("Current process / 当前流程"));
    const handoff = mobileCard.slice(mobileCard.indexOf("Current handoff / 当前跟进"));
    expect(handoff).toContain("Delivery");
    expect(handoff).toContain("Prepare the car");
    expect(emptyMarkup).toContain("No cars are assigned to your Cars I’m Handling view yet.");
  });
});
