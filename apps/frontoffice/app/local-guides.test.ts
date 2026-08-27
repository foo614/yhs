import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { legalBusinessName } from "./business";
import { hrefWithLanguage, type Language } from "./i18n";
import {
  guideCopyForTest,
  LocalGuidePage,
  localGuideMetadata,
  localGuidePaths
} from "./local-guides";

vi.mock("next/navigation", () => ({
  usePathname: () => "/used-cars-kluang",
  useSearchParams: () => new URLSearchParams()
}));

type SchemaNode = {
  "@type": string;
  [key: string]: unknown;
};

type GuideSchema = {
  "@context": string;
  "@graph": SchemaNode[];
};

type WebPageSchema = SchemaNode & {
  name: string;
  description: string;
  url: string;
  inLanguage: string;
  dateModified: string;
};

type FaqPageSchema = SchemaNode & {
  inLanguage: string;
  dateModified: string;
  mainEntity: { name: string; acceptedAnswer: { text: string } }[];
};

type BreadcrumbSchema = SchemaNode & {
  itemListElement: { name: string; item: string }[];
};

const guideLanguages = ["en", "zh"] as const;
const localizedGuideCases = localGuidePaths.flatMap((path) =>
  guideLanguages.map((language) => ({ path, language }))
);

function renderGuide(path: (typeof localGuidePaths)[number], language: Language) {
  return renderToStaticMarkup(createElement(LocalGuidePage, { path, language }));
}

function renderedSchema(html: string) {
  const match = html.match(/<script type="application\/ld\+json">(?<json>.*?)<\/script>/);
  expect(match?.groups?.json).toBeDefined();
  return JSON.parse(match!.groups!.json) as GuideSchema;
}

function schemaNode<T extends SchemaNode>(schema: GuideSchema, type: string) {
  const node = schema["@graph"].find((entry) => entry["@type"] === type);
  expect(node).toBeDefined();
  return node as T;
}

describe("local GEO guides", () => {
  it("publishes four explicit crawlable guide paths", () => {
    expect(localGuidePaths).toEqual([
      "/used-cars-kluang",
      "/used-cars-under-rm30000",
      "/car-loan-kluang",
      "/trade-in-car-kluang"
    ]);
  });

  it.each(localGuidePaths)("has unique localized metadata and answer-first copy for %s", (path) => {
    const english = guideCopyForTest(path, "en");
    const chinese = guideCopyForTest(path, "zh");
    const englishMetadata = localGuideMetadata(path, "en");
    const chineseMetadata = localGuideMetadata(path, "zh");

    expect(english.title).not.toBe(chinese.title);
    expect(english.title).toContain(legalBusinessName);
    expect(chinese.title).toContain(legalBusinessName);
    expect(english.answer).toContain(legalBusinessName);
    expect(chinese.answer).toContain(legalBusinessName);
    expect(chinese.answer.length).toBeGreaterThan(20);
    expect(englishMetadata.alternates?.canonical).toBe(`http://localhost:3000${path}`);
    expect(chineseMetadata.alternates?.canonical).toBe(`http://localhost:3000${path}?lang=zh`);
  });

  it.each(localizedGuideCases)(
    "keeps visible FAQ, breadcrumb, updated date, and references aligned with $language schema for $path",
    ({ path, language }) => {
      const copy = guideCopyForTest(path, language);
      const html = renderGuide(path, language);
      const schema = renderedSchema(html);
      const webPage = schemaNode<WebPageSchema>(schema, "WebPage");
      const faqPage = schemaNode<FaqPageSchema>(schema, "FAQPage");
      const breadcrumbs = schemaNode<BreadcrumbSchema>(schema, "BreadcrumbList");
      const expectedPageUrl = language === "zh"
        ? `http://localhost:3000${path}?lang=zh`
        : `http://localhost:3000${path}`;
      const expectedHomeUrl = language === "zh"
        ? "http://localhost:3000/?lang=zh"
        : "http://localhost:3000/";
      const expectedLanguage = language === "zh" ? "zh-Hans-MY" : "en-MY";
      const homeLabel = language === "zh" ? "首页" : "Home";

      expect(schema["@graph"].map((entry) => entry["@type"])).toEqual([
        "WebPage",
        "FAQPage",
        "BreadcrumbList"
      ]);
      expect(webPage.url).toBe(expectedPageUrl);
      expect(webPage.name).toBe(copy.heading);
      expect(webPage.description).toBe(copy.answer);
      expect(webPage.inLanguage).toBe(expectedLanguage);
      expect(webPage.dateModified).toBe("2026-08-27");
      expect(faqPage.inLanguage).toBe(expectedLanguage);
      expect(faqPage.dateModified).toBe("2026-08-27");
      expect(faqPage.mainEntity.map((entry) => ({
        question: entry.name,
        answer: entry.acceptedAnswer.text
      }))).toEqual(copy.faqs);
      expect(breadcrumbs.itemListElement.map(({ name, item }) => ({ name, item }))).toEqual([
        { name: homeLabel, item: expectedHomeUrl },
        { name: copy.kicker, item: expectedPageUrl }
      ]);

      expect(html).toContain(language === "zh" ? "最后更新" : "Last updated");
      expect(html).toMatch(/<time[^>]*datetime="2026-08-27"[^>]*>2026-08-27<\/time>/i);
      expect(html).toContain(`aria-label="${language === "zh" ? "面包屑导航" : "Breadcrumb"}"`);
      expect(html).toContain(copy.answer);
      expect(html).toContain(copy.sectionHeading);
      expect(copy.faqs).toHaveLength(2);
      for (const faq of copy.faqs) {
        expect(html).toContain(faq.question);
        expect(html).toContain(faq.answer);
      }
      for (const reference of copy.references) {
        const href = reference.href.startsWith("http")
          ? reference.href
          : hrefWithLanguage(reference.href, language);
        expect(html).toContain(reference.label);
        expect(html).toContain(`href="${href.replaceAll("&", "&amp;")}"`);
      }
    }
  );

  it("uses only the supplied official external reference URLs", () => {
    const externalReferences = new Set(
      localGuidePaths.flatMap((path) => guideLanguages.flatMap((language) =>
        guideCopyForTest(path, language).references
          .map((reference) => reference.href)
          .filter((href) => href.startsWith("http"))
      ))
    );

    expect([...externalReferences].sort()).toEqual([
      "https://www.bnm.gov.my/-/consumerguide-hpa2026",
      "https://www.jpj.gov.my/en/guide-to-voluntary-transfer-of-ownership/",
      "https://www.puspakom.com.my/transfer-of-ownership/"
    ].sort());
  });

  it("keeps the budget guide linked to the supported maximum-price filter", () => {
    expect(guideCopyForTest("/used-cars-under-rm30000", "en").primary.href).toBe("/vehicles?maxPrice=30000");
    expect(guideCopyForTest("/used-cars-under-rm30000", "zh").primary.href).toBe("/vehicles?maxPrice=30000");
  });
});
