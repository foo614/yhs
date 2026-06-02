import { describe, expect, it } from "vitest";
import { filterLeadsForTriage, findCustomerForLead, leadCustomerLinkLabel, leadCustomerLinkTagColor } from "./leads";
import type { Customer, Lead } from "./api";

const baseLead: Lead = {
  id: "lead-1",
  vehicleId: "vehicle-1",
  customerName: "Ali Tan",
  phone: "0123456789",
  status: "New",
  createdAt: "2026-05-30T00:00:00Z"
};

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
});
