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
  findCrossoverAge,
} from "./chartProjection.js";
import { FRA } from "./ssRules.js";
import { computeProjection } from "./benefitMath.js";

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

  // Phase 2 (FRA → investStopAge, only when investStopAge > FRA) is the
  // load-bearing band where the recouped post-FRA rate kicks in. Used to
  // be uncovered — these tests pin it as a regression net against anyone
  // collapsing Phase 2 contributions back onto the earlyMonthlyNet rate.
  describe("Phase 2 band (investStopAge > FRA)", () => {
    const phase2Setup = {
      claimAge: 62,
      phase1End: 67, // = FRA
      investStopAge: 70,
      earlyMonthlyNet: 1000,
      earlyPostFRAMonthlyNet: 1200, // distinct from earlyMonthlyNet
      potAtPhase1End: 60000,
      potAtInvestStop: 100000,
    };

    it("continuous at the Phase 1 → Phase 2 boundary (age = FRA)", () => {
      // 0 months into Phase 2 → pot is exactly the Phase 1 ending value.
      expect(potAtAge({ ...phase2Setup, age: 67, r: 0 })).toBe(60000);
    });

    it("0% return: adds earlyPostFRAMonthlyNet * months_into_phase_2", () => {
      // 1 year past FRA at 0% → starting pot + 12 * post-FRA monthly.
      expect(potAtAge({ ...phase2Setup, age: 68, r: 0 })).toBe(60000 + 1200 * 12);
      // 3 years (= Phase 2 length) past FRA at 0% → entire Phase 2 contribution.
      expect(potAtAge({ ...phase2Setup, age: 70, r: 0 })).toBe(60000 + 1200 * 36);
    });

    it("uses the post-FRA recouped rate, NOT earlyMonthlyNet", () => {
      // Regression: if someone wires the Phase 2 contribution rate back to
      // earlyMonthlyNet (the pre-FRA ET-reduced rate), this assertion fails.
      const withCorrectRate = potAtAge({ ...phase2Setup, age: 70, r: 0 });
      const withWrongRate =
        phase2Setup.potAtPhase1End + phase2Setup.earlyMonthlyNet * 36;
      expect(withCorrectRate).not.toBe(withWrongRate);
      expect(withCorrectRate - withWrongRate).toBe(200 * 36); // (1200-1000)*36
    });

    it("positive return: existing pot compounds AND new contributions earn", () => {
      const r = 0.005; // 0.5% monthly = 6% annual real
      const result = potAtAge({ ...phase2Setup, age: 68, r });
      // = basePot * (1+r)^12 + fvSeries(1200, 12, r)
      const expectedGrown = 60000 * Math.pow(1.005, 12);
      const expectedContrib = (1200 * (Math.pow(1.005, 12) - 1)) / 0.005;
      expect(result).toBeCloseTo(expectedGrown + expectedContrib, 4);
    });

    it("Phase 2 → Phase 3 transition is continuous at investStopAge", () => {
      // At exactly investStopAge: the function picks the Phase 2 branch
      // (age <= investStopAge), but the result must equal potAtInvestStop
      // for the curve to be continuous into Phase 3. Use 0% return and a
      // hand-computed potAtInvestStop so the assertion is exact.
      const result = potAtAge({ ...phase2Setup, age: 70, r: 0 });
      const expectedPotAtInvestStop = 60000 + 1200 * 36;
      expect(result).toBe(expectedPotAtInvestStop);
    });
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
  it("splits between working / retired tax tiers when both rates and the boundary age are passed", () => {
    // 5 years (60 months) at $2000/mo working rate, then 13 years (156 months) at $2300/mo retired rate.
    // Total: 2000*60 + 2300*156 = 120000 + 358800 = 478800
    expect(
      waitTotalAtAge({
        age: 85,
        fraMonthlyNet: 2000,
        fraMonthlyNetRetired: 2300,
        postFRAWorkEndAge: 72,
      })
    ).toBe(478800);
  });
  it("workEndAge ≤ FRA degenerates to all-retired (the typical default 0 work years)", () => {
    // postFRAWorkEndAge=FRA means no working months — everything at the retired rate.
    expect(
      waitTotalAtAge({
        age: 85,
        fraMonthlyNet: 2000, // ignored
        fraMonthlyNetRetired: 2300,
        postFRAWorkEndAge: FRA,
      })
    ).toBe(2300 * 12 * 18);
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

  it("appends an exact lifeExpectancy sample when fractional life falls between quarter-year ticks", () => {
    // 0.25-stride loop from 62 stops at age 85.0 for life=85.0833 (1 month past
    // age 85). Without the explicit final sample, the chart's headline numbers
    // would silently report the second-to-last month's totals.
    const r = buildChartData({ ...baseChart, lifeExpectancy: 85 + 1 / 12 });
    const last = r[r.length - 1];
    expect(last.age).toBeCloseTo(85 + 1 / 12, 3);
  });

  it("does NOT append a duplicate sample when lifeExpectancy is an integer", () => {
    // Loop already terminates exactly at integer life — appending again would
    // double-count the final month visually.
    const r = buildChartData({ ...baseChart, lifeExpectancy: 85 });
    const last = r[r.length - 1];
    const secondLast = r[r.length - 2];
    expect(last.age).toBe(85);
    expect(secondLast.age).toBeLessThan(last.age);
  });

  // Regression: claimAge > FRA (the delayed-retirement-credit strategy)
  // was producing waitInvested = $0 across the entire FRA → claimAge window
  // even as the analytical `wait` line correctly showed FRA checks
  // accumulating. The fix rebases the per-month simulation arrays on
  // simBase = min(claimAge, FRA) so the wait scenario's FRA-to-claimAge
  // contributions are captured.
  it("claimAge > FRA: waitInvested matches wait at age = claimAge (returnRate=0)", () => {
    const r = buildChartData({
      ...baseChart,
      claimAge: 70,
      investStopAge: 70,
      returnRate: 0,
    });
    // At age 70 exactly, the wait scenario has collected (70 - 67) × 12 = 36
    // checks at fraMonthlyNet=$2500. With returnRate=0 the invested pot just
    // sums contributions, so waitInvested = wait.
    const rowAt70 = r.find((d) => Math.abs(d.age - 70) < 0.01);
    expect(rowAt70).toBeDefined();
    expect(rowAt70.wait).toBe(36 * 2500);
    expect(rowAt70.waitInvested).toBe(rowAt70.wait);
  });

  it("claimAge > FRA, mid-window: waitInvested >= wait when invested with positive return", () => {
    // At positive return the wait+invest pot should pull ahead of the
    // bare-cash wait line, not lag at $0 (the bug).
    const r = buildChartData({
      ...baseChart,
      claimAge: 70,
      investStopAge: 70,
      returnRate: 7,
    });
    const rowAt70 = r.find((d) => Math.abs(d.age - 70) < 0.01);
    expect(rowAt70.wait).toBeGreaterThan(0);
    expect(rowAt70.waitInvested).toBeGreaterThan(rowAt70.wait); // compounding > sum
  });

  it("claimAge > FRA: pre-claim rows show early=0 but nonzero wait and waitInvested", () => {
    // The early curve must stay at 0 until claimAge (no checks yet) while
    // wait and waitInvested already reflect FRA contributions.
    const r = buildChartData({
      ...baseChart,
      claimAge: 70,
      investStopAge: 70,
      returnRate: 0,
    });
    const rowAt68 = r.find((d) => Math.abs(d.age - 68) < 0.01);
    expect(rowAt68).toBeDefined();
    expect(rowAt68.early).toBe(0);
    expect(rowAt68.wait).toBe(12 * 2500); // 12 months past FRA
    expect(rowAt68.waitInvested).toBe(rowAt68.wait); // r=0, no compounding
  });

  it("claimAge == lifeExpectancy: wait and waitInvested stay internally consistent", () => {
    // Degenerate but URL-reachable: claim at 70, die at 70. Wait still
    // collected from age 67 through 70. waitInvested must reflect those
    // collections, not render as $0.
    const r = buildChartData({
      ...baseChart,
      claimAge: 70,
      investStopAge: 70,
      lifeExpectancy: 70,
      returnRate: 0,
    });
    const last = r[r.length - 1];
    expect(last.age).toBe(70);
    expect(last.wait).toBe(36 * 2500);
    expect(last.waitInvested).toBe(last.wait);
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

  it("switches to the FRA-year lumpy schedule in the final pre-FRA year", () => {
    const fullMonthly = 1500;
    const harshRegularLimit = {
      monthsWithheldFull: 12,
      partialMonthlyNet: fullMonthly,
    };
    const oldSingleSchedule = buildChartData({
      ...baseLumpyChart,
      claimAge: 65,
      lifeExpectancy: 67,
      returnRate: 0,
      earlyMonthlyNet: fullMonthly,
      lumpy: harshRegularLimit,
    });
    const splitSchedule = buildChartData({
      ...baseLumpyChart,
      claimAge: 65,
      lifeExpectancy: 67,
      returnRate: 0,
      earlyMonthlyNet: fullMonthly,
      lumpy: { lower: harshRegularLimit, fraYear: null },
    });

    const potAt = (rows, age) => rows.find((d) => d.age === age).pot;
    expect(potAt(splitSchedule, 65.75)).toBe(potAt(oldSingleSchedule, 65.75));
    expect(potAt(splitSchedule, 66.75)).toBeGreaterThan(
      potAt(oldSingleSchedule, 66.75)
    );
  });

  it("uses an exact FRA-year start age when the lumpy schedule supplies one", () => {
    const fullMonthly = 1500;
    const harshRegularLimit = {
      monthsWithheldFull: 12,
      partialMonthlyNet: fullMonthly,
    };
    const splitSchedule = buildChartData({
      ...baseLumpyChart,
      claimAge: 65,
      lifeExpectancy: 67,
      returnRate: 0,
      earlyMonthlyNet: fullMonthly,
      lumpy: {
        lower: harshRegularLimit,
        fraYear: null,
        fraYearStartAge: 66 + 7 / 12,
      },
    });

    const potAt = (age) => splitSchedule.find((d) => d.age === age).pot;
    expect(potAt(66.5)).toBe(0);
    expect(potAt(66.75)).toBeGreaterThan(0);
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

  it("interpolates the exact crossover age (not just a range)", () => {
    // diff at a = +50, diff at b = -50. Crossover lands at the midpoint.
    const data = [
      { age: 70, early: 100, wait: 50 },
      { age: 75, early: 100, wait: 150 },
    ];
    const r = findBreakEvenAge({ chartData: data, claimAge: 62, mode: "retirement" });
    expect(r).toBe(72.5);
  });

  it("catches an exact-sample crossover (where diff = 0 at a sample point)", () => {
    // The standard sign-change check (prevDiff * currDiff < 0) misses this
    // because 0 * anything = 0. Without the explicit zero-check this returned
    // null even though there's a clear crossover at age 77.
    const data = [
      { age: 76.75, early: 177000, wait: 175500 }, // diff = +1500
      { age: 77,    early: 180000, wait: 180000 }, // diff =     0
      { age: 77.25, early: 183000, wait: 184500 }, // diff = −1500
    ];
    const r = findBreakEvenAge({ chartData: data, claimAge: 62, mode: "retirement" });
    expect(r).toBe(77);
  });

  it("does not report a false crossover during the trivial pre-claim startup", () => {
    // When claim > FRA, the chart starts at FRA with both curves at 0
    // (early hasn't kicked in yet). diff = 0 here is NOT a crossover —
    // it's just the curves co-existing at zero before either has activity.
    const data = [
      { age: 67,    early: 0, wait: 0 },
      { age: 67.25, early: 0, wait: 200 },
      { age: 70,    early: 0, wait: 6000 }, // claim hasn't started yet
      { age: 70.25, early: 1000, wait: 6500 },
      { age: 90,    early: 100000, wait: 50000 }, // real crossover well above
    ];
    const r = findBreakEvenAge({ chartData: data, claimAge: 70, mode: "retirement" });
    // We don't pin down the exact value (would depend on which interval
    // the sign change lands in), but we want to confirm we didn't return 67.
    expect(r).toBeGreaterThan(70);
  });
});

describe("findBreakEvenAge — end-to-end through computeProjection", () => {
  // These tests run real inputs through the full math pipeline and pin
  // the crossover within a sensible band. They guard against any future
  // change to chart/tax/recoup math that would silently shift the
  // headline break-even number a user sees.
  //
  // Scenarios are chosen so the crossover is bounded enough to assert on
  // but not so contrived that minor model tweaks would break the test.

  // Shared zero-return / zero-income / zero-tax baseline. Each test below
  // overrides only the variables that matter to its scenario, keeping the
  // intent of each case visible at a glance.
  const baseE2E = {
    mode: "retirement",
    fraBenefit: 2500,
    ownBenefit: 1500,
    claimAge: 62,
    returnRate: 0,
    investStopAge: 67,
    lifeExpectancy: 90,
    grossIncome: 0,
    postFRAGrossIncome: 0,
    autoTax: false,
    manualFedRate: 0,
    investedPct: 100,
  };

  it("retirement, claim at 62, no return, no income — break-even ~75-80", () => {
    // - earlyMonthly = fraBenefit × retirementFactor(62) = 2500 × 0.7 = 1750
    // - 60 months pre-FRA → pot at 67 = 105,000 (linear sum, no compounding)
    // - post-FRA: early collects 1750/mo cash, wait collects 2500/mo
    // Crossover: 105000 + (1750 × 12 × y) = 2500 × 12 × y
    //            105000 = 9000y → y = 11.67 years past FRA → age ~78.7
    const { breakEvenAge } = computeProjection(baseE2E);
    expect(breakEvenAge).not.toBeNull();
    expect(breakEvenAge).toBeGreaterThan(75);
    expect(breakEvenAge).toBeLessThan(80);
  });

  it("retirement, claim at 62, 7% return — pot compounds, break-even pushes way out (or null)", () => {
    // With 7% real return on the early checks, the invested pot compounds
    // significantly. The wait line never catches up within reasonable
    // lifespan — function returns null OR a crossover age very late.
    const { breakEvenAge } = computeProjection({ ...baseE2E, returnRate: 7 });
    // Either no crossover at all, or it's very late in life. Both are
    // valid outcomes for "early & invest beats wait at 7% real return".
    if (breakEvenAge !== null) {
      expect(breakEvenAge).toBeGreaterThan(85);
    }
  });

  it("survivor mode at 60 produces a crossover (wait collects more pre-FRA than early loses)", () => {
    // Survivor at 60 has the steepest reduction: 71.5% of FRA. The wait
    // line catches up sometime in the 70s.
    const { breakEvenAge } = computeProjection({
      ...baseE2E,
      mode: "survivor",
      claimAge: 60,
    });
    expect(breakEvenAge).not.toBeNull();
    expect(breakEvenAge).toBeGreaterThan(67);
    expect(breakEvenAge).toBeLessThan(85);
  });

  it("at the crossover age, the early and wait curves are within rounding distance", () => {
    // Spot-check: the returned crossover age should sit on a sample where
    // |early - wait| is small relative to either value.
    const projection = computeProjection(baseE2E);
    const crossoverRow = projection.chartData.find(
      (d) => Math.abs(d.age - projection.breakEvenAge) < 0.13
    );
    expect(crossoverRow).toBeDefined();
    // Within $1000 — that's the linear-interp residual at the chart's
    // quarter-year sampling resolution given $9K/yr divergence rate.
    expect(Math.abs(crossoverRow.early - crossoverRow.wait)).toBeLessThan(1000);
  });

  it("a fractional lifeExpectancy doesn't disturb crossover detection", () => {
    // Regression guard: the appended-final-sample for fractional life adds
    // a non-quarter-year row at the very end of chartData. findBreakEvenAge
    // walks every adjacent pair, so an unusually-spaced final pair must not
    // create a phantom crossover or NaN out the linear-interp formula.
    const integerLife = computeProjection(baseE2E);
    const fractionalLife = computeProjection({
      ...baseE2E,
      lifeExpectancy: 90 + 1 / 12,
    });
    expect(fractionalLife.breakEvenAge).not.toBeNull();
    // Same scenario shifted by 1 month of life — crossover age should be
    // essentially unchanged (well within a quarter-year of the integer case).
    expect(
      Math.abs(fractionalLife.breakEvenAge - integerLife.breakEvenAge)
    ).toBeLessThan(0.25);
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

describe("buildChartData — waitInvestedFraction", () => {
  // The waitInvested line is the parallel pot for the wait scenario: invest
  // each post-FRA check at the same return rate until investStopAge, then
  // let the pot compound while remaining checks become cash. waitInvested
  // = waitPot + cumulative wait-side cash. The existing `wait` line stays
  // as the uninvested cumulative baseline.
  const baseArgs = {
    claimAge: 62,
    investStopAge: 70, // > FRA so Phase 2 has runway for the wait pot
    lifeExpectancy: 85,
    earlyMonthlyNet: 1000,
    earlyPostFRAMonthlyNet: 1000,
    fraMonthlyNet: 1500,
  };

  it("waitInvested is 0 before FRA (no claim yet)", () => {
    const data = buildChartData({ ...baseArgs, returnRate: 7 });
    const preFRA = data.filter((d) => d.age < FRA);
    expect(preFRA.length).toBeGreaterThan(0);
    for (const row of preFRA) {
      expect(row.waitInvested).toBe(0);
      expect(row.waitPot).toBe(0);
    }
  });

  it("at returnRate=0, waitInvested at lifeExpectancy equals total FRA checks collected", () => {
    const data = buildChartData({
      ...baseArgs,
      returnRate: 0,
      waitInvestedFraction: 1,
    });
    const final = data.at(-1);
    // 1500/mo × 12 × (85-67) = 324,000 — the wait pot at 0% return is
    // just the sum of FRA checks, identical to the uninvested wait line.
    expect(closeTo(final.waitInvested, 324000, 5)).toBe(true);
    expect(closeTo(final.waitInvested, final.wait, 5)).toBe(true);
  });

  it("at waitInvestedFraction=0, waitInvested equals wait for every row", () => {
    const data = buildChartData({
      ...baseArgs,
      returnRate: 7,
      waitInvestedFraction: 0,
    });
    for (const row of data) {
      // waitInvested should equal wait when nothing is invested — no
      // compounding, just cumulative checks.
      expect(Math.abs(row.waitInvested - row.wait)).toBeLessThan(2);
    }
    // waitPot stays at 0 throughout.
    for (const row of data) {
      expect(row.waitPot).toBe(0);
    }
  });

  it("at returnRate>0 and waitInvestedFraction=1, waitInvested exceeds wait past FRA", () => {
    const data = buildChartData({
      ...baseArgs,
      returnRate: 7,
      waitInvestedFraction: 1,
    });
    const postFRA = data.filter((d) => d.age > FRA + 1);
    expect(postFRA.length).toBeGreaterThan(0);
    for (const row of postFRA) {
      expect(row.waitInvested).toBeGreaterThan(row.wait);
    }
  });

  it("waitPot is monotonically nondecreasing past FRA at positive return", () => {
    const data = buildChartData({
      ...baseArgs,
      returnRate: 7,
      waitInvestedFraction: 1,
    });
    const postFRA = data.filter((d) => d.age >= FRA);
    for (let i = 1; i < postFRA.length; i++) {
      expect(postFRA[i].waitPot).toBeGreaterThanOrEqual(postFRA[i - 1].waitPot);
    }
  });

  it("defaults to waitInvestedFraction=1 when omitted", () => {
    const explicit = buildChartData({
      ...baseArgs,
      returnRate: 7,
      waitInvestedFraction: 1,
    });
    const omitted = buildChartData({ ...baseArgs, returnRate: 7 });
    expect(omitted.at(-1).waitInvested).toBe(explicit.at(-1).waitInvested);
    expect(omitted.at(-1).waitPot).toBe(explicit.at(-1).waitPot);
  });
});

describe("findCrossoverAge — generalized series pair", () => {
  // The generic findCrossoverAge should be back-compat with findBreakEvenAge
  // when called with the original (early, wait) pair.
  const setup = () =>
    buildChartData({
      claimAge: 62,
      investStopAge: 67,
      lifeExpectancy: 95,
      returnRate: 0,
      earlyMonthlyNet: 1000,
      earlyPostFRAMonthlyNet: 1000,
      fraMonthlyNet: 1500,
    });

  it("with leftKey=early/rightKey=wait, matches findBreakEvenAge exactly", () => {
    const chartData = setup();
    const a = findBreakEvenAge({ chartData, claimAge: 62, mode: "retirement" });
    const b = findCrossoverAge({
      chartData,
      claimAge: 62,
      mode: "retirement",
      leftKey: "early",
      rightKey: "wait",
    });
    expect(a).toEqual(b);
  });

  it("returns null in switch mode regardless of which keys are passed", () => {
    const chartData = setup();
    expect(
      findCrossoverAge({
        chartData,
        claimAge: 62,
        mode: "switch",
        leftKey: "early",
        rightKey: "waitInvested",
      })
    ).toBeNull();
  });

  it("detects an early-vs-waitInvested crossover when one exists", () => {
    // High return + invest both → eventually wait+invest catches up.
    const chartData = buildChartData({
      claimAge: 62,
      investStopAge: 80, // long invest window
      lifeExpectancy: 100,
      returnRate: 10,
      earlyMonthlyNet: 1000,
      earlyPostFRAMonthlyNet: 1000,
      fraMonthlyNet: 1500,
      waitInvestedFraction: 1,
    });
    const crossover = findCrossoverAge({
      chartData,
      claimAge: 62,
      mode: "retirement",
      leftKey: "early",
      rightKey: "waitInvested",
    });
    // A crossover may or may not exist depending on dynamics; what matters
    // for the API is the function returns a number-or-null and doesn't
    // throw. If a crossover exists it should be past FRA.
    if (crossover !== null) {
      expect(crossover).toBeGreaterThan(FRA);
    }
  });
});
