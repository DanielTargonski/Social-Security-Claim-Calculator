import { describe, it, expect } from "vitest";
import {
  MODE_CONFIG,
  rangeForMode,
  clampClaimAgeToBounds,
  snapClaimAgeOnModeSwitch,
} from "./modeConfig.js";

describe("MODE_CONFIG", () => {
  it("encodes the per-mode claim-age bounds", () => {
    expect(MODE_CONFIG.retirement).toEqual({
      earliest: 62,
      latest: 70,
      snapAboveTo: 70,
    });
    expect(MODE_CONFIG.survivor).toEqual({
      earliest: 60,
      latest: 67,
      snapAboveTo: 65,
    });
    expect(MODE_CONFIG.switch).toEqual({
      earliest: 62,
      latest: 66.5,
      snapAboveTo: 64,
    });
  });
});

describe("rangeForMode", () => {
  it("returns earliest/latest only (no snapAboveTo leakage to slider consumers)", () => {
    expect(rangeForMode("retirement")).toEqual({ earliest: 62, latest: 70 });
    expect(rangeForMode("survivor")).toEqual({ earliest: 60, latest: 67 });
    expect(rangeForMode("switch")).toEqual({ earliest: 62, latest: 66.5 });
  });
});

describe("clampClaimAgeToBounds", () => {
  it("returns the value unchanged when inside the mode's range", () => {
    expect(clampClaimAgeToBounds("retirement", 65)).toBe(65);
    expect(clampClaimAgeToBounds("survivor", 63.5)).toBe(63.5);
    expect(clampClaimAgeToBounds("switch", 64)).toBe(64);
  });

  it("snaps below-range values up to the mode's earliest", () => {
    // The original use case: a hand-crafted ?mode=survivor&age=58 share link.
    expect(clampClaimAgeToBounds("survivor", 58)).toBe(60);
    expect(clampClaimAgeToBounds("retirement", 60)).toBe(62);
    expect(clampClaimAgeToBounds("switch", 60)).toBe(62);
  });

  it("snaps above-range values down to the mode's latest", () => {
    // The original use case: ?mode=survivor&age=70 — survivor maxes at 67.
    expect(clampClaimAgeToBounds("survivor", 70)).toBe(67);
    expect(clampClaimAgeToBounds("switch", 70)).toBe(66.5);
    expect(clampClaimAgeToBounds("retirement", 80)).toBe(70);
  });

  it("treats the mode bounds themselves as in-range", () => {
    expect(clampClaimAgeToBounds("survivor", 60)).toBe(60);
    expect(clampClaimAgeToBounds("survivor", 67)).toBe(67);
    expect(clampClaimAgeToBounds("switch", 66.5)).toBe(66.5);
  });
});

describe("snapClaimAgeOnModeSwitch", () => {
  it("keeps in-range values where they are", () => {
    expect(snapClaimAgeOnModeSwitch("retirement", 65)).toBe(65);
    expect(snapClaimAgeOnModeSwitch("survivor", 63)).toBe(63);
    expect(snapClaimAgeOnModeSwitch("switch", 64)).toBe(64);
  });

  it("snaps below-range to earliest (no rationale for landing at a midpoint)", () => {
    // Switching survivor → retirement at age 60: should land at 62, not at
    // some midpoint, because retirement simply doesn't allow earlier claiming.
    expect(snapClaimAgeOnModeSwitch("retirement", 60)).toBe(62);
    expect(snapClaimAgeOnModeSwitch("switch", 60)).toBe(62);
  });

  it("snaps above-range to the mode's hand-tuned snapAboveTo, not just `latest`", () => {
    // The defensive design: flipping retirement → survivor at age 70 should
    // land at 65 (the survivor mid), not pin to the survivor max of 67.
    expect(snapClaimAgeOnModeSwitch("survivor", 70)).toBe(65);
    // Retirement → switch at 70 lands at 64, not the switch max of 66.5.
    expect(snapClaimAgeOnModeSwitch("switch", 70)).toBe(64);
    // Switching to retirement from any other mode can't actually trigger this
    // branch (survivor max=67, switch max=66.5, both ≤ retirement max=70),
    // but the table is exhaustive and snapAboveTo === latest === 70 here.
    expect(snapClaimAgeOnModeSwitch("retirement", 75)).toBe(70);
  });

  it("differs from clampClaimAgeToBounds only on the above-range path", () => {
    // Below-range: both functions snap to earliest (same behavior).
    for (const mode of ["retirement", "survivor", "switch"]) {
      expect(snapClaimAgeOnModeSwitch(mode, 50)).toBe(
        clampClaimAgeToBounds(mode, 50)
      );
    }
    // Above-range: snap goes to snapAboveTo, clamp goes to latest. These
    // diverge for survivor (65 vs 67) and switch (64 vs 66.5).
    expect(snapClaimAgeOnModeSwitch("survivor", 80)).toBe(65);
    expect(clampClaimAgeToBounds("survivor", 80)).toBe(67);
    expect(snapClaimAgeOnModeSwitch("switch", 80)).toBe(64);
    expect(clampClaimAgeToBounds("switch", 80)).toBe(66.5);
  });
});
