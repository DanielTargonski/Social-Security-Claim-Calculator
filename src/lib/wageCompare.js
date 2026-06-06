// Head-to-head comparison of the SAME claiming decision run at DIFFERENT pre-67
// gross wage levels. Everything else — mode, claim age, benefits, return rate,
// invest-stop age, life expectancy, post-67 wage, taxes, healthcare settings —
// is held fixed; only the pre-FRA wage (`grossIncome`) changes. This answers the
// "should I work less before FRA?" question that the three claiming modes can't,
// because pre-67 wages drive four things at once that pull in opposite
// directions:
//
//   1. EARNINGS TEST  — more wage withholds more of the early SS check now.
//   2. FRA RECOUP     — those withheld months are credited back at FRA, raising
//                       the post-67 check for life (so some of the withholding
//                       comes back).
//   3. FEDERAL TAX    — more wage pushes more of the SS benefit into the taxable
//                       tier.
//   4. HEALTHCARE     — more wage raises MAGI, which can cross the ACA 400% FPL
//                       cliff (pre-65) or an IRMAA tier (65+) and cost
//                       thousands a year.
//
// The naive read ("less wage = less withholding + less tax + less healthcare =
// better") is wrong because it ignores the wages themselves. A fair comparison
// has to net the WAGE TAKE-HOME back in — otherwise dropping to $0 always
// "wins". So each scenario's comparable number is:
//
//   total resources = SS invested-pot-and-cash  (invested per the user's %)
//                   + lifetime wage take-home    (net of fed + state/local tax)
//                   − lifetime healthcare cost   (absolute, ACA + Medicare)
//
// The SS side is run with `coveredElsewhere: true` so its monthly nets carry NO
// healthcare adjustment (computeProjection otherwise bakes in the early-vs-WAIT
// healthcare *delta*, which is the wrong basis for a wage-vs-wage race). We then
// subtract the ABSOLUTE early-claim healthcare cost per scenario instead. Wage
// take-home and healthcare are counted at face value, consistent with how the
// chart already treats Phase-3 cash (not re-grown).

import {
  computeProjection,
  computeTaxableSSPct,
  FRA,
} from "./benefitMath.js";
import {
  computeMagiACA,
  computeMagiIRMAA,
  computeAnnualHealthcareCost,
  nextCliffAbove,
} from "./healthcareCost.js";
import {
  projectStrategy,
  resolveInvestedForCheck,
  STRATEGY_DEFS,
} from "./strategyCompare.js";

// Medicare eligibility starts at 65 — the boundary where the early-claim
// healthcare regime flips from ACA premiums to Medicare/IRMAA. Mirrors the
// private constant in chartProjection.js.
const MEDICARE_AGE = 65;

