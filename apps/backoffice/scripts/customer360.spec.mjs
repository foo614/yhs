import { test, expect } from "playwright/test";
import { routes, widths } from "./responsive-check.mjs";

test.setTimeout(30000);
test.skip(!routes.includes("customer-360"));

// Synthetic, intercepted reads only: these cases guard against displaying the wrong customer's data.
const options = [{ id: "customer-a", name: "Synthetic Alpha", phone: "0000000001" }, { id: "customer-b", name: "Synthetic Beta", phone: "0000000002" }];
const profile = (id) => ({
  contact: options.find(option => option.id === id), vehicles: [], loans: [], deliveries: [],
  payments: [], invoices: [], officialReceipts: [], documents: [], enquiries: [], missingDocuments: [],
  permissions: { canViewIdentity: true, canViewLoans: true, canViewDelivery: true, canViewFinance: true, canViewDocuments: true, canViewEnquiries: true }
});

async function mockApi(context, handleProfile) {
  await context.addInitScript(() => {
    localStorage.setItem("ysheng:module-guide:v2:customer360-test%3ABossAdmin:%2Fcustomer-360", "seen");
  });
  await context.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() !== "GET") throw new Error("Customer 360 tests must not mutate data.");
    if (path.endsWith("/profile")) return handleProfile(route, path.split("/").at(-2));
    const data = path === "/api/auth/me" ? { isAuthenticated: true, id: "customer360-test", name: "Synthetic Staff", roles: ["BossAdmin"] }
      : path === "/api/customers/profile-options" ? options
      : path === "/api/whatsapp/assistant/connection" ? { enabled: false, state: "Disabled", invitationAvailable: false }
      : [];
    await route.fulfill({ json: data });
  });
}

test("explicit unavailable and empty customer URLs never fall back to another customer", async ({ page, context }) => {
  const requested = [];
  await mockApi(context, async (route, id) => { requested.push(id); await route.fulfill(id === "missing" ? { status: 404, json: { message: "Unavailable" } } : { json: profile(id) }); });
  for (const id of ["missing", ""]) {
    await page.goto(`/customer-360?customerId=${id}`);
    await expect(page.getByText("Customer unavailable or access denied", { exact: true })).toBeVisible();
    await expect(page.locator(".ant-descriptions")).toHaveCount(0);
  }
  expect(requested).toEqual([]);
});

test("late profile responses cannot replace the selected customer, including browser back", async ({ page, context }) => {
  let releaseAlpha;
  let alphaStarted;
  let alphaCompleted;
  const started = new Promise(resolve => { alphaStarted = resolve; });
  const release = new Promise(resolve => { releaseAlpha = resolve; });
  const completed = new Promise(resolve => { alphaCompleted = resolve; });
  await mockApi(context, async (route, id) => {
    if (id === "customer-a") { alphaStarted(); await release; }
    await route.fulfill({ json: profile(id) });
    if (id === "customer-a") alphaCompleted();
  });
  await page.goto("/customer-360?customerId=customer-a");
  await started;
  await page.getByRole("combobox", { name: "Customer profile", exact: true }).fill("Beta");
  await page.locator(".customerProfileDropdown").getByText("Synthetic Beta", { exact: true }).click();
  await expect(page.locator(".ant-descriptions")).toContainText("customer-b");
  releaseAlpha();
  await completed;
  await expect(page.locator(".ant-descriptions")).not.toContainText("customer-a");
  await page.goBack();
  await expect(page.locator(".ant-descriptions")).toContainText("customer-a");
  await expect(page.locator(".ant-descriptions")).not.toContainText("customer-b");
});

test("mismatched and access-denied responses never render a profile", async ({ page, context }) => {
  let requests = 0;
  await mockApi(context, async route => {
    requests++;
    await route.fulfill(requests === 1 ? { json: profile("customer-b") } : { status: 403, json: { message: "Access denied" } });
  });
  await page.goto("/customer-360?customerId=customer-a");
  await expect(page.getByText(/returned customer does not match/)).toBeVisible();
  await expect(page.locator(".ant-descriptions")).toHaveCount(0);
  await page.getByRole("button", { name: "Retry profile", exact: true }).click();
  await expect(page.getByText("Access denied", { exact: true })).toBeVisible();
  await expect(page.locator(".ant-descriptions")).toHaveCount(0);
});

