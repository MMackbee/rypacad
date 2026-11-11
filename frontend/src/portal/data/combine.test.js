import {
  COMBINE_DISTANCES, DATE_FUTURE_ERROR, DATE_MISSING_ERROR, DATE_OLD_ERROR, SCORE_ERROR,
  bestIds, canDeleteScore, canTickIntake, combineDateFloor, combineDateProblem, combineEntryRole, combineScoreDoc,
  combineSummary, distanceLabel, firstName, formatScore, intakeByName, intakeDoc, intakeDoneLine, intakeUndo,
  parseScore, roleWord, shortDay, sortScores,
} from './combine';

const at = (iso) => new Date(iso);
const ROWS = [
  { id: 'a', athleteId: 'jordan', distance: 'u100', score: 640, date: '2026-11-01', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: at('2026-11-01T22:00:00Z') },
  { id: 'b', athleteId: 'jordan', distance: 'u100', score: 655, date: '2026-11-05', enteredBy: 'u-jordan', enteredRole: 'athlete', createdAt: at('2026-11-06T01:00:00Z') },
  { id: 'c', athleteId: 'jordan', distance: 'u100', score: 655, date: '2026-11-09', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: at('2026-11-09T22:00:00Z') },
  { id: 'd', athleteId: 'jordan', distance: 'u100', score: 600, date: '2026-11-10', enteredBy: 'u-luke', enteredRole: 'coach', createdAt: null },
  { id: 'e', athleteId: 'jordan', distance: 'u150', score: 1000, date: '2026-11-10', enteredBy: 'u-dana', enteredRole: 'parent', createdAt: at('2026-11-10T20:00:00Z') },
];

describe('combine scores', () => {
  test('four distances, in order', () => {
    expect(COMBINE_DISTANCES).toEqual([
      { id: 'u100', label: 'Under 100 yd' },
      { id: 'u125', label: 'Under 125 yd' },
      { id: 'u150', label: 'Under 150 yd' },
      { id: 'u180', label: 'Under 180 yd' },
    ]);
    expect(distanceLabel('u150')).toBe('Under 150 yd');
    expect(distanceLabel('x')).toBe('x');
  });

  test('parseScore takes whole numbers 0 to 1000 only', () => {
    expect(parseScore('742')).toEqual({ score: 742, error: null });
    expect(parseScore(' 0 ')).toEqual({ score: 0, error: null });
    expect(parseScore('1000')).toEqual({ score: 1000, error: null });
    expect(parseScore(742)).toEqual({ score: 742, error: null });
    ['', '  ', '1001', '-1', '742.5', '742.0', '7e2', '1,000', '74 2', 'abc', null, undefined, 742.5].forEach((bad) => {
      expect(parseScore(bad)).toEqual({ score: null, error: SCORE_ERROR });
    });
  });

  test('combineDateProblem: today back to 60 days', () => {
    const today = '2026-11-12';
    expect(combineDateProblem('2026-11-12', today)).toBeNull();
    expect(combineDateProblem('2026-09-13', today)).toBeNull();
    expect(combineDateProblem('2026-09-12', today)).toBe(DATE_OLD_ERROR);
    expect(combineDateProblem('2026-11-13', today)).toBe(DATE_FUTURE_ERROR);
    ['', '2026-02-30', '2026-11-5'].forEach((bad) => {
      expect(combineDateProblem(bad, today)).toBe(DATE_MISSING_ERROR);
    });
    expect(combineDateFloor('2026-11-12')).toBe('2026-09-13');
  });

  test('shortDay and formatScore', () => {
    expect(shortDay('2026-11-05')).toBe('Nov 5');
    expect(formatScore(1000)).toBe('1000');
    expect(formatScore(0)).toBe('0');
  });

  test('role words and who enters', () => {
    expect(roleWord('coach')).toBe('Coach');
    expect(roleWord('owner')).toBe('Owner');
    expect(roleWord('athlete')).toBe('Athlete');
    expect(roleWord('parent')).toBe('Parent');
    expect(roleWord('mental')).toBe('Staff');
    expect(roleWord('ops')).toBe('Staff');
    expect(roleWord(null)).toBe('Staff');
    expect(combineEntryRole('coach')).toBe('coach');
    expect(combineEntryRole('owner')).toBe('owner');
    expect(combineEntryRole('athlete')).toBe('athlete');
    expect(combineEntryRole('parent')).toBe('parent');
    expect(combineEntryRole('mental')).toBeNull();
    expect(combineEntryRole('ops')).toBeNull();
    expect(combineEntryRole(null)).toBeNull();
  });

  test('canDeleteScore', () => {
    const [a, b] = ROWS;
    const luke = { uid: 'u-luke', role: 'coach' };
    expect(canDeleteScore(a, luke)).toBe(true);
    expect(canDeleteScore(b, luke)).toBe(false);
    expect(canDeleteScore(b, { uid: 'owner', role: 'owner' })).toBe(true);
    ROWS.forEach((row) => expect(canDeleteScore(row, null)).toBe(false));
  });

  test('combineScoreDoc is the seven keys', () => {
    const base = { athleteId: 'jordan', distance: 'u125', score: 700, date: '2026-11-10', uid: 'u-dana', role: 'parent', stamp: 'NOW' };
    expect(combineScoreDoc(base)).toEqual({
      athleteId: 'jordan', distance: 'u125', score: 700, date: '2026-11-10', enteredBy: 'u-dana', enteredRole: 'parent', createdAt: 'NOW',
    });
    expect(() => combineScoreDoc({ ...base, role: 'ops' })).toThrow(Error);
    expect(() => combineScoreDoc({ ...base, distance: 'u200' })).toThrow(Error);
    expect(() => combineScoreDoc({ ...base, score: 1001 })).toThrow(Error);
    expect(() => combineScoreDoc({ ...base, score: 7.5 })).toThrow(Error);
  });

  test('newest first', () => {
    const before = ROWS.map((r) => r.id);
    expect(sortScores(ROWS).map((r) => r.id)).toEqual(['d', 'e', 'c', 'b', 'a']);
    expect(sortScores(ROWS)).not.toBe(ROWS);
    expect(ROWS.map((r) => r.id)).toEqual(before);
  });

  test('best and latest per distance', () => {
    const summary = combineSummary(ROWS);
    expect(summary.u100.best.id).toBe('b');
    expect(summary.u100.latest.id).toBe('d');
    expect(summary.u150.best.id).toBe('e');
    expect(summary.u150.latest.id).toBe('e');
    expect(summary.u125).toEqual({ best: null, latest: null });
    expect(summary.u180).toEqual({ best: null, latest: null });
    expect(bestIds(combineSummary(ROWS))).toEqual(['b', 'e']);
  });
});

