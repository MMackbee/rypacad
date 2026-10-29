/**
 * Seed data for the athlete-facing screens: 03 Athlete Dashboard,
 * 06 Practice DNA, 07 Commitment Contract.
 *
 * Read through the hooks in ../hooks, never imported by a screen directly.
 */

import { TOKENS, TODAY } from './seed';

export const ATHLETE = {
  name: 'Jordan',
  fullName: 'Jordan Whitfield',
  date: TODAY,
  // `allowance` -> `tokens` (contract v2.0, Sprint 12): the two-pool shape
  // is retired in favour of the one derived token position.
  tokens: TOKENS,
};

/* ---------------------------------------------------------------- 03 ----- */

/** Blueprint section 1.2, quoted on the dashboard. */
export const CODE_OF_GRIT = [
  'Try Hard',
  'Train Smart',
  'Support Each Other & Enjoy the Journey',
];

export const ONBOARDING = [
  { id: 'enroll', label: 'Enrollment complete', state: 'done' },
  { id: 'diagnostic', label: 'Diagnostic not booked', state: 'next' },
  { id: 'contract', label: 'Commitment Contract tier', state: 'todo' },
  { id: 'block', label: 'First training block', state: 'todo' },
];

/* ---------------------------------------------------------------- 07 ----- */

/** Read by the athlete's Contract screen and the sign-up contract step, so the two describe a tier the same way. */
export const CONTRACT_TIERS = [
  { minutes: 20, description: 'A focused daily habit. Enough to keep improving all season.' },
  { minutes: 45, description: 'The standard commitment. Most athletes pick this.' },
  {
    // 90, not 95 (owner ruling, 2026-09-22): the academy's own commitment copy
    // offers 20 / 45 / 90, and the portal was the only place saying 95 - it
    // came from the original handoff's "two sessions in a day". An athlete
    // whose record already holds 95 keeps it (the rules still accept the old
    // value) and simply has no matching card until they pick again.
    minutes: 90,
    description: 'For athletes chasing a college roster spot. Can be split across the day.',
  },
];



