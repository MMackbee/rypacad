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
 * today, token periods anchor on PERIOD_ANCHOR_DAY (below) and roll from
 * there, and bookings reference the generated season's opening week. Session
 * names are the generic "Training block" / "Tournament block" - the
 * Workshop/Lab/Arena rotation was a placeholder, and no invented name ships
 * before real sessions exist to book.
 *
 * Contract v2.0 (Sprint 12, TEAM.md "Sprint 12 pins - the token model"): the
 * two-pool GOLF_PACKAGES/makeAllowance shapes this file used to build are
 * retired in favour of the ONE token catalogue (TOKEN_PACKAGES) and the
 * derived token position (tokensFor) - see TOKENS/TOKENS_EXHAUSTED and each
 * HOUSEHOLD child's `tokens` field below.
 */

import { BLOCKS } from '../tokens';
import { TOKEN_PACKAGES, periodFor, tokensFor } from './packages';
// DEPRECATED (contract v2.0) - kept ONLY so StatesHarness.js (frontend-
// owned, not this lane's to edit) keeps compiling until the frontend lane
// moves its two-pool AllowancePools gallery states onto the token shapes
// below. See the DEPRECATED block near the bottom of this file and
// packages.js's own DEPRECATED banner, which these two names read from.
import { addDaysISO, longDayLabel, todayISO } from './calendar';

/** The real current date, formatted for screen headers. */
export const TODAY = longDayLabel(todayISO());

/**
 * The seed household's billing-period anchor (contract v2.0, pin B):
 * absent-on-the-real-doc means 1, so this mirrors that default rather than
 * inventing a different one for the demo. `PERIOD` is the current period
 * this anchor produces for `todayISO()` - computed once so every export
 * below (seed dates are always "today", never a fixed calendar date) shares
 * the exact same period boundaries.
 */
export const PERIOD_ANCHOR_DAY = 1;
const PERIOD = periodFor(todayISO(), PERIOD_ANCHOR_DAY);

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
 * training/tournament on the Saturday slots, so the same block read as a
 * different session type on My Schedule than on Book a Session. A reference
 * cannot drift: if the schedule changes, the resolved session changes with it,
 * and a reference into a closure resolves to null instead of inventing a
 * session.
 */
export const BOOKED_UPCOMING = [
  { date: '2026-11-02', block: 1, badge: { tone: 'green', label: 'Confirmed' } }, // Mon 4:00 PM, season opener
  { date: '2026-11-07', block: 1 }, // Sat 10:30 AM tournament
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
 * The athlete's ONE token pool (contract v2.0, Sprint 12 pin B/N — replaces
 * the two-pool ALLOWANCE this file used to build). t-12 is the pinned seed
 * package ("the seed athlete on t-12 with a periodAnchorDay 1 household",
 * TEAM.md Sprint 12 pins) — 12 tokens/period, a reasonable successor to the
 * old 8+3 golf package's 11 sessions/month.
 */
export const ATHLETE_PACKAGE = TOKEN_PACKAGES.find((p) => p.id === 't-12');

/**
 * Synthetic booking rows spending `n` tokens THIS period - dates are `today`
 * unconditionally (never a fixed seed date) so these always land in the
 * live period whenever the demo is viewed, mirroring the old ALLOWANCE's
 * dynamic RESETS_ON.
 */
function tokenRows(n) {
  const today = todayISO();
  const rows = [];
  for (let i = 0; i < n; i++) rows.push({ periodKey: PERIOD.periodKey, status: 'confirmed', date: today });
  return rows;
}

/**
 * The athlete's token position — one pool, not two. 4 used mirrors the old
 * two-pool demo's total spend exactly (3 training + 1 tournament).
 */
export const TOKENS = tokensFor(null, ATHLETE_PACKAGE, tokenRows(4), [], [], PERIOD.periodKey, {
  today: todayISO(),
});

/**
 * Same package, every token spent — the "nothing left" demo state the old
 * two independent pool-exhaustion states (ALLOWANCE_NO_TOURNAMENTS/
 * ALLOWANCE_NO_TRAINING) both collapse into under one pool.
 */
export const TOKENS_EXHAUSTED = tokensFor(
  null,
  ATHLETE_PACKAGE,
  tokenRows(ATHLETE_PACKAGE.tokens),
  [],
  [],
  PERIOD.periodKey,
  { today: todayISO() }
);

