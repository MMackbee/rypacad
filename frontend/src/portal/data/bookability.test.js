/**
 * One bookability rule for a session card (spec 2026-11-11 §5): what Book a
 * Session shows on each card, and which sessions the Move picker offers -
 * the same tests, so the picker never offers what the Book tab would refuse.
 */
import { cardFacts, formatCapacity, moveTargetOpen, positionWithFreed } from './bookability';

// 2 PM Thu Nov 12 in Chicago.
const NOW = new Date('2026-11-12T20:00:00Z');
const session = (over) => ({ id: 's2', date: '2026-11-13', time: '4:00 PM', type: 'training', status: 'scheduled', capacity: 12, booked: 3, ...over });

describe('formatCapacity', () => {
  test('a pre-formatted capacity passes through; a raw one is counted', () => {
    expect(formatCapacity({ capacity: { state: 'available', label: '2 left' } })).toEqual({ state: 'available', label: '2 left' });
    expect(formatCapacity(session())).toEqual({ state: 'available', label: '9 left' });
    expect(formatCapacity(session({ booked: 12 }))).toEqual({ state: 'full', label: 'Full' });
  });
});

describe('cardFacts', () => {
  const tokens = { left: 2, grace: [], unlimited: false };

  test('full by capacity, and by the session a tap just found full', () => {
    expect(cardFacts(session({ booked: 12 }), { tokens, now: NOW }).isFull).toBe(true);
    expect(cardFacts(session(), { tokens, justFilledId: 's2', now: NOW }).isFull).toBe(true);
    expect(cardFacts(session(), { tokens, now: NOW }).isFull).toBe(false);
  });

  test('a bonus token valid on the date stands in; one ending the day before does not', () => {
    const spent = { left: 0, unlimited: false };
    const valid = cardFacts(session(), { tokens: { ...spent, grace: [{ id: 'g1', expiresAt: '2026-11-13' }] }, now: NOW });
    expect([valid.hasGrace, valid.tokensSpent]).toEqual([true, false]);
    const ended = cardFacts(session(), { tokens: { ...spent, grace: [{ id: 'g1', expiresAt: '2026-11-12' }] }, now: NOW });
    expect([ended.hasGrace, ended.tokensSpent]).toEqual([false, true]);
    expect(cardFacts(session(), { tokens: null, now: NOW }).tokensSpent).toBe(false);
  });

  test('started only when asked to check', () => {
    const today = session({ date: '2026-11-12', time: '1:00 PM' });
    expect(cardFacts(today, { tokens, now: NOW }).started).toBe(false);
    expect(cardFacts(today, { tokens, checkStarted: true, now: NOW }).started).toBe(true);
  });

  test('a held block that has started reads started, not held', () => {
    const today = session({ date: '2026-11-12', time: '1:00 PM' });
    expect(cardFacts(today, { tokens, checkStarted: true, bookedSessionIds: ['s2'], now: NOW })).toMatchObject({ started: true, held: false });
    expect(cardFacts(session(), { tokens, checkStarted: true, bookedSessionIds: ['s2'], now: NOW })).toMatchObject({ started: false, held: true });
  });

  test('a reserved block is not theirs over the limit; an unread handicap holds nothing back', () => {
    const reserved = session({ maxHandicap: 5 });
    expect(cardFacts(reserved, { tokens, athlete: { handicap: 10 }, now: NOW }).notTheirs).toBe(true);
    expect(cardFacts(reserved, { tokens, athlete: { handicap: 4 }, now: NOW }).notTheirs).toBe(false);
    expect(cardFacts(reserved, { tokens, athlete: { handicap: 10 }, handicapUnread: true, now: NOW }).notTheirs).toBe(false);
  });

  test('display-only sets none of started, held or not-theirs', () => {
    const adult = session({ date: '2026-11-12', time: '1:00 PM', bookable: false, maxHandicap: 5 });
    expect(cardFacts(adult, { tokens, athlete: { handicap: 10 }, checkStarted: true, bookedSessionIds: ['s2'], now: NOW }))
      .toMatchObject({ displayOnly: true, started: false, held: false, notTheirs: false });
  });

  test('a next-period session is judged by that period (positionForDate)', () => {
    const withNext = { left: 2, grace: [], unlimited: false, nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', granted: 6, used: 6, reserved: 0, left: 0 } };
    expect(cardFacts(session({ date: '2026-12-01' }), { tokens: withNext, now: NOW })).toMatchObject({ tokensSpent: true, rowTokens: expect.objectContaining({ left: 0 }) });
    expect(cardFacts(session(), { tokens: withNext, now: NOW }).tokensSpent).toBe(false);
  });
});

describe('positionWithFreed (the booking being moved counts as given back)', () => {
  const spent = { left: 0, grace: [], unlimited: false };
  const from = (over) => ({ periodKey: '2026-11-01', graceTokenId: null, comp: false, ...over });

  test('a period token comes back only inside its own period', () => {
    expect(positionWithFreed(spent, from(), '2026-11-20', 1).left).toBe(1);
    expect(positionWithFreed(spent, from(), '2026-12-01', 1)).toEqual(spent);
  });

  test('a comp never spent the period: nothing comes back', () => {
    expect(positionWithFreed(spent, from({ comp: true }), '2026-11-20', 1)).toEqual(spent);
  });

  test('a bonus or single token carries only up to its expiry (Review Focus 5)', () => {
    const freed = from({ graceTokenId: 'g1', graceExpiresAt: '2026-11-20' });
    expect(positionWithFreed(spent, freed, '2026-11-19', 1).grace).toEqual([{ id: 'g1', expiresAt: '2026-11-20' }]);
    expect(positionWithFreed(spent, freed, '2026-11-20', 1).grace).toEqual([{ id: 'g1', expiresAt: '2026-11-20' }]);
    expect(positionWithFreed(spent, freed, '2026-11-21', 1)).toEqual(spent);
    expect(positionWithFreed(spent, from({ graceTokenId: 'single_cs_1' }), '2027-02-01', 1).grace).toEqual([{ id: 'single_cs_1', expiresAt: null }]);
    // A token-charged booking gives back no period token.
    expect(positionWithFreed(spent, freed, '2026-11-19', 1).left).toBe(0);
  });

  test('unlimited, no position and no booking are as they are', () => {
    const elite = { unlimited: true, left: null, grace: [] };
    expect(positionWithFreed(elite, from(), '2026-11-20', 1)).toEqual(elite);
    expect(positionWithFreed(null, from(), '2026-11-20', 1)).toBeNull();
    expect(positionWithFreed(spent, null, '2026-11-20', 1)).toEqual(spent);
  });

  test('anchor 15: Nov 14 to Nov 16 crosses periods (Review Focus 2)', () => {
    expect(positionWithFreed(spent, from({ periodKey: '2026-10-15' }), '2026-11-16', 15)).toEqual(spent);
    expect(positionWithFreed(spent, from({ periodKey: '2026-10-15' }), '2026-11-14', 15).left).toBe(1);
  });

  test('the freed next-period token survives a second reading of the date (cardFacts judges it again)', () => {
    const withNext = { left: 4, grace: [], unlimited: false, nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', granted: 6, used: 6, reserved: 0, left: 0 } };
    const freed = positionWithFreed(withNext, from({ periodKey: '2026-12-01' }), '2026-12-05', 1);
    expect(cardFacts(session({ date: '2026-12-05' }), { tokens: freed, now: NOW })).toMatchObject({ tokensSpent: false, rowTokens: expect.objectContaining({ left: 1 }) });
  });

  test('a date past the next period is unknown here (null), except for the single token, judged by its own tokens', () => {
    const withNext = { left: 0, grace: [], unlimited: false, nextPeriod: { periodKey: '2026-11-15', periodEnd: '2026-12-14', granted: 6, used: 0, reserved: 0, left: 6 } };
    expect(positionWithFreed(withNext, from({ periodKey: '2026-10-15' }), '2026-12-20', 15)).toBeNull();
    expect(positionWithFreed(withNext, from({ periodKey: '2026-10-15' }), '2026-12-14', 15).left).toBe(6);
    const single = { ...withNext, perPurchase: true };
    expect(positionWithFreed(single, from({ periodKey: '2026-10-15' }), '2026-12-20', 15)).toEqual(single);
  });

  test('a next-period target is judged by that period before the freed token is added', () => {
    const withNext = { left: 4, grace: [], unlimited: false, nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', granted: 6, used: 6, reserved: 0, left: 0 } };
    expect(positionWithFreed(withNext, from({ periodKey: '2026-12-01' }), '2026-12-05', 1).left).toBe(1);
    expect(positionWithFreed(withNext, from(), '2026-12-05', 1).left).toBe(0);
  });
});

describe('moveTargetOpen', () => {
  const ctx = (over = {}) => ({
    from: { id: 's1', bookingId: 'jordan_s1', date: '2026-11-12', type: 'training', periodKey: '2026-11-01', comp: false, graceTokenId: null },
    tokens: { left: 3, grace: [], unlimited: false },
    athlete: { name: 'Jordan', handicap: 10 },
    bookedSessionIds: ['s1'],
    waitingSessionIds: [],
    pkg: { kind: 'tokens', tokens: 6 },
    bookings: [{ id: 'jordan_s1', sessionId: 's1', date: '2026-11-12', type: 'training', status: 'confirmed' }],
    anchorDay: 1,
    now: NOW,
    ...over,
  });
  const decSpent = { left: 0, grace: [], unlimited: false, nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', granted: 6, used: 6, reserved: 0, left: 0 } };

  test('an open session of the same kind', () => {
    expect(moveTargetOpen(session(), ctx())).toBe(true);
  });

  test.each([
    ['its own session', session({ id: 's1' }), {}],
    ['another kind', session({ type: 'phil' }), {}],
    ['cancelled by the academy', session({ status: 'cancelled' }), {}],
    ['hidden', session({ hidden: true }), {}],
    ['a Calendly session', session({ source: 'calendly' }), {}],
    ['one the athlete waits on', session(), { waitingSessionIds: ['s2'] }],
    ['display-only', session({ bookable: false }), {}],
    ['started', session({ date: '2026-11-12', time: '1:00 PM' }), {}],
    ['full', session({ booked: 12 }), {}],
    ['held already', session(), { bookedSessionIds: ['s1', 's2'] }],
    ['reserved over the handicap', session({ maxHandicap: 5 }), {}],
    ['tokens spent in its period', session({ date: '2026-12-01' }), { tokens: decSpent }],
    [
      'Elite, with another training that day',
      session(),
      {
        pkg: { kind: 'elite', tokens: null },
        tokens: { unlimited: true, left: null, grace: [] },
        bookings: [
          { id: 'jordan_s1', sessionId: 's1', date: '2026-11-12', type: 'training', status: 'confirmed' },
          { id: 'jordan_s9', sessionId: 's9', date: '2026-11-13', type: 'training', status: 'confirmed' },
        ],
      },
    ],
  ])('not offered: %s', (_label, target, over) => {
    expect(moveTargetOpen(target, ctx(over))).toBe(false);
  });

  test('a spent November still moves inside November (the old one counts as given back)', () => {
    expect(moveTargetOpen(session(), ctx({ tokens: decSpent }))).toBe(true);
  });

  test('Elite moves 4 PM to 6 PM on the same day (its own row is left out of one-per-day)', () => {
    const sixPm = session({ id: 's3', date: '2026-11-12', time: '6:00 PM' });
    expect(moveTargetOpen(sixPm, ctx({ pkg: { kind: 'elite', tokens: null }, tokens: { unlimited: true, left: null, grace: [] } }))).toBe(true);
  });

  test('a next-period booking moves inside a fully booked next period (its own token counts as given back)', () => {
    const from = { id: 's8', bookingId: 'jordan_s8', date: '2026-12-08', type: 'training', periodKey: '2026-12-01', comp: false, graceTokenId: null };
    expect(moveTargetOpen(session({ date: '2026-12-10' }), ctx({ from, tokens: decSpent }))).toBe(true);
  });

  test('anchor 15: a date past the next period has no count here, so it is offered and the server judges it', () => {
    const tokens = { left: 0, grace: [], unlimited: false, nextPeriod: { periodKey: '2026-11-15', periodEnd: '2026-12-14', granted: 6, used: 0, reserved: 0, left: 6 } };
    const from = { id: 's1', bookingId: 'jordan_s1', date: '2026-11-13', type: 'training', periodKey: '2026-10-15', comp: false, graceTokenId: null };
    expect(moveTargetOpen(session({ date: '2026-12-20' }), ctx({ from, tokens, anchorDay: 15 }))).toBe(true);
  });

  test('a comp ignores spent tokens', () => {
    const from = { id: 's1', bookingId: 'jordan_s1', date: '2026-11-12', type: 'training', periodKey: '2026-11-01', comp: true, graceTokenId: null };
    expect(moveTargetOpen(session({ date: '2026-12-01' }), ctx({ from, tokens: decSpent }))).toBe(true);
  });
});
