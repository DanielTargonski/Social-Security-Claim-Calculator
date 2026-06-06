# Social Security Claim Calculator — context for Claude

This file is loaded automatically at the start of each session. It exists so a fresh Claude can pick up the project without the user re-explaining context every time.

---

## What this is

A break-even calculator for Social Security claiming decisions. The thesis: compare claiming early and **investing** the checks against waiting until full retirement age (FRA = 67) to claim a larger benefit. Models three claiming modes, the 2026 earnings test, the FRA recoup of withheld months, and federal tax tiering on Social Security.

Originally built to model a specific real-world scenario (a surviving spouse considering early-claim strategies), but the math is fully general. Production: deployed on Vercel; auto-redeploys on push to `main`. Repo: `https://github.com/DanielTargonski/Social-Security-Claim-Calculator`.

---

## Stack

- **Vite 8** + **React 19** + **Tailwind CSS v4** (via `@tailwindcss/vite` plugin)
- **recharts 3.8** for the lifetime-payout chart
- **Vitest 4** for unit + integration + render tests
- **@testing-library/react 16** + **jsdom 29** + **@testing-library/user-event 14** for React render tests
- Google Fonts: Fraunces (display) + JetBrains Mono (numerals), imported via the `<GlobalStyles>` component (intentional — keeps the calculator's font assets self-contained)

Node 26.1.0 was used locally; Vercel uses Node 22 LTS by default. No version-specific issues so far.

---

## Directory structure

```
src/
├─ App.jsx                       Top-level orchestrator (just hooks + composition)
├─ App.test.jsx                  Smoke tests + URL-hydration round-trip + healthcare-toggle tests
├─ main.jsx                      Standard Vite entry point
├─ index.css                     Tailwind import + minimal resets
├─ constants/
│  └─ colors.js                  The C palette — single source of truth, imported everywhere
├─ components/
│  ├─ GlobalStyles.jsx           Inline <style> block (Google Fonts, range thumb, .num/.display)
│  ├─ Header.jsx                 Title + lede paragraph
│  ├─ ModeSwitcher.jsx           Three-mode picker + the switch-mode banner
│  ├─ ModeSwitcher.test.jsx
│  ├─ TabNav.jsx                 Calculator / "Why this exists" tab strip
│  ├─ TabNav.test.jsx
│  ├─ AboutPage.jsx              Explainer page (worked example, sources)
│  ├─ AboutPage.test.jsx
│  ├─ SliderInput.jsx            Click-to-edit slider used by every input
│  ├─ SliderInput.test.jsx       (range/click/edit/clamp/blur/escape behaviors)
│  ├─ InputsPanel.jsx            Benefits + Outlook + Income & Tax + Healthcare sliders
│  ├─ SummaryCards.jsx           Net check at claim age / at 67 / pot-or-crossover
│  ├─ MetadataStrip.jsx          Earnings test, FRA recoup, taxable SS, healthcare cost + cliff
│  ├─ MetadataStrip.test.jsx     (render gate, recoup rows, healthcare rows, covered-elsewhere)
│  ├─ ChartCard.jsx              Lifetime-payout chart + 4-stat row
│  ├─ PotTable.jsx               Five-year pot snapshots with phase labels
│  ├─ Footnotes.jsx              Static footnote grid
│  ├─ OptimalClaimAge.jsx        Sweep result panel ("the optimal claim age is …")
│  ├─ ShareLinkButton.jsx        Copies window.location.href (state in query params)
│  ├─ SensitivityTornado.jsx     "What moves the answer" panel
│  ├─ SensitivityTornado.test.jsx (mode-by-mode + bounds-collapse regression)
│  ├─ StrategyCompare.jsx        Head-to-head: survivor-early vs own→survivor (vs own-only) + decisiveness chip + by-wage lever
│  ├─ StrategyCompare.test.jsx   (render/verdict/navigation/clamp + decisiveness + by-wage tests)
│  ├─ WageCompare.jsx            Same decision at different pre-67 wages + "marginal work" warning
│  ├─ WageCompare.test.jsx       (render/edit/reset/cliff/marginal-work tests)
│  └─ Var.jsx                    Tiny inline pill for dynamic numbers in prose
├─ hooks/
│  ├─ useBenefitProjection.js   useMemo wrapper around computeProjection
│  ├─ useOptimalClaimAge.js     useMemo wrapper around the claim-age sweep
│  ├─ useStrategyCompare.js     useMemo wrapper around compareStrategies
│  ├─ useWageCompare.js         useMemo wrappers: useWageCompare + useWageRobustness
│  ├─ useFormState.js           Single state bag + auto-generated setX setters
│  ├─ useFormState.test.js
│  └─ useUrlSync.js             Mirror form state into window.location.search
├─ test/
│  └─ setup.js                  Vitest setup (jsdom: ResizeObserver/matchMedia stubs, RTL cleanup)
└─ lib/
   ├─ ssRules.js                 SSA rules (factors, earnings test, recoup, resolveBenefits)
   ├─ ssRules.test.js
   ├─ taxMath.js                 Federal tax (brackets, taxable-SS tiering)
   ├─ taxMath.test.js
   ├─ chartProjection.js         3-phase pot model (the chart math)
   ├─ chartProjection.test.js
   ├─ healthcareCost.js          ACA cliffs (200%/400% FPL) + Medicare IRMAA tiers (OBBBA 2026+)
   ├─ healthcareCost.test.js
   ├─ optimalClaimAge.js         96-step claim-age sweep that finds the peak
   ├─ optimalClaimAge.test.js
   ├─ strategyCompare.js         Runs all 3 strategies on one input set + verdict/crossover/break-even-return/mortality/decisiveness; exports projectStrategy
   ├─ strategyCompare.test.js
   ├─ wageCompare.js             Same decision at different pre-67 wages: totals + marginal-work warning + cross-wage strategy robustness
   ├─ wageCompare.test.js
   ├─ lifeTable.js               Approximate unisex SSA period life table (survival probabilities)
   ├─ lifeTable.test.js
   ├─ shareableState.js          URL ↔ state schema + clamp on hydrate
   ├─ shareableState.test.js
   ├─ modeConfig.js              Per-mode claim-age bounds + snap-on-mode-switch
   ├─ modeConfig.test.js
   ├─ benefitMath.js             Slim orchestrator: computeProjection composes the above
   └─ benefitMath.test.js        Integration tests (now incl. healthcare delta wiring)
```

**App.jsx is now just a composition root** — owns all `useState` calls and the projection hook, then passes derived values down. Each visual section lives in its own file under `src/components/`. The `C` color palette lives in `src/constants/colors.js` and is imported wherever needed (no prop drilling).

---

## The math model — important things to understand

### Three claiming modes

| Mode | What it models |
|---|---|
| `retirement` | Claim own retirement benefit between 62 and 70. Standard own-retirement reduction/credit factor. |
| `survivor` | Claim survivor (spousal) benefit between 60 and 67. 28.5% max reduction at 60, no DRC past FRA. |
| `switch` | Claim own retirement early (62–66.5), invest the checks, switch to 100% survivor benefit at FRA. The "widow's switch" strategy. |

### The 3-phase invested-pot model (in `chartProjection.js`)

```
Phase 1: claimAge → min(FRA, investStopAge)
         contribute earlyMonthlyNet (post-earnings-test, post-tax)

Phase 2: FRA → investStopAge   (only when investStopAge > FRA)
         contribute earlyPostFRAMonthlyNet (post-recoup, post-tax, no ET)

Phase 3: investStopAge → lifeExpectancy
         pot compounds untouched, checks now collected as cash
         (cash rate splits at FRA when investStopAge < FRA)
```

The Phase 3 cash split is subtle and was the source of a real bug — the old code used the post-FRA recouped rate for the entire post-investStopAge window, including pre-FRA stretches where the claimant is still subject to the earnings test. **Always use the early ET-reduced rate before FRA, post-FRA recouped rate after.**

### The FRA recoup

When the earnings test withholds N months of benefit pre-FRA, SSA recomputes the benefit at FRA as if the claimant had claimed N/12 years later — shrinking the early-claiming reduction. The new (higher) rate is paid from FRA onward for life.

```js
// SSA credits a WHOLE reduction-month for any month with full OR partial
// earnings-test withholding (POMS RS 00615.482: "proration of work deductions
// has no effect on the ARF"). Withholding is applied as whole checks per year,
// so credited months/year = ceil(annual withholding / monthly check), <= 12.
creditedMonthsPerYear = min(ceil(earningsTestWithholding / earlyMonthlyGross), 12)
monthsWithheld        = creditedMonthsPerYear * yearsPreFRA
effectiveClaimAge     = claimAge + monthsWithheld / 12
recoupedFactor        = mode-appropriate factor at the effective claim age
```

**Applies to retirement and survivor modes only.** In switch mode the claimant abandons own retirement at FRA, so the recoup is moot — `computeRecoupedFactor` returns `null`.

### Federal tax on Social Security

Combined-income tier formula (single filer, 2026 thresholds):
- `combinedIncome ≤ $25,000` → 0% of SS taxable
- `≤ $34,000` → up to 50% taxable, scaled
- `> $34,000` → up to 85% taxable

The effective tax rate on SS = `taxableSSPct × marginal_rate`. Standard deduction $16,100 subtracted before bracket lookup. Manual override mode assumes 85% taxable always.

NY/NYC do not tax SS — noted in a footnote, not modeled.

### Healthcare cost layer (OBBBA / NYC, 2026+)

Lives in `src/lib/healthcareCost.js`. Post-OBBBA, healthcare cost is a real annual drag on the claim-age decision that the calculator now bakes into the break-even:

- **ACA Premium Tax Credit cliff at 400% FPL** ($62,600 single in 2026, using 2025 FPL per ACA prior-year convention). The IRA-era enhanced PTCs expired Dec 31, 2025 and OBBBA didn't renew them — so $1 over the cliff → lose all subsidies. Default NYC unsubsidized silver = **$9,679/yr** (NY State of Health LCSP, age-neutral via NY's pure community rating, user-overridable). **Single-filer only** — the app models one claimant. `healthcareCost.js`'s FPL helpers (`fplPctOf`, `computeACAAnnualCost`, etc.) still accept a `householdSize` arg (correct: FPL genuinely scales with household size), but nothing in the app passes anything but the single default; that primitive is left in place for a future proper joint-filer addition.
- **NY Essential Plan ceiling drops 250% → 200% FPL effective July 1, 2026** because OBBBA defunded the lawfully-present-immigrant PTC that was financing the 200–250% band. Below 200% FPL: $0 premium. Above 200%, into the subsidized band: capped at **9.96% of MAGI** (simplification of the graduated ~2.1–9.96% scale; 9.96% is the 2026 top-of-band applicable percentage per IRS Rev. Proc. 2025-25, the post-IRA reverted ACA contribution table).
- **Medicare IRMAA tiers at 65+**: standard Part B = $202.90/mo flat. Surcharges stack on top per six MAGI brackets ($109K / $137K / $171K / $205K / $500K thresholds; +$1,148 / +$2,885 / +$4,620 / +$6,355 / +$6,936 annually for tiers 1–5).
- **Two MAGI definitions** because ACA and IRMAA define MAGI differently. ACA counts **100% of gross SS**; IRMAA counts only the taxable portion (reuses `taxMath.computeTaxableSSPct`). Important for not double-counting at age 65+.

