/**
 * Season wiring — turns schedule.js into the dated sessions the screens read.
 *
 * schedule.js is the source of truth for the weekly pattern, capacity and the
 * generator. Nothing here modifies it. What lives here is the configuration the
 * generator takes as arguments, kept separate precisely because it is the part
 * that is not settled: the holiday calendar is provisional, so closures are
 * passed in rather than baked into the generator.
 */

import { CAPACITY, generateSeason } from './schedule';
import { ROTATIONS } from '../tokens';

/**
 * PROVISIONAL — the 2026-27 calendar is not final.
 *
 * From the Blueprint's closure table. Half-days before a holiday count as
 * closed: the handbook closes at noon and the first block is 3:00 PM, so
 * nothing runs anyway.
 *
 * Passed to generateSeason as an argument. When the real calendar lands, this
 * constant changes and nothing else does.
 */
export const HOLIDAY_CLOSURES_2027 = [
  '2027-02-15', // Presidents' Day — closed to classes, tournament runs separately
];

/**
 * PROVISIONAL — season bounds are a working assumption, not a published date.
 * Winter/spring stretch after the Christmas break ends Jan 3.
 */
export const SEASON_BOUNDS = { start: '2027-01-04', end: '2027-05-02' };

/**
 * @param {object} [opts]
 * @param {string[]} [opts.closures]  Defaults to the provisional calendar above.
 * @param {boolean} [opts.friday]     Friday overflow blocks, off by default.
 */
export function buildSeason({ closures = HOLIDAY_CLOSURES_2027, friday = false } = {}) {
  return generateSeason({ ...SEASON_BOUNDS, closures, friday });
}

/**
 * Built once at module load. The generator is deterministic, so rebuilding it
 * per render would burn work to produce an identical 269-element array — and
 * hand the hook seam a new array identity every time.
 */
export const SEASON = buildSeason();

/**
 * The date the scaffold is "today", matching the artboards: Thursday Feb 18,
 * with the Presidents' Day closure the Monday before.
 */
export const SCAFFOLD_TODAY = '2027-02-18';

/** "2027-02-20" -> { date: "20", dow: "Sat" }, for the booking date strip. */
export function datePill(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return {
    iso,
    date: String(d.getUTCDate()),
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()],
  };
}

/**
 * OPEN — which rotation runs in which block is not specified anywhere.
 *
 * The handoff says sessions are labelled by their Workshop / Lab / Arena
 * rotation, and the artboards show the same block time carrying different
 * rotations on different days, so it genuinely rotates rather than being fixed
 * per time slot. The cycle below is a placeholder that produces a stable,
 * plausible label; it is not a scheduling decision. Replace it when the real
 * rotation assignment exists — every caller goes through this one function.
 */
export function rotationFor(session) {
  const day = new Date(session.date + 'T00:00:00Z').getUTCDate();
  const block = Number(String(session.id).split('-').pop()) || 0;
  return ROTATIONS[(day + block) % ROTATIONS.length];
}

/** Sessions on one date, in block order. */
export function sessionsForDate(sessions, date) {
  return sessions.filter((s) => s.date === date);
}

/** The next `count` dates that actually have sessions, from `from` onward. */
export function upcomingDates(sessions, from, count = 7) {
  const seen = [];
  for (const s of sessions) {
    if (s.date < from) continue;
    if (!seen.includes(s.date)) seen.push(s.date);
    if (seen.length === count) break;
  }
  return seen;
}

/**
 * Capacity as the booking list shows it.
 *
 * Note this reads `CAPACITY.tournament`, which schedule.js flags as OPEN and
 * unresolved: at 14 per block the season serves far fewer tournament entries
 * than the packages promise. That arithmetic is a real problem, but it is a
 * scheduling decision rather than a UI one — the screens render whatever
 * capacity is configured and will stay correct when it changes.
 */
export function capacityFor(session) {
  const left = Math.max(0, session.capacity - session.booked);
  if (left === 0) return { state: 'full', label: 'Full' };
  return { state: 'available', label: `${left} left` };
}

export { CAPACITY };