export const BOOKING_CONFIRMATION = {
  name: 'Training block',
  when: 'Mon Nov 2 · 4:00 PM',
  email: 'dana@email.com',
  note: 'Cancel until the day before the session to keep your token.',
};

/** Screen 08. Fixed-height cards regardless of how much data a child has. */
export const HOUSEHOLD = {
  name: 'Whitfield family',
  children: [
    {
      id: 'jordan',
      name: 'Jordan',
      // Owner-supplied dob 2012-06-17 (2026-09-10) — 14 now and at season
      // start, bracket 14+. Kept in sync with scripts/seed-firestore.mjs.
      age: 14,
      ageLine: 'Age 14 · 45 min tier',
      standing: { tone: 'green', label: 'On track' },
      next: { type: 'training', when: 'Mon 4:00 PM', meta: 'Training block' },
      contract: 92,
      // Contract v2.0 pin A: `fitnessPackageId` is retired - one package
      // pointer now. t-12 matches ATHLETE_PACKAGE/TOKENS above (jordan is
      // the seed's "signed-in athlete" fixture, SEED_ATHLETE_ID in hooks).
      packageId: 't-12',
      tokens: tokensFor(null, TOKEN_PACKAGES.find((p) => p.id === 't-12'), tokenRows(4), [], [], PERIOD.periodKey, {
        today: todayISO(),
      }),
    },
    {
      id: 'reese',
      name: 'Reese',
      // Owner-supplied dob 2014-03-02 — 12 now and at season start, 11-13.
      age: 12,
      ageLine: 'Age 12 · 20 min tier',
      standing: { tone: 'yellow', label: 'Behind' },
      next: { type: 'tournament', when: 'Sat 10:30 AM', meta: 'Tournament block' },
      contract: 54,
      packageId: 't-6',
      // 4 of 6 used - the same total spend her old two-pool demo modelled
      // (2 training + 2 tournament), now one number under one pool.
      tokens: tokensFor(null, TOKEN_PACKAGES.find((p) => p.id === 't-6'), tokenRows(4), [], [], PERIOD.periodKey, {
        today: todayISO(),
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
      packageId: 't-6',
      tokens: tokensFor(null, TOKEN_PACKAGES.find((p) => p.id === 't-6'), tokenRows(0), [], [], PERIOD.periodKey, {
        today: todayISO(),
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
  { id: 'r4', name: 'J. Whitfield', meta: 'Age 14 · 45 min tier' },
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

/**
 * One live grace token for the harness (contract v2.1, Sprint 13 pin E) —
 * reese (HOUSEHOLD's second child) holds a bonus token from a session the
 * academy cancelled, expiring 20 days out from whenever the demo is viewed
 * (never a fixed calendar date — this file's "today, unconditionally"
 * discipline for every seed date, same as PERIOD/TOKENS above).
 */
export const GRACE_TOKEN = {
  id: 'seed-grace-1',
  athleteId: 'reese',
  expiresAt: addDaysISO(todayISO(), 20),
  reason: 'session-cancelled',
};

/**
 * One waitlisted entry for the harness (contract v2.1, Sprint 13 pin F) —
 * nico (HOUSEHOLD's third child) waitlisted for a real generated-season
 * block, position 2 (a believable non-1 position so the "position" copy is
 * exercised, not the trivial case). `sessionRef` follows the exact
 * `{date, block}` convention BOOKED_UPCOMING/BOOKED_PAST already use —
 * resolved against the real season by hooks/index.js's resolveBooking, the
 * same "a reference cannot drift" discipline those lists document.
 */
export const WAITLIST_ENTRY = {
  athleteId: 'nico',
  sessionRef: { date: '2026-11-09', block: 0 }, // Mon 3:00 PM, distinct from jordan's own Nov 9 booking (block 2)
  position: 2,
};

/**
 * A past_due membership variant for the harness (contract v2.1, Sprint 13
 * pin H) — the Membership screen's status-line demo state. The live
 * HOUSEHOLD fixture stays active (mirroring the emulator's real Whitfield
 * seed); this is a second, harness-only shape so StatesHarness can show the
 * paused-bookings copy without a second live household to maintain.
 */
export const PAST_DUE_MEMBERSHIP = {
  status: 'past_due',
  currentPeriodEnd: PERIOD.periodEnd,
};

/** Code of Grit - Blueprint section 1.2, quoted on the athlete dashboard. */
export const CODE_OF_GRIT = [
  'Try Hard',
  'Train Smart',
  'Support Each Other & Enjoy the Journey',
];