// Absolute early-claim healthcare cost for one wage level, across the whole
// lifespan, split into the three regimes the calculator already models:
//   ACA           claimAge → 65   (only when claimAge < 65)
//   Medicare 65   65 → FRA        (pre-FRA reduced benefit still in MAGI)
//   Medicare 67+  FRA → life      (recouped benefit + post-67 wage in MAGI)
// Returns the per-regime annual costs AND the lifetime sum (annual × the years
// spent in each regime). Mirrors App.jsx's healthcare snapshot, but for the
// early-claim arm only and integrated over the lifespan rather than at a point.
export function earlyHealthcareForWage({
  grossIncome,
  postFRAGrossIncome,
  claimAge,
  lifeExpectancy,
  annualEarlyGross,
  earningsTestWithholding,
  recoupedAnnualGross,
  coveredElsewhere,
  unsubsidizedSilverAnnual,
}) {
  if (coveredElsewhere) {
    return {
      acaAnnual: 0,
      medicare65Annual: 0,
      medicarePostAnnual: 0,
      lifetime: 0,
      acaYears: 0,
      medicare65Years: 0,
      medicarePostYears: 0,
    };
  }
  // SS the claimant actually receives pre-FRA (SSA-1099 reports benefits PAID,
  // so MAGI only sees the post-earnings-test amount).
  const ssBasisPostET = annualEarlyGross - earningsTestWithholding;

  // ACA window (pre-65). SS is in MAGI only when claiming before 65.
  const magiACA = computeMagiACA({
    grossIncome,
    ssAnnualGross: claimAge < MEDICARE_AGE ? ssBasisPostET : 0,
  });
  const acaAnnual = computeAnnualHealthcareCost({
    age: 62,
    magiACA,
    magiIRMAA: 0,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });

  // Medicare 65 → FRA. Still on the pre-FRA reduced benefit and pre-67 wage.
  const taxableSSPctPre = computeTaxableSSPct({
    ssBasisAnnual: ssBasisPostET,
    grossIncome,
  });
  const magiIRMAA65 = computeMagiIRMAA({
    grossIncome,
    ssAnnualGross: ssBasisPostET,
    taxableSSPct: taxableSSPctPre,
  });
  const medicare65Annual = computeAnnualHealthcareCost({
    age: 65,
    magiACA: 0,
    magiIRMAA: magiIRMAA65,
    mspIncome: grossIncome + ssBasisPostET,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });

  // Medicare FRA → life. Recouped benefit + post-67 wage.
  const taxableSSPctPost = computeTaxableSSPct({
    ssBasisAnnual: recoupedAnnualGross,
    grossIncome: postFRAGrossIncome,
  });
  const magiIRMAAPost = computeMagiIRMAA({
    grossIncome: postFRAGrossIncome,
    ssAnnualGross: recoupedAnnualGross,
    taxableSSPct: taxableSSPctPost,
  });
  const medicarePostAnnual = computeAnnualHealthcareCost({
    age: 67,
    magiACA: 0,
    magiIRMAA: magiIRMAAPost,
    mspIncome: postFRAGrossIncome + recoupedAnnualGross,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });

  const acaYears = Math.max(0, Math.min(MEDICARE_AGE, lifeExpectancy) - claimAge);
  const medicare65Years = Math.max(
    0,
    Math.min(FRA, lifeExpectancy) - Math.max(MEDICARE_AGE, claimAge)
  );
  const medicarePostYears = Math.max(0, lifeExpectancy - Math.max(FRA, claimAge));
  const lifetime =
    acaAnnual * acaYears +
    medicare65Annual * medicare65Years +
    medicarePostAnnual * medicarePostYears;

  return {
    acaAnnual,
    medicare65Annual,
    medicarePostAnnual,
    lifetime,
    acaYears,
    medicare65Years,
    medicarePostYears,
  };
}

// Cumulative early-claim healthcare cost paid from claimAge through `age`, using
// the per-regime annual costs from earlyHealthcareForWage. Used to draw the
// "total resources" chart line (face-value, not grown — same basis as the
// chart's Phase-3 cash).
function cumHealthcareAtAge(age, hc, claimAge) {
  if (age <= claimAge) return 0;
  const acaY = Math.max(0, Math.min(MEDICARE_AGE, age) - claimAge);
  const med65Y = Math.max(0, Math.min(FRA, age) - Math.max(MEDICARE_AGE, claimAge));
  const medPostY = Math.max(0, age - Math.max(FRA, claimAge));
  return (
    hc.acaAnnual * acaY +
    hc.medicare65Annual * med65Y +
    hc.medicarePostAnnual * medPostY
  );
}

// Cumulative wage take-home from claimAge through `age`. Pre-67 wage runs from
// the claim age to FRA; post-67 wage runs from FRA to FRA + postFRAWorkYears.
function cumWageAtAge(age, wageNetPreFRA, wageNetPostFRA, claimAge, postFRAWorkYears) {
  if (age <= claimAge) return 0;
  const preYears = Math.max(0, Math.min(FRA, age) - claimAge);
  const postEnd = FRA + postFRAWorkYears;
  const postYears = Math.max(0, Math.min(postEnd, age) - FRA);
  return wageNetPreFRA * preYears + wageNetPostFRA * postYears;
}

