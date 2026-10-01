import { bump } from './invalidate';
import {
  ERR,
  LiveDataError,
  assertAthleteBillingActive,
  assertBookingOpen,
  createBooking,
  fetchAthlete,
  fetchBookings,
  fetchPackage,
  fetchSessionsInRange,
} from './live';
import { windowDaysFor } from '../data/packages';
import { addDaysISO, openThrough, windowOpensOn } from '../data/calendar';
import { firstRunningWeek } from '../data/season';
import { isSpecialistType, repeatsWeekly } from '../data/specialists';

/**
 * Repeat weekly, out of hooks/index.js (review 2026-09-30: the file was far
 * past the 500-line rule and every lane collided on it). useBooking's
 * bookRecurring is a one-line wrapper over repeatWeekly below; the seed
 * branch never reaches here.
 */

/**
 * Group-flow membership (Sprint 12 integration): a session the booking,
 * recurrence, coach-day and admin-fill paths may count. Specialist slots
 * live on their own surfaces, and the seed-only adult block (pin J) is
 * display-only - it appears on the month calendar and nowhere else.
 */
export function isGroupBookable(s) {
  return !isSpecialistType(s.type) && s.bookable !== false;
}

/**
 * bookRecurring's per-week outcomes: createBooking's typed refusal of ONE
 * week -> the skip reason the Repeat summary names (anything untyped that
 * is not "already booked" is 'error', with its message - never 'full').
 * The STOP reasons concern the whole family, so the loop rethrows them.
 */
const REPEAT_SKIP_REASON = new Map([
  ['outside-window', 'not open yet'],
  ['no-tokens-left', 'period limit'],
  ['one-per-day', 'one per day'],
  // The session filled after the schedule was read: createBooking refuses it
  // as 'full' and writes nothing - a repeat never asks for a waitlist place.
  ['full', 'full'],
]);
const REPEAT_STOP_REASONS = new Set(['membership-inactive', 'billing-pending', 'booking-not-open']);

/**
 * Recurring booking (owner's ruling, TEAM.md "Recurring booking pins";
 * rewritten 2026-09-30 after "Repeat weekly does nothing"): book the same
 * weekday+time weekly, from the week AFTER `slot` through `untilISO`,
 * never past the athlete's booking window (openThrough - the screen asks
 * for exactly that). Nothing is held beyond it: no standing reservations.
 * Each week is a plain createBooking with the SAME checks a single tap
 * runs - window, Elite's one-a-day, period tokens with waitlist holds and
 * issued grants, grace tokens - so no running tally here can disagree
 * with them. A refusal of one week is a skip with its own reason
 * (REPEAT_SKIP_REASON); one that concerns the whole family (membership
 * paused, payment pending, not open yet) is rethrown. A repeat stays in the
 * slot's own lane (owner 2026-09-30, "yes to phil repeat"): a training block
 * or Tour event repeats within the group flow, a Phil session only onto
 * Phil's sessions, and a Yannick session (Calendly) is refused outright, so
 * the mental frequency knob never applies here.
 *
 * Returns { booked: [{date,id}], skipped: [{date,reason,message?,opensOn?}],
 * windowEnd, next: {date,opensOn} | null } - `next` is the first week past
 * the window that the season runs (closures stepped over) and the day it
 * opens at 7 AM.
 */
