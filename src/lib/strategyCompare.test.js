import { describe, it, expect } from "vitest";
import {
  compareStrategies,
  findBreakEvenReturn,
  findSeriesCrossover,
  mergeEarlySeries,
  classifyDecisiveness,
  DECISIVE_RELATIVE_MARGIN,
  STRATEGY_DEFS,
} from "./strategyCompare.js";
import { computeProjection } from "./benefitMath.js";
import { survivorFactor, retirementFactor } from "./ssRules.js";

// Realistic surviving-spouse baseline: a survivor benefit ($2,500) clearly
// above the own benefit ($1,500), so the switch strategy has a real upside to
// trade off against claiming survivor early. Claim age 62 sits inside every
// mode's range so no clamping happens by default.
const baseInputs = {
  mode: "survivor",
  fraBenefit: 2500,
  ownBenefit: 1500,
  claimAge: 62,
  returnRate: 7,
  investStopAge: 67,
  lifeExpectancy: 85,
  grossIncome: 0,
  postFRAGrossIncome: 0,
  postFRAWorkYears: 0,
  autoTax: true,
  manualFedRate: 12,
  investedPct: 100,
  investedPctWait: 100,
  coveredElsewhere: true,
  unsubsidizedSilverAnnual: 9679,
  locality: "none",
};

describe("classifyDecisiveness", () => {
  it("flags a wide, never-trailing lead as decisive", () => {
    const d = classifyDecisiveness({
      crossover: null,
      winnerTotal: 800000,
      loserTotal: 600000,
    });
    expect(d.tier).toBe("decisive");
    expect(d.alwaysAhead).toBe(true);
    expect(d.relativeMargin).toBeCloseTo(0.3333, 3);
  });

  it("flags a crossover as a close call regardless of final margin", () => {
    const d = classifyDecisiveness({
      crossover: 81,
      winnerTotal: 695000,
      loserTotal: 676000,
    });
    expect(d.tier).toBe("close");
    expect(d.alwaysAhead).toBe(false);
  });

  it("flags a never-trailing but slim lead as an edge", () => {
    const d = classifyDecisiveness({
      crossover: null,
      winnerTotal: 700000,
      loserTotal: 685000,
    });
    expect(d.tier).toBe("edge");
    expect(d.relativeMargin).toBeLessThan(DECISIVE_RELATIVE_MARGIN);
  });

  it("treats a positive winner over a non-positive loser as decisive", () => {
    const d = classifyDecisiveness({
      crossover: null,
      winnerTotal: 100,
      loserTotal: 0,
    });
    expect(d.relativeMargin).toBe(Infinity);
    expect(d.tier).toBe("decisive");
  });
});

describe("compareStrategies — decisiveness", () => {
  it("attaches a decisiveness read with a valid tier and the winner key", () => {
    const { verdict } = compareStrategies(baseInputs);
    expect(["decisive", "close", "edge"]).toContain(verdict.decisiveness.tier);
    expect(verdict.decisiveness.winnerKey).toBe(verdict.primaryWinner);
  });

  it("reads as decisive for a short life where survivor-early dominates", () => {
    // Short life → claiming the larger survivor benefit early wins outright and
    // the switch never catches up (no crossover), by a wide margin.
    const { verdict } = compareStrategies({ ...baseInputs, lifeExpectancy: 72 });
    expect(verdict.primaryWinner).toBe("survivor");
    expect(verdict.decisiveness.tier).toBe("decisive");
  });
});

describe("compareStrategies — shape", () => {
  it("returns the three strategies in a stable order", () => {
    const { strategies } = compareStrategies(baseInputs);
    expect(strategies.map((s) => s.key)).toEqual(["survivor", "switch", "own"]);
    expect(strategies.map((s) => s.mode)).toEqual([
      "survivor",
      "switch",
      "retirement",
    ]);
  });

  it("indexes strategies by key", () => {
    const { byKey } = compareStrategies(baseInputs);
    expect(byKey.survivor.label).toBe("Survivor early");
    expect(byKey.switch.label).toBe("Own → Survivor");
    expect(byKey.own.label).toBe("Own only");
  });

  it("STRATEGY_DEFS covers every app mode exactly once", () => {
    const modes = STRATEGY_DEFS.map((d) => d.mode).sort();
    expect(modes).toEqual(["retirement", "survivor", "switch"]);
  });
});

