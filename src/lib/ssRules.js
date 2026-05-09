// Pure Social Security Administration rules — no taxes, no chart math.
// Everything here mirrors SSA's actual benefit formulas.

export const FRA = 67;
export const EARNINGS_LIMIT_2026 = 24480;

// Reduction for claiming own retirement before FRA, credit for delaying past FRA.
// SSA's two-tier reduction: 5/9 of 1% per month for the first 36 months early,
// 5/12 of 1% per month for any earlier months. Delayed retirement credits add
// 8% per year between FRA and 70 (capped at 24% / age 70).
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
// over the 84 months between age 60 and 67, applied linearly. No delayed
// credits for survivor benefits (they're capped at 100% of PIA).
export function survivorFactor(age) {
  if (age >= FRA) return 1.0;
  if (age < 60) return 0;
  const monthsEarly = (FRA - age) * 12;
  return 1 - monthsEarly * (0.285 / 84);
}

// 2026 earnings test: pre-FRA, $1 of SS withheld for every $2 of wage income
// over the limit, capped at the full annual benefit. Returns 0 when the test
// doesn't apply or the income is at/below the limit.
//
// Caveat: this calculator simplifies to a single $24,480 / $2 ratio. SSA
// actually uses a higher limit ($65,160 in 2026) with a $1-per-$3 ratio in
// the year the claimant reaches FRA. That nuance is intentionally omitted.
export function computeEarningsTest({ claimAge, grossIncome, annualEarlyGross }) {
  if (claimAge >= FRA || grossIncome <= EARNINGS_LIMIT_2026) return 0;
  const excess = grossIncome - EARNINGS_LIMIT_2026;
  return Math.min(excess / 2, annualEarlyGross);
}

// Earnings-test recoup at FRA.
// When the earnings test withholds benefits pre-FRA, SSA recomputes the
// benefit at FRA as if those withheld months had never been claimed —
// shrinking the early-claiming reduction. The new (higher) rate is paid
// from FRA onward for life.
//   monthsWithheld    = totalDollarsWithheld / earlyMonthlyGross
//                       capped at the total months pre-FRA
//   effectiveClaimAge = claimAge + monthsWithheld / 12
//   recoupedFactor    = mode-appropriate factor at the effective claim age
// Returns null when no recoup applies (already at/past FRA, no withholding,
// or switch mode where the claimant abandons own retirement at FRA anyway).
export function computeRecoupedFactor({
  mode,
  claimAge,
  earlyMonthlyGross,
  earningsTestWithholding,
}) {
  if (mode === "switch") return null;
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

// Resolve the early/full benefit triplet for a given mode + claim age.
// Returns gross monthly amounts only — taxes and the earnings test layer on top.
//   earlyFactor              : reduction/credit applied to fraBenefit (or ownBenefit in switch)
//   earlyMonthlyGross        : monthly check between claimAge and FRA
//   fraMonthlyGross          : full benefit at FRA (the "wait" baseline)
//   earlyPostFRAMonthlyGross : default rate from FRA onward (before recoup adjustment)
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