How it shifts the chart: `benefitMath.computeProjection` computes the **healthcare-cost differential between early and wait scenarios** in three windows — **pre-65 (ACA)**, **65→FRA (Medicare/IRMAA)**, and **post-FRA (Medicare/IRMAA)** — then subtracts `delta / 12` from the early-claim monthly nets in each. The pre-FRA invested window straddles Medicare eligibility (65) for anyone claiming before 65, so the cost regime switches there: ages claimAge→65 carry the ACA-premium delta (`healthcareDeltaAnnualPre`), ages 65→FRA carry the Medicare/IRMAA delta (`healthcareDeltaAnnualPre65to67`). `buildChartData` takes a separate `earlyMonthlyNet65Plus` and flips to it at age 65 (`MEDICARE_AGE`). When claimAge ≥ 65 the pre-65 and 65→FRA deltas coincide (both Medicare), so the split is a no-op. Both scenarios pay healthcare; what shifts the break-even is the **extra** cost early-claiming imposes by elevating MAGI sooner. The wait curve stays clean as baseline; the early curve drops by the delta; break-even age and lifetime advantage shift accordingly.

**`coveredElsewhere` toggle** short-circuits the whole layer for users with employer coverage, retiree health benefits, VA care, or coverage via a working spouse. Default is `false` (model healthcare). Math layer's `computeProjection` defaults to `true` for backwards compat — old call sites without the new params get zero healthcare drag.

