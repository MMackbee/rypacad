/**
 * Seed data for the admin screens: 15 Admin Dashboard, 16 Staff & Roles.
 */

/* ---------------------------------------------------------------- 15 ----- */

/**
 * The named list, which sits above the metrics on purpose: the screen's job is
 * to answer "who needs a conversation this week", and counts are context for
 * that list rather than the point of the screen.
 */
/**
 * `packageIds` is what the tier filter cuts on: the packages of the athletes a
 * row concerns. A row with no packageIds is org-level and survives every
 * filter — filtering it out would hide work that still exists.
 */
export const OUTSTANDING = [
  { id: 'o1', who: 'Whitfield household', why: 'Payment failed — retry 2 of 3', tag: 'Billing', tone: 'red', packageIds: ['t-12', 't-6'] },
  { id: 'o2', who: 'M. Okonkwo', why: '3 no-shows this month', tag: 'Attendance', tone: 'red', packageIds: ['t-12'] },
  { id: 'o3', who: 'R. Sandoval', why: 'Contract at 54% with 6 days left', tag: 'Contract', tone: 'yellow', packageIds: ['t-6'] },
  { id: 'o4', who: '2 athletes', why: 'Diagnostic not entered since enrollment', tag: 'Onboarding', tone: 'yellow', packageIds: ['t-6'] },
];

export const ADMIN_METRICS = {
  enrolled: 117,
  fill: '84%',
  fillLabel: 'average block fill over 4 weeks',
  enrolledLabel: 'enrolled athletes',
};

/** Rendered from data — package names and counts are never hardcoded in a screen. */
export const ENROLLMENT_BY_PACKAGE = [
  { id: 't-6', name: '6 tokens', athletes: 38 },
  { id: 't-12', name: '12 tokens', athletes: 41 },
  { id: 't-16', name: '16 tokens', athletes: 24 },
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
  { id: 't-12', label: '8 + 3 only', count: 41 },
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

