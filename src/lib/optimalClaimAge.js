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

// Level monthly draw that spends `pot` down to exactly $0 over `months` at
// monthly real rate r (end-of-month draws). The calculator is in real
// dollars, so a level draw is an inflation-adjusted income.
export function levelMonthlyDraw({ pot, months, r }) {
  if (pot <= 0 || months <= 0) return 0;
  if (r > 0) return (pot * r) / (1 - Math.pow(1 + r, -months));
  return pot / months;
}

// Retirement income for one claim age, drawing from both pots together:
//   - the Social Security pot pays the lifelong net check (it behaves like
//     an inflation-protected bond, so it never runs down; see lib/ssPot.js)
//   - the invested pot is drawn as a level monthly income from investStopAge
//     (when contributions stop) that runs it to $0 at lifeExpectancy
// So life expectancy matters: a longer life spreads the invested pot over
// more months (a smaller draw), which tilts the answer toward waiting.
//
//   monthly     steady income once both are flowing: check + pot draw
//   totalDrawn  every spendable dollar through lifeExpectancy: checks taken
//               as cash plus every pot draw
export function retirementIncome(
  projection,
  { investStopAge, lifeExpectancy, returnRate }
) {
  const months = Math.max(0, Math.round((lifeExpectancy - investStopAge) * 12));
  const potDraw = levelMonthlyDraw({
    pot: projection.potAtStopRow,
    months,
    r: returnRate / 100 / 12,
  });
  const check = projection.earlyPostFRAMonthlyNetRetired;
  // chartData's `early` = pot + cash collected, so this is the cash part.
  const cashCollected = projection.finalEarly - projection.finalPot;
  return {
    check,
    potDraw,
    monthly: check + potDraw,
    totalDrawn: cashCollected + potDraw * months,
  };
}

// The user's own invest-stop slider setting. App passes `investStopAge`
// already raised to the CURRENT claim age (effectiveInvestStopAge), so
// sweeping from that would make both recommendations depend on the pick: at
// a pick of 70 every candidate would invest until 70, and "Use" could bounce
// between two answers. Each candidate starts from the user's setting instead;
// callers that don't pass it (tests, older call sites) fall back to
// investStopAge.
function preferredInvestStopAge(inputs) {
  return inputs.preferredInvestStopAge ?? inputs.investStopAge;
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

// retirementIncome at one candidate claim age. The wealth sweep rounds the
// invest-stop age up to the next birthday when the claim lands past the
// user's invest-stop age (clampInvestStopAge), which would "invest" up to 11
// months of checks the user never chose to invest and make the income
// optimum jump to odd ages like 69 yr 1 mo. For income, a claim past the
// user's invest-stop age invests nothing, so re-run the projection with the
// stop at the claim age when the two differ.
function incomeAtAge(inputs, claimAge, sweepInvestStopAge, projection) {
  const investStopAge = Math.min(
    Math.max(preferredInvestStopAge(inputs), claimAge),
    inputs.lifeExpectancy
  );
  const incomeProjection =
    investStopAge === sweepInvestStopAge
      ? projection
      : computeProjection({ ...inputs, claimAge, investStopAge });
  return retirementIncome(incomeProjection, {
    investStopAge,
    lifeExpectancy: inputs.lifeExpectancy,
    returnRate: inputs.returnRate,
  });
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
//     income: {          // second recommendation: highest monthly income
//       optimalAge,      //   from both pots (see retirementIncome)
//       optimal,         //   retirementIncome at optimalAge
//       baseline,        //   retirementIncome at the user's pick
//     },
//   }
export function findOptimalClaimAge(inputs) {
  const { earliest, latest } = rangeForMode(inputs.mode);
  // Iterate in integer month steps to dodge float-precision creep that
  // would otherwise cause `age <= latest` to terminate one step short on
  // (latest - earliest) * 12 not landing exactly on an integer.
  const totalMonths = Math.round((latest - earliest) * 12);

  let best = null;
  let bestIncome = null;
  const sweep = [];

  for (let i = 0; i <= totalMonths; i++) {
    const age = earliest + i / 12;
    const investStopAge = clampInvestStopAge({
      investStopAge: preferredInvestStopAge(inputs),
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
    const income = incomeAtAge(inputs, age, investStopAge, projection);
    if (bestIncome === null || income.monthly > bestIncome.income.monthly) {
      bestIncome = { age, income };
    }
  }

  // Score at the user's currently-chosen claim age. Computed separately
  // (not pulled from the sweep) so the baseline reflects the user's actual
  // claimAge value even when it doesn't land on a 1/12-yr grid point.
  const baselineInvestStopAge = clampInvestStopAge({
    investStopAge: preferredInvestStopAge(inputs),
    claimAge: inputs.claimAge,
    lifeExpectancy: inputs.lifeExpectancy,
  });
  const baselineProjection = computeProjection({
    ...inputs,
    investStopAge: baselineInvestStopAge,
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
    income: {
      optimalAge: bestIncome.age,
      optimal: bestIncome.income,
      baseline: incomeAtAge(
        inputs,
        inputs.claimAge,
        baselineInvestStopAge,
        baselineProjection
      ),
    },
  };
}