### Senior bonus deduction layer (OBBBA, 2025–2028)

Lives in `src/lib/taxMath.js`. The OBBBA created a temporary $6,000 single-filer / $12,000 joint deduction for taxpayers age 65+ on top of the standard deduction (regardless of whether they itemize). Sunsets Dec 31, 2028 unless Congress extends.

- **Base**: $6,000 (single filer; joint not modeled in this single-filer calculator).
- **Phase-out**: starts at $75K MAGI, fully eliminated at $175K. Reduction = `6% × (MAGI − $75K)`.
- **Years**: tax years 2025 / 2026 / 2027 / 2028. Outside this window → $0 deduction.
- **Eligibility**: must be age 65+ on last day of the tax year.

`computeSeniorDeduction({ age, magi, taxYear })` returns the deduction amount; `computeSSEffectiveTaxRate` accepts an `extraDeduction` parameter that stacks on the standard deduction and reports the resulting `extraDeductionDollarSavings` via a diff of `computeFederalTax2026(taxable-without)` minus `computeFederalTax2026(taxable-with)`. The bracket-walker is exact, so savings stay correct when the deduction straddles a bracket boundary.

In `benefitMath.computeProjection` the deduction is applied per tax window (pre-FRA, post-FRA, retired post-FRA) using the window's representative age and the calendar year `currentYear + (windowStartAge − claimAge)`. Default `currentYear = 2026`. Each window returns its own deduction amount AND its own dollar savings. The lifetime totals (early / wait scenarios) walk every age in the projection and sum the savings for years where the claimant is 65+ AND the calendar year is 2025–2028.

