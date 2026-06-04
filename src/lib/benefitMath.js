// Top-level orchestrator: composes ssRules + taxMath + chartProjection into
// the single `computeProjection()` entry point that the React UI consumes.
// Also re-exports the lower-level functions so existing imports keep working.

import {
  FRA,
  EARNINGS_LIMIT_2026,
  EARNINGS_LIMIT_2026_FRA_YEAR,
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
  computeSeniorDeduction,
  computeWageFederalTax,
  OBBBA_SENIOR_DEDUCTION_FIRST_YEAR,
  OBBBA_SENIOR_DEDUCTION_LAST_YEAR,
} from "./taxMath.js";
import { computeStateLocalWageTax } from "./stateLocalTax.js";
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
  EARNINGS_LIMIT_2026_FRA_YEAR,
  retirementFactor,
  survivorFactor,
  computeEarningsTest,
  computeRecoupedFactor,
  resolveBenefits,
  STANDARD_DEDUCTION_2026,
  computeTaxableSSPct,
  getMarginalRate2026,
  computeSSEffectiveTaxRate,
  computeSeniorDeduction,
  computeWageFederalTax,
  OBBBA_SENIOR_DEDUCTION_FIRST_YEAR,
  OBBBA_SENIOR_DEDUCTION_LAST_YEAR,
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
  // toggle/silver-rate values. Single-filer only — the healthcareCost FPL
  // helpers stay household-size aware for a future joint-filer addition, but
  // this orchestrator always models a single filer (default household size).
  coveredElsewhere = true,
  unsubsidizedSilverAnnual = NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT,
  // Calendar year of the claim decision (today). Used to age-anchor the
  // OBBBA senior bonus deduction (available tax years 2025–2028, age 65+).
  // Default 2026 = the calculator's "live" year. The calendar year of each
  // projection age is `currentYear + (age - claimAge)`.
  currentYear = 2026,
  // State/local income-tax jurisdiction for the WAGE take-home figures
  // ("none" | "ny" | "nyc"). Display-only — never enters the break-even
  // (wages are identical in both claiming arms, so wage tax cancels).
  // Defaults to "none" so existing call sites / tests stay neutral; the UI
  // passes the user's selection (which defaults to "nyc").
  locality = "none",
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
  const fraYearEarningsTestWithholding = computeEarningsTest({
    claimAge: FRA - 1,
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
    fraYearEarningsTestWithholding,
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

  // OBBBA senior bonus deduction — applies per window when age >= 65 AND
  // the calendar year of the window falls in 2025–2028. Compute the
  // deduction once per (age, MAGI, year) tuple, then pass to each
  // computeSSEffectiveTaxRate call. The two pre-FRA scenarios (early
  // claiming pre-FRA, wait pre-FRA) use claimAge as the window's
  // representative age and currentYear as its year — matching the rest
  // of the calculator's "snapshot the window at its start" simplification.
  //
  // MAGI here is approximated as (grossIncome + taxableSSPct × SS basis),
  // which equals AGI (and AGI ≈ MAGI for filers without foreign earned
  // income or tax-exempt interest — neither modeled). This nests the
  // taxableSSPct call rather than waiting for it from the effective-rate
  // function, but stays consistent with how that function computes it.
  const taxableSSPctEarlyPre = computeTaxableSSPct({
    ssBasisAnnual: ssBasisAnnualEarlyPreFRA,
    grossIncome,
  });
  const magiEarlyPreFRA = grossIncome + taxableSSPctEarlyPre * ssBasisAnnualEarlyPreFRA;
  const seniorDeductionEarlyPreFRA = computeSeniorDeduction({
    age: claimAge,
    magi: magiEarlyPreFRA,
    taxYear: currentYear,
  });
  // Pre-FRA window, age-65+ portion. The snapshot above uses age=claimAge,
  // so claim ages under 65 silently zero out their pre-FRA deduction even
  // when the claimant ages into 65+ before FRA inside the 2025-2028 window
  // (e.g. claim at 64, still working through 67 → eligible at ages 65, 66).
  // This second snapshot pins age=65 with the same pre-FRA MAGI and anchors
  // taxYear to the claimant's 65th birthday year so the lifetime rollup can
  // credit those pre-FRA-but-65+ years. When claimAge ≥ 65 this collapses
  // back to the same value as the window-start snapshot.
  const turn65Year = currentYear + Math.max(0, 65 - claimAge);
  const seniorDeductionEarlyPreFRA65Plus = computeSeniorDeduction({
    age: 65,
    magi: magiEarlyPreFRA,
    taxYear: turn65Year,
  });

  // Post-FRA: age 67, calendar year currentYear + (67 - claimAge).
  const postFRACalendarYear = currentYear + (FRA - claimAge);
  const taxableSSPctEarlyPost = computeTaxableSSPct({
    ssBasisAnnual: ssBasisAnnualEarlyPostFRA,
    grossIncome: postFRAGrossIncome,
  });
  const magiEarlyPostFRA =
    postFRAGrossIncome + taxableSSPctEarlyPost * ssBasisAnnualEarlyPostFRA;
  const seniorDeductionEarlyPostFRA = computeSeniorDeduction({
    age: FRA, // 67
    magi: magiEarlyPostFRA,
    taxYear: postFRACalendarYear,
  });

  const taxableSSPctWait = computeTaxableSSPct({
    ssBasisAnnual: ssBasisAnnualWait,
    grossIncome: postFRAGrossIncome,
  });
  const magiWait = postFRAGrossIncome + taxableSSPctWait * ssBasisAnnualWait;
  const seniorDeductionWait = computeSeniorDeduction({
    age: FRA,
    magi: magiWait,
    taxYear: postFRACalendarYear,
  });
  // Retired variants — wages drop to $0, MAGI collapses to just taxable SS.
  // Same age and same calendar year as the working variants (we model the
  // retirement transition as happening at FRA + postFRAWorkYears, but the
  // senior-deduction window is the same).
  const taxableSSPctEarlyPostRetired = computeTaxableSSPct({
    ssBasisAnnual: ssBasisAnnualEarlyPostFRA,
    grossIncome: 0,
  });
  const magiEarlyPostFRARetired =
    taxableSSPctEarlyPostRetired * ssBasisAnnualEarlyPostFRA;
  const seniorDeductionEarlyPostFRARetired = computeSeniorDeduction({
    age: FRA,
    magi: magiEarlyPostFRARetired,
    taxYear: postFRACalendarYear,
  });
  const taxableSSPctWaitRetired = computeTaxableSSPct({
    ssBasisAnnual: ssBasisAnnualWait,
    grossIncome: 0,
  });
  const magiWaitRetired = taxableSSPctWaitRetired * ssBasisAnnualWait;
  const seniorDeductionWaitRetired = computeSeniorDeduction({
    age: FRA,
    magi: magiWaitRetired,
    taxYear: postFRACalendarYear,
  });

  const earlyTaxPreFRA = computeSSEffectiveTaxRate({
    autoTax,
    manualFedRate,
    ssBasisAnnual: ssBasisAnnualEarlyPreFRA,
    grossIncome,
    extraDeduction: seniorDeductionEarlyPreFRA,
  });
  // Same MAGI / SS basis as earlyTaxPreFRA, but plugs in the age-65+ deduction
  // snapshot so the lifetime rollup can credit pre-FRA years where the
  // claimant is 65 or 66 (claim age < 65 case). Collapses to earlyTaxPreFRA's
  // savings when claim age ≥ 65 since the underlying deduction matches.
  const earlyTaxPreFRA65Plus = computeSSEffectiveTaxRate({
    autoTax,
    manualFedRate,
    ssBasisAnnual: ssBasisAnnualEarlyPreFRA,
    grossIncome,
    extraDeduction: seniorDeductionEarlyPreFRA65Plus,
  });
  const earlyTaxPostFRA = computeSSEffectiveTaxRate({
    autoTax,
    manualFedRate,
    ssBasisAnnual: ssBasisAnnualEarlyPostFRA,
    grossIncome: postFRAGrossIncome,
    extraDeduction: seniorDeductionEarlyPostFRA,
  });
  const waitTax = computeSSEffectiveTaxRate({
    autoTax,
    manualFedRate,
    ssBasisAnnual: ssBasisAnnualWait,
    grossIncome: postFRAGrossIncome,
    extraDeduction: seniorDeductionWait,
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
    extraDeduction: seniorDeductionEarlyPostFRARetired,
  });
  const waitTaxRetired = computeSSEffectiveTaxRate({
    autoTax,
    manualFedRate,
    ssBasisAnnual: ssBasisAnnualWait,
    grossIncome: 0,
    extraDeduction: seniorDeductionWaitRetired,
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
  const makeLumpySchedule = (annualWithholding) => {
    if (annualWithholding <= 0 || fullMonthlyPreTaxGross <= 0) return null;
    const monthsWithheldFull = Math.floor(
      annualWithholding / fullMonthlyPreTaxGross
    );
    const residualWithheld =
      annualWithholding - monthsWithheldFull * fullMonthlyPreTaxGross;
    const partialMonthlyPreTaxGross = Math.max(
      0,
      fullMonthlyPreTaxGross - residualWithheld
    );
    return {
      monthsWithheldFull,
      partialMonthlyNet:
        partialMonthlyPreTaxGross * (1 - earlyTaxPreFRA.ssEffectiveTaxRate),
    };
  };
  const lowerLimitLumpy = makeLumpySchedule(earningsTestWithholding);
  const fraYearLumpy = makeLumpySchedule(fraYearEarningsTestWithholding);
  const lumpy =
    lowerLimitLumpy || fraYearLumpy
      ? {
          lower: lowerLimitLumpy,
          fraYear: fraYearLumpy,
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
    // MSP (65+ only) tests against gross-SS income, not taxable-SS MAGI.
    mspIncome: grossIncome + ssBasisAnnualEarlyPreFRA,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  const healthcareWaitAnnualPre = computeAnnualHealthcareCost({
    age: claimAge,
    magiACA: magiACAWaitPre,
    magiIRMAA: magiIRMAAWaitPre,
    mspIncome: grossIncome, // wait scenario has no SS yet pre-FRA
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  const healthcareDeltaAnnualPre =
    healthcareEarlyAnnualPre - healthcareWaitAnnualPre;
  // The pre-FRA window straddles Medicare eligibility (65) for anyone claiming
  // before 65: ages claimAge-65 are on the ACA (priced above at age=claimAge),
  // but ages 65-FRA are on Medicare. Pricing those 65/66 years as ACA (the old
  // single-snapshot behavior) materially overstated the early-claim healthcare
  // drag, since the ACA cliff premium ($9,679/yr) dwarfs Medicare base + any
  // IRMAA. Recompute the SAME pre-FRA income picture (early still on its
  // reduced pre-FRA benefit; wait still has no SS yet) but force Medicare
  // pricing with age=65. When claimAge >= 65 this collapses to the same value
  // as healthcareDeltaAnnualPre (both are already Medicare), so the split is a
  // no-op there.
  const healthcareEarlyAnnualPre65to67 = computeAnnualHealthcareCost({
    age: 65,
    magiACA: 0, // unused at 65+
    magiIRMAA: magiIRMAAEarlyPre,
    mspIncome: grossIncome + ssBasisAnnualEarlyPreFRA,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  const healthcareWaitAnnualPre65to67 = computeAnnualHealthcareCost({
    age: 65,
    magiACA: 0,
    magiIRMAA: magiIRMAAWaitPre,
    mspIncome: grossIncome, // wait scenario has no SS yet pre-FRA
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  const healthcareDeltaAnnualPre65to67 =
    healthcareEarlyAnnualPre65to67 - healthcareWaitAnnualPre65to67;
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
    // MSP test: post-67 wage + GROSS recouped SS (not the taxable portion).
    mspIncome: postFRAGrossIncome + ssBasisAnnualEarlyPostFRA,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  const healthcareWaitAnnualPost = computeAnnualHealthcareCost({
    age: FRA,
    magiACA: 0,
    magiIRMAA: magiIRMAAWaitPost,
    mspIncome: postFRAGrossIncome + ssBasisAnnualWait,
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
  const healthcareDeltaMonthlyPre65to67 = healthcareDeltaAnnualPre65to67 / 12;
  const healthcareDeltaMonthlyPost = healthcareDeltaAnnualPost / 12;
  // Two pre-FRA nets: pre-65 carries the ACA delta, 65-to-FRA carries the
  // Medicare/IRMAA delta. buildChartData switches between them at age 65.
  const adjustedEarlyMonthlyNet = earlyMonthlyNet - healthcareDeltaMonthlyPre;
  const adjustedEarlyMonthlyNet65Plus =
    earlyMonthlyNet - healthcareDeltaMonthlyPre65to67;
  const adjustedFullMonthlyNet = fullMonthlyNet - healthcareDeltaMonthlyPre;
  const adjustedFullMonthlyNet65Plus =
    fullMonthlyNet - healthcareDeltaMonthlyPre65to67;
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
    earlyMonthlyNet65Plus: lumpy
      ? adjustedFullMonthlyNet65Plus
      : adjustedEarlyMonthlyNet65Plus,
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

  // OBBBA senior bonus deduction rollup for the UI. The two scenarios diverge:
  // pre-FRA the early-claim scenario has more taxable income (and a different
  // deduction phase-out point) than the wait scenario; post-FRA both scenarios
  // are collecting, but at different amounts. Surface both per-window and a
  // lifetime total so the summary card can show "saves $X/yr × N years".
  //
  // Active-year counts: the deduction applies in calendar years 2025–2028
  // ONLY if the claimant is age 65+ in that year. Walk each scenario's
  // timeline year-by-year and count the qualifying years.
  const seniorEligibleYearsScenario = (scenarioClaimAge, startCollecting) => {
    let count = 0;
    const collectingFrom = Math.max(scenarioClaimAge, 65); // ineligible <65
    const projectionEnd = lifeExpectancy;
    const ageAtStart = Math.max(collectingFrom, startCollecting);
    for (let age = Math.ceil(ageAtStart); age <= projectionEnd; age++) {
      const calendarYear = currentYear + (age - claimAge);
      if (
        calendarYear >= OBBBA_SENIOR_DEDUCTION_FIRST_YEAR &&
        calendarYear <= OBBBA_SENIOR_DEDUCTION_LAST_YEAR
      ) {
        count++;
      }
    }
    return count;
  };
  // Early-claim scenario: collects from claimAge onward.
  const earlyEligibleYears = seniorEligibleYearsScenario(claimAge, claimAge);
  // Wait scenario: collects from FRA onward.
  const waitEligibleYears = seniorEligibleYearsScenario(claimAge, FRA);

  // Per-year savings in each window (already computed via
  // computeSSEffectiveTaxRate's extraDeductionDollarSavings):
  //   earlyTaxPreFRA.extraDeductionDollarSavings    — early, claim age → 67
  //   earlyTaxPostFRA.extraDeductionDollarSavings   — early, 67+ working
  //   waitTax.extraDeductionDollarSavings           — wait, 67+ working
  //   earlyTaxPostFRARetired.extraDeductionDollarSavings — early, 67+ retired
  //   waitTaxRetired.extraDeductionDollarSavings    — wait, 67+ retired
  //
  // For the headline display, use the post-FRA value because (a) the wait
  // scenario only collects post-FRA, and (b) at 67 the deduction is in its
  // window for the most age-relevant scenario. The pre-FRA case (claimAge
  // 65 or 66) is reported separately so the user sees both regimes when
  // they apply.
  const seniorDeductionPreFRA = earlyTaxPreFRA.extraDeduction || 0;
  const seniorDeductionPostFRA = earlyTaxPostFRA.extraDeduction || 0;
  const seniorDeductionWaitAmt = waitTax.extraDeduction || 0;
  const seniorDeductionAnnualSavingsEarlyPre =
    earlyTaxPreFRA.extraDeductionDollarSavings || 0;
  const seniorDeductionAnnualSavingsEarlyPre65Plus =
    earlyTaxPreFRA65Plus.extraDeductionDollarSavings || 0;
  const seniorDeductionPreFRA65PlusAmt =
    earlyTaxPreFRA65Plus.extraDeduction || 0;
  const seniorDeductionAnnualSavingsEarlyPost =
    earlyTaxPostFRA.extraDeductionDollarSavings || 0;
  const seniorDeductionAnnualSavingsWait =
    waitTax.extraDeductionDollarSavings || 0;
  // Lifetime savings for each scenario, summed across all qualifying years.
  // Pre-FRA years use the pre-FRA savings; post-FRA years use the post-FRA
  // (working) variant. We approximate by treating the early scenario as
  // entirely "working" through FRA + postFRAWorkYears, then retired after.
  const earlyPostFRARetiredAge = Math.min(FRA + postFRAWorkYears, lifeExpectancy);
  let seniorDeductionLifetimeEarly = 0;
  for (let age = Math.ceil(claimAge); age <= lifeExpectancy; age++) {
    if (age < 65) continue;
    const calendarYear = currentYear + (age - claimAge);
    if (
      calendarYear < OBBBA_SENIOR_DEDUCTION_FIRST_YEAR ||
      calendarYear > OBBBA_SENIOR_DEDUCTION_LAST_YEAR
    )
      continue;
    if (age < FRA) {
      // Use the age-65+ snapshot's savings here. The window-start snapshot
      // (earlyPre) is zero when claimAge < 65 because its age gate fails;
      // using it would silently drop legitimate 65/66 eligible years from
      // the lifetime total.
      seniorDeductionLifetimeEarly += seniorDeductionAnnualSavingsEarlyPre65Plus;
    } else if (age <= earlyPostFRARetiredAge) {
      seniorDeductionLifetimeEarly += seniorDeductionAnnualSavingsEarlyPost;
    } else {
      seniorDeductionLifetimeEarly +=
        earlyTaxPostFRARetired.extraDeductionDollarSavings || 0;
    }
  }
  let seniorDeductionLifetimeWait = 0;
  for (let age = FRA; age <= lifeExpectancy; age++) {
    if (age < 65) continue;
    const calendarYear = currentYear + (age - claimAge);
    if (
      calendarYear < OBBBA_SENIOR_DEDUCTION_FIRST_YEAR ||
      calendarYear > OBBBA_SENIOR_DEDUCTION_LAST_YEAR
    )
      continue;
    if (age <= earlyPostFRARetiredAge) {
      seniorDeductionLifetimeWait += seniorDeductionAnnualSavingsWait;
    } else {
      seniorDeductionLifetimeWait +=
        waitTaxRetired.extraDeductionDollarSavings || 0;
    }
  }

  // ---- Wage take-home (display-only; never enters the break-even) ----
  // Federal tax on the wage modeled as the bottom of the bracket stack (the
  // taxable-SS slice sits on top — see computeWageFederalTax), plus NY/NYC
  // state/city tax on the wage. NY excludes Social Security from its base, so
  // SS carries no state/city tax; the *MonthlyNet figures already net SS of
  // federal tax. The window's OBBBA senior deduction reduces the wage's
  // federal taxable. These feed the summary cards' "take-home" figures; they
  // do NOT touch the chart (wages are identical in both claiming arms).
  const preFRAWageFederal = computeWageFederalTax({
    autoTax,
    manualFedRate,
    wageIncome: grossIncome,
    extraDeduction: seniorDeductionEarlyPreFRA,
  });
  const preFRAWageStateLocal = computeStateLocalWageTax({
    locality,
    wageIncome: grossIncome,
  });
  const wageTaxPreFRA = {
    federal: preFRAWageFederal,
    state: preFRAWageStateLocal.stateTax,
    city: preFRAWageStateLocal.cityTax,
    total: preFRAWageFederal + preFRAWageStateLocal.total,
    net: grossIncome - preFRAWageFederal - preFRAWageStateLocal.total,
  };

  const postFRAWageFederal = computeWageFederalTax({
    autoTax,
    manualFedRate,
    wageIncome: postFRAGrossIncome,
    extraDeduction: seniorDeductionEarlyPostFRA,
  });
  const postFRAWageStateLocal = computeStateLocalWageTax({
    locality,
    wageIncome: postFRAGrossIncome,
  });
  const wageTaxPostFRA = {
    federal: postFRAWageFederal,
    state: postFRAWageStateLocal.stateTax,
    city: postFRAWageStateLocal.cityTax,
    total: postFRAWageFederal + postFRAWageStateLocal.total,
    net: postFRAGrossIncome - postFRAWageFederal - postFRAWageStateLocal.total,
  };

  return {
    earlyFactor,
    earlyMonthlyGross,
    fraMonthlyGross,
    earlyPostFRAMonthlyGross,
    recoupedFactor,
    annualEarlyGross,
    earningsTestWithholding,
    fraYearEarningsTestWithholding,
    combinedIncome,
    taxableSSPct,
    fedMarginalRate,
    ssEffectiveTaxRate,
    earlyMonthlyNet,
    earlyPostFRAMonthlyNet,
    fraMonthlyNet,
    // Post-FRA net checks once the claimant STOPS working (wages → $0).
    // Equal to the working variants above when postFRAGrossIncome is 0; when
    // the user models post-FRA wages, these are higher because dropping the
    // wage income collapses the SS-taxation tier. This is the "final fixed
    // amount" the claimant settles into for the rest of life after retiring.
    earlyPostFRAMonthlyNetRetired,
    fraMonthlyNetRetired,
    postFRAWorkEndAge,
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
    // Medicare/IRMAA delta for the 65-to-FRA slice of the pre-FRA window
    // (distinct from the pre-65 ACA delta above). Equals healthcareDeltaAnnualPre
    // when claimAge >= 65. Surfaced so UI/consumers can show the two regimes.
    healthcareDeltaAnnualPre65to67,
    healthcareDeltaAnnualPost,
    // OBBBA senior bonus deduction (2025–2028, age 65+). Per-window
    // deduction amounts AND the dollar-savings each yields in federal tax.
    // Lifetime totals roll those up over the qualifying years of the
    // projection (early scenario collects from claimAge; wait scenario
    // collects from FRA). UI uses these to display "saves $X/yr × N years"
    // alongside the relevant net check.
    seniorDeductionPreFRA,
    // Pre-FRA window's deduction priced at age 65 (vs at claimAge for the
    // field above). Equal to seniorDeductionPreFRA when claimAge ≥ 65;
    // nonzero-when-the-other-is-zero when claimAge is 62-64 but the pre-FRA
    // window includes 65/66 years inside the 2025-2028 OBBBA window.
    seniorDeductionPreFRA65Plus: seniorDeductionPreFRA65PlusAmt,
    seniorDeductionPostFRA,
    seniorDeductionWait: seniorDeductionWaitAmt,
    seniorDeductionAnnualSavingsEarlyPre,
    seniorDeductionAnnualSavingsEarlyPre65Plus,
    seniorDeductionAnnualSavingsEarlyPost,
    seniorDeductionAnnualSavingsWait,
    seniorDeductionLifetimeEarly,
    seniorDeductionLifetimeWait,
    seniorDeductionEligibleYearsEarly: earlyEligibleYears,
    seniorDeductionEligibleYearsWait: waitEligibleYears,
    // Wage take-home (display-only). Federal + NY/NYC state/city tax on the
    // pre-FRA and post-FRA wage, and the resulting net wage. Combined with the
    // (already-net) SS checks in SummaryCards to show a true take-home.
    wageTaxPreFRA,
    wageTaxPostFRA,
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
