/**
 * Static scaffold data for the portal.
 *
 * Every value here comes from docs/portal/design-handoff.md. Where the handoff
 * gives sample data for a screen it is reproduced verbatim, so the build can be
 * diffed against the artboards rather than against invented content.
 *
 * This module is the only place the portal invents data. Screens never import it
 * directly - they read through the hooks in ../hooks, which is the seam that
 * gets swapped for the real API.
 *
 * Dates key off the real calendar (see ./calendar.js): headers show the actual
 * today, allowances reset on the first of the next real month, and bookings
 * reference the generated season's opening week. Session names are the generic
 * "Training block" / "Tournament block" - the Workshop/Lab/Arena rotation was a
 * placeholder, and no invented name ships before real sessions exist to book.
 */

import { BLOCKS } from '../tokens';
import { GOLF_PACKAGES, makeAllowance } from './packages';
import { longDayLabel, nextMonthFirstShort, todayISO } from './calendar';

/** The real current date, formatted for screen headers. */
export const TODAY = longDayLabel(todayISO());

/** Allowances reset on the first of the next real month. */
const RESETS_ON = nextMonthFirstShort(todayISO());

/** Three separate decisions. Media release is optional and never bundled. */
export const CONSENTS = [
  {
    id: 'dataCollection',
    title: 'Data collection',
    body:
      'Name, date of birth, guardian contact, emergency and medical info, and training records. Collected only where a feature needs it.',
    link: 'Read what is stored',
    checked: true,
  },
  {
    id: 'videoCapture',
    title: 'Video capture',
    body:
      'Multi-angle swing video at the Diagnostic and during training blocks, used for coaching review and benchmarked against your athlete’s own progress.',
    link: 'Read retention policy',
    checked: true,
  },
  {
    id: 'mediaRelease',
    title: 'Media release',
    body:
      'Permission to use photos or video of your athlete in RYP marketing. Declining does not affect enrollment or training.',
    link: 'Read media terms',
    checked: false,
    optional: true,
    footnote: 'Optional - enrollment continues either way',
  },
];

export const RELATIONSHIPS = ['Mother', 'Father', 'Guardian', 'Grandparent', 'Other'];

/**
 * Screen 04 — the athlete's bookings, as references into the generated season.
 *
 * These are { date, block } pairs resolved through resolveBooking() in
 * season.js, never freestanding session objects. The first build hand-wrote
 * this list and it contradicted the season within a week: it showed a Friday
 * block the generator doesn't produce (overflow is off) and inverted
 * training/tournament on the Saturday slots, so the same block spent a
 * different allowance pool on My Schedule than on Book a Session. A reference
 * cannot drift: if the schedule changes, the resolved session changes with it,
 * and a reference into a closure resolves to null instead of inventing a
 * session.
 */
export const BOOKED_UPCOMING = [
  { date: '2026-11-02', block: 1, badge: { tone: 'green', label: 'Confirmed' } }, // Mon 4:00 PM, season opener
  { date: '2026-11-07', block: 1 }, // Sat 10:30 AM tournament — spends the other pool
  { date: '2026-11-07', block: 2 }, // Sat 12:30 PM training
  { date: '2026-11-09', block: 2 }, // Mon 5:00 PM
  { date: '2026-11-12', block: 0 }, // Thu 3:00 PM
];

/**
 * Sessions already attended. Empty before the season opens — the Past tab says
 * "Nothing attended yet this season" rather than showing future dates as past.
 */
export const BOOKED_PAST = [];

/**
 * Presidents' Day, Mon Feb 15 2027 - a Blueprint closure date. A cancelled block
 * states plainly that it does not count against the contract, because that is
 * the first question a family asks.
 */
export const CANCELLED_SESSION = {
  id: 'c1',
  dayLabel: 'Monday, Feb 15',
  time: '4:00',
  meridiem: 'PM',
  type: 'cancelled',
  name: 'Training block',
  meta: 'Facility closed',
  banner: {
    title: 'Cancelled by academy',
    body:
      'Presidents’ Day, Mon Feb 15 - facility closed. Your block was cancelled and does not count against your Commitment Contract.',
  },
};

