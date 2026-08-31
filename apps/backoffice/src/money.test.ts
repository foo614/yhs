import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyInput, formatMoneyInputWithTwoDecimals, formatMoneyNumber, parseMoneyInput } from "./money";

describe("money formatting", () => {
  it("groups thousands and always shows two decimal places in ringgit displays", () => {
    expect(formatMoney(58000)).toBe("RM 58,000.00");
    expect(formatMoney(-1200000)).toBe("RM -1,200,000.00");
    expect(formatMoney(385.5)).toBe("RM 385.50");
  });

  it("supports grouped numeric labels without a currency prefix", () => {
    expect(formatMoneyNumber(3200)).toBe("3,200.00");
  });

  it("groups editable money values without changing their numeric payload", () => {
    expect(formatMoneyInput("58000")).toBe("58,000");
    expect(parseMoneyInput("58,000")).toBe("58000");
  });

  it("shows two decimals in editable OCR money fields after typing finishes", () => {
    expect(formatMoneyInputWithTwoDecimals("130")).toBe("130.00");
    expect(formatMoneyInputWithTwoDecimals("7.5")).toBe("7.50");
    expect(formatMoneyInputWithTwoDecimals("1,234")).toBe("1,234.00");
    expect(formatMoneyInputWithTwoDecimals("7", { userTyping: true, input: "7." })).toBe("7.");
  });
});
