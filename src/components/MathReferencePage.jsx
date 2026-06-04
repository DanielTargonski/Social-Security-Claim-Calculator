import { C } from "../constants/colors.js";

// "The math" page — a comprehensive reference for every formula the
// calculator uses, with an official source cited next to each one. Lives
// behind the third tab in the top-of-page TabNav, alongside the calculator
// itself and the "Why this exists" explainer.
//
// Numbers and rules here are tied 1:1 to the constants in src/lib/. If a
// formula here doesn't match the implementation in src/lib/, one of them
// has drifted and needs to be reconciled. Reviewable update points:
//   - SSA reduction/credit factors:    src/lib/ssRules.js
//   - Earnings test + FRA recoup:      src/lib/ssRules.js
//   - 2026 tax brackets + SS tiers:    src/lib/taxMath.js
//   - OBBBA senior bonus deduction:    src/lib/taxMath.js
//   - ACA cliffs + IRMAA tiers:        src/lib/healthcareCost.js
//   - 3-phase invested-pot model:      src/lib/chartProjection.js
//
// Sourcing convention: every section ends with one or more inline citations
// linked to the canonical document (a CFR page, a POMS section, an IRS
// publication, or a CMS / HHS fact sheet). Where the calculator deliberately
// simplifies the real rule — flat 9.96% ACA contribution rate, age-based
// approximation of the year-of-FRA earnings-test window — the simplification
// is called out next to the formula, not buried in a footnote.
export default function MathReferencePage() {
  return (
    <div className="max-w-3xl">
      <PageHeader />
      <SsaFactorsSection />
      <EarningsTestSection />
      <FraRecoupSection />
      <FederalTaxOnSsSection />
      <FederalBracketsSection />
      <SeniorDeductionSection />
      <HealthcareSection />
      <ChartModelSection />
      <SimplificationsSection />
      <SourcesSection />
    </div>
  );
}

// Shared visual primitives ------------------------------------------------

function PageHeader() {
  return (
    <div className="mb-10">
      <span
        className="inline-flex items-center gap-2 mb-5"
        style={{
          padding: "5px 12px 5px 10px",
          borderRadius: "var(--radius-pill)",
          background: C.accentSoft,
          color: C.accent,
          fontSize: "11.5px",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        <span
          style={{ width: 6, height: 6, borderRadius: 999, background: C.accent }}
        />
        The math · every formula, sourced
      </span>
      <h1
        className="display"
        style={{
          color: C.ink,
          fontSize: "clamp(2.1rem, 6vw, 3.4rem)",
          fontWeight: 800,
          lineHeight: 1.03,
          letterSpacing: "-0.035em",
        }}
      >
        How everything is{" "}
        <span style={{ color: C.accent }}>actually calculated.</span>
      </h1>
      <p
        className="mt-5 text-base leading-relaxed"
        style={{ color: C.inkSoft }}
      >
        Every number on the calculator traces back to a formula in this
        document, and every formula here traces back to an official source —
        an SSA regulation, an IRS publication, a CMS fact sheet, or an HHS
        guideline. Where the calculator deliberately simplifies a real rule
        (e.g. the exact birth-month timing of the year-of-FRA earnings test,
        the graduated ACA contribution scale), the simplification is called out next to the
        formula so users can decide whether the gap matters for their
        scenario. All dollar figures are 2026 single-filer unless noted.
      </p>
    </div>
  );
}

// `Formula` renders a monospace, left-bar block — the visual style already
// used by the "Why this exists" page's worked-example boxes. Keeps the
// math visually distinct from prose.
function Formula({ children }) {
  return (
    <div
      className="card-flat p-5 mb-4 num text-sm"
      style={{
        borderLeft: `3px solid ${C.accent}`,
        color: C.ink,
        lineHeight: 1.7,
        whiteSpace: "pre-wrap",
      }}
    >
      {children}
    </div>
  );
}

// `Cite` renders the small "Source: <link>" line that sits below each
// formula or section. Multiple sources can be passed in.
function Cite({ children }) {
  return (
    <div
      className="text-xs mt-2 mb-4"
      style={{ color: C.inkSoft, lineHeight: 1.6 }}
    >
      <span
        className="num uppercase"
        style={{ letterSpacing: "0.15em", color: C.inkFaint, marginRight: 6 }}
      >
        Source
      </span>
      {children}
    </div>
  );
}

function Ref({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: C.wait,
        borderBottom: `1px solid ${C.wait}`,
        paddingBottom: "1px",
      }}
    >
      {children}
    </a>
  );
}