describe('Parallax intake swings', () => {
  test('first names', () => {
    expect(firstName('Luke Smith')).toBe('Luke');
    expect(firstName('  Dana ')).toBe('Dana');
    expect(firstName('')).toBeNull();
    expect(firstName(null)).toBeNull();
    expect(firstName('x'.repeat(50)).length).toBe(40);
    expect(intakeByName({ displayName: null, authName: 'Pat Lee', role: 'owner' })).toBe('Pat');
    expect(intakeByName({ displayName: null, authName: null, role: 'owner' })).toBe('Owner');
    expect(intakeByName({ displayName: null, authName: null, role: 'coach' })).toBe('Coach');
  });

  test('intakeDoc is the four keys', () => {
    expect(intakeDoc({ athleteId: 'jordan', uid: 'u-luke', byName: 'Luke', stamp: 'NOW' }))
      .toEqual({ athleteId: 'jordan', at: 'NOW', by: 'u-luke', byName: 'Luke' });
  });

  test('the done line is the Chicago date', () => {
    expect(intakeDoneLine({ at: at('2026-11-12T23:30:00Z'), byName: 'Luke' })).toBe('done Nov 12 · Luke');
    expect(intakeDoneLine({ at: at('2026-11-13T03:00:00Z'), byName: 'Luke' })).toBe('done Nov 12 · Luke');
    expect(intakeDoneLine({ at: { toMillis: () => Date.parse('2026-11-12T23:30:00Z') }, byName: 'Luke' })).toBe('done Nov 12 · Luke');
    expect(intakeDoneLine({ at: null, byName: 'Luke' })).toBe('done · Luke');
  });

  test('who ticks', () => {
    expect(canTickIntake('coach', false)).toBe(true);
    expect(canTickIntake('owner', false)).toBe(true);
    expect(canTickIntake('coach', true)).toBe(false);
    expect(canTickIntake('mental', false)).toBe(false);
    expect(canTickIntake('ops', false)).toBe(false);
  });

  test('undo inside ten minutes, the owner after', () => {
    const T = Date.parse('2026-11-12T22:00:00Z');
    const m = { at: new Date(T), by: 'u-luke', byName: 'Luke' };
    const luke = { uid: 'u-luke', role: 'coach' };
    const owner = { uid: 'owner', role: 'owner' };
    expect(intakeUndo(m, luke, T + 599999)).toBe('undo');
    expect(intakeUndo(m, luke, T + 600000)).toBeNull();
    expect(intakeUndo(m, owner, T + 86400000)).toBe('owner-clear');
    expect(intakeUndo({ ...m, by: 'owner' }, owner, T + 60000)).toBe('undo');
    expect(intakeUndo(m, { uid: 'u-coach2', role: 'coach' }, T + 60000)).toBeNull();
    expect(intakeUndo(null, luke, T)).toBeNull();
  });
});
