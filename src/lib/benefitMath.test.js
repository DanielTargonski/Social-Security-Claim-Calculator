// Integration tests for the top-level computeProjection orchestrator.
// Unit tests for the underlying modules live in:
//   - ssRules.test.js         (factor formulas, earnings test, recoup, resolveBenefits)
//   - taxMath.test.js         (taxable SS tier, marginal brackets, effective tax rate)
//   - chartProjection.test.js (phase boundaries, pot at age, cash collection, chart shape)

import { describe, it, expect } from "vitest";
import { computeProjection, FRA } from "./benefitMath.js";

const closeTo = (a, b, tol = 0.001) => Math.abs(a - b) < tol;

const baseInputs = {
  mode: "retirement",
  fraBenefit: 2500,
  ownBenefit: 1500,
  claimAge: 62,
  returnRate: 7,
  investStopAge: 67,
  lifeExpectancy: 85,
  grossIncome: 0,
  autoTax: true,
  manualFedRate: 12,
};

describe("computeProjection — basic shape", () => {
  it("produces a chartData array spanning claimAge to lifeExpectancy", () => {
    const r = computeProjection(baseInputs);
    expect(r.chartData.length).toBeGreaterThan(0);
    expect(r.chartData[0].age).toBeLessThanOrEqual(baseInputs.claimAge);
    expect(r.chartData[r.chartData.length - 1].age).toBeCloseTo(baseInputs.lifeExpectancy, 0);
  });

  it("the wait curve is zero before FRA and positive after", () => {
    const r = computeProjection(baseInputs);
    const before = r.chartData.find((d) => d.age < FRA);
    const after = r.chartData.find((d) => d.age > FRA + 1);
    expect(before.wait).toBe(0);
    expect(after.wait).toBeGreaterThan(0);
  });
});

describe("computeProjection — directional invariants", () => {
  it("higher claim age (= waiting) produces a smaller invested pot at investStopAge", () => {
    const early = computeProjection({ ...baseInputs, claimAge: 62 });
    const late = computeProjection({ ...baseInputs, claimAge: 66 });
    expect(early.potAtStopRow).toBeGreaterThan(late.potAtStopRow);
  });

  it("higher return rate produces larger pot (with same other inputs)", () => {
    const lowR = computeProjection({ ...baseInputs, returnRate: 3 });
    const highR = computeProjection({ ...baseInputs, returnRate: 9 });
    expect(highR.potAtStopRow).toBeGreaterThan(lowR.potAtStopRow);
  });

  it("at 0% return, longer life expectancy → wait strategy benefits more", () => {
    // At nonzero return, the early-claim invested pot can compound away the
    // wait advantage. At 0% return, wait reliably catches up and overtakes
    // as life expectancy grows. Test that property here.
    const short = computeProjection({ ...baseInputs, returnRate: 0, lifeExpectancy: 75 });
    const long = computeProjection({ ...baseInputs, returnRate: 0, lifeExpectancy: 95 });
    expect(long.finalWait - long.finalEarly).toBeGreaterThan(
      short.finalWait - short.finalEarly
    );
  });

  it("higher fraBenefit scales lifetime totals roughly linearly", () => {
    const a = computeProjection({ ...baseInputs, fraBenefit: 2000 });
    const b = computeProjection({ ...baseInputs, fraBenefit: 4000 });
    const ratio = b.finalWait / a.finalWait;
    expect(closeTo(ratio, 2.0, 0.05)).toBe(true);
  });
});

describe("computeProjection — earnings test interaction", () => {
  it("earnings test withholding shows up in the projection result", () => {
    const noTest = computeProjection({ ...baseInputs, grossIncome: 0 });
    const withTest = computeProjection({ ...baseInputs, grossIncome: 60000 });
    expect(noTest.earningsTestWithholding).toBe(0);
    expect(withTest.earningsTestWithholding).toBeGreaterThan(0);
    expect(withTest.finalEarly).toBeLessThan(noTest.finalEarly);
  });

  it("invested pot uses the post-earnings-test, post-tax amount (not gross)", () => {
    const r = computeProjection({
      ...baseInputs,
      mode: "survivor",
      fraBenefit: 2300,
      claimAge: 64,
      grossIncome: 40000,
      returnRate: 0,
      investStopAge: 67,
    });
    const expectedContributions = r.earlyMonthlyNet * 12 * 3;
    expect(Math.abs(r.potAtStopRow - expectedContributions)).toBeLessThan(2);
  });
});

