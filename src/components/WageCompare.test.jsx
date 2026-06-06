// @vitest-environment jsdom
//
// WageCompare renders the head-to-head of the same claiming decision across
// different pre-67 wage levels. These tests pin: it renders without throwing
// (recharts under jsdom has bitten this project before), it surfaces each wage
// scenario and a verdict, the current wage is read-only while alternatives are
// editable, editing an alternative calls back with its key, the reset affordance
// is gated on `dirty`, and the ACA-cliff status shows for an over-cliff wage.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WageCompare from "./WageCompare.jsx";
import { compareWages } from "../lib/wageCompare.js";

const baseInputs = {
  mode: "survivor",
  fraBenefit: 2700,
  ownBenefit: 1350,
  birthMonth: 6,
  birthYear: 1962,
  claimAge: 64,
  returnRate: 7,
  investStopAge: 67,
  lifeExpectancy: 85,
  grossIncome: 40000,
  postFRAGrossIncome: 0,
  postFRAWorkYears: 0,
  autoTax: true,
  manualFedRate: 12,
  investedPct: 100,
  investedPctWait: 100,
  coveredElsewhere: false,
  unsubsidizedSilverAnnual: 9679,
  locality: "none",
};

function renderPanel(overrides = {}, scenarioWages = [40000, 24480, 0], props = {}) {
  const inputs = { ...baseInputs, ...overrides };
  const wageScenarios = [
    { key: "current", wage: scenarioWages[0] },
    { key: "alt1", wage: scenarioWages[1] },
    { key: "alt2", wage: scenarioWages[2] },
  ];
  const compare = compareWages(inputs, wageScenarios);
  const onAltChange = props.onAltChange ?? vi.fn();
  const onReset = props.onReset ?? vi.fn();
  const onReturnRateChange = props.onReturnRateChange ?? vi.fn();
  const onInvestedPctChange = props.onInvestedPctChange ?? vi.fn();
  render(
    <WageCompare
      compare={compare}
      currentKey="current"
      claimAge={inputs.claimAge}
      lifeExpectancy={inputs.lifeExpectancy}
      coveredElsewhere={inputs.coveredElsewhere}
      unsubsidizedSilverAnnual={inputs.unsubsidizedSilverAnnual}
      dirty={props.dirty ?? false}
      onAltChange={onAltChange}
      onReset={onReset}
      returnRate={props.returnRate ?? null}
      onReturnRateChange={onReturnRateChange}
      mode={inputs.mode}
      investedPct={props.investedPct ?? null}
      onInvestedPctChange={onInvestedPctChange}
    />
  );
  return { compare, onAltChange, onReset, onReturnRateChange, onInvestedPctChange };
}

describe("WageCompare — render", () => {
  it("renders the heading and each wage scenario", () => {
    renderPanel();
    expect(
      screen.getByText(/What if you earned less before 67/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText(/\$40,000\/yr/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$24,480\/yr/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Not working/).length).toBeGreaterThan(0);
  });

  it("states a verdict", () => {
    renderPanel();
    expect(screen.getByText(/at your assumptions/i)).toBeInTheDocument();
    expect(
      screen.getByText(/comes out ahead|about even/i)
    ).toBeInTheDocument();
  });

  it("flags the current wage as read-only with a hint to use the slider", () => {
    renderPanel();
    expect(
      screen.getByText(/change it with the slider above/i)
    ).toBeInTheDocument();
  });
});

describe("WageCompare — editing alternatives", () => {
  it("exposes exactly two editable alternative-wage fields", () => {
    renderPanel();
    expect(
      screen.getAllByTitle("Set this alternative pre-67 wage")
    ).toHaveLength(2);
  });

  it("editing an alternative calls onAltChange with that scenario's key", async () => {
    const user = userEvent.setup();
    const onAltChange = vi.fn();
    renderPanel({}, [40000, 24480, 0], { onAltChange });
    // First editable field is alt1 (the current wage is read-only).
    await user.click(
      screen.getAllByTitle("Set this alternative pre-67 wage")[0]
    );
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "30000");
    await user.keyboard("{Enter}");
    expect(onAltChange).toHaveBeenCalledWith("alt1", 30000);
  });
});

describe("WageCompare — reset affordance", () => {
  it("hides reset when not dirty", () => {
    renderPanel({}, [40000, 24480, 0], { dirty: false });
    expect(screen.queryByText(/reset alternatives/i)).not.toBeInTheDocument();
  });

  it("shows reset when dirty and calls onReset", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    renderPanel({}, [40000, 24480, 0], { dirty: true, onReset });
    const btn = screen.getByText(/reset alternatives/i);
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    expect(onReset).toHaveBeenCalled();
  });
});

