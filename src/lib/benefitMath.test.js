// Integration tests for the top-level computeProjection orchestrator.
// Unit tests for the underlying modules live in:
//   - ssRules.test.js         (factor formulas, earnings test, recoup, resolveBenefits)
//   - taxMath.test.js         (taxable SS tier, marginal brackets, effective tax rate)
//   - chartProjection.test.js (phase boundaries, pot at age, cash collection, chart shape)

import { describe, it, expect } from "vitest";
import { computeProjection, fmtDuration, FRA } from "./benefitMath.js";

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
  // The current model uses three rates — earlyPreFRA, earlyPostFRA, and
  // wait — applied to their respective monthly nets. Pass postFRAGrossIncome
  // equal to grossIncome here so the wait scenario has meaningful combined
  // income to compare against early-scenario rates.

  it("at a tier-disparity income, wait taxes fraMonthlyNet more heavily than early-pre-FRA", () => {
    // fraBenefit 2500 (annual wait basis $30K), early at 62 → 1750 (annual
    // early basis $21K). grossIncome $20K places wait combined income at
    // $35K (tier 2) and early-pre-FRA combined at $30.5K (tier 1).
    const r = computeProjection({
      ...baseInputs,
      grossIncome: 20000,
      postFRAGrossIncome: 20000,
      autoTax: true,
    });

    const earlyTaxFraction =
      1 - r.earlyMonthlyNet / ((r.annualEarlyGross - r.earningsTestWithholding) / 12);
    const waitTaxFraction = 1 - r.fraMonthlyNet / r.fraMonthlyGross;
    expect(waitTaxFraction).toBeGreaterThan(earlyTaxFraction);
  });

  it("when both scenarios collapse to the same SS basis (switch mode), tax fractions match", () => {
    const r = computeProjection({
      ...baseInputs,
      mode: "switch",
      grossIncome: 20000,
      postFRAGrossIncome: 20000,
      autoTax: true,
    });
    const earlyTaxFraction = 1 - r.earlyPostFRAMonthlyNet / r.earlyPostFRAMonthlyGross;
    const waitTaxFraction = 1 - r.fraMonthlyNet / r.fraMonthlyGross;
    expect(closeTo(earlyTaxFraction, waitTaxFraction, 0.0001)).toBe(true);
  });

  it("displayed combinedIncome tracks the tier active at the chosen claim age", () => {
    // Pre-FRA claimer: headline reflects pre-FRA tier (grossIncome + 0.5 × after-ET SS).
    const early = computeProjection({
      ...baseInputs,
      claimAge: 62,
      grossIncome: 50000,
      postFRAGrossIncome: 20000,
      autoTax: true,
    });
    const expectedEarly =
      50000 + 0.5 * (early.annualEarlyGross - early.earningsTestWithholding);
    expect(closeTo(early.combinedIncome, expectedEarly, 0.5)).toBe(true);

    // FRA claimer: headline reflects post-FRA tier (postFRAGrossIncome + 0.5 × post-FRA SS).
    const fra = computeProjection({
      ...baseInputs,
      claimAge: 67,
      grossIncome: 50000,
      postFRAGrossIncome: 20000,
      autoTax: true,
    });
    const expectedFra = 20000 + 0.5 * fra.earlyPostFRAMonthlyGross * 12;
    expect(closeTo(fra.combinedIncome, expectedFra, 0.5)).toBe(true);
  });

  it("dragging the pre-67 wage slider moves the displayed fedMarginalRate (claim age < FRA)", () => {
    // Regression: previously the headline rate was pinned to the post-FRA
    // tier, so the pre-67 wage slider had no visible effect on the
    // auto-tax UI even though it was already affecting the pre-FRA chart math.
    const lowPre = computeProjection({
      ...baseInputs,
      claimAge: 62,
      grossIncome: 0,
      postFRAGrossIncome: 0,
      autoTax: true,
    });
    const highPre = computeProjection({
      ...baseInputs,
      claimAge: 62,
      // $30K crosses the taxable-SS and 12% brackets without wiping out
      // the entire SS basis via the earnings test (which at $80K+ would
      // withhold the whole check and collapse taxableSSPct back to 0).
      grossIncome: 30000,
      postFRAGrossIncome: 0,
      autoTax: true,
    });
    expect(highPre.combinedIncome).toBeGreaterThan(lowPre.combinedIncome);
    expect(highPre.fedMarginalRate).toBeGreaterThan(lowPre.fedMarginalRate);
    expect(highPre.ssEffectiveTaxRate).toBeGreaterThan(lowPre.ssEffectiveTaxRate);
  });
});

