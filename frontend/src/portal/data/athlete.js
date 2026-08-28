/**
 * Seed data for the athlete-facing screens: 03 Athlete Dashboard,
 * 06 Practice DNA, 07 Commitment Contract.
 *
 * Read through the hooks in ../hooks, never imported by a screen directly.
 */

import { ALLOWANCE, TODAY } from './seed';

export const ATHLETE = {
  name: 'Jordan',
  fullName: 'Jordan Whitfield',
  date: TODAY,
  allowance: ALLOWANCE,
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

/* ---------------------------------------------------------------- 06 ----- */

/**
 * Six modules, always in this order.
 *
 * Hard constraint from the handoff: no score, grade, letter or percentile
 * anywhere on this screen. Deltas read against the athlete's own last capture
 * only — the Blueprint is explicit that athletes are measured against their own
 * future progress, not a model swing. `stats` below are raw measurements, never
 * a rating.
 */
export const DNA_MODULES = [
  {
    id: 'swing',
    name: 'Swing Biomechanics',
    descriptor: 'Multi-angle video at key positions',
    kind: 'media',
    caption: 'SWING CAPTURE — 4 angles · Nov 14',
  },
  {
    id: 'launch',
    name: 'Launch Monitor',
    descriptor: 'Clubhead and ball speed, smash, carry',
    kind: 'stats',
    stats: [
      { key: 'Clubhead', value: '89 mph' },
      { key: 'Ball speed', value: '128 mph' },
      { key: 'Carry 7i', value: '142 yd' },
    ],
  },
  {
    id: 'mobility',
    name: 'Mobility & Stability',
    descriptor: 'Hip and shoulder rotation, single-leg balance',
    kind: 'stats',
    stats: [
      { key: 'Hip rot.', value: '41°' },
      { key: 'Shoulder', value: '86°' },
      { key: 'Balance', value: '22 sec' },
    ],
  },
  {
    id: 'shortgame',
    name: 'Short Game',
    descriptor: 'Wedge distance control from 30, 50, 70 yd',
    kind: 'stats',
    stats: [
      { key: '30 yd', value: '11 ft' },
      { key: '50 yd', value: '14 ft' },
      { key: '70 yd', value: '19 ft' },
    ],
  },
  {
    id: 'putting',
    name: 'Putting Stroke',
    descriptor: 'Start-line control from 3, 6 and 10 feet',
    kind: 'stats',
    stats: [
      { key: '3 ft', value: '9 / 10' },
      { key: '6 ft', value: '6 / 10' },
      { key: '10 ft', value: '72%' },
    ],
  },
  {
    id: 'mental',
    name: 'Mental Game Intake',
    descriptor: 'Yannick’s questionnaire — pressure and routine',
    kind: 'media',
    caption: 'INTAKE RESPONSES — seeds the Debrief prompts',
  },
];

/** Which modules are captured, per state. Order above never changes. */
export const DNA_STATES = {
  complete: ['swing', 'launch', 'mobility', 'shortgame', 'putting', 'mental'],
  partial: ['swing', 'launch', 'mobility'],
  pending: [],
};

export const DNA_SUMMARY = {
  complete: {
    tone: 'green',
    count: '6 of 6',
    pct: 100,
    title: 'Baseline captured Nov 14',
    body: 'Next re-capture opens Mar 14 — four months on, so the comparison means something.',
  },
  partial: {
    tone: 'yellow',
    count: '3 of 6',
    pct: 50,
    title: 'Baseline partly captured',
    body: 'Short game, putting, and mental intake still open.',
  },
  pending: {
    tone: 'yellow',
    count: '0 of 6',
    pct: 0,
    title: 'Nothing captured yet',
    body: 'Diagnostic Protocol booked for Feb 27. Everything on this screen fills in from it.',
  },
};

/* ---------------------------------------------------------------- 07 ----- */

export const CONTRACT_TIERS = [
  { minutes: 20, description: 'A focused block. Enough to hold a habit through the season.' },
  { minutes: 45, description: 'The standard commitment.', footnote: 'Most common tier' },
  {
    minutes: 95,
    description: 'Two sessions in a day for athletes chasing a college roster spot.',
    footnote: 'Split entries supported — see flag 05',
  },
];



