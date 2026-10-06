import { describe, it, expect } from "vitest";
import {
  drawdownBalance,
  depletionMonths,
  computePotIncome,
} from "./potIncome.js";
import { buildChartData } from "./chartProjection.js";

// Month-by-month reference simulation the closed forms must match.
function simulate({ startPot, monthlyDraw, months, r }) {
  let bal = startPot;
  for (let m = 0; m < months; m++) bal = Math.max(0, bal * (1 + r) - monthlyDraw);
  return bal;
}

describe("drawdownBalance", () => {
  it("returns the starting pot at month 0", () => {
    expect(
      drawdownBalance({ startPot: 100000, monthlyDraw: 400, months: 0, r: 0.005 })
    ).toBe(100000);
  });

  it("at 0% return, draws down linearly", () => {
    expect(
      drawdownBalance({ startPot: 120000, monthlyDraw: 400, months: 60, r: 0 })
    ).toBe(96000);
  });

  it("matches a month-by-month simulation at a positive return", () => {
    const args = { startPot: 250000, monthlyDraw: 1200, months: 180, r: 0.07 / 12 };
    expect(drawdownBalance(args)).toBeCloseTo(simulate(args), 4);
  });

  it("floors at zero once the pot is exhausted", () => {
    expect(
      drawdownBalance({ startPot: 10000, monthlyDraw: 1000, months: 50, r: 0.001 })
    ).toBe(0);
  });
});

describe("depletionMonths", () => {
  it("is null when the pot's earnings cover the draw", () => {
    // 4% draw on a 5% real return — the pot never shrinks.
    expect(
      depletionMonths({ startPot: 300000, monthlyDraw: 1000, r: 0.05 / 12 })
    ).toBeNull();
  });

  it("is null when nothing is drawn or there is no pot", () => {
    expect(depletionMonths({ startPot: 0, monthlyDraw: 0, r: 0.005 })).toBeNull();
    expect(depletionMonths({ startPot: 1000, monthlyDraw: 0, r: 0 })).toBeNull();
  });

  it("at 0% return, a 4% draw lasts exactly 25 years", () => {
    const startPot = 300000;
    const monthlyDraw = (startPot * 0.04) / 12;
    expect(depletionMonths({ startPot, monthlyDraw, r: 0 })).toBeCloseTo(300, 9);
  });

  it("at a return below the draw rate, the balance hits zero at the reported month", () => {
    const startPot = 300000;
    const monthlyDraw = (startPot * 0.06) / 12;
    const r = 0.02 / 12;
    const n = depletionMonths({ startPot, monthlyDraw, r });
    expect(n).toBeGreaterThan(0);
    expect(drawdownBalance({ startPot, monthlyDraw, months: n, r })).toBeCloseTo(0, 4);
    expect(simulate({ startPot, monthlyDraw, months: Math.floor(n), r })).toBeGreaterThan(0);
  });
});

// A real chartData run: claim at 62, invest $1,000/mo until 67, wait gets
// $1,500/mo from 67.
function chart({ investStopAge = 67, returnRate = 5, waitInvestedFraction = 1 } = {}) {
  return buildChartData({
    claimAge: 62,
    investStopAge,
    lifeExpectancy: 90,
    returnRate,
    earlyMonthlyNet: 1000,
    earlyPostFRAMonthlyNet: 1000,
    fraMonthlyNet: 1500,
    waitInvestedFraction,
  });
}

const baseArgs = {
  investStopAge: 67,
  lifeExpectancy: 90,
  earlyPostFRAMonthlyNet: 1000,
  fraMonthlyNet: 1500,
};

