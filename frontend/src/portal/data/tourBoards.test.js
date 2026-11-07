/*
 * The Tour's leaderboards (owner rulings 2026-11-06): which boards a result
 * counts on, their order, and the standings screen's Age x Gender filters -
 * every combination is exactly one board.
 */
import {
  AGE_FILTERS,
  BOARDS,
  ageFiltersFor,
  boardIdFor,
  boardLabel,
  boardOrder,
  boardsOf,
  defaultAgeFor,
  genderFiltersFor,
  homeBoardOf,
} from './tourBoards';

test.each([
  [{ bracket: '11-14', gender: 'girls' }, ['overall', '11-14', 'girls', '11-14-girls'], '11-14'],
  [{ bracket: '11-14', gender: 'boys' }, ['overall', '11-14', 'boys', '11-14-boys'], '11-14'],
  [{ bracket: '15-18', gender: 'girls' }, ['overall', '15-18', 'girls', '15-18-girls'], '15-18'],
  [{ bracket: '15-18', gender: null }, ['overall', '15-18'], '15-18'],
  [{ bracket: '10U', gender: 'boys' }, ['10U'], '10U'],
  [{ bracket: 'coaches', gender: 'boys' }, ['coaches', 'coaches-men'], 'coaches'],
  [{ bracket: 'coaches', gender: 'girls' }, ['coaches', 'coaches-women'], 'coaches'],
  [{ bracket: 'coaches', gender: null }, ['coaches'], 'coaches'],
  [{ bracket: null, gender: 'girls' }, ['open'], 'open'],
  [{ bracket: '11-13', gender: null }, ['11-13'], '11-13'],
  [{ bracket: '14+', gender: 'boys' }, ['14+'], '14+'],
  [{ bracket: 'boys', gender: null }, ['other:boys'], 'other:boys'],
])('%j counts on %j, home board %s', (result, boards, home) => {
  expect(boardsOf(result)).toEqual(boards);
  expect(homeBoardOf(result)).toBe(home);
});

test('an unknown gender value counts as none', () => {
  expect(boardsOf({ bracket: '11-14', gender: 'Girls' })).toEqual(['overall', '11-14']);
});

test('board order and labels', () => {
  expect(BOARDS.map((b) => b.label)).toEqual([
    'Overall', 'Boys', 'Girls', '10 & under', '11–14', '11–14 Boys', '11–14 Girls', '15–18', '15–18 Boys', '15–18 Girls',
    'Coaches', 'Coaches · Men', 'Coaches · Women', 'Open', '11–13', '14 & up',
  ]);
  expect(boardOrder(['other:b', 'open', 'girls', 'other:a', 'overall', '14+'])).toEqual(['overall', 'girls', 'open', '14+', 'other:a', 'other:b']);
  expect(boardLabel('other:zz')).toBe('zz');
});

test('the Age chips: five always, Open only when someone has no dob, a legacy board only when it holds results', () => {
  expect(AGE_FILTERS.map((f) => f.label)).toEqual(['11–18 overall', '10 & under', '11–14', '15–18', 'Coaches']);
  expect(ageFiltersFor(['overall', '10U']).map((f) => f.id)).toEqual(['all', '10U', '11-14', '15-18', 'coaches']);
  expect(ageFiltersFor(['overall', 'open', '14+', 'other:zz']).map((f) => [f.id, f.label])).toEqual([
    ['all', '11–18 overall'], ['10U', '10 & under'], ['11-14', '11–14'], ['15-18', '15–18'], ['coaches', 'Coaches'],
    ['open', 'Open'], ['14+', '14 & up'], ['other:zz', 'zz'],
  ]);
});

test('the Gender chips: Boys / Girls, Men / Women for coaches, none for a one-board age', () => {
  const labels = (age) => genderFiltersFor(age)?.map((g) => g.label) ?? null;
  expect(labels('all')).toEqual(['All', 'Boys', 'Girls']);
  expect(labels('11-14')).toEqual(['All', 'Boys', 'Girls']);
  expect(labels('15-18')).toEqual(['All', 'Boys', 'Girls']);
  expect(labels('coaches')).toEqual(['All', 'Men', 'Women']);
  expect(labels('10U')).toBeNull();
  expect(labels('open')).toBeNull();
  expect(labels('14+')).toBeNull();
});

test('every Age x Gender combination is exactly one board, and each standard board is reachable', () => {
  const seen = new Map();
  for (const age of ageFiltersFor(['open', '11-13', '14+']).map((f) => f.id)) {
    for (const g of (genderFiltersFor(age) ?? [{ id: 'all' }]).map((x) => x.id)) {
      const id = boardIdFor(age, g);
      expect(seen.has(id)).toBe(false);
      seen.set(id, [age, g]);
    }
  }
  expect([...seen.keys()].sort()).toEqual(BOARDS.map((b) => b.id).sort());
  expect(boardIdFor('all', 'all')).toBe('overall');
  expect(boardIdFor('all', 'boys')).toBe('boys');
  expect(boardIdFor('11-14', 'girls')).toBe('11-14-girls');
  expect(boardIdFor('coaches', 'girls')).toBe('coaches-women');
  // A gender left selected on an age without Gender chips is ignored.
  expect(boardIdFor('10U', 'girls')).toBe('10U');
  expect(boardIdFor('open', 'boys')).toBe('open');
});

const boardsWith = (rows) => rows.map(([id, ids]) => ({ id, standings: ids.map((athleteId) => ({ athleteId })) }));

test('a family lands on the first Age filter that ranks them; staff and newcomers on 11-18 overall', () => {
  const boards = boardsWith([
    ['overall', ['teen']],
    ['11-14', ['teen']],
    ['10U', ['little']],
    ['open', ['nodob']],
    ['coaches', ['coach_pat']],
  ]);
  expect(defaultAgeFor(boards, ['teen'])).toBe('all');
  expect(defaultAgeFor(boards, ['little'])).toBe('10U');
  expect(defaultAgeFor(boards, ['nodob'])).toBe('open');
  expect(defaultAgeFor(boards, ['little', 'teen'])).toBe('all');
  expect(defaultAgeFor(boards, ['nobody-yet'])).toBe('all');
  expect(defaultAgeFor(boards, [])).toBe('all');
  expect(defaultAgeFor([], ['teen'])).toBe('all');
});
