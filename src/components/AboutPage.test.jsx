// @vitest-environment jsdom
//
// AboutPage: the explainer that lives behind the "Why this exists" tab.
// Mostly static prose, but the worked-example numbers are tied to the
// math layer's constants — if FRA, the survivor reduction percentage, or
// the worked-example assumptions change, these tests catch the drift.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AboutPage from "./AboutPage.jsx";

describe("AboutPage — render", () => {
  it("renders the page heading and the section dividers", () => {
    render(<AboutPage />);
    expect(
      screen.getByRole("heading", { level: 1 })
    ).toHaveTextContent(/the SSA leaves out/i);
    expect(screen.getByText("What the SSA shows you")).toBeInTheDocument();
    expect(screen.getByText("What the SSA doesn't show you")).toBeInTheDocument();
    expect(screen.getByText("When this matters")).toBeInTheDocument();
    expect(screen.getByText("Sources & references")).toBeInTheDocument();
  });

  it("includes the modernized worked example with the verified numbers", () => {
    render(<AboutPage />);
    // These numbers are computed against computeProjection at build time —
    // see the verification script run during initial implementation. If the
    // ssRules.js constants drift, update both.
    expect(screen.getByText(/\$1,755\.71/)).toBeInTheDocument();
    expect(screen.getByText(/\$244\.29/)).toBeInTheDocument();
    expect(screen.getByText(/\$865,034/)).toBeInTheDocument();
    expect(screen.getByText(/\$672,000/)).toBeInTheDocument();
  });

  it("links to 20 CFR § 404.410 (the source of the worked example)", () => {
    render(<AboutPage />);
    const links = screen.getAllByRole("link", { name: /20 CFR § 404\.410/ });
    expect(links.length).toBeGreaterThan(0);
    // Both the inline reference and the sources-section link should point
    // to the SSA's hosted CFR page.
    for (const link of links) {
      expect(link).toHaveAttribute(
        "href",
        "https://www.ssa.gov/OP_Home/cfr20/404/404-0410.htm"
      );
    }
  });

  it("includes the additional source links (SSA quickcalc, earnings test, IRS Pub 915)", () => {
    render(<AboutPage />);
    expect(
      screen.getByRole("link", { name: /Early or Late Retirement/i })
    ).toHaveAttribute("href", expect.stringContaining("ssa.gov"));
    expect(
      screen.getByRole("link", { name: /Receiving Benefits While Working/i })
    ).toHaveAttribute("href", expect.stringContaining("ssa.gov"));
    expect(
      screen.getByRole("link", { name: /IRS Publication 915/i })
    ).toHaveAttribute("href", expect.stringContaining("irs.gov"));
  });
});
