// "Your Social Security as a pot" — the bond behind the check.
//
// Social Security works like an inflation-protected bond you hold but never
// see: it pays an income (the monthly check), the government raises that
// income with inflation every year, and the principal never runs down. This
// module sizes that bond: the principal that, at a given REAL yield, pays the
// check as its income. Because the calculator works in real (today's)
// dollars, an inflation-adjusted check is a constant real coupon, so the pot
// is a perpetuity:
//
//   pot = annual check / real yield
//
// Each claiming choice holds a different bond. Claiming early starts the
// income sooner from a smaller pot; waiting until FRA gives up the checks in
// between in exchange for a bigger pot from FRA on. Both are compared at
// max(claimAge, FRA), the first age at which both choices are paying.
//
// Checks are GROSS (before tax) and pre-FRA early checks are after
// earnings-test withholding, averaged across the year (the same basis as
// earlyMonthlyAfterET in benefitMath). The FRA recoup is already inside
// earlyPostFRAMonthly; in switch mode that is the survivor benefit.

import { FRA } from "./ssRules.js";

// The principal that pays `monthly` as its income at `bondYield` real % a year.
export function bondPot(monthly, bondYield) {
  return (monthly * 12) / (bondYield / 100);
}

// Inputs (monthly gross dollars):
//   earlyPreFRAMonthly   early-claim check from claimAge to FRA (post-ET)
//   earlyPostFRAMonthly  early-claim check from max(claimAge, FRA) on
//   waitMonthly          the check when claiming at FRA
export function computeSSPot({
  claimAge,
  bondYield,
  earlyPreFRAMonthly,
  earlyPostFRAMonthly,
  waitMonthly,
}) {
  const claimsBeforeFRA = claimAge < FRA;
  const firstMonthly = claimsBeforeFRA ? earlyPreFRAMonthly : earlyPostFRAMonthly;

  // Whoever claims later gives up the earlier claimer's checks in between.
  const gapMonths = Math.round(Math.abs(claimAge - FRA) * 12);
  const forgoneChecks =
    gapMonths * (claimsBeforeFRA ? earlyPreFRAMonthly : waitMonthly);

  const earlyPot = bondPot(earlyPostFRAMonthly, bondYield);
  const waitPot = bondPot(waitMonthly, bondYield);
  return {
    compareAge: Math.max(claimAge, FRA),
    early: {
      firstMonthly,
      firstPot: bondPot(firstMonthly, bondYield),
      monthly: earlyPostFRAMonthly,
      pot: earlyPot,
    },
    wait: { monthly: waitMonthly, pot: waitPot },
    potGap: earlyPot - waitPot,
    forgoneChecks,
  };
}
