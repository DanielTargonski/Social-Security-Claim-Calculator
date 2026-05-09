// Inline wrapper for user-bound variables that appear in body prose.
// Renders the value in JetBrains Mono with a subtle dotted underline so a
// reader can see at a glance which numbers in the copy will change as they
// adjust the sliders. The dotted underline uses currentColor and inherits
// from the surrounding text, so it works on both the cream and dark
// backgrounds without needing to know the context.
//
// Don't wrap card labels (e.g. "Net check at 62") — those already read as
// labels and the underline would be visual noise. Use Var only inside
// running prose like the lede or chart-card subtitle, where the variable
// visually interrupts static text.
export default function Var({ children }) {
  return (
    <span
      className="num"
      style={{
        borderBottom: "1px dotted currentColor",
        paddingBottom: "1px",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}
