/**
 * RYP Tour — the Saturday leaderboards (Sprint 8 pins, docs/portal/TEAM.md;
 * age groups, gender, coaches and the points table replaced by the owner's
 * rulings of 2026-11-06, TEAM.md "Sprint 8 amendment 2026-11-06").
 *
 * Coaches enter raw SCORES (strokes) per player. POSITION AND POINTS ARE
 * DERIVED, NEVER STORED: every tournament block on one Saturday pools into
 * a single weekly event (v1.6.1), each player's best round that day counts,
 * and on every leaderboard the player belongs to (data/tourBoards.js) the
 * ascending score decides the finishing order. Equal scores share a place,
 * and the next distinct score resumes at its 1-based index (1, 2, 2, 4).
 * Points come from that place (TOUR_POINTS), and a season total is the sum
 * of every Saturday's points - no week is dropped. Retuning the table, the
 * age groups or the boards rescores the whole season at the next read.
 *
 * `bracket` and `gender` are write-time snapshots on each tournamentResults
 * doc (data/tourBrackets.js): the standings group by them with no
 * cross-family athlete read. deriveTourStandings() is the one ranking/points
 * algorithm, used by the seed demo (data/tourSeed.js) and the live read
 * (hooks/index.js) alike, so screens see identical math either way.
 */
import { boardLabel, boardOrder, boardsOf, homeBoardOf } from './tourBoards';

export {
  BRACKETS,
  COACH_BRACKET,
  LEGACY_BRACKETS,
  bracketFor,
  bracketLabel,
  isCoachId,
  needsGender,
} from './tourBrackets';

/**
 * What a Tour event is, in the owner's wording (2026-09-30; groups, holes,
 * leaderboards and coaches per the 2026-11-06 rulings). The one copy - Book
 * a Session shows it on a day with a Tour event, the Tour tab to a parent or
 * athlete.
 */
const TOUR_EVENT_BASE =
  "A Tour event is the academy's Saturday tournament. 10 & under play 9 holes and everyone 11 and up plays 18. Coaches record every score, and the leaderboards rank players overall, by age group (10 & under, 11–14, 15–18) and by boys and girls; coaches play too. Points count toward the season standings on the Tour tab.";
export const TOUR_EVENT_EXPLAINER = `${TOUR_EVENT_BASE} One token per event.`;

/**
 * The explainer for the reader in front of it (tester Mike 2026-09-30: no
 * talk of tokens for Elite). `unlimited` true drops the token sentence;
 * anything else - a token athlete, or not known yet - keeps the full copy.
 */
export function tourEventExplainer(unlimited) {
  return unlimited === true ? TOUR_EVENT_BASE : TOUR_EVENT_EXPLAINER;
}

/**
 * Finishing place (1-indexed) -> points, per Saturday, per leaderboard
 * (owner 2026-11-06: "make the point distribution such that you're not so
 * penalized for missing one"; "don't drop scores, that will get
 * confusing"). Index 0 is 1st place. A flat table: one missed Saturday
 * costs at most 10, so a kid who misses a week stays in the race without
 * any dropped-week rule.
 */
export const TOUR_POINTS = [10, 9, 8, 7, 6, 5, 4, 3, 2];

/** Every other player with a score that Saturday (10th and beyond). */
export const PARTICIPATION_POINTS = 1;

/** The points rule in one line, for the standings card. */
export const TOUR_POINTS_RULE =
  'Points each Saturday: 10 for 1st, 9 for 2nd, down to 2 for 9th, and 1 for every other score. Ties share the place and its points, and every Saturday counts.';

/**
 * Place -> points. Anything past the table - or not a valid place - earns
 * the participation point: a recorded score always counts for something.
 */
export function pointsForPosition(position) {
  const p = Number(position);
  if (!Number.isInteger(p) || p < 1) return PARTICIPATION_POINTS;
  return TOUR_POINTS[p - 1] ?? PARTICIPATION_POINTS;
}

/** Rows sorted by score ascending -> the same rows with competition-ranked `position` and its `points`. */
function placeRows(rows) {
  let lastScore = null;
  let lastPosition = 0;
  return rows
    .slice()
    .sort((a, b) => a.score - b.score)
    .map((r, i) => {
      const position = r.score === lastScore ? lastPosition : i + 1;
      lastScore = r.score;
      lastPosition = position;
      return { ...r, position, points: pointsForPosition(position) };
    });
}

const lookup = (m, k) => (m && m.get ? m.get(k) : m?.[k]) ?? null;

