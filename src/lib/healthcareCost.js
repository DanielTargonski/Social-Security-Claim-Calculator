// Healthcare-cost math for a NYC single filer in 2026 and beyond, post-OBBBA
// (One Big Beautiful Bill Act, signed July 2025). The IRA-era enhanced ACA
// premium tax credits expired Dec 31, 2025 — the 400% FPL "subsidy cliff" is
// back, and NY's Essential Plan ceiling drops from 250% → 200% FPL effective
// July 1, 2026. For a 60–64 year old considering early SS, an extra $20–40K
// of annual SS income can push the household across these cliffs and cost
// $5K–$15K/yr in unsubsidized premiums. At 65+, the same SS income can push
// MAGI into IRMAA tiers ($1.1K–$6.9K/yr in Medicare surcharges).
//
// All numbers update annually — review every year against:
//   - HHS ASPE poverty guidelines (FPL)
//   - CMS Medicare Part B premium / IRMAA bracket release
//   - NY State of Health published Lowest-Cost Silver Plan rates
//
// Out of scope (intentional simplifications, see CLAUDE.md):
//   - 2-year IRMAA MAGI lookback: applies current-year MAGI directly. Real
//     IRMAA at age 65 reflects MAGI from age 63. Over a 20-yr horizon the
//     timing offset is noise for break-even sensitivity analysis.
//   - ACA PTC graduated contribution scale (~2.1% → 9.96% from 100–300% FPL
//     per the 2026 indexed table in IRS Rev. Proc. 2025-25): collapsed into a
//     single 9.96% cap across the 200–400% FPL subsidized band. The cliff at
//     400% dominates anyway, and the calculator's audience tends to sit in
//     the upper half of the band where the top-of-scale rate applies.
//   - Medicaid (asset-tested 65+ coverage), MSP, LTC eligibility — out of
//     scope for a SS-claim-age calculator.
//   - Cost-sharing reductions (CSRs) and deductible variance — modeled as
//     premium-only.

// 2026 PTC determinations use the 2025 federal poverty guidelines (HHS ASPE).
// ACA practice is to use the prior-year FPL for the current plan year.
// 2027 PTC will use the 2026 FPL ($15,960 single, $21,650 couple).
export const FPL_2025_FOR_2026_PTC = {
  single: 15650,
  couple: 21150,
  // Each additional household member adds $5,500 in the 48 contiguous states
  // and DC. Not used directly here but documented for future expansion.
  perAdditionalMember: 5500,
};

// NY adult Medicaid ceiling (non-disabled adults 19-64, MAGI rules). 133%
// FPL plus the statutory 5% disregard = 138% FPL effective. Confirmed
// unchanged for 2026-2027 by KFF and NYS DOH. Below this threshold and
// the claimant is on Medicaid, not Essential Plan — both are $0 premium,
// so the cliff has no premium impact, but it matters for the user's
// mental model (Medicaid vs EP coverage breadth + the OBBBA work
// requirement that applies to Medicaid only, effective Jan 1, 2027).
export const MEDICAID_FPL_CEILING = 1.38;

// Essential Plan ceiling drops 250% → 200% FPL effective July 1, 2026 because
// OBBBA killed the lawfully-present-immigrant PTC eligibility that financed
// half of NY's 1332-waiver Essential Plan. Modeled as a constant (post-July
// 2026) — the calculator targets 2026+ retirement decisions, not the
// six-month transition window.
export const ESSENTIAL_PLAN_FPL_CEILING = 2.0; // 200% of FPL
export const ACA_PTC_CLIFF_FPL = 4.0;         // 400% of FPL

// NY Medicare Savings Program ceiling (QMB / SLMB / QI combined upper limit).
// NY eliminated the MSP asset test effective Jan 1, 2023, so eligibility is
// MAGI-only. QMB ≤100% FPL pays Part B premium and all cost-sharing;
// SLMB 100-120% pays Part B premium only; QI 120-135% pays Part B premium
// only. Collapsing all three into "≤135% FPL → Part B is free" is accurate
// for the calculator's purpose (premium cost) — the cost-sharing differences
// don't show up in the break-even math.
export const MSP_PART_B_FPL_CEILING = 1.35;

