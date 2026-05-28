// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SummaryCards from "./SummaryCards.jsx";

// A claim-early-at-64 retirement scenario where the claimant keeps working
// past FRA. Only the fields the "Working past 67" card reads need realistic
// values; the rest just keep the always-rendered cards from throwing.
const baseProps = {
  mode: "retirement",
  claimAge: 64,
  investStopAge: 67,
  returnRate: 2,
  lifeExpectancy: 90,
  earlyMonthlyGross: 2000,
  earlyMonthlyNet: 1215,
  earlyPostFRAMonthlyGross: 2167,
  earlyPostFRAMonthlyNet: 1960, // taxed against post-67 wages (working)
  earlyPostFRAMonthlyNetRetired: 2167, // wages gone → less SS tax (retired)
  fraMonthlyGross: 2500,
  fraMonthlyNet: 2277,
  fraMonthlyNetRetired: 2277,
  postFRAGrossIncome: 40000,
  postFRAWorkYears: 1,
  postFRAWorkEndAge: 68,
  // No-tax baseline (locality "none", zero wage tax): net wage == gross so the
  // take-home assertions reduce to wage + SS. Individual tests override this
  // with realistic NY/NYC tax objects to exercise the breakdown copy.
  wageTaxPostFRA: { federal: 0, state: 0, city: 0, total: 0, net: 40000 },
  wageTaxPreFRA: { federal: 0, state: 0, city: 0, total: 0, net: 0 },
  earningsTestWithholding: 7760,
  recoupedFactor: 0.9,
  potAtStopRow: 0,
  breakEvenAge: null,
  advantage: 5000,
  crossoverValue: null,
  coveredElsewhere: true, // suppress the healthcare card — irrelevant here
};

const HEADING = "Each year working past 67";

describe("SummaryCards — working-past-67 card render gate", () => {
  it("renders the card when the claimant works past FRA with post-67 wages", () => {
    render(<SummaryCards {...baseProps} />);
    expect(screen.getByText(HEADING)).toBeInTheDocument();
  });

  it("hides the card when the claimant retires at FRA (postFRAWorkYears = 0)", () => {
    render(<SummaryCards {...baseProps} postFRAWorkYears={0} />);
    expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
  });

  it("hides the card when there are no post-67 wages (nothing to compare)", () => {
    render(<SummaryCards {...baseProps} postFRAGrossIncome={0} />);
    expect(screen.queryByText(HEADING)).not.toBeInTheDocument();
  });
});

describe("SummaryCards — working-past-67 card content", () => {
  it("shows the combined per-year income, the working benefit, and the retired 'final fixed' check", () => {
    render(<SummaryCards {...baseProps} />);
    // Per-year total = $40,000 wage + $1,960 × 12 net SS = $63,520.
    expect(screen.getByText("$63,520/yr")).toBeInTheDocument();
    // Benefit while working (the reduced/working-taxed check).
    expect(screen.getByText("Benefit while working")).toBeInTheDocument();
    expect(screen.getByText("$1,960/mo net")).toBeInTheDocument();
    // Final fixed check once wages stop (higher — less SS taxed).
    expect(screen.getByText(/After you stop at/i)).toBeInTheDocument();
    expect(screen.getByText("$2,167/mo net")).toBeInTheDocument();
    // The uplift note appears because retired > working.
    expect(screen.getByText(/\+\$207\/mo/)).toBeInTheDocument();
  });

  it("omits the cumulative-total line for a single working year, shows it for several", () => {
    const card = () => screen.getByText(HEADING).parentElement;

    const { unmount } = render(<SummaryCards {...baseProps} />);
    expect(card().textContent).not.toMatch(/total/i);
    unmount();

    render(
      <SummaryCards {...baseProps} postFRAWorkYears={5} postFRAWorkEndAge={72} />
    );
    // $63,520/yr × 5 ≈ $318K total.
    expect(card().textContent).toMatch(/\$318K total/);
  });

  it("omits the 'after you stop' block when work runs to life expectancy", () => {
    render(
      <SummaryCards
        {...baseProps}
        lifeExpectancy={68}
        postFRAWorkYears={1}
        postFRAWorkEndAge={68}
      />
    );
    expect(screen.getByText(HEADING)).toBeInTheDocument();
    expect(screen.queryByText(/After you stop at/i)).not.toBeInTheDocument();
  });
});