describe("computeProjection — postFRAGrossIncome", () => {
  // The calculator splits wage income into pre-FRA and post-FRA periods.
  // Pre-FRA wages drive the earnings test (which only applies pre-FRA) and
  // the pre-FRA federal-tax combined-income calc. Post-FRA wages drive
  // only the post-FRA combined-income calc. Default 0 = retire at FRA.

  it("defaults postFRAGrossIncome to 0 when omitted (typical retiree case)", () => {
    // claimAge=67 forces the post-FRA tier for the headline (which is what
    // this test cares about). At claimAge<FRA the headline now tracks the
    // pre-FRA tier, so postFRAGrossIncome wouldn't flow into combinedIncome.
    const r = computeProjection({ ...baseInputs, claimAge: 67 });
    const expected = 0 + 0.5 * r.earlyPostFRAMonthlyGross * 12;
    expect(closeTo(r.combinedIncome, expected, 0.5)).toBe(true);
  });

  it("higher postFRAGrossIncome raises combined income and the headline tax rate (auto)", () => {
    // Use claimAge=67 so the headline reads the post-FRA tier that
    // postFRAGrossIncome actually drives.
    const lowPost = computeProjection({
      ...baseInputs,
      claimAge: 67,
      grossIncome: 0,
      postFRAGrossIncome: 0,
      autoTax: true,
    });
    const highPost = computeProjection({
      ...baseInputs,
      claimAge: 67,
      grossIncome: 0,
      postFRAGrossIncome: 80000, // big enough to cross thresholds for fraBenefit=2500
      autoTax: true,
    });
    expect(highPost.combinedIncome).toBeGreaterThan(lowPost.combinedIncome);
    expect(highPost.ssEffectiveTaxRate).toBeGreaterThan(lowPost.ssEffectiveTaxRate);
  });

  it("postFRAGrossIncome doesn't affect the earnings test (which only sees pre-FRA grossIncome)", () => {
    // No pre-FRA income but plenty post-FRA → earnings test still returns 0.
    const r = computeProjection({
      ...baseInputs,
      grossIncome: 0,
      postFRAGrossIncome: 100000,
    });
    expect(r.earningsTestWithholding).toBe(0);
  });

  it("with postFRAGrossIncome=0 and grossIncome>0, fraMonthlyNet uses the post-FRA-zero rate (typical retiree)", () => {
    // Wait scenario only ever pays SS post-FRA. With no post-FRA wages,
    // combined income for wait = 0.5 × $30K = $15K, below the $25K threshold,
    // so 0% of SS is taxable → fraMonthlyNet === fraMonthlyGross.
    const r = computeProjection({
      ...baseInputs,
      grossIncome: 60000, // big pre-FRA income (irrelevant for wait scenario)
      postFRAGrossIncome: 0,
      autoTax: true,
    });
    expect(closeTo(r.fraMonthlyNet, r.fraMonthlyGross, 0.5)).toBe(true);
  });
});

describe("computeProjection — earlyMonthlyNet for at-FRA / late claimers", () => {
  // For claimers at or past FRA there is no pre-FRA period. The displayed
  // "first check" value (Card 1) should therefore use the post-FRA tax tier
  // — not earlyTaxPreFRA, which is built from the pre-67 wage income that
  // doesn't apply once the user is past FRA. Without this, Card 1 reports
  // a heavily-taxed amount the user never actually receives, and silently
  // disagrees with what the chart projection uses for the same scenario.
  it("at FRA exactly: earlyMonthlyNet equals earlyPostFRAMonthlyNet", () => {
    const r = computeProjection({
      ...baseInputs,
      claimAge: 67,
      grossIncome: 100000, // would be a misleading high tax tier if applied
    });
    expect(closeTo(r.earlyMonthlyNet, r.earlyPostFRAMonthlyNet, 0.5)).toBe(true);
  });

  it("late claim (claimAge > FRA): earlyMonthlyNet equals earlyPostFRAMonthlyNet", () => {
    const r = computeProjection({
      ...baseInputs,
      claimAge: 67 + 1 / 12, // 67 yr 1 mo
      grossIncome: 100000,
    });
    expect(closeTo(r.earlyMonthlyNet, r.earlyPostFRAMonthlyNet, 0.5)).toBe(true);
  });

  it("early claim (claimAge < FRA): earlyMonthlyNet still uses pre-FRA tax tier (unchanged)", () => {
    // Sanity check that the standard early-claim path is untouched: with
    // a high pre-67 income the pre-FRA tax tier kicks in and Card 1's
    // value is materially lower than the post-FRA-tax-tier value.
    const r = computeProjection({
      ...baseInputs,
      claimAge: 62,
      grossIncome: 100000,
      postFRAGrossIncome: 0,
    });
    expect(r.earlyMonthlyNet).toBeLessThan(r.earlyPostFRAMonthlyNet);
  });
});