for (const width of widths.filter(value => [360, 820, 1440].includes(value))) {
  test(`populated finance, coverage and source requirements at ${width}px`, async ({ page, context }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date("2026-10-23T16:00:00Z"));
    const populated = profile("customer-a");
    populated.vehicles = [{ id: "vehicle-a", plateNumber: "SYN1234", make: "Synthetic", model: "Family vehicle", year: 2026, status: "Available" }];
    populated.deliveries = [{ id: "delivery-active", vehicleId: "vehicle-a", status: "Scheduled", scheduledDate: "2026-11-01", pic: "Synthetic PIC", insuranceHandled: true, insurancePolicyReference: "POLICY-123", insuranceExpiryDate: "2026-10-23", roadTaxHandled: true, roadTaxReceiptReference: "ROAD-123", roadTaxExpiryDate: "2026-11-23", windscreenInsuranceHandled: true, windscreenPolicyReference: "WIND-123" }];
    populated.payments = [{ id: "payment-a", vehicleId: "vehicle-a", nettPrice: 100, status: "Pending", collectedAmount: 40, balanceAmount: 60, receivableStatus: "PartiallyPaid", createdAt: "2026-10-23T00:00:00Z" }];
    populated.officialReceipts = [
      { id: "receipt-active", paymentRecordId: "payment-a", collectionTransactionId: "collection-active", receiptNumber: "SYN-ACTIVE", amount: 40, isVoided: false, collectionStatus: "Reconciled", createdAt: "2026-10-23T00:00:00Z" },
      { id: "receipt-legacy", paymentRecordId: "payment-a", cashHandoverId: "handover-legacy", receiptNumber: "SYN-LEGACY", amount: 10, isVoided: false, createdAt: "2026-10-22T00:00:00Z" },
      { id: "receipt-void", paymentRecordId: "payment-a", collectionTransactionId: "collection-void", receiptNumber: "SYN-VOID", amount: 10, isVoided: true, collectionStatus: "Reversed", createdAt: "2026-10-21T00:00:00Z" }
    ];
    populated.missingDocuments = [
      { vehicleId: "vehicle-a", category: "Voc", message: "Loan documentation is missing Voc.", sourceModule: "Loans", sourceRecordId: "loan-active-1", isActiveBlocker: true },
      { vehicleId: "vehicle-a", category: "Voc", message: "Loan documentation is missing Voc.", sourceModule: "Loans", sourceRecordId: "loan-active-2", isActiveBlocker: true },
      { vehicleId: "vehicle-a", category: "Policy", message: "Delivery documentation is missing Policy.", sourceModule: "Delivery", sourceRecordId: "delivery-cancelled", isActiveBlocker: false }
    ];
    await mockApi(context, route => route.fulfill({ json: populated }));
    await page.goto("/customer-360?customerId=customer-a");
    const coverage = page.locator("#customer360-delivery");
    for (const value of ["POLICY-123", "ROAD-123", "WIND-123", "23 Oct 2026", "Expired", "Expiring within 30 days", "Expiry date missing"]) await expect(coverage.getByText(value, { exact: false })).toBeVisible();
    await expect(page.locator("#customer360-finance")).toContainText("Collected: RM 40.00");
    await expect(page.locator("#customer360-finance")).toContainText("Remaining: RM 60.00");
    await expect(page.locator('a[href$="/collection-transactions/collection-active/official-receipt/content"]')).toHaveCount(1);
    await expect(page.locator('a[href$="/cash-handovers/handover-legacy/official-receipt/content"]')).toHaveCount(1);
    await expect(page.locator('a[href*="collection-void"]')).toHaveCount(0);
    const active = page.locator("#customer360-missing");
    await expect(active.locator(".ant-collapse-header .ant-tag")).toHaveText("2");
    await active.locator(".ant-collapse-header").click();
    await expect(active).toContainText("loan-active-1");
    await expect(active).toContainText("loan-active-2");
    await expect(active).not.toContainText("delivery-cancelled");
    await expect(active.getByRole("button", { name: "Open loan", exact: true })).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath(`profile-${width}.png`), fullPage: true });
    await coverage.getByText("Reference: POLICY-123", { exact: true }).scrollIntoViewIfNeeded();
    if (width > 720 && width < 1025) await coverage.locator(".ant-table-content, .ant-table-body").evaluateAll(elements => {
      for (const element of elements) element.scrollLeft = element.scrollWidth;
    });
    await coverage.screenshot({ path: testInfo.outputPath(`coverage-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await active.getByRole("button", { name: "Open loan", exact: true }).nth(1).click();
    await expect(page).toHaveURL(/\/loans\?loanId=loan-active-2$/);
  });
}

test("profile retry and refresh keep the URL customer and update the successful snapshot", async ({ page, context }) => {
  let requests = 0;
  await mockApi(context, async (route, id) => {
    requests++;
    if (requests === 1) return route.fulfill({ status: 503, json: { message: "Synthetic temporary failure" } });
    await route.fulfill({ json: { ...profile(id), contact: { ...profile(id).contact, name: `Synthetic Alpha revision ${requests}` } } });
  });
  await page.goto("/customer-360?customerId=customer-a");
  await page.getByRole("button", { name: "Retry profile", exact: true }).click();
  await expect(page.locator(".ant-descriptions")).toContainText("Synthetic Alpha revision 2");
  await expect(page.getByText(/Last refreshed:/)).toBeVisible();
  await page.getByRole("button", { name: "Refresh profile", exact: true }).click();
  await expect(page.locator(".ant-descriptions")).toContainText("Synthetic Alpha revision 3");
  await expect(page).toHaveURL(/customerId=customer-a/);
});
