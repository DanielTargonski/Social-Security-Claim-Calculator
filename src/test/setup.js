// Test environment setup. Loaded by vitest before any test file via the
// `setupFiles` entry in vite.config.js.

import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount components and reset the DOM between tests so each test starts
// from a clean slate.
afterEach(() => {
  cleanup();
});

// Recharts depends on ResponsiveContainer measuring the parent. jsdom doesn't
// implement ResizeObserver — stub it so chart components render without
// throwing. Tests don't assert on chart pixels, just on its existence and
// surrounding labels.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver || ResizeObserverStub;

// jsdom in this setup doesn't expose localStorage (opaque origin). The theme
// hook reads/writes it, so provide a minimal in-memory implementation. Scoped
// to DOM environments (window present) so the node-env math tests don't poke
// Node's experimental global localStorage. Tests that care about storage clear
// it in their own beforeEach.
if (typeof window !== "undefined" && !window.localStorage) {
  const store = new Map();
  window.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

// jsdom does not implement matchMedia. Some libraries probe it on mount.
globalThis.matchMedia =
  globalThis.matchMedia ||
  ((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
