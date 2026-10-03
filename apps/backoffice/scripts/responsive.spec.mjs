import { test } from "playwright/test";
import path from "node:path";
import { runResponsiveWidth, widths } from "./responsive-check.mjs";

test.describe.configure({ mode: "parallel" });

for (const width of widths) {
  test(`back-office responsive layout at ${width}px`, async ({ page, context }, testInfo) => {
    const configuredOutput = process.env.RESPONSIVE_OUTPUT
      ? path.resolve(process.cwd(), process.env.RESPONSIVE_OUTPUT, `width-${width}`)
      : testInfo.outputPath("responsive");

    await runResponsiveWidth({
      page,
      context,
      width,
      output: configuredOutput,
      visualEvidence: process.env.RESPONSIVE_VISUAL_EVIDENCE === "1"
    });
  });
}
