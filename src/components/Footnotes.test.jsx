// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Footnotes from "./Footnotes.jsx";

const REPO = "https://github.com/DanielTargonski/Social-Security-Claim-Calculator";

describe("Footnotes", () => {
  it("links to the GitHub issue chooser for bug reports and feature requests", () => {
    render(<Footnotes />);
    const link = screen.getByRole("link", { name: /report a bug \/ suggest a feature/i });
    expect(link).toHaveAttribute("href", `${REPO}/issues/new/choose`);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("still links to the repo itself", () => {
    render(<Footnotes />);
    expect(screen.getByRole("link", { name: "GitHub" })).toHaveAttribute("href", REPO);
  });
});
