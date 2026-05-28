import {
  MEDICAID_FPL_CEILING,
  ESSENTIAL_PLAN_FPL_CEILING,
  ACA_PTC_CLIFF_FPL,
  MSP_PART_B_FPL_CEILING,
  FPL_2025_FOR_2026_PTC,
  IRMAA_2026_SINGLE,
  getIRMAATier,
  fplPctOf,
} from "../lib/healthcareCost.js";
import { fmtMoney } from "../lib/benefitMath.js";
import { C } from "../constants/colors.js";

// Visualization scale: 0% to 500% FPL on the horizontal band. Beyond 400%
// the user is in the unsubsidized regime regardless of how far they go;
// the extra 100% headroom keeps the marker from pinning to the right edge
// when MAGI sits just above the cliff.
const FPL_VIZ_MAX_PCT = 500;

function bandForFplPct(fplPct) {
  if (fplPct <= MEDICAID_FPL_CEILING) {
    return {
      label: "Medicaid eligible",
      ribbon: C.wait,
      detail: "NY adult Medicaid · ≤138% FPL · $0 premium",
      premiumColor: C.wait,
    };
  }
  if (fplPct <= ESSENTIAL_PLAN_FPL_CEILING) {
    return {
      label: "NY Essential Plan",
      ribbon: C.wait,
      detail: "138–200% FPL · $0 premium",
      premiumColor: C.wait,
    };
  }
  if (fplPct <= ACA_PTC_CLIFF_FPL) {
    return {
      label: "Subsidized ACA",
      ribbon: C.ink,
      detail: "200–400% FPL · capped at 9.96% of MAGI",
      premiumColor: C.early,
    };
  }
  return {
    label: "Unsubsidized ACA",
    ribbon: C.early,
    detail: ">400% FPL · past the subsidy cliff",
    premiumColor: C.early,
  };
}

