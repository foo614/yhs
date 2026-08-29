import type { DashboardAnalyticsPeriod, DashboardReminder, DashboardReminderFilters, PriorityActionItem, Vehicle } from "./api";

export type ReminderDueFilter = NonNullable<DashboardReminderFilters["due"]>;

export type ReminderInboxFilters = DashboardReminderFilters;
export type DashboardAnalyticsRangePreset = "ThisMonth" | "LastMonth" | "YearToDate" | "AllTime" | "Custom";

export type DashboardVehicleFocus = "stock" | "sold" | "fresh" | "watch" | "aging" | "profit";

export type DashboardDrilldown = {
  vehicleFocus?: DashboardVehicleFocus;
  vehicleId?: string;
  loanStatus?: "Pending";
  attention?: "open" | "due" | "dueSoon";
  analyticsPeriod?: DashboardAnalyticsPeriod;
};

export type DashboardPriorityEntry = {
  source: "reminder" | "action";
  key: string;
  type: PriorityActionItem["type"];
  title: string;
  subject?: string;
  dueDate: string;
  amount?: number | null;
  target: string;
};

export function safeDashboardStockSummary(vehicles: Vehicle[]) {
  return {
    totalStock: vehicles.length,
    available: vehicles.filter((vehicle) => vehicle.status === "Available").length,
    loanProcessing: vehicles.filter((vehicle) => vehicle.status === "LoanProcessing").length,
    sold: vehicles.filter((vehicle) => vehicle.status === "Sold").length
  };
}

export function reminderDueLabel(reminder: Pick<DashboardReminder, "type" | "dueDate">, today = todayIsoDate()) {
  if (reminder.dueDate < today) {
    return "Overdue";
  }

  if (reminder.dueDate === today) {
    return "Due today";
  }

  if (reminder.type === "DailySpendDue" && reminder.dueDate <= addCalendarDays(today, 10)) {
    return "Due soon";
  }

  return "Upcoming";
}

export function reminderDueTagColor(reminder: Pick<DashboardReminder, "type" | "dueDate">, today = todayIsoDate()) {
  if (reminder.dueDate < today) {
    return "red";
  }

  if (reminder.dueDate === today) {
    return "orange";
  }

  if (reminderDueLabel(reminder, today) === "Due soon") {
    return "blue";
  }

  return "default";
}

export function filterDashboardReminders(reminders: DashboardReminder[], filters: ReminderInboxFilters, today = todayIsoDate()) {
  return reminders.filter((reminder) => {
    const matchesType = !filters.type || filters.type === "All" || reminder.type === filters.type;
    const dueLabel = reminderDueLabel(reminder, today);
    const matchesDue = !filters.due
      || filters.due === "All"
      || (filters.due === "DueToday" && dueLabel === "Due today")
      || (filters.due === "DueSoon" && dueLabel === "Due soon")
      || filters.due === dueLabel;

    return matchesType && matchesDue;
  });
}

export function dashboardMetricTarget(metric: "stock" | "sold" | "fresh" | "watch" | "loans" | "payments" | "settlements" | "profit" | "aging", analyticsPeriod?: DashboardAnalyticsPeriod) {
  switch (metric) {
    case "stock":
      return "/vehicles?dashboard=stock";
    case "sold":
      return dashboardPeriodTarget("/vehicles?dashboard=sold", analyticsPeriod);
    case "fresh":
      return "/vehicles?dashboard=fresh";
    case "watch":
      return "/vehicles?dashboard=watch";
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

export function urgentDashboardReminders(reminders: DashboardReminder[], today = todayIsoDate()) {
  return reminders
    .filter((reminder) => {
      const dueLabel = reminderDueLabel(reminder, today);
      return dueLabel === "Overdue" || dueLabel === "Due today" || dueLabel === "Due soon";
    })
    .sort((left, right) => {
      const urgency = (reminder: DashboardReminder) => {
        const dueLabel = reminderDueLabel(reminder, today);
        if (dueLabel === "Overdue") return 0;
        if (dueLabel === "Due today") return 1;
        return 2;
      };
      const leftUrgency = urgency(left);
      const rightUrgency = urgency(right);
      if (leftUrgency !== rightUrgency) return leftUrgency - rightUrgency;

      const dueDateOrder = left.dueDate.localeCompare(right.dueDate);
      if (dueDateOrder !== 0) return dueDateOrder;

      return (right.amount ?? 0) - (left.amount ?? 0);
    });
}

export function dashboardPriorityEntries(reminders: DashboardReminder[], priorityActions: PriorityActionItem[], today = todayIsoDate()): DashboardPriorityEntry[] {
  const reminderEntries = urgentDashboardReminders(reminders, today).map((reminder): DashboardPriorityEntry => ({
    source: "reminder",
    key: `reminder:${reminder.type}:${reminder.vehicleId}:${reminder.dueDate}`,
    type: reminder.type,
    title: reminder.title,
    subject: reminder.vehiclePlate,
    dueDate: reminder.dueDate,
    amount: reminder.amount,
    target: dashboardReminderTarget(reminder)
  }));
  const actionEntries = priorityActions.map((action): DashboardPriorityEntry => ({
    source: "action",
    key: `action:${action.type}:${action.subject ?? ""}:${action.dueDate}`,
    type: action.type,
    title: action.title,
    subject: action.subject,
    dueDate: action.dueDate,
    amount: action.amount,
    target: priorityActionTarget(action.target)
  }));

  return [...reminderEntries, ...actionEntries]
    .filter((entry, index, entries) => entries.findIndex((candidate) => candidate.key === entry.key) === index)
    .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || (right.amount ?? 0) - (left.amount ?? 0));
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
      return "/finance?tab=daily&attention=dueSoon";
    case "DebtRecoveryFollowUp":
      return `/finance?tab=debt&vehicleId=${encodeURIComponent(reminder.vehicleId)}&attention=open`;
    case "PaymentVoucherFollowUp":
      return `/finance?tab=vouchers&vehicleId=${encodeURIComponent(reminder.vehicleId)}&attention=open`;
  }
}

