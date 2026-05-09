// @vitest-environment jsdom
//
// ModeSwitcher: small but worth pinning because it owns the conditional
// banner that explains the switch strategy. The previous monolith did this
// inline; extracting it makes it easy to regress (e.g. accidentally rendering
// the banner in survivor mode).

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ModeSwitcher from "./ModeSwitcher.jsx";

describe("ModeSwitcher — render", () => {
  it("renders all three mode buttons", () => {
    render(<ModeSwitcher mode="retirement" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Retirement/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Survivor \(Spouse\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Own → Survivor/i })).toBeInTheDocument();
  });

  it("only renders the explanation banner when mode === 'switch'", () => {
    const { rerender } = render(
      <ModeSwitcher mode="retirement" onChange={() => {}} />
    );
    expect(screen.queryByText(/The survivor's switch\./i)).toBeNull();

    rerender(<ModeSwitcher mode="survivor" onChange={() => {}} />);
    expect(screen.queryByText(/The survivor's switch\./i)).toBeNull();

    rerender(<ModeSwitcher mode="switch" onChange={() => {}} />);
    expect(screen.getByText(/The survivor's switch\./i)).toBeInTheDocument();
  });

  it("marks the active mode with the .mode-btn-active class", () => {
    render(<ModeSwitcher mode="survivor" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Survivor \(Spouse\)/i })).toHaveClass("mode-btn-active");
    expect(screen.getByRole("button", { name: /Retirement/i })).not.toHaveClass("mode-btn-active");
    expect(screen.getByRole("button", { name: /Own → Survivor/i })).not.toHaveClass("mode-btn-active");
  });
});

describe("ModeSwitcher — interaction", () => {
  it("clicking each button calls onChange with the mode key", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ModeSwitcher mode="retirement" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Survivor \(Spouse\)/i }));
    expect(onChange).toHaveBeenLastCalledWith("survivor");

    await user.click(screen.getByRole("button", { name: /Own → Survivor/i }));
    expect(onChange).toHaveBeenLastCalledWith("switch");

    await user.click(screen.getByRole("button", { name: /Retirement/i }));
    expect(onChange).toHaveBeenLastCalledWith("retirement");
  });
});
