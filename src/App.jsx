import { useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { C } from "./constants/colors.js";
import { useBenefitProjection } from "./hooks/useBenefitProjection.js";
import { useOptimalClaimAge } from "./hooks/useOptimalClaimAge.js";
import { useFormState } from "./hooks/useFormState.js";
import { useUrlSync } from "./hooks/useUrlSync.js";
import { getInitialStateFromUrl } from "./lib/shareableState.js";
import { rangeForMode, snapClaimAgeOnModeSwitch } from "./lib/modeConfig.js";
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
  } = useBenefitProjection(inputs);

  // Sweeps claimAge across the mode's range and reports the peak. Shared
  // between the small chip under the claim-age slider (in InputsPanel)
  // and the full OptimalClaimAge panel below the chart.
  const optimal = useOptimalClaimAge(inputs);

  const primaryBenefitLabel =
    mode === "retirement" ? "Your benefit at 67" : "Survivor benefit at 67";

  const taxesActive = grossIncome > 0 || fedMarginalRate > 0;

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
