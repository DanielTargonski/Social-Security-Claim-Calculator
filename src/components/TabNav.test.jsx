// @vitest-environment jsdom
//
// TabNav: the two-button switcher at the top of the page. Tests pin
// (a) both buttons render, (b) the active class follows the prop, and
// (c) clicking calls onChange with the matching key — same shape as the
// ModeSwitcher tests since the visual treatment is the same chip pattern.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TabNav from "./TabNav.jsx";

describe("TabNav — render", () => {
  it("renders all three tab buttons", () => {
    render(<TabNav view="calculator" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Calculator/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Why this exists/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /The math/i })
    ).toBeInTheDocument();
  });

  it("marks the active tab with the .mode-btn-active class", () => {
    const { rerender } = render(
      <TabNav view="calculator" onChange={() => {}} />
    );
    expect(screen.getByRole("button", { name: /Calculator/ })).toHaveClass(
      "mode-btn-active"
    );
    expect(
      screen.getByRole("button", { name: /Why this exists/i })
    ).not.toHaveClass("mode-btn-active");
    expect(screen.getByRole("button", { name: /The math/i })).not.toHaveClass(
      "mode-btn-active"
    );

    rerender(<TabNav view="about" onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: /Why this exists/i })
    ).toHaveClass("mode-btn-active");
    expect(screen.getByRole("button", { name: /Calculator/ })).not.toHaveClass(
      "mode-btn-active"
    );
    expect(screen.getByRole("button", { name: /The math/i })).not.toHaveClass(
      "mode-btn-active"
    );

    rerender(<TabNav view="math" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /The math/i })).toHaveClass(
      "mode-btn-active"
    );
    expect(
      screen.getByRole("button", { name: /Why this exists/i })
    ).not.toHaveClass("mode-btn-active");
    expect(screen.getByRole("button", { name: /Calculator/ })).not.toHaveClass(
      "mode-btn-active"
    );
  });
});

describe("TabNav — interaction", () => {
  it("clicking each tab calls onChange with the matching view key", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TabNav view="calculator" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Why this exists/i }));
    expect(onChange).toHaveBeenLastCalledWith("about");

    await user.click(screen.getByRole("button", { name: /The math/i }));
    expect(onChange).toHaveBeenLastCalledWith("math");

    await user.click(screen.getByRole("button", { name: /Calculator/ }));
    expect(onChange).toHaveBeenLastCalledWith("calculator");
  });
});