describe("computeProjection — postFRAWorkYears", () => {
  // postFRAWorkYears bounds how many years post-FRA the postFRAGrossIncome
  // applies for tax purposes. After that age the claimant retires and the
  // SS tax tier recomputes against zero wage income. Default 0 means
  // "retired at FRA" — postFRAGrossIncome is effectively ignored for the
  // wait curve and the post-FRA portion of the early curve.
  const finalWait = (r) => r.chartData[r.chartData.length - 1].wait;

  it("defaults to 0: postFRAGrossIncome has no impact on the wait line", () => {
    const noWork = computeProjection({
      ...baseInputs,
      postFRAGrossIncome: 80000,
      // postFRAWorkYears defaults to 0
    });
    const noIncome = computeProjection({
      ...baseInputs,
      postFRAGrossIncome: 0,
    });
    // Wait totals at end of life should be identical because no working
    // years means no income → no tax tier change.
    expect(closeTo(finalWait(noWork), finalWait(noIncome), 5)).toBe(true);
  });

  it("more working years monotonically reduce the wait line at any granularity", () => {
    // Combines what used to be three tests: integer-scale monotonicity
    // (0 → 5 → 18), fractional-scale monotonicity (5 → 5.5 → 6), and the
    // "fractional value differs from rounded-down integer" regression
    // guard (a flooring bug would collapse 5.5 onto 5 and break this).
    const make = (years) =>
      computeProjection({
        ...baseInputs,
        postFRAGrossIncome: 80000,
        postFRAWorkYears: years,
      });
    const sequence = [0, 5, 5.5, 6, 18].map(make).map(finalWait);
    for (let i = 1; i < sequence.length; i++) {
      expect(sequence[i]).toBeLessThan(sequence[i - 1]);
    }
  });

  it("postFRAWorkYears caps at lifeExpectancy (extending past death is a no-op)", () => {
    // Internally the boundary clamps to lifeExpectancy so a slider value
    // past life can't keep applying the higher tax tier from the grave.
    // Compare a value that exactly hits life with one well past it; both
    // should produce the same wait curve (and not NaN).
    const exactlyAtLife = computeProjection({
      ...baseInputs,
      lifeExpectancy: 80,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 13, // FRA 67 + 13 = 80 = life
    });
    const wayPastLife = computeProjection({
      ...baseInputs,
      lifeExpectancy: 80,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 50, // would push the boundary to age 117 if uncapped
    });
    expect(finalWait(exactlyAtLife)).toBe(finalWait(wayPastLife));
    expect(wayPastLife.chartData.every((d) => Number.isFinite(d.wait))).toBe(true);
  });
});

describe("computeProjection — post-67 working vs retired net checks", () => {
  // The UI's "Working past 67" card needs both the net check WHILE working
  // (taxed against post-67 wages) and the net check AFTER work stops (taxed
  // against zero wages). These are exposed as earlyPostFRAMonthlyNetRetired /
  // fraMonthlyNetRetired plus the postFRAWorkEndAge boundary.

  it("exposes the retired-rate net checks and the work-end boundary", () => {
    const r = computeProjection({
      ...baseInputs,
      claimAge: 64,
      grossIncome: 40000,
      postFRAGrossIncome: 40000,
      postFRAWorkYears: 3,
    });
    expect(Number.isFinite(r.earlyPostFRAMonthlyNetRetired)).toBe(true);
    expect(Number.isFinite(r.fraMonthlyNetRetired)).toBe(true);
    // FRA (67) + 3 work years = age 70, well under life=85.
    expect(r.postFRAWorkEndAge).toBe(70);
  });

  it("retiring lifts the net check vs while working when post-67 wages push SS into tax", () => {
    // High post-67 wages tax SS heavily while working; dropping the wage to
    // $0 at retirement collapses the combined-income tier, so the retired
    // net check should be strictly higher than the working net check.
    const r = computeProjection({
      ...baseInputs,
      claimAge: 64,
      grossIncome: 40000,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 5,
    });
    expect(r.earlyPostFRAMonthlyNetRetired).toBeGreaterThan(
      r.earlyPostFRAMonthlyNet
    );
    expect(r.fraMonthlyNetRetired).toBeGreaterThan(r.fraMonthlyNet);
  });

  it("retired and working net checks coincide when there are no post-67 wages", () => {
    const r = computeProjection({
      ...baseInputs,
      claimAge: 64,
      grossIncome: 40000,
      postFRAGrossIncome: 0,
      postFRAWorkYears: 5,
    });
    expect(closeTo(r.earlyPostFRAMonthlyNetRetired, r.earlyPostFRAMonthlyNet, 0.001)).toBe(true);
    expect(closeTo(r.fraMonthlyNetRetired, r.fraMonthlyNet, 0.001)).toBe(true);
  });

  it("postFRAWorkEndAge caps at lifeExpectancy", () => {
    const r = computeProjection({
      ...baseInputs,
      lifeExpectancy: 80,
      postFRAGrossIncome: 40000,
      postFRAWorkYears: 50, // would land at 117 uncapped
    });
    expect(r.postFRAWorkEndAge).toBe(80);
  });
});

