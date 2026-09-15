/**
 * Specialist 1-on-1s — Phil (performance coaching) and Yannick (mental game),
 * bookable through the app like any other session (Sprint 9 pins,
 * docs/portal/TEAM.md "Sprint 9 pins — specialist 1-on-1s (Phil & Yannick),
 * Lifetime-style booking, cancellation" + contract v1.7).
 *
 * Design keystone (the pin's own words): a specialist session IS a session
 * with its own capacity and its own pool. Nothing new is invented at the
 * data-model level — the existing booking transaction
 * (hooks/live.js#createBooking), parent book-for-kid, My Schedule derivation
 * and attendance all apply UNCHANGED. This file is the one small catalogue
 * those paths (and hooks/index.js#useSpecialistSlots) read from — the same
 * job data/tour.js does for the Tour.
 *
 * Capacity (amendment v1.7.1, owner's ruling 2026-09-11): Phil's sessions
 * "operate just like academy training session just at a cap of 6-7 kids" —
 * capacity 6 (a one-value change here + the sync script's mirrored map if
 * the owner says 7). Yannick's stay true 1:1 at capacity 1. `capacity` here
 * feeds the demo/seed branches; PRODUCTION capacity is written by
 * scripts/sync-calendar-sessions.mjs's own per-type map (a dependency-free
 * mirror, same arrangement as the seed script's BRACKETS copy — change one,
 * change both).
 *
 * `id` doubles as the sessions.type value a specialist slot carries in
 * Firestore. Production sessions come from the Google Calendar sync (db
 * lane's sync-calendar-sessions.mjs classifyTitle: first word 'Phil' -> phil,
 * 'Mental'/'Yannick' -> mental); the emulator seed hand-adds slots with ids
 * `YYYY-MM-DD-s<n>` following the same '-x0 extras' convention as the rest of
 * the season — the generator never invents them, and neither does this file.
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
 * this — a specialist slot leaking into them crashed the two-pool
 * allowance math, which has no 'specialist' pool by design (surface scan,
 * 2026-09-11, blocker D1).
 */
export const SPECIALIST_TYPE_IDS = new Set(SPECIALISTS.map((s) => s.id));

/** Whether a sessions.type belongs to a specialist, not the group flow. */
export function isSpecialistType(type) {
  return SPECIALIST_TYPE_IDS.has(type);
}

/**
 * Per-athlete, per-specialist-TYPE, per-calendar-month cap — owner-tunable,
 * this is the single knob. Phil and Yannick each get their OWN
 * SPECIALIST_MONTHLY_CAP (a kid can book 2 Phil sessions AND 2 Yannick
 * sessions in the same month, never a shared pool of one number split two
 * ways). Counted the same derive-don't-store way every other allowance in
 * this app is: the athlete's non-cancelled bookings of that session TYPE in
 * the calendar month (hooks/live.js#assertWithinMonthlyCap's specialist
 * branch) — there is no stored counter to drift, and retuning this number
 * changes nothing already booked, only what books next.
 *
 * Deliberately NOT the Elite package's yannickSessions field (data/packages.js's
 * ELITE_TIERS): that count is still `null` — Yannick's entitlement for an
 * Elite athlete is undecided, so EVERY athlete's Yannick (mental) bookings —
 * Elite or not — answer to this one flat cap and nothing else. Do not read
 * yannickSessions from here or from anywhere a mental booking is gated; it
 * stays unsurfaced by design, not by oversight.
 *
 * Phil is DIFFERENT as of Sprint 11 amendment v1.9.1 (owner ruling,
 * 2026-09-15, "Elite includes 16 Phil sessions a month"): ELITE_TIERS'
 * `philSessions` is now a real, decided number (16) that
 * data/packages.js#entitlementsFor reads directly for an Elite athlete with
 * no fitness package — this cap (SPECIALIST_MONTHLY_CAP) only backs Phil's
 * entitlement when neither a fitness package nor Elite applies (source
 * 'none' in entitlementsFor's terms, i.e. limit 0 - no cap benefit at all).
 */
export const SPECIALIST_MONTHLY_CAP = 2;

/**
 * Rolling booking window, in days from today (not a calendar month) — how
 * far ahead useSpecialistSlots offers slots for on the day strip. Production
 * availability itself comes from the Google Calendar sync; this only bounds
 * how much of it one screen load shows.
 */
export const SPECIALIST_BOOKING_WINDOW_DAYS = 14;