// Two-column "tier table" with monospace numerals. Used for the federal
// bracket and IRMAA tables. `rows` is [[leftCell, rightCell], ...].
function TierTable({ headers, rows }) {
  return (
    <div
      className="card-flat num text-sm mb-4 overflow-hidden"
      style={{
        borderLeft: `3px solid ${C.accent}`,
        color: C.ink,
      }}
    >
      <div
        className="grid grid-cols-2 px-5 py-2.5 text-xs uppercase"
        style={{
          color: C.inkFaint,
          letterSpacing: "0.1em",
          fontWeight: 600,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div>{headers[0]}</div>
        <div className="text-right">{headers[1]}</div>
      </div>
      {rows.map(([left, right], i) => (
        <div
          key={i}
          className="grid grid-cols-2 px-5 py-2"
          style={{
            borderBottom:
              i === rows.length - 1 ? "none" : `1px solid ${C.border}`,
          }}
        >
          <div>{left}</div>
          <div className="text-right">{right}</div>
        </div>
      ))}
    </div>
  );
}

// Sections ----------------------------------------------------------------

function SsaFactorsSection() {
  return (
    <section className="mb-12">
      <div className="section-divider mb-5">
        Reduction & credit factors
      </div>

      <h3
        className="display mb-3"
        style={{ color: C.ink, fontSize: "1.15rem", fontWeight: 500 }}
      >
        Own retirement benefit
      </h3>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        Two-tier reduction for claiming before full retirement age (FRA = 67
        for anyone born 1960 or later). Delayed retirement credits (DRC)
        accrue for each month past FRA up to age 70.
      </p>
      <Formula>
{`reduction = 5/9 of 1% per month  (first 36 months early)
          + 5/12 of 1% per month (any earlier months)

credit    = 8% per year past FRA (capped at age 70 = +24%)`}
      </Formula>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        Examples: claiming at 62 (60 months early) gives a factor of{" "}
        <span className="num">0.70</span>; claiming at 70 gives{" "}
        <span className="num">1.24</span>.
      </p>
      <Cite>
        <Ref href="https://www.ssa.gov/OACT/quickcalc/early_late.html">
          SSA Office of the Chief Actuary — Early or Late Retirement
        </Ref>
      </Cite>

      <h3
        className="display mt-6 mb-3"
        style={{ color: C.ink, fontSize: "1.15rem", fontWeight: 500 }}
      >
        Survivor (widow / widower) benefit
      </h3>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        Linear 28.5% maximum reduction over the 84 months between age 60 (the
        earliest survivor eligibility) and age 67. No delayed retirement
        credits apply — survivor benefits cap at 100% of the deceased's
        primary insurance amount.
      </p>
      <Formula>
{`reduction = unreduced benefit × months_early × 0.285 / 84`}
      </Formula>
      <Cite>
        <Ref href="https://www.ssa.gov/OP_Home/cfr20/404/404-0410.htm">
          20 CFR § 404.410
        </Ref>{" "}
        — Early-entitlement reduction formula (the same expression the SSA
        publishes in its own regulation).
      </Cite>

      <h3
        className="display mt-6 mb-3"
        style={{ color: C.ink, fontSize: "1.15rem", fontWeight: 500 }}
      >
        Switch strategy (own → survivor at FRA)
      </h3>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        A surviving spouse can file a restricted application to claim only
        their own retirement benefit early, then switch to 100% of the
        survivor benefit at FRA. The own-retirement reduction is permanent
        on that record but becomes irrelevant once the switch happens. The
        calculator models the early period using the own-retirement factor
        applied to the user-supplied own benefit, then the full unreduced
        survivor benefit from FRA onward.
      </p>
      <Cite>
        <Ref href="https://www.ssa.gov/benefits/survivors/ifyou.html">
          SSA — Survivors Benefits: How Much You Could Receive
        </Ref>
      </Cite>
    </section>
  );
}

function EarningsTestSection() {
  return (
    <section className="mb-12">
      <div className="section-divider mb-5">Earnings test (2026)</div>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        A claimant under FRA who collects Social Security while working can
        have benefits withheld when wage income exceeds the annual exempt
        amount. The rule loosens in the calendar year they reach FRA, then
        stops applying entirely the month they reach FRA.
      </p>
      <Formula>
{`if claimAge < 66 and grossIncome > $24,480:
    withholding = min((grossIncome − $24,480) / 2, annualBenefit)

if final pre-FRA year (66 ≤ claimAge < 67) and grossIncome > $65,160:
    withholding = min((grossIncome − $65,160) / 3, annualBenefit)

if claimAge ≥ 67:
    withholding = 0`}
      </Formula>
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: C.inkSoft }}
      >
        <strong style={{ color: C.ink }}>Timing note:</strong> SSA applies the
        $65,160 / $1-per-$3 rule by calendar year and counts only earnings
        before the FRA month. The calculator has ages, not birth month and
        current month, so it models that final pre-FRA window as after the 66th
        birthday and before the 67th birthday. FRA itself still starts at 67.
      </p>
      <Cite>
        <Ref href="https://www.ssa.gov/benefits/retirement/planner/whileworking.html">
          SSA — Receiving Benefits While Working
        </Ref>
      </Cite>
    </section>
  );
}

