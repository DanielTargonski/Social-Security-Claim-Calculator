import { describe, it, expect } from "vitest";
import { findOptimalClaimAge, rangeForMode } from "./optimalClaimAge.js";

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
