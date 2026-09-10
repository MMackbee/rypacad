/**
 * RYP Tour — the weekend-tournament leaderboard (Sprint 7 pins,
 * docs/portal/TEAM.md "Sprint 7 pins" + contract v1.5).
 *
 * POINTS ARE NEVER STORED: a tournamentResults doc holds only a finishing
 * `position`; TOUR_POINTS is the single tunable table and pointsForPosition()
 * is the only place a position becomes points. Retuning the table (an
 * owner-tunable placeholder) retroactively rescores the whole season with no
 * rules or data migration — the same derive-don't-store rule the two-pool
 * allowance already follows.
 *
 * deriveTourStandings() is the one ranking/points/podium algorithm, shared by
 * both data paths: the seed standings below are computed by calling it
 * exactly the way hooks/index.js's live assembly does, and the live path
 * (hooks/live.js's fetchers + hooks/index.js's liveTourStandings) calls it
 * again over real tournamentResults docs. Screens see identical math either
 * way.
 */

import { addDaysISO, lastSaturdayOnOrBefore, todayISO } from './calendar';

/**
 * Position (1-indexed) -> points. Index 0 is 1st place.
 *
 * Tuned for a ~25-kid weekly field (owner's sizing, 2026-09-10): the winner
 * earns ~2.6x the median finisher (100 vs 38 at 13th), the win premium is a
 * clear 12 over 2nd, the decay is smooth and strictly non-increasing, and
 * 25th still banks 14 — every finisher scores something that visibly moves
 * their season total, so mid-pack kids stay engaged. Deliberately flatter
 * than pro-tour tables: one hot Saturday should matter, not decide the
 * season.
 */
export const TOUR_POINTS = [
  100, 88, 78, 70, 64, 59, 55, 51, 48, 45, 42, 40, 38, 36, 34, 32, 30, 28,
  26, 24, 22, 20, 18, 16, 14,
];

/** Beyond the table (finished, but outside the top 25) still banks a
 * showing — just under 25th's 14, so showing up never outscores a recorded
 * finish. */
const PARTICIPATION_POINTS = 12;

/**
 * Missed-week forgiveness (owner's rule, 2026-09-10: "miss a week and not
 * be eliminated from contention"): season standings count each athlete's
 * BEST (eventsHeld - drops) weeks, where one drop is earned per this many
 * tournaments held. A missed Saturday becomes a dropped week instead of a
 * permanent zero, and a kid who played every week gets to drop their worst
 * finishes instead — the standard scholastic-series mechanic. Phases in on
 * its own (no drops until six events have run, when deficits are still
 * naturally recoverable) and stays derive-don't-store: retuning it rescores
 * the whole season at the next read, exactly like TOUR_POINTS.
 */
export const TOUR_DROP_RATE = 6;

/** Season events held -> how many lowest weeks every athlete may drop. */
export function droppedWeeks(eventsHeld) {
  return Math.floor(eventsHeld / TOUR_DROP_RATE);
}

/**
 * Position -> points. Positions are 1-indexed to match how a tournament
 * result reads ("1st place", never "0th"); anything past the table's length
 * — or not a valid finishing position — earns the flat participation award
 * rather than nothing, so simply showing up always counts for something.
 */
export function pointsForPosition(position) {
  const p = Number(position);
  if (!Number.isInteger(p) || p < 1) return PARTICIPATION_POINTS;
  return TOUR_POINTS[p - 1] ?? PARTICIPATION_POINTS;
}