function FraRecoupSection() {
  return (
    <section className="mb-12">
      <div className="section-divider mb-5">
        FRA recoup of withheld months
      </div>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        When the earnings test withholds N months of benefit pre-FRA, the
        SSA recomputes the benefit at FRA as if the claimant had claimed
        N/12 years later. This shrinks the early-claiming reduction and the
        new (higher) rate is paid from FRA onward for life. SSA calls this
        the "Adjustment of the Reduction Factor" (ARF).
      </p>
      <Formula>
{`creditedMonthsPerYear = ⌈ annualWithholding / monthlyCheck ⌉   (capped at 12)
monthsWithheld        = creditedMonthsPerYear × yearsPreFRA
effectiveClaimAge     = claimAge + monthsWithheld / 12
recoupedFactor        = mode-appropriate factor at effectiveClaimAge`}
      </Formula>
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: C.inkSoft }}
      >
        <strong style={{ color: C.ink }}>Why ceil():</strong> SSA grants a
        whole reduction-month of credit for any month with a full OR
        partial earnings-test deduction — "proration of work deductions
        has no effect on the adjustment of the reduction factor." Because
        SSA withholds whole monthly checks at the start of each year until
        the projected annual withholding amount is reached, the number of
        credited months per pre-FRA year equals the number of checks the
        withholding touches (i.e. ⌈ annual / monthly ⌉). A simple
        dollar-average would drop the partial month and under-credit the
        recoup, understating the post-FRA benefit whenever withholding
        isn't an exact multiple of a monthly check.
      </p>
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: C.inkSoft }}
      >
        Applies to <em>retirement</em> and <em>survivor</em> modes only. In
        <em> switch</em> mode the claimant abandons own retirement at FRA,
        so any ARF on the own record becomes moot.
      </p>
      <Cite>
        <Ref href="https://secure.ssa.gov/poms.nsf/lnx/0300615482">
          POMS RS 00615.482
        </Ref>{" "}
        — "Adjustment of the Reduction Factor (ARF) for RIB, DIB, Spouse,
        and Widow(er)'s Benefits."
      </Cite>
    </section>
  );
}

