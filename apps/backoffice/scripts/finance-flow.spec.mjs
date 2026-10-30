import { test, expect } from "playwright/test";
import { readFile } from "node:fs/promises";
import { fixtureTemplate, emptyCollectionTemplate } from "./responsive-check.mjs";

// Critical coverage beyond geometry: financial failures must not become empty
// registers, private file bytes must stay authenticated, and reachable footer
// saves must retain validation. Every API request is intercepted locally.
const tabs = [
  "Sales Invoices & Collections / 销售发票与收款", "Settlement / 结算",
  "Broker Commission / 经纪佣金", "Debt Recovery / 欠款追讨",
  "Approvals & Vouchers / 审核与付款凭证", "Daily Spend / 日常支出",
  "Cash Handover / Official Receipts"
];

function syntheticPdf() {
  const stream = "BT /F1 18 Tf 30 220 Td (Synthetic Finance PDF) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  let content = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(content)); content += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(content);
  content += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(content);
}

function financeFixtures() {
  const data = structuredClone(fixtureTemplate);
  const payment = {
    id: "test-payment", vehicleId: "test-vehicle", customerId: "test-customer", financeWorkflowVersion: 2,
    nettPrice: 98000, collectedAmount: 1000, balanceAmount: 97000, availableToAllocate: 97000,
    receivableStatus: "PartiallyPaid", status: "Pending", createdAt: "2026-09-01T00:00:00Z",
    invoice: { id: "test-sales-invoice", invoiceNumber: "TEST-SINV-2026-000001", amount: 98000 },
    collections: [{ id: "test-collection", paymentRecordId: "test-payment", amount: 1000, method: "BankTransfer", status: "Pending", receivedDate: "2026-09-01", createdAt: "2026-09-01T00:00:00Z", reference: "SYNTHETIC-REF" }]
  };
  data["/api/payments"] = [payment];
  data["/api/vehicles/test-vehicle/documents"] = [
    ["pdf", "Synthetic long bilingual receipt 收款凭证 and transfer confirmation 2026.pdf", "application/pdf"],
    ["image", "Synthetic receipt image 图片.png", "image/png"],
    ["unsupported", "Synthetic unsupported file.html", "text/html"]
  ].map(([id, fileName, mimeType]) => ({ id, fileName, mimeType, category: "PaymentReceipt", paymentRecordId: payment.id, collectionTransactionId: "test-collection", uploadedAt: "2026-09-01T00:00:00Z" }));
  data["/api/broker-commissions"] = [
    { id: "commission-open", vehicleId: "test-vehicle", brokerName: "Synthetic broker awaiting CP58", amount: 12345678.9, isPaid: false, cp58Required: true, cp58Prepared: false },
    { id: "commission-paid", vehicleId: "test-vehicle", brokerName: "Synthetic paid broker", amount: 500, isPaid: true, cp58Required: true, cp58Prepared: true }
  ];
  data["/api/debt-recoveries"] = [{ id: "test-debt", vehicleId: "test-vehicle", customerId: "test-customer", balanceAmount: 500, status: "Open", followUpDate: "2026-09-01", notes: "Synthetic follow-up" }];
  data["/api/daily-spends"] = [{ id: "test-spend", description: "Synthetic paid electricity bill", amount: 480, dueDate: "2026-09-01", isPaid: true }];
  data["/api/payment-vouchers"] = [{ id: "12345678-1234-1234-1234-123456789abc", vehicleId: "test-vehicle", payeeName: "Synthetic voucher payee", amount: 300, purpose: "Synthetic allowance", status: "Pending", issuedDate: "2026-09-01" }];
  data["/api/cash-handovers"] = [{ id: "test-cash", paymentRecordId: payment.id, vehicleId: "test-vehicle", customerId: "test-customer", plateNumber: "TEST1234", customerName: "Synthetic Customer", amount: 1000, collectedAt: "2026-09-01T00:00:00Z", collectedByUserId: "synthetic-sales", collectedByName: "Synthetic Sales", status: "Receipted", transactionMatches: true, officialReceiptId: "test-receipt", officialReceiptNumber: "TEST-OR-2026-000001", paymentStatus: "Reconciled" }];
  const invoice = data["/api/purchase-invoices"][0];
  invoice.currentRevision = { id: "test-revision", revisionNumber: 1, invoiceNumber: invoice.invoiceNumber, invoiceDate: "2026-09-01", purchaseDate: "2026-09-01", amount: 80000, sellerName: "Synthetic previous owner", vehiclePlateNumber: "TEST1234", vehicleDescription: "Synthetic vehicle", accountingStatus: "FinanceConfirmed", createdAt: "2026-09-01T00:00:00Z", createdBy: "Synthetic staff", lines: [{ lineType: "VehiclePurchase", description: "Synthetic vehicle purchase", amount: 80000 }] };
  data["/api/purchase-invoices/test-invoice/revisions"] = [invoice.currentRevision];
  data["/api/delivery-accounting-charges"] = [{ id: "test-charge", vehicleId: "test-vehicle", chargeType: "Insurance", providerName: "Synthetic long bilingual provider 合成测试保险供应商", invoiceDate: "2026-09-01", amount: 12345678.9, accountingStatus: "Draft" }];
  return data;
}

