import { useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { C } from "./constants/colors.js";
import { useBenefitProjection } from "./hooks/useBenefitProjection.js";
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

// Top-level orchestrator. Owns all UI state and the projection hook; passes
// derived values down to presentation components. Each visual section lives
// in its own file under src/components/.
export default function App() {
  const [mode, setMode] = useState("retirement");
  const [fraBenefit, setFraBenefit] = useState(2500);
  const [ownBenefit, setOwnBenefit] = useState(1500);
  const [claimAge, setClaimAge] = useState(62);
  const [returnRate, setReturnRate] = useState(7);
  const [investStopAge, setInvestStopAge] = useState(67);
  const [lifeExpectancy, setLifeExpectancy] = useState(85);
  const [grossIncome, setGrossIncome] = useState(0);
  const [postFRAGrossIncome, setPostFRAGrossIncome] = useState(0);
  const [autoTax, setAutoTax] = useState(true);
  const [manualFedRate, setManualFedRate] = useState(12);

  // Mode-specific bounds for the claim-age slider.
  let earliest, latest;
  if (mode === "retirement") {
    earliest = 62;
    latest = 70;
  } else if (mode === "survivor") {
    earliest = 60;
    latest = 67;
  } else {
    earliest = 62;
    latest = 66.5;
  }

  // Keep investStopAge >= ceil(claimAge). When the user drags claimAge past
  // investStopAge (e.g. claimAge 70 with investStopAge stuck at 67), the
  // model handles the invalid state gracefully (no investing happens) but
  // the slider would otherwise display its raw value below its dynamic min.
  // We derive an effective value here and pass it everywhere downstream;
  // the underlying `investStopAge` state is preserved so dragging claimAge
  // back down restores the user's earlier choice.
  const minInvestStopAge = Math.max(60, Math.ceil(claimAge));
  const effectiveInvestStopAge = Math.max(investStopAge, minInvestStopAge);

  // When the user switches modes, snap claimAge into the new mode's range so
  // the projection stays sensible. Picks a neutral midpoint when wildly out.
  const switchMode = (newMode) => {
    setMode(newMode);
    if (newMode === "survivor") {
      if (claimAge < 60) setClaimAge(60);
      if (claimAge > 67) setClaimAge(65);
    } else if (newMode === "switch") {
      if (claimAge < 62) setClaimAge(62);
      if (claimAge > 66.5) setClaimAge(64);
    } else {
      if (claimAge < 62) setClaimAge(62);
      if (claimAge > 70) setClaimAge(70);
    }
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
    autoTax,
    manualFedRate,
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
  } = useBenefitProjection(inputs);

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
              autoTax={autoTax}
              setAutoTax={setAutoTax}
              setManualFedRate={setManualFedRate}
              earlyFactor={earlyFactor}
              earningsTestWithholding={earningsTestWithholding}
              fedMarginalRate={fedMarginalRate}
            />

            <SummaryCards
              mode={mode}
              claimAge={claimAge}
              investStopAge={effectiveInvestStopAge}
              returnRate={returnRate}
              earlyMonthlyGross={earlyMonthlyGross}
              earlyMonthlyNet={earlyMonthlyNet}
              earlyPostFRAMonthlyNet={earlyPostFRAMonthlyNet}
              fraMonthlyGross={fraMonthlyGross}
              fraMonthlyNet={fraMonthlyNet}
              earningsTestWithholding={earningsTestWithholding}
              recoupedFactor={recoupedFactor}
              potAtStopRow={potAtStopRow}
              breakEvenAge={breakEvenAge}
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
            potAtStopRow={potAtStopRow}
            finalPot={finalPot}
            finalEarly={finalEarly}
            advantage={advantage}
          />

          <SensitivityTornado inputs={inputs} />

          <PotTable
            claimAge={claimAge}
            lifeExpectancy={lifeExpectancy}
            returnRate={returnRate}
            investStopAge={effectiveInvestStopAge}
            chartData={chartData}
          />

          <Footnotes />
        </div>
      </div>
    </div>
  );
}
