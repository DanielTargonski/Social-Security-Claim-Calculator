import { describe, it, expect } from "vitest";
import {
  computeTaxableSSPct,
  getMarginalRate2026,
  computeSSEffectiveTaxRate,
  STANDARD_DEDUCTION_2026,
} from "./taxMath.js";

const closeTo = (a, b, tol = 0.001) => Math.abs(a - b) < tol;

describe("computeTaxableSSPct — boundary cases", () => {
  it("0% when no SS benefit", () => {
    expect(computeTaxableSSPct({ ssBasisAnnual: 0, grossIncome: 100000 })).toBe(0);
  });
  it("0% just below tier-1 threshold ($25K combined)", () => {
    // ssBasisAnnual=20000, grossIncome=14999 → combined = 24,999
    expect(computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 14999 })).toBe(0);
  });
  it("0% at exactly $25K combined", () => {
    expect(computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 15000 })).toBe(0);
  });
  it("just above $25K → small positive taxable pct", () => {
    const r = computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 15001 });
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThan(0.001);
  });
  it("12.5% taxable in middle of tier 1 (combined $30K)", () => {
    // ssBasisAnnual=20000, grossIncome=20000 → combined=30000, $5K in tier 1
    // taxable = min(0.5×20K, 0.5×$5K) = $2,500. pct = 12.5%
    expect(closeTo(computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 20000 }), 0.125)).toBe(true);
  });
  it("at exactly $34K combined: full tier 1 cap", () => {
    // ssBasisAnnual=20000, grossIncome=24000 → combined=34000, full $9K tier 1
    // taxable = min(0.5×20K, 0.5×$9K) = $4,500. pct = 22.5%
    expect(closeTo(computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 24000 }), 0.225)).toBe(true);
  });
  it("just above $34K → tier 2 starts adding 85% of excess", () => {
    // small excess into tier 2
    expect(
      computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 24001 })
    ).toBeGreaterThan(computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 24000 }));
  });
  it("caps at 85% for very high income", () => {
    expect(closeTo(computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 200000 }), 0.85)).toBe(true);
    expect(closeTo(computeTaxableSSPct({ ssBasisAnnual: 30000, grossIncome: 1_000_000 }), 0.85)).toBe(true);
  });
  it("monotonically non-decreasing as income rises", () => {
    let prev = computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 0 });
    for (let inc = 1000; inc <= 200000; inc += 1000) {
      const cur = computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: inc });
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = cur;
    }
  });
});

describe("getMarginalRate2026 — every bracket boundary", () => {
  it("10% at $0 and at the bracket cap ($12,400)", () => {
    expect(getMarginalRate2026(0)).toBe(10);
    expect(getMarginalRate2026(12400)).toBe(10);
  });
  it("12% just above ($12,401) and at $50,400", () => {
    expect(getMarginalRate2026(12401)).toBe(12);
    expect(getMarginalRate2026(50400)).toBe(12);
  });
  it("22% at $50,401 and $105,700", () => {
    expect(getMarginalRate2026(50401)).toBe(22);
    expect(getMarginalRate2026(105700)).toBe(22);
  });
  it("24% at $105,701 and $201,775", () => {
    expect(getMarginalRate2026(105701)).toBe(24);
    expect(getMarginalRate2026(201775)).toBe(24);
  });
  it("32% at $201,776 and $256,225", () => {
    expect(getMarginalRate2026(201776)).toBe(32);
    expect(getMarginalRate2026(256225)).toBe(32);
  });
  it("35% at $256,226 and $640,600", () => {
    expect(getMarginalRate2026(256226)).toBe(35);
    expect(getMarginalRate2026(640600)).toBe(35);
  });
  it("37% above $640,600 (no cap)", () => {
    expect(getMarginalRate2026(640601)).toBe(37);
    expect(getMarginalRate2026(2_000_000)).toBe(37);
    expect(getMarginalRate2026(50_000_000)).toBe(37);
  });
  it("monotonically non-decreasing across the range", () => {
    let prev = 10;
    for (let inc = 0; inc <= 700_000; inc += 1000) {
      const cur = getMarginalRate2026(inc);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe("computeSSEffectiveTaxRate — orchestration", () => {
  it("auto mode at low income returns 0 effective SS tax", () => {
    const r = computeSSEffectiveTaxRate({
      autoTax: true,
      manualFedRate: 0,
      ssBasisAnnual: 20000,
      grossIncome: 0,
    });
    expect(r.taxableSSPct).toBe(0);
    expect(r.ssEffectiveTaxRate).toBe(0);
  });
  it("auto mode subtracts standard deduction before bracket lookup", () => {
    // Income just above standard deduction → 10% bracket, taxable SS pct still 0
    const r = computeSSEffectiveTaxRate({
      autoTax: true,
      manualFedRate: 0,
      ssBasisAnnual: 0,
      grossIncome: STANDARD_DEDUCTION_2026 + 1000,
    });
    expect(r.fedMarginalRate).toBe(10);
  });
  it("manual mode ignores income, uses manualFedRate × 0.85", () => {
    const r = computeSSEffectiveTaxRate({
      autoTax: false,
      manualFedRate: 22,
      ssBasisAnnual: 20000,
      grossIncome: 100000,
    });
    expect(r.fedMarginalRate).toBe(22);
    expect(closeTo(r.ssEffectiveTaxRate, 0.85 * 0.22)).toBe(true);
  });
  it("manual rate of 0 produces 0 effective tax on SS", () => {
    const r = computeSSEffectiveTaxRate({
      autoTax: false,
      manualFedRate: 0,
      ssBasisAnnual: 20000,
      grossIncome: 0,
    });
    expect(r.ssEffectiveTaxRate).toBe(0);
  });
  it("auto mode at high income: marginal rate caps at 37%", () => {
    const r = computeSSEffectiveTaxRate({
      autoTax: true,
      manualFedRate: 0,
      ssBasisAnnual: 30000,
      grossIncome: 800000,
    });
    expect(r.fedMarginalRate).toBe(37);
    expect(closeTo(r.taxableSSPct, 0.85)).toBe(true);
  });
});
