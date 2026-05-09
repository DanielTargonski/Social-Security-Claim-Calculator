# Social Security Claim Calculator

A break-even study of Social Security claiming. Lets you compare claiming early and investing the checks vs. waiting until full retirement age (67), with three modes (own retirement, survivor benefits, and the widow's own→survivor switch strategy). Includes the 2026 earnings test, federal tax tiering on Social Security, and the NY/NYC state-tax exemption.

## Stack

- Vite 8 + React 19
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- recharts 3.8 for the lifetime-payout chart
- Google Fonts: Fraunces (display) + JetBrains Mono (numerals)

## Local development

```bash
npm install
npm run dev
```

Dev server runs at http://localhost:5173.

## Build

```bash
npm run build   # outputs to dist/
npm run preview # serve the production build locally
```

## Deploy

Wired up for Vercel. Connect the repo on vercel.com → New Project; framework auto-detects via `vercel.json`. No env vars required.

## Author

Built by [Daniel Targonski](https://www.linkedin.com/in/daniel-targonski/) — [GitHub](https://github.com/DanielTargonski).

## Copyright

© 2026 Daniel Targonski. All rights reserved.

This is a personal portfolio project. The source is published here so it can be read for reference — but no license is granted to copy, modify, redistribute, or deploy this code or any derivative work. If you'd like to use any part of it, please reach out first.
