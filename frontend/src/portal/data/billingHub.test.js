/**
 * The Billing hub's view model (contract v2.4, Sprint 16). Everything the
 * screen shows about tokens is derived here from documents; these tests pin
 * the evidence lists, the period dates, the nudge and the status hero.
 */
import {
  SEASON_FIRST_PERIOD,
  daysBetween,
  foldBeforeFirstPeriod,
  hubMemberFor,
  ordinal,
  periodRows,
  positionPeriodFor,
  sessionLabel,
  statusFor,
  withTokenStart,
} from './billingHub';
import { ELITE, TOKEN_PACKAGES } from './packages';
import { longDayLabel } from './calendar';

const T12 = TOKEN_PACKAGES.find((p) => p.id === 't-12');
// In season (December): the pre-season first period has its own block below.
const today = '2026-12-16';
const BEFORE_GATE = Date.parse('2026-10-01T17:00:00Z'); // the Oct 1 email
const AFTER_GATE = Date.parse('2026-10-10T12:00:00Z'); // 07:00 Chicago, the gate itself
const athlete = { id: 'jordan', name: 'Jordan', contractMinutes: 45 };
const b = (id, over) => ({ id, athleteId: 'jordan', status: 'confirmed', periodKey: '2026-12-01', date: '2026-12-20', sessionId: `s-${id}`, type: 'training', ...over });

const fixture = () => ({
  athlete,
  pkg: T12,
  anchorDay: 1,
  today,
  bookings: [
    b('a', { date: '2026-12-03', status: 'attended' }),
    b('c', { date: '2026-12-22' }),
    b('b', { date: '2026-12-10' }),
    b('x', { date: '2026-12-12', status: 'cancelled' }),
    b('g', { date: '2026-12-25', graceTokenId: 'grace-spent', type: 'tournament' }),
    b('n', { date: '2027-01-05', periodKey: '2027-01-01' }),
    b('l1', { date: '2026-11-05', periodKey: '2026-11-01' }),
    b('l2', { date: '2026-11-15', periodKey: '2026-11-01' }),
  ],
  waitlist: [
    { id: '2026-12-28-0_jordan', sessionId: '2026-12-28-0', athleteId: 'jordan', periodKey: '2026-12-01', date: '2026-12-28' },
    { id: '2027-01-12-0_jordan', sessionId: '2027-01-12-0', athleteId: 'jordan', periodKey: '2027-01-01', date: '2027-01-12' },
  ],
  graceTokens: [
    { id: 'grace-open', expiresAt: '2026-12-26', reason: 'session-cancelled', sourceSessionId: '2026-12-11-0' },
    { id: 'grace-spent', expiresAt: '2027-01-10', reason: 'session-cancelled', sourceSessionId: '2026-12-09-0' },
    { id: 'grace-old', expiresAt: '2026-12-01', reason: 'waitlist-expired', sourceSessionId: '2026-11-20-0' },
  ],
  sessionsById: {
    's-a': { id: 's-a', label: null, type: 'training', time: '3:00 PM', date: '2026-12-03' },
    's-g': { id: 's-g', label: 'Fall Scramble', type: 'tournament', time: '10:00 AM', date: '2026-12-25' },
    '2026-12-28-0': { id: '2026-12-28-0', label: null, type: 'training', time: '3:00 PM', date: '2026-12-28' },
  },
});

