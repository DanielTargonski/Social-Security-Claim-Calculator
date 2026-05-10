// Chart trajectory math — the 3-phase invested-pot model.
//
//   Phase 1: claimAge → min(FRA, investStopAge)
//            contribute earlyMonthlyNet (post-ET, post-tax)
//   Phase 2: FRA → investStopAge   (only when investStopAge > FRA)
//            contribute earlyPostFRAMonthlyNet (post-recoup, post-tax,
//            no earnings test)
//   Phase 3: investStopAge → lifeExpectancy
//            pot compounds untouched, checks now collected as cash.
//            Cash rate splits at FRA when investStopAge < FRA: pre-FRA
//            uses earlyMonthlyNet, post-FRA uses earlyPostFRAMonthlyNet.

import { FRA } from "./ssRules.js";

// Pure helper. Given the user's claim age and chosen invest-stop age,
// return the boundaries of each phase in years and months.
export function computePhaseBoundaries({ claimAge, investStopAge }) {
  const phase1End = Math.min(FRA, Math.max(claimAge, investStopAge));
  const phase1Months = Math.max(0, (phase1End - claimAge) * 12);
  const phase2Months = Math.max(0, (investStopAge - phase1End) * 12);
  return { phase1End, phase1Months, phase2Months };
}

// Future value of a series of monthly contributions at a constant monthly
// rate r (= annual / 12 / 100). When r === 0, just sums contributions.
function fvSeries({ monthly, months, r }) {
  if (months <= 0) return 0;
  if (r > 0) return (monthly * (Math.pow(1 + r, months) - 1)) / r;
  return monthly * months;
}

// Pot at the end of Phase 1 (= start of Phase 2 if Phase 2 has months,
// otherwise = start of Phase 3).
export function potAtPhase1End({ earlyMonthlyNet, phase1Months, r }) {
  return fvSeries({ monthly: earlyMonthlyNet, months: phase1Months, r });
}

// Pot at the end of Phase 2 (= start of Phase 3). Combines the existing pot
// growing from Phase 1 with new contributions at the post-FRA rate.
export function potAtInvestStop({
  potAtPhase1End: basePot,
  earlyPostFRAMonthlyNet,
  phase2Months,
  r,
}) {
  if (r > 0) {
    return (
      basePot * Math.pow(1 + r, phase2Months) +
      fvSeries({ monthly: earlyPostFRAMonthlyNet, months: phase2Months, r })
    );
  }
  return basePot + earlyPostFRAMonthlyNet * phase2Months;
}

// Cash collected during Phase 3, broken at FRA when applicable.
export function cashCollectedInPhase3({
  age,
  investStopAge,
  earlyMonthlyNet,
  earlyPostFRAMonthlyNet,
}) {
  // Period from investStopAge → min(age, FRA) is at the early ET-reduced rate.
  // Period from max(investStopAge, FRA) → age is at the post-FRA recouped rate.
  const monthsAtEarlyRate =
    Math.max(0, Math.min(age, FRA) - investStopAge) * 12;
  const monthsAtPostFRARate =
    Math.max(0, age - Math.max(investStopAge, FRA)) * 12;
  return (
    earlyMonthlyNet * monthsAtEarlyRate +
    earlyPostFRAMonthlyNet * monthsAtPostFRARate
  );
}

// Pot value at a given age, accounting for which phase we're in.
export function potAtAge({
  age,
  claimAge,
  phase1End,
  investStopAge,
  earlyMonthlyNet,
  earlyPostFRAMonthlyNet,
  potAtPhase1End: basePotPhase1,
  potAtInvestStop: basePotPhase3,
  r,
}) {
  if (age < claimAge) return 0;
  if (age <= phase1End) {
    const months = (age - claimAge) * 12;
    return fvSeries({ monthly: earlyMonthlyNet, months, r });
  }
  if (age <= investStopAge) {
    const months = (age - phase1End) * 12;
    const grown = basePotPhase1 * Math.pow(1 + r, months);
    const newContrib = fvSeries({
      monthly: earlyPostFRAMonthlyNet,
      months,
      r,
    });
    return grown + newContrib;
  }
  // Phase 3 — pot just compounds, no new contributions
  const monthsAfter = (age - investStopAge) * 12;
  return basePotPhase3 * Math.pow(1 + r, monthsAfter);
}

