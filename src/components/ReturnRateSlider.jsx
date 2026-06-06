import SliderInput from "./SliderInput.jsx";

// The "annual real return" knob, shared by the Inputs panel and the two
// comparison cards (StrategyCompare, WageCompare). Pulling it into one place
// keeps the bounds (0-10%), the 0.5% step, the "X.X%" formatting, and the
// "real = after inflation" explainer identical wherever the rate can be
// changed — so nudging it from inside a card is exactly the same control the
// user finds up in the inputs, and the three can't drift apart.
//
// "Real" is finance jargon for "after inflation"; the explainer lives in the
// slider's hint so it's visible the first time the user meets the term, not
// buried in a footnote. The label is deliberately fixed (not a prop): keeping
// it identical everywhere is the whole point of sharing this control. Renders
// only the SliderInput — callers wrap it in whatever container fits their
// layout.
export default function ReturnRateSlider({ value, onChange }) {
  return (
    <SliderInput
      label="Annual real return invested"
      value={value}
      onChange={onChange}
      min={0}
      max={10}
      step={0.5}
      format={(v) => v.toFixed(1) + "%"}
      hint={
        value === 7 ? "after inflation · S&P 500 historical" : "after inflation"
      }
    />
  );
}
