/**
 * hooks/billing.js' Sprint 20 guard (spec 4.4: REACT_APP_STRIPE_PORTAL_URL
 * is REQUIRED in production): a live build without it warns ONCE per page
 * load; seed mode and a set URL never warn. Firebase is mocked out. The
 * ?paid= confirmation hook runs against a mocked ./live (the single-token
 * return, owner ruling 2026-09-29/30).
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('firebase/auth', () => ({}));
jest.mock('firebase/functions', () => ({ httpsCallable: jest.fn(() => jest.fn()) }));
jest.mock('firebase/messaging', () => ({ isSupported: jest.fn(async () => false) }));
// CRA's resetMocks clears these before every test: isLive() reads falsy (seed)
// unless a test turns it on.
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: jest.fn(),
  fetchAthlete: jest.fn(),
  fetchBookings: jest.fn(),
  fetchCurrentUser: jest.fn(),
  fetchGraceTokensByAthlete: jest.fn(),
  fetchHousehold: jest.fn(),
  fetchHouseholdAthletes: jest.fn(),
  fetchPackage: jest.fn(),
  fetchSessionsByIds: jest.fn(),
}));
jest.mock('./grace', () => ({ ...jest.requireActual('./grace'), __esModule: true, fetchTokenPeriod: jest.fn() }));
jest.mock('./waitlist', () => ({ ...jest.requireActual('./waitlist'), __esModule: true, fetchWaitlistByAthlete: jest.fn() }));
jest.mock('../data/calendar', () => {
  const actual = jest.requireActual('../data/calendar');
  return { ...actual, __esModule: true, todayISO: jest.fn(() => actual.todayISO()) };
});

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import useBillingHub, { allPerPurchaseOf, facilityPendingOf, pendingOf, tokensStartOf, useMyTokens, usePaymentConfirmation, warnMissingPortalUrl } from './billing';
import * as live from './live';
import * as grace from './grace';
import * as waitlist from './waitlist';
import * as calendar from '../data/calendar';

test('tokensStartOf: the first period start while any member is pre-season (tester report 2026-09-30)', () => {
  const m = (preSeason, start) => ({ period: { preSeason, start } });
  expect(tokensStartOf([m(false, '2026-09-01'), m(true, '2026-11-01')])).toBe('2026-11-01');
  // Every period from Nov 1 on (Elite reads the first period before then too): the reset title stands.
  expect(tokensStartOf([m(false, '2026-11-01')])).toBeNull();
  expect(tokensStartOf([m(false, '2026-12-01'), { period: null }])).toBeNull();
  expect(tokensStartOf([])).toBeNull();
});

test('pendingOf marks single-token athletes perPurchase and carries the package; allPerPurchaseOf is true only for an all-single household', () => {
  const ids = { single: 'single', tokens: 't-12' };
  const m = (id, kind, status) => ({ athleteId: id, name: id, package: kind ? { id: ids[kind] ?? kind, kind } : null, billing: { status } });
  const members = [m('ava', 'single', 'pending'), m('ben', 'tokens', 'lapsed'), m('cy', 'single', 'active'), m('dee', null, 'pending')];
  expect(pendingOf(members)).toEqual([
    { athleteId: 'ava', name: 'ava', status: 'pending', perPurchase: true, packageId: 'single' },
    { athleteId: 'ben', name: 'ben', status: 'lapsed', perPurchase: false, packageId: 't-12' },
    { athleteId: 'dee', name: 'dee', status: 'pending', perPurchase: false, packageId: null },
  ]);
  expect(allPerPurchaseOf([m('ava', 'single', 'active'), m('cy', 'single', 'pending')])).toBe(true);
  expect(allPerPurchaseOf(members)).toBe(false);
  expect(allPerPurchaseOf([m('ben', 'elite', 'active')])).toBe(false);
  expect(allPerPurchaseOf([])).toBe(false);
});

test('facilityPendingOf: the family add-on asked for at sign-up and still to pay - ONE row, apart from pendingOf (owner ruling 2026-09-30)', () => {
  const m = (id, over) => ({ athleteId: id, name: id, facilityRequested: true, package: { id: 't-12', kind: 'tokens' }, billing: { status: 'active', facility: null }, ...over });
  const unpaid = { billing: { status: 'pending', facility: null } };
  expect(facilityPendingOf([m('ava'), m('eve', { facilityRequested: false })])).toEqual([{ athleteId: 'ava', name: 'ava', state: 'pay' }]);
  expect(facilityPendingOf([m('ben', unpaid), m('eve', { facilityRequested: false })])).toEqual([{ athleteId: 'ben', name: 'ben', state: 'waiting' }]);
  // Sign-ups from before the family ruling may hold a request per child: one row, a payable one first.
  expect(facilityPendingOf([m('ben', unpaid), m('ava'), m('gil')])).toEqual([{ athleteId: 'ava', name: 'ava', state: 'pay' }]);
  expect(facilityPendingOf([m('ben', unpaid), m('hal', unpaid)])).toEqual([{ athleteId: 'ben', name: 'ben', state: 'waiting' }]);
  // The family already has access - another athlete's add-on, or Elite: nothing left to pay.
  expect(facilityPendingOf([m('ava'), m('cy', { billing: { status: 'active', facility: 'active' } })])).toEqual([]);
  expect(facilityPendingOf([m('ava'), m('cy', { facilityRequested: false, billing: { status: 'active', facility: 'past_due' } })])).toEqual([]);
  expect(facilityPendingOf([m('ava'), m('dee', { package: { id: 'elite', kind: 'elite' } })])).toEqual([]);
  // Elite still to pay (review 2026-09-30): no Pay row - the family would end up paying for both once Elite is paid.
  expect(facilityPendingOf([m('ava'), m('dee', { package: { id: 'elite', kind: 'elite' }, ...unpaid })])).toEqual([]);
  // Elite that ended blocks nothing: the request stands.
  expect(facilityPendingOf([m('ava'), m('dee', { package: { id: 'elite', kind: 'elite' }, billing: { status: 'lapsed', facility: null } })])).toEqual([{ athleteId: 'ava', name: 'ava', state: 'pay' }]);
  // An unpaid add-on never makes an athlete pending (it does not block booking).
  expect(pendingOf([m('ava')])).toEqual([]);
  expect(facilityPendingOf([])).toEqual([]);
  expect(facilityPendingOf(undefined)).toEqual([]);
});

test('the seed hub and the athlete\'s own row carry facilityPending (none in the sample family)', async () => {
  calendar.todayISO.mockReturnValue('2026-10-20'); // CRA's resetMocks cleared the pass-through
  live.isLive.mockReturnValue(false);
  const result = { hub: null, mine: null };
  function Probe() {
    result.hub = useBillingHub();
    result.mine = useMyTokens();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  expect(result.hub.data.facilityPending).toEqual([]);
  expect(result.mine.data.facilityPending).toEqual([]);
  await act(async () => root.unmount());
});

test('warnMissingPortalUrl fires once, only live, only when the URL is missing', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  expect(warnMissingPortalUrl({ live: false, url: null })).toBe(false);
  expect(warnMissingPortalUrl({ live: true, url: 'https://billing.stripe.com/p/login/test_x' })).toBe(false);
  expect(warn).not.toHaveBeenCalled();
  expect(warnMissingPortalUrl({ live: true, url: null })).toBe(true);
  expect(warn).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls[0][0]).toContain('REACT_APP_STRIPE_PORTAL_URL');
  expect(warnMissingPortalUrl({ live: true, url: null })).toBe(false); // once per page load
  expect(warn).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

// Kept after the warn test: a live hub load spends the once-per-load warning.
test('the live hub counts and labels an October booking under November (review 2026-09-30)', async () => {
  calendar.todayISO.mockReturnValue('2026-10-20');
  live.isLive.mockReturnValue(true);
  live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1 });
  live.fetchHouseholdAthletes.mockResolvedValue([{ id: 'a1', name: 'Jordan', householdId: 'h1', packageId: 't-16', facilityRequested: true }]);
  live.fetchPackage.mockResolvedValue({ id: 't-16', name: '16 tokens', kind: 'tokens', tokens: 16 });
  live.fetchBookings.mockResolvedValue([
    { id: 'a1_phil', sessionId: 'phil-1024', date: '2026-10-24', periodKey: '2026-10-01', status: 'confirmed', type: 'phil' },
  ]);
  live.fetchGraceTokensByAthlete.mockResolvedValue([]);
  live.fetchSessionsByIds.mockResolvedValue([{ id: 'phil-1024', date: '2026-10-24', type: 'phil', label: 'Performance with Phil', time: '4:00' }]);
  grace.fetchTokenPeriod.mockResolvedValue(null);
  waitlist.fetchWaitlistByAthlete.mockResolvedValue([]);

  const result = { current: null };
  function Probe() {
    result.current = useBillingHub({ householdId: 'h1' });
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(result.current.error).toBeNull();
  const [jordan] = result.current.data.members;
  expect(jordan.tokens).toMatchObject({ granted: 16, used: 1, left: 15, startsOn: '2026-11-01' });
  expect(live.fetchSessionsByIds).toHaveBeenCalledWith(['phil-1024']);
  expect(jordan.spent).toEqual([expect.objectContaining({ id: 'a1_phil', label: 'Performance with Phil', time: '4:00' })]);
  // The add-on ticked at sign-up (no billing doc == active membership): ready to pay.
  expect(result.current.data.facilityPending).toEqual([{ athleteId: 'a1', name: 'Jordan', state: 'pay' }]);
  await act(async () => root.unmount());
});

// Owner report 2026-09-30 (Mike): Membership for an Elite athlete read "Nothing
// booked in this period yet. Next period from Thursday, Oct 1: unlimited" over
// two November bookings.
test('Membership, Elite, before the season: November with its bookings, December next, no Oct 1', async () => {
  calendar.todayISO.mockReturnValue('2026-09-30');
  live.isLive.mockReturnValue(true);
  live.fetchCurrentUser.mockResolvedValue({ uid: 'u1', athleteId: 'a1' });
  live.fetchAthlete.mockResolvedValue({ id: 'a1', name: 'Jordan', householdId: 'h1', packageId: 'elite' });
  live.fetchHousehold.mockResolvedValue({ id: 'h1', name: 'Whitfield family', periodAnchorDay: 1 });
  live.fetchPackage.mockResolvedValue({ id: 'elite', name: 'Elite', kind: 'elite', tokens: null, windowDays: 45 });
  live.fetchBookings.mockResolvedValue([
    { id: 'a1_n1', sessionId: 'n1', date: '2026-11-03', periodKey: '2026-11-01', status: 'confirmed', type: 'training' },
    { id: 'a1_n2', sessionId: 'n2', date: '2026-11-10', periodKey: '2026-11-01', status: 'confirmed', type: 'training' },
  ]);
  live.fetchGraceTokensByAthlete.mockResolvedValue([]);
  live.fetchSessionsByIds.mockResolvedValue([
    { id: 'n1', date: '2026-11-03', type: 'training', time: '4:00 PM' },
    { id: 'n2', date: '2026-11-10', type: 'training', time: '4:00 PM' },
  ]);
  grace.fetchTokenPeriod.mockResolvedValue(null);
  waitlist.fetchWaitlistByAthlete.mockResolvedValue([]);

  const result = { current: null };
  function Probe() {
    result.current = useMyTokens();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(result.current.error).toBeNull();
  const { member, status } = result.current.data;
  expect(member.tokens).toMatchObject({ unlimited: true });
  expect(member.period).toMatchObject({ start: '2026-11-01', end: '2026-11-30', preSeason: true });
  expect(member.spent.map((r) => [r.id, r.time])).toEqual([['a1_n1', '4:00 PM'], ['a1_n2', '4:00 PM']]);
  expect(member.nextPeriod).toMatchObject({ start: '2026-12-01', granted: null, booked: 0 });
  expect(grace.fetchTokenPeriod).toHaveBeenCalledWith('a1', '2026-11-01');
  // Was "Tokens reset Thursday, Oct 1": nothing resets before the season.
  // Then "Tokens start ...": Elite holds no tokens (tester Mike 2026-09-30).
  expect(status.title).toBe(`First period starts ${calendar.longDayLabel('2026-11-01')}`);
  await act(async () => root.unmount());
});

// Owner report (Mike S6 2026-09-30): the self-managed 18+ athlete's Billing
// hub. The athletes rule admits their own doc by id, never the householdId
// list query a parent's hub runs - so the hub must not run it for them.
test("the athlete's hub is their own one-member household, read by id", async () => {
  calendar.todayISO.mockReturnValue('2026-10-20');
  live.isLive.mockReturnValue(true);
  live.fetchCurrentUser.mockResolvedValue({ uid: 'u-self', role: 'athlete', athleteId: 'a-self', householdId: 'hh-self' });
  live.fetchAthlete.mockResolvedValue({ id: 'a-self', name: 'Sam', householdId: 'hh-self', packageId: 't-12' });
  live.fetchHousehold.mockResolvedValue({ id: 'hh-self', name: 'Sam Rivera', periodAnchorDay: 1, createdBy: 'u-self', stripeCustomerId: 'cus_self' });
  live.fetchPackage.mockResolvedValue({ id: 't-12', name: '12 tokens', kind: 'tokens', tokens: 12 });
  live.fetchBookings.mockResolvedValue([]);
  live.fetchGraceTokensByAthlete.mockResolvedValue([]);
  grace.fetchTokenPeriod.mockResolvedValue(null);
  waitlist.fetchWaitlistByAthlete.mockResolvedValue([]);

  const result = { current: null };
  function Probe() {
    result.current = useBillingHub();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(result.current.error).toBeNull();
  expect(live.fetchHouseholdAthletes).not.toHaveBeenCalled();
  expect(live.fetchAthlete).toHaveBeenCalledWith('a-self');
  expect(live.fetchHousehold).toHaveBeenCalledWith('hh-self');
  expect(result.current.data.members.map((m) => [m.athleteId, m.name])).toEqual([['a-self', 'Sam']]);
  expect(result.current.data.household).toMatchObject({ id: 'hh-self', stripeCustomerId: 'cus_self' });
  expect(live.fetchBookings).toHaveBeenCalledWith('a-self', { householdId: 'hh-self' });
  await act(async () => root.unmount());
});

describe('usePaymentConfirmation (the ?paid= return)', () => {
  const mockLive = { athlete: null, grace: [], reads: [] };
  function Probe({ athleteId, cs, single, onState }) {
    onState(usePaymentConfirmation(athleteId, { cs, single }));
    return null;
  }
  async function mount(props) {
    const states = [];
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => { root.render(<Probe {...props} onState={(s) => states.push(s)} />); });
    return { last: () => states[states.length - 1], unmount: () => act(async () => { root.unmount(); }) };
  }
  // One poll: fire the due timer, then let the awaited read settle.
  const poll = (ms) => act(async () => {
    jest.advanceTimersByTime(ms);
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });

  beforeEach(() => {
    jest.useFakeTimers('modern');
    mockLive.athlete = null;
    mockLive.grace = [];
    mockLive.reads = [];
    // CRA's resetMocks cleared these: the hook polls live, off this fixture.
    live.isLive.mockReturnValue(true);
    live.fetchAthlete.mockImplementation(async (id) => { mockLive.reads.push(`athlete:${id}`); return mockLive.athlete; });
    live.fetchGraceTokensByAthlete.mockImplementation(async (id) => { mockLive.reads.push(`grace:${id}`); return mockLive.grace; });
  });
  afterEach(() => { jest.useRealTimers(); });

  test('a single return waits for graceTokens/single_<cs>, even when the athlete is already active', async () => {
    mockLive.athlete = { id: 'ava', packageId: 'single', billing: { status: 'active', oneTime: true } };
    mockLive.grace = [{ id: 'single_cs_old', athleteId: 'ava', reason: 'single-purchase' }];
    const h = await mount({ athleteId: 'ava', cs: 'cs_new', single: true });
    await poll(0);
    expect(h.last().state).toBe('confirming');
    expect(mockLive.reads).toEqual(['grace:ava']); // the athlete's billing proves nothing here
    mockLive.grace = [...mockLive.grace, { id: 'single_cs_new', athleteId: 'ava', reason: 'single-purchase' }];
    await poll(5000);
    expect(h.last()).toMatchObject({ state: 'confirmed', billingStatus: 'active', packageId: 'single' });
    await h.unmount();
  });

  test('the monthly return confirms on billingStatusOf - a one-time buyer on t-6 stays confirming', async () => {
    mockLive.athlete = { id: 'ben', packageId: 't-6', billing: { status: 'active', oneTime: true } };
    const h = await mount({ athleteId: 'ben', cs: 'cs_sub', single: false });
    await poll(0);
    expect(h.last().state).toBe('confirming');
    expect(mockLive.reads).toEqual(['athlete:ben']);
    mockLive.athlete = { id: 'ben', packageId: 't-6', billing: { status: 'active', oneTime: false } };
    await poll(5000);
    expect(h.last()).toMatchObject({ state: 'confirmed', packageId: 't-6' });
    await h.unmount();
  });

  test('a confirmation is remembered per Checkout Session: a second purchase polls again', async () => {
    mockLive.grace = [{ id: 'single_cs_1', athleteId: 'cy' }];
    const first = await mount({ athleteId: 'cy', cs: 'cs_1', single: true });
    await poll(0);
    expect(first.last().state).toBe('confirmed');
    await first.unmount();
    mockLive.reads = [];
    const again = await mount({ athleteId: 'cy', cs: 'cs_1', single: true });
    expect(again.last().state).toBe('confirmed'); // answered from memory
    await poll(0);
    expect(mockLive.reads).toEqual([]);
    await again.unmount();
    const second = await mount({ athleteId: 'cy', cs: 'cs_2', single: true });
    await poll(0);
    expect(second.last().state).toBe('confirming'); // single_cs_2 is not there yet
    expect(mockLive.reads).toEqual(['grace:cy']);
    await second.unmount();
  });
});
