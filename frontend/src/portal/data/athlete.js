/**
 * Seed data for the athlete-facing screens: 03 Athlete Dashboard.
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
  { id: 'contract', label: 'Commitment Contract', state: 'todo' },
  { id: 'block', label: 'First training block', state: 'todo' },
];
