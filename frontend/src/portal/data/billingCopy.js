/**
 * Per-athlete payment copy and card states (Sprint 20, spec 4.4/4.5, 3.2),
 * PURE - shared by ParentDashboard, AthleteDashboard, Membership, Billing
 * and AthleteDetail so the words cannot drift. `billing` absent == active.
 */
import { format, parseISO } from 'date-fns';
import { BOOKING_OPENS_LABEL, longDayLabel, monthName } from './calendar';
import { householdFacility } from './facility';
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

/*
 * The ONE family facility card (owner ruling 2026-09-30: the add-on is a
 * family add-on, and Elite covers the family - data/facility.js decides the
 * access). `{ state, holder, lapsed }` over the household's hub members;
 * null == no card:
 *   'elite'   a live Elite membership covers everyone - nothing to buy.
 *             `holder` is set only when an add-on subscription is still
 *             live beside it (review 2026-09-30): the family is billed for
 *             something Elite includes, and the card says so
 *   'active' | 'paid-waiver-pending' | 'past_due'   the add-on, read off the
 *             athlete it bills on (`holder`); the waiver stays ops-verified
 *   'offer'   no access yet, and a paid 6, 12 or 16 token athlete to bill it
 *             on: `holder`, the first one - the one who asked at sign-up
 *             ahead of the rest, so this card and the home pending card open
 *             the same checkout. `lapsed` when an earlier add-on ended.
 * No offer (review 2026-09-30) while an Elite athlete is still to pay - the
 * family would end up paying for both - or while the one who asked is still
 * unpaid: the home pending card names that athlete, and a second offer on a
 * sibling could open a second checkout.
 */
export function familyFacilityCard(members) {
  const list = (members || []).filter(Boolean);
  const family = householdFacility(list);
  if (family.source === 'elite') {
    const billed = list.find((m) => m.athleteId === family.holderId && (m.billing?.facility === 'active' || m.billing?.facility === 'past_due')) ?? null;
    return { state: 'elite', holder: billed, lapsed: false };
  }
  if (family.source === 'add-on') {
    const holder = list.find((m) => m.athleteId === family.holderId) ?? null;
    const facility = holder?.billing?.facility ?? null;
    if (facility === 'past_due') return { state: 'past_due', holder, lapsed: false };
    return { state: facility === 'active' && !holder.facilityAccessConsent ? 'paid-waiver-pending' : 'active', holder, lapsed: false };
  }
  if (family.eliteDueId) return null;
  const paid = list.filter((m) => m.package?.kind === 'tokens' && (m.billing?.status ?? 'active') === 'active');
  const asked = paid.find((m) => m.facilityRequested === true) ?? null;
  if (!asked && list.some((m) => facilityRequestState(m) === 'waiting')) return null;
  const holder = asked ?? paid[0] ?? null;
  return holder ? { state: 'offer', holder, lapsed: list.some((m) => m.billing?.facility === 'lapsed') } : null;
}

/** "Family facility access" - without "family" (`self`) for the adult who is their own household. */
export const facilityName = (self = false) => (self ? 'Facility access' : 'Family facility access');
export const FACILITY_COVERS = 'One add-on covers every athlete in your household, and a parent or guardian may come along.';
export const facilityOfferLabel = (self = false) => `Add ${self ? '' : 'family '}facility access · $${FACILITY_ACCESS.price}/month`;
export const facilityOfferBody = (self = false) => `24/7 access to the facility. ${self ? '' : `${FACILITY_COVERS} `}Billed monthly. The signed waiver is checked by the academy before the door opens.`;

const FACILITY_LINES = {
  'paid-waiver-pending': 'paid - waiver pending',
  active: 'active',
  past_due: 'payment past due',
  lapsed: 'lapsed',
};
export function facilityLine(state, self = false) {
  if (state === 'elite') return self ? 'Included with Elite' : 'Included with Elite for your family';
  return FACILITY_LINES[state] ? `${facilityName(self)}: ${FACILITY_LINES[state]}` : null;
}
/** Under the Elite line while an add-on subscription is still live (review 2026-09-30); `staff` is the read-only staff view. */
export function facilityStillBilledLine(self = false, staff = false) {
  if (staff) return 'This family is still paying for the family add-on. Elite includes it - cancel the add-on in Stripe.';
  return `You are still paying for the ${self ? 'facility' : 'family'} add-on. Elite includes it - ask the academy to cancel the add-on.`;
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
/* One family row, never one per child (owner ruling 2026-09-30): nothing here names an athlete. */
export const facilityPendingTitle = (self = false) => `${facilityName(self)} - pay when you're ready`;
export const facilityWaitingLine = (self = false) => `${facilityName(self)} · after the membership is paid`;
export const facilityPayLabel = (self = false) => `Pay $${FACILITY_ACCESS.price} for ${self ? '' : 'family '}facility access`;

/** "Login: none / not claimed / claimed <date>" for the athlete card. */
export function loginStatusLine({ loginEmail, login } = {}) {
  if (!loginEmail) return 'Login: none';
  if (login && login.state === 'claimed') {
    const day = login.claimedAt ? String(login.claimedAt).slice(0, 10) : null;
    return day ? `Login: claimed ${longDayLabel(day)}` : 'Login: claimed';
  }
  return `Login: not claimed (${loginEmail})`;
}
