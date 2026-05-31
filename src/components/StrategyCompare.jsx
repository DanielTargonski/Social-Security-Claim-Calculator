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

// Per-strategy chart/accent color. Mirrors the main chart's learned language:
// survivor-early reads like "claim early" (red, leads now), the switch reads
// like "wait for the bigger benefit" (green, leads later). Own-only is the
// neutral supplementary line.
const STRAT_COLOR = {
  survivor: C.early,
  switch: C.wait,
  own: C.inkFaint,
};

// Head-to-head comparison of the three claiming strategies a surviving spouse
// can choose between — survivor early, own->survivor switch, and own-only —
// all on the SAME inputs. Answers the question the three separate modes
// couldn't on their own: "is own->survivor better or worse than claiming
// survivor early?" Shown only in the survivor-context modes (survivor /
// switch); the retirement mode is for non-survivors and has no survivor
// benefit to compare against.
//
// Owns no state. Every number comes from compareStrategies upstream (via
// useStrategyCompare). Clicking a strategy switches the calculator into that
// mode so the user can drill into it with the full chart + panels.
export default function StrategyCompare({
  compare,
  mode,
  onSelectStrategy,
  lifeExpectancy,
}) {
  const { strategies, byKey, merged, verdict } = compare;
  const { primaryWinner, primaryMargin, crossover, switchEndsAhead } = verdict;

  const winnerLabel =
    primaryWinner === "switch" ? "Own → Survivor" : "Claiming survivor early";
  const lifeLabel = fmtAge(lifeExpectancy);

  // Crossover sentence. Three shapes depending on whether the lines actually
  // cross within the projected lifespan.
  const crossoverNote = crossover
    ? switchEndsAhead
      ? `The two lines cross at age ${fmtAge(
          crossover
        )} — claiming survivor early is ahead before then, Own → Survivor after. Live past ${fmtAge(
          crossover
        )} and the switch wins.`
      : `The lines cross at age ${fmtAge(crossover)}, but by ${lifeLabel} claiming survivor early is back ahead.`
    : switchEndsAhead
    ? "Own → Survivor leads at every age in this range."
    : "Claiming survivor early leads at every age in this range — the switch never catches up here.";

  return (
    <div id="strategy-compare" className="card mt-5 p-6 md:p-7" style={{ scrollMarginTop: "1rem" }}>
      <div className="mb-5">
        <h3 className="display text-xl" style={{ color: C.ink }}>
          <em>Survivor early vs Own → Survivor</em>
        </h3>
        <p className="text-xs mt-1 max-w-xl" style={{ color: C.inkSoft }}>
          The same inputs run through every claiming strategy, so the numbers
          line up side by side. Total dollars in hand at {lifeLabel} — invested
          pot plus checks collected. Tap a strategy to open it in the full
          calculator above.
        </p>
      </div>

      {/* Verdict banner — directly answers the question. */}
      <div
        className="card-flat p-4 md:p-5 mb-5"
        style={{
          borderLeft: `3px solid ${
            primaryWinner === "switch" ? C.wait : C.early
          }`,
        }}
      >
        <div
          className="text-xs uppercase mb-1"
          style={{ color: C.inkFaint, letterSpacing: "0.12em", fontWeight: 600 }}
        >
          By age {lifeLabel}, at your assumptions
        </div>
        <div
          className="display"
          style={{ color: C.ink, fontSize: "1.15rem", lineHeight: 1.3 }}
        >
          {winnerLabel} comes out ahead — by{" "}
          <span
            className="num"
            style={{
              color: primaryWinner === "switch" ? C.wait : C.early,
              fontWeight: 600,
            }}
          >
            {fmtBig(primaryMargin)}
          </span>{" "}
          more.
        </div>
        <p className="text-xs mt-2" style={{ color: C.inkSoft }}>
          {crossoverNote}
        </p>
      </div>

      {/* Head-to-head chart: the two survivor-context lines + crossover. */}
      <div style={{ height: "260px", marginLeft: "-10px" }} className="mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={merged}
            margin={{ top: 18, right: 25, bottom: 22, left: 10 }}
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
              cursor={{ stroke: C.borderDark, strokeDasharray: "3 3" }}
              contentStyle={{
                backgroundColor: C.paper,
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                boxShadow: "var(--shadow-md)",
                fontFamily: "JetBrains Mono",
                fontSize: 12,
                padding: "10px 12px",
              }}
              labelStyle={{ color: C.ink, fontWeight: 600, marginBottom: 4 }}
              labelFormatter={(v) => `Age ${fmtAge(Number(v))}`}
              formatter={(value, name) => {
                const labelMap = {
                  survivorEarly: "Survivor early",
                  switchEarly: "Own → Survivor",
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
            {crossover && (
              <ReferenceLine
                x={crossover}
                stroke={C.cross}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                label={{
                  value: `↓ Cross ${fmtAge(crossover)}`,
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
              dataKey="survivorEarly"
              stroke={C.early}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={true}
              animationDuration={600}
            />
            <Line
              type="monotone"
              dataKey="switchEarly"
              stroke={C.wait}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={true}
              animationDuration={600}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Strategy cards. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {strategies.map((s) => {
          const isCurrent = s.mode === mode;
          const isWinner = s.key === verdict.overallWinner;
          const gapToBest = byKey[verdict.overallWinner].lifetimeTotal - s.lifetimeTotal;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => onSelectStrategy(s.mode)}
              className="card-flat p-4 text-left"
              aria-pressed={isCurrent}
              title={`Open ${s.label} in the calculator`}
              style={{
                borderLeft: `3px solid ${STRAT_COLOR[s.key]}`,
                cursor: "pointer",
                outline: isCurrent ? `2px solid ${C.accent}` : "none",
                outlineOffset: "1px",
                fontFamily: "inherit",
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span
                  className="text-xs uppercase truncate"
                  style={{
                    color: STRAT_COLOR[s.key],
                    letterSpacing: "0.08em",
                    fontWeight: 700,
                  }}
                >
                  {s.label}
                </span>
                {isWinner && (
                  <span
                    className="text-xs num"
                    style={{
                      color: C.accentOn,
                      backgroundColor: C.accent,
                      borderRadius: "var(--radius-pill)",
                      padding: "1px 8px",
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    Best
                  </span>
                )}
              </div>

              <div
                className="num"
                style={{ color: C.ink, fontSize: "1.5rem", fontWeight: 600, lineHeight: 1 }}
              >
                {fmtBig(s.lifetimeTotal)}
              </div>
              <div className="text-xs num mt-1" style={{ color: C.inkFaint }}>
                {isWinner
                  ? "best of the three"
                  : `−${fmtBig(gapToBest)} vs best`}
              </div>

              <div
                className="mt-3 pt-3 grid grid-cols-2 gap-2 text-xs num"
                style={{ borderTop: `1px solid ${C.border}` }}
              >
                <div>
                  <div style={{ color: C.inkFaint }}>Now</div>
                  <div style={{ color: C.inkSoft }}>
                    {fmtMoney(s.earlyMonthlyNet)}/mo
                  </div>
                </div>
                <div>
                  <div style={{ color: C.inkFaint }}>From 67</div>
                  <div style={{ color: C.inkSoft }}>
                    {fmtMoney(s.postFRAMonthlyNet)}/mo
                  </div>
                </div>
              </div>

              {/* Dollar-mode invest: show the dollar actually invested in this
                  scenario (the entered amount, or the whole check when it's
                  smaller) so the user sees the same dollar applied to both
                  calcs. Hidden in percentage mode. */}
              {s.investedEarlyDollarApplied != null && (
                <div
                  className="text-xs num mt-2"
                  style={{ color: STRAT_COLOR[s.key], fontWeight: 500 }}
                >
                  investing {fmtMoney(s.investedEarlyDollarApplied)}/mo
                  {s.investedEarlyDollarApplied >= s.earlyMonthlyNet - 0.5
                    ? " · whole check"
                    : ""}
                </div>
              )}

              <div className="text-xs mt-3" style={{ color: C.inkFaint }}>
                {s.clampedFromClaimAge
                  ? `claims at ${fmtAge(s.claimAge)} (its limit; you set ${fmtAge(
                      s.clampedFromClaimAge
                    )})`
                  : `claims at ${fmtAge(s.claimAge)}`}
                {isCurrent ? " · showing now" : ""}
              </div>
            </button>
          );
        })}
      </div>

      <p
        className="text-xs mt-5 pt-4"
        style={{ borderTop: `1px solid ${C.border}`, color: C.inkFaint }}
      >
        Own-only (claim your own benefit and never take survivor) is shown for
        context — it only wins when your own benefit is the larger of the two.
        The answer is sensitive to the return rate, life expectancy, and how
        long you keep investing; nudge those above and watch the verdict move.
      </p>
    </div>
  );
}
