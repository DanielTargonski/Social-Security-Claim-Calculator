import { describe, it, expect } from "vitest";
import {
  compareWages,
  mergeWageSeries,
  earlyHealthcareForWage,
  marginalWorkReturn,
  compareStrategiesAcrossWages,
  POOR_KEEP_RATE,
} from "./wageCompare.js";
import { compareStrategies } from "./strategyCompare.js";

// A surviving-spouse case shaped like the one this feature was built for:
// born June 1962, claims the survivor benefit early at 64, healthcare ON so the
// ACA cliff is in play. `grossIncome` on the inputs is intentionally a value
// each scenario overrides — compareWages ignores it.
const baseInputs = {
  mode: "survivor",
  fraBenefit: 2700,
  ownBenefit: 1350,
  birthMonth: 6,
  birthYear: 1962,
  claimAge: 64,
  returnRate: 7,
  investStopAge: 67,
  lifeExpectancy: 85,
  grossIncome: 40000,
  postFRAGrossIncome: 0,
  postFRAWorkYears: 0,
  autoTax: true,
  manualFedRate: 12,
  investedPct: 100,
  investedPctWait: 100,
  coveredElsewhere: false,
  unsubsidizedSilverAnnual: 9679,
  locality: "none",
};

// Build a wageScenarios list from bare dollar amounts.
const wages = (...vals) => vals.map((wage, i) => ({ key: `s${i}`, wage }));

describe("compareWages — shape", () => {
  it("returns one scenario per wage, preserving keys and order", () => {
    const { scenarios } = compareWages(baseInputs, wages(40000, 24480, 0));
    expect(scenarios.map((s) => s.key)).toEqual(["s0", "s1", "s2"]);
    expect(scenarios.map((s) => s.wage)).toEqual([40000, 24480, 0]);
  });

  it("indexes scenarios by key", () => {
    const { byKey } = compareWages(baseInputs, wages(40000, 0));
    expect(byKey.s0.wage).toBe(40000);
    expect(byKey.s1.wage).toBe(0);
  });

  it("ignores grossIncome on the inputs object (each scenario sets its own)", () => {
    const a = compareWages({ ...baseInputs, grossIncome: 99999 }, wages(40000));
    const b = compareWages({ ...baseInputs, grossIncome: 1 }, wages(40000));
    expect(a.byKey.s0.lifetimeTotal).toBeCloseTo(b.byKey.s0.lifetimeTotal, 6);
  });
});

describe("compareWages — decomposition identity", () => {
  it("lifetimeTotal === ssLifetime + wageLifetime − healthcareLifetime", () => {
    const { scenarios } = compareWages(baseInputs, wages(40000, 24480, 0));
    for (const s of scenarios) {
      expect(s.lifetimeTotal).toBeCloseTo(
        s.ssLifetime + s.wageLifetime - s.healthcareLifetime,
        6
      );
    }
  });
});

describe("compareWages — earnings test", () => {
  it("withholding rises with wage above the limit and is zero at/under it", () => {
    const { byKey } = compareWages(baseInputs, wages(0, 24480, 40000, 60000));
    expect(byKey.s0.earningsTestWithholding).toBe(0); // not working
    expect(byKey.s1.earningsTestWithholding).toBe(0); // exactly at the limit
    expect(byKey.s2.earningsTestWithholding).toBeGreaterThan(0); // $40k
    expect(byKey.s3.earningsTestWithholding).toBeGreaterThan(
      byKey.s2.earningsTestWithholding
    ); // $60k withholds more
  });
});

describe("compareWages — wage take-home", () => {
  it("lifetime wage take-home is monotonic in the wage", () => {
    const { byKey } = compareWages(baseInputs, wages(0, 20000, 40000, 60000));
    expect(byKey.s0.wageLifetime).toBe(0);
    expect(byKey.s1.wageLifetime).toBeGreaterThan(byKey.s0.wageLifetime);
    expect(byKey.s2.wageLifetime).toBeGreaterThan(byKey.s1.wageLifetime);
    expect(byKey.s3.wageLifetime).toBeGreaterThan(byKey.s2.wageLifetime);
  });
});

describe("compareWages — healthcare / ACA cliff", () => {
  it("zeroes healthcare for every scenario when covered elsewhere", () => {
    const { scenarios } = compareWages(
      { ...baseInputs, coveredElsewhere: true },
      wages(40000, 60000, 0)
    );
    for (const s of scenarios) {
      expect(s.healthcareLifetime).toBe(0);
      expect(s.healthcareAnnualNow).toBe(0);
    }
  });

  it("a wage over the 400% FPL cliff pays the full unsubsidized premium", () => {
    // $60k pushes MAGI past the 2026 single cliff ($62,600); a sub-cliff wage
    // pays the capped subsidized amount, which is strictly lower.
    const { byKey } = compareWages(baseInputs, wages(20000, 60000));
    expect(byKey.s1.healthcareAnnualNow).toBe(9679); // unsubsidized silver
    expect(byKey.s0.healthcareAnnualNow).toBeLessThan(9679);
    expect(byKey.s1.healthcareLifetime).toBeGreaterThan(
      byKey.s0.healthcareLifetime
    );
  });

  it("surfaces the next-cliff distance below the cliff", () => {
    const { byKey } = compareWages(baseInputs, wages(20000));
    expect(byKey.s0.nextCliff).not.toBeNull();
    expect(byKey.s0.nextCliff.distance).toBeGreaterThan(0);
  });
});