describe("computeProjection — recoup behavior", () => {
  it("survivor mode: earnings-test recoup raises post-FRA monthly check", () => {
    const r = computeProjection({
      ...baseInputs,
      mode: "survivor",
      fraBenefit: 2300,
      claimAge: 64,
      grossIncome: 40000,
    });
    expect(r.earlyPostFRAMonthlyGross).toBeGreaterThan(r.earlyMonthlyGross);
    expect(r.recoupedFactor).toBeGreaterThan(r.earlyFactor);
    expect(r.earlyPostFRAMonthlyGross).toBeLessThan(r.fraMonthlyGross);
  });

  it("switch mode: NO recoup applied (own retirement abandoned at FRA)", () => {
    const r = computeProjection({
      ...baseInputs,
      mode: "switch",
      claimAge: 64,
      grossIncome: 40000,
    });
    expect(r.recoupedFactor).toBeNull();
    expect(r.earlyPostFRAMonthlyGross).toBe(r.fraMonthlyGross);
  });

  it("retirement mode without earnings test: recoup is null, post-FRA equals early", () => {
    const r = computeProjection({ ...baseInputs, mode: "retirement", claimAge: 64, grossIncome: 0 });
    expect(r.recoupedFactor).toBeNull();
    expect(r.earlyPostFRAMonthlyGross).toBe(r.earlyMonthlyGross);
  });
});

describe("computeProjection — Phase 3 cash rate split", () => {
  it("uses the early ET-reduced rate while still pre-FRA", () => {
    const r = computeProjection({
      ...baseInputs,
      mode: "survivor",
      fraBenefit: 2300,
      claimAge: 64,
      grossIncome: 40000,
      returnRate: 0,
      investStopAge: 65,
      lifeExpectancy: 70,
    });
    const rowAt67 = r.chartData.find((d) => d.age >= FRA);
    const cashFrom65To67 = rowAt67.early - rowAt67.pot;
    const correctCash = r.earlyMonthlyNet * 12 * 2;
    const buggyCash = r.earlyPostFRAMonthlyNet * 12 * 2;
    expect(Math.abs(cashFrom65To67 - correctCash)).toBeLessThan(2);
    expect(cashFrom65To67).toBeLessThan(buggyCash);
  });
});

describe("computeProjection — break-even null cases", () => {
  it("breakEvenAge is null in switch mode (the strategy is never net-negative)", () => {
    const r = computeProjection({ ...baseInputs, mode: "switch" });
    expect(r.breakEvenAge).toBeNull();
  });

  it("breakEvenAge is null when claiming exactly at FRA (no comparison to make)", () => {
    const r = computeProjection({ ...baseInputs, claimAge: FRA });
    expect(r.breakEvenAge).toBeNull();
  });
});

describe("computeProjection — mode-specific scenarios", () => {
  it("switch mode at minimum claim age (62): max own-retirement reduction", () => {
    const r = computeProjection({ ...baseInputs, mode: "switch", claimAge: 62 });
    expect(closeTo(r.earlyFactor, 0.7)).toBe(true);
    expect(r.fraMonthlyGross).toBe(2500); // survivor at FRA
    expect(closeTo(r.earlyMonthlyGross, 1500 * 0.7)).toBe(true);
  });

  it("survivor mode at age 60: 28.5% reduction, no DRC ever", () => {
    const r = computeProjection({ ...baseInputs, mode: "survivor", claimAge: 60 });
    expect(closeTo(r.earlyFactor, 0.715)).toBe(true);
  });

  it("retirement mode at age 70: maximum delayed-credit factor (1.24)", () => {
    const r = computeProjection({ ...baseInputs, mode: "retirement", claimAge: 70 });
    expect(r.earlyFactor).toBe(1.24);
    expect(r.earlyMonthlyGross).toBe(2500 * 1.24);
  });

  it("zero income, claim at 62: full pot accumulation, no ET, no recoup", () => {
    const r = computeProjection({ ...baseInputs, claimAge: 62, grossIncome: 0 });
    expect(r.earningsTestWithholding).toBe(0);
    expect(r.recoupedFactor).toBeNull();
    expect(r.potAtStopRow).toBeGreaterThan(0);
  });

  it("100% earnings test withholding: pot at FRA = 0, recoup = full FRA factor", () => {
    const r = computeProjection({
      ...baseInputs,
      mode: "retirement",
      claimAge: 62,
      grossIncome: 200000, // way over enough to withhold everything
      returnRate: 0,
    });
    expect(r.earlyMonthlyNet).toBeLessThan(1); // ~0
    expect(r.potAtStopRow).toBeLessThan(1);
    expect(closeTo(r.recoupedFactor, 1.0, 0.01)).toBe(true);
  });
});

