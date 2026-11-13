/**
 * The staff add sheet (Task C6, spec 01-spec-admin-booking.md 10.5): an
 * optional day-and-session pick, then the confirm - the title (or the full
 * question), the summary, one charge line, the Free switch (hidden for
 * Elite, locked on for Free only, needed when no tokens are left), the
 * warnings, and one call per tap. A refusal never claims more than it
 * knows. NOW is noon Chicago, Thu Nov 12. Plain functions, not jest.fn().
 */
jest.mock('../../hooks/staffBooking', () => ({
  useStaffAthlete: () => ({ data: mockModel, loading: false, error: null }),
  useStaffSession: (id) => ({ data: id ? mockSession : null, loading: false, error: null }),
  useStaffDaySessions: () => ({ data: mockDay, loading: false, error: null }),
  useSessionWaitlistCount: (id, { enabled } = {}) => ({ data: enabled ? mockWaiting : null }),
  staffBookSession: (args, opts) => {
    mockCalls.push([args, opts]);
    return mockBook(args);
  },
}));

import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import StaffAddSheet from './StaffAddSheet';
import { staffAthleteModel } from '../../data/staffAthlete';
import { ELITE, packageById } from '../../data/packages';

const NOW = new Date('2026-11-12T18:00:00Z');
let mockModel;
let mockSession;
let mockDay;
let mockWaiting;
let mockCalls;
let mockBook;

const JORDAN = { id: 'jordan', name: 'Jordan Whitfield', householdId: 'hh1', packageId: 't-6', handicap: 4 };
const tokens = (over = {}) => ({
  granted: 6, used: 3, reserved: 0, grace: [], left: 3, unlimited: false, perPurchase: false, held: 0,
  nextPeriod: { periodKey: '2026-12-01', periodEnd: '2026-12-31', booked: 0, used: 0, reserved: 0, granted: 6, left: 6 }, ...over,
});
const model = (over = {}) => staffAthleteModel({
  athlete: JORDAN, household: { id: 'hh1', name: 'Whitfield family', periodAnchorDay: 1 }, pkg: packageById('t-6'),
  bookings: [], waitlist: [], graceTokens: [], sessionsById: {}, tokens: tokens(), today: '2026-11-12', ...over,
});
const S2 = { id: 's2', date: '2026-11-17', time: '4:00 PM', type: 'training', capacity: 12, booked: 3 };
const refusal = (reason, message, details) => Object.assign(new Error(message), { reason, details: details ?? null });

beforeEach(() => {
  mockModel = model();
  mockSession = S2;
  mockDay = [S2];
  mockWaiting = 0;
  mockCalls = [];
  mockBook = async (args) => ({ bookingId: `${args.athleteId}_${args.sessionId}`, comp: Boolean(args.free), chargedFrom: 'period', graceTokenId: null, booked: 4, capacity: 12, overrides: [] });
});

async function mount(props = {}) {
  const calls = { done: [], closed: 0 };
  const r = await renderScreen(
    <StaffAddSheet athleteId="jordan" name="Jordan Whitfield" onClose={() => { calls.closed += 1; }} onDone={(line) => calls.done.push(line)} now={NOW} {...props} />
  );
  const title = () => r.container.querySelector('[role="dialog"]').getAttribute('aria-label');
  const toggle = () => r.container.querySelector('[role="switch"]');
  const labels = () => [...r.container.querySelectorAll('button:not([role="switch"])')].map((b) => b.textContent.trim());
  const pick = async (id) => act(async () => { r.container.querySelector(`[data-staff-session="${id}"]`).click(); });
  return { ...r, calls, title, toggle, labels, pick };
}

