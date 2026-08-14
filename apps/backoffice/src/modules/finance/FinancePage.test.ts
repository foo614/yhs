import { describe, expect, it } from "vitest";
import { financeTabForUrl } from "./FinancePage";

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
