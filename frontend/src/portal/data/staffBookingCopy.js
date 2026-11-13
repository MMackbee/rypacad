/**
 * Staff booking copy (spec 01-spec-admin-booking.md 10.2-10.5): every word
 * of the staff booking screens and sheets, the refusal map and the refusal
 * kinds. PURE.
 *
 * Dates read "Tue Nov 17, 4:00 PM" (dayTimeLabel), "Tue Nov 17", "Nov 20"
 * and "Nov 1 - Nov 30". A line that names the athlete takes the first name.
 *
 * Copy rules: "Tour event", never "tournament"; Elite copy never mentions
 * tokens; Free copy never promises a token back.
 */
import { format, parseISO } from 'date-fns';
import { ALREADY_CHANGED_COPY, dayTimeLabel } from './bookingChanges';
import { availableCount, isSingleTokenId } from './singleToken';
import { SESSION_STARTED_COPY } from './sessionStart';

// ---- The row buttons and the entry points -----------------------------------

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

/**
 * A row's part of its Move and Cancel names: 'Tue, Nov 10 4:00 PM Training
 * block', or 'Tue, Nov 10 Training block' with no time. The staff Billing
 * rows (TokenMeterRows.js) and the athlete's screen both pass it, so one
 * athlete's rows never share a name.
 */
export function staffRowLabel(date, time, label) {
  const day = date ? format(parseISO(date), 'EEE, MMM d') : '';
  return [day, String(time ?? '').trim(), label].filter(Boolean).join(' ');
}

/** Shown instead of Book a session for a test athlete or household. */
export function testAthleteLine(first) {
  return `${first} is a test athlete. Test athletes can't be booked onto real sessions.`;
}

// ---- Dates -------------------------------------------------------------------

/** 'Tue Nov 17' */
function dayLabel(date) {
  return format(parseISO(date), 'EEE MMM d');
}

/** 'Nov 20' */
function shortDay(date) {
  return format(parseISO(date), 'MMM d');
}

/** 'Tue Nov 17, 4:00 PM' (a move's `from` and `to` carry `{ date, time }`). */
function when(date, time) {
  return dayTimeLabel(date, time);
}

/** The kind of session, as a family reads it: never "tournament". */
const KIND_NOUNS = { training: 'Training block', tournament: 'Tour event', phil: 'Phil session' };
function kindNoun(type) {
  return KIND_NOUNS[type] ?? 'session';
}

/** 'Jordan', or 'This athlete' when the name is not known. */
function who(first) {
  return first || 'This athlete';
}

/** "Jordan's", or "This athlete's". */
function whose(first) {
  return first ? `${first}'s` : "This athlete's";
}

// ---- The Admin card and the athlete search ------------------------------------

export const MANAGE_BOOKINGS_LABEL = 'Manage bookings';
export const MANAGE_BOOKINGS_BODY = 'Add, move or cancel a session for any athlete.';
export const FIND_ATHLETE_LABEL = 'Find an athlete';
export const FIND_ATHLETE_PLACEHOLDER = 'Start typing a name';
export const TEST_BADGE = 'Test';
export const ATHLETES_LOAD_FAILED = "Athletes didn't load. Check your connection and try again.";

/** 'No athlete matches "zz".' */
export function noAthleteMatches(query) {
  return `No athlete matches "${String(query ?? '').trim()}".`;
}

/** 'Whitfield family · 6 tokens'; either part alone when the other is not on file. */
export function athleteSubline(householdName, packageName) {
  return [householdName, packageName].filter(Boolean).join(' · ');
}

// ---- The athlete's screen -----------------------------------------------------

export const BACK_TO_ADMIN = '‹ Admin';
export const STAFF_VIEW_LABEL = 'Bookings · staff view';
export const FAMILY_BILLING = 'Family billing';
export const LATER_LABEL = 'Later';
export const NOTHING_BOOKED = 'Nothing booked.';
export const CANCEL_IN_CALENDLY = 'Cancel in Calendly';
export const ATHLETE_NOT_ON_FILE = "That athlete isn't on file.";

const FREE_ONLY_LINES = {
  unpaid: 'Not paid yet - Free only',
  past_due: 'Membership past due - Free only',
  lapsed: 'Membership lapsed - Free only',
  'no-package': 'No package on file - Free only',
};

/**
 * The athlete screen's token line, from the athlete model: Free only by pay
 * state first, then 'Elite', '2 session tokens' (a single athlete:
 * availableCount, data/singleToken.js) or '3 of 6 tokens left this period'.
 */