// Run one wage scenario: a clean SS projection (no healthcare delta) at this
// wage, plus the absolute healthcare cost and wage take-home that wage implies.
function projectWage(inputs, wage) {
  const {
    claimAge,
    lifeExpectancy,
    postFRAGrossIncome = 0,
    postFRAWorkYears = 0,
    coveredElsewhere = false,
    unsubsidizedSilverAnnual,
  } = inputs;

  // coveredElsewhere:true → SS monthly nets carry no healthcare adjustment, so
  // finalEarly is pure SS. We add the ABSOLUTE healthcare cost back separately.
  const baseProjInputs = { ...inputs, grossIncome: wage, coveredElsewhere: true };
  let proj = computeProjection(baseProjInputs);

  // Honor the user's $-mode / per-strategy invest exactly as the strategy
  // comparison does, so the wage panel's SS totals share the invest basis used
  // by the rest of the app (StrategyCompare and the BY-WAGE lever) instead of
  // silently always investing the percentage. In pure "%" mode this is a no-op
  // (dollarDriven false → no re-run). Each wage scenario has a different early
  // check, so a fixed dollar resolves to a different percentage per scenario —
  // which is the whole point of $-mode (one dollar, not one fraction). The
  // override is the one for the user's current mode's strategy (own /
  // survivor / switch); null in modes/configs without an override.
  const stratKeyForMode = STRATEGY_DEFS.find((d) => d.mode === inputs.mode)?.key;
  const overrides = inputs.investedEarlyDollarByStrategy || {};
  const resolved = resolveInvestedForCheck({
    check: proj.earlyMonthlyNet,
    investedPct: inputs.investedPct,
    investedEarlyDollar: inputs.investedEarlyDollar,
    override: stratKeyForMode ? overrides[stratKeyForMode] : undefined,
  });
  if (resolved.dollarDriven && proj.earlyMonthlyNet > 0) {
    proj = computeProjection({
      ...baseProjInputs,
      investedPct: resolved.investedPct,
    });
  }

  const ssLifetime = proj.finalEarly;
  const wageNetPreFRA = proj.wageTaxPreFRA.net;
  const wageNetPostFRA = proj.wageTaxPostFRA.net;
  const recoupedAnnualGross = proj.earlyPostFRAMonthlyGross * 12;

  const hc = earlyHealthcareForWage({
    grossIncome: wage,
    postFRAGrossIncome,
    claimAge,
    lifeExpectancy,
    annualEarlyGross: proj.annualEarlyGross,
    earningsTestWithholding: proj.earningsTestWithholding,
    recoupedAnnualGross,
    coveredElsewhere,
    unsubsidizedSilverAnnual,
  });

  const wageLifetime = cumWageAtAge(
    lifeExpectancy,
    wageNetPreFRA,
    wageNetPostFRA,
    claimAge,
    postFRAWorkYears
  );
  const lifetimeTotal = ssLifetime + wageLifetime - hc.lifetime;

  // Per-age "total resources" series for the chart. All scenarios share the
  // same age axis (claimAge / investStopAge / lifeExpectancy / returnRate are
  // fixed), so callers can zip these by index.
  const series = proj.chartData.map((row) => ({
    age: row.age,
    total: Math.round(
      row.early +
        cumWageAtAge(
          row.age,
          wageNetPreFRA,
          wageNetPostFRA,
          claimAge,
          postFRAWorkYears
        ) -
        cumHealthcareAtAge(row.age, hc, claimAge)
    ),
  }));

  // Cliff status in the regime that applies at the claim age (ACA pre-65,
  // Medicare/IRMAA at 65+). The same MAGI assembly the App-level strip uses.
  const ssBasisPostET = proj.annualEarlyGross - proj.earningsTestWithholding;
  const magiACA = computeMagiACA({
    grossIncome: wage,
    ssAnnualGross: claimAge < MEDICARE_AGE ? ssBasisPostET : 0,
  });
  const taxableSSPctPre = computeTaxableSSPct({
    ssBasisAnnual: ssBasisPostET,
    grossIncome: wage,
  });
  const magiIRMAA = computeMagiIRMAA({
    grossIncome: wage,
    ssAnnualGross: ssBasisPostET,
    taxableSSPct: taxableSSPctPre,
  });
  const nextCliff = nextCliffAbove({
    age: claimAge,
    magiACA,
    magiIRMAA,
    mspIncome: wage + ssBasisPostET,
    unsubsidizedAnnual: unsubsidizedSilverAnnual,
    coveredElsewhere,
  });
  const healthcareAnnualNow =
    claimAge < MEDICARE_AGE
      ? hc.acaAnnual
      : claimAge < FRA
      ? hc.medicare65Annual
      : hc.medicarePostAnnual;

  return {
    wage,
    lifetimeTotal,
    ssLifetime,
    wageLifetime,
    healthcareLifetime: hc.lifetime,
    earningsTestWithholding: proj.earningsTestWithholding,
    earlyMonthlyNet: proj.earlyMonthlyNet,
    postFRAMonthlyNet: proj.earlyPostFRAMonthlyNetRetired,
    wageNetAnnual: wageNetPreFRA,
    magiACA,
    healthcareAnnualNow,
    nextCliff,
    series,
  };
}

