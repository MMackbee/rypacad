/**
 * The staff day and session picker (Task C5, spec 01-spec-admin-booking.md
 * 10.5): a date input from the athlete's period start to the season's end,
 * today by default, with Previous and Next; that day's sessions with seats
 * first, then full ones, each by start time; the Started, Reserved and
 * Waitlisted tags; a session the athlete holds reads Booked and cannot be
 * tapped; Move lists the same kind only, never the booking's own session.
 * NOW is noon Chicago, Thu Nov 12. Plain functions, not jest.fn().
 */
jest.mock('../../hooks/staffBooking', () => ({
  useStaffDaySessions: (day, reloadKey = 0) => {
    mockAsked.push([day, reloadKey]);
    return mockResult(day);
  },
}));

import React, { act } from 'react';
import { renderScreen } from '../../screens/testRender';
import StaffSessionPicker from './StaffSessionPicker';
import { staffAthleteModel } from '../../data/staffAthlete';
import { packageById } from '../../data/packages';

const NOW = new Date('2026-11-12T18:00:00Z');
let mockAsked;
let mockResult;

const s = (id, over = {}) => ({ id, date: '2026-11-17', time: '4:00 PM', type: 'training', capacity: 12, booked: 3, ...over });
const model = (over = {}) => staffAthleteModel({
  athlete: { id: 'jordan', name: 'Jordan Whitfield', householdId: 'hh1', packageId: 't-6', handicap: 9 },
  household: { id: 'hh1', name: 'Whitfield family', periodAnchorDay: 1 },
  pkg: packageById('t-6'),
  bookings: [],
  waitlist: [],
  graceTokens: [],
  sessionsById: {},
  tokens: { granted: 6, used: 0, reserved: 0, grace: [], left: 6, unlimited: false, perPurchase: false, held: 0, nextPeriod: null },
  today: '2026-11-12',
  ...over,
});

beforeEach(() => {
  mockAsked = [];
  mockResult = () => ({ data: [], loading: false, error: null });
});

async function mount(props = {}) {
  const picked = [];
  const r = await renderScreen(<StaffSessionPicker model={model()} onPick={(x) => picked.push(x.id)} now={NOW} {...props} />);
  const day = () => r.container.querySelector('input[type="date"]');
  const cards = () => [...r.container.querySelectorAll('[data-staff-session]')];
  return { ...r, picked, day, cards };
}

test('the day: today by default, bounded by the period start and the season end', async () => {
  const r = await mount();
  expect(r.day().getAttribute('aria-label')).toBe('Day');
  expect(r.day().value).toBe('2026-11-12');
  expect(r.day().getAttribute('min')).toBe('2026-11-01');
  expect(r.day().getAttribute('max')).toBe('2027-02-27');
  expect(parseFloat(r.day().style.minHeight)).toBeGreaterThanOrEqual(44);
  expect(mockAsked[mockAsked.length - 1]).toEqual(['2026-11-12', 0]);
  await r.fill('Day', '2026-11-01');
  expect(r.button('‹ Previous day').disabled).toBe(true);
  expect(r.button('Next day ›').disabled).toBe(false);
  await r.fill('Day', '2027-02-27');
  expect(r.button('Next day ›').disabled).toBe(true);
  for (const label of ['‹ Previous day', 'Next day ›']) expect(parseFloat(r.button(label).style.height)).toBeGreaterThanOrEqual(44);
  await r.unmount();
});

test('initialDay: the sheet reopens the picker on the day staff picked, held to the bounds', async () => {
  const r = await mount({ initialDay: '2026-11-20' });
  expect(r.day().value).toBe('2026-11-20');
  expect(mockAsked[0]).toEqual(['2026-11-20', 0]);
  await r.unmount();
  const early = await mount({ initialDay: '2026-10-20' });
  expect(early.day().value).toBe('2026-11-01');
  await early.unmount();
  const none = await mount({ initialDay: null });
  expect(none.day().value).toBe('2026-11-12');
  await none.unmount();
});

test('Previous and Next move one day; a day outside the bounds is held to them', async () => {
  const r = await mount();
  await r.click('Next day ›');
  expect(r.day().value).toBe('2026-11-13');
  await r.click('‹ Previous day');
  await r.click('‹ Previous day');
  expect(r.day().value).toBe('2026-11-11');
  expect(mockAsked.map((a) => a[0])).toEqual(expect.arrayContaining(['2026-11-13', '2026-11-11']));
  await r.fill('Day', '2026-10-20');
  expect(r.day().value).toBe('2026-11-01');
  await r.unmount();
  const late = await mount({ now: new Date('2027-03-10T18:00:00Z'), model: model({ today: '2027-02-20' }) });
  expect(late.day().value).toBe('2027-02-27');
  await late.unmount();
});