for (const width of [320, 820, 1440]) {
  test(`Finance file, action and failure workflows at ${width}px`, async ({ page, context, baseURL }, testInfo) => {
    if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Finance fixtures require a local server.");
    const data = financeFixtures();
    const failed = new Set();
    const writes = [];
    const unknown = new Set();
    const pdf = syntheticPdf();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMxkAAAAASUVORK5CYII=", "base64");
    let releaseDaily;
    let holdDaily = false;
    let expireDownload = false;
    await context.addInitScript(() => {
      localStorage.setItem(`ysheng:module-guide:v2:${encodeURIComponent("responsive-test:BossAdmin")}:${encodeURIComponent("/finance")}`, "seen");
      window.__financeUrls = { created: [], revoked: [] };
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = blob => { const url = create(blob); window.__financeUrls.created.push(url); return url; };
      URL.revokeObjectURL = url => { window.__financeUrls.revoked.push(url); revoke(url); };
    });
    await context.route("**/api/**", async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() !== "GET") {
        writes.push(path);
        await route.fulfill({ status: 422, json: { message: "Synthetic validation only: no record saved." } });
        return;
      }
      if (expireDownload && path === "/api/auth/me") { await route.fulfill({ status: 401, json: { message: "Synthetic session expired" } }); return; }
      if (holdDaily && path === "/api/daily-spends") await new Promise(resolve => { releaseDaily = resolve; });
      if (failed.has(path)) { await route.fulfill({ status: 503, json: { message: "Synthetic register unavailable" } }); return; }
      if (/\/(content|pdf)$/.test(path)) {
        if (expireDownload && path.includes("payment-vouchers")) { await route.fulfill({ status: 401, json: { message: "Synthetic session expired. Sign in again." } }); return; }
        const image = path.includes("/image/"), unsupported = path.includes("/unsupported/");
        // No disposition header also exercises the documented cross-origin filename fallback.
        await route.fulfill({ status: 200, contentType: image ? "image/png" : unsupported ? "text/html" : "application/pdf", body: image ? png : unsupported ? "<p>Synthetic unsupported file</p>" : pdf });
        return;
      }
      if (!(path in data) && !emptyCollectionTemplate.has(path)) unknown.add(path);
      await route.fulfill({ status: 200, json: path in data ? data[path] : [] });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseURL}/finance?tab=payments`);
    const activate = async index => {
      if (width < 768) {
        await page.locator(".responsiveSectionPicker .ant-select-selector").click();
        await page.locator(".responsiveSectionDropdown .ant-select-item-option").filter({ hasText: tabs[index] }).click();
      } else {
        const tab = page.getByRole("tab", { name: tabs[index], exact: true });
        await tab.focus(); await tab.press("Enter"); await expect(tab).toHaveAttribute("aria-selected", "true");
      }
    };
    const record = name => page.locator(width <= 720 ? ".mobileRecordCard" : ".ant-table-row").filter({ visible: true }).filter({ hasText: name }).first();
    const close = async () => { await page.locator(".ant-drawer-open .ant-drawer-close,.ant-modal-close:visible").last().click(); };
    const capture = async name => {
      await page.evaluate(async () => { await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); await Promise.all(document.getAnimations().filter(a => a.playState === "running" && Number.isFinite(a.effect?.getComputedTiming().activeDuration)).map(a => a.finished.catch(() => {}))); });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      const overlay = page.locator(".ant-drawer-open .ant-drawer-content,.ant-modal:visible").last();
      if (await overlay.isVisible().catch(() => false)) await overlay.screenshot({ path: testInfo.outputPath(`${name}.png`) });
      else await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
    };

    await record("TEST1234").getByRole("button", { name: "Details", exact: true }).click();
    const evidence = page.locator(".secureDocumentEvidence").filter({ hasText: "Synthetic long bilingual receipt" });
    await expect(evidence.getByRole("button", { name: /Preview$/ })).toBeVisible();
    await expect(page.locator(".secureDocumentEvidence iframe")).toHaveCount(0);
    await expect(page.locator(".secureDocumentThumbnail img")).toBeVisible();
    await expect(page.locator(".secureDocumentEvidence").filter({ hasText: "Synthetic unsupported" }).getByRole("button", { name: /Preview$/ })).toHaveCount(0);
    await capture("collection-details");
    await evidence.getByRole("button", { name: /Preview$/ }).click();
    const viewer = page.locator(".documentPreviewDrawer");
    await expect(viewer.locator("iframe")).toHaveAttribute("src", /^blob:/);
    expect(await viewer.locator("iframe").getAttribute("sandbox")).toBeNull();
    const privateUrl = await viewer.locator("iframe").getAttribute("src");
    await capture("uploaded-pdf-preview"); await close();
    await expect(viewer).toHaveCount(0); await close();
    await expect.poll(() => page.evaluate(url => window.__financeUrls.revoked.includes(url), privateUrl)).toBe(true);

    await activate(2);
    const commission = record("Synthetic broker awaiting CP58");
    await expect(commission.getByRole("button", { name: "Mark CP58 prepared", exact: true })).toBeEnabled();
    await expect(commission.getByRole("button", { name: "Reopen", exact: true })).toBeDisabled();
    await expect(record("Synthetic paid broker").getByRole("button", { name: "Reopen", exact: true })).toBeEnabled();
    await commission.getByRole("button", { name: "Details", exact: true }).click();
    await page.getByLabel("Broker / 经纪人", { exact: true }).fill("");
    await page.getByRole("button", { name: "Update Commission", exact: true }).click();
    await expect(page.locator(".ant-form-item-explain-error")).toBeVisible();
    await capture("commission-validation-footer"); await close();

    await activate(3);
    await expect(record("Synthetic Customer").getByRole("button", { name: "Customer 360", exact: true })).toBeEnabled();
    await expect(record("Synthetic Customer").getByRole("button", { name: "Mark followed up", exact: true })).toBeEnabled();
    await activate(5);
    await expect(record("Synthetic paid electricity bill").getByRole("button", { name: "Mark paid", exact: true })).toBeDisabled();
    await expect(record("Synthetic paid electricity bill").getByRole("button", { name: "Reopen", exact: true })).toBeEnabled();
    await activate(4);
    const voucher = record("Synthetic voucher payee");
    await expect(voucher.getByRole("button", { name: /Preview PDF$/ })).toBeVisible();
    await voucher.getByRole("button", { name: "Details", exact: true }).click();
    await expect(page.locator(".financeDetailDocuments").getByRole("button", { name: /Download PDF$/ })).toBeVisible();
    await capture("voucher-details-footer"); await close();
    const [download] = await Promise.all([page.waitForEvent("download"), voucher.getByRole("button", { name: /Download PDF$/ }).click()]);
    expect(download.suggestedFilename()).toBe("YSV-20260901-123456.pdf");
    expect((await readFile(await download.path())).equals(pdf)).toBe(true);
    await page.getByRole("button", { name: "Details", exact: true }).filter({ visible: true }).first().click();
    await expect(page.getByText("Version history / 版本记录", { exact: true })).toBeVisible();
    await capture("purchase-version-details"); await close();
    await activate(6);
    await record("Synthetic Customer").getByRole("button", { name: "Details", exact: true }).click();
    await expect(page.locator(".financeDetailDocuments").getByRole("button", { name: /Preview receipt$/ })).toBeVisible();
    await capture("cash-details-receipt"); await close();

    const failedLists = ["/api/payments", "/api/settlement-reminders", "/api/daily-spends", "/api/broker-commissions", "/api/debt-recoveries", "/api/payment-vouchers", "/api/cash-handovers", "/api/purchase-invoices", "/api/delivery-accounting-charges"];
    failedLists.forEach(path => failed.add(path));
    await page.reload();
    for (const [index, label] of [[0, "Finance records are unavailable"], [1, "Settlement records could not be loaded"], [2, "Broker commissions unavailable"], [3, "Debt recovery unavailable"], [4, "Payment vouchers unavailable"], [5, "Daily spend unavailable"], [6, "Cash custody data is unavailable"]]) {
      await activate(index);
      await expect(page.getByRole("alert").filter({ hasText: label })).toBeVisible();
      await expect(page.locator(".financeSummaryStrip")).toContainText("Unavailable");
      await expect(page.locator(".mobileRecordList").getByText(/^No .* yet\.$/)).toHaveCount(0);
      await capture(`unavailable-${index}`);
    }
    await activate(4);
    await expect(page.getByRole("alert").filter({ hasText: "Purchase invoices unavailable" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "Delivery accounting unavailable" })).toBeVisible();
    // A single pending retry must leave other successful registers accessible.
    failed.clear(); failed.add("/api/daily-spends"); await page.reload(); await activate(5);
    failed.delete("/api/daily-spends"); holdDaily = true;
    await page.getByRole("alert").filter({ hasText: "Daily spend unavailable" }).getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(() => Boolean(releaseDaily)).toBe(true);
    await activate(0); await expect(record("TEST1234").getByRole("button", { name: "Details", exact: true })).toBeVisible();
    data["/api/daily-spends"] = []; holdDaily = false; releaseDaily(); await activate(5);
    await expect(page.getByText("No daily spend records yet.", { exact: true }).filter({ visible: true })).toBeVisible();
    await capture("successful-empty-after-retry");

    expect(writes).toEqual([]); expect([...unknown]).toEqual([]);
    await activate(4); expireDownload = true;
    const downloads = []; page.on("download", file => downloads.push(file));
    await record("Synthetic voucher payee").getByRole("button", { name: /Download PDF$/ }).click();
    await expect(page.getByRole("button", { name: /^Sign in$/i })).toBeVisible();
    expect(downloads).toEqual([]);
    await capture("expired-session");
  });
}

// Legacy financial approval and reconciliation must remain reachable without
// Dashboard access, require confirmation, and send only one pending mutation.
for (const width of [320, 820, 1440]) {
  test(`Legacy payment review and reconciliation at ${width}px`, async ({ page, context, baseURL }, testInfo) => {
    page.setDefaultTimeout(15000);
    if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)) throw new Error("Use local fixtures only.");
    const data = structuredClone(fixtureTemplate);
    let role = "BossAdmin";
    let payment = { id: "test-legacy", vehicleId: "test-vehicle", nettPrice: 98000, salesPrice: 98000, status: "Disbursed", receiptNumber: "TEST-RCPT", invoiceNumber: "TEST-INV", bossChecked: false, documentsPrepared: true, checklistValidated: true, financeWorkflowVersion: 1 };
    const writes = [];
    let release;
    await context.addInitScript(() => {
      for (const role of ["BossAdmin", "Finance", "Sales"]) localStorage.setItem(`ysheng:module-guide:v2:${encodeURIComponent(`responsive-test:${role}`)}:${encodeURIComponent("/finance")}`, "seen");
    });
    await context.route("**/api/**", async route => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      if (req.method() !== "GET") {
        writes.push({ path, method: req.method(), body: req.postDataJSON() });
        if (path.endsWith("/management-review")) {
          await new Promise(resolve => { release = resolve; });
          payment = { ...payment, bossChecked: true };
        } else {
          expect(path).toBe("/api/payments/test-legacy");
          payment = req.postDataJSON();
        }
        return route.fulfill({ status: 200, json: payment });
      }
      if (path === "/api/auth/me") return route.fulfill({ status: 200, json: { isAuthenticated: true, id: "responsive-test", name: "Layout Test", roles: [role] } });
      if (path === "/api/payments") return route.fulfill({ status: 200, json: [payment] });
      return route.fulfill({ status: 200, json: data[path] ?? [] });
    });
    await page.setViewportSize({ width, height: 900 });
    const openLegacy = async () => {
      await page.goto(`${baseURL}/finance?tab=payments`);
      await page.getByRole("button", { name: /Legacy payment records/ }).click();
      await page.locator(".ant-select").filter({ has: page.getByRole("combobox", { name: "Review legacy payment record", exact: true }) }).locator(".ant-select-selector").click();
      await page.locator(".ant-select-item-option").filter({ hasText: "TEST-INV" }).click();
    };
    const drawer = page.locator(".ant-drawer-open").filter({ hasText: "Payment Details / 收款详情" });
    const confirm = page.locator(".ant-modal-confirm:visible");
    try {
      await openLegacy();
      const approve = drawer.getByRole("button", { name: "Approve Management Review", exact: true });
      await approve.click();
      await expect(confirm).toContainText("TEST1234");
      await expect(confirm).toContainText("98,000");
      await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(writes).toHaveLength(0);
      await approve.click();
      const confirmReview = confirm.getByRole("button", { name: /Approve management review/ });
      await confirmReview.click();
      await expect.poll(() => Boolean(release)).toBe(true);
      await expect(confirmReview).toHaveClass(/ant-btn-loading/);
      await confirmReview.dispatchEvent("click");
      expect(writes).toHaveLength(1);
      release();
      await expect(confirm).toBeHidden();
      await expect(drawer).toContainText("Reviewed");
      await drawer.screenshot({ path: testInfo.outputPath("legacy-reviewed.png") });

      role = "Finance";
      await openLegacy();
      await expect(drawer.getByRole("button", { name: "Approve Management Review", exact: true })).toHaveCount(0);
      await drawer.locator(".ant-form-item").filter({ has: page.locator("label").filter({ hasText: /^Status$/ }) }).locator(".ant-select-selector").click();
      await page.locator(".ant-select-item-option").filter({ hasText: /^Reconciled$/ }).click();
      await drawer.getByRole("button", { name: "Update Payment", exact: true }).click();
      await expect(confirm).toContainText("Reconcile legacy payment?");
      await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
      expect(writes).toHaveLength(1);
      await expect(drawer).toBeVisible();
      await drawer.getByRole("button", { name: "Update Payment", exact: true }).click();
      await confirm.getByRole("button", { name: "Reconcile payment", exact: true }).click();
      await expect(confirm).toBeHidden();
      expect(writes).toHaveLength(2);
      expect(writes[1]).toMatchObject({ path: "/api/payments/test-legacy", method: "PUT", body: { status: "Reconciled", bossChecked: true } });

      role = "Sales";
      await page.goto(`${baseURL}/finance?tab=payments`);
      await expect(page.getByText("Cash Handover / Official Receipts", { exact: true }).filter({ visible: true }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /Legacy payment records/ })).toHaveCount(0);
    } finally {
      release?.();
      await context.unrouteAll({ behavior: "wait" });
    }
  });
}
