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
import {
  buildChartData,
  findBreakEvenAge,
  findCrossoverAge,
} from "./chartProjection.js";
import {
  computeMagiACA,
  computeMagiIRMAA,
  computeAnnualHealthcareCost,
  NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT,
} from "./healthcareCost.js";

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
  findCrossoverAge,
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
  // Years the claimant continues working past FRA. After (FRA + this many)
  // years their wage income drops to 0 and SS tax tiering recomputes for
  // the rest of life. Default 0 = "retire at FRA" (most realistic; older
  // versions of this model implicitly assumed indefinite post-FRA work).
  postFRAWorkYears = 0,
  autoTax,
  manualFedRate,
  investedPct = 100,
  // Share of each post-FRA "wait" check that goes into a parallel invested
  // pot for the wait+invest comparison line. 100 = invest every FRA check
  // until investStopAge; 0 = collapses to the existing `wait` cumulative
  // line (no investment effect). Defaults to 100 so the comparison is
  // always visible on first load; users dial it down if they want a
  // looser assumption.
  investedPctWait = 100,
  // Healthcare-cost modeling (OBBBA / NYC). Defaults make the math a no-op
  // (coveredElsewhere=true → zero delta) so existing call sites and tests
  // that don't pass these stay neutral. The UI passes the user's actual
  // toggle/household-size/silver-rate values.
  householdSize = 1,
  coveredElsewhere = true,
  unsubsidizedSilverAnnual = NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT,
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
  // "Retired" tax rates for the post-FRA window after the claimant stops
  // working. Combined-income tier collapses because there's no wage income
  // anymore — usually pushes SS taxation to 0% if the SS basis alone is
  // below the lower threshold ($25k single, 2026).
  const earlyTaxPostFRARetired = computeSSEffectiveTaxRate({
    autoTax,
    manualFedRate,
    ssBasisAnnual: ssBasisAnnualEarlyPostFRA,
    grossIncome: 0,
  });
  const waitTaxRetired = computeSSEffectiveTaxRate({
    autoTax,
    manualFedRate,
    ssBasisAnnual: ssBasisAnnualWait,
    grossIncome: 0,
  });

  // Headline tax fields exposed to the UI track whichever tier is actually
  // active at the user's chosen claim age — pre-FRA tier for early
  // claimants, post-FRA tier once they're at or past FRA. Mirrors the
  // earlyMonthlyNet choice below. Without this, dragging the pre-67 wage
  // slider while claiming early left the displayed federal-marginal-rate
  // and auto-tax slider untouched, because everything was hard-pinned to
  // the post-FRA tier.
  const headlineTax = claimAge >= FRA ? earlyTaxPostFRA : earlyTaxPreFRA;
  const taxableSSPct = headlineTax.taxableSSPct;
  const fedMarginalRate = headlineTax.fedMarginalRate;
  const ssEffectiveTaxRate = headlineTax.ssEffectiveTaxRate;
  const combinedIncome =
    claimAge >= FRA
      ? postFRAGrossIncome + 0.5 * ssBasisAnnualEarlyPostFRA
      : grossIncome + 0.5 * ssBasisAnnualEarlyPreFRA;

  const earlyMonthlyNetPreFRA =
    earlyMonthlyAfterET * (1 - earlyTaxPreFRA.ssEffectiveTaxRate);
  const earlyPostFRAMonthlyNet =
    earlyPostFRAMonthlyGross * (1 - earlyTaxPostFRA.ssEffectiveTaxRate);
  // For claimers at or past FRA there is no pre-FRA period — the first
  // check arrives already post-FRA. Reporting the pre-FRA-tax-tier value
  // (which is built from the pre-67 wage income) is misleading: the user
  // never receives a check at that rate, and the chart projection uses
  // earlyPostFRAMonthlyNet anyway. Mirror that here so Card 1 lines up
  // with what the projection actually computes.
  const earlyMonthlyNet =
    claimAge >= FRA ? earlyPostFRAMonthlyNet : earlyMonthlyNetPreFRA;
  const fraMonthlyNet = fraMonthlyGross * (1 - waitTax.ssEffectiveTaxRate);
  // Net checks during the "retired" portion of the post-FRA window.
  // Equal to the working versions when postFRAGrossIncome is 0 (no
  // change in the tax tier) — only diverge when the user actually
  // models post-FRA wages.
  const earlyPostFRAMonthlyNetRetired =
    earlyPostFRAMonthlyGross * (1 - earlyTaxPostFRARetired.ssEffectiveTaxRate);
  const fraMonthlyNetRetired =
    fraMonthlyGross * (1 - waitTaxRetired.ssEffectiveTaxRate);
  // Boundary age in the projection where the claimant stops working.
  // Capped at lifeExpectancy so silly slider values don't push the
  // boundary past the chart's right edge.
  const postFRAWorkEndAge = Math.min(FRA + postFRAWorkYears, lifeExpectancy);

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

  // Healthcare-cost differential between the early-claim and wait scenarios.
  // The break-even chart compares cumulative dollars from the claim decision;
  // healthcare cost paid in BOTH scenarios cancels out, so what shifts the
  // recommendation is the EXTRA cost early-claiming imposes (higher MAGI →
  // ACA cliff or IRMAA tier crossing). Compute the delta in two windows
  // (pre-FRA and post-FRA — different cost regimes) and reduce the early-
  // scenario monthly nets by delta/12. Yields a chart where the break-even
  // age and lifetime advantage reflect the OBBBA cliff exposure.
  //
  // Pre-FRA: early scenario has SS in MAGI (drives ACA cost up if pre-65,
  // IRMAA if claim age ≥ 65). Wait scenario has no SS yet.
  const magiACAEarlyPre = computeMagiACA({
    grossIncome,
    ssAnnualGross: ssBasisAnnualEarlyPreFRA,
  });
  const magiIRMAAEarlyPre = computeMagiIRMAA({
    grossIncome,
    ssAnnualGross: ssBasisAnnualEarlyPreFRA,
    taxableSSPct: earlyTaxPreFRA.taxableSSPct,
  });
  const magiACAWaitPre = computeMagiACA({ grossIncome, ssAnnualGross: 0 });
  const magiIRMAAWaitPre = computeMagiIRMAA({
    grossIncome,
    ssAnnualGross: 0,
    taxableSSPct: 0,
  });
  // Use claimAge as the representative pre-FRA age (the user's chosen entry
  // point). For claimers past 65 this drives Medicare/IRMAA; for claimers
  // 62–64 this drives ACA. The wait scenario sees the same age but with
  // ssAnnualGross=0.
  const healthcareEarlyAnnualPre = computeAnnualHealthcareCost({
    age: claimAge,
    magiACA: magiACAEarlyPre,
    magiIRMAA: magiIRMAAEarlyPre,
    householdSize,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  const healthcareWaitAnnualPre = computeAnnualHealthcareCost({
    age: claimAge,
    magiACA: magiACAWaitPre,
    magiIRMAA: magiIRMAAWaitPre,
    householdSize,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  const healthcareDeltaAnnualPre =
    healthcareEarlyAnnualPre - healthcareWaitAnnualPre;
  // Post-FRA: both scenarios are on Medicare. Wait now has SS (full FRA
  // benefit) in MAGI; early has the recouped post-FRA benefit. IRMAA tier
  // crossings in this window can favor either scenario depending on which
  // has the higher post-FRA SS.
  const magiIRMAAEarlyPost = computeMagiIRMAA({
    grossIncome: postFRAGrossIncome,
    ssAnnualGross: ssBasisAnnualEarlyPostFRA,
    taxableSSPct: earlyTaxPostFRA.taxableSSPct,
  });
  const magiIRMAAWaitPost = computeMagiIRMAA({
    grossIncome: postFRAGrossIncome,
    ssAnnualGross: ssBasisAnnualWait,
    taxableSSPct: waitTax.taxableSSPct,
  });
  const healthcareEarlyAnnualPost = computeAnnualHealthcareCost({
    age: FRA, // = 67, locked in 2026 model
    magiACA: 0, // unused at 65+
    magiIRMAA: magiIRMAAEarlyPost,
    householdSize,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  const healthcareWaitAnnualPost = computeAnnualHealthcareCost({
    age: FRA,
    magiACA: 0,
    magiIRMAA: magiIRMAAWaitPost,
    householdSize,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  const healthcareDeltaAnnualPost =
    healthcareEarlyAnnualPost - healthcareWaitAnnualPost;
  // Apply the deltas to the early-scenario monthly nets. Positive delta =
  // claiming early costs more in healthcare than waiting → reduce monthly
  // contribution. Negative delta (rare — happens when waiting pushes the
  // larger FRA benefit across an IRMAA cliff that early avoided) = bonus.
  const healthcareDeltaMonthlyPre = healthcareDeltaAnnualPre / 12;
  const healthcareDeltaMonthlyPost = healthcareDeltaAnnualPost / 12;
  const adjustedEarlyMonthlyNet = earlyMonthlyNet - healthcareDeltaMonthlyPre;
  const adjustedFullMonthlyNet = fullMonthlyNet - healthcareDeltaMonthlyPre;
  const adjustedEarlyPostFRAMonthlyNet =
    earlyPostFRAMonthlyNet - healthcareDeltaMonthlyPost;
  const adjustedEarlyPostFRAMonthlyNetRetired =
    earlyPostFRAMonthlyNetRetired - healthcareDeltaMonthlyPost;

  const chartData = buildChartData({
    claimAge,
    investStopAge,
    lifeExpectancy,
    returnRate,
    earlyMonthlyNet: lumpy ? adjustedFullMonthlyNet : adjustedEarlyMonthlyNet,
    earlyPostFRAMonthlyNet: adjustedEarlyPostFRAMonthlyNet,
    earlyPostFRAMonthlyNetRetired: adjustedEarlyPostFRAMonthlyNetRetired,
    fraMonthlyNet,
    fraMonthlyNetRetired,
    postFRAWorkEndAge,
    lumpy,
    investedFraction: investedPct / 100,
    waitInvestedFraction: investedPctWait / 100,
  });

  const breakEvenAge = findBreakEvenAge({ chartData, claimAge, mode });

  const finalEarly = chartData[chartData.length - 1]?.early || 0;
  const finalWait = chartData[chartData.length - 1]?.wait || 0;
  const finalPot = chartData[chartData.length - 1]?.pot || 0;
  const finalWaitInvested =
    chartData[chartData.length - 1]?.waitInvested || 0;
  const advantage = finalEarly - finalWait;
  // Same shape as `advantage` but vs the wait+invest scenario — gives the
  // user the "fair fight" number: how much does early still win by (or
  // lose by) when wait also invests at investedPctWait?
  const waitInvestedAdvantage = finalEarly - finalWaitInvested;
  const potAtFRARow = chartData.find((d) => d.age >= FRA)?.pot || 0;
  const potAtStopRow = chartData.find((d) => d.age >= investStopAge)?.pot || 0;

  // Dollar value of either strategy at the crossover age — they're equal
  // there by definition. Used by the SummaryCards "lines meet at $X" stat.
  const crossoverValue = breakEvenAge
    ? chartData.find((d) => d.age >= breakEvenAge)?.early ?? null
    : null;

  // Same idea, but for the early-vs-wait+invest crossover (the fair-fight
  // break-even). Null when no crossover exists (early stays ahead forever
  // in the projected range, or the mode doesn't apply).
  const waitInvestedBreakEvenAge = findCrossoverAge({
    chartData,
    claimAge,
    mode,
    leftKey: "early",
    rightKey: "waitInvested",
  });
  const waitInvestedCrossoverValue = waitInvestedBreakEvenAge
    ? chartData.find((d) => d.age >= waitInvestedBreakEvenAge)?.early ?? null
    : null;

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
    finalWaitInvested,
    advantage,
    waitInvestedAdvantage,
    potAtFRARow,
    potAtStopRow,
    crossoverValue,
    waitInvestedBreakEvenAge,
    waitInvestedCrossoverValue,
    // Healthcare-cost differential (early scenario minus wait), surfaced
    // for UI display. The chart's break-even already reflects these via
    // the adjusted monthly nets above; consumers use these for "claiming
    // early costs $X/yr extra in healthcare" copy.
    healthcareDeltaAnnualPre,
    healthcareDeltaAnnualPost,
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

// Display a duration (a length of time, not an age) in years and months.
// Differs from fmtAge by handling the "less than one year" case as bare
// months (e.g. 0.5 yr → "6 mo" rather than "0 yr 6 mo") and pluralizing
// the bare-years case ("2 yrs" not "2 yr"). The 1e-9 fudge mirrors fmtAge.
export const fmtDuration = (v) => {
  let years = Math.floor(v + 1e-9);
  let months = Math.round((v - years) * 12);
  if (months >= 12) {
    years += 1;
    months = 0;
  }
  if (years === 0 && months === 0) return "0 mo";
  if (years === 0) return months + " mo";
  if (months === 0) return years + (years === 1 ? " yr" : " yrs");
  return years + " yr " + months + " mo";
};

export const fmtIncome = (v) =>
  v === 0 ? "Not working" : "$" + v.toLocaleString() + "/yr";
