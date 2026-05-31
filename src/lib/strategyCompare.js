// Head-to-head comparison of the claiming strategies a surviving spouse can
// choose between, all evaluated on the SAME inputs (same claim age, return
// rate, invest-stop age, life expectancy, taxes, healthcare) so the ONLY
// thing that differs is the claiming strategy itself. This is what makes the
// numbers comparable across what were previously three separate "calculators"
// the user had to flip between one mode at a time.
//
//   survivor  Claim the reduced SURVIVOR benefit now and keep it for life.
//   switch    Claim the reduced OWN benefit now, invest, then switch to the
//             full 100% survivor benefit at FRA (the "widow's switch").
//   own       Claim the OWN benefit now and never take survivor. Only wins
//             when the own benefit exceeds the survivor benefit; included as
//             supplementary context, never the headline.
//
// `survivor` and `switch` share fraBenefit = the survivor benefit at FRA, so
// they're directly comparable: both are measured against the identical "wait
// to 67 for the full survivor benefit" baseline. `own` reinterprets the
// projection with fraBenefit = ownBenefit, since "claim your own" means the
// own record is the one being reduced and collected.

import { computeProjection } from "./benefitMath.js";
import { clampClaimAgeToBounds } from "./modeConfig.js";

export const STRATEGY_DEFS = [
  {
    key: "survivor",
    mode: "survivor",
    label: "Survivor early",
    blurb: "Claim the reduced survivor benefit now and keep it for life.",
    fraSource: "fraBenefit",
  },
  {
    key: "switch",
    mode: "switch",
    label: "Own → Survivor",
    blurb:
      "Claim your own benefit early, invest, then switch to the full survivor benefit at 67.",
    fraSource: "fraBenefit",
  },
  {
    key: "own",
    mode: "retirement",
    label: "Own only",
    blurb: "Claim your own benefit now and never take the survivor benefit.",
    fraSource: "ownBenefit",
  },
];

// Mirror of App.jsx's effectiveInvestStopAge derivation (and the identical
// clamp in optimalClaimAge.js). Each strategy may land on a different claim
// age after clamping to its mode's range, so the invest-stop floor has to be
// recomputed per strategy — otherwise a strategy whose claim age clamped UP
// (survivor 60 -> switch 62) could end up with claimAge > investStopAge and a
// degenerate Phase 1.
function clampInvestStopAge({ investStopAge, claimAge, lifeExpectancy }) {
  const minInvestStopAge = Math.max(60, Math.ceil(claimAge));
  return Math.min(Math.max(investStopAge, minInvestStopAge), lifeExpectancy);
}

// Crossover age between two cumulative series sharing an `age` axis. Unlike
// chartProjection.findCrossoverAge this carries NO mode-specific guards (that
// one short-circuits switch mode and claim-at-FRA, neither of which applies
// when we're racing two whole strategies against each other). Returns null
// when the series never cross within the projected range.
//
// Detection mirrors findCrossoverAge: a sign change between consecutive
// samples (linear-interpolated to the exact age) OR an exact zero landing on
// a sample with the LEFT series already non-trivial (guards the trivial
// pre-claim startup where both sit at 0).
export function findSeriesCrossover(rows, leftKey, rightKey) {
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1];
    const b = rows[i];
    const prev = a[leftKey] - a[rightKey];
    const curr = b[leftKey] - b[rightKey];
    if (curr === 0 && b[leftKey] > 0) return b.age;
    if (prev * curr < 0) {
      const t = prev / (prev - curr);
      return a.age + t * (b.age - a.age);
    }
  }
  return null;
}

// Merge two strategies' cumulative `early` series onto a single age axis so a
// head-to-head crossover can be computed. Both grids share lifeExpectancy and
// the 0.25-yr sampling step; they differ only in start age when the two
// strategies clamp to different claim ages. Samples missing from one series
// (its pre-claim window) read as 0.
export function mergeEarlySeries(aData, bData, aKey, bKey) {
  const byAge = new Map();
  const put = (rows, key) => {
    for (const row of rows) {
      const k = row.age.toFixed(4);
      const entry = byAge.get(k) || { age: row.age };
      entry[key] = row.early;
      byAge.set(k, entry);
    }
  };
  put(aData, aKey);
  put(bData, bKey);
  const merged = [...byAge.values()].sort((x, y) => x.age - y.age);
  for (const row of merged) {
    if (row[aKey] === undefined) row[aKey] = 0;
    if (row[bKey] === undefined) row[bKey] = 0;
  }
  return merged;
}