describe("computePotIncome", () => {
  it("leaves the pot identical to the main model up to the draw start", () => {
    const chartData = chart();
    const res = computePotIncome({
      ...baseArgs,
      chartData,
      returnRate: 5,
      withdrawalRate: 4,
    });
    expect(res.startAge).toBe(67);
    for (const row of res.rows.filter((d) => d.age <= 67)) {
      const src = chartData.find((d) => d.age === row.age);
      expect(row.pot).toBe(src.pot);
    }
    expect(res.early.startPot).toBe(chartData.find((d) => d.age >= 67).pot);
  });

  it("draws withdrawalRate% of the starting pot per year, as a fixed monthly amount", () => {
    const res = computePotIncome({
      ...baseArgs,
      chartData: chart(),
      returnRate: 5,
      withdrawalRate: 4,
    });
    expect(res.early.monthlyDraw).toBeCloseTo((res.early.startPot * 0.04) / 12, 6);
    expect(res.earlyDraw).toBeCloseTo(res.early.monthlyDraw, 6);
    expect(res.earlyIncome).toBeCloseTo(1000 + res.early.monthlyDraw, 6);
    expect(res.waitIncome).toBe(1500);
    expect(res.incomeAdvantage).toBeCloseTo(res.earlyIncome - 1500, 6);
  });

  it("when the return beats the draw rate, the pot never runs out and keeps growing", () => {
    const res = computePotIncome({
      ...baseArgs,
      chartData: chart({ returnRate: 7 }),
      returnRate: 7,
      withdrawalRate: 4,
    });
    expect(res.early.depletionAge).toBeNull();
    expect(res.early.finalPot).toBeGreaterThan(res.early.startPot);
    expect(res.early.totalDrawn).toBeCloseTo(res.early.monthlyDraw * 12 * 23, 4);
  });

  it("at 0% return, a 4% draw empties the set-aside checks 25 years after draws begin", () => {
    const res = computePotIncome({
      ...baseArgs,
      lifeExpectancy: 95,
      chartData: buildChartData({
        claimAge: 62,
        investStopAge: 67,
        lifeExpectancy: 95,
        returnRate: 0,
        earlyMonthlyNet: 1000,
        earlyPostFRAMonthlyNet: 1000,
        fraMonthlyNet: 1500,
      }),
      returnRate: 0,
      withdrawalRate: 4,
    });
    expect(res.early.startPot).toBe(60000);
    expect(res.early.depletionAge).toBeCloseTo(92, 9);
    expect(res.early.finalPot).toBe(0);
    // Drawn only until the pot runs dry — every set-aside dollar comes back.
    expect(res.early.totalDrawn).toBeCloseTo(60000, 6);
  });

  it("stops drawing once the pot is empty, so income falls back to the check", () => {
    const res = computePotIncome({
      ...baseArgs,
      investStopAge: 64,
      lifeExpectancy: 90,
      chartData: chart({ investStopAge: 64, returnRate: 0 }),
      returnRate: 0,
      withdrawalRate: 40, // 2.5-year runway: empty before 67
    });
    expect(res.early.depletionAge).toBeLessThan(67);
    expect(res.incomeAge).toBe(67);
    expect(res.earlyDraw).toBe(0);
    expect(res.earlyIncome).toBe(1000);
  });

  it("draws from the wait+invest pot too when wait invests past FRA", () => {
    const chartData = chart({ investStopAge: 70 });
    const res = computePotIncome({
      ...baseArgs,
      investStopAge: 70,
      chartData,
      returnRate: 5,
      withdrawalRate: 4,
    });
    expect(res.wait.startPot).toBeGreaterThan(0);
    expect(res.wait.startPot).toBe(chartData.find((d) => d.age >= 70).waitPot);
    expect(res.incomeAge).toBe(70);
    expect(res.waitIncome).toBeCloseTo(1500 + (res.wait.startPot * 0.04) / 12, 6);
  });

  it("has no wait-side draw when wait invests nothing", () => {
    const res = computePotIncome({
      ...baseArgs,
      investStopAge: 70,
      chartData: chart({ investStopAge: 70, waitInvestedFraction: 0 }),
      returnRate: 5,
      withdrawalRate: 4,
    });
    expect(res.wait.startPot).toBe(0);
    expect(res.waitDraw).toBe(0);
    expect(res.waitIncome).toBe(1500);
  });

  it("uses the retired check tier once post-FRA work has ended", () => {
    const common = {
      ...baseArgs,
      chartData: chart(),
      returnRate: 5,
      withdrawalRate: 4,
      earlyPostFRAMonthlyNetRetired: 1100,
      fraMonthlyNetRetired: 1650,
    };
    const working = computePotIncome({ ...common, postFRAWorkEndAge: 70 });
    expect(working.earlyCheck).toBe(1000);
    expect(working.waitCheck).toBe(1500);
    const retired = computePotIncome({ ...common, postFRAWorkEndAge: 67 });
    expect(retired.earlyCheck).toBe(1100);
    expect(retired.waitCheck).toBe(1650);
  });

  it("an empty pot (nothing invested) means no draw", () => {
    const chartData = buildChartData({
      claimAge: 62,
      investStopAge: 67,
      lifeExpectancy: 90,
      returnRate: 5,
      earlyMonthlyNet: 1000,
      earlyPostFRAMonthlyNet: 1000,
      fraMonthlyNet: 1500,
      investedFraction: 0,
    });
    const res = computePotIncome({
      ...baseArgs,
      chartData,
      returnRate: 5,
      withdrawalRate: 4,
    });
    expect(res.early.startPot).toBe(0);
    expect(res.early.monthlyDraw).toBe(0);
    expect(res.early.depletionAge).toBeNull();
    expect(res.earlyIncome).toBe(1000);
  });
});
