import { fmtMoney, fmtBig, fmtAge, fmtDuration } from "../lib/benefitMath.js";
import {
  MEDICAID_FPL_CEILING,
  ESSENTIAL_PLAN_FPL_CEILING,
  ACA_PTC_CLIFF_FPL,
  MSP_PART_B_FPL_CEILING,
  FPL_2025_FOR_2026_PTC,
} from "../lib/healthcareCost.js";
import { C } from "../constants/colors.js";
import Var from "./Var.jsx";

// Three at-a-glance cards next to the inputs:
//   1. Net check at the chosen claim age (early)
//   2. Net check at FRA (wait)
//   3. Either pot-at-investStop (switch mode) or break-even age (other modes)
export default function SummaryCards({
  mode,
  claimAge,
  investStopAge,
  returnRate,
  earlyMonthlyGross,
  earlyMonthlyNet,
  earlyPostFRAMonthlyGross,
  earlyPostFRAMonthlyNet,
  fraMonthlyGross,
  fraMonthlyNet,
  earningsTestWithholding,
  recoupedFactor,
  potAtStopRow,
  breakEvenAge,
  // For the third card's enhanced content (verdict & context lines)
  advantage,
  lifeExpectancy,
  crossoverValue,
  // Wait+invest comparison (the "fair fight" — what if wait also invested
  // its checks at the same return rate?). Surfaced as a small addendum at
  // the bottom of Card 3.
  investedPctWait = 0,
  waitInvestedAdvantage = 0,
  waitInvestedBreakEvenAge = null,
  // Healthcare-cost summary (OBBBA / NYC). Lives in its own card at the
  // bottom of the sticky sidebar so the user can see pre-65 and 65+ cost
  // bands while they scroll through the inputs.
  coveredElsewhere = false,
  householdSize = 1,
  acaAnnualCost = 0,
  medicareAnnualCost = 0,
  magiACAPre65 = 0,
  magiIRMAA65Plus = 0,
  magiIRMAAPost67 = 0,
  medicareAnnualCostPost67 = 0,
  grossIncome = 0,
  postFRAGrossIncome = 0,
  // OBBBA senior bonus deduction (2025–2028, age 65+). Per-window amounts,
  // per-year dollar savings, lifetime totals, and eligible-year counts.
  seniorDeductionPreFRA = 0,
  seniorDeductionPreFRA65Plus = 0,
  seniorDeductionPostFRA = 0,
  seniorDeductionWait = 0,
  seniorDeductionAnnualSavingsEarlyPre = 0,
  seniorDeductionAnnualSavingsEarlyPre65Plus = 0,
  seniorDeductionAnnualSavingsEarlyPost = 0,
  seniorDeductionAnnualSavingsWait = 0,
  seniorDeductionLifetimeEarly = 0,
  seniorDeductionLifetimeWait = 0,
  seniorDeductionEligibleYearsEarly = 0,
  seniorDeductionEligibleYearsWait = 0,
}) {
  // Healthcare-card derived values. Compute the pre-65 ACA band label and
  // 65+ MSP-vs-IRMAA status from the MAGI inputs. Kept local rather than
  // duplicating HealthcarePanel's `bandForFplPct` because the sidebar
  // shows a compact label, not the full panel's detail line.
  const fpl =
    householdSize === 2
      ? FPL_2025_FOR_2026_PTC.couple
      : FPL_2025_FOR_2026_PTC.single;
  const acaFplPct = magiACAPre65 / fpl;
  const irmaaFplPct = magiIRMAA65Plus / fpl;
  let acaBandLabel;
  let acaBandColor;
  if (acaFplPct <= MEDICAID_FPL_CEILING) {
    acaBandLabel = "Medicaid eligible";
    acaBandColor = C.wait;
  } else if (acaFplPct <= ESSENTIAL_PLAN_FPL_CEILING) {
    acaBandLabel = "Essential Plan";
    acaBandColor = C.wait;
  } else if (acaFplPct <= ACA_PTC_CLIFF_FPL) {
    acaBandLabel = "Subsidized ACA";
    acaBandColor = C.ink;
  } else {
    acaBandLabel = "Unsubsidized ACA";
    acaBandColor = C.early;
  }
  const mspEligible = irmaaFplPct <= MSP_PART_B_FPL_CEILING;
  const labelForMedicare = (cost, eligible) =>
    eligible
      ? "MSP covers Part B"
      : cost > 2500
      ? "Standard + IRMAA"
      : "Standard Part B";
  const medicareLabel = labelForMedicare(medicareAnnualCost, mspEligible);
  // Post-67 (retirement-phase) Medicare snapshot. Only meaningfully
  // different from the 65–67 snapshot when post-67 wages differ from
  // pre-67 wages — e.g., the user retired at FRA so wages drop to $0,
  // potentially dropping MAGI under the MSP ceiling and zeroing Part B.
  const irmaaPost67FplPct = magiIRMAAPost67 / fpl;
  const mspEligiblePost67 = irmaaPost67FplPct <= MSP_PART_B_FPL_CEILING;
  const medicareLabelPost67 = labelForMedicare(
    medicareAnnualCostPost67,
    mspEligiblePost67
  );
  const postFRAIncomeDiffers = postFRAGrossIncome !== grossIncome;
  // SS portions of each MAGI (derived from the totals already computed
  // upstream in App.jsx). ACA counts 100% of gross SS pre-65; IRMAA counts
  // only the taxable portion. Clamped to 0 to avoid negative display from
  // float noise when both grossIncome and the SS contribution are 0.
  const acaSsPortion = Math.max(0, magiACAPre65 - grossIncome);
  const irmaaSsPortion = Math.max(0, magiIRMAA65Plus - grossIncome);
  const irmaaPost67SsPortion = Math.max(
    0,
    magiIRMAAPost67 - postFRAGrossIncome
  );

  // FRA is hardcoded as 67 throughout the app — see ssRules.js.
  // Used for the "annual edge" stat = advantage averaged across post-FRA years.
  const FRA_YEARS = 67;
  const earlyWins = advantage >= 0;
  const annualEdge =
    lifeExpectancy > FRA_YEARS
      ? Math.abs(advantage) / (lifeExpectancy - FRA_YEARS)
      : 0;

  // "Early" vs "wait" framing only makes sense when the user actually
  // claims before FRA. At claim age == FRA the early and wait scenarios
  // collapse into the same thing → the dollar advantage is $0, and a
  // verdict like "Claiming early wins +$0" is misleading (there is no
  // early claim). Past FRA (retirement mode, ages 67–70 with DRC) the
  // user is delaying, not "claiming early" — rename the verdict
  // accordingly so the copy matches what the slider position says.
  // Tolerance is half a month since the claim-age slider's step is 1/12.
  const claimAtFRA = Math.abs(claimAge - FRA_YEARS) < 1 / 24 && mode !== "switch";
  const claimPastFRA = claimAge > FRA_YEARS + 1 / 24 && mode !== "switch";

  // Left-border + headline-number accent for the verdict card. Mirrors the
  // colored left borders on cards 1 (early) and 2 (wait): switch-mode pot is
  // upside (green), a crossover age uses the chart's gold marker color, an
  // outright verdict uses the winning side's color (early=red, wait=green),
  // and the at-FRA neutral case (no contest) uses the wait/baseline color.
  const verdictAccent =
    mode === "switch"
      ? C.wait
      : claimAtFRA
      ? C.wait
      : breakEvenAge
      ? C.cross
      : earlyWins
      ? C.early
      : C.wait;

  // Card 2 shows the user's actual check at 67 given their strategy:
  //   - Switch mode: they switch to the survivor benefit at FRA → fraMonthlyNet
  //   - Retirement / survivor at FRA or later: they get fraMonthlyNet too
  //   - Retirement / survivor claiming early: their check is permanently
  //     reduced (with a partial recoup if earnings-test withholding occurred)
  //     → earlyPostFRAMonthlyNet
  // Previously the card always showed fraMonthlyNet, which misled users in
  // survivor mode who saw the full benefit and assumed they'd get it at 67.
  const earlyClaimReduces = claimAge < FRA_YEARS && mode !== "switch";
  const card2Net = earlyClaimReduces ? earlyPostFRAMonthlyNet : fraMonthlyNet;
  const card2Gross = earlyClaimReduces
    ? earlyPostFRAMonthlyGross
    : fraMonthlyGross;
  // OBBBA senior bonus deduction display: pick the per-year savings and the
  // lifetime total that correspond to the scenario Card 2 is actually
  // showing. earlyClaimReduces → user kept the early claim through FRA;
  // their post-FRA check uses the earlyPostFRA tax math (and savings).
  // Otherwise → wait scenario or claim-at-FRA; the FRA check uses the wait
  // tax math.
  const card2OBBBAAnnualSavings = earlyClaimReduces
    ? seniorDeductionAnnualSavingsEarlyPost
    : seniorDeductionAnnualSavingsWait;
  const card2OBBBALifetime = earlyClaimReduces
    ? seniorDeductionLifetimeEarly
    : seniorDeductionLifetimeWait;
  const card2OBBBAYears = earlyClaimReduces
    ? seniorDeductionEligibleYearsEarly
    : seniorDeductionEligibleYearsWait;
  const card2OBBBADeductionAmt = earlyClaimReduces
    ? seniorDeductionPostFRA
    : seniorDeductionWait;
  // Card 1 (early claim age) — surfaces the OBBBA deduction during the
  // pre-FRA window. Two sub-cases:
  //   (a) claimAge ≥ 65: the at-claim-age tier itself qualifies, so the
  //       per-year savings is nonzero immediately. Show with "+$X/yr from
  //       …" framing.
  //   (b) claimAge < 65 but the pre-FRA window crosses 65 inside the
  //       2025-2028 OBBBA window: the at-claim-age tier doesn't qualify
  //       (age gate), but ages 65/66 within pre-FRA do. Surface with
  //       "starting at 65" framing so the savings don't visually
  //       disappear just because the user dialed claim age below 65.
  const card1OBBBAAnnualSavings = seniorDeductionAnnualSavingsEarlyPre;
  const card1OBBBADeductionAmt = seniorDeductionPreFRA;
  const card1OBBBAAnnualSavings65Plus = seniorDeductionAnnualSavingsEarlyPre65Plus;
  const card1OBBBADeductionAmt65Plus = seniorDeductionPreFRA65Plus;
  const card1OBBBAShowsDeferred =
    card1OBBBAAnnualSavings === 0 && card1OBBBAAnnualSavings65Plus > 0;
  // "Down from" only shows when the early-claim reduction actually leaves the
  // user materially below the full FRA benefit. ($1 floor avoids float noise
  // when the recoup brings them within rounding of the full amount.)
  const showsReductionNote =
    earlyClaimReduces && card2Net < fraMonthlyNet - 1;

  // The "if wait also invested" addendum at the bottom of Card 3. Only
  // renders when the user has the wait-invest slider above 0 (so the
  // comparison is meaningful) and the mode isn't switch (Card 3's switch
  // branch is a different shape and doesn't include a wait curve).
  const waitInvestedAddendum =
    investedPctWait > 0 && mode !== "switch" ? (
      <div
        className="mt-3 pt-3"
        style={{ borderTop: `1px solid ${C.border}` }}
      >
        <div
          className="text-xs uppercase mb-1"
          style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
        >
          If wait also invested {investedPctWait}%
        </div>
        {waitInvestedBreakEvenAge ? (
          <div className="text-xs" style={{ color: C.inkFaint }}>
            {waitInvestedAdvantage >= 0
              ? claimAge > FRA_YEARS + 1 / 24
                ? "delaying still leads"
                : "early still leads"
              : "wait+invest pulls ahead"}{" "}
            — crossover at{" "}
            <span className="num" style={{ color: C.ink, fontWeight: 500 }}>
              {fmtAge(waitInvestedBreakEvenAge)}
            </span>
          </div>
        ) : (
          <div className="text-xs" style={{ color: C.inkFaint }}>
            {waitInvestedAdvantage >= 0
              ? claimAge > FRA_YEARS + 1 / 24
                ? "delaying still leads by "
                : "early still leads by "
              : "wait+invest leads by "}
            <span className="num" style={{ color: C.ink, fontWeight: 500 }}>
              {fmtBig(Math.abs(waitInvestedAdvantage))}
            </span>{" "}
            at {fmtAge(lifeExpectancy)}
          </div>
        )}
      </div>
    ) : null;

  return (
    <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-1 gap-3 lg:sticky lg:top-4 lg:self-start">
      <div
        className="p-4"
        style={{
          backgroundColor: C.paper,
          border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${C.early}`,
        }}
      >
        <div
          className="text-xs uppercase mb-2"
          style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
        >
          Net check at {fmtAge(claimAge)}
        </div>
        <div
          className="num"
          style={{
            color: C.early,
            fontSize: "1.875rem",
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {fmtMoney(earlyMonthlyNet)}
        </div>
        <div className="text-xs num mt-2" style={{ color: C.inkFaint }}>
          {fmtMoney(earlyMonthlyNet * 12)}/yr net
          {earningsTestWithholding > 0 && (
            <>
              {" "}
              ·{" "}
              <span style={{ color: C.early }}>
                −{fmtMoney(earningsTestWithholding)}/yr withheld
              </span>
            </>
          )}
          <br />
          {fmtMoney(earlyMonthlyGross)} gross
          {earningsTestWithholding > 0 && (
            <> · −{fmtMoney(earningsTestWithholding / 12)}/mo earnings test</>
          )}
          {mode === "switch" && (
            <>
              <br />
              then {fmtMoney(fraMonthlyNet)} net from 67
            </>
          )}
          {mode !== "switch" && recoupedFactor !== null && (
            <>
              <br />
              then{" "}
              <span style={{ color: C.wait }}>
                {fmtMoney(earlyPostFRAMonthlyNet)} net from 67
              </span>{" "}
              (FRA recoup of withheld months)
            </>
          )}
          {card1OBBBAAnnualSavings > 0 && (
            <>
              <br />
              <span style={{ color: C.wait }}>
                +{fmtMoney(card1OBBBAAnnualSavings)}/yr
              </span>{" "}
              from ${Math.round(card1OBBBADeductionAmt).toLocaleString()} OBBBA
              senior bonus deduction
            </>
          )}
          {card1OBBBAShowsDeferred && (
            <>
              <br />
              <span style={{ color: C.wait }}>
                +{fmtMoney(card1OBBBAAnnualSavings65Plus)}/yr starting at 65
              </span>{" "}
              from ${Math.round(card1OBBBADeductionAmt65Plus).toLocaleString()}{" "}
              OBBBA senior bonus deduction
            </>
          )}
        </div>
      </div>

      <div
        className="p-4"
        style={{
          backgroundColor: C.paper,
          border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${C.wait}`,
        }}
      >
        <div
          className="text-xs uppercase mb-2"
          style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
        >
          Net check at 67
        </div>
        <div
          className="num"
          style={{
            color: C.wait,
            fontSize: "1.875rem",
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {fmtMoney(card2Net)}
        </div>
        <div className="text-xs num mt-2" style={{ color: C.inkFaint }}>
          {fmtMoney(card2Net * 12)}/yr net
          <br />
          {fmtMoney(card2Gross)} gross
          {showsReductionNote && (
            <>
              <br />
              down from {fmtMoney(fraMonthlyNet)}/mo full FRA benefit
            </>
          )}
          {card2OBBBAAnnualSavings > 0 && (
            <>
              <br />
              <span style={{ color: C.wait, fontWeight: 500 }}>
                +{fmtMoney(card2OBBBAAnnualSavings)}/yr
              </span>{" "}
              federal tax saved
              <br />
              via $
              {Math.round(card2OBBBADeductionAmt).toLocaleString()} OBBBA
              senior bonus deduction
              {card2OBBBAYears > 0 && card2OBBBALifetime > 0 && (
                <>
                  {" "}
                  ·{" "}
                  <span style={{ color: C.wait }}>
                    {fmtMoney(card2OBBBALifetime)} total
                  </span>{" "}
                  over {card2OBBBAYears}{" "}
                  {card2OBBBAYears === 1 ? "yr" : "yrs"} (2025–2028 sunset)
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div
        className="p-4 col-span-2 lg:col-span-1 flex flex-col"
        style={{
          backgroundColor: C.paper,
          color: C.ink,
          border: `1px solid ${C.border}`,
          borderLeft: `3px solid ${verdictAccent}`,
        }}
      >
        {mode === "switch" ? (
          <>
            <div
              className="text-xs uppercase mb-2"
              style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
            >
              Pot at {investStopAge} (pure upside)
            </div>
            <div
              className="num"
              style={{
                color: verdictAccent,
                fontSize: "1.875rem",
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              {fmtBig(potAtStopRow)}
            </div>
            <div className="text-xs mt-2" style={{ color: C.inkFaint }}>
              {returnRate > 0 ? (
                <>from investing through <Var>{investStopAge}</Var></>
              ) : (
                <>from setting aside checks through <Var>{investStopAge}</Var></>
              )}
            </div>
          </>
        ) : breakEvenAge ? (
          <>
            <div
              className="text-xs uppercase mb-2"
              style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
            >
              Crossover age
            </div>
            <div
              className="num"
              style={{
                color: verdictAccent,
                fontSize: "1.875rem",
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              {fmtAge(breakEvenAge)}
            </div>
            <div className="text-xs mt-2" style={{ color: C.inkFaint }}>
              where the lines meet
            </div>
            {crossoverValue !== null && (
              <div
                className="mt-3 pt-3"
                style={{ borderTop: `1px solid ${C.border}` }}
              >
                <div
                  className="text-xs uppercase mb-1"
                  style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
                >
                  Each strategy holds
                </div>
                <div
                  className="num"
                  style={{ color: C.ink, fontSize: "1.125rem", fontWeight: 500 }}
                >
                  {fmtBig(crossoverValue)}
                </div>
                <div
                  className="text-xs mt-1"
                  style={{ color: C.inkFaint }}
                >
                  at the crossover · then{" "}
                  {advantage >= 0
                    ? claimPastFRA
                      ? "delayed claim"
                      : "early"
                    : claimPastFRA
                    ? "FRA claim"
                    : "wait"}{" "}
                  pulls ahead
                </div>
                <div
                  className="text-xs mt-3"
                  style={{ color: C.inkFaint }}
                >
                  by <Var>{fmtAge(lifeExpectancy)}</Var>:{" "}
                  {advantage >= 0
                    ? claimPastFRA
                      ? "delayed claim"
                      : "early"
                    : claimPastFRA
                    ? "FRA claim"
                    : "wait"}{" "}
                  leads by{" "}
                  <span
                    className="num"
                    style={{ color: C.ink, fontWeight: 500 }}
                  >
                    {fmtBig(Math.abs(advantage))}
                  </span>
                </div>
              </div>
            )}
            {waitInvestedAddendum}
          </>
        ) : claimAtFRA ? (
          // Claim age == FRA: the early and wait scenarios are the same
          // strategy, so the "advantage" is mathematically $0 and there is
          // no verdict to render. Show a neutral "same as waiting" note.
          // Annual-edge block and wait-invested addendum are suppressed too
          // — both compare two identical curves and would just show $0.
          <>
            <div
              className="text-xs uppercase mb-2"
              style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
            >
              Claiming at FRA
            </div>
            <div
              className="num"
              style={{
                color: verdictAccent,
                fontSize: "1.875rem",
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              same as waiting
            </div>
            <div className="text-xs mt-2" style={{ color: C.inkFaint }}>
              no early scenario at FRA — claim and wait are the same path
            </div>
          </>
        ) : (
          // No crossover in range — one side wins for life. Replace the bare
          // "—" with a verdict + dollar advantage + annual-edge breakdown
          // so this card pulls its weight visually. Past FRA the user is
          // "delaying" not "claiming early"; flip the noun so the copy
          // matches the slider position.
          <>
            <div
              className="text-xs uppercase mb-2"
              style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
            >
              {earlyWins
                ? claimPastFRA
                  ? "Delaying wins"
                  : "Claiming early wins"
                : claimPastFRA
                ? "Claiming at FRA wins"
                : "Waiting wins"}{" "}
              through {fmtAge(lifeExpectancy)}
            </div>
            <div
              className="num"
              style={{
                color: verdictAccent,
                fontSize: "1.875rem",
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              {earlyWins ? "+" : "−"}
              {fmtBig(Math.abs(advantage))}
            </div>
            <div className="text-xs mt-2" style={{ color: C.inkFaint }}>
              ahead at end of life · no crossover in range
            </div>
            <div
              className="mt-4 pt-4"
              style={{ borderTop: `1px solid ${C.border}` }}
            >
              <div
                className="text-xs uppercase mb-1"
                style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
              >
                Annual edge
              </div>
              <div
                className="num"
                style={{ fontSize: "1.125rem", fontWeight: 500 }}
              >
                ≈ {fmtMoney(annualEdge)}/yr
              </div>
              <div className="text-xs mt-1" style={{ color: C.inkFaint }}>
                averaged across the {fmtDuration(lifeExpectancy - FRA_YEARS)}{" "}
                past FRA
              </div>
            </div>
            {waitInvestedAddendum}
          </>
        )}
      </div>

      {/* Healthcare card — pre-65 ACA / Medicaid / EP regime + 65+ Medicare
          / MSP regime, with current band labels. Mirrors the bands shown
          in the HealthcarePanel below the chart so the user sees the same
          framing in two places. Hidden when "covered elsewhere" is on. */}
      {!coveredElsewhere && (
        <div
          className="p-4 col-span-2 lg:col-span-1"
          style={{
            backgroundColor: C.paper,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${acaBandColor}`,
          }}
        >
          <div
            className="text-xs uppercase mb-2"
            style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
          >
            Healthcare cost
          </div>
          <div className="flex flex-col gap-2">
            <div>
              <div
                className="num"
                style={{
                  color: acaAnnualCost > 0 ? C.early : C.wait,
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                {acaAnnualCost > 0
                  ? `−${fmtMoney(acaAnnualCost)}/yr`
                  : "$0/yr"}
              </div>
              <div
                className="text-xs num"
                style={{ color: acaBandColor, fontWeight: 500 }}
              >
                {acaBandLabel}
              </div>
              <div className="text-xs num" style={{ color: C.inkFaint }}>
                pre-65 · {(acaFplPct * 100).toFixed(0)}% FPL
              </div>
              <div
                className="text-xs num mt-1"
                style={{ color: C.inkFaint, lineHeight: 1.5 }}
              >
                {fmtMoney(grossIncome)} wage
                {acaSsPortion > 0 && (
                  <>
                    {" + "}
                    {fmtMoney(acaSsPortion)} SS
                  </>
                )}
                <br />
                = {fmtMoney(magiACAPre65)} ÷ {fmtMoney(fpl)} FPL
              </div>
            </div>
            <div
              className="pt-2"
              style={{ borderTop: `1px solid ${C.border}` }}
            >
              <div
                className="num"
                style={{
                  color: medicareAnnualCost > 0 ? C.early : C.wait,
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                {medicareAnnualCost > 0
                  ? `−${fmtMoney(medicareAnnualCost)}/yr`
                  : "$0/yr"}
              </div>
              <div
                className="text-xs num"
                style={{
                  color: mspEligible ? C.wait : C.ink,
                  fontWeight: 500,
                }}
              >
                {medicareLabel}
              </div>
              <div className="text-xs num" style={{ color: C.inkFaint }}>
                {postFRAIncomeDiffers ? "65–67" : "65+"} ·{" "}
                {(irmaaFplPct * 100).toFixed(0)}% FPL
              </div>
              <div
                className="text-xs num mt-1"
                style={{ color: C.inkFaint, lineHeight: 1.5 }}
              >
                {fmtMoney(grossIncome)} wage
                {irmaaSsPortion > 0 && (
                  <>
                    {" + "}
                    {fmtMoney(irmaaSsPortion)} taxable SS
                  </>
                )}
                <br />
                = {fmtMoney(magiIRMAA65Plus)} ÷ {fmtMoney(fpl)} FPL
              </div>
            </div>
            {postFRAIncomeDiffers && (
              <div
                className="pt-2"
                style={{ borderTop: `1px solid ${C.border}` }}
              >
                <div
                  className="num"
                  style={{
                    color: medicareAnnualCostPost67 > 0 ? C.early : C.wait,
                    fontSize: "1.125rem",
                    fontWeight: 600,
                    lineHeight: 1,
                  }}
                >
                  {medicareAnnualCostPost67 > 0
                    ? `−${fmtMoney(medicareAnnualCostPost67)}/yr`
                    : "$0/yr"}
                </div>
                <div
                  className="text-xs num"
                  style={{
                    color: mspEligiblePost67 ? C.wait : C.ink,
                    fontWeight: 500,
                  }}
                >
                  {medicareLabelPost67}
                </div>
                <div className="text-xs num" style={{ color: C.inkFaint }}>
                  67+ · {(irmaaPost67FplPct * 100).toFixed(0)}% FPL
                </div>
                <div
                  className="text-xs num mt-1"
                  style={{ color: C.inkFaint, lineHeight: 1.5 }}
                >
                  {fmtMoney(postFRAGrossIncome)} wage
                  {irmaaPost67SsPortion > 0 && (
                    <>
                      {" + "}
                      {fmtMoney(irmaaPost67SsPortion)} taxable SS
                    </>
                  )}
                  <br />= {fmtMoney(magiIRMAAPost67)} ÷ {fmtMoney(fpl)} FPL
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