export function financeRiskTarget(label: string) {
  if (label === "Unpaid Settlement") return "/finance?tab=settlements&attention=open";
  if (label === "Open Debt Recovery") return "/finance?tab=debt&attention=open";
  if (label === "Unpaid Daily Spend") return "/finance?tab=daily&attention=open";
  if (label === "Open Payment Voucher") return "/finance?tab=vouchers&attention=open";
  return "/finance?tab=payments&attention=open";
}

function priorityActionTarget(target: PriorityActionItem["target"]) {
  return {
    Loans: "/loans?status=Pending",
    Delivery: "/delivery",
    Finance: "/finance",
    Leads: "/leads",
    Repairs: "/repairs",
    HrSalary: "/hr-salary"
  }[target];
}

export function dashboardDrilldownFromRouteUrl(routeUrl: string): DashboardDrilldown {
  const queryIndex = routeUrl.indexOf("?");
  const params = new URLSearchParams(queryIndex >= 0 ? routeUrl.slice(queryIndex + 1) : "");
  const dashboard = params.get("dashboard");
  const vehicleFocus = dashboard === "stock" || dashboard === "sold" || dashboard === "fresh" || dashboard === "watch" || dashboard === "aging" || dashboard === "profit" ? dashboard : undefined;
  const loanStatus = params.get("status") === "Pending" ? "Pending" : undefined;
  const attentionValue = params.get("attention");
  const attention = attentionValue === "open" || attentionValue === "due" || attentionValue === "dueSoon" ? attentionValue : undefined;
  const vehicleId = params.get("vehicleId") || undefined;

  const from = params.get("from") || undefined;
  const to = params.get("to") || undefined;
  const analyticsPeriod = from && to ? { from, to } : undefined;

  return { vehicleFocus, vehicleId, loanStatus, attention, analyticsPeriod };
}

function dashboardPeriodTarget(target: string, analyticsPeriod?: DashboardAnalyticsPeriod) {
  if (!analyticsPeriod?.from || !analyticsPeriod.to) return target;
  return `${target}&from=${encodeURIComponent(analyticsPeriod.from)}&to=${encodeURIComponent(analyticsPeriod.to)}`;
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

export function dashboardAnalyticsPeriodForPreset(preset: Exclude<DashboardAnalyticsRangePreset, "Custom">, today = singaporeTodayIsoDate()): DashboardAnalyticsPeriod {
  if (preset === "AllTime") return {};

  const [year, month, day] = today.split("-").map(Number);
  if (preset === "YearToDate") return { from: `${year}-01-01`, to: today };
  if (preset === "ThisMonth") return { from: `${year}-${String(month).padStart(2, "0")}-01`, to: today };

  const lastMonthStart = new Date(year, month - 2, 1);
  const lastMonthEnd = new Date(year, month - 1, 0);
  return { from: formatIsoDate(lastMonthStart), to: formatIsoDate(lastMonthEnd) };
}

function formatIsoDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function addCalendarDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return formatIsoDate(new Date(year, month - 1, day + days));
}

function todayIsoDate() {
  return singaporeTodayIsoDate();
}
