import { useMemo } from "react";
import { computeProjection, fmtBig } from "../lib/benefitMath.js";
import { C } from "../constants/colors.js";

// One sensitivity variable. Each entry:
//   key:          which input field to perturb
//   label:        UI label
//   delta:        symmetric perturbation around the current value
//   formatValue:  formatter for displaying the swept value at each end
//                 (must handle undefined gracefully)
//   bounds:       (inputs) => {min, max} hard limits to clamp the perturbation
//   showInModes:  array of modes this variable applies to
function makeVariables(inputs) {
  let earliest, latest;
  if (inputs.mode === "retirement") {
    earliest = 62;
    latest = 70;
  } else if (inputs.mode === "survivor") {
    earliest = 60;
    latest = 67;
  } else {
    earliest = 62;
    latest = 66.5;
  }

  return [
    {
      key: "claimAge",
      label: "Claim age",
      delta: 2,
      formatValue: (v) => `age ${Number(v).toFixed(1).replace(/\.0$/, "")}`,
      bounds: () => ({ min: earliest, max: latest }),
      showInModes: ["retirement", "survivor", "switch"],
    },
    {
      key: "lifeExpectancy",
      label: "Life expectancy",
      delta: 5,
      formatValue: (v) => `age ${Math.round(Number(v))}`,
      bounds: () => ({ min: 70, max: 100 }),
      showInModes: ["retirement", "survivor", "switch"],
    },
    {
      key: "returnRate",
      label: "Real return rate",
      delta: 2,
      formatValue: (v) => Number(v).toFixed(1) + "%",
      bounds: () => ({ min: 0, max: 10 }),
      showInModes: ["retirement", "survivor", "switch"],
    },
    {
      key: "grossIncome",
      label: "Gross wage income",
      delta: 20000,
      formatValue: (v) => "$" + Math.round(Number(v) / 1000) + "K",
      bounds: () => ({ min: 0, max: 500000 }),
      showInModes: ["retirement", "survivor", "switch"],
    },
    {
      key: "investStopAge",
      label: "Stop investing at age",
      delta: 3,
      formatValue: (v) => `age ${Math.round(Number(v))}`,
      bounds: () => ({ min: Math.max(60, Math.ceil(inputs.claimAge)), max: 85 }),
      showInModes: ["retirement", "survivor", "switch"],
    },
    {
      key: "fraBenefit",
      label: "Benefit at 67",
      delta: 300,
      formatValue: (v) => "$" + Math.round(Number(v)).toLocaleString() + "/mo",
      bounds: () => ({ min: 500, max: 5000 }),
      showInModes: ["retirement", "survivor", "switch"],
    },
    {
      key: "ownBenefit",
      label: "Own retirement at 67",
      delta: 200,
      formatValue: (v) => "$" + Math.round(Number(v)).toLocaleString() + "/mo",
      bounds: () => ({ min: 300, max: 4000 }),
      showInModes: ["switch"],
    },
  ];
}

// Apply +/- delta to a single field, clamped to its bounds. Always returns
// a fully-formed inputs object — if the perturbation collapsed back to the
// current value, the projection result will simply equal the baseline.
function perturb(inputs, variable, deltaSigned) {
  const { min, max } = variable.bounds(inputs);
  const proposed = inputs[variable.key] + deltaSigned;
  const clamped = Math.min(max, Math.max(min, proposed));
  return { ...inputs, [variable.key]: clamped };
}

function getOutputForMode(projection, mode) {
  if (mode === "switch") {
    // The switch strategy's headline is the upside (pot at switch age).
    // It's never net-negative, so "advantage" isn't the right metric here.
    return projection.potAtStopRow;
  }
  // Retirement / survivor: how much more (or less) you end up with at lifeExpectancy
  // by claiming early-and-investing vs. waiting until 67.
  return projection.advantage;
}

function getOutputLabelForMode(mode, lifeExpectancy) {
  if (mode === "switch") return "Invested pot at switch age";
  return `Net lifetime advantage at age ${lifeExpectancy}`;
}

