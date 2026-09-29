/**
 * The Billing hub's view model (contract v2.4, Sprint 16). Everything the
 * screen shows about tokens is derived here from documents; these tests pin
 * the evidence lists, the period dates, the nudge and the status hero.
 */
import { daysBetween, hubMemberFor, ordinal, periodRows, sessionLabel, statusFor } from './billingHub';
import { ELITE, TOKEN_PACKAGES } from './packages';
import { longDayLabel } from './calendar';

const T12 = TOKEN_PACKAGES.find((p) => p.id === 't-12');
const today = '2026-09-16';
const athlete = { id: 'jordan', name: 'Jordan', contractMinutes: 45 };
const b = (id, over) => ({ id, athleteId: 'jordan', status: 'confirmed', periodKey: '2026-09-01', date: '2026-09-20', sessionId: `s-${id}`, type: 'training', ...over });

const fixture = () => ({
  athlete,
  pkg: T12,
  anchorDay: 1,
  today,
  bookings: [
    b('a', { date: '2026-09-03', status: 'attended' }),
    b('c', { date: '2026-09-22' }),
    b('b', { date: '2026-09-10' }),
    b('x', { date: '2026-09-12', status: 'cancelled' }),
    b('g', { date: '2026-09-25', graceTokenId: 'grace-spent', type: 'tournament' }),
    b('n', { date: '2026-10-05', periodKey: '2026-10-01' }),
    b('l1', { date: '2026-08-05', periodKey: '2026-08-01' }),
    b('l2', { date: '2026-08-15', periodKey: '2026-08-01' }),
  ],
  waitlist: [
    { id: '2026-09-28-0_jordan', sessionId: '2026-09-28-0', athleteId: 'jordan', periodKey: '2026-09-01', date: '2026-09-28' },
    { id: '2026-10-12-0_jordan', sessionId: '2026-10-12-0', athleteId: 'jordan', periodKey: '2026-10-01', date: '2026-10-12' },
  ],
  graceTokens: [
    { id: 'grace-open', expiresAt: '2026-09-26', reason: 'session-cancelled', sourceSessionId: '2026-09-11-0' },
    { id: 'grace-spent', expiresAt: '2026-10-10', reason: 'session-cancelled', sourceSessionId: '2026-09-09-0' },
    { id: 'grace-old', expiresAt: '2026-09-01', reason: 'waitlist-expired', sourceSessionId: '2026-08-20-0' },
  ],
  sessionsById: {
    's-a': { id: 's-a', label: null, type: 'training', time: '3:00 PM', date: '2026-09-03' },
    's-g': { id: 's-g', label: 'Fall Scramble', type: 'tournament', time: '10:00 AM', date: '2026-09-25' },
    '2026-09-28-0': { id: '2026-09-28-0', label: null, type: 'training', time: '3:00 PM', date: '2026-09-28' },
  },
});

