import { describe, it, expect } from "vitest";
import {
  FPL_2025_FOR_2026_PTC,
  MEDICAID_FPL_CEILING,
  ESSENTIAL_PLAN_FPL_CEILING,
  ACA_PTC_CLIFF_FPL,
  ACA_PTC_CONTRIBUTION_CAP,
  MSP_PART_B_FPL_CEILING,
  NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT,
  PART_B_BASE_ANNUAL_2026,
  IRMAA_2026_SINGLE,
  computeMagiACA,
  computeMagiIRMAA,
  fplPctOf,
  computeACAAnnualCost,
  getIRMAATier,
  computeMedicareAnnualCost,
  computeAnnualHealthcareCost,
  armHealthcareByRegime,
  nextCliffAbove,
} from "./healthcareCost.js";

const closeTo = (a, b, tol = 0.01) => Math.abs(a - b) < tol;

describe("MAGI definitions", () => {
  it("ACA MAGI counts 100% of gross SS benefits", () => {
    // The non-taxable SS addback is what makes ACA MAGI different from AGI.
    expect(computeMagiACA({ grossIncome: 30000, ssAnnualGross: 24000 })).toBe(
      54000
    );
  });

  it("IRMAA MAGI counts only the taxable portion of SS (already in AGI)", () => {
    // taxableSSPct=0.85 → MAGI = 30,000 + 24,000 × 0.85 = 50,400
    expect(
      computeMagiIRMAA({
        grossIncome: 30000,
        ssAnnualGross: 24000,
        taxableSSPct: 0.85,
      })
    ).toBe(50400);
  });

  it("the two MAGIs diverge by exactly the non-taxable SS portion", () => {
    const ssAnnualGross = 24000;
    const taxableSSPct = 0.85;
    const grossIncome = 30000;
    const aca = computeMagiACA({ grossIncome, ssAnnualGross });
    const irmaa = computeMagiIRMAA({ grossIncome, ssAnnualGross, taxableSSPct });
    expect(aca - irmaa).toBeCloseTo(ssAnnualGross * (1 - taxableSSPct), 6);
  });
});

describe("fplPctOf", () => {
  it("uses single-FPL by default", () => {
    expect(closeTo(fplPctOf({ magi: FPL_2025_FOR_2026_PTC.single }), 1.0)).toBe(
      true
    );
  });
  it("uses couple-FPL when householdSize is 2", () => {
    expect(
      closeTo(
        fplPctOf({ magi: FPL_2025_FOR_2026_PTC.couple, householdSize: 2 }),
        1.0
      )
    ).toBe(true);
  });
  it("400% FPL single = $62,600", () => {
    expect(fplPctOf({ magi: 62600 })).toBeCloseTo(4.0, 6);
  });
  it("400% FPL couple = $84,600", () => {
    expect(fplPctOf({ magi: 84600, householdSize: 2 })).toBeCloseTo(4.0, 6);
  });
});

describe("computeACAAnnualCost — Essential Plan band (≤ 200% FPL)", () => {
  it("$0 at 100% FPL single", () => {
    expect(computeACAAnnualCost({ magi: 15650 })).toBe(0);
  });
  it("$0 at exactly 200% FPL single", () => {
    expect(computeACAAnnualCost({ magi: 31300 })).toBe(0);
  });
  it("$0 at 199% FPL single", () => {
    expect(computeACAAnnualCost({ magi: 31000 })).toBe(0);
  });
  it("$0 at 200% FPL couple", () => {
    expect(computeACAAnnualCost({ magi: 42300, householdSize: 2 })).toBe(0);
  });
});

