/**
 * Staff booking hooks and calls (spec 01-spec-admin-booking.md 10.1): the
 * athlete model, one session, one day's bookable sessions, a session's
 * waitlist count, and the add and move calls (staffBookSession and
 * moveBooking's staff mode), with practice-mode simulation.
 *
 * Not re-exported from hooks/index.js: screen tests mock '../hooks' (the
 * hooks/move.js precedent).
 *
 * Task C0 fixes the export names Lane E builds on; C3 fills them in. Until
 * then the hooks report loading and the calls throw.
 */

const NOT_BUILT = 'staff booking: not built yet';
const loading = () => ({ data: null, loading: true, error: null });

/** C3: `{ data: StaffAthleteModel | null, loading, error }` for one athlete, read staff-wide. */
export function useStaffAthlete(athleteId) {
  return loading();
}

/** C3: `{ data: session | null, loading, error }`. */
export function useStaffSession(sessionId) {
  return loading();
}

/** C3: one day's sessions a staff member may book onto. */
export function useStaffDaySessions(dateISO) {
  return loading();
}

/** C3: `{ data: number | null }`, the session's waitlist without the athlete's own entry. */
export function useSessionWaitlistCount(sessionId, { athleteId, enabled } = {}) {
  return loading();
}

/** C3: adds the athlete to the session (staffBookSession), or simulates it in practice mode. */
export function staffBookSession({ athleteId, sessionId, free, allowFull } = {}, { first } = {}) {
  throw new Error(NOT_BUILT);
}

/** C3: moves a booking in staff mode (moveBooking), or simulates it in practice mode. */
export function staffMoveBooking({ bookingId, toSessionId, allowFull } = {}, { first } = {}) {
  throw new Error(NOT_BUILT);
}
