import { defineConfig } from "playwright/test";
import path from "node:path";

const outputDir = process.env.RESPONSIVE_OUTPUT
  ? path.resolve(process.cwd(), process.env.RESPONSIVE_OUTPUT)
  : path.resolve(process.cwd(), "test-results");
const blobDir = process.env.PLAYWRIGHT_BLOB_OUTPUT_DIR
  ? path.resolve(process.cwd(), process.env.PLAYWRIGHT_BLOB_OUTPUT_DIR)
  : path.resolve(process.cwd(), "blob-report");
const blobFile = process.env.PLAYWRIGHT_BLOB_OUTPUT_FILE
  ? path.resolve(process.cwd(), process.env.PLAYWRIGHT_BLOB_OUTPUT_FILE)
  : undefined;
const baseURL = process.env.RESPONSIVE_BASE_URL ?? "http://127.0.0.1:4176";

export default defineConfig({
  testDir: "./scripts",
  testMatch: "responsive.spec.mjs",
  outputDir,
  timeout: 180000,
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: true,
  reporter: process.env.CI
    ? [["blob", blobFile ? { outputFile: blobFile } : { outputDir: blobDir }], ["line"]]
    : [["list"]],
  use: {
    baseURL,
    browserName: "chromium",
    channel: process.env.RESPONSIVE_CHANNEL || undefined,
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "off"
  },
  webServer: process.env.RESPONSIVE_BASE_URL ? undefined : {
    command: "npm exec -- vite --host 127.0.0.1 --port 4176 --strictPort",
    cwd: process.cwd(),
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000
  }
});