describe('hubMemberFor', () => {
  test('tokens are tokensFor over the same documents', () => {
    const m = hubMemberFor(fixture());
    expect(m.tokens).toMatchObject({ granted: 12, used: 3, reserved: 1, left: 8, unlimited: false });
    expect(m.tokens.grace).toEqual([
      { id: 'grace-open', expiresAt: '2026-09-26', reason: 'session-cancelled', sourceSessionId: '2026-09-11-0' },
    ]);
  });

  test('the period and its dates', () => {
    const m = hubMemberFor(fixture());
    expect(m.period).toMatchObject({ periodKey: '2026-09-01', start: '2026-09-01', end: '2026-09-30', resetsOn: '2026-10-01', daysLeft: 14 });
    expect(m.nextPeriod).toMatchObject({ periodKey: '2026-10-01', start: '2026-10-01', end: '2026-10-31', granted: 12, booked: 1, reserved: 1 });
    expect(m.lastPeriod).toMatchObject({ periodKey: '2026-08-01', end: '2026-08-31', granted: 12, used: 2 });
  });

  test('the evidence: spent rows equal used + grace-charged, reserved rows equal reserved', () => {
    const m = hubMemberFor(fixture());
    expect(m.spent.map((r) => [r.id, r.date, r.label, r.status, r.viaGrace])).toEqual([
      ['a', '2026-09-03', 'Training block', 'attended', false],
      ['b', '2026-09-10', 'Training block', 'confirmed', false],
      ['c', '2026-09-22', 'Training block', 'confirmed', false],
      ['g', '2026-09-25', 'Fall Scramble', 'confirmed', true],
    ]);
    expect(m.spent.filter((r) => !r.viaGrace)).toHaveLength(m.tokens.used);
    expect(m.reserved.map((r) => [r.id, r.date, r.time, r.status])).toEqual([
      ['2026-09-28-0_jordan', '2026-09-28', '3:00 PM', 'waitlisted'],
    ]);
    expect(m.reserved).toHaveLength(m.tokens.reserved);
  });

  test('an issued grant flows through to granted and last period', () => {
    const m = hubMemberFor({ ...fixture(), tokenPeriod: { granted: 14 }, prevTokenPeriod: { granted: 6 } });
    expect(m.tokens).toMatchObject({ granted: 14, left: 10 });
    expect(m.lastPeriod).toMatchObject({ granted: 6, used: 2 });
  });

  test('the expiry nudge appears inside the last week of a period with tokens left', () => {
    expect(hubMemberFor(fixture()).expiryNudge).toBeNull();
    const late = hubMemberFor({ ...fixture(), today: '2026-09-24' });
    expect(late.expiryNudge).toEqual({ left: 8, on: '2026-09-30', days: 6 });
    const spent = hubMemberFor({ ...fixture(), today: '2026-09-24', bookings: Array.from({ length: 12 }, (_, i) => b(`s${i}`)) });
    expect(spent.tokens.left).toBe(0);
    expect(spent.expiryNudge).toBeNull();
  });

  test('Elite is unlimited and never nudged; no package is zero', () => {
    const elite = hubMemberFor({ ...fixture(), pkg: ELITE, today: '2026-09-28' });
    expect(elite.tokens).toMatchObject({ unlimited: true, left: null, granted: null });
    expect(elite.nextPeriod.granted).toBeNull();
    expect(elite.lastPeriod.granted).toBeNull();
    expect(elite.expiryNudge).toBeNull();
    expect(elite.package).toMatchObject({ kind: 'elite', access247: true });
    const none = hubMemberFor({ ...fixture(), pkg: null });
    expect(none.tokens).toMatchObject({ granted: 0, left: 0, used: 3 });
    expect(none.package).toBeNull();
    expect(none.lastPeriod).toBeNull();
  });

  test('anchor 15 households get anchor-15 periods', () => {
    const m = hubMemberFor({ ...fixture(), anchorDay: 15, bookings: [], waitlist: [], graceTokens: [] });
    expect(m.period).toMatchObject({ start: '2026-09-15', end: '2026-10-14', resetsOn: '2026-10-15' });
    const early = hubMemberFor({ ...fixture(), anchorDay: 15, today: '2026-09-10', bookings: [], waitlist: [], graceTokens: [] });
    expect(early.period).toMatchObject({ start: '2026-08-15', end: '2026-09-14', resetsOn: '2026-09-15', daysLeft: 4 });
  });
});

describe('periodRows / sessionLabel', () => {
  test('labels fall back from the session label to the type', () => {
    expect(sessionLabel({ label: 'Fall Scramble', type: 'tournament' })).toBe('Fall Scramble');
    expect(sessionLabel({ label: null, type: 'phil' })).toBe('Performance session');
    expect(sessionLabel(null, 'mental')).toBe('Mental game session');
    expect(sessionLabel(null, null)).toBe('Session');
  });

  test('rows are sorted by date and carry the session time when known', () => {
    const { spent } = periodRows({
      bookings: [b('z', { date: '2026-09-30' }), b('y', { date: '2026-09-02' })],
      waitlist: [],
      periodKey: '2026-09-01',
      sessionsById: { 's-y': { time: '4:00 PM', type: 'training' } },
    });
    expect(spent.map((r) => [r.id, r.time])).toEqual([['y', '4:00 PM'], ['z', null]]);
  });
});

