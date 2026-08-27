import { describe, expect, it } from "vitest";
import { formatRinggit, formatThousands } from "./formatters";

describe("front-office money formatting", () => {
  it("groups prices with commas and always shows two decimal places", () => {
    expect(formatRinggit(58000)).toBe("RM 58,000.00");
    expect(formatThousands(120000)).toBe("120,000.00");
  });

  it("preserves cents for loan estimates", () => {
    expect(formatThousands(1234.5, { minimumFractionDigits: 2, maximumFractionDigits: 2 })).toBe("1,234.50");
  });
});
