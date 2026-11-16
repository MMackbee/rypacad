/**
 * A leftover token used early (owner 2026-11-16, the Schmidt case): one
 * November token left, all of December's booked, and the family wants a
 * seventh December session now rather than on Dec 1. The pure pieces: the
 * count, the offer, the card rule.
 */
import { positionForDate, rolledAheadCount, tokensFor } from './packages';
import { fallbackStands, memberBefore, packageCountStands, rollAheadFor, rollAheadLine, rollAheadNote, rollAheadOffer } from './rollover';
import { cardFacts, moveTargetOpen } from './bookability';

const T6 = { id: 't-6', kind: 'tokens', tokens: 6 };
const NOV = { periodKey: '2026-11-01', periodEnd: '2026-11-30' };
const rolled = (n, source = '2026-11-01', expiresAt = '2026-12-31') => ({
  id: `rollover_a1_${source}_${n}`, athleteId: 'a1', reason: 'rollover', sourcePeriodKey: source, expiresAt,
});
const row = (date, over = {}) => ({ id: `b-${date}`, date, periodKey: `${date.slice(0, 7)}-01`, status: 'confirmed', ...over });
const nov5 = ['2026-11-03', '2026-11-11', '2026-11-17', '2026-11-18', '2026-11-24'].map((d) => row(d));