export default function SensitivityTornado({ inputs }) {
  const data = useMemo(() => {
    const baseline = computeProjection(inputs);
    const baselineOutput = getOutputForMode(baseline, inputs.mode);
    const variables = makeVariables(inputs).filter((v) =>
      v.showInModes.includes(inputs.mode)
    );

    const rows = [];
    for (const v of variables) {
      const lowInputs = perturb(inputs, v, -v.delta);
      const highInputs = perturb(inputs, v, +v.delta);
      const lowValue = lowInputs[v.key];
      const highValue = highInputs[v.key];

      // Skip variables where neither side actually moved (both bounds collapsed)
      if (lowValue === inputs[v.key] && highValue === inputs[v.key]) continue;

      const lowOutput =
        lowValue === inputs[v.key]
          ? baselineOutput
          : getOutputForMode(computeProjection(lowInputs), inputs.mode);
      const highOutput =
        highValue === inputs[v.key]
          ? baselineOutput
          : getOutputForMode(computeProjection(highInputs), inputs.mode);

      const minOutput = Math.min(lowOutput, highOutput);
      const maxOutput = Math.max(lowOutput, highOutput);
      const swing = maxOutput - minOutput;

      // Which input value corresponds to the min vs max output
      const minSideValue = lowOutput < highOutput ? lowValue : highValue;
      const maxSideValue = lowOutput < highOutput ? highValue : lowValue;

      rows.push({
        label: v.label,
        formatValue: v.formatValue,
        minOutput,
        maxOutput,
        swing,
        minSideValue,
        maxSideValue,
        deltaMin: minOutput - baselineOutput, // ≤ 0
        deltaMax: maxOutput - baselineOutput, // ≥ 0
      });
    }

    rows.sort((a, b) => b.swing - a.swing);

    const globalMax = Math.max(
      ...rows.map((r) => Math.max(Math.abs(r.deltaMin), Math.abs(r.deltaMax))),
      1 // avoid divide-by-zero
    );

    return { baseline, baselineOutput, rows, globalMax };
  }, [
    inputs.mode,
    inputs.fraBenefit,
    inputs.ownBenefit,
    inputs.claimAge,
    inputs.returnRate,
    inputs.investStopAge,
    inputs.lifeExpectancy,
    inputs.grossIncome,
    inputs.postFRAGrossIncome,
    inputs.autoTax,
    inputs.manualFedRate,
  ]);

  const { baselineOutput, rows, globalMax } = data;

  if (!rows.length) return null;

  const outputLabel = getOutputLabelForMode(inputs.mode, inputs.lifeExpectancy);

  return (
    <div
      className="mt-5 p-6 md:p-7"
      style={{
        backgroundColor: C.paper,
        border: `1px solid ${C.border}`,
      }}
    >
      <div className="flex justify-between items-end mb-2 flex-wrap gap-3">
        <div>
          <h3 className="display text-xl" style={{ color: C.ink }}>
            <em>What moves the answer</em>
          </h3>
          <p
            className="text-xs mt-1 max-w-md"
            style={{ color: C.inkSoft }}
          >
            How much {outputLabel.toLowerCase()} changes if that one input alone shifts. Longer bar = answer depends more on that input.
          </p>
        </div>
        <div className="text-right">
          <div
            className="num text-xs uppercase"
            style={{ color: C.inkFaint, letterSpacing: "0.15em" }}
          >
            Baseline
          </div>
          <div
            className="num"
            style={{
              color: baselineOutput >= 0 ? C.early : C.wait,
              fontSize: "1.5rem",
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            {baselineOutput >= 0 ? "+" : "−"}
            {fmtBig(Math.abs(baselineOutput))}
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {rows.map((row) => {
          // Each side gets up to 50% of the row width; scaled to the largest swing in the panel
          const leftPct = (Math.abs(row.deltaMin) / globalMax) * 50;
          const rightPct = (Math.abs(row.deltaMax) / globalMax) * 50;

          return (
            <div key={row.label} className="grid grid-cols-12 items-center gap-3 text-xs">
              <div
                className="col-span-3 num uppercase truncate"
                style={{ color: C.inkSoft, letterSpacing: "0.1em" }}
                title={row.label}
              >
                {row.label}
              </div>

              <div
                className="col-span-1 num text-right"
                style={{ color: C.inkFaint }}
              >
                {row.formatValue(row.minSideValue)}
              </div>

              {/* Bar track — center vertical line is the baseline */}
              <div className="col-span-7 relative h-7" style={{ backgroundColor: "transparent" }}>
                {/* axis line */}
                <div
                  className="absolute top-0 bottom-0"
                  style={{
                    left: "50%",
                    width: "1px",
                    backgroundColor: C.borderDark,
                  }}
                />
                {/* left (negative-impact) bar */}
                <div
                  className="absolute top-1 bottom-1"
                  style={{
                    right: "50%",
                    width: `${leftPct}%`,
                    backgroundColor: C.early,
                    opacity: 0.85,
                  }}
                  title={`${row.formatValue(row.minSideValue)} → ${
                    row.minOutput >= 0 ? "+" : "−"
                  }${fmtBig(Math.abs(row.minOutput))}`}
                />
                {/* right (positive-impact) bar */}
                <div
                  className="absolute top-1 bottom-1"
                  style={{
                    left: "50%",
                    width: `${rightPct}%`,
                    backgroundColor: C.wait,
                    opacity: 0.85,
                  }}
                  title={`${row.formatValue(row.maxSideValue)} → ${
                    row.maxOutput >= 0 ? "+" : "−"
                  }${fmtBig(Math.abs(row.maxOutput))}`}
                />
              </div>

              <div
                className="col-span-1 num"
                style={{ color: C.inkFaint }}
              >
                {row.formatValue(row.maxSideValue)}
              </div>
            </div>
          );
        })}
      </div>

      <div
        className="mt-5 pt-4 flex justify-between items-center text-xs"
        style={{ borderTop: `1px solid ${C.border}`, color: C.inkFaint }}
      >
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <div
              style={{
                width: "16px",
                height: "8px",
                backgroundColor: C.early,
                opacity: 0.85,
              }}
            />
            <span>worse outcome</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              style={{
                width: "16px",
                height: "8px",
                backgroundColor: C.wait,
                opacity: 0.85,
              }}
            />
            <span>better outcome</span>
          </div>
        </div>
        <div className="num" style={{ letterSpacing: "0.1em" }}>
          full bar = ±{fmtBig(globalMax)}
        </div>
      </div>
    </div>
  );
}
