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

// Medicare eligibility starts the month the claimant turns 65. The pre-FRA
// invested window (claimAge -> FRA) therefore straddles two healthcare-cost
// regimes for anyone claiming before 65: ACA premiums up to 65, Medicare /
// IRMAA from 65 on. The early-claim net check is healthcare-adjusted
// differently on each side of this boundary (see benefitMath.computeProjection),
// so buildChartData switches the pre-FRA contribution rate here.
const MEDICARE_AGE = 65;

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
//
// Optionally splits the post-FRA window between a "working" tax tier
// (FRA → postFRAWorkEndAge, taxed at fraMonthlyNet) and a "retired" tax
// tier (postFRAWorkEndAge → age, taxed at fraMonthlyNetRetired). When
// the optional params are omitted the function is back-compat: a single
// fraMonthlyNet rate for the whole post-FRA window.
export function waitTotalAtAge({
  age,
  fraMonthlyNet,
  fraMonthlyNetRetired = fraMonthlyNet,
  postFRAWorkEndAge = FRA,
}) {
  if (age < FRA) return 0;
  const monthsWorking =
    Math.max(0, Math.min(age, postFRAWorkEndAge) - FRA) * 12;
  const monthsRetired =
    Math.max(0, age - Math.max(FRA, postFRAWorkEndAge)) * 12;
  return fraMonthlyNet * monthsWorking + fraMonthlyNetRetired * monthsRetired;
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

function lumpyScheduleForAge(lumpy, ageAtMonthEnd) {
  if (!lumpy || !("lower" in lumpy || "fraYear" in lumpy)) return lumpy;
  const fraYearStartAge = lumpy.fraYearStartAge ?? FRA - 1;
  return ageAtMonthEnd >= fraYearStartAge ? lumpy.fraYear : lumpy.lower;
}

// Build the full chartData array used by the recharts <LineChart>.
// One row per quarter-year between min(claimAge, FRA) and lifeExpectancy.
//   age, early, pot, wait, waitPot, waitInvested
//   - early        = pot + cashCollectedSinceInvestStop (total claim-and-invest position)
//   - pot          = invested-pot value alone (dashed line on the chart)
//   - wait         = wait-until-FRA cumulative, no investment (uninvested baseline)
//   - waitPot      = invested-FRA-check pot value alone
//   - waitInvested = waitPot + cumulative wait-side cash (the "wait + invest" total)
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
//
// `waitInvestedFraction` (0..1) is the analogous knob for the wait+invest
// scenario: the share of each post-FRA check (in the wait scenario) that
// goes to its own invested pot rather than to cash. 1.0 = invest the full
// FRA check until investStopAge. 0.0 = waitInvested === wait (no investment
// effect). The wait scenario has no pre-FRA contributions: nothing is being
// claimed yet, so monthlyWaitPot stays 0 until age FRA.
export function buildChartData({
  claimAge,
  investStopAge,
  lifeExpectancy,
  returnRate,
  earlyMonthlyNet,
  // Pre-FRA net check for ages >= 65 (Medicare-eligible). Differs from
  // earlyMonthlyNet only by the healthcare-cost adjustment: pre-65 carries the
  // ACA premium delta, 65-to-FRA carries the Medicare/IRMAA delta. Defaults to
  // earlyMonthlyNet so callers that don't model the 65 transition (and every
  // existing test) keep the previous single-rate pre-FRA behavior.
  earlyMonthlyNet65Plus = earlyMonthlyNet,
  earlyPostFRAMonthlyNet,
  // The post-FRA "retired" rates default to the working rates so older
  // callers (and tests) that don't pass them get the previous behavior.
  earlyPostFRAMonthlyNetRetired = earlyPostFRAMonthlyNet,
  fraMonthlyNet,
  fraMonthlyNetRetired = fraMonthlyNet,
  postFRAWorkEndAge = FRA,
  lumpy = null,
  investedFraction = 1,
  waitInvestedFraction = 1,
}) {
  const data = [];
  const r = returnRate / 100 / 12;
  // Simulation rebase: index the per-month arrays from `simBase`
  // = min(claimAge, FRA), not from claimAge. The wait scenario's first
  // contribution lands at FRA; when claimAge > FRA (delayed-claim strategy)
  // the period from FRA to claimAge must still be simulated for wait, or
  // the waitInvested curve renders as $0 over that window while the
  // analytical `wait` curve correctly shows the FRA checks accumulating —
  // a visible internal contradiction.
  const startAge = Math.min(claimAge, FRA);
  const simBase = startAge;

  // Total months from simBase to lifeExpectancy. We simulate this whole
  // window and then sample at quarter-year resolution for the chart rows.
  const totalMonthsLife = Math.max(
    0,
    Math.round((lifeExpectancy - simBase) * 12)
  );

  // monthlyPot[m] = invested-pot value at the END of month m (where month
  // 0 = simBase, no contribution yet). monthlyCumCash[m] = cumulative
  // cash collected through end of month m. Cash includes both Phase 3
  // checks AND the non-invested fraction of pre-investStopAge checks.
  const monthlyPot = new Array(totalMonthsLife + 1).fill(0);
  const monthlyCumCash = new Array(totalMonthsLife + 1).fill(0);
  let cumCash = 0;

  // Parallel arrays for the "wait + invest" scenario: invest the FRA-claim
  // checks from age FRA through investStopAge, then let the pot compound
  // while remaining checks become cash. Nothing happens pre-FRA — the wait
  // scenario hasn't claimed yet.
  const monthlyWaitPot = new Array(totalMonthsLife + 1).fill(0);
  const monthlyWaitCumCash = new Array(totalMonthsLife + 1).fill(0);
  let waitCumCash = 0;

  for (let m = 1; m <= totalMonthsLife; m++) {
    const ageAtMonthEnd = simBase + m / 12;

    // Early scenario: the claimant hasn't claimed yet for ages < claimAge,
    // so contributions and cash are both 0 in that pre-claim window. The
    // guard matters when claimAge > FRA (simBase = FRA, claimAge > FRA);
    // when claimAge <= FRA the guard is always satisfied after m=1.
    let contribThisMonth = 0;
    let cashThisMonth = 0;
    if (ageAtMonthEnd >= claimAge) {
      // monthsSinceClaim drives the lumpy earnings-test withholding's
      // year-cycle (12-month wrap). Use round-to-int via the rebase math so
      // it's stable to float noise from m / 12.
      const monthsSinceClaim = Math.max(
        0,
        Math.round(m - (claimAge - simBase) * 12)
      );
      // Pre-FRA, the contribution rate splits at Medicare eligibility (65):
      // before 65 the check carries the ACA-premium healthcare delta, from 65
      // on it carries the Medicare/IRMAA delta. The lumpy earnings-test
      // withholding pattern rides on top of whichever rate applies.
      const preFRABaseNet =
        ageAtMonthEnd < MEDICARE_AGE ? earlyMonthlyNet : earlyMonthlyNet65Plus;
      const preFRAContrib = lumpyContribAtMonth(
        monthsSinceClaim - 1,
        lumpyScheduleForAge(lumpy, ageAtMonthEnd),
        preFRABaseNet
      );
      const checkThisMonth =
        ageAtMonthEnd <= FRA
          ? preFRAContrib
          : ageAtMonthEnd <= postFRAWorkEndAge
          ? earlyPostFRAMonthlyNet
          : earlyPostFRAMonthlyNetRetired;

      if (ageAtMonthEnd <= investStopAge) {
        // Phase 1 or Phase 2 — split the check between invested pot and cash
        // per investedFraction. Default 1.0 keeps every dollar going to the pot.
        contribThisMonth = checkThisMonth * investedFraction;
        cashThisMonth = checkThisMonth * (1 - investedFraction);
      } else {
        // Phase 3 — pot just compounds, the entire check is cash.
        cashThisMonth = checkThisMonth;
      }
    }

    monthlyPot[m] = monthlyPot[m - 1] * (1 + r) + contribThisMonth;
    cumCash += cashThisMonth;
    monthlyCumCash[m] = cumCash;

    // Wait-side: no check pre-FRA. From FRA onward, the wait scenario gets
    // fraMonthlyNet (or fraMonthlyNetRetired after postFRAWorkEndAge).
    // Split between pot and cash per waitInvestedFraction until investStopAge,
    // then all-cash. The pot compounds at the same monthly rate as the
    // early-side pot.
    let waitContribThisMonth = 0;
    let waitCashThisMonth = 0;
    if (ageAtMonthEnd > FRA) {
      const waitCheck =
        ageAtMonthEnd <= postFRAWorkEndAge
          ? fraMonthlyNet
          : fraMonthlyNetRetired;
      if (ageAtMonthEnd <= investStopAge) {
        waitContribThisMonth = waitCheck * waitInvestedFraction;
        waitCashThisMonth = waitCheck * (1 - waitInvestedFraction);
      } else {
        waitCashThisMonth = waitCheck;
      }
    }
    monthlyWaitPot[m] = monthlyWaitPot[m - 1] * (1 + r) + waitContribThisMonth;
    waitCumCash += waitCashThisMonth;
    monthlyWaitCumCash[m] = waitCumCash;
  }

  // Sample the simulation at quarter-year intervals for the chart.
  const pushSample = (age) => {
    const m = Math.round((age - simBase) * 12);
    let pot = 0;
    let cash = 0;
    let waitPot = 0;
    let waitCash = 0;
    if (m >= 0) {
      const idx = Math.min(m, totalMonthsLife);
      pot = monthlyPot[idx];
      cash = monthlyCumCash[idx];
      waitPot = monthlyWaitPot[idx];
      waitCash = monthlyWaitCumCash[idx];
    }
    const early = age >= claimAge ? pot + cash : 0;
    const wait = waitTotalAtAge({
      age,
      fraMonthlyNet,
      fraMonthlyNetRetired,
      postFRAWorkEndAge,
    });
    const waitInvested = age >= FRA ? waitPot + waitCash : 0;
    data.push({
      age: parseFloat(age.toFixed(4)),
      early: Math.round(early),
      pot: Math.round(pot),
      wait: Math.round(wait),
      waitPot: Math.round(waitPot),
      waitInvested: Math.round(waitInvested),
    });
  };

  for (let age = startAge; age <= lifeExpectancy; age += 0.25) {
    pushSample(age);
  }
  // With a fractional lifeExpectancy (1/12 slider step), the 0.25-stride loop
  // can stop short of the final age — leaving the chart's headline "Total at
  // X" cards reading the second-to-last month rather than the user's actual
  // chosen lifespan. Append an exact-lifeExpectancy sample when that happens.
  const lastSampledAge = data.length > 0 ? data[data.length - 1].age : -Infinity;
  if (lastSampledAge < lifeExpectancy - 1e-6) {
    pushSample(lifeExpectancy);
  }

  return data;
}

// Find the age at which series `leftKey` crosses series `rightKey` in
// chartData. Returns null when no crossover exists in the projected range,
// or when the comparison doesn't apply (switch mode, claim at FRA exactly).
//
// When multiple crossovers exist (rare — only with high returns where the
// pot compounds back past the wait line after wait briefly took the lead),
// returns the FIRST. The chart shows both curves so a second crossover is
// visible even if not labeled.
//
// Two ways a crossover is detected per sample-pair:
//   1. Sign change between consecutive samples (the standard case) —
//      linear-interp the exact age between them.
//   2. Exact zero at the current sample with the LEFT curve already
//      non-trivial (b[leftKey] > 0 guards against the trivial pre-claim
//      startup where both curves sit at 0). Without this branch, an
//      integer-aligned setup whose crossover lands exactly on a
//      quarter-year sample (e.g. r=0, early=$1000/mo, wait=$1500/mo,
//      investStop=67 → crossover at age 77.0) reports null because the
//      sign-change product is exactly 0.
export function findCrossoverAge({
  chartData,
  claimAge,
  mode,
  leftKey = "early",
  rightKey = "wait",
}) {
  if (mode === "switch") return null;
  if (Math.abs(claimAge - FRA) < 0.01) return null;
  for (let i = 1; i < chartData.length; i++) {
    const a = chartData[i - 1];
    const b = chartData[i];
    const prevDiff = a[leftKey] - a[rightKey];
    const currDiff = b[leftKey] - b[rightKey];
    // Return full precision so callers can format at month resolution
    // (fmtAge → "79 yr 10 mo"). Rounding to one decimal here would lose
    // the month-level fidelity — e.g. 79.7083 ("79 yr 8 mo") would round
    // to 79.7, which fmtAge would then read back as "79 yr 8 mo" via
    // 0.7 × 12 = 8.4 → 8 (correct by accident here, but other true ages
    // get pulled to the wrong month bucket).
    if (currDiff === 0 && b[leftKey] > 0) {
      return b.age;
    }
    if (prevDiff * currDiff < 0) {
      const t = prevDiff / (prevDiff - currDiff);
      return a.age + t * (b.age - a.age);
    }
  }
  return null;
}

// Back-compat wrapper: early vs wait (the original break-even).
export function findBreakEvenAge({ chartData, claimAge, mode }) {
  return findCrossoverAge({
    chartData,
    claimAge,
    mode,
    leftKey: "early",
    rightKey: "wait",
  });
}
