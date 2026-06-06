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
import { survivalProbability } from "./lifeTable.js";

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
//                 breakEvenReturn, crossoverSurvivalProb, conditioningAge,
//                 overallWinner, overallRunnerUp, overallMargin }
// Run one strategy's projection on the given inputs, resolving how much it
// invests. How much each scenario invests is decided per strategy, in this
// order of precedence:
//
//   1. PER-STRATEGY OVERRIDE (`investedEarlyDollarByStrategy[key]`) — a
//      monthly dollar the user set for THAT strategy alone, independent of the
//      others. This is the decoupling the global slider can't express: the
//      slider forces ONE figure across every scenario, so a user who wants to
//      invest $500/mo on survivor-early but only $250/mo on own->survivor
//      (different bets, not the same dollar) had no way to say so. The
//      comparison honors each override on its own.
//   2. GLOBAL DOLLAR (`investedEarlyDollar`) — the slider's "$" mode: one
//      dollar invested in every scenario (capped per check). Used for any
//      strategy without its own override.
//   3. PERCENTAGE (`investedPct`) — the slider's "%" mode: invest that fraction
//      of each scenario's OWN check (so different dollars per scenario).
//
// Every resolved amount is capped at the scenario's own check — you can't
// invest more than you receive ("whole check" when the request exceeds it).
//
// Returns the projection plus the derived invest figures the UI needs. Shared
// by compareStrategies (builds the full strategy objects) and the break-even
// sweep below (needs only `projection.finalEarly` per rate), so the sweep
// resolves invest amounts exactly like the live comparison.
export function projectStrategy(def, inputs) {
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

  // `investedPct` doesn't affect `earlyMonthlyNet`, so the first projection
  // already gives us this scenario's check to size any dollar request against.
  // Resolve the monthly dollar this scenario invests (see precedence above),
  // cap it at the check, then re-run only when a dollar figure drove the amount
  // — in pure percentage mode the first projection already used `investedPct`,
  // so a re-run would be a no-op.
  const check = projection.earlyMonthlyNet;
  const overrides = inputs.investedEarlyDollarByStrategy || {};
  const override = overrides[def.key];
  const hasOverride = override != null && override >= 0;
  const globalDollar = inputs.investedEarlyDollar;
  const globalDollarMode = globalDollar != null && globalDollar > 0;

  let requestedDollar;
  let dollarDriven;
  if (hasOverride) {
    requestedDollar = override;
    dollarDriven = true;
  } else if (globalDollarMode) {
    requestedDollar = globalDollar;
    dollarDriven = true;
  } else {
    requestedDollar = (inputs.investedPct / 100) * check;
    dollarDriven = false;
  }

  const investedMonthly =
    check > 0 ? Math.min(Math.max(requestedDollar, 0), check) : 0;
  // Did the request exceed the check (so it clamped to the whole check)? The
  // 0.5 slack keeps a request that equals the check from reading as capped.
  const investedAtCheckCap = check > 0 && requestedDollar > check + 0.5;

  if (dollarDriven && check > 0) {
    const pct = (investedMonthly / check) * 100;
    projection = computeProjection({ ...projInputs, investedPct: pct });
  }

  return {
    claimAge,
    fraBenefit,
    projection,
    investedMonthly,
    investedAtCheckCap,
    hasOverride,
    // Back-compat: non-null whenever a dollar figure (override or global "$"
    // mode) drove the amount; null in pure percentage mode.
    investedEarlyDollarApplied: dollarDriven ? investedMonthly : null,
  };
}

// The real-return rate at which the PRIMARY verdict flips — own->survivor
// switch vs claiming survivor early. The crossover age answers "how long must
// you live?"; this answers the other half of the thesis, "how good must your
// returns be?". Sweeps 0% upward and finds where the two strategies' lifetime
// totals cross, using the SAME per-strategy invest resolution as the live
// comparison so the threshold is consistent with the displayed numbers.
//
// Returns { rate, lowWinner, highWinner }: `rate` is the flip point (one
// decimal) or null when one strategy leads across the whole 0..max range (then
// lowWinner === highWinner). `lowWinner` wins below the flip, `highWinner`
// above. Winner keys are "switch" / "survivor".
export function findBreakEvenReturn(inputs, { max = 12, step = 0.5 } = {}) {
  const diffAt = (rate) => {
    const swTotal = projectStrategy(STRATEGY_DEFS[1], { ...inputs, returnRate: rate })
      .projection.finalEarly;
    const suTotal = projectStrategy(STRATEGY_DEFS[0], { ...inputs, returnRate: rate })
      .projection.finalEarly;
    return swTotal - suTotal; // > 0 → switch ahead
  };
  const winnerOf = (d) => (d >= 0 ? "switch" : "survivor");

  let prevRate = 0;
  let prevDiff = diffAt(0);
  const lowWinner = winnerOf(prevDiff);
  const steps = Math.round(max / step);

  for (let i = 1; i <= steps; i++) {
    const rate = i * step;
    const d = diffAt(rate);
    // Exact zero landing on the previous sample (rare), or a sign change
    // between consecutive samples → interpolate the flip rate.
    if (prevDiff !== 0 && prevDiff * d < 0) {
      const t = prevDiff / (prevDiff - d);
      const flip = prevRate + t * (rate - prevRate);
      return {
        rate: Math.round(flip * 10) / 10,
        lowWinner,
        highWinner: winnerOf(d),
      };
    }
    prevRate = rate;
    prevDiff = d;
  }
  // No crossing in range: one side leads at every swept return.
  return { rate: null, lowWinner, highWinner: lowWinner };
}