// ACA PTC cap on subsidized premium contribution as a fraction of MAGI.
// Pre-IRA / post-OBBBA the cap is a graduated scale; the 2026 indexed
// applicable-percentage table per IRS Rev. Proc. 2025-25 runs from ~2.1% at
// 100% FPL up to 9.96% at 300–400% FPL, with the cliff above 400% FPL. For
// this calculator's sensitivity-analysis purpose we collapse the band into
// the single top-of-scale value (9.96%): the calculator's audience tends to
// sit in the upper half of the subsidized band (250–400% FPL), and using the
// top rate is the conservative choice for early-claim healthcare-cost
// estimation. The 200% Essential Plan floor and the 400% cliff are the
// load-bearing thresholds either way.
export const ACA_PTC_CONTRIBUTION_CAP = 0.0996;

// NYC Lowest-Cost Silver Plan, single, 2026. Source: NY State of Health
// "2026 Lowest Cost Silver Plan by County" PDF. NY uses pure community
// rating — premium does not vary by age — so this is the same number for
// a 21-year-old and a 64-year-old. User can override per their actual
// shopping; this is the published-data default.
export const NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT = 9679; // $806.61/mo × 12

// Standard 2026 Medicare Part B premium ($202.90/mo). Paid by every Medicare
// enrollee regardless of income. IRMAA surcharges stack on top of this.
export const PART_B_BASE_MONTHLY_2026 = 202.90;
export const PART_B_BASE_ANNUAL_2026 = PART_B_BASE_MONTHLY_2026 * 12;

// IRMAA brackets for 2026, single filer. MAGI lookback is 2 years (2026 IRMAA
// is set from 2024 MAGI) — see header note about why we ignore the lookback.
// $1 over a threshold triggers the FULL surcharge for both Part B and Part D.
// Source: CMS 2026 Medicare Parts A & B Premiums and Deductibles fact sheet,
// cross-checked against SSA POMS HI 01101.020.
//
// Each tier:
//   maxMagi:       upper bound (inclusive). Top tier is Infinity.
//   partBSurcharge: monthly Part B IRMAA premium (added to base $202.90).
//   partDSurcharge: monthly Part D IRMAA surcharge.
//   annualExtra:   total annual extra cost relative to standard (B + D × 12).
export const IRMAA_2026_SINGLE = [
  { maxMagi: 109000,    partBSurcharge:  0.00, partDSurcharge:  0.00, annualExtra:    0.00 },
  { maxMagi: 137000,    partBSurcharge: 81.20, partDSurcharge: 14.50, annualExtra: 1148.40 },
  { maxMagi: 171000,    partBSurcharge: 202.90, partDSurcharge: 37.50, annualExtra: 2884.80 },
  { maxMagi: 205000,    partBSurcharge: 324.60, partDSurcharge: 60.40, annualExtra: 4620.00 },
  { maxMagi: 500000,    partBSurcharge: 446.30, partDSurcharge: 83.30, annualExtra: 6355.20 },
  { maxMagi: Infinity,  partBSurcharge: 487.00, partDSurcharge: 91.00, annualExtra: 6936.00 },
];

// Compute the household's MAGI as the ACA / Medicaid programs define it:
// AGI + tax-exempt interest + non-taxable SS + foreign earned-income exclusion.
// 100% of gross SS benefits flow through (the "non-taxable SS" addback offsets
// the AGI exclusion). The calculator ignores tax-exempt interest and foreign
// income — they're not modeled inputs.
export function computeMagiACA({ grossIncome, ssAnnualGross }) {
  return grossIncome + ssAnnualGross;
}

// Compute the household's MAGI as IRMAA defines it: AGI + tax-exempt interest.
// Excludes non-taxable SS (only the taxable portion is in AGI). Reuses the
// existing taxableSSPct from taxMath so MAGI stays consistent with the
// federal-tax line in the calculator.
export function computeMagiIRMAA({ grossIncome, ssAnnualGross, taxableSSPct }) {
  return grossIncome + ssAnnualGross * taxableSSPct;
}

// Express MAGI as a fraction of the FPL — used for the ACA tier lookup.
export function fplPctOf({ magi, householdSize = 1 }) {
  const fpl =
    householdSize === 2
      ? FPL_2025_FOR_2026_PTC.couple
      : FPL_2025_FOR_2026_PTC.single;
  return magi / fpl;
}

