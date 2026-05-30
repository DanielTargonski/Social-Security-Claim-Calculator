// Three-tab nav at the very top of the page: the calculator itself, the
// "Why this exists" explainer, and the "The math" reference page. Visually
// echoes the ModeSwitcher chip pattern so the two controls feel like part
// of the same family.
//
// Kept small and inline (no router): the project is single-page, the tab
// state lives in App.jsx and conditionally renders one of three subtrees.
export default function TabNav({ view, onChange }) {
  return (
    <div className="segment flex-wrap">
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
      <button
        type="button"
        onClick={() => onChange("math")}
        className={`mode-btn ${view === "math" ? "mode-btn-active" : ""}`}
      >
        The math
      </button>
    </div>
  );
}
