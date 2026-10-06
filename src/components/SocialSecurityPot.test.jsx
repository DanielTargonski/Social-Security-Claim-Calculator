// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SocialSecurityPot from "./SocialSecurityPot.jsx";

// Claim at 62 for $1,000/mo ($1,200 from 67 after the recoup) vs $1,500/mo
// at 67, priced at 2% real: $600K / $720K / $900K pots.
function props(overrides = {}) {
  return {
    claimAge: 62,
    returnRate: 5,
    bondYield: 2,
    onBondYieldChange: () => {},
    earlyPreFRAMonthly: 1000,
    earlyPostFRAMonthly: 1200,
    waitMonthly: 1500,
    investedPotAtFRA: 70000,
    ...overrides,
  };
}

describe("SocialSecurityPot", () => {
  it("sizes each choice's Social Security pot as a bond", () => {
    render(<SocialSecurityPot {...props()} />);
    expect(screen.getByText("Your Social Security as a pot")).toBeInTheDocument();
    expect(screen.getByText("What you hold at 67 yr")).toBeInTheDocument();
    expect(screen.getByText("$600K")).toBeInTheDocument();
    expect(
      screen.getByText(/\$720K Social Security pot paying \$1,200\/mo \+ \$70K invested pot/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\$900K Social Security pot paying \$1,500\/mo/)
    ).toBeInTheDocument();
  });

  it("prices waiting as the checks given up, and nets in the invested pot", () => {
    render(<SocialSecurityPot {...props()} />);
    expect(screen.getByText("$180K bigger")).toBeInTheDocument();
    expect(
      screen.getByText(/in checks claiming at 62 yr collects/)
    ).toBeInTheDocument();
    // $720K + $70K vs $900K.
    expect(screen.getByText("$110K behind")).toBeInTheDocument();
  });

  it("a lower yield means a bigger pot", () => {
    render(<SocialSecurityPot {...props({ bondYield: 1 })} />);
    // $1.44M early vs $1.80M wait at 1% real.
    expect(screen.getByText("$360K bigger")).toBeInTheDocument();
    expect(screen.getByText(/\$1\.80M Social Security pot/)).toBeInTheDocument();
  });

  it("switch mode: same pot from 67, so the early checks come free", () => {
    render(
      <SocialSecurityPot
        {...props({ earlyPostFRAMonthly: 1500, investedPotAtFRA: 0 })}
      />
    );
    expect(
      screen.getByText(/Both choices hold the same \$900K pot/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/K bigger$/)).not.toBeInTheDocument();
  });

  it("delayed claim past 67 buys a bigger pot with the FRA checks", () => {
    render(
      <SocialSecurityPot
        {...props({
          claimAge: 70,
          earlyPreFRAMonthly: 0,
          earlyPostFRAMonthly: 1860,
          investedPotAtFRA: 0,
        })}
      />
    );
    expect(screen.getByText("What you hold at 70 yr")).toBeInTheDocument();
    expect(screen.getByText(/Delaying to 70 yr buys a/)).toBeInTheDocument();
    expect(screen.getByText("$216K bigger")).toBeInTheDocument();
  });

  it("claiming at 67 is the wait choice", () => {
    render(
      <SocialSecurityPot
        {...props({ claimAge: 67, earlyPostFRAMonthly: 1500 })}
      />
    );
    expect(
      screen.getByText(/Claiming at 67 yr is the wait choice/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Checks given up")).not.toBeInTheDocument();
  });
});
