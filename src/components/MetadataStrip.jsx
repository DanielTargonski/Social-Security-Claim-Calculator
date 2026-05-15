import { FRA, fmtMoney, fmtAge } from "../lib/benefitMath.js";
import { C } from "../constants/colors.js";

// Compact horizontal strip below the summary cards. Surfaces what's actually
// driving the numbers: earnings test withholding, FRA recoup value through
// life expectancy, combined income, taxable SS portion, effective fed tax,
// and the standing NY/NYC reminder. Renders nothing when there's nothing
// substantive to show.
export default function MetadataStrip({
  autoTax,
  annualEarlyGross,
  earningsTestWithholding,
  earlyMonthlyGross,
  earlyPostFRAMonthlyGross,
  recoupedFactor,
  combinedIncome,
  taxableSSPct,
  ssEffectiveTaxRate,
  lifeExpectancy,
  // Healthcare-cost row inputs (OBBBA / NYC). Both optional so old callers
  // without healthcare wired keep working — tests cover this defaulting.
  coveredElsewhere = false,
  healthcareAnnualCost = 0,
  healthcareNextCliff = null,
  claimAge,
}) {
  const showHealthcareRow =
    !coveredElsewhere &&
    (healthcareAnnualCost > 0 || healthcareNextCliff !== null);
  const shouldRender =
    earningsTestWithholding > 0 ||
    ssEffectiveTaxRate > 0 ||
    autoTax ||
    showHealthcareRow;
  if (!shouldRender) return null;

  const monthlyAfterTest = (annualEarlyGross - earningsTestWithholding) / 12;

  return (
    <div
      className="mb-5 p-4"
      style={{
        backgroundColor: C.paper,
        border: `1px solid ${C.border}`,
        color: C.inkSoft,
      }}
    >
      <h3
        className="display text-xl mb-3"
        style={{ color: C.ink }}
      >
        <em>By the numbers</em>
      </h3>
      <div className="text-xs flex flex-wrap gap-x-6 gap-y-2">
      {earningsTestWithholding > 0 && (
        <>
          <div>
            <span
              className="num uppercase"
              style={{
                color: C.inkFaint,
                letterSpacing: "0.15em",
                fontSize: "10px",
              }}
            >
              Monthly SS (after test)
            </span>{" "}
            <span className="num" style={{ color: C.ink, fontWeight: 500 }}>
              {fmtMoney(monthlyAfterTest)}
            </span>
          </div>
          <div>
            <span
              className="num uppercase"
              style={{
                color: C.inkFaint,
                letterSpacing: "0.15em",
                fontSize: "10px",
              }}
            >
              Annual SS (after test)
            </span>{" "}
            <span className="num" style={{ color: C.ink, fontWeight: 500 }}>
              {fmtMoney(annualEarlyGross - earningsTestWithholding)}
            </span>
          </div>
          {recoupedFactor !== null && (
            <>
              <div>
                <span
                  className="num uppercase"
                  style={{
                    color: C.inkFaint,
                    letterSpacing: "0.15em",
                    fontSize: "10px",
                  }}
                >
                  Monthly SS (after FRA)
                </span>{" "}
                <span className="num" style={{ color: C.wait, fontWeight: 500 }}>
                  {fmtMoney(earlyPostFRAMonthlyGross)}
                </span>
              </div>
              <div>
                <span
                  className="num uppercase"
                  style={{
                    color: C.inkFaint,
                    letterSpacing: "0.15em",
                    fontSize: "10px",
                  }}
                >
                  Annual SS (after FRA)
                </span>{" "}
                <span className="num" style={{ color: C.wait, fontWeight: 500 }}>
                  {fmtMoney(earlyPostFRAMonthlyGross * 12)}
                </span>
              </div>
            </>
          )}
          <div>
            <span
              className="num uppercase"
              style={{
                color: C.inkFaint,
                letterSpacing: "0.15em",
                fontSize: "10px",
              }}
            >
              Earnings test (annual)
            </span>{" "}
            <span className="num" style={{ color: C.early, fontWeight: 500 }}>
              −{fmtMoney(earningsTestWithholding)}
            </span>
          </div>
          {recoupedFactor !== null && (
            <div>
              <span
                className="num uppercase"
                style={{
                  color: C.inkFaint,
                  letterSpacing: "0.15em",
                  fontSize: "10px",
                }}
              >
                FRA recoup → +
              </span>{" "}
              <span className="num" style={{ color: C.wait, fontWeight: 500 }}>
                {fmtMoney(earlyPostFRAMonthlyGross - earlyMonthlyGross)}/mo
              </span>{" "}
              <span
                className="num"
                style={{ color: C.inkFaint, fontSize: "10px" }}
              >
                from 67 ·
              </span>{" "}
              <span className="num" style={{ color: C.wait, fontWeight: 500 }}>
                ~
                {fmtMoney(
                  (earlyPostFRAMonthlyGross - earlyMonthlyGross) *
                    12 *
                    Math.max(0, lifeExpectancy - FRA) *
                    (1 - ssEffectiveTaxRate)
                )}
              </span>{" "}
              <span
                className="num"
                style={{ color: C.inkFaint, fontSize: "10px" }}
              >
                net through age {fmtAge(lifeExpectancy)}
              </span>
            </div>
          )}
        </>
      )}
      {autoTax && (
        <>
          <div>
            <span
              className="num uppercase"
              style={{
                color: C.inkFaint,
                letterSpacing: "0.15em",
                fontSize: "10px",
              }}
            >
              Combined income
            </span>{" "}
            <span className="num" style={{ color: C.ink, fontWeight: 500 }}>
              {fmtMoney(combinedIncome)}
            </span>
          </div>
          <div>
            <span
              className="num uppercase"
              style={{
                color: C.inkFaint,
                letterSpacing: "0.15em",
                fontSize: "10px",
              }}
            >
              Taxable SS portion
            </span>{" "}
            <span className="num" style={{ color: C.ink, fontWeight: 500 }}>
              {(taxableSSPct * 100).toFixed(0)}%
            </span>
          </div>
        </>
      )}
      {ssEffectiveTaxRate > 0 && (
        <div>
          <span
            className="num uppercase"
            style={{
              color: C.inkFaint,
              letterSpacing: "0.15em",
              fontSize: "10px",
            }}
          >
            Effective fed tax on SS
          </span>{" "}
          <span className="num" style={{ color: C.ink, fontWeight: 500 }}>
            {(ssEffectiveTaxRate * 100).toFixed(1)}%
          </span>
        </div>
      )}
      {showHealthcareRow && (
        <>
          <div>
            <span
              className="num uppercase"
              style={{
                color: C.inkFaint,
                letterSpacing: "0.15em",
                fontSize: "10px",
              }}
            >
              {claimAge < 65 ? "ACA premium" : "Medicare (B + IRMAA)"}
            </span>{" "}
            <span
              className="num"
              style={{
                color: healthcareAnnualCost > 0 ? C.early : C.wait,
                fontWeight: 500,
              }}
            >
              {healthcareAnnualCost > 0
                ? `−${fmtMoney(healthcareAnnualCost)}/yr`
                : "$0 · subsidized"}
            </span>{" "}
            <span
              className="num"
              style={{ color: C.inkFaint, fontSize: "10px" }}
            >
              at age {fmtAge(claimAge)}
            </span>
          </div>
          {healthcareNextCliff !== null && (
            <div>
              <span
                className="num uppercase"
                style={{
                  color: C.inkFaint,
                  letterSpacing: "0.15em",
                  fontSize: "10px",
                }}
              >
                Next cliff
              </span>{" "}
              <span className="num" style={{ color: C.ink, fontWeight: 500 }}>
                {fmtMoney(healthcareNextCliff.distance)}
              </span>{" "}
              <span
                className="num"
                style={{ color: C.inkFaint, fontSize: "10px" }}
              >
                away ·
              </span>{" "}
              <span className="num" style={{ color: C.early, fontWeight: 500 }}>
                +{fmtMoney(healthcareNextCliff.annualCostDelta)}/yr
              </span>{" "}
              <span
                className="num"
                style={{ color: C.inkFaint, fontSize: "10px" }}
              >
                if crossed ({healthcareNextCliff.label})
              </span>
            </div>
          )}
        </>
      )}
      {coveredElsewhere && (
        <div>
          <span
            className="num uppercase"
            style={{
              color: C.inkFaint,
              letterSpacing: "0.15em",
              fontSize: "10px",
            }}
          >
            Healthcare
          </span>{" "}
          <span className="num" style={{ color: C.wait, fontWeight: 500 }}>
            covered elsewhere
          </span>{" "}
          <span
            className="num"
            style={{ color: C.inkFaint, fontSize: "10px" }}
          >
            · OBBBA cliffs not modeled
          </span>
        </div>
      )}
      <div>
        <span
          className="num uppercase"
          style={{
            color: C.inkFaint,
            letterSpacing: "0.15em",
            fontSize: "10px",
          }}
        >
          NY + NYC on SS
        </span>{" "}
        <span className="num" style={{ color: C.wait, fontWeight: 500 }}>
          $0 · exempt
        </span>
      </div>
      </div>
    </div>
  );
}
