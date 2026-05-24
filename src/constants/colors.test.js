import { describe, it, expect } from "vitest";
import { C } from "./colors.js";

// The palette is the seam dark mode hangs on: every key must resolve to a CSS
// custom property so the actual hex can be swapped per-theme in index.css
// without touching any component. If someone reverts a key back to a raw hex,
// that key silently stops responding to the theme toggle — this guards it.
describe("color palette", () => {
  it("exposes every key as a var() reference, never a raw value", () => {
    const keys = Object.keys(C);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(C[key], `C.${key} must be a var() reference`).toMatch(
        /^var\(--c-[a-z-]+\)$/
      );
    }
  });
});
