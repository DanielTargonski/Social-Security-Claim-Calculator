// Federal income tax math, 2026 single-filer.
// Numbers update annually — review every year against the IRS bracket release.

export const STANDARD_DEDUCTION_2026 = 16100;

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

// Combine the auto/manual marginal rate logic and produce the effective tax
// rate on Social Security checks. When auto, uses the tier-aware combined-
// income formula. When manual, assumes 85% of the benefit is taxable.
export function computeSSEffectiveTaxRate({
  autoTax,
  manualFedRate,
  ssBasisAnnual,
  grossIncome,
}) {
  if (autoTax) {
    const taxableSSPct = computeTaxableSSPct({ ssBasisAnnual, grossIncome });
    const taxableIncome = Math.max(
      0,
      grossIncome + taxableSSPct * ssBasisAnnual - STANDARD_DEDUCTION_2026
    );
    const rate = getMarginalRate2026(taxableIncome);
    return {
      taxableSSPct,
      fedMarginalRate: rate,
      ssEffectiveTaxRate: taxableSSPct * (rate / 100),
    };
  }
  return {
    taxableSSPct: 0.85, // assumed
    fedMarginalRate: manualFedRate,
    ssEffectiveTaxRate: 0.85 * (manualFedRate / 100),
  };
}