describe("computeACAAnnualCost — subsidized band (200%–400% FPL)", () => {
  it("flips off Essential Plan at 200% + $1 (single) — small but nonzero cost", () => {
    const cost = computeACAAnnualCost({ magi: 31301 });
    expect(cost).toBeGreaterThan(0);
    // ~9.96% of $31,301 = ~$3,118/yr (2026 top-of-band applicable percentage)
    expect(closeTo(cost, 31301 * ACA_PTC_CONTRIBUTION_CAP, 1)).toBe(true);
  });

  it("contribution capped at 9.96% of MAGI in the middle of the band", () => {
    // 300% FPL single = $46,950; 9.96% = $4,676/yr
    const cost = computeACAAnnualCost({ magi: 46950 });
    expect(closeTo(cost, 46950 * ACA_PTC_CONTRIBUTION_CAP, 1)).toBe(true);
  });

  it("never exceeds the unsubsidized rate even at the high end of the band", () => {
    // 9.96% of $62,600 (400% FPL) = $6,235 — well under default $9,679.
    // Using a low override to force the min() to bind.
    const cost = computeACAAnnualCost({ magi: 50000, unsubsidizedAnnual: 4000 });
    expect(cost).toBe(4000);
  });
});

describe("computeACAAnnualCost — 400% FPL cliff", () => {
  it("just below 400% FPL: subsidized cap binds", () => {
    // 399% FPL = $62,443.50; 9.96% = $6,219/yr (well under $9,679 default)
    const cost = computeACAAnnualCost({ magi: 62443 });
    expect(closeTo(cost, 62443 * ACA_PTC_CONTRIBUTION_CAP, 1)).toBe(true);
  });

  it("at exactly 400% FPL: still subsidized (per IRC §36B 'does not exceed 400 percent')", () => {
    const cost = computeACAAnnualCost({ magi: 62600 });
    // 9.96% of $62,600 = $6,235 (under the $9,679 unsubsidized default).
    expect(closeTo(cost, 62600 * ACA_PTC_CONTRIBUTION_CAP, 1)).toBe(true);
    expect(cost).toBeLessThan(NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT);
  });

  it("at exactly 400% FPL couple ($84,600): still subsidized", () => {
    // Same boundary semantics with the couple FPL.
    const cost = computeACAAnnualCost({ magi: 84600, householdSize: 2 });
    expect(closeTo(cost, 84600 * ACA_PTC_CONTRIBUTION_CAP, 1)).toBe(true);
    expect(cost).toBeLessThan(NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT);
  });

  it("just above 400% FPL: full unsubsidized — the famous OBBBA cliff", () => {
    const cost = computeACAAnnualCost({ magi: 62601 });
    expect(cost).toBe(NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT);
  });

  it("cliff size: ~$3,500/yr step at 400% FPL single (NYC default rate)", () => {
    // The dollar magnitude of the cliff is what shifts the break-even.
    // Just below 400% FPL: subsidized cost = 9.96% × $62,599 ≈ $6,235/yr.
    // At/past cliff: $9,679/yr unsubsidized. Step = ~$3,444.
    const justBelow = computeACAAnnualCost({ magi: 62599 });
    const atCliff = computeACAAnnualCost({ magi: 62601 });
    const cliffSize = atCliff - justBelow;
    expect(cliffSize).toBeGreaterThan(3000);
    expect(cliffSize).toBeLessThan(5000);
  });

  it("respects a user-overridden unsubsidized rate (e.g. couple coverage)", () => {
    const cost = computeACAAnnualCost({
      magi: 100000,
      householdSize: 2,
      unsubsidizedAnnual: 19358,
    });
    expect(cost).toBe(19358);
  });
});

