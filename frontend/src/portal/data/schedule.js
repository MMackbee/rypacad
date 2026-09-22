/**
 * Season schedule generator.
 *
 * seed.js carries a handful of hand-written sessions for the artboards. This
 * generates the real thing: every dated session for a season, from the weekly
 * pattern plus a closure list. Booking, rosters and capacity all read from it.
 *
 * CONTRACT v2.0 (Sprint 12 pin J, "the token model"): the locked weekly
 * schedule the owner gave directly, per-day blocks, 60 minutes each —
 * Mon/Wed 3, 4, 5, 6 PM; Tue/Thu 4, 5, 6, 7 PM; Fri 3, 4 PM (v2.0.2,
 * 2026-09-17: Tue/Thu 3 PM is RESERVED for an invite-only group and is not
 * generated; capacity is 14. v2.0.3, 2026-09-22: the owner added a fourth
 * weekday block — Mon/Wed gain 6 PM and Tue/Thu gain 7 PM — alongside the
 * suggested age groups below; the owner had not yet made the matching Google
 * Calendar edit when this landed, so production keeps three blocks a day
 * until that edit and the next calendar sync). Production sessions
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

import { getDay, parseISO } from 'date-fns';

import { parseTimeToMinutes } from './calendar';

// Per-day weekday blocks (pin J), hour-of-day in 24h — one 60-minute session
// per listed hour. Sat is handled separately (SATURDAY_BLOCKS) since it mixes
// training/tournament and ends with a non-bookable display block.
export const WEEKDAY_BLOCKS = {
  Mon: [15, 16, 17, 18],
  Tue: [16, 17, 18, 19],
  Wed: [15, 16, 17, 18],
  Thu: [16, 17, 18, 19],
  Fri: [15, 16],
};

const WEEKDAY_KEY_BY_DAY_INDEX = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri' };

/**
 * SUGGESTED age groups (owner ruling, 2026-09-22, amendment v2.0.3).
 *
 * A hint for families choosing a block, nothing more: booking is NOT age-gated
 * anywhere, any athlete may book any block, and nothing here touches what a
 * booking costs (the keystone holds - a token is a token). It is also separate
 * from the RYP Tour's brackets (10 & under / 11-13 / 14 & up, data/tour.js),
 * which score competition and are derived from a date of birth; these two
 * groupings answer different questions and are deliberately not shared.
 */
export const AGE_GROUPS = {
  older: { id: 'older', label: '13 & up', short: '13+' },
  younger: { id: 'younger', label: 'Under 13', short: 'U13' },
};

/**
 * Block start hour (24h) -> suggested group, per weekday. Each day alternates
 * from its own first block: Mon/Wed 3 PM and 5 PM are the older group, 4 PM
 * and 6 PM the younger; Tue/Thu 4 PM and 6 PM older, 5 PM and 7 PM younger.
 *
 * Friday and Saturday are deliberately ABSENT: the owner ruled on Mon-Thu only
 * (2026-09-22), so those days carry no suggestion rather than an invented one.
 * The same goes for any hour not listed - a block the calendar adds at an
 * unmapped time simply shows no age hint until the owner rules on it.
 */
export const AGE_GROUP_BY_DAY = {
  Mon: { 15: 'older', 16: 'younger', 17: 'older', 18: 'younger' },
  Tue: { 16: 'older', 17: 'younger', 18: 'older', 19: 'younger' },
  Wed: { 15: 'older', 16: 'younger', 17: 'older', 18: 'younger' },
  Thu: { 16: 'older', 17: 'younger', 18: 'older', 19: 'younger' },
};

/**
 * The suggested age group for one session, or null when there is none.
 *
 * TRAINING ONLY: a tournament is the whole academy at once, and Phil's and
 * Yannick's sessions are booked per athlete, so none of them carry a hint.
 *
 * Takes the session's own `date` ('yyyy-MM-dd') and `time` ('4:00 PM'), the
 * two fields every session doc and every seed row carries. The date is parsed
 * with date-fns `parseISO`, which reads a date-only string in LOCAL time - a
 * bare `new Date('2026-09-21')` is UTC midnight and lands on the previous
 * weekday west of Greenwich, which would shift every label by a day.
 */
