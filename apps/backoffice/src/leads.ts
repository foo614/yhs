import type { Customer, Lead } from "./api";

export type LeadLinkFilter = "All" | "Linked" | "Unlinked";

export type LeadTriageFilters = {
  status?: Lead["status"] | "All";
  link?: LeadLinkFilter;
};

export function leadCustomerLinkLabel(lead: Lead) {
  return lead.customerId ? "Linked" : "New";
}

export function leadCustomerLinkTagColor(lead: Lead) {
  return lead.customerId ? "green" : "orange";
}

export function findCustomerForLead(lead: Lead, customers: Customer[]) {
  const phone = normalizePhone(lead.phone);
  if (!phone) {
    return undefined;
  }

  return customers.find((customer) => normalizePhone(customer.phone) === phone);
}

export function filterLeadsForTriage(leads: Lead[], filters: LeadTriageFilters) {
  return leads.filter((lead) => {
    const matchesStatus = !filters.status || filters.status === "All" || lead.status === filters.status;
    const matchesLink = !filters.link
      || filters.link === "All"
      || (filters.link === "Linked" && Boolean(lead.customerId))
      || (filters.link === "Unlinked" && !lead.customerId);

    return matchesStatus && matchesLink;
  });
}

function normalizePhone(phone: string) {
  return phone.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
