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
        portfolio. Medicare Part B premiums.
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
