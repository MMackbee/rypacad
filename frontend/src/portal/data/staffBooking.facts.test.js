/**
 * Staff booking add facts (Task C1, spec 01-spec-admin-booking.md 10.1 and
 * 10.5): whether a session is offered, the warnings for each limit staff
 * skip, and the charge the server will most likely make - a prediction the
 * add sheet words; the server decides. NOW is noon Chicago, Thu Nov 12.
 */
import { staffAddFacts } from './staffBooking';
import { staffAthleteModel } from './staffAthlete';
import { ELITE, SINGLE_TOKEN, packageById } from './packages';

const NOW = new Date('2026-11-12T18:00:00Z');
const T6 = packageById('t-6');
const JORDAN = { id: 'jordan', name: 'Jordan Whitfield', householdId: 'hh1', packageId: 't-6', handicap: 4 };
const HH1 = { id: 'hh1', name: 'Whitfield family', periodAnchorDay: 1 };

const tokens = (over = {}) => ({
  granted: 6, used: 3, reserved: 0, grace: [], left: 3, unlimited: false, perPurchase: false, held: 0,
  nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', booked: 0, used: 0, reserved: 0, granted: 6, left: 6 },
  ...over,
});
const ELITE_TOKENS = tokens({ granted: null, used: 0, left: null, unlimited: true, nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', booked: 0, used: 0, reserved: 0, granted: null, left: null } });
const SINGLE_TOKENS = (over = {}) => tokens({ granted: 0, used: 0, left: 0, perPurchase: true, nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', booked: 0, used: 0, reserved: 0, granted: 0, left: 0 }, ...over });

const model = (over = {}) => staffAthleteModel({
  athlete: JORDAN, household: HH1, pkg: T6, bookings: [], waitlist: [], graceTokens: [], sessionsById: {},
  tokens: tokens(), today: '2026-11-12', ...over,
});
const session = (over = {}) => ({ id: 's2', date: '2026-11-17', time: '4:00 PM', type: 'training', capacity: 12, booked: 3, ...over });
const waitingOn = (id = 's2', date = '2026-11-17') => [{ id: `${id}_jordan`, sessionId: id, athleteId: 'jordan', periodKey: '2026-11-01', date }];
const charge = (s, m) => staffAddFacts(s, m, NOW).charge;
const warnings = (s, m) => staffAddFacts(s, m, NOW).warnings;

describe('the charge', () => {
  test("this period's tokens: what is left AFTER the add", () => {
    expect(charge(session(), model())).toEqual({ kind: 'period', left: 2, next: false, from: '2026-11-01' });
  });

  test("a next-period session spends the next period's tokens", () => {
    expect(charge(session({ date: '2026-12-03' }), model())).toEqual({ kind: 'period', left: 5, next: true, from: '2026-12-01' });
  });

  test("a bonus token first, the soonest-expiring one still good on the session's day", () => {
    const grace = [{ id: 'g-0', expiresAt: '2026-11-15' }, { id: 'g-1', expiresAt: '2026-11-20' }];
    expect(charge(session(), model({ tokens: tokens({ grace }) }))).toEqual({ kind: 'grace', expiresAt: '2026-11-20' });
    expect(charge(session(), model({ tokens: tokens({ grace: [{ id: 'g-0', expiresAt: '2026-11-15' }] }) }))).toMatchObject({ kind: 'period' });
    expect(charge(session(), model({ tokens: tokens({ grace: [{ id: 'g-2', expiresAt: null }] }) }))).toEqual({ kind: 'grace', expiresAt: null });
  });

  test('a bought session token reads as one', () => {
    const m = model({ pkg: SINGLE_TOKEN, tokens: SINGLE_TOKENS({ grace: [{ id: 'single_cs1', expiresAt: '2027-02-27' }] }) });
    expect(charge(session(), m)).toEqual({ kind: 'single', expiresAt: '2027-02-27' });
  });

  test('Elite uses nothing', () => {
    expect(charge(session(), model({ pkg: ELITE, tokens: ELITE_TOKENS }))).toEqual({ kind: 'elite' });
  });

  test('past the next period the client cannot say', () => {
    expect(charge(session({ date: '2027-01-14' }), model())).toEqual({ kind: 'unknown' });
    expect(charge(session({ date: '2026-12-03' }), model({ tokens: tokens({ nextPeriod: null }) }))).toEqual({ kind: 'unknown' });
  });

  test('none left, this period or next', () => {
    expect(charge(session(), model({ tokens: tokens({ left: 0 }) }))).toEqual({ kind: 'none', next: false });
    const noneNext = tokens({ nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', booked: 6, used: 6, reserved: 0, granted: 6, left: 0 } });
    expect(charge(session({ date: '2026-12-03' }), model({ tokens: noneNext }))).toEqual({ kind: 'none', next: true });
  });

  test('Free only for every state but paid, before anything else', () => {
    const cases = [
      [{ athlete: { ...JORDAN, billing: { status: 'pending' } } }, 'unpaid'],
      [{ household: { ...HH1, membership: { status: 'past_due' } } }, 'past_due'],
      [{ household: { ...HH1, membership: { status: 'lapsed' } } }, 'lapsed'],
      [{ pkg: null, tokens: null }, 'no-package'],
    ];
    for (const [over, payState] of cases) {
      expect(charge(session(), model({ ...over, tokens: over.tokens === null ? null : tokens({ grace: [{ id: 'g-1', expiresAt: null }] }) }))).toEqual({ kind: 'free-only', payState });
    }
    expect(charge(session(), model({ pkg: ELITE, tokens: ELITE_TOKENS, household: { ...HH1, membership: { status: 'lapsed' } } }))).toEqual({ kind: 'free-only', payState: 'lapsed' });
  });

  test("waiting on this session gives back the token the place holds", () => {
    expect(charge(session(), model({ tokens: tokens({ left: 0 }), waitlist: waitingOn() }))).toEqual({ kind: 'period', left: 0, next: false, from: '2026-11-01' });
    expect(charge(session(), model({ tokens: tokens({ left: 0 }), waitlist: waitingOn('s5', '2026-11-19') }))).toEqual({ kind: 'none', next: false });
  });

  test('a single athlete waiting on it spends the token the place holds', () => {
    const m = model({ pkg: SINGLE_TOKEN, tokens: SINGLE_TOKENS({ held: 1 }), waitlist: waitingOn() });
    expect(charge(session(), m)).toEqual({ kind: 'single' });
    expect(charge(session({ id: 's5' }), m)).toEqual({ kind: 'none', next: false });
  });
});

describe('the warnings', () => {
  test("past the family's booking window", () => {
    expect(warnings(session({ date: '2027-01-05' }), model())).toEqual([{ kind: 'outside-window', through: '2026-12-31' }]);
    expect(warnings(session({ date: '2027-01-05' }), model({ pkg: ELITE, tokens: ELITE_TOKENS }))).toEqual([]);
  });

  test('a handicap-reserved block, with the handicap or none on file', () => {
    expect(warnings(session({ maxHandicap: 5 }), model({ athlete: { ...JORDAN, handicap: 9 } }))).toEqual([{ kind: 'handicap-reserved', limit: 5, handicap: 9 }]);
    expect(warnings(session({ maxHandicap: 5 }), model({ athlete: { ...JORDAN, handicap: null } }))).toEqual([{ kind: 'handicap-reserved', limit: 5, handicap: null }]);
    expect(warnings(session({ maxHandicap: 5 }), model())).toEqual([]);
  });

  test("Elite's one a day", () => {
    const bookings = [{ id: 'jordan_s1', athleteId: 'jordan', sessionId: 's1', status: 'confirmed', date: '2026-11-17', type: 'training', periodKey: '2026-11-01' }];
    expect(warnings(session(), model({ pkg: ELITE, tokens: ELITE_TOKENS, bookings }))).toEqual([{ kind: 'one-per-day', type: 'training', date: '2026-11-17' }]);
    const cancelled = [{ ...bookings[0], status: 'cancelled' }];
    expect(warnings(session(), model({ pkg: ELITE, tokens: ELITE_TOKENS, bookings: cancelled }))).toEqual([]);
  });

  test('started today, or on an earlier day', () => {
    expect(warnings(session({ date: '2026-11-12', time: '11:00 AM' }), model())).toEqual([{ kind: 'started', today: true, date: '2026-11-12' }]);
    expect(warnings(session({ date: '2026-11-10' }), model())).toEqual([{ kind: 'started', today: false, date: '2026-11-10' }]);
    expect(warnings(session({ date: '2026-11-12', time: '4:00 PM' }), model())).toEqual([]);
  });

  test('waiting on this session', () => {
    expect(warnings(session(), model({ waitlist: waitingOn() }))).toEqual([{ kind: 'waiting' }]);
  });

  test('in one order when several apply', () => {
    const bookings = [{ id: 'jordan_s1', athleteId: 'jordan', sessionId: 's1', status: 'confirmed', date: '2026-11-12', type: 'training', periodKey: '2026-11-01' }];
    const m = model({ athlete: { ...JORDAN, handicap: 9 }, pkg: ELITE, tokens: ELITE_TOKENS, bookings, waitlist: waitingOn('s2', '2026-11-12') });
    expect(warnings(session({ date: '2026-11-12', time: '11:00 AM', maxHandicap: 5 }), m).map((w) => w.kind)).toEqual(['handicap-reserved', 'one-per-day', 'started', 'waiting']);
    const t6 = model({ athlete: { ...JORDAN, handicap: 9 } });
    expect(warnings(session({ date: '2027-01-05', maxHandicap: 5 }), t6).map((w) => w.kind)).toEqual(['outside-window', 'handicap-reserved']);
  });
});

describe('the flags', () => {
  test('seats taken and full', () => {
    expect(staffAddFacts(session({ booked: 12, capacity: 12 }), model(), NOW)).toMatchObject({ full: true, taken: 12, capacity: 12, offer: true });
    expect(staffAddFacts(session(), model(), NOW)).toMatchObject({ full: false, taken: 3, capacity: 12, held: false, waiting: false, started: false });
  });

  test('a session the athlete holds is not offered again', () => {
    const bookings = [{ id: 'jordan_s2', athleteId: 'jordan', sessionId: 's2', status: 'confirmed', date: '2026-11-17', type: 'training', periodKey: '2026-11-01' }];
    expect(staffAddFacts(session(), model({ bookings }), NOW)).toMatchObject({ held: true, offer: false });
    const cancelled = [{ ...bookings[0], status: 'cancelled' }];
    expect(staffAddFacts(session(), model({ bookings: cancelled }), NOW)).toMatchObject({ held: false, offer: true });
  });

  test('waiting on it is still offered', () => {
    expect(staffAddFacts(session(), model({ waitlist: waitingOn() }), NOW)).toMatchObject({ waiting: true, offer: true });
  });

  test('never a cancelled, hidden, display-only, 1:1, Calendly or unmatched session, nor one before this period', () => {
    for (const over of [
      { status: 'cancelled' }, { hidden: true }, { bookable: false }, { type: 'mental' }, { source: 'calendly' },
      { unresolved: true }, { date: '2026-10-27' },
    ]) {
      expect(staffAddFacts(session(over), model(), NOW).offer).toBe(false);
    }
    expect(staffAddFacts(session({ date: '2026-11-01' }), model(), NOW).offer).toBe(true);
  });
});