function FederalTaxOnSsSection() {
  return (
    <section className="mb-12">
      <div className="section-divider mb-5">
        Federal tax on Social Security
      </div>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        The taxable fraction of a year's SS benefit depends on{" "}
        <em>combined income</em>, defined as AGI plus tax-exempt interest
        plus one-half of gross SS. Three tiers apply to single filers
        (joint filers are not modeled — single-filer focus throughout):
      </p>
      <Formula>
{`combinedIncome = grossIncome + 0.5 × annualBenefit

if combinedIncome ≤ $25,000:    0% of benefit taxable
if combinedIncome ≤ $34,000:    up to 50% taxable (scaled)
if combinedIncome >  $34,000:   up to 85% taxable`}
      </Formula>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        The middle tier scales from 0% at $25K up to 50% at $34K; the upper
        tier adds 85% of every dollar past $34K to the first $4,500
        (half of $9,000) already taxable in the middle band, capped at 85%
        of the gross benefit. Manual-override mode short-circuits the tier
        formula and assumes 85% taxable always.
      </p>
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: C.inkSoft }}
      >
        Effective SS tax rate ={" "}
        <span className="num">taxablePct × marginalRate</span>. The
        $25,000 and $34,000 thresholds are{" "}
        <strong style={{ color: C.ink }}>not</strong> inflation-indexed —
        they've been frozen by statute since the rules were enacted (1983
        / 1993) — so in real terms they shrink every year. The calculator
        treats them as flat, which mildly understates long-run tax drag.
      </p>
      <Cite>
        <Ref href="https://www.irs.gov/pub/irs-pdf/p915.pdf">
          IRS Publication 915 — Social Security and Equivalent Railroad
          Retirement Benefits
        </Ref>
      </Cite>
    </section>
  );
}

function FederalBracketsSection() {
  return (
    <section className="mb-12">
      <div className="section-divider mb-5">
        2026 federal brackets &amp; deduction (single filer)
      </div>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        Used to look up the marginal rate that multiplies the taxable SS
        percentage. The calculator walks every bracket (not just the
        top-of-stack rate) when computing dollar savings from a deduction,
        so the OBBBA senior-deduction value is accurate even when the
        deduction straddles a bracket boundary.
      </p>
      <TierTable
        headers={["Taxable income up to", "Marginal rate"]}
        rows={[
          ["$12,400", "10%"],
          ["$50,400", "12%"],
          ["$105,700", "22%"],
          ["$201,775", "24%"],
          ["$256,225", "32%"],
          ["$640,600", "35%"],
          ["over $640,600", "37%"],
        ]}
      />
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: C.ink }}
      >
        Standard deduction (single, 2026):{" "}
        <span className="num">$16,100</span>. Subtracted from gross taxable
        income before bracket lookup.
      </p>
      <Cite>
        <Ref href="https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill/">
          IRS 2026 inflation adjustments
        </Ref>{" "}
        — 2026 inflation-adjusted bracket thresholds and standard
        deduction amounts (Rev. Proc. 2025-32).
      </Cite>
    </section>
  );
}

function SeniorDeductionSection() {
  return (
    <section className="mb-12">
      <div className="section-divider mb-5">
        OBBBA senior bonus deduction (2025–2028)
      </div>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        The One Big Beautiful Bill Act (signed July 2025) created a
        temporary additional deduction for taxpayers age 65+ on top of the
        standard deduction, regardless of whether they itemize. Sunsets
        Dec 31, 2028 unless Congress extends.
      </p>
      <Formula>
{`base (single filer)       = $6,000
phase-out start (single)  = $75,000 MAGI
phase-out end (single)    = $175,000 MAGI

if age < 65 or year ∉ [2025..2028]:     deduction = $0
if MAGI ≤ $75,000:                       deduction = $6,000
if MAGI ≥ $175,000:                      deduction = $0
otherwise:                               deduction = $6,000 − 6% × (MAGI − $75K)`}
      </Formula>
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: C.inkSoft }}
      >
        Joint filers ($12K base, $150K / $250K phase-out) are not modeled —
        single-filer focus throughout. The dollar savings reported on the
        summary cards equal{" "}
        <span className="num">federalTax(income − deduction)</span> minus{" "}
        <span className="num">federalTax(income)</span>, walked through the
        full bracket schedule above, so cross-bracket cases stay exact.
      </p>
      <Cite>
        <Ref href="https://www.congress.gov/bill/119th-congress/house-bill/1/text">
          H.R. 1 (119th Congress) — "One Big Beautiful Bill Act"
        </Ref>
        , § 70103 (Additional Deduction for Seniors).
      </Cite>
    </section>
  );
}

