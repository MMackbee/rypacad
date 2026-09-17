/**
 * The owner's amendments of 2026-09-17 (contract v2.6, Sprint 18) written
 * down as tests: the catalogue, the withheld prices, Elite's frequency caps,
 * the per-package mental cadence, capacity 14 and the reserved Tue/Thu slot.
 */
import { ALL_PACKAGES, ELITE, FACILITY_ACCESS, PRICES_RELEASED, TOKEN_PACKAGES, eliteDailyCapHit, packageById } from './packages';
import { MENTAL_MONTHLY_CAP, SPECIALIST_MONTHLY_CAP, mentalCapFor } from './specialists';
import { CAPACITY, WEEKDAY_BLOCKS } from './schedule';

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

  test('prices are withheld from parents until released', () => {
    expect(PRICES_RELEASED).toBe(false);
  });
});

describe('Elite frequency caps (v2.0.1)', () => {
  const b = (type, date, status = 'confirmed') => ({ type, date, status });

  test('one golf (training or tournament) booking per date', () => {
    expect(eliteDailyCapHit(ELITE, 'training', '2026-09-20', [b('training', '2026-09-20')])).toBe(true);
    expect(eliteDailyCapHit(ELITE, 'tournament', '2026-09-20', [b('training', '2026-09-20')])).toBe(true);
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
  test('capacity 14', () => {
    expect(CAPACITY).toBe(14);
  });

  test('Tue/Thu 3 PM is reserved and not generated', () => {
    expect(WEEKDAY_BLOCKS.Tue).toEqual([16, 17, 18]);
    expect(WEEKDAY_BLOCKS.Thu).toEqual([16, 17, 18]);
    expect(WEEKDAY_BLOCKS.Mon).toEqual([15, 16, 17]);
    expect(WEEKDAY_BLOCKS.Fri).toEqual([15, 16]);
  });
});
