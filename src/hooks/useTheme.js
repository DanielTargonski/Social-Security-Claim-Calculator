import { useCallback, useEffect, useState } from "react";

// Theme state for the light/dark toggle. Display preference only — kept in
// localStorage, never in the share URL (a shared link should reproduce the
// configured calculator, not the recipient's chrome). Mirrors how `view` is
// handled in App.jsx.
//
// Resolution order on first load:
//   1. an explicit stored choice ("light" | "dark") in localStorage, else
//   2. the OS preference via prefers-color-scheme.
// The actual flash-free first paint is handled by an inline script in
// index.html that sets <html data-theme> before React mounts; this hook reads
// that same attribute back so the two never disagree.
export const THEME_STORAGE_KEY = "ssc-theme";

export function getSystemTheme() {
  return typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function getInitialTheme() {
  if (typeof window === "undefined") return "light";
  // Prefer whatever the FOUC-guard script already committed to the DOM.
  const onRoot = document.documentElement.getAttribute("data-theme");
  if (onRoot === "light" || onRoot === "dark") return onRoot;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return getSystemTheme();
}

export function useTheme() {
  const [theme, setThemeState] = useState(getInitialTheme);

  // Keep the DOM attribute and the stored choice in sync with state.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  // Follow live OS changes only while the user hasn't made an explicit choice
  // this session. Once they toggle, their choice is in localStorage and wins.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => {
      if (!window.localStorage.getItem(THEME_STORAGE_KEY)) {
        setThemeState(e.matches ? "dark" : "light");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggleTheme, setTheme: setThemeState };
}
