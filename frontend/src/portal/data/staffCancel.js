/**
 * Staff cancel on the Billing staff view (owner approved 2026-11-12): a
 * child who was sick for a block was marked No-show and spent a token for
 * nothing, and staff had no way to cancel one athlete's booking. The owner
 * or ops now cancels it from the "This period" list, with the family's own
 * reasons, together with any brothers and sisters booked on the same
 * session, and the token comes back.
 *
 * PURE: which rows carry Cancel, who else is on the session, and the words
 * of the sheet and of the page. No Firebase import - hooks/staffCancel.js
 * makes the call.
 *
 * CHANGE ONE, CHANGE BOTH: functions/portal/staff-cancel.js and its decide
 * module functions/portal/staff-cancel-decide.js - the server's own
 * eligibility (bookingRefusal: confirmed or noshow, not Calendly, the billing
 * period not over), its tokenBack (false for a free comp and for chargedFrom
 * 'elite'), its STAFF_ROLES and its refusal reasons (REFUSALS). The server
 * decides; this only keeps the page from offering what it would refuse.
 */
import { ALREADY_CHANGED_COPY, cancelQuestion, categoryLabel, dayTimeLabel, isFreeComp } from './bookingChanges';

/** The roles that may cancel (the roles StaffBillingRoute serves). */
export const STAFF_CANCEL_ROLES = ['owner', 'ops'];

/** The most bookings one cancel takes (the server's 1..6). */
export const STAFF_CANCEL_MAX = 6;

/** The words a cancellable row's status reads (TokenMeter's badges). */
const STATUS_LABELS = { confirmed: 'Booked', noshow: 'No-show' };

/** True for the owner and ops; coaches, specialists, parents and athletes never cancel here. */
export function staffMayCancel(role) {
  return STAFF_CANCEL_ROLES.includes(role);
}

/** 'Booked' / 'No-show' for a cancellable row's status; null for anything else. */
export function staffStatusLabel(status) {
  return STATUS_LABELS[status] ?? null;
}

/**
 * Whether a billing hub row (data/billingHub.js periodRows) carries Cancel:
 * a booking that is Booked or No-show and not a Calendly 1:1 (those cancel
 * in Calendly). `periodStart`, this period's first day: a row dated before
 * it was charged to a period that is over (an October row the hub reads
 * under the first period), which the server refuses. A past session inside
 * this period is the whole point (the no-show), so there is no start check.
 */
export function staffCancellable(row, { periodStart = null } = {}) {
  if (!row || !row.id || row.kind === 'waitlist') return false;
  if (!STATUS_LABELS[row.status]) return false;
  if (row.source === 'calendly') return false;
  if (periodStart && row.date && row.date < periodStart) return false;
  return true;
}

/** Whether cancelling the row gives a token back: not a free comp, not Elite. */
export function tokenBackOf(row) {
  return Boolean(row) && !isFreeComp(row) && row.chargedFrom !== 'elite';
}

/**
 * The other members of the household with a cancellable booking on the
 * SAME session as `row`: `[{ athleteId, name, row }]` in the household's
 * order, at most five (one cancel takes six bookings). None when the row has
 * no session (practice mode's sample rows).
 */
export function siblingsFor(row, athleteId, members) {
  if (!row || !row.sessionId) return [];
  const out = [];
  for (const m of members || []) {
    if (!m || m.athleteId === athleteId) continue;
    const hit = (m.spent || []).find(
      (r) => r && r.sessionId === row.sessionId && staffCancellable(r, { periodStart: m.period?.start ?? null })
    );
    if (hit) out.push({ athleteId: m.athleteId, name: m.name, row: hit });
  }
  return out.slice(0, STAFF_CANCEL_MAX - 1);
}

/** "Jordan" from "Jordan Whitfield"; null without a name. */
export function firstOf(name) {
  return String(name ?? '').trim().split(/\s+/)[0] || null;
}

