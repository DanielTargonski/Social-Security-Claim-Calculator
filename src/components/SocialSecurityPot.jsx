import { useMemo } from "react";
import { fmtMoney, fmtBig, fmtAge } from "../lib/benefitMath.js";
import { FRA } from "../lib/ssRules.js";
import { computeSSPot } from "../lib/ssPot.js";
import { C } from "../constants/colors.js";
import SliderInput from "./SliderInput.jsx";
import Var from "./Var.jsx";

// One choice's holdings at the comparison age as a stacked bar: the Social
// Security bond plus (early side only) the invested pot, scaled against the
// larger of the two choices.
function PotBar({ label, ssPot, extraPot, scale, ssColor, extraColor, sub }) {
  const pct = (v) => `${scale > 0 ? (v / scale) * 100 : 0}%`;
  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1 gap-3">
        <span style={{ color: C.ink, fontWeight: 600 }}>{label}</span>
        <span className="num" style={{ color: C.ink, fontWeight: 600 }}>
          {fmtBig(ssPot + extraPot)}
        </span>
      </div>
      <div
        className="flex"
        style={{
          height: "14px",
          borderRadius: "var(--radius-pill)",
          overflow: "hidden",
          backgroundColor: C.track,
        }}
      >
        <div style={{ width: pct(ssPot), backgroundColor: ssColor }} />
        <div style={{ width: pct(extraPot), backgroundColor: extraColor }} />
      </div>
      <div className="text-xs num mt-1" style={{ color: C.inkSoft }}>
        {sub}
      </div>
    </div>
  );
}

