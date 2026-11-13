/**
 * One athlete as the staff screens see them (Task C1, spec
 * 01-spec-admin-booking.md 10.2): the pay state that decides Free only,
 * the periods, and the bookings and waitlist places grouped this period,
 * next period and later, each with its badge.
 */
import { payStateOf, staffAthleteModel } from './staffAthlete';
import { ELITE, packageById } from './packages';

const T6 = packageById('t-6');
const JORDAN = { id: 'jordan', name: 'Jordan Whitfield', householdId: 'hh1', packageId: 't-6', handicap: 4 };
const HH1 = { id: 'hh1', name: 'Whitfield family', periodAnchorDay: 1 };
const TOKENS = { granted: 6, used: 1, reserved: 0, grace: [], left: 5, unlimited: false, perPurchase: false, held: 0, nextPeriod: null };

const SESSIONS = {
  s0: { id: 's0', date: '2026-10-27', time: '4:00 PM', type: 'training' },
  s1: { id: 's1', date: '2026-11-10', time: '4:00 PM', type: 'training' },
  s2: { id: 's2', date: '2026-11-17', time: '5:00 PM', type: 'training' },
  s3: { id: 's3', date: '2026-11-17', time: '3:00 PM', type: 'phil' },
  s4: { id: 's4', date: '2026-11-21', time: '10:30 AM', type: 'tournament', label: 'Thanksgiving Tour event' },
  s9: { id: 's9', date: '2026-12-03', time: '4:00 PM', type: 'training' },
  s20: { id: 's20', date: '2027-01-07', time: '4:00 PM', type: 'training' },
};
const bk = (sid, over = {}) => ({
  id: `jordan_${sid}`, athleteId: 'jordan', householdId: 'hh1', sessionId: sid, status: 'confirmed',
  date: SESSIONS[sid].date, type: SESSIONS[sid].type, periodKey: `${SESSIONS[sid].date.slice(0, 7)}-01`, ...over,
});
const model = (over = {}) => staffAthleteModel({
  athlete: JORDAN, household: HH1, pkg: T6, bookings: [], waitlist: [], graceTokens: [], sessionsById: SESSIONS,
  tokens: TOKENS, today: '2026-11-12', ...over,
});
const ids = (rows) => rows.map((r) => r.id);

describe('payStateOf', () => {
  test('each state, in order: no package, past due, lapsed, unpaid, paid', () => {
    expect(payStateOf(JORDAN, { ...HH1, membership: { status: 'past_due' } }, null)).toBe('no-package');
    expect(payStateOf(JORDAN, { ...HH1, membership: { status: 'past_due' } }, T6)).toBe('past_due');
    expect(payStateOf(JORDAN, { ...HH1, membership: { status: 'lapsed' } }, T6)).toBe('lapsed');
    expect(payStateOf({ ...JORDAN, billing: { status: 'pending' } }, HH1, T6)).toBe('unpaid');
    expect(payStateOf(JORDAN, HH1, T6)).toBe('paid');
  });

  test('unpaid also covers a one-time payment off the single token; active billing or none is paid', () => {
    expect(payStateOf({ ...JORDAN, billing: { status: 'active', oneTime: true } }, HH1, T6)).toBe('unpaid');
    expect(payStateOf({ ...JORDAN, packageId: 'single', billing: { status: 'active', oneTime: true } }, HH1, packageById('single'))).toBe('paid');
    expect(payStateOf({ ...JORDAN, billing: { status: 'active' } }, { ...HH1, membership: { status: 'active' } }, T6)).toBe('paid');
    expect(payStateOf(JORDAN, null, T6)).toBe('paid');
  });
});

