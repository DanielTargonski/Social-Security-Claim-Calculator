import { C } from "../constants/colors.js";

// Single inline <style> block for the calculator. Lives at the App root so
// these classes (.num, .display, .mode-btn, .grain, range-input styling) are
// available everywhere. Google Fonts are imported here too, intentionally —
// keeps the calculator's font assets self-contained.
export default function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=JetBrains+Mono:wght@400;500;600&display=swap');

      .num { font-family: 'JetBrains Mono', monospace; font-feature-settings: "tnum"; }
      .display { font-family: 'Fraunces', serif; font-optical-sizing: auto; }

      body { background: ${C.bg}; }

      input[type="range"] {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 2px;
        background: ${C.borderDark};
        outline: none;
        cursor: pointer;
      }
      input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 22px; height: 22px;
        background: ${C.ink};
        cursor: pointer;
        border-radius: 50%;
        border: 4px solid ${C.bg};
        box-shadow: 0 0 0 1px ${C.ink};
        transition: transform 0.15s ease;
      }
      input[type="range"]::-webkit-slider-thumb:hover { transform: scale(1.15); }
      input[type="range"]::-moz-range-thumb {
        width: 22px; height: 22px;
        background: ${C.ink};
        cursor: pointer;
        border-radius: 50%;
        border: 4px solid ${C.bg};
        box-shadow: 0 0 0 1px ${C.ink};
      }

      .grain {
        position: absolute; inset: 0; pointer-events: none; opacity: 0.4;
        background-image: radial-gradient(${C.borderDark} 0.5px, transparent 0.5px);
        background-size: 3px 3px;
        mix-blend-mode: multiply;
      }

      .mode-btn {
        padding: 8px 16px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.15em;
        font-weight: 500;
        font-family: 'JetBrains Mono', monospace;
        transition: all 0.2s ease;
        background: transparent;
        border: none;
        cursor: pointer;
        color: ${C.ink};
      }
      .mode-btn-active {
        background: ${C.ink};
        color: ${C.bg};
      }

      .section-divider {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: ${C.inkFaint};
        padding-top: 8px;
        padding-bottom: 4px;
        border-bottom: 1px solid ${C.border};
        margin-bottom: 4px;
      }
    `}</style>
  );
}
