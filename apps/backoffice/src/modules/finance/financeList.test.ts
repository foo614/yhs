import { describe, expect, it } from "vitest";
import { FINANCE_LIST_PAGE_SIZE, filterFinanceRows, financePageFor, financeStatusLabel, pageFinanceRows } from "./financeList";

describe("finance list helpers", () => {
  const rows = [
    { plate: "VAA 1234", status: "Pending" },
    { plate: "WBB 5678", status: "Reconciled" }
  ];

  it("filters the shared list by a user-facing keyword and status", () => {
    expect(filterFinanceRows(rows, "wbb", undefined, (row) => [row.plate], (row) => row.status)).toEqual([rows[1]]);
    expect(filterFinanceRows(rows, "VAA1234", undefined, (row) => [row.plate], (row) => row.status)).toEqual([rows[0]]);
    expect(filterFinanceRows(rows, "", "Pending", (row) => [row.plate], (row) => row.status)).toEqual([rows[0]]);
  });

  it("matches nested workflow statuses used by partial collections", () => {
    const collectionRows = [
      { plate: "VAA 1234", statuses: ["PartiallyPaid", "Pending", "Approved"] },
      { plate: "WBB 5678", statuses: ["Paid", "Reconciled", "Disbursed"] }
    ];

    expect(filterFinanceRows(collectionRows, "", "Approved", (row) => [row.plate], (row) => row.statuses)).toEqual([collectionRows[0]]);
    expect(filterFinanceRows(collectionRows, "", "Disbursed", (row) => [row.plate], (row) => row.statuses)).toEqual([collectionRows[1]]);
  });

  it("uses eight rows per page and clamps an out-of-range current page", () => {
    const pageRows = Array.from({ length: FINANCE_LIST_PAGE_SIZE + 1 }, (_, index) => index + 1);

    expect(financePageFor(pageRows.length, 9)).toBe(2);
    expect(pageFinanceRows(pageRows, 2)).toEqual([9]);
  });

  it("presents workflow status codes as readable labels", () => {
    expect(financeStatusLabel("FollowedUp")).toBe("Followed Up / 已跟进");
    expect(financeStatusLabel("Closed")).toBe("Closed");
  });
});
