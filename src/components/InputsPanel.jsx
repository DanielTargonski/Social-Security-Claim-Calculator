import {
  EARNINGS_LIMIT_2026,
  fmtMoney,
  fmtAge,
  fmtBig,
  fmtDuration,
  fmtIncome,
} from "../lib/benefitMath.js";
import { C } from "../constants/colors.js";
import SliderInput from "./SliderInput.jsx";
import ShareLinkButton from "./ShareLinkButton.jsx";

// Compact "the optimum is over here" chip, rendered inline in the
// claim-age slider's header row (between the label and the value
// display). Surfaces the result of the full optimal-age sweep
// (computed once at App level via useOptimalClaimAge, shared with the
// big OptimalClaimAge panel below the chart) so the user sees it
// immediately while dragging the slider. Click applies the optimum.
function OptimalClaimAgeChip({ optimal, onApply }) {
  const { optimalAge, optimalScore, baselineAge, baselineScore } = optimal;
  const ageGapMonths = Math.abs(optimalAge - baselineAge) * 12;
  const atOptimum = ageGapMonths < 0.5;
  const delta = optimalScore - baselineScore;
  if (atOptimum) {
    return (
      <span
        className="text-xs num truncate"
        style={{ color: C.wait, fontWeight: 500 }}
        title="No claim age in the allowed range beats your current pick"
      >
        ✓ at optimum
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onApply(optimalAge)}
      className="num truncate"
      title={`Apply optimal claim age: ${fmtAge(optimalAge)}`}
      style={{
        color: C.wait,
        backgroundColor: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontSize: "11px",
        fontWeight: 500,
        fontFamily: "inherit",
      }}
    >
      → optimal {fmtAge(optimalAge)} · +{fmtBig(delta)}
    </button>
  );
}

