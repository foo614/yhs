import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { frontofficeCopy } from "../i18n";

const contactRoot = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(contactRoot, "ContactPageClient.tsx"), "utf8");
const formSource = readFileSync(join(contactRoot, "ContactEnquiryForm.tsx"), "utf8");
const stylesSource = readFileSync(join(contactRoot, "..", "styles.css"), "utf8");

function hasExpectedContactCss(styles: string) {
  const panelRuleCount = styles.match(/\.contactEnquiryPanel\s*\{/g)?.length ?? 0;
  const breakpointStart = styles.indexOf("@media (max-width: 1120px)");
  const nextBreakpoint = styles.indexOf("@media (max-width: 760px)", breakpointStart);
  const breakpointStyles = styles.slice(breakpointStart, nextBreakpoint);

  return panelRuleCount === 2
    && breakpointStart > -1
    && nextBreakpoint > breakpointStart
    && /\.contactEnquiryPanel\s*\{[^}]*grid-template-columns:\s*1fr;/s.test(breakpointStyles);
}

describe("contact enquiry layout contract", () => {
  it("keeps one localized heading and intro while retaining privacy in the form footer", () => {
    for (const language of ["en", "zh"] as const) {
      expect(frontofficeCopy[language].contact.formTitle).toBeTruthy();
      expect(frontofficeCopy[language].contact.formIntro).toBeTruthy();
    }

    expect(pageSource.match(/t\.formTitle/g)).toHaveLength(1);
    expect(pageSource.match(/t\.formIntro/g)).toHaveLength(1);
    expect(pageSource).toContain('id="contact-enquiry-title"');
    expect(pageSource).not.toContain("<p>{t.formPrivacy}</p>");
    expect(formSource).toContain('aria-labelledby="contact-enquiry-title"');
    expect(formSource).toContain("{t.formPrivacy}");
    expect(formSource).not.toContain("leadFormHeader");
    expect(formSource).not.toMatch(/t\.formTitle|t\.formIntro/);
  });

  it("keeps the single-column breakpoint override as the last contact panel rule", () => {
    expect(hasExpectedContactCss(stylesSource)).toBe(true);
    expect(stylesSource).toContain("scroll-margin-top: 112px;");
  });
});
