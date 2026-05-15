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
    // ~9.5% of $31,301 = ~$2,973/yr
    expect(closeTo(cost, 31301 * ACA_PTC_CONTRIBUTION_CAP, 1)).toBe(true);
  });

  it("contribution capped at 9.5% of MAGI in the middle of the band", () => {
    // 300% FPL single = $46,950; 9.5% = $4,460/yr
    const cost = computeACAAnnualCost({ magi: 46950 });
    expect(closeTo(cost, 46950 * 0.095, 1)).toBe(true);
  });

  it("never exceeds the unsubsidized rate even at the high end of the band", () => {
    // 9.5% of $62,600 (400% FPL) = $5,947 — well under default $9,679.
    // Using a low override to force the min() to bind.
    const cost = computeACAAnnualCost({ magi: 50000, unsubsidizedAnnual: 4000 });
    expect(cost).toBe(4000);
  });
});

describe("computeACAAnnualCost — 400% FPL cliff", () => {
  it("just below 400% FPL: subsidized cap binds", () => {
    // 399% FPL = $62,443.50; 9.5% = $5,932/yr (well under $9,679 default)
    const cost = computeACAAnnualCost({ magi: 62443 });
    expect(closeTo(cost, 62443 * 0.095, 1)).toBe(true);
  });

  it("at exactly 400% FPL: still subsidized (≤ is the boundary)", () => {
    const cost = computeACAAnnualCost({ magi: 62600 });
    // 400% FPL exactly: cliff fires (>= is the cliff condition)
    expect(cost).toBe(NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT);
  });

  it("just above 400% FPL: full unsubsidized — the famous OBBBA cliff", () => {
    const cost = computeACAAnnualCost({ magi: 62601 });
    expect(cost).toBe(NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT);
  });

  it("cliff size: ~$3,700/yr step at 400% FPL single (NYC default rate)", () => {
    // The dollar magnitude of the cliff is what shifts the break-even.
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
    // Crossing the cliff goes from ~$4,750/yr (subsidized) to $9,679 (unsub).
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
  // to the subsidized cap (~$5,130/yr at $54K MAGI). The $5K/yr healthcare
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
    // 9.5% of $54,000 = $5,130
    expect(cost).toBeCloseTo(5130, 1);
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
    });
    expect(cost).toBe(0);
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
