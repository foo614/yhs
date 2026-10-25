import { test, expect } from "playwright/test";
import { fixtureTemplate, emptyCollectionTemplate } from "./responsive-check.mjs";

// Financial drill-down regression: the clicked bucket must retain all and only
// its balances, including legacy receivables hidden by the usual invoice list.
for (const width of [360, 390, 820, 1440]) {
  test(`collection ageing bucket-to-record flow at ${width}px`, async ({ page, baseURL }, testInfo) => {
    const data = structuredClone(fixtureTemplate);
    const keys = ["NotYetDue", "Overdue1To7", "Overdue8To30", "OverdueOver30", "UnknownDueDate"];
    const records = [
      { sourceType: "PaymentRecord", sourceId: "test-payment", vehicleId: "test-vehicle", amount: 12000.25, dueDate: null },
      { sourceType: "DebtRecoveryCase", sourceId: "test-debt", vehicleId: "test-vehicle", amount: 3000.50, dueDate: null },
      { sourceType: "PaymentRecord", sourceId: "legacy-payment", vehicleId: "test-vehicle", amount: 10.10, dueDate: null }
    ];
    let state = "ready", failedSource = false;
    const writes = [], unknown = [], requests = [], pageErrors = [];
    const summary = { asOfDate: "2026-10-25", timeZone: "Asia/Singapore", totalAmount: 15010.85, totalCount: 3,
      buckets: keys.map(key => ({ key, amount: key === "UnknownDueDate" ? 15010.85 : 0, count: key === "UnknownDueDate" ? 3 : 0 })) };
    data["/api/dashboard/summary"].outstandingCollection = summary.totalAmount;
    data["/api/payments"] = [
      { id: "test-payment", vehicleId: "test-vehicle", customerId: "test-customer", financeWorkflowVersion: 2,
        nettPrice: 13000.25, balanceAmount: 12000.25, collectedAmount: 1000, receivableStatus: "PartiallyPaid", status: "Pending", createdAt: "2026-09-01T00:00:00Z",
        invoice: { id: "test-sales-invoice", invoiceNumber: "SYNTHETIC-SINV-1", amount: 13000.25 }, collections: [] },
      { id: "legacy-payment", vehicleId: "test-vehicle", nettPrice: 10.10, status: "Pending", createdAt: "2026-09-01T00:00:00Z" }
    ];
    data["/api/debt-recoveries"] = [{ id: "test-debt", vehicleId: "test-vehicle", customerId: "test-customer", balanceAmount: 3000.50, status: "Open", followUpDate: "2026-01-01" }];
    page.on("pageerror", error => pageErrors.push(error.message));
    await page.addInitScript(() => {
      for (const route of ["/dashboard", "/finance"])
        localStorage.setItem(`ysheng:module-guide:v2:${encodeURIComponent("responsive-test:BossAdmin")}:${encodeURIComponent(route)}`, "seen");
    });
    await page.route("**/api/**", async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      requests.push(`${path}${url.search}`);
      if (request.method() !== "GET") { writes.push(path); await route.fulfill({ status: 400, json: { message: "No writes permitted in synthetic checks" } }); return; }
      if (path === "/api/dashboard/collection-ageing") {
        await route.fulfill(state === "error" ? { status: 503, json: { message: "Synthetic ageing unavailable" } } : { json: state === "empty" ? { ...summary, totalAmount: 0, totalCount: 0, buckets: keys.map(key => ({ key, amount: 0, count: 0 })) } : summary }); return;
      }
      if (path === "/api/finance/collection-ageing") {
        const bucket = url.searchParams.get("bucket"), selected = bucket === "UnknownDueDate" && state !== "empty" ? records : [];
        await route.fulfill(state === "records-error" ? { status: 503, json: { message: "Synthetic balances unavailable" } } : { json: { asOfDate: summary.asOfDate, bucket, totalAmount: selected.reduce((sum, record) => sum + record.amount, 0), records: selected } }); return;
      }
      if (failedSource && ["/api/payments", "/api/debt-recoveries"].includes(path)) { await route.fulfill({ status: 503, json: { message: "Synthetic source unavailable" } }); return; }
      if (!(path in data) && !emptyCollectionTemplate.has(path)) unknown.push(path);
      await route.fulfill({ json: path in data ? data[path] : [] });
    });
    await page.setViewportSize({ width, height: 1000 });
    const inspect = async name => {
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      for (const title of await page.locator(".collectionAgeing .ant-card-head-title,.collectionAgeingRecords .ant-card-head-title").all())
        expect(await title.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${name}-${width}.png`), fullPage: true });
      const section = page.locator(".collectionAgeing:visible,.collectionAgeingRecords:visible");
      if (await section.count()) await section.screenshot({ path: testInfo.outputPath(`${name}-section-${width}.png`) });
    };
    await page.goto(`${baseURL}/dashboard`);
    const panel = page.locator(".collectionAgeing");
    await expect(panel.getByText("3 balance records", { exact: false })).toBeVisible();
    await expect(panel.getByText("RM", { exact: false }).first()).toContainText("15,010.85");
    await inspect("dashboard-populated");
    const unknownLink = panel.getByRole("link", { name: /Unknown due date/ });
    await unknownLink.focus();
    await expect(unknownLink).toBeFocused();
    await unknownLink.press("Enter");
    await expect(page).toHaveURL(/tab=collection-ageing&collectionBucket=UnknownDueDate/);
    const filtered = page.locator(".collectionAgeingRecords");
    await expect(filtered.locator(".collectionAgeingRecord")).toHaveCount(3);
    await expect(filtered).toContainText("15,010.85");
    expect(requests).toContain("/api/finance/collection-ageing?bucket=UnknownDueDate");
    await inspect("records-populated");
    await filtered.getByRole("button", { name: "Details / 详情", exact: true }).nth(1).click();
    await expect(page.locator(".ant-drawer-open")).toBeVisible();
    await expect(page.locator(".ant-drawer-open")).toContainText("Debt");
    await page.locator(".ant-drawer-open .ant-drawer-close").click();
    await page.goto(`${baseURL}/finance?tab=collection-ageing&collectionBucket=UnknownDueDate`);
    await filtered.getByRole("button", { name: "Details / 详情", exact: true }).first().click();
    await expect(page.locator(".ant-drawer-open")).toBeVisible();
    await expect(page.locator(".ant-drawer-open")).toContainText("SYNTHETIC-SINV-1");
    await page.goto(`${baseURL}/finance?tab=collection-ageing&collectionBucket=UnknownDueDate`);
    await filtered.getByRole("button", { name: "Details / 详情", exact: true }).nth(2).click();
    await expect(page.locator(".ant-drawer-open")).toBeVisible();
    await page.goto(`${baseURL}/finance?tab=collection-ageing&collectionBucket=NotYetDue`);
    await expect(filtered).toContainText("No matching outstanding balances");
    await inspect("empty-bucket");
    await page.goto(`${baseURL}/finance?tab=collection-ageing&collectionBucket=invalid`);
    await expect(filtered).toContainText("Invalid collection ageing filter");
    state = "records-error";
    await page.goto(`${baseURL}/finance?tab=collection-ageing&collectionBucket=UnknownDueDate`);
    await expect(filtered).toContainText("Collection records could not be loaded");
    await inspect("records-error");
    state = "ready";
    await filtered.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(filtered.locator(".collectionAgeingRecord")).toHaveCount(3);
    failedSource = true;
    await page.reload();
    await expect(filtered.getByRole("button", { name: "Reload records", exact: true })).toHaveCount(3);
    await expect(filtered.getByRole("button", { name: "Details / 详情", exact: true }).first()).toBeDisabled();
    await inspect("source-unavailable");
    failedSource = false;
    const restoredSource = page.waitForResponse(response => new URL(response.url()).pathname === "/api/payments" && response.status() === 200);
    await filtered.getByRole("button", { name: "Reload records", exact: true }).first().click();
    await restoredSource;
    // Ant's leaving loading icon can temporarily participate in the accessible name.
    // Bind to the source row so a still-unavailable debt button cannot replace it.
    await expect(filtered.locator(".collectionAgeingRecord").first().getByRole("button", { name: /Details/ })).toBeEnabled();
    state = "error";
    await page.goto(`${baseURL}/dashboard`);
    await expect(panel).toContainText("Collection ageing could not be loaded");
    await inspect("dashboard-error");
    state = "empty";
    await panel.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(panel).toContainText("No outstanding collection balances");
    await inspect("dashboard-empty");
    expect(writes).toEqual([]);
    expect(unknown).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
}
