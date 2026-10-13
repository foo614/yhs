import { defineConfig } from "playwright/test";
import path from "node:path";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:4176";
const repositoryRoot = path.resolve(import.meta.dirname, "..", "..");
const configuredOutputDir = process.env.E2E_OUTPUT_DIR ?? "artifacts/e2e-pilot";
const outputDir = path.isAbsolute(configuredOutputDir)
  ? configuredOutputDir
  : path.resolve(repositoryRoot, configuredOutputDir);

function assertLocalUrl(value, name) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`${name} must use HTTP.`);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname)) {
    throw new Error(`${name} must point to localhost or 127.0.0.1.`);
  }
}

assertLocalUrl(baseURL, "E2E_BASE_URL");
assertLocalUrl(process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:5000", "E2E_API_BASE_URL");

export default defineConfig({
  testDir: "./scripts",
  testMatch: "e2e-pilot.spec.mjs",
  outputDir: path.join(outputDir, "test-results"),
  timeout: 120000,
  globalTimeout: 180000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  failOnFlakyTests: true,
  reporter: [
    ["html", { outputFolder: path.join(outputDir, "html-report"), open: "never" }],
    ["line"]
  ],
  use: {
    baseURL,
    browserName: "chromium",
    headless: true,
    actionTimeout: 10000,
    navigationTimeout: 20000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off"
  }
});
