/**
 * The staff move sheet (Task C7, spec 01-spec-admin-booking.md 10.5): the
 * picker lists the same kind only, never the booking's own session; the
 * confirm asks "Move Jordan from ... to ...?" (or the full question), says
 * what happens to the token, shows the warnings of an add, and moves once
 * per tap. Every fact leaves the row being moved out, as the server does.
 * NOW is noon Chicago, Thu Nov 12. Plain functions, not jest.fn().
 */
jest.mock('../../hooks/staffBooking', () => ({
  useStaffAthlete: () => ({ data: mockModel, loading: false, error: null }),
  useStaffDaySessions: () => ({ data: mockDay, loading: false, error: null }),
  staffMoveBooking: (args, opts) => {
    mockCalls.push([args, opts]);
    return mockMove(args);
  },
}));

import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import StaffMoveSheet from './StaffMoveSheet';
import { staffAthleteModel } from '../../data/staffAthlete';
import { ELITE, packageById } from '../../data/packages';

const NOW = new Date('2026-11-12T18:00:00Z');
let mockModel;
let mockDay;
let mockCalls;
let mockMove;

const JORDAN = { id: 'jordan', name: 'Jordan Whitfield', householdId: 'hh1', packageId: 't-6', handicap: 4 };
const tokens = (over = {}) => ({ granted: 6, used: 1, reserved: 0, grace: [], left: 5, unlimited: false, perPurchase: false, held: 0, nextPeriod: null, ...over });
const BOOKING = { id: 'jordan_s2', athleteId: 'jordan', householdId: 'hh1', sessionId: 's2', status: 'confirmed', date: '2026-11-17', type: 'training', periodKey: '2026-11-01', chargedFrom: 'period' };
const model = (over = {}) => staffAthleteModel({
  athlete: JORDAN, household: { id: 'hh1', name: 'Whitfield family', periodAnchorDay: 1 }, pkg: packageById('t-6'),
  bookings: [BOOKING], waitlist: [], graceTokens: [], sessionsById: {}, tokens: tokens(), today: '2026-11-12', ...over,
});
// A billing hub row.
const ROW = {
  id: 'jordan_s2', kind: 'booking', athleteId: 'jordan', sessionId: 's2', date: '2026-11-17', time: '4:00 PM', type: 'training',
  label: 'Training block', status: 'confirmed', source: null, chargedFrom: 'period', comp: false, graceTokenId: null, viaGrace: false, viaSingle: false, viaComp: false,
};
const sess = (id, over = {}) => ({ id, date: '2026-11-19', time: '4:00 PM', type: 'training', capacity: 12, booked: 3, ...over });
const refusal = (reason, message, details) => Object.assign(new Error(message), { reason, details: details ?? null });

beforeEach(() => {
  mockModel = model();
  mockDay = [sess('s2', { date: '2026-11-17' }), sess('s4'), sess('t4', { type: 'tournament', time: '10:30 AM' })];
  mockCalls = [];
  mockMove = async (args) => ({ bookingId: `jordan_${args.toSessionId}`, movedFrom: args.bookingId, sessionId: args.toSessionId, overrides: [] });
});

async function mount(props = {}) {
  const calls = { done: [], closed: 0 };
  const r = await renderScreen(
    <StaffMoveSheet row={ROW} name="Jordan Whitfield" onClose={() => { calls.closed += 1; }} onDone={(line) => calls.done.push(line)} now={NOW} {...props} />
  );
  const title = () => r.container.querySelector('[role="dialog"]').getAttribute('aria-label');
  const cards = () => [...r.container.querySelectorAll('[data-staff-session]')].map((c) => c.getAttribute('data-staff-session'));
  const pick = async (id) => act(async () => { r.container.querySelector(`[data-staff-session="${id}"]`).click(); });
  const labels = () => [...r.container.querySelectorAll('button')].map((b) => b.textContent.trim());
  return { ...r, calls, title, cards, pick, labels };
}

test('the title names the athlete and the kind', async () => {
  for (const [type, title] of [
    ['training', 'Move Jordan to another Training block'],
    ['tournament', 'Move Jordan to another Tour event'],
    ['phil', 'Move Jordan to another Phil session'],
  ]) {
    const r = await mount({ row: { ...ROW, type } });
    expect(r.title()).toBe(title);
    expect(r.text()).toContain(title);
    await r.unmount();
  }
});

test('the picker shows the same kind only, never the booking own session; Close closes', async () => {
  const r = await mount();
  expect(r.cards()).toEqual(['s4']);
  await r.click('Close');
  expect(r.calls.closed).toBe(1);
  await r.unmount();
});

test('the question, then one move with the success line', async () => {
  const r = await mount();
  await r.pick('s4');
  expect(r.text()).toContain('Move Jordan from Tue Nov 17, 4:00 PM to Thu Nov 19, 4:00 PM?');
  expect(r.labels()).toEqual(['Move', 'Keep it']);
  await r.click('Move');
  expect(mockCalls).toEqual([[{ bookingId: 'jordan_s2', toSessionId: 's4', allowFull: false }, { first: 'Jordan' }]]);
  expect(r.calls.done).toEqual(['Jordan moved to Thu Nov 19, 4:00 PM.']);
  await r.unmount();
});

test('a full session asks, reads Move anyway, and the call carries allowFull', async () => {
  mockDay = [sess('s4', { booked: 12 })];
  const r = await mount();
  await r.pick('s4');
  expect(r.text()).toContain('Thu Nov 19, 4:00 PM is full (12 of 12) - move Jordan anyway?');
  await r.click('Move anyway');
  expect(mockCalls[0][0]).toEqual({ bookingId: 'jordan_s2', toSessionId: 's4', allowFull: true });
  await r.unmount();
});