// Merge every scenario's per-age `total` series onto a single age axis. All
// scenarios share an identical age grid (same claimAge/investStop/life/return),
// so this zips by index off the first scenario's series as the spine.
export function mergeWageSeries(scenarios) {
  if (scenarios.length === 0) return [];
  const spine = scenarios[0].series;
  return spine.map((row, i) => {
    const out = { age: row.age };
    for (const s of scenarios) {
      out[s.key] = s.series[i]?.total ?? null;
    }
    return out;
  });
}

// Run every wage scenario and assemble the comparison. Pure: same inputs in →
// same result out. No React, no DOM.
//
//   inputs          the standard projection inputs (mode, claimAge, benefits,
//                   returnRate, investStopAge, lifeExpectancy, postFRA*, taxes,
//                   coveredElsewhere, unsubsidizedSilverAnnual, invest %s, ...).
//                   `grossIncome` on `inputs` is ignored — each scenario sets
//                   its own wage.
//   wageScenarios   [{ key, wage }] — the wage levels to race. Keys are stable
//                   identifiers the UI maps to labels/colors.
//
// Returns { scenarios, byKey, merged, verdict }.
export function compareWages(inputs, wageScenarios) {
  const scenarios = wageScenarios.map(({ key, wage }) => ({
    key,
    ...projectWage(inputs, wage),
  }));

  const byKey = Object.fromEntries(scenarios.map((s) => [s.key, s]));
  const merged = mergeWageSeries(scenarios);

  // Highest total resources wins. Stable sort preserves input order on ties.
  const ranked = [...scenarios].sort(
    (a, b) => b.lifetimeTotal - a.lifetimeTotal
  );
  const winner = ranked[0];
  const runnerUp = ranked[1] || null;

  // Decompose the winner's lead over the runner-up into its three drivers. By
  // construction dWage + dHealthSaved + dSS === winnerMargin, so the UI can
  // name whichever contributed most to the win.
  const drivers = runnerUp
    ? {
        dWage: winner.wageLifetime - runnerUp.wageLifetime,
        dHealthSaved: runnerUp.healthcareLifetime - winner.healthcareLifetime,
        dSS: winner.ssLifetime - runnerUp.ssLifetime,
      }
    : { dWage: 0, dHealthSaved: 0, dSS: 0 };

  const verdict = {
    winnerKey: winner.key,
    runnerUpKey: runnerUp ? runnerUp.key : null,
    winnerMargin: runnerUp ? winner.lifetimeTotal - runnerUp.lifetimeTotal : 0,
    ranked: ranked.map((s) => s.key),
    drivers,
  };

  // "Marginal work" warning: was the last rung of extra work (up to the winning
  // wage) actually worth it? Non-null only when the keep rate is poor/negative.
  verdict.marginalWork = marginalWorkReturn(
    scenarios,
    verdict,
    inputs.mode,
    inputs.claimAge
  );

  return { scenarios, byKey, merged, verdict };
}

