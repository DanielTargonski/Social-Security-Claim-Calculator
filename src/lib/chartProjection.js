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

// Build the full chartData array used by the recharts <LineChart>.
// One row per quarter-year between min(claimAge, FRA) and lifeExpectancy.
//   age, early, pot, wait
//   - early = pot + cashCollectedInPhase3 (the total claim-and-invest position)
//   - pot   = invested-pot value alone (dashed line on the chart)
//   - wait  = wait-until-FRA cumulative
export function buildChartData({
  claimAge,
  investStopAge,
  lifeExpectancy,
  returnRate,
  earlyMonthlyNet,
  earlyPostFRAMonthlyNet,
  fraMonthlyNet,
}) {
  const data = [];
  const r = returnRate / 100 / 12;
  const startAge = Math.min(claimAge, FRA);

  const { phase1End, phase1Months, phase2Months } = computePhaseBoundaries({
    claimAge,
    investStopAge,
  });

  const basePotPhase1 = potAtPhase1End({
    earlyMonthlyNet,
    phase1Months,
    r,
  });
  const basePotPhase3 = potAtInvestStop({
    potAtPhase1End: basePotPhase1,
    earlyPostFRAMonthlyNet,
    phase2Months,
    r,
  });

  for (let age = startAge; age <= lifeExpectancy; age += 0.25) {
    const pot = potAtAge({
      age,
      claimAge,
      phase1End,
      investStopAge,
      earlyMonthlyNet,
      earlyPostFRAMonthlyNet,
      potAtPhase1End: basePotPhase1,
      potAtInvestStop: basePotPhase3,
      r,
    });

    const cash =
      age > investStopAge
        ? cashCollectedInPhase3({
            age,
            investStopAge,
            earlyMonthlyNet,
            earlyPostFRAMonthlyNet,
          })
        : 0;

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
export function findBreakEvenAge({ chartData, claimAge, mode }) {
  if (mode === "switch") return null;
  if (Math.abs(claimAge - FRA) < 0.01) return null;
  for (let i = 1; i < chartData.length; i++) {
    const a = chartData[i - 1];
    const b = chartData[i];
    const prevDiff = a.early - a.wait;
    const currDiff = b.early - b.wait;
    if (prevDiff * currDiff < 0) {
      const t = prevDiff / (prevDiff - currDiff);
      return parseFloat((a.age + t * (b.age - a.age)).toFixed(1));
    }
  }
  return null;
}
