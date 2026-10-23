import { describe, expect, it } from "vitest";
import {
  canShowCustomer360SourceLink,
  customer360SourceTarget,
  customerProfileOptionLabel,
  customer360CoverageStatus,
  formatCustomer360Date,
  groupMissingDocuments
} from "./Customer360Page";

describe("Customer360Page", () => {
  it("uses phone numbers to distinguish duplicate customer names in the selector", () => {
    expect(customerProfileOptionLabel({ id: "00000000-0000-0000-0000-000000000011", name: "Ali Tan", phone: "0123456789" }))
      .toBe("Ali Tan · 0123456789");
    expect(customerProfileOptionLabel({ id: "00000000-0000-0000-0000-000000000022", name: "Ali Tan", phone: "0198765432" }))
      .toBe("Ali Tan · 0198765432");
  });

  it("shows a clear fallback when phone is missing", () => {
    expect(customerProfileOptionLabel({ id: "customer", name: "Ali Tan", phone: "" })).toBe("Ali Tan · No phone recorded");
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

  it("retains distinct owning records when the same document blocks two workflows", () => {
    const first = { vehicleId: "vehicle-1", category: "Voc" as const, message: "VOC required", sourceModule: "Loans" as const, sourceRecordId: "loan-1", isActiveBlocker: true };
    const second = { ...first, sourceRecordId: "loan-2" };
    const groups = groupMissingDocuments([first, second, first]);
    expect(groups[0].items[0].requirements).toEqual([first, second]);
  });

  it("uses the Singapore business date for expiry including midnight and the inclusive expiry day", () => {
    const beforeMidnight = new Date("2026-10-23T15:59:59Z");
    const midnight = new Date("2026-10-23T16:00:00Z");
    expect(customer360CoverageStatus("2026-10-23", beforeMidnight)).toBe("Expiring within 30 days");
    expect(customer360CoverageStatus("2026-10-23", midnight)).toBe("Expired");
    expect(customer360CoverageStatus("2026-11-23", midnight)).toBe("Expiring within 30 days");
    expect(customer360CoverageStatus("2026-11-24", midnight)).toBe("Current");
    expect(customer360CoverageStatus(null, midnight)).toBe("Expiry date missing");
  });

  it("deep-links only loan and delivery records and labels module fallbacks", () => {
    expect(customer360SourceTarget("/loans", "loan/1", "Loan")).toEqual({ path: "/loans?loanId=loan%2F1", label: "Open loan" });
    expect(customer360SourceTarget("/delivery", "delivery-1", "Delivery")).toEqual({ path: "/delivery?deliveryId=delivery-1", label: "Open delivery" });
    expect(customer360SourceTarget("/finance", "payment-1", "Finance")).toEqual({ path: "/finance", label: "Open Finance" });
  });
});