describe("getIRMAATier", () => {
  it("Tier 0 at exactly $109,000 MAGI", () => {
    const t = getIRMAATier(109000);
    expect(t.annualExtra).toBe(0);
  });
  it("Tier 1 at $109,001 MAGI ($1 over)", () => {
    const t = getIRMAATier(109001);
    expect(t.annualExtra).toBeCloseTo(1148.4, 1);
  });
  it("Tier 2 at $137,001 MAGI", () => {
    const t = getIRMAATier(137001);
    expect(t.annualExtra).toBeCloseTo(2884.8, 1);
  });
  it("Tier 5 (top) at $500,001 MAGI", () => {
    const t = getIRMAATier(500001);
    expect(t.annualExtra).toBeCloseTo(6936.0, 1);
  });
  it("matches the published bracket table object identity for each tier", () => {
    expect(getIRMAATier(50000)).toBe(IRMAA_2026_SINGLE[0]);
    expect(getIRMAATier(150000)).toBe(IRMAA_2026_SINGLE[2]);
    expect(getIRMAATier(1_000_000)).toBe(IRMAA_2026_SINGLE[5]);
  });
});

describe("computeMedicareAnnualCost", () => {
  it("standard Part B only when MAGI is in Tier 0", () => {
    expect(computeMedicareAnnualCost({ magi: 50000 })).toBeCloseTo(
      PART_B_BASE_ANNUAL_2026,
      2
    );
  });
  it("adds Tier 1 surcharge above $109K MAGI", () => {
    expect(computeMedicareAnnualCost({ magi: 109001 })).toBeCloseTo(
      PART_B_BASE_ANNUAL_2026 + 1148.4,
      1
    );
  });
  it("adds full top-tier surcharge above $500K MAGI", () => {
    expect(computeMedicareAnnualCost({ magi: 600000 })).toBeCloseTo(
      PART_B_BASE_ANNUAL_2026 + 6936.0,
      1
    );
  });
});

describe("computeAnnualHealthcareCost — age dispatch", () => {
  it("routes to ACA when age < 65", () => {
    // 60-yr-old at 401% FPL → unsubsidized cliff cost.
    const cost = computeAnnualHealthcareCost({
      age: 60,
      magiACA: 62700,
      magiIRMAA: 53000, // ignored when age < 65
    });
    expect(cost).toBe(NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT);
  });

  it("routes to Medicare at age 65 (the eligibility boundary)", () => {
    // ACA MAGI is irrelevant at 65+. IRMAA MAGI is what counts.
    const cost = computeAnnualHealthcareCost({
      age: 65,
      magiACA: 999999, // ignored
      magiIRMAA: 50000,
    });
    expect(cost).toBeCloseTo(PART_B_BASE_ANNUAL_2026, 2);
  });

  it("routes to Medicare past 65 (sanity check)", () => {
    const cost = computeAnnualHealthcareCost({
      age: 75,
      magiACA: 0,
      magiIRMAA: 110000,
    });
    expect(cost).toBeCloseTo(PART_B_BASE_ANNUAL_2026 + 1148.4, 1);
  });
});

describe("nextCliffAbove — pre-65", () => {
  it("flags the 200% FPL Essential Plan cliff when MAGI is below 200% FPL", () => {
    const cliff = nextCliffAbove({ age: 62, magiACA: 25000, magiIRMAA: 0 });
    expect(cliff).not.toBeNull();
    expect(cliff.label).toMatch(/Essential Plan/);
    expect(cliff.magiAtCliff).toBe(31300);
    expect(cliff.distance).toBe(6300);
    expect(cliff.annualCostDelta).toBeGreaterThan(0);
  });

  it("flags the 400% FPL ACA cliff when MAGI is in the 200–400% band", () => {
    const cliff = nextCliffAbove({ age: 62, magiACA: 50000, magiIRMAA: 0 });
    expect(cliff).not.toBeNull();
    expect(cliff.label).toMatch(/ACA premium tax credit cliff/);
    expect(cliff.magiAtCliff).toBe(62600);
    expect(cliff.distance).toBe(12600);
    // Crossing the cliff goes from ~$4,980/yr (subsidized 9.96%) to $9,679 (unsub).
    expect(cliff.annualCostDelta).toBeGreaterThan(3000);
    expect(cliff.annualCostDelta).toBeLessThan(7000);
  });

  it("returns null when already past the 400% FPL cliff", () => {
    const cliff = nextCliffAbove({ age: 62, magiACA: 80000, magiIRMAA: 0 });
    expect(cliff).toBeNull();
  });
});