// How decisive is the primary verdict (own->survivor vs survivor-early)? This is
// separate from WHO wins — it answers the user's question "is one strategy by far
// better, or is this a close call?". Pure: takes the head-to-head crossover and
// the two lifetime totals.
//
//   'decisive' — the winner leads at EVERY age (the lines never cross) AND ends a
//                wide margin ahead (>= DECISIVE_RELATIVE_MARGIN). A clear,
//                not-a-close-call answer.
//   'close'    — the two lines cross within the projected lifespan, so the answer
//                hinges on how long you live (the crossover age says where).
//   'edge'     — the winner leads at every age but only by a slim margin.
//
// `relativeMargin` is the winner's final lead as a fraction of the loser's total
// (Infinity when the loser ends at <= 0 while the winner is positive).
export const DECISIVE_RELATIVE_MARGIN = 0.15;
export function classifyDecisiveness({ crossover, winnerTotal, loserTotal }) {
  const alwaysAhead = crossover == null;
  const relativeMargin =
    loserTotal > 0
      ? (winnerTotal - loserTotal) / loserTotal
      : winnerTotal > 0
      ? Infinity
      : 0;
  let tier;
  if (alwaysAhead && relativeMargin >= DECISIVE_RELATIVE_MARGIN) tier = "decisive";
  else if (!alwaysAhead) tier = "close";
  else tier = "edge";
  return { tier, alwaysAhead, relativeMargin };
}

export function compareStrategies(inputs) {
  const strategies = STRATEGY_DEFS.map((def) => {
    const r = projectStrategy(def, inputs);
    const { projection } = r;
    return {
      key: def.key,
      mode: def.mode,
      label: def.label,
      blurb: def.blurb,
      claimAge: r.claimAge,
      // The claim age the user actually set, recorded only when this strategy
      // had to clamp away from it (so the UI can annotate "evaluated at 62,
      // its earliest" instead of silently showing a different age).
      clampedFromClaimAge:
        r.claimAge !== inputs.claimAge ? inputs.claimAge : null,
      fraBenefit: r.fraBenefit,
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
      // The per-month dollar this scenario actually invests (post-cap), in
      // EVERY mode — percentage, global "$", or per-strategy override. This is
      // what the comparison's per-strategy invest control displays and edits.
      investedMonthly: r.investedMonthly,
      // True when the requested amount exceeded this scenario's check and so
      // clamped to the whole check.
      investedAtCheckCap: r.investedAtCheckCap,
      // True when this scenario's amount came from a per-strategy override
      // (vs. the shared slider). Lets the UI flag a "custom" amount.
      investedOverridden: r.hasOverride,
      // Back-compat: the invested dollar when a dollar figure drove it (global
      // "$" mode or an override); null in pure percentage mode.
      investedEarlyDollarApplied: r.investedEarlyDollarApplied,
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

  // How decisive the primary verdict is (clear winner vs close call).
  const primaryWinnerKey = switchVsSurvivor >= 0 ? "switch" : "survivor";
  const decisiveness = {
    ...classifyDecisiveness({
      crossover,
      winnerTotal: primaryWinnerKey === "switch" ? sw.lifetimeTotal : survivor.lifetimeTotal,
      loserTotal: primaryWinnerKey === "switch" ? survivor.lifetimeTotal : sw.lifetimeTotal,
    }),
    winnerKey: primaryWinnerKey,
  };

  // The return-rate lever: where the primary verdict flips as returns vary.
  const breakEvenReturn = findBreakEvenReturn(inputs);

  // The longevity lever: how likely the claimant is to live from the moment of
  // the decision (the survivor-early claim age — the earliest action point in
  // this head-to-head) to the crossover age where the switch overtakes. Turns
  // the crossover from "live to exactly X" into an expected-value read. Null
  // when the lines never cross (one strategy leads at every age).
  const conditioningAge = survivor.claimAge;
  const crossoverSurvivalProb =
    crossover != null ? survivalProbability(conditioningAge, crossover) : null;

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
    // How decisive the primary verdict is — { tier: 'decisive'|'close'|'edge',
    // alwaysAhead, relativeMargin, winnerKey }. Drives the "clear winner vs
    // close call" status the UI shows so the user can tell a no-brainer from a
    // longevity-dependent toss-up.
    decisiveness,
    // The return rate that flips the primary verdict (the "how good must
    // returns be?" lever): { rate, lowWinner, highWinner }. See
    // findBreakEvenReturn.
    breakEvenReturn,
    // Probability of living from the decision age to the crossover (SSA period
    // life table), and the age that probability is conditioned on. Null when
    // there's no crossover.
    crossoverSurvivalProb,
    conditioningAge,
    // Best of all three (includes own-only).
    overallWinner: ranked[0].key,
    overallRunnerUp: ranked[1].key,
    overallMargin: ranked[0].lifetimeTotal - ranked[1].lifetimeTotal,
  };

  return { strategies, byKey, merged, verdict };
}
