import { rangeForMode } from "../lib/optimalClaimAge.js";
import { fmtAge, fmtBig, fmtMoney } from "../lib/benefitMath.js";
import { C } from "../constants/colors.js";

// "Highest monthly income" block: Social Security check + invested-pot draw.
function IncomeRecommendation({
  income,
  baselineAge,
  lifeExpectancy,
  returnRate,
  setClaimAge,
}) {
  const { optimalAge, optimal, baseline } = income;
  const atOptimum = Math.abs(optimalAge - baselineAge) * 12 < 0.5;
  // Within 1% of the best is noise (e.g. +$2/mo for claiming a month later):
  // say the pick is essentially there instead of recommending a change.
  const gain = optimal.monthly - baseline.monthly;
  const closeEnough = !atOptimum && gain < 0.01 * optimal.monthly;
  const recommend = !atOptimum && !closeEnough;
  const potWord = returnRate > 0 ? "the invested pot" : "the set-aside checks";
  const life = fmtAge(lifeExpectancy);
  const breakdown = (inc) =>
    inc.potDraw > 0
      ? `${fmtMoney(inc.check)} Social Security check + ${fmtMoney(
          inc.potDraw
        )} drawn from ${potWord}`
      : `${fmtMoney(inc.check)} Social Security check, nothing invested`;

  return (
    <div className="mb-5 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
      <div
        className="text-xs uppercase mb-2"
        style={{ color: C.inkFaint, letterSpacing: "0.12em", fontWeight: 600 }}
      >
        Highest monthly income
      </div>
      <p className="text-xs mb-3 max-w-xl" style={{ color: C.inkSoft }}>
        Draws from both pots together once you retire: the Social Security
        check (that pot never runs down) plus a steady, inflation-adjusted draw
        that spends {potWord} down to $0 by {life}. A longer life spreads that
        draw thinner, which favors waiting.
      </p>
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div className="text-sm max-w-xl" style={{ color: C.ink }}>
          {atOptimum ? (
            <>
              Your pick of {fmtAge(baselineAge)} already gives the highest
              income:{" "}
              <strong className="num" style={{ color: C.wait }}>
                {fmtMoney(optimal.monthly)}/mo
              </strong>
              .
            </>
          ) : closeEnough ? (
            <>
              Your pick of {fmtAge(baselineAge)} is within{" "}
              {fmtMoney(gain)}/mo of the highest income (
              {fmtMoney(optimal.monthly)}/mo at {fmtAge(optimalAge)}):{" "}
              <strong className="num" style={{ color: C.wait }}>
                {fmtMoney(baseline.monthly)}/mo
              </strong>
              .
            </>
          ) : (
            <>
              Claim at{" "}
              <strong className="num" style={{ color: C.wait }}>
                {fmtAge(optimalAge)}
              </strong>{" "}
              for{" "}
              <strong className="num" style={{ color: C.wait }}>
                {fmtMoney(optimal.monthly)}/mo
              </strong>
              , vs {fmtMoney(baseline.monthly)}/mo at your pick of{" "}
              {fmtAge(baselineAge)}.
            </>
          )}
          <div className="text-xs num mt-1" style={{ color: C.inkSoft }}>
            {breakdown(recommend ? optimal : baseline)}
          </div>
          {recommend && (
            <div className="text-xs num" style={{ color: C.inkFaint }}>
              Your pick: {breakdown(baseline)}
            </div>
          )}
          <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
            Total drawn from both pots by {life}:{" "}
            <span className="num">
              {fmtBig((recommend ? optimal : baseline).totalDrawn)}
            </span>
            {recommend && (
              <>
                {" "}
                (your pick:{" "}
                <span className="num">{fmtBig(baseline.totalDrawn)}</span>)
              </>
            )}
          </div>
        </div>
        {recommend && (
          <button
            onClick={() => setClaimAge(optimalAge)}
            className="btn-primary"
          >
            Use {fmtAge(optimalAge)}
          </button>
        )}
      </div>
    </div>
  );
}

