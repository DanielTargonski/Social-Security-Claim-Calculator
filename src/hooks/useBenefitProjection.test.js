// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBenefitProjection } from "./useBenefitProjection.js";
import { computeProjection } from "../lib/benefitMath.js";
import { DEFAULT_STATE } from "../lib/shareableState.js";

// Baseline inputs that match the calculator's default state — keeps these
// tests anchored to a real, valid input shape so a future SCHEMA addition
// just adds a key here rather than diverging silently.
function baseInputs(overrides = {}) {
  return { ...DEFAULT_STATE, ...overrides };
}

describe("useBenefitProjection", () => {
  it("returns the same projection that computeProjection produces", () => {
    const inputs = baseInputs();
    const { result } = renderHook(() => useBenefitProjection(inputs));
    expect(result.current).toEqual(computeProjection(inputs));
  });

  it("memoizes: equal inputs across renders return the same reference", () => {
    const inputs = baseInputs();
    const { result, rerender } = renderHook(
      (props) => useBenefitProjection(props),
      { initialProps: inputs }
    );
    const first = result.current;
    // New object, same field values — should hit the memo.
    rerender({ ...inputs });
    expect(result.current).toBe(first);
  });

  // Catch the "added a field to computeProjection, forgot the dep array"
  // class of bug. Each tracked field is flipped to a different valid value;
  // every flip must break memo identity. If a future change adds a new
  // field, the test for it goes here.
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
    ["investedPctWait", 75],
    ["coveredElsewhere", true],
    ["unsubsidizedSilverAnnual", 12000],
  ];

  it.each(trackedFields)(
    "invalidates memo when %s changes",
    (field, newValue) => {
      const inputs = baseInputs();
      const { result, rerender } = renderHook(
        (props) => useBenefitProjection(props),
        { initialProps: inputs }
      );
      const first = result.current;
      rerender({ ...inputs, [field]: newValue });
      expect(result.current).not.toBe(first);
    }
  );
});
