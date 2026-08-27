/**
 * Season schedule generator.
 *
 * seed.js carries a handful of hand-written sessions for the artboards. This
 * generates the real thing: every dated session for a season, from the weekly
 * pattern plus a closure list. Booking, rosters and capacity all read from it.
 *
 * Two facts drive the shape:
 *   - Adult programming is eliminated, so weekdays are three afternoon blocks,
 *     not six. The 6-7 PM adult block and the old 7-9 PM window are both gone.
 *   - Saturdays alternate training and tournament, which is why sessions carry
 *     a `type` and why allowances are tracked in two pools (see packages.js).
 *
 * Friday is capacity overflow — off by default, switched on when enrollment
 * requires it. Generating with `friday: true` is how you see what it buys.
 */

export const WEEKDAY_BLOCKS = ['3:00 PM', '4:00 PM', '5:00 PM'];

/**
 * Saturday runs four blocks alternating training, tournament, training,
 * tournament — training first.
 *
 * OPEN: these start times are a placeholder spread across the old 9-6 Saturday
 * window. Confirm against how tournaments actually run before publishing.
 */
export const SATURDAY_BLOCKS = [
  { time: '8:30 AM',  type: 'training' },
  { time: '10:30 AM', type: 'tournament' },
  { time: '12:30 PM', type: 'training' },
  { time: '2:30 PM',  type: 'tournament' },
];

/**
 * Capacity per block.
 *
 * OPEN — and this is the one that decides whether the package entitlements hold.
 * Two Saturday tournament blocks at 14 serve ~121 entries a month; the packages
 * promise 2-4 each, which needs roughly 23 per block at break-even enrollment.
 * If tournaments run as a larger event across the bays, raise `tournament` here
 * and the arithmetic clears. If they run like a normal capped session, the
 * entitlements have to come down instead.
 */
export const CAPACITY = { training: 14, tournament: 14 };

const DAY = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

const iso = (d) => d.toISOString().slice(0, 10);

/** Blocks for a given weekday index, or [] if the Academy is dark that day. */
function blocksForDay(dayIndex, { friday }) {
  if (dayIndex >= DAY.MON && dayIndex <= DAY.THU) {
    return WEEKDAY_BLOCKS.map((time) => ({ time, type: 'training' }));
  }
  if (dayIndex === DAY.FRI && friday) {
    return WEEKDAY_BLOCKS.map((time) => ({ time, type: 'training', overflow: true }));
  }
  if (dayIndex === DAY.SAT) return SATURDAY_BLOCKS.map((b) => ({ ...b }));
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
 * @param {boolean} [opts.friday]      Enable Friday overflow blocks.
 * @param {object} [opts.capacity]     Override CAPACITY.
 * @returns {Array} sessions, ascending by date then block order.
 */
export function generateSeason({ start, end, closures = [], friday = false, capacity = CAPACITY }) {
  const closed = new Set(closures);
  const sessions = [];
  const cursor = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');

  while (cursor <= last) {
    const date = iso(cursor);
    if (!closed.has(date)) {
      blocksForDay(cursor.getUTCDay(), { friday }).forEach((block, i) => {
        sessions.push({
          id: `${date}-${i}`,
          date,
          time: block.time,
          type: block.type,
          overflow: !!block.overflow,
          capacity: capacity[block.type],
          booked: 0,
          coachId: null,
        });
      });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return sessions;
}

/**
 * Weekly and monthly capacity, split by pool. Use this to sanity-check an
 * enrollment plan before it is sold — the two pools fill at very different rates.
 */
export function capacitySummary(sessions) {
  const weeks = new Set(sessions.map((s) => {
    const d = new Date(s.date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - d.getUTCDay());
    return iso(d);
  })).size || 1;

  const seat = (type) => sessions
    .filter((s) => s.type === type)
    .reduce((sum, s) => sum + s.capacity, 0);

  const training = seat('training');
  const tournament = seat('tournament');

  return {
    weeks,
    training:   { season: training,   perWeek: training / weeks,   perMonth: (training / weeks) * 4.33 },
    tournament: { season: tournament, perWeek: tournament / weeks, perMonth: (tournament / weeks) * 4.33 },
  };
}

/**
 * Demand implied by an enrollment plan, against the capacity above.
 * @param {Array} enrolment  [{ pkg, athletes }] using packages from packages.js
 */
export function demandSummary(enrolment) {
  const perMonth = enrolment.reduce(
    (acc, { pkg, athletes }) => ({
      training:    acc.training    + pkg.training    * athletes,
      tournaments: acc.tournaments + pkg.tournaments * athletes,
    }),
    { training: 0, tournaments: 0 }
  );
  return perMonth;
}
