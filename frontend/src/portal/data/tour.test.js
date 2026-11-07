/*
 * Owner rulings 2026-11-06: age groups 10 & under (9 holes), 11-14 and
 * 15-18 (18 holes), coaches compete too, boys and girls get boards of their
 * own, and points are 10, 9, 8 ... 2 for 1st to 9th and 1 for every other
 * score, summed over every Saturday - no dropped weeks. Age is whole years
 * on SEASON_BOUNDS.start (2026-11-03). Invented names throughout.
 */
import {
  BRACKETS,
  LEGACY_BRACKETS,
  PARTICIPATION_POINTS,
  TOUR_EVENT_EXPLAINER,
  TOUR_POINTS,
  TOUR_POINTS_RULE,
  bracketFor,
  bracketLabel,
  deriveTourStandings,
  pointsForPosition,
} from './tour';
import { TOUR_SEED, TOUR_SEED_RESULTS } from './tourSeed';
import { SEASON_BOUNDS } from './season';

const START = SEASON_BOUNDS.start;

test('the season starts on the date the age groups are measured on', () => {
  expect(START).toBe('2026-11-03');
});

test.each([
  ['2020-01-01', '10U'], // 6
  ['2016-11-03', '10U'], // 10 exactly on the start
  ['2015-11-04', '10U'], // 10, turns 11 the day after the start
  ['2015-11-03', '11-14'], // 11 exactly on the start
  ['2012-06-17', '11-14'], // 14
  ['2011-11-04', '11-14'], // 14, turns 15 the day after the start
  ['2011-11-03', '15-18'], // 15 exactly on the start
  ['2008-02-01', '15-18'], // 18
  ['1990-05-05', '15-18'], // an adult, rare, lands here too
])('dob %s on the season start -> %s', (dob, bracket) => {
  expect(bracketFor(dob, START)).toBe(bracket);
});

test('no dob (or no date to measure on) is Open: null, never a guess', () => {
  expect(bracketFor(null, START)).toBeNull();
  expect(bracketFor('', START)).toBeNull();
  expect(bracketFor('2012-06-17', null)).toBeNull();
});

test('the groups, their holes and labels; legacy ids keep their old labels', () => {
  expect(BRACKETS.map((b) => [b.id, b.label, b.holes])).toEqual([['10U', '10 & under', 9], ['11-14', '11–14', 18], ['15-18', '15–18', 18]]);
  expect(LEGACY_BRACKETS.map((b) => [b.id, b.label])).toEqual([['11-13', '11–13'], ['14+', '14 & up']]);
  expect(bracketLabel('coaches')).toBe('Coaches');
  expect(bracketLabel(null)).toBe('Open');
  expect(bracketLabel('zz')).toBe('zz');
});

test('points: 10 for 1st down to 2 for 9th, 1 for everyone else with a score', () => {
  expect(TOUR_POINTS).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2]);
  expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(pointsForPosition)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2]);
  expect([10, 11, 25, 60].map(pointsForPosition)).toEqual([1, 1, 1, 1]);
  expect(PARTICIPATION_POINTS).toBe(1);
  expect([0, -1, 2.5, 'x', null].map(pointsForPosition)).toEqual([1, 1, 1, 1, 1]);
  expect(TOUR_POINTS_RULE).toBe(
    'Points each Saturday: 10 for 1st, 9 for 2nd, down to 2 for 9th, and 1 for every other score. Ties share the place and its points, and every Saturday counts.'
  );
});

test('the explainer names the new groups, holes, boys and girls and coaches', () => {
  expect(TOUR_EVENT_EXPLAINER).toBe(
    "A Tour event is the academy's Saturday tournament. 10 & under play 9 holes and everyone 11 and up plays 18. Coaches record every score, and the leaderboards rank players overall, by age group (10 & under, 11–14, 15–18) and by boys and girls; coaches play too. Points count toward the season standings on the Tour tab. One token per event."
  );
});

const row = (athleteId, bracket, gender, score, date = '2026-11-07', sessionId = `${date}-1`) => ({ sessionId, date, athleteId, bracket, gender, score, name: athleteId });
const board = (derived, id) => derived.boards.find((b) => b.id === id)?.standings.map((s) => [s.athleteId, s.rank, s.points]) ?? null;