/**
 * Raw finishing-order rows -> the pinned useTourStandings shape:
 * { standings: [{ athleteId, name, rank, points, events, wins }],
 *   events: [{ sessionId, date, label, top3: [{ name, position }] }],
 *   counting: { eventsHeld, counted, drops } }.
 *
 * `points` is each athlete's best `counted` weeks summed (the drop-week
 * rule above); `events` and `wins` still count everything played.
 * `counting` is the transparency payload the standings screen renders when
 * drops are in effect.
 *
 * `results` is [{ sessionId, date, athleteId, position, name? }] — the
 * tournamentResults contract shape (minus the write-only createdBy/
 * createdAt). `name` is the v1.5.1 write-time snapshot (TEAM.md, Sprint 7
 * integration): results written since the amendment carry the athlete's
 * display name, and a row's own name always wins here. `nameById`/
 * `labelById` are plain objects or Maps the caller has already resolved
 * (seed: the constants below; live: a per-id athlete join, now only needed
 * as the fallback for pre-amendment docs) — this function does no fetching
 * of its own, so it works identically over seed and live data.
 *
 * Ranking is shared-tie ("1224") competition ranking: equal point totals
 * share a rank, and the next distinct total resumes at its 1-based index
 * rather than the next integer — matching TEAM.md's "ties share a rank."
 */
export function deriveTourStandings(results, { nameById = new Map(), labelById = new Map() } = {}) {
  const nameOf = (id) => (nameById.get ? nameById.get(id) : nameById[id]) ?? null;
  const labelOf = (sessionId) =>
    (labelById.get ? labelById.get(sessionId) : labelById[sessionId]) || 'Tournament block';

  const eventsHeld = new Set(results.map((r) => r.sessionId)).size;
  const drops = droppedWeeks(eventsHeld);
  const counted = Math.max(eventsHeld - drops, 1);

  const byAthlete = new Map();
  for (const r of results) {
    const cur = byAthlete.get(r.athleteId) || {
      athleteId: r.athleteId,
      name: null,
      scores: [],
      events: 0,
      wins: 0,
    };
    if (r.name) cur.name = r.name;
    cur.scores.push(pointsForPosition(r.position));
    cur.events += 1;
    if (r.position === 1) cur.wins += 1;
    byAthlete.set(r.athleteId, cur);
  }
  // Best `counted` weeks sum toward the season (drop-week rule); an athlete
  // with fewer played weeks simply sums what they have — no penalty zeros.
  for (const cur of byAthlete.values()) {
    cur.points = cur.scores
      .sort((a, b) => b - a)
      .slice(0, counted)
      .reduce((sum, p) => sum + p, 0);
  }

  const ranked = [...byAthlete.values()].sort((a, b) => b.points - a.points);
  const standings = [];
  let lastPoints = null;
  let lastRank = 0;
  ranked.forEach((row, i) => {
    const rank = row.points === lastPoints ? lastRank : i + 1;
    lastPoints = row.points;
    lastRank = rank;
    standings.push({
      athleteId: row.athleteId,
      name: row.name ?? nameOf(row.athleteId),
      rank,
      points: row.points,
      events: row.events,
      wins: row.wins,
    });
  });

  const bySession = new Map();
  for (const r of results) {
    if (!bySession.has(r.sessionId)) {
      bySession.set(r.sessionId, { sessionId: r.sessionId, date: r.date, rows: [] });
    }
    bySession.get(r.sessionId).rows.push(r);
  }
  const events = [...bySession.values()]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) // most recent first
    .map((ev) => ({
      sessionId: ev.sessionId,
      date: ev.date,
      label: labelOf(ev.sessionId),
      top3: ev.rows
        .slice()
        .sort((a, b) => a.position - b.position)
        .slice(0, 3)
        .map((r) => ({ name: r.name ?? nameOf(r.athleteId), position: r.position })),
    }));

  return { standings, events, counting: { eventsHeld, counted, drops } };
}