describe('the Free switch', () => {
  test('unpaid: on and locked; the confirm adds free', async () => {
    mockModel = model({ athlete: { ...JORDAN, billing: { status: 'pending' } } });
    const r = await mount({ sessionId: 's2' });
    expect(r.text()).toContain("Jordan isn't paid up, so this booking is Free.");
    expect(r.toggle().getAttribute('aria-checked')).toBe('true');
    await act(async () => { r.toggle().click(); });
    expect(r.toggle().getAttribute('aria-checked')).toBe('true');
    expect(r.button('Add Jordan free')).not.toBeNull();
    await r.click('Add Jordan free');
    expect(mockCalls[0][0]).toEqual({ athleteId: 'jordan', sessionId: 's2', free: true, allowFull: false });
    await r.unmount();
  });

  test('no tokens left: the confirm waits for Free', async () => {
    mockModel = model({ tokens: tokens({ left: 0 }) });
    const r = await mount({ sessionId: 's2' });
    expect(r.text()).toContain('Jordan has no tokens left for this period. Switch on Free to add anyway.');
    // The spec's "none" row: the confirm reads "Add Jordan free" before the
    // switch is on too (walkthrough 2026-11-13 read "Add Jordan").
    expect(r.button('Add Jordan free').disabled).toBe(true);
    expect(r.button('Add Jordan')).toBeNull();
    await act(async () => { r.toggle().click(); });
    expect(r.text()).toContain('Free - no token used.');
    expect(r.button('Add Jordan free').disabled).toBe(false);
    await r.unmount();
  });

  test('Elite: no Free row', async () => {
    mockModel = model({ pkg: ELITE, tokens: tokens({ unlimited: true, granted: null, left: null }) });
    const r = await mount({ sessionId: 's2' });
    expect(r.toggle()).toBeNull();
    expect(r.text()).not.toContain('Free');
    expect(r.text()).toContain('Elite - nothing to use.');
    await r.unmount();
  });

  test('a paid athlete can switch Free on', async () => {
    const r = await mount({ sessionId: 's2' });
    expect(r.text()).toContain("Uses 1 of Jordan's tokens for this period - 2 left.");
    expect(r.toggle().getAttribute('aria-checked')).toBe('false');
    expect(parseFloat(r.toggle().style.height)).toBeGreaterThanOrEqual(44);
    await act(async () => { r.toggle().click(); });
    await r.click('Add Jordan free');
    expect(mockCalls[0][0]).toMatchObject({ free: true });
    await r.unmount();
  });
});

test('the title and the summary', async () => {
  const r = await mount({ sessionId: 's2' });
  expect(r.title()).toBe('Add Jordan to this session?');
  expect(r.text()).toContain('Jordan Whitfield · Tue Nov 17, 4:00 PM · Training block');
  expect(r.labels()).toEqual(['Add Jordan', 'Back']);
  await r.unmount();
});

test('a full session asks first, and the first call carries allowFull', async () => {
  mockSession = { ...S2, booked: 12 };
  const r = await mount({ sessionId: 's2' });
  expect(r.title()).toBe('This session is full (12 of 12) - add anyway?');
  await r.click('Add anyway');
  expect(mockCalls[0][0]).toEqual({ athleteId: 'jordan', sessionId: 's2', free: false, allowFull: true });
  expect(mockCalls[0][1]).toEqual({ first: 'Jordan' });
  await r.unmount();
});

test('a full refusal turns into the question', async () => {
  mockBook = async () => { throw refusal('full', 'That session is full (13 of 12).', { taken: 13, capacity: 12 }); };
  const r = await mount({ sessionId: 's2' });
  await r.click('Add Jordan');
  expect(r.title()).toBe('This session is full (13 of 12) - add anyway?');
  mockBook = async () => ({ bookingId: 'jordan_s2', comp: false, chargedFrom: 'period', booked: 14, capacity: 12, overrides: ['full'] });
  await r.click('Add anyway');
  expect(mockCalls.map((c) => c[0].allowFull)).toEqual([false, true]);
  expect(r.calls.done).toEqual(['Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used. The session now has 14 of 12.']);
  await r.unmount();
});

