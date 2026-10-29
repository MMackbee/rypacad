import { RANGES, parseText, parseTrial, rangeLabel, setAt } from './assessmentInput';

describe('the range table matches the rules (spec 4.4)', () => {
  test('spec ranges', () => {
    const pick = (k) => [RANGES[k].lo, RANGES[k].hi];
    expect(pick('grip')).toEqual([0, 100]);
    expect(pick('standing')).toEqual([90, 215]);
    expect(pick('mass')).toEqual([15, 160]);
    expect(pick('sittingRaw')).toEqual([40, 140]);
    expect(pick('boxHeight')).toEqual([20, 80]);
    expect(pick('arm')).toEqual([40, 110]);
    expect(pick('hand')).toEqual([10, 25]);
    expect(pick('cmjHeight')).toEqual([0, 90]);
    expect(pick('rsiMod')).toEqual([0, 2]);
    expect(pick('peakPowerW')).toEqual([0, 8000]);
    expect(pick('asymmetryPct')).toEqual([0, 60]);
    expect(pick('rsi')).toEqual([0, 5]);
    expect(pick('gctMs')).toEqual([80, 600]);
    expect(pick('medballSpeed')).toEqual([0, 60]);
    expect(pick('medballDistance')).toEqual([0, 25]);
    expect(pick('mcgill')).toEqual([0, 300]);
    expect(pick('clubhead')).toEqual([30, 140]);
    expect(pick('parallax')).toEqual([0, 100]);
    expect(pick('fps')).toEqual([30, 1000]);
  });
  test('the label a coach reads', () => {
    expect(rangeLabel('grip')).toBe('0-100 kg');
    expect(rangeLabel('rsiMod')).toBe('0-2');
  });
});

describe('typed trials', () => {
  test('a number, a comma decimal, a leading point; blank clears', () => {
    expect(parseTrial('32.5', 'grip')).toEqual({ ok: true, value: 32.5 });
    expect(parseTrial(' 32,5 ', 'grip')).toEqual({ ok: true, value: 32.5 });
    expect(parseTrial('.45', 'rsiMod')).toEqual({ ok: true, value: 0.45 });
    expect(parseTrial('', 'grip')).toEqual({ ok: true, value: null });
    expect(parseTrial('  ', 'grip')).toEqual({ ok: true, value: null });
  });
  test('a unit, a sign, two separators or letters are refused', () => {
    for (const junk of ['32.5kg', '-3', '+3', '1.2.3', '1,234.5', 'abc', '3 2']) {
      expect(parseTrial(junk, 'grip')).toEqual({ ok: false, error: 'Numbers only, like 32.5' });
    }
  });
  test('outside the range is refused with the range', () => {
    expect(parseTrial('150', 'grip')).toEqual({ ok: false, error: 'Grip is 0-100 kg' });
    expect(parseTrial('100', 'grip')).toEqual({ ok: true, value: 100 });
    expect(parseTrial('79', 'gctMs')).toEqual({ ok: false, error: 'Contact time is 80-600 ms' });
    expect(parseTrial('301', 'mcgill')).toEqual({ ok: false, error: 'Hold is 0-300 s' });
  });
  test('text is trimmed, capped, and blank is null', () => {
    expect(parseText('  Takei 5401 ', 40)).toBe('Takei 5401');
    expect(parseText('x'.repeat(50), 40)).toHaveLength(40);
    expect(parseText('   ', 40)).toBeNull();
  });
});

describe('fixed-length trial lists', () => {
  test('a trial lands in its slot; untyped slots are null', () => {
    expect(setAt(undefined, 1, 24.5, 3)).toEqual([null, 24.5, null]);
    expect(setAt([23.0, null, null], 0, null, 3)).toEqual([null, null, null]);
    expect(setAt([23.0], 2, 25.0, 3)).toEqual([23.0, null, 25.0]);
  });
  test('a list longer than the count keeps its trials', () => {
    expect(setAt([1, 2, 3], 0, 9, 2)).toEqual([9, 2, 3]);
  });
});

test('a Moore coefficient may be negative; every other entry still refuses a sign', () => {
  expect(parseTrial('-8.128741', 'coefficientA')).toEqual({ ok: true, value: -8.128741 });
  expect(parseTrial('0.0070346', 'coefficientB')).toEqual({ ok: true, value: 0.0070346 });
  expect(parseTrial('-21', 'coefficientA')).toEqual({ ok: false, error: 'Coefficient a is -20 to 0' });
  expect(parseTrial('0.2', 'coefficientB')).toEqual({ ok: false, error: 'Coefficient b is 0-0.1' });
  expect(parseTrial('-3', 'grip')).toEqual({ ok: false, error: 'Numbers only, like 32.5' });
  expect(rangeLabel('coefficientA')).toBe('-20 to 0');
});
