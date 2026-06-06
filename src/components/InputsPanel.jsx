import { useState } from "react";
import {
  EARNINGS_LIMIT_2026,
  EARNINGS_LIMIT_2026_FRA_YEAR,
  fmtMoney,
  fmtAge,
  fmtBig,
  fmtDuration,
  fmtIncome,
} from "../lib/benefitMath.js";
import { C } from "../constants/colors.js";
import SliderInput from "./SliderInput.jsx";
import ReturnRateSlider from "./ReturnRateSlider.jsx";
import ShareLinkButton from "./ShareLinkButton.jsx";

const MONTH_OPTIONS = [
  ["1", "Jan"],
  ["2", "Feb"],
  ["3", "Mar"],
  ["4", "Apr"],
  ["5", "May"],
  ["6", "Jun"],
  ["7", "Jul"],
  ["8", "Aug"],
  ["9", "Sep"],
  ["10", "Oct"],
  ["11", "Nov"],
  ["12", "Dec"],
];

const monthName = (month) =>
  MONTH_OPTIONS[Math.min(11, Math.max(0, Math.round(month) - 1))][1];

function monthYearAtAge({ birthMonth, birthYear, age }) {
  const totalMonths = Math.round(age * 12);
  const startMonthIndex = Math.round(birthMonth) - 1;
  const absoluteMonth = startMonthIndex + totalMonths;
  return {
    month: (absoluteMonth % 12) + 1,
    year: Math.round(birthYear) + Math.floor(absoluteMonth / 12),
  };
}

function fmtMonthYear({ month, year }) {
  return `${monthName(month)} ${year}`;
}

