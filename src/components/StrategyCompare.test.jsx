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
  const onInvestChange = props.onInvestChange ?? vi.fn();
  const onInvestReset = props.onInvestReset ?? vi.fn();
  const onReturnRateChange = props.onReturnRateChange ?? vi.fn();
  render(
    <StrategyCompare
      compare={compare}
      mode={inputs.mode}
      onSelectStrategy={onSelectStrategy}
      lifeExpectancy={inputs.lifeExpectancy}
      onInvestChange={onInvestChange}
      onInvestReset={onInvestReset}
      returnRate={props.returnRate ?? null}
      onReturnRateChange={onReturnRateChange}
      wageRobustness={props.wageRobustness ?? null}
    />
  );
  return { compare, onSelectStrategy, onInvestChange, onInvestReset, onReturnRateChange };
}

// The card for a strategy carries a unique title ("Open <label> in the
// calculator"); the strategy label text itself now appears more than once (the
// per-strategy invest control echoes it), so target the card by title.
const cardFor = (label) =>
  screen.getByTitle(`Open ${label} in the calculator`);

describe("StrategyCompare — render", () => {
  it("renders the heading and all three strategies", () => {
    renderCompare();
    expect(
      screen.getByText(/Survivor early vs Own → Survivor/i)
    ).toBeInTheDocument();
    // Each strategy label appears at least once (now also echoed by the
    // per-strategy invest control, so there can be more than one).
    expect(screen.getAllByText("Survivor early").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Own → Survivor").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Own only").length).toBeGreaterThan(0);
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
    expect(cardFor("Survivor early")).toHaveAttribute("aria-pressed", "true");
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
    await user.click(cardFor("Survivor early"));
    expect(onSelectStrategy).toHaveBeenCalledWith("survivor");
  });

  it("clicking the Own only card navigates to retirement mode", async () => {
    const user = userEvent.setup();
    const onSelectStrategy = vi.fn();
    renderCompare({}, { onSelectStrategy });
    await user.click(cardFor("Own only"));
    expect(onSelectStrategy).toHaveBeenCalledWith("retirement");
  });
});

describe("StrategyCompare — clamping annotation", () => {
  it("notes when a strategy claims at a clamped age", () => {
    // Claim age 60 is legal for survivor but clamps to 62 for switch/own.
    renderCompare({ mode: "survivor", claimAge: 60 });
    const switchCard = cardFor("Own → Survivor");
    expect(within(switchCard).getByText(/its limit/i)).toBeInTheDocument();
  });
});

describe("StrategyCompare — per-strategy invest controls", () => {
  it("renders an editable invested-monthly field per strategy", () => {
    renderCompare();
    // The card title is unique to the card; the invest field's value button
    // carries its own distinct title.
    expect(
      screen.getByTitle("Set the monthly amount invested in Survivor early")
    ).toBeInTheDocument();
    expect(
      screen.getByTitle("Set the monthly amount invested in Own → Survivor")
    ).toBeInTheDocument();
  });

  it("editing a strategy's amount calls onInvestChange with that key only", async () => {
    const user = userEvent.setup();
    const onInvestChange = vi.fn();
    renderCompare({}, { onInvestChange });
    await user.click(
      screen.getByTitle("Set the monthly amount invested in Own → Survivor")
    );
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "250");
    await user.keyboard("{Enter}");
    expect(onInvestChange).toHaveBeenCalledWith("switch", 250);
  });

  it("shows no reset affordance on the shared baseline", () => {
    renderCompare();
    expect(screen.queryByText(/reset to slider/i)).not.toBeInTheDocument();
  });

  it("shows a reset affordance once a strategy carries an override", () => {
    renderCompare({ investedEarlyDollarByStrategy: { switch: 250 } });
    expect(screen.getByText(/reset to slider/i)).toBeInTheDocument();
  });

  it("clamps a per-strategy amount to the whole check and flags it", () => {
    // Own's reduced check at 62 is ~$1,050; ask for $5,000 → clamps, flagged.
    renderCompare({ investedEarlyDollarByStrategy: { own: 5000 } });
    const ownCard = cardFor("Own only");
    expect(within(ownCard).getByText(/whole check/i)).toBeInTheDocument();
  });
});

describe("StrategyCompare — verdict levers", () => {
  it("surfaces the return-rate lever sentence", () => {
    renderCompare({ returnRate: 0, lifeExpectancy: 95 });
    expect(screen.getByText("RETURNS")).toBeInTheDocument();
    // A flip exists at a long life → the "below X% / above it" phrasing.
    expect(
      screen.getByText(/real return, .* wins; above it,/i)
    ).toBeInTheDocument();
  });

  it("surfaces the longevity lever with an SSA life-table probability", () => {
    // Flat returns + long life → a finite crossover, so the longevity line
    // (and a percentage) appears.
    renderCompare({ returnRate: 0, lifeExpectancy: 95 });
    expect(screen.getByText("LONGEVITY")).toBeInTheDocument();
    expect(
      screen.getByText(/% chance of living from .* crossover \(SSA period life table\)/i)
    ).toBeInTheDocument();
  });

  it("hides the longevity lever when the lines never cross", () => {
    // Short life → survivor-early leads throughout, no crossover.
    renderCompare({ lifeExpectancy: 72 });
    expect(screen.queryByText("LONGEVITY")).not.toBeInTheDocument();
    // The return lever still renders.
    expect(screen.getByText("RETURNS")).toBeInTheDocument();
  });
});

