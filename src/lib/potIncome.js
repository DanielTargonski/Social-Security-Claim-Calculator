// "The pot as a paycheck" — the income view of the invested pot.
//
// The main chart scores each scenario by total dollars in hand at
// lifeExpectancy, with the pot compounding untouched after investStopAge.
// This module answers a different question: if the claimant instead treats
// the pot as a retirement fund and draws a fixed, inflation-adjusted income
// from it, what monthly income does each scenario support, and how much of
// the pot is still left at the end?
//
// The draw follows the classic "4% rule" shape: on the day contributions stop
// (investStopAge), withdraw withdrawalRate% of the balance per year, then keep
// withdrawing that same REAL dollar amount every year after. The calculator
// works in real (today's) dollars, so a constant real draw IS the
// inflation-adjusted draw. Deterministic like the rest of the model: the pot
// earns the same real return every month, no sequence-of-returns risk.
//
// Up to investStopAge the pot is exactly the main model's pot (read from
// chartData), so the two views agree on how big the pot gets. After it there
// are no contributions, so the drawdown has a closed form.

import { FRA } from "./ssRules.js";

// Balance after `months` of drawing `monthlyDraw` from `startPot` growing at
// monthly rate r (end-of-month growth, then the draw). Floors at 0 — once the
// pot is empty it stays empty.
export function drawdownBalance({ startPot, monthlyDraw, months, r }) {
  if (months <= 0) return startPot;
  if (r > 0) {
    const growth = Math.pow(1 + r, months);
    return Math.max(
      0,
      startPot * growth - (monthlyDraw * (growth - 1)) / r
    );
  }
  return Math.max(0, startPot - monthlyDraw * months);
}

// Months until the pot runs dry, or null when it never does (the pot's
// monthly earnings cover the draw, or there is nothing being drawn).
export function depletionMonths({ startPot, monthlyDraw, r }) {
  if (startPot <= 0 || monthlyDraw <= 0) return null;
  if (r > 0) {
    if (startPot * r >= monthlyDraw) return null;
    return Math.log(monthlyDraw / (monthlyDraw - startPot * r)) / Math.log(1 + r);
  }
  return startPot / monthlyDraw;
}

// One side (early or wait) of the drawdown, starting from the pot on the
// draw-start row.
function drawdownSide({ startPot, withdrawalRate, r, startAge }) {
  const monthlyDraw = (startPot * withdrawalRate) / 100 / 12;
  const months = depletionMonths({ startPot, monthlyDraw, r });
  return {
    startPot,
    monthlyDraw,
    depletionAge: months == null ? null : startAge + months / 12,
  };
}

// The draw actually paid at `age`: nothing before draws begin or after the
// pot is empty.
function drawAtAge(side, startAge, age) {
  if (age < startAge) return 0;
  if (side.depletionAge != null && age >= side.depletionAge) return 0;
  return side.monthlyDraw;
}

// Total dollars drawn from startAge through lifeExpectancy (stopping early if
// the pot runs dry).
function totalDrawn(side, startAge, lifeExpectancy) {
  const endAge =
    side.depletionAge == null
      ? lifeExpectancy
      : Math.min(lifeExpectancy, side.depletionAge);
  return side.monthlyDraw * Math.max(0, endAge - startAge) * 12;
}

// Build the income view from the main model's chartData.
//
// Inputs:
//   chartData       rows from buildChartData (uses age, pot, waitPot)
//   investStopAge   draws begin on the first row at or past this age (the same
//                   row the "Pot at {investStopAge}" card reads)
//   lifeExpectancy, returnRate (real %), withdrawalRate (% per year)
//   earlyPostFRAMonthlyNet / ...Retired, fraMonthlyNet / ...Retired,
//   postFRAWorkEndAge
//                   the post-FRA net checks for each scenario, so the income
//                   comparison uses whichever tax tier applies at incomeAge
//
// The income comparison is taken at incomeAge = max(draw start, FRA): the
// first age where both scenarios are collecting a check and the early pot is
// paying out, clamped to lifeExpectancy.
export function computePotIncome({
  chartData,
  investStopAge,
  lifeExpectancy,
  returnRate,
  withdrawalRate,
  earlyPostFRAMonthlyNet,
  earlyPostFRAMonthlyNetRetired = earlyPostFRAMonthlyNet,
  fraMonthlyNet,
  fraMonthlyNetRetired = fraMonthlyNet,
  postFRAWorkEndAge = FRA,
}) {
  const r = returnRate / 100 / 12;
  const startRow =
    chartData.find((d) => d.age >= investStopAge) ??
    chartData[chartData.length - 1];
  const startAge = startRow.age;

  const early = drawdownSide({
    startPot: startRow.pot,
    withdrawalRate,
    r,
    startAge,
  });
  const wait = drawdownSide({
    startPot: startRow.waitPot,
    withdrawalRate,
    r,
    startAge,
  });

  const rows = chartData.map((d) => {
    if (d.age < startAge) return { age: d.age, pot: d.pot, waitPot: d.waitPot };
    const months = (d.age - startAge) * 12;
    return {
      age: d.age,
      pot: Math.round(
        drawdownBalance({
          startPot: early.startPot,
          monthlyDraw: early.monthlyDraw,
          months,
          r,
        })
      ),
      waitPot: Math.round(
        drawdownBalance({
          startPot: wait.startPot,
          monthlyDraw: wait.monthlyDraw,
          months,
          r,
        })
      ),
    };
  });

  const incomeAge = Math.min(lifeExpectancy, Math.max(startAge, FRA));
  const retired = incomeAge >= postFRAWorkEndAge;
  const earlyCheck = retired
    ? earlyPostFRAMonthlyNetRetired
    : earlyPostFRAMonthlyNet;
  const waitCheck = retired ? fraMonthlyNetRetired : fraMonthlyNet;
  const earlyDraw = drawAtAge(early, startAge, incomeAge);
  const waitDraw = drawAtAge(wait, startAge, incomeAge);
  const earlyIncome = earlyCheck + earlyDraw;
  const waitIncome = waitCheck + waitDraw;

  const last = rows[rows.length - 1];
  return {
    startAge,
    rows,
    early: {
      ...early,
      totalDrawn: totalDrawn(early, startAge, lifeExpectancy),
      finalPot: last.pot,
    },
    wait: {
      ...wait,
      totalDrawn: totalDrawn(wait, startAge, lifeExpectancy),
      finalPot: last.waitPot,
    },
    incomeAge,
    earlyCheck,
    earlyDraw,
    earlyIncome,
    waitCheck,
    waitDraw,
    waitIncome,
    incomeAdvantage: earlyIncome - waitIncome,
  };
}
