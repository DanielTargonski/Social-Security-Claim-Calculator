import { describe, it, expect } from "vitest";
import {
  findOptimalClaimAge,
  rangeForMode,
  levelMonthlyDraw,
} from "./optimalClaimAge.js";
import { computeProjection } from "./benefitMath.js";

// Realistic baseline so the sweep has meaningful trade-offs (not a degenerate
// zero-income / zero-return case where every claim age is equivalent).
const baseInputs = {
  mode: "retirement",
  fraBenefit: 2300,
  ownBenefit: 945,
  claimAge: 65,
  returnRate: 7,
  investStopAge: 70,
  lifeExpectancy: 90,
  grossIncome: 0,
  postFRAGrossIncome: 0,
  postFRAWorkYears: 0,
  autoTax: true,
  manualFedRate: 22,
  investedPct: 100,
};

describe("findOptimalClaimAge — sweep shape", () => {
  it("returns a non-empty sweep covering the full range in 1/12-yr steps", () => {
    const result = findOptimalClaimAge(baseInputs);
    // Retirement: [62, 70] inclusive in monthly steps = 8*12 + 1 = 97 samples
    expect(result.sweep.length).toBe(97);
    expect(result.sweep[0].age).toBeCloseTo(62, 6);
    expect(result.sweep[result.sweep.length - 1].age).toBeCloseTo(70, 6);
  });

  it("emits sweep ages on the 1/12 grid (no float drift)", () => {
    const result = findOptimalClaimAge(baseInputs);
    for (const sample of result.sweep) {
      const months = sample.age * 12;
      expect(Math.abs(months - Math.round(months))).toBeLessThan(1e-9);
    }
  });

  it("optimal age is one of the sweep ages", () => {
    const result = findOptimalClaimAge(baseInputs);
    const ages = result.sweep.map((s) => s.age);
    expect(ages).toContain(result.optimalAge);
  });

  it("optimalScore matches the highest score in the sweep", () => {
    const result = findOptimalClaimAge(baseInputs);
    const maxInSweep = Math.max(...result.sweep.map((s) => s.score));
    expect(result.optimalScore).toBe(maxInSweep);
  });
});

describe("findOptimalClaimAge — bounds & determinism", () => {
  it("returns an age within the mode's allowed range for every mode", () => {
    for (const mode of ["retirement", "survivor", "switch"]) {
      const result = findOptimalClaimAge({ ...baseInputs, mode });
      const { earliest, latest } = rangeForMode(mode);
      expect(result.optimalAge).toBeGreaterThanOrEqual(earliest);
      expect(result.optimalAge).toBeLessThanOrEqual(latest);
    }
  });

  it("is deterministic — same inputs return the same optimum", () => {
    const a = findOptimalClaimAge(baseInputs);
    const b = findOptimalClaimAge(baseInputs);
    expect(a.optimalAge).toBe(b.optimalAge);
    expect(a.optimalScore).toBeCloseTo(b.optimalScore, 4);
  });

  it("optimal score >= baseline score (the optimum must at least match the user's pick)", () => {
    // Try several baseline claim ages — the user's current setting can be
    // anywhere in the range and the invariant must hold for all of them.
    for (const claimAge of [62, 64, 65, 67, 69]) {
      const result = findOptimalClaimAge({ ...baseInputs, claimAge });
      expect(result.optimalScore).toBeGreaterThanOrEqual(result.baselineScore);
    }
  });

  it("baselineAge echoes inputs.claimAge exactly", () => {
    const result = findOptimalClaimAge({ ...baseInputs, claimAge: 64.5 });
    expect(result.baselineAge).toBe(64.5);
  });
});

describe("findOptimalClaimAge — sensible direction of optimum", () => {
  it("higher return rates push the optimum earlier (compound the early checks)", () => {
    // At 0% real return, waiting locks in a bigger guaranteed check; at 8%
    // real return, every dollar invested early compounds heavily. The peak
    // should slide left as the return rate rises.
    const lowReturn = findOptimalClaimAge({ ...baseInputs, returnRate: 0 });
    const highReturn = findOptimalClaimAge({ ...baseInputs, returnRate: 8 });
    expect(highReturn.optimalAge).toBeLessThan(lowReturn.optimalAge);
  });

  it("longer lifeExpectancy never pushes the optimum earlier (more years to enjoy a bigger check)", () => {
    // Hold returnRate at 0 to isolate the longevity effect — invest growth
    // muddies the comparison since long life also lets the pot compound more.
    const shortLife = findOptimalClaimAge({
      ...baseInputs,
      returnRate: 0,
      lifeExpectancy: 75,
    });
    const longLife = findOptimalClaimAge({
      ...baseInputs,
      returnRate: 0,
      lifeExpectancy: 95,
    });
    expect(longLife.optimalAge).toBeGreaterThanOrEqual(shortLife.optimalAge);
  });
});

