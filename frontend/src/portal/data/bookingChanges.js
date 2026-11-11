/**
 * Cancel with a reason and Move (spec 2026-11-11 booking changes, §4-§6):
 * the reason choices and their words, the fields a family cancel writes and a
 * re-book removes, the free-comp test, and the lines a coach reads under the
 * attendance list. PURE: no Firebase import - the callers hand in the SDK's
 * deleteField / serverTimestamp. The server never reads this module; the
 * Cloud Functions keep their own copy of what they need (isFreeComp below).
 */
import { format, parseISO } from 'date-fns';

/** The reasons a family picks from, in the order the sheet shows them (§4). */
export const CANCEL_CATEGORIES = [
  { id: 'sick', label: 'Sick' },
  { id: 'injured', label: 'Injured' },
  { id: 'school', label: 'School' },
  { id: 'family', label: 'Family conflict' },
  { id: 'other', label: 'Other' },
];

/** The longest note Other takes (the rules check the same 1..140). */
export const CANCEL_NOTE_MAX = 140;

export const CANCEL_NOTE_PLACEHOLDER = 'A few words';

/** What a portal 1:1 with Yannick shows on its own day (no Cancel, no Move). */
export const MENTAL_DAY_OF_COPY = 'A 1:1 can be cancelled in the app up to the day before.';

/** A Cancel or Move on a booking another device or tab already changed. */
export const ALREADY_CHANGED_COPY = 'This booking was already changed.';

/** The words for a reason id, or null for an id that is not one of the five. */
export function categoryLabel(id) {
  return CANCEL_CATEGORIES.find((c) => c.id === id)?.label ?? null;
}

/** "Why can't Jordan make it?"; an athlete's own login (no name) is asked "you". */
export function cancelQuestion(name) {
  const first = String(name ?? '').trim().split(/\s+/)[0];
  return first ? `Why can't ${first} make it?` : "Why can't you make it?";
}

/**
 * The reason a cancel stores, or null when it is not usable yet: a known
 * category; with Other a trimmed note of 1..140 characters, else no note.
 */
export function cancelReasonOf(input) {
  const category = input?.category;
  if (!categoryLabel(category)) return null;
  if (category !== 'other') return { category, note: null };
  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (!note || note.length > CANCEL_NOTE_MAX) return null;
  return { category, note };
}

/**
 * The extra fields a family cancel writes for a reason (`{}` without one, so
 * an older caller's write stays byte for byte). A cancel without a note
 * removes any note an earlier cancel of the same row left. `del` and `stamp`
 * are zero-argument functions (deleteField / serverTimestamp in live.js).
 */
export function cancelFields(reason, { del, stamp } = {}) {
  if (!reason) return {};
  return { cancelCategory: reason.category, cancelNote: reason.note ?? del(), cancelledAt: stamp() };
}

/** The fields a re-book of a cancelled row removes, when the row carries them. */
const REBOOK_CLEARED = ['cancelCategory', 'cancelNote', 'cancelledAt', 'comp'];

/**
 * `{ [field]: del() }` for each of cancelCategory, cancelNote, cancelledAt and
 * comp the cancelled row carries (a re-booked row is paid for, and carries no
 * old reason); `{}` - and `del` never called - for a row with none of them.
 */
export function rebookClears(row, del) {
  const out = {};
  for (const key of REBOOK_CLEARED) {
    if (row != null && row[key] !== undefined) out[key] = del();
  }
  return out;
}

/**
 * A free comp (scripts/comp-booking.mjs): `comp: true`, charged to the period
 * and holding no bonus or single token. It never spends a period token and
 * stays free when moved. A row re-booked with a bonus or single token is an
 * ordinary booking even if an older app left `comp` on it.
 * CHANGE ONE, CHANGE BOTH: functions/portal/move-decide.js#isFreeComp.
 */
export function isFreeComp(booking) {
  return Boolean(booking) && booking.comp === true
    && (booking.chargedFrom ?? 'period') === 'period' && !booking.graceTokenId;
}

/** 'Thu Nov 12, 4:00 PM'; 'Thu Nov 12' when the time is blank. */
export function dayTimeLabel(dateISO, time) {
  const day = format(parseISO(dateISO), 'EEE MMM d');
  const t = String(time ?? '').trim();
  return t ? `${day}, ${t}` : day;
}

/**
 * The greyed line a coach reads under the attendance list (§6), or null for
 * a row that stays off it: a family cancel with a known reason ("Cancelled ·
 * Sick", Other with its note), or a move ("Moved to Thu Nov 12, 4:00 PM";
 * "Moved" when the new session is not known). An older app's cancel (no
 * reason) and academy or billing cancels show nothing. `movedToSession` is
 * `{ date, time }` or null.
 */
export function coachLine(booking, movedToSession = null) {
  if (booking?.status !== 'cancelled') return null;
  if (booking.cancelReason === 'moved') {
    return movedToSession?.date
      ? `Moved to ${dayTimeLabel(movedToSession.date, movedToSession.time)}`
      : 'Moved';
  }
  if (booking.cancelReason !== 'member') return null;
  const label = categoryLabel(booking.cancelCategory);
  if (!label) return null;
  const note = booking.cancelCategory === 'other' && typeof booking.cancelNote === 'string'
    ? booking.cancelNote.trim() : '';
  return note ? `Cancelled · ${label}: ${note}` : `Cancelled · ${label}`;
}

/**
 * The session a moved-away row went to, read from its `movedTo` booking id
 * (`{athleteId}_{sessionId}`); null when there is none or it names another
 * athlete.
 */
export function movedToSessionId(booking) {
  const movedTo = booking?.movedTo;
  if (typeof movedTo !== 'string' || !booking.athleteId) return null;
  const prefix = `${booking.athleteId}_`;
  if (!movedTo.startsWith(prefix)) return null;
  return movedTo.slice(prefix.length) || null;
}

/** What a coach reads after tapping IN or OUT on a kid who had just cancelled. */
export function staleMarkLine(name) {
  const who = String(name ?? '').trim();
  return `${who || 'This athlete'} cancelled - list updated.`;
}
