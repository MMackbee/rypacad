/**
 * RYP Tour — the weekend-tournament leaderboard, now split into age
 * brackets (Sprint 8 pins, docs/portal/TEAM.md "Sprint 8 pins — scores, age
 * brackets, player history" + contract v1.6, superseding v1.5.1).
 *
 * Coaches enter raw SCORES (strokes) per athlete, not a tap-in-order
 * finishing position. POSITION IS DERIVED, NEVER STORED: within one
 * (sessionId, bracket) group, ascending score decides finishing order —
 * equal scores share a position, and the next distinct score resumes at its
 * 1-based index (competition ranking, same "ties share" rule the season
 * standings already used). Points then derive from that position exactly as
 * before via TOUR_POINTS/pointsForPosition. Retuning either table
 * retroactively rescores the whole season — the same derive-don't-store
 * rule the two-pool allowance and the original position->points table
 * already followed.
 *
 * `bracket` is itself a write-time snapshot on each tournamentResults doc
 * (same rationale/mechanics as the v1.5.1 name snapshot): computed from the
 * athlete's dob AS OF SEASON START (SEASON_BOUNDS.start, never "today" and
 * never the write date), so a kid never changes brackets mid-season no
 * matter when a coach enters their score. That snapshot is what lets
 * standings group by bracket with no cross-family athlete read — see
 * bracketFor() below and hooks/index.js's useAthleteBrackets, which computes
 * it for the results-entry screen before a save.
 *
 * deriveTourStandings() is the one ranking/points/podium algorithm, shared by
 * both data paths: the seed standings below are computed by calling it
 * exactly the way hooks/index.js's live assembly does, and the live path
 * (hooks/live.js's fetchers + hooks/index.js's liveTourStandings /
 * liveTournamentResults) calls it again over real tournamentResults docs.
 * Screens see identical math either way.
 */

import { differenceInYears, parseISO } from 'date-fns';
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
 * season. Applied PER BRACKET since Sprint 8 — a bracket's own 1st place
 * earns the table's 100, not the academy-wide 1st.
 */
export const TOUR_POINTS = [
  100, 88, 78, 70, 64, 59, 55, 51, 48, 45, 42, 40, 38, 36, 34, 32, 30, 28,
  26, 24, 22, 20, 18, 16, 14,
];

