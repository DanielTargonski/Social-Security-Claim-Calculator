// @vitest-environment jsdom
//
// StrategyCompare renders the head-to-head of all three claiming strategies.
// These tests pin: it renders without throwing (recharts under jsdom has bitten
// this project before), it surfaces all three strategies and a verdict, it
// highlights the active mode, and clicking a strategy navigates to its mode.

import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StrategyCompare from "./StrategyCompare.jsx";
import { compareStrategies } from "../lib/strategyCompare.js";

const baseInputs = {
  mode: "switch",
  fraBenefit: 2500,
  ownBenefit: 1500,
  claimAge: 62,
  returnRate: 7,
  investStopAge: 67,
  lifeExpectancy: 85,
  grossIncome: 0,
  postFRAGrossIncome: 0,
  postFRAWorkYears: 0,
  autoTax: true,
  manualFedRate: 12,
  investedPct: 100,
  investedPctWait: 100,
  coveredElsewhere: true,
  unsubsidizedSilverAnnual: 9679,
  locality: "none",
};

function renderCompare(overrides = {}, props = {}) {
  const inputs = { ...baseInputs, ...overrides };
  const compare = compareStrategies(inputs);
  const onSelectStrategy = props.onSelectStrategy ?? vi.fn();
  render(
    <StrategyCompare
      compare={compare}
      mode={inputs.mode}
      onSelectStrategy={onSelectStrategy}
      lifeExpectancy={inputs.lifeExpectancy}
    />
  );
  return { compare, onSelectStrategy };
}

describe("StrategyCompare — render", () => {
  it("renders the heading and all three strategies", () => {
    renderCompare();
    expect(
      screen.getByText(/Survivor early vs Own → Survivor/i)
    ).toBeInTheDocument();
    // Each strategy label appears (labels are unique strings).
    expect(screen.getByText("Survivor early")).toBeInTheDocument();
    expect(screen.getAllByText("Own → Survivor").length).toBeGreaterThan(0);
    expect(screen.getByText("Own only")).toBeInTheDocument();
  });

  it("states a verdict naming the winner", () => {
    const { compare } = renderCompare();
    const winner =
      compare.verdict.primaryWinner === "switch"
        ? "Own → Survivor"
        : "Claiming survivor early";
    expect(
      screen.getByText(new RegExp(`${winner} comes out ahead`, "i"))
    ).toBeInTheDocument();
  });

  it("marks the current mode's card as pressed", () => {
    renderCompare({ mode: "survivor" });
    const card = screen.getByText("Survivor early").closest("button");
    expect(card).toHaveAttribute("aria-pressed", "true");
  });
});

describe("StrategyCompare — verdict direction", () => {
  it("credits Own → Survivor when returns are flat and life is long", () => {
    renderCompare({ returnRate: 0, lifeExpectancy: 95 });
    expect(
      screen.getByText(/Own → Survivor comes out ahead/i)
    ).toBeInTheDocument();
  });

  it("credits claiming survivor early for a short life", () => {
    renderCompare({ lifeExpectancy: 72 });
    expect(
      screen.getByText(/Claiming survivor early comes out ahead/i)
    ).toBeInTheDocument();
  });
});

describe("StrategyCompare — navigation", () => {
  it("calls onSelectStrategy with the strategy's mode when a card is clicked", async () => {
    const user = userEvent.setup();
    const onSelectStrategy = vi.fn();
    renderCompare({}, { onSelectStrategy });
    await user.click(screen.getByText("Survivor early").closest("button"));
    expect(onSelectStrategy).toHaveBeenCalledWith("survivor");
  });

  it("clicking the Own only card navigates to retirement mode", async () => {
    const user = userEvent.setup();
    const onSelectStrategy = vi.fn();
    renderCompare({}, { onSelectStrategy });
    await user.click(screen.getByText("Own only").closest("button"));
    expect(onSelectStrategy).toHaveBeenCalledWith("retirement");
  });
});

describe("StrategyCompare — clamping annotation", () => {
  it("notes when a strategy claims at a clamped age", () => {
    // Claim age 60 is legal for survivor but clamps to 62 for switch/own.
    renderCompare({ mode: "survivor", claimAge: 60 });
    const switchCard = screen.getAllByText("Own → Survivor")[0].closest("button");
    expect(within(switchCard).getByText(/its limit/i)).toBeInTheDocument();
  });
});