describe('statusFor', () => {
  test('absent or active', () => {
    const s = statusFor(null, { resetsOn: '2026-10-01', anchorDay: 1 });
    expect(s).toMatchObject({ status: 'active', tone: 'default', badge: { tone: 'green', label: 'Active' }, ladder: null, cta: null, paused: false });
    expect(s.title).toBe(`Tokens reset ${longDayLabel('2026-10-01')}`);
    expect(s.body).toBe('Billed monthly on the 1st. Nothing needs attention.');
    expect(statusFor({ status: 'active' }, { anchorDay: 15 }).body).toBe('Billed monthly on the 15th. Nothing needs attention.');
  });

  test('past due with the retry position the handler recorded', () => {
    const s = statusFor({ status: 'past_due', attemptCount: 2, nextPaymentAttempt: '2026-09-23', lastFailedAt: '2026-09-20' });
    expect(s).toMatchObject({ status: 'past_due', tone: 'yellow', badge: { label: 'Retry 2 of 3' }, ladderAt: 1, paused: true, cta: 'Update payment method' });
    expect(s.title).toBe(`Card declined ${longDayLabel('2026-09-20')}`);
    expect(s.body).toContain(`retries automatically on ${longDayLabel('2026-09-23')}`);
    expect(s.body).toContain('New bookings are paused');
    expect(s.ladder.map((r) => r.label)).toEqual(['Card declined', 'Retry 2 of 3', 'Booking access restricted']);
  });

  test('past due with nothing recorded invents no dates', () => {
    const s = statusFor({ status: 'past_due' });
    expect(s.badge.label).toBe('Past due');
    expect(s.title).toBe("A payment didn't go through");
    expect(s.body.startsWith('Stripe retries automatically. ')).toBe(true);
    expect(s.ladder[1]).toMatchObject({ label: 'Automatic retries', detail: 'Up to three attempts' });
  });

  test('the third retry reads red; lapsed is restricted', () => {
    expect(statusFor({ status: 'past_due', attemptCount: 3 })).toMatchObject({ tone: 'red', badge: { tone: 'red', label: 'Retry 3 of 3' } });
    expect(statusFor({ status: 'past_due', attemptCount: 9 }).badge.label).toBe('Retry 3 of 3');
    const l = statusFor({ status: 'lapsed', lastFailedAt: '2026-09-20' });
    expect(l).toMatchObject({ status: 'lapsed', tone: 'red', badge: { label: 'Restricted' }, ladderAt: 2, paused: true });
    expect(l.body).toContain('Upcoming bookings were released');
  });
});

