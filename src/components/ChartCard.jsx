import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { FRA, fmtMoney, fmtBig, fmtAge } from "../lib/benefitMath.js";
import { C } from "../constants/colors.js";
import Var from "./Var.jsx";

// The main chart card: lifetime payout lines (early / pot / wait) plus the
// four-card row at the bottom (pot at investStop, pot at lifeExpectancy,
// total at lifeExpectancy for early, net advantage). Owns no state — every
// number it displays is computed by computeProjection upstream.
export default function ChartCard({
  claimAge,
  investStopAge,
  lifeExpectancy,
  returnRate,
  taxesActive,
  chartData,
  breakEvenAge,
  potAtStopRow,
  finalPot,
  finalEarly,
  advantage,
}) {
  return (
    <div
      className="p-6 md:p-7"
      style={{
        backgroundColor: C.paper,
        border: `1px solid ${C.border}`,
      }}
    >
      <div className="flex justify-between items-end mb-6 flex-wrap gap-3">
        <div>
          <h3 className="display text-xl" style={{ color: C.ink }}>
            <em>Total dollars in hand</em>
          </h3>
          <p className="text-xs mt-1 max-w-md" style={{ color: C.inkSoft }}>
            Net of federal tax {taxesActive ? "and earnings test " : ""}·{" "}
            {returnRate > 0 ? (
              <>
                Invested pot until <Var>{investStopAge}</Var>, then enjoyed as
                income · <Var>{returnRate.toFixed(1)}%</Var> real (after
                inflation)
              </>
            ) : (
              <>
                Checks set aside until <Var>{investStopAge}</Var>, then enjoyed
                as income · 0% real return (after inflation)
              </>
            )}
          </p>
        </div>
        <div className="flex gap-4 text-xs num flex-wrap">
          <div className="flex items-center gap-2">
            <div
              style={{
                width: "18px",
                height: "2px",
                backgroundColor: C.early,
              }}
            />
            <span style={{ color: C.ink }}>Claim at {fmtAge(claimAge)}</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="20" height="4">
              <line
                x1="0"
                y1="2"
                x2="20"
                y2="2"
                stroke={C.earlySoft}
                strokeWidth="1.75"
                strokeDasharray="5 4"
              />
            </svg>
            <span style={{ color: C.ink }}>
              {returnRate > 0 ? "Invested pot only" : "Set-aside checks only"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              style={{
                width: "18px",
                height: "2px",
                backgroundColor: C.wait,
              }}
            />
            <span style={{ color: C.ink }}>Wait until 67</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              style={{
                width: "18px",
                height: "2px",
                backgroundColor: C.waitInvested,
              }}
            />
            <span style={{ color: C.ink }}>Wait + invest</span>
          </div>
        </div>
      </div>

      <div style={{ height: "400px", marginLeft: "-10px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 25, bottom: 25, left: 10 }}
          >
            <CartesianGrid
              stroke={C.border}
              strokeDasharray="2 4"
              vertical={false}
            />
            <XAxis
              dataKey="age"
              type="number"
              domain={["dataMin", "dataMax"]}
              stroke={C.inkSoft}
              tick={{
                fontSize: 11,
                fontFamily: "JetBrains Mono",
                fill: C.inkSoft,
              }}
              tickFormatter={(v) => Math.round(v)}
              allowDecimals={false}
              tickCount={8}
              label={{
                value: "AGE",
                position: "insideBottom",
                offset: -8,
                fontSize: 10,
                fill: C.inkFaint,
                letterSpacing: "0.2em",
                fontFamily: "JetBrains Mono",
              }}
            />
            <YAxis
              stroke={C.inkSoft}
              tick={{
                fontSize: 11,
                fontFamily: "JetBrains Mono",
                fill: C.inkSoft,
              }}
              tickFormatter={(v) =>
                v >= 1_000_000
                  ? "$" + (v / 1_000_000).toFixed(1) + "M"
                  : "$" + (v / 1000).toFixed(0) + "K"
              }
            />
            <Tooltip
              contentStyle={{
                backgroundColor: C.bg,
                border: `1px solid ${C.ink}`,
                borderRadius: 0,
                fontFamily: "JetBrains Mono",
                fontSize: 12,
                padding: "10px 12px",
              }}
              labelStyle={{
                color: C.ink,
                fontWeight: 600,
                marginBottom: 4,
              }}
              labelFormatter={(v) => `Age ${fmtAge(Number(v))}`}
              formatter={(value, name) => {
                const labelMap = {
                  early: `Claim at ${fmtAge(claimAge)}`,
                  pot: returnRate > 0 ? "Invested pot" : "Set-aside checks",
                  wait: "Wait to 67",
                  waitInvested: "Wait + invest",
                };
                return [fmtMoney(value), labelMap[name] || name];
              }}
            />
            <ReferenceLine
              x={FRA}
              stroke={C.inkFaint}
              strokeWidth={1}
              strokeDasharray="3 3"
              label={{
                value: "FRA 67",
                fill: C.inkFaint,
                fontSize: 10,
                fontFamily: "JetBrains Mono",
                position: "top",
              }}
            />
            {breakEvenAge && (
              <ReferenceLine
                x={breakEvenAge}
                stroke={C.cross}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: `↓ Crossover ${fmtAge(breakEvenAge)}`,
                  fill: C.cross,
                  fontSize: 11,
                  fontFamily: "JetBrains Mono",
                  fontWeight: 600,
                  position: "top",
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="early"
              stroke={C.early}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={true}
              animationDuration={600}
            />
            <Line
              type="monotone"
              dataKey="pot"
              stroke={C.earlySoft}
              strokeWidth={1.75}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={true}
              animationDuration={600}
            />
            <Line
              type="monotone"
              dataKey="wait"
              stroke={C.wait}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={true}
              animationDuration={600}
            />
            <Line
              type="monotone"
              dataKey="waitInvested"
              stroke={C.waitInvested}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={true}
              animationDuration={600}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div
        className="mt-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-5"
        style={{ borderTop: `1px solid ${C.border}` }}
      >
        <div>
          <div
            className="text-xs uppercase mb-1"
            style={{ color: C.inkFaint, letterSpacing: "0.15em" }}
          >
            Pot at {investStopAge}
          </div>
          <div
            className="num"
            style={{
              color: C.earlySoft,
              fontSize: "1.5rem",
              fontWeight: 500,
            }}
          >
            {fmtBig(potAtStopRow)}
          </div>
        </div>
        <div>
          <div
            className="text-xs uppercase mb-1"
            style={{ color: C.inkFaint, letterSpacing: "0.15em" }}
          >
            Pot at {fmtAge(lifeExpectancy)}
          </div>
          <div
            className="num"
            style={{
              color: C.earlySoft,
              fontSize: "1.5rem",
              fontWeight: 500,
            }}
          >
            {fmtBig(finalPot)}
          </div>
        </div>
        <div>
          <div
            className="text-xs uppercase mb-1"
            style={{ color: C.inkFaint, letterSpacing: "0.15em" }}
          >
            Total at {fmtAge(lifeExpectancy)} · Early
          </div>
          <div
            className="num"
            style={{
              color: C.early,
              fontSize: "1.5rem",
              fontWeight: 500,
            }}
          >
            {fmtBig(finalEarly)}
          </div>
        </div>
        <div>
          <div
            className="text-xs uppercase mb-1"
            style={{
              color: C.inkFaint,
              letterSpacing: "0.15em",
              whiteSpace: "nowrap",
            }}
          >
            Net advantage at {fmtAge(lifeExpectancy)}
          </div>
          <div
            className="num"
            style={{
              color: advantage >= 0 ? C.early : C.wait,
              fontSize: "1.5rem",
              fontWeight: 500,
            }}
          >
            {advantage >= 0 ? "+" : "−"}
            {fmtBig(Math.abs(advantage))}
          </div>
          <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
            {advantage >= 0 ? "early wins" : "wait wins"}
          </div>
        </div>
      </div>
    </div>
  );
}
