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
 * The scaffold is set in February 2027, matching the artboards (Thursday Feb 18,
 * Presidents' Day closure Mon Feb 15, billing cycle resetting Mar 1).
 */

import { BLOCKS } from '../tokens';
import { GOLF_PACKAGES, makeAllowance } from './packages';

export const TODAY = 'Thursday, Feb 18';

/**
 * Flag 06: tier names, count, prices and inclusions are all open. The only
 * decided fact is that exactly one tier is unlimited. Nothing here is a proposed
 * name - "Tier A/B/C" are deliberately placeholder labels, and the inclusions
 * are the Blueprint's real comparison axes (days per week, coach access, licence
 * access, application requirement) rather than invented benefits.
 */
export const TIERS = [
  {
    id: 'tier-a',
    name: 'Tier A',
    season: 'Limited access',
    rows: [
      'Booking limit per billing cycle',
      'Unlimited makeup rescheduling',
      'Fitness logging and Commitment Contract',
    ],
    foot: null,
    unlimited: false,
  },
  {
    id: 'tier-b',
    name: 'Tier B',
    season: 'Limited access',
    rows: [
      'Higher booking limit',
      'Saturday tournament eligibility',
      'Fitness logging and Commitment Contract',
    ],
    foot: null,
    unlimited: false,
  },
  {
    id: 'tier-c',
    name: 'Tier C',
    season: 'Unlimited access',
    rows: [
      'Books any open block, any date',
      'Saturday tournament eligibility',
      'Priority on Friday overflow blocks',
    ],
    foot: 'One tier grants unlimited access - decided. Which tier, and what it is called, is not.',
    unlimited: true,
  },
];

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

/** Screen 04 sample data, revision-2 accurate. */
export const SCHEDULE = [
  {
    id: 's1',
    dayLabel: 'Today',
    isToday: true,
    time: '4:00',
    meridiem: 'PM',
    type: 'training',
    name: 'The Lab',
    meta: 'Sim 2 · Luke',
    badge: { tone: 'green', label: 'Confirmed' },
  },
  {
    id: 's2',
    dayLabel: 'Friday, Feb 19',
    time: '4:00',
    meridiem: 'PM',
    type: 'training',
    name: 'The Workshop',
    meta: 'Overflow · Luke',
    badge: { tone: 'neutral', label: 'Friday overflow block' },
  },
  {
    id: 's3',
    dayLabel: 'Saturday, Feb 20',
    time: '8:30',
    meridiem: 'AM',
    type: 'tournament',
    name: 'The Arena',
    meta: 'Brock · net scoring',
  },
  {
    id: 's4',
    dayLabel: 'Saturday, Feb 20',
    time: '10:30',
    meridiem: 'AM',
    type: 'training',
    name: 'The Lab',
    meta: 'Bay 4 · Luke',
  },
  {
    id: 's5',
    dayLabel: 'Monday, Feb 22',
    time: '5:00',
    meridiem: 'PM',
    type: 'training',
    name: 'The Workshop',
    meta: 'Sim 1 · Luke',
  },
];

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
  name: 'The Workshop',
  meta: 'Facility closed',
  banner: {
    title: 'Cancelled by academy',
    body:
      'Presidents’ Day, Mon Feb 15 - facility closed. Your block was cancelled and does not count against your Commitment Contract.',
  },
};

/** Screen 05. Slots are generated against the one BLOCKS constant. */
export const BOOKING_DATES = [
  { date: '18', dow: 'Thu', available: true },
  { date: '19', dow: 'Fri', available: true },
  { date: '20', dow: 'Sat', available: true },
  { date: '22', dow: 'Mon', available: true },
  { date: '23', dow: 'Tue', available: true },
  { date: '24', dow: 'Wed', available: false },
  { date: '25', dow: 'Thu', available: true },
];

