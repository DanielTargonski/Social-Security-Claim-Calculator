// URL ↔ state conversion for share links. Schema-driven so adding a new
// input means adding one row to SCHEMA — serializer, parser, and the
// "load from URL on mount" behavior pick it up automatically.
//
// Readable URLs (`?fra=2500&age=64.5&ret=7&...`) on purpose: people sharing
// a calculator setup tend to want to sanity-check what they're sending,
// and a future maintainer can debug a bad bug-report URL by eye instead of
// decoding base64. If a future calculator's state grows large enough that
// readable becomes painful, that calculator gets its own opaque-encoded
// module — this one stays readable.
//
// All fields are emitted every time, even when they match the default.
// That means a default-value change in a future release won't silently
// shift the meaning of links shared today: the link captures literal
// values, not "default + diff". URL stays well under 200 chars.
//
// `min`/`max` per numeric field: clamped on parse so a hand-crafted URL
// can't push state outside what the sliders allow. Without this, a URL
// like `?mode=survivor&age=70` would leave React state holding 70 even
// though the survivor slider only goes to 67 — the slider visually
// clamps to its max but the state, label, and math still see 70.
// claimAge bounds depend on `mode` and are applied separately below via
// clampClaimAge — the per-mode bounds table lives in modeConfig.js.

import { clampClaimAgeToBounds } from "./modeConfig.js";

const SCHEMA = [
  { key: "mode",               url: "mode",  type: "enum", options: ["retirement", "survivor", "switch"], default: "retirement" },
  { key: "fraBenefit",         url: "fra",   type: "num",  default: 2500, min: 500, max: 5000 },
  { key: "ownBenefit",         url: "own",   type: "num",  default: 1500, min: 300, max: 4000 },
  { key: "claimAge",           url: "age",   type: "num",  default: 62 }, // mode-aware clamp below
  { key: "returnRate",         url: "ret",   type: "num",  default: 7,    min: 0,    max: 10 },
  { key: "investStopAge",      url: "stop",  type: "num",  default: 67,   min: 60,   max: 85 },
  { key: "lifeExpectancy",     url: "life",  type: "num",  default: 85,   min: 70,   max: 100 },
  { key: "grossIncome",        url: "inc",   type: "num",  default: 0,    min: 0,    max: 500000 },
  { key: "postFRAGrossIncome", url: "incp",  type: "num",  default: 0,    min: 0,    max: 500000 },
  { key: "postFRAWorkYears",   url: "wy",    type: "num",  default: 0,    min: 0,    max: 20 },
  { key: "autoTax",            url: "tax",   type: "bool", default: true },
  { key: "manualFedRate",      url: "mrate", type: "num",  default: 12,   min: 0,    max: 37 },
  // State/local income tax jurisdiction for the wage take-home figures.
  // Display-only (never enters the break-even). See lib/stateLocalTax.js.
  { key: "locality",           url: "loc",   type: "enum", options: ["none", "ny", "nyc"], default: "nyc" },
  { key: "investedPct",        url: "inv",   type: "num",  default: 100,  min: 0,    max: 100 },
  { key: "investedPctWait",    url: "invw",  type: "num",  default: 100,  min: 0,    max: 100 },
  // Healthcare-cost modeling (OBBBA / NYC). See lib/healthcareCost.js.
  // Single-filer only — see lib/healthcareCost.js header for the joint-filer
  // follow-up. The FPL primitive there is household-size aware, but the app
  // only ever models a single filer.
  { key: "coveredElsewhere",   url: "cov",   type: "bool", default: false },
  { key: "unsubsidizedSilverAnnual", url: "usil", type: "num", default: 9679, min: 0, max: 50000 },
  // Per-strategy invested-monthly-dollar overrides for the strategy-comparison
  // panel (survivor / switch / own). -1 is the sentinel for "no override —
  // follow the shared invest slider"; any value >= 0 is the monthly dollar that
  // strategy invests in the comparison (capped at its own check downstream).
  // Persisted so a shared link reproduces a head-to-head the sender set up
  // (e.g. $500/mo on survivor-early vs $250/mo on own->survivor). App maps
  // these three scalars to/from the comparison's override map.
  { key: "investSurvivor",     url: "cisv",  type: "num",  default: -1, min: -1, max: 50000 },
  { key: "investSwitch",       url: "cisw",  type: "num",  default: -1, min: -1, max: 50000 },
  { key: "investOwn",          url: "ciso",  type: "num",  default: -1, min: -1, max: 50000 },
];

export const DEFAULT_STATE = Object.fromEntries(
  SCHEMA.map((s) => [s.key, s.default])
);

function serializeOne(field, value) {
  if (field.type === "num") {
    // Round to 4 decimals to keep URLs clean. The claim-age slider's
    // 1/12 step (0.0833...) round-trips fine at 4 digits; everything
    // else is whole-number-stepped.
    return String(Math.round(value * 10000) / 10000);
  }
  if (field.type === "bool") return value ? "1" : "0";
  return String(value);
}

function parseOne(field, raw) {
  // Treat missing and empty-string the same so `?tax=` doesn't read as false.
  if (raw == null || raw === "") return undefined;
  if (field.type === "num") {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return undefined;
    if (field.min !== undefined && n < field.min) return field.min;
    if (field.max !== undefined && n > field.max) return field.max;
    return n;
  }
  if (field.type === "bool") return raw === "1";
  if (field.type === "enum") {
    return field.options.includes(raw) ? raw : undefined;
  }
  return raw;
}

export function serializeStateToParams(state) {
  const params = new URLSearchParams();
  for (const field of SCHEMA) {
    params.set(field.url, serializeOne(field, state[field.key]));
  }
  return params;
}

// Returns a partial state object — only keys that parsed successfully
// are included. Caller spreads this over DEFAULT_STATE to fill gaps.
export function parseStateFromParams(params) {
  const out = {};
  for (const field of SCHEMA) {
    const parsed = parseOne(field, params.get(field.url));
    if (parsed !== undefined) out[field.key] = parsed;
  }
  return out;
}

// Clamp claimAge to the mode-appropriate range. Done as a post-process
// step because the bounds depend on another parsed field (`mode`).
// Exported for testability — the production caller is getInitialStateFromUrl
// below, which can't run in the node test env (no window).
export function clampClaimAge(state) {
  const clamped = clampClaimAgeToBounds(state.mode, state.claimAge);
  if (clamped === state.claimAge) return state;
  return { ...state, claimAge: clamped };
}

// Read the current page URL and merge over defaults. Safe to call during
// React's initial render — returns plain defaults when there's no window
// (SSR, tests not running in jsdom).
export function getInitialStateFromUrl() {
  if (typeof window === "undefined") return { ...DEFAULT_STATE };
  const merged = {
    ...DEFAULT_STATE,
    ...parseStateFromParams(new URLSearchParams(window.location.search)),
  };
  return clampClaimAge(merged);
}