// Healthcare cost picture panel. Shows the full pre-65 → 65+ trajectory
// alongside the user's MAGI position on both the FPL ladder (which decides
// Medicaid / Essential Plan / subsidized-ACA / unsubsidized-ACA) and the
// IRMAA tier ladder (which decides Medicare surcharge level at 65+).
//
// Lives between the PotTable and the OptimalClaimAge sweep because the
// healthcare answer is what most directly influences the optimal-age
// recommendation for low-income claimants: claiming SS early can lift
// MAGI over the Medicaid / Essential Plan / 400% FPL cliffs, which the
// optimal-age sweep then weighs against the SS check delta.
export default function HealthcarePanel({
  claimAge,
  coveredElsewhere,
  householdSize,
  magiACAPre65,
  magiIRMAA65Plus,
  acaAnnualCost,
  medicareAnnualCost,
  healthcareNextCliff,
}) {
  if (coveredElsewhere) {
    return (
      <div
        className="mt-5 p-6 md:p-7"
        style={{
          backgroundColor: C.paper,
          border: `1px solid ${C.border}`,
        }}
      >
        <h3 className="display text-xl" style={{ color: C.ink }}>
          <em>Healthcare cost picture</em>
        </h3>
        <p
          className="text-xs mt-2 max-w-xl"
          style={{ color: C.inkSoft }}
        >
          Skipped — &ldquo;covered elsewhere&rdquo; is on. ACA / Medicare /
          OBBBA cliffs aren&rsquo;t modeled. Toggle it off in the Inputs
          panel to surface the cost picture and break-even shift.
        </p>
      </div>
    );
  }

  const fpl =
    householdSize === 2
      ? FPL_2025_FOR_2026_PTC.couple
      : FPL_2025_FOR_2026_PTC.single;
  const fplPct = fplPctOf({ magi: magiACAPre65, householdSize });
  const band = bandForFplPct(fplPct);

  const irmaaTier = getIRMAATier(magiIRMAA65Plus);
  const irmaaTierIdx = IRMAA_2026_SINGLE.indexOf(irmaaTier);
  // MSP eligibility uses the same household-size-aware FPL as Medicaid.
  // At ≤135% FPL, NY's QMB/SLMB/QI programs cover the Part B premium
  // entirely — Medicare drops to $0 for the low-income claimant.
  const irmaaFplPct = magiIRMAA65Plus / fpl;
  const mspEligible = irmaaFplPct <= MSP_PART_B_FPL_CEILING;
  const irmaaTierLabel = mspEligible
    ? "MSP covers Part B (≤135% FPL)"
    : irmaaTierIdx === 0
    ? "Standard (no surcharge)"
    : `IRMAA Tier ${irmaaTierIdx}`;

  // Marker position for the FPL band visualization. Clamp to the viz scale
  // so a user with $200K MAGI doesn't pin invisibly past the right edge.
  const userFplPctClamped = Math.min(fplPct * 100, FPL_VIZ_MAX_PCT);
  const userMarkerPct = (userFplPctClamped / FPL_VIZ_MAX_PCT) * 100;

  // Cliff marker positions along the same 0–500% viz scale.
  const cliffMarkers = [
    { fplPct: MEDICAID_FPL_CEILING * 100, label: "Medicaid (138%)" },
    {
      fplPct: ESSENTIAL_PLAN_FPL_CEILING * 100,
      label: "Essential Plan (200%)",
    },
    { fplPct: ACA_PTC_CLIFF_FPL * 100, label: "ACA cliff (400%)" },
  ];

  return (
    <div
      className="mt-5 p-6 md:p-7"
      style={{
        backgroundColor: C.paper,
        border: `1px solid ${C.border}`,
      }}
    >
      <div className="mb-5">
        <h3 className="display text-xl" style={{ color: C.ink }}>
          <em>Healthcare cost picture</em>
        </h3>
        <p
          className="text-xs mt-1 max-w-xl"
          style={{ color: C.inkSoft }}
        >
          Pre-65 ACA premium and 65+ Medicare cost the calculator is using
          for this scenario. The chart math subtracts the early-vs-wait
          delta from the early-claim monthly check, so this is where the
          break-even quietly shifts when MAGI crosses a cliff.
        </p>
      </div>

      {/* Two cost cards: pre-65 ACA and 65+ Medicare. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        {/* Pre-65 ACA card */}
        <div
          className="p-4"
          style={{
            backgroundColor: C.bg,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${band.ribbon}`,
          }}
        >
          <div
            className="text-xs uppercase mb-2"
            style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
          >
            Pre-65 · ACA / Medicaid / Essential Plan
          </div>
          <div
            className="num"
            style={{
              color: band.premiumColor,
              fontSize: "1.5rem",
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            {acaAnnualCost > 0
              ? `−${fmtMoney(acaAnnualCost)}/yr`
              : "$0 · no premium"}
          </div>
          <div className="text-xs num mt-2" style={{ color: C.ink, fontWeight: 500 }}>
            {band.label}
          </div>
          <div className="text-xs mt-1" style={{ color: C.inkFaint }}>
            {band.detail}
          </div>
          <div className="text-xs num mt-3" style={{ color: C.inkSoft }}>
            MAGI {fmtMoney(magiACAPre65)} · {(fplPct * 100).toFixed(0)}% FPL
            (FPL = {fmtMoney(fpl)})
          </div>
        </div>

        {/* 65+ Medicare card */}
        <div
          className="p-4"
          style={{
            backgroundColor: C.bg,
            border: `1px solid ${C.border}`,
            borderLeft: `3px solid ${
              mspEligible || irmaaTierIdx === 0 ? C.wait : C.early
            }`,
          }}
        >
          <div
            className="text-xs uppercase mb-2"
            style={{ color: C.inkSoft, letterSpacing: "0.15em" }}
          >
            65+ · Medicare (Part B + IRMAA)
          </div>
          <div
            className="num"
            style={{
              color: medicareAnnualCost > 0 ? C.early : C.wait,
              fontSize: "1.5rem",
              fontWeight: 600,
              lineHeight: 1,
            }}
          >
            {medicareAnnualCost > 0
              ? `−${fmtMoney(medicareAnnualCost)}/yr`
              : "$0 · no premium"}
          </div>
          <div className="text-xs num mt-2" style={{ color: C.ink, fontWeight: 500 }}>
            {irmaaTierLabel}
          </div>
          <div className="text-xs mt-1" style={{ color: C.inkFaint }}>
            {mspEligible
              ? "QMB / SLMB / QI pays Part B · no asset test in NY 2026+"
              : irmaaTier.annualExtra > 0
              ? `Part B base $2,435/yr · +${fmtMoney(irmaaTier.annualExtra)}/yr IRMAA surcharge`
              : "Part B base $2,435/yr · no surcharge"}
          </div>
          <div className="text-xs num mt-3" style={{ color: C.inkSoft }}>
            IRMAA MAGI {fmtMoney(magiIRMAA65Plus)} ·{" "}
            {(irmaaFplPct * 100).toFixed(0)}% FPL
          </div>
        </div>
      </div>

      {/* FPL band visualization — shows where the user sits along the
          pre-65 Medicaid / EP / subsidized / unsubsidized ladder, with
          cliff markers at 138%, 200%, and 400% FPL. This is the chart that
          answers "would claiming SS later keep me on Medicaid?" — drag
          the claim-age slider and watch the marker move left as SS drops
          out of the MAGI calc. */}
      <div className="mb-5">
        <div
          className="text-xs uppercase mb-2"
          style={{ color: C.inkFaint, letterSpacing: "0.12em" }}
        >
          Pre-65 MAGI on the FPL ladder
        </div>
        <div className="relative h-12">
          {/* Background bands — color the four FPL regimes. */}
          <div
            className="absolute"
            style={{
              top: "50%",
              left: 0,
              width: `${(MEDICAID_FPL_CEILING * 100 / FPL_VIZ_MAX_PCT) * 100}%`,
              height: "6px",
              backgroundColor: C.wait,
              opacity: 0.25,
              transform: "translateY(-50%)",
            }}
            title="Medicaid eligible (≤138% FPL)"
          />
          <div
            className="absolute"
            style={{
              top: "50%",
              left: `${(MEDICAID_FPL_CEILING * 100 / FPL_VIZ_MAX_PCT) * 100}%`,
              width: `${
                ((ESSENTIAL_PLAN_FPL_CEILING - MEDICAID_FPL_CEILING) * 100 /
                  FPL_VIZ_MAX_PCT) *
                100
              }%`,
              height: "6px",
              backgroundColor: C.wait,
              opacity: 0.5,
              transform: "translateY(-50%)",
            }}
            title="NY Essential Plan (138-200% FPL)"
          />
          <div
            className="absolute"
            style={{
              top: "50%",
              left: `${(ESSENTIAL_PLAN_FPL_CEILING * 100 / FPL_VIZ_MAX_PCT) * 100}%`,
              width: `${
                ((ACA_PTC_CLIFF_FPL - ESSENTIAL_PLAN_FPL_CEILING) * 100 /
                  FPL_VIZ_MAX_PCT) *
                100
              }%`,
              height: "6px",
              backgroundColor: C.borderDark,
              transform: "translateY(-50%)",
            }}
            title="Subsidized ACA (200-400% FPL)"
          />
          <div
            className="absolute"
            style={{
              top: "50%",
              left: `${(ACA_PTC_CLIFF_FPL * 100 / FPL_VIZ_MAX_PCT) * 100}%`,
              right: 0,
              height: "6px",
              backgroundColor: C.early,
              opacity: 0.5,
              transform: "translateY(-50%)",
            }}
            title="Unsubsidized ACA (>400% FPL)"
          />

          {/* Cliff tick marks. */}
          {cliffMarkers.map((cliff) => {
            const left = (cliff.fplPct / FPL_VIZ_MAX_PCT) * 100;
            return (
              <div
                key={cliff.label}
                className="absolute"
                style={{
                  left: `${left}%`,
                  top: "calc(50% - 8px)",
                  width: "1px",
                  height: "16px",
                  backgroundColor: C.borderDark,
                  transform: "translateX(-50%)",
                }}
                title={cliff.label}
              />
            );
          })}

          {/* User MAGI marker. */}
          <div
            className="absolute"
            style={{
              left: `${userMarkerPct}%`,
              top: "calc(50% - 12px)",
              width: "2px",
              height: "24px",
              backgroundColor: band.ribbon,
              transform: "translateX(-50%)",
            }}
            title={`Your MAGI: ${fmtMoney(magiACAPre65)} (${(fplPct * 100).toFixed(0)}% FPL)`}
          />
          {/* Floating label above the marker. Anchor flips at the edges so
              the percent never clips off-panel or collides with the axis
              labels below. */}
          <div
            className="absolute num text-xs"
            style={{
              left: `${userMarkerPct}%`,
              top: 0,
              transform:
                userMarkerPct < 8
                  ? "translateX(0)"
                  : userMarkerPct > 92
                  ? "translateX(-100%)"
                  : "translateX(-50%)",
              paddingLeft: userMarkerPct < 8 ? "6px" : 0,
              paddingRight: userMarkerPct > 92 ? "6px" : 0,
              color: band.ribbon,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {(fplPct * 100).toFixed(0)}% FPL
          </div>
        </div>
        <div
          className="flex justify-between mt-1 text-xs num"
          style={{ color: C.inkFaint }}
        >
          <span>0%</span>
          <span>138%</span>
          <span>200%</span>
          <span>400%</span>
          <span>500%+</span>
        </div>
      </div>

      {/* Next-cliff line (mirrors the MetadataStrip row but in the panel's
          own framing — these are the actionable thresholds for the current
          claim-age regime). Two shapes: premium-impact cliffs show "+$X/yr
          if crossed"; the Medicaid→EP transition shows "$0 premium impact
          but coverage changes" instead. */}
      {healthcareNextCliff !== null && (
        <div
          className="pt-4 text-xs"
          style={{ borderTop: `1px solid ${C.border}`, color: C.inkSoft }}
        >
          <span className="num">
            <span style={{ color: C.inkFaint, letterSpacing: "0.12em" }}>
              NEXT CLIFF ·{" "}
            </span>
            <span style={{ color: C.ink, fontWeight: 500 }}>
              {fmtMoney(healthcareNextCliff.distance)}
            </span>{" "}
            <span style={{ color: C.inkFaint }}>of MAGI headroom before</span>{" "}
            {healthcareNextCliff.annualCostDelta > 0 ? (
              <>
                <span style={{ color: C.early, fontWeight: 500 }}>
                  +{fmtMoney(healthcareNextCliff.annualCostDelta)}/yr
                </span>{" "}
                <span style={{ color: C.inkFaint }}>
                  ({healthcareNextCliff.label})
                </span>
              </>
            ) : (
              <>
                <span style={{ color: C.ink, fontWeight: 500 }}>
                  coverage change
                </span>{" "}
                <span style={{ color: C.inkFaint }}>
                  · same $0 premium ({healthcareNextCliff.label})
                </span>
              </>
            )}
          </span>
        </div>
      )}

      {/* OBBBA caveat — Medicaid and Essential Plan eligibility carry
          non-premium compliance requirements starting Jan 2027. The
          calculator models cost only; this is a flag, not math. */}
      {claimAge < 65 &&
        fplPct <= ESSENTIAL_PLAN_FPL_CEILING &&
        (
          <div
            className="pt-4 text-xs"
            style={{
              borderTop: healthcareNextCliff !== null
                ? "none"
                : `1px solid ${C.border}`,
              color: C.inkFaint,
              marginTop: healthcareNextCliff !== null ? "8px" : 0,
            }}
          >
            Heads up: NY Medicaid requires 80 hrs/mo of work, study, or
            volunteering starting Jan 1, 2027 (OBBBA), with 6-month
            redeterminations. Essential Plan has no work requirement.
          </div>
        )}
    </div>
  );
}
