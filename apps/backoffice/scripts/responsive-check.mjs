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
fixtures["/api/dashboard/summary"].agingBuckets = [{ label: "0-30", count: 16 }, { label: "31-60", count: 1 }, { label: "61+", count: 0 }];
fixtures["/api/dashboard/summary"].aiDocumentProcessing = {
  scanCount: 8, reviewedCount: 4, comparedFieldCount: 10, correctFieldCount: 9, correctedFieldCount: 1, accuracyPercent: 90,
  lowConfidenceCount: 0, failedCount: 0, pendingReviewCount: 4, usedThisMonth: 8, monthlyRequestLimit: 100, remainingThisMonth: 92,
  categories: ["Identity card", "Vehicle ownership certificate"].map((label, index) => ({ category: index ? "Voc" : "IdentityCard", label, scanCount: 4, reviewedCount: 2, comparedFieldCount: 5, correctFieldCount: 4, correctedFieldCount: 1, accuracyPercent: 80, lowConfidenceCount: 0, failedCount: 0 }))
};
fixtures["/api/priority-actions"] = [{ type: "SettlementDue", title: "Settlement deadline due", target: "Finance", dueDate: "2026-01-01", subject: "TEST0001", amount: 20000 }];
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
// Populated paid/confirmed cards expose mobile action wrapping that empty lists cannot.
fixtures["/api/daily-spends"] = [{ id: "test-spend", description: "Electricity bill", amount: 480, dueDate: "2026-09-01", isPaid: true }];
fixtures["/api/settlement-reminders"] = [{ id: "test-settlement", vehicleId: vehicle.id, amount: 80000, deadline: "2026-09-01", isPaid: true, direction: "PaySeller" }];
fixtures["/api/purchase-invoices"] = [{ id: "test-invoice", vehicleId: vehicle.id, invoiceNumber: "TEST-PINV-2026-000002", sourceType: "OwnerAcquisition", amount: 80000, invoiceDate: "2026-09-01", purchaseDate: "2026-09-01", accountingStatus: "FinanceConfirmed", currentRevisionNumber: 1, lines: [{ lineType: "VehiclePurchase", amount: 80000 }] }];
fixtures["/api/leads"].push({ ...fixtures["/api/leads"][0], id: "test-contacted-lead", customerName: "Second Synthetic Customer", status: "Contacted", takenByUserId: "responsive-test", takenByName: "Layout Test With A Much Longer Staff Display Name" });
fixtures["/api/leads"].push({ ...fixtures["/api/leads"][1], id: "test-other-staff-lead", customerName: "Third Synthetic Customer", takenByUserId: "other-staff" });
fixtures["/api/supplier-master"] = [{ id: "test-supplier", companyName: "Synthetic supplier with a long registered name", address: "Synthetic address", phone: "0000000000", status: "Active" }];
fixtures["/api/broker-commissions"] = [{ id: "test-commission", vehicleId: vehicle.id, brokerName: "Synthetic broker", amount: 500, isPaid: false, cp58Required: true, cp58Prepared: false }];
fixtures["/api/debt-recoveries"] = [{ id: "test-debt", vehicleId: vehicle.id, customerId: "test-customer", balanceAmount: 500, status: "Open", followUpDate: "2026-09-01", notes: "Synthetic follow-up note" }];
fixtures["/api/payment-vouchers"] = [{ id: "test-voucher", vehicleId: vehicle.id, payeeName: "Synthetic payee", amount: 300, purpose: "Synthetic expense", status: "Pending", issuedDate: "2026-09-01" }];
fixtures["/api/admin/users"] = [{ id: "responsive-test", displayName: "Layout Test With A Longer Staff Name", email: "layout@example.test", roles: ["BossAdmin"], isActive: true }];
fixtures["/api/hr/staff"] = fixtures["/api/admin/users"];
fixtures["/api/hr/business-trips"] = [
  { id: "trip-approved", status: "Approved", startDate: "2099-09-20", endDate: "2099-09-20", location: "Future approved trip" },
  { id: "trip-pending", status: "Pending", startDate: "2099-09-20", endDate: "2099-09-20", location: "Future pending trip" },
  { id: "trip-past", status: "Approved", startDate: "2020-09-19", endDate: "2020-09-19", location: "Past approved trip" },
  { id: "trip-rejected", status: "Rejected", startDate: "2099-09-20", endDate: "2099-09-20", location: "Rejected trip", decisionNotes: "Synthetic rejection note" }
].map(trip => ({ staffUserId: "responsive-test", purpose: "Synthetic customer visit", isUrgentException: false, requestedAt: "2026-09-20T00:00:00Z", ...trip }));
fixtures["/api/hr/attendance"] = [{ id: "test-attendance", staffUserId: "responsive-test", attendanceDate: "2026-09-01", checkInAt: "2026-09-01T01:00:00Z", status: "Present", verificationMethod: "OfficeQr" }];
fixtures["/api/hr/leave-requests"] = [{ id: "test-leave", staffUserId: "responsive-test", type: "AnnualLeave", status: "Pending", startDate: "2026-09-01", endDate: "2026-09-02", days: 2, createdAt: "2026-09-01T00:00:00Z" }];
fixtures["/api/hr/leave-policies"] = [{ id: "test-policy", role: "Sales", annualLeaveDays: 14, medicalLeaveDays: 14 }];
fixtures["/api/hr/leave-balances"] = [{ id: "test-balance", staffUserId: "responsive-test", annualLeaveDays: 14, medicalLeaveDays: 14 }];
fixtures["/api/audit-log"] = [{ id: "test-audit", actor: "Layout Test", action: "Update", entityType: "Vehicle", entityId: vehicle.id, createdAt: "2026-09-01T00:00:00Z", summary: "Synthetic audit entry with a longer description" }];
fixtures["/api/sales/workboard"].items = [{ vehicleId: vehicle.id, plateNumber: vehicle.plateNumber, vehicleLabel: "2024 Toyota Corolla Cross Hybrid Premium", salesAgentUserId: "responsive-test", salesAgentName: "Layout Test", process: "Available", responsibleDepartment: "Sales", nextAction: "Follow up with the customer" }];
fixtures["/api/customers/profile-options"] = fixtures["/api/customers"].map(({ id, name }) => ({ id, name }));
fixtures["/api/customers/test-customer/profile"] = {
  contact: fixtures["/api/customers"][0], vehicles: [vehicle], loans: fixtures["/api/loans"], deliveries: fixtures["/api/deliveries/workboard"],
  payments: [], invoices: [{ id: "test-sales-invoice", paymentRecordId: "test-payment", vehicleId: vehicle.id, invoiceNumber: "TEST-SINV-2026-000001", invoiceDate: "2026-09-01", amount: 98000 }],
  officialReceipts: [], enquiries: fixtures["/api/leads"], missingDocuments: [{ vehicleId: vehicle.id, category: "Voc", message: "Synthetic missing vehicle ownership document" }],
  documents: [{ id: "test-document", vehicleId: vehicle.id, category: "IdentityCard", fileName: "synthetic-identity-document-with-a-long-file-name.pdf", mimeType: "application/pdf", checksum: "synthetic", uploadedBy: "Layout Test", uploadedAt: "2026-09-01T00:00:00Z" }],
  permissions: { canViewIdentity: true, canViewLoans: true, canViewDelivery: true, canViewFinance: true, canViewDocuments: true, canViewEnquiries: true }
};
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
page.setDefaultTimeout(15000);
page.setDefaultNavigationTimeout(45000);
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
    const searchGeometry = viewport <= 1024 ? [...document.querySelectorAll(".ant-input-search")].filter(visible).flatMap(search => {
      const field = search.querySelector(".ant-input-affix-wrapper") ?? search.querySelector("input.ant-input");
      const button = search.querySelector(".ant-input-search-button");
      if (!field || !button) return [];
      const a = field.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      const input = search.querySelector("input.ant-input").getBoundingClientRect();
      return Math.abs(a.top - b.top) > 2 || Math.abs(a.height - b.height) > 2 || a.height < 44 || input.top < a.top || input.bottom > a.bottom
        ? [{ placeholder: search.querySelector("input").placeholder, fieldHeight: a.height, buttonHeight: b.height, fieldTop: a.top, buttonTop: b.top }]
        : [];
    }) : [];
    const creationActions = viewport <= 1024 ? [...document.querySelectorAll(".ant-pro-card-extra .ant-btn,.tableToolbar > .ant-btn")].filter(visible).filter(button => /^(New |Prepare sales invoice|Manual loan record|Record cash handover|Record Cash Received|Generate 5-minute QR)/.test(button.textContent.trim())).map(button => {
      const box = button.getBoundingClientRect();
      const parent = button.closest(".ant-pro-card-extra,.tableToolbar").getBoundingClientRect();
      return { text: button.textContent.trim(), width: box.width, height: box.height, rightGap: parent.right - box.right, parentWidth: parent.width };
    }) : [];
    const invalidCreationActions = creationActions.filter(action => Math.abs(action.rightGap) > 2 || action.height < 44 || (action.text.length < 30 && action.parentWidth > 240 && action.width >= action.parentWidth - 2));
    const oversizedSearchForms = viewport <= 720 ? [...document.querySelectorAll(".operationsProTable .ant-pro-query-filter")].filter(visible).filter(form => form.getBoundingClientRect().height > 220).map(form => ({ height: Math.round(form.getBoundingClientRect().height), text: form.textContent.slice(0, 100) })) : [];
    const controlIssues = [];
    if (viewport <= 1024) {
      const controls = [...document.querySelectorAll(".ant-btn,.ant-radio-button-wrapper")].filter(visible);
      for (const control of controls) {
        const box = control.getBoundingClientRect();
        const walker = document.createTreeWalker(control, NodeFilter.SHOW_TEXT);
        let textNode;
        while ((textNode = walker.nextNode())) {
          if (!textNode.textContent.trim() || textNode.parentElement.closest("svg,.anticon")) continue;
          const range = document.createRange();
          range.selectNodeContents(textNode);
          if ([...range.getClientRects()].some(rect => rect.left < box.left - 2 || rect.right > box.right + 2 || rect.top < box.top - 2 || rect.bottom > box.bottom + 2)) {
            controlIssues.push({ kind: "text-outside-control", text: control.textContent.trim() });
            break;
          }
        }
      }
      const actions = [...document.querySelectorAll(".mobileRecordFooter .ant-btn,.leadMobileActions .ant-btn")].filter(visible);
      const canvas = document.createElement("canvas").getContext("2d");
      for (const action of actions) {
        const box = action.getBoundingClientRect();
        const text = action.textContent.trim();
        canvas.font = getComputedStyle(action).font;
        if (box.height < 43) controlIssues.push({ kind: "small-touch-target", text, height: box.height });
        if (text.length < 30 && box.width > Math.max(120, canvas.measureText(text).width + 48)) controlIssues.push({ kind: "stretched-action", text, width: box.width });
      }
      for (const group of [...document.querySelectorAll(".mobileRecordFooter .tableActionGroup,.leadMobileActions .leadActionGroup")].filter(visible)) {
        const buttons = [...group.querySelectorAll(".ant-btn")].filter(visible);
        if (!buttons.length) continue;
        const container = group.closest(".mobileRecordFooter,.leadMobileActions").getBoundingClientRect();
        if (Math.abs(container.right - Math.max(...buttons.map(button => button.getBoundingClientRect().right))) > 2) controlIssues.push({ kind: "actions-not-right-aligned", text: group.textContent.trim() });
      }
      for (const footer of [...document.querySelectorAll(".hrMobileActions")].filter(visible)) {
        const rows = new Map();
        for (const button of [...footer.querySelectorAll(".ant-btn")].filter(visible)) {
          const box = button.getBoundingClientRect();
          const row = Math.round(box.top);
          rows.set(row, Math.max(rows.get(row) ?? 0, box.right));
        }
        if ([...rows.values()].some(right => Math.abs(footer.getBoundingClientRect().right - right) > 2)) controlIssues.push({ kind: "hr-actions-not-right-aligned", text: footer.textContent.trim() });
      }
      for (let i = 0; i < actions.length; i++) for (let j = i + 1; j < actions.length; j++) {
        const a = actions[i].getBoundingClientRect();
        const b = actions[j].getBoundingClientRect();
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2) controlIssues.push({ kind: "overlapping-actions", text: [actions[i].textContent.trim(), actions[j].textContent.trim()] });
      }
    }
    return { viewport, scrollWidth: document.documentElement.scrollWidth, outside, overlappingSelects, searchGeometry, creationActions, invalidCreationActions, oversizedSearchForms, controlIssues };
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
async function inspectDetailTabs(route, width) {
  const overlay = page.locator(".ant-modal:visible,.ant-drawer-content:visible").last();
  if (!await overlay.isVisible().catch(() => false)) return;
  const visited = new Set();
  while (true) {
    const ids = await overlay.getByRole("tab").evaluateAll(tabs => tabs.filter(tab => tab.getClientRects().length).map(tab => tab.id));
    const id = ids.find(value => value && !visited.has(value));
    if (!id) break;
    visited.add(id);
    const tab = overlay.locator(`[id="${id}"]`);
    const label = await tab.innerText();
    await tab.focus();
    await tab.press("Enter");
    await page.waitForLoadState("networkidle");
    await inspect(`${route}-detail-tab-${visited.size}-${label.replace(/[^a-zA-Z0-9]+/g, "-")}`, width);
    if (route === "vehicles" && label === "Leads") {
      if (width <= 720) {
        const search = page.getByRole("textbox", { name: "Search leads for this vehicle", exact: true });
        await search.fill("NO-MATCH");
        await page.locator(".vehicleLeadMobileList").getByText("No leads match these filters.", { exact: true }).waitFor();
        await inspect("vehicles-leads-empty-search", width);
        await search.fill("");
        await page.locator(".vehicleLeadMobileList .mobileRecordCard").first().waitFor();
      }
      await page.locator("#vehicle-leads-card").screenshot({ path: `${output}/vehicle-leads-detail-${width}.png` });
    }
  }
}
try {
  for (const width of widths) {
    await page.setViewportSize({ width, height: Number(process.env.RESPONSIVE_HEIGHT ?? 900) });
    for (const route of routes) {
      await page.goto(`${baseURL}/${route}`);
      await page.locator(".moduleCommandBar").waitFor({ timeout: 30000 });
      await page.waitForLoadState("networkidle");
      await inspect(route, width);
      if (process.env.RESPONSIVE_NEGATIVE_CONTROL === "1" && route === "leads" && width === 360) {
        const oldStyles = await page.addStyleTag({ content: ".salesLeadViewSwitch .ant-radio-button-wrapper { height: 24px !important; min-height: 24px !important; padding-block: 0 !important; } .leadMobileActions .ant-btn { height: 22px !important; min-height: 22px !important; padding-block: 0 !important; }" });
        try {
          await inspect("negative-control-old-mobile-styles", width);
          const rejected = results.pop();
          const kinds = new Set(rejected.controlIssues.map(issue => issue.kind));
          if (!kinds.has("text-outside-control") || !kinds.has("small-touch-target")) throw new Error("Responsive guards did not reject the known broken tab/button styles.");
          diagnostics.negativeControl = "Known broken tab/button styles correctly rejected";
        } finally {
          await oldStyles.evaluate(element => element.remove());
        }
      }
      const checkInteractions = process.env.RESPONSIVE_INTERACTIONS === "1" || (process.env.RESPONSIVE_INTERACTIONS !== "0" && [360, 820, 1440].includes(width));
      if (checkInteractions) {
        if (route === "hr-salary") {
          const rowSelector = ".mobileRecordCard, .ant-table-tbody > tr";
          const tripRow = location => page.locator(rowSelector).filter({ hasText: location }).filter({ visible: true });
          const cancel = tripRow("Future approved trip").getByRole("button", { name: "Cancel / 取消", exact: true });
          await cancel.waitFor();
          if (await page.getByRole("button", { name: "Cancel / 取消", exact: true }).filter({ visible: true }).count() !== 2) throw new Error("Cancellation must appear only in eligible table/card rows, not the manager's personal strip.");
          for (const location of ["Past approved trip", "Rejected trip"]) {
            if (await tripRow(location).getByRole("button", { name: "Cancel / 取消", exact: true }).count()) throw new Error(`${location} must not offer cancellation.`);
          }
          await cancel.click();
          const confirmation = page.locator(".ant-popconfirm").filter({ visible: true });
          await confirmation.waitFor();
          await inspect("hr-trip-cancel-confirmation", width);
          await confirmation.getByRole("button", { name: "Keep / 保留", exact: true }).click();
          await confirmation.waitFor({ state: "hidden" });
          await page.locator(".ant-pro-card").filter({ has: page.getByText("Business Trip / Outstation Duty / 出差外勤", { exact: true }) }).first().screenshot({ path: `${output}/hr-trips-${width}.png` });
        }
        if (route === "leads") {
          await page.locator(".salesLeadViewSwitch .ant-radio-button-wrapper").filter({ hasText: "Cars I’m Handling" }).click();
          await page.getByText("Follow up with the customer", { exact: true }).filter({ visible: true }).first().waitFor();
          await inspect("leads-my-cars", width);
          await page.locator(".salesLeadViewSwitch .ant-radio-button-wrapper").filter({ hasText: "Leads / 客户询问" }).click();
        }
        if (width <= 1024) {
          await page.getByRole("button", { name: "Open navigation", exact: true }).click();
          await inspect(`${route}-navigation`, width);
          await closeOverlay();
        }
        if (route === "dashboard") {
          const snapshotActions = page.locator(".dashboardSnapshotActions");
          const refreshBox = await snapshotActions.getByRole("button", { name: "Refresh", exact: true }).boundingBox();
          const actionsBox = await snapshotActions.boundingBox();
          if (!refreshBox || !actionsBox || refreshBox.width > 110 || Math.abs(refreshBox.x + refreshBox.width - actionsBox.x - actionsBox.width) > 2) throw new Error("Refresh must be compact and right-aligned.");
          const agingGap = await page.locator(".dashboardAgingCard").evaluate(card => card.querySelector(".agingActionBoard").getBoundingClientRect().top - card.querySelector(".dashboardFocusQueue").getBoundingClientRect().bottom);
          if (agingGap < 10) throw new Error("Aging summary must have space before its cards.");
          for (const [name, selector] of [["snapshot", ".dashboardOverviewCard"], ["aging", ".dashboardAgingCard"], ["priority", ".dashboardPriorityCard"]]) {
            await page.locator(selector).first().screenshot({ path: `${output}/dashboard-${name}-detail-${width}.png` });
          }
          const documentSearch = page.getByRole("textbox", { name: "Search document types" });
          await documentSearch.fill("NO-MATCH");
          await page.getByText("No document types match your search.", { exact: true }).waitFor();
          await documentSearch.fill("Identity");
          await page.getByRole("cell", { name: "Identity card", exact: true }).waitFor();
          if (await page.getByRole("cell", { name: "Vehicle ownership certificate", exact: true }).count()) throw new Error("Document category search did not filter rows.");
          await inspect("dashboard-document-search", width);
          await documentSearch.locator("xpath=ancestor::*[contains(@class,'ant-pro-card-body')][1]").screenshot({ path: `${output}/dashboard-ocr-detail-${width}.png` });
          await documentSearch.fill("");
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
          if (route === "vehicles") {
            const documentsTab = page.getByRole("tab", { name: "Documents & photos", exact: true });
            await documentsTab.focus();
            await documentsTab.press("Enter");
            const vehicleTab = page.getByRole("tab", { name: "Vehicle / 车辆", exact: true });
            await vehicleTab.focus();
            await vehicleTab.press("Enter");
            await page.getByText("Saved to this vehicle / 保存至此车辆", { exact: true }).waitFor();
            const documentLayout = await page.locator(".vehicleDocumentFlow").evaluate(flow => {
              const banner = [...flow.querySelectorAll(".ant-alert")].find(element => element.textContent.includes("Saved to this vehicle"));
              const upload = [...flow.querySelectorAll(".ant-form-item")].find(element => element.textContent.includes("Document Upload"));
              return { height: banner.getBoundingClientRect().height, gap: upload.getBoundingClientRect().top - banner.getBoundingClientRect().bottom };
            });
            if (documentLayout.height > 80 || documentLayout.gap < 10) throw new Error("Document banner must be compact and separated from upload.");
            await inspect("vehicles-documents", width);
          }
          await inspectDetailTabs(route, width);
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
const failed = results.filter(result => result.scrollWidth > result.viewport + 1 || result.outside.length || result.overlappingSelects.length || result.searchGeometry.length || result.invalidCreationActions.length || result.oversizedSearchForms.length || result.controlIssues.length || result.errors.length);
// Existing Ant Design warnings are retained in diagnostics, not silently dropped.
const knownWarnings = new Set([
  "Warning: `disabled` should not set with empty `value`. You should set `allowEmpty` or `value` instead.",
  "Warning: Instance created by `useForm` is not connected to any Form element. Forget to pass `form` prop?"
]);
const unexpectedConsoleErrors = diagnostics.consoleErrors.filter(message => !knownWarnings.has(message));
console.log(JSON.stringify({ checks: results.length, failed, unknownRequests: [...unknownRequests], failedRequests: diagnostics.failedRequests, unexpectedConsoleErrors }, null, 2));
process.exitCode = failed.length || unknownRequests.size || diagnostics.failedRequests.length || unexpectedConsoleErrors.length ? 1 : 0;