// Run every strategy and assemble the comparison. Pure: same inputs in -> same
// result out. No React, no DOM. Safe to call from a useMemo or from tests.
//
// Returns:
//   strategies  [{ key, mode, label, blurb, claimAge, clampedFromClaimAge,
//                  fraBenefit, lifetimeTotal, waitTotal, advantageVsWait,
//                  breakEvenVsWait, earlyMonthlyNet, postFRAMonthlyNet,
//                  chartData }]
//   byKey       same, indexed by key
//   merged      [{ age, survivorEarly, switchEarly }] head-to-head series
//   verdict     { primaryWinner, primaryMargin, crossover, switchEndsAhead,
//                 overallWinner, overallRunnerUp, overallMargin }
export function compareStrategies(inputs) {
  // Dollar-mode early invest: when the user enters the early-invest amount as a
  // fixed DOLLAR figure (the slider's "$" toggle) rather than a percentage,
  // `investedEarlyDollar` carries that monthly dollar amount. Each strategy's
  // early check differs (survivor's reduced survivor check vs own's reduced own
  // check), so a single fixed PERCENTAGE invests a different number of dollars
  // in each — which surprises a user who typed one dollar figure. In dollar
  // mode we instead invest that same dollar amount in every scenario, capped at
  // each scenario's own check ("if the benefits are big enough"). null/absent =
  // percentage mode (unchanged: one fixed `investedPct` fraction everywhere).
  const investedEarlyDollar = inputs.investedEarlyDollar;
  const dollarMode = investedEarlyDollar != null && investedEarlyDollar > 0;

  const strategies = STRATEGY_DEFS.map((def) => {
    const claimAge = clampClaimAgeToBounds(def.mode, inputs.claimAge);
    const fraBenefit = inputs[def.fraSource];
    const investStopAge = clampInvestStopAge({
      investStopAge: inputs.investStopAge,
      claimAge,
      lifeExpectancy: inputs.lifeExpectancy,
    });
    const projInputs = {
      ...inputs,
      mode: def.mode,
      claimAge,
      fraBenefit,
      investStopAge,
    };
    let projection = computeProjection(projInputs);

    // In dollar mode, re-derive this scenario's invested fraction from the
    // entered dollar amount and ITS OWN check. `investedPct` doesn't affect
    // `earlyMonthlyNet`, so the first projection already gives us the check to
    // size the fraction against; re-run with the per-scenario fraction. Capped
    // at the check (can't invest more than you receive) → 100% when the check
    // is smaller than the dollar amount.
    let investedEarlyDollarApplied = null;
    if (dollarMode) {
      const check = projection.earlyMonthlyNet;
      if (check > 0) {
        investedEarlyDollarApplied = Math.min(investedEarlyDollar, check);
        const pct = (investedEarlyDollarApplied / check) * 100;
        projection = computeProjection({ ...projInputs, investedPct: pct });
      }
    }

    return {
      key: def.key,
      mode: def.mode,
      label: def.label,
      blurb: def.blurb,
      claimAge,
      // The claim age the user actually set, recorded only when this strategy
      // had to clamp away from it (so the UI can annotate "evaluated at 62,
      // its earliest" instead of silently showing a different age).
      clampedFromClaimAge: claimAge !== inputs.claimAge ? inputs.claimAge : null,
      fraBenefit,
      // Total dollars in hand at lifeExpectancy (invested pot + cash collected)
      // under this strategy's early-and-invest path. The single comparable
      // wealth number across strategies.
      lifetimeTotal: projection.finalEarly,
      waitTotal: projection.finalWait,
      advantageVsWait: projection.advantage,
      breakEvenVsWait: projection.breakEvenAge,
      // First check the claimant receives now (post-ET, post-tax).
      earlyMonthlyNet: projection.earlyMonthlyNet,
      // The settled monthly check from 67 on (retired tax tier). For switch
      // this is the full survivor benefit; for survivor/own it's the recouped
      // reduced benefit.
      postFRAMonthlyNet: projection.earlyPostFRAMonthlyNetRetired,
      // Dollar mode only: the per-month dollar this scenario actually invests
      // (the entered amount, or the whole check if it's smaller). null in
      // percentage mode. UI surfaces it so the user sees the dollar honored.
      investedEarlyDollarApplied,
      chartData: projection.chartData,
    };
  });

  const byKey = Object.fromEntries(strategies.map((s) => [s.key, s]));
  const survivor = byKey.survivor;
  const sw = byKey.switch;

  // Head-to-head series for the user's core question: own->survivor vs
  // claiming survivor early.
  const merged = mergeEarlySeries(
    survivor.chartData,
    sw.chartData,
    "survivorEarly",
    "switchEarly"
  );
  const crossover = findSeriesCrossover(merged, "switchEarly", "survivorEarly");
  const switchVsSurvivor = sw.lifetimeTotal - survivor.lifetimeTotal;

  // Overall ranking across all three by lifetime total at lifeExpectancy.
  const ranked = [...strategies].sort(
    (a, b) => b.lifetimeTotal - a.lifetimeTotal
  );

  const verdict = {
    // Primary question: own->survivor vs survivor-early at lifeExpectancy.
    primaryWinner: switchVsSurvivor >= 0 ? "switch" : "survivor",
    primaryMargin: Math.abs(switchVsSurvivor),
    switchEndsAhead: switchVsSurvivor >= 0,
    // Age where the switch line overtakes the survivor-early line (null when
    // they never cross in range — one leads the whole way).
    crossover,
    // Best of all three (includes own-only).
    overallWinner: ranked[0].key,
    overallRunnerUp: ranked[1].key,
    overallMargin: ranked[0].lifetimeTotal - ranked[1].lifetimeTotal,
  };

  return { strategies, byKey, merged, verdict };
}