test('warnings show', async () => {
  mockSession = { ...S2, date: '2027-01-05' };
  const window = await mount({ sessionId: 's2' });
  expect(window.text()).toContain("Past Jordan's booking window - families can book through Dec 31.");
  await window.unmount();
  mockSession = { ...S2, date: '2026-11-12', time: '11:00 AM' };
  const started = await mount({ sessionId: 's2' });
  expect(started.text()).toContain('This session has already started.');
  await started.unmount();
  mockSession = { ...S2, booked: 12 };
  mockWaiting = 2;
  mockModel = model({ waitlist: [{ id: 's2_jordan', sessionId: 's2', athleteId: 'jordan', periodKey: '2026-11-01' }] });
  const waiting = await mount({ sessionId: 's2' });
  expect(waiting.text()).toContain("Jordan is on this session's waitlist - adding takes Jordan off it.");
  expect(waiting.text()).toContain('2 on the waitlist for this session.');
  await waiting.unmount();
  mockSession = S2;
  const room = await mount({ sessionId: 's2' });
  expect(room.text()).not.toContain('on the waitlist for this session');
  await room.unmount();
});

test('one call per tap', async () => {
  let release;
  mockBook = () => new Promise((resolve) => { release = resolve; });
  const r = await mount({ sessionId: 's2' });
  const button = r.button('Add Jordan');
  await act(async () => { button.click(); button.click(); });
  expect(mockCalls).toHaveLength(1);
  expect(r.button('Adding...')).not.toBeNull();
  await act(async () => { r.button('Adding...').click(); });
  expect(mockCalls).toHaveLength(1);
  await act(async () => { release({ bookingId: 'jordan_s2', comp: false, chargedFrom: 'period', booked: 4, capacity: 12 }); });
  expect(r.calls.done).toEqual(['Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used.']);
  await r.unmount();
});

test('no answer', async () => {
  mockBook = async () => { throw refusal(null, "We couldn't confirm the change. Check the list before trying again."); };
  const r = await mount({ sessionId: 's2' });
  await r.click('Add Jordan');
  expect(r.calls.done).toEqual(["We couldn't confirm the change. Check the list before trying again."]);
  await r.unmount();
});

test('success lines', async () => {
  const r = await mount({ sessionId: 's2' });
  await r.click('Add Jordan');
  expect(r.calls.done).toEqual(['Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used.']);
  // The caller closes the sheet; until then it stays busy, so nothing adds twice.
  expect(r.button('Adding...').disabled).toBe(true);
  await r.unmount();
  const free = await mount({ sessionId: 's2' });
  await act(async () => { free.toggle().click(); });
  await free.click('Add Jordan free');
  expect(free.calls.done).toEqual(['Jordan is booked for Tue Nov 17, 4:00 PM, free.']);
  await free.unmount();
  mockBook = async () => ({ bookingId: 'jordan_s2', comp: false, chargedFrom: 'period', booked: 13, capacity: 12 });
  mockSession = { ...S2, booked: 12 };
  const over = await mount({ sessionId: 's2' });
  await over.click('Add anyway');
  expect(over.calls.done).toEqual(['Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used. The session now has 13 of 12.']);
  await over.unmount();
});