// "Wait" curve: collect the full FRA benefit starting at FRA. Zero before.
export function waitTotalAtAge({ age, fraMonthlyNet }) {
  if (age < FRA) return 0;
  const months = (age - FRA) * 12;
  return fraMonthlyNet * months;
}

// Returns the after-tax monthly contribution for a given month index
// (0-based, counted from the claim date) under SSA's lumpy earnings-test
// withholding pattern. SSA actually withholds entire monthly checks until
// the projected annual withholding amount is reached, then resumes paying
// full checks for the rest of that year — repeating each year.
//
//   `lumpy` is null            → no withholding pattern, every month
//                                 returns `fullMonthlyNet` (averaged
//                                 fallback for callers that don't compute
//                                 the lumpy params).
//   `lumpy.monthsWithheldFull` → number of full $0 months at the start of
//                                 each year cycle.
//   `lumpy.partialMonthlyNet`  → the partial check that arrives in the
//                                 transition month immediately after the
//                                 full-withhold months. Equal to
//                                 fullMonthlyNet when the residual
//                                 withholding is zero (no transition month).
function lumpyContribAtMonth(monthIndex, lumpy, fullMonthlyNet) {
  if (!lumpy) return fullMonthlyNet;
  const monthInYear = monthIndex % 12;
  if (monthInYear < lumpy.monthsWithheldFull) return 0;
  if (monthInYear === lumpy.monthsWithheldFull) return lumpy.partialMonthlyNet;
  return fullMonthlyNet;
}

