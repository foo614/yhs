"use client";

import { useMemo, useState } from "react";
import { calculateFlatRateLoan, DEFAULT_LOAN_RATE, DEFAULT_LOAN_YEARS } from "./loan-calculator";
import { formatThousands } from "../formatters";
import { frontofficeCopy, type Language } from "../i18n";

export function LoanCalculator({ sellingPrice, language = "en" }: { sellingPrice: number; language?: Language }) {
  const t = frontofficeCopy[language].detail.loanCalculator;
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
          <p className="loanCalculatorKicker">{t.kicker}</p>
          <h2 id="loan-calculator-title">{t.title}</h2>
          <p>{t.intro}</p>
        </div>
        <div className="loanCalculatorPrice">
          <span>{t.vehiclePrice}</span>
          <strong>{formatRinggit(sellingPrice)}</strong>
        </div>
      </div>
      <div className="loanCalculatorInputs" aria-label={t.inputsAria}>
        <label>
          <span>{t.downPayment}</span>
          <div className="loanCalculatorInputShell"><b>RM</b><input aria-label={t.downPaymentAria} type="number" min={0} max={sellingPrice} step={100} value={downPayment} onChange={(event) => setDownPayment(clamp(Number(event.target.value), 0, sellingPrice))} /></div>
        </label>
        <label>
          <span>{t.annualRate}</span>
          <div className="loanCalculatorInputShell"><input aria-label={t.annualRateAria} type="number" min={0} max={20} step={0.1} value={annualRate} onChange={(event) => setAnnualRate(clamp(Number(event.target.value), 0, 20))} /><b>%</b></div>
        </label>
        <label>
          <span>{t.tenure}</span>
          <div className="loanCalculatorInputShell"><input aria-label={t.tenureAria} type="number" min={1} max={9} step={1} value={years} onChange={(event) => setYears(Math.round(clamp(Number(event.target.value), 1, 9)))} /><b>{t.yearsUnit}</b></div>
        </label>
      </div>
      <div className="loanCalculatorResults" aria-live="polite">
        <div className="loanCalculatorMonthly">
          <span>{t.monthlyRepayment}</span>
          <strong>{formatRinggit(estimate.monthlyRepayment)}<em>{t.monthUnit}</em></strong>
          <p>{t.basis.replace("{rate}", String(annualRate)).replace("{years}", String(years))}</p>
        </div>
        <dl className="loanCalculatorBreakdown">
          <div><dt>{t.financedAmount}</dt><dd>{formatRinggit(estimate.principal)}</dd></div>
          <div><dt>{t.totalInterest}</dt><dd>{formatRinggit(estimate.totalInterest)}</dd></div>
        </dl>
      </div>
      <p className="loanCalculatorDisclosure">{t.disclosure}</p>
    </section>
  );
}

function formatRinggit(value: number) {
  return `RM ${formatThousands(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value) ? Math.min(Math.max(value, minimum), maximum) : minimum;
}
