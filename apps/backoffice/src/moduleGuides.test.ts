import { describe, expect, it } from "vitest";
import { routeAccess, type AppRoutePath } from "./access";
import { financeTabForUrl } from "./modules/finance/FinancePage";
import {
  MODULE_GUIDE_TOUR_VERSION,
  markModuleGuideTourSeen,
  moduleGuideForPath,
  moduleGuideTourStorageKey,
  shouldShowModuleGuideTour,
  type ModuleGuideStorage
} from "./moduleGuides";

function memoryStorage() {
  const values = new Map<string, string>();
  const storage: ModuleGuideStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    }
  };
  return { storage, values };
}

describe("module guidance", () => {
  it("provides complete operational guidance for every application route", () => {
    const expectedPaths: AppRoutePath[] = [
      "/dashboard",
      "/vehicles",
      "/repairs",
      "/loans",
      "/delivery",
      "/finance",
      "/customer-360",
      "/leads",
      "/audit-log",
      "/hr-salary",
      "/admin"
    ];

    expect(routeAccess.map((route) => route.path)).toEqual(expectedPaths);

    const expectedMinimumSections: Record<AppRoutePath, number> = {
      "/dashboard": 5,
      "/vehicles": 12,
      "/repairs": 8,
      "/loans": 6,
      "/delivery": 5,
      "/finance": 7,
      "/customer-360": 9,
      "/leads": 4,
      "/audit-log": 2,
      "/hr-salary": 7,
      "/admin": 7
    };

    for (const path of expectedPaths) {
      const guide = moduleGuideForPath(path, ["BossAdmin"]);
      expect(guide.path).toBe(path);
      expect(guide.title).toContain("/");
      expect(guide.roleLabel).toContain("/");
      expect(guide.summary.length).toBeGreaterThan(30);
      expect(guide.quickSteps).toHaveLength(3);
      expect(guide.quickSteps.every((step) => step.title.includes("/") && step.description.length > 20)).toBe(true);
      expect(guide.sections.length).toBeGreaterThanOrEqual(expectedMinimumSections[path]);
      expect(new Set(guide.sections.map((section) => section.key)).size).toBe(guide.sections.length);
      for (const section of guide.sections) {
        expect(section.key.trim().length).toBeGreaterThan(2);
        expect(section.label.trim().length).toBeGreaterThan(5);
        expect(["tab", "section", "detail-tab"]).toContain(section.kind);
        expect(section.audience.trim().length).toBeGreaterThan(3);
        expect(section.purpose.length).toBeGreaterThan(20);
        expect(section.actions.length).toBeGreaterThanOrEqual(2);
        expect(section.actions.every((action) => action.length > 8)).toBe(true);
        expect(section.requiredItems.length).toBeGreaterThan(0);
        expect(section.completeWhen.length).toBeGreaterThan(20);
        expect(section.warnings.length).toBeGreaterThan(0);
      }
      expect(guide.completionReminder.length).toBeGreaterThan(30);
    }
  });

  it("documents the exact seven Finance tabs and restricts Sales to cash custody", () => {
    const salesGuide = moduleGuideForPath("/finance", ["Sales"]);
    const financeGuide = moduleGuideForPath("/finance", ["Finance"]);
    const bossGuide = moduleGuideForPath("/finance", ["Sales", "BossAdmin"]);
    const expectedFinanceKeys = ["payments", "settlements", "commissions", "debt", "vouchers", "daily", "cash-custody"];
    const expectedFinanceLabels = [
      "Invoices & Collections / 发票与收款",
      "Settlement / 结算",
      "Broker Commission / 经纪佣金",
      "Debt Recovery / 欠款追讨",
      "Payment Voucher / 付款凭证",
      "Daily Spend / 日常支出",
      "Cash Handover / Official Receipts"
    ];

    expect(salesGuide.title).toBe("Cash Custody / 现金交接");
    expect(salesGuide.roleLabel).toContain("Sales cash custody");
    expect(salesGuide.completionReminder).toContain("Finance must confirm");
    expect(salesGuide.sections.map((section) => section.key)).toEqual(["cash-custody"]);
    expect(financeGuide.title).toBe("Finance & Collection / 财务收款");
    expect(financeGuide.roleLabel).toContain("Finance control");
    expect(financeGuide.sections.map((section) => section.key)).toEqual(expectedFinanceKeys);
    expect(financeGuide.sections.map((section) => section.label)).toEqual(expectedFinanceLabels);
    expect(financeGuide.sections.every((section) => section.kind === "tab")).toBe(true);
    expect(financeGuide.sections.find((section) => section.key === "vouchers")?.actions).toHaveLength(6);
    expect(financeGuide.sections.find((section) => section.key === "vouchers")?.purpose).toContain("four nested workflows");
    expect(financeGuide.sections.find((section) => section.key === "payments")?.warnings.join(" ")).toContain("review-only rows");
    const voucherTab = financeTabForUrl("/finance", "?tab=vouchers", true);
    expect(financeGuide.sections.some((section) => section.key === voucherTab)).toBe(true);
    expect(bossGuide).toBe(financeGuide);
  });

  it("keeps review-only AutoCount rows and unsupported Loan fields explicit", () => {
    const financeGuide = moduleGuideForPath("/finance", ["Finance"]);
    const loanGuide = moduleGuideForPath("/loans", ["Loan"]);

    expect(financeGuide.summary).not.toContain("approved AutoCount data");
    expect(financeGuide.sections.find((section) => section.key === "payments")?.warnings.join(" ")).toContain("draft, pending, unpaid, or unconfirmed");
    expect(loanGuide.quickSteps.map((step) => step.description).join(" ")).not.toContain("bank outcome");
    expect(loanGuide.sections.find((section) => section.key === "loan-list")?.warnings.join(" ")).toContain("no bank");
  });

  it("does not expose private identity guidance to Delivery-only Customer 360", () => {
    const deliveryGuide = moduleGuideForPath("/customer-360", ["Delivery"]);
    const salesGuide = moduleGuideForPath("/customer-360", ["Sales"]);
    const deliveryIdentity = deliveryGuide.sections.find((section) => section.key === "contact-identity");

    expect(deliveryGuide.roleLabel).toContain("Delivery customer view");
    expect(deliveryIdentity?.actions.join(" ")).not.toMatch(/\b(IC|TIN|address)\b/i);
    expect(deliveryIdentity?.warnings.join(" ")).toContain("Delivery cannot see IC, TIN, email, address, or notes");
    expect(salesGuide.sections.find((section) => section.key === "contact-identity")?.actions.join(" ")).toContain("TIN");
  });

  it("shows role-specific HR sections without granting Boss-only controls to HR Payroll", () => {
    const staffGuide = moduleGuideForPath("/hr-salary", ["Sales"]);
    const hrGuide = moduleGuideForPath("/hr-salary", ["HrSalary"]);
    const bossGuide = moduleGuideForPath("/hr-salary", ["BossAdmin"]);
    const staffAndHrKeys = ["today-attendance", "attendance", "leave", "balances", "payroll"];
    const bossKeys = ["today-attendance", "staff-calendar", "office-network", "attendance", "leave", "balances", "payroll"];

    expect(staffGuide.title).toBe("My Attendance / Leave / 我的考勤与请假");
    expect(staffGuide.summary).toContain("your own");
    expect(staffGuide.sections.map((section) => section.key)).toEqual(staffAndHrKeys);
    expect(staffGuide.sections.find((section) => section.key === "attendance")?.audience).toContain("own records");
    expect(hrGuide.title).toBe("HR Payroll / 人事薪资");
    expect(hrGuide.summary).toContain("payroll");
    expect(hrGuide.sections.map((section) => section.key)).toEqual(staffAndHrKeys);
    expect(hrGuide.sections.find((section) => section.key === "attendance")?.audience).toContain("HR Payroll");
    expect(bossGuide.sections.map((section) => section.key)).toEqual(bossKeys);
    expect(bossGuide.sections.find((section) => section.key === "staff-calendar")?.kind).toBe("tab");
    expect(bossGuide.sections.find((section) => section.key === "office-network")?.kind).toBe("tab");
    expect(bossGuide.roleLabel).toContain("Boss/Admin HR management");
    expect(bossGuide).not.toBe(hrGuide);
  });
});

