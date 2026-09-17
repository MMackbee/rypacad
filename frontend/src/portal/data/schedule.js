/**
 * Season schedule generator.
 *
 * seed.js carries a handful of hand-written sessions for the artboards. This
 * generates the real thing: every dated session for a season, from the weekly
 * pattern plus a closure list. Booking, rosters and capacity all read from it.
 *
 * CONTRACT v2.0 (Sprint 12 pin J, "the token model"): the locked weekly
 * schedule the owner gave directly, per-day blocks, 60 minutes each —
 * Mon/Wed 3, 4, 5 PM; Tue/Thu 4, 5, 6 PM; Fri 3, 4 PM (v2.0.2, 2026-09-17:
 * Tue/Thu 3 PM is RESERVED for an invite-only group and is not generated;
 * capacity is 14). Production sessions
 * come from the Google Calendar sync (a calendar edit by the owner, not a
 * code change) — this generator exists for **seed parity**, so the emulator
 * shows the real locked schedule without a calendar to sync against.
 *
 * There is no more Friday overflow toggle and no more `overflow` field: the
 * two-pool-era "Friday is capacity surplus" framing is gone along with the
 * pools themselves (one fungible token pool now, see packages.js). Every
 * regular block is `bookable: true`; the one exception is the Saturday
 * 2-4 PM adult/college block below, which is display-only.
 */

// Per-day weekday blocks (pin J), hour-of-day in 24h — one 60-minute session
// per listed hour. Sat is handled separately (SATURDAY_BLOCKS) since it mixes
// training/tournament and ends with a non-bookable display block.
export const WEEKDAY_BLOCKS = {
  Mon: [15, 16, 17],
  Tue: [16, 17, 18],
  Wed: [15, 16, 17],
  Thu: [16, 17, 18],
  Fri: [15, 16],
};

const WEEKDAY_KEY_BY_DAY_INDEX = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };

