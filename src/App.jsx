import { useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { C } from "./constants/colors.js";
import { useBenefitProjection } from "./hooks/useBenefitProjection.js";
import { useOptimalClaimAge } from "./hooks/useOptimalClaimAge.js";
import { useFormState } from "./hooks/useFormState.js";
import { useUrlSync } from "./hooks/useUrlSync.js";
import { getInitialStateFromUrl } from "./lib/shareableState.js";
import { rangeForMode, snapClaimAgeOnModeSwitch } from "./lib/modeConfig.js";
import {
  computeMagiACA,
  computeMagiIRMAA,
  computeAnnualHealthcareCost,
  nextCliffAbove,
} from "./lib/healthcareCost.js";
import { computeTaxableSSPct } from "./lib/taxMath.js";
import GlobalStyles from "./components/GlobalStyles.jsx";
import Header from "./components/Header.jsx";
import ModeSwitcher from "./components/ModeSwitcher.jsx";
import InputsPanel from "./components/InputsPanel.jsx";
import SummaryCards from "./components/SummaryCards.jsx";
import MetadataStrip from "./components/MetadataStrip.jsx";
import ChartCard from "./components/ChartCard.jsx";
import PotTable from "./components/PotTable.jsx";
import Footnotes from "./components/Footnotes.jsx";
import SensitivityTornado from "./components/SensitivityTornado.jsx";
import HealthcarePanel from "./components/HealthcarePanel.jsx";
import OptimalClaimAge from "./components/OptimalClaimAge.jsx";
import AboutPage from "./components/AboutPage.jsx";
import TabNav from "./components/TabNav.jsx";

// Top-level orchestrator. Owns all UI state and the projection hook; passes
// derived values down to presentation components. Each visual section lives
// in its own file under src/components/.
export default function App() {
  // Top-level view: "calculator" (default) or "about" (the explainer page
  // with the worked example and sources). Lives at App level so the tab
  // remains in scope across re-renders. Not URL-persisted on purpose —
  // share links should drop people directly into the calculator they
  // configured, not the explainer.
  const [view, setView] = useState("calculator");

  // Hydrate initial state from URL query params (set by ShareLinkButton when
  // someone shared this link). Falls back to defaults for any missing field.
  // See lib/shareableState.js for the schema and per-field defaults. Lazy
  // initializer so the URL is parsed once on mount, not on every render.
  // useFormState bundles all form fields into a single state object and
  // auto-generates per-field setters keyed off the initial keys — adding a
  // new input is a one-line change in the shareableState SCHEMA, not a
  // four-place edit here.
  const [state, setters] = useFormState(getInitialStateFromUrl);
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
    householdSize,
    coveredElsewhere,
    unsubsidizedSilverAnnual,
  } = state;
  const {
    setMode,
    setFraBenefit,
    setOwnBenefit,
    setClaimAge,
    setReturnRate,
    setInvestStopAge,
    setLifeExpectancy,
    setGrossIncome,
    setPostFRAGrossIncome,
    setPostFRAWorkYears,
    setAutoTax,
    setManualFedRate,
    setInvestedPct,
    setInvestedPctWait,
    setHouseholdSize,
    setCoveredElsewhere,
    setUnsubsidizedSilverAnnual,
  } = setters;

  // Mirror state into the URL on every change. Stored raw investStopAge
  // intentionally, not the clamped effective value, so a shared link
  // preserves the user's actual setting and "comes back" if the recipient
  // drags claimAge down.
  useUrlSync(state);

  // Mode-specific bounds for the claim-age slider.
  const { earliest, latest } = rangeForMode(mode);

  // Keep investStopAge bounded by both ends: at least ceil(claimAge) (can't
  // stop investing before you've started), at most lifeExpectancy (can't
  // stop investing after you're dead — otherwise downstream UI shows
  // "Pot at age 80" reading $0 when life=70 because the chart never
  // reaches that age). Underlying `investStopAge` state is preserved so
  // dragging claim/life back to a wider window restores the user's choice.
  const minInvestStopAge = Math.max(60, Math.ceil(claimAge));
  const effectiveInvestStopAge = Math.min(
    Math.max(investStopAge, minInvestStopAge),
    lifeExpectancy
  );

  // When the user switches modes, snap claimAge into the new mode's range so
  // the projection stays sensible. Picks a mode-specific landing age when
  // wildly out — see snapClaimAgeOnModeSwitch in modeConfig.js.
  const switchMode = (newMode) => {
    setMode(newMode);
    const snapped = snapClaimAgeOnModeSwitch(newMode, claimAge);
    if (snapped !== claimAge) setClaimAge(snapped);
  };

  const inputs = {
    mode,
    fraBenefit,
    ownBenefit,
    claimAge,
    returnRate,
    investStopAge: effectiveInvestStopAge,
    lifeExpectancy,
    grossIncome,
    postFRAGrossIncome,
    postFRAWorkYears,
    autoTax,
    manualFedRate,
    investedPct,
    investedPctWait,
    householdSize,
    coveredElsewhere,
    unsubsidizedSilverAnnual,
  };

  const {
    earlyFactor,
    earlyMonthlyGross,
    fraMonthlyGross,
    earlyPostFRAMonthlyGross,
    recoupedFactor,
    annualEarlyGross,
    earningsTestWithholding,
    combinedIncome,
    taxableSSPct,
    fedMarginalRate,
    ssEffectiveTaxRate,
    earlyMonthlyNet,
    earlyPostFRAMonthlyNet,
    fraMonthlyNet,
    chartData,
    breakEvenAge,
    finalEarly,
    finalPot,
    advantage,
    potAtStopRow,
    crossoverValue,
    waitInvestedAdvantage,
    waitInvestedBreakEvenAge,
    healthcareDeltaAnnualPre,
    seniorDeductionPreFRA,
    seniorDeductionPreFRA65Plus,
    seniorDeductionPostFRA,
    seniorDeductionWait,
    seniorDeductionAnnualSavingsEarlyPre,
    seniorDeductionAnnualSavingsEarlyPre65Plus,
    seniorDeductionAnnualSavingsEarlyPost,
    seniorDeductionAnnualSavingsWait,
    seniorDeductionLifetimeEarly,
    seniorDeductionLifetimeWait,
    seniorDeductionEligibleYearsEarly,
    seniorDeductionEligibleYearsWait,
  } = useBenefitProjection(inputs);

  // Sweeps claimAge across the mode's range and reports the peak. Shared
  // between the small chip under the claim-age slider (in InputsPanel)
  // and the full OptimalClaimAge panel below the chart.
  const optimal = useOptimalClaimAge(inputs);

  const primaryBenefitLabel =
    mode === "retirement" ? "Your benefit at 67" : "Survivor benefit at 67";

  const taxesActive = grossIncome > 0 || fedMarginalRate > 0;

  // Healthcare cost surfaces two rows in the metadata strip: the ACA
  // premium that applies during pre-65 years, and the Medicare cost that
  // applies from 65 on. Both rows always render (when not covered
  // elsewhere) so the user sees the full lifecycle regardless of where
  // their claim age lands — a 67-year-old claimer still pays ACA from
  // 62-64, a 62-year-old still ages into Medicare at 65.
  //
  // SS is in MAGI only when the claimant is actually collecting it during
  // the relevant window. Pre-65 ACA: SS is in MAGI iff claimAge < 65.
  // 65+ Medicare: SS is in MAGI iff claimAge ≤ 65 (it always is by the
  // time Medicare kicks in for any modeled scenario).
  //
  // ACA MAGI counts 100% of gross SS; IRMAA MAGI uses the taxable portion
  // only (consistent with taxMath's federal-tax math).
  const magiACAPre65 = computeMagiACA({
    grossIncome,
    ssAnnualGross: claimAge < 65 ? annualEarlyGross : 0,
  });
  // For the 65–67 window: pre-67 wages still apply, and the SS basis is the
  // pre-FRA reduced amount. The taxableSSPct returned by the math layer is
  // the post-FRA value (computed against post-67 wages + recouped SS), so
  // we recompute fresh against pre-67 inputs to get the right IRMAA MAGI
  // for this window.
  const taxableSSPctPre67 = computeTaxableSSPct({
    ssBasisAnnual: annualEarlyGross,
    grossIncome,
  });
  const magiIRMAA65Plus = computeMagiIRMAA({
    grossIncome,
    ssAnnualGross: annualEarlyGross,
    taxableSSPct: taxableSSPctPre67,
  });
  const acaAnnualCost = computeAnnualHealthcareCost({
    age: 62,
    magiACA: magiACAPre65,
    magiIRMAA: 0,
    householdSize,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  const medicareAnnualCost = computeAnnualHealthcareCost({
    age: 65,
    magiACA: 0,
    magiIRMAA: magiIRMAA65Plus,
    householdSize,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  // Post-67 Medicare snapshot. The 65+ window has two phases when post-67
  // income differs from pre-67 income: 65–67 (still working at pre-67 wages
  // and pre-FRA SS basis) and 67+ (post-67 wages and the recouped post-FRA
  // SS basis). The chart's break-even math already splits this way; this
  // snapshot lets the sidebar reflect it. Taxable SS pct is recomputed
  // from scratch because both the SS amount and the wage income differ
  // from the pre-FRA snapshot.
  const annualEarlyPostFRAGross = earlyPostFRAMonthlyGross * 12;
  const taxableSSPctPost67 = computeTaxableSSPct({
    ssBasisAnnual: annualEarlyPostFRAGross,
    grossIncome: postFRAGrossIncome,
  });
  const magiIRMAAPost67 = computeMagiIRMAA({
    grossIncome: postFRAGrossIncome,
    ssAnnualGross: annualEarlyPostFRAGross,
    taxableSSPct: taxableSSPctPost67,
  });
  const medicareAnnualCostPost67 = computeAnnualHealthcareCost({
    age: 67,
    magiACA: 0,
    magiIRMAA: magiIRMAAPost67,
    householdSize,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  // Next-cliff is the actionable one for the user's current claim-age
  // regime — pre-65 surfaces the ACA cliff, 65+ surfaces the IRMAA cliff.
  const healthcareNextCliff = nextCliffAbove({
    age: claimAge,
    magiACA: magiACAPre65,
    magiIRMAA: magiIRMAA65Plus,
    householdSize,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });

  return (
    <div
      style={{
        backgroundColor: C.bg,
        minHeight: "100vh",
        fontFamily: "'Fraunces', Georgia, serif",
      }}
    >
      <GlobalStyles />
      <Analytics />

      <div style={{ position: "relative" }}>
        <div className="grain" />

        <div className="max-w-5xl mx-auto px-5 py-8 md:py-12 relative">
          <TabNav view={view} onChange={setView} />

          {view === "about" ? (
            <>
              <AboutPage />
              <Footnotes />
            </>
          ) : (
          <>
          <Header investStopAge={effectiveInvestStopAge} />

          <ModeSwitcher mode={mode} onChange={switchMode} />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">
            <InputsPanel
              mode={mode}
              primaryBenefitLabel={primaryBenefitLabel}
              earliest={earliest}
              latest={latest}
              fraBenefit={fraBenefit}
              setFraBenefit={setFraBenefit}
              ownBenefit={ownBenefit}
              setOwnBenefit={setOwnBenefit}
              claimAge={claimAge}
              setClaimAge={setClaimAge}
              returnRate={returnRate}
              setReturnRate={setReturnRate}
              investStopAge={effectiveInvestStopAge}
              setInvestStopAge={setInvestStopAge}
              lifeExpectancy={lifeExpectancy}
              setLifeExpectancy={setLifeExpectancy}
              grossIncome={grossIncome}
              setGrossIncome={setGrossIncome}
              postFRAGrossIncome={postFRAGrossIncome}
              setPostFRAGrossIncome={setPostFRAGrossIncome}
              postFRAWorkYears={postFRAWorkYears}
              setPostFRAWorkYears={setPostFRAWorkYears}
              autoTax={autoTax}
              setAutoTax={setAutoTax}
              setManualFedRate={setManualFedRate}
              investedPct={investedPct}
              setInvestedPct={setInvestedPct}
              investedPctWait={investedPctWait}
              setInvestedPctWait={setInvestedPctWait}
              householdSize={householdSize}
              setHouseholdSize={setHouseholdSize}
              coveredElsewhere={coveredElsewhere}
              setCoveredElsewhere={setCoveredElsewhere}
              unsubsidizedSilverAnnual={unsubsidizedSilverAnnual}
              setUnsubsidizedSilverAnnual={setUnsubsidizedSilverAnnual}
              earlyFactor={earlyFactor}
              earlyMonthlyNet={earlyMonthlyNet}
              fraMonthlyNet={fraMonthlyNet}
              earningsTestWithholding={earningsTestWithholding}
              fedMarginalRate={fedMarginalRate}
              optimal={optimal}
            />

            <SummaryCards
              mode={mode}
              claimAge={claimAge}
              investStopAge={effectiveInvestStopAge}
              returnRate={returnRate}
              earlyMonthlyGross={earlyMonthlyGross}
              earlyMonthlyNet={earlyMonthlyNet}
              earlyPostFRAMonthlyGross={earlyPostFRAMonthlyGross}
              earlyPostFRAMonthlyNet={earlyPostFRAMonthlyNet}
              fraMonthlyGross={fraMonthlyGross}
              fraMonthlyNet={fraMonthlyNet}
              earningsTestWithholding={earningsTestWithholding}
              recoupedFactor={recoupedFactor}
              potAtStopRow={potAtStopRow}
              breakEvenAge={breakEvenAge}
              advantage={advantage}
              lifeExpectancy={lifeExpectancy}
              crossoverValue={crossoverValue}
              investedPctWait={investedPctWait}
              waitInvestedAdvantage={waitInvestedAdvantage}
              waitInvestedBreakEvenAge={waitInvestedBreakEvenAge}
              coveredElsewhere={coveredElsewhere}
              householdSize={householdSize}
              acaAnnualCost={acaAnnualCost}
              medicareAnnualCost={medicareAnnualCost}
              magiACAPre65={magiACAPre65}
              magiIRMAA65Plus={magiIRMAA65Plus}
              magiIRMAAPost67={magiIRMAAPost67}
              medicareAnnualCostPost67={medicareAnnualCostPost67}
              grossIncome={grossIncome}
              postFRAGrossIncome={postFRAGrossIncome}
              seniorDeductionPreFRA={seniorDeductionPreFRA}
              seniorDeductionPreFRA65Plus={seniorDeductionPreFRA65Plus}
              seniorDeductionPostFRA={seniorDeductionPostFRA}
              seniorDeductionWait={seniorDeductionWait}
              seniorDeductionAnnualSavingsEarlyPre={seniorDeductionAnnualSavingsEarlyPre}
              seniorDeductionAnnualSavingsEarlyPre65Plus={seniorDeductionAnnualSavingsEarlyPre65Plus}
              seniorDeductionAnnualSavingsEarlyPost={seniorDeductionAnnualSavingsEarlyPost}
              seniorDeductionAnnualSavingsWait={seniorDeductionAnnualSavingsWait}
              seniorDeductionLifetimeEarly={seniorDeductionLifetimeEarly}
              seniorDeductionLifetimeWait={seniorDeductionLifetimeWait}
              seniorDeductionEligibleYearsEarly={seniorDeductionEligibleYearsEarly}
              seniorDeductionEligibleYearsWait={seniorDeductionEligibleYearsWait}
            />
          </div>


          <MetadataStrip
            autoTax={autoTax}
            annualEarlyGross={annualEarlyGross}
            earningsTestWithholding={earningsTestWithholding}
            earlyMonthlyGross={earlyMonthlyGross}
            earlyPostFRAMonthlyGross={earlyPostFRAMonthlyGross}
            recoupedFactor={recoupedFactor}
            combinedIncome={combinedIncome}
            taxableSSPct={taxableSSPct}
            ssEffectiveTaxRate={ssEffectiveTaxRate}
            lifeExpectancy={lifeExpectancy}
            coveredElsewhere={coveredElsewhere}
            acaAnnualCost={acaAnnualCost}
            medicareAnnualCost={medicareAnnualCost}
            medicareAnnualCostPost67={medicareAnnualCostPost67}
            healthcareNextCliff={healthcareNextCliff}
            claimAge={claimAge}
          />

          <ChartCard
            claimAge={claimAge}
            investStopAge={effectiveInvestStopAge}
            lifeExpectancy={lifeExpectancy}
            returnRate={returnRate}
            taxesActive={taxesActive}
            chartData={chartData}
            breakEvenAge={breakEvenAge}
            waitInvestedBreakEvenAge={waitInvestedBreakEvenAge}
            potAtStopRow={potAtStopRow}
            finalPot={finalPot}
            finalEarly={finalEarly}
            advantage={advantage}
          />

          <PotTable
            claimAge={claimAge}
            lifeExpectancy={lifeExpectancy}
            returnRate={returnRate}
            investStopAge={effectiveInvestStopAge}
            chartData={chartData}
          />

          <HealthcarePanel
            claimAge={claimAge}
            coveredElsewhere={coveredElsewhere}
            householdSize={householdSize}
            magiACAPre65={magiACAPre65}
            magiIRMAA65Plus={magiIRMAA65Plus}
            acaAnnualCost={acaAnnualCost}
            medicareAnnualCost={medicareAnnualCost}
            healthcareNextCliff={healthcareNextCliff}
            unsubsidizedSilverAnnual={unsubsidizedSilverAnnual}
          />

          <OptimalClaimAge
            inputs={inputs}
            optimal={optimal}
            setClaimAge={setClaimAge}
          />

          <SensitivityTornado inputs={inputs} />

          <Footnotes />
          </>
          )}
        </div>
      </div>
    </div>
  );
}