describe("compareStrategies — benefit sourcing", () => {
  it("survivor and switch use the survivor (fraBenefit); own uses ownBenefit", () => {
    const { byKey } = compareStrategies(baseInputs);
    expect(byKey.survivor.fraBenefit).toBe(2500);
    expect(byKey.switch.fraBenefit).toBe(2500);
    expect(byKey.own.fraBenefit).toBe(1500);
  });

  it("lifetimeTotal equals the mode's computeProjection finalEarly", () => {
    const { byKey } = compareStrategies(baseInputs);
    // Switch, evaluated identically.
    const swProj = computeProjection({
      ...baseInputs,
      mode: "switch",
      claimAge: 62,
      fraBenefit: 2500,
      investStopAge: 67,
    });
    expect(byKey.switch.lifetimeTotal).toBe(swProj.finalEarly);
    // Own, with fraBenefit swapped to ownBenefit.
    const ownProj = computeProjection({
      ...baseInputs,
      mode: "retirement",
      claimAge: 62,
      fraBenefit: 1500,
      investStopAge: 67,
    });
    expect(byKey.own.lifetimeTotal).toBe(ownProj.finalEarly);
  });
});

describe("compareStrategies — claim-age clamping", () => {
  it("clamps each strategy to its mode range and records the original", () => {
    // Age 60 is legal for survivor but below the 62 floor for switch/own.
    const { byKey } = compareStrategies({ ...baseInputs, claimAge: 60 });
    expect(byKey.survivor.claimAge).toBe(60);
    expect(byKey.survivor.clampedFromClaimAge).toBeNull();
    expect(byKey.switch.claimAge).toBe(62);
    expect(byKey.switch.clampedFromClaimAge).toBe(60);
    expect(byKey.own.claimAge).toBe(62);
    expect(byKey.own.clampedFromClaimAge).toBe(60);
  });

  it("clamps switch down to 66.5 when claim age is at survivor's 67 max", () => {
    const { byKey } = compareStrategies({ ...baseInputs, claimAge: 67 });
    expect(byKey.survivor.claimAge).toBe(67);
    expect(byKey.switch.claimAge).toBe(66.5);
    expect(byKey.switch.clampedFromClaimAge).toBe(67);
  });
});

