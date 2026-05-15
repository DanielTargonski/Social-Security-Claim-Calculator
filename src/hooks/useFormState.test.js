// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useFormState } from "./useFormState.js";

describe("useFormState", () => {
  it("returns the initial state on first render", () => {
    const { result } = renderHook(() =>
      useFormState({ mode: "retirement", claimAge: 62, returnRate: 0.05 })
    );
    const [state] = result.current;
    expect(state).toEqual({
      mode: "retirement",
      claimAge: 62,
      returnRate: 0.05,
    });
  });

  it("auto-generates a setX setter for each initial-state key", () => {
    const { result } = renderHook(() =>
      useFormState({ fraBenefit: 3000, mode: "retirement" })
    );
    const [, setters] = result.current;
    // The setter name capitalizes the first letter of the field.
    expect(typeof setters.setFraBenefit).toBe("function");
    expect(typeof setters.setMode).toBe("function");
    // Nothing extraneous.
    expect(Object.keys(setters).sort()).toEqual(["setFraBenefit", "setMode"]);
  });

  it("setters accept a plain value", () => {
    const { result } = renderHook(() =>
      useFormState({ claimAge: 62, mode: "retirement" })
    );
    act(() => {
      result.current[1].setClaimAge(65);
    });
    expect(result.current[0].claimAge).toBe(65);
    // Unrelated fields stay put.
    expect(result.current[0].mode).toBe("retirement");
  });

  it("setters accept an updater function (matches useState's API)", () => {
    const { result } = renderHook(() => useFormState({ claimAge: 62 }));
    act(() => {
      result.current[1].setClaimAge((c) => c + 1);
    });
    expect(result.current[0].claimAge).toBe(63);
  });

  it("returns a stable setters object across renders", () => {
    const { result, rerender } = renderHook(() =>
      useFormState({ claimAge: 62 })
    );
    const settersBefore = result.current[1];
    act(() => {
      result.current[1].setClaimAge(65);
    });
    rerender();
    expect(result.current[1]).toBe(settersBefore);
  });

  it("exposes raw setState as the third tuple element for bulk updates", () => {
    const { result } = renderHook(() =>
      useFormState({ mode: "retirement", claimAge: 62 })
    );
    act(() => {
      // Bulk replacement — the escape hatch URL hydration uses on first mount.
      result.current[2]({ mode: "survivor", claimAge: 60 });
    });
    expect(result.current[0]).toEqual({ mode: "survivor", claimAge: 60 });
  });
});
