import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyInput, formatMoneyNumber, parseMoneyInput } from "./money";

describe("money formatting", () => {
  it("groups thousands in ringgit displays", () => {
    expect(formatMoney(58000)).toBe("RM 58,000");
    expect(formatMoney(-1200000)).toBe("RM -1,200,000");
  });

  it("supports grouped numeric labels without a currency prefix", () => {
    expect(formatMoneyNumber(3200)).toBe("3,200");
  });

  it("groups editable money values without changing their numeric payload", () => {
    expect(formatMoneyInput("58000")).toBe("58,000");
    expect(parseMoneyInput("58,000")).toBe("58000");
  });
});
