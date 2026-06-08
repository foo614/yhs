import type { Customer, Lead, Vehicle, VehicleLookup } from "./api";

export type LeadLinkFilter = "All" | "Linked" | "Unlinked";
export type LeadPriorityLabel = "Hot" | "Ready" | "Follow up" | "Closed";
export type LeadVehicleInfo = VehicleLookup & Partial<Pick<Vehicle, "year" | "isPublic">>;
export type LeadVehicleGroup = {
  vehicleId: string;
  vehicle?: LeadVehicleInfo;
  leads: Lead[];
  activeCount: number;
  latestLead: Lead;
  priority: LeadPriorityLabel;
};

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

export function findLeadVehicle(lead: Lead, vehicles: LeadVehicleInfo[]) {
  return vehicles.find((vehicle) => vehicle.id === lead.vehicleId);
}

export function leadVehicleLabel(lead: Lead, vehicles: LeadVehicleInfo[]) {
  const vehicle = findLeadVehicle(lead, vehicles);
  if (!vehicle) {
    return "Unknown vehicle";
  }

  const year = vehicle.year ? `${vehicle.year} ` : "";
  return `${vehicle.plateNumber} - ${year}${vehicle.make} ${vehicle.model}`.trim();
}

export function activeLeadCountByVehicle(leads: Lead[]) {
  return leads.reduce<Record<string, number>>((counts, lead) => {
    if (lead.status === "Closed") {
      return counts;
    }

    counts[lead.vehicleId] = (counts[lead.vehicleId] ?? 0) + 1;
    return counts;
  }, {});
}

export function activeLeadCountForVehicle(leads: Lead[], vehicleId: string) {
  return activeLeadCountByVehicle(leads)[vehicleId] ?? 0;
}

export function leadPriorityLabel(lead: Lead, leads: Lead[], vehicles: LeadVehicleInfo[]): LeadPriorityLabel {
  if (lead.status === "Closed") {
    return "Closed";
  }

  const vehicle = findLeadVehicle(lead, vehicles);
  const activeCount = activeLeadCountForVehicle(leads, lead.vehicleId);
  const available = vehicle?.status === "Available";
  const publicReady = vehicle && "isPublic" in vehicle ? vehicle.isPublic === true : available;

  if (available && publicReady && activeCount > 1) {
    return "Hot";
  }

  if (available && publicReady) {
    return "Ready";
  }

  return "Follow up";
}

export function leadPriorityTagColor(priority: LeadPriorityLabel) {
  switch (priority) {
    case "Hot":
      return "red";
    case "Ready":
      return "green";
    case "Follow up":
      return "gold";
    case "Closed":
      return "default";
  }
}

export function sortLeadsByHotCarDemand(leads: Lead[], vehicles: LeadVehicleInfo[]) {
  const activeCounts = activeLeadCountByVehicle(leads);

  return [...leads].sort((a, b) => {
    const aScore = leadHotCarScore(a, vehicles, activeCounts);
    const bScore = leadHotCarScore(b, vehicles, activeCounts);

    if (aScore !== bScore) {
      return bScore - aScore;
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function groupLeadsByVehicle(leads: Lead[], vehicles: LeadVehicleInfo[]): LeadVehicleGroup[] {
  const activeCounts = activeLeadCountByVehicle(leads);
  const groups = leads.reduce<Record<string, Lead[]>>((items, lead) => {
    items[lead.vehicleId] = [...(items[lead.vehicleId] ?? []), lead];
    return items;
  }, {});

  return Object.entries(groups)
    .map(([vehicleId, vehicleLeads]) => {
      const sortedLeads = sortLeadsByHotCarDemand(vehicleLeads, vehicles);
      const latestLead = [...vehicleLeads].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      return {
        vehicleId,
        vehicle: vehicles.find((vehicle) => vehicle.id === vehicleId),
        leads: sortedLeads,
        activeCount: activeCounts[vehicleId] ?? 0,
        latestLead,
        priority: leadPriorityLabel(sortedLeads[0] ?? latestLead, leads, vehicles)
      };
    })
    .sort((a, b) => {
      const topA = a.leads[0] ?? a.latestLead;
      const topB = b.leads[0] ?? b.latestLead;
      const scoreA = leadHotCarScore(topA, vehicles, activeCounts);
      const scoreB = leadHotCarScore(topB, vehicles, activeCounts);
      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      return new Date(b.latestLead.createdAt).getTime() - new Date(a.latestLead.createdAt).getTime();
    });
}

function leadHotCarScore(lead: Lead, vehicles: LeadVehicleInfo[], activeCounts: Record<string, number>) {
  if (lead.status === "Closed") {
    return -1000;
  }

  const vehicle = findLeadVehicle(lead, vehicles);
  const activeCount = activeCounts[lead.vehicleId] ?? 0;
  const available = vehicle?.status === "Available";
  const publicReady = vehicle && "isPublic" in vehicle ? vehicle.isPublic === true : available;

  return [
    available && publicReady ? 100 : 0,
    Math.min(activeCount, 9) * 10,
    lead.status === "New" ? 5 : 0,
    lead.customerId ? 2 : 0
  ].reduce((total, score) => total + score, 0);
}

function normalizePhone(phone: string) {
  return phone.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
