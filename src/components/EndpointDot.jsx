import { fmtBig } from "../lib/benefitMath.js";
import { C } from "../constants/colors.js";

// Factory for a recharts `<Line dot={...}>` renderer that draws ONLY at the
// final data point: a small anchor dot plus that line's final dollar total set
// just to its right, returning null for every other point so the rest of the
// line stays dot-free. This pins each line's answer ("$798K") at its end — the
// live-until age — so the chart states the result without a hover.
//
// Shared by the head-to-head comparison charts (StrategyCompare, WageCompare)
// so the endpoint-label style lives in one place. Each caller supplies the
// final sample's index and row, then calls the returned factory per line with
// (dataKey, color, dy) — dy lets converging lines stagger their labels so they
// stay legible when the totals are nearly equal.
export function makeEndpointDot({ lastIdx, lastRow }) {
  return (dataKey, color, dy) => (props) => {
    const { cx, cy, index } = props;
    if (index !== lastIdx || cx == null || cy == null) return null;
    const value = lastRow?.[dataKey];
    if (value == null) return null;
    return (
      <g key={`end-${dataKey}`} style={{ pointerEvents: "none" }}>
        <circle
          cx={cx}
          cy={cy}
          r={3.5}
          fill={color}
          stroke={C.paper}
          strokeWidth={1.5}
        />
        <text
          x={cx + 8}
          y={cy}
          dy={dy}
          textAnchor="start"
          fill={color}
          fontSize={12}
          fontWeight={700}
          fontFamily="JetBrains Mono"
        >
          {fmtBig(value)}
        </text>
      </g>
    );
  };
}
