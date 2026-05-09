// Single source of truth for the calculator's color palette.
// Lives outside any component so it can be imported anywhere without prop
// drilling. The chart conventions:
//   - early       (dark red)   = "claim early" line, also "worse outcome" in tornado
//   - earlySoft   (soft red)   = invested-pot trajectory (dashed)
//   - wait        (dark green) = "wait until FRA" line, also "better outcome" in tornado
//   - cross       (gold)       = crossover marker
export const C = {
  bg: "#EFE7D6",
  paper: "#F7F0DE",
  border: "#D9CBAE",
  borderDark: "#A89677",
  ink: "#181410",
  inkSoft: "#5C4F3D",
  inkFaint: "#9A8B72",
  early: "#A02B2B",
  earlySoft: "#C97070",
  wait: "#1F4D3F",
  cross: "#B8860B",
};
