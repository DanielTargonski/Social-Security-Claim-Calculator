import { describe, it, expect } from "vitest";
import {
  computePhaseBoundaries,
  potAtPhase1End,
  potAtInvestStop,
  cashCollectedInPhase3,
  potAtAge,
  waitTotalAtAge,
  buildChartData,
  findBreakEvenAge,
} from "./chartProjection.js";
import { FRA } from "./ssRules.js";

const closeTo = (a, b, tol = 0.5) => Math.abs(a - b) < tol;

describe("computePhaseBoundaries", () => {
  it("default case: claimAge=62, investStopAge=67=FRA → only Phase 1", () => {
    const r = computePhaseBoundaries({ claimAge: 62, investStopAge: 67 });
    expect(r.phase1End).toBe(67);
    expect(r.phase1Months).toBe(60); // 5 years × 12
    expect(r.phase2Months).toBe(0);
  });
  it("investStopAge > FRA → Phase 1 + Phase 2 both have months", () => {
    const r = computePhaseBoundaries({ claimAge: 62, investStopAge: 70 });
    expect(r.phase1End).toBe(67);
    expect(r.phase1Months).toBe(60);
    expect(r.phase2Months).toBe(36); // 67 → 70 = 3 years
  });
  it("investStopAge < FRA → Phase 1 ends early, no Phase 2", () => {
    const r = computePhaseBoundaries({ claimAge: 62, investStopAge: 65 });
    expect(r.phase1End).toBe(65);
    expect(r.phase1Months).toBe(36);
    expect(r.phase2Months).toBe(0);
  });
  it("investStopAge === claimAge → no investing at all", () => {
    const r = computePhaseBoundaries({ claimAge: 64, investStopAge: 64 });
    expect(r.phase1Months).toBe(0);
    expect(r.phase2Months).toBe(0);
  });
  it("claimAge === FRA → no Phase 1, possibly Phase 2", () => {
    const r = computePhaseBoundaries({ claimAge: 67, investStopAge: 70 });
    expect(r.phase1End).toBe(67);
    expect(r.phase1Months).toBe(0);
    expect(r.phase2Months).toBe(36);
  });
});

describe("potAtPhase1End", () => {
  it("0% return → sum of contributions", () => {
    expect(potAtPhase1End({ earlyMonthlyNet: 1000, phase1Months: 36, r: 0 })).toBe(36000);
  });
  it("0 months → 0 pot", () => {
    expect(potAtPhase1End({ earlyMonthlyNet: 1000, phase1Months: 0, r: 0 })).toBe(0);
    expect(potAtPhase1End({ earlyMonthlyNet: 1000, phase1Months: 0, r: 0.005 })).toBe(0);
  });
  it("positive return → more than sum of contributions", () => {
    const sumOnly = potAtPhase1End({ earlyMonthlyNet: 1000, phase1Months: 60, r: 0 });
    const grown = potAtPhase1End({ earlyMonthlyNet: 1000, phase1Months: 60, r: 0.07 / 12 });
    expect(grown).toBeGreaterThan(sumOnly);
  });
});

describe("potAtInvestStop", () => {
  it("Phase 2 with 0 months → equals starting pot", () => {
    expect(
      potAtInvestStop({
        potAtPhase1End: 50000,
        earlyPostFRAMonthlyNet: 2000,
        phase2Months: 0,
        r: 0.07 / 12,
      })
    ).toBe(50000);
  });
  it("Phase 2 at 0% return → starting + sum of contributions", () => {
    expect(
      potAtInvestStop({
        potAtPhase1End: 50000,
        earlyPostFRAMonthlyNet: 2000,
        phase2Months: 36,
        r: 0,
      })
    ).toBe(50000 + 72000);
  });
});