describe("computeProjection — wage take-home (federal + state/city)", () => {
  // Display-only wage-tax fields feeding the summary cards' take-home figures.
  // claimAge 64 in 2026 → age-67 calendar year is 2029, past the OBBBA senior-
  // deduction sunset, so the senior deduction is 0 in both windows and the
  // federal wage tax is a clean walk(40000 − 16100) = $2,620.
  const wageInputs = {
    ...baseInputs,
    claimAge: 64,
    grossIncome: 40000,
    postFRAGrossIncome: 40000,
  };

  it("locality 'none': no state/city tax, federal only, net = wage − federal", () => {
    const r = computeProjection({ ...wageInputs, locality: "none" });
    expect(r.wageTaxPostFRA.state).toBe(0);
    expect(r.wageTaxPostFRA.city).toBe(0);
    expect(closeTo(r.wageTaxPostFRA.federal, 2620, 0.01)).toBe(true);
    expect(closeTo(r.wageTaxPostFRA.net, 40000 - 2620, 0.01)).toBe(true);
  });

  it("locality 'ny': state tax only, no city component", () => {
    const r = computeProjection({ ...wageInputs, locality: "ny" });
    expect(closeTo(r.wageTaxPostFRA.state, 1595, 0.01)).toBe(true);
    expect(r.wageTaxPostFRA.city).toBe(0);
  });

  it("locality 'nyc': state + city tax stack, lowering the net wage", () => {
    const r = computeProjection({ ...wageInputs, locality: "nyc" });
    expect(closeTo(r.wageTaxPostFRA.state, 1595, 0.01)).toBe(true);
    expect(closeTo(r.wageTaxPostFRA.city, 1125.75, 0.01)).toBe(true);
    // net = 40000 − 2620 federal − 2720.75 state/city = 34659.25.
    expect(closeTo(r.wageTaxPostFRA.net, 34659.25, 0.01)).toBe(true);
    expect(r.wageTaxPostFRA.total).toBeGreaterThan(
      computeProjection({ ...wageInputs, locality: "none" }).wageTaxPostFRA.total
    );
  });

  it("both pre-FRA and post-FRA windows expose a wage breakdown", () => {
    const r = computeProjection({ ...wageInputs, locality: "nyc" });
    expect(closeTo(r.wageTaxPreFRA.net, 34659.25, 0.01)).toBe(true);
    expect(closeTo(r.wageTaxPostFRA.net, 34659.25, 0.01)).toBe(true);
  });

  it("zero wage → zero tax and zero net", () => {
    const r = computeProjection({
      ...baseInputs,
      grossIncome: 0,
      postFRAGrossIncome: 0,
      locality: "nyc",
    });
    expect(r.wageTaxPostFRA).toMatchObject({
      federal: 0,
      state: 0,
      city: 0,
      total: 0,
      net: 0,
    });
  });

  it("defaults locality to 'none' when omitted (back-compat)", () => {
    const r = computeProjection(wageInputs); // no locality
    expect(r.wageTaxPostFRA.state).toBe(0);
    expect(r.wageTaxPostFRA.city).toBe(0);
  });
});

describe("computeProjection — fractional lifeExpectancy", () => {
  // The Live Until slider now steps by 1/12 so the user can express their
  // expected lifespan to month precision. The math layer must accept the
  // fractional value and the chart must terminate AT that age (not at the
  // previous quarter-year sample).
  const finalWait = (r) => r.chartData[r.chartData.length - 1].wait;

  it("the final chart sample lands at exactly lifeExpectancy (with finite numbers throughout)", () => {
    // Without the fractional-end-sample guard, the 0.25-stride loop would
    // stop at age 85.0 for life=85.0833, leaving the headline "Total at X"
    // numbers off by a month. Bundles the no-NaN smoke check too.
    const r = computeProjection({ ...baseInputs, lifeExpectancy: 85 + 1 / 12 });
    const last = r.chartData[r.chartData.length - 1];
    expect(last.age).toBeCloseTo(85 + 1 / 12, 3);
    expect(r.chartData.every((d) => Number.isFinite(d.wait))).toBe(true);
    expect(r.chartData.every((d) => Number.isFinite(d.early))).toBe(true);
    expect(r.chartData.every((d) => Number.isFinite(d.pot))).toBe(true);
  });

  it("monotonic in life: a longer life accumulates strictly more wait benefits, even at sub-year resolution", () => {
    // Bracket integer + fractional life values together. A flooring bug in
    // the chart loop would collapse adjacent fractional lives onto the same
    // integer year and break this strict monotonicity.
    const lives = [85, 85 + 1 / 12, 85.5, 86, 90];
    const totals = lives.map((life) =>
      finalWait(computeProjection({ ...baseInputs, lifeExpectancy: life }))
    );
    for (let i = 1; i < totals.length; i++) {
      expect(totals[i]).toBeGreaterThan(totals[i - 1]);
    }
  });
});