/** Beyond the table (finished, but outside the top 25 of their bracket)
 * still banks a showing — just under 25th's 14, so showing up never
 * outscores a recorded finish. */
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
 * the whole season at the next read, exactly like TOUR_POINTS. `eventsHeld`
 * (and therefore `drops`/`counted`) is computed ACADEMY-WIDE, across every
 * bracket, then applied identically inside each bracket's own standings —
 * Sprint 8 splits WHO an athlete is ranked against, not how many weeks the
 * season has run.
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
 * Age brackets (Sprint 8 pin, owner: "8-10, 11-13, 13+" — implemented as
 * 10U / 11-13 / 14+ because a 13-year-old cannot live in two brackets and
 * under-8s need a home, so 10U's floor is 0). Order here IS display order —
 * deriveTourStandings emits brackets in this order, 'open' last.
 */
export const BRACKETS = [
  { id: '10U', label: '10 & under', min: 0, max: 10 },
  { id: '11-13', label: '11–13', min: 11, max: 13 },
  { id: '14+', label: '14 & up', min: 14, max: 999 },
];

const BRACKET_ORDER = [...BRACKETS.map((b) => b.id), 'open'];
const BRACKET_LABEL_BY_ID = new Map(BRACKETS.map((b) => [b.id, b.label]));

/**
 * Athlete dob ('yyyy-MM-dd', or null — never invented, per DATA-MODEL.md) ->
 * bracket id, or null when there is no dob to compute one from. `asOfISO` is
 * the fixed date age is measured against — the pinned caller
 * (SEASON_BOUNDS.start) so no kid changes brackets mid-season no matter when
 * a coach enters a score. A null result is not an error case: every read
 * path below groups a null/unset bracket under 'open' ("Open") so a missing
 * dob never blocks a save or a standings row.
 */
export function bracketFor(dob, asOfISO) {
  if (!dob || !asOfISO) return null;
  const age = differenceInYears(parseISO(asOfISO), parseISO(dob));
  const bracket = BRACKETS.find((b) => age >= b.min && age <= b.max);
  return bracket ? bracket.id : null;
}

/**
 * Raw score rows -> the pinned useTourStandings shape (contract v1.6):
 * { brackets: [{ id, label, standings: [{ athleteId, name, rank, points,
 *   events, wins }] }], events: [{ sessionId, date, label, results:
 *   [{ athleteId, name, bracket, score, position }] }],
 *   counting: { eventsHeld, counted, drops } }.
 *
 * `results` is [{ sessionId, date, athleteId, score, bracket?, name? }] —
 * the tournamentResults contract shape (minus the write-only createdBy/
 * createdAt). Rows without an int `score` are dropped defensively (the read
 * paths in hooks/index.js already skip them; none should exist). `name` is
 * the v1.5.1 write-time snapshot and `bracket` the v1.6 one — both string or
 * null, and a row's own value always wins over the caller-supplied
 * `nameById` fallback (only needed for pre-amendment docs). `nameById`/
 * `labelById` are plain objects or Maps the caller has already resolved
 * (seed: the constants below; live: a per-id athlete/session join) — this
 * function does no fetching of its own, so it works identically over seed
 * and live data.
 *
 * Position is derived, never read off the row: within one
 * (sessionId, bracket) group — a null/unset bracket groups under 'open' —
 * ascending score decides finishing order, with shared-tie ("1224")
 * competition ranking (equal scores share a position; the next distinct
 * score resumes at its 1-based index, not the next integer). Points come
 * from that derived position via TOUR_POINTS/pointsForPosition, same as
 * before. A row's OUTWARD `bracket` in `events[].results` is the raw stored
 * value (including null) — only the internal grouping normalizes null to
 * 'open' — so a screen can tell "grouped under Open" apart from "this athlete
 * IS in the Open bracket" if that distinction ever matters.
 *
 * Season standings ("points") are each athlete's best `counted` weeks summed
 * (the drop-week rule), computed and applied identically inside every
 * bracket; `events`/`wins` still count everything that athlete played.
 * `counting` is the transparency payload the standings screen renders when
 * drops are in effect — `eventsHeld` is academy-wide (every bracket
 * combined), not per bracket.
 *
 * Only non-empty brackets appear in the output, in BRACKETS order, with
 * 'open' last.
 */
export function deriveTourStandings(results, { nameById = new Map(), labelById = new Map() } = {}) {
  const nameOf = (id) => (nameById.get ? nameById.get(id) : nameById[id]) ?? null;
  const labelOf = (sessionId) =>
    (labelById.get ? labelById.get(sessionId) : labelById[sessionId]) || 'Tournament block';
  const groupBracketOf = (r) => r.bracket || 'open';

  // Defensive: a row with no int score cannot be ranked. hooks/index.js's
  // read paths already skip these; kept here too so the seed path (and any
  // other caller) gets the same guarantee for free.
  const valid = results.filter((r) => Number.isInteger(r.score));

  const eventsHeld = new Set(valid.map((r) => r.sessionId)).size;
  const drops = droppedWeeks(eventsHeld);
  const counted = Math.max(eventsHeld - drops, 1);

  // Group into (sessionId, bracket) buckets and derive each row's position
  // within its bucket via ascending score, competition ranking.
  const buckets = new Map();
  for (const r of valid) {
    const key = `${r.sessionId}::${groupBracketOf(r)}`;
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }

  const derivedRows = [];
  for (const [key, rows] of buckets) {
    const groupBracket = key.slice(key.lastIndexOf('::') + 2);
    const sorted = rows.slice().sort((a, b) => a.score - b.score);
    let lastScore = null;
    let lastPosition = 0;
    sorted.forEach((r, i) => {
      const position = r.score === lastScore ? lastPosition : i + 1;
      lastScore = r.score;
      lastPosition = position;
      derivedRows.push({ ...r, groupBracket, position, points: pointsForPosition(position) });
    });
  }

  // Per-bracket season standings, using the SAME eventsHeld/counted/drops
  // computed above (eventsHeld stays global; only the ranking pool splits).
  const byBracket = new Map();
  for (const r of derivedRows) {
    let bmap = byBracket.get(r.groupBracket);
    if (!bmap) {
      bmap = new Map();
      byBracket.set(r.groupBracket, bmap);
    }
    const cur = bmap.get(r.athleteId) || {
      athleteId: r.athleteId,
      name: null,
      scores: [],
      events: 0,
      wins: 0,
    };
    if (r.name) cur.name = r.name;
    cur.scores.push(r.points);
    cur.events += 1;
    if (r.position === 1) cur.wins += 1;
    bmap.set(r.athleteId, cur);
  }

  const brackets = [];
  for (const id of BRACKET_ORDER) {
    const bmap = byBracket.get(id);
    if (!bmap || bmap.size === 0) continue; // only non-empty brackets appear

    // Best `counted` weeks sum toward the season (drop-week rule); an
    // athlete with fewer played weeks simply sums what they have.
    for (const cur of bmap.values()) {
      cur.points = cur.scores
        .sort((a, b) => b - a)
        .slice(0, counted)
        .reduce((sum, p) => sum + p, 0);
    }

    const ranked = [...bmap.values()].sort((a, b) => b.points - a.points);
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

    brackets.push({ id, label: id === 'open' ? 'Open' : BRACKET_LABEL_BY_ID.get(id) ?? id, standings });
  }

  // Events, most recent first; each event's results sorted bracket order
  // then derived position.
  const bracketRank = new Map(BRACKET_ORDER.map((id, i) => [id, i]));
  const bySession = new Map();
  for (const r of derivedRows) {
    let ev = bySession.get(r.sessionId);
    if (!ev) {
      ev = { sessionId: r.sessionId, date: r.date, rows: [] };
      bySession.set(r.sessionId, ev);
    }
    ev.rows.push(r);
  }
  const events = [...bySession.values()]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((ev) => ({
      sessionId: ev.sessionId,
      date: ev.date,
      label: labelOf(ev.sessionId),
      results: ev.rows
        .slice()
        .sort((a, b) => {
          const ra = bracketRank.get(a.groupBracket) ?? BRACKET_ORDER.length;
          const rb = bracketRank.get(b.groupBracket) ?? BRACKET_ORDER.length;
          return ra !== rb ? ra - rb : a.position - b.position;
        })
        .map((r) => ({
          athleteId: r.athleteId,
          name: r.name ?? nameOf(r.athleteId),
          bracket: r.bracket ?? null,
          score: r.score,
          position: r.position,
        })),
    }));

  return { brackets, events, counting: { eventsHeld, counted, drops } };
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
 * Sprint 8: each kid also gets a bracket (10U / 11-13 / 14+, spread across
 * all three so every bracket in the demo is non-empty) and a believable
 * 9-hole-ish strokes score per event, rather than a hand-typed finishing
 * position — deriveTourStandings computes position/points/standings from
 * these exactly like the live path does. Scores are chosen so each bracket's
 * DERIVED order tells the same relative story the old academy-wide
 * positions did (e.g. bergstrom was always the best of the 14+ kids;
 * sandoval's scores keep her behind nico once he joins the 10U field).
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

// [sessionId, date, athleteId, bracket, score] per row. Nico's field (5 kids
// -> 8 kids across the three events) grows the way a season roster really
// does as more families' tournament weekends line up. bracket assignments:
// 10U -> nico, sandoval; 11-13 -> jordan, reese, nguyen; 14+ -> bergstrom,
// okonkwo, alvarez.
const TOUR_SEED_RESULTS = [
  // EVENT_3 - oldest, 6 finishers, no Nico yet.
  [`${EVENT_3}-1`, EVENT_3, 'bergstrom', '14+', 39],
  [`${EVENT_3}-1`, EVENT_3, 'jordan', '11-13', 41],
  [`${EVENT_3}-1`, EVENT_3, 'nguyen', '11-13', 45],
  [`${EVENT_3}-1`, EVENT_3, 'sandoval', '10U', 50],
  [`${EVENT_3}-1`, EVENT_3, 'alvarez', '14+', 44],
  [`${EVENT_3}-1`, EVENT_3, 'okonkwo', '14+', 47],
  // EVENT_2 - 7 finishers, still no Nico.
  [`${EVENT_2}-1`, EVENT_2, 'jordan', '11-13', 37],
  [`${EVENT_2}-1`, EVENT_2, 'bergstrom', '14+', 38],
  [`${EVENT_2}-1`, EVENT_2, 'okonkwo', '14+', 42],
  [`${EVENT_2}-1`, EVENT_2, 'nguyen', '11-13', 43],
  [`${EVENT_2}-1`, EVENT_2, 'reese', '11-13', 46],
  [`${EVENT_2}-1`, EVENT_2, 'alvarez', '14+', 48],
  [`${EVENT_2}-1`, EVENT_2, 'sandoval', '10U', 49],
  // EVENT_1 - most recent, all 8, Nico's first tournament.
  [`${EVENT_1}-1`, EVENT_1, 'bergstrom', '14+', 36],
  [`${EVENT_1}-1`, EVENT_1, 'jordan', '11-13', 39],
  [`${EVENT_1}-1`, EVENT_1, 'reese', '11-13', 41],
  [`${EVENT_1}-1`, EVENT_1, 'nguyen', '11-13', 43],
  [`${EVENT_1}-1`, EVENT_1, 'nico', '10U', 47],
  [`${EVENT_1}-1`, EVENT_1, 'sandoval', '10U', 50],
  [`${EVENT_1}-1`, EVENT_1, 'okonkwo', '14+', 46],
  [`${EVENT_1}-1`, EVENT_1, 'alvarez', '14+', 49],
].map(([sessionId, date, athleteId, bracket, score]) => ({ sessionId, date, athleteId, bracket, score }));

/** The seed fallback for useTourStandings — computed, not hand-summed. */
export const TOUR_SEED = deriveTourStandings(TOUR_SEED_RESULTS, {
  nameById: TOUR_SEED_NAMES,
  labelById: TOUR_SEED_LABELS,
});
