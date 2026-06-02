import { describe, expect, it } from "vitest";
import { filterDashboardReminders, reminderDueLabel, reminderDueTagColor } from "./dashboard";
import type { DashboardReminder } from "./api";

describe("dashboard reminder helpers", () => {
  it("labels overdue, due today, and upcoming reminders", () => {
    expect(reminderDueLabel("2026-05-30", "2026-05-31")).toBe("Overdue");
    expect(reminderDueLabel("2026-05-31", "2026-05-31")).toBe("Due today");
    expect(reminderDueLabel("2026-06-01", "2026-05-31")).toBe("Upcoming");
  });

  it("colors overdue, due today, and upcoming reminders", () => {
    expect(reminderDueTagColor("2026-05-30", "2026-05-31")).toBe("red");
    expect(reminderDueTagColor("2026-05-31", "2026-05-31")).toBe("orange");
    expect(reminderDueTagColor("2026-06-01", "2026-05-31")).toBe("blue");
  });

  it("filters dashboard reminders by type and due bucket", () => {
    const reminders: DashboardReminder[] = [
      { type: "LoanFollowUp", title: "Loan", vehiclePlate: "AAA1", vehicleId: "vehicle-1", dueDate: "2026-05-30" },
      { type: "SettlementDue", title: "Settlement", vehiclePlate: "BBB2", vehicleId: "vehicle-2", dueDate: "2026-05-31" },
      { type: "PaymentBankFollowUp", title: "Bank", vehiclePlate: "CCC3", vehicleId: "vehicle-3", dueDate: "2026-06-03" }
    ];

    expect(filterDashboardReminders(reminders, { due: "Overdue" }, "2026-05-31").map((reminder) => reminder.title)).toEqual(["Loan"]);
    expect(filterDashboardReminders(reminders, { type: "SettlementDue", due: "DueToday" }, "2026-05-31").map((reminder) => reminder.title)).toEqual(["Settlement"]);
    expect(filterDashboardReminders(reminders, { type: "All", due: "Upcoming" }, "2026-05-31").map((reminder) => reminder.title)).toEqual(["Bank"]);
  });
});
