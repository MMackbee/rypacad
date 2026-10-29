import { OVERDUE_DAYS, boardRows, dateOf, lastCheckinFor, onContract, overdueCheckins } from './contractBoard';

const ath = (id, name, dob, extra = {}) => ({ id, name, dob, ...extra });

describe('dateOf', () => {
  test('ISO strings as written; Dates and Timestamps as their Chicago date; anything else is null', () => {
    expect(dateOf('2026-11-12')).toBe('2026-11-12');
    expect(dateOf('2026-11-12T19:30:00.000Z')).toBe('2026-11-12');
    expect(dateOf({ toMillis: () => Date.UTC(2026, 10, 12, 23) })).toBe('2026-11-12');
    // 01:00Z on Nov 12 is 7 PM Chicago on Nov 11: an evening tap stays on its own day.
    expect(dateOf(new Date(Date.UTC(2026, 10, 12, 1)))).toBe('2026-11-11');
    expect(dateOf({ toMillis: () => Date.UTC(2026, 10, 12, 1) })).toBe('2026-11-11');
    expect(lastCheckinFor('x', [{ athleteId: 'x', weekStart: '2026-11-09', checkedIn: true, at: { toMillis: () => Date.UTC(2026, 10, 11, 1) } }])).toBe('2026-11-10');
    expect(dateOf(null)).toBeNull();
    expect(dateOf(42)).toBeNull();
  });
});

describe('overdueCheckins (spec 4.4, 14 days)', () => {
  const today = '2026-11-25';
  const athletes = [
    ath('a', 'Ava', '2012-01-01'),
    ath('b', 'Ben', '2012-01-01'),
    ath('c', 'Cal', '2012-01-01'),
    ath('d', 'Dee', '2012-01-01', { createdAt: '2026-11-20' }),
  ];
  const checkins = [
    { athleteId: 'b', weekStart: '2026-11-09', checkedIn: true, at: '2026-11-12' },
    { athleteId: 'c', weekStart: '2026-11-09', checkedIn: true, at: '2026-11-10' },
    { athleteId: 'c', weekStart: '2026-11-02', checkedIn: true, at: '2026-11-03' },
  ];
  test('never checked in and 22 days past enabledAt is overdue; 13 days is not; 15 is; a new athlete counts from createdAt', () => {
    expect(OVERDUE_DAYS).toBe(14);
    expect(overdueCheckins({ athletes, checkins, today, enabledAt: '2026-11-03' })).toEqual([
      { athleteId: 'a', lastCheckin: null, daysSince: 22 },
      { athleteId: 'c', lastCheckin: '2026-11-10', daysSince: 15 },
    ]);
  });
  test('exactly 14 days is not overdue', () => {
    const rows = overdueCheckins({ athletes: [athletes[0]], checkins: [], today: '2026-11-17', enabledAt: '2026-11-03' });
    expect(rows).toEqual([]);
    expect(overdueCheckins({ athletes: [athletes[0]], checkins: [], today: '2026-11-18', enabledAt: '2026-11-03' })).toEqual([
      { athleteId: 'a', lastCheckin: null, daysSince: 15 },
    ]);
  });
  test('without enabledAt a never-checked-in athlete is not overdue, an old check-in still is', () => {
    expect(overdueCheckins({ athletes, checkins, today, enabledAt: null })).toEqual([
      { athleteId: 'c', lastCheckin: '2026-11-10', daysSince: 15 },
    ]);
  });
  test('lastCheckinFor ignores checkedIn false and falls back to weekStart', () => {
    expect(lastCheckinFor('c', checkins)).toBe('2026-11-10');
    expect(lastCheckinFor('a', checkins)).toBeNull();
    expect(lastCheckinFor('x', [{ athleteId: 'x', weekStart: '2026-11-09', checkedIn: false, at: '2026-11-12' }])).toBeNull();
    expect(lastCheckinFor('y', [{ athleteId: 'y', weekStart: '2026-11-09', checkedIn: true }])).toBe('2026-11-09');
  });
});

