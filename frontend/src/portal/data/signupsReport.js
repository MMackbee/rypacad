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

/** One line per unmatched Calendly event (useSignups().data.unresolved) - the same shape flagLabel renders inside a row. */
export function unresolvedLabel(e) {
  return flagLabel({ kind: 'calendly', id: e.id, outcome: e.outcome, receivedAt: e.receivedAt });
}

export function signedUpLabel(iso) {
  if (!iso) return '—';
  const day = String(iso).slice(0, 10);
  const time = String(iso).slice(11, 16);
  return time ? `${longDayLabel(day)} ${time}` : longDayLabel(day);
}