/* ------------------------------------------------------------------------- *
 * Seed demo standings — the fallback every role sees with
 * REACT_APP_PORTAL_LIVE_DATA unset. Names are NOT invented: the eight kids
 * below are the existing seed cast — the three Whitfields from seed.js's
 * HOUSEHOLD (jordan/reese/nico, matching their real athleteIds elsewhere in
 * this repo) plus the five names already used on the coach's ROSTER/
 * ATTENTION_LIST screens. Nico sits out the two older events on purpose —
 * HOUSEHOLD already tells his story as "New Feb 8," so his first tournament
 * being the most recent one is consistent with that, not a new fact.
 *
 * Three past Saturdays (real tournament block time slot, per HOUSEHOLD's
 * "Sat 10:30 AM" tournament entries), computed off today rather than
 * hardcoded, so the demo never shows a "past" tournament in the future.
 * Every event uses the plain 'Tournament block' label — the only invented
 * per-event names in this codebase are the real holiday specials in
 * data/season.js, and none of those had happened yet as of any of these
 * three dates.
 * ------------------------------------------------------------------------- */

const EVENT_1 = lastSaturdayOnOrBefore(todayISO()); // most recent Saturday
const EVENT_2 = addDaysISO(EVENT_1, -7);
const EVENT_3 = addDaysISO(EVENT_1, -14);

const TOUR_SEED_NAMES = {
  jordan: 'Jordan Whitfield',
  reese: 'Reese Whitfield',
  nico: 'Nico Whitfield',
  nguyen: 'A. Nguyen',
  okonkwo: 'M. Okonkwo',
  sandoval: 'R. Sandoval',
  alvarez: 'T. Alvarez',
  bergstrom: 'S. Bergstrom',
};

const TOUR_SEED_LABELS = {
  [`${EVENT_1}-1`]: 'Tournament block',
  [`${EVENT_2}-1`]: 'Tournament block',
  [`${EVENT_3}-1`]: 'Tournament block',
};

// [sessionId, date, athleteId, position] per finishing row. Nico's field
// (5 kids -> 8 kids across the three events) grows the way a season roster
// really does as more families' tournament weekends line up.
const TOUR_SEED_RESULTS = [
  // EVENT_3 - oldest, 6 finishers, no Nico yet.
  [`${EVENT_3}-1`, EVENT_3, 'bergstrom', 1],
  [`${EVENT_3}-1`, EVENT_3, 'jordan', 2],
  [`${EVENT_3}-1`, EVENT_3, 'nguyen', 3],
  [`${EVENT_3}-1`, EVENT_3, 'sandoval', 4],
  [`${EVENT_3}-1`, EVENT_3, 'alvarez', 5],
  [`${EVENT_3}-1`, EVENT_3, 'okonkwo', 6],
  // EVENT_2 - 7 finishers, still no Nico.
  [`${EVENT_2}-1`, EVENT_2, 'jordan', 1],
  [`${EVENT_2}-1`, EVENT_2, 'bergstrom', 2],
  [`${EVENT_2}-1`, EVENT_2, 'okonkwo', 3],
  [`${EVENT_2}-1`, EVENT_2, 'nguyen', 4],
  [`${EVENT_2}-1`, EVENT_2, 'reese', 5],
  [`${EVENT_2}-1`, EVENT_2, 'alvarez', 6],
  [`${EVENT_2}-1`, EVENT_2, 'sandoval', 7],
  // EVENT_1 - most recent, all 8, Nico's first tournament.
  [`${EVENT_1}-1`, EVENT_1, 'bergstrom', 1],
  [`${EVENT_1}-1`, EVENT_1, 'jordan', 2],
  [`${EVENT_1}-1`, EVENT_1, 'reese', 3],
  [`${EVENT_1}-1`, EVENT_1, 'nguyen', 4],
  [`${EVENT_1}-1`, EVENT_1, 'nico', 5],
  [`${EVENT_1}-1`, EVENT_1, 'sandoval', 6],
  [`${EVENT_1}-1`, EVENT_1, 'okonkwo', 7],
  [`${EVENT_1}-1`, EVENT_1, 'alvarez', 8],
].map(([sessionId, date, athleteId, position]) => ({ sessionId, date, athleteId, position }));

/** The seed fallback for useTourStandings — computed, not hand-summed. */
export const TOUR_SEED = deriveTourStandings(TOUR_SEED_RESULTS, {
  nameById: TOUR_SEED_NAMES,
  labelById: TOUR_SEED_LABELS,
});
