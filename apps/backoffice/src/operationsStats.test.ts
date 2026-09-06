import { describe, expect, it } from "vitest";
import { loanHeaderStats, repairHeaderStats } from "./App";

describe("workflow header statistics", () => {
  it("counts open, overdue, and high-cost approval work without changing the cost total", () => {
    expect(repairHeaderStats([
      { checklistDone: false, cost: 1_500, expectedCompletionDate: "2026-09-01", approvalStatus: "Pending" },
      { checklistDone: false, cost: 800, expectedCompletionDate: "2026-09-20", approvalStatus: "Approved" },
      { checklistDone: true, cost: 2_000, expectedCompletionDate: "2026-08-01", approvalStatus: "Approved" }
    ], "2026-09-07")).toEqual({ open: 2, cost: 2_800, overdue: 1, highCostPending: 1 });
  });

  it("separates approved, in-progress, rejected, and completed loans", () => {
    expect(loanHeaderStats([
      { status: "Approved" },
      { status: "Draft" },
      { status: "Pending" },
      { status: "Rejected" },
      { status: "Done" }
    ])).toEqual({ approved: 1, inProgress: 2, rejected: 1, done: 1 });
  });
});
