import { C } from "../constants/colors.js";

// Static footnotes at the bottom of the page: earnings test, NYC tax
// treatment, switch-strategy notes, and caveats this model leaves out.
export default function Footnotes() {
  return (
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
          Caveats this model leaves out
        </div>
        Sequence of returns risk on the invested side. The senior bonus
        deduction (up to $6,000 extra for 65+, phasing out above $75K MAGI)
        which can reduce or eliminate SS taxation. Earnings test recoup at FRA.
        Tax drag on the investment portfolio. Medicare Part B premiums. Numbers
        in today's dollars assuming a real return.
      </div>
    </div>
  );
}
