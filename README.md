# Social Security Claim Calculator

A break-even study of Social Security claiming. Compare claiming early and investing the checks against waiting until full retirement age (67), across three modes — own retirement, survivor benefits, and the widow's own→survivor switch strategy. Models the 2026 earnings test, federal tax tiering on Social Security, the FRA recoup of withheld months, and the NY/NYC state-tax exemption.

## Features

- **Three claiming modes** with mode-aware claim-age bounds (62–70 retirement, 60–67 survivor, 62–66.5 switch)
- **3-phase invested-pot model** — checks are invested through a configurable stop age, then collected as cash; the pot keeps compounding
- **2026 earnings test** with SSA's lumpy month-by-month withholding pattern (not just an averaged annual reduction)
- **FRA recoup** of withheld months — the post-FRA benefit is recomputed at the effective claim age, exactly as SSA does it
- **Federal tax tiering** on Social Security via the combined-income formula (0% / up to 50% / up to 85% taxable)
- **Crossover detection** — the age at which "claim early + invest" surpasses "wait until 67", with the dollar value at that point
- **Sensitivity tornado** showing which input moves the answer the most
- **Sticky summary cards** that follow you as you scroll through the inputs
- **Shareable links** — every input is mirrored into the URL, so any state can be sent as a link

## Stack

- Vite 8 + React 19
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- recharts 3.8 for the lifetime-payout chart
- Vitest 4 + @testing-library/react for unit, integration, and render tests
- Google Fonts: Fraunces (display) + JetBrains Mono (numerals)

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # one-shot Vitest run
npm run lint
```

## Build

```bash
npm run build    # outputs to dist/
npm run preview  # serve the production build locally
```

## Deploy

Wired up for Vercel. Connect the repo on vercel.com → New Project; framework auto-detects via `vercel.json`. No env vars required.

## Author

Built by [Daniel Targonski](https://www.linkedin.com/in/daniel-targonski/) — [GitHub](https://github.com/DanielTargonski).

## Copyright

© 2026 Daniel Targonski. All rights reserved.

This is a personal portfolio project. The source is published here so it can be read for reference — but no license is granted to copy, modify, redistribute, or deploy this code or any derivative work. If you'd like to use any part of it, please reach out first.
