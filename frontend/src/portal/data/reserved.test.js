/**
 * Handicap-reserved sessions (owner ruling 2026-10-02): the limit is the
 * session's own maxHandicap, and an athlete books it only with a handicap on
 * file at or under it.
 */
import {
  HANDICAP_RESERVED,
  NO_HANDICAP_LINE,
  RESERVED_LINE,
  handicapLimitOf,
  handicapOf,
  handicapValueOk,
  reservedEligible,
  reservedRefusal,
  reservedTag,
} from './reserved';

const RESERVED = { id: '2026-11-03-0', date: '2026-11-03', time: '3:00 PM', type: 'training', maxHandicap: 5 };
const OPEN = { id: '2026-11-03-1', date: '2026-11-03', time: '4:00 PM', type: 'training' };

test('the limit is an integer maxHandicap; absent, null or anything else is an open session', () => {
  expect(handicapLimitOf(RESERVED)).toBe(5);
  expect(handicapLimitOf({ maxHandicap: 0 })).toBe(0);
  for (const s of [OPEN, { maxHandicap: null }, { maxHandicap: '5' }, { maxHandicap: 5.5 }, { maxHandicap: NaN }, null, undefined]) {
    expect(handicapLimitOf(s)).toBeNull();
  }
});

test('the handicap on file is an integer, or null for none', () => {
  expect(handicapOf({ handicap: 0 })).toBe(0);
  expect(handicapOf({ handicap: 12 })).toBe(12);
  for (const a of [{}, { handicap: null }, { handicap: '3' }, { handicap: 4.2 }, null, undefined]) expect(handicapOf(a)).toBeNull();
});

test('an open session takes everyone, whatever is on file', () => {
  for (const a of [{ handicap: 30 }, { handicap: null }, {}, null]) {
    expect(reservedEligible(OPEN, a)).toBe(true);
    expect(reservedEligible({ ...OPEN, maxHandicap: null }, a)).toBe(true);
    expect(reservedRefusal(OPEN, a)).toBeNull();
  }
  expect(reservedTag(OPEN)).toBeNull();
});

test('a reserved session takes 5 down to 0 (a plus handicap is stored as 0)', () => {
  for (const handicap of [5, 4, 3, 2, 1, 0]) {
    expect(reservedEligible(RESERVED, { name: 'Jordan Whitfield', handicap })).toBe(true);
    expect(reservedRefusal(RESERVED, { name: 'Jordan Whitfield', handicap })).toBeNull();
  }
});

test('above the limit: not eligible, and the one line says why', () => {
  for (const handicap of [6, 14, 54]) {
    expect(reservedEligible(RESERVED, { name: 'Reese Whitfield', handicap })).toBe(false);
    expect(reservedRefusal(RESERVED, { name: 'Reese Whitfield', handicap })).toBe('Reserved for handicaps of 5 or better.');
  }
});

test('no handicap on file: not eligible, and the line names the athlete and the fix', () => {
  for (const a of [{ name: 'Nico Whitfield', handicap: null }, { name: 'Nico Whitfield' }, { name: 'Nico', handicap: '4' }]) {
    expect(reservedEligible(RESERVED, a)).toBe(false);
    expect(reservedRefusal(RESERVED, a)).toBe(
      'Reserved for handicaps of 5 or better. No handicap is on file for Nico. Ask the academy to add it.'
    );
  }
  expect(reservedEligible(RESERVED, null)).toBe(false);
  expect(reservedRefusal(RESERVED, null)).toBe(
    'Reserved for handicaps of 5 or better. No handicap is on file for this athlete. Ask the academy to add it.'
  );
});

test('the copy follows the limit on the session, not a fixed 5', () => {
  expect(reservedTag(RESERVED)).toBe('Handicap 5 or better');
  expect(reservedTag({ maxHandicap: 10 })).toBe('Handicap 10 or better');
  expect(RESERVED_LINE(10)).toBe('Reserved for handicaps of 10 or better.');
  expect(NO_HANDICAP_LINE('Ava')).toBe('No handicap is on file for Ava. Ask the academy to add it.');
  expect(reservedEligible({ maxHandicap: 10 }, { handicap: 10 })).toBe(true);
  expect(reservedEligible({ maxHandicap: 10 }, { handicap: 11 })).toBe(false);
  expect(HANDICAP_RESERVED).toBe('handicap-reserved');
});

test("a stored handicap is sign-up's range, or null for none", () => {
  for (const ok of [null, 0, 5, 54]) expect(handicapValueOk(ok)).toBe(true);
  for (const bad of [-1, 55, 4.5, '4', '', undefined, NaN]) expect(handicapValueOk(bad)).toBe(false);
});