function Stat({ label, value, color, sub }) {
  return (
    <div className="card-flat p-4">
      <div
        className="text-xs uppercase mb-1"
        style={{ color: C.inkFaint, letterSpacing: "0.1em", fontWeight: 600 }}
      >
        {label}
      </div>
      <div
        className="num"
        style={{ color, fontSize: "1.5rem", fontWeight: 500 }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-1" style={{ color: C.inkSoft }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// "Your Social Security as a pot": sizes the inflation-protected bond each
// claiming choice amounts to (annual check / real yield; the principal never
// runs down) and sets the early side's bond next to its invested pot at 67.
// Display-only: nothing here feeds back into the main projection.
export default function SocialSecurityPot({
  claimAge,
  returnRate,
  bondYield,
  onBondYieldChange,
  earlyPreFRAMonthly,
  earlyPostFRAMonthly,
  waitMonthly,
  investedPotAtFRA,
}) {
  const res = useMemo(
    () =>
      computeSSPot({
        claimAge,
        bondYield,
        earlyPreFRAMonthly,
        earlyPostFRAMonthly,
        waitMonthly,
      }),
    [claimAge, bondYield, earlyPreFRAMonthly, earlyPostFRAMonthly, waitMonthly]
  );

  const { early, wait } = res;
  const claimsEarly = claimAge < FRA;
  const sameChoice = res.forgoneChecks === 0 && res.potGap === 0;
  // The invested pot only exists on the early side, before FRA.
  const investedPot = claimsEarly ? investedPotAtFRA : 0;
  const potWord = returnRate > 0 ? "invested pot" : "set-aside checks";
  const earlyLabel = `Claim at ${fmtAge(claimAge)}`;
  const waitLabel = `Claim at ${fmtAge(FRA)}`;
  const earlyTotal = early.pot + investedPot;
  const scale = Math.max(earlyTotal, wait.pot);
  // Whoever claims later gives up the other's checks in between; how much
  // bigger a pot that buys (none, in switch mode, where both end on the
  // same survivor check).
  const laterGain = claimsEarly ? -res.potGap : res.potGap;
  const waitPhrase = claimsEarly
    ? `waiting until ${fmtAge(FRA)}`
    : `delaying to ${fmtAge(claimAge)}`;
  const earlierPhrase = claimsEarly
    ? `claiming at ${fmtAge(claimAge)}`
    : `claiming at ${fmtAge(FRA)}`;
  const gapEndAge = fmtAge(res.compareAge);

  return (
    <div className="card mt-5 p-6 md:p-7">
      <h3 className="display text-xl mb-2" style={{ color: C.ink }}>
        <em>Your Social Security as a pot</em>
      </h3>
      <p className="text-xs mb-5 max-w-2xl" style={{ color: C.inkSoft }}>
        Social Security works like an inflation-protected bond you hold but
        never see: it pays you an income, the government raises that income
        with inflation every year, and the principal never runs down. At a{" "}
        <Var>{bondYield.toFixed(1)}%</Var> real yield, this is how big a bond
        it would take to pay each check.
      </p>

      <div className="max-w-sm mb-6">
        <SliderInput
          label="Real bond yield"
          value={bondYield}
          onChange={onBondYieldChange}
          min={0.5}
          max={6}
          step={0.1}
          format={(v) => `${v.toFixed(1)}%/yr`}
          hint="Long-term TIPS (inflation-protected Treasuries) have paid about 2% real recently. A lower yield means a bigger pot."
        />
      </div>

      <div className="flex flex-col gap-4 mb-6 max-w-2xl">
        <div
          className="text-xs uppercase"
          style={{ color: C.inkFaint, letterSpacing: "0.1em", fontWeight: 600 }}
        >
          What you hold at {fmtAge(res.compareAge)}
        </div>
        <PotBar
          label={earlyLabel}
          ssPot={early.pot}
          extraPot={investedPot}
          scale={scale}
          ssColor={C.early}
          extraColor={C.earlySoft}
          sub={`${fmtBig(early.pot)} Social Security pot paying ${fmtMoney(
            early.monthly
          )}/mo${investedPot > 0 ? ` + ${fmtBig(investedPot)} ${potWord}` : ""}`}
        />
        {!sameChoice && (
          <PotBar
            label={waitLabel}
            ssPot={wait.pot}
            extraPot={0}
            scale={scale}
            ssColor={C.wait}
            extraColor={C.wait}
            sub={`${fmtBig(wait.pot)} Social Security pot paying ${fmtMoney(
              wait.monthly
            )}/mo`}
          />
        )}
        <p className="text-sm" style={{ color: C.ink }}>
          {sameChoice ? (
            <>
              Claiming at {fmtAge(FRA)} is the wait choice: one{" "}
              {fmtBig(wait.pot)} pot.
            </>
          ) : laterGain > 0.5 ? (
            <>
              {waitPhrase[0].toUpperCase() + waitPhrase.slice(1)} buys a{" "}
              <strong style={{ color: claimsEarly ? C.wait : C.early }}>
                {fmtBig(laterGain)} bigger
              </strong>{" "}
              Social Security pot. The price is the{" "}
              {fmtBig(res.forgoneChecks)} in checks {earlierPhrase} collects
              before {gapEndAge}.
            </>
          ) : (
            <>
              Both choices hold the same {fmtBig(wait.pot)} pot from{" "}
              {gapEndAge}, so {earlierPhrase} collects the{" "}
              {fmtBig(res.forgoneChecks)} in checks before {gapEndAge} at no
              cost to the pot.
            </>
          )}
          {investedPot > 0 && (
            <>
              {" "}
              Counting the {fmtBig(investedPot)} {potWord}, claiming at{" "}
              {fmtAge(claimAge)} leaves you{" "}
              <strong
                style={{ color: earlyTotal >= wait.pot ? C.early : C.wait }}
              >
                {fmtBig(Math.abs(earlyTotal - wait.pot))}{" "}
                {earlyTotal >= wait.pot ? "ahead" : "behind"}
              </strong>{" "}
              at {fmtAge(FRA)}.
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label={`Pot at ${fmtAge(claimAge)}`}
          value={fmtBig(early.firstPot)}
          color={C.early}
          sub={`pays ${fmtMoney(early.firstMonthly)}/mo`}
        />
        {claimsEarly && early.monthly !== early.firstMonthly && (
          <Stat
            label={`Same claim at ${fmtAge(FRA)}`}
            value={fmtBig(early.pot)}
            color={C.early}
            sub={`pays ${fmtMoney(early.monthly)}/mo`}
          />
        )}
        <Stat
          label={`Wait pot at ${fmtAge(FRA)}`}
          value={fmtBig(wait.pot)}
          color={C.wait}
          sub={`pays ${fmtMoney(wait.monthly)}/mo`}
        />
        {!sameChoice && (
          <Stat
            label="Checks given up"
            value={fmtBig(res.forgoneChecks)}
            color={C.inkSoft}
            sub={`by ${waitPhrase}`}
          />
        )}
      </div>

      <p className="text-xs mt-4 max-w-2xl" style={{ color: C.inkFaint }}>
        Checks before tax, after any earnings-test withholding (averaged over
        the year), and the post-{FRA} check after any FRA recoup. Unlike a
        real bond, this pot can't be sold or left to heirs: the checks stop at
        death, so it measures the income, not money you can withdraw. The
        lifetime totals in the chart above are unchanged.
      </p>
    </div>
  );
}
