// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OptimalClaimAge from "./OptimalClaimAge.jsx";

const inputs = { mode: "retirement", lifeExpectancy: 85, returnRate: 7 };

function optimal(income) {
  return {
    optimalAge: 62,
    optimalScore: 900000,
    baselineAge: 62,
    baselineScore: 900000,
    sweep: [],
    income,
  };
}

const atSeventy = {
  optimalAge: 70,
  optimal: { check: 2852, potDraw: 0, monthly: 2852, totalDrawn: 513000 },
  baseline: { check: 1610, potDraw: 940, monthly: 2550, totalDrawn: 690000 },
};

describe("OptimalClaimAge — highest monthly income", () => {
  it("recommends the income-maximizing age with both pots broken out", () => {
    render(
      <OptimalClaimAge
        inputs={inputs}
        optimal={optimal(atSeventy)}
        setClaimAge={() => {}}
      />
    );
    expect(screen.getByText("Highest monthly income")).toBeInTheDocument();
    expect(screen.getByText("$2,852/mo")).toBeInTheDocument();
    expect(screen.getByText(/vs \$2,550\/mo at your pick/)).toBeInTheDocument();
    expect(
      screen.getByText("$2,852 Social Security check, nothing invested")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your pick: $1,610 Social Security check + $940 drawn from the invested pot"
      )
    ).toBeInTheDocument();
    expect(screen.getByText(/spends the invested pot down to \$0 by 85 yr/))
      .toBeInTheDocument();
  });

  it("'Use' applies the income-maximizing age", () => {
    const setClaimAge = vi.fn();
    render(
      <OptimalClaimAge
        inputs={inputs}
        optimal={optimal(atSeventy)}
        setClaimAge={setClaimAge}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Use 70 yr" }));
    expect(setClaimAge).toHaveBeenCalledWith(70);
  });

  it("says so when the pick already gives the highest income", () => {
    render(
      <OptimalClaimAge
        inputs={{ ...inputs, returnRate: 0 }}
        optimal={optimal({
          optimalAge: 62,
          optimal: atSeventy.baseline,
          baseline: atSeventy.baseline,
        })}
        setClaimAge={() => {}}
      />
    );
    expect(
      screen.getByText(/already gives the highest\s+income/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use/ })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "$1,610 Social Security check + $940 drawn from the set-aside checks"
      )
    ).toBeInTheDocument();
  });

  it("treats a gain under 1% as noise: no recommendation to move", () => {
    render(
      <OptimalClaimAge
        inputs={inputs}
        optimal={optimal({
          optimalAge: 60 + 2 / 12,
          optimal: { check: 1804, potDraw: 1515, monthly: 3319, totalDrawn: 717000 },
          baseline: { check: 1788, potDraw: 1530, monthly: 3317, totalDrawn: 716000 },
        })}
        setClaimAge={() => {}}
      />
    );
    expect(screen.getByText(/is within \$2\/mo of the highest income/))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Use 60 yr 2 mo/ }))
      .not.toBeInTheDocument();
  });
});
