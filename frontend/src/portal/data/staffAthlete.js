/**
 * Staff booking: one athlete as the staff screens see them (spec
 * 01-spec-admin-booking.md 10.1-10.2) - their pay state, tokens, periods,
 * and bookings grouped this period, next period and later.
 *
 * PURE. Imports from data/staffBooking.js, never the reverse. Task C0
 * fixes the export names Lane E builds on; C1 fills them in. Until then
 * they throw.
 */

const NOT_BUILT = 'staff booking: not built yet';

/** C1: 'no-package' | 'past_due' | 'lapsed' | 'unpaid' | 'paid', in that order. */
export function payStateOf(athlete, household, pkg) {
  throw new Error(NOT_BUILT);
}

/** C1: the athlete model the staff screens and sheets read. */
export function staffAthleteModel({ athlete, household, pkg, bookings, waitlist, graceTokens, sessionsById, tokens, today }) {
  throw new Error(NOT_BUILT);
}