// "What's the best age to claim, given everything else above?" panel.
// Receives the precomputed sweep result from useOptimalClaimAge (shared
// with the small chip under the claim-age slider) so the 96-call sweep
// runs once per input change, not twice.
//
// The metric is mode-aware (matches SensitivityTornado convention):
//   retirement / survivor → finalEarly  (total wealth at lifeExpectancy)
//   switch                → potAtStopRow (invested pot at investStopAge)
export default function OptimalClaimAge({ inputs, optimal, setClaimAge }) {
  const { earliest, latest } = rangeForMode(inputs.mode);
  const { optimalAge, optimalScore, baselineAge, baselineScore } = optimal;

  // "Already optimized" detection: when the user's current age is within
  // half a month of the sweep's winner, the comparison is noise — display a
  // congratulatory variant instead of a misleading "+$0" delta.
  const ageGapMonths = Math.abs(optimalAge - baselineAge) * 12;
  const alreadyOptimal = ageGapMonths < 0.5;

  const delta = optimalScore - baselineScore;
  const pctImprovement = baselineScore > 0 ? (delta / baselineScore) * 100 : 0;

  // Position markers on the horizontal range bar (0–100% along the track).
  const rangeWidth = latest - earliest;
  const baselinePct = ((baselineAge - earliest) / rangeWidth) * 100;
  const optimalPct = ((optimalAge - earliest) / rangeWidth) * 100;

  return (
    <div className="card mt-5 p-6 md:p-7">
      <div className="mb-5">
        <h3 className="display text-xl" style={{ color: C.ink }}>
          <em>The optimal claim age</em>
        </h3>
        <p
          className="text-xs mt-1 max-w-md"
          style={{ color: C.inkSoft }}
        >
          The single claim age that maximizes{" "}
          {inputs.mode === "switch"
            ? "your invested pot at the switch"
            : `your total wealth at ${fmtAge(inputs.lifeExpectancy)}`}
          , given every other input above. Updates as you change them.
        </p>
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-stretch gap-3 mb-5">
        {/* Your pick */}
        <div
          className="card-flat p-4"
          style={{ borderLeft: `3px solid ${C.early}` }}
        >
          <div
            className="text-xs uppercase mb-2"
            style={{ color: C.inkSoft, letterSpacing: "0.1em", fontWeight: 600 }}
          >
            Your pick
          </div>
          <div
            className="num"
            style={{
              color: C.ink,
              fontSize: "1.5rem",
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            {fmtAge(baselineAge)}
          </div>
          <div className="text-xs num mt-2" style={{ color: C.inkFaint }}>
            {fmtBig(baselineScore)}
          </div>
        </div>

        {/* Arrow / delta column */}
        <div className="hidden md:flex items-center justify-center px-2">
          <div
            className="num"
            style={{ color: C.inkFaint, fontSize: "1.5rem", fontWeight: 300 }}
          >
            →
          </div>
        </div>

        {/* Optimal */}
        <div
          className="p-4"
          style={{
            backgroundColor: alreadyOptimal ? C.paper : C.ink,
            color: alreadyOptimal ? C.ink : C.paper,
            borderTop: `1px solid ${alreadyOptimal ? C.border : C.ink}`,
            borderRight: `1px solid ${alreadyOptimal ? C.border : C.ink}`,
            borderBottom: `1px solid ${alreadyOptimal ? C.border : C.ink}`,
            borderLeft: `3px solid ${C.wait}`,
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div
            className="text-xs uppercase mb-2"
            style={{
              color: alreadyOptimal ? C.inkSoft : C.inkOnDark,
              letterSpacing: "0.1em",
              fontWeight: 600,
            }}
          >
            {alreadyOptimal ? "You're at the optimum" : "Optimal"}
          </div>
          <div
            className="num"
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            {fmtAge(optimalAge)}
          </div>
          <div
            className="text-xs num mt-2"
            style={{ color: alreadyOptimal ? C.inkFaint : C.inkOnDark }}
          >
            {fmtBig(optimalScore)}
            {!alreadyOptimal && delta > 0 && (
              <>
                {" "}
                · <span style={{ color: C.paper, fontWeight: 500 }}>
                  +{fmtBig(delta)}
                </span>{" "}
                ({pctImprovement < 1
                  ? pctImprovement.toFixed(2)
                  : pctImprovement.toFixed(1)}
                %)
              </>
            )}
          </div>
        </div>
      </div>

      {/* Range bar visualization — shows where YOU and the OPTIMAL sit
          along the mode's allowed claim-age range. Helps the user see
          how far off they are at a glance. */}
      <div className="mb-5">
        <div
          className="text-xs uppercase mb-2"
          style={{ color: C.inkFaint, letterSpacing: "0.12em" }}
        >
          Across the {fmtAge(earliest)}–{fmtAge(latest)} window
        </div>
        <div className="relative h-10">
          {/* track */}
          <div
            className="absolute"
            style={{
              top: "50%",
              left: 0,
              right: 0,
              height: "2px",
              backgroundColor: C.borderDark,
              transform: "translateY(-50%)",
            }}
          />
          {/* baseline marker */}
          <div
            className="absolute"
            style={{
              left: `${baselinePct}%`,
              top: "calc(50% - 8px)",
              width: "12px",
              height: "16px",
              backgroundColor: C.early,
              transform: "translateX(-50%)",
              borderRadius: "1px",
            }}
            title={`Your pick: ${fmtAge(baselineAge)}`}
          />
          {/* optimal marker */}
          <div
            className="absolute"
            style={{
              left: `${optimalPct}%`,
              top: "calc(50% - 12px)",
              width: "2px",
              height: "24px",
              backgroundColor: C.wait,
              transform: "translateX(-50%)",
            }}
            title={`Optimal: ${fmtAge(optimalAge)}`}
          />
          {/* Floating label above the optimal marker. Anchor switches at the
              edges so the text never clips off-panel or collides with the
              "62 yr / 70 yr" range labels at the bottom. */}
          <div
            className="absolute num text-xs"
            style={{
              left: `${optimalPct}%`,
              top: 0,
              transform:
                optimalPct < 8
                  ? "translateX(0)"
                  : optimalPct > 92
                  ? "translateX(-100%)"
                  : "translateX(-50%)",
              paddingLeft: optimalPct < 8 ? "6px" : 0,
              paddingRight: optimalPct > 92 ? "6px" : 0,
              color: C.wait,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {fmtAge(optimalAge)}
          </div>
        </div>
        <div
          className="flex justify-between mt-1 text-xs num"
          style={{ color: C.inkFaint }}
        >
          <span>{fmtAge(earliest)}</span>
          <span>{fmtAge(latest)}</span>
        </div>
      </div>

      {/* Second recommendation: the claim age with the highest monthly
          income once retired, drawing from both pots together (the Social
          Security check plus a level draw that spends the invested pot down
          by life expectancy). See retirementIncome in lib/optimalClaimAge. */}
      <IncomeRecommendation
        income={optimal.income}
        baselineAge={baselineAge}
        lifeExpectancy={inputs.lifeExpectancy}
        returnRate={inputs.returnRate}
        setClaimAge={setClaimAge}
      />

      {/* CTA + caveat */}
      <div
        className="pt-4 flex justify-between items-center gap-4 flex-wrap"
        style={{ borderTop: `1px solid ${C.border}` }}
      >
        <p className="text-xs max-w-md" style={{ color: C.inkFaint }}>
          Sensitive to assumptions. The optimum shifts every time you change
          the return rate, life expectancy, income, or invested pct.
        </p>
        {!alreadyOptimal && (
          <button
            onClick={() => setClaimAge(optimalAge)}
            className="btn-primary"
          >
            Use {fmtAge(optimalAge)}
          </button>
        )}
      </div>
    </div>
  );
}