describe("compareStrategies — verdict", () => {
  it("switch overtakes survivor-early for a long life when returns are flat", () => {
    // At 0% return the comparison is a pure benefit-sum: the bigger post-67
    // survivor benefit the switch buys eventually outweighs survivor-early's
    // head start. (With a high return the early, larger survivor check that
    // gets invested can win instead — see the compounding test below.)
    const { verdict } = compareStrategies({
      ...baseInputs,
      returnRate: 0,
      lifeExpectancy: 95,
    });
    expect(verdict.primaryWinner).toBe("switch");
    expect(verdict.switchEndsAhead).toBe(true);
    expect(verdict.primaryMargin).toBeGreaterThan(0);
    // There must be a finite age where the switch line overtakes.
    expect(verdict.crossover).toBeGreaterThan(67);
    expect(verdict.crossover).toBeLessThan(95);
  });

  it("high returns favor claiming the larger survivor check early and investing it", () => {
    // The calculator's core thesis: at 7% with investing stopped at 67, the
    // bigger early survivor check builds a pot that compounds across the whole
    // retirement, beating the switch even out to age 95.
    const { verdict } = compareStrategies({
      ...baseInputs,
      returnRate: 7,
      lifeExpectancy: 95,
    });
    expect(verdict.primaryWinner).toBe("survivor");
    expect(verdict.switchEndsAhead).toBe(false);
  });

  it("survivor-early wins for a short life", () => {
    // Die soon after FRA: the early, larger survivor checks outweigh the
    // switch's deferred upside.
    const { verdict } = compareStrategies({ ...baseInputs, lifeExpectancy: 72 });
    expect(verdict.primaryWinner).toBe("survivor");
    expect(verdict.switchEndsAhead).toBe(false);
    expect(verdict.primaryMargin).toBeGreaterThan(0);
  });

  it("primaryMargin is the absolute lifetime-total gap between switch and survivor", () => {
    const { byKey, verdict } = compareStrategies(baseInputs);
    const gap = Math.abs(byKey.switch.lifetimeTotal - byKey.survivor.lifetimeTotal);
    expect(verdict.primaryMargin).toBeCloseTo(gap, 6);
  });

  it("overallWinner is the highest lifetimeTotal of the three", () => {
    const { strategies, verdict } = compareStrategies({
      ...baseInputs,
      lifeExpectancy: 95,
    });
    const best = strategies.reduce((a, b) =>
      b.lifetimeTotal > a.lifetimeTotal ? b : a
    );
    expect(verdict.overallWinner).toBe(best.key);
    expect(verdict.overallMargin).toBeGreaterThanOrEqual(0);
  });
});

describe("compareStrategies — determinism", () => {
  it("is pure: same inputs produce identical verdicts", () => {
    const a = compareStrategies(baseInputs);
    const b = compareStrategies(baseInputs);
    expect(a.verdict).toEqual(b.verdict);
    expect(a.strategies.map((s) => s.lifetimeTotal)).toEqual(
      b.strategies.map((s) => s.lifetimeTotal)
    );
  });
});

describe("compareStrategies — invest % applies to each scenario's OWN check", () => {
  // The early check each scenario receives now, net of tax. At the baseline
  // (no wage income) the SS-taxation tier is 0%, so net == gross check.
  const survivorCheck = 2500 * survivorFactor(62); // ~1991/mo
  const ownCheck = 1500 * retirementFactor(62); // 1050/mo (factor 0.70)

  it("each scenario's 'now' check is its own benefit, not the other's", () => {
    const { byKey } = compareStrategies(baseInputs);
    expect(byKey.survivor.earlyMonthlyNet).toBeCloseTo(survivorCheck, 0);
    expect(byKey.own.earlyMonthlyNet).toBeCloseTo(ownCheck, 0);
    // Switch invests the OWN check pre-FRA, then jumps to the full survivor
    // benefit at 67.
    expect(byKey.switch.earlyMonthlyNet).toBeCloseTo(ownCheck, 0);
    expect(byKey.switch.postFRAMonthlyNet).toBeCloseTo(2500, 0);
  });

  it("the invested pot is built from each scenario's own check (pot ratio == check ratio)", () => {
    // investStop=67, claim=62, 100% invested, 7% — both scenarios contribute
    // for the same 60 months at the same rate, untaxed. The future value of a
    // monthly series is linear in the contribution, so the ratio of the two
    // invested pots must equal the ratio of the two checks. This pins that the
    // survivor pot grows on the SURVIVOR check and the own pot on the OWN check.
    const { byKey } = compareStrategies({
      ...baseInputs,
      returnRate: 7,
      investedPct: 100,
      investStopAge: 67,
    });
    const potAt = (s, age) => s.chartData.find((d) => d.age >= age)?.pot ?? 0;
    const survivorPot = potAt(byKey.survivor, 67);
    const ownPot = potAt(byKey.own, 67);
    expect(survivorPot).toBeGreaterThan(0);
    expect(ownPot).toBeGreaterThan(0);
    expect(survivorPot / ownPot).toBeCloseTo(survivorCheck / ownCheck, 2);
  });

  it("raising invest % grows every scenario's total when returns are positive", () => {
    const lo = compareStrategies({ ...baseInputs, returnRate: 7, investedPct: 0 });
    const hi = compareStrategies({ ...baseInputs, returnRate: 7, investedPct: 100 });
    for (const key of ["survivor", "switch", "own"]) {
      expect(hi.byKey[key].lifetimeTotal).toBeGreaterThan(
        lo.byKey[key].lifetimeTotal
      );
    }
  });

  it("invest % is a no-op on totals at 0% return (investing == holding cash)", () => {
    const none = compareStrategies({ ...baseInputs, returnRate: 0, investedPct: 0 });
    const full = compareStrategies({ ...baseInputs, returnRate: 0, investedPct: 100 });
    for (const key of ["survivor", "switch", "own"]) {
      expect(full.byKey[key].lifetimeTotal).toBeCloseTo(
        none.byKey[key].lifetimeTotal,
        0
      );
    }
  });
});

