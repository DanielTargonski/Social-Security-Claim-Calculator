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
import { FRA, fmtMoney, fmtBig, fmtAge, fmtAxisTick } from "../lib/benefitMath.js";
import { useClickToEditNumber } from "../hooks/useClickToEditNumber.js";
import { makeEndpointDot } from "./EndpointDot.jsx";
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

// One editable per-strategy invested-dollar field in the control block above
// the comparison. Click the amount to type an exact monthly dollar figure for
// THIS strategy alone; the comparison re-races immediately. The displayed
// `monthly` already reflects any override (and the whole-check cap), so the
// field always shows what this strategy actually invests.
function StrategyInvestField({
  stratKey,
  label,
  color,
  monthly,
  overridden,
  atCap,
  onChange,
}) {
  const { editing, startEdit, inputProps } = useClickToEditNumber({
    value: monthly,
    onCommit: (v) => onChange(stratKey, v),
  });

  return (
    <div className="card-flat p-3" style={{ borderLeft: `3px solid ${color}` }}>
      <div
        className="text-xs uppercase truncate"
        style={{ color, letterSpacing: "0.08em", fontWeight: 700 }}
      >
        {label}
      </div>
      {editing ? (
        <input
          {...inputProps}
          className="num"
          min={0}
          step={50}
          style={{
            color: C.ink,
            fontWeight: 600,
            backgroundColor: C.surface,
            border: `1px solid ${C.accent}`,
            borderRadius: "var(--radius-sm)",
            padding: "2px 8px",
            width: "100%",
            marginTop: "4px",
            textAlign: "left",
            fontSize: "1.1rem",
            outline: "none",
          }}
        />
      ) : (
        <button
          type="button"
          onClick={startEdit}
          className="num"
          title={`Set the monthly amount invested in ${label}`}
          style={{
            color: C.ink,
            fontWeight: 600,
            background: "transparent",
            border: "1px solid transparent",
            padding: "2px 8px",
            margin: "2px -8px 0",
            cursor: "text",
            fontSize: "1.1rem",
            borderRadius: "var(--radius-sm)",
            fontFamily: "inherit",
            transition: "background 0.15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = C.surface)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {fmtMoney(monthly)}/mo
        </button>
      )}
      <div className="text-xs num mt-1" style={{ color: C.inkFaint }}>
        {atCap ? "whole check" : overridden ? "custom" : "follows slider"}
      </div>
    </div>
  );
}

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
// Status-chip metadata for the decisiveness read (clear winner vs close call).
const DECIS_META = {
  decisive: { label: "Clear winner", color: C.wait },
  edge: { label: "Slight edge", color: C.inkSoft },
  close: { label: "Close call", color: C.early },
};

export default function StrategyCompare({
  compare,
  mode,
  onSelectStrategy,
  lifeExpectancy,
  // Set a per-strategy invested monthly dollar (key, dollars), and clear all
  // overrides back to the shared slider. Default to no-ops so the panel still
  // renders standalone (e.g. in tests) without the App wiring.
  onInvestChange = () => {},
  onInvestReset = () => {},
  // Cross-wage strategy robustness (from compareStrategiesAcrossWages). Null →
  // the "across wages" lever is omitted (keeps the panel renderable standalone).
  wageRobustness = null,
}) {
  const { strategies, byKey, merged, verdict } = compare;
  const {
    primaryWinner,
    primaryMargin,
    crossover,
    switchEndsAhead,
    breakEvenReturn,
    crossoverSurvivalProb,
    conditioningAge,
    decisiveness,
  } = verdict;

  // Any strategy carrying a per-strategy override → offer a reset to the slider.
  const anyInvestOverride = strategies.some((s) => s.investedOverridden);

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

  // The two levers that move the verdict, surfaced under the headline so the
  // user can see HOW sensitive the answer is, not just which way it points.
  const winnerWord = (key) =>
    key === "switch" ? "Own → Survivor" : "claiming survivor early";

  // Return lever: the real-return rate at which the verdict flips.
  const be = breakEvenReturn;
  const returnLeverNote =
    be.rate == null
      ? `Across every real return from 0% to 12%, ${winnerWord(
          be.lowWinner
        )} wins.`
      : `Below ~${be.rate}% real return, ${winnerWord(
          be.lowWinner
        )} wins; above it, ${winnerWord(be.highWinner)} pulls ahead${
          be.rate > 10 ? " (past the slider's 10% max)" : ""
        }.`;

  // Longevity lever: odds of living from the decision age to the crossover.
  // Only meaningful when the lines actually cross.
  let longevityLeverNote = null;
  if (crossover != null && crossoverSurvivalProb != null) {
    const pct = Math.round(crossoverSurvivalProb * 100);
    longevityLeverNote =
      `About ${pct}% chance of living from ${fmtAge(
        conditioningAge
      )} to the ${fmtAge(crossover)} crossover (SSA period life table)` +
      (switchEndsAhead ? " — past it, the switch comes out ahead." : ".");
  }

  // Decisiveness read — is one strategy by far better, or is it a close call?
  // Drives the status chip and a one-line emphasis. Guarded so the panel still
  // renders if an older `compare` lacks the field.
  // Accent for the winning strategy (green = wait/switch, red = claim survivor
  // early) — used to color the decisive chip/emphasis so they match the banner
  // border, margin number, and winning card rather than always reading green.
  const winnerAccent = primaryWinner === "switch" ? C.wait : C.early;
  const decisChip = decisiveness
    ? {
        label: DECIS_META[decisiveness.tier].label,
        color:
          decisiveness.tier === "decisive"
            ? winnerAccent
            : DECIS_META[decisiveness.tier].color,
      }
    : null;
  const decisPct =
    decisiveness && decisiveness.relativeMargin !== Infinity
      ? Math.round(decisiveness.relativeMargin * 100)
      : null;
  let decisEmphasis = null;
  if (decisiveness?.tier === "decisive") {
    decisEmphasis =
      decisPct == null
        ? `Not a close call — ${winnerLabel} is ahead at every age and ends far higher.`
        : `Not a close call — ${winnerLabel} is ahead at every age and ends about ${decisPct}% higher.`;
  } else if (decisiveness?.tier === "edge" && decisPct != null) {
    decisEmphasis = `${winnerLabel} is ahead at every age, but only about ${decisPct}% higher — a slim edge.`;
  }

  // Across-wages robustness lever — does one strategy win at EVERY pre-67 wage
  // the user is comparing? Tells them whether the strategy choice depends on how
  // much they work. Omitted when wageRobustness isn't supplied.
  let wageLeverNote = null;
  if (wageRobustness && wageRobustness.perWage.length > 1) {
    const wagesArr = wageRobustness.perWage.map((p) => p.wage);
    const loW = Math.min(...wagesArr);
    const hiW = Math.max(...wagesArr);
    if (wageRobustness.allWinner) {
      const name =
        wageRobustness.allWinner === "switch"
          ? "Own → Survivor"
          : "Claiming survivor early";
      const { minMargin, maxMargin } = wageRobustness;
      const marginPhrase =
        Math.round(minMargin) === Math.round(maxMargin)
          ? `by ${fmtBig(minMargin)}`
          : `by ${fmtBig(minMargin)}–${fmtBig(maxMargin)}`;
      wageLeverNote = `${name} wins at every pre-67 wage from ${fmtMoney(
        loW
      )} to ${fmtMoney(
        hiW
      )} (${marginPhrase} in dollars in hand) — the strategy choice doesn't hinge on how much you work.`;
    } else {
      wageLeverNote = `Which strategy wins flips with your pre-67 wage (${fmtMoney(
        loW
      )}–${fmtMoney(hiW)}) — see the wage panel below.`;
    }
  }

  // Endpoint value labels: pin each plotted line's final total ("$798K") right
  // at its end — the live-until age — so the chart states the answer the cards
  // do without a hover. The two lines converge at long life, so the
  // higher-value label rides slightly above its point and the lower one drops
  // below; they stay legible even when the totals are nearly equal.
  const lastIdx = merged.length - 1;
  const lastRow = merged[lastIdx] || {};
  const survivorOnTop =
    (lastRow.survivorEarly ?? 0) >= (lastRow.switchEarly ?? 0);
  const survivorDy = survivorOnTop ? -5 : 14;
  const switchDy = survivorOnTop ? 14 : -5;

  // Endpoint dots (shared with WageCompare): an anchor dot + the line's final
  // dollar total pinned at its end. dy staggers converging labels.
  const renderEndpointDot = makeEndpointDot({ lastIdx, lastRow });

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

      {/* Per-strategy invest controls. The single early-invest slider sets one
          figure for every scenario at once; this is where the user can dial a
          DIFFERENT monthly amount into each strategy and race those — e.g.
          $500/mo on survivor-early vs $250/mo on own->survivor. */}
      <div className="card-flat p-4 md:p-5 mb-5">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div>
            <div
              className="text-xs uppercase"
              style={{
                color: C.inkFaint,
                letterSpacing: "0.12em",
                fontWeight: 600,
              }}
            >
              Invested monthly · per strategy
            </div>
            <p
              className="text-xs mt-1 max-w-md"
              style={{ color: C.inkSoft }}
            >
              Set a different amount in each — independent here, unlike the main
              slider. Capped at each strategy's own check.
            </p>
          </div>
          {anyInvestOverride && (
            <button
              type="button"
              onClick={onInvestReset}
              className="num"
              title="Clear per-strategy amounts and follow the main slider again"
              style={{
                color: C.accent,
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 500,
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              ↺ reset to slider
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {strategies.map((s) => (
            <StrategyInvestField
              key={s.key}
              stratKey={s.key}
              label={s.label}
              color={STRAT_COLOR[s.key]}
              monthly={s.investedMonthly}
              overridden={s.investedOverridden}
              atCap={s.investedAtCheckCap}
              onChange={onInvestChange}
            />
          ))}
        </div>
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
        <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
          <div
            className="text-xs uppercase"
            style={{ color: C.inkFaint, letterSpacing: "0.12em", fontWeight: 600 }}
          >
            By age {lifeLabel}, at your assumptions
          </div>
          {decisChip && (
            <span
              className="text-xs num uppercase"
              title="How clear-cut the winner is — a wide, never-trailing lead vs a longevity-dependent toss-up"
              style={{
                color: decisChip.color,
                border: `1px solid ${decisChip.color}`,
                borderRadius: "var(--radius-pill)",
                padding: "1px 8px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                whiteSpace: "nowrap",
              }}
            >
              {decisChip.label}
            </span>
          )}
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
        {decisEmphasis && (
          <p
            className="text-xs mt-1"
            style={{
              color: decisiveness.tier === "decisive" ? winnerAccent : C.inkSoft,
              fontWeight: decisiveness.tier === "decisive" ? 600 : 400,
            }}
          >
            {decisEmphasis}
          </p>
        )}

        {/* The two levers that move the answer: how good returns must be, and
            how long you must live. Framed so the user sees the sensitivity. */}
        <div
          className="text-xs mt-3 pt-3"
          style={{ borderTop: `1px solid ${C.border}`, color: C.inkSoft }}
        >
          <div className="flex gap-2" style={{ alignItems: "baseline" }}>
            <span
              style={{
                color: C.inkFaint,
                fontWeight: 600,
                letterSpacing: "0.06em",
                minWidth: "4.5rem",
              }}
            >
              RETURNS
            </span>
            <span>{returnLeverNote}</span>
          </div>
          {longevityLeverNote && (
            <div
              className="flex gap-2 mt-1"
              style={{ alignItems: "baseline" }}
            >
              <span
                style={{
                  color: C.inkFaint,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  minWidth: "4.5rem",
                }}
              >
                LONGEVITY
              </span>
              <span>{longevityLeverNote}</span>
            </div>
          )}
          {wageLeverNote && (
            <div
              className="flex gap-2 mt-1"
              style={{ alignItems: "baseline" }}
            >
              <span
                style={{
                  color: C.inkFaint,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  minWidth: "4.5rem",
                }}
              >
                BY WAGE
              </span>
              <span>{wageLeverNote}</span>
            </div>
          )}
        </div>
      </div>

      {/* Legend for the head-to-head chart (own-only isn't plotted here — it's
          a supplementary card below, not part of this two-way race). */}
      <div
        className="flex gap-4 text-xs num flex-wrap mb-2"
        style={{ justifyContent: "flex-end" }}
      >
        <div className="flex items-center gap-2">
          <div style={{ width: "18px", height: "2px", backgroundColor: C.early }} />
          <span style={{ color: C.ink }}>Survivor early</span>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ width: "18px", height: "2px", backgroundColor: C.wait }} />
          <span style={{ color: C.ink }}>Own → Survivor</span>
        </div>
      </div>

      {/* Head-to-head chart: the two survivor-context lines + crossover. */}
      <div style={{ height: "260px", marginLeft: "-10px" }} className="mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={merged}
            margin={{ top: 18, right: 58, bottom: 22, left: 10 }}
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
              tickFormatter={fmtAxisTick}
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
              dot={renderEndpointDot("survivorEarly", C.early, survivorDy)}
              isAnimationActive={true}
              animationDuration={600}
            />
            <Line
              type="monotone"
              dataKey="switchEarly"
              stroke={C.wait}
              strokeWidth={2.5}
              dot={renderEndpointDot("switchEarly", C.wait, switchDy)}
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

              {/* Echo the dollar this scenario invests whenever a dollar figure
                  is in play (a per-strategy override, or the slider's "$"
                  mode), capped at the whole check. Hidden in plain percentage
                  mode, where the invest amount is just a fraction of the card's
                  "Now" check shown above. */}
              {(s.investedOverridden || s.investedEarlyDollarApplied != null) && (
                <div
                  className="text-xs num mt-2"
                  style={{ color: STRAT_COLOR[s.key], fontWeight: 500 }}
                >
                  investing {fmtMoney(s.investedMonthly)}/mo
                  {s.investedAtCheckCap ? " · whole check" : ""}
                  {s.investedOverridden ? " · custom" : ""}
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
