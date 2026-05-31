import { describe, it, expect } from "vitest";
import { survivorsAt, survivalProbability } from "./lifeTable.js";

describe("lifeTable — survivorsAt", () => {
  it("returns the anchor value at an exact 5-year age", () => {
    expect(survivorsAt(65)).toBe(83250);
    expect(survivorsAt(85)).toBe(38100);
  });

  it("interpolates linearly between anchors", () => {
    // Midway between 60 (87,900) and 65 (83,250) → the average.
    expect(survivorsAt(62.5)).toBeCloseTo((87900 + 83250) / 2, 6);
  });

  it("is monotonically non-increasing with age", () => {
    let prev = Infinity;
    for (let age = 60; age <= 100; age += 1) {
      const lx = survivorsAt(age);
      expect(lx).toBeLessThanOrEqual(prev + 1e-9);
      prev = lx;
    }
  });

  it("clamps below 60 and above 100 to the endpoint cohorts", () => {
    expect(survivorsAt(55)).toBe(survivorsAt(60));
    expect(survivorsAt(120)).toBe(survivorsAt(100));
  });
});

describe("lifeTable — survivalProbability", () => {
  it("is 1 when the target age is at or before the start age", () => {
    expect(survivalProbability(65, 65)).toBe(1);
    expect(survivalProbability(80, 75)).toBe(1);
  });

  it("falls in (0,1) for a future age and decreases the further out you go", () => {
    const to85 = survivalProbability(65, 85);
    const to95 = survivalProbability(65, 95);
    expect(to85).toBeGreaterThan(0);
    expect(to85).toBeLessThan(1);
    expect(to95).toBeLessThan(to85);
  });

  it("lands in a plausible range for reaching 85 from 65 (~45%)", () => {
    const p = survivalProbability(65, 85);
    expect(p).toBeGreaterThan(0.35);
    expect(p).toBeLessThan(0.55);
  });

  it("conditions correctly: surviving from a later age is more likely", () => {
    // Reaching 90 is more likely if you've already made it to 80 than to 65.
    expect(survivalProbability(80, 90)).toBeGreaterThan(
      survivalProbability(65, 90)
    );
  });
});