describe("cashCollectedInPhase3 — split at FRA", () => {
  it("investStopAge >= FRA: only post-FRA rate ever applies", () => {
    const cash = cashCollectedInPhase3({
      age: 75,
      investStopAge: 67,
      earlyMonthlyNet: 1000,
      earlyPostFRAMonthlyNet: 2000,
    });
    expect(cash).toBe(2000 * (75 - 67) * 12);
  });
  it("investStopAge < FRA, age between investStop and FRA: only early rate", () => {
    const cash = cashCollectedInPhase3({
      age: 66,
      investStopAge: 65,
      earlyMonthlyNet: 1000,
      earlyPostFRAMonthlyNet: 2000,
    });
    expect(cash).toBe(1000 * (66 - 65) * 12);
  });
  it("investStopAge < FRA, age past FRA: split correctly", () => {
    const cash = cashCollectedInPhase3({
      age: 70,
      investStopAge: 65,
      earlyMonthlyNet: 1000,
      earlyPostFRAMonthlyNet: 2000,
    });
    // 65→67 (24 mo) at 1000, 67→70 (36 mo) at 2000
    expect(cash).toBe(1000 * 24 + 2000 * 36);
  });
  it("investStopAge === FRA: never any early-rate cash", () => {
    const cash = cashCollectedInPhase3({
      age: 70,
      investStopAge: 67,
      earlyMonthlyNet: 1000,
      earlyPostFRAMonthlyNet: 2000,
    });
    expect(cash).toBe(2000 * 36); // all post-FRA
  });
});

describe("potAtAge", () => {
  it("0 before claim age", () => {
    expect(
      potAtAge({
        age: 60,
        claimAge: 62,
        phase1End: 67,
        investStopAge: 67,
        earlyMonthlyNet: 1000,
        earlyPostFRAMonthlyNet: 1000,
        potAtPhase1End: 60000,
        potAtInvestStop: 60000,
        r: 0,
      })
    ).toBe(0);
  });
  it("matches potAtPhase1End at FRA when investStop=FRA, 0% return", () => {
    expect(
      potAtAge({
        age: 67,
        claimAge: 62,
        phase1End: 67,
        investStopAge: 67,
        earlyMonthlyNet: 1000,
        earlyPostFRAMonthlyNet: 1000,
        potAtPhase1End: 60000,
        potAtInvestStop: 60000,
        r: 0,
      })
    ).toBe(60000);
  });
});

describe("waitTotalAtAge", () => {
  it("0 before FRA", () => {
    expect(waitTotalAtAge({ age: 65, fraMonthlyNet: 2000 })).toBe(0);
    expect(waitTotalAtAge({ age: FRA - 0.01, fraMonthlyNet: 2000 })).toBe(0);
  });
  it("0 exactly at FRA (zero months elapsed)", () => {
    expect(waitTotalAtAge({ age: FRA, fraMonthlyNet: 2000 })).toBe(0);
  });
  it("monthly × months from FRA", () => {
    expect(waitTotalAtAge({ age: 70, fraMonthlyNet: 2000 })).toBe(2000 * 36);
    expect(waitTotalAtAge({ age: 85, fraMonthlyNet: 2000 })).toBe(2000 * 12 * 18);
  });
});

describe("buildChartData — invariants", () => {
  const baseChart = {
    claimAge: 62,
    investStopAge: 67,
    lifeExpectancy: 85,
    returnRate: 7,
    earlyMonthlyNet: 1500,
    earlyPostFRAMonthlyNet: 1500,
    fraMonthlyNet: 2500,
  };

  it("first row's age is min(claimAge, FRA)", () => {
    const r = buildChartData(baseChart);
    expect(r[0].age).toBeLessThanOrEqual(baseChart.claimAge);
  });
  it("last row's age is at lifeExpectancy", () => {
    const r = buildChartData(baseChart);
    expect(r[r.length - 1].age).toBeCloseTo(baseChart.lifeExpectancy, 0);
  });
  it("wait curve is non-decreasing", () => {
    const r = buildChartData(baseChart);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].wait).toBeGreaterThanOrEqual(r[i - 1].wait);
    }
  });
  it("early curve is non-decreasing (claim & invest can't go backwards)", () => {
    const r = buildChartData(baseChart);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].early).toBeGreaterThanOrEqual(r[i - 1].early - 1); // tolerance for rounding
    }
  });
  it("at 0% return, early at FRA = months × earlyMonthlyNet", () => {
    const r = buildChartData({ ...baseChart, returnRate: 0 });
    const rowAtFRA = r.find((d) => d.age >= FRA);
    const expected = baseChart.earlyMonthlyNet * 12 * (FRA - baseChart.claimAge);
    expect(closeTo(rowAtFRA.pot, expected, 5)).toBe(true);
  });
  it("when investStopAge > lifeExpectancy: pot grows whole life, no cash", () => {
    const r = buildChartData({ ...baseChart, investStopAge: 90, lifeExpectancy: 85 });
    const finalRow = r[r.length - 1];
    // pot = early (no cash collected)
    expect(finalRow.pot).toBe(finalRow.early);
  });
  it("claimAge === FRA: pre-FRA rows show 0 early", () => {
    const r = buildChartData({ ...baseChart, claimAge: FRA });
    const preFRA = r.filter((d) => d.age < FRA);
    for (const row of preFRA) expect(row.early).toBe(0);
  });
});