function NativeSelect({ label, value, onChange, options, hint }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2 gap-3">
        <label
          className="text-xs tracking-widest uppercase"
          style={{ color: C.inkSoft, letterSpacing: "0.12em" }}
        >
          {label}
        </label>
        <span className="num text-lg" style={{ color: C.ink, fontWeight: 500 }}>
          {monthName(value)}
        </span>
      </div>
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="num"
        style={{
          width: "100%",
          backgroundColor: C.surface,
          color: C.ink,
          border: `1px solid ${C.borderDark}`,
          borderRadius: "var(--radius-sm)",
          padding: "9px 10px",
          outline: "none",
        }}
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>
            {labelText}
          </option>
        ))}
      </select>
      {hint && (
        <div className="mt-1 text-xs num" style={{ color: C.inkFaint }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// Tiny "% / $" pill toggle rendered in the accessory slot of the two invest
// sliders. Underlying state stays as a percentage of the monthly net check
// (so the value still makes sense if the monthly net later changes), but the
// user can flip to "$" to type an exact dollar amount instead.
function UnitToggle({ mode, onChange }) {
  const pill = (active) => ({
    padding: "2px 9px",
    backgroundColor: active ? C.accent : C.surface,
    color: active ? C.accentOn : C.inkSoft,
    border: `1px solid ${active ? C.accent : C.border}`,
    borderRadius: "var(--radius-pill)",
    cursor: "pointer",
    fontWeight: 600,
    fontFamily: "inherit",
    fontSize: "10px",
    lineHeight: 1.4,
  });
  return (
    <span
      style={{ display: "inline-flex", gap: "3px", padding: 2 }}
      className="num"
    >
      <button
        type="button"
        onClick={() => onChange("%")}
        title="Enter as percentage of the monthly check"
        style={pill(mode === "%")}
      >
        %
      </button>
      <button
        type="button"
        onClick={() => onChange("$")}
        title="Enter as a fixed dollar amount per month (capped at the full check)"
        style={pill(mode === "$")}
      >
        $
      </button>
    </span>
  );
}

// Build the { format, editToString, parseEdit } trio for an invest slider in
// dollar-input mode. `monthly` is the monthly net check the percentage
// applies to. The underlying value stays as a 0-100 percentage; this just
// drives the click-to-edit and value display in dollars. Typed dollar
// amounts above `monthly` clamp to 100% (= the full check) per spec.
function dollarModeProps(monthly) {
  const safeMonthly = monthly > 0 ? monthly : 0;
  return {
    format: (pct) =>
      "$" +
      Math.round(safeMonthly * (pct / 100)).toLocaleString() +
      "/mo",
    editToString: (pct) =>
      String(Math.round(safeMonthly * (pct / 100))),
    parseEdit: (text) => {
      const dollars = parseFloat(text);
      if (Number.isNaN(dollars)) return null;
      if (safeMonthly <= 0) return 0;
      const pct = (dollars / safeMonthly) * 100;
      return Math.min(100, Math.max(0, pct));
    },
  };
}

// Inline link that smooth-scrolls down to the StrategyCompare panel (rendered
// below the chart in survivor/switch modes, anchored by id="strategy-compare").
// Used in the own-benefit slider's hint to tie the input to the comparison it
// feeds. Styled as a text link rather than a button so it reads inline in the
// small hint row.
function ScrollToCompareLink({ children }) {
  return (
    <button
      type="button"
      onClick={() =>
        document
          .getElementById("strategy-compare")
          ?.scrollIntoView({ behavior: "smooth", block: "start" })
      }
      style={{
        color: C.accent,
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: "inherit",
        fontWeight: 500,
        textDecoration: "underline",
        textUnderlineOffset: "2px",
      }}
    >
      {children}
    </button>
  );
}

// Display-rounded percentage: at most one decimal, strip trailing ".0" so
// whole numbers stay clean. Used by chips/labels — never for math. The $-mode
// input can land the underlying percentage on a long decimal (e.g. $500 of a
// $1,750 check → 28.571428…%) and we don't want every UI surface that quotes
// it back to look like a JavaScript dump.
function fmtPct(v) {
  return Number(v.toFixed(1)) + "%";
}

// Compact "set me to match the early-checks slider" chip, rendered in the
// wait-checks-invested slider's accessory slot. The natural reading order
// is to tune the early-checks % first (it's the slider above), so this
// only flows one way: copy investedPct → investedPctWait. When the two
// values already match it switches to a non-interactive ✓ matches early
// indicator, mirroring the OptimalClaimAgeChip pattern below.
function MatchEarlyChip({ investedPctWait, investedPct, onApply }) {
  // Tolerance-based match (≤ 0.05pp) instead of strict equality: with the
  // $-mode invest entry the underlying percentage can be a long decimal, so
  // even a fresh "match early" click followed by no other change would fail
  // === if we re-derived one side from a different code path. 0.05pp is
  // below our one-decimal display rounding, so anything that displays as
  // identical also reads as matching here.
  if (Math.abs(investedPctWait - investedPct) < 0.05) {
    return (
      <span
        className="text-xs num truncate"
        style={{ color: C.wait, fontWeight: 500 }}
        title="Wait+invest % matches the pre-FRA invested %"
      >
        ✓ matches early
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onApply(investedPct)}
      className="num truncate"
      title={`Set wait+invest to match the pre-FRA invested % (${fmtPct(investedPct)})`}
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
      → match early ({fmtPct(investedPct)})
    </button>
  );
}

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
  birthMonth,
  setBirthMonth,
  birthYear,
  setBirthYear,
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
  locality,
  setLocality,
  investedPct,
  setInvestedPct,
  // Early-invest entry unit ("%" / "$") is lifted to App so the strategy
  // comparison can honor a dollar entry across scenarios. The wait-invest
  // entry unit stays local below (the comparison doesn't use it).
  investedPctEarlyMode,
  setInvestedPctEarlyMode,
  investedPctWait,
  setInvestedPctWait,
  // healthcare-cost modeling (OBBBA / NYC) — see lib/healthcareCost.js
  coveredElsewhere,
  setCoveredElsewhere,
  unsubsidizedSilverAnnual,
  setUnsubsidizedSilverAnnual,
  // derived from projection
  earlyFactor,
  earlyMonthlyNet,
  fraMonthlyNet,
  earningsTestWithholding,
  fraYearStartAge,
  fraMonth,
  fraYear,
  fraYearMonthsBeforeFRA,
  fedMarginalRate,
  // Result of the optimal-claim-age sweep, computed at App level via
  // useOptimalClaimAge so the chip below the slider and the full panel
  // below the chart share one computation.
  optimal,
}) {
  // Wait-invest entry-unit preference. Local UI state, not URL-persisted: the
  // underlying stored value is always a percentage, so a shared link round-trips
  // identically. (The early-invest unit is lifted to App — see props above —
  // so the strategy comparison can read it.)
  const [investedPctWaitMode, setInvestedPctWaitMode] = useState("%");
  const earlyDollarProps =
    investedPctEarlyMode === "$" ? dollarModeProps(earlyMonthlyNet) : null;
  const waitDollarProps =
    investedPctWaitMode === "$" ? dollarModeProps(fraMonthlyNet) : null;
  const inFRAYearWindow = claimAge >= fraYearStartAge && claimAge < 67;
  const earningsTestLimit =
    inFRAYearWindow
      ? EARNINGS_LIMIT_2026_FRA_YEAR
      : EARNINGS_LIMIT_2026;
  const claimStart = monthYearAtAge({ birthMonth, birthYear, age: claimAge });
  const fraDate = { month: fraMonth, year: fraYear };
  const fraWindowHint =
    fraYearMonthsBeforeFRA > 0
      ? `higher test applies Jan-${monthName(fraMonth - 1)} ${fraYear}`
      : "no pre-FRA months in the FRA calendar year";

  return (
    <div className="card lg:col-span-3 p-6 md:p-7">
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
        {/* Own benefit is needed by both the switch projection AND the
            strategy comparison panel (shown in survivor mode too), so surface
            the slider in both survivor-context modes — not just switch. */}
        {mode !== "retirement" && (
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
              ) : mode === "switch" ? (
                "must be < survivor"
              ) : (
                <ScrollToCompareLink>
                  used by the strategy comparison below ↓
                </ScrollToCompareLink>
              )
            }
          />
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NativeSelect
            label="Birth month"
            value={birthMonth}
            onChange={setBirthMonth}
            options={MONTH_OPTIONS}
            hint={`FRA: ${fmtMonthYear(fraDate)} · ${fraWindowHint}`}
          />
          <SliderInput
            label="Birth year"
            value={birthYear}
            onChange={setBirthYear}
            min={1960}
            max={1980}
            step={1}
            format={(v) => String(Math.round(v))}
          />
        </div>
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
          hint={`${(earlyFactor * 100).toFixed(1).replace(/\.0$/, "")}% of full · claim starts ${fmtMonthYear(claimStart)}`}
          accessory={
            optimal ? (
              <OptimalClaimAgeChip optimal={optimal} onApply={setClaimAge} />
            ) : null
          }
        />

        <div className="section-divider" style={{ marginTop: "20px" }}>
          Outlook
        </div>
        {/* The same return-rate knob also appears inside the StrategyCompare
            and WageCompare cards below — see ReturnRateSlider for the shared
            bounds/format/hint. */}
        <ReturnRateSlider value={returnRate} onChange={setReturnRate} />
        <SliderInput
          label={
            <>
              Invest % of{" "}
              <span
                title="“Early-claim” = the scenario you're modeling: claim at the chosen age and start receiving smaller checks. This slider controls how much of every check this scenario receives — from your claim age through “Stop investing at age” — gets invested. Same fraction applies to pre-67 reduced checks and post-67 recouped checks."
                style={{
                  borderBottom: `1px dotted ${C.borderDark}`,
                  cursor: "help",
                }}
              >
                early-claim
              </span>{" "}
              checks
            </>
          }
          value={investedPct}
          onChange={setInvestedPct}
          min={0}
          max={100}
          step={5}
          format={earlyDollarProps ? earlyDollarProps.format : fmtPct}
          editToString={
            earlyDollarProps?.editToString ??
            ((v) => String(Number(v.toFixed(1))))
          }
          parseEdit={earlyDollarProps?.parseEdit}
          hint={(() => {
            const invested = earlyMonthlyNet * (investedPct / 100);
            const cash = earlyMonthlyNet - invested;
            if (investedPct === 100) return `${fmtMoney(invested)}/mo invested`;
            if (investedPct === 0) return `${fmtMoney(cash)}/mo cash`;
            return `${fmtMoney(invested)}/mo invested · ${fmtMoney(cash)}/mo cash`;
          })()}
          accessory={
            <UnitToggle
              mode={investedPctEarlyMode}
              onChange={setInvestedPctEarlyMode}
            />
          }
        />
        <SliderInput
          label={
            <>
              Invest % of{" "}
              <span
                title="“Wait-claim” = the parallel comparison scenario where the claimant waits until FRA (67) to claim and gets the larger check from then on. This slider controls how much of those post-67 checks get invested. Pre-67 the wait scenario has no checks to invest yet."
                style={{
                  borderBottom: `1px dotted ${C.borderDark}`,
                  cursor: "help",
                }}
              >
                wait-claim
              </span>{" "}
              checks
            </>
          }
          value={investedPctWait}
          onChange={setInvestedPctWait}
          min={0}
          max={100}
          step={5}
          format={waitDollarProps ? waitDollarProps.format : fmtPct}
          editToString={
            waitDollarProps?.editToString ??
            ((v) => String(Number(v.toFixed(1))))
          }
          parseEdit={waitDollarProps?.parseEdit}
          hint={(() => {
            const invested = fraMonthlyNet * (investedPctWait / 100);
            const cash = fraMonthlyNet - invested;
            if (investedPctWait === 100)
              return `${fmtMoney(invested)}/mo invested from 67`;
            if (investedPctWait === 0)
              return `${fmtMoney(cash)}/mo cash from 67`;
            return `${fmtMoney(invested)}/mo invested · ${fmtMoney(cash)}/mo cash`;
          })()}
          accessory={
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                minWidth: 0,
              }}
            >
              <UnitToggle
                mode={investedPctWaitMode}
                onChange={setInvestedPctWaitMode}
              />
              <MatchEarlyChip
                investedPctWait={investedPctWait}
                investedPct={investedPct}
                onApply={setInvestedPctWait}
              />
            </span>
          }
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
              : claimAge >= 67
              ? "no test (post-FRA)"
              : inFRAYearWindow && grossIncome > earningsTestLimit
              ? "no withholding after pre-FRA-month proration"
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
              className={`chip-toggle${autoTax ? " chip-toggle-active" : ""}`}
              aria-pressed={autoTax}
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
              "--pct": `${(fedMarginalRate / 37) * 100}%`,
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

        <div>
          <div className="flex justify-between items-baseline mb-2">
            <label
              className="text-xs tracking-widest uppercase"
              style={{ color: C.inkSoft, letterSpacing: "0.12em" }}
            >
              State / city (on wages)
            </label>
            <span
              className="num text-lg"
              style={{ color: C.ink, fontWeight: 500 }}
            >
              {locality === "nyc"
                ? "NYC"
                : locality === "ny"
                ? "NY State"
                : "None"}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              ["none", "None"],
              ["ny", "NY State"],
              ["nyc", "NYC"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setLocality(value)}
                className={`chip-toggle${
                  locality === value ? " chip-toggle-active" : ""
                }`}
                aria-pressed={locality === value}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="text-xs mt-2" style={{ color: C.inkFaint }}>
            {locality === "none"
              ? "no state/city income tax on wages"
              : "NY/NYC tax wages (not SS) — shown in the take-home figures"}
          </div>
        </div>

        <div className="section-divider" style={{ marginTop: "20px" }}>
          Healthcare (NYC, 2026+)
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <button
              onClick={() => setCoveredElsewhere(!coveredElsewhere)}
              className={`chip-toggle${
                coveredElsewhere ? " chip-toggle-active" : ""
              }`}
              aria-pressed={coveredElsewhere}
              title="Skip ACA / Medicare cost modeling — pick this if you have employer coverage, retiree health benefits, VA care, or are covered through a working spouse"
            >
              {coveredElsewhere ? "● Covered elsewhere" : "○ Covered elsewhere"}
            </button>
            <span className="text-xs" style={{ color: C.inkFaint }}>
              {coveredElsewhere
                ? "OBBBA cliffs ignored — assumes employer / retiree / VA / spouse coverage"
                : "models ACA pre-65 + Medicare IRMAA at 65+"}
            </span>
          </div>
        </div>
        {!coveredElsewhere && (
          <SliderInput
            label="Unsubsidized silver plan (annual)"
            value={unsubsidizedSilverAnnual}
            onChange={setUnsubsidizedSilverAnnual}
            min={0}
            max={30000}
            step={100}
            format={(v) => "$" + v.toLocaleString() + "/yr"}
            hint="default: NYC LCSP $9,679 (NY State of Health 2026)"
          />
        )}
      </div>
    </div>
  );
}