function HealthcareSection() {
  return (
    <section className="mb-12">
      <div className="section-divider mb-5">
        Healthcare cost layer (NYC, 2026+)
      </div>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        Post-OBBBA, the IRA-era enhanced ACA premium tax credits expired
        Dec 31, 2025 — the 400% FPL "subsidy cliff" is back. New York's
        Essential Plan ceiling drops from 250% to 200% FPL effective
        July 1, 2026 because OBBBA defunded the lawfully-present-immigrant
        PTC that financed half of NY's 1332-waiver Essential Plan. The
        calculator models the cost differential between early-claim and
        wait scenarios and subtracts it from the early-claim monthly
        nets so cliff crossings shift the break-even age directly.
      </p>

      <h3
        className="display mt-5 mb-3"
        style={{ color: C.ink, fontSize: "1.15rem", fontWeight: 500 }}
      >
        Two MAGI definitions
      </h3>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        ACA and IRMAA define MAGI differently. ACA counts 100% of gross SS;
        IRMAA counts only the taxable portion. Both reuse the federal-tax
        taxableSSPct so the layers stay self-consistent.
      </p>
      <Formula>
{`MAGI_ACA   = grossIncome + grossSS_annual
MAGI_IRMAA = grossIncome + taxableSSPct × grossSS_annual`}
      </Formula>
      <Cite>
        <Ref href="https://www.healthcare.gov/income-and-household-information/how-to-report/">
          HealthCare.gov — Reporting income for the Marketplace
        </Ref>
        ; IRMAA MAGI definition per 42 U.S.C. § 1395r(i).
      </Cite>

      <h3
        className="display mt-6 mb-3"
        style={{ color: C.ink, fontSize: "1.15rem", fontWeight: 500 }}
      >
        Pre-65 ACA bands (single filer)
      </h3>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        FPL anchor: 2026 PTC determinations use the{" "}
        <strong style={{ color: C.ink }}>2025 federal poverty
        guidelines</strong> (HHS ASPE), per ACA's prior-year convention.
        Single = <span className="num">$15,650</span>; couple ={" "}
        <span className="num">$21,150</span>.
      </p>
      <TierTable
        headers={["MAGI relative to FPL", "Annual premium (single)"]}
        rows={[
          ["≤ 138% — NY Medicaid", "$0"],
          ["≤ 200% — NY Essential Plan", "$0"],
          [
            "200%–400% — subsidized silver",
            "min(unsubsidized, 9.96% × MAGI)",
          ],
          [
            "> 400% — unsubsidized (cliff)",
            "$9,679 NYC silver default",
          ],
        ]}
      />
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: C.inkSoft }}
      >
        <strong style={{ color: C.ink }}>Simplification:</strong> the real
        ACA contribution scale runs from ~2.1% at 100% FPL to 9.96% at
        300–400% FPL per the 2026 indexed applicable-percentage table. The
        calculator collapses the band into a single top-of-scale 9.96% cap.
        The 200% Essential Plan floor and the 400% cliff are the
        load-bearing thresholds either way. NYC LCSP rate ($9,679/yr =
        $806.61/mo) is age-neutral under NY's pure community rating —
        user-overridable from the Healthcare panel.
      </p>
      <Cite>
        <Ref href="https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines">
          HHS ASPE — Poverty Guidelines
        </Ref>
        ;{" "}
        <Ref href="https://www.irs.gov/pub/irs-drop/rp-25-25.pdf">
          IRS Rev. Proc. 2025-25
        </Ref>{" "}
        (2026 ACA applicable percentage table);{" "}
        <Ref href="https://nystateofhealth.ny.gov/">
          NY State of Health
        </Ref>{" "}
        (LCSP rates, Essential Plan rules).
      </Cite>

      <h3
        className="display mt-6 mb-3"
        style={{ color: C.ink, fontSize: "1.15rem", fontWeight: 500 }}
      >
        65+ Medicare Part B + IRMAA (2026 single)
      </h3>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        Standard Part B premium is{" "}
        <span className="num">$202.90/mo</span> ={" "}
        <span className="num">$2,434.80/yr</span>. IRMAA surcharges stack
        on top per six MAGI brackets. $1 over a threshold triggers the
        full surcharge for both Part B and Part D.
      </p>
      <TierTable
        headers={["MAGI up to", "Extra annual cost (B + D)"]}
        rows={[
          ["$109,000", "$0"],
          ["$137,000", "$1,148"],
          ["$171,000", "$2,885"],
          ["$205,000", "$4,620"],
          ["$500,000", "$6,355"],
          ["over $500,000", "$6,936"],
        ]}
      />
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: C.inkSoft }}
      >
        NY Medicare Savings Programs (QMB / SLMB / QI combined ≤ 135% FPL)
        zero out the Part B premium entirely. NY eliminated the MSP asset
        test effective Jan 1, 2023, so eligibility is MAGI-only. At MSP
        income levels IRMAA can't trigger either (the lowest IRMAA tier
        starts at $109K ≈ 700% FPL).
      </p>
      <Cite>
        <Ref href="https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-and-deductibles">
          CMS — 2026 Medicare Parts A &amp; B Premiums and Deductibles
        </Ref>
        ;{" "}
        <Ref href="https://secure.ssa.gov/poms.nsf/lnx/0601101020">
          SSA POMS HI 01101.020
        </Ref>{" "}
        (IRMAA bracket structure).
      </Cite>
    </section>
  );
}