describe("nextCliffAbove — 65+", () => {
  it("flags Tier 1 IRMAA cliff in Tier 0", () => {
    const cliff = nextCliffAbove({ age: 65, magiACA: 0, magiIRMAA: 90000 });
    expect(cliff).not.toBeNull();
    expect(cliff.label).toMatch(/Tier 1/);
    expect(cliff.magiAtCliff).toBe(109000);
    expect(cliff.distance).toBe(19000);
    expect(cliff.annualCostDelta).toBeCloseTo(1148.4, 1);
  });

  it("flags Tier 2 IRMAA cliff when sitting in Tier 1", () => {
    const cliff = nextCliffAbove({ age: 70, magiACA: 0, magiIRMAA: 120000 });
    expect(cliff).not.toBeNull();
    expect(cliff.label).toMatch(/Tier 2/);
    expect(cliff.magiAtCliff).toBe(137000);
    // Stepping from Tier 1 ($1,148/yr) up to Tier 2 ($2,884/yr) costs $1,737.
    expect(cliff.annualCostDelta).toBeCloseTo(2884.8 - 1148.4, 1);
  });

  it("returns null when already in the top IRMAA tier", () => {
    const cliff = nextCliffAbove({ age: 70, magiACA: 0, magiIRMAA: 600000 });
    expect(cliff).toBeNull();
  });
});

describe("coveredElsewhere — short-circuits the whole cost equation", () => {
  // The "I have employer coverage / retiree health / VA / spouse's plan"
  // toggle. The OBBBA cliffs are real but only matter for people on the
  // individual market or paying IRMAA — which is not everyone.
  it("returns $0 cost regardless of MAGI when covered elsewhere — pre-65", () => {
    const cost = computeAnnualHealthcareCost({
      age: 62,
      magiACA: 100000, // would normally be over the 400% FPL cliff
      magiIRMAA: 0,
      coveredElsewhere: true,
    });
    expect(cost).toBe(0);
  });

  it("returns $0 cost regardless of MAGI when covered elsewhere — 65+", () => {
    // A working 67-year-old with employer coverage who's deferred Part B
    // is a real scenario — they pay no IRMAA and no base Part B.
    const cost = computeAnnualHealthcareCost({
      age: 67,
      magiACA: 0,
      magiIRMAA: 250000, // would normally trigger Tier 3 IRMAA
      coveredElsewhere: true,
    });
    expect(cost).toBe(0);
  });

  it("nextCliffAbove returns null when covered elsewhere", () => {
    // No cliff to warn about if you're not on the ladder in the first place.
    const cliff = nextCliffAbove({
      age: 62,
      magiACA: 50000,
      magiIRMAA: 0,
      coveredElsewhere: true,
    });
    expect(cliff).toBeNull();
  });

  it("default behavior (coveredElsewhere omitted) still applies the cost", () => {
    // Regression: the new flag must default to false so existing call sites
    // — and the rest of the calculator — keep their current behavior.
    const cost = computeAnnualHealthcareCost({
      age: 62,
      magiACA: 70000, // > 400% FPL
      magiIRMAA: 0,
    });
    expect(cost).toBe(NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT);
  });
});

