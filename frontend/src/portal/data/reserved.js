/**
 * Handicap-reserved sessions (owner ruling 2026-10-02: "the Tuesday at 3 pm
 * session is supposed to be reserved for under 5 handicaps so 5-0 and any +
 * handicaps"). PURE - the one place the client decides who may book one.
 *
 * The restriction is DATA on the session: sessions/{id}.maxHandicap, an
 * integer stamped by scripts/sync-calendar-sessions.mjs (RESERVED_RULES),
 * never a weekday test in the app. A session with no maxHandicap (absent or
 * null) is open to everyone, exactly as before the field existed.
 *
 * Eligible: the athlete's stored handicap (athletes/{id}.handicap, an integer
 * 0 to 54 or null) is an integer at or under the limit. A plus handicap is
 * entered as 0, which qualifies. No handicap on file is NOT eligible - the
 * academy adds it (hooks/handicap.js). The same for every package.
 *
 * createBooking, the waitlist join and Repeat weekly (hooks/) and every
 * screen read these, so a card can never offer what the write would refuse.
 * firestore.rules' reservedOk() is the server half, on the same two fields.
 */
import { HANDICAP_MAX, HANDICAP_MIN } from './signup';
import { firstName } from './whatsNext';

/** The typed rejection reason a booking, a waitlist join and a repeat week carry. */
export const HANDICAP_RESERVED = 'handicap-reserved';

/** The session's handicap limit: an integer, or null for an open session. */
export function handicapLimitOf(session) {
  const limit = session ? session.maxHandicap : null;
  return Number.isInteger(limit) ? limit : null;
}

/** The athlete's handicap on file: an integer, or null for none. */
export function handicapOf(athlete) {
  const handicap = athlete ? athlete.handicap : null;
  return Number.isInteger(handicap) ? handicap : null;
}

/** True when the session has no limit, or the athlete's handicap is at or under it. */
export function reservedEligible(session, athlete) {
  const limit = handicapLimitOf(session);
  if (limit == null) return true;
  const handicap = handicapOf(athlete);
  return handicap != null && handicap <= limit;
}

/** The short tag every list shows on a reserved block; null on an open one. */
export function reservedTag(session) {
  const limit = handicapLimitOf(session);
  return limit == null ? null : `Handicap ${limit} or better`;
}

/** Why the block cannot be booked, for an athlete over the limit. */
export const RESERVED_LINE = (limit) => `Reserved for handicaps of ${limit} or better.`;

/** Added when the athlete has no handicap on file at all. */
export const NO_HANDICAP_LINE = (first) =>
  `No handicap is on file for ${first || 'this athlete'}. Ask the academy to add it.`;

/**
 * What an athlete who cannot book the session reads: RESERVED_LINE, plus
 * NO_HANDICAP_LINE when none is on file. null when the athlete is eligible.
 */
export function reservedRefusal(session, athlete) {
  if (reservedEligible(session, athlete)) return null;
  const line = RESERVED_LINE(handicapLimitOf(session));
  return handicapOf(athlete) == null ? `${line} ${NO_HANDICAP_LINE(firstName(athlete?.name))}` : line;
}

/** A handicap the academy may store: sign-up's range, or null for none. */
export function handicapValueOk(value) {
  return value === null || (Number.isInteger(value) && value >= HANDICAP_MIN && value <= HANDICAP_MAX);
}