function ChartModelSection() {
  return (
    <section className="mb-12">
      <div className="section-divider mb-5">
        3-phase invested-pot model
      </div>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        Heart of the calculator. Splits the early-claim trajectory into
        three phases based on when the user stops investing the SS checks
        (the "invest stop age" slider).
      </p>
      <Formula>
{`Phase 1: claimAge → min(FRA, investStopAge)
         contribute earlyMonthlyNet  (post-earnings-test, post-tax)

Phase 2: FRA → investStopAge   (only when investStopAge > FRA)
         contribute earlyPostFRAMonthlyNet  (post-recoup, post-tax,
                                              no earnings test)

Phase 3: investStopAge → lifeExpectancy
         pot compounds untouched; checks now collected as cash.
         Cash rate splits at FRA when investStopAge < FRA:
           pre-FRA  → earlyMonthlyNet  (still ET-reduced)
           post-FRA → earlyPostFRAMonthlyNet  (recouped rate)`}
      </Formula>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        Contributions compound at a constant monthly rate{" "}
        <span className="num">r = returnRate / 12 / 100</span>. The
        future-value formula for a series of monthly contributions:
      </p>
      <Formula>
{`FV(monthly, months, r) = monthly × ((1 + r)^months − 1) / r       (r > 0)
                       = monthly × months                          (r = 0)`}
      </Formula>
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: C.inkSoft }}
      >
        Every dollar in the calculator is in <strong>real</strong> (today's)
        dollars; the return rate is the post-inflation real return. A
        5% real return corresponds to roughly the post-inflation long-run
        average of a 60/40 portfolio. Working in real terms lets a $2,500
        check at 67 be directly comparable to a $2,500 check at 85 —
        inflation is already factored out.
      </p>
      <p
        className="text-sm leading-relaxed mb-3"
        style={{ color: C.inkSoft }}
      >
        <strong style={{ color: C.ink }}>Lumpy ET withholding:</strong> the
        chart simulates month-by-month, applying SSA's actual lumpy
        withholding pattern (entire $0 months at the start of each pre-FRA
        year until the annual withholding amount is reached, then full
        checks resume). An averaged model would slightly overstate
        compounding because contributions would land earlier than they
        actually do.
      </p>
      <Cite>
        Internal model — see{" "}
        <Ref href="https://github.com/DanielTargonski/Social-Security-Claim-Calculator/blob/main/src/lib/chartProjection.js">
          src/lib/chartProjection.js
        </Ref>{" "}
        on GitHub for the implementation.
      </Cite>
    </section>
  );
}

