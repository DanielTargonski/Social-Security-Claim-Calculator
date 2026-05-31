// @vitest-environment jsdom
//
// Segment: the reusable segmented control behind the mode picker. The sliding
// thumb itself is measured from layout (zero-sized under jsdom, so not asserted
// here); what matters for behavior is that every option renders as a button,
// the active one is marked, clicks report the option key, and the container
// opts into the sliding variant.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Segment from "./Segment.jsx";

const OPTIONS = [
  { key: "a", label: "Alpha" },
  { key: "b", label: "Beta" },
  { key: "c", label: "Gamma" },
];

describe("Segment", () => {
  it("renders every option as a button", () => {
    render(<Segment options={OPTIONS} value="a" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Beta" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gamma" })).toBeInTheDocument();
  });

  it("marks only the active option with .mode-btn-active", () => {
    render(<Segment options={OPTIONS} value="b" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Beta" })).toHaveClass("mode-btn-active");
    expect(screen.getByRole("button", { name: "Alpha" })).not.toHaveClass("mode-btn-active");
    expect(screen.getByRole("button", { name: "Gamma" })).not.toHaveClass("mode-btn-active");
  });

  it("calls onChange with the option key when clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Segment options={OPTIONS} value="a" onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Gamma" }));
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("applies the sliding variant and a passed className to the container", () => {
    const { container } = render(
      <Segment options={OPTIONS} value="a" onChange={() => {}} className="mb-4" />
    );
    const seg = container.querySelector(".segment");
    expect(seg).toHaveClass("segment-sliding");
    expect(seg).toHaveClass("mb-4");
  });
});