describe("StrategyCompare — decisiveness signal", () => {
  it("renders a decisiveness status chip", () => {
    renderCompare();
    const chip = screen.getByTitle(/how clear-cut the winner is/i);
    expect(chip).toBeInTheDocument();
    expect(chip.textContent).toMatch(/clear winner|close call|slight edge/i);
  });

  it("shows a 'clear winner' chip + emphasis when one strategy dominates", () => {
    // Short life → survivor early dominates with no crossover, wide margin.
    renderCompare({ lifeExpectancy: 72 });
    expect(screen.getByText(/clear winner/i)).toBeInTheDocument();
    expect(screen.getByText(/not a close call/i)).toBeInTheDocument();
  });

  it("shows a 'close call' chip when the lines cross", () => {
    // Flat returns + long life → a crossover, so the call is longevity-dependent.
    renderCompare({ returnRate: 0, lifeExpectancy: 95 });
    expect(screen.getByText(/close call/i)).toBeInTheDocument();
  });

  it("colors the decisive chip by the actual winner (red when survivor-early wins)", () => {
    // Short life → survivor-early (red) wins decisively; the chip must read red,
    // not the hardcoded green, matching the banner/number/card for that winner.
    renderCompare({
      mode: "survivor",
      fraBenefit: 3000,
      ownBenefit: 1000,
      claimAge: 62,
      returnRate: 0,
      lifeExpectancy: 70,
      coveredElsewhere: true,
    });
    const chip = screen.getByTitle(/how clear-cut the winner is/i);
    expect(chip.textContent).toMatch(/clear winner/i);
    expect(chip.style.color).toBe("var(--c-early)");
  });
});

describe("StrategyCompare — by-wage robustness lever", () => {
  it("omits the BY WAGE lever when no robustness data is supplied", () => {
    renderCompare();
    expect(screen.queryByText("BY WAGE")).not.toBeInTheDocument();
  });

  it("renders a 'wins at every wage' lever when one strategy is robust", () => {
    renderCompare(
      {},
      {
        wageRobustness: {
          perWage: [{ wage: 0 }, { wage: 24480 }, { wage: 40000 }],
          allWinner: "switch",
          minMargin: 20000,
          maxMargin: 41000,
          wageCount: 3,
        },
      }
    );
    expect(screen.getByText("BY WAGE")).toBeInTheDocument();
    expect(
      screen.getByText(/wins at every pre-67 wage/i)
    ).toBeInTheDocument();
  });

  it("renders a 'flips with your wage' lever when the winner is not robust", () => {
    renderCompare(
      {},
      {
        wageRobustness: {
          perWage: [{ wage: 0 }, { wage: 24480 }, { wage: 40000 }],
          allWinner: null,
          minMargin: 1000,
          maxMargin: 50000,
          wageCount: 3,
        },
      }
    );
    expect(screen.getByText("BY WAGE")).toBeInTheDocument();
    expect(screen.getByText(/flips with your pre-67 wage/i)).toBeInTheDocument();
  });
});

describe("StrategyCompare — return-rate control", () => {
  it("omits the in-card return-rate slider when no rate is supplied", () => {
    renderCompare();
    expect(
      screen.queryByText(/Annual real return invested/i)
    ).not.toBeInTheDocument();
  });

  it("renders the return-rate slider showing the supplied rate", () => {
    renderCompare({}, { returnRate: 7 });
    expect(
      screen.getByText(/Annual real return invested/i)
    ).toBeInTheDocument();
    // The value display button shows the formatted rate.
    expect(screen.getByText("7.0%")).toBeInTheDocument();
  });

  it("still renders the slider at 0% (guard is != null, not truthiness)", () => {
    // 0 is a legal rate (the slider's min). The control must render so a future
    // refactor to a truthiness guard can't silently hide it at flat returns.
    // Assert on the unique label, not "0.0%" (which is also the slider's min
    // end-label).
    renderCompare({ returnRate: 0 }, { returnRate: 0 });
    expect(
      screen.getByText(/Annual real return invested/i)
    ).toBeInTheDocument();
  });

  it("editing the rate calls onReturnRateChange with the typed value", async () => {
    const user = userEvent.setup();
    const onReturnRateChange = vi.fn();
    renderCompare({}, { returnRate: 7, onReturnRateChange });
    await user.click(screen.getByText("7.0%"));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "4");
    await user.keyboard("{Enter}");
    expect(onReturnRateChange).toHaveBeenCalledWith(4);
  });
});

describe("StrategyCompare — chart legend", () => {
  it("renders a legend chip for each plotted head-to-head line", () => {
    renderCompare();
    // The labels also appear elsewhere (cards, invest controls); the legend
    // just guarantees at least one of each is present near the chart.
    expect(screen.getAllByText("Survivor early").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Own → Survivor").length).toBeGreaterThan(1);
  });
});