describe("findOptimalClaimAge — mode-specific behavior", () => {
  it("survivor mode optimum stays within [60, 67]", () => {
    const result = findOptimalClaimAge({ ...baseInputs, mode: "survivor" });
    expect(result.optimalAge).toBeGreaterThanOrEqual(60);
    expect(result.optimalAge).toBeLessThanOrEqual(67);
  });

  it("switch mode optimum stays within [62, 66.5]", () => {
    const result = findOptimalClaimAge({ ...baseInputs, mode: "switch" });
    expect(result.optimalAge).toBeGreaterThanOrEqual(62);
    expect(result.optimalAge).toBeLessThanOrEqual(66.5);
  });

  it("metricLabel reflects the per-mode metric (pot for switch, total wealth otherwise)", () => {
    expect(findOptimalClaimAge({ ...baseInputs, mode: "retirement" }).metricLabel)
      .toBe("Total wealth at lifeExpectancy");
    expect(findOptimalClaimAge({ ...baseInputs, mode: "survivor" }).metricLabel)
      .toBe("Total wealth at lifeExpectancy");
    expect(findOptimalClaimAge({ ...baseInputs, mode: "switch" }).metricLabel)
      .toBe("Invested pot at switch age");
  });

  it("switch mode: claiming earliest produces the biggest pot at FRA", () => {
    // In switch mode at non-negative real return with 100% invested, claiming
    // earlier means more contributions over a longer pre-FRA window — so the
    // pot at investStopAge should be biggest at the earliest claim age and
    // shrink meaningfully as claim age rises. Strict per-month monotonicity
    // doesn't hold because the chart's quarter-year sample grid shifts with
    // claimAge (potAtStopRow reads the first sample >= investStopAge, which
    // can land on slightly different post-Phase-3 instants from one month to
    // the next), but the trend is unambiguous and the global optimum lands
    // squarely at the earliest end.
    const result = findOptimalClaimAge({ ...baseInputs, mode: "switch", grossIncome: 0 });
    // Optimum should be near the earliest end (within ~6 months). Strict
    // "exactly 62" doesn't hold because the sample-grid alignment can favor
    // one of the next few months over 62 itself by a tiny margin.
    expect(result.optimalAge).toBeLessThan(62.5);
    const earliestScore = result.sweep[0].score;
    const latestScore = result.sweep[result.sweep.length - 1].score;
    // At 7% real return over a 4-year claim-age spread, the gap between
    // earliest and latest claim should be tens of thousands of dollars —
    // far bigger than the few-hundred-dollar sample-grid wobble.
    expect(earliestScore - latestScore).toBeGreaterThan(10000);
  });
});

describe("findOptimalClaimAge — investStopAge clamping", () => {
  it("clamps investStopAge per candidate age (matches App.jsx's effective-investStopAge logic)", () => {
    // User sets investStopAge=63 and sweeps. At candidate claimAge=65, the
    // raw investStopAge=63 would be < claimAge — App.jsx clamps it up to
    // ceil(claimAge)=65. Without mirroring that clamp here, the sweep would
    // compare apples (claimAge<investStopAge) to oranges (claimAge>investStopAge)
    // and pick a meaningless winner.
    //
    // Test by sweeping with a low investStopAge and a high lifeExpectancy:
    // every sample should produce a valid finite score, none should be NaN
    // or 0 from a degenerate 0-month Phase 1.
    const result = findOptimalClaimAge({
      ...baseInputs,
      investStopAge: 63,
      lifeExpectancy: 90,
    });
    for (const sample of result.sweep) {
      expect(Number.isFinite(sample.score)).toBe(true);
      expect(sample.score).toBeGreaterThan(0);
    }
  });
});

describe("findOptimalClaimAge — answer does not depend on the current pick", () => {
  // App passes investStopAge already raised to the CURRENT claim age
  // (effectiveInvestStopAge) and the user's own setting as
  // preferredInvestStopAge. At 2% real / live to 85 the old sweep answered
  // 69 yr 1 mo at a pick of 62 but 66 yr 1 mo at a pick of 70.
  const pick = (claimAge, withPreference = true) =>
    findOptimalClaimAge({
      ...baseInputs,
      returnRate: 2,
      lifeExpectancy: 85,
      claimAge,
      investStopAge: Math.max(67, Math.ceil(claimAge)),
      ...(withPreference ? { preferredInvestStopAge: 67 } : {}),
    });

  it("total-wealth optimum is the same at a pick of 62 or 70", () => {
    expect(pick(70).optimalAge).toBeCloseTo(pick(62).optimalAge, 6);
    expect(pick(68.5).optimalAge).toBeCloseTo(pick(62).optimalAge, 6);
  });

  it("(control) without the preference the raised stop age moves the answer", () => {
    expect(pick(70, false).optimalAge).not.toBeCloseTo(pick(62, false).optimalAge, 6);
  });

  it("the baseline score is still the score App shows at the pick", () => {
    const res = pick(70);
    const shown = computeProjection({
      ...baseInputs,
      returnRate: 2,
      lifeExpectancy: 85,
      claimAge: 70,
      investStopAge: 70,
    }).finalEarly;
    expect(res.baselineScore).toBeCloseTo(shown, 6);
  });
});

