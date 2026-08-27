/**
 * Seed data for the remaining parent screens: 09 Athlete Detail,
 * 10 Billing & Subscription, 11 Notification Preferences.
 */

/* ---------------------------------------------------------------- 09 ----- */

export const ATHLETE_DETAIL = {
  name: 'Jordan Whitfield',
  subline: 'Enrolled Nov 3 · 45 min tier · 8 + 3 package',
  attendance: '94%',
  attendanceLabel: 'attendance since Nov',
  board: '3 of 4',
  boardLabel: 'months on the Board',
};

/**
 * Closure days are excluded from the denominator, which is why December reads
 * low rather than as a failure — the academy was shut Dec 23 to Jan 3.
 */
export const CONTRACT_HISTORY = [
  { month: 'Nov', pct: 96 },
  { month: 'Dec', pct: 71 },
  { month: 'Jan', pct: 93 },
  { month: 'Feb', pct: 92 },
];

export const LIMITED_DATA_CHECKLIST = [
  { id: 'sessions', label: '2 sessions attended', state: 'done' },
  { id: 'diagnostic', label: 'Diagnostic booked Feb 27', state: 'next' },
  { id: 'contract', label: 'Contract starts Mar 1', state: 'todo' },
];

/* ---------------------------------------------------------------- 10 ----- */

/**
 * The Stripe dunning sequence: three retries across ten days, then booking is
 * restricted. Flag 04 — four escalating states cannot all be #FF4444, so the
 * ladder grades and the position in it is drawn rather than implied.
 */
export const DUNNING_LADDER = [
  { label: 'Invoice due', detail: 'Feb 16 · charge declined', step: 0 },
  { label: 'Retry 1', detail: 'Feb 19', step: 1 },
  { label: 'Retry 2', detail: 'Feb 22', step: 2 },
  { label: 'Retry 3', detail: 'Feb 26 · last attempt', step: 3 },
  { label: 'Booking access restricted', detail: 'Feb 26 · all athletes', step: 4 },
];

export const BILLING_STATES = {
  active: {
    tone: 'default',
    badge: { tone: 'green', label: 'Active' },
    title: 'Next charge Mar 1',
    body: 'Billed monthly. Nothing needs attention.',
    cta: null,
    ladderAt: null,
  },
  retry1: {
    tone: 'yellow',
    badge: { tone: 'yellow', label: 'Retry 1 of 3' },
    title: 'Card declined Feb 16',
    body: 'Stripe retries automatically on Feb 19. Booking stays open — nothing is restricted yet. Updating the card now retries immediately.',
    cta: { label: 'Update payment method', variant: 'caution' },
    ladderAt: 1,
  },
  retry3: {
    tone: 'red',
    badge: { tone: 'red', label: 'Retry 3 of 3' },
    title: 'Last automatic attempt Feb 26',
    body: 'Two retries have failed. If Feb 26 fails, booking access is restricted for both athletes the same day. Scheduled sessions already booked are kept.',
    cta: { label: 'Update payment method', variant: 'danger' },
    ladderAt: 3,
  },
  restricted: {
    tone: 'red',
    badge: { tone: 'red', label: 'Restricted' },
    title: 'Booking is paused',
    body: 'The invoice went unpaid through all three retries. Existing bookings are honoured; new bookings and reschedules are blocked until the invoice clears. Contract logging is unaffected.',
    cta: { label: 'Update payment method', variant: 'danger' },
    ladderAt: 4,
  },
};

export const MEMBERSHIP = {
  packageName: '8 + 3 package',
  meta: '2 athletes · billed monthly',
};

export const PAYMENT_METHOD = {
  label: 'Visa ending 4242',
  expires: 'Expires 04/27',
  declining: 'Declining · expires 04/27',
};

export const INVOICES = [
  { id: 'i-feb', month: 'February', date: 'Feb 1', paid: false },
  { id: 'i-jan', month: 'January', date: 'Jan 1', paid: true },
  { id: 'i-dec', month: 'December', date: 'Dec 1', paid: true },
  { id: 'i-nov', month: 'November', date: 'Nov 3', paid: true },
];

/* ---------------------------------------------------------------- 11 ----- */

/**
 * Two channels per category, never one master toggle: a schedule change 40
 * minutes before a block needs SMS, a newsletter never does.
 *
 * Billing is locked on. Failed-payment notices are transactional, not
 * marketing — a parent who switched everything off would otherwise silently
 * stop hearing that their child's booking is about to be restricted.
 */
export const NOTIFICATION_CATEGORIES = [
  {
    id: 'billing',
    name: 'Billing',
    description: 'Charges, failed payments, invoice receipts',
    email: true,
    sms: true,
    locked: true,
    footnote: 'Failed-payment notices always send on at least one channel.',
  },
  {
    id: 'schedule',
    name: 'Schedule changes',
    description: 'Cancellations, closures, block moves',
    email: true,
    sms: true,
  },
  {
    id: 'newsletter',
    name: 'Weekly newsletter',
    description: 'Program updates, coach and fitness corners, alumni',
    email: true,
    sms: false,
  },
  {
    id: 'progress',
    name: 'Progress summaries',
    description: 'Monthly report ahead of the check-in call',
    email: true,
    sms: false,
  },
];

export const NOTIFICATION_NOTE =
  'Failed-payment notices are transactional, not marketing, and stay on by channel choice only. A parent who has switched both channels off still sees the banner on Billing.';
