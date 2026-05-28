// Inline glossary term: a dotted-underline word that reveals a plain-language
// definition on hover or keyboard focus. Use it to gloss the acronyms the
// calculator surfaces in compact labels (IRMAA, etc.) without sending the
// reader off to the "The Math" page. Pair with src/constants/glossary.js:
//
//   <Term {...GLOSSARY.IRMAA}>IRMAA</Term>
//
// `children` is the visible text (the acronym). `label` is an optional bold
// heading inside the tooltip (e.g. the expanded name); `definition` is the
// explanatory sentence. The tooltip styling lives in GlobalStyles (.term /
// .term-tip) so it inherits the active theme's ink/paper colors.
//
// Accessibility: the term is focusable (tabIndex 0) so keyboard users get the
// same reveal as :hover, and the tooltip carries role="tooltip" with the
// full text mirrored into aria-label for screen readers.
export default function Term({ children, label, definition }) {
  const aria = label ? `${label}. ${definition}` : definition;
  return (
    <span className="term" tabIndex={0} aria-label={aria}>
      {children}
      <span className="term-tip" role="tooltip">
        {label && <strong className="term-tip-label">{label}</strong>}
        {definition}
      </span>
    </span>
  );
}
