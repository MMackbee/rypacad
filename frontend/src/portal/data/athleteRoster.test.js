import {
  COUNT_EMPTY, FITNESS_DONE_KEY, PARALLAX_DONE_KEY, ROSTER_FILTERS, SEARCH_PLACEHOLDER,
  countLine, filterRows, markOf, membershipLabel, rosterRows, searchRows, sortRows,
} from './athleteRoster';

const TODAY = '2026-11-23';
const AT = new Date('2026-11-12T22:00:00Z');
const mark = (byName = 'Luke') => ({ athleteId: 'x', at: AT, by: 'u', byName });

const HOUSEHOLDS = [
  { id: 'h-kim', name: 'Kim family' },
  { id: 'h-moss', name: 'Moss family' },
  { id: 'h-test', name: 'RYP Test Family', test: true },
];
const ATHLETES = [
  { id: 'a-kim', name: 'Dana Kim', householdId: 'h-kim', dob: '2012-11-23', packageId: 't-12', billing: { status: 'active' } },
  { id: 'a-ada', name: 'Ada Moss', householdId: 'h-moss', dob: '2012-11-24', packageId: 'elite', billing: { status: 'pending' } },
  { id: 'a-bo', name: 'Bo Moss', householdId: 'h-moss', dob: '2015-01-05' },
  { id: 'a-test', name: 'Zed Tester', householdId: 'h-test', dob: '2010-01-01', packageId: 't-6' },
  { id: 'a-flag', name: 'Quinn Flagged', householdId: 'h-kim', test: true },
];

describe('membershipLabel: the athlete billing record in words', () => {
  test('every wording', () => {
    expect(membershipLabel({ billing: { status: 'active' } })).toBe('Paid');
    expect(membershipLabel({ billing: { status: 'pending' } })).toBe('Not paid yet');
    expect(membershipLabel({ billing: { status: 'active', comp: true, compUntil: '2027-02-27' } })).toBe('Comped');
    expect(membershipLabel({ billing: { status: 'past_due' } })).toBe('Payment failed');
    expect(membershipLabel({ billing: { status: 'lapsed' } })).toBe('Ended');
  });

  test('no billing record says nothing; a one-time buyer moved off Single is not paid yet', () => {
    expect(membershipLabel({})).toBeNull();
    expect(membershipLabel(null)).toBeNull();
    expect(membershipLabel({ billing: null })).toBeNull();
    expect(membershipLabel({ packageId: 't-6', billing: { status: 'active', oneTime: true } })).toBe('Not paid yet');
    expect(membershipLabel({ packageId: 'single', billing: { status: 'active', oneTime: true } })).toBe('Paid');
  });

  test('a comp that is not active is not "Comped"; an unknown status says nothing', () => {
    expect(membershipLabel({ billing: { status: 'lapsed', comp: true } })).toBe('Ended');
    expect(membershipLabel({ billing: { status: 'mystery' } })).toBeNull();
  });
});

