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

const SCHEMA = [
  { key: "mode",               url: "mode",  type: "enum", options: ["retirement", "survivor", "switch"], default: "retirement" },
  { key: "fraBenefit",         url: "fra",   type: "num",  default: 2500 },
  { key: "ownBenefit",         url: "own",   type: "num",  default: 1500 },
  { key: "claimAge",           url: "age",   type: "num",  default: 62 },
  { key: "returnRate",         url: "ret",   type: "num",  default: 7 },
  { key: "investStopAge",      url: "stop",  type: "num",  default: 67 },
  { key: "lifeExpectancy",     url: "life",  type: "num",  default: 85 },
  { key: "grossIncome",        url: "inc",   type: "num",  default: 0 },
  { key: "postFRAGrossIncome", url: "incp",  type: "num",  default: 0 },
  { key: "autoTax",            url: "tax",   type: "bool", default: true },
  { key: "manualFedRate",      url: "mrate", type: "num",  default: 12 },
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
    return Number.isFinite(n) ? n : undefined;
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

// Read the current page URL and merge over defaults. Safe to call during
// React's initial render — returns plain defaults when there's no window
// (SSR, tests not running in jsdom).
export function getInitialStateFromUrl() {
  if (typeof window === "undefined") return { ...DEFAULT_STATE };
  return {
    ...DEFAULT_STATE,
    ...parseStateFromParams(new URLSearchParams(window.location.search)),
  };
}
