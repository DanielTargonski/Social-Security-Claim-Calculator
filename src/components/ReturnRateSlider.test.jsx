// @vitest-environment jsdom
//
// ReturnRateSlider is the single source of truth for the "annual real return"
// knob shared by the Inputs panel and both comparison cards. These tests pin
// the values that would otherwise only be exercised transitively through the
// card tests: the fixed 0-10% / 0.5% bounds, the one-decimal percent format,
// the fixed label, and the hint that flips to the S&P note only at the
// historical-average 7%.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ReturnRateSlider from "./ReturnRateSlider.jsx";

describe("ReturnRateSlider", () => {
  it("renders the fixed label and 0-10% / 0.5 bounds", () => {
    const { container } = render(
      <ReturnRateSlider value={7} onChange={vi.fn()} />
    );
    expect(screen.getByText("Annual real return invested")).toBeInTheDocument();
    const range = container.querySelector('input[type="range"]');
    expect(range).toHaveAttribute("min", "0");
    expect(range).toHaveAttribute("max", "10");
    expect(range).toHaveAttribute("step", "0.5");
  });

  it("formats the value as one-decimal percent", () => {
    render(<ReturnRateSlider value={7.5} onChange={vi.fn()} />);
    expect(screen.getByText("7.5%")).toBeInTheDocument();
  });

  it("shows the S&P historical hint only at 7%", () => {
    const { rerender } = render(
      <ReturnRateSlider value={7} onChange={vi.fn()} />
    );
    expect(screen.getByText(/S&P 500 historical/i)).toBeInTheDocument();

    rerender(<ReturnRateSlider value={5} onChange={vi.fn()} />);
    expect(
      screen.queryByText(/S&P 500 historical/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/after inflation/i)).toBeInTheDocument();
  });
});
