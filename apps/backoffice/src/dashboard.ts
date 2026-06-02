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

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}
