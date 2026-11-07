/*
 * Owner ruling 2026-11-06: the Tour's age groups are 11 & under, 12-14 and
 * 15 & up, with boys and girls ranked separately at 15 & up. Age is whole
 * years on SEASON_BOUNDS.start (2026-11-03). Legacy Sprint 8 ids still rank,
 * after the current brackets, under their old labels; Open stays last.
 */
import { BRACKETS, LEGACY_BRACKETS, SPLIT_AGE_GROUP, TOUR_SEED, bracketFor, bracketLabel, deriveTourStandings } from './tour';
import { SEASON_BOUNDS } from './season';

const START = SEASON_BOUNDS.start;

test('the season starts on the date the age groups are measured on', () => {
  expect(START).toBe('2026-11-03');
});

test.each([
  ['2020-01-01', '11U'], // 6
  ['2015-11-03', '11U'], // 11 exactly on the start
  ['2014-11-04', '11U'], // 11, turns 12 the day after the start
  ['2014-11-03', '12-14'], // 12 exactly on the start
  ['2012-06-17', '12-14'], // 14
  ['2011-11-04', '12-14'], // 14, turns 15 the day after the start
  ['2011-11-03', SPLIT_AGE_GROUP], // 15 exactly on the start
  ['2008-02-01', SPLIT_AGE_GROUP], // 18
])('dob %s on the season start -> %s', (dob, group) => {
  expect(bracketFor(dob, START)).toBe(group);
});

test('no dob (or no date to measure on) is Open: null, never a guess', () => {
  expect(bracketFor(null, START)).toBeNull();
  expect(bracketFor('', START)).toBeNull();
  expect(bracketFor('2012-06-17', null)).toBeNull();
});

test('15 & up is an age group, not a bracket: bracketFor never answers 15+B or 15+G itself', () => {
  expect(SPLIT_AGE_GROUP).toBe('15+');
  expect(BRACKETS.map((b) => b.id)).toEqual(['11U', '12-14', '15+B', '15+G']);
  expect(BRACKETS.map((b) => b.id)).not.toContain(SPLIT_AGE_GROUP);
});

test('labels: the new groups, the legacy ones, the bare age group, Open, and an unknown id as itself', () => {
  expect(BRACKETS.map((b) => b.label)).toEqual(['11 & under', '12–14', '15 & up Boys', '15 & up Girls']);
  expect(LEGACY_BRACKETS.map((b) => [b.id, b.label])).toEqual([['10U', '10 & under'], ['11-13', '11–13'], ['14+', '14 & up']]);
  expect(bracketLabel('15+')).toBe('15 & up');
  expect(bracketLabel(null)).toBe('Open');
  expect(bracketLabel('open')).toBe('Open');
  expect(bracketLabel('zz')).toBe('zz');
});

const row = (athleteId, bracket, score, date = '2026-11-07') => ({ sessionId: `${date}-1`, date, athleteId, bracket, score, name: athleteId });

test('standings: the new brackets in order, then legacy ids under their old labels, then an unknown id, Open last', () => {
  const { brackets } = deriveTourStandings([
    row('open-kid', null, 40),
    row('legacy-14', '14+', 41),
    row('girl', '15+G', 42),
    row('legacy-10', '10U', 43),
    row('junk', 'zz', 44),
    row('mid', '12-14', 45),
    row('boy', '15+B', 46),
    row('young', '11U', 47),
  ]);
  expect(brackets.map((b) => [b.id, b.label])).toEqual([
    ['11U', '11 & under'],
    ['12-14', '12–14'],
    ['15+B', '15 & up Boys'],
    ['15+G', '15 & up Girls'],
    ['10U', '10 & under'],
    ['14+', '14 & up'],
    ['zz', 'zz'],
    ['open', 'Open'],
  ]);
});

test('boys and girls 15 & up rank apart: each bracket has its own winner, worth the full 100', () => {
  const { brackets, events } = deriveTourStandings([
    row('boy-a', '15+B', 38),
    row('boy-b', '15+B', 41),
    row('girl-a', '15+G', 44),
    row('girl-b', '15+G', 40),
    row('mid-a', '12-14', 39),
  ]);
  const of = (id) => brackets.find((b) => b.id === id).standings.map((s) => [s.athleteId, s.rank, s.points]);
  expect(of('15+B')).toEqual([['boy-a', 1, 100], ['boy-b', 2, 88]]);
  expect(of('15+G')).toEqual([['girl-b', 1, 100], ['girl-a', 2, 88]]);
  expect(of('12-14')).toEqual([['mid-a', 1, 100]]);
  // One weekly event; its rows in bracket order, then position.
  expect(events[0].results.map((r) => [r.athleteId, r.bracket, r.position])).toEqual([
    ['mid-a', '12-14', 1],
    ['boy-a', '15+B', 1],
    ['boy-b', '15+B', 2],
    ['girl-b', '15+G', 1],
    ['girl-a', '15+G', 2],
  ]);
});

test('the demo season uses the current ids only, and leaves the Boys/Girls brackets empty (no seed kid is 15)', () => {
  expect(TOUR_SEED.brackets.map((b) => b.id)).toEqual(['11U', '12-14']);
  const ids = new Set(TOUR_SEED.events.flatMap((e) => e.results.map((r) => r.bracket)));
  expect([...ids].sort()).toEqual(['11U', '12-14']);
});