describe("buildChartData — lumpy SSA withholding pattern", () => {
  // SSA withholds entire monthly checks at the start of each year until
  // the projected withholding amount is reached, then resumes paying full
  // checks. The averaged model used to spread withholding evenly across
  // 12 months — same total dollars per year but slightly more compound
  // growth (averaged contributions land "earlier" than they actually do).

  const baseLumpyChart = {
    claimAge: 62,
    investStopAge: 67,
    lifeExpectancy: 85,
    earlyPostFRAMonthlyNet: 1500,
    fraMonthlyNet: 2500,
  };

  it("with lumpy=null, behaves identically to constant earlyMonthlyNet", () => {
    const explicit = buildChartData({
      ...baseLumpyChart,
      returnRate: 0,
      earlyMonthlyNet: 1000,
      lumpy: null,
    });
    const omitted = buildChartData({
      ...baseLumpyChart,
      returnRate: 0,
      earlyMonthlyNet: 1000,
    });
    expect(explicit[explicit.length - 1].pot).toBe(omitted[omitted.length - 1].pot);
  });

  it("at 0% return, lumpy and constant give the same year-end pot total", () => {
    // 8 full-withhold months + 1 partial month at $1250 + 3 full months at $1500.
    // Annual contribution = 8×0 + 1×1250 + 3×1500 = $5,750.
    // 5 years pre-FRA = $28,750.
    const lumpyData = buildChartData({
      ...baseLumpyChart,
      returnRate: 0,
      earlyMonthlyNet: 1500,
      lumpy: { monthsWithheldFull: 8, partialMonthlyNet: 1250 },
    });
    const rowAt67 = lumpyData.find((d) => d.age >= 67);
    expect(rowAt67.pot).toBe(5750 * 5);
  });

  it("at positive return, lumpy pot is < averaged pot (later contribs = less compounding)", () => {
    const fullMonthly = 1500;
    const monthsWithheldFull = 8;
    const annualWithholding = monthsWithheldFull * fullMonthly; // $12,000
    const annualNoWithhold = fullMonthly * 12; // $18,000
    const averagedMonthly = (annualNoWithhold - annualWithholding) / 12; // $500

    const lumpyData = buildChartData({
      ...baseLumpyChart,
      returnRate: 7,
      earlyMonthlyNet: fullMonthly,
      lumpy: { monthsWithheldFull, partialMonthlyNet: fullMonthly }, // residual = 0, no transition month
    });
    const averagedData = buildChartData({
      ...baseLumpyChart,
      returnRate: 7,
      earlyMonthlyNet: averagedMonthly,
    });

    const rowAt67Lumpy = lumpyData.find((d) => d.age >= 67);
    const rowAt67Averaged = averagedData.find((d) => d.age >= 67);
    expect(rowAt67Lumpy.pot).toBeLessThan(rowAt67Averaged.pot);
  });

  it("monthsWithheldFull=0 (no withholding) collapses to constant contribs", () => {
    const data = buildChartData({
      ...baseLumpyChart,
      returnRate: 0,
      earlyMonthlyNet: 1500,
      lumpy: { monthsWithheldFull: 0, partialMonthlyNet: 1500 },
    });
    const rowAt67 = data.find((d) => d.age >= 67);
    expect(rowAt67.pot).toBe(1500 * 12 * 5);
  });
});