describe("the load-bearing OBBBA scenario — single NYC claimant at age 62", () => {
  // The motivating use case: someone with $30K of working income considering
  // claiming SS at 62 to add ~$24K of annual benefit. The combined $54K MAGI
  // sits in the subsidized ACA band but is well above the Essential Plan
  // ceiling. Claiming pushes ACA cost from $0 (Essential Plan at $30K MAGI)
  // to the subsidized cap (~$5,378/yr at $54K MAGI). The $5K/yr healthcare
  // hit is a real drag on the early-claim invested-pot calculus.
  it("MAGI without SS sits below the 200% FPL Essential Plan ceiling", () => {
    const magiBeforeClaiming = computeMagiACA({
      grossIncome: 30000,
      ssAnnualGross: 0,
    });
    const cost = computeACAAnnualCost({ magi: magiBeforeClaiming });
    expect(cost).toBe(0);
  });

  it("claiming $24K of SS pushes MAGI into subsidized ACA — costing ~$5K/yr", () => {
    const magiAfterClaiming = computeMagiACA({
      grossIncome: 30000,
      ssAnnualGross: 24000,
    });
    const cost = computeACAAnnualCost({ magi: magiAfterClaiming });
    // 9.96% of $54,000 = $5,378.40 (2026 top-of-band applicable percentage)
    expect(cost).toBeCloseTo(5378.4, 1);
  });

  it("higher-income claimant ($45K wages + $24K SS) gets pushed past the 400% FPL cliff", () => {
    const magi = computeMagiACA({ grossIncome: 45000, ssAnnualGross: 24000 });
    expect(magi).toBe(69000); // > $62,600 = 400% FPL
    const cost = computeACAAnnualCost({ magi });
    expect(cost).toBe(NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT);
  });
});

describe("MSP zero-out at 65+ (NY Medicare Savings Programs)", () => {
  it("QMB/SLMB/QI cover Part B premium when MAGI ≤135% FPL (single)", () => {
    // 135% × $15,650 = $21,128 ceiling. $20K MAGI is below.
    expect(computeMedicareAnnualCost({ magi: 20000 })).toBe(0);
  });

  it("falls back to standard Part B premium just above the MSP ceiling", () => {
    // $25K MAGI > 135% FPL ($21,128) → no MSP, standard Part B.
    expect(computeMedicareAnnualCost({ magi: 25000 })).toBeCloseTo(
      PART_B_BASE_ANNUAL_2026,
      2
    );
  });

  it("uses the couple FPL ceiling ($21,150 × 1.35 = $28,553) for households of 2", () => {
    // $25K MAGI: above single ceiling ($21,128), below couple ceiling.
    expect(computeMedicareAnnualCost({ magi: 25000, householdSize: 1 })).toBe(
      PART_B_BASE_ANNUAL_2026
    );
    expect(computeMedicareAnnualCost({ magi: 25000, householdSize: 2 })).toBe(0);
  });

  it("MSP doesn't apply once MAGI is high enough to trigger IRMAA", () => {
    // Sanity check: IRMAA tier 1 starts at $109K (~700% FPL single) — well
    // past the MSP ceiling. $200K MAGI sits in Tier 3 ($171K-$205K).
    expect(computeMedicareAnnualCost({ magi: 200000 })).toBeCloseTo(
      PART_B_BASE_ANNUAL_2026 + 4620.0,
      1
    );
  });

  it("dispatches MSP zero-out via computeAnnualHealthcareCost at 65+", () => {
    const cost = computeAnnualHealthcareCost({
      age: 65,
      magiACA: 0,
      magiIRMAA: 18000,
      mspIncome: 18000,
    });
    expect(cost).toBe(0);
  });
});