export default async function repeatWeekly(identity, slot, { athleteId, untilISO } = {}) {
  if (!identity) {
    throw new LiveDataError(ERR.INVALID, 'bookRecurring() called before booking data loaded.');
  }
  if (!untilISO) {
    throw new LiveDataError(ERR.INVALID, 'bookRecurring() needs { untilISO }.');
  }
  if (!repeatsWeekly(slot.type)) {
    throw new LiveDataError(ERR.INVALID, 'Repeat weekly is not offered for this session.');
  }
  const forAthleteId = identity.role === 'parent' ? athleteId : identity.athleteId;
  if (!forAthleteId) {
    throw new LiveDataError(ERR.INVALID, 'bookRecurring() needs the child - pass { athleteId }.');
  }

  const athlete = await fetchAthlete(forAthleteId);
  const pkg = athlete.packageId ? await fetchPackage(athlete.packageId) : null;
  // Sprint 20 (K03 + spec 4.4/5): the family-wide gates ONCE before any
  // per-week read - paid status and the Oct 10 gate - and the package's
  // booking window as the loop's outer bound.
  assertAthleteBillingActive(athlete);
  assertBookingOpen(pkg);
  const windowDays = windowDaysFor(pkg);
  const windowEnd = openThrough(new Date(), windowDays);
  // Sessions already held are named 'already booked' up front, rather than
  // tripping Elite's one-a-day or a token count inside createBooking first.
  const have = new Set(
    (await fetchBookings(forAthleteId, identity.role === 'parent' ? { householdId: identity.householdId } : {}))
      .filter((b) => b.status !== 'cancelled')
      .map((b) => b.sessionId)
  );

  // Every candidate week's sessions in ONE range query, matched locally —
  // one query per week was ~25 serial round-trips (finding 8a).
  const firstDate = addDaysISO(slot.date, 7);
  const lastDate = untilISO < windowEnd ? untilISO : windowEnd;
  // The slot's own lane: the group flow for a block, Phil's sessions for his.
  const inLane = isSpecialistType(slot.type) ? (s) => s.type === slot.type : isGroupBookable;
  const sessionsByDate = new Map();
  let lastSessionDate = null;
  if (firstDate <= lastDate) {
    for (const s of await fetchSessionsInRange(firstDate, lastDate)) {
      if (!inLane(s)) continue;

      const list = sessionsByDate.get(s.date) ?? [];
      list.push(s);
      sessionsByDate.set(s.date, list);
      if (!lastSessionDate || s.date > lastSessionDate) lastSessionDate = s.date;
    }
  }
  // Stop at the last scheduled session rather than the requested end date:
  // weeks past the end of the schedule are not real skips worth reporting.
  const endDate = lastSessionDate && lastSessionDate < lastDate ? lastSessionDate : lastDate;
  // The first week past the window that the season runs (never a closure:
  // the Christmas break sits right past the Dec 16 window): nothing holds
  // it, so the screen says when it opens instead. null past the season.
  let pastWindow = firstDate;
  while (pastWindow <= windowEnd) pastWindow = addDaysISO(pastWindow, 7);
  const nextDate = firstRunningWeek(pastWindow, slot.time, slot.type);
  const next = nextDate ? { date: nextDate, opensOn: windowOpensOn(nextDate, windowDays) } : null;

  const booked = [];
  const skipped = [];
  try {
    for (let date = firstDate; date <= endDate; date = addDaysISO(date, 7)) {
      const match = (sessionsByDate.get(date) ?? []).find(
        (s) => s.time === slot.time && s.type === slot.type && s.status !== 'cancelled'
      );
      if (!match) {
        skipped.push({ date, reason: 'no session' });
        continue;
      }
      if (have.has(match.id)) {
        skipped.push({ date, reason: 'already booked' });
        continue;
      }
      if ((match.booked ?? 0) >= (match.capacity ?? 0)) {
        skipped.push({ date, reason: 'full' });
        continue;
      }
      try {
        // Every check a single booking runs (no skipCapCheck, K03); silent:
        // one invalidation bump in the finally below instead of a refetch
        // storm per iteration (finding 8b). The window caps this at ~7 weeks.
        // createdVia 'repeat': no per-week notice (functions/index.js).
        // No waitlistIfFull: a week that fills between the pre-check above
        // and the transaction is refused as 'full' (the catch below), with
        // no waitlist place written (audit 2026-09-30).
        await createBooking(
          {
            athleteId: forAthleteId,
            sessionId: match.id,
            date: match.date,
            type: match.type,
            householdId: identity.householdId,
          },
          { silent: true, createdVia: 'repeat' }
        );
        booked.push({ date: match.date, id: match.id });
        have.add(match.id);
      } catch (err) {
        if (REPEAT_STOP_REASONS.has(err?.reason)) throw err;
        const reason =
          REPEAT_SKIP_REASON.get(err?.reason) ?? (/already/i.test(err?.message || '') ? 'already booked' : 'error');
        skipped.push({
          date,
          reason,
          ...(reason === 'not open yet' ? { opensOn: windowOpensOn(date, windowDays) } : {}),
          ...(reason === 'error' ? { message: err?.message || null } : {}),
        });
      }
    }
  } finally {
    // Weeks booked before a family-wide refusal are real bookings too.
    if (booked.length) {
      bump('bookings');
      bump('sessions');
    }
  }
  return { booked, skipped, windowEnd, next };
}