/** "Why can't Jordan make it?" before the session starts, "Why couldn't Jordan make it?" once it has. */
export function staffCancelQuestion(name, started) {
  if (!started) return cancelQuestion(name);
  const first = firstOf(name);
  return first ? `Why couldn't ${first} make it?` : "Why couldn't you make it?";
}

/** "Jordan Whitfield · Tue Nov 10, 4:00 PM · Training block · No-show" - what is being cancelled. */
export function staffCancelSummary(row, name) {
  const when = row?.date ? dayTimeLabel(row.date, row.time) : row?.time;
  return [name, when, row?.label, staffStatusLabel(row?.status)].filter(Boolean).join(' · ');
}

/** The confirm button, by how many of the chosen bookings spent a token. */
export function staffConfirmLabel(rows) {
  const n = (rows || []).filter(tokenBackOf).length;
  if (n === 0) return 'Cancel session';
  return n === 1 ? 'Cancel and give the token back' : 'Cancel and give the tokens back';
}

/** "Ava", "Ava and Ben", "Ava, Ben and Cy". */
function joinNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Who was cancelled and whether each got a token back, in the order the
 * sheet chose them: `[{ name, tokenBack }]`. The server's tokenBack wins;
 * without one (practice mode's simulated result) the row decides.
 */
export function staffCancelOutcome(result, chosen) {
  const byId = new Map(((result && result.cancelled) || []).map((c) => [c && c.bookingId, c]));
  return (chosen || [])
    .filter((c) => byId.has(c.row.id))
    .map((c) => {
      const sent = byId.get(c.row.id);
      return { name: c.name, tokenBack: typeof sent.tokenBack === 'boolean' ? sent.tokenBack : tokenBackOf(c.row) };
    });
}

/**
 * The line on the Billing page after a cancel: "Cancelled · Sick - token
 * back for Jordan.", "... - tokens back for Jordan, Riley and Casey.",
 * Other with its note ("Cancelled · Other: dentist ..."), and just
 * "Cancelled · Sick." when nobody got a token back (comps, Elite).
 */
export function staffCancelLine(reason, outcome) {
  const label = categoryLabel(reason?.category) ?? 'Cancelled';
  const note = reason?.category === 'other' && reason.note ? String(reason.note).trim() : '';
  const why = note ? `${label}: ${note}` : label;
  const back = (outcome || []).filter((o) => o.tokenBack);
  if (back.length === 0) return `Cancelled · ${/[.!?]$/.test(why) ? why : `${why}.`}`;
  const names = joinNames(back.map((o) => firstOf(o.name)).filter(Boolean));
  return `Cancelled · ${why} - ${back.length === 1 ? 'token' : 'tokens'} back${names ? ` for ${names}` : ''}.`;
}

/** What the sheet says when the call's answer never arrived: it may have gone through. */
export const STAFF_CANCEL_UNCONFIRMED = "We couldn't confirm the cancel. Check the list before trying again.";

/** The server's refusal reasons, in staff words. Nothing is cancelled on any of them. */
const REFUSALS = {
  'signed-out': 'You are signed out. Sign in and try again.',
  'not-staff': 'Only the owner or ops can cancel a booking here.',
  'bad-request': "That cancel wasn't complete. Pick a reason and try again.",
  'not-found': 'That booking no longer exists.',
  'already-cancelled': ALREADY_CHANGED_COPY,
  attended: 'A booking here is marked attended - nothing was cancelled.',
  calendly: 'A Calendly 1:1 is cancelled in Calendly.',
  'period-over': "That booking's billing period is over - nothing was cancelled.",
  mixed: 'Those bookings are not on one session - nothing was cancelled.',
};

/**
 * A refusal's line: the staff words for a known reason; the server's own
 * message for a reason this page does not know yet; and, with no reason at
 * all (no answer - the cancel may have gone through), STAFF_CANCEL_UNCONFIRMED.
 */
export function staffCancelRefusal(reason, err = null) {
  if (!reason) return STAFF_CANCEL_UNCONFIRMED;
  return REFUSALS[reason] ?? (err && err.message ? String(err.message) : "The cancel didn't go through.");
}
