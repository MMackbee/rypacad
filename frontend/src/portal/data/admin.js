/**
 * Seed data for the admin screens: 15 Admin Dashboard, 16 Staff & Roles,
 * 17 Newsletter Composer.
 */

/* ---------------------------------------------------------------- 15 ----- */

/**
 * The named list, which sits above the metrics on purpose: the screen's job is
 * to answer "who needs a conversation this week", and counts are context for
 * that list rather than the point of the screen.
 */
/**
 * `packageIds` is what the tier filter cuts on: the packages of the athletes a
 * row concerns. A row with no packageIds is org-level (the newsletter) and
 * survives every filter — filtering it out would hide work that still exists.
 */
export const OUTSTANDING = [
  { id: 'o1', who: 'Whitfield household', why: 'Payment failed — retry 2 of 3', tag: 'Billing', tone: 'red', packageIds: ['g-8-3', 'g-4-2'] },
  { id: 'o2', who: 'M. Okonkwo', why: '3 no-shows this month', tag: 'Attendance', tone: 'red', packageIds: ['g-8-3'] },
  { id: 'o3', who: 'R. Sandoval', why: 'Contract at 54% with 6 days left', tag: 'Contract', tone: 'yellow', packageIds: ['g-4-2'] },
  { id: 'o4', who: '2 athletes', why: 'Diagnostic not entered since enrollment', tag: 'Onboarding', tone: 'yellow', packageIds: ['g-4-2'] },
  { id: 'o5', who: 'Issue 14 newsletter', why: 'Fitness Corner outstanding, deadline passed', tag: 'Newsletter', tone: 'yellow', packageIds: null },
];

export const ADMIN_METRICS = {
  enrolled: 117,
  fill: '84%',
  fillLabel: 'average block fill over 4 weeks',
  enrolledLabel: 'enrolled athletes',
};

/** Rendered from data — package names and counts are never hardcoded in a screen. */
export const ENROLLMENT_BY_PACKAGE = [
  { id: 'g-4-2', name: '4 + 2', athletes: 38 },
  { id: 'g-8-3', name: '8 + 3', athletes: 41 },
  { id: 'g-12-4', name: '12 + 4', athletes: 24 },
  { id: 'g-16-4', name: '16 + 4', athletes: 9 },
  { id: 'elite', name: 'Elite', athletes: 5 },
];

/**
 * Friday is the overflow block. Low fill there is the schedule working as
 * designed, not a problem to chase — the caption says so on screen.
 */
export const BLOCK_FILL = [
  { day: 'Mon', pct: 92 },
  { day: 'Tue', pct: 88 },
  { day: 'Wed', pct: 95 },
  { day: 'Thu', pct: 91 },
  { day: 'Fri', pct: 34 },
  { day: 'Sat', pct: 79 },
];

export const TIER_FILTERS = [
  { id: 'all', label: 'All tiers', count: 117 },
  { id: 'g-8-3', label: '8 + 3 only', count: 41 },
];

/* ---------------------------------------------------------------- 16 ----- */

export const STAFF = [
  { id: 's1', name: 'Luke Benoit', role: 'Owner / Program Director', mfa: true, note: 'Full access including the audit log' },
  { id: 's2', name: 'Phil', role: 'Ops Admin', mfa: true },
  { id: 's3', name: 'Yannick', role: 'Mental Performance Coach', mfa: true, note: 'Broadest non-owner access — every read is logged' },
  { id: 's4', name: 'Brock', role: 'Playing Lessons Coach', mfa: true },
  { id: 's5', name: 'Lead Instructor', role: 'Coach · assigned athletes only', mfa: false, note: 'MFA not yet enrolled — required before first login' },
  { id: 's6', name: 'Front Desk', role: 'Coach · scheduling and intake', mfa: false, note: 'MFA not yet enrolled — required before first login' },
];

export const STAFF_ROLES = [
  { id: 'coach', name: 'Coach', scope: 'Attendance and logs for assigned athletes only', mfa: 'required' },
  { id: 'mental', name: 'Mental Performance Coach', scope: 'Mental-game notes academy-wide', mfa: 'required' },
  { id: 'ops', name: 'Ops Admin', scope: 'Fitness completion, billing status, enrollment', mfa: 'required' },
  { id: 'owner', name: 'Owner / Director', scope: 'Full access including staff and audit log', mfa: 'required' },
];

export const AUDIT_NOTE =
  'Every sensitive-record access is written to the audit log from the first release. The log lives behind this screen, owner-only.';

/**
 * Flag 08. Revision 2 moved background-check and working-with-minors training
 * tracking to a spreadsheet outside the app. The Blueprint's rule still stands —
 * no portal credentials before screening is clear — and this is the screen that
 * issues credentials, so with the fields gone nothing in the interface can hold
 * that line. A stated note sits where the fields were rather than a silent gap.
 */
export const SCREENING_NOTE =
  'Background check and working-with-minors training are tracked on a spreadsheet outside the app by decision, so there is no field for them here. The gate is procedural: do not create the account until the spreadsheet says clear.';

/* ---------------------------------------------------------------- 17 ----- */

/**
 * Four standing sections, fixed order, not reorderable. The module's real job is
 * visibility into which sections have landed — the recurring failure is an issue
 * slipping because one contributor did not submit — so this is a checklist first
 * and an editor second.
 */
export const NEWSLETTER_SECTIONS = [
  { id: 'program', name: 'Program Updates', contributor: 'Phil · Ops' },
  { id: 'coach', name: "Coach's Corner", contributor: 'Yannick · Mental performance' },
  { id: 'fitness', name: 'Fitness Corner', contributor: 'Lead Instructor' },
  { id: 'alumni', name: 'Keeping Up with the Ryppers', contributor: 'Alumni · Luke' },
];

/** Which sections have landed, per state. */
export const NEWSLETTER_LANDED = {
  missing: ['program', 'coach'],
  ready: ['program', 'coach', 'fitness', 'alumni'],
  scheduled: ['program', 'coach', 'fitness', 'alumni'],
  sent: ['program', 'coach', 'fitness', 'alumni'],
};

export const NEWSLETTER_ISSUE = { number: 14, date: 'Feb 18' };

export const NEWSLETTER_STATES = {
  missing: {
    pill: { tone: 'yellow', label: 'Draft' },
    banner: { tone: 'yellow', text: 'Deadline passed — Tue Feb 17, 12:00 PM. 2 of 4 sections in.' },
    hint: 'Send unlocks when all four sections are in.',
  },
  ready: {
    pill: { tone: 'green', label: 'Ready' },
    banner: { tone: 'neutral', text: 'All four sections in. Nothing is blocking send.' },
    hint: 'Goes to guardians who opted into the newsletter category.',
  },
  scheduled: {
    pill: { tone: 'green', label: 'Scheduled' },
    banner: { tone: 'neutral', text: 'Sends Thu Feb 18, 6:00 AM to 96 guardians who opted in.' },
    hint: 'Goes to guardians who opted into the newsletter category.',
  },
  sent: {
    pill: { tone: 'neutral', label: 'Sent' },
    banner: { tone: 'neutral', text: 'Sent Thu Feb 18, 6:02 AM · 96 recipients · 71% opened.' },
    hint: 'Goes to guardians who opted into the newsletter category.',
  },
};