export function ageGroupFor(session) {
  const { date, time, type = 'training' } = session || {};
  if (type !== 'training' || !date || !time) return null;
  const parsed = parseISO(String(date));
  if (Number.isNaN(parsed.getTime())) return null;
  const minutes = parseTimeToMinutes(time);
  // Only blocks that start on the hour are mapped; a :30 start is not a block.
  if (minutes == null || minutes % 60 !== 0) return null;
  const id = AGE_GROUP_BY_DAY[WEEKDAY_KEY_BY_DAY_INDEX[getDay(parsed)]]?.[minutes / 60];
  return id ? AGE_GROUPS[id] : null;
}

/** 24h hour -> "3:00 PM" etc. Every generated block is on the hour. */
function formatHour(hour) {
  const h12 = ((hour + 11) % 12) + 1;
  return `${h12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
}

/**
 * Saturday: 9 AM training (60 min), then 10 AM-12 PM tournament and
 * 12-2 PM training, each a SINGLE two-hour event.
 *
 * That was pin J's open question ("two 60-minute sessions or one 2-hour event
 * each") and the owner answered it on 2026-09-22: one event each. Each spends
 * one token, exactly like a 60-minute weekday block - a session's length has
 * never been what it costs. The owner titles one calendar event per window and
 * the sync follows; this generator matches it for seed parity.
 */
export const SATURDAY_BLOCKS = [
  { time: '9:00 AM', type: 'training', durationMinutes: 60 },
  // Owner ruling 2026-09-22: 10-12 is ONE two-hour tournament and 12-2 is ONE
  // two-hour training session, not four 60-minute blocks. Each still spends a
  // single token - length never changes what a session costs.
  { time: '10:00 AM', type: 'tournament', durationMinutes: 120 },
  { time: '12:00 PM', type: 'training', durationMinutes: 120 },
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
 * Capacity per session (contract v2.0, pin J; PER TYPE since the owner's
 * 2026-09-18 ruling - see CAPACITY_BY_TYPE below). Earlier: flat, every
 * session, every
 * type — the earlier per-type map (`{ training, tournament }`) is gone along
 * with the two-pool model it served. `season.js`'s `capacityFor()` reads
 * `session.capacity` as a plain number either way, so this flattening needs
 * no change on that side.
 */
export const CAPACITY_BY_TYPE = { training: 14, tournament: 25 };

/** The training number, kept under its old name for callers that want one default. */
export const CAPACITY = CAPACITY_BY_TYPE.training;

/**
 * A generated session's capacity (owner, 2026-09-18): per TYPE - training 14,
 * tournament (RYP Tour) 25. This is the one place `type` legitimately drives a
 * number: it is a ROOM fact, never a charge, so the token model's keystone
 * ("charging never branches on type") holds. Anything else generated here (the
 * display-only adult block) takes the training number.
 */
export function capacityForType(type) {
  return CAPACITY_BY_TYPE[type] ?? CAPACITY_BY_TYPE.training;
}

/**
 * A block is 60 minutes unless it says otherwise. Sessions carry
 * `durationMinutes` and anything reading one falls back to this, so a session
 * doc written before the field existed still measures correctly.
 */
export const DEFAULT_DURATION_MINUTES = 60;

const DAY = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

const iso = (d) => d.toISOString().slice(0, 10);

/** Blocks for a given weekday index, or [] if the Academy is dark that day. */
function blocksForDay(dayIndex) {
  const key = WEEKDAY_KEY_BY_DAY_INDEX[dayIndex];
  if (key) {
    return WEEKDAY_BLOCKS[key].map((hour) => ({
      time: formatHour(hour),
      type: 'training',
      bookable: true,
      durationMinutes: DEFAULT_DURATION_MINUTES,
    }));
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
 * @param {number} [opts.capacity]     Override: ONE flat number for every
 *   generated session. Omitted (the norm), each session takes its type's
 *   capacity from CAPACITY_BY_TYPE.
 * @param {Array} [opts.extras]        Explicitly dated sessions outside the weekly
 *   pattern — the holiday tournaments, which run on days the Academy is otherwise
 *   closed. Each needs { date, time, type }; `special` and `label` are optional.
 *   Extras are not subject to `closures`, which is the point of them.
 * @returns {Array} sessions, ascending by date then block order.
 */
export function generateSeason({ start, end, closures = [], capacity = null, extras = [] }) {
  const capFor = (type) => (typeof capacity === 'number' ? capacity : capacityForType(type));
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
          durationMinutes: block.durationMinutes ?? DEFAULT_DURATION_MINUTES,
          capacity: capFor(block.type),
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
        durationMinutes: e.durationMinutes ?? DEFAULT_DURATION_MINUTES,
        capacity: e.capacity || capFor(e.type),
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
