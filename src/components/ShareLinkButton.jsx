import { useState } from "react";

// Copies the current page URL (which includes the full calculator state
// as query params — see lib/shareableState.js) to the clipboard. Brief
// "Link copied" feedback, then reverts. Falls back to a hidden textarea
// + execCommand when the modern Clipboard API is unavailable (insecure
// context, older Safari, etc).
//
// Visual styling lives in GlobalStyles under .share-link-btn — keeps the
// hover/copied transitions in CSS rather than inline state-driven styles.
export default function ShareLinkButton() {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.setAttribute("readonly", "");
      ta.style.position = "absolute";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`pill-btn share-link-btn${copied ? " copied" : ""}`}
      title="Copy a link to this exact set of inputs"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {copied ? (
          <path d="M20 6L9 17l-5-5" />
        ) : (
          <>
            <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
            <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
          </>
        )}
      </svg>
      {copied ? "Link copied" : "Copy share link"}
    </button>
  );
}