describe('rosterRows: one row per real athlete', () => {
  const rows = rosterRows({ athletes: ATHLETES, households: HOUSEHOLDS, today: TODAY });

  test('the test households, their athletes and athletes marked test are left out', () => {
    expect(rows.map((r) => r.athleteId).sort()).toEqual(['a-ada', 'a-bo', 'a-kim']);
  });

  test('the row: name, age, package, membership, family', () => {
    const kim = rows.find((r) => r.athleteId === 'a-kim');
    expect(kim).toMatchObject({ name: 'Dana Kim', age: 14, packageName: '12 tokens', membership: 'Paid', householdId: 'h-kim', householdName: 'Kim family' });
    expect(kim.line).toBe('Age 14 · 12 tokens · Paid');
    const ada = rows.find((r) => r.athleteId === 'a-ada');
    expect(ada.line).toBe('Age 13 · Elite · Not paid yet');
  });

  test('age: on the birthday, and the day before', () => {
    const day = (dob, today) => rosterRows({ athletes: [{ id: 'x', name: 'X Y', dob, householdId: 'h-kim' }], households: HOUSEHOLDS, today })[0].age;
    expect(day('2012-11-23', '2026-11-23')).toBe(14);
    expect(day('2012-11-24', '2026-11-23')).toBe(13);
    expect(day('2012-11-23', '2026-11-22')).toBe(13);
  });

  test('no dob, no package, no billing: those parts are left off the line, never a dash', () => {
    const bo = rows.find((r) => r.athleteId === 'a-bo');
    expect(bo.line).toBe('Age 11');
    const bare = rosterRows({ athletes: [{ id: 'x', name: 'Cy Lu', householdId: 'h-kim' }], households: HOUSEHOLDS, today: TODAY })[0];
    expect(bare.age).toBeNull();
    expect(bare.line).toBe('');
  });

  test('an athlete whose household is missing keeps the row with no family; a missing name falls back to the id', () => {
    const [r] = rosterRows({ athletes: [{ id: 'orphan-1', householdId: 'gone' }], households: HOUSEHOLDS, today: TODAY });
    expect(r).toMatchObject({ name: 'orphan-1', householdId: 'gone', householdName: null });
    const [n] = rosterRows({ athletes: [{ id: 'orphan-2' }], households: HOUSEHOLDS, today: TODAY });
    expect(n.householdId).toBeNull();
  });

  test('empty and missing inputs', () => {
    expect(rosterRows({ athletes: [], households: [], today: TODAY })).toEqual([]);
    expect(rosterRows({ today: TODAY })).toEqual([]);
  });
});

describe('sortRows: last name, then first, case-insensitive', () => {
  const r = (name, id = name) => ({ athleteId: id, name });
  test('sorts by last name then first; ties by id; does not change its input', () => {
    const input = [r('Bo Moss'), r('dana kim'), r('Ada Moss'), r('Zoe Adams'), r('Ada Moss', 'b-2')];
    const copy = [...input];
    expect(sortRows(input).map((x) => x.athleteId)).toEqual(['Zoe Adams', 'dana kim', 'Ada Moss', 'b-2', 'Bo Moss']);
    expect(input).toEqual(copy);
  });

  test('a one-word name, a long compound and a name with particles', () => {
    const list = [r('Madonna'), r('María José de la Cruz y Fernández'), r('Aleksandra Wiśniewska-Kowalczyk'), r('Zoe  Adams ')];
    expect(sortRows(list).map((x) => x.name)).toEqual(['Zoe  Adams ', 'María José de la Cruz y Fernández', 'Madonna', 'Aleksandra Wiśniewska-Kowalczyk']);
  });
});

describe('searchRows: athlete or family name, case-insensitive, trimmed', () => {
  const rows = rosterRows({ athletes: ATHLETES, households: HOUSEHOLDS, today: TODAY });
  test('by athlete name', () => {
    expect(searchRows(rows, 'ada').map((x) => x.athleteId)).toEqual(['a-ada']);
    expect(searchRows(rows, '  DANA ').map((x) => x.athleteId)).toEqual(['a-kim']);
  });
  test('by family name: every athlete of the family', () => {
    expect(searchRows(rows, 'moss family').map((x) => x.athleteId).sort()).toEqual(['a-ada', 'a-bo']);
  });
  test('empty or blank search returns everyone; no match returns none', () => {
    expect(searchRows(rows, '')).toHaveLength(3);
    expect(searchRows(rows, '   ')).toHaveLength(3);
    expect(searchRows(rows, undefined)).toHaveLength(3);
    expect(searchRows(rows, 'zzz')).toEqual([]);
  });
  test('the placeholder is the owner-visible copy', () => {
    expect(SEARCH_PLACEHOLDER).toBe('Search athletes or families');
  });
});

