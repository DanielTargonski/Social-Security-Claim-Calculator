// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOptimalClaimAge } from "./useOptimalClaimAge.js";
import { findOptimalClaimAge } from "../lib/optimalClaimAge.js";
import { DEFAULT_STATE } from "../lib/shareableState.js";

function baseInputs(overrides = {}) {
  return { ...DEFAULT_STATE, ...overrides };
}

describe("useOptimalClaimAge", () => {
  it("returns the same sweep result that findOptimalClaimAge produces", () => {
    const inputs = baseInputs();
    const { result } = renderHook(() => useOptimalClaimAge(inputs));
    expect(result.current).toEqual(findOptimalClaimAge(inputs));
  });

  it("memoizes: equal inputs across renders return the same reference", () => {
    const inputs = baseInputs();
    const { result, rerender } = renderHook(
      (props) => useOptimalClaimAge(props),
      { initialProps: inputs }
    );
    const first = result.current;
    rerender({ ...inputs });
    expect(result.current).toBe(first);
  });

  // Mirror the projection hook's dep-array regression test, minus
  // investedPctWait: the wait+invest line doesn't affect the sweep's score
  // (finalEarly for retirement/survivor, potAtStopRow for switch — neither
  // depends on investedPctWait), so the hook intentionally omits it.
  const trackedFields = [
    ["mode", "survivor"],
    ["fraBenefit", 2800],
    ["ownBenefit", 1800],
    ["claimAge", 63],
    ["returnRate", 5],
    ["investStopAge", 70],
    ["lifeExpectancy", 90],
    ["grossIncome", 25000],
    ["postFRAGrossIncome", 15000],
    ["postFRAWorkYears", 3],
    ["autoTax", false],
    ["manualFedRate", 22],
    ["investedPct", 50],
    ["coveredElsewhere", true],
    ["unsubsidizedSilverAnnual", 12000],
  ];

  it.each(trackedFields)(
    "invalidates memo when %s changes",
    (field, newValue) => {
      const inputs = baseInputs();
      const { result, rerender } = renderHook(
        (props) => useOptimalClaimAge(props),
        { initialProps: inputs }
      );
      const first = result.current;
      rerender({ ...inputs, [field]: newValue });
      expect(result.current).not.toBe(first);
    }
  );

  it("does NOT invalidate when investedPctWait changes (intentional)", () => {
    // The optimal-claim-age sweep's score doesn't depend on investedPctWait,
    // so omitting it from the dep array is correct: we don't want to rerun
    // a 96-iteration sweep when only the wait+invest line moves.
    const inputs = baseInputs();
    const { result, rerender } = renderHook(
      (props) => useOptimalClaimAge(props),
      { initialProps: inputs }
    );
    const first = result.current;
    rerender({ ...inputs, investedPctWait: 25 });
    expect(result.current).toBe(first);
  });
});
