// Find the claim age that maximizes the user's headline outcome metric,
// holding every other input constant. Sweeps the mode's allowed claim-age
// range in 1/12 (monthly) steps — matching the SliderInput's granularity —
// and runs a full computeProjection at each candidate age.
//
// Pure: same inputs in → same result out. No React, no DOM. Safe to call
// from a useMemo or from tests.

import { computeProjection } from "./benefitMath.js";
import { rangeForMode } from "./modeConfig.js";

// Re-export so existing callers (OptimalClaimAge.jsx, this module's tests)
// don't have to change their import paths.
export { rangeForMode };

// Mode-aware headline metric. Both choices give the same `argmax` as the
// alternatives (e.g. `advantage` ranks identically to `finalEarly` because
// `finalWait` is constant across claim ages — the wait curve only depends
// on FRA, not on when the user claimed early), so we pick the form that's
// also the most intuitive absolute number to display in the UI.
//
//   retirement / survivor → finalEarly
//       Total dollars in hand at lifeExpectancy under the early-and-invest
//       strategy. Positive, meaningful, and ranks identically to advantage.
//
//   switch → potAtStopRow
//       The upside the switch strategy buys — invested pot at investStopAge.
//       Post-switch (post-FRA) cashflow is identical across claim ages in
//       switch mode, so absolute final wealth differs only by this term.
function scoreForMode(projection, mode) {
  if (mode === "switch") return projection.potAtStopRow;
  return projection.finalEarly;
}

// Mirror of App.jsx's effectiveInvestStopAge derivation. Keeps each candidate
// claim age in the sweep using a realistic invest-stop boundary — without
// this, sweeping past the user's investStopAge would silently produce
// projections with claimAge > investStopAge (Phase 1 collapses to 0 months,
// the early-checks-invested model degenerates).
function clampInvestStopAge({ investStopAge, claimAge, lifeExpectancy }) {
  const minInvestStopAge = Math.max(60, Math.ceil(claimAge));
  return Math.min(
    Math.max(investStopAge, minInvestStopAge),
    lifeExpectancy
  );
}

// Returns the optimum plus the full sweep curve so the UI can visualize the
// shape of the trade-off (sharp peak vs. broad plateau tells the user how
// robust the answer is).
//
//   {
//     optimalAge,        // 1/12-stepped age that maximized the metric
//     optimalScore,      // metric value at the optimum
//     baselineAge,       // == inputs.claimAge (echoed for the UI)
//     baselineScore,     // metric value at the user's current setting
//     sweep: [{age, score}, ...],
//     metricLabel,       // human-readable name of the optimized metric
//   }
export function findOptimalClaimAge(inputs) {
  const { earliest, latest } = rangeForMode(inputs.mode);
  // Iterate in integer month steps to dodge float-precision creep that
  // would otherwise cause `age <= latest` to terminate one step short on
  // (latest - earliest) * 12 not landing exactly on an integer.
  const totalMonths = Math.round((latest - earliest) * 12);

  let best = null;
  const sweep = [];

  for (let i = 0; i <= totalMonths; i++) {
    const age = earliest + i / 12;
    const investStopAge = clampInvestStopAge({
      investStopAge: inputs.investStopAge,
      claimAge: age,
      lifeExpectancy: inputs.lifeExpectancy,
    });
    const projection = computeProjection({
      ...inputs,
      claimAge: age,
      investStopAge,
    });
    const score = scoreForMode(projection, inputs.mode);
    sweep.push({ age, score });
    if (best === null || score > best.score) {
      best = { age, score };
    }
  }

  // Score at the user's currently-chosen claim age. Computed separately
  // (not pulled from the sweep) so the baseline reflects the user's actual
  // claimAge value even when it doesn't land on a 1/12-yr grid point.
  const baselineProjection = computeProjection({
    ...inputs,
    investStopAge: clampInvestStopAge({
      investStopAge: inputs.investStopAge,
      claimAge: inputs.claimAge,
      lifeExpectancy: inputs.lifeExpectancy,
    }),
  });
  const baselineScore = scoreForMode(baselineProjection, inputs.mode);

  return {
    optimalAge: best.age,
    optimalScore: best.score,
    baselineAge: inputs.claimAge,
    baselineScore,
    sweep,
    metricLabel:
      inputs.mode === "switch"
        ? "Invested pot at switch age"
        : "Total wealth at lifeExpectancy",
  };
}
