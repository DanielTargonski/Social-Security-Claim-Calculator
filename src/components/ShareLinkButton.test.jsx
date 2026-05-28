// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import ShareLinkButton from "./ShareLinkButton.jsx";

// userEvent v14 installs its own navigator.clipboard shim on .setup(), which
// would clobber the mocks below — so we use fireEvent here. A plain click is
// all the component needs anyway.

describe("ShareLinkButton", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/?fra=2500&age=64");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders the idle label by default", () => {
    render(<ShareLinkButton />);
    expect(screen.getByRole("button")).toHaveTextContent("Copy share link");
  });

  it("copies the current URL via the Clipboard API and flips the label", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<ShareLinkButton />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(screen.getByRole("button")).toHaveTextContent("Link copied")
    );
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(window.location.href);
  });

  it("reverts the label after 1800ms", async () => {
    // Fake timers installed BEFORE the click so the setTimeout in the
    // handler is captured by the fake clock instead of the real one.
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(<ShareLinkButton />);
    fireEvent.click(screen.getByRole("button"));

    // Drain pending microtasks (the awaited writeText resolution) so
    // setCopied(true) lands before we read the label.
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    // runAllTimersAsync also fired the 1800ms revert — so we expect the
    // idle label, which is a strictly stronger assertion than just "Link
    // copied appeared at some point": it confirms the timer scheduled the
    // revert and didn't get stuck.
    expect(screen.getByRole("button")).toHaveTextContent("Copy share link");
  });

  it("falls back to execCommand when the Clipboard API throws", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;

    render(<ShareLinkButton />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(execCommand).toHaveBeenCalledWith("copy"));
    // And the success label still appears — the fallback is opaque to the user.
    expect(screen.getByRole("button")).toHaveTextContent("Link copied");
  });
});