describe("compareWages — merged chart series", () => {
  it("zips every scenario onto one age axis with its lifetime total at the end", () => {
    const result = compareWages(baseInputs, wages(40000, 24480, 0));
    const { merged, byKey } = result;
    // Same length as any scenario's own series, ages carried through.
    expect(merged.length).toBe(byKey.s0.series.length);
    expect(merged[0]).toHaveProperty("age");
    // Each scenario key present on every row.
    for (const key of ["s0", "s1", "s2"]) {
      expect(merged[merged.length - 1]).toHaveProperty(key);
    }
    // The final merged value for each scenario is its rounded lifetime total.
    for (const key of ["s0", "s1", "s2"]) {
      expect(merged[merged.length - 1][key]).toBe(
        Math.round(byKey[key].lifetimeTotal)
      );
    }
  });

  it("mergeWageSeries returns [] for no scenarios", () => {
    expect(mergeWageSeries([])).toEqual([]);
  });
});

describe("compareWages — verdict", () => {
  it("names the scenario with the highest lifetime total as the winner", () => {
    const { verdict, byKey } = compareWages(baseInputs, wages(40000, 24480, 0));
    const best = ["s0", "s1", "s2"].reduce((a, b) =>
      byKey[a].lifetimeTotal >= byKey[b].lifetimeTotal ? a : b
    );
    expect(verdict.winnerKey).toBe(best);
  });

  it("driver deltas sum to the winner's margin over the runner-up", () => {
    const { verdict } = compareWages(baseInputs, wages(40000, 24480, 0));
    const { dWage, dHealthSaved, dSS } = verdict.drivers;
    expect(dWage + dHealthSaved + dSS).toBeCloseTo(verdict.winnerMargin, 4);
  });

  it("working more usually wins on dollars even though it costs more in tax/healthcare", () => {
    // The whole point of the panel: dropping wages is not free. At a healthy
    // real return and a long life, keeping the $40k wage beats stopping work.
    const { byKey } = compareWages(baseInputs, wages(40000, 0));
    expect(byKey.s0.lifetimeTotal).toBeGreaterThan(byKey.s1.lifetimeTotal);
  });
});

describe("compareWages — marginal work warning", () => {
  // The canonical case the feature was built for: switch mode, claim 64, 0%
  // return, invest 0%, live 88. $40k wins but barely beats $24,480 — a lot of
  // extra work for a poor keep rate.
  const poorInputs = {
    ...baseInputs,
    mode: "switch",
    returnRate: 0,
    investedPct: 0,
    lifeExpectancy: 88,
    birthYear: 1964,
  };

  it("flags a poor keep rate on the step up into the winning wage", () => {
    const { verdict } = compareWages(poorInputs, wages(40000, 24480, 0));
    const mw = verdict.marginalWork;
    expect(mw).not.toBeNull();
    expect(mw.tier).toBe("poor");
    expect(mw.isNegative).toBe(false);
    // $40k is the winning (top) wage; the step is up from $24,480.
    expect(mw.higherWage).toBe(40000);
    expect(mw.lowerWage).toBe(24480);
    // Keep rate is poor (well under the threshold) but positive.
    expect(mw.keepRate).toBeGreaterThan(0);
    expect(mw.keepRate).toBeLessThan(POOR_KEEP_RATE);
    // Earnings-test withholding (no recoup in switch mode) is the dominant drag.
    expect(mw.dominantDrag).toBe("ss");
  });

  it("driver split sums to the extra resources (identity)", () => {
    const { verdict } = compareWages(poorInputs, wages(40000, 24480, 0));
    const mw = verdict.marginalWork;
    expect(mw.dWage + mw.dSS + mw.dHealth).toBeCloseTo(mw.extraResources, 4);
  });

  it("flags a NEGATIVE step when working more than the winner loses money", () => {
    // High return + full investing: the un-withheld $24,480 checks compound past
    // the $40k outcome, so $24,480 wins and working up to $40k loses lifetime
    // resources. The step up from the winner is the warning.
    const { verdict } = compareWages(baseInputs, wages(0, 24480, 40000));
    const mw = verdict.marginalWork;
    expect(verdict.winnerKey).not.toBe("s2"); // $40k is not the winner here
    expect(mw).not.toBeNull();
    expect(mw.tier).toBe("negative");
    expect(mw.isNegative).toBe(true);
    expect(mw.extraResources).toBeLessThan(0);
    expect(mw.higherWage).toBe(40000); // the losing higher wage
  });

  it("returns null when there is only one wage scenario", () => {
    const { verdict } = compareWages(poorInputs, wages(40000));
    expect(verdict.marginalWork).toBeNull();
  });

  it("returns null for a trivially small wage step", () => {
    const { verdict } = compareWages(poorInputs, wages(40000, 39800));
    expect(verdict.marginalWork).toBeNull();
  });

  it("returns null past FRA (no pre-67 wage window)", () => {
    const { verdict } = compareWages(
      { ...poorInputs, claimAge: 67 },
      wages(40000, 24480, 0)
    );
    expect(verdict.marginalWork).toBeNull();
  });

  it("carries the mode through for switch-aware copy", () => {
    const { verdict } = compareWages(poorInputs, wages(40000, 24480, 0));
    expect(verdict.marginalWork.mode).toBe("switch");
  });
});

