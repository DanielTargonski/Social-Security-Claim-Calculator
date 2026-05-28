// Federal income tax math, 2026 single-filer.
// Numbers update annually — review every year against the IRS bracket release.

export const STANDARD_DEDUCTION_2026 = 16100;

// OBBBA senior bonus deduction (single filer). Introduced by the One Big
// Beautiful Bill Act, signed July 2025. Available tax years 2025–2028 to
// taxpayers age 65+ on the last day of the tax year, regardless of whether
// they itemize. Stacks on top of the standard deduction. Phase-out: starts
// at $75K MAGI, eliminated at $175K, reducing by 6% of MAGI over the start
// threshold. Joint-filer numbers (not modeled here): $12K base, $150K /
// $250K phase-out. SUNSETS Dec 31, 2028 unless Congress extends.
export const OBBBA_SENIOR_DEDUCTION_BASE = 6000;
export const OBBBA_SENIOR_DEDUCTION_PHASE_START_SINGLE = 75000;
export const OBBBA_SENIOR_DEDUCTION_PHASE_END_SINGLE = 175000;
export const OBBBA_SENIOR_DEDUCTION_PHASE_RATE = 0.06;
export const OBBBA_SENIOR_DEDUCTION_FIRST_YEAR = 2025;
export const OBBBA_SENIOR_DEDUCTION_LAST_YEAR = 2028;

// Combined-income tier thresholds for taxable SS (single filer, 2026).
const TAXABLE_SS_TIER_1 = 25000;
const TAXABLE_SS_TIER_2 = 34000;

// What fraction of the annual SS benefit is federally taxable, based on
// "combined income" = AGI + 0.5 × annual SS. Single-filer thresholds.
//   ≤ $25,000  →   0% taxable
//   ≤ $34,000  →  up to 50% taxable, scaled by combined income above $25K
//   >  $34,000 →  up to 85% taxable, with the same 50% formula applied to
//                 the first $9K above $25K, then 85% of the excess above $34K
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

// 2026 single-filer marginal rate on a given taxable income.
// Brackets: 10% / 12% / 22% / 24% / 32% / 35% / 37%.
export function getMarginalRate2026(taxableIncome) {
  if (taxableIncome <= 12400) return 10;
  if (taxableIncome <= 50400) return 12;
  if (taxableIncome <= 105700) return 22;
  if (taxableIncome <= 201775) return 24;
  if (taxableIncome <= 256225) return 32;
  if (taxableIncome <= 640600) return 35;
  return 37;
}

// Total federal tax owed on a given taxable income (2026 single-filer brackets).
// Walks every bracket and sums the per-bracket liability. Used to compute the
// exact dollar savings from a deduction by diffing tax-before vs tax-after,
// which is more accurate than (deduction × marginal_rate) whenever the
// deduction crosses a bracket boundary.
export function computeFederalTax2026(taxableIncome) {
  if (taxableIncome <= 0) return 0;
  // [upperBound, rate] pairs in ascending order. Infinity catches the top.
  const brackets = [
    [12400, 0.1],
    [50400, 0.12],
    [105700, 0.22],
    [201775, 0.24],
    [256225, 0.32],
    [640600, 0.35],
    [Infinity, 0.37],
  ];
  let tax = 0;
  let prev = 0;
  for (const [upper, rate] of brackets) {
    if (taxableIncome <= upper) {
      tax += (taxableIncome - prev) * rate;
      return tax;
    }
    tax += (upper - prev) * rate;
    prev = upper;
  }
  return tax; // unreachable — Infinity catches all
}

