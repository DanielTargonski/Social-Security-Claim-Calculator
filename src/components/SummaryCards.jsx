import { fmtMoney, fmtBig } from "../lib/benefitMath.js";
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
  earlyPostFRAMonthlyNet,
  fraMonthlyGross,
  fraMonthlyNet,
  earningsTestWithholding,
  recoupedFactor,
  potAtStopRow,
  breakEvenAge,
}) {
  return (
    <div className="lg:col-span-2 grid grid-cols-2 lg:grid-cols-1 gap-5">
      <div
        className="p-5"
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
          Net check at {claimAge}
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
        className="p-5"
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
          {fmtMoney(fraMonthlyNet)}
        </div>
        <div className="text-xs num mt-2" style={{ color: C.inkFaint }}>
          {fmtMoney(fraMonthlyNet * 12)}/yr net
          <br />
          {fmtMoney(fraMonthlyGross)} gross
        </div>
      </div>

      <div
        className="p-5 col-span-2 lg:col-span-1"
        style={{
          backgroundColor: C.ink,
          color: C.paper,
        }}
      >
        <div
          className="text-xs uppercase mb-2"
          style={{ color: C.inkOnDark, letterSpacing: "0.15em" }}
        >
          {mode === "switch"
            ? `Pot at ${investStopAge} (pure upside)`
            : "Crossover age"}
        </div>
        <div
          className="num"
          style={{ fontSize: "1.875rem", fontWeight: 600, lineHeight: 1 }}
        >
          {mode === "switch"
            ? fmtBig(potAtStopRow)
            : breakEvenAge
            ? `${breakEvenAge}`
            : "—"}
        </div>
        <div className="text-xs mt-2" style={{ color: C.inkOnDark }}>
          {mode === "switch" ? (
            returnRate > 0 ? (
              <>from investing through <Var>{investStopAge}</Var></>
            ) : (
              <>from setting aside checks through <Var>{investStopAge}</Var></>
            )
          ) : breakEvenAge ? (
            "where the lines meet"
          ) : (
            "no crossover in range"
          )}
        </div>
      </div>
    </div>
  );
}
