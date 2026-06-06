// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import JumpNav from "./JumpNav.jsx";

const items = [
  { id: "inputs-panel", label: "Sliders" },
  { id: "summary-result", label: "Crossover" },
  { id: "lifetime-chart", label: "Chart" },
];

describe("JumpNav", () => {
  beforeEach(() => {
    window.IntersectionObserver = undefined;
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("renders anchor links with the first section marked current", () => {
    render(<JumpNav items={items} />);

    expect(
      screen.getByRole("navigation", { name: /calculator sections/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sliders" })).toHaveAttribute(
      "href",
      "#inputs-panel"
    );
    expect(screen.getByRole("link", { name: "Sliders" })).toHaveAttribute(
      "aria-current",
      "location"
    );
  });

  it("marks the clicked link current immediately", () => {
    render(<JumpNav items={items} />);

    fireEvent.click(screen.getByRole("link", { name: "Chart" }));

    expect(screen.getByRole("link", { name: "Chart" })).toHaveAttribute(
      "aria-current",
      "location"
    );
    expect(screen.getByRole("link", { name: "Sliders" })).not.toHaveAttribute(
      "aria-current"
    );
  });
});
