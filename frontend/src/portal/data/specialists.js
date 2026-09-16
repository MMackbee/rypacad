/**
 * Specialist sessions — Phil (performance coaching, group blocks) and
 * Yannick (mental game, true 1:1), bookable through the app like any other
 * session. Originally the Sprint 9 pins (docs/portal/TEAM.md "Sprint 9 pins
 * — specialist 1-on-1s", contract v1.7); REWRITTEN for the token model
 * (Sprint 12 pin K, contract v2.0).
 *
 * Design keystone, updated: a specialist session IS a session — its own
 * capacity, its own weekly slots — but it no longer has its own POOL. A
 * Phil or Yannick booking spends an ordinary token exactly like a training
 * or tournament block (contract v2.0 §1: "these sessions can also be used
 * as Yannick sessions as well"); the only thing still specific to a
 * specialist type is Yannick's monthly cadence (SPECIALIST_MONTHLY_CAP.mental,
 * below) and the booking window, which now comes from the athlete's own
 * PACKAGE (data/packages.js#windowDaysFor) rather than a fixed rolling
 * count this file used to own (SPECIALIST_BOOKING_WINDOW_DAYS is deleted —
 * see hooks/index.js#useSpecialistSlots). The booking transaction
 * (hooks/live.js#createBooking), parent book-for-kid, My Schedule
 * derivation and attendance all apply UNCHANGED. This file is still the one
 * small catalogue those paths (and hooks/index.js#useSpecialistSlots) read
 * from — the same job data/tour.js does for the Tour — now for DISPLAY
 * (name, discipline, capacity, copy) only; it grants no entitlement.
 *
 * Capacity (amendment v1.7.1, owner's ruling 2026-09-11, unchanged by the
 * token model): Phil's sessions "operate just like academy training session
 * just at a cap of 6-7 kids" — capacity 6. Yannick stays true 1:1 at
 * capacity 1. `capacity` here feeds the demo/seed branches; PRODUCTION
 * capacity is written by scripts/sync-calendar-sessions.mjs's own per-type
 * map (`{ training: 15, tournament: 15, phil: 6, mental: 1 }`, contract
 * v2.0 pin J — a dependency-free mirror, change one, change both).
 *
 * `id` doubles as the sessions.type value a specialist slot carries in
 * Firestore, unchanged. Production sessions come from the Google Calendar
 * sync (db lane's sync-calendar-sessions.mjs classifyTitle: first word
 * 'Phil' -> phil, 'Mental'/'Yannick' -> mental); the emulator seed hand-adds
 * slots with ids `YYYY-MM-DD-s<n>` following the same '-x0 extras'
 * convention as the rest of the season — the generator never invents them,
 * and neither does this file.
 */
export const SPECIALISTS = [
  {
    id: 'phil',
    name: 'Phil',
    discipline: 'Performance coaching',
    sessionNoun: 'Performance session',
    capacity: 6,
    whatToExpect:
      'Small-group performance training — strength, speed and athleticism for golf, capped at six athletes.',
  },
  {
    id: 'mental',
    name: 'Yannick',
    discipline: 'Mental game',
    sessionNoun: 'Mental game session',
    capacity: 1,
    whatToExpect: 'One-on-one mental game work — focus, routine and course management.',
  },
];

/**
 * The session types that belong to the specialist surfaces and NOT to the
 * group training/tournament booking flow. The group surfaces (Book a
 * Session's week list and month calendar, the coach's own day) filter on
 * this — a specialist slot leaking into them crashed the allowance math
 * before it existed (surface scan, 2026-09-11, blocker D1); under the token
 * model there is no separate pool to crash, but the two flows still have
 * separate booking screens and this filter still keeps them apart.
 */
export const SPECIALIST_TYPE_IDS = new Set(SPECIALISTS.map((s) => s.id));

/** Whether a sessions.type belongs to a specialist, not the group flow. */
export function isSpecialistType(type) {
  return SPECIALIST_TYPE_IDS.has(type);
}

/**
 * Per-specialist-TYPE, per-calendar-month FREQUENCY knob (contract v2.0,
 * Sprint 12 pin K — supersedes the Sprint 9/11 flat per-athlete cap this
 * same name used to hold). Under the token model a specialist session
 * spends an ordinary token like any other booking — Phil and Yannick have
 * no allowance of their own to cap — so this is no longer a pool limit at
 * all. It is a CADENCE rule: `{ phil: null, mental: 1 }`.
 *
 *   phil: null    tokens are the only limit on Phil sessions. Phil runs
 *                 group blocks (capacity 6) just like training/tournament
 *                 blocks; nothing about booking one is special once it
 *                 spends a token, so there is no separate knob to keep in
 *                 sync with anything.
 *   mental: 1     Yannick's per-athlete cadence — the owner's stated
 *                 "one visit every 3-4 weeks" expressed as one
 *                 attended-or-confirmed 'mental' booking per CALENDAR
 *                 month (hooks/live.js#assertWithinPeriodCap's mental-only
 *                 branch). Owner-tunable single number, same "retuning
 *                 changes nothing already booked, only what books next"
 *                 promise every other derived cap in this app makes. This
 *                 is a frequency rule, not a pool — it never creates an
 *                 allowance, and it is the ONE place a booking cap check is
 *                 allowed to branch on `sessions.type` (contract v2.0's own
 *                 design keystone: "charging never branches on type" — this
 *                 is the named exception, not the pool model coming back).
 *
 * Elite bookings still answer to `mental: 1` — the cadence rule is
 * independent of the token pool (Elite has no pool to cap), and the owner's
 * "1:1 time" cadence applies to every athlete alike.
 */
export const SPECIALIST_MONTHLY_CAP = { phil: null, mental: 1 };
