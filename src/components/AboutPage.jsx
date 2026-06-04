import { C } from "../constants/colors.js";

// "Why this calculator exists" page. Lives behind the top-of-page tab nav,
// alongside the calculator itself. The structure mirrors the SSA's own
// regulatory style — formula, then a worked example — and then adds the
// piece the SSA's framing leaves out: what happens when the early checks
// are invested. That second example is the whole reason this calculator
// exists, so it gets its own section with side-by-side numbers.
//
// Numbers in the worked example are computed against the same math layer
// as the calculator itself (verified against computeProjection at build
// time). If the underlying rules change (FRA, reduction percentage), update
// both this file and the constants in src/lib/ssRules.js.
export default function AboutPage() {
  return (
    <div className="max-w-3xl">
      {/* Header */}
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
          About · Why this exists
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
          The half of the answer{" "}
          <span style={{ color: C.accent }}>the SSA leaves out.</span>
        </h1>
        <p
          className="mt-5 text-base leading-relaxed"
          style={{ color: C.inkSoft }}
        >
          Every Social Security claiming explainer — including the SSA's own
          regulations — frames the choice the same way:{" "}
          <em>"claim earlier, get a smaller monthly check; wait, get a bigger one."</em>
          {" "}That framing is technically correct and meaningfully incomplete.
          It compares the two monthly checks in isolation and ignores what the
          claimant might do with the money in the years between.
        </p>
      </div>

      {/* Section 1: what the SSA shows you */}
      <section className="mb-12">
        <div className="section-divider mb-5">What the SSA shows you</div>
        <p
          className="text-sm leading-relaxed mb-4"
          style={{ color: C.ink }}
        >
          The reduction for claiming a survivor benefit before full retirement
          age is set by federal regulation. The formula (paraphrased from{" "}
          <a
            href="https://www.ssa.gov/OP_Home/cfr20/404/404-0410.htm"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: C.wait,
              borderBottom: `1px solid ${C.wait}`,
              paddingBottom: "1px",
            }}
          >
            20 CFR § 404.410
          </a>
          ) is:
        </p>

        <div
          className="card-flat p-5 mb-5 num text-sm"
          style={{
            borderLeft: `3px solid ${C.accent}`,
            color: C.ink,
            lineHeight: 1.7,
          }}
        >
          reduction = unreduced benefit × months early × 0.285 / 84
        </div>

        <p
          className="text-sm leading-relaxed mb-4"
          style={{ color: C.ink }}
        >
          84 is the number of months between age 60 (the earliest eligibility
          for a survivor benefit) and age 67 (full retirement age for anyone
          born in 1960 or later). 0.285 is the maximum reduction — claim at 60
          and the benefit is shrunk by 28.5% for life.
        </p>

        <div className="card p-5 mt-6">
          <div
            className="text-xs uppercase mb-3"
            style={{ color: C.inkSoft, letterSpacing: "0.1em", fontWeight: 600 }}
          >
            Worked example, in the SSA's style
          </div>
          <p className="text-sm leading-relaxed" style={{ color: C.ink }}>
            A surviving spouse is entitled to an unreduced widow's benefit of{" "}
            <span className="num" style={{ fontWeight: 500 }}>$2,000</span>{" "}
            per month at full retirement age 67. They choose to claim at age
            64 instead — 36 months early. The reduction is{" "}
            <span className="num">$2,000 × 36 × 0.285 / 84 = $244.29</span>,
            so the monthly benefit becomes{" "}
            <span className="num" style={{ fontWeight: 500, color: C.early }}>
              $1,755.71
            </span>{" "}
            for life.
          </p>
        </div>

        <p
          className="text-sm leading-relaxed mt-5"
          style={{ color: C.inkSoft }}
        >
          That's where the SSA's example stops. Two monthly numbers,{" "}
          <span className="num">$1,756</span> vs <span className="num">$2,000</span>,
          and the implicit lesson: waiting wins. A naive break-even calculation
          on those two numbers — total dollars received under each strategy at
          a given lifespan — puts the crossover age around{" "}
          <span className="num">88 yr 7 mo</span>. Live longer than that and
          waiting paid off; live shorter and claiming early did.
        </p>
      </section>

      {/* Section 2: the missing half */}
      <section className="mb-12">
        <div className="section-divider mb-5">What the SSA doesn't show you</div>
        <p
          className="text-sm leading-relaxed mb-4"
          style={{ color: C.ink }}
        >
          The 36 monthly checks the early claimant collects between 64 and 67{" "}
          <em>do not have to sit in a checking account</em>. If they're routed
          into a basic balanced index fund — the kind of thing already in most
          retirement accounts — the comparison flips.
        </p>

        <p
          className="text-sm leading-relaxed mb-5"
          style={{ color: C.ink }}
        >
          Each <span className="num">$1,756</span> check, invested as it
          arrives at a 5% real return (5% above inflation — achievable in a
          60/40 portfolio), grows to roughly{" "}
          <span className="num">$68,040</span> by the time the claimant turns
          67. The wait scenario starts at 67 with{" "}
          <span className="num">$0</span> invested but a higher monthly check.
          The {" "}
          <span className="num">$244</span>/mo gap between the two now has to
          chip away at a head start that's <em>also still compounding</em>.
        </p>

        {/* Side-by-side comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
          <div
            className="card-flat p-5"
            style={{ borderLeft: `3px solid ${C.early}` }}
          >
            <div
              className="text-xs uppercase mb-3"
              style={{ color: C.inkSoft, letterSpacing: "0.1em", fontWeight: 600 }}
            >
              Claim at 64, invest at 5% real
            </div>
            <div
              className="num"
              style={{
                color: C.ink,
                fontSize: "1.75rem",
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              $865,034
            </div>
            <div className="text-xs num mt-2" style={{ color: C.inkFaint }}>
              total wealth at age 95
            </div>
            <div
              className="text-xs mt-3"
              style={{ color: C.inkSoft, lineHeight: 1.5 }}
            >
              Break-even age: <span className="num">never</span> — the
              invested pot stays ahead at every projected age past FRA.
            </div>
          </div>

          <div
            className="card-flat p-5"
            style={{ borderLeft: `3px solid ${C.wait}` }}
          >
            <div
              className="text-xs uppercase mb-3"
              style={{ color: C.inkSoft, letterSpacing: "0.1em", fontWeight: 600 }}
            >
              Wait until 67, no investment
            </div>
            <div
              className="num"
              style={{
                color: C.ink,
                fontSize: "1.75rem",
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              $672,000
            </div>
            <div className="text-xs num mt-2" style={{ color: C.inkFaint }}>
              total benefits collected to age 95
            </div>
            <div
              className="text-xs mt-3"
              style={{ color: C.inkSoft, lineHeight: 1.5 }}
            >
              Trails the early-and-invest strategy by{" "}
              <span className="num">$193,034</span> — almost a third less.
            </div>
          </div>
        </div>

        <p
          className="text-sm leading-relaxed mt-5"
          style={{ color: C.inkSoft }}
        >
          Even at <span className="num">0%</span> real return — checks left
          literally as cash, just keeping pace with inflation — the break-even
          age moves from "live to 88-something" to a much narrower question
          about taxation, lifespan, and discipline. This calculator does that
          full computation, factoring in the 2026 earnings test, the FRA
          recoup of withheld months, federal tax tiering on Social Security,
          and the 3-phase invested-pot model.
        </p>
      </section>

      {/* Section 3: who should care */}
      <section className="mb-12">
        <div className="section-divider mb-5">When this matters</div>
        <p
          className="text-sm leading-relaxed mb-4"
          style={{ color: C.ink }}
        >
          The "claim early and invest" framing is right for a claimant who:
        </p>
        <ul
          className="text-sm leading-relaxed space-y-2 ml-5"
          style={{ color: C.ink, listStyle: "disc" }}
        >
          <li>
            Has the discipline to actually invest the early checks rather than
            spend them — auto-deposits into an existing brokerage routine work
            best.
          </li>
          <li>
            Doesn't need the full FRA-sized check for monthly cash flow.
            Someone who would actually live month-to-month on Social Security
            alone has a stronger case for the larger guaranteed check.
          </li>
          <li>
            Is willing to accept market risk on the invested portion. The
            calculator assumes a single deterministic real return — sequence
            of returns is a real-world wrinkle this model doesn't capture.
          </li>
        </ul>
        <p
          className="text-sm leading-relaxed mt-5"
          style={{ color: C.inkSoft }}
        >
          For a claimant who fits all three, the SSA's "wait for more" framing
          systematically points the wrong direction. The whole purpose of this
          calculator is to make the trade-off legible at the level of dollars
          on a chart, with every input visible and adjustable.
        </p>
      </section>

      {/* Sources */}
      <section className="mb-12">
        <div className="section-divider mb-5">Sources & references</div>
        <ul className="text-sm leading-relaxed space-y-3" style={{ color: C.ink }}>
          <li>
            <a
              href="https://www.ssa.gov/OP_Home/cfr20/404/404-0410.htm"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: C.wait,
                borderBottom: `1px solid ${C.wait}`,
                paddingBottom: "1px",
              }}
            >
              20 CFR § 404.410
            </a>
            {" "}— SSA's regulation defining the early-entitlement reduction
            formula. Source of the worked example above and the basis for the
            survivor reduction factor in the calculator.
          </li>
          <li>
            <a
              href="https://www.ssa.gov/OACT/quickcalc/early_late.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: C.wait,
                borderBottom: `1px solid ${C.wait}`,
                paddingBottom: "1px",
              }}
            >
              SSA Office of the Chief Actuary — Early or Late Retirement
            </a>
            {" "}— official tables for retirement reduction (5/9 of 1% per
            month for the first 36 months, 5/12 of 1% thereafter) and delayed
            retirement credits (8% per year past FRA, capped at age 70).
          </li>
          <li>
            <a
              href="https://www.ssa.gov/benefits/retirement/planner/whileworking.html"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: C.wait,
                borderBottom: `1px solid ${C.wait}`,
                paddingBottom: "1px",
              }}
            >
              SSA — Receiving Benefits While Working
            </a>
            {" "}— the 2026 earnings test ($24,480 lower limit, $65,160
            FRA-year limit) and the FRA recoup mechanism that recomputes the
            benefit upward at full retirement age.
          </li>
          <li>
            <a
              href="https://www.irs.gov/pub/irs-pdf/p915.pdf"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: C.wait,
                borderBottom: `1px solid ${C.wait}`,
                paddingBottom: "1px",
              }}
            >
              IRS Publication 915 — Social Security and Equivalent Railroad
              Retirement Benefits
            </a>
            {" "}— the combined-income tier formula ($25K / $34K thresholds
            for single filers) that determines what fraction of Social
            Security is federally taxable.
          </li>
        </ul>
      </section>
    </div>
  );
}
