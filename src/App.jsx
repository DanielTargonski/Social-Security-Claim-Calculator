import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { C } from "./constants/colors.js";
import { useBenefitProjection } from "./hooks/useBenefitProjection.js";
import {
  getInitialStateFromUrl,
  serializeStateToParams,
} from "./lib/shareableState.js";
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
  // Hydrate initial state from URL query params (set by ShareLinkButton when
  // someone shared this link). Falls back to defaults for any missing field.
  // See lib/shareableState.js for the schema and per-field defaults.
  // Lazy useState so the URL is parsed once on mount, not on every render.
  const [initial] = useState(getInitialStateFromUrl);
  const [mode, setMode] = useState(initial.mode);
  const [fraBenefit, setFraBenefit] = useState(initial.fraBenefit);
  const [ownBenefit, setOwnBenefit] = useState(initial.ownBenefit);
  const [claimAge, setClaimAge] = useState(initial.claimAge);
  const [returnRate, setReturnRate] = useState(initial.returnRate);
  const [investStopAge, setInvestStopAge] = useState(initial.investStopAge);
  const [lifeExpectancy, setLifeExpectancy] = useState(initial.lifeExpectancy);
  const [grossIncome, setGrossIncome] = useState(initial.grossIncome);
  const [postFRAGrossIncome, setPostFRAGrossIncome] = useState(
    initial.postFRAGrossIncome
  );
  const [autoTax, setAutoTax] = useState(initial.autoTax);
  const [manualFedRate, setManualFedRate] = useState(initial.manualFedRate);
  const [investedPct, setInvestedPct] = useState(initial.investedPct);

  // Mirror state into the URL on every change via replaceState (no history
  // entries — back button shouldn't undo individual slider drags). Stored
  // raw investStopAge intentionally, not the clamped effective value, so a
  // shared link preserves the user's actual setting and "comes back" if the
  // recipient drags claimAge down.
  useEffect(() => {
    const params = serializeStateToParams({
      mode,
      fraBenefit,
      ownBenefit,
      claimAge,
      returnRate,
      investStopAge,
      lifeExpectancy,
      grossIncome,
      postFRAGrossIncome,
      autoTax,
      manualFedRate,
      investedPct,
    });
    const newSearch = "?" + params.toString();
    if (window.location.search !== newSearch) {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + newSearch + window.location.hash
      );
    }
  }, [
    mode,
    fraBenefit,
    ownBenefit,
    claimAge,
    returnRate,
    investStopAge,
    lifeExpectancy,
    grossIncome,
    postFRAGrossIncome,
    autoTax,
    manualFedRate,
    investedPct,
  ]);

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
    investedPct,
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
              investedPct={investedPct}
              setInvestedPct={setInvestedPct}
              earlyFactor={earlyFactor}
              earlyMonthlyNet={earlyMonthlyNet}
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
              advantage={advantage}
              lifeExpectancy={lifeExpectancy}
              crossoverValue={crossoverValue}
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
