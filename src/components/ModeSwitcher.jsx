import { C } from "../constants/colors.js";

// Three-way mode picker (Retirement / Survivor / Switch). Includes the
// explanatory banner that appears when "switch" is selected, since the banner
// only ever co-occurs with this picker.
export default function ModeSwitcher({ mode, onChange }) {
  return (
    <>
      <div
        className="inline-flex p-1 mb-6 flex-wrap"
        style={{
          backgroundColor: C.paper,
          border: `1px solid ${C.border}`,
        }}
      >
        <button
          onClick={() => onChange("retirement")}
          className={`mode-btn ${mode === "retirement" ? "mode-btn-active" : ""}`}
        >
          Retirement
        </button>
        <button
          onClick={() => onChange("survivor")}
          className={`mode-btn ${mode === "survivor" ? "mode-btn-active" : ""}`}
        >
          Survivor (Spouse)
        </button>
        <button
          onClick={() => onChange("switch")}
          className={`mode-btn ${mode === "switch" ? "mode-btn-active" : ""}`}
        >
          Own → Survivor
        </button>
      </div>

      {mode === "switch" && (
        <div
          className="mb-6 p-4 text-xs leading-relaxed"
          style={{
            backgroundColor: C.paper,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${C.cross}`,
            color: C.inkSoft,
          }}
        >
          <span
            className="display"
            style={{ color: C.ink, fontStyle: "italic", fontSize: "13px" }}
          >
            The survivor's switch.
          </span>{" "}
          Claim the claimant's own reduced retirement benefit early, invest those
          checks until 67, then switch to the full 100% survivor benefit at FRA.
          The own-retirement reduction is permanent on that record but irrelevant
          once they switch. The survivor benefit is unaffected by claiming the
          own benefit early.
        </div>
      )}
    </>
  );
}
