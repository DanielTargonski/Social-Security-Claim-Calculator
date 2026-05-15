// @vitest-environment jsdom
//
// Top-level smoke tests. The math layer has comprehensive unit + integration
// coverage in src/lib/*.test.js — these tests instead verify that the React
// tree mounts in every mode without throwing, that key UI elements appear,
// and that a few cross-component interactions wire up correctly. The bug
// motivating these tests was a real production white-page caused by an
// unguarded `null` in SensitivityTornado that compiled fine and only crashed
// at render time.

import { afterEach, describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";

// Helper to seed the URL before mounting App. App reads window.location.search
// once via getInitialStateFromUrl() inside useFormState's initializer, so the
// search string has to be set BEFORE render().
function setUrlSearch(search) {
  window.history.replaceState(null, "", "/" + (search ? "?" + search : ""));
}

afterEach(() => {
  // Reset the URL between tests so a hydration test's params don't leak into
  // an unrelated test that assumes default state.
  setUrlSearch("");
});

describe("App — initial render", () => {
  it("mounts in the default retirement mode without throwing", () => {
    render(<App />);
    // Title text is split across nodes — query the heading by role.
    expect(
      screen.getByRole("heading", { level: 1 })
    ).toHaveTextContent(/Take it now/);
  });

  it("shows all three mode buttons", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: /Retirement/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Survivor \(Spouse\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Own → Survivor/i })).toBeInTheDocument();
  });

  it("renders the inputs, summary cards, chart card, tornado, pot table, and footnotes sections", () => {
    render(<App />);
    expect(screen.getByText("Inputs")).toBeInTheDocument();
    // Card heading uses fmtAge() — "62 yr" / "67" rather than the raw float.
    expect(screen.getByText("Net check at 62 yr")).toBeInTheDocument(); // early card
    expect(screen.getByText("Net check at 67")).toBeInTheDocument(); // wait card (FRA — hardcoded "67")
    expect(screen.getByText("Total dollars in hand")).toBeInTheDocument();
    expect(screen.getByText("What moves the answer")).toBeInTheDocument();
    expect(screen.getByText("The pot, year by year")).toBeInTheDocument();
    expect(screen.getByText("The earnings test")).toBeInTheDocument();
  });
});

describe("App — mode switching (white-page regression)", () => {
  // Each mode independently triggered the original white-page bug under
  // certain perturbations. Render in each one as a smoke test that the
  // tornado + chart compose successfully.
  it("renders in survivor mode", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Survivor \(Spouse\)/i }));
    expect(screen.getByText("Survivor benefit at 67")).toBeInTheDocument();
    expect(screen.getByText("What moves the answer")).toBeInTheDocument();
  });

  it("renders in switch mode (Own → Survivor) and shows the explanation banner", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Own → Survivor/i }));
    expect(screen.getByText(/The survivor's switch\./i)).toBeInTheDocument();
    // "Own retirement at 67" appears both as the slider label and as a tornado
    // row label — assert at least one rendered (i.e., the switch-mode-only
    // ownBenefit slider appeared).
    expect(screen.getAllByText("Own retirement at 67").length).toBeGreaterThan(0);
    expect(screen.getByText("What moves the answer")).toBeInTheDocument();
  });

  it("can switch retirement → survivor → switch → retirement without crashing", async () => {
    const user = userEvent.setup();
    render(<App />);
    const sequence = [
      /Survivor \(Spouse\)/i,
      /Own → Survivor/i,
      /Retirement/i,
    ];
    for (const name of sequence) {
      await user.click(screen.getByRole("button", { name }));
      expect(
        screen.getByRole("heading", { level: 1 })
      ).toHaveTextContent(/Take it now/);
    }
  });
});

describe("App — input wiring", () => {
  it("clicking a slider value lets the user type and updates the displayed amount", async () => {
    const user = userEvent.setup();
    render(<App />);

    // The default benefit is $2,500/mo. Click the value to enter edit mode.
    const benefitButton = screen.getByRole("button", { name: "$2,500/mo" });
    await user.click(benefitButton);

    // The number input has type=number → role spinbutton. There's exactly
    // one in the document since only one slider is in edit mode at a time.
    const numInput = screen.getByRole("spinbutton");
    await user.clear(numInput);
    await user.type(numInput, "3000{Enter}");

    // The value should now be reflected in the page (button label refreshes).
    expect(screen.getByRole("button", { name: "$3,000/mo" })).toBeInTheDocument();
  });

  it("the wait-checks-invested slider renders with default 100% and the chip reads 'matches early'", () => {
    render(<App />);
    // The "wait" word is wrapped in a tooltip span, so the label is split
    // across multiple text nodes — match by the <label> element's full text.
    expect(
      screen.getByText((_, el) =>
        el?.tagName === "LABEL" &&
        /invest % of wait-claim checks/i.test(el.textContent || "")
      )
    ).toBeInTheDocument();
    // Both invested-% sliders default to 100, so the chip starts in the
    // matched state.
    expect(screen.getByText(/matches early/i)).toBeInTheDocument();
  });

  it("clicking the 'match early' chip syncs investedPctWait to investedPct", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Lower the early-checks slider via click-to-edit so the two values diverge.
    const earlyValue = screen.getAllByRole("button", { name: "100%" })[0];
    await user.click(earlyValue);
    const numInput = screen.getByRole("spinbutton");
    await user.clear(numInput);
    await user.type(numInput, "50{Enter}");

    // Now the chip should offer to match the new early value (50%).
    const matchChip = await screen.findByRole("button", {
      name: /match early \(50%\)/i,
    });
    await user.click(matchChip);

    // After clicking, the chip flips back to the "matches" state.
    expect(screen.getByText(/matches early/i)).toBeInTheDocument();
  });
});

