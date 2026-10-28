import { isTestHousehold, withoutTestFamilies } from './testFamily';

test('only test: true marks a test household', () => {
  expect(isTestHousehold({ id: 'ryp-test-family', test: true })).toBe(true);
  for (const h of [{ id: 'kim' }, { id: 'lee', test: 'yes' }, { id: 'ng', test: false }, null, undefined]) {
    expect(isTestHousehold(h)).toBe(false);
  }
});

test('leaves out the test households, their athletes and any athlete marked test; keeps everything else, in order', () => {
  const households = [
    { id: 'kim', name: 'Kim family' },
    { id: 'ryp-test-family', name: 'RYP Test Family', test: true },
    { id: 'lee', name: 'Lee family', test: 'yes' },
  ];
  const athletes = [
    { id: 'k1', householdId: 'kim' },
    { id: 'ryp-test-ava', householdId: 'ryp-test-family', test: true },
    { id: 'ryp-test-max', householdId: 'ryp-test-family' }, // the household's mark is enough
    { id: 'stray', householdId: 'kim', test: true }, // and so is the athlete's own
    { id: 'l1', householdId: 'lee' },
    { id: 'none' },
  ];
  const out = withoutTestFamilies({ households, athletes });
  expect(out.households.map((h) => h.id)).toEqual(['kim', 'lee']);
  expect(out.athletes.map((a) => a.id)).toEqual(['k1', 'l1', 'none']);
});

test('missing lists read as empty', () => {
  expect(withoutTestFamilies({})).toEqual({ households: [], athletes: [] });
});
