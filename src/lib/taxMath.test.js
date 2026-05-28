import { describe, it, expect } from "vitest";
import {
  computeTaxableSSPct,
  getMarginalRate2026,
  computeSSEffectiveTaxRate,
  computeSeniorDeduction,
  computeFederalTax2026,
  computeWageFederalTax,
  STANDARD_DEDUCTION_2026,
  OBBBA_SENIOR_DEDUCTION_BASE,
  OBBBA_SENIOR_DEDUCTION_PHASE_START_SINGLE,
  OBBBA_SENIOR_DEDUCTION_PHASE_END_SINGLE,
  OBBBA_SENIOR_DEDUCTION_PHASE_RATE,
  OBBBA_SENIOR_DEDUCTION_FIRST_YEAR,
  OBBBA_SENIOR_DEDUCTION_LAST_YEAR,
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

// ---------------------------------------------------------------------------
// OBBBA senior bonus deduction (2025–2028, single filer, age 65+).
// ---------------------------------------------------------------------------
describe("computeSeniorDeduction — eligibility gates", () => {
  it("returns $0 for under-65 taxpayer regardless of MAGI / year", () => {
    expect(computeSeniorDeduction({ age: 64, magi: 50000, taxYear: 2026 })).toBe(0);
    expect(computeSeniorDeduction({ age: 60, magi: 10000, taxYear: 2027 })).toBe(0);
  });

  it("returns $0 before the deduction's first year (2025)", () => {
    expect(computeSeniorDeduction({ age: 70, magi: 50000, taxYear: 2024 })).toBe(0);
  });

  it("returns $0 after the deduction's last year (2028 sunset)", () => {
    expect(computeSeniorDeduction({ age: 70, magi: 50000, taxYear: 2029 })).toBe(0);
    expect(computeSeniorDeduction({ age: 80, magi: 50000, taxYear: 2050 })).toBe(0);
  });

  it("returns full $6,000 at age 65 with MAGI ≤ $75K in 2025–2028", () => {
    for (const year of [2025, 2026, 2027, 2028]) {
      expect(
        computeSeniorDeduction({ age: 65, magi: 50000, taxYear: year })
      ).toBe(6000);
    }
  });
});

describe("computeSeniorDeduction — phase-out (6% over $75K–$175K)", () => {
  it("full $6,000 at exactly $75K MAGI (phase-out starts ABOVE this)", () => {
    expect(computeSeniorDeduction({ age: 67, magi: 75000, taxYear: 2026 })).toBe(6000);
  });

  it("$5,940 at $76K MAGI (phase-out by $1,000 × 6% = $60)", () => {
    expect(
      computeSeniorDeduction({ age: 67, magi: 76000, taxYear: 2026 })
    ).toBeCloseTo(5940, 2);
  });

  it("$4,500 at $100K MAGI (worked example: $25K excess × 6% = $1,500 reduction)", () => {
    // From the search-result example: single filer at $100K MAGI loses
    // $1,500 of the deduction, leaving $4,500.
    expect(
      computeSeniorDeduction({ age: 67, magi: 100000, taxYear: 2026 })
    ).toBeCloseTo(4500, 2);
  });

  it("$0 at exactly $175K MAGI (full phase-out)", () => {
    expect(computeSeniorDeduction({ age: 67, magi: 175000, taxYear: 2026 })).toBe(0);
  });

  it("$0 above $175K MAGI", () => {
    expect(computeSeniorDeduction({ age: 67, magi: 200000, taxYear: 2026 })).toBe(0);
    expect(computeSeniorDeduction({ age: 67, magi: 500000, taxYear: 2026 })).toBe(0);
  });

  it("linear within the phase-out range", () => {
    // Midpoint: MAGI $125K → $3,000 deduction (half of $6K)
    expect(
      computeSeniorDeduction({ age: 67, magi: 125000, taxYear: 2026 })
    ).toBeCloseTo(3000, 2);
  });
});

describe("computeFederalTax2026 — bracket walker", () => {
  it("returns $0 for non-positive taxable income", () => {
    expect(computeFederalTax2026(0)).toBe(0);
    expect(computeFederalTax2026(-1000)).toBe(0);
  });

  it("first bracket (10%): tax = 10% × income up to $12,400", () => {
    expect(computeFederalTax2026(10000)).toBe(1000);
    expect(computeFederalTax2026(12400)).toBe(1240);
  });

  it("second bracket (12%): correctly stacks on filled $12,400 × 10% = $1,240", () => {
    // Taxable income $20K: first $12,400 × 10% + next $7,600 × 12%
    //   = $1,240 + $912 = $2,152
    expect(computeFederalTax2026(20000)).toBeCloseTo(2152, 2);
  });

  it("monotonic — every additional dollar increases tax owed", () => {
    let prev = 0;
    for (const ti of [5000, 12400, 20000, 50400, 80000, 105700, 150000, 300000, 700000]) {
      const t = computeFederalTax2026(ti);
      expect(t).toBeGreaterThan(prev);
      prev = t;
    }
  });

  it("differential matches the marginal rate within a single bracket", () => {
    // Difference in tax between $80K and $90K = $10K × 22% = $2,200
    const diff = computeFederalTax2026(90000) - computeFederalTax2026(80000);
    expect(diff).toBeCloseTo(2200, 2);
  });

  it("differential averages out when crossing a bracket boundary", () => {
    // $50K → $60K crosses the 12% → 22% boundary at $50,400.
    // First $400 at 12% = $48, next $9,600 at 22% = $2,112 → total $2,160.
    const diff = computeFederalTax2026(60000) - computeFederalTax2026(50000);
    expect(diff).toBeCloseTo(2160, 2);
  });
});

describe("computeSSEffectiveTaxRate — senior deduction integration", () => {
  it("reports dollar savings equal to deduction × marginal_rate when no bracket crossing", () => {
    // $80K wage + $20K SS, autoTax → taxable income before extras:
    // taxableSSPct=0.85 (well past tier-2), so 80K + 0.85×20K - 16,100 = $80,900
    // Marginal rate at $80,900 = 22%. A $6,000 deduction lands fully within
    // the 22% bracket (boundary at $50,400 below and $105,700 above), so
    // savings = $6,000 × 0.22 = $1,320.
    const r = computeSSEffectiveTaxRate({
      autoTax: true,
      manualFedRate: 0,
      ssBasisAnnual: 20000,
      grossIncome: 80000,
      extraDeduction: 6000,
    });
    expect(r.extraDeduction).toBe(6000);
    expect(r.extraDeductionDollarSavings).toBeCloseTo(1320, 2);
  });

  it("reports $0 savings when extraDeduction = 0", () => {
    const r = computeSSEffectiveTaxRate({
      autoTax: true,
      manualFedRate: 0,
      ssBasisAnnual: 20000,
      grossIncome: 80000,
      extraDeduction: 0,
    });
    expect(r.extraDeductionDollarSavings).toBe(0);
  });

  it("manual mode reports $0 savings (deduction not modeled)", () => {
    const r = computeSSEffectiveTaxRate({
      autoTax: false,
      manualFedRate: 22,
      ssBasisAnnual: 20000,
      grossIncome: 80000,
      extraDeduction: 6000,
    });
    expect(r.extraDeductionDollarSavings).toBe(0);
  });

  it("savings shrink when the deduction crosses a bracket boundary downward", () => {
    // Taxable income at $53K (12% bracket, just above $50,400 boundary).
    // A $6,000 deduction pushes taxable down to $47K — crosses the 22%/12%
    // boundary at $50,400. Savings = ($53K - $50,400) × 22% + ($50,400 - $47K) × 12%
    //   = $572 + $408 = $980. Less than the in-bracket value of $6K × 22% = $1,320.
    // Set up: grossIncome where taxable income lands around $53K (close to
    // boundary). With $20K SS taxable at 85% → 17K. Need gross + 17K - 16.1K = 53K
    // → gross = 52,100. Use that.
    const r = computeSSEffectiveTaxRate({
      autoTax: true,
      manualFedRate: 0,
      ssBasisAnnual: 20000,
      grossIncome: 52100,
      extraDeduction: 6000,
    });
    expect(r.extraDeductionDollarSavings).toBeLessThan(1320);
    expect(r.extraDeductionDollarSavings).toBeGreaterThan(700);
  });
});

describe("OBBBA senior deduction — official-source pinning", () => {
  it("base deduction = $6,000 (OBBBA single-filer baseline)", () => {
    expect(OBBBA_SENIOR_DEDUCTION_BASE).toBe(6000);
  });

  it("phase-out window (single) = $75K → $175K MAGI", () => {
    expect(OBBBA_SENIOR_DEDUCTION_PHASE_START_SINGLE).toBe(75000);
    expect(OBBBA_SENIOR_DEDUCTION_PHASE_END_SINGLE).toBe(175000);
  });

  it("phase-out rate = 6% per dollar over threshold (matches OBBBA statute)", () => {
    expect(OBBBA_SENIOR_DEDUCTION_PHASE_RATE).toBe(0.06);
    // Width × rate = base: ($175K - $75K) × 6% = $6,000
    const computed =
      (OBBBA_SENIOR_DEDUCTION_PHASE_END_SINGLE -
        OBBBA_SENIOR_DEDUCTION_PHASE_START_SINGLE) *
      OBBBA_SENIOR_DEDUCTION_PHASE_RATE;
    expect(computed).toBe(OBBBA_SENIOR_DEDUCTION_BASE);
  });

  it("effective tax years: 2025–2028 (4-year sunset window)", () => {
    expect(OBBBA_SENIOR_DEDUCTION_FIRST_YEAR).toBe(2025);
    expect(OBBBA_SENIOR_DEDUCTION_LAST_YEAR).toBe(2028);
  });
});

// ---------------------------------------------------------------------------
// 2026 official-source pinning (IRS). Refresh against the IRS revenue
// procedure for the relevant tax year (Rev. Proc. 2025-32 for 2026, typically
// published October each year). Taxable-SS thresholds are statutory and have
// not changed since 1993 — no annual refresh required.
// ---------------------------------------------------------------------------
describe("2026 official-source pinning (IRS Rev. Proc. 2025-32)", () => {
  it("2026 standard deduction (single) = $16,100", () => {
    expect(STANDARD_DEDUCTION_2026).toBe(16100);
  });

  it("2026 single-filer tax bracket thresholds match IRS Rev. Proc. 2025-32", () => {
    // Bracket boundaries: $12,400 / $50,400 / $105,700 / $201,775 / $256,225 / $640,600.
    // At each boundary the rate must be the lower one (≤ boundary uses the
    // lower bracket); $1 above must be the higher one.
    expect(getMarginalRate2026(12400)).toBe(10);
    expect(getMarginalRate2026(12401)).toBe(12);
    expect(getMarginalRate2026(50400)).toBe(12);
    expect(getMarginalRate2026(50401)).toBe(22);
    expect(getMarginalRate2026(105700)).toBe(22);
    expect(getMarginalRate2026(105701)).toBe(24);
    expect(getMarginalRate2026(201775)).toBe(24);
    expect(getMarginalRate2026(201776)).toBe(32);
    expect(getMarginalRate2026(256225)).toBe(32);
    expect(getMarginalRate2026(256226)).toBe(35);
    expect(getMarginalRate2026(640600)).toBe(35);
    expect(getMarginalRate2026(640601)).toBe(37);
  });

  it("taxable-SS combined-income thresholds (single) = $25K / $34K (statutory 1983/1993)", () => {
    // Boundary at exactly $25K → 0% taxable. $1 over → tier-1 formula kicks in.
    expect(computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 15000 })).toBe(0);
    const justOver = computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 15001 });
    expect(justOver).toBeGreaterThan(0);
    // Boundary at exactly $34K combined → still tier-2 formula ceiling
    // (≤34K branch). At combined = 34,000 with $20K SS: taxable = min($10K, $4,500)
    // = $4,500 → 22.5% of SS.
    const at34k = computeTaxableSSPct({ ssBasisAnnual: 20000, grossIncome: 24000 });
    expect(closeTo(at34k, 0.225, 0.001)).toBe(true);
  });
});

