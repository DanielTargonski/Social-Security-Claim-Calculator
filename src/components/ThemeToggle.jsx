// Light/dark toggle. Two-state button styled like the .share-link-btn /
// .mode-btn family (uppercase mono). The label names the action it performs
// ("Dark mode" while light, "Light mode" while dark) so it reads as a verb,
// not an ambiguous status indicator. State + persistence live in useTheme.
export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  const label = isDark ? "Light mode" : "Dark mode";
  return (
    <button
      type="button"
      onClick={onToggle}
      className="theme-toggle-btn"
      aria-pressed={isDark}
      title={`Switch to ${label.toLowerCase()}`}
    >
      {label}
    </button>
  );
}