describe('onContract (spec 4.4: the one gate the board and the Monday email share)', () => {
  test('households marked test, past_due or lapsed memberships and non-active billing are off the contract', () => {
    expect(onContract({ name: 'Whitfield family' }, { id: 'a' })).toBe(true);
    expect(onContract(undefined, { id: 'a' })).toBe(true);
    expect(onContract({ test: true }, { id: 'a' })).toBe(false);
    expect(onContract({ membership: { status: 'past_due' } }, { id: 'a' })).toBe(false);
    expect(onContract({ membership: { status: 'lapsed' } }, { id: 'a' })).toBe(false);
    expect(onContract({ membership: { status: 'active' } }, { id: 'a', billing: { status: 'active' } })).toBe(true);
    expect(onContract({ membership: { status: 'active' } }, { id: 'a', billing: { status: 'pending' } })).toBe(false);
    expect(onContract({}, { id: 'a', billing: { status: 'active', oneTime: true }, packageId: 't-6' })).toBe(false);
    expect(onContract({}, { id: 'a', billing: { status: 'active', oneTime: true }, packageId: 'single' })).toBe(true);
  });
  test('overdueCheckins and boardRows drop athletes who are not on the contract (same fixtures as contract-checkins.test.js)', () => {
    const athletes = [
      ath('a', 'Ava', '2012-01-01', { householdId: 'hh' }),
      ath('t', 'Test Kid', '2012-01-01', { householdId: 'hh-test' }),
      ath('p', 'Pat', '2012-01-01', { householdId: 'hh-due' }),
      ath('u', 'Uma', '2012-01-01', { householdId: 'hh', billing: { status: 'pending' } }),
    ];
    const households = { hh: { name: 'Whitfield family' }, 'hh-test': { name: 'RYP Test Family', test: true }, 'hh-due': { name: 'Late family', membership: { status: 'past_due' } } };
    expect(overdueCheckins({ athletes, households, checkins: [], today: '2026-11-25', enabledAt: '2026-11-03' }).map((r) => r.athleteId)).toEqual(['a']);
    const groups = boardRows({ athletes, households, logsByAthlete: {}, checkins: [], today: '2026-11-25', enabledAt: '2026-11-03', weekStartISO: '2026-11-23' });
    expect([...groups.due, ...groups.thisWeek, ...groups.checkedIn].map((r) => r.athleteId)).toEqual(['a']);
    // An array of household docs (fetchAllHouseholds' shape) works too.
    expect(overdueCheckins({ athletes, households: Object.entries(households).map(([id, h]) => ({ id, ...h })), checkins: [], today: '2026-11-25', enabledAt: '2026-11-03' })).toHaveLength(1);
  });
});

describe('boardRows (spec 5.4)', () => {
  const today = '2026-11-11';
  const weekStartISO = '2026-11-09';
  const athletes = [
    ath('jordan', 'Jordan Whitfield', '2012-06-17'),
    ath('nico', 'Nico Whitfield', '2017-09-09'),
    ath('reese', 'Reese Whitfield', '2014-03-02'),
    ath('sage', 'Sage Parker', null),
  ];
  const logsByAthlete = {
    jordan: { '2026-11-09': 20, '2026-11-10': 30, '2026-11-04': 20 },
    nico: { '2026-11-09': 10, '2026-11-10': 10, '2026-11-11': 5 },
    sage: { '2026-11-09': 20, '2026-11-10': 20, '2026-11-11': 20 },
  };
  const checkins = [
    { athleteId: 'jordan', weekStart: '2026-11-09', checkedIn: true, at: '2026-11-10' },
    { athleteId: 'nico', weekStart: '2026-11-02', checkedIn: true, at: '2026-11-04' },
    { athleteId: 'sage', weekStart: '2026-11-02', checkedIn: true, at: '2026-11-05' },
  ];
  const groups = boardRows({ athletes, logsByAthlete, checkins, today, enabledAt: '2026-10-20', weekStartISO });

  test('three groups: due (overdue), this week (fewest days met first), checked in this week', () => {
    expect(groups.due.map((r) => r.athleteId)).toEqual(['reese']);
    expect(groups.thisWeek.map((r) => r.athleteId)).toEqual(['nico', 'sage']);
    expect(groups.checkedIn.map((r) => r.athleteId)).toEqual(['jordan']);
  });
  test('a row carries age, the derived requirement, both week summaries and the check-in facts', () => {
    const nico = groups.thisWeek[0];
    expect(nico).toMatchObject({ name: 'Nico Whitfield', age: 9, required: 10, checkedInThisWeek: false, lastCheckin: '2026-11-04', daysSince: 7 });
    expect(nico.thisWeek.metDays).toBe(2);
    expect(nico.thisWeek.days.map((d) => d.state)).toEqual(['met', 'met', 'short', 'none', 'none']);
    expect(nico.lastWeek.metDays).toBe(0);
    const jordan = groups.checkedIn[0];
    expect(jordan).toMatchObject({ age: 14, required: 20, checkedInThisWeek: true, lastCheckin: '2026-11-10', daysSince: 1 });
    expect(jordan.lastWeek.metDays).toBe(1);
    expect(groups.thisWeek[1]).toMatchObject({ athleteId: 'sage', age: null, required: 20 });
    expect(groups.due[0]).toMatchObject({ lastCheckin: null, daysSince: 22, required: 20 });
  });
  test('a past week: checked-in is judged for that week, this week is that week', () => {
    const past = boardRows({ athletes, logsByAthlete, checkins, today, enabledAt: '2026-10-20', weekStartISO: '2026-11-02' });
    expect(past.checkedIn.map((r) => r.athleteId).sort()).toEqual(['nico', 'sage']);
    expect(past.checkedIn[0].thisWeek.days[0].date).toBe('2026-11-02');
    expect(past.thisWeek.map((r) => r.athleteId)).toEqual(['jordan']);
  });
});
