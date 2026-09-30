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

/* ---------------------------------------------------------------- 11 ----- */

/**
 * Two channels per category, never one master toggle: a schedule change 40
 * minutes before a block needs a push, a progress summary never does.
 *
 * Billing email is locked on; billing push is the parent's choice (K31).
 * Failed-payment notices are transactional, not marketing — a parent who
 * switched everything off would otherwise silently stop hearing that their
 * child's booking is about to be restricted. The lock is per channel
 * (`lockedChannels`), not a category-wide flag: one flag locked push too,
 * against the spec and against notify.js, which only forces billing email.
 */
export const NOTIFICATION_CATEGORIES = [
  {
    id: 'billing',
    name: 'Membership & tokens',
    description: 'Payment problems, token expiry, membership changes',
    email: true,
    push: true,
    lockedChannels: ['email'],
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
    id: 'progress',
    name: 'Progress summaries',
    description: 'Monthly report ahead of the check-in call',
    email: true,
    push: false,
  },
];

/** Whether one channel of a category is locked on (billing email). */
export function channelLocked(category, channel) {
  return (category?.lockedChannels || []).includes(channel);
}

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
    body: 'Jordan has 8 tokens left that expire Wed, Sep 30. Book before then.',
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
