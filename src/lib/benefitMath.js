// Pure financial math for the SS claiming calculator.
// No React, no formatting that depends on locale state — keep this importable
// from both the UI and the test runner.

export const FRA = 67;
export const EARNINGS_LIMIT_2026 = 24480;
export const STANDARD_DEDUCTION_2026 = 16100;

// Combined-income tier thresholds for taxable SS (single filer, 2026).
const TAXABLE_SS_TIER_1 = 25000;
const TAXABLE_SS_TIER_2 = 34000;

// Reduction for claiming own retirement before FRA, credit for delaying past FRA.
// Uses the SSA's two-tier reduction formula: 5/9 of 1% per month for the first
// 36 months early, 5/12 of 1% per month for any earlier months.
export function retirementFactor(age) {
  if (age >= 70) return 1.24;
  if (age >= FRA) return 1 + (age - FRA) * 0.08;
  const monthsEarly = (FRA - age) * 12;
  let reduction;
  if (monthsEarly <= 36) {
    reduction = (monthsEarly * (5 / 9)) / 100;
  } else {
    reduction = (36 * (5 / 9)) / 100 + ((monthsEarly - 36) * (5 / 12)) / 100;
  }
  return 1 - reduction;
}

// Reduction for claiming a survivor benefit before FRA. 28.5% max reduction
// over the 84 months between age 60 and 67, applied linearly.
export function survivorFactor(age) {
  if (age >= FRA) return 1.0;
  if (age < 60) return 0;
  const monthsEarly = (FRA - age) * 12;
  return 1 - monthsEarly * (0.285 / 84);
}

// 2026 earnings test: pre-FRA, $1 of SS withheld for every $2 of wage income
// over the limit, capped at the full annual benefit.
export function computeEarningsTest({ claimAge, grossIncome, annualEarlyGross }) {
  if (claimAge >= FRA || grossIncome <= EARNINGS_LIMIT_2026) return 0;
  const excess = grossIncome - EARNINGS_LIMIT_2026;
  return Math.min(excess / 2, annualEarlyGross);
}

// What fraction of the annual SS benefit is federally taxable, based on
// combined income (= AGI + 0.5 × SS). Single-filer thresholds.
export function computeTaxableSSPct({ ssBasisAnnual, grossIncome }) {
  if (ssBasisAnnual <= 0) return 0;
  const combinedIncome = grossIncome + 0.5 * ssBasisAnnual;
  if (combinedIncome <= TAXABLE_SS_TIER_1) return 0;
  if (combinedIncome <= TAXABLE_SS_TIER_2) {
    const taxable = Math.min(
      0.5 * ssBasisAnnual,
      0.5 * (combinedIncome - TAXABLE_SS_TIER_1)
    );
    return taxable / ssBasisAnnual;
  }
  const taxable = Math.min(
    0.85 * ssBasisAnnual,
    0.5 * 9000 + 0.85 * (combinedIncome - TAXABLE_SS_TIER_2)
  );
  return taxable / ssBasisAnnual;
}

// Earnings-test recoup at FRA.
// When the earnings test withholds benefits pre-FRA, SSA recomputes the
// benefit at FRA as if those withheld months had never been claimed —
// shrinking the early-claiming reduction. The new (higher) rate is paid
// from FRA onward for life.
//   monthsWithheld = (totalDollarsWithheld) / earlyMonthlyGross
//                   capped at the total months pre-FRA
//   effectiveClaimAge = claimAge + monthsWithheld / 12
//   recoupedFactor = mode-appropriate factor at the effective claim age
// Returns null when no recoup applies (already at/past FRA, no withholding,
// or switch mode where the claimant abandons own retirement at FRA anyway).
export function computeRecoupedFactor({
  mode,
  claimAge,
  earlyMonthlyGross,
  earningsTestWithholding,
}) {
  if (mode === "switch") return null; // own retirement is abandoned at FRA → recoup moot
  if (claimAge >= FRA) return null;
  if (earningsTestWithholding <= 0) return null;
  if (earlyMonthlyGross <= 0) return null;

  const yearsPreFRA = FRA - claimAge;
  const totalDollarsWithheld = earningsTestWithholding * yearsPreFRA;
  const monthsWithheld = Math.min(
    totalDollarsWithheld / earlyMonthlyGross,
    yearsPreFRA * 12
  );
  const effectiveClaimAge = claimAge + monthsWithheld / 12;

  if (mode === "retirement") return retirementFactor(effectiveClaimAge);
  if (mode === "survivor") return survivorFactor(effectiveClaimAge);
  return null;
}