describe("computeProjection — defensive edge cases", () => {
  it("lifeExpectancy === claimAge: chart still produces rows", () => {
    const r = computeProjection({ ...baseInputs, claimAge: 67, lifeExpectancy: 67 });
    expect(r.chartData.length).toBeGreaterThan(0);
  });

  it("investStopAge === claimAge: no investing happens", () => {
    const r = computeProjection({
      ...baseInputs,
      claimAge: 64,
      investStopAge: 64,
      returnRate: 7,
    });
    // pot at age 64 should be 0 (no months invested)
    const row64 = r.chartData.find((d) => d.age >= 64);
    expect(row64.pot).toBe(0);
  });

  it("0% return: pot equals literal sum of net contributions", () => {
    const r = computeProjection({ ...baseInputs, claimAge: 62, returnRate: 0 });
    const expected = r.earlyMonthlyNet * 12 * 5; // 62 → 67 = 5 yr
    expect(closeTo(r.potAtStopRow, expected, 2)).toBe(true);
  });

  it("manual tax mode honored", () => {
    const r = computeProjection({ ...baseInputs, autoTax: false, manualFedRate: 22 });
    expect(r.fedMarginalRate).toBe(22);
    expect(closeTo(r.ssEffectiveTaxRate, 0.85 * 0.22)).toBe(true);
  });
});

describe("computeProjection — separate early/wait tax rates", () => {
  // Regression: previously the calculator used fraMonthlyGross * 12 as the
  // ssBasisAnnual for both scenarios, which over-taxed the early scenario
  // (lower SS → lower combined income → lower taxable-SS percentage).
  // The fix computes two effective rates internally; the headline
  // `ssEffectiveTaxRate` exposed to the UI describes the early scenario.

  it("at a tier-disparity income, the wait scenario taxes fraMonthlyNet more heavily than early", () => {
    // fraBenefit 2500 (annual wait basis $30K), early at 62 → 1750 (annual
    // early basis $21K). grossIncome $20K places wait combined income at
    // $35K (in tier 2: 85% taxable territory) and early combined income at
    // $30.5K (in tier 1: scaled to ~13% taxable). Different brackets, too.
    const r = computeProjection({
      ...baseInputs,
      grossIncome: 20000,
      autoTax: true,
    });

    // The taxable fraction of fraMonthlyNet must be > the taxable fraction
    // of earlyMonthlyNet by virtue of the wait scenario having higher SS.
    // We can't read both rates directly any more, but we can verify it
    // shows up in the net-vs-gross ratios.
    const earlyTaxFraction =
      1 - r.earlyMonthlyNet / ((r.annualEarlyGross - r.earningsTestWithholding) / 12);
    const waitTaxFraction = 1 - r.fraMonthlyNet / r.fraMonthlyGross;
    expect(waitTaxFraction).toBeGreaterThan(earlyTaxFraction);
  });

  it("when both scenarios collapse to the same SS basis (switch mode), tax fractions match", () => {
    // In switch mode, the claimant abandons own retirement at FRA and
    // collects the full survivor benefit afterward, so the early-scenario
    // SS basis (post-FRA = fraBenefit) equals the wait basis. Both tax
    // rates collapse to the same value.
    const r = computeProjection({
      ...baseInputs,
      mode: "switch",
      grossIncome: 20000,
      autoTax: true,
    });
    const earlyTaxFraction = 1 - r.earlyPostFRAMonthlyNet / r.earlyPostFRAMonthlyGross;
    const waitTaxFraction = 1 - r.fraMonthlyNet / r.fraMonthlyGross;
    expect(closeTo(earlyTaxFraction, waitTaxFraction, 0.0001)).toBe(true);
  });

  it("displayed combinedIncome reflects the early-scenario basis (the user's chosen scenario)", () => {
    const r = computeProjection({
      ...baseInputs,
      grossIncome: 20000,
      autoTax: true,
    });
    // Early scenario: post-FRA monthly gross × 12 (= long-term steady state)
    const expected = 20000 + 0.5 * r.earlyPostFRAMonthlyGross * 12;
    expect(closeTo(r.combinedIncome, expected, 0.5)).toBe(true);
  });
});
