// Pure Social Security Administration rules — no taxes, no chart math.
// Everything here mirrors SSA's actual benefit formulas.

export const FRA = 67;
export const EARNINGS_LIMIT_2026 = 24480;
export const EARNINGS_LIMIT_2026_FRA_YEAR = 65160;
export const DEFAULT_BIRTH_MONTH = 6;
export const DEFAULT_BIRTH_YEAR = 1964;

function clampWholeNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

// Exact calendar timing for the fixed-FRA=67 model. The calculator collects
// birth month/year, not day, so "the month the claimant reaches FRA" is the
// birth month at age 67. SSA's birthday-on-the-1st previous-month rule is
// still out of scope until/unless the UI asks for birth day.
export function computeFRATiming({
  birthMonth = DEFAULT_BIRTH_MONTH,
  birthYear = DEFAULT_BIRTH_YEAR,
} = {}) {
  const month = clampWholeNumber(birthMonth, 1, 12, DEFAULT_BIRTH_MONTH);
  const year = clampWholeNumber(birthYear, 1900, 2100, DEFAULT_BIRTH_YEAR);
  const monthsBeforeFRAInYear = month - 1;
  return {
    birthMonth: month,
    birthYear: year,
    fraAge: FRA,
    fraMonth: month,
    fraYear: year + FRA,
    monthsBeforeFRAInYear,
    fraYearStartAge: FRA - monthsBeforeFRAInYear / 12,
    exact: true,
  };
}

// Back-compat for older math callers/tests that do not pass birthdate. This is
// the previous age-only approximation: treat a full final pre-FRA year as the
// higher-limit year.
function legacyFRATiming() {
  return {
    birthMonth: null,
    birthYear: null,
    fraAge: FRA,
    fraMonth: null,
    fraYear: null,
    monthsBeforeFRAInYear: 12,
    fraYearStartAge: FRA - 1,
    exact: false,
  };
}

export function resolveFRATiming({ birthMonth, birthYear } = {}) {
  if (birthMonth == null && birthYear == null) return legacyFRATiming();
  return computeFRATiming({ birthMonth, birthYear });
}

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

// 2026 earnings test. SSA has two pre-FRA exempt amounts:
//   - years before the year the claimant reaches FRA: $24,480, $1 withheld
//     for every $2 over the limit
//   - the year the claimant reaches FRA: $65,160, $1 withheld for every $3
//     over the limit, counting only months before FRA
//
// When birth month/year are supplied, the year-of-FRA window is exact to the
// month: from January of the FRA calendar year through the month before the
// claimant reaches FRA. Because the UI collects annual wage income, earnings
// in that short year are prorated as evenly earned wages. The higher annual
// exempt amount is NOT prorated — CFR 404.430 applies the full amount to those
// pre-FRA months even when there are fewer than 12.
export function computeEarningsTest({
  claimAge,
  grossIncome,
  annualEarlyGross,
  birthMonth,
  birthYear,
}) {
  if (claimAge >= FRA || annualEarlyGross <= 0) return 0;
  const timing = resolveFRATiming({ birthMonth, birthYear });
  const isFRAYear = claimAge >= timing.fraYearStartAge;
  const limit = isFRAYear ? EARNINGS_LIMIT_2026_FRA_YEAR : EARNINGS_LIMIT_2026;
  const divisor = isFRAYear ? 3 : 2;
  const grossIncomeForTest =
    isFRAYear && timing.exact
      ? grossIncome * (timing.monthsBeforeFRAInYear / 12)
      : grossIncome;
  if (grossIncomeForTest <= limit) return 0;
  const monthlyBenefit = annualEarlyGross / 12;
  const benefitCap =
    isFRAYear && timing.exact
      ? monthlyBenefit *
        Math.max(
          0,
          Math.min(
            timing.monthsBeforeFRAInYear,
            Math.round((FRA - Math.max(claimAge, timing.fraYearStartAge)) * 12)
          )
        )
      : annualEarlyGross;
  if (benefitCap <= 0) return 0;
  const excess = grossIncomeForTest - limit;
  return Math.min(excess / divisor, benefitCap);
}

// Earnings-test recoup at FRA — SSA's "Adjustment of the Reduction Factor"
// (ARF; POMS RS 00615.482).
// When the earnings test withholds benefits pre-FRA, SSA recomputes the
// benefit at FRA as if those withheld months had never been claimed —
// shrinking the early-claiming reduction. The new (higher) rate is paid
// from FRA onward for life.
//
// Crucial crediting rule: SSA grants a WHOLE reduction-month of credit for
// any month with a full OR partial earnings-test deduction — "proration of
// work deductions has no effect on the adjustment of the reduction factor"
// (POMS RS 00615.482, stated identically for RIB, spouse, and widow(er)).
// SSA applies the test annually by withholding whole monthly checks from the
// start of each year, so the credited months per pre-FRA year is the number
// of checks the withholding touches = ceil(annual withholding / monthly
// check), capped at 12. A plain dollar-average (annual / monthly, unrounded)
// drops the partial month and under-credits the recoup — understating the
// post-FRA benefit whenever the withholding isn't an exact multiple of the
// monthly check.
//   creditedMonths(year) = ceil(annualWithholding / earlyMonthlyGross), <= 12
//   monthsWithheld       = lower-limit credits + FRA-year credits
//   effectiveClaimAge    = claimAge + monthsWithheld / 12
//   recoupedFactor       = mode-appropriate factor at the effective claim age
// Returns null when no recoup applies (already at/past FRA, no withholding,
// or switch mode where the claimant abandons own retirement at FRA anyway).
export function computeRecoupedFactor({
  mode,
  claimAge,
  earlyMonthlyGross,
  earningsTestWithholding,
  fraYearEarningsTestWithholding = earningsTestWithholding,
  fraYearStartAge = FRA - 1,
  exactFRATiming = false,
}) {
  if (mode === "switch") return null;
  if (claimAge >= FRA) return null;
  if (earningsTestWithholding <= 0 && fraYearEarningsTestWithholding <= 0) return null;
  if (earlyMonthlyGross <= 0) return null;

  const creditedMonthsFor = (annualWithholding) =>
    Math.min(Math.ceil(annualWithholding / earlyMonthlyGross), 12);
  const lowerLimitYears = Math.max(0, Math.min(fraYearStartAge, FRA) - claimAge);
  const fraYearYears = Math.max(0, FRA - Math.max(claimAge, fraYearStartAge));
  const lowerLimitMonthsWithheld =
    creditedMonthsFor(earningsTestWithholding) * lowerLimitYears;
  // In exact birth-month mode the FRA-year withholding is already the one
  // short calendar window (January through the month before FRA), not an
  // annual amount to repeat over a fractional year. Count the touched checks
  // directly, capped to the number of payable pre-FRA months in that window.
  const fraYearMonthsWithheld = exactFRATiming
    ? Math.min(
        creditedMonthsFor(fraYearEarningsTestWithholding),
        Math.round(fraYearYears * 12)
      )
    : creditedMonthsFor(fraYearEarningsTestWithholding) * fraYearYears;
  const monthsWithheld =
    lowerLimitMonthsWithheld + fraYearMonthsWithheld;
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
