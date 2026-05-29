import { useMemo } from "react";
import { computeProjection } from "../lib/benefitMath.js";

// Thin React wrapper around computeProjection — memoized so the chart only
// recomputes when an actual input changes. The inputs object is destructured
// in the dependency array so React tracks each value individually.
export function useBenefitProjection(inputs) {
  return useMemo(
    () => computeProjection(inputs),
    [
      inputs.mode,
      inputs.fraBenefit,
      inputs.ownBenefit,
      inputs.claimAge,
      inputs.returnRate,
      inputs.investStopAge,
      inputs.lifeExpectancy,
      inputs.grossIncome,
      inputs.postFRAGrossIncome,
      inputs.postFRAWorkYears,
      inputs.autoTax,
      inputs.manualFedRate,
      inputs.investedPct,
      inputs.investedPctWait,
      inputs.coveredElsewhere,
      inputs.unsubsidizedSilverAnnual,
      inputs.locality,
    ]
  );
}
