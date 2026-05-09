import { useState } from "react";
import { C } from "../constants/colors.js";

// A click-to-edit number slider. Clicking the displayed value swaps the label
// for a number input so the user can type an exact value (e.g. claim age 64.3).
// Used for every numeric input in the calculator.
//
// `typeMin` / `typeMax` (optional) widen the bounds for typed values only —
// the slider stays at min/max for easy maneuvering, but power users can type
// values outside that visible range. When omitted they fall back to min/max.
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
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const editMin = typeMin ?? min;
  const editMax = typeMax ?? max;

  const startEdit = () => {
    setDraft(String(value));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseFloat(draft);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.min(editMax, Math.max(editMin, parsed));
      onChange(clamped);
    }
    setEditing(false);
  };

  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <label
          className="text-xs tracking-widest uppercase"
          style={{ color: C.inkSoft, letterSpacing: "0.12em" }}
        >
          {label}
        </label>
        {editing ? (
          <input
            type="number"
            autoFocus
            className="num"
            value={draft}
            min={editMin}
            max={editMax}
            step={step}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") setEditing(false);
            }}
            style={{
              color: C.ink,
              fontWeight: 500,
              backgroundColor: C.bg,
              border: `1px solid ${C.borderDark}`,
              padding: "2px 8px",
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
            className="num text-lg"
            title="Click to type an exact value"
            style={{
              color: C.ink,
              fontWeight: 500,
              background: "transparent",
              border: "none",
              padding: "2px 6px",
              margin: "-2px -6px",
              cursor: "text",
              fontSize: "1.125rem",
              borderBottom: `1px dashed ${C.borderDark}`,
              fontFamily: "inherit",
            }}
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
        style={{ width: "100%" }}
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
