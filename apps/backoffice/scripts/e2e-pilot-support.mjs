import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const localHosts = new Set(["localhost", "127.0.0.1"]);

export function requireLocalUrl(value, name) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || !localHosts.has(parsed.hostname)) {
    throw new Error(`${name} must point to localhost or 127.0.0.1 for the isolated E2E pilot.`);
  }
  return value;
}

export function pilotCredentials() {
  return {
    admin: {
      email: process.env.E2E_ADMIN_EMAIL ?? "e2e-admin@ysheng.local",
      password: process.env.E2E_ADMIN_PASSWORD ?? "E2ePilot123!"
    },
    sales: {
      email: process.env.E2E_SALES_EMAIL ?? "hr-sales@ysheng.local",
      password: process.env.E2E_SALES_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "E2ePilot123!"
    }
  };
}

export async function attachReceipt(testInfo, receipt) {
  await testInfo.attach("e2e-pilot-receipt.json", {
    body: JSON.stringify(receipt, null, 2),
    contentType: "application/json"
  });
}

export async function persistReceipt(receipt) {
  const configuredOutputDir = process.env.E2E_OUTPUT_DIR ?? "artifacts/e2e-pilot";
  const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");
  const outputDir = path.isAbsolute(configuredOutputDir)
    ? configuredOutputDir
    : path.resolve(repositoryRoot, configuredOutputDir);
  const receiptDir = path.join(outputDir, "receipts");
  await mkdir(receiptDir, { recursive: true });
  await writeFile(path.join(receiptDir, `${receipt.flow}.json`), `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
}
