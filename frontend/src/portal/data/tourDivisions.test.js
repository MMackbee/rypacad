/*
 * Boys and Girls at 15 & up (owner ruling 2026-11-06): the score sheet's
 * pure half - which bracket a row stores, which rows cannot be saved yet,
 * and the pre-fill from an athlete's most recent saved 15 & up result.
 */
import {
  DIVISIONS, SPLIT_BRACKET_IDS, buildScoreEntries, divisionOf, isStorableBracket, needsDivision, priorDivisions, resolveBracket,
} from './tourDivisions';

test('the two choices, and the brackets they make', () => {
  expect(DIVISIONS.map((d) => [d.id, d.label])).toEqual([['B', 'Boys'], ['G', 'Girls']]);
  expect(SPLIT_BRACKET_IDS).toEqual(['15+B', '15+G']);
  expect(needsDivision('15+')).toBe(true);
  expect(needsDivision('12-14')).toBe(false);
  expect(needsDivision(null)).toBe(false);
});

test('resolveBracket: 11U, 12-14 and Open ignore a pick; 15+ takes Boys or Girls, and stays a bare 15+ without one', () => {
  expect(resolveBracket('11U', 'B')).toBe('11U');
  expect(resolveBracket('12-14', null)).toBe('12-14');
  expect(resolveBracket(null, 'G')).toBeNull();
  expect(resolveBracket('15+', 'B')).toBe('15+B');
  expect(resolveBracket('15+', 'G')).toBe('15+G');
  expect(resolveBracket('15+', null)).toBe('15+');
  expect(resolveBracket('15+', 'X')).toBe('15+');
});

test('isStorableBracket: the four current ids and null; never a bare 15+, a legacy id or junk', () => {
  for (const id of ['11U', '12-14', '15+B', '15+G', null]) expect(isStorableBracket(id)).toBe(true);
  for (const id of ['15+', '10U', '11-13', '14+', 'open', '', 'zz', undefined]) expect(isStorableBracket(id)).toBe(false);
});

test('divisionOf reads Boys/Girls back off a stored bracket', () => {
  expect(divisionOf('15+B')).toBe('B');
  expect(divisionOf('15+G')).toBe('G');
  expect(divisionOf('14+')).toBeNull();
  expect(divisionOf(null)).toBeNull();
});

// A Firestore Timestamp stand-in: the fetched docs carry createdAt as one.
const ts = (ms) => ({ toMillis: () => ms });

test('priorDivisions: the most recent 15 & up result by date wins, from any date', () => {
  const prior = priorDivisions(
    [
      { athleteId: 'ava', bracket: '15+G', date: '2026-11-07', createdAt: ts(1) },
      { athleteId: 'ava', bracket: '15+B', date: '2026-11-14', createdAt: ts(0) }, // later Saturday wins
      { athleteId: 'ben', bracket: '15+B', date: '2026-11-21', createdAt: ts(5) },
      { athleteId: 'ben', bracket: '12-14', date: '2026-11-28', createdAt: ts(9) }, // not a 15 & up result
      { athleteId: 'cal', bracket: '15+G', date: '2026-11-07' }, // not on this roster
    ],
    ['ava', 'ben', 'dee']
  );
  expect(prior).toEqual({ ava: 'B', ben: 'B' });
});

test('priorDivisions: two results on one date (two blocks) go to the later createdAt', () => {
  const rows = [
    { athleteId: 'ava', bracket: '15+B', date: '2026-11-07', createdAt: ts(2000) },
    { athleteId: 'ava', bracket: '15+G', date: '2026-11-07', createdAt: ts(3000) },
  ];
  expect(priorDivisions(rows, ['ava'])).toEqual({ ava: 'G' });
  expect(priorDivisions(rows.slice().reverse(), ['ava'])).toEqual({ ava: 'G' });
  expect(priorDivisions([], ['ava'])).toEqual({});
  expect(priorDivisions(null, null)).toEqual({});
});

test('buildScoreEntries: scored rows save with their bracket; a scored 15 & up row with no pick is held back and named', () => {
  const { entries, needsDivision: held } = buildScoreEntries([
    { athleteId: 'a11', name: 'Ada Test', label: 'Ada Test', group: '11U', division: null, score: 44 },
    { athleteId: 'a14', name: 'Bo Test', label: 'Bo Test', group: '12-14', division: null, score: 40 },
    { athleteId: 'a15b', name: 'Cy Test', label: 'Cy Test', group: '15+', division: 'B', score: 38 },
    { athleteId: 'a15g', name: 'Di Test', label: 'Di Test', group: '15+', division: 'G', score: 41 },
    { athleteId: 'a15x', name: 'Ed Test', label: 'Ed Test', group: '15+', division: null, score: 39 },
    { athleteId: 'anone', name: null, label: 'Name unavailable', group: null, division: null, score: 50 },
    { athleteId: 'unscored', name: 'Fay Test', label: 'Fay Test', group: '15+', division: null, score: null },
  ]);
  expect(entries).toEqual([
    { athleteId: 'a11', name: 'Ada Test', bracket: '11U', score: 44 },
    { athleteId: 'a14', name: 'Bo Test', bracket: '12-14', score: 40 },
    { athleteId: 'a15b', name: 'Cy Test', bracket: '15+B', score: 38 },
    { athleteId: 'a15g', name: 'Di Test', bracket: '15+G', score: 41 },
    { athleteId: 'anone', name: null, bracket: null, score: 50 },
  ]);
  // Ed has a score but no pick: not saved, and named. Fay has no score: in neither list.
  expect(held).toEqual([{ athleteId: 'a15x', label: 'Ed Test' }]);
  expect(entries.some((e) => e.bracket === '15+')).toBe(false);
});
