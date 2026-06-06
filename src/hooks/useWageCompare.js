import { useMemo } from "react";
import {
  compareWages,
  compareStrategiesAcrossWages,
} from "../lib/wageCompare.js";

// useMemo wrapper around compareWages. Keyed on the projection inputs that move
// the numbers PLUS the wage scenarios being raced. `grossIncome` is deliberately
// NOT a dependency — each scenario carries its own wage, and compareWages
// ignores the inputs-level grossIncome. Mirrors the dependency-list style of
// useBenefitProjection / useStrategyCompare.
export function useWageCompare(inputs, wageScenarios) {
  const {
    mode,
    fraBenefit,
    ownBenefit,
    birthMonth,
    birthYear,
    claimAge,
    returnRate,
    investStopAge,
    lifeExpectancy,
    postFRAGrossIncome,
    postFRAWorkYears,
    autoTax,
    manualFedRate,
    investedPct,
    investedPctWait,
    coveredElsewhere,
    unsubsidizedSilverAnnual,
    locality,
    // Invest resolution must match the rest of the app (StrategyCompare + the
    // BY WAGE lever) so the wage panel honors $-mode / per-strategy invest
    // instead of always investing the percentage. Null/absent in % mode.
    investedEarlyDollar,
    investedEarlyDollarByStrategy,
  } = inputs;

  return useMemo(
    () =>
      compareWages(
        {
          mode,
          fraBenefit,
          ownBenefit,
          birthMonth,
          birthYear,
          claimAge,
          returnRate,
          investStopAge,
          lifeExpectancy,
          postFRAGrossIncome,
          postFRAWorkYears,
          autoTax,
          manualFedRate,
          investedPct,
          investedPctWait,
          coveredElsewhere,
          unsubsidizedSilverAnnual,
          locality,
          investedEarlyDollar,
          investedEarlyDollarByStrategy,
        },
        wageScenarios
      ),
    [
      mode,
      fraBenefit,
      ownBenefit,
      birthMonth,
      birthYear,
      claimAge,
      returnRate,
      investStopAge,
      lifeExpectancy,
      postFRAGrossIncome,
      postFRAWorkYears,
      autoTax,
      manualFedRate,
      investedPct,
      investedPctWait,
      coveredElsewhere,
      unsubsidizedSilverAnnual,
      locality,
      investedEarlyDollar,
      investedEarlyDollarByStrategy,
      // App memoizes wageScenarios on (grossIncome, wageAltA, wageAltB), so the
      // reference is stable until a wage changes — a sound dependency, same as
      // useStrategyCompare's investedEarlyDollarByStrategy.
      wageScenarios,
    ]
  );
}

// Cross-wage strategy robustness for the StrategyCompare panel: does one
// strategy (own->survivor switch vs survivor-early) win at EVERY pre-67 wage the
// user is comparing? Only meaningful in the survivor-context modes — returns null
// otherwise so retirement mode skips the (twice-as-expensive) computation.
export function useWageRobustness(inputs, wageScenarios) {
  const {
    mode,
    fraBenefit,
    ownBenefit,
    birthMonth,
    birthYear,
    claimAge,
    returnRate,
    investStopAge,
    lifeExpectancy,
    postFRAGrossIncome,
    postFRAWorkYears,
    autoTax,
    manualFedRate,
    investedPct,
    investedPctWait,
    coveredElsewhere,
    unsubsidizedSilverAnnual,
    locality,
    // Invest resolution must match the main strategy verdict so the BY WAGE
    // lever races each strategy at the same dollars the panel displays.
    investedEarlyDollar,
    investedEarlyDollarByStrategy,
  } = inputs;

  return useMemo(
    () => {
      if (mode !== "survivor" && mode !== "switch") return null;
      return compareStrategiesAcrossWages(
        {
          mode,
          fraBenefit,
          ownBenefit,
          birthMonth,
          birthYear,
          claimAge,
          returnRate,
          investStopAge,
          lifeExpectancy,
          postFRAGrossIncome,
          postFRAWorkYears,
          autoTax,
          manualFedRate,
          investedPct,
          investedPctWait,
          coveredElsewhere,
          unsubsidizedSilverAnnual,
          locality,
          investedEarlyDollar,
          investedEarlyDollarByStrategy,
        },
        wageScenarios
      );
    },
    [
      mode,
      fraBenefit,
      ownBenefit,
      birthMonth,
      birthYear,
      claimAge,
      returnRate,
      investStopAge,
      lifeExpectancy,
      postFRAGrossIncome,
      postFRAWorkYears,
      autoTax,
      manualFedRate,
      investedPct,
      investedPctWait,
      coveredElsewhere,
      unsubsidizedSilverAnnual,
      locality,
      investedEarlyDollar,
      investedEarlyDollarByStrategy,
      wageScenarios,
    ]
  );
}
