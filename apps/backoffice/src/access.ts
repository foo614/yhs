import type { StaffRole } from "./api";

export type AppRoutePath = "/dashboard" | "/vehicles" | "/repairs" | "/loans" | "/delivery" | "/finance" | "/leads" | "/audit-log" | "/hr-salary" | "/admin";
export type BackOfficeDataKey =
  | "dashboard"
  | "reminders"
  | "vehicles"
  | "vehicleLookup"
  | "customers"
  | "owners"
  | "purchaseInvoices"
  | "supplierInvoices"
  | "repairs"
  | "loans"
  | "deliveries"
  | "payments"
  | "settlements"
  | "dailySpends"
  | "brokerCommissions"
  | "debtRecoveries"
  | "paymentVouchers"
  | "leads"
  | "auditLog"
  | "staffUsers"
  | "hrStaffUsers"
  | "hrAttendance"
  | "hrLeaveRequests"
  | "hrLeaveBalances"
  | "hrLeavePolicies"
  | "hrLeaveAdjustments"
  | "hrPayrollProfiles"
  | "hrPayPeriods"
  | "hrPayslips";

export const assignableStaffRoles: StaffRole[] = ["BossAdmin", "Sales", "Loan", "Delivery", "Finance", "Repair", "HrSalary"];

export type RouteAccess = {
  path: AppRoutePath;
  roles: StaffRole[];
};

export const routeAccess: RouteAccess[] = [
  { path: "/dashboard", roles: ["BossAdmin"] },
  { path: "/vehicles", roles: ["BossAdmin", "Sales"] },
  { path: "/repairs", roles: ["BossAdmin", "Repair"] },
  { path: "/loans", roles: ["BossAdmin", "Loan"] },
  { path: "/delivery", roles: ["BossAdmin", "Delivery"] },
  { path: "/finance", roles: ["BossAdmin", "Finance"] },
  { path: "/leads", roles: ["BossAdmin", "Sales"] },
  { path: "/audit-log", roles: ["BossAdmin"] },
  { path: "/hr-salary", roles: assignableStaffRoles },
  { path: "/admin", roles: ["BossAdmin"] }
];

const allDataKeys: BackOfficeDataKey[] = [
  "dashboard",
  "reminders",
  "vehicles",
  "vehicleLookup",
  "customers",
  "owners",
  "purchaseInvoices",
  "supplierInvoices",
  "repairs",
  "loans",
  "deliveries",
  "payments",
  "settlements",
  "dailySpends",
  "brokerCommissions",
  "debtRecoveries",
  "paymentVouchers",
  "leads",
  "auditLog",
  "staffUsers",
  "hrStaffUsers",
  "hrAttendance",
  "hrLeaveRequests",
  "hrLeaveBalances",
  "hrLeavePolicies",
  "hrLeaveAdjustments",
  "hrPayrollProfiles",
  "hrPayPeriods",
  "hrPayslips"
];

const hrSelfServiceDataKeys: BackOfficeDataKey[] = [
  "hrAttendance",
  "hrLeaveRequests",
  "hrLeaveBalances",
  "hrLeaveAdjustments",
  "hrPayrollProfiles",
  "hrPayPeriods",
  "hrPayslips"
];

const hrManagementDataKeys: BackOfficeDataKey[] = [
  ...hrSelfServiceDataKeys,
  "hrStaffUsers",
  "hrLeavePolicies"
];

export const roleDataKeys: Record<StaffRole, BackOfficeDataKey[]> = {
  BossAdmin: allDataKeys,
  Sales: ["vehicles", "vehicleLookup", "customers", "owners", "purchaseInvoices", "leads", ...hrSelfServiceDataKeys],
  Loan: ["vehicleLookup", "customers", "loans", ...hrSelfServiceDataKeys],
  Delivery: ["vehicleLookup", "deliveries", ...hrSelfServiceDataKeys],
  Finance: ["vehicleLookup", "customers", "owners", "payments", "settlements", "dailySpends", "brokerCommissions", "debtRecoveries", "paymentVouchers", ...hrSelfServiceDataKeys],
  Repair: ["vehicleLookup", "supplierInvoices", "repairs", ...hrSelfServiceDataKeys],
  HrSalary: hrManagementDataKeys
};

export function canAccessRoute(userRoles: string[] | undefined, path: string) {
  const access = routeAccess.find((item) => item.path === path);
  if (!access) return false;
  if (userRoles?.includes("BossAdmin")) return true;
  return access.roles.some((role) => userRoles?.includes(role));
}

export function firstAccessiblePath(userRoles: string[] | undefined): AppRoutePath {
  return routeAccess.find((item) => canAccessRoute(userRoles, item.path))?.path ?? "/vehicles";
}

export function canAssignStaffRoles(roles: string[] | undefined) {
  if (!roles?.length) return false;
  return roles.every((role) => assignableStaffRoles.includes(role as StaffRole));
}

export function backOfficeDataKeysForRoles(userRoles: string[] | undefined): BackOfficeDataKey[] {
  if (userRoles === undefined) return allDataKeys;
  const keys = userRoles.flatMap((role) => roleDataKeys[role as StaffRole] ?? []);
  return allDataKeys.filter((key) => keys.includes(key));
}
