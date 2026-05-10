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

  it("displayed combinedIncome reflects the post-FRA early-scenario basis", () => {
    const r = computeProjection({
      ...baseInputs,
      grossIncome: 50000,
      postFRAGrossIncome: 20000,
      autoTax: true,
    });
    // Headline = post-FRA early scenario: postFRAGrossIncome + 0.5 × earlyPostFRAMonthlyGross × 12
    const expected = 20000 + 0.5 * r.earlyPostFRAMonthlyGross * 12;
    expect(closeTo(r.combinedIncome, expected, 0.5)).toBe(true);
  });
});

describe("computeProjection — postFRAGrossIncome", () => {
  // The calculator splits wage income into pre-FRA and post-FRA periods.
  // Pre-FRA wages drive the earnings test (which only applies pre-FRA) and
  // the pre-FRA federal-tax combined-income calc. Post-FRA wages drive
  // only the post-FRA combined-income calc. Default 0 = retire at FRA.

  it("defaults postFRAGrossIncome to 0 when omitted (typical retiree case)", () => {
    const r = computeProjection(baseInputs); // no postFRAGrossIncome
    // With default 0, post-FRA combined income = 0 + 0.5 × early-post-FRA SS.
    const expected = 0 + 0.5 * r.earlyPostFRAMonthlyGross * 12;
    expect(closeTo(r.combinedIncome, expected, 0.5)).toBe(true);
  });

  it("higher postFRAGrossIncome raises combined income and the headline tax rate (auto)", () => {
    const lowPost = computeProjection({
      ...baseInputs,
      grossIncome: 0,
      postFRAGrossIncome: 0,
      autoTax: true,
    });
    const highPost = computeProjection({
      ...baseInputs,
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
    const noWorkFinalWait = noWork.chartData[noWork.chartData.length - 1].wait;
    const noIncomeFinalWait = noIncome.chartData[noIncome.chartData.length - 1].wait;
    expect(closeTo(noWorkFinalWait, noIncomeFinalWait, 5)).toBe(true);
  });

  it("postFRAWorkYears > 0 with high income reduces the wait line vs 0 work years", () => {
    // With 18 working years post-FRA at $80k, every wait check is taxed
    // hard. With 0 working years, no checks are taxed. Lifetime wait
    // total should be smaller in the working-many-years case.
    const manyWorkYears = computeProjection({
      ...baseInputs,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 18, // = lifeExpectancy 85 - FRA 67
    });
    const noWorkYears = computeProjection({
      ...baseInputs,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 0,
    });
    const manyFinal = manyWorkYears.chartData[manyWorkYears.chartData.length - 1].wait;
    const noneFinal = noWorkYears.chartData[noWorkYears.chartData.length - 1].wait;
    expect(noneFinal).toBeGreaterThan(manyFinal);
  });

  it("postFRAWorkYears caps at lifeExpectancy (no tax window past death)", () => {
    // postFRAWorkYears=20 with life=80 means workEndAge=87 > life=80.
    // Internally the boundary clamps to lifeExpectancy so the projection
    // stays self-consistent.
    const r = computeProjection({
      ...baseInputs,
      lifeExpectancy: 80,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 20, // would push past life if uncapped
    });
    // No NaN/undefined in chart data
    expect(r.chartData.every((d) => Number.isFinite(d.wait))).toBe(true);
    expect(r.chartData.every((d) => Number.isFinite(d.early))).toBe(true);
  });

  it("partial work years: tax burden falls between fully-working and fully-retired", () => {
    const allWorking = computeProjection({
      ...baseInputs,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 18,
    });
    const partial = computeProjection({
      ...baseInputs,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 5,
    });
    const allRetired = computeProjection({
      ...baseInputs,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 0,
    });
    const finalWait = (r) => r.chartData[r.chartData.length - 1].wait;
    expect(finalWait(allWorking)).toBeLessThan(finalWait(partial));
    expect(finalWait(partial)).toBeLessThan(finalWait(allRetired));
  });

  it("fractional postFRAWorkYears (months precision) shifts tax burden monotonically", () => {
    // The slider now steps by 1/12. A 6-month-difference of post-FRA work
    // should still move the wait line monotonically — pinning that a
    // sub-year change is observable end-to-end through computeProjection.
    const fiveYears = computeProjection({
      ...baseInputs,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 5,
    });
    const fiveAndAHalf = computeProjection({
      ...baseInputs,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 5.5,
    });
    const sixYears = computeProjection({
      ...baseInputs,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 6,
    });
    const finalWait = (r) => r.chartData[r.chartData.length - 1].wait;
    // More working years (with positive postFRAGrossIncome) → smaller final
    // wait total because more checks fall in the higher tax tier.
    expect(finalWait(fiveYears)).toBeGreaterThan(finalWait(fiveAndAHalf));
    expect(finalWait(fiveAndAHalf)).toBeGreaterThan(finalWait(sixYears));
  });

  it("fractional postFRAWorkYears differs from the rounded-down integer value", () => {
    // 1/12 step must propagate — otherwise a slider drag from 5 yr 0 mo
    // to 5 yr 6 mo would be silently flooring inside the math layer.
    const fiveExact = computeProjection({
      ...baseInputs,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 5,
    });
    const fiveAndHalf = computeProjection({
      ...baseInputs,
      postFRAGrossIncome: 80000,
      postFRAWorkYears: 5.5,
    });
    const w1 = fiveExact.chartData[fiveExact.chartData.length - 1].wait;
    const w2 = fiveAndHalf.chartData[fiveAndHalf.chartData.length - 1].wait;
    expect(w1).not.toBe(w2);
  });
});

describe("computeProjection — fractional lifeExpectancy", () => {
  // The Live Until slider now steps by 1/12 so the user can express their
  // expected lifespan to month precision. The math layer must accept the
  // fractional value and the chart must terminate AT that age (not at the
  // previous quarter-year sample).
  it("accepts a fractional life and returns finite numbers throughout", () => {
    const r = computeProjection({ ...baseInputs, lifeExpectancy: 85.5 });
    expect(r.chartData.every((d) => Number.isFinite(d.wait))).toBe(true);
    expect(r.chartData.every((d) => Number.isFinite(d.early))).toBe(true);
    expect(r.chartData.every((d) => Number.isFinite(d.pot))).toBe(true);
  });

  it("ensures the final chart sample lands at exactly lifeExpectancy", () => {
    // Without the fractional-end-sample guard, the 0.25-stride loop would
    // stop at age 85.0 for life=85.0833, leaving the headline "Total at X"
    // numbers off by a month.
    const r = computeProjection({ ...baseInputs, lifeExpectancy: 85 + 1 / 12 });
    const last = r.chartData[r.chartData.length - 1];
    expect(last.age).toBeCloseTo(85 + 1 / 12, 3);
  });

  it("monotonic in life: a longer life accumulates strictly more wait benefits", () => {
    const shorter = computeProjection({ ...baseInputs, lifeExpectancy: 85 });
    const longer = computeProjection({ ...baseInputs, lifeExpectancy: 85.5 });
    const finalWait = (r) => r.chartData[r.chartData.length - 1].wait;
    expect(finalWait(longer)).toBeGreaterThan(finalWait(shorter));
  });
});

describe("fmtDuration formatter", () => {
  // Imported lazily so the rest of the integration tests don't have to.
  it("0 → '0 mo'", async () => {
    const { fmtDuration } = await import("./benefitMath.js");
    expect(fmtDuration(0)).toBe("0 mo");
  });
  it("a single month → '1 mo'", async () => {
    const { fmtDuration } = await import("./benefitMath.js");
    expect(fmtDuration(1 / 12)).toBe("1 mo");
  });
  it("six months → '6 mo'", async () => {
    const { fmtDuration } = await import("./benefitMath.js");
    expect(fmtDuration(0.5)).toBe("6 mo");
  });
  it("exact one year → '1 yr' (singular)", async () => {
    const { fmtDuration } = await import("./benefitMath.js");
    expect(fmtDuration(1)).toBe("1 yr");
  });
  it("exact two years → '2 yrs' (plural)", async () => {
    const { fmtDuration } = await import("./benefitMath.js");
    expect(fmtDuration(2)).toBe("2 yrs");
  });
  it("years + months → 'N yr M mo'", async () => {
    const { fmtDuration } = await import("./benefitMath.js");
    expect(fmtDuration(1.5)).toBe("1 yr 6 mo");
    expect(fmtDuration(5 + 7 / 12)).toBe("5 yr 7 mo");
  });
  it("11.999... month tick rolls forward to a clean year", async () => {
    // Float creep on a 1/12-stepped slider can leave the value at
    // 0.99999999 instead of 1.0 — must still print as "1 yr".
    const { fmtDuration } = await import("./benefitMath.js");
    expect(fmtDuration(11.999999 / 12)).toBe("1 yr");
  });
});
