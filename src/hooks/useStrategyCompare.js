import { useMemo } from "react";
import { compareStrategies } from "../lib/strategyCompare.js";

// useMemo wrapper around compareStrategies. Keyed on the same input fields the
// projection depends on so the three-strategy comparison only recomputes when
// something that actually moves the numbers changes. Mirrors the dependency
// list style used by useBenefitProjection / SensitivityTornado.
export function useStrategyCompare(inputs) {
  return useMemo(
    () => compareStrategies(inputs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
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
      // Dollar-mode early invest (null in percentage mode). Drives the
      // per-scenario fraction, so it must re-trigger the comparison.
      inputs.investedEarlyDollar,
    ]
  );
}
