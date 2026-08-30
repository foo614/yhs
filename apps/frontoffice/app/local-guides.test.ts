import { describe, expect, it } from "vitest";
import { guideCopyForTest, localGuideMetadata, localGuidePaths } from "./local-guides";

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
    const metadata = localGuideMetadata(path, "en");

    expect(english.title).not.toBe(chinese.title);
    expect(english.answer).toContain(path === "/used-cars-under-rm30000" ? "RM30,000" : "YS Heng");
    expect(chinese.answer.length).toBeGreaterThan(20);
    expect(metadata.alternates?.canonical).toBe(`http://localhost:3000${path}`);
  });

  it("keeps the budget guide linked to the supported maximum-price filter", () => {
    expect(guideCopyForTest("/used-cars-under-rm30000", "en").primary.href).toBe("/vehicles?maxPrice=30000");
    expect(guideCopyForTest("/used-cars-under-rm30000", "zh").primary.href).toBe("/vehicles?maxPrice=30000");
  });
});
