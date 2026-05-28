import { describe, it, expect } from "vitest";
import {
  computeStateLocalWageTax,
  taxFromBrackets,
  localityLabel,
  SS_IS_STATE_TAXABLE,
  NY_STANDARD_DEDUCTION_SINGLE,
  NY_STATE_BRACKETS_SINGLE,
  NYC_RESIDENT_BRACKETS_SINGLE,
} from "./stateLocalTax.js";

const closeTo = (a, b, tol = 0.01) => Math.abs(a - b) < tol;

describe("taxFromBrackets", () => {
  it("returns 0 at or below 0", () => {
    expect(taxFromBrackets(0, NY_STATE_BRACKETS_SINGLE)).toBe(0);
    expect(taxFromBrackets(-100, NY_STATE_BRACKETS_SINGLE)).toBe(0);
  });

  it("taxes exactly the first bracket at its boundary", () => {
    // NY first bracket: 4% up to $8,500.
    expect(closeTo(taxFromBrackets(8500, NY_STATE_BRACKETS_SINGLE), 340)).toBe(
      true
    );
  });

  it("walks multiple brackets additively", () => {
    // $32,000: 4%×8500 + 4.5%×3200 + 5.25%×2200 + 5.5%×18100
    //        = 340 + 144 + 115.5 + 995.5 = 1595.
    expect(closeTo(taxFromBrackets(32000, NY_STATE_BRACKETS_SINGLE), 1595)).toBe(
      true
    );
  });
});

describe("computeStateLocalWageTax — locality gating", () => {
  it("returns all zeros for 'none'", () => {
    const r = computeStateLocalWageTax({ locality: "none", wageIncome: 40000 });
    expect(r).toEqual({ stateTax: 0, cityTax: 0, total: 0 });
  });

  it("returns all zeros for a zero (or missing) wage", () => {
    expect(computeStateLocalWageTax({ locality: "nyc", wageIncome: 0 })).toEqual(
      { stateTax: 0, cityTax: 0, total: 0 }
    );
    expect(
      computeStateLocalWageTax({ locality: "nyc", wageIncome: undefined })
    ).toEqual({ stateTax: 0, cityTax: 0, total: 0 });
  });

  it("'ny' charges state tax only — no city component", () => {
    const r = computeStateLocalWageTax({ locality: "ny", wageIncome: 40000 });
    // nyTaxable = 40000 − 8000 = 32000 → $1,595 state.
    expect(closeTo(r.stateTax, 1595)).toBe(true);
    expect(r.cityTax).toBe(0);
    expect(closeTo(r.total, 1595)).toBe(true);
  });

  it("'nyc' stacks NYC resident tax on top of NY state tax", () => {
    const r = computeStateLocalWageTax({ locality: "nyc", wageIncome: 40000 });
    // City: 3.078%×12000 + 3.762%×13000 + 3.819%×7000
    //     = 369.36 + 489.06 + 267.33 = 1125.75.
    expect(closeTo(r.stateTax, 1595)).toBe(true);
    expect(closeTo(r.cityTax, 1125.75)).toBe(true);
    expect(closeTo(r.total, 2720.75)).toBe(true);
  });
});

describe("computeStateLocalWageTax — deduction + SS exclusion", () => {
  it("applies the NY standard deduction before taxing", () => {
    // A wage at exactly the NY standard deduction → zero taxable → zero tax.
    expect(
      computeStateLocalWageTax({
        locality: "nyc",
        wageIncome: NY_STANDARD_DEDUCTION_SINGLE,
      }).total
    ).toBe(0);
  });

  it("never taxes Social Security at the state/city level", () => {
    // The function takes only wageIncome — there is no SS parameter, so SS
    // dollars can never enter the NY/NYC base. The flag documents the rule.
    expect(SS_IS_STATE_TAXABLE).toBe(false);
  });
});

describe("localityLabel", () => {
  it("maps each locality to its display label", () => {
    expect(localityLabel("none")).toBe("No state tax");
    expect(localityLabel("ny")).toBe("New York State");
    expect(localityLabel("nyc")).toBe("New York City");
  });
});

describe("NYC_RESIDENT_BRACKETS_SINGLE", () => {
  it("tops out at the published 3.876% rate", () => {
    const top = NYC_RESIDENT_BRACKETS_SINGLE[NYC_RESIDENT_BRACKETS_SINGLE.length - 1];
    expect(top[1]).toBe(0.03876);
  });
});