describe('the period count', () => {
  test('a token rolled out early comes off the month it left, spent or not', () => {
    expect(rolledAheadCount([rolled(1), rolled(2), rolled(1, '2026-10-01'), { id: 'g', reason: 'session-cancelled' }], '2026-11-01')).toBe(2);
    expect(rolledAheadCount(null, '2026-11-01')).toBe(0);
    const spentInDecember = row('2026-12-10', { graceTokenId: rolled(1).id });
    const p = tokensFor(null, T6, [...nov5, spentInDecember], [], [rolled(1)], '2026-11-01', { today: '2026-11-16', tokenPeriod: { granted: 6 } });
    expect([p.used, p.rolledAhead, p.left, p.grace.length]).toEqual([5, 1, 0, 0]);
    const unspent = tokensFor(null, T6, nov5, [], [rolled(1)], '2026-11-01', { today: '2026-11-16', tokenPeriod: { granted: 6 } });
    expect([unspent.left, unspent.grace.map((g) => g.id)]).toEqual([0, [rolled(1).id]]);
  });

  test('last month\'s rolled-over tokens take nothing off this month; Elite has no count', () => {
    const dec = tokensFor(null, T6, [], [], [rolled(1), rolled(2)], '2026-12-01', { today: '2026-12-02' });
    expect([dec.rolledAhead, dec.left]).toEqual([0, 6]);
    expect(tokensFor(null, { tokens: null }, [], [], [rolled(1)], '2026-11-01', { today: '2026-11-16' }).rolledAhead).toBe(0);
  });

  test('a next-period session is judged without this period\'s early rolls', () => {
    const tokens = { granted: 6, used: 5, left: 0, rolledAhead: 1, grace: [], nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', granted: 6, used: 2, reserved: 0, left: 4 } };
    expect(positionForDate(tokens, '2026-12-10')).toMatchObject({ left: 4, used: 2, rolledAhead: 0 });
    expect(positionForDate(tokens, '2026-11-20').rolledAhead).toBe(1);
  });
});

describe('the offer', () => {
  const base = { pkg: T6, left: 1, period: NOV, anchorDay: 1, tokenPeriod: { granted: 6 } };

  test('a monthly token athlete with an issued month and a token left', () => {
    expect(rollAheadOffer(base)).toEqual({ count: 1, until: '2026-12-31', fromPeriodKey: '2026-11-01' });
    expect(rollAheadOffer({ ...base, left: 3 }).count).toBe(3);
  });

  test('no record for the month (owner 2026-11-16: "she clearly has the tokens"): the package count the meter shows is offered, from the 3rd day', () => {
    // Billing last changed in October: a member since before November began.
    const since = { status: 'active', updatedAt: '2026-10-21T20:59:40.870Z' };
    const noRecord = { ...base, tokenPeriod: null, billing: since };
    expect(rollAheadOffer({ ...noRecord, today: '2026-11-16' })).toEqual({ count: 1, until: '2026-12-31', fromPeriodKey: '2026-11-01' });
    // Review 2026-11-16: joined inside the month (Nov 14; or Nov 29, paying for December) - not theirs to roll.
    expect(rollAheadOffer({ ...noRecord, today: '2026-11-16', billing: { status: 'active', updatedAt: '2026-11-14T15:00:00Z' } })).toBeNull();
    expect(rollAheadOffer({ ...noRecord, today: '2026-11-30', billing: { status: 'active', updatedAt: '2026-11-29T15:00:00Z' } })).toBeNull();
    expect(rollAheadOffer({ ...noRecord, today: '2026-11-16', billing: undefined })).toBeNull();
    expect(rollAheadOffer({ ...noRecord, today: '2026-11-16', billing: { status: 'past_due', updatedAt: since.updatedAt } })).toBeNull();
    expect(memberBefore({ status: 'active', updatedAt: { toDate: () => new Date(since.updatedAt) } }, NOV)).toBe(true);
    expect(memberBefore({ status: 'active', updatedAt: '2026-11-01T05:30:00Z' }, NOV)).toBe(false); // 12:30 AM Nov 1 in Chicago
    expect(memberBefore({ status: 'active', updatedAt: '2026-11-01T04:30:00Z' }, NOV)).toBe(true); // 11:30 PM Oct 31
    expect(packageCountStands({ period: NOV, today: '2026-11-16', billing: since })).toBe(true);
    expect(packageCountStands({ period: NOV, today: '2026-11-02', billing: since })).toBe(false);
    expect(rollAheadOffer({ ...noRecord, today: '2026-11-03' })).not.toBeNull();
    expect(rollAheadOffer({ ...noRecord, today: '2026-11-02' })).toBeNull();
    expect(rollAheadOffer({ ...noRecord, today: '2026-11-01' })).toBeNull();
    expect(rollAheadOffer(noRecord)).toBeNull(); // no clock, no guess
    expect([fallbackStands(NOV, '2026-11-02'), fallbackStands(NOV, '2026-11-03'), fallbackStands(null, '2026-11-03')]).toEqual([false, true, false]);
    // A month on record is offered from its first day.
    expect(rollAheadOffer({ ...base, today: '2026-11-01' })).not.toBeNull();
  });

  test('never without a token left, a monthly package or a month that rolls', () => {
    expect(rollAheadOffer({ ...base, left: 0 })).toBeNull();
    expect(rollAheadOffer({ ...base, pkg: { kind: 'elite', tokens: null } })).toBeNull();
    expect(rollAheadOffer({ ...base, pkg: { kind: 'single', tokens: 1 } })).toBeNull();
    expect(rollAheadOffer({ ...base, pkg: null })).toBeNull();
    expect(rollAheadOffer({ ...base, period: { periodKey: '2026-10-01', periodEnd: '2026-10-31' } })).toBeNull();
    expect(rollAheadOffer({ ...base, period: { periodKey: '2027-02-01', periodEnd: '2027-02-28' } })).toBeNull();
    // January's leftovers are good through the season end.
    expect(rollAheadOffer({ ...base, period: { periodKey: '2027-01-01', periodEnd: '2027-01-31' } }).until).toBe('2027-02-27');
  });
});

/** The Schmidt position on Nov 16: 1 of 6 left, December 0 of 6 left. */
const schmidt = (over = {}) => ({
  granted: 6, used: 5, reserved: 0, left: 1, unlimited: false, perPurchase: false, held: 0, grace: [], rolledAhead: 0,
  rollAhead: { count: 1, until: '2026-12-31', fromPeriodKey: '2026-11-01' },
  nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', booked: 6, used: 6, reserved: 0, granted: 6, left: 0 },
  ...over,
});

describe('which dates it applies to', () => {
  test('a next-month date once next month has no token left', () => {
    expect(rollAheadFor(schmidt(), '2026-12-10')).toEqual({ count: 1, until: '2026-12-31', fromPeriodKey: '2026-11-01' });
    expect(rollAheadFor(schmidt(), '2026-12-01')).not.toBeNull();
    expect(rollAheadFor(schmidt(), '2026-12-31')).not.toBeNull();
  });

  test('not this month, not past next month, not while next month has a token, not without an offer', () => {
    expect(rollAheadFor(schmidt(), '2026-11-20')).toBeNull();
    expect(rollAheadFor(schmidt(), '2027-01-05')).toBeNull();
    expect(rollAheadFor(schmidt({ nextPeriod: { ...schmidt().nextPeriod, left: 1 } }), '2026-12-10')).toBeNull();
    expect(rollAheadFor(schmidt({ rollAhead: undefined }), '2026-12-10')).toBeNull();
    expect(rollAheadFor(schmidt({ nextPeriod: null }), '2026-12-10')).toBeNull();
    expect(rollAheadFor(null, '2026-12-10')).toBeNull();
    // January into February: only up to the season end.
    const jan = schmidt({ rollAhead: { count: 1, until: '2027-02-27', fromPeriodKey: '2027-01-01' }, nextPeriod: { periodKey: '2027-02-01', periodEnd: '2027-02-28', granted: 6, used: 6, reserved: 0, left: 0 } });
    expect(rollAheadFor(jan, '2027-02-27')).not.toBeNull();
    expect(rollAheadFor(jan, '2027-02-28')).toBeNull();
  });

  test('the copy', () => {
    expect(rollAheadNote(schmidt().rollAhead)).toBe('Uses your leftover November token');
    expect(rollAheadNote({ count: 1, until: '2026-12-09', fromPeriodKey: '2026-10-10' })).toBe('Uses a leftover token from this period');
    expect(rollAheadNote(null)).toBeNull();
    expect(rollAheadLine(schmidt())).toBe('Your leftover November token can book a December session now.');
    expect(rollAheadLine(schmidt({ rollAhead: { count: 2, until: '2026-12-31', fromPeriodKey: '2026-11-01' } }))).toBe('Your 2 leftover November tokens can book December sessions now.');
    expect(rollAheadLine(schmidt({ nextPeriod: { ...schmidt().nextPeriod, left: 2 } }))).toBeNull();
    expect(rollAheadLine(schmidt({ rollAhead: undefined }))).toBeNull();
    expect(rollAheadLine(null)).toBeNull();
  });
});

describe('the session card', () => {
  const NOW = new Date('2026-11-16T18:00:00Z');
  const december = (over) => ({ id: 's-dec', date: '2026-12-10', time: '4:00 PM', type: 'training', status: 'scheduled', capacity: 12, booked: 3, ...over });

  test('a December session is bookable with the leftover November token', () => {
    const facts = cardFacts(december(), { tokens: schmidt(), now: NOW });
    expect(facts.tokensSpent).toBe(false);
    expect(facts.rollAhead).toEqual({ count: 1, until: '2026-12-31', fromPeriodKey: '2026-11-01' });
  });

  test('without the offer the card reads spent, as before', () => {
    const facts = cardFacts(december(), { tokens: schmidt({ rollAhead: undefined }), now: NOW });
    expect([facts.tokensSpent, facts.rollAhead]).toEqual([true, null]);
  });

  test('a bonus or rolled-over token in hand pays first: no early roll', () => {
    const facts = cardFacts(december(), { tokens: schmidt({ grace: [{ id: 'g1', expiresAt: '2026-12-15' }] }), now: NOW });
    expect([facts.hasGrace, facts.tokensSpent, facts.rollAhead]).toEqual([true, false, null]);
  });

  test('a November session is judged by November alone', () => {
    const facts = cardFacts(december({ id: 's-nov', date: '2026-11-20' }), { tokens: schmidt(), now: NOW });
    expect([facts.tokensSpent, facts.rollAhead]).toEqual([false, null]);
  });

  test('the Move picker does not offer it: the server\'s move has no early roll', () => {
    const from = { id: 's-old', bookingId: 'a1_s-old', type: 'training', date: '2026-11-24', periodKey: '2026-11-01' };
    const open = moveTargetOpen(december(), { from, tokens: schmidt({ left: 0, used: 6, rollAhead: undefined }), athlete: null, pkg: T6, anchorDay: 1, now: NOW });
    expect(open).toBe(false);
    // Even with an offer on the position, the picker stays with what moveBooking allows.
    expect(moveTargetOpen(december(), { from, tokens: schmidt(), athlete: null, pkg: T6, anchorDay: 1, now: NOW })).toBe(false);
  });
});