export const SLOTS = [
  {
    id: 'b1',
    time: BLOCKS[0],
    type: 'training',
    name: 'The Workshop',
    meta: 'Sim 1 · Luke',
    capacity: { state: 'available', label: '6 left' },
  },
  {
    id: 'b2',
    time: BLOCKS[1],
    type: 'training',
    name: 'The Lab',
    meta: 'Sim 2 · Luke',
    capacity: { state: 'full', label: 'Full' },
    note:
      'Join the waitlist - you are notified if a spot opens, and unlimited makeups still apply.',
  },
  {
    id: 'b3',
    time: BLOCKS[2],
    type: 'training',
    name: 'The Arena',
    meta: 'Bay 4 · Brock',
    capacity: { state: 'available', label: '2 left' },
  },
  /**
   * A tournament block in the same list as training blocks — this is the case
   * the one-pool model could not express. It spends a different entitlement, so
   * it stays bookable when training is exhausted and blocked when tournaments
   * are, independently of everything above it.
   */
  {
    id: 'b4',
    time: '10:30 AM',
    type: 'tournament',
    name: 'The Arena',
    meta: 'Sat Feb 20 · Brock · net scoring',
    capacity: { state: 'available', label: '9 left' },
  },
];

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
  resetsOn: 'Mar 1',
});

/** Same package, tournament pool spent — the state a single-pool model hid. */
export const ALLOWANCE_NO_TOURNAMENTS = makeAllowance(ATHLETE_PACKAGE, {
  trainingUsed: 3,
  tournamentsUsed: ATHLETE_PACKAGE.tournaments,
  resetsOn: 'Mar 1',
});

/** Training pool spent, tournament entries still available. */
export const ALLOWANCE_NO_TRAINING = makeAllowance(ATHLETE_PACKAGE, {
  trainingUsed: ATHLETE_PACKAGE.training,
  tournamentsUsed: 1,
  resetsOn: 'Mar 1',
});

export const BOOKING_CONFIRMATION = {
  name: 'The Workshop',
  when: 'Thu Feb 18 · 3:00 PM',
  coach: 'Luke',
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
      next: { type: 'training', when: 'Today 4:00 PM', meta: 'The Lab · Sim 2 · Luke' },
      contract: 92,
      packageId: 'g-8-3',
      allowance: makeAllowance(GOLF_PACKAGES.find((p) => p.id === 'g-8-3'), {
        trainingUsed: 3,
        tournamentsUsed: 1,
        resetsOn: 'Mar 1',
      }),
    },
    {
      id: 'reese',
      name: 'Reese',
      age: 11,
      ageLine: 'Age 11 · 20 min tier',
      standing: { tone: 'yellow', label: 'Behind' },
      next: { type: 'tournament', when: 'Sat 8:30 AM', meta: 'The Arena · Brock' },
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
        resetsOn: 'Mar 1',
      }),
    },
    {
      id: 'nico',
      name: 'Nico',
      age: 9,
      ageLine: 'Age 9 · new Feb 8',
      standing: { tone: 'neutral', label: 'New', dashed: true },
      next: { type: 'training', when: 'Mon 5:00 PM', meta: 'The Workshop · Luke' },
      contract: null,
      packageId: 'g-4-2',
      allowance: makeAllowance(GOLF_PACKAGES.find((p) => p.id === 'g-4-2'), {
        trainingUsed: 0,
        tournamentsUsed: 0,
        resetsOn: 'Mar 1',
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
    name: 'The Workshop',
    meta: 'Sim 1 · 5 expected',
    status: 'closed',
  },
  {
    id: 'cb2',
    time: BLOCKS[1],
    type: 'training',
    name: 'The Lab',
    meta: 'Sim Bay 2 · 6 expected',
    status: 'now',
  },
  {
    id: 'cb3',
    time: BLOCKS[2],
    type: 'training',
    name: 'The Arena',
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
    name: 'The Lab',
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
  name: 'The Lab',
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
