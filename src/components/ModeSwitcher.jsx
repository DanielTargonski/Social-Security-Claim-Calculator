import { C } from "../constants/colors.js";
import Segment from "./Segment.jsx";

// Concise label + one-line summary for each mode, echoed under the picker so
// the active selection is unmistakable at a glance (the pill fill alone reads
// as too subtle against the dark track).
const MODE_META = {
  retirement: {
    label: "Retirement",
    blurb: "Claiming your own retirement benefit between 62 and 70.",
  },
  survivor: {
    label: "Survivor (Spouse)",
    blurb: "Claiming a survivor benefit between 60 and 67.",
  },
  switch: {
    label: "Own → Survivor",
    blurb: "Claiming your own benefit early, then switching to survivor at FRA.",
  },
};

// Three-way mode picker (Retirement / Survivor / Switch). Includes the
// explanatory banner that appears when "switch" is selected, since the banner
// only ever co-occurs with this picker.
export default function ModeSwitcher({ mode, onChange }) {
  const active = MODE_META[mode];
  return (
    <>
      <Segment
        className="mb-4"
        value={mode}
        onChange={onChange}
        options={Object.keys(MODE_META).map((key) => ({
          key,
          label: MODE_META[key].label,
        }))}
      />

      <div className={`mode-active ${mode === "switch" ? "mb-4" : "mb-6"}`}>
        <span className="mode-active-chip">
          <span className="mode-chip-dot" />
          {active.label}
        </span>
        {mode !== "switch" && (
          <span className="mode-active-blurb">{active.blurb}</span>
        )}
      </div>

      {mode === "switch" && (
        <div
          className="card mb-6 p-4 text-xs leading-relaxed"
          style={{
            borderLeft: `3px solid ${C.cross}`,
            color: C.inkSoft,
          }}
        >
          <span
            className="display"
            style={{ color: C.ink, fontSize: "13px" }}
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