// OBBBA senior bonus deduction for a single filer in a given tax year.
// Returns the dollar deduction amount (0 when ineligible). Phase-out:
//   MAGI ≤ $75K  → full $6,000
//   $75K–$175K   → $6,000 − 6% × (MAGI − $75K) [linear taper]
//   MAGI ≥ $175K → $0
// Sunset: deduction is $0 outside tax years 2025–2028 unless Congress
// extends. Joint filers are not modeled (single-filer focus throughout).
export function computeSeniorDeduction({ age, magi, taxYear }) {
  if (age < 65) return 0;
  if (taxYear < OBBBA_SENIOR_DEDUCTION_FIRST_YEAR) return 0;
  if (taxYear > OBBBA_SENIOR_DEDUCTION_LAST_YEAR) return 0;
  if (magi <= OBBBA_SENIOR_DEDUCTION_PHASE_START_SINGLE) {
    return OBBBA_SENIOR_DEDUCTION_BASE;
  }
  if (magi >= OBBBA_SENIOR_DEDUCTION_PHASE_END_SINGLE) return 0;
  const phaseOut =
    (magi - OBBBA_SENIOR_DEDUCTION_PHASE_START_SINGLE) *
    OBBBA_SENIOR_DEDUCTION_PHASE_RATE;
  return Math.max(0, OBBBA_SENIOR_DEDUCTION_BASE - phaseOut);
}

// Federal income tax on WAGE income, modeled as the BOTTOM of the tax stack
// (the federally-taxable portion of Social Security sits on top — consistent
// with computeSSEffectiveTaxRate, which taxes the SS portion at the
// household's marginal rate). The standard deduction and any extra deduction
// (OBBBA senior bonus) are absorbed by the wage here, so wage tax +
// SS-effective tax ≈ a single bracket walk on combined taxable income (exact
// when the taxable-SS slice doesn't span a bracket boundary).
//
// Display-only: this feeds take-home figures in the summary cards and never
// the break-even projection (wages are identical in both claiming arms, so
// wage tax cancels in the comparison). In manual-tax mode the user is
// dictating the rate, so we apply it flat to the post-deduction wage.
export function computeWageFederalTax({
  autoTax,
  manualFedRate,
  wageIncome,
  extraDeduction = 0,
}) {
  if (!wageIncome || wageIncome <= 0) return 0;
  const taxable = Math.max(
    0,
    wageIncome - STANDARD_DEDUCTION_2026 - extraDeduction
  );
  if (autoTax) return computeFederalTax2026(taxable);
  return taxable * (manualFedRate / 100);
}

// Combine the auto/manual marginal rate logic and produce the effective tax
// rate on Social Security checks. When auto, uses the tier-aware combined-
// income formula. When manual, assumes 85% of the benefit is taxable.
//
// `extraDeduction` stacks on top of the standard deduction before bracket
// lookup. Used for the OBBBA senior bonus deduction (2025–2028). The
// callsite decides whether to apply it; this function only consumes the
// already-computed dollar amount.
export function computeSSEffectiveTaxRate({
  autoTax,
  manualFedRate,
  ssBasisAnnual,
  grossIncome,
  extraDeduction = 0,
}) {
  if (autoTax) {
    const taxableSSPct = computeTaxableSSPct({ ssBasisAnnual, grossIncome });
    const grossTaxableIncome =
      grossIncome + taxableSSPct * ssBasisAnnual - STANDARD_DEDUCTION_2026;
    const taxableIncome = Math.max(0, grossTaxableIncome - extraDeduction);
    const rate = getMarginalRate2026(taxableIncome);
    // Exact dollar savings from the extra deduction = federal tax owed
    // without it minus federal tax owed with it. More accurate than
    // (deduction × marginal_rate) when the deduction crosses a bracket
    // boundary; identical when it doesn't.
    const taxWithoutExtra = computeFederalTax2026(Math.max(0, grossTaxableIncome));
    const taxWithExtra = computeFederalTax2026(taxableIncome);
    const extraDeductionDollarSavings = Math.max(
      0,
      taxWithoutExtra - taxWithExtra
    );
    return {
      taxableSSPct,
      fedMarginalRate: rate,
      ssEffectiveTaxRate: taxableSSPct * (rate / 100),
      extraDeduction,
      extraDeductionDollarSavings,
    };
  }
  return {
    taxableSSPct: 0.85, // assumed
    fedMarginalRate: manualFedRate,
    ssEffectiveTaxRate: 0.85 * (manualFedRate / 100),
    extraDeduction: 0,
    // Manual override mode doesn't model deductions — the user is dictating
    // the SS tax rate directly, so any OBBBA savings are out of scope here.
    extraDeductionDollarSavings: 0,
  };
}
