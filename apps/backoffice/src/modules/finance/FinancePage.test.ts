import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createUnpaidDailySpend, dailySpendMatchesDashboardAttention, financeTabForUrl, InvoiceUpdateRequestQueue, payDailySpend } from "./FinancePage";

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
});

describe("Daily Spend dashboard drill-down", () => {
  it("shows an unpaid day-ten spend for Due soon without changing due-today or overdue filtering", () => {
    const today = "2026-06-01";

    expect(dailySpendMatchesDashboardAttention({ isPaid: false, dueDate: "2026-06-11" }, "dueSoon", today)).toBe(true);
    expect(dailySpendMatchesDashboardAttention({ isPaid: false, dueDate: "2026-06-12" }, "dueSoon", today)).toBe(false);
    expect(dailySpendMatchesDashboardAttention({ isPaid: true, dueDate: "2026-06-06" }, "dueSoon", today)).toBe(false);
    expect(dailySpendMatchesDashboardAttention({ isPaid: false, dueDate: "2026-05-31" }, "due", today)).toBe(true);
    expect(dailySpendMatchesDashboardAttention({ isPaid: false, dueDate: "2026-06-01" }, "due", today)).toBe(true);
  });
});

describe("Daily Spend creation and payment", () => {
  it("creates items unpaid by default and marks the existing item paid", () => {
    const spend = createUnpaidDailySpend("daily-1", "Electric Bill", 385, "2026-06-15");

    expect(spend).toMatchObject({ description: "Electric Bill", amount: 385, dueDate: "2026-06-15", isPaid: false });
    expect(payDailySpend(spend)).toEqual({ ...spend, isPaid: true });
  });
});

describe("delivery invoice update handoff", () => {
  it("shows Finance the open request reason and one explicit resolution action without payment details", () => {
    const markup = renderToStaticMarkup(createElement(InvoiceUpdateRequestQueue, {
      requests: [{
        id: "delivery-1",
        vehicleId: "vehicle-1",
        plateNumber: "VPK 1234",
        vehicleLabel: "Toyota Vios",
        customerName: "Ali Tan",
        requestReason: "Correct the customer address",
        requestedAt: "2026-08-27T08:30:00Z"
      }],
      loading: false,
      resolvingId: undefined,
      onRetry: () => {},
      onResolve: () => {}
    }));

    expect(markup).toContain("Delivery invoice update requests / 交车发票更新");
    expect(markup).toContain("VPK 1234");
    expect(markup).toContain("Correct the customer address");
    expect(markup).toContain("Mark resolved");
    expect(markup).not.toContain("Invoice amount");
    expect(markup).not.toContain("Payment status");
  });
});