describe('refusals', () => {
  const HIDDEN = 'That session is hidden from the schedule. Show it first, then add.';

  test('a refusal about the session goes back to the picker', async () => {
    mockBook = async () => { throw refusal('session-hidden', HIDDEN); };
    const r = await mount();
    await r.pick('s2');
    await r.click('Add Jordan');
    expect(r.container.querySelector('input[type="date"]')).not.toBeNull();
    expect(r.container.querySelector('[role="status"]').textContent).toBe(`${HIDDEN} Nothing was changed.`);
    await r.unmount();
  });

  test('with a fixed session it ends with that line and Close', async () => {
    mockBook = async () => { throw refusal('session-hidden', HIDDEN); };
    const r = await mount({ sessionId: 's2' });
    await r.click('Add Jordan');
    expect(r.text()).toContain(`${HIDDEN} Nothing was changed.`);
    expect(r.labels()).toEqual(['Close']);
    await r.click('Close');
    expect(r.calls.closed).toBe(1);
    await r.unmount();
  });

  test('a refusal about the athlete ends the sheet', async () => {
    mockBook = async () => { throw refusal('test-athlete', "Jordan is a test athlete and can't be booked onto real sessions."); };
    const r = await mount();
    await r.pick('s2');
    await r.click('Add Jordan');
    expect(r.text()).toContain("Jordan is a test athlete and can't be booked onto real sessions.");
    expect(r.labels()).toEqual(['Close']);
    await r.unmount();
  });

  test('not paid turns the sheet to Free only', async () => {
    mockBook = async () => { throw refusal('not-paid', "Jordan isn't paid up - switch on Free."); };
    const r = await mount({ sessionId: 's2' });
    await r.click('Add Jordan');
    expect(r.text()).toContain("Jordan isn't paid up, so this booking is Free.");
    expect(r.text()).toContain("Jordan isn't paid up - switch on Free.");
    expect(r.toggle().getAttribute('aria-checked')).toBe('true');
    await r.click('Add Jordan free');
    expect(mockCalls[1][0]).toMatchObject({ free: true });
    await r.unmount();
  });

  test('a no-tokens refusal on a next-period session', async () => {
    mockBook = async () => { throw refusal('no-tokens-left', 'x'); };
    mockSession = { ...S2, id: 's9', date: '2026-12-03' };
    const r = await mount({ sessionId: 's9' });
    await r.click('Add Jordan');
    expect(r.text()).toContain('Jordan has no tokens left for next period. Switch on Free to add anyway.');
    expect(r.button('Add Jordan free').disabled).toBe(true);
    await r.unmount();
  });
});

test('Back from the confirm returns to the picker; Back with a fixed session closes', async () => {
  const r = await mount();
  await r.pick('s2');
  expect(r.title()).toBe('Add Jordan to this session?');
  await r.click('Back');
  expect(r.container.querySelector('input[type="date"]')).not.toBeNull();
  expect(r.calls.closed).toBe(0);
  await r.unmount();
  const fixed = await mount({ sessionId: 's2' });
  await fixed.click('Back');
  expect(fixed.calls.closed).toBe(1);
  await fixed.unmount();
});

test('Back and a refusal about the session reopen the picker on the day picked', async () => {
  // Walkthrough 2026-11-13: the picker went back to today each time, so
  // staff had to find the day again.
  mockDay = [{ ...S2, date: '2026-11-20' }];
  const r = await mount();
  const day = () => r.container.querySelector('input[type="date"]').value;
  expect(day()).toBe('2026-11-12');
  await r.fill('Day', '2026-11-20');
  await r.pick('s2');
  await r.click('Back');
  expect(day()).toBe('2026-11-20');
  mockBook = async () => { throw refusal('session-cancelled', 'The academy cancelled that session.'); };
  await r.pick('s2');
  await r.click('Add Jordan');
  expect(r.container.querySelector('[role="status"]').textContent).toBe('The academy cancelled that session. Nothing was changed.');
  expect(day()).toBe('2026-11-20');
  await r.unmount();
});

test('Close on the pick step', async () => {
  const r = await mount();
  expect(r.container.querySelector('input[type="date"]')).not.toBeNull();
  const close = r.button('Close');
  expect(parseFloat(close.style.height)).toBeGreaterThanOrEqual(44);
  await r.click('Close');
  expect(r.calls.closed).toBe(1);
  await r.unmount();
});

test('a session handed over is used as it is', async () => {
  mockSession = null;
  const r = await mount({ session: { ...S2, id: 's7', date: '2026-11-19', time: '5:00 PM' } });
  expect(r.text()).toContain('Jordan Whitfield · Thu Nov 19, 5:00 PM · Training block');
  await r.click('Add Jordan');
  expect(mockCalls[0][0].sessionId).toBe('s7');
  await r.unmount();
});