/**
 * Raw score rows -> { boards, events } (useTourStandings' shape):
 *   boards: [{ id, label, standings: [{ athleteId, name, rank, points,
 *     events, wins }] }] - every non-empty board, in tourBoards order
 *   events: [{ date, label, results: [{ athleteId, name, bracket, gender,
 *     board, score, position, points }], boards: { [boardId]: [{
 *     athleteId, name, score, position, points }] } }] - most recent first
 *
 * `results` are tournamentResults docs ({ sessionId, date, athleteId,
 * score, bracket?, gender?, name? }); a row without an int `score` is
 * skipped. A row's own `name` snapshot wins over `nameById` (pre-v1.5.1
 * docs only). `labelById` maps sessionId -> an explicit session label.
 *
 * An event's flat `results` list each player once, under their HOME board
 * (their age board, data/tourBoards.js homeBoardOf), with the place and
 * points they earned there - what the score sheet re-reads. `boards` holds
 * the same Saturday ranked on every board, which is what the standings
 * screen's filters show.
 */
export function deriveTourStandings(results, { nameById = new Map(), labelById = new Map() } = {}) {
  // One weekly event per DATE (v1.6.1): a player with rounds in two blocks
  // that day keeps the lowest, never a sum, and the week counts once.
  const best = new Map();
  for (const r of results || []) {
    if (!r || !Number.isInteger(r.score)) continue;
    const key = `${r.date}::${r.athleteId}`;
    const cur = best.get(key);
    if (!cur || r.score < cur.score) best.set(key, r);
  }

  const byDate = new Map();
  for (const r of best.values()) {
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date).push({ ...r, name: r.name || lookup(nameById, r.athleteId) });
  }

  const season = new Map(); // boardId -> Map(athleteId -> running total)
  const events = [];
  for (const date of [...byDate.keys()].sort()) {
    const rows = byDate.get(date);
    const perBoard = new Map();
    for (const r of rows) {
      for (const id of boardsOf(r)) {
        if (!perBoard.has(id)) perBoard.set(id, []);
        perBoard.get(id).push(r);
      }
    }
    const boards = {};
    const home = new Map();
    for (const id of boardOrder(perBoard.keys())) {
      const placed = placeRows(perBoard.get(id));
      boards[id] = placed.map((r) => ({ athleteId: r.athleteId, name: r.name, score: r.score, position: r.position, points: r.points }));
      if (!season.has(id)) season.set(id, new Map());
      const totals = season.get(id);
      for (const r of placed) {
        const cur = totals.get(r.athleteId) || { athleteId: r.athleteId, name: null, points: 0, events: 0, wins: 0 };
        if (r.name) cur.name = r.name;
        cur.points += r.points;
        cur.events += 1;
        if (r.position === 1) cur.wins += 1;
        totals.set(r.athleteId, cur);
        if (homeBoardOf(r) === id) home.set(r.athleteId, { ...r, board: id });
      }
    }
    const order = boardOrder(new Set([...home.values()].map((r) => r.board)));
    const flat = [...home.values()].sort((a, b) =>
      a.board !== b.board ? order.indexOf(a.board) - order.indexOf(b.board) : a.position - b.position
    );
    const sessionIds = [...new Set(rows.map((r) => r.sessionId))].sort();
    events.push({
      date,
      // Any explicit session label among that date's blocks names the whole
      // weekly event (a holiday special), else the plain fallback.
      label: sessionIds.map((s) => lookup(labelById, s)).find(Boolean) || 'Tour event',
      results: flat.map((r) => ({
        athleteId: r.athleteId,
        name: r.name ?? null,
        bracket: r.bracket ?? null,
        gender: r.gender ?? null,
        board: r.board,
        score: r.score,
        position: r.position,
        points: r.points,
      })),
      boards,
    });
  }
  events.reverse();

  const boards = boardOrder(season.keys()).map((id) => {
    // Season total = every Saturday's points summed; ties share a rank.
    const ranked = [...season.get(id).values()].sort((a, b) => b.points - a.points);
    let lastPoints = null;
    let lastRank = 0;
    const standings = ranked.map((row, i) => {
      const rank = row.points === lastPoints ? lastRank : i + 1;
      lastPoints = row.points;
      lastRank = rank;
      return { athleteId: row.athleteId, name: row.name ?? lookup(nameById, row.athleteId), rank, points: row.points, events: row.events, wins: row.wins };
    });
    return { id, label: boardLabel(id), standings };
  });

  return { boards, events };
}
