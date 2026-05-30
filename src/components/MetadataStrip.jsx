import { FRA, fmtMoney, fmtAge } from "../lib/benefitMath.js";
import { C } from "../constants/colors.js";
import Term from "./Term.jsx";
import { GLOSSARY } from "../constants/glossary.js";

// Compact strip below the summary cards. Surfaces what's actually driving
// the numbers: earnings test withholding, FRA recoup value through life
// expectancy, combined income, taxable SS portion, effective fed tax,
// healthcare costs / cliffs, and the standing NY/NYC reminder. Renders
// nothing when there's nothing substantive to show.
//
// Layout: each conceptual group (Social Security / Taxation / Healthcare)
// stacks vertically under a hairline-divided section header reused from
// GlobalStyles' .section-divider class. Inside a group, metrics live in
// a responsive grid of stacked label-over-value cells. Ancillary
// qualifiers ("until age 65", "from 67 · ~$X net through 85") drop into
// a small hint line under the value instead of trailing inline at 10px,
// which is what made the old single-row version hard to scan.

const LABEL_STYLE = {
  fontFamily: "'JetBrains Mono', monospace",
  fontFeatureSettings: '"tnum"',
  textTransform: "uppercase",
  letterSpacing: "0.15em",
  fontSize: "10px",
  color: C.inkFaint,
};

