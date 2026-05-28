// State + local income tax on WAGE income. Single-filer, New York / NYC.
//
// This is a DISPLAY-ONLY layer. It never enters the break-even chart: both
// claiming arms carry identical wage income, so wage tax cancels in the
// difference (see benefitMath / chartProjection). It exists solely to turn the
// summary cards' "wage + SS" figures into a real after-tax take-home.
//
// New York (and NYC) exclude Social Security benefits from the state/city
// income base entirely, so SS is taxed only at the federal level — the state
// and city tax here applies to wages alone. If this module later grows to
// cover a state that DOES tax SS (CO, CT, MN, MT, NM, RI, UT, VT, WV), gate
// that per-locality rather than flipping a single global flag.
//
// Numbers below are the 2025 NY tax year (returns filed in 2026); NY had not
// published 2026 schedules at build time. Review every year against the NY
// Department of Taxation and Finance release (Form IT-201 instructions).

// Jurisdictions the selector offers. "nyc" = NY state tax PLUS NYC resident
// tax on the same base; "ny" = NY state only (resident of NY outside the
// city); "none" = no state/local income tax modeled.
export const LOCALITIES = ["none", "ny", "nyc"];

// Social Security is excluded from NY adjusted gross income, so it is never
// taxed at the state or city level here.
export const SS_IS_STATE_TAXABLE = false;

// NY State standard deduction, single filer (2025).
export const NY_STANDARD_DEDUCTION_SINGLE = 8000;

// NY State single-filer brackets: [upperBound, rate], ascending. Infinity
// catches the top bracket. (2025 tax year.)
export const NY_STATE_BRACKETS_SINGLE = [
  [8500, 0.04],
  [11700, 0.045],
  [13900, 0.0525],
  [80650, 0.055],
  [215400, 0.06],
  [1077550, 0.0685],
  [5000000, 0.0965],
  [25000000, 0.103],
  [Infinity, 0.109],
];

// NYC resident income tax, single filer (2025): [upperBound, rate].
export const NYC_RESIDENT_BRACKETS_SINGLE = [
  [12000, 0.03078],
  [25000, 0.03762],
  [50000, 0.03819],
  [Infinity, 0.03876],
];

// Progressive bracket walker — same [upper, rate] shape as
// taxMath.computeFederalTax2026. Sums the per-bracket liability.
export function taxFromBrackets(taxableIncome, brackets) {
  if (taxableIncome <= 0) return 0;
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

// State + city income tax on wage income for the chosen locality.
//
// For a wages-only single filer, NY taxable income is the wage minus the NY
// standard deduction (SS is excluded from NY AGI). NYC residents pay NY state
// tax PLUS NYC resident tax on that same NY taxable base. Returns the two
// components and their total so callers can show a breakdown.
export function computeStateLocalWageTax({ locality, wageIncome }) {
  if (locality !== "ny" && locality !== "nyc") {
    return { stateTax: 0, cityTax: 0, total: 0 };
  }
  if (!wageIncome || wageIncome <= 0) {
    return { stateTax: 0, cityTax: 0, total: 0 };
  }
  const nyTaxable = Math.max(0, wageIncome - NY_STANDARD_DEDUCTION_SINGLE);
  const stateTax = taxFromBrackets(nyTaxable, NY_STATE_BRACKETS_SINGLE);
  const cityTax =
    locality === "nyc"
      ? taxFromBrackets(nyTaxable, NYC_RESIDENT_BRACKETS_SINGLE)
      : 0;
  return { stateTax, cityTax, total: stateTax + cityTax };
}

// Human-readable label for a locality value — used in card copy.
export function localityLabel(locality) {
  if (locality === "ny") return "New York State";
  if (locality === "nyc") return "New York City";
  return "No state tax";
}