describe("marginalWorkReturn — unit", () => {
  it("returns null when the verdict winner is not found", () => {
    const scenarios = [
      { key: "a", wage: 0, lifetimeTotal: 100, ssLifetime: 100, wageLifetime: 0, healthcareLifetime: 0 },
    ];
    expect(
      marginalWorkReturn(scenarios, { winnerKey: "zzz" }, "survivor", 64)
    ).toBeNull();
  });
});

describe("compareStrategiesAcrossWages", () => {
  it("reports per-wage strategy winners across the wage set", () => {
    const r = compareStrategiesAcrossWages(baseInputs, wages(0, 24480, 40000));
    expect(r.perWage).toHaveLength(3);
    for (const p of r.perWage) {
      expect(["switch", "survivor"]).toContain(p.winnerKey);
      expect(typeof p.survivorTotal).toBe("number");
      expect(typeof p.switchTotal).toBe("number");
    }
    expect(["switch", "survivor", null]).toContain(r.allWinner);
    expect(r.maxMargin).toBeGreaterThanOrEqual(r.minMargin);
  });

  it("finds own->survivor winning at every wage in the canonical case", () => {
    // switch mode inputs, but the helper runs BOTH strategies regardless of the
    // inputs.mode. At 0% return / live 88, switch beats survivor at every wage.
    const r = compareStrategiesAcrossWages(
      { ...baseInputs, returnRate: 0, investedPct: 0, lifeExpectancy: 88 },
      wages(0, 24480, 40000)
    );
    expect(r.allWinner).toBe("switch");
    expect(r.minMargin).toBeGreaterThan(0);
  });

  // Regression for the review's headline-vs-lever contradiction: the BY WAGE
  // winner AT THE CURRENT WAGE must match compareStrategies' verdict, because
  // both now use the same projectStrategy/finalEarly basis. Includes survivor
  // claim ages below switch's 62 floor (where the old wage-take-home asymmetry
  // produced opposite winners).
  it("agrees with the headline verdict at the current wage, even below switch's 62 floor", () => {
    for (const claimAge of [61, 62, 64]) {
      for (const returnRate of [0, 4, 7]) {
        const inputs = { ...baseInputs, mode: "survivor", claimAge, returnRate };
        const ws = wages(inputs.grossIncome, 24480, 0); // s0 = current wage
        const robustness = compareStrategiesAcrossWages(inputs, ws);
        const verdict = compareStrategies(inputs).verdict;
        const atCurrent = robustness.perWage.find(
          (p) => p.wage === inputs.grossIncome
        );
        expect(atCurrent.winnerKey).toBe(verdict.primaryWinner);
      }
    }
  });
});

describe("earlyHealthcareForWage — unit", () => {
  it("returns all zeros when covered elsewhere", () => {
    const hc = earlyHealthcareForWage({
      grossIncome: 40000,
      postFRAGrossIncome: 0,
      claimAge: 64,
      lifeExpectancy: 85,
      annualEarlyGross: 28000,
      earningsTestWithholding: 7000,
      recoupedAnnualGross: 30000,
      coveredElsewhere: true,
      unsubsidizedSilverAnnual: 9679,
    });
    expect(hc).toMatchObject({
      acaAnnual: 0,
      medicare65Annual: 0,
      medicarePostAnnual: 0,
      lifetime: 0,
    });
  });

  it("splits the lifespan into ACA, Medicare-65, and Medicare-67 bands", () => {
    const hc = earlyHealthcareForWage({
      grossIncome: 40000,
      postFRAGrossIncome: 0,
      claimAge: 64,
      lifeExpectancy: 85,
      annualEarlyGross: 28000,
      earningsTestWithholding: 7000,
      recoupedAnnualGross: 30000,
      coveredElsewhere: false,
      unsubsidizedSilverAnnual: 9679,
    });
    // claim 64 → 65 is one ACA year; 65 → 67 is two Medicare-65 years;
    // 67 → 85 is eighteen Medicare-67 years.
    expect(hc.acaYears).toBeCloseTo(1, 6);
    expect(hc.medicare65Years).toBeCloseTo(2, 6);
    expect(hc.medicarePostYears).toBeCloseTo(18, 6);
    expect(hc.lifetime).toBeCloseTo(
      hc.acaAnnual * 1 + hc.medicare65Annual * 2 + hc.medicarePostAnnual * 18,
      4
    );
  });
});