// Annual ACA premium cost for a pre-65 enrollee. Three regimes:
//   ≤ 200% FPL    → $0 (NY Essential Plan)
//   200–400% FPL  → min(unsubsidized, 9.96% of MAGI) — capped subsidized silver
//   > 400% FPL    → unsubsidized (cliff)
// Cliff boundary is inclusive on the subsidized side: per IRC §36B the PTC
// applies when household income "equals or exceeds 100 percent but does not
// exceed 400 percent of [FPL]" — so a household at exactly 400% FPL is still
// PTC-eligible. The cliff fires strictly above 400% FPL. Matches the
// "Subsidized ACA" label used at <= 400% FPL in SummaryCards and HealthcarePanel.
// Couples: pass `unsubsidizedAnnual` already doubled, or rely on the default
// (single-coverage rate × 2). The function doesn't double automatically — the
// caller knows whether both spouses are pre-65.
export function computeACAAnnualCost({
  magi,
  householdSize = 1,
  unsubsidizedAnnual = NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT,
}) {
  const fplPct = fplPctOf({ magi, householdSize });
  if (fplPct <= ESSENTIAL_PLAN_FPL_CEILING) return 0;
  if (fplPct > ACA_PTC_CLIFF_FPL) return unsubsidizedAnnual;
  // Subsidized: contribution capped at 9.96% of MAGI, but never more than
  // the unsubsidized rate (small edge case for very low-income enrollees
  // just above 200% FPL where 9.96% of MAGI could exceed the actual premium).
  return Math.min(unsubsidizedAnnual, magi * ACA_PTC_CONTRIBUTION_CAP);
}

// Look up the IRMAA tier for a given MAGI. Returns the bracket object so
// callers can show "Tier 2" or "$2,884/yr extra" without re-walking the list.
export function getIRMAATier(magi) {
  // Walk in order — first bracket whose maxMagi >= magi is the match. The
  // top tier (Infinity) catches everything beyond $500K.
  for (const bracket of IRMAA_2026_SINGLE) {
    if (magi <= bracket.maxMagi) return bracket;
  }
  // Unreachable — Infinity catches all — but keep the shape intact for callers.
  return IRMAA_2026_SINGLE[IRMAA_2026_SINGLE.length - 1];
}

// Annual Medicare cost: standard Part B base ($2,434.80 for 2026) + the
// IRMAA tier surcharge. Ignores Part D base premium (varies by plan) — we
// only price the IRMAA Part D *surcharge*, which is the cliff-driving piece.
//
// MSP zero-out: NY pays the Part B premium for anyone ≤135% FPL via the
// QMB / SLMB / QI programs (no asset test since Jan 2026). At this MAGI
// level IRMAA can't trigger either — IRMAA Tier 1 starts at $109K MAGI,
// roughly 700% FPL — so the entire Medicare premium drops to $0 for low
// income claimants. Pass `householdSize` to use the couple FPL ($21,150)
// instead of single ($15,650) when applicable.
export function computeMedicareAnnualCost({ magi, householdSize = 1 }) {
  const fpl =
    householdSize === 2
      ? FPL_2025_FOR_2026_PTC.couple
      : FPL_2025_FOR_2026_PTC.single;
  if (magi / fpl <= MSP_PART_B_FPL_CEILING) return 0;
  const tier = getIRMAATier(magi);
  return PART_B_BASE_ANNUAL_2026 + tier.annualExtra;
}

// Top-level dispatch. Pre-65 → ACA, 65+ → Medicare. The age boundary is
// firm because Medicare eligibility starts the month a person turns 65; we
// don't model the COBRA / retiree-coverage transition window.
//
// `coveredElsewhere` short-circuits the entire computation. Use it when the
// claimant has employer-sponsored coverage (still working, or covered via a
// working spouse), retiree health benefits from a former employer, VA care,
// or any other arrangement that takes them out of the ACA / Medicare-IRMAA
// cost equation. The OBBBA cliffs simply don't apply in those cases.
export function computeAnnualHealthcareCost({
  age,
  magiACA,
  magiIRMAA,
  householdSize = 1,
  unsubsidizedAnnual = NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT,
  coveredElsewhere = false,
}) {
  if (coveredElsewhere) return 0;
  if (age < 65) {
    return computeACAAnnualCost({
      magi: magiACA,
      householdSize,
      unsubsidizedAnnual,
    });
  }
  return computeMedicareAnnualCost({ magi: magiIRMAA, householdSize });
}

