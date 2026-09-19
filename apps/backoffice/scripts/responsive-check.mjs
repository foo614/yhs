import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const baseURL = process.env.RESPONSIVE_BASE_URL ?? "http://127.0.0.1:4176";
let server;
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Use a local test server only.");
if (!process.env.RESPONSIVE_BASE_URL) {
  let occupied = false;
  try { await fetch(baseURL, { signal: AbortSignal.timeout(1000) }); occupied = true; } catch { /* No server yet. */ }
  if (occupied) throw new Error("Port 4176 is already in use. Set RESPONSIVE_BASE_URL explicitly to test an existing local server.");
  const require = createRequire(import.meta.url);
  const vite = path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");
  server = spawn(process.execPath, [vite, "--host", "127.0.0.1", "--port", "4176", "--strictPort"], { cwd: fileURLToPath(new URL("..", import.meta.url)), stdio: "ignore", windowsHide: true });
  server.unref();
  process.once("exit", () => server.kill());
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error("Responsive test server exited. Check that port 4176 is free.");
    try { ready = (await fetch(baseURL)).ok; } catch { /* Vite is starting. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!ready) throw new Error("Responsive test server did not become ready.");
}
const output = process.env.RESPONSIVE_OUTPUT ?? "../../artifacts/responsive";
await mkdir(output, { recursive: true });
const routes = (process.env.RESPONSIVE_ROUTES ?? "dashboard,vehicles,repairs,loans,delivery,finance,customer-360,leads,audit-log,hr-salary,admin").split(",");
const widths = (process.env.RESPONSIVE_WIDTHS ?? "360,390,720,721,767,768,820,1024,1025,1440").split(",").map(Number);
const vehicle = { id: "test-vehicle", plateNumber: "TEST1234", make: "Toyota", model: "Corolla Cross Hybrid Premium", year: 2024, stockOwner: "YSHeng", status: "Available", isPublic: false, purchasePrice: 80000, sellingPrice: 98000, additionalCharges: 0, refurbishmentTotal: 0, commissionTotal: 0, bossConfirmed: true };
const fixtures = {
  "/api/auth/me": { isAuthenticated: true, id: "responsive-test", name: "Layout Test", roles: ["BossAdmin"] },
  "/api/vehicles": [vehicle],
  "/api/vehicle-lookup": [vehicle],
  "/api/finance/vehicle-options": [vehicle],
  "/api/repairs": [{ id: "test-repair", vehicleId: vehicle.id, repairPart: "Air conditioning compressor and condenser", whatToDo: "Inspect and replace the damaged assembly after review", cost: 1200, checklistDone: false, approvalStatus: "Approved" }],
  "/api/loans": [{ id: "test-loan", vehicleId: vehicle.id, customerId: "test-customer", status: "Pending", louApproved: false, louDone: false, submittedAt: "2026-09-01" }],
  "/api/loans/test-loan/document-check": { isComplete: false, missingCategories: ["StatusReceipt", "Voc", "LoanDocument"] },
  "/api/customers": [{ id: "test-customer", name: "Synthetic Customer With A Longer Display Name", phone: "0000000000" }],
  "/api/leads": [{ id: "test-lead", vehicleId: vehicle.id, customerName: "Synthetic Customer With A Longer Display Name", phone: "0000000000", status: "New", createdAt: "2026-09-01T10:00:00Z", message: "Please arrange a viewing and explain the available finance options." }],
  "/api/deliveries/workboard": [{ id: "test-delivery", vehicleId: vehicle.id, plateNumber: vehicle.plateNumber, vehicleLabel: "2024 Toyota Corolla Cross Hybrid Premium", customerName: "Synthetic Customer With A Longer Display Name", picName: "Layout Test", status: "PreparingDocuments", stage: "ClearDocuments", stageLabel: "Clear documents", nextAction: "Check insurance and road tax documents", scheduledDate: "2026-09-20", deliveryType: "Standard", financeCleared: false, canRelease: false, terminal: false, missingCategories: ["Policy", "RoadTaxReceipt"], evidence: [], polishDone: true, tintedDone: true, washDone: true, documentsPrepared: false, inspectionDone: true, notificationSent: false, twoDayNoticeSent: false, insuranceHandled: false, roadTaxHandled: false, windscreenInsuranceHandled: false }],
  "/api/dashboard/summary": { totalStock: 1, pendingLoan: 1, outstandingPayment: 0, settlementDue: 0, repairCost: 1200, estimatedProfit: 16800, vehicleAging: 0, agingBuckets: [], topSupplier: "Synthetic supplier", salesPerformance: 0, stockStatusMix: [], stockOwnerMix: [], moneyRiskBreakdown: [], workflowBlockers: { byType: [], dueBuckets: [] }, salesFunnel: { stages: [], conversionRate: 0 }, topEnquiredVehicles: [], repairCostByVehicle: [], topSellingModels: [], leadTrend: [], leadsAwaitingFirstResponse: 1, repairWorkInProgress: [], realisedProfit: 0, monthlyProfitTrend: [], profitBreakdown: [], supplierSpendTop: [], totalSales: 0, actualProfit: 0, outstandingCollection: 0, settlementDueAmount: 0, refurbishment: { finalRepairSpend: 1200, vehicleCount: 1, averageSpendPerVehicle: 1200, workInProgressCount: 1, overdueWorkCount: 0, highestCostVehicles: [] } },
  "/api/hr/dashboard": { checkedInToday: 0, checkedOutToday: 0, openSessionsToday: 0, officeQrSessionsToday: 0, manualSessionsToday: 0, outstationSessionsToday: 0, pendingBusinessTripRequests: 0, activeOutstationToday: 0, upcomingApprovedTrips: 0 },
  "/api/admin/ai-limits/ocr": { limit: { isEnabled: true, monthlyRequestLimit: 100, perStaffDailyRequestLimit: 10, updatedAt: "2026-09-01T00:00:00Z", updatedBy: "Layout Test" }, usedThisMonth: 0, remainingThisMonth: 100 },
  "/api/sales/workboard": { soldThisMonth: 0, inProgressCount: 0, availableAgents: [], items: [] }
};
// These collection endpoints intentionally exercise empty states. Unknown paths
// fail the run rather than silently turning a missing fixture into an empty page.
const emptyCollections = new Set([
  "/api/vehicle-catalog/models", "/api/customers/profile-options", "/api/owners",
  "/api/purchase-invoices", "/api/suppliers", "/api/supplier-master", "/api/supplier-invoices",
  "/api/supplier-invoices/aging", "/api/deliveries", "/api/deliveries/pic-options",
  "/api/payments", "/api/cash-handovers", "/api/cash-handovers/payment-lookup",
  "/api/settlement-reminders", "/api/settlement-drafts", "/api/daily-spends",
  "/api/broker-commissions", "/api/debt-recoveries", "/api/payment-vouchers",
  "/api/delivery-accounting-charges", "/api/deliveries/invoice-update-requests",
  "/api/audit-log", "/api/admin/users", "/api/sales-agents", "/api/priority-actions",
  "/api/dashboard/reminders", "/api/hr/staff", "/api/hr/attendance", "/api/hr/boss-calendar",
  "/api/hr/attendance-networks", "/api/hr/availability-calendar", "/api/hr/reminders",
  "/api/hr/reminder-policies", "/api/hr/business-trips", "/api/hr/leave-requests",
  "/api/hr/leave-balances", "/api/hr/leave-policies", "/api/hr/leave-adjustments",
  "/api/hr/payroll-profiles", "/api/hr/pay-periods", "/api/hr/payslips",
  "/api/vehicles/test-vehicle/documents", "/api/vehicles/test-vehicle/photos",
  "/api/vehicles/test-vehicle/ocr-jobs", "/api/vehicles/test-vehicle/stock-movements",
  "/api/deliveries/test-delivery/activity", "/api/operations-calendar", "/api/repairs/test-repair/receipts"
]);
for (let index = 0; index < 9; index++) {
  for (const resource of ["photos", "documents", "ocr-jobs"]) emptyCollections.add(`/api/vehicles/test-vehicle-${index}/${resource}`);
}
const unknownRequests = new Set();
const diagnostics = { consoleErrors: [], failedRequests: [] };

const browser = await chromium.launch(process.env.RESPONSIVE_CHANNEL ? { channel: process.env.RESPONSIVE_CHANNEL } : {});
const context = await browser.newContext();
await context.addInitScript(({ routes }) => {
  for (const route of routes) localStorage.setItem(`ysheng:module-guide:v2:${encodeURIComponent("responsive-test:BossAdmin")}:${encodeURIComponent(`/${route}`)}`, "seen");
}, { routes });
// Requests never reach a real API. Mutations are deliberately rejected.
await context.route("**/api/**", async route => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const known = path in fixtures || emptyCollections.has(path);
  if (request.method() === "GET" && !known) unknownRequests.add(path);
  const status = request.method() !== "GET" ? 422 : known ? 200 : 404;
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(status === 200 ? (path in fixtures ? fixtures[path] : []) : { message: "Synthetic test response: no record was saved." }) });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") diagnostics.consoleErrors.push(message.text()); });
page.on("requestfailed", request => { if (request.failure()?.errorText !== "net::ERR_ABORTED") diagnostics.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }); });
const results = [];
async function inspect(name, width) {
  await page.waitForTimeout(400);
  const layout = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== "hidden";
    const outside = [...document.querySelectorAll("button,a,input,.ant-select,.ant-picker,.ant-form-item,.moduleCommandBar,.mobileRecordCard > *,.ant-picker-panel-container,.ant-modal-content")].filter(visible).filter(element => {
      if (!element.matches(".ant-picker-panel-container") && element.closest(".ant-table,.ant-tabs-nav-list,.ant-select-dropdown,.ant-picker-dropdown")) return false;
      const r = element.getBoundingClientRect();
      return r.width > 0 && (r.left < -1 || r.right > viewport + 1);
    }).map(element => ({ tag: element.tagName, class: element.className, text: (element.textContent ?? "").slice(0, 60), left: Math.round(element.getBoundingClientRect().left), right: Math.round(element.getBoundingClientRect().right) }));
    const overlappingSelects = [...document.querySelectorAll(".ant-select")].filter(visible).filter(element => {
      const selector = element.querySelector(".ant-select-selector");
      return selector && selector.getBoundingClientRect().bottom > element.getBoundingClientRect().bottom + 1;
    }).map(element => ({ class: element.className, height: element.getBoundingClientRect().height, selectorHeight: element.querySelector(".ant-select-selector").getBoundingClientRect().height, top: element.getBoundingClientRect().top, selectorTop: element.querySelector(".ant-select-selector").getBoundingClientRect().top }));
    return { viewport, scrollWidth: document.documentElement.scrollWidth, outside, overlappingSelects };
  });
  results.push({ name, width, ...layout, errors: errors.splice(0) });
  if ([360, 820, 1440].includes(width) || layout.outside.length || layout.overlappingSelects.length || layout.scrollWidth > layout.viewport + 1) await page.screenshot({ path: `${output}/${name}-${width}.png`, fullPage: true });
}
async function closeOverlay() {
  const close = page.locator(".ant-modal-close:visible,.ant-drawer-close:visible").last();
  if (await close.isVisible().catch(() => false)) await close.click();
  else await page.keyboard.press("Escape");
  await page.locator(".ant-modal:visible,.ant-drawer-content:visible").waitFor({ state: "hidden" });
}
try {
  for (const width of widths) {
    await page.setViewportSize({ width, height: Number(process.env.RESPONSIVE_HEIGHT ?? 900) });
    for (const route of routes) {
      await page.goto(`${baseURL}/${route}`);
      await page.locator(".moduleCommandBar").waitFor({ timeout: 30000 });
      await page.waitForLoadState("networkidle");
      await inspect(route, width);
      const checkInteractions = process.env.RESPONSIVE_INTERACTIONS === "1" || (process.env.RESPONSIVE_INTERACTIONS !== "0" && [360, 820, 1440].includes(width));
      if (checkInteractions) {
        if (width <= 1024) {
          await page.getByRole("button", { name: "Open navigation", exact: true }).click();
          await inspect(`${route}-navigation`, width);
          await closeOverlay();
        }
        if (route === "dashboard") {
          await page.locator(".dashboardAnalyticsControls .ant-select").click();
          await page.getByText("Custom dates", { exact: true }).last().click();
          await inspect("dashboard-custom-dates", width);
        }
        const range = page.locator(".ant-picker-range:visible input").first();
        if (await range.isVisible().catch(() => false)) {
          await range.click();
          await page.locator(".ant-picker-dropdown:visible").waitFor();
          await inspect(`${route}-date-picker`, width);
          const dates = page.locator(".ant-picker-dropdown:visible .ant-picker-cell-in-view");
          await dates.nth(8).click();
          await dates.nth(10).click();
          const values = await page.locator(".ant-picker-range:visible input").evaluateAll(inputs => inputs.map(input => input.value));
          if (values.some(value => !value)) throw new Error("Range picker did not retain both selected dates.");
          await page.keyboard.press("Escape");
          await inspect(`${route}-selected-dates`, width);
        }
        for (const label of ["New Vehicle", "New Supplier", "New Repair", "Manual loan record"]) {
          const button = page.getByRole("button", { name: label, exact: true });
          if (!await button.isVisible().catch(() => false)) continue;
          await button.click();
          await page.locator(".ant-modal:visible,.ant-drawer-content:visible").first().waitFor();
          await inspect(`${route}-${label.replaceAll(" ", "-")}`, width);
          if (label === "New Vehicle") {
            await page.getByRole("button", { name: "Next / 下一步", exact: true }).click();
            await page.locator(".ant-form-item-explain-error").first().waitFor();
            await inspect(`${route}-validation`, width);
          }
          await closeOverlay();
        }
        const details = page.getByRole("button", { name: route === "delivery" ? "Continue" : "Details", exact: true }).filter({ visible: true }).first();
        if (await details.isVisible().catch(() => false)) {
          await details.click();
          await page.waitForTimeout(350);
          await inspect(`${route}-details`, width);
          await closeOverlay();
        }
        if (route === "vehicles" && width <= 720) {
          const search = page.getByPlaceholder("Plate / 车牌", { exact: true }).filter({ visible: true });
          await search.fill("NO-MATCH");
          await search.press("Enter");
          await page.getByText("No vehicles match the current filters.", { exact: true }).filter({ visible: true }).waitFor();
          await inspect("vehicles-empty-search", width);
          await page.getByRole("button", { name: "Clear filters", exact: true }).filter({ visible: true }).click();
          await inspect("vehicles-cleared-search", width);
          fixtures["/api/vehicles"] = Array.from({ length: 9 }, (_, index) => ({ ...vehicle, id: `test-vehicle-${index}`, plateNumber: `TEST${String(index + 1).padStart(4, "0")}` }));
          await page.reload();
          await page.locator(".mobileRecordList .ant-pagination-next").click();
          await page.getByRole("heading", { name: "TEST0009", exact: true }).waitFor();
          await inspect("vehicles-pagination", width);
          fixtures["/api/vehicles"] = [vehicle];
        }
      }
      if (process.env.RESPONSIVE_TABS === "1" || (process.env.RESPONSIVE_TABS !== "0" && [360, 820, 1440].includes(width))) {
        const tabs = page.getByRole("tab");
        const ids = await tabs.evaluateAll(elements => elements.map(element => element.id));
        for (const [index, id] of ids.entries()) {
          const tab = page.locator(`[id="${id}"]`);
          if (!await tab.isVisible().catch(() => false)) continue;
          // Keyboard activation also covers tabs in the horizontal overflow strip.
          await tab.focus();
          await tab.press("Enter");
          if (await tab.getAttribute("aria-selected") !== "true") throw new Error(`Tab did not activate: ${id}`);
          await page.waitForLoadState("networkidle");
          await inspect(`${route}-tab-${index}`, width);
        }
      }
    }
    console.log(`Checked ${width}px (${results.length} states so far).`);
  }
} catch (error) {
  await writeFile(`${output}/failure.txt`, `${error.stack ?? error}\nBrowser errors: ${JSON.stringify(errors)}`);
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  await writeFile(`${output}/diagnostics.json`, JSON.stringify({ ...diagnostics, unknownRequests: [...unknownRequests] }, null, 2));
  await browser.close();
  server?.kill();
}
const failed = results.filter(result => result.scrollWidth > result.viewport + 1 || result.outside.length || result.overlappingSelects.length || result.errors.length);
// Existing Ant Design warnings are retained in diagnostics, not silently dropped.
const knownWarnings = new Set([
  "Warning: `disabled` should not set with empty `value`. You should set `allowEmpty` or `value` instead.",
  "Warning: Instance created by `useForm` is not connected to any Form element. Forget to pass `form` prop?"
]);
const unexpectedConsoleErrors = diagnostics.consoleErrors.filter(message => !knownWarnings.has(message));
console.log(JSON.stringify({ checks: results.length, failed, unknownRequests: [...unknownRequests], failedRequests: diagnostics.failedRequests, unexpectedConsoleErrors }, null, 2));
process.exitCode = failed.length || unknownRequests.size || diagnostics.failedRequests.length || unexpectedConsoleErrors.length ? 1 : 0;
