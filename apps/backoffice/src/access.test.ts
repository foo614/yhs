import { describe, expect, it } from "vitest";
import { backOfficeDataKeysForRoles, canAccessRoute, canAssignStaffRoles, firstAccessiblePath } from "./access";

describe("backoffice role access", () => {
  it("allows Boss/Admin to access every implemented module", () => {
    for (const path of ["/dashboard", "/vehicles", "/repairs", "/loans", "/delivery", "/finance", "/leads", "/audit-log", "/hr-salary", "/admin"]) {
      expect(canAccessRoute(["BossAdmin"], path)).toBe(true);
    }
  });

  it("limits department users to their operational modules", () => {
    expect(canAccessRoute(["Sales"], "/vehicles")).toBe(true);
    expect(canAccessRoute(["Sales"], "/leads")).toBe(true);
    expect(canAccessRoute(["Sales"], "/audit-log")).toBe(false);
    expect(canAccessRoute(["Sales"], "/finance")).toBe(false);
    expect(canAccessRoute(["Finance"], "/finance")).toBe(true);
    expect(canAccessRoute(["Finance"], "/loans")).toBe(false);
    expect(canAccessRoute(["Loan"], "/loans")).toBe(true);
    expect(canAccessRoute(["Repair"], "/repairs")).toBe(true);
    expect(canAccessRoute(["Delivery"], "/delivery")).toBe(true);
    expect(canAccessRoute(["HrSalary"], "/hr-salary")).toBe(true);
    expect(canAccessRoute(["HrSalary"], "/vehicles")).toBe(false);
  });

  it("chooses the first accessible module as the landing page", () => {
    expect(firstAccessiblePath(["BossAdmin"])).toBe("/dashboard");
    expect(firstAccessiblePath(["Sales"])).toBe("/vehicles");
    expect(firstAccessiblePath(["Finance"])).toBe("/finance");
    expect(firstAccessiblePath(["HrSalary"])).toBe("/hr-salary");
  });

  it("requires at least one known department role before updating staff access", () => {
    expect(canAssignStaffRoles(["Sales"])).toBe(true);
    expect(canAssignStaffRoles(["HrSalary"])).toBe(true);
    expect(canAssignStaffRoles(["Finance", "Loan"])).toBe(true);
    expect(canAssignStaffRoles([])).toBe(false);
    expect(canAssignStaffRoles(["Unknown"])).toBe(false);
  });

  it("loads only the data sets needed by department roles", () => {
    expect(backOfficeDataKeysForRoles(["Finance"])).toEqual(["vehicleLookup", "customers", "owners", "payments", "settlements", "dailySpends", "brokerCommissions", "debtRecoveries", "paymentVouchers"]);
    expect(backOfficeDataKeysForRoles(["Loan"])).toEqual(["vehicleLookup", "customers", "loans"]);
    expect(backOfficeDataKeysForRoles(["Repair"])).toEqual(["vehicleLookup", "supplierInvoices", "repairs"]);
    expect(backOfficeDataKeysForRoles(["Delivery"])).toEqual(["vehicleLookup", "deliveries"]);
    expect(backOfficeDataKeysForRoles(["Sales"])).toEqual(["vehicles", "vehicleLookup", "customers", "owners", "purchaseInvoices", "leads"]);
    expect(backOfficeDataKeysForRoles(["HrSalary"])).toEqual([]);
  });

  it("keeps Boss/Admin and unauthenticated demo sessions broad while empty authenticated roles load nothing", () => {
    expect(backOfficeDataKeysForRoles(["BossAdmin"])).toContain("auditLog");
    expect(backOfficeDataKeysForRoles(undefined)).toContain("staffUsers");
    expect(backOfficeDataKeysForRoles([])).toEqual([]);
  });
});