describe("levelMonthlyDraw", () => {
  it("at 0% the pot is simply split evenly over the months", () => {
    expect(levelMonthlyDraw({ pot: 120000, months: 240, r: 0 })).toBe(500);
  });

  it("at a positive rate the draw runs the pot to exactly $0", () => {
    const r = 0.07 / 12;
    const draw = levelMonthlyDraw({ pot: 100000, months: 216, r });
    let pot = 100000;
    for (let m = 0; m < 216; m++) pot = pot * (1 + r) - draw;
    expect(pot).toBeCloseTo(0, 4);
    expect(draw * 216).toBeGreaterThan(100000);
  });

  it("is 0 with nothing to draw or no time to draw it", () => {
    expect(levelMonthlyDraw({ pot: 0, months: 100, r: 0.005 })).toBe(0);
    expect(levelMonthlyDraw({ pot: 1000, months: 0, r: 0.005 })).toBe(0);
  });
});

describe("findOptimalClaimAge — highest monthly income (both pots)", () => {
  // Claim-early-and-invest until 67, then draw the pot down by lifeExpectancy.
  const incomeInputs = { ...baseInputs, claimAge: 62, investStopAge: 67 };
  const incomeOpt = (overrides) =>
    findOptimalClaimAge({ ...incomeInputs, ...overrides }).income;

  it("monthly income = Social Security check + pot draw", () => {
    const { optimal, baseline } = incomeOpt({ returnRate: 7, lifeExpectancy: 85 });
    for (const inc of [optimal, baseline]) {
      expect(inc.monthly).toBeCloseTo(inc.check + inc.potDraw, 9);
    }
    // Claiming at 62 and investing builds a pot that pays an income.
    expect(baseline.potDraw).toBeGreaterThan(0);
  });

  it("a claim past the invest-stop age invests nothing, so there is no pot draw", () => {
    const { optimal } = incomeOpt({ returnRate: 0, lifeExpectancy: 85 });
    expect(optimal.potDraw).toBe(0);
    const p = computeProjection({ ...incomeInputs, claimAge: 70, investStopAge: 70 });
    expect(optimal.check).toBeCloseTo(p.earlyPostFRAMonthlyNetRetired, 9);
  });

  it("with flat returns the biggest check wins: claim at 70", () => {
    expect(incomeOpt({ returnRate: 0, lifeExpectancy: 85 }).optimalAge).toBeCloseTo(70, 6);
  });

  it("high returns and a short life move it to claiming early", () => {
    expect(incomeOpt({ returnRate: 10, lifeExpectancy: 78 }).optimalAge).toBeCloseTo(62, 6);
  });

  it("a longer life expectancy never moves the income optimum earlier", () => {
    const short = incomeOpt({ returnRate: 10, lifeExpectancy: 78 }).optimalAge;
    const long = incomeOpt({ returnRate: 10, lifeExpectancy: 95 }).optimalAge;
    expect(long).toBeGreaterThanOrEqual(short);
    expect(long).toBeCloseTo(70, 6);
  });

  it("is never below the user's pick", () => {
    for (const returnRate of [0, 4, 7, 10]) {
      const { optimal, baseline } = incomeOpt({ returnRate });
      expect(optimal.monthly).toBeGreaterThanOrEqual(baseline.monthly - 1e-9);
    }
  });

  it("total drawn at 0% return is every check collected", () => {
    const { baseline } = incomeOpt({ returnRate: 0, lifeExpectancy: 85 });
    const p = computeProjection({ ...incomeInputs, returnRate: 0, lifeExpectancy: 85 });
    expect(baseline.totalDrawn).toBeCloseTo(p.finalEarly, 4);
  });

  it("does not move with the current pick when App has raised the stop age", () => {
    // App passes investStopAge raised to the current claim age; the user's
    // own setting arrives as preferredInvestStopAge.
    const at = (claimAge) =>
      findOptimalClaimAge({
        ...incomeInputs,
        claimAge,
        investStopAge: Math.max(67, Math.ceil(claimAge)),
        preferredInvestStopAge: 67,
      }).income.optimalAge;
    expect(at(70)).toBeCloseTo(at(62), 6);
    expect(at(68.5)).toBeCloseTo(at(62), 6);
  });

  it("switch mode: same survivor check at any age, so the biggest pot wins", () => {
    expect(
      incomeOpt({ mode: "switch", returnRate: 7, lifeExpectancy: 85 }).optimalAge
    ).toBeCloseTo(62, 6);
  });
});
