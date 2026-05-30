import { C } from "../constants/colors.js";

// Single inline <style> block for the calculator. Lives at the App root so
// these classes (.num, .display, .card, .mode-btn, range-input styling, etc.)
// are available everywhere. Google Fonts are imported here too, intentionally
// — keeps the calculator's font assets self-contained.
//
// Type system: Inter for UI + headings (the de-facto modern-fintech sans),
// JetBrains Mono for every numeral (tabular figures read as a clean ledger).
export default function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&family=JetBrains+Mono:wght@400;500;600;700&display=swap');

      :root { --pct: 0%; }

      html { -webkit-text-size-adjust: 100%; }
      body {
        background: ${C.bg};
        color: ${C.ink};
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        font-feature-settings: "cv05", "ss01";
      }

      /* Numerals — tabular so columns of figures align. */
      .num {
        font-family: 'JetBrains Mono', ui-monospace, monospace;
        font-feature-settings: "tnum";
        font-variant-numeric: tabular-nums;
      }
      /* Display / heading face — clean bold Inter. The codebase wraps heading
         text in <em>; neutralize the italic so headings read upright. */
      .display {
        font-family: 'Inter', system-ui, sans-serif;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .display em { font-style: normal; }

      /* ── Card ────────────────────────────────────────────────────────── */
      .card {
        background: ${C.paper};
        border: 1px solid ${C.border};
        border-radius: var(--radius);
        box-shadow: var(--shadow-sm);
      }
      .card-flat {
        background: ${C.surface};
        border: 1px solid ${C.border};
        border-radius: var(--radius);
      }

      /* ── Range slider — filled track via --pct + floating thumb ───────── */
      input[type="range"] {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        border-radius: 999px;
        background-color: ${C.track};
        background-image: linear-gradient(${C.accent}, ${C.accent});
        background-size: var(--pct, 0%) 100%;
        background-repeat: no-repeat;
        outline: none;
        cursor: pointer;
      }
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 18px; height: 18px;
        margin-top: 0;
        background: ${C.accent};
        cursor: pointer;
        border-radius: 50%;
        border: 3px solid ${C.paper};
        box-shadow: 0 0 0 1px ${C.borderDark}, 0 1px 4px rgba(15,23,41,0.25);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.12); }
      input[type="range"]:focus-visible::-webkit-slider-thumb { box-shadow: var(--ring); }
      input[type="range"]::-moz-range-thumb {
        width: 18px; height: 18px;
        background: ${C.accent};
        cursor: pointer;
        border-radius: 50%;
        border: 3px solid ${C.paper};
        box-shadow: 0 0 0 1px ${C.borderDark}, 0 1px 4px rgba(15,23,41,0.25);
      }

      /* ── Segmented control (mode + tab pickers) ───────────────────────── */
      .segment {
        display: inline-flex;
        gap: 2px;
        padding: 4px;
        background: ${C.surface};
        border: 1px solid ${C.border};
        border-radius: var(--radius-pill);
      }
      .mode-btn {
        padding: 7px 16px;
        font-size: 13px;
        font-weight: 500;
        font-family: 'Inter', system-ui, sans-serif;
        letter-spacing: -0.01em;
        line-height: 1;
        transition: all 0.18s ease;
        background: transparent;
        border: none;
        border-radius: var(--radius-pill);
        cursor: pointer;
        color: ${C.inkSoft};
        white-space: nowrap;
      }
      .mode-btn:not(.mode-btn-active):hover { color: ${C.ink}; background: ${C.paper}; }
      .mode-btn-active {
        background: ${C.paper};
        color: ${C.ink};
        font-weight: 600;
        box-shadow: var(--shadow-sm);
      }

      /* ── Ghost / pill buttons (share link, theme toggle) ───────────────── */
      .pill-btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 8px 14px;
        font-size: 12.5px;
        font-weight: 500;
        font-family: 'Inter', system-ui, sans-serif;
        background: ${C.paper};
        border: 1px solid ${C.border};
        border-radius: var(--radius-pill);
        color: ${C.inkSoft};
        cursor: pointer;
        transition: all 0.18s ease;
        box-shadow: var(--shadow-sm);
      }
      .pill-btn:hover { color: ${C.ink}; border-color: ${C.borderDark}; }
      .share-link-btn { /* alias kept for component clarity */ }
      .share-link-btn.copied,
      .share-link-btn.copied:hover {
        background: ${C.wait};
        border-color: ${C.wait};
        color: #fff;
      }

      /* ── Primary CTA ───────────────────────────────────────────────────── */
      .btn-primary {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 9px 18px;
        font-size: 13px;
        font-weight: 600;
        font-family: 'Inter', system-ui, sans-serif;
        background: ${C.accent};
        border: 1px solid ${C.accent};
        border-radius: var(--radius-pill);
        color: #fff;
        cursor: pointer;
        transition: filter 0.18s ease, transform 0.05s ease;
        box-shadow: var(--shadow-sm);
      }
      .btn-primary:hover { filter: brightness(1.08); }
      .btn-primary:active { transform: translateY(1px); }

      /* Small toggle chips (Auto, Covered elsewhere, locality, % / $). */
      .chip-toggle {
        font-size: 11px;
        font-weight: 500;
        font-family: 'Inter', system-ui, sans-serif;
        letter-spacing: 0;
        padding: 5px 11px;
        border-radius: var(--radius-pill);
        border: 1px solid ${C.border};
        background: ${C.surface};
        color: ${C.inkSoft};
        cursor: pointer;
        transition: all 0.16s ease;
      }
      .chip-toggle:hover { border-color: ${C.borderDark}; color: ${C.ink}; }
      .chip-toggle-active {
        background: ${C.accent};
        border-color: ${C.accent};
        color: #fff;
      }
      .chip-toggle-active:hover { color: #fff; filter: brightness(1.06); }

      /* ── Section label — small caps with an accent tick ────────────────── */
      .section-divider {
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: ${C.inkFaint};
        padding-bottom: 2px;
      }
      .section-divider::before {
        content: "";
        width: 6px; height: 6px;
        border-radius: 2px;
        background: ${C.accent};
        flex: none;
      }

      .attribution-link {
        text-decoration: none;
        border-bottom: 1px solid transparent;
        transition: color 0.18s ease, border-color 0.18s ease;
      }
      .attribution-link:hover {
        color: ${C.ink} !important;
        border-bottom-color: ${C.accent};
      }

      /* Global focus ring for keyboard users. */
      :focus-visible {
        outline: none;
        box-shadow: var(--ring);
        border-radius: var(--radius-sm);
      }

      /* Inline glossary term + hover/focus tooltip (see Term.jsx). */
      .term {
        position: relative;
        border-bottom: 1px dotted currentColor;
        cursor: help;
        font-weight: 600;
        outline: none;
      }
      .term-tip {
        position: absolute;
        bottom: calc(100% + 9px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        z-index: 60;
        width: max-content;
        max-width: 250px;
        padding: 10px 12px;
        background: ${C.ink};
        color: ${C.paper};
        border-radius: var(--radius-sm);
        box-shadow: var(--shadow-lg);
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 12.5px;
        font-weight: 400;
        line-height: 1.5;
        letter-spacing: normal;
        text-transform: none;
        text-align: left;
        white-space: normal;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transition: opacity 0.16s ease, transform 0.16s ease, visibility 0.16s;
      }
      .term-tip-label {
        display: block;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .term-tip::after {
        content: "";
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        border: 5px solid transparent;
        border-top-color: ${C.ink};
      }
      .term:hover .term-tip,
      .term:focus .term-tip,
      .term:focus-visible .term-tip {
        opacity: 1;
        visibility: visible;
        transform: translateX(-50%) translateY(0);
      }
    `}</style>
  );
}