describe("findBreakEvenAge", () => {
  it("returns null in switch mode", () => {
    expect(findBreakEvenAge({ chartData: [], claimAge: 64, mode: "switch" })).toBeNull();
  });
  it("returns null when claiming exactly at FRA", () => {
    expect(findBreakEvenAge({ chartData: [], claimAge: FRA, mode: "retirement" })).toBeNull();
  });
  it("returns null when no crossover exists in the data", () => {
    const data = [
      { age: 67, early: 100, wait: 0 },
      { age: 70, early: 200, wait: 100 },
    ];
    expect(findBreakEvenAge({ chartData: data, claimAge: 64, mode: "retirement" })).toBeNull();
  });
  it("interpolates an age when the lines cross", () => {
    const data = [
      { age: 70, early: 100, wait: 50 },
      { age: 75, early: 100, wait: 150 }, // crossover between
    ];
    const r = findBreakEvenAge({ chartData: data, claimAge: 62, mode: "retirement" });
    expect(r).toBeGreaterThan(70);
    expect(r).toBeLessThan(75);
  });
});

describe("buildChartData — investedFraction", () => {
  // The "early" line equals (invested pot) + (cumulative cash). investedFraction
  // shifts how much of each pre-investStopAge check goes to each, but the
  // early total at lifeExpectancy should change predictably:
  //   - At return rate 0, fraction is irrelevant (no compounding) — the
  //     early total equals total checks received regardless of split.
  //   - At positive return, lower fraction → less compounding → lower total.
  const baseArgs = {
    claimAge: 62,
    investStopAge: 67,
    lifeExpectancy: 85,
    earlyMonthlyNet: 1000,
    earlyPostFRAMonthlyNet: 1000,
    fraMonthlyNet: 1500,
  };

  it("at returnRate=0, investedFraction does not affect the early total", () => {
    const full = buildChartData({ ...baseArgs, returnRate: 0, investedFraction: 1 });
    const partial = buildChartData({ ...baseArgs, returnRate: 0, investedFraction: 0.3 });
    const none = buildChartData({ ...baseArgs, returnRate: 0, investedFraction: 0 });
    expect(closeTo(full.at(-1).early, partial.at(-1).early)).toBe(true);
    expect(closeTo(partial.at(-1).early, none.at(-1).early)).toBe(true);
  });

  it("at positive returnRate, lowering investedFraction lowers the early total", () => {
    const full = buildChartData({ ...baseArgs, returnRate: 7, investedFraction: 1 });
    const half = buildChartData({ ...baseArgs, returnRate: 7, investedFraction: 0.5 });
    const none = buildChartData({ ...baseArgs, returnRate: 7, investedFraction: 0 });
    expect(full.at(-1).early).toBeGreaterThan(half.at(-1).early);
    expect(half.at(-1).early).toBeGreaterThan(none.at(-1).early);
  });

  it("investedFraction=0 collapses the early line to a pure linear sum of checks", () => {
    const none = buildChartData({ ...baseArgs, returnRate: 7, investedFraction: 0 });
    // 1000/mo × 12 mo/yr × 23 yr (62→85) = 276,000
    expect(closeTo(none.at(-1).early, 276000, 1)).toBe(true);
    expect(none.at(-1).pot).toBe(0);
  });

  it("defaults to investedFraction=1 when omitted (current calculator behavior)", () => {
    const explicit = buildChartData({ ...baseArgs, returnRate: 7, investedFraction: 1 });
    const omitted = buildChartData({ ...baseArgs, returnRate: 7 });
    expect(omitted.at(-1).early).toBe(explicit.at(-1).early);
    expect(omitted.at(-1).pot).toBe(explicit.at(-1).pot);
  });
});