describe("MSP eligibility uses gross-SS income, not IRMAA MAGI", () => {
  // Regression for the "0% FPL · MSP covers Part B" bug. A retiree living on
  // ~$32K/yr of Social Security with no other income has $0 IRMAA MAGI
  // (none of the SS is taxable when combined income < $25K), but their MSP
  // countable income is the GROSS benefit (~207% FPL) — well above the 135%
  // MSP ceiling. They owe no IRMAA surcharge AND get no MSP, so they pay the
  // standard Part B base premium. The old code reused IRMAA MAGI for the MSP
  // test and falsely zeroed the premium.
  it("does NOT grant MSP when gross-SS income is above 135% FPL even if taxable-SS MAGI is $0", () => {
    expect(
      computeMedicareAnnualCost({ magi: 0, mspIncome: 32400 })
    ).toBeCloseTo(PART_B_BASE_ANNUAL_2026, 2);
  });

  it("still grants MSP when gross-SS income itself is below 135% FPL", () => {
    // $18K gross SS < $21,128 ceiling → genuinely low income → free Part B.
    expect(computeMedicareAnnualCost({ magi: 0, mspIncome: 18000 })).toBe(0);
  });

  it("defaults mspIncome to magi for backward compatibility", () => {
    // No mspIncome passed → falls back to magi (old single-MAGI behavior).
    expect(computeMedicareAnnualCost({ magi: 18000 })).toBe(0);
    expect(computeMedicareAnnualCost({ magi: 25000 })).toBeCloseTo(
      PART_B_BASE_ANNUAL_2026,
      2
    );
  });

  it("computeAnnualHealthcareCost at 65+ charges standard Part B for an SS-only retiree", () => {
    // age 65+, taxable-SS MAGI $0, gross-SS income ~$32K. Was returning $0.
    const cost = computeAnnualHealthcareCost({
      age: 67,
      magiACA: 0,
      magiIRMAA: 0,
      mspIncome: 32400,
    });
    expect(cost).toBeCloseTo(PART_B_BASE_ANNUAL_2026, 2);
  });

  it("nextCliffAbove shows no MSP cliff when gross-SS income clears the ceiling", () => {
    // taxable-SS MAGI $0 but gross-SS income $32K (207% FPL). The next cliff
    // is the IRMAA Tier 1 boundary, not the MSP ceiling.
    const cliff = nextCliffAbove({
      age: 67,
      magiACA: 0,
      magiIRMAA: 0,
      mspIncome: 32400,
    });
    expect(cliff).not.toBeNull();
    expect(cliff.label).not.toMatch(/Medicare Savings Program/);
    expect(cliff.label).toMatch(/Tier 1/);
  });
});

describe("Medicaid cliff (138% FPL) in nextCliffAbove", () => {
  it("returns the Medicaid → EP cliff with $0 premium delta when MAGI is below 138% FPL", () => {
    // 138% × $15,650 = $21,597. $18K MAGI is below.
    const cliff = nextCliffAbove({ age: 62, magiACA: 18000, magiIRMAA: 0 });
    expect(cliff).not.toBeNull();
    expect(cliff.label).toMatch(/Medicaid/);
    expect(cliff.magiAtCliff).toBeCloseTo(21597, 0);
    expect(cliff.distance).toBeCloseTo(3597, 0);
    // Both Medicaid and Essential Plan are $0 premium — the cliff is a
    // coverage-change cliff, not a premium-cost cliff.
    expect(cliff.annualCostDelta).toBe(0);
  });

  it("skips to the Essential Plan cliff once MAGI is in the 138-200% band", () => {
    // $25K is above 138% ($21,597) but below 200% ($31,300).
    const cliff = nextCliffAbove({ age: 62, magiACA: 25000, magiIRMAA: 0 });
    expect(cliff.label).toMatch(/Essential Plan/);
    expect(cliff.annualCostDelta).toBeGreaterThan(0);
  });
});

describe("MSP cliff in nextCliffAbove (65+)", () => {
  it("returns the MSP cliff with $2,434.80/yr delta when MAGI is below 135% FPL", () => {
    // $18K MAGI is below the 135% FPL ceiling ($21,128 single).
    const cliff = nextCliffAbove({ age: 65, magiACA: 0, magiIRMAA: 18000 });
    expect(cliff).not.toBeNull();
    expect(cliff.label).toMatch(/Medicare Savings Program/);
    expect(cliff.magiAtCliff).toBeCloseTo(MSP_PART_B_FPL_CEILING * 15650, 0);
    expect(cliff.annualCostDelta).toBeCloseTo(PART_B_BASE_ANNUAL_2026, 2);
  });

  it("skips to IRMAA Tier 1 cliff once MAGI is above the MSP ceiling", () => {
    // $25K MAGI is above MSP ceiling but well below IRMAA Tier 1 ($109K).
    const cliff = nextCliffAbove({ age: 65, magiACA: 0, magiIRMAA: 25000 });
    expect(cliff.label).toMatch(/Tier 1/);
    expect(cliff.annualCostDelta).toBeCloseTo(1148.4, 1);
  });
});

