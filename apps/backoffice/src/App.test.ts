import { describe, expect, it } from "vitest";
import { activeLoanForVehicle, attendanceQrTokenFromHash, browserRouteUrl, customerIdFromRouteUrl, loanIdFromRouteUrl, postLoginRouteForAttendanceQr, vehicleLoanCustomerId } from "./App";

describe("browser route state", () => {
  it("retains Customer 360 query changes for Back and Forward navigation", () => {
    const customerA = browserRouteUrl({ pathname: "/customer-360", search: "?customerId=customer-a" });
    const customerB = browserRouteUrl({ pathname: "/customer-360", search: "?customerId=customer-b" });

    expect(customerIdFromRouteUrl(customerB)).toBe("customer-b");
    expect(customerIdFromRouteUrl(customerA)).toBe("customer-a");
  });

  it("does not treat unrelated route queries as a Customer 360 selection", () => {
    expect(customerIdFromRouteUrl("/finance?tab=cash-custody")).toBeUndefined();
  });

  it("keeps a direct loan handoff target in the route", () => {
    expect(loanIdFromRouteUrl("/loans?loanId=loan-123")).toBe("loan-123");
    expect(loanIdFromRouteUrl("/loans")).toBeUndefined();
  });

  it("routes a scanned attendance QR to HR while retaining the usual role landing otherwise", () => {
    expect(attendanceQrTokenFromHash("#attendanceQr=office-qr-token")).toBe("office-qr-token");
    expect(attendanceQrTokenFromHash("#other=value")).toBeUndefined();
    expect(postLoginRouteForAttendanceQr(["Sales"], true)).toBe("/hr-salary");
    expect(postLoginRouteForAttendanceQr(["Sales"], false)).toBe("/vehicles");
  });

  it("uses the existing loan buyer before requiring a vehicle-level buyer", () => {
    expect(vehicleLoanCustomerId({ customerId: undefined })).toBeUndefined();
    expect(vehicleLoanCustomerId({ customerId: "customer-1" })).toBe("customer-1");
    expect(vehicleLoanCustomerId({ customerId: undefined }, { customerId: "loan-customer" })).toBe("loan-customer");
  });

  it("starts a new sale after a rejected loan instead of reopening the rejected record", () => {
    const loans = [
      { id: "rejected", vehicleId: "vehicle-1", customerId: "old-customer", status: "Rejected" as const, louApproved: false, louDone: false },
      { id: "active", vehicleId: "vehicle-2", customerId: "active-customer", status: "Pending" as const, louApproved: false, louDone: false }
    ];

    expect(activeLoanForVehicle(loans, "vehicle-1")).toBeUndefined();
    expect(activeLoanForVehicle(loans, "vehicle-2")?.id).toBe("active");
  });
});
