// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useTheme, getInitialTheme, THEME_STORAGE_KEY } from "./useTheme.js";

// Helper: install a matchMedia stub reporting a given dark preference, with a
// real listener registry so the "follow OS" effect can be exercised.
function mockMatchMedia(prefersDark) {
  const listeners = new Set();
  const mq = {
    matches: prefersDark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_, cb) => listeners.add(cb),
    removeEventListener: (_, cb) => listeners.delete(cb),
  };
  window.matchMedia = vi.fn(() => mq);
  return {
    emit: (matches) => listeners.forEach((cb) => cb({ matches })),
  };
}

describe("useTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses a stored choice over the OS preference", () => {
    mockMatchMedia(true); // OS prefers dark...
    window.localStorage.setItem(THEME_STORAGE_KEY, "light"); // ...but user chose light
    expect(getInitialTheme()).toBe("light");
  });

  it("falls back to the OS preference when nothing is stored", () => {
    mockMatchMedia(true);
    expect(getInitialTheme()).toBe("dark");
  });

  it("prefers the data-theme already on <html> (set by the FOUC guard)", () => {
    mockMatchMedia(false);
    document.documentElement.setAttribute("data-theme", "dark");
    expect(getInitialTheme()).toBe("dark");
  });

  it("toggles theme and writes it to the DOM and localStorage", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");

    act(() => result.current.toggleTheme());

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("follows live OS changes only until the user makes a choice", () => {
    const { emit } = mockMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");

    // No explicit choice yet → OS flip is followed.
    // (the mount effect persisted "light"; clear so the guard sees no choice)
    act(() => window.localStorage.removeItem(THEME_STORAGE_KEY));
    act(() => emit(true));
    expect(result.current.theme).toBe("dark");

    // User makes an explicit choice → later OS flips are ignored.
    act(() => result.current.setTheme("light"));
    act(() => emit(true));
    expect(result.current.theme).toBe("light");
  });
});
