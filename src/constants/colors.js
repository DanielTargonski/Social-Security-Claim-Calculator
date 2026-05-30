// Single source of truth for the calculator's color palette.
// Lives outside any component so it can be imported anywhere without prop
// drilling. The chart conventions:
//   - early        (dark red)    = "claim early" line, also "worse outcome" in tornado
//   - earlySoft    (soft red)    = invested-pot trajectory (dashed)
//   - wait         (dark green)  = "wait until FRA" line, also "better outcome" in tornado
//   - waitInvested (medium green) = "wait + invest the checks" line
//                                   visually related to `wait` but distinct so they
//                                   read as a family
//   - cross        (gold)        = crossover marker
//
// Each key resolves to a CSS custom property rather than a raw hex. The actual
// light/dark values live in src/index.css under :root and [data-theme="dark"].
// This keeps every existing `style={{ color: C.ink }}` call site (and the
// recharts stroke/fill props) untouched: they emit `var(--c-ink)`, which the
// browser resolves per-theme. Dark mode is therefore a pure CSS swap with no
// component changes. See colors.test.js for the var()-shape contract.
//
// Contrast (WCAG AA = 4.5:1 normal text, 3:1 graphics) is held in BOTH themes;
// the per-theme ratios are documented next to the hexes in index.css.
export const C = {
  bg: "var(--c-bg)",
  surface: "var(--c-surface)",
  paper: "var(--c-paper)",
  border: "var(--c-border)",
  borderDark: "var(--c-border-dark)",
  track: "var(--c-track)",
  // Brand accent (indigo) — interactive chrome only (active controls, focus
  // rings, primary CTAs, slider fill). Deliberately distinct from the data
  // colors so "interactive" never reads as "good/bad". accentSoft is the pale
  // wash used behind accent content.
  accent: "var(--c-accent)",
  accentSoft: "var(--c-accent-soft)",
  // Text / icon color that sits ON an accent fill (primary buttons, active
  // chips). White in light mode; near-black teal in dark, since the dark
  // accent is a bright teal that white text wouldn't read on.
  accentOn: "var(--c-accent-on)",
  ink: "var(--c-ink)",
  inkSoft: "var(--c-ink-soft)",
  inkFaint: "var(--c-ink-faint)",
  // Text drawn on top of a `C.ink` surface (the Crossover-age card, the
  // OptimalClaimAge button). In light mode that surface is near-black, so this
  // is a light tan; in dark mode the surface inverts to near-white, so the
  // dark-theme value flips to a dark warm tone (see index.css).
  inkOnDark: "var(--c-ink-on-dark)",
  early: "var(--c-early)",
  earlySoft: "var(--c-early-soft)",
  wait: "var(--c-wait)",
  waitInvested: "var(--c-wait-invested)",
  cross: "var(--c-cross)",
};