test('ties share the place and its points: 1, 2, 2, 4 earns 10, 9, 9, 7', () => {
  const d = deriveTourStandings([row('Ana', '11-14', 'girls', 80), row('Bo', '11-14', 'boys', 84), row('Cy', '11-14', 'boys', 84), row('Di', '11-14', 'girls', 90)]);
  expect(d.events[0].boards['11-14'].map((r) => [r.athleteId, r.position, r.points])).toEqual([['Ana', 1, 10], ['Bo', 2, 9], ['Cy', 2, 9], ['Di', 4, 7]]);
  expect(board(d, '11-14')).toEqual([['Ana', 1, 10], ['Bo', 2, 9], ['Cy', 2, 9], ['Di', 4, 7]]);
});

test('10th place and beyond each bank 1 point', () => {
  const field = Array.from({ length: 12 }, (_, i) => row(`P${String(i + 1).padStart(2, '0')}`, '15-18', 'boys', 70 + i));
  const d = deriveTourStandings(field);
  expect(d.events[0].boards['15-18'].map((r) => r.points)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 1]);
});

test('one result counts on every board it belongs to, ranked against that board only', () => {
  const d = deriveTourStandings([
    row('Ana', '11-14', 'girls', 82),
    row('Bo', '15-18', 'boys', 74),
    row('Eve', '15-18', 'girls', 78),
    row('Gus', '11-14', 'boys', 90),
    row('Kit', '10U', 'boys', 40),
  ]);
  expect(board(d, 'overall')).toEqual([['Bo', 1, 10], ['Eve', 2, 9], ['Ana', 3, 8], ['Gus', 4, 7]]);
  expect(board(d, 'girls')).toEqual([['Eve', 1, 10], ['Ana', 2, 9]]);
  expect(board(d, 'boys')).toEqual([['Bo', 1, 10], ['Gus', 2, 9]]);
  expect(board(d, '11-14')).toEqual([['Ana', 1, 10], ['Gus', 2, 9]]);
  expect(board(d, '11-14-girls')).toEqual([['Ana', 1, 10]]);
  expect(board(d, '15-18-boys')).toEqual([['Bo', 1, 10]]);
  // 10 & under play 9 holes: never on Overall, Boys or Girls.
  expect(board(d, '10U')).toEqual([['Kit', 1, 10]]);
  expect(d.boards.map((b) => b.id)).toEqual(['overall', 'boys', 'girls', '10U', '11-14', '11-14-boys', '11-14-girls', '15-18', '15-18-boys', '15-18-girls']);
});

test('a result with no gender counts on Overall and its age board, never a gender board', () => {
  const d = deriveTourStandings([row('Old', '11-14', null, 85), row('Ana', '11-14', 'girls', 82)]);
  expect(board(d, 'overall')).toEqual([['Ana', 1, 10], ['Old', 2, 9]]);
  expect(board(d, '11-14')).toEqual([['Ana', 1, 10], ['Old', 2, 9]]);
  expect(board(d, 'girls')).toEqual([['Ana', 1, 10]]);
  expect(board(d, 'boys')).toBeNull();
});

test('coaches have their own boards, Men and Women included; Open and legacy ids come after, outside Overall', () => {
  const d = deriveTourStandings([
    row('coach_pat', 'coaches', 'boys', 76),
    row('coach_sky', 'coaches', 'girls', 79),
    row('NoDob', null, null, 88),
    row('Legacy', '14+', null, 81),
    row('Junk', 'zz', null, 83),
    row('Mid', '11-14', 'boys', 86),
  ]);
  expect(d.boards.map((b) => [b.id, b.label])).toEqual([
    ['overall', 'Overall'],
    ['boys', 'Boys'],
    ['11-14', '11–14'],
    ['11-14-boys', '11–14 Boys'],
    ['coaches', 'Coaches'],
    ['coaches-men', 'Coaches · Men'],
    ['coaches-women', 'Coaches · Women'],
    ['open', 'Open'],
    ['14+', '14 & up'],
    ['other:zz', 'zz'],
  ]);
  expect(board(d, 'overall')).toEqual([['Mid', 1, 10]]);
  expect(board(d, 'coaches')).toEqual([['coach_pat', 1, 10], ['coach_sky', 2, 9]]);
});

test('both blocks of one Saturday pool into one event; a player in both keeps the better round', () => {
  const d = deriveTourStandings([
    row('Ana', '11-14', 'girls', 88, '2026-11-07', '2026-11-07-1'),
    row('Ana', '11-14', 'girls', 81, '2026-11-07', '2026-11-07-2'),
    row('Bo', '11-14', 'boys', 84, '2026-11-07', '2026-11-07-2'),
  ]);
  expect(d.events).toHaveLength(1);
  expect(d.events[0].boards['11-14'].map((r) => [r.athleteId, r.score, r.position])).toEqual([['Ana', 81, 1], ['Bo', 84, 2]]);
  expect(board(d, '11-14')).toEqual([['Ana', 1, 10], ['Bo', 2, 9]]);
});