// ---------------------------------------------------------------------------
// 2026-constants pinning — every published number that ships in this module
// has a citation. These tests fail the moment the indexed value drifts, so
// the annual review of healthcare constants is a single test run instead of
// a comment trawl. Refresh in late 2026 when:
//   - HHS publishes the 2026 FPL guidelines (used for 2027 PTC)
//   - CMS publishes the 2027 Part B premium + IRMAA brackets (Nov 2026)
//   - NY State of Health publishes 2027 LCSP rates (Nov 2026)
//   - IRS publishes the 2027 applicable percentages (Rev. Proc. ~mid-2026)
// ---------------------------------------------------------------------------
describe("2026 official-source pinning (regenerate when sources update)", () => {
  it("2025 FPL single = $15,650 (HHS ASPE, used for 2026 PTC)", () => {
    expect(FPL_2025_FOR_2026_PTC.single).toBe(15650);
  });

  it("2025 FPL couple = $21,150 (HHS ASPE; single + $5,500 per add'l member)", () => {
    expect(FPL_2025_FOR_2026_PTC.couple).toBe(21150);
    expect(FPL_2025_FOR_2026_PTC.couple - FPL_2025_FOR_2026_PTC.single).toBe(
      FPL_2025_FOR_2026_PTC.perAdditionalMember
    );
  });

  it("400% FPL single cliff = $62,600 (4× $15,650)", () => {
    expect(ACA_PTC_CLIFF_FPL * FPL_2025_FOR_2026_PTC.single).toBe(62600);
  });

  it("200% FPL single Essential Plan ceiling = $31,300 (2× $15,650)", () => {
    expect(ESSENTIAL_PLAN_FPL_CEILING * FPL_2025_FOR_2026_PTC.single).toBe(
      31300
    );
  });

  it("ACA PTC contribution cap = 9.96% (IRS Rev. Proc. 2025-25, top of band)", () => {
    expect(ACA_PTC_CONTRIBUTION_CAP).toBe(0.0996);
  });

  it("MSP ceiling = 135% FPL (NY QMB/SLMB/QI upper bound, asset test removed 2023)", () => {
    expect(MSP_PART_B_FPL_CEILING).toBe(1.35);
  });

  it("Medicaid ceiling = 138% FPL (133% + 5% disregard, NY adult MAGI rules)", () => {
    expect(MEDICAID_FPL_CEILING).toBe(1.38);
  });

  it("2026 Part B base premium = $202.90/mo → $2,434.80/yr (CMS Nov 2025)", () => {
    expect(PART_B_BASE_ANNUAL_2026).toBeCloseTo(2434.8, 2);
  });

  it("NYC unsubsidized silver default = $9,679/yr (NY SoH 2026 LCSP, $806.61/mo)", () => {
    expect(NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT).toBe(9679);
  });

  it("IRMAA 2026 single Tier 1 starts $1 above $109K MAGI (CMS Nov 2025)", () => {
    expect(IRMAA_2026_SINGLE[0].maxMagi).toBe(109000);
    expect(IRMAA_2026_SINGLE[0].annualExtra).toBe(0);
  });

  it("IRMAA 2026 single tier upper bounds: $137K / $171K / $205K / $500K / ∞", () => {
    const bounds = IRMAA_2026_SINGLE.map((t) => t.maxMagi);
    expect(bounds).toEqual([109000, 137000, 171000, 205000, 500000, Infinity]);
  });

  it("IRMAA 2026 Part B monthly surcharges: $0 / $81.20 / $202.90 / $324.60 / $446.30 / $487.00", () => {
    const partB = IRMAA_2026_SINGLE.map((t) => t.partBSurcharge);
    expect(partB).toEqual([0, 81.2, 202.9, 324.6, 446.3, 487]);
  });

  it("IRMAA 2026 Part D monthly surcharges: $0 / $14.50 / $37.50 / $60.40 / $83.30 / $91.00", () => {
    const partD = IRMAA_2026_SINGLE.map((t) => t.partDSurcharge);
    expect(partD).toEqual([0, 14.5, 37.5, 60.4, 83.3, 91]);
  });

  it("IRMAA annualExtra rows internally consistent with (partB+partD)*12", () => {
    for (const tier of IRMAA_2026_SINGLE) {
      const recomputed = (tier.partBSurcharge + tier.partDSurcharge) * 12;
      expect(tier.annualExtra).toBeCloseTo(recomputed, 1);
    }
  });
});

