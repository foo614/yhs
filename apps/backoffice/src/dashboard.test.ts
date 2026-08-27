import { describe, expect, it } from "vitest";
import { dashboardAnalyticsPeriodForPreset, dashboardDrilldownFromRouteUrl, dashboardMetricTarget, dashboardReminderTarget, filterDashboardReminders, financeRiskTarget, reminderDueLabel, reminderDueTagColor, singaporeTodayIsoDate, urgentDashboardReminders } from "./dashboard";
import type { DashboardReminder } from "./api";

describe("dashboard reminder helpers", () => {
  it("labels Daily Spend through the ten-day due-soon boundary without changing other reminders", () => {
    expect(reminderDueLabel({ type: "DailySpendDue", dueDate: "2026-05-30" }, "2026-05-31")).toBe("Overdue");
    expect(reminderDueLabel({ type: "DailySpendDue", dueDate: "2026-05-31" }, "2026-05-31")).toBe("Due today");
    expect(reminderDueLabel({ type: "DailySpendDue", dueDate: "2026-06-10" }, "2026-05-31")).toBe("Due soon");
    expect(reminderDueLabel({ type: "DailySpendDue", dueDate: "2026-06-11" }, "2026-05-31")).toBe("Upcoming");
    expect(reminderDueLabel({ type: "SettlementDue", dueDate: "2026-06-01" }, "2026-05-31")).toBe("Upcoming");
  });

  it("keeps Daily Spend due soon lower urgency than overdue and due today", () => {
    expect(reminderDueTagColor({ type: "DailySpendDue", dueDate: "2026-05-30" }, "2026-05-31")).toBe("red");
    expect(reminderDueTagColor({ type: "DailySpendDue", dueDate: "2026-05-31" }, "2026-05-31")).toBe("orange");
    expect(reminderDueTagColor({ type: "DailySpendDue", dueDate: "2026-06-01" }, "2026-05-31")).toBe("blue");
    expect(reminderDueTagColor({ type: "SettlementDue", dueDate: "2026-06-01" }, "2026-05-31")).toBe("default");
  });

  it("filters dashboard reminders by type and due bucket", () => {
    const reminders: DashboardReminder[] = [
      { type: "LoanFollowUp", title: "Loan", vehiclePlate: "AAA1", vehicleId: "vehicle-1", dueDate: "2026-05-30" },
      { type: "SettlementDue", title: "Settlement", vehiclePlate: "BBB2", vehicleId: "vehicle-2", dueDate: "2026-05-31" },
      { type: "DailySpendDue", title: "Daily soon", vehiclePlate: "General", vehicleId: "vehicle-3", dueDate: "2026-06-03" },
      { type: "PaymentBankFollowUp", title: "Bank", vehiclePlate: "CCC3", vehicleId: "vehicle-4", dueDate: "2026-06-03" }
    ];

    expect(filterDashboardReminders(reminders, { due: "Overdue" }, "2026-05-31").map((reminder) => reminder.title)).toEqual(["Loan"]);
    expect(filterDashboardReminders(reminders, { type: "SettlementDue", due: "DueToday" }, "2026-05-31").map((reminder) => reminder.title)).toEqual(["Settlement"]);
    expect(filterDashboardReminders(reminders, { type: "DailySpendDue", due: "DueSoon" }, "2026-05-31").map((reminder) => reminder.title)).toEqual(["Daily soon"]);
    expect(filterDashboardReminders(reminders, { type: "All", due: "Upcoming" }, "2026-05-31").map((reminder) => reminder.title)).toEqual(["Bank"]);
  });

  it("maps dashboard drill-downs to module targets", () => {
    expect(dashboardMetricTarget("payments")).toBe("/finance?tab=payments&attention=open");
    expect(dashboardMetricTarget("sold")).toBe("/vehicles?dashboard=sold");
    expect(dashboardMetricTarget("sold", { from: "2026-06-01", to: "2026-06-30" })).toBe("/vehicles?dashboard=sold&from=2026-06-01&to=2026-06-30");
    expect(dashboardMetricTarget("watch")).toBe("/vehicles?dashboard=watch");
    expect(financeRiskTarget("Unpaid Settlement")).toBe("/finance?tab=settlements&attention=due");
    expect(dashboardReminderTarget({
      type: "DebtRecoveryFollowUp",
      vehicleId: "vehicle 1"
    })).toBe("/finance?tab=debt&vehicleId=vehicle%201&attention=open");
    expect(dashboardReminderTarget({ type: "DailySpendDue", vehicleId: "vehicle-1" })).toBe("/finance?tab=daily&attention=dueSoon");
  });

  it("puts overdue reminders first in the boss priority queue", () => {
    const reminders: DashboardReminder[] = [
      { type: "LoanFollowUp", title: "Due today", vehiclePlate: "TODAY1", vehicleId: "vehicle-1", dueDate: "2026-05-31" },
      { type: "SettlementDue", title: "Older overdue", vehiclePlate: "OLD1", vehicleId: "vehicle-2", dueDate: "2026-05-29", amount: 1000 },
      { type: "PaymentStatusFollowUp", title: "Later overdue", vehiclePlate: "LATE1", vehicleId: "vehicle-3", dueDate: "2026-05-30", amount: 5000 },
      { type: "DailySpendDue", title: "Daily soon", vehiclePlate: "General", vehicleId: "vehicle-4", dueDate: "2026-06-03", amount: 500 },
      { type: "PaymentBankFollowUp", title: "Upcoming", vehiclePlate: "NEXT1", vehicleId: "vehicle-4", dueDate: "2026-06-01" }
    ];

    expect(urgentDashboardReminders(reminders, "2026-05-31").map((reminder) => reminder.title)).toEqual(["Older overdue", "Later overdue", "Due today", "Daily soon"]);
  });

  it("parses supported dashboard drill-downs and uses the Singapore business day", () => {
    expect(dashboardDrilldownFromRouteUrl("/vehicles?dashboard=aging")).toMatchObject({ vehicleFocus: "aging" });
    expect(dashboardDrilldownFromRouteUrl("/vehicles?dashboard=fresh")).toMatchObject({ vehicleFocus: "fresh" });
    expect(dashboardDrilldownFromRouteUrl("/vehicles?dashboard=sold")).toMatchObject({ vehicleFocus: "sold" });
    expect(dashboardDrilldownFromRouteUrl("/vehicles?dashboard=sold&from=2026-06-01&to=2026-06-30")).toMatchObject({ vehicleFocus: "sold", analyticsPeriod: { from: "2026-06-01", to: "2026-06-30" } });
    expect(dashboardDrilldownFromRouteUrl("/loans?status=Pending")).toMatchObject({ loanStatus: "Pending" });
    expect(dashboardDrilldownFromRouteUrl("/finance?tab=payments&vehicleId=vehicle-1&attention=open")).toMatchObject({ vehicleId: "vehicle-1", attention: "open" });
    expect(dashboardDrilldownFromRouteUrl("/finance?tab=daily&attention=dueSoon")).toMatchObject({ attention: "dueSoon" });
    expect(singaporeTodayIsoDate(new Date("2026-06-01T17:00:00.000Z"))).toBe("2026-06-02");
  });

  it("builds the dashboard's standard analytics presets from the Singapore business day", () => {
    expect(dashboardAnalyticsPeriodForPreset("ThisMonth", "2026-06-15")).toEqual({ from: "2026-06-01", to: "2026-06-15" });
    expect(dashboardAnalyticsPeriodForPreset("LastMonth", "2026-06-15")).toEqual({ from: "2026-05-01", to: "2026-05-31" });
    expect(dashboardAnalyticsPeriodForPreset("YearToDate", "2026-06-15")).toEqual({ from: "2026-01-01", to: "2026-06-15" });
    expect(dashboardAnalyticsPeriodForPreset("AllTime", "2026-06-15")).toEqual({});
  });
});
