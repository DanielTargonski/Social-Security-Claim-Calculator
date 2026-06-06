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
import {
  FRA,
  fmtMoney,
  fmtBig,
  fmtAge,
  fmtIncome,
  fmtAxisTick,
} from "../lib/benefitMath.js";
import { useClickToEditNumber } from "../hooks/useClickToEditNumber.js";
import { makeEndpointDot } from "./EndpointDot.jsx";
import ReturnRateSlider from "./ReturnRateSlider.jsx";
import { C } from "../constants/colors.js";

// Line/accent color per scenario, by position. The current wage (always first)
// reads as the neutral "this is you" ink line; the two what-ifs get the
// chart's red/green data colors so they're easy to tell apart. No good/bad
// meaning is implied — the winner is flagged with a badge, not a color.
const PALETTE = [C.ink, C.wait, C.early];
const colorAt = (idx) => PALETTE[idx] ?? C.inkFaint;

// Click-to-edit dollar field for an alternative wage. Mirrors the click-to-edit
// pattern used across the calculator's sliders and the per-strategy invest
// fields. Whole-dollar entry, $1,000 step.
function EditableWage({ value, color, onChange }) {
  const { editing, startEdit, inputProps } = useClickToEditNumber({
    value,
    onCommit: onChange,
  });

  if (editing) {
    return (
      <input
        {...inputProps}
        className="num"
        min={0}
        step={1000}
        style={{
          color: C.ink,
          fontWeight: 700,
          backgroundColor: C.surface,
          border: `1px solid ${C.accent}`,
          borderRadius: "var(--radius-sm)",
          padding: "1px 6px",
          width: "8rem",
          textAlign: "left",
          fontSize: "0.95rem",
          outline: "none",
        }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={startEdit}
      className="num truncate"
      title="Set this alternative pre-67 wage"
      style={{
        color,
        fontWeight: 700,
        letterSpacing: "0.04em",
        background: "transparent",
        border: "1px solid transparent",
        padding: "1px 6px",
        margin: "0 -6px",
        cursor: "text",
        fontSize: "0.95rem",
        borderRadius: "var(--radius-sm)",
        fontFamily: "inherit",
        textTransform: "uppercase",
        transition: "background 0.15s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = C.surface)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {fmtIncome(value)}
    </button>
  );
}

// The healthcare line inside a scenario card. Surfaces the actual annual premium
// this wage triggers, plus the load-bearing cliff status (over the ACA cliff,
// or how much headroom is left before the next cliff). This is the factor the
// motivating conversation kept circling back to.
function HealthcareLine({ scenario, claimAge, coveredElsewhere, unsubsidizedSilverAnnual }) {
  if (coveredElsewhere) {
    return (
      <div className="text-xs num mt-2" style={{ color: C.inkFaint }}>
        Healthcare: covered elsewhere
      </div>
    );
  }
  const { healthcareAnnualNow, nextCliff } = scenario;
  // Pre-65 and paying the full unsubsidized premium ⇒ already over the ACA
  // cliff. (nextCliff is null in that case — there's nothing above 400% FPL.)
  const overACACliff =
    claimAge < 65 && healthcareAnnualNow >= unsubsidizedSilverAnnual - 1;

  return (
    <div className="text-xs num mt-2" style={{ color: C.inkSoft }}>
      Healthcare {fmtMoney(healthcareAnnualNow)}/yr
      {overACACliff ? (
        <span style={{ color: C.early, fontWeight: 600 }}>
          {" "}
          · over the ACA cliff
        </span>
      ) : nextCliff ? (
        <span style={{ color: C.inkFaint }} title={nextCliff.label}>
          {" "}
          · {fmtMoney(nextCliff.distance)} to next cliff
          {nextCliff.annualCostDelta > 0
            ? ` · +${fmtMoney(nextCliff.annualCostDelta)}/yr`
            : ""}
        </span>
      ) : null}
    </div>
  );
}

// Build the "marginal work" warning copy from the lib's marginalWork payload.
// Returns { pre, emphasis, post, tag } — the banner sentence split so the punchy
// phrase (the cents kept, or "loses money") can be emphasized in C.early, plus a
// short winner-card tag. Switch-mode aware (no FRA recoup); special-cases the
// "not working" lower rung so "over Not working" doesn't read awkwardly.
function marginalWorkCopy(mw, lifeLabel) {
  const higherLabel = fmtIncome(mw.higherWage);
  const lowerLabel = fmtIncome(mw.lowerWage);
  const lowerIsZero = mw.lowerWage === 0;
  const grossLabel = fmtBig(mw.extraGrossLifetime);
  const isSwitch = mw.mode === "switch";

  if (mw.isNegative) {
    const lossAbs = fmtBig(Math.abs(mw.extraResources));
    // Pick the clause by the ACTUAL dominant drag — a switch-mode loss can be a
    // pure healthcare-cliff cross with zero extra earnings-test withholding, so
    // the "never recoups at 67" wording is only right when SS is the culprit.
    const clause =
      mw.dominantDrag === "healthcare"
        ? "Crossing a healthcare cliff at this wage costs more than the added wages bring in."
        : mw.dominantDrag === "ss"
        ? isSwitch
          ? "The earnings test withholds the checks and this strategy never recoups them at 67, so the added wages do not cover what is given up."
          : "The earnings test and extra tax take back more than the added wages bring in, even after the larger check at 67."
        : "Tax on the extra wages, plus what Social Security gives up, exceeds what the wages bring in.";
    return {
      pre: lowerIsZero
        ? `Working at ${higherLabel} instead of not working `
        : `Earning ${higherLabel} over ${lowerLabel} `,
      emphasis: "actually loses money",
      post: ` — about ${lossAbs} LESS by ${lifeLabel} despite ${grossLabel} of added pay. ${clause}`,
      tag: lowerIsZero
        ? "working at all loses money here"
        : `working more than ${lowerLabel} loses money`,
    };
  }

  // Poor (positive but low keep rate).
  const moreLabel = fmtBig(mw.extraResources);
  const clause =
    isSwitch && mw.dominantDrag === "ss"
      ? "In this strategy those withheld checks never come back, so the earnings test claws back most of the rest before 67."
      : mw.dominantDrag === "ss"
      ? "The earnings test claws back most of the rest before 67, only partly returned by the larger check at 67."
      : mw.dominantDrag === "healthcare"
      ? "Higher ACA or Medicare premiums claw back most of the rest."
      : "Tax on the extra wages takes most of the rest.";
  const almostNothing = mw.centsKept <= 0;
  return {
    pre: lowerIsZero
      ? `Working at ${higherLabel} instead of not working keeps `
      : `Earning ${higherLabel} over ${lowerLabel} keeps `,
    emphasis: almostNothing
      ? "almost nothing (under 1 cent)"
      : `only ${mw.centsKept} cents`,
    post: ` of each extra dollar earned — about ${moreLabel} more by ${lifeLabel} for ${grossLabel} of added pay. ${clause}`,
    tag: lowerIsZero
      ? almostNothing
        ? "almost nothing kept vs not working"
        : `only ${mw.centsKept} cents kept vs not working`
      : almostNothing
      ? `almost nothing kept on the step up from ${lowerLabel}`
      : `only ${mw.centsKept} cents kept on the step up from ${lowerLabel}`,
  };
}

// Compare the SAME claiming decision across different pre-67 gross wages. Pre-FRA
// wages drive the earnings test, the FRA recoup, federal tax on Social Security,
// and the ACA / IRMAA healthcare cliffs all at once — and they pull against each
// other. This panel nets it all into one comparable "total resources" number per
// wage so the user can see whether working less before FRA actually helps.
//
// Owns only the inline-edit state; every number comes from compareWages upstream
// (via useWageCompare). The first scenario is the live current wage (read-only
// here — change it with the wage slider above); the rest are editable what-ifs.
export default function WageCompare({
  compare,
  currentKey,
  claimAge,
  lifeExpectancy,
  coveredElsewhere,
  unsubsidizedSilverAnnual,
  dirty = false,
  // (key, dollars) for an alternative wage; reset restores the defaults. Default
  // to no-ops so the panel renders standalone (tests) without App wiring.
  onAltChange = () => {},
  onReset = () => {},
  // The shared real-return rate + its setter. The SS side of every wage here is
  // invested at this rate, so let the user retune it in-place. Null → the
  // in-card slider is omitted (keeps the panel renderable standalone).
  returnRate = null,
  onReturnRateChange = () => {},
}) {
  const { scenarios, byKey, merged, verdict } = compare;
  const lifeLabel = fmtAge(lifeExpectancy);

  const labelByKey = Object.fromEntries(
    scenarios.map((s) => [s.key, fmtIncome(s.wage)])
  );
  const colorByKey = Object.fromEntries(
    scenarios.map((s, i) => [s.key, colorAt(i)])
  );

  const winner = byKey[verdict.winnerKey];
  const runnerUp = verdict.runnerUpKey ? byKey[verdict.runnerUpKey] : null;
  const winnerLabel = labelByKey[verdict.winnerKey];

  // "Marginal work" warning: non-null only when the last rung of extra work has
  // a poor or negative return. Rendered as a lever line + a winner-card tag.
  const mw = verdict.marginalWork;
  const mwCopy = mw ? marginalWorkCopy(mw, lifeLabel) : null;

  // Verdict sentence: name the winner, the margin, and the dominant driver.
  const marginRounded = Math.round(verdict.winnerMargin);
  const tied = runnerUp && marginRounded < 1000;
  const { dWage, dHealthSaved, dSS } = verdict.drivers;
  let driverNote = "";
  if (runnerUp) {
    const top = Math.max(dWage, dHealthSaved, dSS);
    if (top === dWage && dWage > 0) {
      driverNote =
        "The wages themselves more than cover the extra tax and healthcare they trigger.";
    } else if (top === dHealthSaved && dHealthSaved > 0) {
      driverNote =
        "Mostly by staying under the healthcare cliffs — the premium saved outweighs the lost wages.";
    } else if (top === dSS && dSS > 0) {
      driverNote =
        "Mostly through more Social Security in hand — less earnings-test drag now and a bigger recoup at 67.";
    }
  }

  // Endpoint label vertical offsets, staggered by where each line ends so the
  // dollar totals don't overlap when the lines converge at long life.
  const lastRow = merged[merged.length - 1] || {};
  const lastIdx = merged.length - 1;
  const endOrder = [...scenarios]
    .sort((a, b) => (lastRow[b.key] ?? 0) - (lastRow[a.key] ?? 0))
    .map((s) => s.key);
  const dyByKey = {};
  endOrder.forEach((k, i) => {
    dyByKey[k] = i === 0 ? -8 : i === 1 ? 7 : 21;
  });

  const renderEndpointDot = makeEndpointDot({ lastIdx, lastRow });

  const earningsTestApplies = claimAge < FRA;

  return (
    <div
      id="wage-compare"
      className="card mt-5 p-6 md:p-7"
      style={{ scrollMarginTop: "1rem" }}
    >
      <div className="mb-5">
        <h3 className="display text-xl" style={{ color: C.ink }}>
          <em>What if you earned less before 67?</em>
        </h3>
        <p className="text-xs mt-1 max-w-2xl" style={{ color: C.inkSoft }}>
          The same claiming decision, run at different pre-67 wages. More wage
          means more earnings-test withholding{earningsTestApplies ? "" : " (none past FRA)"},
          a bigger FRA recoup, more taxable Social Security, and higher ACA /
          Medicare premiums — all at once. Total resources by {lifeLabel} ={" "}
          Social Security (invested at your rate) + wage take-home after tax −
          healthcare premiums. Click an alternative's amount to change it.
        </p>
      </div>

      {/* Real-return knob. The Social Security side of every wage scenario is
          invested at this rate, so it shifts each total together — drag it here
          to see how the wage verdict holds up at a different return assumption,
          without scrolling back to the inputs. Same control, same shared
          state. */}
      {returnRate != null && (
        <div className="card-flat p-4 md:p-5 mb-5">
          <p className="text-xs mb-3 max-w-xl" style={{ color: C.inkSoft }}>
            The real return the Social Security checks are invested at — the same
            rate across every wage here. Drag it to see how the verdict shifts.
          </p>
          <ReturnRateSlider value={returnRate} onChange={onReturnRateChange} />
        </div>
      )}

      {/* Verdict banner. */}
      <div
        className="card-flat p-4 md:p-5 mb-5"
        style={{ borderLeft: `3px solid ${colorByKey[verdict.winnerKey]}` }}
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
          {tied ? (
            <>
              Earning{" "}
              <span className="num" style={{ color: colorByKey[verdict.winnerKey], fontWeight: 600 }}>
                {winnerLabel}
              </span>{" "}
              is about even with {labelByKey[verdict.runnerUpKey]}.
            </>
          ) : runnerUp ? (
            <>
              Earning{" "}
              <span className="num" style={{ color: colorByKey[verdict.winnerKey], fontWeight: 600 }}>
                {winnerLabel}
              </span>{" "}
              comes out ahead — by{" "}
              <span className="num" style={{ color: colorByKey[verdict.winnerKey], fontWeight: 600 }}>
                {fmtBig(verdict.winnerMargin)}
              </span>{" "}
              more.
            </>
          ) : (
            <>
              Earning{" "}
              <span className="num" style={{ color: colorByKey[verdict.winnerKey], fontWeight: 600 }}>
                {winnerLabel}
              </span>
              .
            </>
          )}
        </div>
        {driverNote && !tied && (
          <p className="text-xs mt-2" style={{ color: C.inkSoft }}>
            {driverNote}
          </p>
        )}

        {/* "Marginal work" lever line — fires when the extra work up to (or past)
            the winning wage barely pays off, or loses money. Renders even when
            the totals are tied (a tie at the top with a big gross gap is exactly
            the "worked a ton for nothing" case). Negative gets a red callout. */}
        {mw &&
          mwCopy &&
          (() => {
            const row = (
              <div
                className="flex gap-2 text-xs"
                style={{ alignItems: "baseline" }}
              >
                <span
                  className="uppercase"
                  style={{
                    color: C.inkFaint,
                    fontWeight: 600,
                    letterSpacing: "0.06em",
                    minWidth: "5.5rem",
                  }}
                >
                  Marginal work
                </span>
                <span style={{ color: C.inkSoft }}>
                  {mwCopy.pre}
                  <span
                    className="num"
                    style={{ color: C.early, fontWeight: 600 }}
                  >
                    {mwCopy.emphasis}
                  </span>
                  {mwCopy.post}
                </span>
              </div>
            );
            return mw.isNegative ? (
              <div
                className="mt-3"
                style={{
                  borderLeft: `3px solid ${C.early}`,
                  paddingLeft: "0.7rem",
                }}
              >
                {row}
              </div>
            ) : (
              <div className="mt-3">{row}</div>
            );
          })()}

        <p className="text-xs mt-2" style={{ color: C.inkFaint }}>
          Dropping wages is not free: you give up the take-home to save on
          withholding, tax, and premiums. This nets all four so you can see
          which way it actually points.
        </p>
      </div>

      {/* Legend. */}
      <div
        className="flex gap-4 text-xs num flex-wrap mb-2"
        style={{ justifyContent: "flex-end" }}
      >
        {scenarios.map((s) => (
          <div className="flex items-center gap-2" key={s.key}>
            <div
              style={{ width: "18px", height: "2px", backgroundColor: colorByKey[s.key] }}
            />
            <span style={{ color: C.ink }}>
              {labelByKey[s.key]}
              {s.key === currentKey ? " (current)" : ""}
            </span>
          </div>
        ))}
      </div>

      {/* Head-to-head chart: total resources over age, one line per wage. */}
      <div style={{ height: "260px", marginLeft: "-10px" }} className="mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 18, right: 64, bottom: 22, left: 10 }}>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="age"
              type="number"
              domain={["dataMin", "dataMax"]}
              stroke={C.inkSoft}
              tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: C.inkSoft }}
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
              tick={{ fontSize: 11, fontFamily: "JetBrains Mono", fill: C.inkSoft }}
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
              formatter={(value, name) => [fmtMoney(value), labelByKey[name] || name]}
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
            {scenarios.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={colorByKey[s.key]}
                strokeWidth={2.5}
                dot={renderEndpointDot(s.key, colorByKey[s.key], dyByKey[s.key])}
                isAnimationActive={true}
                animationDuration={600}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Scenario cards. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {scenarios.map((s) => {
          const isCurrent = s.key === currentKey;
          const isWinner = s.key === verdict.winnerKey;
          const gapToBest = winner.lifetimeTotal - s.lifetimeTotal;
          return (
            <div
              key={s.key}
              className="card-flat p-4"
              style={{ borderLeft: `3px solid ${colorByKey[s.key]}` }}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                {isCurrent ? (
                  <span
                    className="num truncate"
                    style={{
                      color: colorByKey[s.key],
                      letterSpacing: "0.04em",
                      fontWeight: 700,
                      fontSize: "0.95rem",
                      textTransform: "uppercase",
                    }}
                  >
                    {fmtIncome(s.wage)}
                  </span>
                ) : (
                  <EditableWage
                    value={s.wage}
                    color={colorByKey[s.key]}
                    onChange={(d) => onAltChange(s.key, d)}
                  />
                )}
                {isWinner ? (
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
                ) : isCurrent ? (
                  <span
                    className="text-xs num"
                    style={{ color: C.inkFaint, whiteSpace: "nowrap" }}
                  >
                    current
                  </span>
                ) : null}
              </div>

              <div
                className="num"
                style={{ color: C.ink, fontSize: "1.5rem", fontWeight: 600, lineHeight: 1 }}
              >
                {fmtBig(s.lifetimeTotal)}
              </div>
              <div className="text-xs num mt-1" style={{ color: C.inkFaint }}>
                {isWinner ? "most in hand" : `−${fmtBig(gapToBest)} vs best`}
              </div>
              {isWinner && mwCopy && (
                <div
                  className="text-xs num mt-1"
                  style={{ color: C.early, fontWeight: 500 }}
                >
                  {mwCopy.tag}
                </div>
              )}

              <div
                className="mt-3 pt-3 grid grid-cols-2 gap-2 text-xs num"
                style={{ borderTop: `1px solid ${C.border}` }}
              >
                <div>
                  <div style={{ color: C.inkFaint }}>Wage take-home</div>
                  <div style={{ color: C.inkSoft }}>
                    {s.wageNetAnnual > 0 ? `${fmtMoney(s.wageNetAnnual)}/yr` : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ color: C.inkFaint }}>SS withheld</div>
                  <div style={{ color: C.inkSoft }}>
                    {s.earningsTestWithholding > 0
                      ? `−${fmtMoney(s.earningsTestWithholding)}/yr`
                      : "none"}
                  </div>
                </div>
                <div>
                  <div style={{ color: C.inkFaint }}>Net SS now</div>
                  <div style={{ color: C.inkSoft }}>
                    {fmtMoney(s.earlyMonthlyNet)}/mo
                  </div>
                </div>
                <div>
                  <div style={{ color: C.inkFaint }}>Net SS @67</div>
                  <div style={{ color: C.inkSoft }}>
                    {fmtMoney(s.postFRAMonthlyNet)}/mo
                  </div>
                </div>
              </div>

              <HealthcareLine
                scenario={s}
                claimAge={claimAge}
                coveredElsewhere={coveredElsewhere}
                unsubsidizedSilverAnnual={unsubsidizedSilverAnnual}
              />

              {isCurrent && (
                <div className="text-xs mt-3" style={{ color: C.inkFaint }}>
                  your current wage — change it with the slider above
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center gap-3 mt-4 flex-wrap">
        <p className="text-xs" style={{ color: C.inkFaint }}>
          Only the pre-67 wage changes; post-67 income, claim age, benefits, and
          return are held fixed. Wage take-home is net of federal and any NY/NYC
          tax. Both arms pay healthcare — this counts the actual premium each wage
          level triggers, not a delta.
        </p>
        {dirty && (
          <button
            type="button"
            onClick={onReset}
            className="num"
            title="Reset the alternative wages to their defaults"
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
            ↺ reset alternatives
          </button>
        )}
      </div>
    </div>
  );
}