test('seats left first, then full; each by start time', async () => {
  mockResult = () => ({
    data: [s('full3', { time: '3:00 PM', booked: 12 }), s('room5', { time: '5:00 PM', booked: 3 }), s('room4', { time: '4:00 PM', booked: 11 })],
    loading: false,
    error: null,
  });
  const r = await mount();
  expect(r.cards().map((c) => c.getAttribute('data-staff-session'))).toEqual(['room4', 'room5', 'full3']);
  const [room4, room5, full3] = r.cards();
  expect(room4.textContent).toContain('1 left');
  expect(room5.textContent).toContain('9 left');
  expect(full3.textContent).toContain('Full · 12 of 12');
  expect(room5.textContent).toContain('5:00');
  expect(room5.textContent).toContain('PM');
  expect(room5.textContent).toContain('Training block');
  await act(async () => { full3.click(); });
  expect(r.picked).toEqual(['full3']);
  await r.unmount();
});

test('tags: Started, Reserved, Waitlisted', async () => {
  mockResult = () => ({
    data: [
      s('started', { date: '2026-11-12', time: '11:00 AM' }),
      s('reserved', { date: '2026-11-12', time: '3:00 PM', maxHandicap: 5 }),
      s('waiting', { date: '2026-11-12', time: '5:00 PM' }),
    ],
    loading: false,
    error: null,
  });
  const r = await mount({ model: model({ waitlist: [{ id: 'waiting_jordan', sessionId: 'waiting', athleteId: 'jordan', periodKey: '2026-11-01' }] }) });
  const [started, reserved, waiting] = r.cards();
  expect(started.textContent).toContain('Started');
  expect(reserved.textContent).toContain('Reserved 5 or better');
  expect(waiting.textContent).toContain('Waitlisted');
  expect(waiting.textContent).not.toContain('Started');
  await r.unmount();
});

test('a session the athlete holds reads Booked and cannot be tapped', async () => {
  mockResult = () => ({ data: [s('s2'), s('s3', { time: '5:00 PM' })], loading: false, error: null });
  const held = model({ bookings: [{ id: 'jordan_s2', athleteId: 'jordan', sessionId: 's2', status: 'confirmed', date: '2026-11-17', type: 'training', periodKey: '2026-11-01' }] });
  const r = await mount({ model: held });
  const [booked] = r.cards();
  expect(booked.getAttribute('data-staff-session')).toBe('s2');
  expect(booked.textContent).toContain('Booked');
  expect(booked.getAttribute('role')).toBeNull();
  await act(async () => { booked.click(); });
  expect(r.picked).toEqual([]);
  await act(async () => { r.cards()[1].click(); });
  expect(r.picked).toEqual(['s3']);
  await r.unmount();
});

test('a session staff may not add to is left out', async () => {
  mockResult = () => ({ data: [s('ok'), s('cal', { source: 'calendly' }), s('held', { unresolved: true })], loading: false, error: null });
  const r = await mount();
  expect(r.cards().map((c) => c.getAttribute('data-staff-session'))).toEqual(['ok']);
  await r.unmount();
});

test('move lists the same type only, never its own session', async () => {
  mockResult = () => ({
    data: [s('s1'), s('s2', { time: '5:00 PM' }), s('t1', { type: 'tournament', time: '10:30 AM' }), s('p1', { type: 'phil', time: '3:00 PM' })],
    loading: false,
    error: null,
  });
  const r = await mount({ mode: 'move', fromRow: { id: 'jordan_s1', sessionId: 's1', type: 'training' } });
  expect(r.cards().map((c) => c.getAttribute('data-staff-session'))).toEqual(['s2']);
  await r.unmount();
});

test('the empty, loading and failure lines; a notice above the list; reloadKey reaches the read', async () => {
  const r = await mount({ notice: 'The academy cancelled that session. Nothing was changed.', reloadKey: 2 });
  expect(r.text()).toContain('No sessions to book on Thu Nov 12.');
  const status = r.container.querySelector('[role="status"]');
  expect(status.textContent).toBe('The academy cancelled that session. Nothing was changed.');
  expect(mockAsked[mockAsked.length - 1]).toEqual(['2026-11-12', 2]);
  await r.unmount();
  mockResult = () => ({ data: null, loading: true, error: null });
  const loading = await mount();
  expect(loading.text()).toContain('Finding sessions...');
  await loading.unmount();
  mockResult = () => ({ data: null, loading: false, error: new Error('offline') });
  const failed = await mount();
  expect(failed.text()).toContain("Sessions didn't load. Check your connection and try again.");
  await failed.unmount();
});
