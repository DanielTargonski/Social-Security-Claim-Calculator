import { C } from "../constants/colors.js";

// Two-tab nav at the very top of the page: the calculator itself, vs. the
// "Why this exists" explainer. Visually echoes the ModeSwitcher chip pattern
// so the two controls feel like part of the same family.
//
// Kept small and inline (no router): the project is single-page, the tab
// state lives in App.jsx and conditionally renders one of two subtrees.
export default function TabNav({ view, onChange }) {
  return (
    <div
      className="inline-flex gap-1.5 p-1 mb-6 flex-wrap"
      style={{
        backgroundColor: C.paper,
        border: `1px solid ${C.border}`,
      }}
    >
      <button
        type="button"
        onClick={() => onChange("calculator")}
        className={`mode-btn ${view === "calculator" ? "mode-btn-active" : ""}`}
      >
        Calculator
      </button>
      <button
        type="button"
        onClick={() => onChange("about")}
        className={`mode-btn ${view === "about" ? "mode-btn-active" : ""}`}
      >
        Why this exists
      </button>
    </div>
  );
}
