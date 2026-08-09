import { describe, expect, it } from "vitest";
import { hrefWithLanguage } from "./i18n";

describe("hrefWithLanguage", () => {
  it("preserves an inventory price filter while applying the selected language", () => {
    expect(hrefWithLanguage("/vehicles?maxPrice=30000", "en")).toBe("/vehicles?maxPrice=30000");
    expect(hrefWithLanguage("/vehicles?maxPrice=30000", "zh")).toBe("/vehicles?maxPrice=30000&lang=zh");
  });
});