// All input controls live here: benefits, outlook, income & tax. The earliest/
// latest claim-age bounds depend on `mode` and are computed by the caller and
// passed in. The same is true for `earlyFactor`, `earningsTestWithholding`, and
// `fedMarginalRate` — those come from the projection result.
export default function InputsPanel({
  mode,
  primaryBenefitLabel,
  earliest,
  latest,
  // input state
  fraBenefit,
  setFraBenefit,
  ownBenefit,
  setOwnBenefit,
  claimAge,
  setClaimAge,
  returnRate,
  setReturnRate,
  investStopAge,
  setInvestStopAge,
  // lifeExpectancy bounds the invest-stop slider's visible max — see below.
  lifeExpectancy,
  setLifeExpectancy,
  grossIncome,
  setGrossIncome,
  postFRAGrossIncome,
  setPostFRAGrossIncome,
  postFRAWorkYears,
  setPostFRAWorkYears,
  autoTax,
  setAutoTax,
  setManualFedRate,
  investedPct,
  setInvestedPct,
  // derived from projection
  earlyFactor,
  earlyMonthlyNet,
  earningsTestWithholding,
  fedMarginalRate,
  // Result of the optimal-claim-age sweep, computed at App level via
  // useOptimalClaimAge so the chip below the slider and the full panel
  // below the chart share one computation.
  optimal,
}) {
  return (
    <div
      className="lg:col-span-3 p-6 md:p-7"
      style={{
        backgroundColor: C.paper,
        border: `1px solid ${C.border}`,
      }}
    >
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h3 className="display text-xl" style={{ color: C.ink }}>
          <em>Inputs</em>
        </h3>
        <ShareLinkButton />
      </div>
      <div className="space-y-5">
        <div className="section-divider">Benefits</div>
        <SliderInput
          label={primaryBenefitLabel}
          value={fraBenefit}
          onChange={setFraBenefit}
          min={500}
          max={5000}
          step={50}
          format={(v) => "$" + v.toLocaleString() + "/mo"}
        />
        {mode === "switch" && (
          <SliderInput
            label="Own retirement at 67"
            value={ownBenefit}
            onChange={setOwnBenefit}
            min={300}
            max={4000}
            step={50}
            format={(v) => "$" + v.toLocaleString() + "/mo"}
            hint={
              ownBenefit >= fraBenefit ? (
                <span style={{ color: C.early, fontWeight: 500 }}>
                  above survivor — switching is a downgrade
                </span>
              ) : (
                "must be < survivor"
              )
            }
          />
        )}
        <SliderInput
          label={
            mode === "switch"
              ? "Claim own retirement at age"
              : "Claim age  (FRA = 67)"
          }
          value={claimAge}
          onChange={setClaimAge}
          min={earliest}
          max={latest}
          step={1 / 12}
          format={fmtAge}
          hint={`${(earlyFactor * 100).toFixed(1).replace(/\.0$/, "")}% of full`}
          accessory={
            optimal ? (
              <OptimalClaimAgeChip optimal={optimal} onApply={setClaimAge} />
            ) : null
          }
        />

        <div className="section-divider" style={{ marginTop: "20px" }}>
          Outlook
        </div>
        <SliderInput
          label="Annual real return invested"
          value={returnRate}
          onChange={setReturnRate}
          min={0}
          max={10}
          step={0.5}
          format={(v) => v.toFixed(1) + "%"}
          hint={returnRate === 7 ? "S&P 500 historical" : ""}
        />
        <SliderInput
          label="Invest pct of early checks"
          value={investedPct}
          onChange={setInvestedPct}
          min={0}
          max={100}
          step={5}
          format={(v) => v + "%"}
          hint={(() => {
            const invested = earlyMonthlyNet * (investedPct / 100);
            const cash = earlyMonthlyNet - invested;
            if (investedPct === 100) return `${fmtMoney(invested)}/mo invested`;
            if (investedPct === 0) return `${fmtMoney(cash)}/mo cash`;
            return `${fmtMoney(invested)}/mo invested · ${fmtMoney(cash)}/mo cash`;
          })()}
        />
        <SliderInput
          label="Stop investing at age"
          value={investStopAge}
          onChange={setInvestStopAge}
          min={Math.max(60, Math.ceil(claimAge))}
          max={Math.min(85, lifeExpectancy)}
          step={1}
          format={fmtAge}
          hint="checks spent as cash income after this age"
        />
        <SliderInput
          label="Live until"
          value={lifeExpectancy}
          onChange={setLifeExpectancy}
          min={70}
          max={100}
          step={1 / 12}
          format={(v) => "age " + fmtAge(v)}
        />

        <div className="section-divider" style={{ marginTop: "20px" }}>
          Income & Tax
        </div>
        <SliderInput
          label="Gross wage income (pre-67)"
          value={grossIncome}
          onChange={setGrossIncome}
          min={0}
          max={100000}
          typeMax={500000}
          step={1000}
          format={fmtIncome}
          hint={
            earningsTestWithholding > 0
              ? `−${fmtMoney(earningsTestWithholding)}/yr SS withheld`
              : grossIncome > EARNINGS_LIMIT_2026
              ? "no test (post-FRA)"
              : "no earnings test"
          }
        />
        <SliderInput
          label="Gross wage income (post-67)"
          value={postFRAGrossIncome}
          onChange={setPostFRAGrossIncome}
          min={0}
          max={100000}
          typeMax={500000}
          step={1000}
          format={fmtIncome}
          hint="affects fed tax on SS, not benefits"
        />
        <SliderInput
          label="Years working post-67"
          value={postFRAWorkYears}
          onChange={setPostFRAWorkYears}
          min={0}
          max={15}
          step={1 / 12}
          // Show both the duration AND the resulting retirement age so the
          // user doesn't have to do "67 + 5 yr 3 mo" math in their head.
          // Special-case 0 to avoid the awkward "0 mo → 67 yr" reading.
          format={(v) =>
            v < 1 / 24
              ? "Retired at 67"
              : `${fmtDuration(v)} → ${fmtAge(67 + v)}`
          }
          hint={
            postFRAGrossIncome > 0 && postFRAWorkYears < 1 / 24
              ? "post-67 income above won't apply at 0 work years"
              : postFRAGrossIncome === 0
              ? "no effect while post-67 income is $0"
              : "post-67 income drops to $0 at retirement"
          }
        />
        <div>
          <div className="flex justify-between items-baseline mb-2">
            <label
              className="text-xs tracking-widest uppercase"
              style={{ color: C.inkSoft, letterSpacing: "0.12em" }}
            >
              Federal marginal tax rate
            </label>
            <span
              className="num text-lg"
              style={{ color: C.ink, fontWeight: 500 }}
            >
              {fedMarginalRate}%
            </span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => setAutoTax(!autoTax)}
              className="num"
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.15em",
                padding: "4px 10px",
                backgroundColor: autoTax ? C.ink : "transparent",
                color: autoTax ? C.bg : C.ink,
                border: `1px solid ${C.ink}`,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              {autoTax ? "● Auto" : "○ Auto"}
            </button>
            <span className="text-xs" style={{ color: C.inkFaint }}>
              {autoTax
                ? `derived from income · 2026 brackets`
                : "manual override"}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={37}
            step={1}
            value={fedMarginalRate}
            onChange={(e) => setManualFedRate(parseFloat(e.target.value))}
            disabled={autoTax}
            style={{
              width: "100%",
              opacity: autoTax ? 0.4 : 1,
              cursor: autoTax ? "not-allowed" : "pointer",
            }}
          />
          <div
            className="flex justify-between mt-1 text-xs num"
            style={{ color: C.inkFaint }}
          >
            <span>0%</span>
            <span style={{ color: C.inkSoft }}>NY & NYC don't tax SS</span>
            <span>37%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
