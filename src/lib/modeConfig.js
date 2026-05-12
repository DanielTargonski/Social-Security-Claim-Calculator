// Single source of truth for mode-specific claim-age bounds and the
// landing-age behavior when the user switches modes. Previously this table
// lived in four places (App.jsx, SensitivityTornado.jsx, optimalClaimAge.js,
// shareableState.js as CLAIM_AGE_BOUNDS) — easy to update one and forget the
// others.
//
// Per-mode fields:
//   earliest      Minimum claim age the slider allows.
//   latest        Maximum claim age the slider allows.
//   snapAboveTo   When the user switches modes and their current claimAge is
//                 above the new mode's `latest`, land them here instead of
//                 pinning to the upper bound. Encodes the original
//                 hand-tuned defaults: survivor → 65, switch → 64,
//                 retirement → 70 (the upper bound — switching *to*
//                 retirement from any other mode can't actually trigger
//                 this branch since survivor max=67 and switch max=66.5,
//                 but kept explicit so the table is exhaustive).
//
// Below-range snaps always land on `earliest` — there's no rationale for
// landing at a midpoint when the previous mode allowed earlier claiming
// than the new one (only survivor allows < 62; switching survivor →
// retirement at age 60 should snap to 62, not to a mid).
export const MODE_CONFIG = {
  retirement: { earliest: 62, latest: 70,   snapAboveTo: 70 },
  survivor:   { earliest: 60, latest: 67,   snapAboveTo: 65 },
  switch:     { earliest: 62, latest: 66.5, snapAboveTo: 64 },
};

// Convenience accessor for callers that only need the slider bounds.
export function rangeForMode(mode) {
  const cfg = MODE_CONFIG[mode];
  return { earliest: cfg.earliest, latest: cfg.latest };
}

// URL-hydration clamp: a hand-crafted share link with `?mode=survivor&age=70`
// would otherwise leave React state holding 70 even though the survivor
// slider only goes to 67. Always snaps to the nearest bound.
export function clampClaimAgeToBounds(mode, claimAge) {
  const cfg = MODE_CONFIG[mode];
  if (!cfg) return claimAge;
  if (claimAge < cfg.earliest) return cfg.earliest;
  if (claimAge > cfg.latest) return cfg.latest;
  return claimAge;
}

// Mode-switch snap: keep low values at the new earliest, but snap high
// values to the mode's `snapAboveTo` (often a midpoint, not the upper
// bound — we don't want to silently push someone to age 70 just because
// they flipped from retirement to survivor and back).
export function snapClaimAgeOnModeSwitch(mode, claimAge) {
  const cfg = MODE_CONFIG[mode];
  if (!cfg) return claimAge;
  if (claimAge < cfg.earliest) return cfg.earliest;
  if (claimAge > cfg.latest) return cfg.snapAboveTo;
  return claimAge;
}