export function tokenLine(model) {
  const freeOnly = FREE_ONLY_LINES[model?.payState];
  if (freeOnly) return freeOnly;
  const tokens = model?.tokens || {};
  if (tokens.unlimited) return 'Elite';
  if (tokens.perPurchase) {
    const n = availableCount(tokens);
    return `${n} session token${n === 1 ? '' : 's'}`;
  }
  return `${tokens.left ?? 0} of ${tokens.granted ?? 0} tokens left this period`;
}

/** 'This period · Nov 1 - Nov 30' / 'Next period · Dec 1 - Dec 31' */
export function groupLabel(which, { start, end } = {}) {
  const name = which === 'next' ? 'Next period' : 'This period';
  return `${name} · ${shortDay(start)} - ${shortDay(end)}`;
}

/** 'Tue Nov 17 · 4:00 PM'; 'Tue Nov 17' with no time. */
export function rowWhen(date, time) {
  const t = String(time ?? '').trim();
  return t ? `${dayLabel(date)} · ${t}` : dayLabel(date);
}

// ---- The day and session picker -----------------------------------------------

export const DAY_LABEL = 'Day';
export const PREV_DAY = '‹ Previous day';
export const NEXT_DAY = 'Next day ›';
export const CLOSE = 'Close';
export const STARTED_TAG = 'Started';
export const WAITLISTED_TAG = 'Waitlisted';
export const BOOKED_TAG = 'Booked';
export const FINDING_SESSIONS = 'Finding sessions...';
export const SESSIONS_LOAD_FAILED = "Sessions didn't load. Check your connection and try again.";
export const ON_THIS_SESSION = 'On this session';

/** '9 left' / 'Full · 14 of 14' */
export function seatsPill({ full, taken, capacity } = {}) {
  if (full) return `Full · ${taken} of ${capacity}`;
  return `${Math.max(0, (capacity || 0) - (taken || 0))} left`;
}

/** 'Reserved 5 or better' */
export function reservedTagLine(limit) {
  return `Reserved ${limit} or better`;
}

/** 'No sessions to book on Tue Nov 17.' */
export function noSessionsOn(date) {
  return `No sessions to book on ${dayLabel(date)}.`;
}

/** 'Add an athlete to Training block, Tue Nov 17, 4:00 PM' */
export function athletePickerTitle(label, date, time) {
  return `Add an athlete to ${label}, ${when(date, time)}`;
}

// ---- The add sheet ----------------------------------------------------------------

export const FREE_LABEL = 'Free';
export const BACK = 'Back';

/** 'Add Jordan to this session?', or the full question with the count. */
export function addTitle(first, facts = {}) {
  if (facts.full) return `This session is full (${facts.taken} of ${facts.capacity}) - add anyway?`;
  return `Add ${who(first)} to this session?`;
}

/** 'Jordan Whitfield · Tue Nov 17, 4:00 PM · Training block' */
export function addSummary(name, date, time, label) {
  return [name, when(date, time), label].filter(Boolean).join(' · ');
}

/** Why an athlete who is not paid up adds Free only. */
function freeOnlyLine(first, payState) {
  if (payState === 'past_due') return `${whose(first)} membership is past due, so this booking is Free.`;
  if (payState === 'lapsed') return `${whose(first)} membership is lapsed, so this booking is Free.`;
  return `${who(first)} isn't paid up, so this booking is Free.`;
}

/**
 * The add sheet's one charge line for staffAddFacts' `charge`. Free only
 * reads its pay state even with the switch on (it is locked on); otherwise
 * the switch on reads 'Free - no token used.'. Elite never mentions tokens.
 */
export function chargeLine(first, charge, { freeOn } = {}) {
  const kind = charge?.kind;
  if (kind === 'free-only') return freeOnlyLine(first, charge.payState);
  if (freeOn) return 'Free - no token used.';
  const period = charge?.next ? 'next period' : 'this period';
  switch (kind) {
    case 'period':
      return charge.next && charge.from
        ? `Uses 1 of ${whose(first)} tokens for next period (from ${shortDay(charge.from)}) - ${charge.left} left.`
        : `Uses 1 of ${whose(first)} tokens for ${period} - ${charge.left} left.`;
    case 'grace':
      return charge.expiresAt
        ? `Uses ${whose(first)} bonus token (good through ${shortDay(charge.expiresAt)}).`
        : `Uses ${whose(first)} bonus token.`;
    case 'single':
      return `Uses one of ${whose(first)} session tokens.`;
    case 'elite':
      return 'Elite - nothing to use.';
    case 'none':
      return `${who(first)} has no tokens left for ${period}. Switch on Free to add anyway.`;
    default:
      return 'Uses a token from that period if one is left.';
  }
}

