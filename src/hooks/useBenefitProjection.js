import { useMemo } from "react";
import { computeProjection } from "../lib/benefitMath.js";

// Thin React wrapper around computeProjection — memoized so the chart only
// recomputes when an actual input changes. The inputs object is destructured
// in the dependency array so React tracks each value individually.
export function useBenefitProjection(inputs) {
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
    investedPctWait,
    coveredElsewhere,
    unsubsidizedSilverAnnual,
    locality,
  } = inputs;

  return useMemo(
    () =>
      computeProjection({
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
        investedPctWait,
        coveredElsewhere,
        unsubsidizedSilverAnnual,
        locality,
      }),
    [
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
      investedPctWait,
      coveredElsewhere,
      unsubsidizedSilverAnnual,
      locality,
    ]
  );
}
