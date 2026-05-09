// @vitest-environment jsdom
//
// SensitivityTornado has been the source of one production crash already:
// when a perturbation collapsed back to the baseline (e.g. claimAge=62 in
// retirement mode perturbing -2 → clamped back to 62), an earlier version
// of the component returned `null` from its perturb helper and then crashed
// on `.find` / `.toFixed` against undefined. The fix makes `perturb()`
// always return a fully-formed inputs object. These tests pin that
// invariant — and the panel's general "doesn't blow up at the edges"
// behavior — so a regression would surface before reaching production.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SensitivityTornado from "./SensitivityTornado.jsx";

const baseInputs = {
  mode: "retirement",
  fraBenefit: 2500,
  ownBenefit: 1500,
  claimAge: 64,
  returnRate: 7,
  investStopAge: 67,
  lifeExpectancy: 85,
  grossIncome: 0,
  autoTax: true,
  manualFedRate: 12,
};

describe("SensitivityTornado — render in each mode", () => {
  it("retirement mode renders without throwing", () => {
    render(<SensitivityTornado inputs={baseInputs} />);
    expect(screen.getByText("What moves the answer")).toBeInTheDocument();
  });

  it("survivor mode renders without throwing", () => {
    render(
      <SensitivityTornado inputs={{ ...baseInputs, mode: "survivor", claimAge: 64 }} />
    );
    expect(screen.getByText("What moves the answer")).toBeInTheDocument();
  });

  it("switch mode renders and changes its output label to 'Invested pot at switch age'", () => {
    render(<SensitivityTornado inputs={{ ...baseInputs, mode: "switch", claimAge: 64 }} />);
    expect(screen.getByText("What moves the answer")).toBeInTheDocument();
    // The header sentence references the output label in lowercase.
    expect(
      screen.getByText(/invested pot at switch age changes/i)
    ).toBeInTheDocument();
  });
});

describe("SensitivityTornado — bounds-collapse regression", () => {
  // The original bug: at claimAge=62 in retirement mode, perturbing claimAge
  // by -2 would clamp back to 62 (=baseline). The old perturb() returned
  // null and downstream code crashed. Rendering this exact configuration
  // should now succeed.
  it("retirement mode at claimAge=62 (low end) renders without crashing", () => {
    render(<SensitivityTornado inputs={{ ...baseInputs, claimAge: 62 }} />);
    expect(screen.getByText("What moves the answer")).toBeInTheDocument();
  });

  it("retirement mode at claimAge=70 (high end) renders without crashing", () => {
    render(<SensitivityTornado inputs={{ ...baseInputs, claimAge: 70 }} />);
    expect(screen.getByText("What moves the answer")).toBeInTheDocument();
  });

  it("survivor mode at claimAge=60 (low end) renders without crashing", () => {
    render(
      <SensitivityTornado
        inputs={{ ...baseInputs, mode: "survivor", claimAge: 60 }}
      />
    );
    expect(screen.getByText("What moves the answer")).toBeInTheDocument();
  });

  it("survivor mode at claimAge=67 (FRA, high end) renders without crashing", () => {
    render(
      <SensitivityTornado
        inputs={{ ...baseInputs, mode: "survivor", claimAge: 67 }}
      />
    );
    expect(screen.getByText("What moves the answer")).toBeInTheDocument();
  });

  it("switch mode at claimAge=66.5 (high end) renders without crashing", () => {
    render(
      <SensitivityTornado
        inputs={{ ...baseInputs, mode: "switch", claimAge: 66.5 }}
      />
    );
    expect(screen.getByText("What moves the answer")).toBeInTheDocument();
  });
});

describe("SensitivityTornado — variable visibility per mode", () => {
  it("shows the ownBenefit row only in switch mode", () => {
    const { rerender } = render(
      <SensitivityTornado inputs={{ ...baseInputs, mode: "retirement" }} />
    );
    expect(screen.queryByText("Own retirement at 67")).toBeNull();

    rerender(<SensitivityTornado inputs={{ ...baseInputs, mode: "switch" }} />);
    expect(screen.getByText("Own retirement at 67")).toBeInTheDocument();
  });

  it("always shows the universally-applicable variables", () => {
    render(<SensitivityTornado inputs={baseInputs} />);
    expect(screen.getByText("Claim age")).toBeInTheDocument();
    expect(screen.getByText("Life expectancy")).toBeInTheDocument();
    expect(screen.getByText("Real return rate")).toBeInTheDocument();
    expect(screen.getByText("Gross wage income")).toBeInTheDocument();
    expect(screen.getByText("Stop investing at age")).toBeInTheDocument();
    expect(screen.getByText("Benefit at 67")).toBeInTheDocument();
  });
});
