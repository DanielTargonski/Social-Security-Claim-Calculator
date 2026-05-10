import { fmtMoney, fmtBig, fmtAge, fmtDuration } from "../lib/benefitMath.js";
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
}) {
  // FRA is hardcoded as 67 throughout the app — see ssRules.js.
  // Used for the "annual edge" stat = advantage averaged across post-FRA years.
  const FRA_YEARS = 67;
  const earlyWins = advantage >= 0;
  const annualEdge =
    lifeExpectancy > FRA_YEARS
      ? Math.abs(advantage) / (lifeExpectancy - FRA_YEARS)
      : 0;

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
  // "Down from" only shows when the early-claim reduction actually leaves the
  // user materially below the full FRA benefit. ($1 floor avoids float noise
  // when the recoup brings them within rounding of the full amount.)
  const showsReductionNote =
    earlyClaimReduces && card2Net < fraMonthlyNet - 1;
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
        </div>
      </div>

      <div
        className="p-4 col-span-2 lg:col-span-1 flex flex-col"
        style={{
          backgroundColor: C.ink,
          color: C.paper,
        }}
      >
        {mode === "switch" ? (
          <>
            <div
              className="text-xs uppercase mb-2"
              style={{ color: C.inkOnDark, letterSpacing: "0.15em" }}
            >
              Pot at {investStopAge} (pure upside)
            </div>
            <div
              className="num"
              style={{ fontSize: "1.875rem", fontWeight: 600, lineHeight: 1 }}
            >
              {fmtBig(potAtStopRow)}
            </div>
            <div className="text-xs mt-2" style={{ color: C.inkOnDark }}>
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
              style={{ color: C.inkOnDark, letterSpacing: "0.15em" }}
            >
              Crossover age
            </div>
            <div
              className="num"
              style={{ fontSize: "1.875rem", fontWeight: 600, lineHeight: 1 }}
            >
              {breakEvenAge}
            </div>
            <div className="text-xs mt-2" style={{ color: C.inkOnDark }}>
              where the lines meet
            </div>
            {crossoverValue !== null && (
              <div
                className="mt-3 pt-3"
                style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div
                  className="text-xs uppercase mb-1"
                  style={{ color: C.inkOnDark, letterSpacing: "0.15em" }}
                >
                  Each strategy holds
                </div>
                <div
                  className="num"
                  style={{ fontSize: "1.125rem", fontWeight: 500 }}
                >
                  {fmtBig(crossoverValue)}
                </div>
                <div
                  className="text-xs mt-1"
                  style={{ color: C.inkOnDark }}
                >
                  at the crossover · then{" "}
                  {advantage >= 0 ? "early" : "wait"} pulls ahead
                </div>
                <div
                  className="text-xs mt-3"
                  style={{ color: C.inkOnDark }}
                >
                  by <Var>{fmtAge(lifeExpectancy)}</Var>:{" "}
                  {advantage >= 0 ? "early" : "wait"} leads by{" "}
                  <span
                    className="num"
                    style={{ color: C.paper, fontWeight: 500 }}
                  >
                    {fmtBig(Math.abs(advantage))}
                  </span>
                </div>
              </div>
            )}
          </>
        ) : (
          // No crossover in range — early wins for life. Replace the bare
          // "—" with a verdict + dollar advantage + annual-edge breakdown
          // so this card pulls its weight visually.
          <>
            <div
              className="text-xs uppercase mb-2"
              style={{ color: C.inkOnDark, letterSpacing: "0.15em" }}
            >
              {earlyWins ? "Claiming early wins" : "Waiting wins"} through{" "}
              {fmtAge(lifeExpectancy)}
            </div>
            <div
              className="num"
              style={{
                fontSize: "1.875rem",
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              {earlyWins ? "+" : "−"}
              {fmtBig(Math.abs(advantage))}
            </div>
            <div className="text-xs mt-2" style={{ color: C.inkOnDark }}>
              ahead at end of life · no crossover in range
            </div>
            <div
              className="mt-4 pt-4"
              style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div
                className="text-xs uppercase mb-1"
                style={{ color: C.inkOnDark, letterSpacing: "0.15em" }}
              >
                Annual edge
              </div>
              <div
                className="num"
                style={{ fontSize: "1.125rem", fontWeight: 500 }}
              >
                ≈ {fmtMoney(annualEdge)}/yr
              </div>
              <div className="text-xs mt-1" style={{ color: C.inkOnDark }}>
                averaged across the {fmtDuration(lifeExpectancy - FRA_YEARS)}{" "}
                past FRA
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
