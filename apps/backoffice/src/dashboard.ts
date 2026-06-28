import type { DashboardReminder, DashboardReminderFilters } from "./api";

export type ReminderDueFilter = NonNullable<DashboardReminderFilters["due"]>;

export type ReminderInboxFilters = DashboardReminderFilters;

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
      return "/vehicles";
    case "loans":
      return "/loans?status=Pending";
    case "payments":
      return "/finance?tab=payments&status=open";
    case "settlements":
      return "/finance?tab=settlements&status=due";
    case "profit":
      return "/finance?tab=payments";
    case "aging":
      return "/vehicles?age=61";
  }
}

export function dashboardReminderTarget(reminder: Pick<DashboardReminder, "type" | "vehicleId">) {
  switch (reminder.type) {
    case "LoanFollowUp":
      return `/loans?vehicleId=${encodeURIComponent(reminder.vehicleId)}`;
    case "DeliveryPreparation":
      return `/delivery?vehicleId=${encodeURIComponent(reminder.vehicleId)}`;
    case "SettlementDue":
      return `/finance?tab=settlements&vehicleId=${encodeURIComponent(reminder.vehicleId)}`;
    case "PaymentBankFollowUp":
    case "PaymentStatusFollowUp":
      return `/finance?tab=payments&vehicleId=${encodeURIComponent(reminder.vehicleId)}`;
    case "DailySpendDue":
      return "/finance?tab=daily";
    case "DebtRecoveryFollowUp":
      return `/finance?tab=debt&vehicleId=${encodeURIComponent(reminder.vehicleId)}`;
    case "PaymentVoucherFollowUp":
      return `/finance?tab=vouchers&vehicleId=${encodeURIComponent(reminder.vehicleId)}`;
  }
}

export function financeRiskTarget(label: string) {
  if (label === "Unpaid Settlement") return "/finance?tab=settlements&status=due";
  if (label === "Open Debt Recovery") return "/finance?tab=debt&status=open";
  if (label === "Unpaid Daily Spend") return "/finance?tab=daily&status=due";
  if (label === "Open Payment Voucher") return "/finance?tab=vouchers&status=open";
  return "/finance?tab=payments&status=open";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
