import { useState } from "react";
import { C } from "../constants/colors.js";

// Copies the current page URL (which includes the full calculator state
// as query params — see lib/shareableState.js) to the clipboard. Brief
// "Link copied" feedback, then reverts. Falls back to a hidden textarea
// + execCommand when the modern Clipboard API is unavailable (insecure
// context, older Safari, etc).
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
      className="num text-xs uppercase"
      style={{
        color: copied ? C.wait : C.inkSoft,
        letterSpacing: "0.18em",
        background: "transparent",
        border: `1px solid ${copied ? C.wait : C.borderDark}`,
        padding: "6px 12px",
        cursor: "pointer",
        transition: "color 150ms, border-color 150ms",
        fontWeight: 500,
      }}
      title="Copy a link to this exact set of inputs"
    >
      {copied ? "Link copied" : "Copy share link"}
    </button>
  );
}