describe('hubMemberFor', () => {
  test('tokens are tokensFor over the same documents', () => {
    const m = hubMemberFor(fixture());
    expect(m.tokens).toMatchObject({ granted: 12, used: 3, reserved: 1, left: 8, unlimited: false });
    expect(m.tokens.grace).toEqual([
      { id: 'grace-open', expiresAt: '2026-12-26', reason: 'session-cancelled', sourceSessionId: '2026-12-11-0' },
    ]);
  });

  test('the period and its dates', () => {
    const m = hubMemberFor(fixture());
    expect(m.period).toMatchObject({ periodKey: '2026-12-01', start: '2026-12-01', end: '2026-12-31', resetsOn: '2027-01-01', daysLeft: 15, preSeason: false });
    expect(m.nextPeriod).toMatchObject({ periodKey: '2027-01-01', start: '2027-01-01', end: '2027-01-31', granted: 12, booked: 1, reserved: 1 });
    expect(m.lastPeriod).toMatchObject({ periodKey: '2026-11-01', end: '2026-11-30', granted: 12, used: 2 });
    expect(m.tokens).toMatchObject({ startsOn: null, unpaid: false });
  });

  test('the evidence: spent rows equal used + grace-charged, reserved rows equal reserved', () => {
    const m = hubMemberFor(fixture());
    expect(m.spent.map((r) => [r.id, r.date, r.label, r.status, r.viaGrace])).toEqual([
      ['a', '2026-12-03', 'Training block', 'attended', false],
      ['b', '2026-12-10', 'Training block', 'confirmed', false],
      ['c', '2026-12-22', 'Training block', 'confirmed', false],
      ['g', '2026-12-25', 'Fall Scramble', 'confirmed', true],
    ]);
    expect(m.spent.filter((r) => !r.viaGrace)).toHaveLength(m.tokens.used);
    expect(m.reserved.map((r) => [r.id, r.date, r.time, r.status])).toEqual([
      ['2026-12-28-0_jordan', '2026-12-28', '3:00 PM', 'waitlisted'],
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
    const late = hubMemberFor({ ...fixture(), today: '2026-12-25' });
    expect(late.expiryNudge).toEqual({ left: 8, on: '2026-12-31', days: 6 });
    const spent = hubMemberFor({ ...fixture(), today: '2026-12-25', bookings: Array.from({ length: 12 }, (_, i) => b(`s${i}`)) });
    expect(spent.tokens.left).toBe(0);
    expect(spent.expiryNudge).toBeNull();
  });

  test('Elite is unlimited and never nudged; no package is zero', () => {
    const elite = hubMemberFor({ ...fixture(), pkg: ELITE, today: '2026-12-28' });
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
    expect(m.period).toMatchObject({ start: '2026-12-15', end: '2027-01-14', resetsOn: '2027-01-15' });
    const early = hubMemberFor({ ...fixture(), anchorDay: 15, today: '2026-12-10', bookings: [], waitlist: [], graceTokens: [] });
    expect(early.period).toMatchObject({ start: '2026-11-15', end: '2026-12-14', resetsOn: '2026-12-15', daysLeft: 4 });
  });
});

describe('periodRows / sessionLabel', () => {
  test('labels fall back from the session label to the type', () => {
    expect(sessionLabel({ label: 'Fall Scramble', type: 'tournament' })).toBe('Fall Scramble');
    // The generic name is the Tour's (owner naming rule 2026-09-30); a typed label stays as typed.
    expect(sessionLabel({ label: null, type: 'tournament' })).toBe('Tour event');
    expect(sessionLabel({ label: 'Holiday Tournament', type: 'tournament' })).toBe('Holiday Tournament');
    expect(sessionLabel({ label: null, type: 'phil' })).toBe('Performance session');
    expect(sessionLabel(null, 'mental')).toBe('Mental game session');
    expect(sessionLabel(null, null)).toBe('Session');
  });

  test('rows are sorted by date and carry the session time when known', () => {
    const { spent } = periodRows({
      bookings: [b('z', { date: '2026-12-30' }), b('y', { date: '2026-12-02' })],
      waitlist: [],
      periodKey: '2026-12-01',
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

describe('the Elite attendance line (owner ruling, 2026-12-22)', () => {
  // Elite has no token countdown, so the hub answers a different question:
  // how much of the period did they actually use?
  const elite = () => ({
    ...fixture(),
    pkg: ELITE,
    bookings: [
      b('e1', { date: '2026-12-03', status: 'attended' }),
      b('e2', { date: '2026-12-05', status: 'attended' }),
      b('e3', { date: '2026-12-08', status: 'noshow' }),
      b('e4', { date: '2026-12-22' }),
      b('e5', { date: '2026-12-12', status: 'cancelled' }),
      b('e6', { date: '2027-01-05', periodKey: '2027-01-01', status: 'attended' }),
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

  test('hubMemberFor carries the sign-up facility add-on request, absent == false (owner 2026-09-30)', () => {
    expect(hubMemberFor(fixture()).facilityRequested).toBe(false);
    expect(hubMemberFor({ ...fixture(), athlete: { ...athlete, facilityRequested: true } }).facilityRequested).toBe(true);
    expect(hubMemberFor({ ...fixture(), athlete: { ...athlete, facilityRequested: 'yes' } }).facilityRequested).toBe(false);
  });

  test('statusFor pending: after past_due, before lapsed and active; lapsed athletes pay again', () => {
    const back = statusFor({ status: 'lapsed' }, { pendingAthletes: [{ athleteId: 'a', name: 'Ava', status: 'lapsed' }] });
    expect(back).toMatchObject({ status: 'pending', cta: 'Pay now', badge: { tone: 'yellow', label: 'Payment needed' }, title: 'Membership ended - pay to book again' });
    expect(statusFor({ status: 'lapsed' }, { pendingAthletes: [] }).status).toBe('lapsed');
    const s = statusFor(null, { resetsOn: '2026-10-01', anchorDay: 1, now: BEFORE_GATE, pendingAthletes: [{ athleteId: 'a', name: 'Ava' }] });
    expect(s).toMatchObject({ status: 'pending', tone: 'yellow', badge: { tone: 'yellow', label: 'Payment pending' }, ladder: null, ladderAt: null, cta: 'Pay now', paused: false });
    expect(s.title).toBe('Payment pending - finish checkout to start booking');
    expect(s.body).toBe("Ava can book once checkout is complete (token packages from Sat, Oct 10 at 7 AM). Billed monthly on the 1st once you've paid.");
    // From the gate on, the parenthetical goes (UX review P-07).
    expect(statusFor(null, { now: AFTER_GATE, pendingAthletes: [{ athleteId: 'a', name: 'Ava' }] }).body).toBe("Ava can book once checkout is complete. Billed monthly on the 1st once you've paid.");
    expect(s.pendingAthletes).toEqual([{ athleteId: 'a', name: 'Ava' }]);
    const two = statusFor(null, { pendingAthletes: [{ athleteId: 'a', name: 'Ava' }, { athleteId: 'b', name: 'Ben' }] });
    expect(two.body.startsWith('Ava and Ben can book')).toBe(true);
    const three = statusFor(null, { pendingAthletes: [{ athleteId: 'a', name: 'Ava' }, { athleteId: 'b', name: 'Ben' }, { athleteId: 'c', name: 'Cy' }] });
    expect(three.body.startsWith('Ava, Ben and Cy can book')).toBe(true);
    expect(statusFor({ status: 'past_due' }, { pendingAthletes: [{ athleteId: 'a', name: 'Ava' }] }).status).toBe('past_due');
    expect(statusFor(null, { pendingAthletes: [] }).status).toBe('active');
    expect(statusFor(null, { resetsOn: '2026-10-01', anchorDay: 1 }).pendingAthletes).toBeUndefined();
  });

  // Tester Mike 2026-09-30: no talk of tokens for Elite members.
  test('statusFor: a household of Elite athletes only reads no token wording', () => {
    const active = statusFor(null, { resetsOn: '2026-12-01', anchorDay: 1, allUnlimited: true });
    expect(active).toMatchObject({ status: 'active', title: 'Membership active', body: 'Billed monthly on the 1st. Nothing needs attention.' });
    const preSeason = statusFor(null, { resetsOn: '2026-10-01', tokensStartOn: '2026-11-01', anchorDay: 1, allUnlimited: true });
    expect(preSeason.title).toBe(`First period starts ${longDayLabel('2026-11-01')}`);
    // An Elite athlete books as soon as it is paid: no token-package date either.
    const pending = statusFor(null, { now: BEFORE_GATE, pendingAthletes: [{ athleteId: 'e', name: 'Eli', packageId: 'elite' }] });
    expect(pending.body).toBe("Eli can book once checkout is complete. Billed monthly on the 1st once you've paid.");
    for (const s of [active, preSeason, pending]) expect(`${s.title} ${s.body}`).not.toMatch(/token/i);
    // A mixed household keeps every token line.
    expect(statusFor(null, { resetsOn: '2026-12-01', anchorDay: 1, allUnlimited: false }).title).toBe(`Tokens reset ${longDayLabel('2026-12-01')}`);
    expect(statusFor(null, { now: BEFORE_GATE, pendingAthletes: [{ athleteId: 'e', name: 'Eli', packageId: 'elite' }, { athleteId: 'a', name: 'Ava', packageId: 't-6' }] }).body)
      .toContain('(token packages from Sat, Oct 10 at 7 AM)');
  });

  test('statusFor: the single token is a one-time payment, never billed monthly (owner ruling, 2026-09-30)', () => {
    const monthly = "Ava can book once checkout is complete (token packages from Sat, Oct 10 at 7 AM). Billed monthly on the 1st once you've paid.";
    // An all-single pending list gets the one-time body; title, badge and CTA are unchanged.
    const one = statusFor(null, { resetsOn: '2026-10-01', anchorDay: 1, pendingAthletes: [{ athleteId: 'a', name: 'Ava', status: 'pending', perPurchase: true }] });
    expect(one).toMatchObject({ status: 'pending', badge: { tone: 'yellow', label: 'Payment pending' }, title: 'Payment pending - finish checkout to start booking', cta: 'Pay now' });
    expect(one.body).toBe('Ava can book once their session token is paid for. A session token is a one-time $65 payment.');
    const two = statusFor(null, { pendingAthletes: [{ athleteId: 'a', name: 'Ava', perPurchase: true }, { athleteId: 'b', name: 'Ben', perPurchase: true }] });
    expect(two.body).toBe('Ava and Ben can book once their session token is paid for. A session token is a one-time $65 payment.');
    // A mixed list, or a monthly one, keeps the monthly body byte-for-byte.
    const mixed = statusFor(null, { now: BEFORE_GATE, pendingAthletes: [{ athleteId: 'a', name: 'Ava', perPurchase: false }, { athleteId: 'b', name: 'Ben', perPurchase: true }] });
    expect(mixed.body).toBe("Ava and Ben can book once checkout is complete (token packages from Sat, Oct 10 at 7 AM). Billed monthly on the 1st once you've paid.");
    expect(statusFor(null, { now: BEFORE_GATE, pendingAthletes: [{ athleteId: 'a', name: 'Ava', perPurchase: false }] }).body).toBe(monthly);
    expect(statusFor(null, { now: BEFORE_GATE, pendingAthletes: [{ athleteId: 'a', name: 'Ava' }] }).body).toBe(monthly);
    // An all-single household that is active: nothing bills monthly.
    const active = statusFor(null, { resetsOn: '2026-10-01', anchorDay: 1, allPerPurchase: true });
    expect(active).toMatchObject({ status: 'active', badge: { tone: 'green', label: 'Active' }, cta: null, paused: false });
    expect(active.body).toBe('Session tokens are one-time payments - nothing bills monthly.');
    // The monthly pins are unchanged.
    expect(statusFor(null, { resetsOn: '2026-10-01', anchorDay: 1, allPerPurchase: false }).body).toBe('Billed monthly on the 1st. Nothing needs attention.');
    expect(statusFor({ status: 'active' }, { anchorDay: 15 }).body).toBe('Billed monthly on the 15th. Nothing needs attention.');
  });
});

describe('before the season: the first (prepaid) period (tester report 2026-09-30)', () => {
  // Sep 30: a paid 16-token member with one November session booked (the
  // Oct 10 gate opens November bookings) and one December one.
  const T16 = TOKEN_PACKAGES.find((p) => p.id === 't-16');
  const pre = (over = {}) => ({
    athlete,
    pkg: T16,
    anchorDay: 1,
    today: '2026-09-30',
    bookings: [b('nov', { date: '2026-11-03', periodKey: '2026-11-01' }), b('dec', { date: '2026-12-01', periodKey: '2026-12-01' })],
    waitlist: [],
    graceTokens: [],
    ...over,
  });

  test('positionPeriodFor: November until Nov 1, then the current period - one answer for every package', () => {
    expect(SEASON_FIRST_PERIOD).toBe('2026-11-01');
    expect(positionPeriodFor('2026-09-30', 1)).toEqual({ periodKey: '2026-11-01', periodEnd: '2026-11-30', preSeason: true });
    expect(positionPeriodFor('2026-10-31', 1)).toMatchObject({ periodKey: '2026-11-01', preSeason: true });
    expect(positionPeriodFor('2026-11-01', 1)).toEqual({ periodKey: '2026-11-01', periodEnd: '2026-11-30', preSeason: false });
    expect(positionPeriodFor('2026-12-16', 1)).toMatchObject({ periodKey: '2026-12-01', preSeason: false });
    // Anchor 15: the first period is Oct 15 - Nov 14.
    expect(positionPeriodFor('2026-09-30', 15)).toEqual({ periodKey: '2026-10-15', periodEnd: '2026-11-14', preSeason: true });
  });

  test('the meter reads November - its grant, its bookings - with no expiry nudge and no Last period', () => {
    const m = hubMemberFor(pre());
    expect(m.period).toMatchObject({ periodKey: '2026-11-01', start: '2026-11-01', end: '2026-11-30', resetsOn: '2026-12-01', preSeason: true });
    expect(m.tokens).toMatchObject({ granted: 16, used: 1, left: 15, startsOn: '2026-11-01', unpaid: false });
    expect(m.spent.map((r) => r.id)).toEqual(['nov']);
    expect(m.nextPeriod).toMatchObject({ periodKey: '2026-12-01', granted: 16, booked: 1 });
    // Was: "16 tokens expire Wednesday, Sep 30" and "Last period (Aug 1 - Aug 31)".
    expect(m.expiryNudge).toBeNull();
    expect(m.lastPeriod).toBeNull();
  });

  test('the issued November doc (the prepaid grant) wins over the package allotment', () => {
    expect(hubMemberFor(pre({ tokenPeriod: { granted: 12 } })).tokens).toMatchObject({ granted: 12, left: 11 });
  });

  test('unpaid is marked and never nudged, before the season or in it', () => {
    const pending = hubMemberFor(pre({ athlete: { ...athlete, billing: { status: 'pending' } } }));
    expect(pending.tokens).toMatchObject({ unpaid: true, startsOn: '2026-11-01' });
    const lapsed = hubMemberFor({ ...fixture(), today: '2026-12-25', athlete: { ...athlete, billing: { status: 'lapsed' } } });
    expect(lapsed.tokens).toMatchObject({ unpaid: true, startsOn: null });
    expect(lapsed.expiryNudge).toBeNull();
  });

  test('from Nov 1 the behaviour is unchanged; November itself has no Last period', () => {
    const nov = hubMemberFor(pre({ today: '2026-11-25' }));
    expect(nov.period).toMatchObject({ periodKey: '2026-11-01', daysLeft: 5, preSeason: false });
    expect(nov.tokens).toMatchObject({ left: 15, startsOn: null });
    expect(nov.expiryNudge).toEqual({ left: 15, on: '2026-11-30', days: 5 });
    expect(nov.lastPeriod).toBeNull();
  });

  // Owner report 2026-09-30 (Mike): an Elite athlete with two November
  // bookings read "Nothing booked in this period yet. Next period from
  // Thursday, Oct 1: unlimited".
  test('Elite reads November before the season: its bookings listed, December next, still unlimited', () => {
    const e = hubMemberFor(pre({ pkg: ELITE, bookings: [...pre().bookings, b('nov2', { date: '2026-11-17', periodKey: '2026-11-01' })] }));
    expect(e.tokens).toMatchObject({ unlimited: true, left: null });
    expect(e.tokens).not.toHaveProperty('startsOn');
    expect(e.period).toMatchObject({ periodKey: '2026-11-01', start: '2026-11-01', end: '2026-11-30', resetsOn: '2026-12-01', preSeason: true });
    expect(e.spent.map((r) => [r.id, r.date])).toEqual([['nov', '2026-11-03'], ['nov2', '2026-11-17']]);
    expect(e.attendance).toEqual({ booked: 2, attended: 0, noShows: 0 });
    expect(e.nextPeriod).toMatchObject({ periodKey: '2026-12-01', start: '2026-12-01', end: '2026-12-31', granted: null, booked: 1 });
    expect(e.lastPeriod).toBeNull();
    expect(e.expiryNudge).toBeNull();
    expect(withTokenStart(null, { preSeason: true, periodKey: '2026-11-01' }, 'pending')).toBeNull();
  });

  test('Elite from Nov 1 on: the calendar period, as before', () => {
    expect(hubMemberFor(pre({ pkg: ELITE, today: '2026-11-10' })).period).toMatchObject({ periodKey: '2026-11-01', daysLeft: 20, preSeason: false });
    const dec = hubMemberFor(pre({ pkg: ELITE, today: '2026-12-16' }));
    expect(dec.period).toMatchObject({ periodKey: '2026-12-01', preSeason: false });
    expect(dec.spent.map((r) => r.id)).toEqual(['dec']);
    expect(dec.nextPeriod.periodKey).toBe('2027-01-01');
  });

  test('statusFor: the active title names the start, never a reset of a month that granted nothing', () => {
    expect(statusFor(null, { resetsOn: '2026-10-01', tokensStartOn: '2026-11-01', anchorDay: 1 }).title).toBe(`Tokens start ${longDayLabel('2026-11-01')}`);
    expect(statusFor(null, { resetsOn: '2026-10-01', tokensStartOn: null, anchorDay: 1 }).title).toBe(`Tokens reset ${longDayLabel('2026-10-01')}`);
  });

  // Review 2026-09-30: createBooking charges an October slot to October, a
  // period the meter never shows - the spent token went invisible.
  const oct = b('oct', { date: '2026-10-24', periodKey: '2026-10-01' });
  const octWait = { id: 'w-oct', sessionId: 's-w-oct', athleteId: 'jordan', date: '2026-10-28', periodKey: '2026-10-01' };

  test('foldBeforeFirstPeriod: a row before the first period is read as the first period\'s; the rest untouched', () => {
    const rows = [oct, b('nov', { periodKey: '2026-11-01' }), { id: 'legacy' }, null];
    expect(foldBeforeFirstPeriod(rows, 1).map((r) => r && r.periodKey)).toEqual(['2026-11-01', '2026-11-01', undefined, null]);
    expect(foldBeforeFirstPeriod(null, 1)).toBeNull();
    expect(foldBeforeFirstPeriod(undefined, 1)).toBeUndefined();
    // Anchor 15: the first period is Oct 15 - Nov 14, which an Oct 24 row is already in.
    const rows15 = [b('oct15', { date: '2026-10-24', periodKey: '2026-10-15' }), b('early', { date: '2026-10-12', periodKey: '2026-09-15' })];
    expect(foldBeforeFirstPeriod(rows15, 15).map((r) => r.periodKey)).toEqual(['2026-10-15', '2026-10-15']);
  });

  test('an October booking and waitlist entry spend November: counted, listed, and still there once November starts', () => {
    const m = hubMemberFor(pre({ today: '2026-10-20', bookings: [...pre().bookings, oct], waitlist: [octWait] }));
    expect(m.tokens).toMatchObject({ granted: 16, used: 2, reserved: 1, left: 13, startsOn: '2026-11-01' });
    expect(m.spent.map((r) => [r.id, r.date])).toEqual([['oct', '2026-10-24'], ['nov', '2026-11-03']]);
    expect(m.reserved.map((r) => r.id)).toEqual(['w-oct']);
    const nov = hubMemberFor(pre({ today: '2026-11-10', bookings: [...pre().bookings, oct] }));
    expect(nov.tokens).toMatchObject({ used: 2, left: 14, startsOn: null });
    const dec = hubMemberFor(pre({ today: '2026-12-10', bookings: [...pre().bookings, oct] }));
    expect(dec.lastPeriod).toMatchObject({ periodKey: '2026-11-01', used: 2 });
  });

  test('an Elite October booking is listed under November, as a token one is', () => {
    const e = hubMemberFor(pre({ pkg: ELITE, today: '2026-10-20', bookings: [oct] }));
    expect(e.spent.map((r) => [r.id, r.date])).toEqual([['oct', '2026-10-24']]);
    expect(e.period).toMatchObject({ periodKey: '2026-11-01', preSeason: true });
  });
});
