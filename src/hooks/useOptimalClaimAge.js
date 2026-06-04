import { useMemo } from "react";
import { findOptimalClaimAge } from "../lib/optimalClaimAge.js";

// Memoized wrapper around findOptimalClaimAge. Hoisted to a hook so the
// 96-call sweep runs once per input change at App level — and the result
// can flow to multiple consumers (the small chip under the claim-age
// slider, the full panel below the chart) without duplicate computation.
//
// Deps mirror SensitivityTornado's set: every input field that
// computeProjection actually reads. claimAge is included because the
// hook's result also reports baselineScore (the score at the user's
// current pick), which moves with claimAge even though the optimum
// itself does not.
export function useOptimalClaimAge(inputs) {
  const {
    mode,
    fraBenefit,
    ownBenefit,
    claimAge,
    returnRate,
    investStopAge,
    lifeExpectancy,
    grossIncome,
    postFRAGrossIncome,
    postFRAWorkYears,
    autoTax,
    manualFedRate,
    investedPct,
    coveredElsewhere,
    unsubsidizedSilverAnnual,
  } = inputs;

  return useMemo(() => findOptimalClaimAge({
    mode,
    fraBenefit,
    ownBenefit,
    claimAge,
    returnRate,
    investStopAge,
    lifeExpectancy,
    grossIncome,
    postFRAGrossIncome,
    postFRAWorkYears,
    autoTax,
    manualFedRate,
    investedPct,
    coveredElsewhere,
    unsubsidizedSilverAnnual,
  }), [
    mode,
    fraBenefit,
    ownBenefit,
    claimAge,
    returnRate,
    investStopAge,
    lifeExpectancy,
    grossIncome,
    postFRAGrossIncome,
    postFRAWorkYears,
    autoTax,
    manualFedRate,
    investedPct,
    coveredElsewhere,
    unsubsidizedSilverAnnual,
  ]);
}