describe("compareStrategies — dollar-mode early invest", () => {
  it("invests the same entered dollar in every scenario whose check covers it", () => {
    // Both checks (survivor ~$1,991, own $1,050) exceed $1,000 → each invests
    // exactly $1,000, even though that's a different % of each check.
    const { byKey } = compareStrategies({
      ...baseInputs,
      investedEarlyDollar: 1000,
    });
    expect(byKey.survivor.investedEarlyDollarApplied).toBeCloseTo(1000, 0);
    expect(byKey.own.investedEarlyDollarApplied).toBeCloseTo(1000, 0);
    expect(byKey.switch.investedEarlyDollarApplied).toBeCloseTo(1000, 0);
  });

  it("caps at the whole check when the entered dollar exceeds it", () => {
    // $1,500 exceeds own's $1,050 check → own invests its whole check; survivor
    // (check ~$1,991) can still cover the full $1,500.
    const { byKey } = compareStrategies({
      ...baseInputs,
      investedEarlyDollar: 1500,
    });
    expect(byKey.own.investedEarlyDollarApplied).toBeCloseTo(1050, 0);
    expect(byKey.survivor.investedEarlyDollarApplied).toBeCloseTo(1500, 0);
  });

  it("yields equal invested pots when the same dollar is invested in each (the dollar is the invariant)", () => {
    // survivor & own both claim at 62 and invest $1,000/mo for the same 60
    // months at the same rate → identical pots at 67. A fixed-PERCENTAGE entry
    // could never make these equal (different checks); a fixed-DOLLAR one does.
    const { byKey } = compareStrategies({
      ...baseInputs,
      returnRate: 7,
      investStopAge: 67,
      investedEarlyDollar: 1000,
    });
    const potAt = (s, age) => s.chartData.find((d) => d.age >= age)?.pot ?? 0;
    expect(potAt(byKey.survivor, 67)).toBeCloseTo(potAt(byKey.own, 67), 0);
  });

  it("leaves investedEarlyDollarApplied null in percentage mode", () => {
    const { byKey } = compareStrategies(baseInputs);
    for (const key of ["survivor", "switch", "own"]) {
      expect(byKey[key].investedEarlyDollarApplied).toBeNull();
    }
  });
});

