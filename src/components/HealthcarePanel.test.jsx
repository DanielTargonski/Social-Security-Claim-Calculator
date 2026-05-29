// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import HealthcarePanel from "./HealthcarePanel.jsx";

const baseProps = {
  claimAge: 62,
  coveredElsewhere: false,
  magiACAPre65: 20000,
  magiIRMAA65Plus: 25000,
  acaAnnualCost: 0,
  medicareAnnualCost: 2435,
  healthcareNextCliff: null,
  unsubsidizedSilverAnnual: 9679,
};

describe("HealthcarePanel — band labels", () => {
  it("labels MAGI below 138% FPL as Medicaid eligible", () => {
    // 2026 FPL single = $15,650 → 138% = ~$21,597. MAGI $20K is below.
    render(<HealthcarePanel {...baseProps} magiACAPre65={20000} />);
    expect(screen.getByText(/Medicaid eligible/)).toBeInTheDocument();
    expect(screen.getByText(/\$0 · no premium/)).toBeInTheDocument();
  });

  it("labels MAGI between 138% and 200% FPL as NY Essential Plan", () => {
    // ~$25K is between 138% ($21,597) and 200% ($31,300) FPL.
    render(<HealthcarePanel {...baseProps} magiACAPre65={25000} />);
    expect(screen.getByText(/NY Essential Plan/)).toBeInTheDocument();
    expect(screen.getByText(/138–200% FPL/)).toBeInTheDocument();
  });

  it("labels MAGI between 200% and 400% FPL as Subsidized ACA", () => {
    // $45K is between 200% ($31,300) and 400% ($62,600) FPL.
    render(
      <HealthcarePanel
        {...baseProps}
        magiACAPre65={45000}
        acaAnnualCost={4275}
      />
    );
    expect(screen.getByText(/Subsidized ACA/)).toBeInTheDocument();
    expect(screen.getByText(/−\$4,275\/yr/)).toBeInTheDocument();
  });

  it("labels MAGI above 400% FPL as Unsubsidized ACA", () => {
    render(
      <HealthcarePanel
        {...baseProps}
        magiACAPre65={75000}
        acaAnnualCost={9679}
      />
    );
    expect(screen.getByText(/Unsubsidized ACA/)).toBeInTheDocument();
    expect(screen.getByText(/>400% FPL/)).toBeInTheDocument();
    expect(screen.getByText(/−\$9,679\/yr/)).toBeInTheDocument();
  });
});

describe("HealthcarePanel — IRMAA tier display", () => {
  it("shows the standard / no-surcharge label when in tier 0", () => {
    render(
      <HealthcarePanel
        {...baseProps}
        magiIRMAA65Plus={50000}
        medicareAnnualCost={2435}
      />
    );
    expect(screen.getByText(/Standard \(no surcharge\)/)).toBeInTheDocument();
    // "Part B base $2,435/yr · no surcharge" detail line.
    expect(screen.getByText(/Part B base \$2,435\/yr · no surcharge/)).toBeInTheDocument();
  });

  it("shows the tier number and surcharge dollars when in an IRMAA tier", () => {
    // $150K MAGI → IRMAA Tier 2 ($1148-$2884/yr extra range).
    render(
      <HealthcarePanel
        {...baseProps}
        magiIRMAA65Plus={150000}
        medicareAnnualCost={2435 + 2884.8}
      />
    );
    expect(screen.getByText(/IRMAA Tier 2/)).toBeInTheDocument();
    expect(screen.getByText(/IRMAA surcharge/i)).toBeInTheDocument();
  });
});

describe("HealthcarePanel — covered-elsewhere short circuit", () => {
  it("renders a skipped-message stub when coveredElsewhere is on", () => {
    render(<HealthcarePanel {...baseProps} coveredElsewhere={true} />);
    expect(screen.getByText(/Healthcare cost picture/)).toBeInTheDocument();
    expect(screen.getByText(/covered elsewhere/)).toBeInTheDocument();
    // None of the regular bands should render.
    expect(screen.queryByText(/Medicaid eligible/)).toBeNull();
    expect(screen.queryByText(/IRMAA Tier/)).toBeNull();
  });
});

describe("HealthcarePanel — OBBBA work-requirement caveat", () => {
  it("flags the work requirement only for pre-65 claimants in the Medicaid / EP band", () => {
    render(
      <HealthcarePanel
        {...baseProps}
        claimAge={62}
        magiACAPre65={20000}
      />
    );
    expect(screen.getByText(/80 hrs\/mo/)).toBeInTheDocument();
    expect(screen.getByText(/Jan 1, 2027/)).toBeInTheDocument();
  });

  it("does not flag the caveat when MAGI is already above 200% FPL", () => {
    render(
      <HealthcarePanel
        {...baseProps}
        claimAge={62}
        magiACAPre65={45000}
      />
    );
    expect(screen.queryByText(/80 hrs\/mo/)).toBeNull();
  });

  it("does not flag the caveat when claim age is already 65+", () => {
    render(
      <HealthcarePanel
        {...baseProps}
        claimAge={67}
        magiACAPre65={20000}
      />
    );
    expect(screen.queryByText(/80 hrs\/mo/)).toBeNull();
  });
});

describe("HealthcarePanel — next-cliff row", () => {
  it("renders the cliff distance + cost-if-crossed when a cliff is set", () => {
    render(
      <HealthcarePanel
        {...baseProps}
        magiACAPre65={25000}
        healthcareNextCliff={{
          label: "NY Essential Plan ceiling (200% FPL)",
          distance: 6300,
          annualCostDelta: 2974,
        }}
      />
    );
    expect(screen.getByText(/NEXT CLIFF/i)).toBeInTheDocument();
    expect(screen.getByText(/\$6,300/)).toBeInTheDocument();
    expect(screen.getByText(/\+\$2,974\/yr/)).toBeInTheDocument();
    // The band detail line and the cliff label both contain "Essential
    // Plan" — assert the cliff-specific phrasing.
    expect(screen.getByText(/NY Essential Plan ceiling \(200% FPL\)/)).toBeInTheDocument();
  });

  it("omits the cliff row when no cliff is above current MAGI", () => {
    render(<HealthcarePanel {...baseProps} healthcareNextCliff={null} />);
    expect(screen.queryByText(/NEXT CLIFF/i)).toBeNull();
  });
});