test('no dropped weeks: a season total is every Saturday summed, so one missed week costs at most 10', () => {
  const sats = ['2026-11-07', '2026-11-14', '2026-11-21', '2026-11-28', '2026-12-05', '2026-12-12', '2026-12-19'];
  const rows = sats.flatMap((date, i) => [
    row('Steady', '15-18', 'girls', 80, date), // 2nd every week
    row('Winner', '15-18', 'girls', 75, date), // 1st every week
    ...(i === 3 ? [] : [row('Missed', '15-18', 'girls', 74, date)]), // misses one Saturday
  ]);
  const d = deriveTourStandings(rows);
  // Missed wins six weeks (60); in the missed week Winner wins and Steady is 2nd.
  // Winner: six 2nds (54) + one win (10) = 64; Steady: six 3rds (48) + one 2nd (9) = 57.
  expect(board(d, '15-18')).toEqual([['Winner', 1, 64], ['Missed', 2, 60], ['Steady', 3, 57]]);
  const standing = d.boards.find((b) => b.id === '15-18').standings;
  expect(standing.map((s) => [s.athleteId, s.events, s.wins])).toEqual([['Winner', 7, 1], ['Missed', 6, 6], ['Steady', 7, 0]]);
  expect(d).not.toHaveProperty('counting');
});

test('equal season totals share a rank', () => {
  const d = deriveTourStandings([
    row('Ana', '11-14', 'girls', 80, '2026-11-07'),
    row('Bo', '11-14', 'boys', 85, '2026-11-07'),
    row('Bo', '11-14', 'boys', 80, '2026-11-14'),
    row('Ana', '11-14', 'girls', 85, '2026-11-14'),
    row('Cy', '11-14', 'boys', 99, '2026-11-14'),
  ]);
  expect(board(d, '11-14')).toEqual([['Ana', 1, 19], ['Bo', 1, 19], ['Cy', 3, 8]]);
});

test("events: most recent first, a label from any of the day's blocks, each player once under their age board", () => {
  const d = deriveTourStandings(
    [row('Kit', '10U', null, 42, '2026-11-07'), row('Ana', '11-14', 'girls', 81, '2026-11-07'), row('coach_pat', 'coaches', 'boys', 77, '2026-11-07'), row('Ana', '11-14', 'girls', 79, '2026-12-26')],
    { labelById: { '2026-12-26-1': 'Holiday Tour event' } }
  );
  expect(d.events.map((e) => [e.date, e.label])).toEqual([['2026-12-26', 'Holiday Tour event'], ['2026-11-07', 'Tour event']]);
  expect(d.events[1].results.map((r) => [r.athleteId, r.board, r.position, r.points, r.gender])).toEqual([
    ['Kit', '10U', 1, 10, null],
    ['Ana', '11-14', 1, 10, 'girls'],
    ['coach_pat', 'coaches', 1, 10, 'boys'],
  ]);
});

test('a row without an int score is skipped; nameById fills a missing name', () => {
  const d = deriveTourStandings([{ sessionId: '2026-11-07-1', date: '2026-11-07', athleteId: 'a1', bracket: '11-14', score: 80 }, { ...row('x', '11-14', 'boys', 'NaN') }], { nameById: { a1: 'Avery Test' } });
  expect(d.boards.find((b) => b.id === '11-14').standings.map((s) => s.name)).toEqual(['Avery Test']);
});

test('the demo season uses the current ids only and is computed, not hand-summed', () => {
  const ids = new Set(TOUR_SEED_RESULTS.map((r) => r.bracket));
  expect([...ids].sort()).toEqual(['10U', '11-14']);
  expect(TOUR_SEED.boards.map((b) => b.id)).toEqual(['overall', 'boys', 'girls', '10U', '11-14', '11-14-boys', '11-14-girls']);
  // Bergstrom edges Jordan for the best season on Overall: three Saturdays summed.
  expect(TOUR_SEED.boards[0].standings.map((s) => [s.name, s.points])).toEqual([
    ['S. Bergstrom', 29],
    ['Jordan Whitfield', 28],
    ['A. Nguyen', 22],
    ['T. Alvarez', 20],
    ['R. Sandoval', 16],
    ['Reese Whitfield', 15],
  ]);
});
