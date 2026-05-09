import { describe, it, expect } from "vitest";
import {
  retirementFactor,
  survivorFactor,
  computeEarningsTest,
  computeTaxableSSPct,
  getMarginalRate2026,
  resolveBenefits,
  computeProjection,
  FRA,
  EARNINGS_LIMIT_2026,
} from "./benefitMath.js";

const closeTo = (a, b, tol = 0.001) => Math.abs(a - b) < tol;

describe("retirementFactor", () => {
  it("returns 1.0 at FRA (67)", () => {
    expect(retirementFactor(67)).toBe(1);
  });
  it("caps at 1.24 for age 70+ (max delayed-credits)", () => {
    expect(retirementFactor(70)).toBe(1.24);
    expect(retirementFactor(72)).toBe(1.24);
  });
  it("applies 8% delayed-retirement credit per year between 67 and 70", () => {
    expect(closeTo(retirementFactor(68), 1.08)).toBe(true);
    expect(closeTo(retirementFactor(69), 1.16)).toBe(true);
  });
  it("applies 5/9% per month for first 36 months early (down to age 64)", () => {
    // 36 months × 5/9% = 20% reduction at age 64
    expect(closeTo(retirementFactor(64), 0.8)).toBe(true);
  });
  it("applies 5/12% per month for months 37+ early (age 62 = 30%)", () => {
    // 36 × 5/9 + 24 × 5/12 = 20 + 10 = 30% reduction at age 62
    expect(closeTo(retirementFactor(62), 0.7)).toBe(true);
  });
  it("handles half-year ages between 62 and 67", () => {
    // 18 months early → 18 × 5/9 = 10% reduction at 65.5
    expect(closeTo(retirementFactor(65.5), 0.9)).toBe(true);
  });
});

describe("survivorFactor", () => {
  it("returns 0 below age 60 (not eligible)", () => {
    expect(survivorFactor(59)).toBe(0);
    expect(survivorFactor(0)).toBe(0);
  });
  it("returns 1.0 at FRA", () => {
    expect(survivorFactor(67)).toBe(1);
    expect(survivorFactor(70)).toBe(1);
  });
  it("applies 28.5% max reduction at age 60", () => {
    expect(closeTo(survivorFactor(60), 1 - 0.285)).toBe(true);
  });
  it("interpolates linearly between 60 and 67", () => {
    // halfway = age 63.5 → 50% of the 28.5% reduction
    expect(closeTo(survivorFactor(63.5), 1 - 0.285 / 2)).toBe(true);
  });
});

describe("computeEarningsTest", () => {
  it("returns 0 when at/above FRA (test doesn't apply)", () => {
    expect(
      computeEarningsTest({ claimAge: 67, grossIncome: 100000, annualEarlyGross: 30000 })
    ).toBe(0);
  });
  it("returns 0 when income at or below the limit", () => {
    expect(
      computeEarningsTest({
        claimAge: 62,
        grossIncome: EARNINGS_LIMIT_2026,
        annualEarlyGross: 30000,
      })
    ).toBe(0);
  });
  it("withholds $1 per $2 over the limit", () => {
    // $40,480 income → excess $16,000 → withhold $8,000
    const w = computeEarningsTest({
      claimAge: 62,
      grossIncome: 40480,
      annualEarlyGross: 30000,
    });
    expect(w).toBe(8000);
  });
  it("caps withholding at the full annual benefit", () => {
    // huge income would withhold > benefit; cap at benefit
    const w = computeEarningsTest({
      claimAge: 62,
      grossIncome: 500000,
      annualEarlyGross: 12000,
    });
    expect(w).toBe(12000);
  });
});

describe("computeTaxableSSPct", () => {
  it("returns 0 when no SS benefit", () => {
    expect(computeTaxableSSPct({ ssBasisAnnual: 0, grossIncome: 100000 })).toBe(0);
  });
  it("returns 0 when combined income at/below tier-1 threshold ($25K single)", () => {
    // ssBasisAnnual=20000, grossIncome=10000 → combined = 10000 + 10000 = 20000 < 25000
    expect(computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 10000 })).toBe(0);
  });
  it("includes 50% of SS as taxable in tier 1 (combined $25K-$34K)", () => {
    // ssBasisAnnual=20000, grossIncome=20000 → combined=30000, $5K in tier 1
    // taxable = min(0.5 × 20000, 0.5 × (30000 - 25000)) = min(10000, 2500) = 2500
    // pct = 2500 / 20000 = 12.5%
    expect(closeTo(computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 20000 }), 0.125)).toBe(true);
  });
  it("caps at 85% in tier 2 for high incomes", () => {
    expect(closeTo(computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 200000 }), 0.85)).toBe(true);
  });
});