describe('markOf and filterRows', () => {
  const rows = rosterRows({ athletes: ATHLETES, households: HOUSEHOLDS, today: TODAY });
  const marks = {
    'a-kim': { [PARALLAX_DONE_KEY]: mark(), [FITNESS_DONE_KEY]: null },
    'a-ada': { [PARALLAX_DONE_KEY]: null, [FITNESS_DONE_KEY]: mark('Owner') },
    // a-bo: the read failed (no entry)
  };

  test('markOf: the mark, null for not done, undefined when the read did not land', () => {
    expect(markOf(marks, 'a-kim', PARALLAX_DONE_KEY)).toEqual(mark());
    expect(markOf(marks, 'a-kim', FITNESS_DONE_KEY)).toBeNull();
    expect(markOf(marks, 'a-bo', PARALLAX_DONE_KEY)).toBeUndefined();
    expect(markOf(undefined, 'a-bo', PARALLAX_DONE_KEY)).toBeUndefined();
  });

  test('the three filters, by key and name', () => {
    expect(ROSTER_FILTERS).toEqual([['all', 'Everyone'], ['parallax', 'Parallax not done'], ['fitness', 'Fitness not done']]);
  });

  test('everyone keeps everyone', () => {
    expect(filterRows(rows, 'all', marks)).toHaveLength(3);
    expect(filterRows(rows, undefined, marks)).toHaveLength(3);
  });

  test('Parallax not done: only athletes known to be not done (an unread mark is not "not done")', () => {
    expect(filterRows(rows, 'parallax', marks).map((r) => r.athleteId)).toEqual(['a-ada']);
  });

  test('Fitness not done likewise', () => {
    expect(filterRows(rows, 'fitness', marks).map((r) => r.athleteId)).toEqual(['a-kim']);
  });

  test('a row in the keep set stays under a filter that no longer matches it, in roster order', () => {
    const ticked = { ...marks, 'a-ada': { [PARALLAX_DONE_KEY]: mark(), [FITNESS_DONE_KEY]: mark('Owner') } };
    expect(filterRows(rows, 'parallax', ticked)).toEqual([]);
    expect(filterRows(rows, 'parallax', ticked, new Set(['a-ada'])).map((r) => r.athleteId)).toEqual(['a-ada']);
    expect(filterRows(rows, 'fitness', ticked, new Set(['a-ada'])).map((r) => r.athleteId)).toEqual(['a-kim', 'a-ada']);
  });

  test('the keep set adds nothing on Everyone, and an empty or missing one changes nothing', () => {
    expect(filterRows(rows, 'all', marks, new Set(['a-ada']))).toHaveLength(3);
    expect(filterRows(rows, 'fitness', marks, new Set()).map((r) => r.athleteId)).toEqual(['a-kim']);
    expect(filterRows(rows, 'fitness', marks, undefined).map((r) => r.athleteId)).toEqual(['a-kim']);
  });
});

describe('countLine', () => {
  const rows = rosterRows({ athletes: ATHLETES, households: HOUSEHOLDS, today: TODAY });
  const marks = {
    'a-kim': { [PARALLAX_DONE_KEY]: mark(), [FITNESS_DONE_KEY]: null },
    'a-ada': { [PARALLAX_DONE_KEY]: mark(), [FITNESS_DONE_KEY]: mark() },
    'a-bo': { [PARALLAX_DONE_KEY]: null, [FITNESS_DONE_KEY]: null },
  };

  test('with no search or filter: the total and each mark', () => {
    expect(countLine({ rows, shown: rows, marks })).toBe('3 athletes · Parallax 2 done · Fitness 1 done');
  });

  test('with a search or filter on: Showing n of total', () => {
    expect(countLine({ rows, shown: rows.slice(0, 2), marks })).toBe('Showing 2 of 3 · Parallax 2 done · Fitness 1 done');
    expect(countLine({ rows, shown: [], marks })).toBe('Showing 0 of 3 · Parallax 2 done · Fitness 1 done');
  });

  test('one athlete is singular; a mark that did not load is not counted; zero done reads "0 done"', () => {
    expect(countLine({ rows: rows.slice(0, 1), shown: rows.slice(0, 1), marks: {} })).toBe('1 athlete · Parallax 0 done · Fitness 0 done');
  });

  test('a large list shows a plain number', () => {
    const many = Array.from({ length: 1284 }, (_, i) => ({ athleteId: `x${i}`, name: `A${i}` }));
    expect(countLine({ rows: many, shown: many, marks: {} })).toBe('1284 athletes · Parallax 0 done · Fitness 0 done');
  });

  test('the empty-result line', () => {
    expect(COUNT_EMPTY).toBe('No athletes match.');
  });
});
