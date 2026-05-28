// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MetadataStrip from "./MetadataStrip.jsx";

// A minimum-viable prop bag: every numeric input zero, autoTax off, no recoup.
// Individual tests override only the fields they care about.
const baseProps = {
  autoTax: false,
  annualEarlyGross: 0,
  earningsTestWithholding: 0,
  earlyMonthlyGross: 0,
  earlyPostFRAMonthlyGross: 0,
  recoupedFactor: null,
  combinedIncome: 0,
  taxableSSPct: 0,
  ssEffectiveTaxRate: 0,
  lifeExpectancy: 85,
};

describe("MetadataStrip — render gate", () => {
  it("returns null when there's nothing substantive to show", () => {
    // No earnings test, no taxable SS, manual tax mode → strip is empty.
    const { container } = render(<MetadataStrip {...baseProps} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders when autoTax is on, even with no earnings test or tax effect", () => {
    render(<MetadataStrip {...baseProps} autoTax={true} />);
    expect(screen.getByText("By the numbers")).toBeInTheDocument();
    // Auto-tax mode surfaces the combined-income and taxable-SS rows.
    expect(screen.getByText(/Combined income/i)).toBeInTheDocument();
    expect(screen.getByText(/Taxable SS portion/i)).toBeInTheDocument();
  });

  it("renders when earnings test is withholding anything, even in manual tax mode", () => {
    render(
      <MetadataStrip
        {...baseProps}
        earningsTestWithholding={5000}
        annualEarlyGross={36000}
      />
    );
    expect(screen.getByText("By the numbers")).toBeInTheDocument();
    expect(screen.getByText(/Earnings test \(annual\)/i)).toBeInTheDocument();
  });

  it("renders when the effective SS tax rate is nonzero, even with no earnings test", () => {
    render(
      <MetadataStrip {...baseProps} ssEffectiveTaxRate={0.15} />
    );
    expect(screen.getByText("By the numbers")).toBeInTheDocument();
    expect(screen.getByText(/Effective fed tax on SS/i)).toBeInTheDocument();
  });
});

describe("MetadataStrip — earnings test rows", () => {
  it("hides the post-FRA / recoup rows when recoupedFactor is null", () => {
    // Switch mode passes recoupedFactor=null because the claimant abandons
    // own retirement at FRA — the recoup is moot.
    render(
      <MetadataStrip
        {...baseProps}
        earningsTestWithholding={4800}
        annualEarlyGross={36000}
        earlyMonthlyGross={3000}
        earlyPostFRAMonthlyGross={3200}
        recoupedFactor={null}
      />
    );
    // Pre-FRA rows are visible.
    expect(screen.getByText(/Monthly SS \(after test\)/i)).toBeInTheDocument();
    // Post-FRA / recoup rows are not.
    expect(screen.queryByText(/Monthly SS \(after FRA\)/i)).toBeNull();
    expect(screen.queryByText(/FRA recoup/i)).toBeNull();
  });

  it("shows the post-FRA + recoup rows when recoupedFactor is set", () => {
    render(
      <MetadataStrip
        {...baseProps}
        earningsTestWithholding={4800}
        annualEarlyGross={36000}
        earlyMonthlyGross={2400}
        earlyPostFRAMonthlyGross={2600}
        recoupedFactor={0.85}
      />
    );
    expect(screen.getByText(/Monthly SS \(after FRA\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Annual SS \(after FRA\)/i)).toBeInTheDocument();
    expect(screen.getByText(/FRA recoup/i)).toBeInTheDocument();
  });
});

describe("MetadataStrip — standing rows", () => {
  it("always shows the NY+NYC exempt reminder when the strip renders", () => {
    render(<MetadataStrip {...baseProps} autoTax={true} />);
    expect(screen.getByText(/NY \+ NYC on SS/i)).toBeInTheDocument();
    expect(screen.getByText(/\$0 · exempt/i)).toBeInTheDocument();
  });

  it("does not show the NY+NYC reminder when the strip is gated off", () => {
    // The reminder lives inside the strip — if the strip returns null,
    // it shouldn't leak into the DOM either.
    render(<MetadataStrip {...baseProps} />);
    expect(screen.queryByText(/NY \+ NYC on SS/i)).toBeNull();
  });
});

describe("MetadataStrip — healthcare rows (OBBBA / NYC)", () => {
  it("always shows both ACA (pre-65) and Medicare (65+) rows, regardless of claim age", () => {
    // Pre-65 claimer — should still see the Medicare row for the 65+ years.
    render(
      <MetadataStrip
        {...baseProps}
        autoTax={true}
        claimAge={62}
        acaAnnualCost={5130}
        medicareAnnualCost={2435}
        healthcareNextCliff={{
          label: "ACA premium tax credit cliff (400% FPL)",
          distance: 8600,
          annualCostDelta: 4549,
        }}
      />
    );
    // Both row labels present, regardless of claim age.
    expect(screen.getByText(/ACA premium \(pre-65\)/i)).toBeInTheDocument();
    // "IRMAA" is now wrapped in a glossary <Term>, so the label's text is
    // split across nodes — assert the surrounding label plus the tooltip.
    expect(screen.getByText(/Medicare \(B \+/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Income-Related Monthly Adjustment/i)
    ).toBeInTheDocument();
    // Both annual costs displayed as debits.
    expect(screen.getByText(/−\$5,130\/yr/)).toBeInTheDocument();
    expect(screen.getByText(/−\$2,435\/yr/)).toBeInTheDocument();
    // Pre-65 claimer sees the "until age 65" annotation on the ACA row.
    expect(screen.getByText(/until age 65/i)).toBeInTheDocument();
    // Cliff distance + cost-if-crossed.
    expect(screen.getByText(/Next cliff/i)).toBeInTheDocument();
    expect(screen.getByText(/\$8,600/)).toBeInTheDocument();
    expect(screen.getByText(/\+\$4,549\/yr/)).toBeInTheDocument();
    expect(screen.getByText(/400% FPL/)).toBeInTheDocument();
  });

  it("shows the ACA (pre-65) row even when claim age is 65+", () => {
    // A 67-year-old claimer still needs to see what they'd pay pre-65
    // (the model's perspective starts at claim age, but the user is asking
    // the calculator from before that point — they want lifecycle context).
    render(
      <MetadataStrip
        {...baseProps}
        autoTax={true}
        claimAge={67}
        acaAnnualCost={4750}
        medicareAnnualCost={2435}
        healthcareNextCliff={{
          label: "IRMAA Tier 1 cliff",
          distance: 19000,
          annualCostDelta: 1148,
        }}
      />
    );
    expect(screen.getByText(/ACA premium \(pre-65\)/i)).toBeInTheDocument();
    // "IRMAA" is now wrapped in a glossary <Term>, so the label's text is
    // split across nodes — assert the surrounding label plus the tooltip.
    expect(screen.getByText(/Medicare \(B \+/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Income-Related Monthly Adjustment/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/−\$4,750\/yr/)).toBeInTheDocument();
    expect(screen.getByText(/−\$2,435\/yr/)).toBeInTheDocument();
    // No "until age 65" annotation when claim is past 65 (they're already past).
    expect(screen.queryByText(/until age 65/i)).toBeNull();
    // Cliff for the user's regime — IRMAA — is what surfaces.
    expect(screen.getByText(/IRMAA Tier 1/)).toBeInTheDocument();
  });

  it("shows the $0 subsidized state on the ACA row when MAGI is below 200% FPL", () => {
    render(
      <MetadataStrip
        {...baseProps}
        autoTax={true}
        claimAge={62}
        acaAnnualCost={0}
        medicareAnnualCost={2435}
        healthcareNextCliff={{
          label: "NY Essential Plan ceiling (200% FPL)",
          distance: 6300,
          annualCostDelta: 2974,
        }}
      />
    );
    expect(screen.getByText(/\$0 · subsidized/i)).toBeInTheDocument();
    expect(screen.getByText(/Essential Plan/)).toBeInTheDocument();
  });

  it("hides the cliff row when there is no cliff above (already past every tier)", () => {
    render(
      <MetadataStrip
        {...baseProps}
        autoTax={true}
        claimAge={62}
        acaAnnualCost={9679}
        medicareAnnualCost={2435}
        healthcareNextCliff={null}
      />
    );
    expect(screen.getByText(/ACA premium \(pre-65\)/i)).toBeInTheDocument();
    // "IRMAA" is now wrapped in a glossary <Term>, so the label's text is
    // split across nodes — assert the surrounding label plus the tooltip.
    expect(screen.getByText(/Medicare \(B \+/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Income-Related Monthly Adjustment/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Next cliff/i)).toBeNull();
  });

  it("replaces the healthcare detail rows with the 'covered elsewhere' note when toggled", () => {
    render(
      <MetadataStrip
        {...baseProps}
        autoTax={true}
        claimAge={62}
        coveredElsewhere={true}
        acaAnnualCost={0}
        medicareAnnualCost={0}
        healthcareNextCliff={null}
      />
    );
    expect(screen.getByText(/covered elsewhere/i)).toBeInTheDocument();
    expect(screen.getByText(/OBBBA cliffs not modeled/i)).toBeInTheDocument();
    // The detailed rows should not appear.
    expect(screen.queryByText(/ACA premium/i)).toBeNull();
    expect(screen.queryByText(/Medicare/i)).toBeNull();
    expect(screen.queryByText(/Next cliff/i)).toBeNull();
  });

  it("opens the strip on its own when only the healthcare row has content", () => {
    // Earnings test off, autoTax off, ssEffectiveTaxRate=0 — but real
    // healthcare costs should still cause the strip to render.
    render(
      <MetadataStrip
        {...baseProps}
        claimAge={62}
        acaAnnualCost={5130}
        medicareAnnualCost={2435}
        healthcareNextCliff={null}
      />
    );
    expect(screen.getByText("By the numbers")).toBeInTheDocument();
    expect(screen.getByText(/ACA premium \(pre-65\)/i)).toBeInTheDocument();
    // "IRMAA" is now wrapped in a glossary <Term>, so the label's text is
    // split across nodes — assert the surrounding label plus the tooltip.
    expect(screen.getByText(/Medicare \(B \+/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Income-Related Monthly Adjustment/i)
    ).toBeInTheDocument();
  });
});
