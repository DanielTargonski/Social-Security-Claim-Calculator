// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeToggle from "./ThemeToggle.jsx";

describe("ThemeToggle", () => {
  it("labels the action it performs, not the current state", () => {
    const { rerender } = render(<ThemeToggle theme="light" onToggle={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent("Dark mode");
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");

    rerender(<ThemeToggle theme="dark" onToggle={() => {}} />);
    expect(screen.getByRole("button")).toHaveTextContent("Light mode");
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("fires onToggle when clicked", async () => {
    const onToggle = vi.fn();
    render(<ThemeToggle theme="light" onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