test('a full refusal turns into the question with the count', async () => {
  mockMove = async () => { throw refusal('full', 'That session is full (12 of 12).', { taken: 12, capacity: 12 }); };
  const r = await mount();
  await r.pick('s4');
  await r.click('Move');
  expect(r.text()).toContain('Thu Nov 19, 4:00 PM is full (12 of 12) - move Jordan anyway?');
  await r.click('Move anyway');
  expect(mockCalls.map((c) => c[0].allowFull)).toEqual([false, true]);
  await r.unmount();
});

test('what happens to the token', async () => {
  const carry = await mount();
  await carry.pick('s4');
  expect(carry.text()).toContain('The token moves with it.');
  await carry.unmount();

  mockDay = [sess('s9', { date: '2026-12-03' })];
  const swap = await mount();
  await swap.pick('s9');
  expect(swap.text()).toContain('Uses a December token; the November one comes back.');
  await swap.unmount();

  mockDay = [sess('s4')];
  const comp = await mount({ row: { ...ROW, comp: true, viaComp: true } });
  await comp.pick('s4');
  expect(comp.text()).toContain('Stays free.');
  await comp.unmount();

  mockModel = model({ pkg: ELITE, tokens: tokens({ unlimited: true, granted: null, left: null }) });
  const elite = await mount({ row: { ...ROW, chargedFrom: 'elite' } });
  await elite.pick('s4');
  for (const line of ['The token moves with it.', 'comes back', 'Stays free.']) expect(elite.text()).not.toContain(line);
  await elite.unmount();
});

test('Moving... while busy, with one call', async () => {
  let release;
  mockMove = () => new Promise((resolve) => { release = resolve; });
  const r = await mount();
  await r.pick('s4');
  const button = r.button('Move');
  await act(async () => { button.click(); button.click(); });
  expect(mockCalls).toHaveLength(1);
  expect(r.button('Moving...')).not.toBeNull();
  await act(async () => { release({ bookingId: 'jordan_s4', movedFrom: 'jordan_s2', sessionId: 's4', overrides: [] }); });
  expect(r.calls.done).toEqual(['Jordan moved to Thu Nov 19, 4:00 PM.']);
  await r.unmount();
});

describe('refusals', () => {
  const ends = [
    ['membership-inactive', "Jordan's membership isn't active, so a paid booking can't move. Cancel it and add Free instead."],
    ['no-tokens-left', 'Jordan has no tokens left for that period. Cancel it and add Free instead.'],
    ['attended', "This booking is marked attended, so it can't move."],
  ];
  test.each(ends)('%s ends with its line and Close', async (reason, line) => {
    mockMove = async () => { throw refusal(reason, line); };
    const r = await mount();
    await r.pick('s4');
    await r.click('Move');
    expect(r.text()).toContain(line);
    expect(r.labels()).toEqual(['Close']);
    await r.click('Close');
    expect(r.calls.closed).toBe(1);
    await r.unmount();
  });

  test('a refusal about the new session goes back to the picker', async () => {
    mockMove = async () => { throw refusal('session-cancelled', 'The academy cancelled that session.'); };
    const r = await mount();
    await r.pick('s4');
    await r.click('Move');
    expect(r.container.querySelector('[role="status"]').textContent).toBe('The academy cancelled that session. Nothing was changed.');
    expect(r.cards()).toEqual(['s4']);
    await r.unmount();
  });

  test('that refusal reopens the picker on the day picked, not today', async () => {
    // Walkthrough 2026-11-13: it went back to today.
    mockMove = async () => { throw refusal('session-hidden', 'That session is hidden from the schedule. Show it first, then move.'); };
    const r = await mount();
    const day = () => r.container.querySelector('input[type="date"]').value;
    expect(day()).toBe('2026-11-12');
    await r.fill('Day', '2026-11-19');
    await r.pick('s4');
    await r.click('Move');
    expect(r.container.querySelector('[role="status"]')).not.toBeNull();
    expect(day()).toBe('2026-11-19');
    await r.unmount();
  });

  test('no answer hands over the unconfirmed line', async () => {
    mockMove = async () => { throw refusal(null, "We couldn't confirm the change. Check the list before trying again."); };
    const r = await mount();
    await r.pick('s4');
    await r.click('Move');
    expect(r.calls.done).toEqual(["We couldn't confirm the change. Check the list before trying again."]);
    await r.unmount();
  });
});

test('Keep it closes the sheet', async () => {
  const r = await mount();
  await r.pick('s4');
  await r.click('Keep it');
  expect(r.calls.closed).toBe(1);
  expect(mockCalls).toEqual([]);
  await r.unmount();
});

test('an Elite row moved to a later block the same day shows no one-a-day line', async () => {
  const eliteBooking = { ...BOOKING, chargedFrom: 'elite' };
  mockModel = model({ pkg: ELITE, tokens: tokens({ unlimited: true, granted: null, left: null }), bookings: [eliteBooking] });
  mockDay = [sess('s6', { date: '2026-11-17', time: '6:00 PM' })];
  const r = await mount({ row: { ...ROW, chargedFrom: 'elite' } });
  await r.pick('s6');
  expect(r.text()).toContain('Move Jordan from Tue Nov 17, 4:00 PM to Tue Nov 17, 6:00 PM?');
  expect(r.text()).not.toContain('Elite includes one a day');
  await r.unmount();
});

test('the warnings of an add show', async () => {
  mockDay = [sess('s8', { date: '2027-01-05' })];
  const r = await mount();
  await r.pick('s8');
  expect(r.text()).toContain("Past Jordan's booking window - families can book through Dec 31.");
  await r.unmount();
});
