import { describe, it, expect } from "vitest";
import {
  retirementFactor,
  survivorFactor,
  computeEarningsTest,
  computeRecoupedFactor,
  resolveBenefits,
  FRA,
  EARNINGS_LIMIT_2026,
} from "./ssRules.js";

const closeTo = (a, b, tol = 0.001) => Math.abs(a - b) < tol;

describe("retirementFactor — boundary ages", () => {
  it("equals 1.0 at FRA (67)", () => {
    expect(retirementFactor(67)).toBe(1);
  });
  it("caps at 1.24 at age 70", () => {
    expect(retirementFactor(70)).toBe(1.24);
  });
  it("stays at 1.24 past 70 (no further credits)", () => {
    expect(retirementFactor(72)).toBe(1.24);
    expect(retirementFactor(85)).toBe(1.24);
  });
  it("applies 8% per year of delayed credits between 67 and 70", () => {
    expect(closeTo(retirementFactor(68), 1.08)).toBe(true);
    expect(closeTo(retirementFactor(69), 1.16)).toBe(true);
    expect(closeTo(retirementFactor(67.5), 1.04)).toBe(true);
  });
  it("applies 5/9% per month for first 36 months early (down to age 64)", () => {
    expect(closeTo(retirementFactor(64), 0.8)).toBe(true);
  });
  it("applies 5/12% per month for months 37+ early (age 62 = 30%)", () => {
    expect(closeTo(retirementFactor(62), 0.7)).toBe(true);
  });
  it("handles half-year ages cleanly", () => {
    // 65.5 = 18 months early, all in first-tier 5/9: 18 × (5/9)/100 = 10% reduction
    expect(closeTo(retirementFactor(65.5), 0.9)).toBe(true);
    // 63.5 = 42 months early. First 36 × (5/9)/100 = 20%, remaining 6 × (5/12)/100 = 2.5%
    expect(closeTo(retirementFactor(63.5), 0.775)).toBe(true);
  });
  it("is strictly increasing across the supported range", () => {
    let prev = retirementFactor(62);
    for (let age = 62.25; age <= 70; age += 0.25) {
      const cur = retirementFactor(age);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe("survivorFactor — boundary ages", () => {
  it("returns 0 below age 60 (not eligible)", () => {
    expect(survivorFactor(59)).toBe(0);
    expect(survivorFactor(0)).toBe(0);
    expect(survivorFactor(-5)).toBe(0);
  });
  it("returns 1.0 at and past FRA (no DRC for survivor benefits)", () => {
    expect(survivorFactor(67)).toBe(1);
    expect(survivorFactor(70)).toBe(1);
    expect(survivorFactor(85)).toBe(1);
  });
  it("applies 28.5% max reduction at age 60", () => {
    expect(closeTo(survivorFactor(60), 0.715)).toBe(true);
  });
  it("interpolates linearly between 60 and 67", () => {
    // halfway = age 63.5 → 50% of the 28.5% reduction
    expect(closeTo(survivorFactor(63.5), 1 - 0.285 / 2)).toBe(true);
  });
  it("is strictly increasing from 60 to 67", () => {
    let prev = survivorFactor(60);
    for (let age = 60.25; age <= 67; age += 0.25) {
      const cur = survivorFactor(age);
      expect(cur).toBeGreaterThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe("computeEarningsTest — withholding cases", () => {
  it("returns 0 when at FRA (test no longer applies)", () => {
    expect(
      computeEarningsTest({ claimAge: FRA, grossIncome: 100000, annualEarlyGross: 30000 })
    ).toBe(0);
  });
  it("returns 0 when past FRA", () => {
    expect(
      computeEarningsTest({ claimAge: 70, grossIncome: 100000, annualEarlyGross: 30000 })
    ).toBe(0);
  });
  it("returns 0 when income exactly at the limit", () => {
    expect(
      computeEarningsTest({
        claimAge: 62,
        grossIncome: EARNINGS_LIMIT_2026,
        annualEarlyGross: 30000,
      })
    ).toBe(0);
  });
  it("returns $0.50 when income is exactly $1 over the limit", () => {
    expect(
      computeEarningsTest({
        claimAge: 62,
        grossIncome: EARNINGS_LIMIT_2026 + 1,
        annualEarlyGross: 30000,
      })
    ).toBe(0.5);
  });
  it("withholds $1 of SS for every $2 of wages over the limit", () => {
    const w = computeEarningsTest({
      claimAge: 62,
      grossIncome: EARNINGS_LIMIT_2026 + 16000,
      annualEarlyGross: 30000,
    });
    expect(w).toBe(8000);
  });
  it("caps withholding at the full annual benefit", () => {
    const w = computeEarningsTest({
      claimAge: 62,
      grossIncome: 500000,
      annualEarlyGross: 12000,
    });
    expect(w).toBe(12000);
  });
  it("handles zero income gracefully", () => {
    expect(
      computeEarningsTest({ claimAge: 62, grossIncome: 0, annualEarlyGross: 30000 })
    ).toBe(0);
  });
});

describe("computeRecoupedFactor — null cases", () => {
  it("null in switch mode (own retirement abandoned at FRA)", () => {
    expect(
      computeRecoupedFactor({
        mode: "switch",
        claimAge: 64,
        earlyMonthlyGross: 800,
        earningsTestWithholding: 5000,
      })
    ).toBeNull();
  });
  it("null at FRA (nothing to recoup)", () => {
    expect(
      computeRecoupedFactor({
        mode: "retirement",
        claimAge: FRA,
        earlyMonthlyGross: 2500,
        earningsTestWithholding: 5000,
      })
    ).toBeNull();
  });
  it("null past FRA", () => {
    expect(
      computeRecoupedFactor({
        mode: "retirement",
        claimAge: 70,
        earlyMonthlyGross: 2500,
        earningsTestWithholding: 5000,
      })
    ).toBeNull();
  });
  it("null with no earnings-test withholding", () => {
    expect(
      computeRecoupedFactor({
        mode: "retirement",
        claimAge: 64,
        earlyMonthlyGross: 2000,
        earningsTestWithholding: 0,
      })
    ).toBeNull();
  });
  it("null when earlyMonthlyGross is zero (defensive)", () => {
    expect(
      computeRecoupedFactor({
        mode: "retirement",
        claimAge: 64,
        earlyMonthlyGross: 0,
        earningsTestWithholding: 1000,
      })
    ).toBeNull();
  });
});

describe("computeRecoupedFactor — math", () => {
  it("100% withholding → recoup gives full FRA factor (1.0)", () => {
    const earlyMonthlyGross = 1000;
    // Annual withholding of one full year of benefits, applied across the
    // 3-year pre-FRA window → 36 months effective recoup.
    const annualWithheld = earlyMonthlyGross * 12;
    const r = computeRecoupedFactor({
      mode: "retirement",
      claimAge: 64,
      earlyMonthlyGross,
      earningsTestWithholding: annualWithheld,
    });
    expect(closeTo(r, 1.0, 0.01)).toBe(true);
  });

  it("retirement: 12 months total withheld over 3 years → effective claim age 65", () => {
    // earlyMonthlyGross 1600 (= 2000 × 0.8 at age 64). 12 months withheld =
    // $19,200 / 3 yr = $6,400/yr. effectiveAge=65 → factor 1 - 24×(5/9)/100 ≈ 0.8667
    const r = computeRecoupedFactor({
      mode: "retirement",
      claimAge: 64,
      earlyMonthlyGross: 1600,
      earningsTestWithholding: 6400,
    });
    expect(closeTo(r, 1 - (24 * (5 / 9)) / 100, 0.005)).toBe(true);
  });

  it("survivor: 12 months total withheld → effective claim age 65", () => {
    // earlyMonthlyGross 2019 (= 2300 × 0.878 at age 64).
    // Annual withholding × 3 = 12 mo of monthly check → monthsWithheld = 12.
    const earlyMonthlyGross = 2019;
    const totalWithheldFor12mo = earlyMonthlyGross * 12;
    const r = computeRecoupedFactor({
      mode: "survivor",
      claimAge: 64,
      earlyMonthlyGross,
      earningsTestWithholding: totalWithheldFor12mo / 3,
    });
    expect(closeTo(r, survivorFactor(65), 0.005)).toBe(true);
  });

  it("recouped factor is always >= original early factor", () => {
    const cases = [
      { mode: "retirement", claimAge: 62 },
      { mode: "retirement", claimAge: 65 },
      { mode: "survivor", claimAge: 60 },
      { mode: "survivor", claimAge: 64 },
    ];
    for (const { mode, claimAge } of cases) {
      const earlyFactor =
        mode === "retirement" ? retirementFactor(claimAge) : survivorFactor(claimAge);
      const earlyMonthlyGross = 2000 * earlyFactor;
      const r = computeRecoupedFactor({
        mode,
        claimAge,
        earlyMonthlyGross,
        earningsTestWithholding: 5000,
      });
      expect(r).toBeGreaterThanOrEqual(earlyFactor - 1e-9);
    }
  });
});

describe("resolveBenefits — by mode", () => {
  it("retirement mode uses retirementFactor on fraBenefit", () => {
    const r = resolveBenefits({ mode: "retirement", fraBenefit: 2000, ownBenefit: 1000, claimAge: 62 });
    expect(closeTo(r.earlyMonthlyGross, 2000 * 0.7)).toBe(true);
    expect(r.fraMonthlyGross).toBe(2000);
    expect(r.earlyPostFRAMonthlyGross).toBe(r.earlyMonthlyGross);
  });
  it("survivor mode uses survivorFactor on fraBenefit", () => {
    const r = resolveBenefits({ mode: "survivor", fraBenefit: 2000, ownBenefit: 1000, claimAge: 60 });
    expect(closeTo(r.earlyMonthlyGross, 2000 * 0.715)).toBe(true);
  });
  it("switch mode: own early then full survivor at FRA", () => {
    const r = resolveBenefits({ mode: "switch", fraBenefit: 2500, ownBenefit: 1500, claimAge: 62 });
    expect(closeTo(r.earlyMonthlyGross, 1500 * 0.7)).toBe(true);
    expect(r.fraMonthlyGross).toBe(2500); // survivor
    expect(r.earlyPostFRAMonthlyGross).toBe(2500); // jumps to survivor
  });
  it("retirement mode at FRA: factor = 1, all amounts equal fraBenefit", () => {
    const r = resolveBenefits({ mode: "retirement", fraBenefit: 2000, ownBenefit: 1000, claimAge: 67 });
    expect(r.earlyFactor).toBe(1);
    expect(r.earlyMonthlyGross).toBe(2000);
    expect(r.fraMonthlyGross).toBe(2000);
  });
});

// ---------------------------------------------------------------------------
// 2026-constants pinning. Refresh in late 2026 against:
//   - SSA 2027 COLA announcement (Oct 2026) — earnings test limit indexes annually
//   - Anyone born 1960+ has FRA 67 by statute; no refresh needed unless Congress acts
// ---------------------------------------------------------------------------
describe("2026 official-source pinning (SSA)", () => {
  it("FRA = 67 (statutory for anyone born 1960 or later)", () => {
    expect(FRA).toBe(67);
  });

  it("2026 earnings test limit = $24,480 (SSA COLA announcement, Oct 2025)", () => {
    expect(EARNINGS_LIMIT_2026).toBe(24480);
  });

  it("retirementFactor matches the canonical SSA published examples (FRA 67)", () => {
    // SSA's own published table for FRA-67 cohort:
    //   62 → 70.00%   63 → 75.00%   64 → 80.00%
    //   65 → 86.67%   66 → 93.33%   67 → 100.00%
    //   68 → 108.00%  69 → 116.00%  70 → 124.00%
    expect(closeTo(retirementFactor(62), 0.7)).toBe(true);
    expect(closeTo(retirementFactor(63), 0.75)).toBe(true);
    expect(closeTo(retirementFactor(64), 0.8)).toBe(true);
    expect(closeTo(retirementFactor(65), 13 / 15, 0.001)).toBe(true); // 86.67%
    expect(closeTo(retirementFactor(66), 14 / 15, 0.001)).toBe(true); // 93.33%
    expect(retirementFactor(67)).toBe(1);
    expect(closeTo(retirementFactor(68), 1.08)).toBe(true);
    expect(closeTo(retirementFactor(69), 1.16)).toBe(true);
    expect(retirementFactor(70)).toBe(1.24);
  });

  it("survivorFactor matches the canonical SSA published value (71.5% at 60)", () => {
    // SSA: 28.5% max reduction at 60 → factor = 0.715.
    expect(closeTo(survivorFactor(60), 0.715, 0.001)).toBe(true);
    // 100% at survivor FRA, no DRC past FRA.
    expect(survivorFactor(67)).toBe(1);
    expect(survivorFactor(70)).toBe(1);
  });
});