/**
 * The athlete's allowance — two pools, not one.
 *
 * Replaces the old `TIER_RULE = { used: 3, limit: 8 }`, which modelled a single
 * booking pool. Training and tournament entitlements do not substitute for each
 * other: an athlete can have training left with no tournament entries remaining,
 * and every screen that shows a balance has to show both numbers.
 *
 * Jordan is on the 8 + 3 package, which preserves the artboards' "3 of 8" for
 * the training pool while making the second pool visible.
 */
export const ATHLETE_PACKAGE = GOLF_PACKAGES.find((p) => p.id === 'g-8-3');

export const ALLOWANCE = makeAllowance(ATHLETE_PACKAGE, {
  trainingUsed: 3,
  tournamentsUsed: 1,
  resetsOn: RESETS_ON,
});

/** Same package, tournament pool spent — the state a single-pool model hid. */
export const ALLOWANCE_NO_TOURNAMENTS = makeAllowance(ATHLETE_PACKAGE, {
  trainingUsed: 3,
  tournamentsUsed: ATHLETE_PACKAGE.tournaments,
  resetsOn: RESETS_ON,
});

/** Training pool spent, tournament entries still available. */
export const ALLOWANCE_NO_TRAINING = makeAllowance(ATHLETE_PACKAGE, {
  trainingUsed: ATHLETE_PACKAGE.training,
  tournamentsUsed: 1,
  resetsOn: RESETS_ON,
});

export const BOOKING_CONFIRMATION = {
  name: 'Training block',
  when: 'Mon Nov 2 · 4:00 PM',
  pool: 'training',
  email: 'dana@email.com',
  note:
    'Cancel up to 12 hours ahead to keep this as an unlimited makeup rather than a used session.',
};

/** Screen 08. Fixed-height cards regardless of how much data a child has. */
export const HOUSEHOLD = {
  name: 'Whitfield family',
  children: [
    {
      id: 'jordan',
      name: 'Jordan',
      age: 13,
      ageLine: 'Age 13 · 45 min tier',
      standing: { tone: 'green', label: 'On track' },
      next: { type: 'training', when: 'Mon 4:00 PM', meta: 'Training block' },
      contract: 92,
      packageId: 'g-8-3',
      allowance: makeAllowance(GOLF_PACKAGES.find((p) => p.id === 'g-8-3'), {
        trainingUsed: 3,
        tournamentsUsed: 1,
        resetsOn: RESETS_ON,
      }),
    },
    {
      id: 'reese',
      name: 'Reese',
      age: 11,
      ageLine: 'Age 11 · 20 min tier',
      standing: { tone: 'yellow', label: 'Behind' },
      next: { type: 'tournament', when: 'Sat 10:30 AM', meta: 'Tournament block' },
      contract: 54,
      packageId: 'g-4-2',
      /**
       * Reese has training left but no tournament entries — and a tournament is
       * her next session. A single-pool balance would have shown "2 left" and
       * hidden that entirely.
       */
      allowance: makeAllowance(GOLF_PACKAGES.find((p) => p.id === 'g-4-2'), {
        trainingUsed: 2,
        tournamentsUsed: 2,
        resetsOn: RESETS_ON,
      }),
    },
    {
      id: 'nico',
      name: 'Nico',
      age: 9,
      ageLine: 'Age 9 · new Feb 8',
      standing: { tone: 'neutral', label: 'New', dashed: true },
      next: { type: 'training', when: 'Mon 5:00 PM', meta: 'Training block' },
      contract: null,
      packageId: 'g-4-2',
      allowance: makeAllowance(GOLF_PACKAGES.find((p) => p.id === 'g-4-2'), {
        trainingUsed: 0,
        tournamentsUsed: 0,
        resetsOn: RESETS_ON,
      }),
    },
  ],
  billing: { status: 'ok', retryStep: 0 },
};

export const BILLING_ISSUE = {
  status: 'failed',
  retryStep: 2,
  title: 'Payment failed - retry 2 of 3',
  body:
    'Next automatic attempt Feb 22. Booking stays open until Feb 26; after that it is restricted for all three athletes.',
};

/** Screen 12. Coach view is filtered by assignment, never just by role. */
export const COACH = { name: 'Luke', date: TODAY };

