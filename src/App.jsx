import { useState, useMemo } from "react";
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

const C = {
  bg: "#EFE7D6",
  paper: "#F7F0DE",
  border: "#D9CBAE",
  borderDark: "#A89677",
  ink: "#181410",
  inkSoft: "#5C4F3D",
  inkFaint: "#9A8B72",
  early: "#A02B2B",
  earlySoft: "#C97070",
  wait: "#1F4D3F",
  cross: "#B8860B",
};

const EARNINGS_LIMIT_2026 = 24480;

function SliderInput({ label, value, onChange, min, max, step, format, hint }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const startEdit = () => {
    setDraft(String(value));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseFloat(draft);
    if (!Number.isNaN(parsed)) {
      const clamped = Math.min(max, Math.max(min, parsed));
      onChange(clamped);
    }
    setEditing(false);
  };

  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <label
          className="text-xs tracking-widest uppercase"
          style={{ color: C.inkSoft, letterSpacing: "0.12em" }}
        >
          {label}
        </label>
        {editing ? (
          <input
            type="number"
            autoFocus
            className="num"
            value={draft}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") setEditing(false);
            }}
            style={{
              color: C.ink,
              fontWeight: 500,
              backgroundColor: C.bg,
              border: `1px solid ${C.borderDark}`,
              padding: "2px 8px",
              width: "9rem",
              textAlign: "right",
              fontSize: "1.125rem",
              outline: "none",
            }}
          />
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="num text-lg"
            title="Click to type an exact value"
            style={{
              color: C.ink,
              fontWeight: 500,
              background: "transparent",
              border: "none",
              padding: "2px 6px",
              margin: "-2px -6px",
              cursor: "text",
              fontSize: "1.125rem",
              borderBottom: `1px dashed ${C.borderDark}`,
              fontFamily: "inherit",
            }}
          >
            {format(value)}
          </button>
        )}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%" }}
      />
      <div
        className="flex justify-between mt-1 text-xs num"
        style={{ color: C.inkFaint }}
      >
        <span>{format(min)}</span>
        {hint && <span style={{ color: C.inkSoft }}>{hint}</span>}
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState("retirement");
  const [fraBenefit, setFraBenefit] = useState(2500);
  const [ownBenefit, setOwnBenefit] = useState(1500);
  const [claimAge, setClaimAge] = useState(62);
  const [returnRate, setReturnRate] = useState(7);
  const [investStopAge, setInvestStopAge] = useState(67);
  const [lifeExpectancy, setLifeExpectancy] = useState(85);
  const [grossIncome, setGrossIncome] = useState(0);
  const [autoTax, setAutoTax] = useState(true);
  const [manualFedRate, setManualFedRate] = useState(12);

  const FRA = 67;

  let earliest, latest;
  if (mode === "retirement") {
    earliest = 62;
    latest = 70;
  } else if (mode === "survivor") {
    earliest = 60;
    latest = 67;
  } else {
    earliest = 62;
    latest = 66.5;
  }

  const switchMode = (newMode) => {
    setMode(newMode);
    if (newMode === "survivor") {
      if (claimAge < 60) setClaimAge(60);
      if (claimAge > 67) setClaimAge(65);
    } else if (newMode === "switch") {
      if (claimAge < 62) setClaimAge(62);
      if (claimAge > 66.5) setClaimAge(64);
    } else {
      if (claimAge < 62) setClaimAge(62);
      if (claimAge > 70) setClaimAge(70);
    }
  };

  function retirementFactor(age) {
    if (age >= 70) return 1.24;
    if (age >= 67) return 1 + (age - 67) * 0.08;
    const monthsEarly = (67 - age) * 12;
    let reduction;
    if (monthsEarly <= 36) {
      reduction = (monthsEarly * (5 / 9)) / 100;
    } else {
      reduction = (36 * (5 / 9)) / 100 + ((monthsEarly - 36) * (5 / 12)) / 100;
    }
    return 1 - reduction;
  }

  function survivorFactor(age) {
    if (age >= 67) return 1.0;
    if (age < 60) return 0;
    const monthsEarly = (67 - age) * 12;
    return 1 - monthsEarly * (0.285 / 84);
  }

  let earlyFactor, earlyMonthlyGross, fraMonthlyGross, earlyPostFRAMonthlyGross;

  if (mode === "retirement") {
    earlyFactor = retirementFactor(claimAge);
    earlyMonthlyGross = fraBenefit * earlyFactor;
    fraMonthlyGross = fraBenefit;
    earlyPostFRAMonthlyGross = earlyMonthlyGross;
  } else if (mode === "survivor") {
    earlyFactor = survivorFactor(claimAge);
    earlyMonthlyGross = fraBenefit * earlyFactor;
    fraMonthlyGross = fraBenefit;
    earlyPostFRAMonthlyGross = earlyMonthlyGross;
  } else {
    earlyFactor = retirementFactor(claimAge);
    earlyMonthlyGross = ownBenefit * earlyFactor;
    fraMonthlyGross = fraBenefit;
    earlyPostFRAMonthlyGross = fraBenefit;
  }

  // Earnings test (2026: $24,480 limit pre-FRA, $1 withheld per $2 over)
  const annualEarlyGross = earlyMonthlyGross * 12;
  let earningsTestWithholding = 0;
  if (claimAge < FRA && grossIncome > EARNINGS_LIMIT_2026) {
    const excess = grossIncome - EARNINGS_LIMIT_2026;
    earningsTestWithholding = Math.min(excess / 2, annualEarlyGross);
  }
  const earlyMonthlyAfterET = (annualEarlyGross - earningsTestWithholding) / 12;

  // Federal tax: auto-compute marginal bracket from income, OR use manual override.
  // Combined income (= AGI + 0.5 × SS) determines what % of SS is taxable.
  // Then bracket on (wage + taxable SS - standard deduction $16,100) gives marginal rate.
  const ssBasisAnnual = fraMonthlyGross * 12; // use full benefit as basis for tax tier
  const combinedIncome = grossIncome + 0.5 * ssBasisAnnual;
  let taxableSSPct;
  if (ssBasisAnnual <= 0) {
    taxableSSPct = 0;
  } else if (combinedIncome <= 25000) {
    taxableSSPct = 0;
  } else if (combinedIncome <= 34000) {
    const taxable = Math.min(0.5 * ssBasisAnnual, 0.5 * (combinedIncome - 25000));
    taxableSSPct = taxable / ssBasisAnnual;
  } else {
    const taxable = Math.min(
      0.85 * ssBasisAnnual,
      0.5 * 9000 + 0.85 * (combinedIncome - 34000)
    );
    taxableSSPct = taxable / ssBasisAnnual;
  }

  // 2026 single-filer brackets (using $16,100 standard deduction)
  const taxableIncome = Math.max(
    0,
    grossIncome + taxableSSPct * ssBasisAnnual - 16100
  );
  let autoMarginalRate;
  if (taxableIncome <= 12400) autoMarginalRate = 10;
  else if (taxableIncome <= 50400) autoMarginalRate = 12;
  else if (taxableIncome <= 105700) autoMarginalRate = 22;
  else if (taxableIncome <= 201775) autoMarginalRate = 24;
  else if (taxableIncome <= 256225) autoMarginalRate = 32;
  else if (taxableIncome <= 640600) autoMarginalRate = 35;
  else autoMarginalRate = 37;

  const fedMarginalRate = autoTax ? autoMarginalRate : manualFedRate;
  // When auto, use tier-aware effective rate. When manual, assume 85% taxable.
  const ssEffectiveTaxRate = autoTax
    ? taxableSSPct * (fedMarginalRate / 100)
    : 0.85 * (manualFedRate / 100);

  const earlyMonthlyNet = earlyMonthlyAfterET * (1 - ssEffectiveTaxRate);
  const earlyPostFRAMonthlyNet =
    earlyPostFRAMonthlyGross * (1 - ssEffectiveTaxRate);
  const fraMonthlyNet = fraMonthlyGross * (1 - ssEffectiveTaxRate);

  const chartData = useMemo(() => {
    const data = [];
    const r = returnRate / 100 / 12;
    const startAge = Math.min(claimAge, FRA);

    // Investing has up to two contribution rates:
    //   Phase 1: claimAge → min(FRA, investStopAge)  contributing earlyMonthlyNet (after earnings test)
    //   Phase 2: FRA → investStopAge                 contributing earlyPostFRAMonthlyNet (no test)
    //   Phase 3: investStopAge → lifeExpectancy      pot grows untouched, cash collected as income
    const phase1End = Math.min(FRA, Math.max(claimAge, investStopAge));
    const phase1Months = Math.max(0, (phase1End - claimAge) * 12);
    const phase2Months = Math.max(0, (investStopAge - phase1End) * 12);

    const potAtPhase1End =
      r > 0
        ? (earlyMonthlyNet * (Math.pow(1 + r, phase1Months) - 1)) / r
        : earlyMonthlyNet * phase1Months;

    const potAtInvestStop =
      r > 0
        ? potAtPhase1End * Math.pow(1 + r, phase2Months) +
          (earlyPostFRAMonthlyNet * (Math.pow(1 + r, phase2Months) - 1)) / r
        : potAtPhase1End + earlyPostFRAMonthlyNet * phase2Months;

    for (let age = startAge; age <= lifeExpectancy; age += 0.25) {
      let early = 0;
      let pot = 0;
      if (age >= claimAge) {
        if (age <= phase1End) {
          // Phase 1: invest the (post-ET) early check
          const n = (age - claimAge) * 12;
          const lump =
            r > 0
              ? (earlyMonthlyNet * (Math.pow(1 + r, n) - 1)) / r
              : earlyMonthlyNet * n;
          pot = lump;
          early = lump;
        } else if (age <= investStopAge) {
          // Phase 2: continue investing past FRA at the post-FRA rate
          const n = (age - phase1End) * 12;
          const grown = potAtPhase1End * Math.pow(1 + r, n);
          const newContrib =
            r > 0
              ? (earlyPostFRAMonthlyNet * (Math.pow(1 + r, n) - 1)) / r
              : earlyPostFRAMonthlyNet * n;
          pot = grown + newContrib;
          early = pot;
        } else {
          // Phase 3: pot keeps compounding, checks now collected as cash
          const monthsAfterStop = (age - investStopAge) * 12;
          const potNow = potAtInvestStop * Math.pow(1 + r, monthsAfterStop);
          const cashCollected = earlyPostFRAMonthlyNet * monthsAfterStop;
          pot = potNow;
          early = potNow + cashCollected;
        }
      }

      let wait = 0;
      if (age >= FRA) {
        const n = (age - FRA) * 12;
        wait = fraMonthlyNet * n;
      }

      data.push({
        age: parseFloat(age.toFixed(2)),
        early: Math.round(early),
        pot: Math.round(pot),
        wait: Math.round(wait),
      });
    }
    return data;
  }, [
    claimAge,
    fraBenefit,
    ownBenefit,
    returnRate,
    lifeExpectancy,
    investStopAge,
    mode,
    earlyMonthlyNet,
    fraMonthlyNet,
    earlyPostFRAMonthlyNet,
  ]);

  const breakEvenAge = useMemo(() => {
    if (mode === "switch") return null;
    if (Math.abs(claimAge - FRA) < 0.01) return null;
    for (let i = 1; i < chartData.length; i++) {
      const a = chartData[i - 1];
      const b = chartData[i];
      const prevDiff = a.early - a.wait;
      const currDiff = b.early - b.wait;
      if (prevDiff * currDiff < 0) {
        const t = prevDiff / (prevDiff - currDiff);
        return parseFloat((a.age + t * (b.age - a.age)).toFixed(1));
      }
    }
    return null;
  }, [chartData, claimAge, mode]);

  const finalEarly = chartData[chartData.length - 1]?.early || 0;
  const finalWait = chartData[chartData.length - 1]?.wait || 0;
  const finalPot = chartData[chartData.length - 1]?.pot || 0;
  const advantage = finalEarly - finalWait;
  const potAtFRARow = chartData.find((d) => d.age >= FRA)?.pot || 0;
  const potAtStopRow = chartData.find((d) => d.age >= investStopAge)?.pot || 0;

  const fmtMoney = (v) =>
    "$" + Math.round(v).toLocaleString("en-US", { maximumFractionDigits: 0 });
  const fmtBig = (v) => {
    const abs = Math.abs(v);
    if (abs >= 1_000_000) return "$" + (v / 1_000_000).toFixed(2) + "M";
    if (abs >= 1000) return "$" + (v / 1000).toFixed(0) + "K";
    return "$" + Math.round(v);
  };
  const fmtAge = (v) => (v % 1 === 0 ? v + " yr" : v.toFixed(1) + " yr");
  const fmtIncome = (v) =>
    v === 0 ? "Not working" : "$" + v.toLocaleString() + "/yr";

  const primaryBenefitLabel =
    mode === "retirement"
      ? "Your benefit at 67"
      : mode === "survivor"
      ? "Survivor benefit at 67"
      : "Survivor benefit at 67";

  const taxesActive = grossIncome > 0 || fedMarginalRate > 0;

  return (
    <div
      style={{
        backgroundColor: C.bg,
        minHeight: "100vh",
        fontFamily: "'Fraunces', Georgia, serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=JetBrains+Mono:wght@400;500;600&display=swap');

        .num { font-family: 'JetBrains Mono', monospace; font-feature-settings: "tnum"; }
        .display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }

        body { background: ${C.bg}; }

        input[type="range"] {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 2px;
          background: ${C.borderDark};
          outline: none;
          cursor: pointer;
        }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px; height: 22px;
          background: ${C.ink};
          cursor: pointer;
          border-radius: 50%;
          border: 4px solid ${C.bg};
          box-shadow: 0 0 0 1px ${C.ink};
          transition: transform 0.15s ease;
        }
        input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.15); }
        input[type="range"]::-moz-range-thumb {
          width: 22px; height: 22px;
          background: ${C.ink};
          cursor: pointer;
          border-radius: 50%;
          border: 4px solid ${C.bg};
          box-shadow: 0 0 0 1px ${C.ink};
        }

        .grain {
          position: absolute; inset: 0; pointer-events: none; opacity: 0.4;
          background-image: radial-gradient(${C.borderDark} 0.5px, transparent 0.5px);
          background-size: 3px 3px;
          mix-blend-mode: multiply;
        }

        .mode-btn {
          padding: 8px 16px;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.15em;
          font-weight: 500;
          font-family: 'JetBrains Mono', monospace;
          transition: all 0.2s ease;
          background: transparent;
          border: none;
          cursor: pointer;
          color: ${C.ink};
        }
        .mode-btn-active {
          background: ${C.ink};
          color: ${C.bg};
        }

        .section-divider {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: ${C.inkFaint};
          padding-top: 8px;
          padding-bottom: 4px;
          border-bottom: 1px solid ${C.border};
          margin-bottom: 4px;
        }
      `}</style>

      <div style={{ position: "relative" }}>
        <div className="grain" />

        <div className="max-w-5xl mx-auto px-5 py-8 md:py-12 relative">
          <div className="mb-8 md:mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div
                style={{
                  width: "48px",
                  height: "1px",
                  backgroundColor: C.ink,
                }}
              />
              <span
                className="num text-xs uppercase"
                style={{ color: C.inkSoft, letterSpacing: "0.22em" }}
              >
                Vol. III &nbsp;·&nbsp; The Claim Calculator
              </span>
            </div>
            <h1
              className="display leading-[0.95]"
              style={{
                color: C.ink,
                fontSize: "clamp(2.5rem, 7vw, 4.25rem)",
                fontWeight: 300,
                fontVariationSettings: '"SOFT" 50',
              }}
            >
              Take it now,
              <br />
              <span
                style={{
                  fontStyle: "italic",
                  fontWeight: 400,
                  color: C.early,
                }}
              >
                or wait for more.
              </span>
            </h1>
            <p
              className="mt-5 text-sm md:text-base leading-relaxed max-w-xl"
              style={{ color: C.inkSoft }}
            >
              A break-even study of Social Security claiming. Each early check
              after taxes and earnings test is invested until {investStopAge}. After {investStopAge} the
              pot keeps compounding while net checks come in as cash to enjoy.
            </p>
          </div>

          <div
            className="inline-flex p-1 mb-6 flex-wrap"
            style={{
              backgroundColor: C.paper,
              border: `1px solid ${C.border}`,
            }}
          >
            <button
              onClick={() => switchMode("retirement")}
              className={`mode-btn ${mode === "retirement" ? "mode-btn-active" : ""}`}
            >
              Retirement
            </button>
            <button
              onClick={() => switchMode("survivor")}
              className={`mode-btn ${mode === "survivor" ? "mode-btn-active" : ""}`}
            >
              Survivor (Widow)
            </button>
            <button
              onClick={() => switchMode("switch")}
              className={`mode-btn ${mode === "switch" ? "mode-btn-active" : ""}`}
            >
              Own → Survivor
            </button>
          </div>

          {mode === "switch" && (
            <div
              className="mb-6 p-4 text-xs leading-relaxed"
              style={{
                backgroundColor: C.paper,
                border: `1px solid ${C.border}`,
                borderLeft: `3px solid ${C.cross}`,
                color: C.inkSoft,
              }}
            >
              <span
                className="display"
                style={{ color: C.ink, fontStyle: "italic", fontSize: "13px" }}
              >
                The widow's switch.
              </span>{" "}
              Claim her own reduced retirement benefit early, invest those
              checks until 67, then switch to the full 100% survivor benefit at
              FRA. The own retirement reduction is permanent on that record but
              irrelevant once she switches. The survivor benefit is unaffected
              by claiming her own benefit early.
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">
            <div
              className="lg:col-span-3 p-6 md:p-7"
              style={{
                backgroundColor: C.paper,
                border: `1px solid ${C.border}`,
              }}
            >
              <div className="flex items-baseline justify-between mb-6">
                <h3 className="display text-xl" style={{ color: C.ink }}>
                  <em>Inputs</em>
                </h3>
                <span
                  className="num text-xs uppercase"
                  style={{ color: C.inkFaint, letterSpacing: "0.15em" }}
                >
                  Drag to explore
                </span>
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
                    label="Her own retirement at 67"
                    value={ownBenefit}
                    onChange={setOwnBenefit}
                    min={300}
                    max={4000}
                    step={50}
                    format={(v) => "$" + v.toLocaleString() + "/mo"}
                    hint="must be < survivor"
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
                  step={0.5}
                  format={fmtAge}
                  hint={`${(earlyFactor * 100).toFixed(0)}% of full`}
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
                  label="Stop investing at age"
                  value={investStopAge}
                  onChange={setInvestStopAge}
                  min={Math.max(60, Math.floor(claimAge))}
                  max={85}
                  step={1}
                  format={fmtAge}
                  hint={investStopAge === 67 ? "default = FRA" : "checks become cash after"}
                />
                <SliderInput
                  label="Live until"
                  value={lifeExpectancy}
                  onChange={setLifeExpectancy}
                  min={70}
                  max={100}
                  step={1}
                  format={(v) => "age " + v}
                />

                <div className="section-divider" style={{ marginTop: "20px" }}>
                  Income & Tax
                </div>
                <SliderInput
                  label="Gross wage income (pre-67)"
                  value={grossIncome}
                  onChange={setGrossIncome}
                  min={0}
                  max={150000}
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
                    <span
                      className="text-xs"
                      style={{ color: C.inkFaint }}
                    >
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
                    <span style={{ color: C.inkSoft }}>
                      NY & NYC don't tax SS
                    </span>
                    <span>37%</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-1 gap-5">
              <div
                className="p-5"
                style={{
                  backgroundColor: C.paper,
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${C.early}`,
                }}
              >
                <div
                  className="text-xs uppercase mb-2"
                  style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
                >
                  Net check at {claimAge}
                </div>
                <div
                  className="num"
                  style={{
                    color: C.early,
                    fontSize: "1.875rem",
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                >
                  {fmtMoney(earlyMonthlyNet)}
                </div>
                <div
                  className="text-xs num mt-2"
                  style={{ color: C.inkFaint }}
                >
                  {fmtMoney(earlyMonthlyNet * 12)}/yr net
                  {earningsTestWithholding > 0 && (
                    <>
                      {" "}
                      ·{" "}
                      <span style={{ color: C.early }}>
                        −{fmtMoney(earningsTestWithholding)}/yr withheld
                      </span>
                    </>
                  )}
                  <br />
                  {fmtMoney(earlyMonthlyGross)} gross
                  {earningsTestWithholding > 0 && (
                    <>
                      {" "}
                      · −{fmtMoney(earningsTestWithholding / 12)}/mo earnings test
                    </>
                  )}
                  {mode === "switch" && (
                    <>
                      <br />
                      then {fmtMoney(fraMonthlyNet)} net from 67
                    </>
                  )}
                </div>
              </div>

              <div
                className="p-5"
                style={{
                  backgroundColor: C.paper,
                  border: `1px solid ${C.border}`,
                  borderLeft: `3px solid ${C.wait}`,
                }}
              >
                <div
                  className="text-xs uppercase mb-2"
                  style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
                >
                  Net check at 67
                </div>
                <div
                  className="num"
                  style={{
                    color: C.wait,
                    fontSize: "1.875rem",
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                >
                  {fmtMoney(fraMonthlyNet)}
                </div>
                <div
                  className="text-xs num mt-2"
                  style={{ color: C.inkFaint }}
                >
                  {fmtMoney(fraMonthlyNet * 12)}/yr net
                  <br />
                  {fmtMoney(fraMonthlyGross)} gross
                </div>
              </div>

              <div
                className="p-5 col-span-2 lg:col-span-1"
                style={{
                  backgroundColor: C.ink,
                  color: C.paper,
                }}
              >
                <div
                  className="text-xs uppercase mb-2"
                  style={{ color: C.inkFaint, letterSpacing: "0.15em" }}
                >
                  {mode === "switch" ? `Pot at ${investStopAge} (pure upside)` : "Crossover age"}
                </div>
                <div
                  className="num"
                  style={{ fontSize: "1.875rem", fontWeight: 600, lineHeight: 1 }}
                >
                  {mode === "switch"
                    ? fmtBig(potAtStopRow)
                    : breakEvenAge
                    ? `${breakEvenAge}`
                    : "—"}
                </div>
                <div
                  className="text-xs num mt-2"
                  style={{ color: C.inkFaint }}
                >
                  {mode === "switch"
                    ? `from investing through ${investStopAge}`
                    : breakEvenAge
                    ? "where the lines meet"
                    : "no crossover in range"}
                </div>
              </div>
            </div>
          </div>

          {(earningsTestWithholding > 0 || ssEffectiveTaxRate > 0 || autoTax) && (
            <div
              className="mb-5 p-4 text-xs flex flex-wrap gap-x-6 gap-y-2"
              style={{
                backgroundColor: C.paper,
                border: `1px solid ${C.border}`,
                color: C.inkSoft,
              }}
            >
              {earningsTestWithholding > 0 && (
                <>
                  <div>
                    <span
                      className="num uppercase"
                      style={{
                        color: C.inkFaint,
                        letterSpacing: "0.15em",
                        fontSize: "10px",
                      }}
                    >
                      Annual SS (after test)
                    </span>{" "}
                    <span
                      className="num"
                      style={{ color: C.ink, fontWeight: 500 }}
                    >
                      {fmtMoney(annualEarlyGross - earningsTestWithholding)}
                    </span>
                  </div>
                  <div>
                    <span
                      className="num uppercase"
                      style={{
                        color: C.inkFaint,
                        letterSpacing: "0.15em",
                        fontSize: "10px",
                      }}
                    >
                      Earnings test (annual)
                    </span>{" "}
                    <span
                      className="num"
                      style={{ color: C.early, fontWeight: 500 }}
                    >
                      −{fmtMoney(earningsTestWithholding)}
                    </span>
                  </div>
                </>
              )}
              {autoTax && (
                <>
                  <div>
                    <span
                      className="num uppercase"
                      style={{
                        color: C.inkFaint,
                        letterSpacing: "0.15em",
                        fontSize: "10px",
                      }}
                    >
                      Combined income
                    </span>{" "}
                    <span
                      className="num"
                      style={{ color: C.ink, fontWeight: 500 }}
                    >
                      {fmtMoney(combinedIncome)}
                    </span>
                  </div>
                  <div>
                    <span
                      className="num uppercase"
                      style={{
                        color: C.inkFaint,
                        letterSpacing: "0.15em",
                        fontSize: "10px",
                      }}
                    >
                      Taxable SS portion
                    </span>{" "}
                    <span
                      className="num"
                      style={{ color: C.ink, fontWeight: 500 }}
                    >
                      {(taxableSSPct * 100).toFixed(0)}%
                    </span>
                  </div>
                </>
              )}
              {ssEffectiveTaxRate > 0 && (
                <div>
                  <span
                    className="num uppercase"
                    style={{
                      color: C.inkFaint,
                      letterSpacing: "0.15em",
                      fontSize: "10px",
                    }}
                  >
                    Effective fed tax on SS
                  </span>{" "}
                  <span
                    className="num"
                    style={{ color: C.ink, fontWeight: 500 }}
                  >
                    {(ssEffectiveTaxRate * 100).toFixed(1)}%
                  </span>
                </div>
              )}
              <div>
                <span
                  className="num uppercase"
                  style={{
                    color: C.inkFaint,
                    letterSpacing: "0.15em",
                    fontSize: "10px",
                  }}
                >
                  NY + NYC on SS
                </span>{" "}
                <span
                  className="num"
                  style={{ color: C.wait, fontWeight: 500 }}
                >
                  $0 · exempt
                </span>
              </div>
            </div>
          )}

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
                <p
                  className="text-xs mt-1 max-w-md"
                  style={{ color: C.inkSoft }}
                >
                  Net of federal tax {taxesActive ? "and earnings test " : ""}·
                  Invested pot until {investStopAge}, then enjoyed as income · {returnRate.toFixed(1)}% real
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
                  <span style={{ color: C.ink }}>
                    Claim at {claimAge}
                  </span>
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
                  <span style={{ color: C.ink }}>Invested pot only</span>
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
                    labelFormatter={(v) => `Age ${Number(v).toFixed(1)}`}
                    formatter={(value, name) => {
                      const labelMap = {
                        early: `Claim at ${claimAge}`,
                        pot: "Invested pot",
                        wait: "Wait to 67",
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
                        value: `↓ Crossover ${breakEvenAge}`,
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
                  Pot at {lifeExpectancy}
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
                  Total at {lifeExpectancy} · Early
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
                  style={{ color: C.inkFaint, letterSpacing: "0.15em" }}
                >
                  Net advantage
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
                  {advantage >= 0 ? "claim early" : "wait wins"}
                </div>
              </div>
            </div>
          </div>

          <div
            className="mt-5 p-6 md:p-7"
            style={{
              backgroundColor: C.paper,
              border: `1px solid ${C.border}`,
            }}
          >
            <h3 className="display text-xl mb-4" style={{ color: C.ink }}>
              <em>The pot, year by year</em>
            </h3>
            <p
              className="text-xs mb-5 max-w-2xl"
              style={{ color: C.inkSoft }}
            >
              Snapshot of the invested pot at five-year markers. Contributions
              run until age 67 using the after-tax check. After that the
              balance compounds untouched at {returnRate.toFixed(1)}% real.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full num text-sm" style={{ minWidth: "480px" }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th
                      className="text-left py-2 text-xs uppercase font-normal"
                      style={{ color: C.inkFaint, letterSpacing: "0.12em" }}
                    >
                      Age
                    </th>
                    <th
                      className="text-right py-2 text-xs uppercase font-normal"
                      style={{ color: C.inkFaint, letterSpacing: "0.12em" }}
                    >
                      Pot Value
                    </th>
                    <th
                      className="text-right py-2 text-xs uppercase font-normal"
                      style={{ color: C.inkFaint, letterSpacing: "0.12em" }}
                    >
                      5-yr Growth
                    </th>
                    <th
                      className="text-right py-2 text-xs uppercase font-normal"
                      style={{ color: C.inkFaint, letterSpacing: "0.12em" }}
                    >
                      Phase
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows = [];
                    const startAge = Math.ceil(claimAge);
                    let prev = 0;
                    for (let a = startAge; a <= lifeExpectancy; a += 5) {
                      const row = chartData.find((d) => d.age >= a);
                      if (!row) continue;
                      const growth = prev > 0 ? row.pot - prev : null;
                      rows.push(
                        <tr
                          key={a}
                          style={{ borderBottom: `1px solid ${C.border}` }}
                        >
                          <td
                            className="py-3"
                            style={{ color: C.ink, fontWeight: 500 }}
                          >
                            {Math.round(row.age)}
                          </td>
                          <td
                            className="py-3 text-right"
                            style={{ color: C.early, fontWeight: 500 }}
                          >
                            {fmtMoney(row.pot)}
                          </td>
                          <td
                            className="py-3 text-right"
                            style={{ color: C.inkSoft }}
                          >
                            {growth !== null
                              ? (growth >= 0 ? "+" : "") + fmtBig(growth)
                              : "—"}
                          </td>
                          <td
                            className="py-3 text-right text-xs"
                            style={{ color: C.inkFaint }}
                          >
                            {row.age < FRA ? "Contributing" : "Compounding"}
                          </td>
                        </tr>
                      );
                      prev = row.pot;
                    }
                    return rows;
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          <div
            className="mt-8 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed"
            style={{ borderTop: `1px solid ${C.border}`, color: C.inkSoft }}
          >
            <div>
              <div
                className="display text-sm mb-2"
                style={{ color: C.ink, fontStyle: "italic" }}
              >
                The earnings test
              </div>
              For 2026, anyone under FRA the entire year loses $1 of benefits
              for every $2 earned over $24,480. In the year of FRA the limit
              loosens to $65,160 with $1 lost per $3 over. Withheld benefits
              aren't lost forever, the SSA recalculates her benefit upward at
              FRA to recoup what was held back. The catch in switch mode is
              the recoup applies to her own retirement benefit only, and once
              she switches to survivor at 67 the bumped-up own benefit becomes
              irrelevant.
            </div>
            <div>
              <div
                className="display text-sm mb-2"
                style={{ color: C.ink, fontStyle: "italic" }}
              >
                NYC tax treatment
              </div>
              New York State and NYC do not tax Social Security benefits at
              all. The only tax that touches her checks is federal. Up to 85%
              of her benefits are federally taxable depending on combined
              income (single filer thresholds are $25K and $34K). The
              calculator simplifies by applying the marginal rate to 85% of
              the benefit. Her wage income is separately taxed at federal,
              state, and city rates but that's outside this model.
            </div>
            <div>
              <div
                className="display text-sm mb-2"
                style={{ color: C.ink, fontStyle: "italic" }}
              >
                On the switch strategy
              </div>
              A widow can file a restricted application to claim only her own
              retirement benefit early, then switch to 100% of the survivor
              benefit at her FRA. Her own benefit is reduced for life on that
              record but irrelevant once she switches. Claiming her own benefit
              early does not reduce the survivor benefit. Verify her exact own
              retirement amount with her SSA online statement before relying
              on this.
            </div>
            <div>
              <div
                className="display text-sm mb-2"
                style={{ color: C.ink, fontStyle: "italic" }}
              >
                Caveats this model leaves out
              </div>
              Sequence of returns risk on the invested side. The senior bonus
              deduction (up to $6,000 extra for 65+, phasing out above $75K
              MAGI) which can reduce or eliminate SS taxation. Earnings test
              recoup at FRA. Tax drag on the investment portfolio. Medicare
              Part B premiums. Numbers in today's dollars assuming a real
              return.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
