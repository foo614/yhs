"use client";

import { useMemo, useState } from "react";
import { calculateFlatRateLoan, DEFAULT_LOAN_RATE, DEFAULT_LOAN_YEARS } from "./loan-calculator";
import { formatThousands } from "../formatters";

export function LoanCalculator({ sellingPrice }: { sellingPrice: number }) {
  const defaultDownPayment = Math.round(sellingPrice * 0.1 / 100) * 100;
  const [downPayment, setDownPayment] = useState(defaultDownPayment);
  const [annualRate, setAnnualRate] = useState(DEFAULT_LOAN_RATE);
  const [years, setYears] = useState(DEFAULT_LOAN_YEARS);
  const estimate = useMemo(
    () => calculateFlatRateLoan({ sellingPrice, downPayment, annualRate, years }),
    [annualRate, downPayment, sellingPrice, years]
  );

  return (
    <section className="loanCalculator" aria-labelledby="loan-calculator-title">
      <div className="loanCalculatorHeader">
        <div>
          <p className="loanCalculatorKicker">Estimate only</p>
          <h2 id="loan-calculator-title">Plan your monthly payment</h2>
          <p>Adjust the deposit, rate, and tenure to see an indicative flat-rate repayment.</p>
        </div>
        <div className="loanCalculatorPrice">
          <span>Vehicle price</span>
          <strong>{formatRinggit(sellingPrice)}</strong>
        </div>
      </div>
      <div className="loanCalculatorInputs" aria-label="Loan estimate inputs">
        <label>
          <span>Down payment</span>
          <div className="loanCalculatorInputShell"><b>RM</b><input aria-label="Down payment in ringgit" type="number" min={0} max={sellingPrice} step={100} value={downPayment} onChange={(event) => setDownPayment(clamp(Number(event.target.value), 0, sellingPrice))} /></div>
        </label>
        <label>
          <span>Annual rate</span>
          <div className="loanCalculatorInputShell"><input aria-label="Annual interest rate percentage" type="number" min={0} max={20} step={0.1} value={annualRate} onChange={(event) => setAnnualRate(clamp(Number(event.target.value), 0, 20))} /><b>%</b></div>
        </label>
        <label>
          <span>Tenure</span>
          <div className="loanCalculatorInputShell"><input aria-label="Loan tenure in years" type="number" min={1} max={9} step={1} value={years} onChange={(event) => setYears(Math.round(clamp(Number(event.target.value), 1, 9)))} /><b>years</b></div>
        </label>
      </div>
      <div className="loanCalculatorResults" aria-live="polite">
        <div className="loanCalculatorMonthly">
          <span>Estimated monthly repayment</span>
          <strong>{formatRinggit(estimate.monthlyRepayment)}<em>/ month</em></strong>
          <p>Based on a {annualRate}% flat rate over {years} years.</p>
        </div>
        <dl className="loanCalculatorBreakdown">
          <div><dt>Financed amount</dt><dd>{formatRinggit(estimate.principal)}</dd></div>
          <div><dt>Est. total interest</dt><dd>{formatRinggit(estimate.totalInterest)}</dd></div>
        </dl>
      </div>
      <p className="loanCalculatorDisclosure">This is an estimate, not a loan offer or approval. Bank eligibility, fees, insurance, and final instalments may differ. Enquire with us for a tailored quote.</p>
    </section>
  );
}

function formatRinggit(value: number) {
  return `RM ${formatThousands(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, minimum), maximum) : minimum;
}