function SimplificationsSection() {
  return (
    <section className="mb-12">
      <div className="section-divider mb-5">Deliberately out of scope</div>
      <p className="text-sm leading-relaxed mb-3" style={{ color: C.ink }}>
        These rules exist in the real world but are intentionally not
        modeled. They were considered and judged either negligible at the
        calculator's resolution or scope-incompatible (different question,
        different calculator).
      </p>
      <ul
        className="text-sm leading-relaxed space-y-2 ml-5 mb-3"
        style={{ color: C.ink, listStyle: "disc" }}
      >
        <li>
          <strong>Exact birth-month earnings-test timing</strong> — the
          calculator applies the real 2026 year-of-FRA limit and $1-per-$3
          ratio, but approximates that calendar window as the final pre-FRA
          year before age 67 because it does not ask for birth month or current
          month.
        </li>
        <li>
          <strong>WEP / GPO / family maximum / RIB-LIM</strong> — not
          relevant when the deceased never claimed (the original use
          case). RIB-LIM matters when the deceased was already collecting
          reduced benefits.
        </li>
        <li>
          <strong>State taxes other than NY/NYC</strong> — ~10 states still
          tax SS in 2026 (CO, CT, MN, MT, NM, RI, UT, VT, WV); NY/NYC do
          not.
        </li>
        <li>
          <strong>Sequence-of-returns risk</strong> on the invested side —
          single deterministic real return is used; no Monte Carlo.
        </li>
        <li>
          <strong>COLA / inflation</strong> — calculator is in real (today's)
          dollars throughout.
        </li>
        <li>
          <strong>Spousal benefits while spouse is alive, divorced-spouse
          benefits, child / child-in-care benefits</strong> — different
          question.
        </li>
        <li>
          <strong>IRMAA 2-year MAGI lookback</strong> — current-year MAGI
          used directly. Over a 20-year break-even horizon the timing
          offset is noise.
        </li>
        <li>
          <strong>ACA PTC graduated contribution scale</strong> (~2.1% at
          100% FPL to 9.96% at 300–400% FPL) — collapsed to the top-of-band
          9.96% cap across the subsidized region.
        </li>
        <li>
          <strong>Medicaid asset tests (65+), MSP for non-NY states, and
          long-term-care eligibility</strong> — different calculator
          question.
        </li>
        <li>
          <strong>Cost-sharing reductions (CSRs) and deductible
          variance</strong> — healthcare cost is modeled as premium-only.
        </li>
        <li>
          <strong>TCJA 65+ additional standard deduction</strong>{" "}
          ($2,050 in 2026) — not separately modeled; OBBBA's $6,000 senior
          deduction is treated as an extra deduction on top of the base
          standard deduction, which is where the TCJA add-on would go if
          modeled.
        </li>
      </ul>
    </section>
  );
}