// 2026 single-filer marginal rate on a given taxable income.
export function getMarginalRate2026(taxableIncome) {
  if (taxableIncome <= 12400) return 10;
  if (taxableIncome <= 50400) return 12;
  if (taxableIncome <= 105700) return 22;
  if (taxableIncome <= 201775) return 24;
  if (taxableIncome <= 256225) return 32;
  if (taxableIncome <= 640600) return 35;
  return 37;
}

// Resolve the early/full benefit triplet for a given mode + claim age.
// Returns gross monthly amounts only — taxes and the earnings test layer on top.
export function resolveBenefits({ mode, fraBenefit, ownBenefit, claimAge }) {
  if (mode === "retirement") {
    const earlyFactor = retirementFactor(claimAge);
    const earlyMonthlyGross = fraBenefit * earlyFactor;
    return {
      earlyFactor,
      earlyMonthlyGross,
      fraMonthlyGross: fraBenefit,
      earlyPostFRAMonthlyGross: earlyMonthlyGross,
    };
  }
  if (mode === "survivor") {
    const earlyFactor = survivorFactor(claimAge);
    const earlyMonthlyGross = fraBenefit * earlyFactor;
    return {
      earlyFactor,
      earlyMonthlyGross,
      fraMonthlyGross: fraBenefit,
      earlyPostFRAMonthlyGross: earlyMonthlyGross,
    };
  }
  // switch mode: claim own early, switch to 100% survivor at FRA
  const earlyFactor = retirementFactor(claimAge);
  const earlyMonthlyGross = ownBenefit * earlyFactor;
  return {
    earlyFactor,
    earlyMonthlyGross,
    fraMonthlyGross: fraBenefit,
    earlyPostFRAMonthlyGross: fraBenefit,
  };
}

// Single entry point for all derived values. Takes raw inputs, returns everything
// the UI (or a sensitivity sweep) needs. Pure — same inputs → same outputs.
export function computeProjection({
  mode,
  fraBenefit,
  ownBenefit,
  claimAge,
  returnRate,
  investStopAge,
  lifeExpectancy,
  grossIncome,
  autoTax,
  manualFedRate,
}) {
  const {
    earlyFactor,
    earlyMonthlyGross,
    fraMonthlyGross,
    earlyPostFRAMonthlyGross: basePostFRAMonthlyGross,
  } = resolveBenefits({ mode, fraBenefit, ownBenefit, claimAge });

  const annualEarlyGross = earlyMonthlyGross * 12;
  const earningsTestWithholding = computeEarningsTest({
    claimAge,
    grossIncome,
    annualEarlyGross,
  });
  const earlyMonthlyAfterET = (annualEarlyGross - earningsTestWithholding) / 12;

  // Apply the FRA recoup for retirement/survivor modes — withheld months are
  // credited back at FRA, raising the post-FRA monthly amount permanently.
  // Switch mode is unaffected (claimant abandons own retirement at FRA).
  const recoupedFactor = computeRecoupedFactor({
    mode,
    claimAge,
    earlyMonthlyGross,
    earningsTestWithholding,
  });
  const earlyPostFRAMonthlyGross =
    recoupedFactor !== null ? fraBenefit * recoupedFactor : basePostFRAMonthlyGross;

  const ssBasisAnnual = fraMonthlyGross * 12;
  const combinedIncome = grossIncome + 0.5 * ssBasisAnnual;
  const taxableSSPct = computeTaxableSSPct({ ssBasisAnnual, grossIncome });
  const taxableIncome = Math.max(
    0,
    grossIncome + taxableSSPct * ssBasisAnnual - STANDARD_DEDUCTION_2026
  );
  const autoMarginalRate = getMarginalRate2026(taxableIncome);
  const fedMarginalRate = autoTax ? autoMarginalRate : manualFedRate;
  const ssEffectiveTaxRate = autoTax
    ? taxableSSPct * (fedMarginalRate / 100)
    : 0.85 * (manualFedRate / 100);

  const earlyMonthlyNet = earlyMonthlyAfterET * (1 - ssEffectiveTaxRate);
  const earlyPostFRAMonthlyNet = earlyPostFRAMonthlyGross * (1 - ssEffectiveTaxRate);
  const fraMonthlyNet = fraMonthlyGross * (1 - ssEffectiveTaxRate);

  const chartData = buildChartData({
    claimAge,
    investStopAge,
    lifeExpectancy,
    returnRate,
    earlyMonthlyNet,
    earlyPostFRAMonthlyNet,
    fraMonthlyNet,
  });

  const breakEvenAge = findBreakEvenAge({ chartData, claimAge, mode });

  const finalEarly = chartData[chartData.length - 1]?.early || 0;
  const finalWait = chartData[chartData.length - 1]?.wait || 0;
  const finalPot = chartData[chartData.length - 1]?.pot || 0;
  const advantage = finalEarly - finalWait;
  const potAtFRARow = chartData.find((d) => d.age >= FRA)?.pot || 0;
  const potAtStopRow = chartData.find((d) => d.age >= investStopAge)?.pot || 0;

  return {
    // raw / passthrough
    earlyFactor,
    earlyMonthlyGross,
    fraMonthlyGross,
    earlyPostFRAMonthlyGross,
    recoupedFactor,
    annualEarlyGross,
    earningsTestWithholding,
    combinedIncome,
    taxableSSPct,
    fedMarginalRate,
    ssEffectiveTaxRate,
    // monthly nets used by the summary cards
    earlyMonthlyNet,
    earlyPostFRAMonthlyNet,
    fraMonthlyNet,
    // chart + scalars
    chartData,
    breakEvenAge,
    finalEarly,
    finalWait,
    finalPot,
    advantage,
    potAtFRARow,
    potAtStopRow,
  };
}

