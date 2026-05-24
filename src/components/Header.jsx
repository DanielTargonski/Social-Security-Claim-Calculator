import { C } from "../constants/colors.js";
import Var from "./Var.jsx";

// Top-of-page heading: kicker, title, and lede paragraph. The lede references
// investStopAge so it stays in sync with the user's chosen "stop investing"
// boundary.
export default function Header({ investStopAge }) {
  return (
    <div className="mb-8 md:mb-10">
      <div className="flex items-center gap-3 mb-4">
        <div
          style={{
            width: "48px",
            height: "1px",
            backgroundColor: C.ink,
          }}
        />
        <span
          className="num text-xs uppercase"
          style={{ color: C.inkSoft, letterSpacing: "0.22em" }}
        >
          The Claim Calculator
        </span>
      </div>
      <h1
        className="display leading-[0.95]"
        style={{
          color: C.ink,
          fontSize: "clamp(2.5rem, 7vw, 4.25rem)",
          fontWeight: 300,
          fontVariationSettings: '"SOFT" 50',
        }}
      >
        Take it now,
        <br />
        <span
          style={{
            fontStyle: "italic",
            fontWeight: 400,
            color: C.early,
          }}
        >
          or wait for more.
        </span>
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
