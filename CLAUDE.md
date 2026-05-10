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
├─ App.jsx                       Top-level orchestrator (~200 lines, just hooks + composition)
├─ App.test.jsx                  Smoke tests (mode switching, white-page regressions)
├─ main.jsx                      Standard Vite entry point
├─ index.css                     Tailwind import + minimal resets
├─ constants/
│  └─ colors.js                  The C palette — single source of truth, imported everywhere
├─ components/
│  ├─ GlobalStyles.jsx           Inline <style> block (Google Fonts, range thumb, .num/.display)
│  ├─ Header.jsx                 Title + lede paragraph
│  ├─ ModeSwitcher.jsx           Three-mode picker + the switch-mode banner
│  ├─ SliderInput.jsx            Click-to-edit slider used by every input
│  ├─ SliderInput.test.jsx       (range/click/edit/clamp/blur/escape behaviors)
│  ├─ InputsPanel.jsx            Benefits + Outlook + Income & Tax sliders
│  ├─ SummaryCards.jsx           Net check at claim age / at 67 / pot-or-crossover
│  ├─ MetadataStrip.jsx          Earnings test, FRA recoup, combined income, taxable SS
│  ├─ ChartCard.jsx              Lifetime-payout chart + 4-stat row
│  ├─ PotTable.jsx               Five-year pot snapshots with phase labels
│  ├─ Footnotes.jsx              Static footnote grid
│  ├─ SensitivityTornado.jsx     "What moves the answer" panel
│  ├─ SensitivityTornado.test.jsx (mode-by-mode + bounds-collapse regression)
│  └─ ModeSwitcher.test.jsx
├─ hooks/
│  └─ useBenefitProjection.js   useMemo wrapper around computeProjection
├─ test/
│  └─ setup.js                  Vitest setup (jsdom: ResizeObserver/matchMedia stubs, RTL cleanup)
└─ lib/
   ├─ ssRules.js                 SSA rules (factors, earnings test, recoup, resolveBenefits)
   ├─ ssRules.test.js
   ├─ taxMath.js                 Federal tax (brackets, taxable-SS tiering)
   ├─ taxMath.test.js
   ├─ chartProjection.js         3-phase pot model (the chart math)
   ├─ chartProjection.test.js
   ├─ benefitMath.js             Slim orchestrator: computeProjection composes the above
   └─ benefitMath.test.js        Integration tests
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
monthsWithheld    = totalDollarsWithheld / earlyMonthlyGross   // capped at total months pre-FRA
effectiveClaimAge = claimAge + monthsWithheld / 12
recoupedFactor    = mode-appropriate factor at the effective claim age
```

**Applies to retirement and survivor modes only.** In switch mode the claimant abandons own retirement at FRA, so the recoup is moot — `computeRecoupedFactor` returns `null`.

### Federal tax on Social Security

Combined-income tier formula (single filer, 2026 thresholds):
- `combinedIncome ≤ $25,000` → 0% of SS taxable
- `≤ $34,000` → up to 50% taxable, scaled
- `> $34,000` → up to 85% taxable

The effective tax rate on SS = `taxableSSPct × marginal_rate`. Standard deduction $16,100 subtracted before bracket lookup. Manual override mode assumes 85% taxable always.

NY/NYC do not tax SS — noted in a footnote, not modeled.

---

## Things explicitly OUT of scope

These are intentional simplifications; don't add them without checking with the user first:

- **Year-of-FRA earnings test exemption** ($65,160 limit, $1-per-$3 ratio) — collapsed into the single $24,480 / $1-per-$2 rule
- **WEP / GPO / family maximum / RIB-LIM** — not relevant when the deceased never claimed (the original use case); RIB-LIM matters when the deceased was already collecting reduced benefits
- **State taxes other than NY/NYC** — noted in footnote
- **IRMAA / Medicare Part B premiums** — mentioned in caveats footnote
- **Sequence-of-returns risk** — uses a single deterministic real return rate
- **Senior bonus deduction** ($6K extra for 65+, MAGI phase-out) — mentioned in caveats
- **COLA / inflation** — calculator is in real (today's) dollars
- **Spousal benefits while spouse is alive, divorced-spouse benefits, child / child-in-care benefits**

---

## Conventions

- **Gender-neutral language** throughout. Use "the claimant", "they/their", or "the surviving spouse" — never "her", "she", "the widow". Tests and code comments included.
- **No emojis** in code, comments, commit messages, or UI text unless the user explicitly asks.
- **Commit messages** are detailed (multi-paragraph with rationale, not just a one-liner). Past commits set the bar — match that style.
- **Click-to-edit on every slider** — the `SliderInput` component supports typing exact values via a number input that appears on click. New inputs should use this pattern.
- **Color palette** lives in a `C` constant inside `App.jsx`. The chart conventions:
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

`npm test` should always pass before committing. **171 tests across 9 files** as of this writing: math tests in `src/lib/` and React render tests in `src/components/` + `src/App.test.jsx`. Vitest defaults to the node environment for speed; component test files opt into jsdom by adding `// @vitest-environment jsdom` as the first line. Add new tests when adding new math (live in the relevant `*.test.js`) or new components (mirror the file as `*.test.jsx`).

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

### Candidate features (from the survey research)
Researched but not built. In rough priority order based on the original analysis:

1. **Trust-fund haircut toggle** *(small, novel — no mainstream calculator has this)* — checkbox + year/% inputs (default 2033/23% per CBO). Tilts every break-even toward claiming earlier, hits surviving-spouse claimants asymmetrically.
2. **RIB-LIM display in survivor mode** *(small, novel)* — shows the 82.5%-of-PIA cap on survivor benefits and how the deceased's early-claiming clipped it. Only relevant when the deceased was already collecting; not relevant for the original use case (deceased never claimed) but matters for other users.
3. **Mortality-weighted lifetime totals** *(medium)* — replace single "live until X" with SSA period-life-table probabilities. Break-even crossover becomes an *expected* age.
4. **Tax-torpedo / provisional-income visualizer** — show effective marginal rate on each extra $1 of wages.
5. **IRMAA tier overlay** at age 63+ with 2-year lookback shaded.
6. **Monte Carlo on the invested pot** — replace single deterministic real return with a P10/P50/P90 distribution.
7. **State tax dropdown** — ~10 states still tax SS in 2026 (CO, CT, MN, MT, NM, RI, UT, VT, WV); only NY/NYC handled now.
8. **Discount rate ≠ investment return** — separate knobs for sophisticated users.

### Possible code-side cleanup
*(The original two — App.jsx split and React render tests — both done; see "Shipped recently" above.)*
- Lazy-load recharts (still ~570KB bundle) with React.lazy + Suspense if bundle size starts to matter.

---

## How to think about changes

- **Math changes**: write the test first (in the appropriate `*.test.js`), watch it fail, implement, watch it pass. The math has invariants (monotonicity, factor bounds, mode-specific recoup rules) — many edge-case tests already exist; adding more is encouraged.
- **UI changes**: actually open the page in a browser before declaring it shipped. `curl` returning HTTP 200 only means the JS *parsed*, not that React *rendered*. Production white-page bugs have happened from skipping this.
- **Personal financial data**: if the user shares real numbers (tax returns, SSA reports, bank statements), keep them in the conversation only. **Do not commit them.** Convert HEIC → JPEG locally, analyze, delete the converted copies.
- **Auto mode**: the user often runs in auto mode. Prefer action over planning, but **never** push destructive changes (force-push, branch deletion, schema migrations) without confirmation. Standard `git push` to `main` is fine for this single-developer project.