// Distance to the next cliff above the current MAGI, plus the cost of
// crossing it. Used by the metadata strip to surface "you are $X from the
// 400% FPL cliff, which costs $Y/yr" warnings. Returns null when there is
// no cliff above the current MAGI (e.g. already past every IRMAA tier, or
// pre-65 already paying full unsubsidized), and also when `coveredElsewhere`
// is true — there's no cliff to flag if the claimant isn't on the ACA /
// Medicare cost ladder at all.
export function nextCliffAbove({
  age,
  magiACA,
  magiIRMAA,
  householdSize = 1,
  unsubsidizedAnnual = NYC_UNSUBSIDIZED_SILVER_ANNUAL_DEFAULT,
  coveredElsewhere = false,
}) {
  if (coveredElsewhere) return null;
  const fpl =
    householdSize === 2
      ? FPL_2025_FOR_2026_PTC.couple
      : FPL_2025_FOR_2026_PTC.single;
  if (age < 65) {
    const cliff138 = MEDICAID_FPL_CEILING * fpl;
    const cliff200 = ESSENTIAL_PLAN_FPL_CEILING * fpl;
    const cliff400 = ACA_PTC_CLIFF_FPL * fpl;
    if (magiACA <= cliff138) {
      // Medicaid → Essential Plan transition. Both regimes are $0 premium,
      // so annualCostDelta is 0 — display layer surfaces this as a
      // "coverage change" cliff rather than a "+$X/yr" cliff.
      return {
        label: "NY Medicaid ceiling (138% FPL)",
        magiAtCliff: cliff138,
        distance: cliff138 - magiACA,
        annualCostDelta: 0,
      };
    }
    if (magiACA <= cliff200) {
      const currentCost = computeACAAnnualCost({
        magi: magiACA,
        householdSize,
        unsubsidizedAnnual,
      });
      // Cost just above the 200% FPL line (subsidized cap of 9.96% of MAGI).
      const justAbove = Math.min(
        unsubsidizedAnnual,
        (cliff200 + 1) * ACA_PTC_CONTRIBUTION_CAP
      );
      return {
        label: "NY Essential Plan ceiling (200% FPL)",
        magiAtCliff: cliff200,
        distance: cliff200 - magiACA,
        annualCostDelta: justAbove - currentCost,
      };
    }
    if (magiACA <= cliff400) {
      const currentCost = computeACAAnnualCost({
        magi: magiACA,
        householdSize,
        unsubsidizedAnnual,
      });
      return {
        label: "ACA premium tax credit cliff (400% FPL)",
        magiAtCliff: cliff400,
        distance: cliff400 - magiACA,
        annualCostDelta: unsubsidizedAnnual - currentCost,
      };
    }
    return null;
  }
  // 65+ — first check the Medicare Savings Program cliff (135% FPL).
  // Below it, Part B is free; crossing it puts the user on the standard
  // $2,434.80/yr Part B premium (IRMAA can't trigger this low). Above the
  // MSP ceiling, fall through to the IRMAA tier walk.
  const mspCeiling = MSP_PART_B_FPL_CEILING * fpl;
  if (magiIRMAA <= mspCeiling) {
    return {
      label: "NY Medicare Savings Program ceiling (135% FPL)",
      magiAtCliff: mspCeiling,
      distance: mspCeiling - magiIRMAA,
      annualCostDelta: PART_B_BASE_ANNUAL_2026,
    };
  }
  // Find the next IRMAA tier whose maxMagi is above current MAGI.
  const currentTier = getIRMAATier(magiIRMAA);
  const currentIdx = IRMAA_2026_SINGLE.indexOf(currentTier);
  // Already in the top tier — no cliff above.
  if (currentIdx >= IRMAA_2026_SINGLE.length - 1) return null;
  // The cliff is the upper bound of the current tier — $1 above triggers
  // the next tier's surcharge.
  const nextTier = IRMAA_2026_SINGLE[currentIdx + 1];
  return {
    label: `IRMAA Tier ${currentIdx + 1} cliff`,
    magiAtCliff: currentTier.maxMagi,
    distance: currentTier.maxMagi - magiIRMAA,
    annualCostDelta: nextTier.annualExtra - currentTier.annualExtra,
  };
}
