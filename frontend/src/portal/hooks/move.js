/**
 * Move a booking (spec 2026-11-11 §5): the options the picker lists and the
 * move itself. New code kept out of the grandfathered live.js and index.js
 * (the grace.js / waitlist.js precedent).
 *
 * The picker loads once when it opens (spec §10): every session of the same
 * kind, from today to the end of the athlete's booking window, that the
 * athlete could book right now with this booking given back -
 * data/bookability.js moveTargetOpen, the Book tab's own card rule. The move
 * is one call to the moveBooking callable (plan C2): the server runs every
 * check again in one transaction, so a list that went stale is refused there,
 * never half-done.
 */
import { bump } from './invalidate';
import useSeedResource from './useSeedResource';
import {
  fetchAthlete,
  fetchBookings,
  fetchCurrentUser,
  fetchGraceTokensByAthlete,
  fetchHousehold,
  fetchPackage,
  fetchSessionsInRange,
  isLive,
} from './live';
import { fetchWaitlistByAthlete } from './waitlist';
import { liveTokens } from './index';
import { callMoveBooking } from './callables';
import { academyDateISO, openThrough, parseTimeToMinutes } from '../data/calendar';
import { normalizeAnchorDay, windowMonthsFor } from '../data/packages';
import { capacityFor, dayLabel } from '../data/season';
import { handicapOf } from '../data/reserved';
import { sessionLabel } from '../data/billingHub';
import { moveTargetOpen } from '../data/bookability';

/** Minutes from midnight for sorting; a time that does not read sorts last. */
function startMinutes(time) {
  return parseTimeToMinutes(time) ?? 24 * 60;
}

/** One picker option (plan C5 MoveOption) from a session doc. */
function moveOption(s) {
  const [time, meridiem] = String(s.time ?? '').split(' ');
  return {
    id: s.id,
    date: s.date,
    time,
    meridiem,
    fullTime: s.time ?? '',
    type: s.type,
    name: sessionLabel(s, s.type),
    capacityLabel: capacityFor(s).label,
  };
}

/**
 * The sessions `row` (a My Schedule or Reservations row) could move to,
 * grouped by day: `{ days: [{ iso, label, sessions: [MoveOption] }] }`. A
 * parent reads the row's athlete household-scoped (the rules' list proof),
 * an athlete's own login reads its own. A comp reads no tokens: it stays
 * free wherever it goes.
 */
export async function loadMoveOptions(row, now = new Date()) {
  const profile = await fetchCurrentUser();
  const own = Boolean(profile.athleteId);
  const athleteId = own ? profile.athleteId : row.athleteId;
  const scope = own ? [] : [{ householdId: profile.householdId }];
  const [athlete, bookings, waitlist] = await Promise.all([
    fetchAthlete(athleteId),
    fetchBookings(athleteId, ...scope),
    fetchWaitlistByAthlete(athleteId, ...scope),
  ]);
  const [pkg, household, graceTokens] = await Promise.all([
    athlete.packageId ? fetchPackage(athlete.packageId) : null,
    athlete.householdId ? fetchHousehold(athlete.householdId) : null,
    row.graceTokenId ? fetchGraceTokensByAthlete(athleteId) : [],
  ]);
  const anchorDay = normalizeAnchorDay(household?.periodAnchorDay);
  const today = academyDateISO(now);
  const tokens = row.comp ? null : await liveTokens(athlete, pkg, bookings, anchorDay, today);
  const graceExpiresAt = (graceTokens || []).find((g) => g && g.id === row.graceTokenId)?.expiresAt ?? null;
  const from = { ...row, graceExpiresAt };
  const ctx = {
    from,
    tokens,
    athlete: { name: athlete.name, handicap: handicapOf(athlete) },
    bookedSessionIds: bookings.filter((b) => b && b.status !== 'cancelled').map((b) => b.sessionId),
    waitingSessionIds: (waitlist || []).map((w) => w.sessionId),
    pkg,
    bookings,
    anchorDay,
    now,
  };
  const sessions = (await fetchSessionsInRange(today, openThrough(now, windowMonthsFor(pkg))))
    .filter((s) => moveTargetOpen(s, ctx))
    .sort((a, b) => (a.date === b.date ? startMinutes(a.time) - startMinutes(b.time) : a.date < b.date ? -1 : 1));
  const days = [];
  for (const s of sessions) {
    const last = days[days.length - 1];
    if (last && last.iso === s.date) last.sessions.push(moveOption(s));
    else days.push({ iso: s.date, label: dayLabel(s.date, today), sessions: [moveOption(s)] });
  }
  return { days };
}

/**
 * The picker's options for `row`, loaded once when the sheet opens and again
 * when `reloadKey` changes (a refused move reloads the list). Seed mode has
 * nothing to move to.
 */
export function useMoveOptions(row, reloadKey = 0) {
  const live = isLive();
  return useSeedResource(
    live ? null : { days: [] },
    live ? { source: () => loadMoveOptions(row), deps: ['move-options', row.bookingId, reloadKey] } : undefined
  );
}

/**
 * Move the booking (plan C2). Seed mode echoes and calls nothing; live mode
 * calls the callable once and then refreshes every list that shows bookings
 * or seats. A refusal rejects with the callable's typed error (`reason`).
 */
export async function moveBooking({ bookingId, toSessionId }) {
  if (!isLive()) return { bookingId, toSessionId, simulated: true };
  const result = await callMoveBooking({ bookingId, toSessionId });
  bump('bookings');
  bump('sessions');
  return result;
}
