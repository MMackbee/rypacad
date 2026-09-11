/**
 * Specialist 1-on-1s — Phil (performance coaching) and Yannick (mental game),
 * bookable through the app like any other session (Sprint 9 pins,
 * docs/portal/TEAM.md "Sprint 9 pins — specialist 1-on-1s (Phil & Yannick),
 * Lifetime-style booking, cancellation" + contract v1.7).
 *
 * Design keystone (the pin's own words): a specialist 1-on-1 IS a session
 * with capacity 1 and its own pool. Nothing new is invented at the data-model
 * level — the existing booking transaction (hooks/live.js#createBooking),
 * parent book-for-kid, My Schedule derivation and attendance all apply
 * UNCHANGED. This file is the one small catalogue those paths (and
 * hooks/index.js#useSpecialistSlots) read from — the same job data/tour.js
 * does for the Tour.
 *
 * `id` doubles as the sessions.type value a specialist slot carries in
 * Firestore. Production sessions come from the Google Calendar sync (db
 * lane's sync-calendar-sessions.mjs classifyTitle: first word 'Phil' -> phil,
 * 'Mental'/'Yannick' -> mental); the emulator seed hand-adds slots with ids
 * `YYYY-MM-DD-s<n>` following the same '-x0 extras' convention as the rest of
 * the season — the generator never invents them, and neither does this file.
 */
export const SPECIALISTS = [
  { id: 'phil', name: 'Phil', discipline: 'Performance coaching', sessionNoun: 'Performance session' },
  { id: 'mental', name: 'Yannick', discipline: 'Mental game', sessionNoun: 'Mental game session' },
];

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
 * Deliberately NOT the Elite package's philSessions/yannickSessions fields
 * (data/packages.js's ELITE_TIERS): those counts are still `null` — pricing
 * a specialist entitlement is a billing decision, and billing is parked
 * (owner's Sprint 7 ruling: "energy goes to features, not billing, for
 * now"). Until that is priced, EVERY athlete's specialist bookings — Elite
 * or not — answer to this one cap and nothing else. Do not read
 * philSessions/yannickSessions from here or from anywhere a specialist
 * booking is gated; they stay unsurfaced by design, not by oversight.
 */
export const SPECIALIST_MONTHLY_CAP = 2;

/**
 * Rolling booking window, in days from today (not a calendar month) — how
 * far ahead useSpecialistSlots offers slots for on the day strip. Production
 * availability itself comes from the Google Calendar sync; this only bounds
 * how much of it one screen load shows.
 */
export const SPECIALIST_BOOKING_WINDOW_DAYS = 14;
