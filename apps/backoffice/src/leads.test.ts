import { describe, expect, it } from "vitest";
import {
  activeLeadCountByVehicle,
  activeLeadCountForVehicle,
  filterLeadsForTriage,
  findCustomerForLead,
  groupLeadsByVehicle,
  leadCustomerLinkLabel,
  leadCustomerLinkTagColor,
  leadPriorityLabel,
  leadVehicleLabel,
  sortLeadsByHotCarDemand
} from "./leads";
import type { Customer, Lead, Vehicle } from "./api";

const baseLead: Lead = {
  id: "lead-1",
  vehicleId: "vehicle-1",
  customerName: "Ali Tan",
  phone: "0123456789",
  status: "New",
  createdAt: "2026-05-30T00:00:00Z"
};

const vehicles: Vehicle[] = [
  {
    id: "vehicle-1",
    plateNumber: "VAA1001",
    make: "Toyota",
    model: "Vios",
    year: 2022,
    stockOwner: "YSHeng",
    status: "Available",
    isPublic: true,
    purchasePrice: 52000,
    sellingPrice: 58000,
    additionalCharges: 0,
    refurbishmentTotal: 0,
    commissionTotal: 0
  },
  {
    id: "vehicle-2",
    plateNumber: "WBB2002",
    make: "Honda",
    model: "City",
    year: 2021,
    stockOwner: "KS",
    status: "LoanProcessing",
    isPublic: false,
    purchasePrice: 56000,
    sellingPrice: 62000,
    additionalCharges: 0,
    refurbishmentTotal: 0,
    commissionTotal: 0
  }
];

describe("lead customer link display", () => {
  it("shows whether a public enquiry is linked to a customer record", () => {
    expect(leadCustomerLinkLabel(baseLead)).toBe("New");
    expect(leadCustomerLinkTagColor(baseLead)).toBe("orange");
    expect(leadCustomerLinkLabel({ ...baseLead, customerId: "customer-1" })).toBe("Linked");
    expect(leadCustomerLinkTagColor({ ...baseLead, customerId: "customer-1" })).toBe("green");
  });

  it("matches an existing customer by normalized lead phone before creating a duplicate", () => {
    const customers: Customer[] = [
      { id: "customer-1", name: "Ali Tan", phone: " 012-345 6789 " },
      { id: "customer-2", name: "Mei Wong", phone: "0199999999" }
    ];

    expect(findCustomerForLead({ ...baseLead, phone: "0123456789" }, customers)?.id).toBe("customer-1");
    expect(findCustomerForLead({ ...baseLead, phone: "0111111111" }, customers)).toBeUndefined();
  });

  it("filters leads by status and customer-link state for sales triage", () => {
    const leads: Lead[] = [
      baseLead,
      { ...baseLead, id: "lead-2", status: "Contacted", customerId: "customer-1" },
      { ...baseLead, id: "lead-3", status: "Closed", customerId: "customer-2" }
    ];

    expect(filterLeadsForTriage(leads, { status: "New", link: "Unlinked" }).map((lead) => lead.id)).toEqual(["lead-1"]);
    expect(filterLeadsForTriage(leads, { status: "All", link: "Linked" }).map((lead) => lead.id)).toEqual(["lead-2", "lead-3"]);
    expect(filterLeadsForTriage(leads, { status: "Contacted", link: "All" }).map((lead) => lead.id)).toEqual(["lead-2"]);
  });

  it("counts multiple open leads against one vehicle while excluding closed leads", () => {
    const leads: Lead[] = [
      baseLead,
      { ...baseLead, id: "lead-2", status: "Contacted" },
      { ...baseLead, id: "lead-3", status: "Closed" },
      { ...baseLead, id: "lead-4", vehicleId: "vehicle-2", status: "New" }
    ];

    expect(activeLeadCountByVehicle(leads)).toEqual({ "vehicle-1": 2, "vehicle-2": 1 });
    expect(activeLeadCountForVehicle(leads, "vehicle-1")).toBe(2);
  });

  it("ranks available public cars with multiple active enquiries first", () => {
    const leads: Lead[] = [
      { ...baseLead, id: "lead-older-single", vehicleId: "vehicle-2", createdAt: "2026-06-01T00:00:00Z" },
      { ...baseLead, id: "lead-hot-contacted", status: "Contacted", createdAt: "2026-06-02T00:00:00Z" },
      { ...baseLead, id: "lead-hot-new", createdAt: "2026-06-03T00:00:00Z" },
      { ...baseLead, id: "lead-closed", status: "Closed", createdAt: "2026-06-04T00:00:00Z" }
    ];

    expect(sortLeadsByHotCarDemand(leads, vehicles).map((lead) => lead.id)).toEqual([
      "lead-hot-new",
      "lead-hot-contacted",
      "lead-older-single",
      "lead-closed"
    ]);
    expect(leadPriorityLabel(leads[1], leads, vehicles)).toBe("Hot");
    expect(leadPriorityLabel(leads[0], leads, vehicles)).toBe("Follow up");
  });

  it("falls back clearly when a lead references an unknown vehicle", () => {
    const lead = { ...baseLead, vehicleId: "missing-vehicle" };

    expect(leadVehicleLabel(lead, vehicles)).toBe("Unknown vehicle");
    expect(leadPriorityLabel(lead, [lead], vehicles)).toBe("Follow up");
  });

  it("groups leads under the same vehicle for expandable sales triage", () => {
    const leads: Lead[] = [
      { ...baseLead, id: "lead-hot-older", createdAt: "2026-06-02T00:00:00Z" },
      { ...baseLead, id: "lead-hot-newer", customerName: "Mei Wong", phone: "0198887777", createdAt: "2026-06-03T00:00:00Z" },
      { ...baseLead, id: "lead-hot-closed", status: "Closed", createdAt: "2026-06-04T00:00:00Z" },
      { ...baseLead, id: "lead-other", vehicleId: "vehicle-2", createdAt: "2026-06-05T00:00:00Z" }
    ];

    const groups = groupLeadsByVehicle(leads, vehicles);

    expect(groups.map((group) => group.vehicleId)).toEqual(["vehicle-1", "vehicle-2"]);
    expect(groups[0].activeCount).toBe(2);
    expect(groups[0].priority).toBe("Hot");
    expect(groups[0].leads.map((lead) => lead.id)).toEqual(["lead-hot-newer", "lead-hot-older", "lead-hot-closed"]);
  });
});