// 3-phase invested-pot trajectory:
//   Phase 1: claimAge → min(FRA, investStopAge)  contribute earlyMonthlyNet
//   Phase 2: FRA → investStopAge                 contribute earlyPostFRAMonthlyNet
//   Phase 3: investStopAge → lifeExpectancy      pot compounds untouched, cash collected
function buildChartData({
  claimAge,
  investStopAge,
  lifeExpectancy,
  returnRate,
  earlyMonthlyNet,
  earlyPostFRAMonthlyNet,
  fraMonthlyNet,
}) {
  const data = [];
  const r = returnRate / 100 / 12;
  const startAge = Math.min(claimAge, FRA);

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
        const n = (age - claimAge) * 12;
        const lump =
          r > 0
            ? (earlyMonthlyNet * (Math.pow(1 + r, n) - 1)) / r
            : earlyMonthlyNet * n;
        pot = lump;
        early = lump;
      } else if (age <= investStopAge) {
        const n = (age - phase1End) * 12;
        const grown = potAtPhase1End * Math.pow(1 + r, n);
        const newContrib =
          r > 0
            ? (earlyPostFRAMonthlyNet * (Math.pow(1 + r, n) - 1)) / r
            : earlyPostFRAMonthlyNet * n;
        pot = grown + newContrib;
        early = pot;
      } else {
        // Phase 3: pot compounds untouched, checks now collected as cash.
        // Cash rate splits at FRA: between investStopAge and FRA (only
        // possible when investStopAge < FRA), the claimant is still pre-FRA
        // and receives the early ET-reduced rate; from FRA onward they
        // receive the post-FRA recouped rate.
        const monthsAfterStop = (age - investStopAge) * 12;
        const potNow = potAtInvestStop * Math.pow(1 + r, monthsAfterStop);
        const monthsAtEarlyRate =
          Math.max(0, Math.min(age, FRA) - investStopAge) * 12;
        const monthsAtPostFRARate =
          Math.max(0, age - Math.max(investStopAge, FRA)) * 12;
        const cashCollected =
          earlyMonthlyNet * monthsAtEarlyRate +
          earlyPostFRAMonthlyNet * monthsAtPostFRARate;
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
}

function findBreakEvenAge({ chartData, claimAge, mode }) {
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
}

// Formatters — UI-only but pure, so they live here too for easy testing.
export const fmtMoney = (v) =>
  "$" + Math.round(v).toLocaleString("en-US", { maximumFractionDigits: 0 });

export const fmtBig = (v) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return "$" + (v / 1_000_000).toFixed(2) + "M";
  if (abs >= 1000) return "$" + (v / 1000).toFixed(0) + "K";
  return "$" + Math.round(v);
};

export const fmtAge = (v) => (v % 1 === 0 ? v + " yr" : v.toFixed(1) + " yr");

export const fmtIncome = (v) =>
  v === 0 ? "Not working" : "$" + v.toLocaleString() + "/yr";