describe("WageCompare — marginal work warning", () => {
  it("shows a poor keep-rate warning when the top wage barely pays off", () => {
    // switch mode, 0% return, invest 0%, live 88: $40k wins but barely beats
    // $24,480 — a poor keep rate on the extra work.
    renderPanel(
      {
        mode: "switch",
        returnRate: 0,
        investedPct: 0,
        lifeExpectancy: 88,
        birthYear: 1964,
      },
      [40000, 24480, 0]
    );
    expect(screen.getByText(/marginal work/i)).toBeInTheDocument();
    expect(screen.getAllByText(/cents/i).length).toBeGreaterThan(0);
  });

  it("shows a 'loses money' warning when working more reduces lifetime resources", () => {
    // 7% return, full investing: $24,480 wins; working up to $40k loses money.
    renderPanel({}, [0, 24480, 40000]);
    expect(screen.getByText(/marginal work/i)).toBeInTheDocument();
    expect(screen.getAllByText(/loses money/i).length).toBeGreaterThan(0);
  });

  it("blames the healthcare cliff (not the earnings test) on a switch-mode cliff loss", () => {
    // switch mode, wages straddling the ACA 400% FPL cliff: working up to the
    // over-cliff wage loses money, driven by the premium jump, not the earnings
    // test. The copy must name the cliff and must NOT claim a 67 recoup story.
    renderPanel(
      {
        mode: "switch",
        ownBenefit: 600,
        fraBenefit: 3000,
        claimAge: 62,
        returnRate: 0,
        investedPct: 0,
        coveredElsewhere: false,
      },
      [63000, 62000, 0]
    );
    expect(screen.getByText(/marginal work/i)).toBeInTheDocument();
    expect(screen.getByText(/crossing a healthcare cliff/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/never recoups them at 67/i)
    ).not.toBeInTheDocument();
  });

  it("stays silent when the extra work pays off at a normal rate", () => {
    // All wages below the earnings-test limit, covered elsewhere: working more
    // keeps the normal after-tax share, so no warning.
    renderPanel(
      { coveredElsewhere: true, returnRate: 0, investedPct: 0 },
      [20000, 10000, 0]
    );
    expect(screen.queryByText(/marginal work/i)).not.toBeInTheDocument();
  });
});

describe("WageCompare — return-rate control", () => {
  it("omits the in-card return-rate slider when no rate is supplied", () => {
    renderPanel();
    expect(
      screen.queryByText(/Annual real return invested/i)
    ).not.toBeInTheDocument();
  });

  it("renders the return-rate slider showing the supplied rate", () => {
    renderPanel({}, [40000, 24480, 0], { returnRate: 5 });
    expect(
      screen.getByText(/Annual real return invested/i)
    ).toBeInTheDocument();
    expect(screen.getByText("5.0%")).toBeInTheDocument();
  });

  it("still renders the slider at 0% (guard is != null, not truthiness)", () => {
    // 0 is a legal rate (the slider's min). Pin that the != null guard keeps
    // the control visible at flat returns. Assert on the unique label, not
    // "0.0%" (also the slider's min end-label).
    renderPanel({}, [40000, 24480, 0], { returnRate: 0 });
    expect(
      screen.getByText(/Annual real return invested/i)
    ).toBeInTheDocument();
  });

  it("editing the rate calls onReturnRateChange with the typed value", async () => {
    const user = userEvent.setup();
    const onReturnRateChange = vi.fn();
    renderPanel({}, [40000, 24480, 0], { returnRate: 5, onReturnRateChange });
    await user.click(screen.getByText("5.0%"));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "8");
    await user.keyboard("{Enter}");
    expect(onReturnRateChange).toHaveBeenCalledWith(8);
  });
});

describe("WageCompare — invest control", () => {
  it("omits the invest control when no investedPct is supplied", () => {
    renderPanel();
    expect(
      screen.queryByText(/Invest % of early-claim checks/i)
    ).not.toBeInTheDocument();
  });

  it("renders the invest slider and shows the monthly invested amount", () => {
    // Covered elsewhere keeps the math simple; 50% avoids the 0%/100% slider
    // end-label collision so the value display is unambiguous.
    const { compare } = renderPanel(
      { coveredElsewhere: true },
      [40000, 24480, 0],
      { investedPct: 50 }
    );
    expect(
      screen.getByText(/Invest % of early-claim checks/i)
    ).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    // The readout names the selected strategy (survivor mode) and shows a
    // per-month invested dollar.
    expect(screen.getByText(/claiming survivor early invests/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\/mo invested/i).length).toBeGreaterThan(0);
    // The readout reflects the current scenario's resolved invested amount (it
    // appears in both the bold callout and the slider hint, so allow several).
    const invested = Math.round(compare.byKey.current.investedMonthly);
    expect(
      screen.getAllByText(new RegExp(`\\$${invested.toLocaleString()}/mo`)).length
    ).toBeGreaterThan(0);
  });

  it("editing the invest % calls onInvestedPctChange with the typed value", async () => {
    const user = userEvent.setup();
    const onInvestedPctChange = vi.fn();
    renderPanel({}, [40000, 24480, 0], { investedPct: 50, onInvestedPctChange });
    await user.click(screen.getByText("50%"));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "25");
    await user.keyboard("{Enter}");
    expect(onInvestedPctChange).toHaveBeenCalledWith(25);
  });
});

describe("WageCompare — healthcare cliff status", () => {
  it("flags a wage that lands over the ACA cliff", () => {
    // $70k pushes the pre-65 MAGI past the 400% FPL cliff → full premium.
    renderPanel({}, [70000, 24480, 0]);
    expect(screen.getByText(/over the ACA cliff/i)).toBeInTheDocument();
  });

  it("shows 'covered elsewhere' and no cliff when healthcare is off", () => {
    renderPanel({ coveredElsewhere: true });
    expect(screen.getAllByText(/covered elsewhere/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/over the ACA cliff/i)).not.toBeInTheDocument();
  });
});
