export const DEFAULT_LOAN_RATE = 3;
export const DEFAULT_LOAN_YEARS = 7;

export type LoanEstimateInput = {
  sellingPrice: number;
  downPayment: number;
  annualRate: number;
  years: number;
};

export type LoanEstimate = {
  principal: number;
  totalInterest: number;
  monthlyRepayment: number;
};

export function calculateFlatRateLoan(input: LoanEstimateInput): LoanEstimate {
  const sellingPrice = finiteAtLeast(input.sellingPrice, 0);
  const downPayment = Math.min(finiteAtLeast(input.downPayment, 0), sellingPrice);
  const annualRate = Math.min(finiteAtLeast(input.annualRate, 0), 20);
  const years = Math.min(Math.max(Math.round(finiteAtLeast(input.years, 1)), 1), 9);
  const principal = sellingPrice - downPayment;
  const totalInterest = principal * (annualRate / 100) * years;

  return {
    principal,
    totalInterest,
    monthlyRepayment: (principal + totalInterest) / (years * 12)
  };
}

function finiteAtLeast(value: number, minimum: number) {
  return Number.isFinite(value) ? Math.max(value, minimum) : minimum;
}