function SourcesSection() {
  return (
    <section className="mb-12">
      <div className="section-divider mb-5">Full source list</div>
      <p className="text-sm leading-relaxed mb-4" style={{ color: C.ink }}>
        Consolidated list of every primary source cited above, plus the
        agencies whose annual data releases this calculator pins to for
        future updates.
      </p>
      <ul
        className="text-sm leading-relaxed space-y-3"
        style={{ color: C.ink }}
      >
        <li>
          <Ref href="https://www.ssa.gov/OP_Home/cfr20/404/404-0410.htm">
            20 CFR § 404.410
          </Ref>{" "}
          — early-entitlement reduction formula (basis for the survivor
          reduction factor).
        </li>
        <li>
          <Ref href="https://www.ssa.gov/OACT/quickcalc/early_late.html">
            SSA Office of the Chief Actuary — Early or Late Retirement
          </Ref>{" "}
          — official tables for the retirement reduction (5/9 of 1% per
          month for the first 36 months, 5/12 of 1% thereafter) and the
          delayed-retirement credit (8%/yr past FRA, capped at age 70).
        </li>
        <li>
          <Ref href="https://www.ssa.gov/benefits/retirement/planner/whileworking.html">
            SSA — Receiving Benefits While Working
          </Ref>{" "}
          — the 2026 earnings test ($24,480 lower limit, $65,160 FRA-year
          limit) and the FRA recoup mechanism.
        </li>
        <li>
          <Ref href="https://secure.ssa.gov/poms.nsf/lnx/0300615482">
            POMS RS 00615.482
          </Ref>{" "}
          — Adjustment of the Reduction Factor (ARF); the ceil() crediting
          rule.
        </li>
        <li>
          <Ref href="https://www.ssa.gov/benefits/survivors/ifyou.html">
            SSA — Survivors Benefits: How Much You Could Receive
          </Ref>{" "}
          — survivor (widow/widower) and switch-strategy mechanics.
        </li>
        <li>
          <Ref href="https://www.irs.gov/pub/irs-pdf/p915.pdf">
            IRS Publication 915 — Social Security and Equivalent Railroad
            Retirement Benefits
          </Ref>{" "}
          — combined-income tier formula ($25K / $34K thresholds) for
          single filers.
        </li>
        <li>
          <Ref href="https://www.irs.gov/newsroom/irs-releases-tax-inflation-adjustments-for-tax-year-2026-including-amendments-from-the-one-big-beautiful-bill/">
            IRS 2026 inflation adjustments
          </Ref>{" "}
          — 2026 inflation-adjusted federal brackets and standard deduction
          (Rev. Proc. 2025-32).
        </li>
        <li>
          <Ref href="https://www.irs.gov/pub/irs-drop/rp-25-25.pdf">
            IRS Rev. Proc. 2025-25
          </Ref>{" "}
          — 2026 ACA applicable-percentage table (basis for the 9.96%
          top-of-scale cap).
        </li>
        <li>
          <Ref href="https://www.congress.gov/bill/119th-congress/house-bill/1/text">
            H.R. 1 (119th Congress) — One Big Beautiful Bill Act
          </Ref>
          , § 70103 — OBBBA senior bonus deduction (2025–2028).
        </li>
        <li>
          <Ref href="https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines">
            HHS ASPE — Poverty Guidelines
          </Ref>{" "}
          — 2025 FPL (used for 2026 PTC determinations per ACA's
          prior-year convention).
        </li>
        <li>
          <Ref href="https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-and-deductibles">
            CMS — 2026 Medicare Parts A &amp; B Premiums and Deductibles
          </Ref>{" "}
          — Part B base premium ($202.90/mo) and IRMAA bracket thresholds.
        </li>
        <li>
          <Ref href="https://secure.ssa.gov/poms.nsf/lnx/0601101020">
            SSA POMS HI 01101.020
          </Ref>{" "}
          — IRMAA bracket structure (cross-checked against the CMS fact
          sheet).
        </li>
        <li>
          <Ref href="https://nystateofhealth.ny.gov/">
            NY State of Health
          </Ref>{" "}
          — Essential Plan rules, post-July-2026 200% FPL ceiling, and
          published Lowest-Cost Silver Plan premiums (NYC silver default:
          $9,679/yr).
        </li>
        <li>
          <Ref href="https://www.health.ny.gov/health_care/medicaid/">
            NY State Department of Health — Medicaid
          </Ref>{" "}
          — adult Medicaid 138% FPL ceiling and Medicare Savings Program
          eligibility (MSP asset test eliminated Jan 1, 2023).
        </li>
      </ul>
    </section>
  );
}
