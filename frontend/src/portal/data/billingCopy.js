/**
 * Per-athlete payment copy and card states (Sprint 20, spec 4.4/4.5, 3.2),
 * PURE - shared by ParentDashboard, AthleteDashboard, Membership, Billing
 * and AthleteDetail so the words cannot drift. `billing` absent == active.
 */
import { format, parseISO } from 'date-fns';
import { BOOKING_OPENS_LABEL, longDayLabel, monthName } from './calendar';
import { FACILITY_ACCESS, SINGLE_TOKEN } from './packages';

export const PENDING_TITLE = 'Payment pending - finish checkout to start booking';
export const PAY_NOW = 'Pay now';
export const PENDING_PLAN_LINE = "Billed monthly from the 1st once you've paid";
/** The single token is a one-time purchase, never a monthly bill (owner ruling, 2026-09-30). */
export const SINGLE_PLAN_LINE = `One-time $${SINGLE_TOKEN.price} per session token`;
export const CONNECTED_LINE = 'Your card and invoices are managed in Stripe.';
export const CONFIRMING = 'Confirming your payment...';
export const CONFIRM_TIMEOUT = 'Still confirming - refresh in a minute, or check your email from Stripe.';

/*
 * A balance that cannot be spent yet (tester report 2026-09-30: unpaid
 * athletes read "16 tokens left" in September). The marks come from
 * billingHub.js#withTokenStart; unpaid outranks the season start.
 */
export const PAY_TO_START = 'Pay to start';
const shortDay = (iso) => format(parseISO(iso), 'MMM d');

/** "Pay to start" / "Tokens start Nov 1" in place of "N tokens left"; null == the number stands. */
export function tokenStartLabel(tokens) {
  if (!tokens || tokens.unlimited) return null;
  if (tokens.unpaid) return PAY_TO_START;
  return tokens.startsOn ? `Tokens start ${shortDay(tokens.startsOn)}` : null;
}

/** "First period: November (Nov 1 - Nov 30) - 16 tokens" - the Billing period row before the season; `granted` null (Elite) reads "unlimited". */
export function firstPeriodLine(period, granted) {
  const head = `First period: ${monthName(period.start)} (${shortDay(period.start)} - ${shortDay(period.end)})`;
  if (granted === null) return `${head} - unlimited`;
  const n = Number(granted) || 0;
  return `${head} - ${n} token${n === 1 ? '' : 's'}`;
}

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

/*
 * The add-on ticked at sign-up (owner request, Mike 2026-09-30), on the home
 * pending card: 'pay' once the membership is active and the add-on is
 * neither paid nor retrying (checkout.js takes it then), 'waiting' while the
 * membership itself is unpaid (the add-on checkout is refused until then),
 * null otherwise - not asked, access already on, or a package that never
 * has it (Elite includes it; a switch to Elite after sign-up leaves the
 * stored tick behind, so the package decides, not the tick).
 */
export function facilityRequestState(member) {
  if (!member || member.facilityRequested !== true || member.package?.kind !== 'tokens' || member.facilityAccess) return null;
  const facility = member.billing?.facility ?? null;
  if (facility === 'active' || facility === 'past_due') return null;
  const status = member.billing?.status ?? 'active';
  if (status === 'active') return 'pay';
  return status === 'pending' ? 'waiting' : null;
}
export const FACILITY_PENDING_TITLE = "Facility access - pay when you're ready";
export const FACILITY_WAITING_LINE = 'Facility access · after the membership is paid';
export const facilityRowTitle = (name) => `Facility access for ${name}`;
export const facilityPayLabel = (name) => `Pay $${FACILITY_ACCESS.price} for ${String(name ?? '').trim().split(/\s+/)[0] || 'your athlete'}'s facility access`;

/** "Login: none / not claimed / claimed <date>" for the athlete card. */
export function loginStatusLine({ loginEmail, login } = {}) {
  if (!loginEmail) return 'Login: none';
  if (login && login.state === 'claimed') {
    const day = login.claimedAt ? String(login.claimedAt).slice(0, 10) : null;
    return day ? `Login: claimed ${longDayLabel(day)}` : 'Login: claimed';
  }
  return `Login: not claimed (${loginEmail})`;
}
