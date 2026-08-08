import { describe, expect, it } from "vitest";
import { parseMarketingMarkdown, safeMarkdownHref } from "./marketing-markdown";

describe("marketing Markdown", () => {
  it("supports headings, paragraphs, and bullet lists without interpreting raw HTML", () => {
    expect(parseMarketingMarkdown("# Ready stock\n\n<strong>Safe text</strong>\n\n- Reverse camera\n- One owner")).toEqual([
      { type: "heading", level: 2, text: "Ready stock" },
      { type: "paragraph", text: "<strong>Safe text</strong>" },
      { type: "list", items: ["Reverse camera", "One owner"] }
    ]);
  });

  it("permits only HTTPS Markdown links", () => {
    expect(safeMarkdownHref("https://example.com/viewing")).toBe("https://example.com/viewing");
    expect(safeMarkdownHref("http://example.com/viewing")).toBeUndefined();
    expect(safeMarkdownHref("javascript:alert(1)")).toBeUndefined();
  });
});
