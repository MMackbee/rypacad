/**
 * Per-athlete payment copy and card states (Sprint 20, spec 4.4/4.5, 3.2),
 * PURE - shared by ParentDashboard, AthleteDashboard, Membership, Billing
 * and AthleteDetail so the words cannot drift. `billing` absent == active.
 */
import { BOOKING_OPENS_LABEL, longDayLabel } from './calendar';
import { SINGLE_TOKEN } from './packages';

export const PENDING_TITLE = 'Payment pending - finish checkout to start booking';
export const PAY_NOW = 'Pay now';
export const PENDING_PLAN_LINE = "Billed monthly from the 1st once you've paid";
/** The single token is a one-time purchase, never a monthly bill (owner ruling, 2026-09-30). */
export const SINGLE_PLAN_LINE = `One-time $${SINGLE_TOKEN.price} per session token`;
export const CONNECTED_LINE = 'Your card and invoices are managed in Stripe.';
export const CONFIRMING = 'Confirming your payment...';
export const CONFIRM_TIMEOUT = 'Still confirming - refresh in a minute, or check your email from Stripe.';

export function confirmedLine(open) {
  return open ? "Payment received - you're all set to book." : `Payment received - booking opens ${BOOKING_OPENS_LABEL}.`;
}

const BADGES = {
  pending: { tone: 'yellow', label: 'Payment pending' },
  past_due: { tone: 'yellow', label: 'Past due' },
  lapsed: { tone: 'red', label: 'Lapsed' },
};
export function billingBadge(status) {
  return BADGES[status] || null;
}

/** null == no card (Elite includes it; a tier not yet active cannot add it). */
export function facilityCardState(member) {
  if (!member || !member.package || member.package.kind === 'elite') return null;
  if ((member.billing?.status ?? 'active') !== 'active') return null;
  const facility = member.billing?.facility ?? null;
  if (facility == null) return member.facilityAccess ? 'active' : 'offer';
  if (facility === 'active') return member.facilityAccessConsent ? 'active' : 'paid-waiver-pending';
  return facility; // 'past_due' | 'lapsed'
}

const FACILITY_LINES = {
  'paid-waiver-pending': 'Facility access: paid - waiver pending',
  active: 'Facility access: active',
  past_due: 'Facility access: payment past due',
  lapsed: 'Facility access: lapsed',
};
export function facilityLine(state) {
  return FACILITY_LINES[state] || null;
}

/** "Login: none / not claimed / claimed <date>" for the athlete card. */
export function loginStatusLine({ loginEmail, login } = {}) {
  if (!loginEmail) return 'Login: none';
  if (login && login.state === 'claimed') {
    const day = login.claimedAt ? String(login.claimedAt).slice(0, 10) : null;
    return day ? `Login: claimed ${longDayLabel(day)}` : 'Login: claimed';
  }
  return `Login: not claimed (${loginEmail})`;
}