/** 24h hour -> "3:00 PM" etc. Every generated block is on the hour. */
function formatHour(hour) {
  const h12 = ((hour + 11) % 12) + 1;
  return `${h12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
}

/**
 * Saturday (pin J): 9 AM training, then four 60-min blocks — 10/11 tournament,
 * 12/1 training. **Open (pin J, #2 in TEAM.md):** whether 10-12 and 12-2 end
 * up as single 2-hour events instead of two 60-min blocks each is an owner
 * call made on the calendar, not here — if so, the owner titles one event per
 * window and this generator follows; pinning the four-block shape for now
 * since that is what is pinned today, not guessing at the merge.
 */
export const SATURDAY_BLOCKS = [
  { time: '9:00 AM', type: 'training' },
  { time: '10:00 AM', type: 'tournament' },
  { time: '11:00 AM', type: 'tournament' },
  { time: '12:00 PM', type: 'training' },
  { time: '1:00 PM', type: 'training' },
];

/**
 * The Saturday 2-4 PM college / Elite Am / Mid Am block — collected in person
 * via Stripe, ~$20, not in the app (pin J, out of scope per the tokens
 * contract §"Out of scope"). It is titled on the calendar so `classifyTitle`
 * in sync-calendar-sessions.mjs skips it (display-only, exactly as the sync
 * was designed) — nothing to build there. This generator adds ONE seed-only
 * display entry so the emulator shows the real Saturday; the sync never
 * produces `type: 'adult'` at all.
 */
const SATURDAY_ADULT_BLOCK = {
  time: '2:00 PM',
  type: 'adult',
  label: 'College / Elite Am / Mid Am',
  bookable: false,
};

/**
 * Capacity per session (contract v2.0, pin J; 14 since v2.0.2, 2026-09-17):
 * flat, every session, every
 * type — the earlier per-type map (`{ training, tournament }`) is gone along
 * with the two-pool model it served. `season.js`'s `capacityFor()` reads
 * `session.capacity` as a plain number either way, so this flattening needs
 * no change on that side.
 */
export const CAPACITY = 14;

const DAY = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

const iso = (d) => d.toISOString().slice(0, 10);

/** Blocks for a given weekday index, or [] if the Academy is dark that day. */
function blocksForDay(dayIndex) {
  const key = WEEKDAY_KEY_BY_DAY_INDEX[dayIndex];
  if (key) {
    return WEEKDAY_BLOCKS[key].map((hour) => ({ time: formatHour(hour), type: 'training', bookable: true }));
  }
  if (dayIndex === DAY.SAT) {
    return [...SATURDAY_BLOCKS.map((b) => ({ ...b, bookable: true })), { ...SATURDAY_ADULT_BLOCK }];
  }
  return [];
}

/**
 * Generate every session in a season.
 *
 * @param {object} opts
 * @param {string} opts.start     'YYYY-MM-DD', inclusive.
 * @param {string} opts.end       'YYYY-MM-DD', inclusive.
 * @param {string[]} [opts.closures]   Dates the Academy is closed. Half-days
 *   before a holiday count as closed — the handbook closes at noon and the first
 *   block is 3:00 PM, so nothing runs anyway.
 * @param {number} [opts.capacity]     Override CAPACITY (flat number, pin J).
 * @param {Array} [opts.extras]        Explicitly dated sessions outside the weekly
 *   pattern — the holiday tournaments, which run on days the Academy is otherwise
 *   closed. Each needs { date, time, type }; `special` and `label` are optional.
 *   Extras are not subject to `closures`, which is the point of them.
 * @returns {Array} sessions, ascending by date then block order.
 */
export function generateSeason({ start, end, closures = [], capacity = CAPACITY, extras = [] }) {
  const closed = new Set(closures);
  const sessions = [];
  const cursor = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');

  while (cursor <= last) {
    const date = iso(cursor);
    if (!closed.has(date)) {
      blocksForDay(cursor.getUTCDay()).forEach((block, i) => {
        sessions.push({
          id: `${date}-${i}`,
          date,
          time: block.time,
          type: block.type,
          label: block.label || null,
          bookable: block.bookable !== false,
          capacity,
          booked: 0,
          coachId: null,
        });
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Holiday tournaments run on closed days, so they are added after the closure
  // filter rather than through it. Anything outside the season bounds is dropped
  // — a date typo should not silently extend the season.
  extras
    .filter((e) => e.date >= start && e.date <= end)
    .forEach((e, i) => {
      sessions.push({
        id: `${e.date}-x${i}`,
        date: e.date,
        time: e.time,
        type: e.type,
        label: e.label || null,
        bookable: true,
        special: true,
        capacity: e.capacity || capacity,
        booked: 0,
        coachId: null,
      });
    });

  return sessions.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));
}

/**
 * Season-wide seat supply vs. token demand — one number each (contract v2.0:
 * one fungible pool, not training/tournament pools). Use this to sanity-check
 * an enrollment plan before it is sold.
 */
export function capacitySummary(sessions) {
  const bookable = sessions.filter((s) => s.bookable !== false);
  const weeks = new Set(bookable.map((s) => {
    const d = new Date(s.date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return iso(d);
  })).size || 1;

  const season = bookable.reduce((sum, s) => sum + s.capacity, 0);

  return { weeks, season, perWeek: season / weeks, perMonth: (season / weeks) * 4.33 };
}

/**
 * Token demand implied by an enrollment plan, against the supply above — one
 * number: Σ pkg.tokens × athletes, over `TOKEN_PACKAGES` (packages.js).
 * Elite (`tokens: null`) contributes nothing countable here on purpose — it
 * is the unlimited package the token model has no seat-demand number for.
 * @param {Array} enrolment  [{ pkg, athletes }] using packages from packages.js
 */
export function demandSummary(enrolment) {
  return enrolment.reduce((sum, { pkg, athletes }) => sum + (pkg.tokens || 0) * athletes, 0);
}
