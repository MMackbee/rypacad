/**
 * Staff booking (owner 2026-11-13, spec 01-spec-admin-booking.md 10.1): the
 * owner or ops adds, moves or cancels any non-test athlete's booking from
 * the Admin screen, the session roster or the family's staff Billing view.
 *
 * PURE: who may book, the booking fields a roster row carries for the staff
 * sheets, a roster row as the billing hub row the sheets take, and which
 * rows carry Move. No Firebase import - hooks/staffBooking.js makes the
 * calls, and the server (functions/portal/staff-book.js, moveBooking's
 * staff mode) decides every charge, seat and email.
 *
 * Task C0 makes the seams Lane E builds on real. searchAthletes,
 * staffAddFacts and moveChargeKind land in C1; until then they throw.
 *
 * CHANGE ONE, CHANGE BOTH: STAFF_BOOK_ROLES and the server's STAFF_ROLES
 * (functions/portal/staff-cancel-decide.js); staffMovable and the server's
 * staff-mode move refusals (functions/portal/move-staff.js).
 */
import { staffCancellable } from './staffCancel';
import { isSingleTokenId } from './singleToken';

const NOT_BUILT = 'staff booking: not built yet';

/** The roles that may add and move bookings (the roles StaffBillingRoute serves). */
export const STAFF_BOOK_ROLES = ['owner', 'ops'];

/** True for the owner and ops; coaches, specialists, parents and athletes never book here. */
export function staffMayBook(role) {
  return STAFF_BOOK_ROLES.includes(role);
}

/**
 * The booking fields liveSessionAttendance spreads into each roster row
 * (hooks/index.js), so the staff sheets can read a roster row as a billing
 * hub row: whose household, Calendly or not, which kind, which day and
 * period, and how it was paid.
 */
export const STAFF_ROW_FIELDS = ['householdId', 'source', 'type', 'date', 'periodKey', 'chargedFrom', 'comp', 'graceTokenId'];

/** Those fields of one booking doc: `comp` a boolean, the others null when absent. */
export function staffRowFields(booking) {
  const b = booking || {};
  const out = {};
  for (const key of STAFF_ROW_FIELDS) out[key] = key === 'comp' ? b.comp === true : b[key] ?? null;
  return out;
}

/**
 * Whether a billing hub row carries Move: the same test as Cancel - Booked
 * or No-show, not Calendly, not a 1:1 (type 'mental'), the period not over.
 * Its own export so the two can diverge.
 */
export function staffMovable(row, { periodStart = null } = {}) {
  return staffCancellable(row, { periodStart });
}

/**
 * One roster row (a liveSessionAttendance row with staffRowFields spread
 * in) as the billing hub row the sheets take. `session` is the roster's
 * `{ id, date, time, type, label }`; it fills a date or type the row lacks.
 */
export function rosterRowToStaffRow(row, session) {
  const graceTokenId = row.graceTokenId ?? null;
  const comp = row.comp === true;
  return {
    id: row.bookingId,
    kind: 'booking',
    athleteId: row.athleteId,
    householdId: row.householdId ?? null,
    sessionId: session.id,
    date: row.date ?? session.date,
    time: session.time ?? null,
    label: session.label,
    type: row.type ?? session.type,
    status: row.status,
    source: row.source ?? null,
    chargedFrom: row.chargedFrom ?? null,
    comp,
    graceTokenId,
    periodKey: row.periodKey ?? null,
    viaGrace: Boolean(graceTokenId),
    viaSingle: isSingleTokenId(graceTokenId),
    viaComp: comp,
  };
}

/**
 * The roster rows of one household as StaffCancelSheet members, in roster
 * order: `[{ athleteId, name, spent, reserved: [], period: { start: null } }]`.
 * The roster knows no period start; the row's own period decides (staffMovable).
 */
export function rosterMembers(rows, householdId, session) {
  return (rows || [])
    .filter((r) => r && r.householdId === householdId)
    .map((r) => ({ athleteId: r.athleteId, name: r.name, spent: [rosterRowToStaffRow(r, session)], reserved: [], period: { start: null } }));
}

/** C1: the directory's athletes whose name matches every word typed, at most 8. */
export function searchAthletes(directory, query) {
  throw new Error(NOT_BUILT);
}

/** C1: whether a session is offered to the athlete, its warnings and the predicted charge. */
export function staffAddFacts(session, model, now) {
  throw new Error(NOT_BUILT);
}

/** C1: what a move does with the token: elite, free, carry or swap. */
export function moveChargeKind(row, target, model) {
  throw new Error(NOT_BUILT);
}
