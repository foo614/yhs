import { test, expect } from "playwright/test";
import { routes, widths } from "./responsive-check.mjs";

// Critical payroll regression: confirmation must never write unselected staff,
// retry a stale preview automatically, or leave refreshed money/status stale.
for (const width of widths.filter(value => [360, 768, 1440].includes(value))) {
  test(`selected payroll preparation and review at ${width}px`, async ({ page, context }, testInfo) => {
    test.skip(!routes.includes("hr-salary"));
    await page.setViewportSize({ width, height: 1000 });
    const period = { id: "period-test", name: "September 2025", startDate: "2025-09-01", endDate: "2025-09-30", workingDays: 22 };
    const statutoryKeys = ["employeeEpf", "employeeSocso", "employeeEis", "pcb", "employerEpf", "employerSocso", "employerEis"];
    const staff = ["new-a", "new-b", "existing", "locked"].map(id => ({ id, displayName: `Synthetic ${id}`, email: `${id}@example.test`, roles: ["Sales"], isActive: true }));
    const makeSlip = (id, values = {}) => ({ id: `slip-${id}`, staffUserId: id, staffName: `Synthetic ${id}`, payPeriodId: period.id, status: "Draft", employmentType: "Monthly", baseSalary: 2200, hourlyRate: 0, workedHours: 0, attendancePay: 0, workingDays: 22, dailySalary: 100, unpaidLeaveDays: 0, unpaidLeaveDeduction: 0, overtimePay: 0, allowances: 0, manualDeductions: 0, grossPay: 2200, netPay: 2200, version: 1, generatedAt: "2025-10-01T00:00:00Z", ...values });
    let slips = [makeSlip("existing", { employeeEpf: 100, employerEpf: 200, statutoryReference: "Synthetic original assessment", netPay: 2100 }), makeSlip("locked", { status: "Published", ...Object.fromEntries(statutoryKeys.map(key => [key, 0])), statutoryReference: "Synthetic complete assessment" })];
    const original = structuredClone(slips[0]);
    let role = "BossAdmin";
    let staleNext = false;
    const mutations = [];
    const unexpectedMutations = [];
    let previewRequests = 0;
    const pageErrors = [];
    page.on("pageerror", error => pageErrors.push(error.message));
    await context.addInitScript(() => {
      for (const role of ["BossAdmin", "Finance", "Sales"]) localStorage.setItem(`ysheng:module-guide:v2:${encodeURIComponent(`flow-test:${role}`)}:${encodeURIComponent("/hr-salary")}`, "seen");
    });
    // Every API request is fulfilled locally; no mutation can reach a server.
    await context.route("**/api/**", async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const respond = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (request.method() === "GET") {
        if (path === "/api/auth/me") return respond({ isAuthenticated: true, id: "flow-test", name: "Synthetic Reviewer", roles: [role] });
        if (path === "/api/hr/staff") return respond(staff);
        if (path === "/api/hr/pay-periods") return respond([period]);
        if (path === "/api/hr/payslips") return respond(slips);
        if (path === "/api/hr/payroll-profiles") return respond(staff.map(item => ({ id: `profile-${item.id}`, staffUserId: item.id, employmentType: "Monthly", monthlyBaseSalary: 2200, hourlyRate: 0, overtimeHours: 0, overtimeRate: 0, allowances: 0, manualDeductions: 0 })));
        if (path === `/api/hr/pay-periods/${period.id}/preview`) {
          previewRequests++;
          return respond(staff.map(item => {
            const existingPayslip = slips.find(slip => slip.staffUserId === item.id) ?? null;
            const locked = existingPayslip?.status === "Published";
            return { staffUserId: item.id, staffName: item.displayName, existingPayslip, draft: locked ? null : makeSlip(item.id, { version: (existingPayslip?.version ?? 0) + 1 }), action: locked ? null : existingPayslip ? "Recalculate" : "Prepare", blockingReason: locked ? "Published payslip is locked." : null, previewToken: locked ? null : `reviewed-${item.id}` };
          }));
        }
        if (path === "/api/hr/dashboard") return respond({ checkedInToday: 0, checkedOutToday: 0, openSessionsToday: 0, pendingBusinessTripRequests: 0 });
        if (path === "/api/dashboard/summary") return respond({});
        if (path === "/api/sales/workboard") return respond({ items: [], availableAgents: [] });
        if (path === "/api/whatsapp/assistant/connection") return respond({ enabled: false, state: "Disabled", language: "en_US" });
        return respond([]);
      }
      if (request.method() === "POST" && path.endsWith("/generate-payslips")) {
        const body = request.postDataJSON(); mutations.push(body);
        if (staleNext) { staleNext = false; return respond({ message: "Payroll changed after preview. Refresh and review again." }, 409); }
        const saved = body.selections.map(selection => makeSlip(selection.staffUserId, { version: (slips.find(slip => slip.staffUserId === selection.staffUserId)?.version ?? 0) + 1 }));
        for (const slip of saved) slips = [...slips.filter(item => item.id !== slip.id), slip];
        return respond(saved);
      }
      if (request.method() === "PUT" && path === "/api/hr/payslips/slip-new-a/statutory") {
        const input = request.postDataJSON();
        const existing = slips.find(slip => slip.id === "slip-new-a");
        expect(input.version).toBe(existing.version);
        const updated = { ...existing, ...Object.fromEntries(statutoryKeys.map(key => [key, input[key]])), statutoryReference: input.reference, netPay: 1800, version: existing.version + 1 };
        slips = slips.map(slip => slip.id === updated.id ? updated : slip);
        return respond(updated);
      }
      unexpectedMutations.push(`${request.method()} ${path}`);
      return respond({ message: "Unexpected synthetic mutation rejected." }, 422);
    });
    const openPayroll = async () => {
      await page.goto("/hr-salary");
      const tab = page.getByRole("tab", { name: /Pay Slip/ });
      await tab.focus(); await tab.press("Enter");
      await expect(page.getByRole("combobox", { name: "Selected pay month / 选择薪资月份" })).toBeVisible();
    };
    const dialog = () => page.getByRole("dialog").filter({ visible: true }).last();
    const row = name => page.locator(width < 768 ? ".mobileRecordCard" : ".ant-table-row").filter({ hasText: name }).filter({ visible: true }).first();
    const capture = async name => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), animations: "disabled" });
    };
    await openPayroll();
    await row("Synthetic existing").scrollIntoViewIfNeeded();
    await capture("payroll-list");
    await page.getByRole("button", { name: "Prepare new payslips / 准备新薪资单", exact: true }).click();
    await expect(dialog().getByRole("button", { name: /Review selected/ })).toBeDisabled();
    await dialog().getByRole("checkbox", { name: "Synthetic new-a", exact: true }).check();
    await expect(dialog().getByRole("checkbox", { name: "Synthetic new-b", exact: true })).not.toBeChecked();
    await capture("payroll-selection");
    await dialog().getByRole("button", { name: /Review selected/ }).click();
    await expect(dialog().getByRole("heading", { name: "Synthetic new-a", exact: true })).toBeVisible();
    await expect(dialog().getByText("Synthetic new-b", { exact: true })).toHaveCount(0);
    await capture("payroll-review");
    await dialog().getByRole("button", { name: /Confirm & prepare drafts/ }).click();
    await expect.poll(() => mutations.length).toBe(1);
    expect(mutations[0]).toEqual({ selections: [{ staffUserId: "new-a", action: "Prepare", previewToken: "reviewed-new-a" }] });
    expect(slips.find(slip => slip.id === original.id)).toEqual(original);
    await row("Synthetic new-a").getByRole("button", { name: "Details / 详情", exact: true }).click();
    const drawer = page.locator(".ant-drawer-open");
    await expect(drawer.getByRole("button", { name: "Submit to Finance / 提交财务", exact: true })).toBeDisabled();
    await drawer.getByRole("button", { name: "Enter statutory amounts / 填写法定扣款", exact: true }).click();
    await expect(dialog().getByRole("spinbutton")).toHaveCount(7);
    for (const field of await dialog().getByRole("spinbutton").all()) await field.fill("100");
    await dialog().getByLabel("Calculation source, month and exemption reasons / 计算依据").fill("Synthetic reviewed assessment");
    await dialog().getByRole("button", { name: "Save for review / 保存待核对", exact: true }).click();
    await expect(drawer.getByText("Synthetic reviewed assessment", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Submit to Finance / 提交财务", exact: true })).toBeEnabled();
    await expect(drawer.getByText(/Net pay.*RM 1,800.00/)).toBeVisible();
    await capture("payroll-details");
    await drawer.getByRole("button", { name: "Close", exact: true }).click();
    await row("Synthetic existing").getByRole("button", { name: "Recalculate / 重新计算", exact: true }).click();
    await expect(dialog().getByText(/All seven statutory amounts/)).toBeVisible();
    await expect(dialog().getByRole("heading", { name: "Synthetic existing", exact: true })).toBeVisible();
    await capture("payroll-recalculate");
    staleNext = true;
    await dialog().getByRole("button", { name: /Confirm recalculation/ }).click();
    await expect(page.getByText(/Payroll changed after preview.*Review a fresh preview/)).toBeVisible();
    expect(mutations).toHaveLength(2);
    expect(mutations[1]).toEqual({ selections: [{ staffUserId: "existing", action: "Recalculate", previewToken: "reviewed-existing" }] });
    expect(slips.find(slip => slip.id === original.id)).toEqual(original);
    await row("Synthetic existing").getByRole("button", { name: "Recalculate / 重新计算", exact: true }).click();
    await dialog().getByRole("button", { name: /Confirm recalculation/ }).click();
    await expect.poll(() => mutations.length).toBe(3);
    expect(slips.find(slip => slip.staffUserId === "new-a").netPay).toBe(1800);
    expect(slips.find(slip => slip.staffUserId === "new-b")).toBeUndefined();
    for (const nextRole of ["Finance", "Sales"]) {
      role = nextRole;
      const previewCount = previewRequests;
      await openPayroll();
      await expect(page.getByRole("button", { name: "Prepare new payslips / 准备新薪资单", exact: true })).toHaveCount(0);
      await row("Synthetic locked").getByRole("button", { name: "Details / 详情", exact: true }).click();
      await expect(page.locator(".ant-drawer-open").getByText("Published payslips are locked. / 已发布薪资单已锁定。", { exact: true })).toBeVisible();
      expect(previewRequests).toBe(previewCount);
      await page.locator(".ant-drawer-open").getByRole("button", { name: "Close", exact: true }).click();
    }
    expect(mutations).toHaveLength(3);
    expect(unexpectedMutations).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
