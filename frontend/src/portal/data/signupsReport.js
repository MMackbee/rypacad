/**
 * The sign-ups report's row COPY (Sprint 20, spec 7) - PURE, over the rows
 * useSignups() returns. Routing's data/signups.js BUILDS the rows
 * (buildSignupRows); this file only turns them into strings and filters,
 * which is why it is a different module (D1).
 */
import { longDayLabel } from './calendar';
import { facilitySourceLabel, householdFacility } from './facility';

export const SIGNUP_FILTERS = [['all', 'All'], ['unpaid', 'Unpaid'], ['flagged', 'Flagged']];

export function filterSignupRows(rows, filter) {
  if (filter === 'unpaid') return (rows || []).filter((r) => r.unpaid);
  if (filter === 'flagged') return (rows || []).filter((r) => r.flagged);
  return rows || [];
}

/** The Flagged pill's number: flagged households PLUS unmatched Calendly bookings, which have no household row (D16). */
export function flaggedCount(counts) {
  if (!counts) return 0;
  return (counts.flagged ?? 0) + (counts.unresolved ?? 0);
}

export function athleteLine(a) {
  return [a.name, a.age != null ? String(a.age) : null, a.packageName || 'no package', a.handicap != null ? `hcp ${a.handicap}` : 'no handicap'].filter(Boolean).join(' · ');
}

const BILLING = { pending: 'Payment pending', active: 'Paid', past_due: 'Past due', lapsed: 'Lapsed' };
export function paymentLabel(a) {
  const base = BILLING[a.billing] || 'Paid';
  // The family's one add-on (owner ruling 2026-09-30), on the athlete it bills on.
  return a.facility ? `${base} · family facility ${a.facility}` : base;
}

/**
 * "Facility access: family add-on" / "Facility access: Elite" for EVERY
 * athlete of a covered household (data/facility.js decides), null without
 * access. It goes on the line under the name: the payment badge above names
 * who pays, and cannot wrap.
 */
export function facilityAccessLabel(row) {
  const family = householdFacility((row?.athletes || []).map((a) => ({
    id: a.athleteId, packageId: a.packageId, billing: { status: a.billing }, facilityBilling: a.facility ? { status: a.facility } : null,
  })));
  const source = facilitySourceLabel(family, row?.mode === 'athlete');
  return source ? `Facility access: ${source}` : null;
}

export function loginLabel(a) {
  if (a.login === 'claimed') {
    const day = a.loginClaimedAt ? String(a.loginClaimedAt).slice(0, 10) : null;
    return day ? `Login: claimed ${longDayLabel(day)}` : 'Login: claimed';
  }
  if (a.login === 'invited-stale') return `Login: invited 7+ days ago (${a.loginEmail})`;
  if (a.login === 'invited') return `Login: invited (${a.loginEmail})`;
  return 'Login: none';
}

export function flagLabel(f) {
  if (f.kind === 'calendly') return `Calendly ${f.outcome} · ${String(f.receivedAt || '').slice(0, 10)}`;
  if (f.kind === 'duplicate') return `Possible duplicate: ${f.athleteName} is also in another family (${f.otherHouseholdId})`;
  return `Booking ${f.flag} · ${f.date}`;
}

/**
 * Why the webhook could not match a booking (the ledger's `reason`), in the
 * owner's words (review 2026-11-04).
 */
const UNMATCHED_REASON = {
  'no-login': 'no account with this email',
  'utm-not-owned': "booked from an athlete's link this email is not linked to",
  'ambiguous-household': 'family found, but not which athlete',
  'no-athlete': 'family found, but it has no athletes',
};

/**
 * One line per unmatched Calendly event (useSignups().data.unresolved): from
 * the ledger's `invitee` and `slot` (2026-11-04), the athlete named on
 * Calendly, the session time, when and by whom it was booked, and why it did
 * not match - both dates labelled, the reason in plain words (review
 * 2026-11-04): "Addie Schinka · session Thursday, Nov 5 7:00 PM, 30 min
 * (RYP Academy - Mental Game 1:1) · booked Tuesday, Oct 20 by Jo Schinka,
 * jo@example.com · no account with this email". The length and the
 * Calendly event name (review 2026-11-04) tell the 1:1 from another of
 * Yannick's event types. Rows from before 2026-11-04 kept no time and hold
 * nothing.
 */
export function unresolvedLabel(e) {
  const inv = e.invitee || null;
  const slot = e.slot || null;
  const kind = `${slot && slot.durationMinutes ? `, ${slot.durationMinutes} min` : ''}${e.eventName ? ` (${e.eventName})` : ''}`;
  const athlete = inv ? inv.athleteName || null : null;
  const booker = inv ? [inv.name && inv.name !== athlete ? inv.name : null, inv.email].filter(Boolean).join(', ') : '';
  const day = e.receivedAt ? String(e.receivedAt).slice(0, 10) : null;
  return [
    athlete,
    slot && slot.date ? `session ${longDayLabel(slot.date)}${slot.time ? ` ${slot.time}` : ''}${kind}` : 'session time not kept, not held: see Calendly',
    day || booker ? ['booked', day ? longDayLabel(day) : null, booker ? `by ${booker}` : null].filter(Boolean).join(' ') : null,
    UNMATCHED_REASON[e.reason] || null,
  ].filter(Boolean).join(' · ');
}

export function signedUpLabel(iso) {
  if (!iso) return '—';
  const day = String(iso).slice(0, 10);
  const time = String(iso).slice(11, 16);
  return time ? `${longDayLabel(day)} ${time}` : longDayLabel(day);
}
