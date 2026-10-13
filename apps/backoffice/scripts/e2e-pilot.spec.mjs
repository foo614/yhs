import { test as base, expect } from "playwright/test";
import { randomUUID } from "node:crypto";
import { attachReceipt, persistReceipt, pilotCredentials, requireLocalUrl } from "./e2e-pilot-support.mjs";

const apiBaseURL = requireLocalUrl(process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:5000", "E2E_API_BASE_URL");
const credentials = pilotCredentials();

const test = base.extend({
  receipt: async ({}, use, testInfo) => {
    const receipt = { flow: "", steps: [], failures: [] };
    try {
      await use(receipt);
    } finally {
      receipt.status = testInfo.status;
      receipt.failures.push(...testInfo.errors.map(error => error.message ?? "Test failed"));
      await attachReceipt(testInfo, receipt);
      await persistReceipt(receipt);
    }
  }
});

async function signIn(page, account) {
  await page.goto("/");
  await page.getByLabel("Work email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: /Logout$/ }).last()).toBeVisible();
}

async function apiStatus(page, route) {
  return page.evaluate(async ({ apiBaseURL: base, route }) => {
    const response = await fetch(`${base}${route}`, { credentials: "include" });
    return response.status;
  }, { apiBaseURL, route });
}

function vehicleRow(page, plate) {
  return page.locator(".ant-table-row:visible, .mobileRecordCard:visible")
    .filter({ hasText: plate })
    .first();
}

function recordUnexpectedConsoleError(receipt, message) {
  if (!/Failed to load resource: the server responded with a status of (401|403) \((Unauthorized|Forbidden)\)/.test(message)) {
    receipt.failures.push(`console: ${message}`);
  }
}

async function dismissModuleTour(page) {
  const tour = page.locator(".moduleGuideTour:visible").last();
  await tour.waitFor({ state: "visible", timeout: 2000 }).catch(() => {});
  if (await tour.isVisible().catch(() => false)) {
    await tour.locator(".ant-tour-close").click();
    await expect(tour).toBeHidden();
  }
}

test.describe("isolated real back-office pilot", () => {
  test("Boss Admin can sign in, update a vehicle, read it back, and sign out", async ({ page, receipt }) => {
    receipt.flow = "admin-login-mutation-readback-logout";
    const marker = `E2E-${Date.now()}`;
    const plate = `E${randomUUID().slice(0, 8).toUpperCase().replace(/\d/g, digit => String.fromCharCode(65 + Number(digit)))}1`;
    page.on("pageerror", error => receipt.failures.push(`pageerror: ${error.message}`));
    page.on("console", message => {
      if (message.type() === "error") recordUnexpectedConsoleError(receipt, message.text());
    });

    await test.step("real login", async () => {
      await signIn(page, credentials.admin);
      await expect.poll(() => apiStatus(page, "/api/vehicles")).toBe(200);
      receipt.steps.push("authenticated BossAdmin session");
    });

    await test.step("create isolated fixture through the actual API", async () => {
      const ownerResponse = await page.request.post(`${apiBaseURL}/api/owners`, {
        data: { name: "Synthetic E2E owner", phone: `011${String(Date.now()).slice(-8)}` }
      });
      expect(ownerResponse.status(), await ownerResponse.text()).toBe(201);
      const owner = await ownerResponse.json();
      const response = await page.request.post(`${apiBaseURL}/api/vehicles`, {
        data: { plateNumber: plate, make: "Toyota", model: "Vios", year: 2021,
          stockOwner: "YSHeng", stockLocation: "E2E pilot", status: "Available",
          ownerId: owner.id, isPublic: false, bossConfirmed: false, purchasePrice: 42000, sellingPrice: 58000 }
      });
      expect(response.status(), await response.text()).toBe(201);
      receipt.steps.push("created a dedicated synthetic vehicle with no loan");
    });

    await test.step("real UI mutation", async () => {
      await page.goto("/vehicles");
      await dismissModuleTour(page);
      await expect(vehicleRow(page, plate)).toBeVisible();
      await vehicleRow(page, plate).getByRole("button", { name: /Details/ }).click();
      const drawer = page.locator(".ant-drawer-open").last();
      await drawer.getByRole("tab", { name: "Vehicle details", exact: true }).click();
      await drawer.getByLabel("Chassis Number").fill(marker);
      const [response] = await Promise.all([
        page.waitForResponse(response => response.url().includes("/api/vehicles/") && response.request().method() === "PUT"),
        drawer.getByRole("button", { name: "Update Vehicle", exact: true }).click()
      ]);
      expect(response.status(), await response.text()).toBe(200);
      await expect(page.getByText("Vehicle record updated.", { exact: true })).toBeVisible();
      receipt.steps.push(`updated synthetic vehicle chassis marker ${marker}`);
    });

    await test.step("read persisted value after reload", async () => {
      await page.reload();
      await page.goto("/vehicles");
      await dismissModuleTour(page);
      await expect(vehicleRow(page, plate)).toBeVisible();
      await vehicleRow(page, plate).getByRole("button", { name: /Details/ }).click();
      const drawer = page.locator(".ant-drawer-open").last();
      await drawer.getByRole("tab", { name: "Vehicle details", exact: true }).click();
      await expect(drawer.getByLabel("Chassis Number")).toHaveValue(marker);
      await drawer.getByRole("button", { name: "Close", exact: true }).click();
      await expect(drawer).toBeHidden();
      receipt.steps.push("read the persisted chassis marker after page reload");
    });

    await test.step("real logout", async () => {
      await page.getByRole("button", { name: /Logout$/ }).last().click();
      await expect(page.getByText("Logged out successfully")).toBeVisible();
      await expect.poll(() => apiStatus(page, "/api/vehicles")).toBe(401);
      await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
      receipt.steps.push("logged out and returned to the sign-in screen");
    });

    expect(receipt.failures).toEqual([]);
  });

  test("Sales user is denied finance and admin API access", async ({ page, receipt }) => {
    receipt.flow = "sales-denied-finance-admin";
    page.on("pageerror", error => receipt.failures.push(`pageerror: ${error.message}`));
    page.on("console", message => {
      if (message.type() === "error") recordUnexpectedConsoleError(receipt, message.text());
    });
    await signIn(page, credentials.sales);
    await expect.poll(() => apiStatus(page, "/api/vehicles")).toBe(200);
    receipt.steps.push("authenticated Sales session");

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/vehicles$/);
    await dismissModuleTour(page);
    receipt.steps.push("admin route redirected to the first permitted module");

    await expect.poll(() => apiStatus(page, "/api/finance/vehicle-options")).toBe(403);
    await expect.poll(() => apiStatus(page, "/api/admin/users")).toBe(403);
    receipt.steps.push("server denied Finance and BossAdmin endpoints with 403");

    await page.getByRole("button", { name: /Logout$/ }).last().click();
    await expect(page.getByText("Logged out successfully")).toBeVisible();
    await expect.poll(() => apiStatus(page, "/api/vehicles")).toBe(401);
    await page.getByRole("button", { name: "Back to sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    receipt.steps.push("logged out and returned to the sign-in screen");
    expect(receipt.failures).toEqual([]);
  });
});
