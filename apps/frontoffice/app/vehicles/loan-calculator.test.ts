import { describe, expect, it } from "vitest";
import { calculateFlatRateLoan } from "./loan-calculator";

describe("calculateFlatRateLoan", () => {
  it("uses the flat-rate formula for principal, interest, and monthly repayment", () => {
    const estimate = calculateFlatRateLoan({ sellingPrice: 58000, downPayment: 5800, annualRate: 3, years: 7 });

    expect(estimate.principal).toBe(52200);
    expect(estimate.totalInterest).toBe(10962);
    expect(estimate.monthlyRepayment).toBeCloseTo(751.928571, 5);
  });

  it("supports a zero-interest calculation and clamps invalid values", () => {
    const estimate = calculateFlatRateLoan({ sellingPrice: 10000, downPayment: 20000, annualRate: -1, years: 0 });

    expect(estimate).toEqual({ principal: 0, totalInterest: 0, monthlyRepayment: 0 });
  });
});