// Keep-rate threshold below which the extra work reads as "barely worth it". A
// single-filer NYC worker keeps roughly 60-70 cents of each gross wage dollar
// after federal + NY/NYC income tax; the earnings test ($0.50 per $1 over the
// limit, only partly recouped — not at all in switch mode), SS taxation, and
// ACA/IRMAA premiums stack on top. 0.40 sits well below the ordinary-tax
// baseline, so firing means the SS/healthcare machinery (not normal tax) is
// eating the work — without crying wolf on routine taxation.
export const POOR_KEEP_RATE = 0.4;
// Below this much extra gross wage, the keep-rate ratio is unstable and the
// stakes are trivial — suppress the POOR warning (NEGATIVE is never suppressed).
export const TINY_STEP_GROSS = 3000;

// "Marginal work" read: of each EXTRA gross wage dollar earned by working up to
// the WINNING wage instead of the next-lower one, how much actually survives to
// lifetime resources after the earnings test, SS taxation, and ACA/IRMAA
// premiums take their cut? Answers the user's question: "am I working a ton more
// for very little — or a loss?".
//
// Headlines exactly one adjacent wage step, chosen to reveal the return on the
// EXTRA work around the best outcome:
//   - If a higher-wage scenario sits ABOVE the winner, working more than the
//     winner's wage does WORSE (the winner has the top lifetime total) — headline
//     that losing step up. This is the NEGATIVE case ("working more loses money"),
//     e.g. at a healthy return where un-withheld lower-wage checks compound past
//     the higher wage. (The into-winner step is always >= 0, so this branch is
//     the only way the negative tier can fire.)
//   - Otherwise the winner IS the highest wage — headline the step UP INTO the
//     winner from the next-lower wage, and warn when its keep rate is poor.
//
// Returns null when there's nothing to warn about — only one distinct wage, no
// pre-67 wage window (claimAge >= FRA), a trivial step (< TINY_STEP_GROSS), or a
// healthy keep rate (>= POOR_KEEP_RATE on a positive step).
//
// Denominator is GROSS extra wages (the felt cost of the work); numerator is the
// extra TOTAL lifetime resources kept. Both summed over the same pre-67 horizon.
// At returnRate > 0 the kept side includes the compounded SS pot while gross is
// face value, so the ratio is CONSERVATIVE (it can only understate the problem)
// — copy says "kept", not "earned".
//
// Driver split reuses the exact decomposition lifetimeTotal is built from
// (lifetimeTotal = ss + wage - healthcare), so the warning can never contradict
// the verdict: dWage + dSS + dHealth === extraResources by construction.
export function marginalWorkReturn(scenarios, verdict, mode, claimAge) {
  const byWage = [...scenarios].sort((a, b) => a.wage - b.wage);
  const w = byWage.findIndex((s) => s.key === verdict.winnerKey);
  if (w < 0) return null;
  const winnerS = byWage[w];

  // Prefer the losing step UP from the winner (a higher wage that does worse);
  // fall back to the step INTO the winner from the next-lower wage.
  let higher = null;
  let lower = null;
  for (let j = w + 1; j < byWage.length; j++) {
    if (byWage[j].wage > winnerS.wage) {
      higher = byWage[j];
      lower = winnerS;
      break;
    }
  }
  if (!higher) {
    for (let j = w - 1; j >= 0; j--) {
      if (byWage[j].wage < winnerS.wage) {
        higher = winnerS;
        lower = byWage[j];
        break;
      }
    }
  }
  if (!higher || !lower) return null; // only one distinct wage

  const preYears = Math.max(0, FRA - claimAge); // only window where the gap exists
  const extraGrossLifetime = (higher.wage - lower.wage) * preYears;
  if (extraGrossLifetime < TINY_STEP_GROSS) return null; // trivial / no pre-67 window

  const extraResources = higher.lifetimeTotal - lower.lifetimeTotal;
  const keepRate = extraResources / extraGrossLifetime;

  // Why the keep rate is what it is (computed for THIS adjacent pair):
  const dWage = higher.wageLifetime - lower.wageLifetime; // extra take-home (> 0)
  const dSS = higher.ssLifetime - lower.ssLifetime; // SS effect (no recoup in switch)
  const dHealth = -(higher.healthcareLifetime - lower.healthcareLifetime); // extra premiums (<= 0 on a cliff cross)
  // Dominant drag = the most negative of the SS / healthcare effects; "tax" when
  // neither Social Security nor premiums are the culprit.
  let dominantDrag;
  if (dHealth < 0 && dHealth <= dSS) dominantDrag = "healthcare";
  else if (dSS < 0) dominantDrag = "ss";
  else dominantDrag = "tax";

  const isNegative = extraResources < 0;
  const isPoor = !isNegative && keepRate < POOR_KEEP_RATE; // trivial steps already filtered above
  if (!isNegative && !isPoor) return null; // healthy keep rate

  return {
    lowerKey: lower.key,
    higherKey: higher.key,
    lowerWage: lower.wage,
    higherWage: higher.wage,
    preYears,
    extraGrossLifetime,
    extraResources,
    keepRate,
    centsKept: Math.round(keepRate * 100),
    clawback: extraGrossLifetime - extraResources,
    dWage,
    dSS,
    dHealth,
    dominantDrag,
    isNegative,
    isPoor,
    tier: isNegative ? "negative" : "poor",
    mode,
  };
}

