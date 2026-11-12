import { nextPeriodHeld, nextPeriodOpen } from '../components/AllowancePools';
import { positionForDate } from './packages';
import { afterSeasonEnd } from './season';

/**
 * The months ('yyyy-MM', in order) among `days` whose mental game cap is
 * booked (`capReachedOn`), inside the season - the run capOpensCopy walks
 * past to name the next session's 1st. PURE.
 */
export function cappedMonths(days, capReachedOn) {
  const months = [];
  for (const d of days || []) {
    const month = d.date.slice(0, 7);
    if (!afterSeasonEnd(d.date) && !months.includes(month) && capReachedOn(d.date)) months.push(month);
  }
  return months;
}

/**
 * Where a Calendly time can go (review 2026-11-04). Calendly takes any date,
 * so the panel judges every day in reach as the in-app list judges one: its
 * month's mental game cap (`capReachedOn`, K04) and a token for that date
 * (`tokensSpentOn`: positionForDate, the next period's own count) - and only
 * inside the season (afterSeasonEnd: in February the window runs to Mar 31,
 * and nothing runs after Feb 27). PURE.
 *   openDay     the first day a time can go on, or null
 *   capOpenDay  the first day whose month's cap is free, tokens aside, or null
 *   capMonths   the booked months (cappedMonths)
 * Null with no in-season day in hand: the gate then judges today alone.
 */
export function calendlyReach(days, { capReachedOn, tokensSpentOn }) {
  const inSeason = (days || []).filter((d) => !afterSeasonEnd(d.date));
  if (!inSeason.length) return null;
  const capOpen = inSeason.filter((d) => !capReachedOn(d.date));
  return {
    openDay: capOpen.find((d) => !tokensSpentOn(d.date)) ?? null,
    capOpenDay: capOpen[0] ?? null,
    capMonths: cappedMonths(inSeason, capReachedOn),
  };
}

/**
 * This period spent: the single token's reason, the next period counted but
 * not open until 7 AM on its 1st ('next-period-not-open'), or none left.
 */
function spentReason(tokens, now) {
  if (tokens.perPurchase) return 'no-session-token';
  return nextPeriodHeld(tokens) && !nextPeriodOpen(tokens, now) ? 'next-period-not-open' : 'no-tokens-left';
}

/**
 * Why the Calendly button is hidden (spec 6.1: paid, open, a token left or
 * Elite, cadence not hit), or null. PURE. A single-token athlete with none
 * left is told to buy one ('no-session-token').
 *
 * With a `reach` (calendlyReach, the days in hand) the button stands while
 * any day in it is open. Otherwise: every month's cap booked ('cap-reached');
 * the first month with its cap free lies in the next period, and that is
 * spent ('next-period-spent'); else this period's own token reason.
 *
 * Without one, today's month (`capReached`) and this period's tokens - with
 * this period spent and the next one holding tokens the button stays
 * (2026-11-01: the webhook charges the slot's own period), but only once
 * that period is open for booking, from 7 AM Chicago on its 1st (review
 * 2026-11-04, AllowancePools nextPeriodOpen); before then
 * 'next-period-not-open'.
 */
export function calendlyBlockReason({ billingStatus, bookingOpen, tokens, capReached, reach = null, now = new Date() }) {
  const billing = billingStatus ?? 'active';
  if (billing === 'pending') return 'billing-pending';
  if (billing !== 'active') return 'membership-inactive';
  if (!bookingOpen) return 'booking-not-open';
  if (reach) {
    if (reach.openDay) return null;
    if (!reach.capOpenDay) return 'cap-reached';
    const position = positionForDate(tokens, reach.capOpenDay.date);
    if (position && position.judgedPeriodKey) return 'next-period-spent';
    return tokens ? spentReason(tokens, now) : null;
  }
  if (capReached) return 'cap-reached';
  if (tokens && !tokens.unlimited && tokens.left === 0 && !(tokens.grace && tokens.grace.length)) {
    return nextPeriodOpen(tokens, now) ? null : spentReason(tokens, now);
  }
  return null;
}

/** Whose name/email Calendly prefills: the person walking in (contract 3.4). */
export function attendeeContact({ attendee, athlete, guardian }) {
  if (attendee === 'parent') return { name: guardian?.name ?? '', email: guardian?.email ?? '' };
  return { name: athlete?.name ?? '', email: athlete?.loginEmail || guardian?.email || '' };
}
