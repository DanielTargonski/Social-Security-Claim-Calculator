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
