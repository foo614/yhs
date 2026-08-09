import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("frontoffice robots metadata", () => {
  it("allows public indexing and explicitly allows ChatGPT search discovery", () => {
    expect(robots()).toEqual({
      rules: [
        { userAgent: "*", allow: "/" },
        { userAgent: "OAI-SearchBot", allow: "/" }
      ],
      sitemap: "http://localhost:3000/sitemap.xml"
    });
  });
});
