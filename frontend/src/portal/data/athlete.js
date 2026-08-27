/**
 * Seed data for the athlete-facing screens: 03 Athlete Dashboard,
 * 06 Practice DNA, 07 Commitment Contract.
 *
 * Read through the hooks in ../hooks, never imported by a screen directly.
 */

import { ALLOWANCE } from './seed';

export const ATHLETE = {
  name: 'Jordan',
  fullName: 'Jordan Whitfield',
  date: 'Thursday, Feb 18',
  allowance: ALLOWANCE,
};

/* ---------------------------------------------------------------- 03 ----- */

export const NEXT_SESSION = {
  label: 'Next session · today',
  countdown: 'in 5h 20m',
  type: 'training',
  block: 'Block 2 of 3',
  rotation: 'The Lab',
  time: '4:00 PM',
  bay: 'Sim 2',
  coach: 'Luke',
};

export const CONTRACT_SUMMARY = {
  logged: 12,
  total: 13,
  month: 'February',
  pct: 92,
  tierMinutes: 45,
  line: '45 min per day, 5 days a week. 6 contract days left this month.',
};

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

/**
 * February 2027 starts on a Monday, so a Monday-first grid needs no offset and
 * the month is exactly 28 cells / 4 rows.
 *
 * Contract days are weekdays only. Feb 15 is a Presidents' Day closure, which
 * is why the month has 19 contract days rather than 20 — a closure is never
 * counted against an athlete, and renders visually distinct from a missed day.
 */
export const CONTRACT_MONTH = { label: 'February 2027', days: 28, closures: [15], today: 18 };

export const CONTRACT_TIERS = [
  { minutes: 20, description: 'A focused block. Enough to hold a habit through the season.' },
  { minutes: 45, description: 'The standard commitment.', footnote: 'Most common tier' },
  {
    minutes: 95,
    description: 'Two sessions in a day for athletes chasing a college roster spot.',
    footnote: 'Split entries supported — see flag 05',
  },
];

/** Day-by-day grid for a given state. Weekends and closures are recessive. */
export function contractGrid(state) {
  const { days, closures, today } = CONTRACT_MONTH;
  const missedDays = state === 'behind' ? [3, 5, 10, 11, 17, 18] : [11];

  return Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const dow = (day - 1) % 7; // 0 = Monday, February 2027 starts on a Monday
    const weekend = dow >= 5;

    if (weekend) return { day, state: 'weekend' };
    if (closures.includes(day)) return { day, state: 'closed' };
    if (state === 'complete') return { day, state: 'logged' };
    if (day > today) return { day, state: 'open' };
    return { day, state: missedDays.includes(day) ? 'missed' : 'logged' };
  });
}

export const CONTRACT_STATES = {
  ontrack: {
    badge: { tone: 'green', label: 'On track' },
    logged: 12,
    line: '12 of 13 days due so far. Six contract days left — one miss still keeps the month.',
    hint: 'One tap. Nothing else on this screen needs typing.',
    streak: 4,
    minutes: 540,
    daysLeft: 6,
  },
  behind: {
    badge: { tone: 'red', label: 'Behind' },
    logged: 7,
    line: 'Six days behind with six contract days left. Every remaining day has to be logged to make the Commitment Board.',
    hint: 'Missed a day? Tap it in the grid to add a late entry.',
    streak: 0,
    minutes: 315,
    daysLeft: 6,
  },
  complete: {
    badge: { tone: 'yellow', label: 'Complete' },
    logged: 19,
    line: 'All 19 contract days logged. You are on February’s Commitment Board.',
    hint: 'Weekends are not contract days.',
    streak: 19,
    minutes: 855,
    daysLeft: 0,
  },
};

export const CONTRACT_TOTAL_DAYS = 19;