describe("compareStrategies — per-strategy invest overrides", () => {
  const survivorCheck = 2500 * survivorFactor(62); // ~1991/mo
  const ownCheck = 1500 * retirementFactor(62); // ~1050/mo

  it("invests a DIFFERENT dollar in each strategy when overridden", () => {
    // The whole point: $500/mo on survivor-early, $250/mo on own->survivor.
    const { byKey } = compareStrategies({
      ...baseInputs,
      investedEarlyDollarByStrategy: { survivor: 500, switch: 250 },
    });
    expect(byKey.survivor.investedMonthly).toBeCloseTo(500, 0);
    expect(byKey.switch.investedMonthly).toBeCloseTo(250, 0);
    expect(byKey.survivor.investedOverridden).toBe(true);
    expect(byKey.switch.investedOverridden).toBe(true);
  });

  it("a non-overridden strategy still follows the shared setting", () => {
    // survivor & switch overridden; own falls back to the 100% percentage —
    // i.e. its whole check.
    const { byKey } = compareStrategies({
      ...baseInputs,
      investedPct: 100,
      investedEarlyDollarByStrategy: { survivor: 500, switch: 250 },
    });
    expect(byKey.own.investedOverridden).toBe(false);
    expect(byKey.own.investedMonthly).toBeCloseTo(ownCheck, 0);
  });

  it("an override caps at that strategy's own check", () => {
    const { byKey } = compareStrategies({
      ...baseInputs,
      investedEarlyDollarByStrategy: { own: 5000 },
    });
    expect(byKey.own.investedMonthly).toBeCloseTo(ownCheck, 0);
    expect(byKey.own.investedAtCheckCap).toBe(true);
  });

  it("an override takes precedence over the global dollar mode", () => {
    // Global $1,000 everywhere, but survivor overridden to $300.
    const { byKey } = compareStrategies({
      ...baseInputs,
      investedEarlyDollar: 1000,
      investedEarlyDollarByStrategy: { survivor: 300 },
    });
    expect(byKey.survivor.investedMonthly).toBeCloseTo(300, 0);
    // The others keep the global $1,000.
    expect(byKey.switch.investedMonthly).toBeCloseTo(1000, 0);
    expect(byKey.own.investedMonthly).toBeCloseTo(1000, 0);
  });

  it("reports investedMonthly in plain percentage mode too (== pct of check)", () => {
    const { byKey } = compareStrategies({ ...baseInputs, investedPct: 50 });
    expect(byKey.survivor.investedMonthly).toBeCloseTo(survivorCheck * 0.5, 0);
    expect(byKey.own.investedMonthly).toBeCloseTo(ownCheck * 0.5, 0);
    // No dollar figure drove it → not flagged as overridden, dollar-applied null.
    expect(byKey.survivor.investedOverridden).toBe(false);
    expect(byKey.survivor.investedEarlyDollarApplied).toBeNull();
  });

  it("a bigger override grows that strategy's pot, leaving others untouched", () => {
    const base = compareStrategies({
      ...baseInputs,
      returnRate: 7,
      investStopAge: 67,
      investedEarlyDollarByStrategy: { survivor: 200, switch: 200 },
    });
    const more = compareStrategies({
      ...baseInputs,
      returnRate: 7,
      investStopAge: 67,
      investedEarlyDollarByStrategy: { survivor: 800, switch: 200 },
    });
    const potAt = (s, age) => s.chartData.find((d) => d.age >= age)?.pot ?? 0;
    expect(potAt(more.byKey.survivor, 67)).toBeGreaterThan(
      potAt(base.byKey.survivor, 67)
    );
    // The switch wasn't touched → identical pot.
    expect(potAt(more.byKey.switch, 67)).toBeCloseTo(
      potAt(base.byKey.switch, 67),
      0
    );
  });

  it("an override of 0 invests nothing for that strategy", () => {
    const { byKey } = compareStrategies({
      ...baseInputs,
      investedEarlyDollarByStrategy: { survivor: 0 },
    });
    expect(byKey.survivor.investedMonthly).toBe(0);
    expect(byKey.survivor.investedOverridden).toBe(true);
  });
});

