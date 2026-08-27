import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js");

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:3001/repairs", { waitUntil: "networkidle" });
const implementation = readFileSync("../../docs/IMPLEMENTATION.md", "utf8");
const email = implementation.match(/- Email:\s*`?([^`\r\n]+)`?/)?.[1]?.trim();
const password = implementation.match(/- Password:\s*`?([^`\r\n]+)`?/)?.[1]?.trim();
if (!email || !password) throw new Error("Local test login is not documented.");
await page.getByLabel("Work email").fill(email);
await page.getByLabel("Password").fill(password);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForLoadState("networkidle");
await page.goto("http://127.0.0.1:3001/repairs", { waitUntil: "networkidle" });
await page.screenshot({ path: "repair-page-debug.png", fullPage: false });
const details = page.getByRole("button", { name: "Details" }).first();
await details.waitFor({ state: "visible" });
await details.click();
const repairDocuments = page.getByText("Repair Documents / 整备文件", { exact: true });
await repairDocuments.waitFor({ state: "visible" });
await repairDocuments.scrollIntoViewIfNeeded();
await page.screenshot({ path: "repair-ocr-page.png", fullPage: false });
console.log("Repair OCR screenshot captured.");
await browser.close();
