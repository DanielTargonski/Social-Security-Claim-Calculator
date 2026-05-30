// Light/dark toggle. Two-state pill button (see .pill-btn in GlobalStyles).
// The label names the action it performs ("Dark mode" while light, "Light
// mode" while dark) so it reads as a verb, not an ambiguous status indicator.
// State + persistence live in useTheme.

// Small inline sun / moon glyph so the toggle reads at a glance. Inline SVG
// (not an emoji) keeps it monochrome and on-theme via currentColor.
function ThemeGlyph({ isDark }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {isDark ? (
        // sun (clicking returns to light)
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      ) : (
        // moon (clicking switches to dark)
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      )}
    </svg>
  );
}

export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  const label = isDark ? "Light mode" : "Dark mode";
  return (
    <button
      type="button"
      onClick={onToggle}
      className="pill-btn"
      aria-pressed={isDark}
      title={`Switch to ${label.toLowerCase()}`}
    >
      <ThemeGlyph isDark={isDark} />
      {label}
    </button>
  );
}