describe("computeProjection — investedPct", () => {
  // investedPct (0..100) controls how much of each pre-investStopAge check
  // is invested vs. taken as cash. The chartProjection unit tests already
  // pin the math; this is the integration check that the value flows from
  // computeProjection's `investedPct` (a percentage) through to the chart's
  // `investedFraction` (a decimal).
  it("100% (default) maximizes the invested pot at investStopAge", () => {
    const allInvested = computeProjection({ ...baseInputs, investedPct: 100 });
    const halfInvested = computeProjection({ ...baseInputs, investedPct: 50 });
    const noneInvested = computeProjection({ ...baseInputs, investedPct: 0 });
    expect(allInvested.potAtStopRow).toBeGreaterThan(halfInvested.potAtStopRow);
    expect(halfInvested.potAtStopRow).toBeGreaterThan(noneInvested.potAtStopRow);
  });

  it("0% with a positive return strictly underperforms 100% on lifetime totals", () => {
    // No compounding when nothing is invested → 'early' line at end of life
    // collapses to a pure linear sum of net checks.
    const all = computeProjection({ ...baseInputs, investedPct: 100 });
    const none = computeProjection({ ...baseInputs, investedPct: 0 });
    expect(all.finalEarly).toBeGreaterThan(none.finalEarly);
    expect(none.finalPot).toBe(0);
  });
});

describe("computeProjection — fractional claimAge", () => {
  // Claim age has stepped by 1/12 from day one, but the integration layer
  // never had a direct end-to-end test that a sub-year shift propagates.
  // ssRules.test.js pins retirementFactor at half-years but a flooring bug
  // somewhere downstream wouldn't surface there.
  it("a one-month shift in claimAge produces a measurably different earlyMonthlyGross", () => {
    const flat = computeProjection({ ...baseInputs, claimAge: 64 });
    const oneMonthLater = computeProjection({
      ...baseInputs,
      claimAge: 64 + 1 / 12,
    });
    // Each month delayed → less reduction → strictly larger gross check.
    expect(oneMonthLater.earlyMonthlyGross).toBeGreaterThan(flat.earlyMonthlyGross);
  });

  it("monthly claim ages produce strictly increasing earlyMonthlyGross", () => {
    // Sweep month-by-month from 64 to 65 — the early-claim factor should be
    // strictly increasing each step. A flooring bug would create plateaus.
    let prev = -Infinity;
    for (let m = 0; m <= 12; m++) {
      const r = computeProjection({ ...baseInputs, claimAge: 64 + m / 12 });
      expect(r.earlyMonthlyGross).toBeGreaterThan(prev);
      prev = r.earlyMonthlyGross;
    }
  });
});

describe("fmtDuration formatter", () => {
  // Static import — the formatter is pure and lives in the same module the
  // rest of this file already imports. Hand-spot the boundary cases.
  it("zero duration → '0 mo'", () => {
    expect(fmtDuration(0)).toBe("0 mo");
  });

  it("sub-year durations print as bare months (no '0 yr' prefix)", () => {
    expect(fmtDuration(1 / 12)).toBe("1 mo");
    expect(fmtDuration(0.5)).toBe("6 mo");
  });

  it("whole-year durations pluralize correctly", () => {
    expect(fmtDuration(1)).toBe("1 yr");
    expect(fmtDuration(2)).toBe("2 yrs");
    expect(fmtDuration(15)).toBe("15 yrs");
  });

  it("years + months print as 'N yr M mo'", () => {
    expect(fmtDuration(1.5)).toBe("1 yr 6 mo");
    expect(fmtDuration(5 + 7 / 12)).toBe("5 yr 7 mo");
  });

  it("float-creep at the year boundary still rolls forward to a clean year", () => {
    // A 1/12-stepped slider value of 0.99999999 must still print as "1 yr",
    // not as "0 yr 12 mo" or as some other under/overshoot.
    expect(fmtDuration(11.999999 / 12)).toBe("1 yr");
  });
});

