import { describe, it, expect } from "vitest";
import {
  DEFAULT_STATE,
  serializeStateToParams,
  parseStateFromParams,
  clampClaimAge,
} from "./shareableState.js";

const sample = {
  mode: "switch",
  fraBenefit: 2300,
  ownBenefit: 945,
  claimAge: 64.5,
  returnRate: 5.5,
  investStopAge: 70,
  lifeExpectancy: 90,
  grossIncome: 80000,
  postFRAGrossIncome: 30000,
  autoTax: false,
  manualFedRate: 22,
  investedPct: 60,
};

describe("shareableState — round-trip", () => {
  it("serializes then parses back to the same values for every field", () => {
    const params = serializeStateToParams(sample);
    const parsed = parseStateFromParams(params);
    expect(parsed).toEqual(sample);
  });

  it("preserves fractional claim ages from the 1/12 slider step", () => {
    // 62 + 1 month = 62.0833...; should round-trip cleanly.
    const monthly = { ...sample, claimAge: 62 + 1 / 12 };
    const round = parseStateFromParams(serializeStateToParams(monthly));
    expect(round.claimAge).toBeCloseTo(62 + 1 / 12, 3);
  });

  it("preserves fractional lifeExpectancy from the 1/12 slider step", () => {
    // The Live Until slider also steps by 1/12 — share links must survive
    // a "live until 85 yr 6 mo" without snapping to an integer year.
    const fractional = { ...sample, lifeExpectancy: 85 + 7 / 12 };
    const round = parseStateFromParams(serializeStateToParams(fractional));
    expect(round.lifeExpectancy).toBeCloseTo(85 + 7 / 12, 3);
  });

  it("preserves fractional postFRAWorkYears from the 1/12 slider step", () => {
    // Same for the years-working-post-67 slider — month-precision must
    // round-trip cleanly through the URL.
    const fractional = { ...sample, postFRAWorkYears: 5 + 4 / 12 };
    const round = parseStateFromParams(serializeStateToParams(fractional));
    expect(round.postFRAWorkYears).toBeCloseTo(5 + 4 / 12, 3);
  });

  it("emits every default value (links must be self-contained)", () => {
    // Without this guarantee, a future default change would silently
    // shift the meaning of links shared today.
    const params = serializeStateToParams(DEFAULT_STATE);
    for (const key of [
      "mode",
      "fra",
      "own",
      "age",
      "ret",
      "stop",
      "life",
      "inc",
      "incp",
      "tax",
      "mrate",
      "inv",
    ]) {
      expect(params.has(key)).toBe(true);
    }
  });

  it("encodes booleans as 1/0", () => {
    const on = serializeStateToParams({ ...sample, autoTax: true });
    const off = serializeStateToParams({ ...sample, autoTax: false });
    expect(on.get("tax")).toBe("1");
    expect(off.get("tax")).toBe("0");
  });
});

describe("shareableState — parsing partial / malformed input", () => {
  it("returns an empty object for an empty query string", () => {
    expect(parseStateFromParams(new URLSearchParams(""))).toEqual({});
  });

  it("ignores fields with empty values rather than reading them as false/0", () => {
    // ?tax= and ?fra= should be treated as missing, not as false / NaN.
    const params = new URLSearchParams("tax=&fra=&mode=switch");
    const out = parseStateFromParams(params);
    expect(out).toEqual({ mode: "switch" });
  });

  it("ignores invalid mode values", () => {
    const params = new URLSearchParams("mode=banana");
    expect(parseStateFromParams(params)).toEqual({});
  });

  it("ignores non-numeric values for number fields", () => {
    const params = new URLSearchParams("fra=abc&age=64.5");
    expect(parseStateFromParams(params)).toEqual({ claimAge: 64.5 });
  });

  it("only includes successfully-parsed keys (caller spreads over defaults)", () => {
    const params = new URLSearchParams("mode=survivor&fra=2800");
    const partial = parseStateFromParams(params);
    expect(partial).toEqual({ mode: "survivor", fraBenefit: 2800 });
    // The merge pattern callers use:
    const merged = { ...DEFAULT_STATE, ...partial };
    expect(merged.mode).toBe("survivor");
    expect(merged.fraBenefit).toBe(2800);
    expect(merged.claimAge).toBe(DEFAULT_STATE.claimAge);
  });
});

describe("shareableState — clamping out-of-range values", () => {
  it("clamps numeric fields to their min/max during parse", () => {
    // Hand-crafted URL with values outside slider ranges. Without
    // clamping, React state would hold these and downstream math/UI
    // would silently render nonsense (e.g. negative net checks from
    // mrate=999, or 100% survivor factor from age=70 in survivor mode).
    const params = new URLSearchParams(
      "fra=99999&own=0&ret=50&stop=10&life=200&inc=-5000&incp=9999999&mrate=999&inv=200"
    );
    const out = parseStateFromParams(params);
    expect(out.fraBenefit).toBe(5000);
    expect(out.ownBenefit).toBe(300);
    expect(out.returnRate).toBe(10);
    expect(out.investStopAge).toBe(60);
    expect(out.lifeExpectancy).toBe(100);
    expect(out.grossIncome).toBe(0);
    expect(out.postFRAGrossIncome).toBe(500000);
    expect(out.manualFedRate).toBe(37);
    expect(out.investedPct).toBe(100);
  });

  it("clamps claimAge to the mode's allowed range (survivor max = 67)", () => {
    // Locks in the bug: ?mode=survivor&age=70 used to leave React state
    // holding 70 even though the survivor slider only allows 60–67.
    expect(clampClaimAge({ mode: "survivor", claimAge: 70 }).claimAge).toBe(67);
    expect(clampClaimAge({ mode: "survivor", claimAge: 55 }).claimAge).toBe(60);
  });

  it("clamps claimAge per mode (retirement: 62–70, switch: 62–66.5)", () => {
    expect(clampClaimAge({ mode: "retirement", claimAge: 75 }).claimAge).toBe(70);
    expect(clampClaimAge({ mode: "retirement", claimAge: 50 }).claimAge).toBe(62);
    expect(clampClaimAge({ mode: "switch", claimAge: 70 }).claimAge).toBe(66.5);
    expect(clampClaimAge({ mode: "switch", claimAge: 50 }).claimAge).toBe(62);
  });

  it("leaves claimAge alone when it's already in range", () => {
    const inRange = { mode: "retirement", claimAge: 65 };
    expect(clampClaimAge(inRange)).toBe(inRange); // same reference, no copy
  });
});

describe("shareableState — DEFAULT_STATE shape", () => {
  it("exposes a default for every input the calculator owns", () => {
    expect(Object.keys(DEFAULT_STATE).sort()).toEqual(
      [
        "autoTax",
        "claimAge",
        "fraBenefit",
        "grossIncome",
        "investStopAge",
        "investedPct",
        "investedPctWait",
        "lifeExpectancy",
        "manualFedRate",
        "mode",
        "ownBenefit",
        "postFRAGrossIncome",
        "postFRAWorkYears",
        "returnRate",
      ].sort()
    );
  });
});