/** One staffAddFacts warning in staff words. */
export function warningLine(first, warning) {
  switch (warning?.kind) {
    case 'outside-window':
      return `Past ${whose(first)} booking window - families can book through ${shortDay(warning.through)}.`;
    case 'handicap-reserved':
      return warning.handicap == null
        ? `Reserved for handicaps of ${warning.limit} or better - ${who(first)} has no handicap on file.`
        : `Reserved for handicaps of ${warning.limit} or better - ${whose(first)} is ${warning.handicap}.`;
    case 'one-per-day':
      return `${who(first)} already has a ${kindNoun(warning.type)} on ${dayLabel(warning.date)} - Elite includes one a day.`;
    case 'started':
      return warning.today ? SESSION_STARTED_COPY : `This session was on ${dayLabel(warning.date)}.`;
    case 'waiting':
      return `${who(first)} is on this session's waitlist - adding takes ${who(first)} off it.`;
    default:
      return null;
  }
}

/** '3 on the waitlist for this session.' */
export function waitlistCountLine(n) {
  return `${n} on the waitlist for this session.`;
}

/** 'Add Jordan' / 'Add Jordan free' / 'Add anyway' (a full session) / 'Adding...' */
export function addConfirmLabel(first, { free, full, busy } = {}) {
  if (busy) return 'Adding...';
  if (full) return 'Add anyway';
  return free ? `Add ${who(first)} free` : `Add ${who(first)}`;
}

// ---- The move sheet -------------------------------------------------------------

export const KEEP_IT = 'Keep it';

/** 'Move Jordan to another Training block' / 'Tour event' / 'Phil session'. */
export function staffMoveTitle(first, type) {
  return `Move ${who(first)} to another ${kindNoun(type)}`;
}

/** The move question, or the full question with the server's count. `from` and `to` carry `{ date, time }`. */
export function staffMoveQuestion(first, from, to, { full, taken, capacity } = {}) {
  if (full) return `${when(to.date, to.time)} is full (${taken} of ${capacity}) - move ${who(first)} anyway?`;
  return `Move ${who(first)} from ${when(from.date, from.time)} to ${when(to.date, to.time)}?`;
}

/** What a move does with the token (moveChargeKind); null for Elite. */
export function moveChargeLine(charge) {
  switch (charge?.kind) {
    case 'carry':
      return 'The token moves with it.';
    case 'swap':
      return `Uses a ${charge.toMonth} token; the ${charge.fromMonth} one comes back.`;
    case 'free':
      return 'Stays free.';
    default:
      return null;
  }
}

/** 'Move' / 'Move anyway' / 'Moving...' */
export function moveConfirmLabel({ full, busy } = {}) {
  if (busy) return 'Moving...';
  return full ? 'Move anyway' : 'Move';
}

// ---- Success and no answer --------------------------------------------------------

export const STAFF_CHANGE_UNCONFIRMED = "We couldn't confirm the change. Check the list before trying again.";

/** What the add spent: the server's answer, or in practice mode the predicted charge. */
function spentOf(result, predicted) {
  if (result?.comp === true) return 'free';
  if (result?.simulated) {
    const kind = predicted?.kind;
    if (kind === 'grace' || kind === 'single' || kind === 'elite') return kind;
    if (kind === 'free-only') return 'free';
    return 'period';
  }
  if (result?.chargedFrom === 'elite') return 'elite';
  if (result?.chargedFrom === 'grace') return isSingleTokenId(result.graceTokenId) ? 'single' : 'grace';
  return 'period';
}

const SPENT_SUFFIX = { period: ' - 1 token used.', grace: ' - bonus token used.', single: ' - session token used.', free: ', free.', elite: '.' };

/**
 * The page's line after an add: 'Jordan is booked for Tue Nov 17, 4:00 PM -
 * 1 token used.', '... - bonus token used.', '... - session token used.',
 * '..., free.' or, for Elite, '... 4:00 PM.'; an overfill adds ' The session
 * now has 15 of 14.'.
 */
export function addSuccessLine({ first, date, time, result, predicted } = {}) {
  const line = `${who(first)} is booked for ${when(date, time)}${SPENT_SUFFIX[spentOf(result, predicted)]}`;
  const booked = Number(result?.booked);
  const capacity = Number(result?.capacity);
  const over = result?.booked != null && result?.capacity != null && booked > capacity;
  return over ? `${line} The session now has ${booked} of ${capacity}.` : line;
}

/** 'Jordan moved to Thu Nov 19, 4:00 PM.' */
export function moveSuccessLine(first, date, time) {
  return `${who(first)} moved to ${when(date, time)}.`;
}