// Build the full chartData array used by the recharts <LineChart>.
// One row per quarter-year between min(claimAge, FRA) and lifeExpectancy.
//   age, early, pot, wait
//   - early = pot + cashCollectedSinceInvestStop (the total claim-and-invest position)
//   - pot   = invested-pot value alone (dashed line on the chart)
//   - wait  = wait-until-FRA cumulative
//
// The implementation runs a month-by-month simulation so the SSA lumpy
// withholding pattern is modeled honestly. When `lumpy` is omitted (e.g.
// in unit tests for the FV helpers), every pre-FRA month contributes the
// constant `earlyMonthlyNet` — equivalent to the old averaged behavior.
//
// `investedFraction` (0..1) splits each pre-investStopAge check between the
// invested pot and accumulated cash. 1.0 = current behavior (all early
// checks invested). 0.0 = nothing invested, every check accumulates linearly
// as cash. The "early" line still represents total received dollars either
// way — only the compounding portion changes.
export function buildChartData({
  claimAge,
  investStopAge,
  lifeExpectancy,
  returnRate,
  earlyMonthlyNet,
  earlyPostFRAMonthlyNet,
  fraMonthlyNet,
  lumpy = null,
  investedFraction = 1,
}) {
  const data = [];
  const r = returnRate / 100 / 12;
  const startAge = Math.min(claimAge, FRA);

  // Total months from claimAge to lifeExpectancy. We simulate this whole
  // window and then sample at quarter-year resolution for the chart rows.
  const totalMonthsLife = Math.max(
    0,
    Math.round((lifeExpectancy - claimAge) * 12)
  );

  // monthlyPot[m] = invested-pot value at the END of month m (where month
  // 0 = claimAge, no contribution yet). monthlyCumCash[m] = cumulative
  // cash collected through end of month m. Cash includes both Phase 3
  // checks AND the non-invested fraction of pre-investStopAge checks.
  const monthlyPot = new Array(totalMonthsLife + 1).fill(0);
  const monthlyCumCash = new Array(totalMonthsLife + 1).fill(0);
  let cumCash = 0;

  for (let m = 1; m <= totalMonthsLife; m++) {
    const ageAtMonthEnd = claimAge + m / 12;
    // Pre-FRA contribution: lumpy if params provided, else flat.
    // monthIndex passed to lumpyContrib is (m - 1) so month 1 = year-cycle
    // month 0 (the first withheld month if any).
    const preFRAContrib = lumpyContribAtMonth(m - 1, lumpy, earlyMonthlyNet);
    const checkThisMonth = ageAtMonthEnd <= FRA
      ? preFRAContrib
      : earlyPostFRAMonthlyNet;

    let contribThisMonth = 0;
    let cashThisMonth = 0;
    if (ageAtMonthEnd <= investStopAge) {
      // Phase 1 or Phase 2 — split the check between invested pot and cash
      // per investedFraction. Default 1.0 keeps every dollar going to the pot.
      contribThisMonth = checkThisMonth * investedFraction;
      cashThisMonth = checkThisMonth * (1 - investedFraction);
    } else {
      // Phase 3 — pot just compounds, the entire check is cash.
      cashThisMonth = checkThisMonth;
    }

    monthlyPot[m] = monthlyPot[m - 1] * (1 + r) + contribThisMonth;
    cumCash += cashThisMonth;
    monthlyCumCash[m] = cumCash;
  }

  // Sample the simulation at quarter-year intervals for the chart.
  for (let age = startAge; age <= lifeExpectancy; age += 0.25) {
    const m = Math.round((age - claimAge) * 12);
    let pot = 0;
    let cash = 0;
    if (m >= 0) {
      const idx = Math.min(m, totalMonthsLife);
      pot = monthlyPot[idx];
      cash = monthlyCumCash[idx];
    }
    const early = age >= claimAge ? pot + cash : 0;
    const wait = waitTotalAtAge({ age, fraMonthlyNet });

    data.push({
      age: parseFloat(age.toFixed(2)),
      early: Math.round(early),
      pot: Math.round(pot),
      wait: Math.round(wait),
    });
  }

  return data;
}

// Find the age at which the early-claim total crosses the wait-claim total.
// Returns null when no crossover exists in the projected range, or when the
// comparison doesn't apply (switch mode, claim at FRA exactly).
//
// When multiple crossovers exist (rare — only with high returns where the
// pot compounds back past the wait line after wait briefly took the lead),
// returns the FIRST. The chart shows both curves so a second crossover is
// visible even if not labeled.
//
// Two ways a crossover is detected per sample-pair:
//   1. Sign change between consecutive samples (the standard case) —
//      linear-interp the exact age between them.
//   2. Exact zero at the current sample with both curves already non-trivial
//      (b.early > 0 guards against the trivial pre-claim startup where
//      both curves sit at 0). Without this branch, an integer-aligned setup
//      whose crossover lands exactly on a quarter-year sample (e.g. r=0,
//      early=$1000/mo, wait=$1500/mo, investStop=67 → crossover at age 77.0)
//      reports null because the sign-change product is exactly 0.
export function findBreakEvenAge({ chartData, claimAge, mode }) {
  if (mode === "switch") return null;
  if (Math.abs(claimAge - FRA) < 0.01) return null;
  for (let i = 1; i < chartData.length; i++) {
    const a = chartData[i - 1];
    const b = chartData[i];
    const prevDiff = a.early - a.wait;
    const currDiff = b.early - b.wait;
    if (currDiff === 0 && b.early > 0) {
      return parseFloat(b.age.toFixed(1));
    }
    if (prevDiff * currDiff < 0) {
      const t = prevDiff / (prevDiff - currDiff);
      return parseFloat((a.age + t * (b.age - a.age)).toFixed(1));
    }
  }
  return null;
}
