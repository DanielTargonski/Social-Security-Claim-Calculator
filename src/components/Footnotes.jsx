import { C } from "../constants/colors.js";

// Static footnotes at the bottom of the page: earnings test, NYC tax
// treatment, switch-strategy notes, and caveats this model leaves out.
// Author attribution + copyright notice live below the grid.
export default function Footnotes() {
  return (
    <>
      <div
        className="mt-8 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs leading-relaxed"
        style={{ borderTop: `1px solid ${C.border}`, color: C.inkSoft }}
      >
      <div>
        <div
          className="display text-sm mb-2"
          style={{ color: C.ink, fontStyle: "italic" }}
        >
          The earnings test
        </div>
        For 2026, anyone under FRA the entire year loses $1 of benefits for
        every $2 earned over $24,480. In the year of FRA the limit loosens to
        $65,160 with $1 lost per $3 over. Withheld benefits aren't lost forever
        — the SSA recalculates the claimant's benefit upward at FRA to recoup
        what was held back (this calculator models that recoup explicitly). The
        catch in switch mode is that the recoup only applies to the
        own-retirement benefit, and once the claimant switches to survivor at
        67, the bumped-up own benefit becomes irrelevant.
      </div>
      <div>
        <div
          className="display text-sm mb-2"
          style={{ color: C.ink, fontStyle: "italic" }}
        >
          NYC tax treatment
        </div>
        New York State and NYC do not tax Social Security benefits at all. The
        only tax that touches the claimant's checks is federal. Up to 85% of
        benefits are federally taxable depending on combined income (single
        filer thresholds are $25K and $34K). The calculator simplifies by
        applying the marginal rate to 85% of the benefit. Wage income is
        separately taxed at federal, state, and city rates but that's outside
        this model.
      </div>
      <div>
        <div
          className="display text-sm mb-2"
          style={{ color: C.ink, fontStyle: "italic" }}
        >
          On the switch strategy
        </div>
        A surviving spouse can file a restricted application to claim only their
        own retirement benefit early, then switch to 100% of the survivor
        benefit at FRA. The own benefit is reduced for life on that record but
        irrelevant once the claimant switches. Claiming the own benefit early
        does not reduce the survivor benefit. Verify the exact own-retirement
        amount with the SSA online statement before relying on this.
      </div>
      <div>
        <div
          className="display text-sm mb-2"
          style={{ color: C.ink, fontStyle: "italic" }}
        >
          What "real return" means
        </div>
        Every dollar in the calculator is in today's dollars, and the return
        rate is "real" — meaning after inflation has been subtracted. A 7%
        real return roughly matches the S&P 500's long-run average once you
        strip out the ~3% per year that inflation eats. Working in real terms
        keeps the numbers honest: a $2,500 check at 67 is comparable to a
        $2,500 check at 85 because inflation is already factored out. The
        nominal numbers (what your bank statement actually shows) would be
        much higher, but they'd buy the same groceries.
      </div>
      <div>
        <div
          className="display text-sm mb-2"
          style={{ color: C.ink, fontStyle: "italic" }}
        >
          Caveats this model leaves out
        </div>
        Sequence of returns risk on the invested side. The senior bonus
        deduction (up to $6,000 extra for 65+, phasing out above $75K MAGI)
        which can reduce or eliminate SS taxation. Tax drag on the investment
        portfolio. The $25K and $34K combined-income thresholds that
        determine taxable SS are frozen by statute (not inflation-indexed),
        so in real terms they shrink every year — the model treats them as
        flat, which slightly understates lifetime tax drag on both scenarios,
        more so on the larger "wait" checks.
      </div>
      <div>
        <div
          className="display text-sm mb-2"
          style={{ color: C.ink, fontStyle: "italic" }}
        >
          Healthcare costs (OBBBA, 2026+)
        </div>
        Models the post-OBBBA NYC healthcare landscape: the IRA-era enhanced
        ACA premium tax credits expired Dec 31, 2025, so the 400% FPL
        "subsidy cliff" is back; NY's Essential Plan ceiling drops 250% →
        200% FPL effective July 1, 2026; NY adult Medicaid stays at 138% FPL
        ($0 premium) for non-disabled adults 19-64; and Medicare IRMAA tiers
        stack on top of the standard $202.90/mo Part B premium at 65+. At
        65+, NY's Medicare Savings Programs (QMB / SLMB / QI) zero out the
        Part B premium for anyone ≤135% FPL — NY eliminated the MSP asset
        test in Jan 2026, so eligibility is MAGI-only. The chart subtracts
        the early-vs-wait healthcare-cost differential from the early-claim
        cash flow, so cliff crossings shift the break-even age directly.
        Toggle "Covered elsewhere" if employer coverage, retiree health
        benefits, VA care, or a working spouse takes the household out of
        the ACA / Medicare-IRMAA equation. <strong style={{ color: C.ink }}>
        OBBBA caveat:</strong> NY Medicaid requires 80 hrs/mo of work,
        study, or volunteering starting Jan 1, 2027, with 6-month
        redeterminations beginning Dec 2026. The calculator models cost,
        not compliance — assumes the claimant qualifies for and maintains
        whichever band their MAGI puts them in. Essential Plan and ACA
        marketplace coverage have no work requirement. Intentional
        simplifications: the 2-year IRMAA MAGI lookback is ignored
        (current-year MAGI used directly); the ACA PTC contribution scale
        is collapsed to a single 9.96% cap across the 200–400% FPL band
        (the 2026 indexed top-of-scale applicable percentage per IRS Rev.
        Proc. 2025-25);
        non-MAGI (asset-tested) 65+ Medicaid and long-term-care
        eligibility are out of scope. Cliff thresholds and the $9,679/yr
        NYC silver default are 2026 figures — review annually against CMS,
        HHS ASPE, and NY State of Health publications.
      </div>
    </div>

    <div
      className="mt-8 pt-5 flex flex-wrap items-center justify-between gap-3 text-xs"
      style={{ borderTop: `1px solid ${C.border}`, color: C.inkFaint }}
    >
      <div>
        © 2026 Daniel Targonski. All rights reserved.
      </div>
      <div className="flex items-center gap-3">
        <span className="num" style={{ letterSpacing: "0.08em" }}>
          Built by{" "}
          <a
            href="https://www.linkedin.com/in/daniel-targonski/"
            target="_blank"
            rel="noopener noreferrer"
            className="attribution-link"
            style={{ color: C.inkSoft }}
          >
            Daniel Targonski
          </a>
        </span>
        <span style={{ color: C.border }}>·</span>
        <a
          href="https://github.com/DanielTargonski/Social-Security-Claim-Calculator"
          target="_blank"
          rel="noopener noreferrer"
          className="attribution-link num"
          style={{ color: C.inkSoft, letterSpacing: "0.08em" }}
        >
          GitHub
        </a>
      </div>
    </div>
    </>
  );
}
