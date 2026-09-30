/**
 * The owner's amendments of 2026-09-17 (contract v2.6, Sprint 18) written
 * down as tests: the catalogue, the withheld prices, Elite's frequency caps,
 * the per-package mental cadence, capacity 14 and the reserved Tue/Thu slot.
 */
import { ALL_PACKAGES, ELITE, FACILITY_ACCESS, PRICES_RELEASED, TOKEN_PACKAGES, eliteDailyCapHit, packageById } from './packages';
import { MENTAL_MONTHLY_CAP, PARENT_ATTENDING_NOTE, SPECIALIST_MONTHLY_CAP, attendeeNoteFor, mentalCapFor, rosterNameFor } from './specialists';
import { CAPACITY, CAPACITY_BY_TYPE, WEEKDAY_BLOCKS, capacityForType, generateSeason } from './schedule';

describe('the catalogue (v2.0.1)', () => {
  test('three token packages at the pricing-sheet figures, t-20 retired', () => {
    expect(TOKEN_PACKAGES.map((p) => [p.id, p.tokens, p.price, p.pending])).toEqual([
      ['t-6', 6, 299, false],
      ['t-12', 12, 569, false],
      ['t-16', 16, 719, false],
    ]);
    expect(packageById('t-20')).toBeNull();
    expect(ALL_PACKAGES.map((p) => p.id)).toEqual(['t-6', 't-12', 't-16', 'elite', 'single']);
  });

  test('Elite is $999 all-in with facility access included; the add-on is $300', () => {
    expect(ELITE).toMatchObject({ price: 999, pending: false, tokens: null, access247: true, windowDays: 45 });
    expect(FACILITY_ACCESS).toMatchObject({ price: 300 });
  });

  test('prices are released to parents (Sprint 20 flipped the Sprint 18 hold)', () => {
    expect(PRICES_RELEASED).toBe(true);
  });
});

describe('Elite frequency caps (v2.0.1)', () => {
  const b = (type, date, status = 'confirmed') => ({ type, date, status });

  test('one training block and, separately, one tournament per date (owner 2026-09-30)', () => {
    expect(eliteDailyCapHit(ELITE, 'training', '2026-09-20', [b('training', '2026-09-20')])).toBe(true);
    // Saturday: the 9 AM training block does not block that day's tournament, and vice versa.
    expect(eliteDailyCapHit(ELITE, 'tournament', '2026-09-20', [b('training', '2026-09-20')])).toBe(false);
    expect(eliteDailyCapHit(ELITE, 'training', '2026-09-20', [b('tournament', '2026-09-20')])).toBe(false);
    expect(eliteDailyCapHit(ELITE, 'tournament', '2026-09-20', [b('tournament', '2026-09-20')])).toBe(true);
    expect(eliteDailyCapHit(ELITE, 'training', '2026-09-20', [b('training', '2026-09-21')])).toBe(false);
    expect(eliteDailyCapHit(ELITE, 'training', '2026-09-20', [b('training', '2026-09-20', 'cancelled')])).toBe(false);
  });

  test('one Phil booking per date, independent of the golf cap', () => {
    expect(eliteDailyCapHit(ELITE, 'phil', '2026-09-20', [b('training', '2026-09-20')])).toBe(false);
    expect(eliteDailyCapHit(ELITE, 'phil', '2026-09-20', [b('phil', '2026-09-20')])).toBe(true);
    expect(eliteDailyCapHit(ELITE, 'training', '2026-09-20', [b('phil', '2026-09-20')])).toBe(false);
  });

  test('never applies to Yannick, to token packages, or without a package', () => {
    expect(eliteDailyCapHit(ELITE, 'mental', '2026-09-20', [b('mental', '2026-09-20')])).toBe(false);
    expect(eliteDailyCapHit(packageById('t-12'), 'training', '2026-09-20', [b('training', '2026-09-20')])).toBe(false);
    expect(eliteDailyCapHit(null, 'training', '2026-09-20', [b('training', '2026-09-20')])).toBe(false);
  });
});

