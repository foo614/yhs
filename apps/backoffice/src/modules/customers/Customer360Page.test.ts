import { describe, expect, it } from "vitest";
import {
  canShowCustomer360SourceLink,
  customer360SourceTarget,
  customerProfileOptionLabel,
  formatCustomer360Date,
  groupMissingDocuments
} from "./Customer360Page";

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

  it("formats timestamps in Malaysia time and leaves date-only values unshifted", () => {
    expect(formatCustomer360Date("2026-08-07T17:38:53.18348Z")).toBe("8 Aug 2026, 1:38 AM");
    expect(formatCustomer360Date("2026-08-07")).toBe("7 Aug 2026");
  });

  it("deduplicates missing requirements by vehicle and category while retaining messages", () => {
    expect(groupMissingDocuments([
      { vehicleId: "vehicle-1", category: "Voc", message: "VOC is required for intake." },
      { vehicleId: "vehicle-1", category: "Voc", message: "VOC is required for the loan." },
      { vehicleId: "vehicle-1", category: "Voc", message: "VOC is required for intake." },
      { category: "IdentityCard", message: "Identity card is missing." }
    ])).toEqual([
      { vehicleId: "vehicle-1", items: [{ category: "Voc", messages: ["VOC is required for intake.", "VOC is required for the loan."] }] },
      { vehicleId: undefined, items: [{ category: "IdentityCard", messages: ["Identity card is missing."] }] }
    ]);
  });

  it("deep-links only loan and delivery records and labels module fallbacks", () => {
    expect(customer360SourceTarget("/loans", "loan/1", "Loan")).toEqual({ path: "/loans?loanId=loan%2F1", label: "Open loan" });
    expect(customer360SourceTarget("/delivery", "delivery-1", "Delivery")).toEqual({ path: "/delivery?deliveryId=delivery-1", label: "Open delivery" });
    expect(customer360SourceTarget("/finance", "payment-1", "Finance")).toEqual({ path: "/finance", label: "Open Finance" });
  });
});