// ---- Refusals ---------------------------------------------------------------------

const CALENDLY_LINE = "Yannick's 1:1s are booked and changed in Calendly.";

/** The server's reasons in staff words; a function where the line names the athlete. */
const REFUSAL_LINES = {
  'signed-out': 'You are signed out. Sign in and try again.',
  'not-staff': 'Only the owner or ops can change bookings here.',
  'bad-request': "That change wasn't complete. Try again.",
  'athlete-missing': "That athlete isn't on file any more.",
  'booking-missing': 'That booking no longer exists.',
  'no-household': (first) => `${who(first)} has no family on file, so the booking would have nowhere to show.`,
  'test-athlete': (first) => `${who(first)} is a test athlete and can't be booked onto real sessions.`,
  'session-missing': "That session isn't on the schedule any more.",
  calendly: CALENDLY_LINE,
  'calendly-managed': CALENDLY_LINE,
  'mental-no-move': CALENDLY_LINE,
  mental: CALENDLY_LINE,
  'session-cancelled': 'The academy cancelled that session.',
  'session-hidden': 'That session is hidden from the schedule. Show it first, then add.',
  'display-only': "That session isn't booked through the portal.",
  'period-over': "That session is in a billing period that's over.",
  'already-booked': (first) => `${who(first)} is already on that session.`,
  'not-confirmed': ALREADY_CHANGED_COPY,
  attended: "This booking is marked attended, so it can't move.",
  'different-type': 'Pick a session of the same kind.',
  'same-session': 'Pick a different session.',
};

/**
 * The lines a move reads in its own words where the add's would say "add"
 * (walkthrough 2026-11-13). Every other line reads the same for both.
 */
const MOVE_REFUSAL_LINES = {
  'session-hidden': 'That session is hidden from the schedule. Show it first, then move.',
};

const PAYING = new Set(['not-paid', 'membership-inactive']);
const NO_TOKENS = new Set(['no-tokens-left', 'no-session-token']);

/**
 * A refusal's line in staff words (spec 10.5). Paying, tokens and a hidden
 * session read by `action` ('add' or 'move'). `full` carries the server's
 * count when the error has it (`err.cause.details`). An unknown reason shows
 * the server's own message; no reason at all (no answer) the unconfirmed line.
 */
export function staffRefusalLine(reason, { action, first } = {}, err = null) {
  if (!reason) return STAFF_CHANGE_UNCONFIRMED;
  const move = action === 'move';
  if (PAYING.has(reason)) {
    return move
      ? `${whose(first)} membership isn't active, so a paid booking can't move. Cancel it and add Free instead.`
      : `${who(first)} isn't paid up - switch on Free.`;
  }
  if (NO_TOKENS.has(reason)) {
    return move
      ? `${who(first)} has no tokens left for that period. Cancel it and add Free instead.`
      : `${who(first)} has no tokens left for that period. Switch on Free to add anyway.`;
  }
  if (reason === 'full') {
    const d = err?.cause?.details;
    return d && d.taken != null && d.capacity != null ? `That session is full (${d.taken} of ${d.capacity}).` : 'That session is full.';
  }
  const line = (move && MOVE_REFUSAL_LINES[reason]) || REFUSAL_LINES[reason];
  if (typeof line === 'function') return line(first);
  return line ?? (err?.message || STAFF_CHANGE_UNCONFIRMED);
}

/** Refusals about the session picked: back to the picker, reloaded. */
const SESSION_REFUSALS = new Set([
  'session-missing',
  'calendly',
  'session-cancelled',
  'session-hidden',
  'display-only',
  'period-over',
  'already-booked',
  'different-type',
  'same-session',
]);

/**
 * What the sheet does on a refusal: 'full' (the full question), 'none-row'
 * (an add turns to "no tokens left"), 'free-only' (an add turns to Free
 * only), 'session' (back to the picker), 'unconfirmed' (no reason: maybe it
 * went through) or 'end' (the line and Close). A sheet with a fixed session
 * treats 'session' as 'end'.
 */
export function refusalKind(reason, action) {
  if (!reason) return 'unconfirmed';
  if (reason === 'full') return 'full';
  if (action !== 'move' && NO_TOKENS.has(reason)) return 'none-row';
  if (action !== 'move' && reason === 'not-paid') return 'free-only';
  if (SESSION_REFUSALS.has(reason)) return 'session';
  return 'end';
}

/** '{line} Nothing was changed.' - a line without its own full stop gets one. */
export function nothingChanged(line) {
  const text = String(line ?? '').trim();
  return `${/[.!?]$/.test(text) ? text : `${text}.`} Nothing was changed.`;
}
