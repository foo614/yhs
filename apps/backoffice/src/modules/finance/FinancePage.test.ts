import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createUnpaidDailySpend,
  dailySpendMatchesDashboardAttention,
  FinanceV2BalanceSummary,
  financeInvoiceSubmitLabel,
  financeRequesterLabel,
  financeSearchCopy,
  financeTabForUrl,
  payDailySpend,
  settlementMatchesDashboardAttention
} from "./FinancePage";

describe("finance module navigation", () => {
  it("keeps legacy cash custody links on the consolidated cash handover tab", () => {
    expect(financeTabForUrl("/cash-custody", "", true)).toBe("cash-custody");
    expect(financeTabForUrl("/finance", "?tab=cash-custody", true)).toBe("cash-custody");
  });

  it("restricts Sales to cash handover while Finance can select finance workflows", () => {
    expect(financeTabForUrl("/finance", "?tab=payments", false)).toBe("cash-custody");
    expect(financeTabForUrl("/finance", "?tab=settlements", true)).toBe("settlements");
    expect(financeTabForUrl("/finance", "?tab=unknown", true)).toBe("payments");
  });

  it("describes the actual searchable fields for each finance tab", () => {
    expect(financeSearchCopy("payments").placeholder).toBe("Search plate, customer, invoice or reference");
    expect(financeSearchCopy("settlements").placeholder).toBe("Search plate, owner or deadline");
    expect(financeSearchCopy("commissions").placeholder).toBe("Search plate or broker");
    expect(financeSearchCopy("debt").placeholder).toBe("Search plate, customer, date or notes");
    expect(financeSearchCopy("vouchers").placeholder).toBe("Search plate, payee, purpose or notes");
    expect(financeSearchCopy("daily").placeholder).toBe("Search description or due date");
  });
});

describe("Daily Spend dashboard drill-down", () => {
  it("shows an unpaid day-ten spend for Due soon without changing due-today or overdue filtering", () => {
    const today = "2026-06-01";

    expect(dailySpendMatchesDashboardAttention({ isPaid: false, dueDate: "2026-06-11" }, "dueSoon", today)).toBe(true);
    expect(dailySpendMatchesDashboardAttention({ isPaid: false, dueDate: "2026-06-12" }, "dueSoon", today)).toBe(false);
    expect(dailySpendMatchesDashboardAttention({ isPaid: true, dueDate: "2026-06-06" }, "dueSoon", today)).toBe(false);
    expect(dailySpendMatchesDashboardAttention({ isPaid: false, dueDate: "2026-05-31" }, "due", today)).toBe(true);
    expect(dailySpendMatchesDashboardAttention({ isPaid: false, dueDate: "2026-06-01" }, "due", today)).toBe(true);
    expect(dailySpendMatchesDashboardAttention({ isPaid: false, dueDate: "2026-06-12" }, "open", today)).toBe(true);
    expect(dailySpendMatchesDashboardAttention({ isPaid: true, dueDate: "2026-05-31" }, "open", today)).toBe(false);
  });
});

describe("Settlement dashboard drill-down", () => {
  it("reconciles the unpaid total with all unpaid rows while keeping due-now filtering separate", () => {
    const today = "2026-06-01";

    expect(settlementMatchesDashboardAttention({ isPaid: false, deadline: "2026-06-10" }, "open", today)).toBe(true);
    expect(settlementMatchesDashboardAttention({ isPaid: false, deadline: "2026-05-31" }, "open", today)).toBe(true);
    expect(settlementMatchesDashboardAttention({ isPaid: true, deadline: "2026-05-31" }, "open", today)).toBe(false);
    expect(settlementMatchesDashboardAttention({ isPaid: false, deadline: "2026-06-10" }, "due", today)).toBe(false);
    expect(settlementMatchesDashboardAttention({ isPaid: false, deadline: "2026-06-01" }, "due", today)).toBe(true);
  });
});

describe("Daily Spend creation and payment", () => {
  it("creates items unpaid by default and marks the existing item paid", () => {
    const spend = createUnpaidDailySpend("daily-1", "Electric Bill", 385, "2026-06-15");

    expect(spend).toMatchObject({ description: "Electric Bill", amount: 385, dueDate: "2026-06-15", isPaid: false });
    expect(payDailySpend(spend)).toEqual({ ...spend, isPaid: true });
  });
});

describe("Finance V2 summary", () => {
  it("shows vehicle, buyer, invoice total, collected amount, and balance in one compact summary", () => {
    const markup = renderToStaticMarkup(createElement(FinanceV2BalanceSummary, {
      payment: {
        id: "payment-v2",
        vehicleId: "vehicle-1",
        customerId: "customer-1",
        nettPrice: 60600,
        status: "Pending",
        bossChecked: false,
        documentsPrepared: false,
        checklistValidated: false,
        financeWorkflowVersion: 2,
        collectedAmount: 10000,
        balanceAmount: 50600,
        receivableStatus: "PartiallyPaid",
        createdAt: "2026-08-27T00:00:00Z"
      },
      vehicles: [{ id: "vehicle-1", plateNumber: "VPK1234", make: "Toyota", model: "Vios", stockOwner: "YSHeng", status: "Available", customerId: "customer-1" }],
      customers: [{ id: "customer-1", name: "Ali Tan", phone: "0123456789" }]
    }));

    expect(markup).toContain("VPK1234");
    expect(markup).toContain("Ali Tan");
    expect(markup).toContain("Invoice total");
    expect(markup).toContain("RM 60,600.00");
    expect(markup).toContain("RM 10,000.00");
    expect(markup).toContain("RM 50,600.00");
    expect(markup).toContain("Partially paid");
  });
});

describe("Finance V2 review copy", () => {
  it("distinguishes immediate invoice generation from a real price-variance approval", () => {
    expect(financeInvoiceSubmitLabel(60_000, undefined, false)).toBe("Review & generate invoice");
    expect(financeInvoiceSubmitLabel(60_000, 60_000, true)).toBe("Review & generate invoice");
    expect(financeInvoiceSubmitLabel(60_000, 59_500, true)).toBe("Review & send for approval");
  });

  it("does not expose internal requester identifiers", () => {
    expect(financeRequesterLabel()).toBe("-");
    expect(financeRequesterLabel("finance-user", "finance-user")).toBe("You");
    expect(financeRequesterLabel("other-user", "finance-user")).toBe("Finance staff");
  });
});