describe("armHealthcareByRegime — three-regime, two-MAGI assembly", () => {
  // Early-arm shape: claims at 62 with $40K wage + $24K gross SS pre-FRA, then a
  // $30K recouped benefit (no post-FRA wage). taxableSSPct passed explicitly so
  // the assertions don't depend on the SS-taxation tiering.
  const base = {
    preFRAAge: 62,
    grossIncomePreFRA: 40000,
    grossIncomePostFRA: 0,
    ssBasisPreFRA: 24000,
    ssBasisPostFRA: 30000,
    taxableSSPctPreFRA: 0.85,
    taxableSSPctPostFRA: 0.85,
  };

  it("prices the pre regime as ACA when claiming before 65", () => {
    // MAGI ACA = 40000 + 24000 = 64000, over the 400% FPL cliff (62600) -> the
    // full unsubsidized premium.
    expect(armHealthcareByRegime(base).preAnnual).toBe(
      NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT
    );
  });

  it("prices the 65->FRA and post-FRA regimes as Medicare base when IRMAA MAGI is low", () => {
    const r = armHealthcareByRegime(base);
    // IRMAA MAGI pre = 40000 + 24000*0.85 = 60400 (tier 0); MSP income 64000 is
    // above the 135% ceiling -> standard Part B, no surcharge, no MSP zero-out.
    expect(closeTo(r.medicare65Annual, PART_B_BASE_ANNUAL_2026)).toBe(true);
    // Post: IRMAA MAGI = 30000*0.85 = 25500 (tier 0); MSP income 30000 above ceiling.
    expect(closeTo(r.medicarePostAnnual, PART_B_BASE_ANNUAL_2026)).toBe(true);
  });

  it("prices the pre regime as Medicare (not the ACA cliff premium) when claiming at 65+", () => {
    const r = armHealthcareByRegime({ ...base, preFRAAge: 66 });
    expect(closeTo(r.preAnnual, PART_B_BASE_ANNUAL_2026)).toBe(true);
    expect(r.preAnnual).not.toBe(NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT);
  });

  it("a wait arm (no pre-FRA SS) prices the pre regime on wage-only MAGI", () => {
    // ssBasisPreFRA 0 -> MAGI ACA = wage 40000, between 200% ($31,300) and 400%
    // ($62,600) FPL -> subsidized: capped at 9.96% of MAGI.
    const r = armHealthcareByRegime({
      ...base,
      ssBasisPreFRA: 0,
      taxableSSPctPreFRA: 0,
    });
    expect(r.preAnnual).toBeLessThan(NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT);
    expect(closeTo(r.preAnnual, 40000 * ACA_PTC_CONTRIBUTION_CAP)).toBe(true);
  });

  it("coveredElsewhere zeroes every regime", () => {
    expect(armHealthcareByRegime({ ...base, coveredElsewhere: true })).toEqual({
      preAnnual: 0,
      medicare65Annual: 0,
      medicarePostAnnual: 0,
    });
  });
});