describe("getMarginalRate2026", () => {
  it("returns 10% in the lowest bracket", () => {
    expect(getMarginalRate2026(0)).toBe(10);
    expect(getMarginalRate2026(12400)).toBe(10);
  });
  it("returns 12% just above the 10% threshold", () => {
    expect(getMarginalRate2026(12401)).toBe(12);
    expect(getMarginalRate2026(50400)).toBe(12);
  });
  it("returns 22% in the third bracket", () => {
    expect(getMarginalRate2026(50401)).toBe(22);
    expect(getMarginalRate2026(105700)).toBe(22);
  });
  it("returns 37% at the top bracket", () => {
    expect(getMarginalRate2026(640601)).toBe(37);
    expect(getMarginalRate2026(2_000_000)).toBe(37);
  });
});

describe("resolveBenefits", () => {
  it("retirement mode: uses fraBenefit × retirementFactor for the early check", () => {
    const r = resolveBenefits({ mode: "retirement", fraBenefit: 2000, ownBenefit: 1000, claimAge: 62 });
    expect(closeTo(r.earlyMonthlyGross, 2000 * 0.7)).toBe(true);
    expect(r.fraMonthlyGross).toBe(2000);
    expect(r.earlyPostFRAMonthlyGross).toBe(r.earlyMonthlyGross);
  });
  it("survivor mode: uses survivorFactor on fraBenefit", () => {
    const r = resolveBenefits({ mode: "survivor", fraBenefit: 2000, ownBenefit: 1000, claimAge: 60 });
    expect(closeTo(r.earlyMonthlyGross, 2000 * (1 - 0.285))).toBe(true);
  });
  it("switch mode: own retirement reduced early, then jumps to full survivor at FRA", () => {
    const r = resolveBenefits({ mode: "switch", fraBenefit: 2500, ownBenefit: 1500, claimAge: 62 });
    expect(closeTo(r.earlyMonthlyGross, 1500 * 0.7)).toBe(true);
    expect(r.fraMonthlyGross).toBe(2500);
    expect(r.earlyPostFRAMonthlyGross).toBe(2500);
  });
});

describe("computeProjection — integration smoke tests", () => {
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

  it("higher claim age (= waiting) produces a smaller invested pot at investStopAge", () => {
    const early = computeProjection({ ...baseInputs, claimAge: 62 });
    const late = computeProjection({ ...baseInputs, claimAge: 66 });
    expect(early.potAtStopRow).toBeGreaterThan(late.potAtStopRow);
  });

  it("earnings test withholding shows up in the projection result", () => {
    const noTest = computeProjection({ ...baseInputs, grossIncome: 0 });
    const withTest = computeProjection({ ...baseInputs, grossIncome: 60000 });
    expect(noTest.earningsTestWithholding).toBe(0);
    expect(withTest.earningsTestWithholding).toBeGreaterThan(0);
    // checks during ET window are smaller, so end-of-life early total is smaller
    expect(withTest.finalEarly).toBeLessThan(noTest.finalEarly);
  });

  it("switch mode's pot-at-FRA equals the ET-aware accumulation through age 67", () => {
    const r = computeProjection({
      ...baseInputs,
      mode: "switch",
      claimAge: 62,
      grossIncome: 0,
    });
    // ~$1050/mo invested for 60 months at 7% real should produce ~$75K-$80K
    expect(r.potAtStopRow).toBeGreaterThan(60_000);
    expect(r.potAtStopRow).toBeLessThan(95_000);
  });

  it("breakEvenAge is null in switch mode (the strategy is never net-negative)", () => {
    const r = computeProjection({ ...baseInputs, mode: "switch" });
    expect(r.breakEvenAge).toBeNull();
  });

  it("breakEvenAge is null when claiming exactly at FRA (no comparison to make)", () => {
    const r = computeProjection({ ...baseInputs, claimAge: FRA });
    expect(r.breakEvenAge).toBeNull();
  });
});