// Strategy robustness across the wage scenarios: does ONE strategy
// (own->survivor switch vs survivor-early) beat the other at EVERY pre-67 wage
// the user is comparing? Lets the StrategyCompare panel say "the strategy choice
// doesn't depend on how much you work" — or that it flips. Own-only is excluded
// (it's supplementary).
//
// Compared on the SAME basis as the panel's headline verdict — each strategy's
// `projection.finalEarly` via projectStrategy (the exact function compareStrategies
// uses), with the user's real coveredElsewhere and invest resolution. This is
// deliberate: the lever sits in the same card as the verdict, so they MUST agree.
// finalEarly is pure Social Security dollars-in-hand (it excludes wage take-home,
// which is common to both strategies and would otherwise be miscredited when the
// two strategies clamp to different claim ages — survivor 60/61 vs switch's 62
// floor), and it carries the same early-vs-wait healthcare basis the verdict uses.
export function compareStrategiesAcrossWages(inputs, wageScenarios) {
  const survivorDef = STRATEGY_DEFS[0]; // survivor-early
  const switchDef = STRATEGY_DEFS[1]; // own -> survivor switch

  const perWage = wageScenarios.map((ws) => {
    const wageInputs = { ...inputs, grossIncome: ws.wage };
    const survivorTotal = projectStrategy(survivorDef, wageInputs).projection.finalEarly;
    const switchTotal = projectStrategy(switchDef, wageInputs).projection.finalEarly;
    const margin = switchTotal - survivorTotal; // > 0 → switch ahead
    return {
      key: ws.key,
      wage: ws.wage,
      survivorTotal,
      switchTotal,
      winnerKey: margin >= 0 ? "switch" : "survivor",
      margin,
    };
  });

  const winners = new Set(perWage.map((p) => p.winnerKey));
  const allWinner = winners.size === 1 ? [...winners][0] : null;
  const absMargins = perWage.map((p) => Math.abs(p.margin));

  return {
    perWage,
    // 'switch' | 'survivor' when one strategy wins at every wage; null when the
    // winner flips depending on the wage.
    allWinner,
    minMargin: absMargins.length ? Math.min(...absMargins) : 0,
    maxMargin: absMargins.length ? Math.max(...absMargins) : 0,
    wageCount: wageScenarios.length,
  };
}
