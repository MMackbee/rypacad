/**
 * Fitness with no golf (owner 2026-11-13: "yes add a warning row for fitness
 * no golf"). PURE - the admin dashboard's Outstanding card names every
 * fitness session (type 'phil') in the next four weeks whose golf time is
 * gone, because a trainer then works a session with no golf around it. On
 * 2026-11-13 those were the Mon/Wed 6 PM fitness hours beside the 6 PM golf
 * blocks hidden on 2026-11-05 (data/hiddenSessions.js).
 *
 * Flag only: nothing here cancels or hides a session, and the owner ruled
 * the same day not to cancel a golf block and its fitness hour together.
 *
 * A fitness session is orphaned when it is not cancelled and not hidden and
 * no live golf session (type 'training' or 'tournament', not cancelled, not
 * hidden) overlaps it on the same date. Overlap is G.start < P.end and
 * P.start < G.end, in minutes, with end = start + durationMinutes (60 when
 * absent), so Saturday's fitness hours inside a two-hour Tour event are not
 * orphans and an hour that starts as the golf ends is.
 *
 * A time nobody can parse never flags: a fitness hour with no time is left
 * out, and so is one on a day with live golf at a time nobody can place
 * (it may sit right beside it).
 */
import { parseTimeToMinutes } from './calendar';
import { dayTimeLabel } from './bookingChanges';
import { DEFAULT_DURATION_MINUTES } from './schedule';
import { isHiddenSession } from './hiddenSessions';

/** How far ahead the dashboard looks: today and the next 27 days. */
export const FITNESS_WINDOW_DAYS = 28;

const GOLF_TYPES = new Set(['training', 'tournament']);

const isCancelled = (s) => s.status === 'cancelled';
const isLive = (s) => !isCancelled(s) && !isHiddenSession(s);

/** {start, end} in minutes since midnight, or null when the time can't be parsed. */
function spanOf(s) {
  const start = parseTimeToMinutes(s.time);
  if (start == null) return null;
  const minutes = Number(s.durationMinutes);
  return { start, end: start + (Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_DURATION_MINUTES) };
}

/**
 * The orphaned fitness sessions dated from..to (inclusive), sorted by date
 * then start. `reason` says what happened to the golf beside it: 'hidden'
 * when any overlapping golf block is hidden, else 'cancelled' when any is
 * cancelled, else 'none' (no golf at that time at all).
 *
 * @param {Array<object>} sessions - session docs, any types, hidden and cancelled included.
 * @param {{from: string, to: string}} window - 'yyyy-MM-dd' bounds.
 * @returns {Array<{id: string, date: string, time: string, booked: number, reason: 'hidden'|'cancelled'|'none'}>}
 */
export function orphanFitness(sessions, { from, to } = {}) {
  const list = Array.isArray(sessions) ? sessions.filter(Boolean) : [];
  const golfByDate = new Map();
  for (const s of list) {
    if (!GOLF_TYPES.has(s.type)) continue;
    if (!golfByDate.has(s.date)) golfByDate.set(s.date, []);
    golfByDate.get(s.date).push({ span: spanOf(s), live: isLive(s), hidden: isHiddenSession(s) });
  }

  const found = [];
  for (const p of list) {
    if (p.type !== 'phil' || !isLive(p) || typeof p.date !== 'string') continue;
    if ((from && p.date < from) || (to && p.date > to)) continue;
    const span = spanOf(p);
    if (!span) continue;
    let covered = false;
    let hidden = false;
    let cancelled = false;
    for (const g of golfByDate.get(p.date) ?? []) {
      if (!g.span) {
        if (g.live) covered = true;
        continue;
      }
      if (!(g.span.start < span.end && span.start < g.span.end)) continue;
      if (g.live) covered = true;
      else if (g.hidden) hidden = true;
      else cancelled = true;
    }
    if (covered) continue;
    found.push({
      id: p.id,
      date: p.date,
      time: p.time,
      booked: Number(p.booked) || 0,
      reason: hidden ? 'hidden' : cancelled ? 'cancelled' : 'none',
      start: span.start,
    });
  }
  return found
    .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
    .map(({ start, ...o }) => o);
}

const REASON_LINE = {
  hidden: 'the golf block at this time is hidden',
  cancelled: 'the golf block at this time is cancelled',
  none: 'no golf at this time',
};

/**
 * One Outstanding row for an orphaned fitness session: tag Fitness, red when
 * kids are booked, yellow when nobody is. It names a session, not an
 * athlete (athleteId null), and packageIds null keeps it under every tier
 * filter.
 */
export function fitnessRow(o) {
  const booked = o.booked > 0 ? `${o.booked} booked` : 'Nobody booked yet';
  return {
    id: `fitness-${o.id}`,
    kind: 'fitness',
    athleteId: null,
    who: `Fitness with no golf · ${dayTimeLabel(o.date, o.time)}`,
    why: `${booked} · ${REASON_LINE[o.reason] ?? REASON_LINE.none}`,
    tag: 'Fitness',
    tone: o.booked > 0 ? 'red' : 'yellow',
    packageIds: null,
  };
}
