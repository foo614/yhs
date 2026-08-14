import { describe, expect, it } from "vitest";
import { canShowCustomer360SourceLink, customerProfileOptionLabel } from "./Customer360Page";

describe("Customer360Page", () => {
  it("adds a stable identifier to duplicate customer names in the selector", () => {
    expect(customerProfileOptionLabel({ id: "00000000-0000-0000-0000-000000000011", name: "Ali Tan" }))
      .toBe("Ali Tan · ID …00000011");
    expect(customerProfileOptionLabel({ id: "00000000-0000-0000-0000-000000000022", name: "Ali Tan" }))
      .toBe("Ali Tan · ID …00000022");
  });

  it("shows source navigation only for routes available to the current role", () => {
    const loanRoutes = new Set(["/loans"]);
    const canAccessLoanRoute = (path: "/vehicles" | "/loans" | "/delivery" | "/finance" | "/leads") => loanRoutes.has(path);

    expect(canShowCustomer360SourceLink("/loans", canAccessLoanRoute)).toBe(true);
    expect(canShowCustomer360SourceLink("/vehicles", canAccessLoanRoute)).toBe(false);
    expect(canShowCustomer360SourceLink("/finance", canAccessLoanRoute)).toBe(false);
  });
});