UI surfacing: the "Net check at 67" card in `SummaryCards.jsx` shows the active per-year federal-tax savings plus the lifetime total over the eligible years, sourcing from whichever scenario (early-post-FRA vs wait) corresponds to the displayed check. Card 1 ("Net check at claim age") shows the pre-FRA savings when the claimer is 65 or 66.

Intentional simplifications:
- Only **single-filer** tracking; joint thresholds ($150K/$250K phase-out, $12K base) not exposed.
- Window-anchored calendar year (the same `currentYear + (windowStartAge − claimAge)` value is used for the whole window). Edge years that straddle 2028 → 2029 inside a single window are treated as all-in or all-out based on the start year. Negligible for most use cases.
- No interaction with the **TCJA 65+ additional standard deduction** ($2,050 in 2026); the OBBBA deduction is treated as an `extraDeduction` on top of the base standard deduction, which is the same place the TCJA add-on would go if modeled. Users on the 65+ standard-deduction add-on would slightly under-state their tax bill — fine for sensitivity analysis.

### Wage comparison + decision signals (PR #35)

Lives in `src/lib/wageCompare.js` + `src/components/WageCompare.jsx`, plus strategy-panel signals in `strategyCompare.js` / `StrategyCompare.jsx`.

**Wage comparison panel ("What if you earned less before 67?", shown in every mode).** Runs the SAME claiming decision (mode, claim age, benefits, return, …) at the current pre-67 wage plus two editable alternatives, varying ONLY `grossIncome`. Each scenario's comparable number is **total resources = SS invested-pot-and-cash + wage take-home (after federal + NY/NYC tax) − absolute ACA/Medicare premiums**. Crucially the SS side is run with `coveredElsewhere: true` internally so its monthly nets carry NO healthcare adjustment, and the ABSOLUTE early-claim healthcare cost is subtracted separately (`earlyHealthcareForWage`) — the early-vs-wait *delta* basis that `computeProjection` bakes in is the wrong basis for a wage-vs-wage race. Including wage take-home is load-bearing: without it, dropping wages always looks better. The panel exposes the earnings-test / FRA-recoup / SS-tax / ACA-cliff interplay across wages. Alt wages are session-only (not URL-persisted); the current-wage scenario tracks the live `grossIncome` slider.

**"Marginal work" warning (`marginalWorkReturn` → `verdict.marginalWork`).** Flags when the extra work to reach the winning wage barely pays off ("keeps only N cents of each extra dollar earned", keepRate < `POOR_KEEP_RATE` = 0.40) or LOSES money. Headlines the adjacent wage step that reveals it: the losing step UP from the winner when a higher wage does worse (the only way the `negative` tier can fire — the step INTO the winner is always ≥ 0), else the step into the winner. Denominator = gross extra wages over the pre-67 years; numerator = extra lifetime resources kept (conservative at returnRate > 0, since compounding only inflates the kept side). Driver split `dWage + dSS + dHealth === extraResources` by construction (because `lifetimeTotal = ss + wage − healthcare`), so the warning can't contradict the totals; `dominantDrag` (ss / healthcare / tax) drives the "why" clause. Switch-mode aware (no FRA recoup → "those withheld checks never come back"). Tiny steps (< `TINY_STEP_GROSS` = $3,000) and claimAge ≥ 67 return null.