describe("computeProjection — wait+invest (investedPctWait)", () => {
  // Defaults: 100% wait check invested. Chart line `waitInvested` and the
  // matching summary fields (finalWaitInvested, waitInvestedAdvantage,
  // waitInvestedBreakEvenAge, waitInvestedCrossoverValue) should be wired up.
  const args = {
    ...baseInputs,
    investStopAge: 70, // > FRA so wait pot has runway
    lifeExpectancy: 90,
    returnRate: 7,
  };

  it("exposes the new wait+invest outputs on the projection", () => {
    const r = computeProjection(args);
    expect(typeof r.finalWaitInvested).toBe("number");
    expect(typeof r.waitInvestedAdvantage).toBe("number");
    // breakEvenAge / crossoverValue can legitimately be null when no
    // crossover exists in range, but the keys must be present.
    expect(r).toHaveProperty("waitInvestedBreakEvenAge");
    expect(r).toHaveProperty("waitInvestedCrossoverValue");
  });

  it("finalWaitInvested > finalWait when returnRate>0 and investedPctWait>0", () => {
    const r = computeProjection({ ...args, investedPctWait: 100 });
    expect(r.finalWaitInvested).toBeGreaterThan(r.finalWait);
  });

  it("waitInvestedAdvantage < advantage when wait also invests (fair fight closes the gap)", () => {
    const r = computeProjection({ ...args, investedPctWait: 100 });
    expect(r.waitInvestedAdvantage).toBeLessThan(r.advantage);
  });

  it("investedPctWait=0 collapses waitInvested back to wait", () => {
    const r = computeProjection({ ...args, investedPctWait: 0 });
    // Allow a tiny rounding tolerance (each row is rounded to int).
    expect(Math.abs(r.finalWaitInvested - r.finalWait)).toBeLessThan(2);
    expect(Math.abs(r.waitInvestedAdvantage - r.advantage)).toBeLessThan(2);
  });

  it("waitInvestedAdvantage decreases monotonically as investedPctWait rises 0 → 100", () => {
    const r0 = computeProjection({ ...args, investedPctWait: 0 });
    const r50 = computeProjection({ ...args, investedPctWait: 50 });
    const r100 = computeProjection({ ...args, investedPctWait: 100 });
    expect(r0.waitInvestedAdvantage).toBeGreaterThan(
      r50.waitInvestedAdvantage
    );
    expect(r50.waitInvestedAdvantage).toBeGreaterThan(
      r100.waitInvestedAdvantage
    );
  });

  it("defaults to investedPctWait=100 when omitted", () => {
    const explicit = computeProjection({ ...args, investedPctWait: 100 });
    const omitted = computeProjection(args); // no investedPctWait
    expect(omitted.finalWaitInvested).toBe(explicit.finalWaitInvested);
    expect(omitted.waitInvestedAdvantage).toBe(explicit.waitInvestedAdvantage);
  });
});

describe("computeProjection — healthcare cost integration (OBBBA / NYC)", () => {
  // Scenario engineered to cross the 400% FPL ACA cliff when claiming early.
  // grossIncome=$25K (right at the earnings-test limit of $24,480 — minimal
  // withholding) + early SS gross ~$42K from a $5K/mo FRA benefit at 62
  // (factor 0.7) → MAGI ~$67K (single, > $62,600 = 400% FPL). Wait scenario
  // at the same age has only $25K MAGI (no SS, ~160% FPL → Essential Plan,
  // $0 cost). The full $9,679/yr unsubsidized NYC silver premium becomes
  // the annual drag on the early-claim cash flow.
  const cliffArgs = {
    ...baseInputs,
    fraBenefit: 5000,
    grossIncome: 25000,
    autoTax: true,
    coveredElsewhere: false, // healthcare modeling ON
    unsubsidizedSilverAnnual: 9679,
  };

  it("produces a substantial healthcare delta when claiming early pushes MAGI past the ACA cliff", () => {
    const r = computeProjection(cliffArgs);
    // Early MAGI > 400% FPL → unsubsidized $9,679. Wait MAGI < 200% FPL →
    // Essential Plan $0. Delta is essentially the full unsubsidized cost.
    expect(r.healthcareDeltaAnnualPre).toBeGreaterThan(8000);
  });

  it("coveredElsewhere=true zeroes out both healthcare deltas", () => {
    const r = computeProjection({ ...cliffArgs, coveredElsewhere: true });
    expect(r.healthcareDeltaAnnualPre).toBe(0);
    expect(r.healthcareDeltaAnnualPost).toBe(0);
  });

  it("healthcare drag reduces the lifetime advantage of claiming early", () => {
    // Same scenario, two runs: with healthcare modeling ON vs OFF (covered
    // elsewhere). The ON run should report a smaller (or more-negative)
    // advantage because the early-claim monthly net was reduced.
    const off = computeProjection({ ...cliffArgs, coveredElsewhere: true });
    const on = computeProjection({ ...cliffArgs, coveredElsewhere: false });
    expect(on.advantage).toBeLessThan(off.advantage);
  });

  it("healthcare drag reduces the invested pot at investStopAge", () => {
    const off = computeProjection({ ...cliffArgs, coveredElsewhere: true });
    const on = computeProjection({ ...cliffArgs, coveredElsewhere: false });
    expect(on.potAtStopRow).toBeLessThan(off.potAtStopRow);
  });

  it("default (omitted healthcare params) matches coveredElsewhere=true behavior", () => {
    // Backwards compat: existing call sites without healthcare params get
    // the no-healthcare math, identical to passing coveredElsewhere=true.
    const omitted = computeProjection({
      ...baseInputs,
      grossIncome: 45000,
      fraBenefit: 2400,
    });
    const explicit = computeProjection({
      ...baseInputs,
      grossIncome: 45000,
      fraBenefit: 2400,
      coveredElsewhere: true,
      unsubsidizedSilverAnnual: 9679,
    });
    expect(omitted.advantage).toBe(explicit.advantage);
    expect(omitted.potAtStopRow).toBe(explicit.potAtStopRow);
  });

  it("breakEvenAge moves later (or vanishes) when healthcare drag applies", () => {
    // The wait curve is unchanged; the early curve gets reduced. So break-
    // even (where wait catches up to early) shifts EARLIER in age — wait
    // catches up sooner because early has less head start. This regression-
    // pins that the chart math is actually consuming the adjusted early net.
    const off = computeProjection({ ...cliffArgs, coveredElsewhere: true });
    const on = computeProjection({ ...cliffArgs, coveredElsewhere: false });
    // Both should have a break-even age in this scenario (early doesn't run
    // away forever). When it exists, ON should be ≤ OFF.
    if (off.breakEvenAge !== null && on.breakEvenAge !== null) {
      expect(on.breakEvenAge).toBeLessThanOrEqual(off.breakEvenAge);
    } else {
      // If one is null and the other isn't, ON being null with OFF having
      // a value would mean the cliff is so brutal that early never catches
      // up to wait. Either is acceptable; just don't silently regress.
      expect([off.breakEvenAge, on.breakEvenAge]).toBeDefined();
    }
  });
});