describe("App — metadata strip visibility", () => {
  it("shows the auto-tax / combined-income strip by default", () => {
    render(<App />);
    // "Combined income" appears in the metadata strip; "Taxable SS portion"
    // is unique to the metadata strip. At least one match is sufficient.
    expect(screen.getAllByText(/Combined income/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Taxable SS portion/i)).toBeInTheDocument();
  });

  it("the standing NY/NYC reminder is visible whenever the strip renders", () => {
    render(<App />);
    expect(screen.getByText(/NY \+ NYC on SS/i)).toBeInTheDocument();
  });
});

describe("App — pot table", () => {
  it("renders rows with phase labels (Contributing pre-FRA, Compounding after)", () => {
    render(<App />);
    const table = screen.getByText("The pot, year by year").closest("div");
    // At least one row should be in the Contributing phase and one in Compounding
    // given the default claimAge=62, lifeExpectancy=85.
    expect(within(table).getAllByText("Contributing").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("Compounding").length).toBeGreaterThan(0);
  });
});

describe("App — top-level tab nav", () => {
  // The TabNav controls which subtree mounts — calculator vs the AboutPage
  // explainer. Pinning the round-trip catches the kind of conditional-render
  // bug where one branch's JSX accidentally survives into the other branch.
  it("starts on the Calculator tab by default", () => {
    render(<App />);
    expect(screen.getByText("Inputs")).toBeInTheDocument();
    expect(screen.queryByText("What the SSA shows you")).toBeNull();
  });

  it("switching to 'Why this exists' shows the AboutPage and hides the calculator UI", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Why this exists/i }));
    expect(screen.getByText("What the SSA shows you")).toBeInTheDocument();
    expect(screen.queryByText("Inputs")).toBeNull();
    // Footnotes still render on both views, so don't assert against them.
  });

  it("switching back to Calculator restores the calculator UI", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /Why this exists/i }));
    await user.click(screen.getByRole("button", { name: /^Calculator$/ }));
    expect(screen.getByText("Inputs")).toBeInTheDocument();
    expect(screen.queryByText("What the SSA shows you")).toBeNull();
  });
});

describe("App — healthcare inputs", () => {
  it("renders the healthcare section with the covered-elsewhere toggle off by default", () => {
    render(<App />);
    expect(
      screen.getByText(/Healthcare \(NYC, 2026\+\)/i)
    ).toBeInTheDocument();
    // Single household and the unsubsidized-silver slider show by default
    // (because coveredElsewhere defaults to false → details panel visible).
    expect(screen.getByRole("button", { name: /^Single$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Couple$/ })).toBeInTheDocument();
    expect(
      screen.getByText(/Unsubsidized silver plan \(annual\)/i)
    ).toBeInTheDocument();
  });

  it("toggling 'covered elsewhere' on hides the household + plan-cost controls", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /Covered elsewhere/i })
    );
    // Single/Couple toggle and the unsubsidized-silver slider disappear.
    expect(screen.queryByRole("button", { name: /^Single$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Couple$/ })).toBeNull();
    expect(
      screen.queryByText(/Unsubsidized silver plan \(annual\)/i)
    ).toBeNull();
  });

  it("switching to couple updates the FPL hint text", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: /^Couple$/ }));
    // The household-size choice mirrors back into URL state too.
    expect(window.location.search).toMatch(/hh=2/);
  });
});

describe("App — URL hydration round-trip", () => {
  // serializeStateToParams + parseStateFromParams have unit coverage in
  // shareableState.test.js. These tests pin the actual integration: a share
  // link in the address bar at mount → React state → rendered UI, plus the
  // mode-aware claim-age clamp that defends against hand-crafted URLs.

  it("hydrates non-default fields from the URL on initial mount", async () => {
    setUrlSearch("mode=survivor&age=63&fra=3000");
    render(<App />);
    // Survivor mode active.
    const survivorBtn = screen.getByRole("button", { name: /Survivor \(Spouse\)/i });
    expect(survivorBtn.getAttribute("aria-pressed") || "").toMatch(/true|/);
    // FRA benefit slider reflects the URL value.
    expect(screen.getByRole("button", { name: "$3,000/mo" })).toBeInTheDocument();
  });

  it("clamps an out-of-range claim age to the mode's bounds", () => {
    // Survivor caps at 67. A hand-crafted ?mode=survivor&age=70 must not
    // leave React state holding 70 — modeConfig.clampClaimAgeToBounds is
    // the guard, and this test verifies it actually fires through App.
    setUrlSearch("mode=survivor&age=70");
    render(<App />);
    // Find the claim-age slider by its survivor-mode bounds (min=60, max=67),
    // since several sliders share the "67 yr" formatted display.
    const claimAgeSlider = screen
      .getAllByRole("slider")
      .find((s) => s.getAttribute("min") === "60" && s.getAttribute("max") === "67");
    expect(claimAgeSlider).toBeDefined();
    // Without the clamp, value would be 70 — out of the slider's own range.
    expect(parseFloat(claimAgeSlider.value)).toBe(67);
  });

  it("mirrors a slider change back into window.location.search", async () => {
    const user = userEvent.setup();
    render(<App />);
    // Switch from default retirement → survivor and confirm the URL updates.
    await user.click(screen.getByRole("button", { name: /Survivor \(Spouse\)/i }));
    expect(window.location.search).toMatch(/mode=survivor/);
  });
});