**Strategy decision signals (in the StrategyCompare panel).**
- **Decisiveness** (`classifyDecisiveness` → `verdict.decisiveness`): `decisive` (no crossover AND winner ≥ 15% ahead — `DECISIVE_RELATIVE_MARGIN`), `close` (the lines cross — longevity-dependent), or `edge` (always ahead, slim margin). Rendered as a status chip + emphasis line, **colored by the actual winner** (red survivor-early / green switch) so a no-brainer reads differently from a toss-up.
- **By-wage robustness** (`compareStrategiesAcrossWages` → `useWageRobustness` → the "BY WAGE" lever): does ONE strategy beat the other at EVERY pre-67 wage being compared, or does it flip? **Computed on the SAME `finalEarly` basis the headline verdict uses** (via the now-exported `projectStrategy`, with the user's real `coveredElsewhere` and invest resolution) — NOT the wage-panel basis. This is load-bearing: an earlier version on the wage-panel basis (SS + wage − absolute healthcare) could render two contradictory sentences in one card (verdict names one winner, lever names another) at survivor claim ages below switch's 62 floor, because wage take-home was miscredited when the two strategies clamped to different claim ages. A regression test pins lever/verdict agreement at the current wage.

Both features were adversarially reviewed (a multi-agent find→verify pass) which confirmed 5 real defects, all fixed — the load-bearing one being the BY WAGE basis mismatch above.

---

## Things explicitly OUT of scope

These are intentional simplifications; don't add them without checking with the user first:

- **Year-of-FRA earnings test exemption** ($65,160 limit, $1-per-$3 ratio) — collapsed into the single $24,480 / $1-per-$2 rule
- **WEP / GPO / family maximum / RIB-LIM** — not relevant when the deceased never claimed (the original use case); RIB-LIM matters when the deceased was already collecting reduced benefits
- **State taxes other than NY/NYC** — noted in footnote
- **Sequence-of-returns risk** — uses a single deterministic real return rate
- **COLA / inflation** — calculator is in real (today's) dollars
- **Spousal benefits while spouse is alive, divorced-spouse benefits, child / child-in-care benefits**
- **IRMAA 2-year MAGI lookback** — current-year MAGI used directly. Real IRMAA at 65 reflects MAGI from 63; over a 20-year break-even horizon the timing offset is noise.
- **ACA PTC graduated contribution scale** (~2.1–9.96% from 100–300% FPL per IRS Rev. Proc. 2025-25, the 2026 indexed table) — collapsed to a single 9.96% cap across the subsidized band, the conservative top-of-scale value. The 200% Essential Plan floor and the 400% cliff are the load-bearing thresholds.
- **Medicaid (asset-tested 65+), Medicare Savings Programs, long-term care eligibility** — different calculator question. Healthcare layer only models ACA pre-65 + Medicare base + IRMAA at 65+.
- **Cost-sharing reductions (CSR) and deductible variance** — healthcare cost modeled as premium-only.

---

## Conventions

- **Gender-neutral language** throughout. Use "the claimant", "they/their", or "the surviving spouse" — never "her", "she", "the widow". Tests and code comments included.
- **No emojis** in code, comments, commit messages, or UI text unless the user explicitly asks.
- **Commit messages** are detailed (multi-paragraph with rationale, not just a one-liner). Past commits set the bar — match that style.
- **Click-to-edit on every slider** — the `SliderInput` component supports typing exact values via a number input that appears on click. New inputs should use this pattern.
- **Color palette** lives in the `C` constant in `src/constants/colors.js` (imported everywhere, no prop drilling; each key resolves to a CSS custom property so light/dark is a pure CSS swap). The chart conventions:
  - Dark red (`C.early`) = "claim early" line, also = "worse outcome" in the tornado
  - Dark green (`C.wait`) = "wait until FRA" line, also = "better outcome" in the tornado
  - Soft red (`C.earlySoft`, dashed) = invested-pot trajectory
- **Conditional copy at returnRate = 0**: "invested pot" labels switch to "set-aside checks" — the math is the same (sum of contributions) but the wording shouldn't lie about whether anything is being invested. Already implemented in chart legend, tooltip, summary card subtitle, and `Total dollars in hand` heading.

---

## Local dev

```bash
npm install              # one-time
npm run dev              # http://localhost:5173/
npm test                 # one-shot Vitest run
npm run test:watch       # TDD mode
npm run build            # vite build → dist/
npm run preview          # serve the production build at :4173
npm run lint             # eslint
```

`npm test` should always pass before committing. **676 tests across 33 files** as of this writing: math tests in `src/lib/`, hook tests in `src/hooks/`, and React render tests in `src/components/` + `src/App.test.jsx`. Vitest defaults to the node environment for speed; component / hook test files opt into jsdom by adding `// @vitest-environment jsdom` as the first line. Add new tests when adding new math (live in the relevant `*.test.js`) or new components (mirror the file as `*.test.jsx`).

`@vitest/coverage-v8` is a dev dependency — `npx vitest run --coverage` prints a per-file table. `coverage/` is gitignored.

---

## Deploy

Connected to Vercel. Push to `main` → Vercel auto-builds and deploys in ~30-60 seconds. `vercel.json` declares the framework as `vite` with `npm run build` / `dist/` outputs and a SPA rewrite to `/index.html`.

The user's git is locally configured to push as `DanielTargonski` (this account owns the GitHub repo). There's also a GitHub MCP server registered that can be used as a fallback when local git auth has issues.

---

## Known constraints

- **Vercel build size warning**: recharts pushes the JS bundle past 500KB. Acceptable for a single-page calculator; could add code-splitting if it becomes an issue.
- **Node 26 deprecation warning** in `npm test` output: `module.register()` deprecation. Cosmetic — Vitest still works.
- **HEIC images** the user occasionally drops into `%TEMP%` need conversion before they can be read (`pillow-heif` is installed in the system Python). Always downscale to ~1100px wide and save as JPEG quality ~78 to fit under the Read tool's 256KB image cap. **Delete converted copies after analysis** — they may contain personal financial info. They live outside the git repo so won't be committed accidentally, but worth cleaning up.

---

## Recent feature work + what's on the candidate list

### Shipped recently
- 3-phase pot model with configurable `investStopAge`
- FRA recoup of earnings-test withholding (real bug previously: footnote claimed it, math ignored it)
- Phase 3 cash-rate split at FRA when `investStopAge < FRA`
- `SensitivityTornado` ("What moves the answer") panel
- Lifetime recoup value display in metadata strip
- Click-to-edit on every slider
- Gender-neutral language sweep
- Math layer split into 4 focused modules + 108 tests
- React UI split: `App.jsx` 1348 → ~200 lines; nine focused components under `src/components/`; 32 render tests via @testing-library/react + jsdom (including a regression for the SensitivityTornado white-page bounds-collapse bug)
- Shareable-state schema in `lib/shareableState.js`; URL ↔ form-state round-trip with `useFormState` + `useUrlSync` + `ShareLinkButton`
- `useFormState` schema-driven auto-generated setters — adding a field is a one-line SCHEMA change
- `modeConfig` hoist (per-mode claim-age bounds + snap-on-mode-switch) — was duplicated in four places
- `OptimalClaimAge` panel + 96-step claim-age sweep
- About / "Why this exists" tab + worked-example explainer
- Test coverage audit + four highest-ROI gap fills: `modeConfig.test.js`, `useFormState.test.js`, `MetadataStrip.test.jsx`, App-level URL hydration round-trip
- **OBBBA healthcare-cost modeling (PR #10)**: `healthcareCost.js` math module pinning 2026 ACA cliffs (400% FPL = $62,600 single, NY Essential Plan 200% post-July 2026) + Medicare IRMAA tiers; new "Healthcare (NYC, 2026+)" section in InputsPanel with `coveredElsewhere` toggle + NYC silver-plan override; `MetadataStrip` cliff-proximity rows ("Next cliff $X away · +$Y/yr if crossed"); chart math subtracts the early-vs-wait healthcare delta so break-even actually shifts; new footnote replaces the old "Medicare Part B premiums" caveat
- Browser-verified via headless Chromium / Playwright (default load, sub-cliff scenario, post-65 IRMAA scenario, covered-elsewhere toggle, URL hydration)
- **Removed the Single/Couple household-size toggle**: it scaled only the healthcare FPL denominator while leaving premiums, IRMAA, and all federal tax math single-filer, producing an incoherent half-couple model (a couple's wait-scenario wage could drop under the doubled 200% Essential Plan floor → $0 ACA baseline → a misleadingly large early-vs-wait delta and crossover swing). Pulled `householdSize`/`hh` out of the schema, UI, App wiring, `benefitMath`, hooks, and components; `healthcareCost.js`'s FPL helpers keep the `householdSize` arg as a primitive for a future proper joint-filer feature.
- **Strategy comparison panel (`StrategyCompare`)**: answers the surviving-spouse question the three separate modes couldn't on their own — "is own→survivor better or *worse* than claiming survivor early?". Pure `lib/strategyCompare.js` runs all three strategies (survivor-early / own→survivor switch / own-only) through the SAME `computeProjection` on one input set, so the numbers are guaranteed consistent across what were previously three modes the user had to flip between. Scores each by total dollars in hand at lifeExpectancy (`finalEarly`); survivor & switch share `fraBenefit`=survivor benefit so they're directly comparable, own-only reinterprets with `fraBenefit`=`ownBenefit`. Each strategy clamps to its own mode's claim-age range (recorded so the UI annotates "claims at 62, its limit"). Surfaces a verdict ("X comes out ahead by $Y by age 85"), a head-to-head crossover age (`findSeriesCrossover` on a merged `early`-series — no mode guards, unlike `chartProjection.findCrossoverAge`), and a two-line overlay chart. Shown only in survivor-context modes (survivor/switch); each card click navigates into that mode. Side effect: the own-benefit slider now shows in **survivor** mode too (was switch-only). Key insight surfaced, not hidden: at high real returns claiming the *larger* survivor check early and investing it can beat the switch even at long life (the calculator's core thesis), while the switch's bigger guaranteed post-67 benefit wins when returns are flat — the verdict moves with the assumptions. Browser-verified (verdict flips ret 7%→0%, crossover marker, card-click navigation, survivor-mode own slider).
  - **Dollar-mode early invest**: when the "Invest % of early-claim checks" slider is in its **$** entry mode, the user means a fixed *dollar* amount, but each scenario's early check differs — so a single fixed *percentage* would invest different dollars per calc. `compareStrategies` reads `inputs.investedEarlyDollar` (the entered monthly dollar = investedPct% × the current mode's net check) and invests THAT dollar in every scenario, capped at each scenario's own check ("whole check" when smaller). Implemented by re-running each scenario's `computeProjection` with a per-scenario `investedPct = min(dollar, check)/check` (investedPct doesn't affect `earlyMonthlyNet`, so the first projection sizes the fraction). Required lifting the early-invest entry-unit state (`investedPctEarlyMode`) from `InputsPanel` up to `App` (it's session-only, not URL-persisted — the stored value stays a percentage). The wait-invest unit stays local (the comparison uses only the `early` lines). Cards show "investing $X/mo" per scenario in this mode. Percentage mode is unchanged (`investedEarlyDollar` null → one fixed fraction everywhere).
  - **Per-strategy invest overrides (decoupled comparison)**: the single early-invest slider can only set ONE figure for every scenario — so a user who wanted to race "$500/mo invested on survivor-early vs $250/mo on own→survivor" (different bets, not the same dollar) couldn't. `StrategyCompare` now renders an "Invested monthly · per strategy" control block above the verdict with a click-to-edit dollar field per strategy (survivor / switch / own). Each edit sets one of three `investSurvivor`/`investSwitch`/`investOwn` schema fields (−1 = "follow slider"); App derives a memoized `compareInvest` map from them, passed to `compareStrategies` as `inputs.investedEarlyDollarByStrategy`. Per-strategy resolution precedence: **override → global `investedEarlyDollar` ($-mode) → `investedPct` (%-mode)**, each capped at that scenario's check. The shared resolution lives in `projectStrategy(def, inputs)` (extracted so the break-even sweep reuses it). Fields default to (and re-derive from) `strategy.investedMonthly`, reported in **every** mode (= dollars actually invested post-cap), plus `investedAtCheckCap` and `investedOverridden` flags. A "↺ reset to slider" link clears all overrides. Back-compat field `investedEarlyDollarApplied` kept (non-null only when a dollar drove it). Cards echo "investing $X/mo · whole check · custom". Browser-verified: $250 on one strategy leaves the other at $500 (the coupling is gone), verdict/chart/crossover recompute, reset restores slider defaults, no console errors.
  - **Verdict levers + legend + mortality + shareable comparison (the comparison-improvement batch)**: four follow-ups to the comparison panel.
    1. **Break-even return rate** (`findBreakEvenReturn` in `strategyCompare.js`): sweeps real return 0→12% (0.5% steps, linear-interpolated flip), using the same `projectStrategy` resolution as the live numbers, to find where the primary verdict (own→survivor vs survivor-early) flips. Surfaced as the "RETURNS" lever line: "Below ~X% real return, {winner} wins; above it, {other} pulls ahead." Returns `{ rate, lowWinner, highWinner }` on `verdict.breakEvenReturn` (rate null when one side leads throughout).
    2. **Mortality weighting** (`lib/lifeTable.js`): approximate unisex SSA-2021 period life table (lx anchors 60–100, linear interpolation, `survivalProbability(from,to)`). The verdict reports `crossoverSurvivalProb` = P(live from the survivor claim age `conditioningAge` to the crossover) and surfaces it as the "LONGEVITY" lever: "About P% chance of living from 62 to the 76 yr 7 mo crossover (SSA period life table) — past it, the switch comes out ahead." Null when the lines never cross. Gender-neutral by design (unisex blend); documented as approximate, period-not-cohort, not actuarial.
    3. **Chart legend** (#7): a 2-chip legend (red "Survivor early" / green "Own → Survivor") above the head-to-head chart — the two plotted lines; own-only stays a supplementary card, not plotted.
    4. **Shareable comparison config** (#6): the per-strategy invest overrides moved from session-only state into the `shareableState` SCHEMA (`cisv`/`cisw`/`ciso`, −1 sentinel), so a link reproduces the exact head-to-head the sender set up. Round-trips through `useFormState`/`useUrlSync`/`getInitialStateFromUrl` like every other field. Browser-verified via a crafted `?…&cisv=500&cisw=250` link hydrating the fields and both lever sentences rendering correctly.
- **Pre-67 wage comparison + decision signals (PR #35)**: new `WageCompare` panel (every mode) races the same claiming decision at the current pre-67 wage vs two editable alternatives, netting SS + wage take-home − absolute healthcare into one comparable total; a "marginal work" warning flags when extra work keeps only a few cents per dollar (or loses money), switch- and cliff-aware. Plus two `StrategyCompare` signals: a **decisiveness chip** (clear winner vs longevity-dependent close call, colored by the winner) and a **"BY WAGE" robustness lever** (does one strategy win at every wage — computed on the same `finalEarly` basis as the verdict via the now-exported `projectStrategy`, so the two can't contradict). Adversarially reviewed (multi-agent find→verify); 5 confirmed findings fixed, notably a BY-WAGE-vs-verdict basis contradiction at survivor claim ages below 62. 676 tests, lint, build, browser-verified across all signal tiers. Full mechanics under "Wage comparison + decision signals" in the math model section above.

### Candidate features (from the survey research)
Researched but not built. In rough priority order based on the original analysis:

1. **Trust-fund haircut toggle** *(small, novel — no mainstream calculator has this)* — checkbox + year/% inputs (default 2033/23% per CBO). Tilts every break-even toward claiming earlier, hits surviving-spouse claimants asymmetrically.
2. **RIB-LIM display in survivor mode** *(small, novel)* — shows the 82.5%-of-PIA cap on survivor benefits and how the deceased's early-claiming clipped it. Only relevant when the deceased was already collecting; not relevant for the original use case (deceased never claimed) but matters for other users.
3. **Mortality-weighted lifetime totals** *(medium)* — replace single "live until X" with SSA period-life-table probabilities. *Partially shipped*: the strategy-comparison panel's "LONGEVITY" lever now reports P(live to the crossover) via `lib/lifeTable.js` (see "Shipped recently"). What remains is probability-weighting the **lifetime totals themselves** (integrate each age's outcome over the survival curve) so the headline numbers and the main chart become expected values, not point-in-time-at-lifeExpectancy.
4. **Tax-torpedo / provisional-income visualizer** — show effective marginal rate on each extra $1 of wages. *Partially shipped*: the wage panel's "marginal work" warning (PR #35) now reports the lifetime keep-rate (cents kept per extra pre-67 wage dollar, netting the earnings test + SS taxation + ACA/IRMAA) across the compared wage scenarios. What remains is a true per-$1 provisional-income curve.
5. **Monte Carlo on the invested pot** — replace single deterministic real return with a P10/P50/P90 distribution.
6. **State tax dropdown** — ~10 states still tax SS in 2026 (CO, CT, MN, MT, NM, RI, UT, VT, WV); only NY/NYC handled now.
7. **Discount rate ≠ investment return** — separate knobs for sophisticated users.

Healthcare-related follow-ups (the OBBBA work above keeps these simple by design):
- **Per-age healthcare cost in the chart** (uses one snapshot per cost regime rather than a true per-age curve). *The ACA→Medicare step at 65 is now handled*: the pre-FRA window splits at 65 into an ACA delta (claimAge→65) and a Medicare/IRMAA delta (65→FRA), so ages 65–66 inside the pre-FRA window are no longer mispriced as ACA (see `healthcareDeltaAnnualPre65to67` + `earlyMonthlyNet65Plus`). What remains is fully per-age pricing (each year's own MAGI), which would also smooth IRMAA-tier crossings as the recouped benefit and wages drift year to year.
- **IRMAA 2-year MAGI lookback** (currently uses current-year MAGI — small accuracy gain, modest complexity cost).
- **Proper joint-filer / couples model** — the old Single/Couple toggle was removed (see "Shipped recently") because it only scaled the healthcare FPL denominator and left premiums/IRMAA/taxes single-filer. A real joint-filer addition would switch federal tax brackets, standard deduction, SS-taxation thresholds, and the senior-bonus deduction to MFJ; double ACA premiums; use MFJ IRMAA brackets; and ideally handle split ages (one on Medicare, one on ACA). `healthcareCost.js` already carries the household-size-aware FPL primitive to build on.

### Possible code-side cleanup
*(The original two — App.jsx split and React render tests — both done; see "Shipped recently" above.)*
- Lazy-load recharts (now ~623KB bundle) with React.lazy + Suspense if bundle size starts to matter.
- `ChartCard.jsx` (16% coverage) and `ShareLinkButton.jsx` (16% coverage) are the two largest remaining test gaps. Recharts under jsdom is brittle so ChartCard is intentionally low priority; ShareLinkButton would be a 10-line clipboard mock.

---

## How to think about changes

- **Math changes**: write the test first (in the appropriate `*.test.js`), watch it fail, implement, watch it pass. The math has invariants (monotonicity, factor bounds, mode-specific recoup rules) — many edge-case tests already exist; adding more is encouraged.
- **UI changes**: actually open the page in a browser before declaring it shipped. `curl` returning HTTP 200 only means the JS *parsed*, not that React *rendered*. Production white-page bugs have happened from skipping this. Playwright + the preinstalled Chromium under `/opt/pw-browsers` works for headless smoke-testing if no GUI is available (see PR #10 notes for the pattern).
- **Adding a new form field**: it's a one-line addition to `SCHEMA` in `lib/shareableState.js`. `useFormState` auto-generates the `setX` setter, `useUrlSync` round-trips it through the URL, and `getInitialStateFromUrl` hydrates it on mount. Don't add a separate `useState` in App.jsx.
- **Adding new annual-cost dimensions**: model them as pure tier-table-driven modules in `src/lib/` (see `taxMath.js` and `healthcareCost.js` for the pattern). Surface in `MetadataStrip` for visibility; subtract from monthly nets in `benefitMath.computeProjection` if they should shift the break-even.
- **Personal financial data**: if the user shares real numbers (tax returns, SSA reports, bank statements), keep them in the conversation only. **Do not commit them.** Convert HEIC → JPEG locally, analyze, delete the converted copies.
- **Auto mode**: the user often runs in auto mode. Prefer action over planning, but **never** push destructive changes (force-push, branch deletion, schema migrations) without confirmation. Standard `git push` to `main` is fine for this single-developer project.
- **PR size**: PR #10 bundled the test-coverage audit + the OBBBA healthcare feature together — the user flagged this as too big. Split unrelated work into separate PRs going forward, even when they sit on the same branch chronologically.