describe("computeWageFederalTax — wage at the bottom of the stack", () => {
  it("returns 0 for a zero or missing wage", () => {
    expect(computeWageFederalTax({ autoTax: true, wageIncome: 0 })).toBe(0);
    expect(
      computeWageFederalTax({ autoTax: true, wageIncome: undefined })
    ).toBe(0);
  });

  it("returns 0 when the wage is below the standard deduction", () => {
    expect(computeWageFederalTax({ autoTax: true, wageIncome: 10000 })).toBe(0);
  });

  it("auto mode walks the brackets on wage minus the standard deduction", () => {
    // 40000 − 16100 = 23900 → 10%×12400 + 12%×11500 = 1240 + 1380 = 2620.
    expect(
      closeTo(computeWageFederalTax({ autoTax: true, wageIncome: 40000 }), 2620)
    ).toBe(true);
  });

  it("subtracts an extra (senior) deduction before the bracket walk", () => {
    // 40000 − 16100 − 6000 = 17900 → 1240 + 12%×5500 = 1900.
    expect(
      closeTo(
        computeWageFederalTax({
          autoTax: true,
          wageIncome: 40000,
          extraDeduction: 6000,
        }),
        1900
      )
    ).toBe(true);
  });

  it("manual mode applies the flat rate to the post-deduction wage", () => {
    // (40000 − 16100) × 22% = 23900 × 0.22 = 5258.
    expect(
      closeTo(
        computeWageFederalTax({
          autoTax: false,
          manualFedRate: 22,
          wageIncome: 40000,
        }),
        5258
      )
    ).toBe(true);
  });

  it("reconciles with the SS-effective model: wage tax + SS tax ≈ a single combined bracket walk", () => {
    // The decomposition is sound when the taxable-SS slice stays within one
    // bracket. wage = 40000, gross SS = 20000, grossIncome = 40000.
    const wageIncome = 40000;
    const ssBasisAnnual = 20000;
    const grossIncome = 40000;

    const wageTax = computeWageFederalTax({ autoTax: true, wageIncome });
    const ss = computeSSEffectiveTaxRate({
      autoTax: true,
      ssBasisAnnual,
      grossIncome,
    });
    const ssTax = ssBasisAnnual * ss.ssEffectiveTaxRate;

    const combinedTaxable =
      grossIncome + ss.taxableSSPct * ssBasisAnnual - STANDARD_DEDUCTION_2026;
    const combinedWalk = computeFederalTax2026(combinedTaxable);

    expect(closeTo(wageTax + ssTax, combinedWalk, 0.01)).toBe(true);
  });
});