export const COACH_BLOCKS = [
  {
    id: 'cb1',
    time: BLOCKS[0],
    type: 'training',
    name: 'Training block',
    meta: 'Sim 1 · 5 expected',
    status: 'closed',
  },
  {
    id: 'cb2',
    time: BLOCKS[1],
    type: 'training',
    name: 'Training block',
    meta: 'Sim Bay 2 · 6 expected',
    status: 'now',
  },
  {
    id: 'cb3',
    time: BLOCKS[2],
    type: 'training',
    name: 'Training block',
    meta: 'Bay 4 · 4 expected',
    status: 'next',
  },
];

/**
 * Concurrent blocks stay as two peer cards, each with its own roster. A coach
 * running two groups needs two separate attendance records, not one merged list.
 */
export const COACH_BLOCKS_CONCURRENT = [
  {
    id: 'cc1',
    time: BLOCKS[1],
    type: 'training',
    name: 'Training block',
    meta: 'Sim Bay 2 · 6 expected',
    status: 'now',
  },
  {
    id: 'cc2',
    time: BLOCKS[1],
    type: 'makeup',
    name: 'Makeup group',
    meta: 'Bay 4 · 3 expected',
    status: 'now',
    footnote: 'Runs against the makeup group below. Two rosters, not one.',
  },
];

export const ATTENTION_LIST = [
  { id: 'a1', name: 'M. Okonkwo', meta: '3 no-shows this month', tone: 'red' },
  { id: 'a2', name: 'R. Sandoval', meta: 'Contract behind - 7 of 13 days', tone: 'yellow' },
];

export const COACH_OUTSTANDING = [
  { id: 'o1', label: 'Diagnostic not entered', detail: '2 athletes' },
  { id: 'o2', label: 'Attendance not closed', detail: '1 block' },
];

/** Screen 13. Six expected, matching the block meta on 12. */
export const SESSION = {
  id: 'cb2',
  type: 'training',
  blockLabel: 'Block 2 of 3',
  name: 'Training block',
  meta: '4:00-5:00 PM · Sim Bay 2 · 6 expected',
  startsIn: 'Starts in 12 min',
};

export const ROSTER = [
  { id: 'r1', name: 'A. Nguyen', meta: 'Age 12 · 4th month' },
  { id: 'r2', name: 'M. Okonkwo', meta: '3 no-shows this month' },
  { id: 'r3', name: 'R. Sandoval', meta: 'Age 14 · contract behind' },
  { id: 'r4', name: 'J. Whitfield', meta: 'Age 13 · 45 min tier' },
  { id: 'r5', name: 'T. Alvarez', meta: 'Age 12 · 2nd month' },
  { id: 'r6', name: 'S. Bergstrom', meta: 'Age 13 · 6th month' },
];

/** Screen 14. Four numeric sections plus the video capture. */
export const DIAGNOSTIC_ATHLETE = {
  name: 'A. Nguyen',
  meta: 'Diagnostic Protocol · Feb 18 · age 12',
};

export const DIAGNOSTIC_SECTIONS = [
  {
    id: 'launch',
    title: 'Launch monitor',
    fields: [
      { id: 'clubhead', label: 'Clubhead speed', unit: 'mph' },
      { id: 'ball', label: 'Ball speed', unit: 'mph' },
      { id: 'smash', label: 'Smash factor', unit: '' },
      { id: 'carry7i', label: 'Carry 7i', unit: 'yd' },
    ],
  },
  {
    id: 'mobility',
    title: 'Mobility & stability',
    fields: [
      { id: 'hip', label: 'Hip rotation', unit: '°' },
      { id: 'shoulder', label: 'Shoulder rotation', unit: '°' },
      { id: 'balance', label: 'Single-leg balance', unit: 'sec' },
    ],
  },
  {
    id: 'shortgame',
    title: 'Short game',
    fields: [
      { id: 'd30', label: '30 yd dispersion', unit: 'ft' },
      { id: 'd50', label: '50 yd dispersion', unit: 'ft' },
      { id: 'd70', label: '70 yd dispersion', unit: 'ft' },
    ],
  },
  {
    id: 'putting',
    title: 'Putting',
    fields: [
      { id: 'p3', label: '3 ft made', unit: '/10' },
      { id: 'p6', label: '6 ft made', unit: '/10' },
      { id: 'p10', label: '10 ft start line', unit: '%' },
    ],
  },
];

/** Code of Grit - Blueprint section 1.2, quoted on the athlete dashboard. */
export const CODE_OF_GRIT = [
  'Try Hard',
  'Train Smart',
  'Support Each Other & Enjoy the Journey',
];
