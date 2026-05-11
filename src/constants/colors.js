// Single source of truth for the calculator's color palette.
// Lives outside any component so it can be imported anywhere without prop
// drilling. The chart conventions:
//   - early        (dark red)    = "claim early" line, also "worse outcome" in tornado
//   - earlySoft    (soft red)    = invested-pot trajectory (dashed)
//   - wait         (dark green)  = "wait until FRA" line, also "better outcome" in tornado
//   - waitInvested (medium green) = "wait + invest the checks" line
//                                   visually related to `wait` but distinct so they
//                                   read as a family
//   - cross        (gold)        = crossover marker
//
// Text-on-background contrast (AA = 4.5:1 for normal text):
//   - ink        on paper/bg → ~14:1   (primary copy)
//   - inkSoft    on paper/bg → ~7:1    (secondary copy)
//   - inkFaint   on paper/bg → ~5.7:1  (small caps labels, hints)
//   - inkOnDark  on ink      → ~7.7:1  (labels on the dark Crossover-age card)
// inkFaint was previously #9A8B72 (~2.9:1) — failed AA, hard to read in dim light.
// inkOnDark was added so the dark card can stay subtle without going below AA.
export const C = {
  bg: "#EFE7D6",
  paper: "#F7F0DE",
  border: "#D9CBAE",
  borderDark: "#A89677",
  ink: "#181410",
  inkSoft: "#5C4F3D",
  inkFaint: "#6B5C44",
  inkOnDark: "#B5A688",
  early: "#A02B2B",
  earlySoft: "#C97070",
  wait: "#1F4D3F",
  waitInvested: "#3F7D5F",
  cross: "#B8860B",
};
