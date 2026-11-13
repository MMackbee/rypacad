import { FITNESS_WINDOW_DAYS, fitnessRow, orphanFitness } from './orphanFitness';

// Owner 2026-11-13: "yes add a warning row for fitness no golf". A fitness
// session (type 'phil') whose golf time is gone is flagged, never cancelled.
const WINDOW = { from: '2026-11-13', to: '2026-12-10' };
let n = 0;
const session = (type, date, time, extra = {}) => ({
  id: `${date}-${type}-${n++}`, date, time, type, status: 'scheduled', booked: 0, capacity: 6, ...extra,
});
const phil = (date, time, extra) => session('phil', date, time, extra);
const golf = (date, time, extra) => session('training', date, time, extra);
const tour = (date, time, extra) => session('tournament', date, time, { durationMinutes: 120, ...extra });
const reasons = (list) => orphanFitness(list, WINDOW).map((o) => [o.date, o.time, o.reason]);

describe('orphanFitness', () => {
  test('the production shape: a 6 PM fitness session beside the hidden 6 PM golf block is flagged "hidden"', () => {
    const p = phil('2026-11-25', '6:00 PM', { booked: 3, durationMinutes: 60 });
    const list = [golf('2026-11-25', '4:00 PM'), golf('2026-11-25', '6:00 PM', { hidden: true }), p];
    expect(orphanFitness(list, WINDOW)).toEqual([
      { id: p.id, date: '2026-11-25', time: '6:00 PM', booked: 3, reason: 'hidden' },
    ]);
  });

  test('a fitness session with no golf at all that day is flagged "none"', () => {
    expect(reasons([phil('2026-11-26', '5:00 PM')])).toEqual([['2026-11-26', '5:00 PM', 'none']]);
  });

  test('golf at that time cancelled: "cancelled"; hidden and cancelled together: "hidden"', () => {
    expect(reasons([golf('2026-11-25', '6:00 PM', { status: 'cancelled' }), phil('2026-11-25', '6:00 PM')]))
      .toEqual([['2026-11-25', '6:00 PM', 'cancelled']]);
    expect(reasons([
      golf('2026-11-25', '6:00 PM', { status: 'cancelled' }),
      golf('2026-11-25', '6:30 PM', { hidden: true }),
      phil('2026-11-25', '6:00 PM'),
    ])).toEqual([['2026-11-25', '6:00 PM', 'hidden']]);
  });

  test('live golf at that time: not an orphan', () => {
    expect(reasons([golf('2026-11-25', '6:00 PM'), phil('2026-11-25', '6:00 PM')])).toEqual([]);
  });

  test('a fitness session overlapping a 2-hour Tour event that starts earlier is not an orphan (Sat 11 AM vs 10 AM)', () => {
    expect(reasons([tour('2026-11-28', '10:00 AM'), phil('2026-11-28', '11:00 AM')])).toEqual([]);
    // Touching is not overlapping: a fitness hour that starts as the Tour ends has no golf beside it.
    expect(reasons([tour('2026-11-28', '10:00 AM'), phil('2026-11-28', '12:00 PM')]))
      .toEqual([['2026-11-28', '12:00 PM', 'none']]);
  });

  test('golf partly gone: one overlapping golf block hidden and another live is not an orphan', () => {
    expect(reasons([
      golf('2026-11-28', '12:00 PM', { hidden: true }),
      tour('2026-11-28', '10:00 AM'),
      phil('2026-11-28', '11:00 AM'),
    ])).toEqual([]);
  });

  test('a time that cannot be parsed never throws and never flags', () => {
    for (const time of ['', 'TBD', undefined, null]) {
      expect(() => orphanFitness([phil('2026-11-26', time)], WINDOW)).not.toThrow();
      expect(orphanFitness([phil('2026-11-26', time)], WINDOW)).toEqual([]);
    }
    // Live golf that day at a time nobody can place: it may be beside the fitness hour, so no flag.
    expect(reasons([golf('2026-11-26', 'TBD'), phil('2026-11-26', '5:00 PM')])).toEqual([]);
    expect(orphanFitness(null, WINDOW)).toEqual([]);
    expect(orphanFitness(undefined, WINDOW)).toEqual([]);
    expect(orphanFitness([null, phil('2026-11-26', '5:00 PM')], WINDOW)).toHaveLength(1);
  });

  test('a hidden or cancelled fitness session is never flagged', () => {
    expect(reasons([
      phil('2026-11-25', '6:00 PM', { hidden: true, booked: 2 }),
      phil('2026-11-25', '6:00 PM', { status: 'cancelled', booked: 2 }),
    ])).toEqual([]);
  });

  test('only training and Tour count as golf; golf on another day does not', () => {
    // Another fitness hour or a mental session at the same time is not golf: both fitness hours are flagged.
    expect(reasons([
      session('mental', '2026-11-25', '6:00 PM'),
      phil('2026-11-25', '6:00 PM'),
      phil('2026-11-25', '6:00 PM'),
      golf('2026-11-24', '6:00 PM'),
    ])).toEqual([['2026-11-25', '6:00 PM', 'none'], ['2026-11-25', '6:00 PM', 'none']]);
  });

  test('a session with no durationMinutes runs 60 minutes', () => {
    expect(reasons([golf('2026-11-25', '6:30 PM', { durationMinutes: undefined }), phil('2026-11-25', '6:00 PM')])).toEqual([]);
    expect(reasons([golf('2026-11-25', '7:00 PM', { durationMinutes: undefined }), phil('2026-11-25', '6:00 PM')]))
      .toEqual([['2026-11-25', '6:00 PM', 'none']]);
  });

  test('only from..to, inclusive, sorted by date then start (9 AM before 6 PM)', () => {
    const list = [
      phil('2026-12-11', '6:00 PM'),
      phil('2026-12-10', '6:00 PM'),
      phil('2026-11-12', '6:00 PM'),
      phil('2026-11-25', '6:00 PM'),
      phil('2026-11-25', '9:00 AM'),
      phil('2026-11-13', '6:00 PM'),
    ];
    expect(reasons(list).map(([d, t]) => `${d} ${t}`)).toEqual([
      '2026-11-13 6:00 PM', '2026-11-25 9:00 AM', '2026-11-25 6:00 PM', '2026-12-10 6:00 PM',
    ]);
  });

  test('booked reads the seat count, 0 when absent', () => {
    expect(orphanFitness([phil('2026-11-26', '5:00 PM', { booked: undefined })], WINDOW)[0].booked).toBe(0);
  });

  test('the window is four weeks', () => {
    expect(FITNESS_WINDOW_DAYS).toBe(28);
  });
});

describe('fitnessRow', () => {
  test('2 booked, golf hidden: red', () => {
    expect(fitnessRow({ id: 's1', date: '2026-11-25', time: '6:00 PM', booked: 2, reason: 'hidden' })).toEqual({
      id: 'fitness-s1',
      kind: 'fitness',
      athleteId: null,
      who: 'Fitness with no golf · Wed Nov 25, 6:00 PM',
      why: '2 booked · the golf block at this time is hidden',
      tag: 'Fitness',
      tone: 'red',
      packageIds: null,
    });
  });

  test('nobody booked, no golf: yellow', () => {
    const row = fitnessRow({ id: 's2', date: '2026-12-21', time: '6:00 PM', booked: 0, reason: 'none' });
    expect(row.who).toBe('Fitness with no golf · Mon Dec 21, 6:00 PM');
    expect(row.why).toBe('Nobody booked yet · no golf at this time');
    expect(row.tone).toBe('yellow');
  });

  test('golf cancelled', () => {
    const row = fitnessRow({ id: 's3', date: '2026-12-02', time: '6:00 PM', booked: 1, reason: 'cancelled' });
    expect(row.why).toBe('1 booked · the golf block at this time is cancelled');
    expect(row.tone).toBe('red');
  });
});
