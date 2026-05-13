// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SliderInput from "./SliderInput.jsx";

const baseProps = {
  label: "Claim age",
  min: 62,
  max: 70,
  step: 0.5,
  format: (v) => `age ${v.toFixed(1)}`,
  hint: "70% of full",
};

describe("SliderInput — rendering", () => {
  it("shows the label, formatted value, hint, and min/max bounds", () => {
    // Use value=63 so the displayed current value can't collide with the
    // min/max bound labels (which would also render "age 62.0" / "age 70.0").
    render(<SliderInput {...baseProps} value={63} onChange={() => {}} />);

    expect(screen.getByText("Claim age")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "age 63.0" })).toBeInTheDocument();
    expect(screen.getByText("70% of full")).toBeInTheDocument();
    expect(screen.getByText("age 62.0")).toBeInTheDocument(); // min bound
    expect(screen.getByText("age 70.0")).toBeInTheDocument(); // max bound
  });

  it("renders a range input wired to the current value", () => {
    render(<SliderInput {...baseProps} value={65} onChange={() => {}} />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveValue("65");
    expect(slider).toHaveAttribute("min", "62");
    expect(slider).toHaveAttribute("max", "70");
  });
});

describe("SliderInput — slider interaction", () => {
  it("calls onChange with the parsed numeric value when the slider moves", () => {
    const onChange = vi.fn();
    render(<SliderInput {...baseProps} value={62} onChange={onChange} />);
    const slider = screen.getByRole("slider");

    // fireEvent change on a range input
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    // Simulate value change directly since user-event range support is patchy
    Object.defineProperty(slider, "value", { value: "65", writable: true });
    slider.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith(65);
  });
});

describe("SliderInput — click-to-edit", () => {
  it("clicking the value swaps in a number input focused and pre-filled", async () => {
    const user = userEvent.setup();
    render(<SliderInput {...baseProps} value={64} onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "age 64.0" }));

    const numInput = screen.getByRole("spinbutton");
    expect(numInput).toHaveValue(64);
    expect(numInput).toHaveFocus();
  });

  it("typing a new value and pressing Enter commits clamped to min/max", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SliderInput {...baseProps} value={64} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "age 64.0" }));
    const numInput = screen.getByRole("spinbutton");

    await user.clear(numInput);
    await user.type(numInput, "63.7{Enter}");

    expect(onChange).toHaveBeenCalledWith(63.7);
  });

  it("clamps an out-of-range typed value to the bounds", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SliderInput {...baseProps} value={64} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "age 64.0" }));
    const numInput = screen.getByRole("spinbutton");

    await user.clear(numInput);
    await user.type(numInput, "150{Enter}");

    expect(onChange).toHaveBeenCalledWith(70); // clamped to max
  });

  it("typeMin/typeMax widen the typed-input range without changing the slider", async () => {
    // The slider stays bounded for easy maneuvering, but power users can
    // type values outside that range — used by the income sliders so phone
    // users get a manageable slider but high earners aren't capped.
    const user = userEvent.setup();
    const onChange = vi.fn();
    const props = {
      ...baseProps,
      min: 0,
      max: 100,
      typeMax: 500,
      format: (v) => `${v}`,
    };
    render(<SliderInput {...props} value={50} onChange={onChange} />);

    // Slider element still reflects the visible bounds.
    expect(screen.getByRole("slider")).toHaveAttribute("max", "100");

    await user.click(screen.getByRole("button", { name: "50" }));
    const numInput = screen.getByRole("spinbutton");

    await user.clear(numInput);
    await user.type(numInput, "300{Enter}");

    // 300 is above slider max but within typeMax — accepted as-is.
    expect(onChange).toHaveBeenCalledWith(300);
  });

  it("clamps typed values to typeMax when above it", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const props = {
      ...baseProps,
      min: 0,
      max: 100,
      typeMax: 500,
      format: (v) => `${v}`,
    };
    render(<SliderInput {...props} value={50} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "50" }));
    const numInput = screen.getByRole("spinbutton");
    await user.clear(numInput);
    await user.type(numInput, "999{Enter}");

    expect(onChange).toHaveBeenCalledWith(500); // clamped to typeMax
  });

  it("Escape cancels the edit without calling onChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SliderInput {...baseProps} value={64} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "age 64.0" }));
    const numInput = screen.getByRole("spinbutton");
    await user.clear(numInput);
    await user.type(numInput, "63{Escape}");

    expect(onChange).not.toHaveBeenCalled();
    // back to display mode
    expect(screen.getByRole("button", { name: "age 64.0" })).toBeInTheDocument();
  });

  it("editToString prefills the edit input with a caller-controlled string", async () => {
    // Used by the invest sliders' "$" mode: underlying value is a percentage,
    // but the edit input shows the dollar equivalent so the user can type a
    // dollar figure directly.
    const user = userEvent.setup();
    render(
      <SliderInput
        {...baseProps}
        min={0}
        max={100}
        value={50}
        format={(v) => `${v}%`}
        editToString={(pct) => String(pct * 20)}
        onChange={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: "50%" }));
    const numInput = screen.getByRole("spinbutton");
    // 50% × $20/pt = "$1000" — prefilled in the edit input as the dollar value.
    expect(numInput).toHaveValue(1000);
  });

  it("parseEdit converts typed text back to the underlying value and clamps", async () => {
    // The dollar-mode parser converts typed dollars back to a percentage and
    // clamps anything above the monthly check down to 100%.
    const user = userEvent.setup();
    const onChange = vi.fn();
    const monthly = 2000;
    render(
      <SliderInput
        {...baseProps}
        min={0}
        max={100}
        value={25}
        format={(v) => `${v}%`}
        parseEdit={(text) => {
          const dollars = parseFloat(text);
          if (Number.isNaN(dollars)) return null;
          return Math.min(100, Math.max(0, (dollars / monthly) * 100));
        }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "25%" }));
    const numInput = screen.getByRole("spinbutton");
    await user.clear(numInput);
    await user.type(numInput, "1500{Enter}");

    // $1500 of a $2000 check → 75%.
    expect(onChange).toHaveBeenCalledWith(75);
  });

  it("parseEdit clamps a typed dollar amount above the monthly check to 100%", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const monthly = 2000;
    render(
      <SliderInput
        {...baseProps}
        min={0}
        max={100}
        value={25}
        format={(v) => `${v}%`}
        parseEdit={(text) => {
          const dollars = parseFloat(text);
          if (Number.isNaN(dollars)) return null;
          return Math.min(100, Math.max(0, (dollars / monthly) * 100));
        }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "25%" }));
    const numInput = screen.getByRole("spinbutton");
    await user.clear(numInput);
    // $5000 ≫ $2000 monthly check — caller maps this to the full check (100%).
    await user.type(numInput, "5000{Enter}");

    expect(onChange).toHaveBeenCalledWith(100);
  });

  it("blur commits the typed value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SliderInput {...baseProps} value={64} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "age 64.0" }));
    const numInput = screen.getByRole("spinbutton");
    await user.clear(numInput);
    await user.type(numInput, "65.5");
    numInput.blur();

    expect(onChange).toHaveBeenCalledWith(65.5);
  });
});
