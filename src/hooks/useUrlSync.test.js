// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useUrlSync } from "./useUrlSync.js";
import { DEFAULT_STATE } from "../lib/shareableState.js";

describe("useUrlSync", () => {
  let replaceStateSpy;

  beforeEach(() => {
    // Reset the URL to a known clean path before each test so a previous
    // test's URL writes don't bleed into the dedup check.
    window.history.replaceState(null, "", "/");
    replaceStateSpy = vi.spyOn(window.history, "replaceState");
  });

  afterEach(() => {
    replaceStateSpy.mockRestore();
  });

  it("writes serialized state to the URL on mount", () => {
    renderHook(() => useUrlSync(DEFAULT_STATE));
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    // Should land on a query string carrying every SCHEMA field.
    expect(window.location.search).toContain("mode=retirement");
    expect(window.location.search).toContain("fra=2500");
    expect(window.location.search).toContain("age=62");
  });

  it("rewrites the URL when state changes", () => {
    const { rerender } = renderHook(({ state }) => useUrlSync(state), {
      initialProps: { state: DEFAULT_STATE },
    });
    replaceStateSpy.mockClear();
    rerender({ state: { ...DEFAULT_STATE, claimAge: 65 } });
    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain("age=65");
  });

  it("skips the write when the new query string matches what's already there", () => {
    // First mount writes the URL.
    const { rerender } = renderHook(({ state }) => useUrlSync(state), {
      initialProps: { state: DEFAULT_STATE },
    });
    replaceStateSpy.mockClear();
    // Re-render with a new object that serializes identically — the
    // dedup guard should keep replaceState from firing again.
    rerender({ state: { ...DEFAULT_STATE } });
    expect(replaceStateSpy).not.toHaveBeenCalled();
  });

  it("preserves the URL hash when writing the query string", () => {
    window.history.replaceState(null, "", "/#worked-example");
    renderHook(() => useUrlSync(DEFAULT_STATE));
    expect(window.location.hash).toBe("#worked-example");
    expect(window.location.search).toContain("mode=retirement");
  });
});
