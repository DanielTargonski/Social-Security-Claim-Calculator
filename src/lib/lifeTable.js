// Approximate unisex period life table — survivors (lx) per 100,000 — blended
// ~50/50 from the SSA 2021 period life tables (male + female averaged). Used
// to turn the strategy-comparison crossover age into a "chance you live long
// enough to see it" probability, so the head-to-head reads as an EXPECTED bet,
// not a bet on living to one fixed age.
//
// Gender-neutral by design — the calculator never asks the claimant's sex (see
// CLAUDE.md's language convention), so a unisex blend is the honest input.
//
// Intentional simplifications (in keeping with the rest of the calculator):
//   - Period table, not cohort — ignores future mortality improvement, so it
//     slightly understates the odds of reaching advanced ages.
//   - Unisex 50/50 blend — a specific claimant's odds differ by sex.
//   - 5-year anchors with linear interpolation between them.
// Accurate enough for a directional "~X% chance" read; NOT actuarial pricing.
const LX = {
  60: 87900,
  65: 83250,
  70: 76750,
  75: 67450,
  80: 54550,
  85: 38100,
  90: 21000,
  95: 8150,
  100: 2050,
};

const MIN_AGE = 60;
const MAX_AGE = 100;

// Survivors still alive at an exact age, linearly interpolated between the
// 5-year anchors. Clamps outside [60, 100]: at/below 60 → the age-60 cohort
// (we don't model pre-60 mortality here, and every claim age in the app is
// >= 60); at/above 100 → the age-100 tail.
export function survivorsAt(age) {
  if (age <= MIN_AGE) return LX[MIN_AGE];
  if (age >= MAX_AGE) return LX[MAX_AGE];
  const lo = Math.floor(age / 5) * 5;
  const hi = lo + 5;
  const t = (age - lo) / 5;
  return LX[lo] + t * (LX[hi] - LX[lo]);
}

// Probability of surviving from `fromAge` to `toAge`, conditioned on being
// alive at `fromAge`. Returns 1 when `toAge <= fromAge` (you're already there),
// and is clamped to [0, 1]. This is the conditional survival lx(to)/lx(from).
export function survivalProbability(fromAge, toAge) {
  if (toAge <= fromAge) return 1;
  const from = survivorsAt(fromAge);
  if (from <= 0) return 0;
  const to = survivorsAt(toAge);
  return Math.max(0, Math.min(1, to / from));
}