function Cell({ label, value, hint, valueColor = C.ink }) {
  return (
    <div>
      <div style={{ ...LABEL_STYLE, marginBottom: 4 }}>{label}</div>
      <div
        className="num"
        style={{
          color: valueColor,
          fontWeight: 500,
          fontSize: "14px",
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      {hint && (
        <div
          className="num"
          style={{
            color: C.inkFaint,
            fontSize: "10px",
            marginTop: 3,
            lineHeight: 1.3,
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

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
  // Healthcare rows (OBBBA / NYC). Two annual costs — ACA for pre-65 years,
  // Medicare for 65+ years — surface side-by-side whenever healthcare is
  // modeled, so the user sees both regimes regardless of claim age. The
  // next-cliff object is the actionable one for the current claim-age
  // regime (ACA cliff if claimAge < 65, IRMAA cliff if 65+).
  coveredElsewhere = false,
  acaAnnualCost = 0,
  medicareAnnualCost = 0,
  medicareAnnualCostPost67 = null,
  healthcareNextCliff = null,
  claimAge,
}) {
  const showHealthcareRows =
    !coveredElsewhere &&
    (acaAnnualCost > 0 ||
      medicareAnnualCost > 0 ||
      healthcareNextCliff !== null);
  const shouldRender =
    earningsTestWithholding > 0 ||
    ssEffectiveTaxRate > 0 ||
    autoTax ||
    showHealthcareRows;
  if (!shouldRender) return null;

  const monthlyAfterTest = (annualEarlyGross - earningsTestWithholding) / 12;
  const showSSGroup = earningsTestWithholding > 0;
  // Taxation group always renders alongside the strip — the NY+NYC reminder
  // is a standing row even when no auto-tax / effective-rate data is live.
  const hasMedicareSplit =
    medicareAnnualCostPost67 !== null &&
    medicareAnnualCostPost67 !== medicareAnnualCost;
  const medicareLabel = (
    <>
      Medicare (B + <Term {...GLOSSARY.IRMAA}>IRMAA</Term>),{" "}
      {hasMedicareSplit ? "65–67" : "65+"}
    </>
  );

  const gridStyle = { gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" };

  return (
    <div className="card mb-5 p-5 md:p-6" style={{ color: C.inkSoft }}>
      <h3 className="display text-xl mb-4" style={{ color: C.ink }}>
        <em>By the numbers</em>
      </h3>

      <div className="flex flex-col gap-5">
        {showSSGroup && (
          <div>
            <div className="section-divider">Social Security</div>
            <div className="grid gap-x-8 gap-y-4" style={gridStyle}>
              <Cell
                label="Monthly SS (after test)"
                value={fmtMoney(monthlyAfterTest)}
              />
              <Cell
                label="Annual SS (after test)"
                value={fmtMoney(annualEarlyGross - earningsTestWithholding)}
              />
              {recoupedFactor !== null && (
                <>
                  <Cell
                    label="Monthly SS (after FRA)"
                    value={fmtMoney(earlyPostFRAMonthlyGross)}
                    valueColor={C.wait}
                  />
                  <Cell
                    label="Annual SS (after FRA)"
                    value={fmtMoney(earlyPostFRAMonthlyGross * 12)}
                    valueColor={C.wait}
                  />
                </>
              )}
              <Cell
                label="Earnings test (annual)"
                value={`−${fmtMoney(earningsTestWithholding)}`}
                valueColor={C.early}
              />
              {recoupedFactor !== null && (
                <Cell
                  label="FRA recoup"
                  value={`+${fmtMoney(
                    earlyPostFRAMonthlyGross - earlyMonthlyGross
                  )}/mo`}
                  valueColor={C.wait}
                  hint={`from ${FRA} · ~${fmtMoney(
                    (earlyPostFRAMonthlyGross - earlyMonthlyGross) *
                      12 *
                      Math.max(0, lifeExpectancy - FRA) *
                      (1 - ssEffectiveTaxRate)
                  )} net through age ${fmtAge(lifeExpectancy)}`}
                />
              )}
            </div>
          </div>
        )}

        <div>
          <div className="section-divider">Taxation</div>
          <div className="grid gap-x-8 gap-y-4" style={gridStyle}>
            {autoTax && (
              <>
                <Cell
                  label="Combined income"
                  value={fmtMoney(combinedIncome)}
                />
                <Cell
                  label="Taxable SS portion"
                  value={`${(taxableSSPct * 100).toFixed(0)}%`}
                />
              </>
            )}
            {ssEffectiveTaxRate > 0 && (
              <Cell
                label="Effective fed tax on SS"
                value={`${(ssEffectiveTaxRate * 100).toFixed(1)}%`}
              />
            )}
            <Cell
              label="NY + NYC on SS"
              value="$0 · exempt"
              valueColor={C.wait}
            />
          </div>
        </div>

        {showHealthcareRows && (
          <div>
            <div className="section-divider">Healthcare</div>
            <div className="grid gap-x-8 gap-y-4" style={gridStyle}>
              <Cell
                label="ACA premium (pre-65)"
                value={
                  acaAnnualCost > 0
                    ? `−${fmtMoney(acaAnnualCost)}/yr`
                    : "$0 · subsidized"
                }
                valueColor={acaAnnualCost > 0 ? C.early : C.wait}
                hint={claimAge < 65 ? "until age 65" : undefined}
              />
              <Cell
                label={medicareLabel}
                value={
                  medicareAnnualCost > 0
                    ? `−${fmtMoney(medicareAnnualCost)}/yr`
                    : "$0 · MSP covers"
                }
                valueColor={medicareAnnualCost > 0 ? C.early : C.wait}
              />
              {hasMedicareSplit && (
                <Cell
                  label={
                    <>
                      Medicare (B + <Term {...GLOSSARY.IRMAA}>IRMAA</Term>), 67+
                    </>
                  }
                  value={
                    medicareAnnualCostPost67 > 0
                      ? `−${fmtMoney(medicareAnnualCostPost67)}/yr`
                      : "$0 · MSP covers"
                  }
                  valueColor={
                    medicareAnnualCostPost67 > 0 ? C.early : C.wait
                  }
                />
              )}
              {healthcareNextCliff !== null && (
                <Cell
                  label="Next cliff"
                  value={
                    healthcareNextCliff.annualCostDelta > 0
                      ? `${fmtMoney(
                          healthcareNextCliff.distance
                        )} away · +${fmtMoney(
                          healthcareNextCliff.annualCostDelta
                        )}/yr if crossed`
                      : `${fmtMoney(
                          healthcareNextCliff.distance
                        )} away · coverage change`
                  }
                  valueColor={
                    healthcareNextCliff.annualCostDelta > 0 ? C.early : C.ink
                  }
                  hint={`(${healthcareNextCliff.label})`}
                />
              )}
            </div>
          </div>
        )}

        {coveredElsewhere && (
          <div>
            <div className="section-divider">Healthcare</div>
            <div className="grid gap-x-8 gap-y-4" style={gridStyle}>
              <Cell
                label="Coverage"
                value="covered elsewhere"
                valueColor={C.wait}
                hint="OBBBA cliffs not modeled"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