describe('the mental cadence is per package (v2.0.1)', () => {
  test('Elite two a month, everyone else one', () => {
    expect(MENTAL_MONTHLY_CAP).toEqual({ elite: 2, default: 1 });
    expect(mentalCapFor(ELITE)).toBe(2);
    expect(mentalCapFor(packageById('t-6'))).toBe(1);
    expect(mentalCapFor(null)).toBe(1);
    expect(SPECIALIST_MONTHLY_CAP).toEqual({ phil: null, mental: 1 });
  });
});

describe('the schedule (v2.0.2)', () => {
  test('capacity is per type: training 14, tournament 25 (owner, 2026-09-18)', () => {
    expect(CAPACITY_BY_TYPE).toEqual({ training: 14, tournament: 25 });
    expect(CAPACITY).toBe(14);
    expect(capacityForType('tournament')).toBe(25);
    expect(capacityForType('training')).toBe(14);
    expect(capacityForType('adult')).toBe(14);
  });

  test('the generated season carries each session type\'s own capacity', () => {
    // Mon 2026-09-21 .. Sun 2026-09-27: weekday training blocks and a Saturday.
    const week = generateSeason({ start: '2026-09-21', end: '2026-09-27' });
    const byType = (t) => [...new Set(week.filter((s) => s.type === t).map((s) => s.capacity))];
    expect(byType('training')).toEqual([14]);
    expect(byType('tournament')).toEqual([25]);
    // A holiday extra follows its type too, unless it names its own number.
    const extras = generateSeason({
      start: '2026-11-26', end: '2026-11-26', closures: ['2026-11-26'],
      extras: [{ date: '2026-11-26', time: '9:00 AM', type: 'tournament' }, { date: '2026-11-26', time: '1:00 PM', type: 'tournament', capacity: 40 }],
    });
    expect(extras.map((s) => s.capacity)).toEqual([25, 40]);
    // The flat override still wins when a caller passes one.
    expect(new Set(generateSeason({ start: '2026-09-21', end: '2026-09-27', capacity: 9 }).map((s) => s.capacity))).toEqual(new Set([9]));
  });

  test('Tue/Thu 3 PM is reserved and not generated (v2.0.3: a fourth block a day)', () => {
    // v2.0.3 (owner, 2026-09-22): Mon/Wed gain 6 PM, Tue/Thu gain 7 PM. The
    // reserved Tue/Thu 3 PM is still absent - that is what this test guards.
    expect(WEEKDAY_BLOCKS.Tue).toEqual([16, 17, 18, 19]);
    expect(WEEKDAY_BLOCKS.Thu).toEqual([16, 17, 18, 19]);
    expect(WEEKDAY_BLOCKS.Mon).toEqual([15, 16, 17, 18]);
    expect(WEEKDAY_BLOCKS.Wed).toEqual([15, 16, 17, 18]);
    expect(WEEKDAY_BLOCKS.Fri).toEqual([15, 16]);
  });
});

describe('who attends a Yannick 1:1 (v2.0.4, owner 2026-09-22)', () => {
  test('the note shows only for a parent-booked row', () => {
    expect(attendeeNoteFor({ attendee: 'parent' })).toBe(PARENT_ATTENDING_NOTE);
    expect(attendeeNoteFor({ attendee: 'athlete' })).toBeNull();
    // Absent == the athlete: every booking written before the ruling, and
    // every training/tournament/Phil booking, which may never carry it.
    expect(attendeeNoteFor({})).toBeNull();
    expect(attendeeNoteFor(null)).toBeNull();
    expect(attendeeNoteFor(undefined)).toBeNull();
  });

  test('the roster name says who walks in without losing whose token paid', () => {
    expect(rosterNameFor({ name: 'Ava', attendee: 'parent' })).toBe('Ava (parent)');
    expect(rosterNameFor({ name: 'Ava', attendee: 'athlete' })).toBe('Ava');
    expect(rosterNameFor({ name: 'Ava' })).toBe('Ava');
  });

  test('an unreadable athlete stays null rather than becoming a name', () => {
    // SpecialistDay filters these out and falls back to the booked count.
    expect(rosterNameFor({ name: null, attendee: 'parent' })).toBeNull();
    expect(rosterNameFor({ name: '' })).toBeNull();
    expect(rosterNameFor(null)).toBeNull();
  });
});
