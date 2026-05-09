import { describe, it, expect } from "vitest";
import {
  DEFAULT_STATE,
  serializeStateToParams,
  parseStateFromParams,
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

describe("shareableState — DEFAULT_STATE shape", () => {
  it("exposes a default for every input the calculator owns", () => {
    expect(Object.keys(DEFAULT_STATE).sort()).toEqual(
      [
        "autoTax",
        "claimAge",
        "fraBenefit",
        "grossIncome",
        "investStopAge",
        "lifeExpectancy",
        "manualFedRate",
        "mode",
        "ownBenefit",
        "postFRAGrossIncome",
        "returnRate",
      ].sort()
    );
  });
});
