/**
 * Staff booking copy (spec 01-spec-admin-booking.md 10.2-10.5): every word
 * of the staff booking screens and sheets, the refusal map and the refusal
 * kinds. PURE.
 *
 * Task C0 makes the row-action and entry-point words real, because Lane E's
 * own markup reads them. C2 fills in the rest: until then the constants
 * below are '' and the functions throw.
 *
 * Copy rules: "Tour event", never "tournament"; Elite copy never mentions
 * tokens; Free copy never promises a token back.
 */

const NOT_BUILT = 'staff booking: not built yet';
const notBuilt = () => {
  throw new Error(NOT_BUILT);
};

// ---- Real in C0 -----------------------------------------------------------

/** The row buttons (StaffRowActions). */
export const MOVE_LABEL = 'Move';
export const CANCEL_LABEL = 'Cancel';

/** The staff Billing view's and the athlete screen's add button. */
export const BOOK_A_SESSION = 'Book a session';

/** The roster's add button, beside Cancel session. */
export const ADD_ATHLETE = 'Add athlete';

/**
 * Move's accessible name, so brothers' and sisters' buttons differ for a
 * screen reader: "Move Jordan's Tue, Nov 10 Training block" with a row
 * label, "Move Jordan" without one, "Move Tue, Nov 10 Training block"
 * without a first name.
 */
export function moveAria(first, rowLabel = null) {
  if (rowLabel) return first ? `Move ${first}'s ${rowLabel}` : `Move ${rowLabel}`;
  return first ? `Move ${first}` : MOVE_LABEL;
}

/**
 * Cancel's accessible name: with a row label it is the Billing Cancel's
 * label byte for byte ("Cancel Jordan's Tue, Nov 10 Training block");
 * without one, "Cancel Jordan's booking".
 */
export function cancelAria(first, rowLabel = null) {
  if (rowLabel) return first ? `Cancel ${first}'s ${rowLabel}` : `Cancel ${rowLabel}`;
  return first ? `Cancel ${first}'s booking` : `${CANCEL_LABEL} booking`;
}

/** Shown instead of Book a session for a test athlete or household. */
export function testAthleteLine(first) {
  return `${first} is a test athlete. Test athletes can't be booked onto real sessions.`;
}

// ---- C2: constants ('' until then) ---------------------------------------

export const MANAGE_BOOKINGS_LABEL = '';
export const MANAGE_BOOKINGS_BODY = '';
export const FIND_ATHLETE_LABEL = '';
export const FIND_ATHLETE_PLACEHOLDER = '';
export const TEST_BADGE = '';
export const ATHLETES_LOAD_FAILED = '';
export const BACK_TO_ADMIN = '';
export const STAFF_VIEW_LABEL = '';
export const FAMILY_BILLING = '';
export const LATER_LABEL = '';
export const NOTHING_BOOKED = '';
export const CANCEL_IN_CALENDLY = '';
export const ATHLETE_NOT_ON_FILE = '';
export const DAY_LABEL = '';
export const PREV_DAY = '';
export const NEXT_DAY = '';
export const CLOSE = '';
export const STARTED_TAG = '';
export const WAITLISTED_TAG = '';
export const BOOKED_TAG = '';
export const FINDING_SESSIONS = '';
export const SESSIONS_LOAD_FAILED = '';
export const ON_THIS_SESSION = '';
export const FREE_LABEL = '';
export const BACK = '';
export const KEEP_IT = '';
export const STAFF_CHANGE_UNCONFIRMED = '';

// ---- C2: functions (throw until then) -------------------------------------

/** 'No athlete matches "zz".' */
export function noAthleteMatches(query) {
  return notBuilt();
}

/** 'Whitfield family · 6 tokens' */
export function athleteSubline(householdName, packageName) {
  return notBuilt();
}

/** The athlete screen's token line. */
export function tokenLine(model) {
  return notBuilt();
}

/** 'This period · Nov 1 - Nov 30' / 'Next period · Dec 1 - Dec 31' */
export function groupLabel(which, { start, end } = {}) {
  return notBuilt();
}

/** 'Tue Nov 17 · 4:00 PM' */
export function rowWhen(date, time) {
  return notBuilt();
}

/** '9 left' / 'Full · 14 of 14' */
export function seatsPill(facts) {
  return notBuilt();
}

/** 'Reserved 5 or better' */
export function reservedTagLine(limit) {
  return notBuilt();
}

/** 'No sessions to book on Tue Nov 17.' */
export function noSessionsOn(date) {
  return notBuilt();
}

/** 'Add an athlete to Training block, Tue Nov 17, 4:00 PM' */
export function athletePickerTitle(label, date, time) {
  return notBuilt();
}

/** The add sheet's title, or the full question. */
export function addTitle(first, facts) {
  return notBuilt();
}

/** 'Jordan Whitfield · Tue Nov 17, 4:00 PM · Training block' */
export function addSummary(name, date, time, label) {
  return notBuilt();
}

/** The add sheet's one charge line. */
export function chargeLine(first, charge, { freeOn } = {}) {
  return notBuilt();
}

/** One warning's line. */
export function warningLine(first, warning) {
  return notBuilt();
}

/** '3 on the waitlist for this session.' */
export function waitlistCountLine(n) {
  return notBuilt();
}

/** 'Add Jordan' / 'Add Jordan free' / 'Add anyway' / 'Adding...' */
export function addConfirmLabel(first, { free, full, busy } = {}) {
  return notBuilt();
}

/** 'Move Jordan to another Training block' */
export function staffMoveTitle(first, type) {
  return notBuilt();
}

/** The move sheet's question, or the full question. */
export function staffMoveQuestion(first, from, to, { full, taken, capacity } = {}) {
  return notBuilt();
}

/** What a move does with the token; null for Elite. */
export function moveChargeLine(charge) {
  return notBuilt();
}

/** 'Move' / 'Move anyway' / 'Moving...' */
export function moveConfirmLabel({ full, busy } = {}) {
  return notBuilt();
}

/** The page's line after an add. */
export function addSuccessLine({ first, date, time, result, predicted } = {}) {
  return notBuilt();
}

/** 'Jordan moved to Thu Nov 19, 4:00 PM.' */
export function moveSuccessLine(first, date, time) {
  return notBuilt();
}

/** A refusal's line in staff words. */
export function staffRefusalLine(reason, { action, first } = {}, err = null) {
  return notBuilt();
}

/** What the sheet does on a refusal: full, none-row, free-only, session, unconfirmed or end. */
export function refusalKind(reason, action) {
  return notBuilt();
}

/** '{line} Nothing was changed.' */
export function nothingChanged(line) {
  return notBuilt();
}