describe("module guide first-visit storage", () => {
  it("uses a separate versioned key for every route and signed-in user", () => {
    const dashboardForUserA = moduleGuideTourStorageKey("/dashboard", "user-a");

    expect(MODULE_GUIDE_TOUR_VERSION).toBe("v2");
    expect(dashboardForUserA).toContain("module-guide:v2");
    expect(dashboardForUserA).not.toBe(moduleGuideTourStorageKey("/vehicles", "user-a"));
    expect(dashboardForUserA).not.toBe(moduleGuideTourStorageKey("/dashboard", "user-b"));
    expect(moduleGuideTourStorageKey("/dashboard")).toContain("anonymous");
  });

  it("shows a tour on first visit and suppresses it after that module is marked seen", () => {
    const { storage, values } = memoryStorage();

    expect(shouldShowModuleGuideTour(storage, "/delivery", "staff-1")).toBe(true);
    markModuleGuideTourSeen(storage, "/delivery", "staff-1");

    expect(values.get(moduleGuideTourStorageKey("/delivery", "staff-1"))).toBe("seen");
    expect(shouldShowModuleGuideTour(storage, "/delivery", "staff-1")).toBe(false);
    expect(shouldShowModuleGuideTour(storage, "/repairs", "staff-1")).toBe(true);
    expect(shouldShowModuleGuideTour(storage, "/delivery", "staff-2")).toBe(true);
  });

  it("fails open without storage so help remains available", () => {
    const unavailableStorage: ModuleGuideStorage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      }
    };

    expect(shouldShowModuleGuideTour(null, "/leads", "staff-1")).toBe(true);
    expect(shouldShowModuleGuideTour(unavailableStorage, "/leads", "staff-1")).toBe(true);
    expect(() => markModuleGuideTourSeen(unavailableStorage, "/leads", "staff-1")).not.toThrow();
  });
});
