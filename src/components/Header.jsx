import { C } from "../constants/colors.js";
import Var from "./Var.jsx";

// Top-of-page hero: an eyebrow badge, the headline, and a lede paragraph. The
// lede references investStopAge so it stays in sync with the user's chosen
// "stop investing" boundary.
export default function Header({ investStopAge }) {
  return (
    <div className="mb-9 md:mb-12">
      <span
        className="inline-flex items-center gap-2 mb-5"
        style={{
          padding: "5px 12px 5px 10px",
          borderRadius: "var(--radius-pill)",
          background: C.accentSoft,
          color: C.accent,
          fontSize: "11.5px",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: C.accent,
          }}
        />
        The Claim Calculator
      </span>
      <h1
        className="display"
        style={{
          color: C.ink,
          fontSize: "clamp(2.25rem, 5.5vw, 3.6rem)",
          fontWeight: 800,
          lineHeight: 1.02,
          letterSpacing: "-0.035em",
        }}
      >
        Take it now,{" "}
        <span style={{ color: C.accent }}>or wait for more.</span>
      </h1>
      <p
        className="mt-5 text-sm md:text-base leading-relaxed max-w-xl"
        style={{ color: C.inkSoft }}
      >
        A break-even study of Social Security claiming. Each early check after
        taxes and earnings test is invested until <Var>{investStopAge}</Var>.
        After <Var>{investStopAge}</Var> the pot keeps compounding while net
        checks come in as cash to enjoy.
      </p>
    </div>
  );
}
