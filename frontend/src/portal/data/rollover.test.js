import { periodFor } from './packages';
import { isRolled, isRolloverTokenId, rolledCount, rolledFrom, rolledLine, rollNudgeLine, rollsUntil } from './rollover';
import { graceSpendLabel } from './singleToken';

const rolled = (n, expiresAt = '2026-12-31', periodKey = '2026-11-01') => ({ id: `rollover_sam_${periodKey}_${n}`, expiresAt, reason: 'rollover' });
const bought = { id: 'single_cs_1', expiresAt: '2027-02-27', reason: 'single-purchase' };
const bonus = { id: 'abc123', expiresAt: '2026-12-09', reason: 'session-cancelled' };

describe('rollsUntil (mirror of functions/portal/rollover.js)', () => {
  test('November rolls through Dec 31, December through Jan 31', () => {
    expect(rollsUntil(periodFor('2026-11-10', 1), 1)).toBe('2026-12-31');
    expect(rollsUntil(periodFor('2026-12-10', 1), 1)).toBe('2027-01-31');
  });

  test('January rolls to the season end; February does not roll', () => {
    expect(rollsUntil(periodFor('2027-01-10', 1), 1)).toBe('2027-02-27');
    expect(rollsUntil(periodFor('2027-02-10', 1), 1)).toBeNull();
  });

  test('nothing that ends before Nov 30 rolls', () => {
    expect(rollsUntil(periodFor('2026-10-10', 1), 1)).toBeNull();
    expect(rollsUntil(periodFor('2026-11-10', 21), 21)).toBeNull();
    expect(rollsUntil(periodFor('2026-11-25', 21), 21)).toBe('2027-01-20');
    expect(rollsUntil(null, 1)).toBeNull();
  });
});

describe('rolled-over tokens', () => {
  test('are known by their id, or their reason', () => {
    expect(isRolloverTokenId('rollover_sam_2026-11-01_1')).toBe(true);
    expect(isRolloverTokenId('single_cs_1')).toBe(false);
    expect(isRolloverTokenId(null)).toBe(false);
    expect(isRolled(rolled(1))).toBe(true);
    expect(isRolled({ id: 'x', reason: 'rollover' })).toBe(true);
    expect(isRolled({ id: 'rollover_sam_2026-11-01_1', expiresAt: '2026-12-31' })).toBe(true);
    expect(isRolled(bought)).toBe(false);
    expect(isRolled(bonus)).toBe(false);
  });

  test('rolledFrom reads the month they came from', () => {
    expect(rolledFrom(rolled(2))).toBe('2026-11-01');
    expect(rolledFrom({ id: 'x', reason: 'rollover', sourcePeriodKey: '2026-12-01' })).toBe('2026-12-01');
    expect(rolledFrom(bonus)).toBeNull();
  });

  test('rolledCount counts only them', () => {
    expect(rolledCount([rolled(1), bonus, rolled(2), bought])).toBe(2);
    expect(rolledCount(undefined)).toBe(0);
  });

  test('rolledLine: how many, from which month, and the use-by day', () => {
    expect(rolledLine([rolled(1), rolled(2), bought])).toBe('2 tokens rolled over from November - use by Thu, Dec 31');
    expect(rolledLine([rolled(1)])).toBe('1 token rolled over from November - use by Thu, Dec 31');
    expect(rolledLine([rolled(1, '2027-02-27', '2027-01-01')])).toBe('1 token rolled over from January - use by Sat, Feb 27');
    expect(rolledLine([bought, bonus])).toBeNull();
    expect(rolledLine([])).toBeNull();
  });

  test('rolledLine: an off-anchor period is not named by a month', () => {
    expect(rolledLine([rolled(1, '2027-01-20', '2026-11-21')])).toBe('1 token rolled over - use by Wed, Jan 20');
  });
});

test('graceSpendLabel names the token a booking would spend', () => {
  expect(graceSpendLabel({ grace: [rolled(1), bought] })).toBe('a rolled-over token');
  expect(graceSpendLabel({ grace: [bought] })).toBe('a session token');
  expect(graceSpendLabel({ grace: [bonus] })).toBe('a bonus token');
});

describe('rollNudgeLine', () => {
  test('a period that rolls says so, with the use-by day', () => {
    expect(rollNudgeLine({ left: 2, on: '2026-11-30', rollsUntil: '2026-12-31' })).toBe(
      '2 unused tokens roll over on Tuesday, Dec 1 - use them by Thu, Dec 31.'
    );
    expect(rollNudgeLine({ left: 1, on: '2026-11-30', rollsUntil: '2026-12-31' })).toBe(
      '1 unused token rolls over on Tuesday, Dec 1 - use it by Thu, Dec 31.'
    );
  });

  test('nothing for a period that does not roll', () => {
    expect(rollNudgeLine({ left: 2, on: '2027-02-28', rollsUntil: null })).toBeNull();
    expect(rollNudgeLine(null)).toBeNull();
  });
});
