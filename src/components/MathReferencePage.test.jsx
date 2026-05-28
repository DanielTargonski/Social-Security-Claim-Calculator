// @vitest-environment jsdom
//
// MathReferencePage: the "The math" reference page behind the third tab.
// Comprehensive but mostly static — these tests pin (a) section headers
// render, (b) the load-bearing 2026 dollar figures are present (so a
// future bracket / FPL / IRMAA update isn't silently forgotten), and
// (c) the primary-source links resolve to the expected canonical URLs.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MathReferencePage from "./MathReferencePage.jsx";

describe("MathReferencePage — render", () => {
  it("renders the page heading and every section divider", () => {
    render(<MathReferencePage />);
    expect(
      screen.getByRole("heading", { level: 1 })
    ).toHaveTextContent(/actually calculated/i);
    // Some section names also appear inside the consolidated sources list,
    // so use getAllByText and just confirm at least one match exists.
    const expectPresent = (matcher) =>
      expect(screen.getAllByText(matcher).length).toBeGreaterThan(0);
    expectPresent("Reduction & credit factors");
    expectPresent(/Earnings test \(2026\)/);
    expectPresent("FRA recoup of withheld months");
    expectPresent("Federal tax on Social Security");
    expectPresent(/2026 federal brackets/);
    expectPresent(/OBBBA senior bonus deduction \(2025–2028\)/);
    expectPresent(/Healthcare cost layer/);
    expectPresent("3-phase invested-pot model");
    expectPresent("Deliberately out of scope");
    expectPresent("Full source list");
  });

  it("pins the load-bearing 2026 dollar thresholds", () => {
    render(<MathReferencePage />);
    // Earnings test
    expect(screen.getAllByText(/\$24,480/).length).toBeGreaterThan(0);
    // Federal-tax SS tier thresholds
    expect(screen.getAllByText(/\$25,000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$34,000/).length).toBeGreaterThan(0);
    // 2026 standard deduction
    expect(screen.getAllByText(/\$16,100/).length).toBeGreaterThan(0);
    // OBBBA senior deduction (base + phase-out endpoints)
    expect(screen.getAllByText(/\$6,000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$75,000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$175,000/).length).toBeGreaterThan(0);
    // ACA / NY cliffs
    expect(screen.getAllByText(/\$15,650/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$9,679/).length).toBeGreaterThan(0);
    // Medicare Part B base
    expect(screen.getAllByText(/\$202\.90\/mo/).length).toBeGreaterThan(0);
    // IRMAA Tier 1 threshold
    expect(screen.getAllByText(/\$109,000/).length).toBeGreaterThan(0);
  });

  it("links every primary source to its canonical URL", () => {
    render(<MathReferencePage />);

    // 20 CFR § 404.410 — SSA hosted CFR. Appears inline + in sources list.
    const cfrLinks = screen.getAllByRole("link", {
      name: /20 CFR § 404\.410/,
    });
    expect(cfrLinks.length).toBeGreaterThan(0);
    for (const link of cfrLinks) {
      expect(link).toHaveAttribute(
        "href",
        "https://www.ssa.gov/OP_Home/cfr20/404/404-0410.htm"
      );
    }

    // POMS RS 00615.482 — the ARF crediting rule.
    const armLinks = screen.getAllByRole("link", {
      name: /POMS RS 00615\.482/,
    });
    expect(armLinks.length).toBeGreaterThan(0);
    for (const link of armLinks) {
      expect(link).toHaveAttribute(
        "href",
        "https://secure.ssa.gov/poms.nsf/lnx/0300615482"
      );
    }

    // IRS Pub 915 — combined-income tier formula. Appears inline + in the
    // sources list, so use getAllByRole.
    const pub915Links = screen.getAllByRole("link", {
      name: /IRS Publication 915/i,
    });
    expect(pub915Links.length).toBeGreaterThan(0);
    for (const link of pub915Links) {
      expect(link).toHaveAttribute(
        "href",
        "https://www.irs.gov/pub/irs-pdf/p915.pdf"
      );
    }

    // SSA quickcalc — retirement reduction / DRC tables. Appears inline +
    // in the sources list.
    const quickcalcLinks = screen.getAllByRole("link", {
      name: /Early or Late Retirement/i,
    });
    expect(quickcalcLinks.length).toBeGreaterThan(0);
    for (const link of quickcalcLinks) {
      expect(link).toHaveAttribute(
        "href",
        "https://www.ssa.gov/OACT/quickcalc/early_late.html"
      );
    }

    // OBBBA — H.R. 1 text on congress.gov.
    const obbbaLinks = screen.getAllByRole("link", {
      name: /H\.R\. 1.*Big Beautiful Bill/i,
    });
    expect(obbbaLinks.length).toBeGreaterThan(0);
    for (const link of obbbaLinks) {
      expect(link).toHaveAttribute(
        "href",
        "https://www.congress.gov/bill/119th-congress/house-bill/1/text"
      );
    }

    // CMS 2026 Medicare Parts A & B fact sheet — IRMAA brackets.
    const cmsLinks = screen.getAllByRole("link", {
      name: /CMS.*2026 Medicare Parts/i,
    });
    expect(cmsLinks.length).toBeGreaterThan(0);
    for (const link of cmsLinks) {
      expect(link).toHaveAttribute(
        "href",
        "https://www.cms.gov/newsroom/fact-sheets/2026-medicare-parts-b-premiums-and-deductibles"
      );
    }
  });
});
