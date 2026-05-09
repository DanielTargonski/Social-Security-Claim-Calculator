// Top-level orchestrator: composes ssRules + taxMath + chartProjection into
// the single `computeProjection()` entry point that the React UI consumes.
// Also re-exports the lower-level functions so existing imports keep working.

import {
  FRA,
  EARNINGS_LIMIT_2026,
  retirementFactor,
  survivorFactor,
  computeEarningsTest,
  computeRecoupedFactor,
  resolveBenefits,
} from "./ssRules.js";
import {
  STANDARD_DEDUCTION_2026,
  computeTaxableSSPct,
  getMarginalRate2026,
  computeSSEffectiveTaxRate,
} from "./taxMath.js";
import { buildChartData, findBreakEvenAge } from "./chartProjection.js";

// Re-exports so call sites that imported from benefitMath.js still work.
export {
  FRA,
  EARNINGS_LIMIT_2026,
  retirementFactor,
  survivorFactor,
  computeEarningsTest,
  computeRecoupedFactor,
  resolveBenefits,
  STANDARD_DEDUCTION_2026,
  computeTaxableSSPct,
  getMarginalRate2026,
  computeSSEffectiveTaxRate,
  buildChartData,
  findBreakEvenAge,
};

// Single entry point for all derived values. Takes raw inputs, returns
// everything the UI (or a sensitivity sweep) needs. Pure: same inputs →
// same outputs.
export function computeProjection({
  mode,
  fraBenefit,
  ownBenefit,
  claimAge,
  returnRate,
  investStopAge,
  lifeExpectancy,
  grossIncome,
  autoTax,
  manualFedRate,
}) {
  const {
    earlyFactor,
    earlyMonthlyGross,
    fraMonthlyGross,
    earlyPostFRAMonthlyGross: basePostFRAMonthlyGross,
  } = resolveBenefits({ mode, fraBenefit, ownBenefit, claimAge });

  const annualEarlyGross = earlyMonthlyGross * 12;
  const earningsTestWithholding = computeEarningsTest({
    claimAge,
    grossIncome,
    annualEarlyGross,
  });
  const earlyMonthlyAfterET = (annualEarlyGross - earningsTestWithholding) / 12;

  // FRA recoup of withheld months — applies to retirement/survivor modes only
  const recoupedFactor = computeRecoupedFactor({
    mode,
    claimAge,
    earlyMonthlyGross,
    earningsTestWithholding,
  });
  const earlyPostFRAMonthlyGross =
    recoupedFactor !== null
      ? fraBenefit * recoupedFactor
      : basePostFRAMonthlyGross;

  // Tax — auto from income, or manual override.
  //
  // The combined-income tier formula (taxMath.computeTaxableSSPct) takes the
  // ssBasisAnnual that the claimant actually receives. Early and wait
  // scenarios receive different SS amounts, so they produce different
  // effective tax rates. Using a single basis (e.g. fraMonthlyGross * 12)
  // for both was a real bug — it overstated tax on the early-scenario
  // checks because the early claimant's combined income is lower than
  // wait's, which puts them in a lower taxable-SS tier and often a lower
  // marginal bracket.
  //
  // We use earlyPostFRAMonthlyGross for the early basis (the long-term
  // steady state — most years are post-FRA). For the wait basis we use
  // fraMonthlyGross since that's exactly what the wait scenario receives
  // every month from FRA onward. In switch mode and in retirement/survivor
  // without recoup, the two bases collapse and the rates are identical.
  const ssBasisAnnualEarly = earlyPostFRAMonthlyGross * 12;
  const ssBasisAnnualWait = fraMonthlyGross * 12;
  const combinedIncome = grossIncome + 0.5 * ssBasisAnnualEarly;

  const earlyTax = computeSSEffectiveTaxRate({
    autoTax,
    manualFedRate,
    ssBasisAnnual: ssBasisAnnualEarly,
    grossIncome,
  });
  const waitTax = computeSSEffectiveTaxRate({
    autoTax,
    manualFedRate,
    ssBasisAnnual: ssBasisAnnualWait,
    grossIncome,
  });

  // Headline tax fields exposed to the UI describe the user's chosen
  // (early) scenario, since that's what every other on-screen number
  // refers to. Wait-scenario tax is applied internally to fraMonthlyNet
  // but not displayed separately.
  const taxableSSPct = earlyTax.taxableSSPct;
  const fedMarginalRate = earlyTax.fedMarginalRate;
  const ssEffectiveTaxRate = earlyTax.ssEffectiveTaxRate;

  const earlyMonthlyNet = earlyMonthlyAfterET * (1 - earlyTax.ssEffectiveTaxRate);
  const earlyPostFRAMonthlyNet =
    earlyPostFRAMonthlyGross * (1 - earlyTax.ssEffectiveTaxRate);
  const fraMonthlyNet = fraMonthlyGross * (1 - waitTax.ssEffectiveTaxRate);

  const chartData = buildChartData({
    claimAge,
    investStopAge,
    lifeExpectancy,
    returnRate,
    earlyMonthlyNet,
    earlyPostFRAMonthlyNet,
    fraMonthlyNet,
  });

  const breakEvenAge = findBreakEvenAge({ chartData, claimAge, mode });

  const finalEarly = chartData[chartData.length - 1]?.early || 0;
  const finalWait = chartData[chartData.length - 1]?.wait || 0;
  const finalPot = chartData[chartData.length - 1]?.pot || 0;
  const advantage = finalEarly - finalWait;
  const potAtFRARow = chartData.find((d) => d.age >= FRA)?.pot || 0;
  const potAtStopRow = chartData.find((d) => d.age >= investStopAge)?.pot || 0;

  return {
    earlyFactor,
    earlyMonthlyGross,
    fraMonthlyGross,
    earlyPostFRAMonthlyGross,
    recoupedFactor,
    annualEarlyGross,
    earningsTestWithholding,
    combinedIncome,
    taxableSSPct,
    fedMarginalRate,
    ssEffectiveTaxRate,
    earlyMonthlyNet,
    earlyPostFRAMonthlyNet,
    fraMonthlyNet,
    chartData,
    breakEvenAge,
    finalEarly,
    finalWait,
    finalPot,
    advantage,
    potAtFRARow,
    potAtStopRow,
  };
}

// Formatters — UI-only but pure, kept here for easy testing and centralized
// reuse from both App.jsx and the tornado component.
export const fmtMoney = (v) =>
  "$" + Math.round(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

export const fmtBig = (v) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return "$" + (v / 1_000_000).toFixed(2) + "M";
  if (abs >= 1000) return "$" + (v / 1000).toFixed(0) + "K";
  return "$" + Math.round(v);
};

export const fmtAge = (v) => (v % 1 === 0 ? v + " yr" : v.toFixed(1) + " yr");

export const fmtIncome = (v) =>
  v === 0 ? "Not working" : "$" + v.toLocaleString() + "/yr";
