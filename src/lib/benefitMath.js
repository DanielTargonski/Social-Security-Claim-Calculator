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
//
// `grossIncome` represents pre-FRA wage income (used for the earnings
// test and for the federal-tax combined-income calculation in pre-FRA
// years). `postFRAGrossIncome` represents post-FRA wage income — the
// earnings test no longer applies, but combined income still drives
// federal taxation of SS, so they're separate. Default to 0 (assumes
// retirement at FRA, the most common case).
export function computeProjection({
  mode,
  fraBenefit,
  ownBenefit,
  claimAge,
  returnRate,
  investStopAge,
  lifeExpectancy,
  grossIncome,
  postFRAGrossIncome = 0,
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
  // Three effective tax rates are computed because three distinct
  // scenario/period combinations exist:
  //
  //   earlyTaxPreFRA  — early scenario, pre-FRA years.
  //                     Combined income uses pre-FRA grossIncome and the
  //                     after-earnings-test SS amount (annualEarlyGross
  //                     - earningsTestWithholding).
  //   earlyTaxPostFRA — early scenario, post-FRA years.
  //                     Combined income uses postFRAGrossIncome and the
  //                     post-recoup SS amount (earlyPostFRAMonthlyGross * 12).
  //   waitTax         — wait scenario, post-FRA only (the wait curve is
  //                     zero pre-FRA). Uses postFRAGrossIncome and
  //                     fraMonthlyGross * 12.
  //
  // Using a single rate for everything (pre-fix) overtaxed the early
  // scenario whenever its combined income fell into a lower tier than
  // wait's, and overtaxed all post-FRA years for users who plan to retire
  // at FRA but still had a positive `grossIncome` in the model.
  const ssBasisAnnualEarlyPreFRA = annualEarlyGross - earningsTestWithholding;
  const ssBasisAnnualEarlyPostFRA = earlyPostFRAMonthlyGross * 12;
  const ssBasisAnnualWait = fraMonthlyGross * 12;

  const earlyTaxPreFRA = computeSSEffectiveTaxRate({
    autoTax,
    manualFedRate,
    ssBasisAnnual: ssBasisAnnualEarlyPreFRA,
    grossIncome,
  });
  const earlyTaxPostFRA = computeSSEffectiveTaxRate({
    autoTax,
    manualFedRate,
    ssBasisAnnual: ssBasisAnnualEarlyPostFRA,
    grossIncome: postFRAGrossIncome,
  });
  const waitTax = computeSSEffectiveTaxRate({
    autoTax,
    manualFedRate,
    ssBasisAnnual: ssBasisAnnualWait,
    grossIncome: postFRAGrossIncome,
  });

  // Headline tax fields exposed to the UI describe the post-FRA early
  // scenario — that's the long-term steady state for the user's chosen
  // strategy and dominates the lifetime numbers (most years are post-FRA).
  const taxableSSPct = earlyTaxPostFRA.taxableSSPct;
  const fedMarginalRate = earlyTaxPostFRA.fedMarginalRate;
  const ssEffectiveTaxRate = earlyTaxPostFRA.ssEffectiveTaxRate;
  const combinedIncome = postFRAGrossIncome + 0.5 * ssBasisAnnualEarlyPostFRA;

  const earlyMonthlyNet = earlyMonthlyAfterET * (1 - earlyTaxPreFRA.ssEffectiveTaxRate);
  const earlyPostFRAMonthlyNet =
    earlyPostFRAMonthlyGross * (1 - earlyTaxPostFRA.ssEffectiveTaxRate);
  const fraMonthlyNet = fraMonthlyGross * (1 - waitTax.ssEffectiveTaxRate);

  // Lumpy SSA earnings-test withholding parameters. SSA withholds entire
  // monthly checks at the start of each year until the projected annual
  // withholding amount is reached, then resumes paying full checks. The
  // averaged model (every month = (annualGross - withholding)/12) gives
  // the same total dollars but slightly overstates compound growth — by
  // ~1% on the lifetime pot — because contributions land "earlier" than
  // they actually do.
  //
  // Only computed when there's actual withholding to distribute. Zero or
  // null collapses to constant monthly contributions.
  const fullMonthlyPreTaxGross = earlyMonthlyGross;
  const monthsWithheldFull = fullMonthlyPreTaxGross > 0
    ? Math.floor(earningsTestWithholding / fullMonthlyPreTaxGross)
    : 0;
  const residualWithheld = earningsTestWithholding - monthsWithheldFull * fullMonthlyPreTaxGross;
  const partialMonthlyPreTaxGross = Math.max(
    0,
    fullMonthlyPreTaxGross - residualWithheld
  );
  const lumpy = earningsTestWithholding > 0
    ? {
        monthsWithheldFull,
        partialMonthlyNet:
          partialMonthlyPreTaxGross * (1 - earlyTaxPreFRA.ssEffectiveTaxRate),
      }
    : null;
  // Note: when lumpy is active, the chart's pre-FRA contributions use
  // fullMonthlyNet for non-withheld months and partialMonthlyNet for the
  // transition month. fullMonthlyNet here equals earlyMonthlyGross *
  // (1 - earlyTaxPreFRA), which is what the chart sees as its
  // `earlyMonthlyNet` argument when lumpy is null. So we override:
  const fullMonthlyNet =
    fullMonthlyPreTaxGross * (1 - earlyTaxPreFRA.ssEffectiveTaxRate);

  const chartData = buildChartData({
    claimAge,
    investStopAge,
    lifeExpectancy,
    returnRate,
    earlyMonthlyNet: lumpy ? fullMonthlyNet : earlyMonthlyNet,
    earlyPostFRAMonthlyNet,
    fraMonthlyNet,
    lumpy,
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

// Display age in years and months — matches how SSA actually prices benefits
// (every month early/delayed is its own discrete factor). The 1e-9 fudge
// guards against float-precision creep from a 1/12-stepped slider, where
// e.g. age 64 might arrive as 63.99999999. Without it Math.floor would
// underflow to 63 and Math.round would overshoot to "63 yr 12 mo".
export const fmtAge = (v) => {
  let years = Math.floor(v + 1e-9);
  let months = Math.round((v - years) * 12);
  if (months >= 12) {
    years += 1;
    months = 0;
  }
  if (months === 0) return years + " yr";
  return years + " yr " + months + " mo";
};

export const fmtIncome = (v) =>
  v === 0 ? "Not working" : "$" + v.toLocaleString() + "/yr";