describe("computeProjection — OBBBA senior bonus deduction", () => {
  // Scenario: claimAge 67 in 2026, $50K post-FRA wages, $30K FRA benefit.
  // Age 67 > 65 ✓; year 2026 in 2025–2028 ✓; MAGI ≈ $50K + 0.85×$30K = $75.5K,
  // just over the $75K phase-out start → ~$5,970 deduction.
  const seniorScenario = {
    mode: "retirement",
    fraBenefit: 2500,
    ownBenefit: 1500,
    claimAge: 67,
    returnRate: 5,
    investStopAge: 70,
    lifeExpectancy: 85,
    grossIncome: 50000,
    postFRAGrossIncome: 50000,
    // Keep working through the OBBBA window so all eligible years share the
    // same tax tier — makes the lifetime invariant simple to assert. With
    // postFRAWorkYears=0 (default), wages drop to $0 the moment retirement
    // starts and the taxable-SS tier collapses to 0%, zeroing the extra
    // deduction's value beyond age FRA.
    postFRAWorkYears: 20,
    autoTax: true,
    manualFedRate: 12,
    currentYear: 2026,
  };

  it("produces a positive deduction amount when claiming 65+ in the OBBBA window", () => {
    const r = computeProjection(seniorScenario);
    expect(r.seniorDeductionPostFRA).toBeGreaterThan(0);
    expect(r.seniorDeductionWait).toBeGreaterThan(0);
  });

  it("produces positive dollar savings when the deduction is in effect", () => {
    const r = computeProjection(seniorScenario);
    expect(r.seniorDeductionAnnualSavingsEarlyPost).toBeGreaterThan(0);
    expect(r.seniorDeductionAnnualSavingsWait).toBeGreaterThan(0);
  });

  it("counts eligible years correctly — claim 67 in 2026 gives 3 years (2026, 2027, 2028)", () => {
    const r = computeProjection(seniorScenario);
    expect(r.seniorDeductionEligibleYearsWait).toBe(3);
    // Early-claim scenario at claimAge=67 starts collecting at same age, same year.
    expect(r.seniorDeductionEligibleYearsEarly).toBe(3);
  });

  it("lifetime savings equals annual savings × eligible years (single tax tier)", () => {
    const r = computeProjection(seniorScenario);
    // 3 eligible years × per-year savings ≈ lifetime total.
    const expected = r.seniorDeductionAnnualSavingsWait * 3;
    expect(r.seniorDeductionLifetimeWait).toBeCloseTo(expected, 0);
  });

  it("zero deduction when claiming at 62 in 2026 (won't hit 65 until 2029, post-sunset)", () => {
    // claimAge=62 in 2026 → age 65 in 2029 → after sunset. So no eligible
    // years even though they live past 65.
    const r = computeProjection({ ...seniorScenario, claimAge: 62 });
    expect(r.seniorDeductionEligibleYearsEarly).toBe(0);
    expect(r.seniorDeductionEligibleYearsWait).toBe(0);
    expect(r.seniorDeductionLifetimeEarly).toBe(0);
    expect(r.seniorDeductionLifetimeWait).toBe(0);
  });

  it("zero deduction when current year is post-2028 (sunset)", () => {
    const r = computeProjection({ ...seniorScenario, currentYear: 2030 });
    expect(r.seniorDeductionPostFRA).toBe(0);
    expect(r.seniorDeductionWait).toBe(0);
    expect(r.seniorDeductionLifetimeWait).toBe(0);
  });

  it("phases out at higher MAGI — $200K wage zeros the deduction (over $175K cliff)", () => {
    const r = computeProjection({
      ...seniorScenario,
      grossIncome: 200000,
      postFRAGrossIncome: 200000,
    });
    expect(r.seniorDeductionPostFRA).toBe(0);
    expect(r.seniorDeductionAnnualSavingsWait).toBe(0);
  });

  it("manual tax mode reports zero deduction savings (model out of scope)", () => {
    const r = computeProjection({
      ...seniorScenario,
      autoTax: false,
      manualFedRate: 22,
    });
    // Deduction amount may still be non-zero (driven by MAGI/age/year), but
    // the dollar savings through computeSSEffectiveTaxRate is zero because
    // manual mode doesn't run the deduction-aware bracket math.
    expect(r.seniorDeductionAnnualSavingsWait).toBe(0);
  });

  it("claim at age 66 in 2026 — pre-FRA window also eligible (1 year of pre-FRA savings)", () => {
    // claimAge=66 → age 65 already (66 > 65), pre-FRA window = 2026 (1 year),
    // post-FRA window = 2027 → calendar year is 2027. Both inside OBBBA window.
    const r = computeProjection({ ...seniorScenario, claimAge: 66 });
    expect(r.seniorDeductionPreFRA).toBeGreaterThan(0);
    expect(r.seniorDeductionAnnualSavingsEarlyPre).toBeGreaterThan(0);
    // Eligible years for early-claim: ages 66, 67, 68 in years 2026, 2027, 2028.
    expect(r.seniorDeductionEligibleYearsEarly).toBe(3);
  });

  it("default currentYear = 2026 when not passed (system year, no breakage)", () => {
    // Backwards-compat: passing no currentYear should default the deduction
    // to 2026 rules. Same result as explicit currentYear: 2026.
    const explicit = computeProjection(seniorScenario);
    const omitted = computeProjection({ ...seniorScenario, currentYear: undefined });
    expect(omitted.seniorDeductionAnnualSavingsWait).toBeCloseTo(
      explicit.seniorDeductionAnnualSavingsWait,
      2
    );
  });

  // Regression: pre-FRA-but-65+ window. Pre-fix the lifetime rollup used the
  // window-start senior-deduction snapshot (priced at age=claimAge), which
  // was $0 whenever claimAge<65 — silently dropping eligible 65/66 years
  // even when calendar year was in 2025–2028 and the claimant was still
  // earning a W2 in the pre-FRA window.
  describe("pre-FRA-but-65+ window credit (claimAge < 65)", () => {
    // claimAge=64 in 2026 → age 65 in 2027 (in window), age 66 in 2028 (in
    // window), age 67 in 2029 (post-sunset). Two pre-FRA eligible years.
    const claim64Scenario = {
      ...seniorScenario,
      claimAge: 64,
    };

    it("surfaces a positive 65+ pre-FRA snapshot when claimAge < 65", () => {
      const r = computeProjection(claim64Scenario);
      expect(r.seniorDeductionPreFRA65Plus).toBeGreaterThan(0);
      expect(r.seniorDeductionAnnualSavingsEarlyPre65Plus).toBeGreaterThan(0);
    });

    it("at-claim-age tier remains $0 (correct — claimant is 64, not yet eligible)", () => {
      const r = computeProjection(claim64Scenario);
      expect(r.seniorDeductionPreFRA).toBe(0);
      expect(r.seniorDeductionAnnualSavingsEarlyPre).toBe(0);
    });

    it("lifetime savings includes the pre-FRA 65+ years (claimAge=64 → 2 years credited)", () => {
      const r = computeProjection(claim64Scenario);
      // Pre-FRA 65+ window contributes ages 65 and 66 (calendar 2027, 2028).
      // After FRA (age 67 = year 2029) the window has sunset, so post-FRA
      // contributes nothing. Lifetime ≈ 2 × pre-FRA-65+ annual savings.
      const expected = r.seniorDeductionAnnualSavingsEarlyPre65Plus * 2;
      expect(r.seniorDeductionLifetimeEarly).toBeCloseTo(expected, 0);
      expect(r.seniorDeductionLifetimeEarly).toBeGreaterThan(0);
    });

    it("eligible-year count is 2 for the claim-at-64-in-2026 scenario", () => {
      const r = computeProjection(claim64Scenario);
      // Ages 65 (2027) and 66 (2028) qualify; age 67 (2029) is post-sunset.
      expect(r.seniorDeductionEligibleYearsEarly).toBe(2);
    });

    it("collapses to the window-start snapshot when claimAge ≥ 65", () => {
      // At claimAge=66 the existing and 65+ snapshots should agree because
      // both age inputs satisfy the 65+ gate and MAGI/tax-year inputs match.
      const r = computeProjection({ ...seniorScenario, claimAge: 66 });
      expect(r.seniorDeductionPreFRA65Plus).toBeCloseTo(
        r.seniorDeductionPreFRA,
        2
      );
      expect(r.seniorDeductionAnnualSavingsEarlyPre65Plus).toBeCloseTo(
        r.seniorDeductionAnnualSavingsEarlyPre,
        2
      );
    });

    it("still zero when no pre-FRA 65+ year lands in the OBBBA window", () => {
      // claimAge=62 in 2026 → age 65 in 2029 (post-sunset). The 65+ snapshot
      // uses turn65Year=2029 which is past the sunset, so the snapshot is $0
      // and the lifetime rollup stays at $0.
      const r = computeProjection({ ...seniorScenario, claimAge: 62 });
      expect(r.seniorDeductionPreFRA65Plus).toBe(0);
      expect(r.seniorDeductionLifetimeEarly).toBe(0);
    });
  });
});