describe("findBreakEvenReturn", () => {
  it("finds a flip rate for a long life: switch below it, survivor above", () => {
    // At a long life the switch wins when returns are flat (the bigger post-67
    // benefit eventually outweighs survivor-early's head start), but high
    // returns favor investing the larger early survivor check. So there's a
    // flip in between, with the switch winning at low returns.
    const be = findBreakEvenReturn({ ...baseInputs, lifeExpectancy: 95 });
    expect(be.rate).toBeGreaterThan(0);
    expect(be.rate).toBeLessThan(12);
    expect(be.lowWinner).toBe("switch");
    expect(be.highWinner).toBe("survivor");
  });

  it("reports no flip (survivor wins throughout) for a short life", () => {
    // Die soon after FRA: survivor-early's larger early checks win at every
    // return, so there's no crossing in 0..12%.
    const be = findBreakEvenReturn({ ...baseInputs, lifeExpectancy: 72 });
    expect(be.rate).toBeNull();
    expect(be.lowWinner).toBe("survivor");
    expect(be.highWinner).toBe("survivor");
  });

  it("the flip rate is consistent with compareStrategies at that rate", () => {
    // At the flip rate the two strategies' lifetime totals should be ~equal.
    const be = findBreakEvenReturn({ ...baseInputs, lifeExpectancy: 95 });
    const { byKey } = compareStrategies({
      ...baseInputs,
      lifeExpectancy: 95,
      returnRate: be.rate,
    });
    const gap = Math.abs(byKey.switch.lifetimeTotal - byKey.survivor.lifetimeTotal);
    // Within a small band — interpolation between 0.5%-spaced samples isn't
    // exact, but the totals are within a fraction of a percent of each other.
    expect(gap / byKey.survivor.lifetimeTotal).toBeLessThan(0.02);
  });

  it("is exposed on the verdict", () => {
    const { verdict } = compareStrategies({ ...baseInputs, lifeExpectancy: 95 });
    expect(verdict.breakEvenReturn).toBeDefined();
    expect(verdict.breakEvenReturn.lowWinner).toBe("switch");
  });
});

describe("compareStrategies — mortality weighting", () => {
  it("reports the probability of reaching the crossover, conditioned on the claim age", () => {
    // Flat returns + long life → the switch overtakes at a finite crossover.
    const { verdict } = compareStrategies({
      ...baseInputs,
      returnRate: 0,
      lifeExpectancy: 95,
    });
    // There's a crossover, so a survival probability is reported.
    expect(verdict.crossover).toBeGreaterThan(67);
    expect(verdict.crossoverSurvivalProb).toBeGreaterThan(0);
    expect(verdict.crossoverSurvivalProb).toBeLessThan(1);
    // Conditioned on the survivor strategy's claim age (the decision point).
    expect(verdict.conditioningAge).toBe(62);
  });

  it("leaves the survival probability null when the lines never cross", () => {
    // Short life → survivor-early leads the whole way, no crossover.
    const { verdict } = compareStrategies({ ...baseInputs, lifeExpectancy: 72 });
    expect(verdict.crossover).toBeNull();
    expect(verdict.crossoverSurvivalProb).toBeNull();
  });
});

describe("findSeriesCrossover", () => {
  it("finds a sign-change crossover by linear interpolation", () => {
    const rows = [
      { age: 70, a: 100, b: 0 },
      { age: 71, a: 100, b: 200 }, // b overtakes a between 70 and 71
    ];
    const age = findSeriesCrossover(rows, "b", "a");
    expect(age).toBeGreaterThan(70);
    expect(age).toBeLessThan(71);
  });

  it("returns null when the series never cross", () => {
    const rows = [
      { age: 70, a: 100, b: 0 },
      { age: 71, a: 200, b: 50 },
    ];
    expect(findSeriesCrossover(rows, "b", "a")).toBeNull();
  });

  it("ignores the trivial pre-claim zero-zero start", () => {
    const rows = [
      { age: 62, a: 0, b: 0 },
      { age: 63, a: 10, b: 5 },
    ];
    expect(findSeriesCrossover(rows, "b", "a")).toBeNull();
  });
});

describe("mergeEarlySeries", () => {
  it("zero-fills samples missing from one series", () => {
    const a = [
      { age: 60, early: 10 },
      { age: 61, early: 20 },
    ];
    const b = [{ age: 61, early: 5 }];
    const merged = mergeEarlySeries(a, b, "x", "y");
    expect(merged).toEqual([
      { age: 60, x: 10, y: 0 },
      { age: 61, x: 20, y: 5 },
    ]);
  });
});
