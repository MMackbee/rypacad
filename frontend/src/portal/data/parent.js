/**
 * Seed data for the remaining parent screens: 09 Athlete Detail,
 * 10 Billing & Subscription, 11 Notification Preferences.
 */

/* ---------------------------------------------------------------- 09 ----- */

export const ATHLETE_DETAIL = {
  name: 'Jordan Whitfield',
  subline: 'Enrolled Nov 3 · 45 min tier · 12 tokens package',
  // Sprint 11 (contract v1.9, E): the package pointer the membership editor
  // preselects from; matches the emulator seed's jordan. `fitnessPackageId`
  // is DROPPED (contract v2.0, Sprint 12 pin A: the field is retired).
  packageId: 't-12',
  // Sprint 12 integration: the household the editor's period anchor belongs to.
  householdId: 'whitfield',
  householdName: 'Whitfield family',
  periodAnchorDay: 1,
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
    name: 'Membership & tokens',
    description: 'Payment problems, token expiry, membership changes',
    email: true,
    push: true,
    locked: true,
    footnote: 'Always sent by email; push is your choice.',
  },
  {
    id: 'schedule',
    name: 'Sessions',
    description: 'Confirmations, reminders, waitlist spots, cancellations',
    email: true,
    push: true,
  },
  {
    id: 'newsletter',
    name: 'Weekly newsletter',
    description: 'Program updates, coach and fitness corners, alumni',
    email: true,
    push: false,
  },
  {
    id: 'progress',
    name: 'Progress summaries',
    description: 'Monthly report ahead of the check-in call',
    email: true,
    push: false,
  },
];

export const NOTIFICATION_NOTE =
  'Membership and token notices are transactional, not marketing, and always go out by email. A parent who has switched push off still sees the banner on Billing.';

/**
 * Practice-mode "Recent notices" (contract v2.2, Sprint 14): the sample
 * Whitfield household's newest ledger rows, in the exact shape the Cloud
 * Functions write to `notifications/{kind}_{subjectKey}` — titles and
 * bodies as sent, a channel outcome per recipient. Times are relative to now
 * so the "ago" labels read naturally whenever the walkthrough runs.
 */
export const SEED_NOTICES = [
  {
    id: 'tokens-expiring_jordan_sample',
    kind: 'tokens-expiring',
    category: 'billing',
    householdId: 'whitfield',
    athleteId: 'jordan',
    sessionId: null,
    bookingId: null,
    title: 'Tokens expiring soon',
    body: 'Jordan has 3 tokens left that expire Wed, Sep 30. Book before then.',
    recipients: [{ uid: 'parent-dana', email: 'sent', push: 'no-device' }],
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'session-cancelled_reese_2026-11-11-0',
    kind: 'session-cancelled',
    category: 'schedule',
    householdId: 'whitfield',
    athleteId: 'reese',
    sessionId: '2026-11-11-0',
    bookingId: 'reese_2026-11-11-0',
    title: 'Session cancelled',
    body: "Training on Wed, Nov 11 was cancelled by the academy. A bonus token was added to Reese's account (expires Tue, Oct 6).",
    recipients: [{ uid: 'parent-dana', email: 'sent', push: 'no-device' }],
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: 'booking-confirmed_jordan_2026-11-16-w0',
    kind: 'booking-confirmed',
    category: 'schedule',
    householdId: 'whitfield',
    athleteId: 'jordan',
    sessionId: '2026-11-16-w0',
    bookingId: 'jordan_2026-11-16-w0',
    title: 'Session booked',
    body: 'Jordan is booked: Training, Mon, Nov 16 at 3:30 PM.',
    recipients: [
      { uid: 'athlete-jordan', email: 'sent', push: 'no-device' },
      { uid: 'parent-dana', email: 'sent', push: 'no-device' },
    ],
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
];
