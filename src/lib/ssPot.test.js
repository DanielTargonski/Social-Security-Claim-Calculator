import { describe, it, expect } from "vitest";
import { bondPot, computeSSPot } from "./ssPot.js";

// Claim at 62 for $1,000/mo ($1,200/mo after the FRA recoup) vs claim at 67
// for $1,500/mo, priced at a 2% real yield.
function base(overrides = {}) {
  return {
    claimAge: 62,
    bondYield: 2,
    earlyPreFRAMonthly: 1000,
    earlyPostFRAMonthly: 1200,
    waitMonthly: 1500,
    ...overrides,
  };
}

describe("bondPot", () => {
  it("is the principal whose real yield pays the check", () => {
    expect(bondPot(1000, 2)).toBeCloseTo(600000, 6);
    expect(bondPot(2000, 4)).toBeCloseTo(600000, 6);
    // The pot's income at that yield is exactly the check.
    expect((bondPot(1234, 2.5) * 0.025) / 12).toBeCloseTo(1234, 6);
  });

  it("a lower yield takes a bigger pot to pay the same check", () => {
    expect(bondPot(1000, 1)).toBeGreaterThan(bondPot(1000, 3));
  });
});

describe("computeSSPot", () => {
  it("sizes each choice's pot from its lifelong check", () => {
    const res = computeSSPot(base());
    expect(res.compareAge).toBe(67);
    expect(res.early.firstMonthly).toBe(1000);
    expect(res.early.firstPot).toBeCloseTo(600000, 6);
    expect(res.early.pot).toBeCloseTo(720000, 6);
    expect(res.wait.pot).toBeCloseTo(900000, 6);
    expect(res.potGap).toBeCloseTo(-180000, 6);
  });

  it("prices waiting as the early checks given up before FRA", () => {
    expect(computeSSPot(base()).forgoneChecks).toBeCloseTo(60 * 1000, 6);
    expect(
      computeSSPot(base({ claimAge: 64.5 })).forgoneChecks
    ).toBeCloseTo(30 * 1000, 6);
  });

  it("a delayed claim gives up the FRA checks in between", () => {
    const res = computeSSPot(
      base({ claimAge: 70, earlyPreFRAMonthly: 0, earlyPostFRAMonthly: 1860 })
    );
    expect(res.compareAge).toBe(70);
    expect(res.early.firstMonthly).toBe(1860);
    expect(res.forgoneChecks).toBeCloseTo(36 * 1500, 6);
    expect(res.potGap).toBeGreaterThan(0);
  });

  it("claiming at FRA is the wait choice: same pot, nothing given up", () => {
    const res = computeSSPot(
      base({ claimAge: 67, earlyPostFRAMonthly: 1500 })
    );
    expect(res.potGap).toBe(0);
    expect(res.forgoneChecks).toBe(0);
  });
});
