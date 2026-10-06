// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PotIncome from "./PotIncome.jsx";
import { buildChartData } from "../lib/chartProjection.js";

// Claim at 62, invest a $1,000/mo net check until 67 at 7% real; wait gets
// $1,500/mo from 67.
function props(overrides = {}) {
  const returnRate = overrides.returnRate ?? 7;
  const investedFraction = overrides.investedFraction ?? 1;
  return {
    claimAge: 62,
    investStopAge: 67,
    lifeExpectancy: 90,
    returnRate,
    withdrawalRate: 4,
    onWithdrawalRateChange: () => {},
    chartData: buildChartData({
      claimAge: 62,
      investStopAge: 67,
      lifeExpectancy: 90,
      returnRate,
      earlyMonthlyNet: 1000,
      earlyPostFRAMonthlyNet: 1000,
      fraMonthlyNet: 1500,
      investedFraction,
    }),
    earlyPostFRAMonthlyNet: 1000,
    earlyPostFRAMonthlyNetRetired: 1000,
    fraMonthlyNet: 1500,
    fraMonthlyNetRetired: 1500,
    postFRAWorkEndAge: 67,
    ...overrides,
  };
}

describe("PotIncome", () => {
  it("renders the monthly income comparison and the pot stats", () => {
    render(<PotIncome {...props()} />);
    expect(screen.getByText("The pot as a paycheck")).toBeInTheDocument();
    expect(screen.getByText(/Monthly income from age 67/)).toBeInTheDocument();
    expect(screen.getByText("Claim at 62 yr")).toBeInTheDocument();
    expect(screen.getByText("Wait until 67")).toBeInTheDocument();
    expect(screen.getByText(/never runs\s+out/)).toBeInTheDocument();
    expect(screen.getByText(/Pot left at 90/)).toBeInTheDocument();
  });

  it("names the winner by monthly income", () => {
    // ~$72K pot at 7% → ~$240/mo draw: $1,240 early vs $1,500 wait.
    render(<PotIncome {...props()} />);
    expect(screen.getByText(/Waiting still pays/)).toBeInTheDocument();

    // A 8% draw on a larger check closes the gap.
    render(
      <PotIncome
        {...props({
          withdrawalRate: 8,
          earlyPostFRAMonthlyNet: 1400,
          earlyPostFRAMonthlyNetRetired: 1400,
        })}
      />
    );
    expect(screen.getByText(/drawing from the/)).toBeInTheDocument();
  });

  it("reports when the pot runs dry before life expectancy", () => {
    render(<PotIncome {...props({ returnRate: 0, withdrawalRate: 8 })} />);
    // 0% return, 8% draw → 12.5 years from 67 = 79 yr 6 mo.
    // 0% return wording: nothing is being invested, and the plural noun
    // takes a plural verb.
    expect(
      screen.getByText(/set-aside checks run dry at 79 yr 6 mo/)
    ).toBeInTheDocument();
    expect(screen.getByText(/from \$60K set aside/)).toBeInTheDocument();
  });

  it("forwards withdrawal-rate slider changes", () => {
    const onWithdrawalRateChange = vi.fn();
    render(<PotIncome {...props({ onWithdrawalRateChange })} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "3.5" } });
    expect(onWithdrawalRateChange).toHaveBeenCalledWith(3.5);
  });

  it("shows an empty state when nothing is invested", () => {
    render(<PotIncome {...props({ investedFraction: 0 })} />);
    expect(screen.getByText(/Nothing is invested in this setup/)).toBeInTheDocument();
    expect(screen.queryByText(/Monthly income from age/)).not.toBeInTheDocument();
  });
});