describe('small helpers', () => {
  test('ordinal', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '28th']);
    expect(ordinal('x')).toBe('');
  });
  test('daysBetween', () => {
    expect(daysBetween('2026-09-16', '2026-09-30')).toBe(14);
    expect(daysBetween('2026-09-30', '2026-09-16')).toBe(-14);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

describe('the Elite attendance line (owner ruling, 2026-09-22)', () => {
  // Elite has no token countdown, so the hub answers a different question:
  // how much of the period did they actually use?
  const elite = () => ({
    ...fixture(),
    pkg: ELITE,
    bookings: [
      b('e1', { date: '2026-09-03', status: 'attended' }),
      b('e2', { date: '2026-09-05', status: 'attended' }),
      b('e3', { date: '2026-09-08', status: 'noshow' }),
      b('e4', { date: '2026-09-22' }),
      b('e5', { date: '2026-09-12', status: 'cancelled' }),
      b('e6', { date: '2026-10-05', periodKey: '2026-10-01', status: 'attended' }),
    ],
  });

  test('counts this period only, and never the cancelled one', () => {
    expect(hubMemberFor(elite()).attendance).toEqual({ booked: 4, attended: 2, noShows: 1 });
  });

  test('a no-show is counted on the stored value, not a hyphenated one', () => {
    // Bookings store 'noshow'. A lookup keyed 'no-show' silently counted zero
    // and showed the neutral "Booked" badge instead of "No-show" (K05).
    const m = hubMemberFor(elite());
    expect(m.attendance.noShows).toBe(1);
    expect(m.spent.find((r) => r.id === 'e3').status).toBe('noshow');
  });

  test('nobody on a token package gets the line - their meter answers it', () => {
    expect(hubMemberFor(fixture()).attendance).toBeNull();
  });
});

describe('per-athlete billing (Sprint 20, spec 4.4)', () => {
  test('hubMemberFor carries billing status, absent == active, and the facility add-on state', () => {
    expect(hubMemberFor(fixture()).billing).toEqual({ status: 'active', facility: null });
    const pending = hubMemberFor({ ...fixture(), athlete: { ...athlete, billing: { status: 'pending' } } });
    expect(pending.billing).toEqual({ status: 'pending', facility: null });
    const add = hubMemberFor({ ...fixture(), athlete: { ...athlete, billing: { status: 'active' }, facilityBilling: { status: 'active' } } });
    expect(add.billing).toEqual({ status: 'active', facility: 'active' });
  });

  test('hubMemberFor carries the facility waiver as a boolean (spec 4.5: "paid - waiver pending" vs "active")', () => {
    expect(hubMemberFor(fixture()).facilityAccessConsent).toBe(false);
    const nulled = hubMemberFor({ ...fixture(), athlete: { ...athlete, facilityAccessConsent: null } });
    expect(nulled.facilityAccessConsent).toBe(false);
    const signed = hubMemberFor({ ...fixture(), athlete: { ...athlete, facilityAccessConsent: { signedAt: '2026-09-01', byUid: 'p1' } } });
    expect(signed.facilityAccessConsent).toBe(true);
  });

  test('statusFor pending: after past_due, before lapsed and active; lapsed athletes pay again', () => {
    const back = statusFor({ status: 'lapsed' }, { pendingAthletes: [{ athleteId: 'a', name: 'Ava', status: 'lapsed' }] });
    expect(back).toMatchObject({ status: 'pending', cta: 'Pay now', badge: { tone: 'yellow', label: 'Payment needed' }, title: 'Membership ended - pay to book again' });
    expect(statusFor({ status: 'lapsed' }, { pendingAthletes: [] }).status).toBe('lapsed');
    const s = statusFor(null, { resetsOn: '2026-10-01', anchorDay: 1, pendingAthletes: [{ athleteId: 'a', name: 'Ava' }] });
    expect(s).toMatchObject({ status: 'pending', tone: 'yellow', badge: { tone: 'yellow', label: 'Payment pending' }, ladder: null, ladderAt: null, cta: 'Pay now', paused: false });
    expect(s.title).toBe('Payment pending - finish checkout to start booking');
    expect(s.body).toBe("Ava can book as soon as checkout is complete. Billed monthly from the 1st once you've paid.");
    expect(s.pendingAthletes).toEqual([{ athleteId: 'a', name: 'Ava' }]);
    const two = statusFor(null, { pendingAthletes: [{ athleteId: 'a', name: 'Ava' }, { athleteId: 'b', name: 'Ben' }] });
    expect(two.body.startsWith('Ava and Ben can book')).toBe(true);
    const three = statusFor(null, { pendingAthletes: [{ athleteId: 'a', name: 'Ava' }, { athleteId: 'b', name: 'Ben' }, { athleteId: 'c', name: 'Cy' }] });
    expect(three.body.startsWith('Ava, Ben and Cy can book')).toBe(true);
    expect(statusFor({ status: 'past_due' }, { pendingAthletes: [{ athleteId: 'a', name: 'Ava' }] }).status).toBe('past_due');
    expect(statusFor(null, { pendingAthletes: [] }).status).toBe('active');
    expect(statusFor(null, { resetsOn: '2026-10-01', anchorDay: 1 }).pendingAthletes).toBeUndefined();
  });
});