describe("SummaryCards — post-67 wage take-home (after tax)", () => {
  // NYC scenario: $40,000 wage taxed $2,000 fed + $1,500 state + $800 city
  // → $35,700 net wage. Headline take-home = net wage + SS net ($23,520).
  const taxed = {
    ...baseProps,
    wageTaxPostFRA: {
      federal: 2000,
      state: 1500,
      city: 800,
      total: 4300,
      net: 35700,
    },
  };

  it("headlines the after-tax take-home, not the gross wage + SS", () => {
    render(<SummaryCards {...taxed} />);
    // $35,700 net wage + $1,960 × 12 SS net = $59,220.
    expect(screen.getByText("$59,220/yr")).toBeInTheDocument();
  });

  it("breaks out federal, NY State, and NYC wage tax in the subtitle", () => {
    render(<SummaryCards {...taxed} />);
    const card = screen.getByText(HEADING).parentElement;
    expect(card.textContent).toMatch(/\$35,700 wage net/);
    expect(card.textContent).toMatch(/\$2,000 fed/);
    expect(card.textContent).toMatch(/\$1,500 NY State/);
    expect(card.textContent).toMatch(/\$800 NYC/);
  });

  it("omits the state/city portions when locality is 'none' (federal only)", () => {
    render(
      <SummaryCards
        {...baseProps}
        wageTaxPostFRA={{
          federal: 2200,
          state: 0,
          city: 0,
          total: 2200,
          net: 37800,
        }}
      />
    );
    const card = screen.getByText(HEADING).parentElement;
    expect(card.textContent).toMatch(/\$2,200 fed/);
    expect(card.textContent).not.toMatch(/NY State/);
    expect(card.textContent).not.toMatch(/NYC/);
  });
});

describe("SummaryCards — pre-67 wage take-home (Card 1 addendum)", () => {
  // Claiming early at 64 while still working a $50,000 wage, NYC-taxed
  // $3,000 fed + $2,000 state + $1,000 city → $44,000 net wage.
  const preTaxed = {
    ...baseProps,
    grossIncome: 50000,
    wageTaxPreFRA: {
      federal: 3000,
      state: 2000,
      city: 1000,
      total: 6000,
      net: 44000,
    },
  };

  it("shows the pre-FRA take-home when the claimant works before FRA", () => {
    render(<SummaryCards {...preTaxed} />);
    expect(screen.getByText("Take-home while working")).toBeInTheDocument();
    // $44,000 net wage + $1,215 × 12 SS net = $58,580.
    expect(screen.getByText("$58,580/yr")).toBeInTheDocument();
  });

  it("breaks out the pre-FRA federal, NY State, and NYC wage tax", () => {
    render(<SummaryCards {...preTaxed} />);
    const block = screen.getByText("Take-home while working").parentElement;
    expect(block.textContent).toMatch(/\$44,000 wage net/);
    expect(block.textContent).toMatch(/\$3,000 fed/);
    expect(block.textContent).toMatch(/\$2,000 NY State/);
    expect(block.textContent).toMatch(/\$1,000 NYC/);
  });

  it("hides the pre-FRA take-home when there is no pre-67 wage", () => {
    render(<SummaryCards {...baseProps} grossIncome={0} />);
    expect(
      screen.queryByText("Take-home while working")
    ).not.toBeInTheDocument();
  });

  it("hides the pre-FRA take-home when claiming at or after FRA", () => {
    render(<SummaryCards {...preTaxed} claimAge={67} />);
    expect(
      screen.queryByText("Take-home while working")
    ).not.toBeInTheDocument();
  });
});
