import { useState } from "react";

// Shared click-to-edit state machine for the calculator's inline numeric fields
// (the wage what-ifs in WageCompare, the per-strategy invest amounts in
// StrategyCompare). It owns the editing/draft state and the commit/cancel
// keyboard handling so each field only supplies its own markup + formatting —
// the markup differs (an inline pill vs a labeled card), but the behavior is
// identical and was previously copy-pasted in both components (and is the same
// pattern SliderInput uses for its slider thumbs).
//
// Commits whole numbers (rounded) clamped to >= min; ignores non-numeric input.
// Rounding matters: every one of these fields takes whole-dollar amounts, so a
// stray "0.5" or "12k" should not leak a fractional/garbage value downstream
// (e.g. a 0.5 wage that escapes the "Not working" === 0 special case).
//
//   value     the current committed value (used to seed the draft on edit)
//   onCommit  called with the rounded, clamped number when the user commits
//   min       lower clamp (default 0)
//
// Returns { editing, draft, setDraft, startEdit, commit, cancel, inputProps }.
// Spread `inputProps` onto the <input> and add field-specific className / min /
// step / style; render the button (showing the formatted value) when not
// editing.
export function useClickToEditNumber({ value, onCommit, min = 0 }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(String(Math.round(value)));
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const commit = () => {
    const v = parseFloat(draft);
    if (!Number.isNaN(v)) onCommit(Math.max(min, Math.round(v)));
    setEditing(false);
  };

  // Behavior props shared by every inline-edit input. Field-specific props
  // (className, min, step, style) are added at the call site.
  const inputProps = {
    type: "number",
    autoFocus: true,
    value: draft,
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    onFocus: (e) => e.target.select(),
    onKeyDown: (e) => {
      if (e.key === "Enter") commit();
      else if (e.key === "Escape") cancel();
    },
  };

  return { editing, draft, setDraft, startEdit, commit, cancel, inputProps };
}
