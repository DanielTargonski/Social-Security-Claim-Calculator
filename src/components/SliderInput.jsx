import { useState } from "react";
import { C } from "../constants/colors.js";

// A click-to-edit number slider. Clicking the displayed value swaps the label
// for a number input so the user can type an exact value (e.g. claim age 64.3).
// Used for every numeric input in the calculator.
//
// `typeMin` / `typeMax` (optional) widen the bounds for typed values only —
// the slider stays at min/max for easy maneuvering, but power users can type
// values outside that visible range. When omitted they fall back to min/max.
//
// `editToString` / `parseEdit` (optional) let the caller drive the click-to-edit
// in a different unit than the underlying value. Used by the invest sliders to
// offer a "$" mode where the user types a dollar amount but the stored value
// stays as a percentage. When omitted they fall back to plain numeric editing
// clamped to editMin/editMax. `parseEdit` returns `null` to cancel the commit.
export default function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
  hint,
  typeMin,
  typeMax,
  // Optional inline content rendered in the header row between the label
  // and the value display. Used by the claim-age slider to show its small
  // "→ optimal NN yr · +$X" call-to-action right next to the label so the
  // user sees it without scrolling down to the deeper Optimal panel.
  accessory,
  editToString,
  parseEdit,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const editMin = typeMin ?? min;
  const editMax = typeMax ?? max;

  const startEdit = () => {
    setDraft(editToString ? editToString(value) : String(value));
    setEditing(true);
  };

  const commit = () => {
    if (parseEdit) {
      const next = parseEdit(draft);
      if (next != null) onChange(next);
    } else {
      const parsed = parseFloat(draft);
      if (!Number.isNaN(parsed)) {
        const clamped = Math.min(editMax, Math.max(editMin, parsed));
        onChange(clamped);
      }
    }
    setEditing(false);
  };

  // Fraction of the track that's filled, driving the accent fill via the
  // --pct custom property (see input[type="range"] in GlobalStyles).
  //
  // The native range thumb snaps to the nearest `step` (measured from `min`),
  // so a value that lands off that grid — e.g. a $-mode invest amount that maps
  // to 66.67% on a 5%-step slider — renders the thumb at the snapped position
  // (65%) while the raw value is 66.67%. Computing the fill from the raw value
  // then overshoots the thumb. Snap the fill to the same grid so the green fill
  // ends exactly at the thumb. No-op for sliders whose values are already
  // on-grid (benefits, ages, rates). The big value label still shows the exact
  // typed value — only the track geometry snaps.
  const snappedValue =
    step > 0 ? min + Math.round((value - min) / step) * step : value;
  const pct = max > min ? ((snappedValue - min) / (max - min)) * 100 : 0;
  const clampedPct = Math.min(100, Math.max(0, pct));

  return (
    <div>
      <div className="flex justify-between items-baseline mb-2 gap-3">
        <div className="flex items-baseline gap-3 min-w-0">
          <label
            className="text-xs tracking-widest uppercase"
            style={{ color: C.inkSoft, letterSpacing: "0.12em" }}
          >
            {label}
          </label>
          {accessory}
        </div>
        {editing ? (
          <input
            type="number"
            autoFocus
            className="num"
            value={draft}
            min={parseEdit ? undefined : editMin}
            max={parseEdit ? undefined : editMax}
            step={parseEdit ? "any" : step}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") setEditing(false);
            }}
            style={{
              color: C.ink,
              fontWeight: 600,
              backgroundColor: C.surface,
              border: `1px solid ${C.accent}`,
              borderRadius: "var(--radius-sm)",
              padding: "3px 10px",
              width: "9rem",
              textAlign: "right",
              fontSize: "1.125rem",
              outline: "none",
            }}
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="num"
            title="Click to type an exact value"
            style={{
              color: C.ink,
              fontWeight: 600,
              background: "transparent",
              border: `1px solid transparent`,
              padding: "3px 8px",
              margin: "-3px -8px",
              cursor: "text",
              fontSize: "1.125rem",
              borderRadius: "var(--radius-sm)",
              fontFamily: "inherit",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = C.surface)}
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            {format(value)}
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", "--pct": `${clampedPct}%` }}
      />
      <div
        className="flex justify-between mt-1 text-xs num"
        style={{ color: C.inkFaint }}
      >
        <span>{format(min)}</span>
        {hint && <span style={{ color: C.inkSoft }}>{hint}</span>}
        <span>{format(max)}</span>
      </div>
    </div>
  );
}
