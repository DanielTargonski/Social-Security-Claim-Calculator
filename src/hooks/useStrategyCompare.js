import { useMemo } from "react";
import { compareStrategies } from "../lib/strategyCompare.js";

// useMemo wrapper around compareStrategies. Keyed on the same input fields the
// projection depends on so the three-strategy comparison only recomputes when
// something that actually moves the numbers changes. Mirrors the dependency
// list style used by useBenefitProjection / SensitivityTornado.
export function useStrategyCompare(inputs) {
  const {
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
    investedEarlyDollar,
    investedEarlyDollarByStrategy,
  } = inputs;

  return useMemo(
    () =>
      compareStrategies({
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
        investedEarlyDollar,
        investedEarlyDollarByStrategy,
      }),
    [
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
      // Global dollar-mode early invest (null in percentage mode). Drives the
      // per-scenario fraction, so it must re-trigger the comparison.
      investedEarlyDollar,
      // Per-strategy invested-dollar overrides (comparison-only). New object
      // identity whenever the user edits a strategy's amount, so the reference
      // is a sound dep — recompute when any override changes.
      investedEarlyDollarByStrategy,
    ]
  );
}