describe('staffAthleteModel', () => {
  test('who: names, household, package, handicap, anchor, pay state and tokens', () => {
    const m = model();
    expect(m).toMatchObject({
      athleteId: 'jordan', name: 'Jordan Whitfield', first: 'Jordan', householdId: 'hh1', householdName: 'Whitfield family',
      packageName: '6 tokens', test: false, handicap: 4, pkg: T6, anchorDay: 1, payState: 'paid', tokens: TOKENS,
    });
    expect(m.period).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(m.nextPeriod).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });

  test('an anchor-15 household reads its own periods', () => {
    const m = model({ household: { ...HH1, periodAnchorDay: 15 } });
    expect(m.anchorDay).toBe(15);
    expect(m.period).toEqual({ start: '2026-10-15', end: '2026-11-14' });
    expect(m.nextPeriod).toEqual({ start: '2026-11-15', end: '2026-12-14' });
  });

  test('a test household alone, or a test athlete alone, marks the athlete test', () => {
    expect(model({ household: { ...HH1, test: true } }).test).toBe(true);
    expect(model({ athlete: { ...JORDAN, test: true } }).test).toBe(true);
  });

  test('the groups: this period, next period, later; nothing cancelled or from a period that is over', () => {
    const m = model({
      bookings: [bk('s0'), bk('s1', { status: 'attended' }), bk('s2', { status: 'cancelled' }), bk('s9')],
      waitlist: [{ id: 's4_jordan', sessionId: 's4', athleteId: 'jordan', periodKey: '2026-11-01', date: '2026-11-21', type: 'tournament' }],
    });
    expect(ids(m.groups.thisPeriod)).toEqual(['jordan_s1', 's4_jordan']);
    expect(ids(m.groups.nextPeriod)).toEqual(['jordan_s9']);
    expect(m.groups.later).toEqual([]);
    expect(m.groups.thisPeriod[0]).toMatchObject({ kind: 'booking', badge: 'Attended', date: '2026-11-10', time: '4:00 PM', type: 'training', label: 'Training block', sessionId: 's1' });
    expect(m.groups.thisPeriod[1]).toMatchObject({ kind: 'waitlist', badge: 'Waitlist', type: 'tournament', label: 'Thanksgiving Tour event', time: '10:30 AM' });
  });

  test("Elite's month after next sits under Later", () => {
    const m = model({ pkg: ELITE, bookings: [bk('s1'), bk('s20')] });
    expect(ids(m.groups.later)).toEqual(['jordan_s20']);
    expect(m.groups.later[0].badge).toBe('Booked');
  });

  test('by date, then start time', () => {
    const m = model({ bookings: [bk('s2'), bk('s3'), bk('s1')] });
    expect(ids(m.groups.thisPeriod)).toEqual(['jordan_s1', 'jordan_s3', 'jordan_s2']);
  });

  test('every badge', () => {
    const m = model({
      bookings: [
        bk('s1', { status: 'noshow' }),
        bk('s2', { comp: true, chargedFrom: 'period' }),
        bk('s3', { graceTokenId: 'single_cs1', chargedFrom: 'grace' }),
        bk('s4', { graceTokenId: 'g-1', chargedFrom: 'grace' }),
        bk('s9'),
      ],
    });
    const badges = [...m.groups.thisPeriod, ...m.groups.nextPeriod].map((r) => [r.id, r.badge]);
    expect(badges).toEqual([
      ['jordan_s1', 'No-show'],
      ['jordan_s3', 'Session token'],
      ['jordan_s2', 'Free'],
      ['jordan_s4', 'Bonus token'],
      ['jordan_s9', 'Booked'],
    ]);
  });

  test('which sessions the athlete holds and waits on; the raw lists ride along', () => {
    const bookings = [bk('s1'), bk('s2', { status: 'cancelled' }), bk('s0')];
    const waitlist = [{ id: 's4_jordan', sessionId: 's4', athleteId: 'jordan', periodKey: '2026-11-01' }];
    const graceTokens = [{ id: 'g-1', athleteId: 'jordan', expiresAt: '2026-11-20' }];
    const m = model({ bookings, waitlist, graceTokens });
    expect(m.heldSessionIds).toEqual(['s1', 's0']);
    expect(m.waitingSessionIds).toEqual(['s4']);
    expect(m.bookings).toBe(bookings);
    expect(m.waitlist).toBe(waitlist);
    expect(m.graceTokens).toBe(graceTokens);
  });

  test('a row with no session doc still reads, by its own date and type', () => {
    const m = model({ sessionsById: {}, bookings: [bk('s1')] });
    expect(m.groups.thisPeriod[0]).toMatchObject({ id: 'jordan_s1', date: '2026-11-10', time: null, type: 'training', label: 'Training block', badge: 'Booked' });
  });
});
