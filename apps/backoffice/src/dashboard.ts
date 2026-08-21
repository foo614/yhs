import type { DashboardReminder, DashboardReminderFilters, Vehicle } from "./api";

export type ReminderDueFilter = NonNullable<DashboardReminderFilters["due"]>;

export type ReminderInboxFilters = DashboardReminderFilters;

export type DashboardVehicleFocus = "stock" | "aging" | "profit";

export type DashboardDrilldown = {
  vehicleFocus?: DashboardVehicleFocus;
  vehicleId?: string;
  loanStatus?: "Pending";
  attention?: "open" | "due";
};

export function safeDashboardStockSummary(vehicles: Vehicle[]) {
  return {
    totalStock: vehicles.length,
    available: vehicles.filter((vehicle) => vehicle.status === "Available").length,
    loanProcessing: vehicles.filter((vehicle) => vehicle.status === "LoanProcessing").length,
    sold: vehicles.filter((vehicle) => vehicle.status === "Sold").length
  };
}

export function reminderDueLabel(dueDate: string, today = todayIsoDate()) {
  if (dueDate < today) {
    return "Overdue";
  }

  if (dueDate === today) {
    return "Due today";
  }

  return "Upcoming";
}

export function reminderDueTagColor(dueDate: string, today = todayIsoDate()) {
  if (dueDate < today) {
    return "red";
  }

  if (dueDate === today) {
    return "orange";
  }

  return "blue";
}

export function filterDashboardReminders(reminders: DashboardReminder[], filters: ReminderInboxFilters, today = todayIsoDate()) {
  return reminders.filter((reminder) => {
    const matchesType = !filters.type || filters.type === "All" || reminder.type === filters.type;
    const dueLabel = reminderDueLabel(reminder.dueDate, today);
    const matchesDue = !filters.due
      || filters.due === "All"
      || (filters.due === "DueToday" && dueLabel === "Due today")
      || filters.due === dueLabel;

    return matchesType && matchesDue;
  });
}

export function dashboardMetricTarget(metric: "stock" | "loans" | "payments" | "settlements" | "profit" | "aging") {
  switch (metric) {
    case "stock":
      return "/vehicles?dashboard=stock";
    case "loans":
      return "/loans?status=Pending";
    case "payments":
      return "/finance?tab=payments&attention=open";
    case "settlements":
      return "/finance?tab=settlements&attention=due";
    case "profit":
      return "/vehicles?dashboard=profit";
    case "aging":
      return "/vehicles?dashboard=aging";
  }
}

export function dashboardReminderTarget(reminder: Pick<DashboardReminder, "type" | "vehicleId">) {
  switch (reminder.type) {
    case "LoanFollowUp":
      return `/loans?vehicleId=${encodeURIComponent(reminder.vehicleId)}`;
    case "DeliveryPreparation":
      return `/delivery?vehicleId=${encodeURIComponent(reminder.vehicleId)}`;
    case "SettlementDue":
      return `/finance?tab=settlements&vehicleId=${encodeURIComponent(reminder.vehicleId)}&attention=due`;
    case "PaymentBankFollowUp":
    case "PaymentStatusFollowUp":
      return `/finance?tab=payments&vehicleId=${encodeURIComponent(reminder.vehicleId)}&attention=open`;
    case "DailySpendDue":
      return "/finance?tab=daily&attention=due";
    case "DebtRecoveryFollowUp":
      return `/finance?tab=debt&vehicleId=${encodeURIComponent(reminder.vehicleId)}&attention=open`;
    case "PaymentVoucherFollowUp":
      return `/finance?tab=vouchers&vehicleId=${encodeURIComponent(reminder.vehicleId)}&attention=open`;
  }
}

export function financeRiskTarget(label: string) {
  if (label === "Unpaid Settlement") return "/finance?tab=settlements&attention=due";
  if (label === "Open Debt Recovery") return "/finance?tab=debt&attention=open";
  if (label === "Unpaid Daily Spend") return "/finance?tab=daily&attention=due";
  if (label === "Open Payment Voucher") return "/finance?tab=vouchers&attention=open";
  return "/finance?tab=payments&attention=open";
}

export function dashboardDrilldownFromRouteUrl(routeUrl: string): DashboardDrilldown {
  const queryIndex = routeUrl.indexOf("?");
  const params = new URLSearchParams(queryIndex >= 0 ? routeUrl.slice(queryIndex + 1) : "");
  const dashboard = params.get("dashboard");
  const vehicleFocus = dashboard === "stock" || dashboard === "aging" || dashboard === "profit" ? dashboard : undefined;
  const loanStatus = params.get("status") === "Pending" ? "Pending" : undefined;
  const attentionValue = params.get("attention");
  const attention = attentionValue === "open" || attentionValue === "due" ? attentionValue : undefined;
  const vehicleId = params.get("vehicleId") || undefined;

  return { vehicleFocus, vehicleId, loanStatus, attention };
}

export function singaporeTodayIsoDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function todayIsoDate() {
  return singaporeTodayIsoDate();
}
