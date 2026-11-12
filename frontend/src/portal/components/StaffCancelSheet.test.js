/**
 * The staff cancel sheet (owner approved 2026-11-12): the family's reasons,
 * the session restated, brothers and sisters on the same session as ticks
 * left unticked, a confirm that says whether tokens come back, and one call
 * with every chosen booking. Plain functions in the mock, not jest.fn():
 * CRA's resetMocks would clear them before every test.
 */
jest.mock('../hooks/staffCancel', () => ({
  staffCancelBookings: (args) => {
    mockCalls.push(args);
    return mockAnswer(args);
  },
}));

import React from 'react';
import StaffCancelSheet from './StaffCancelSheet';
import { renderScreen } from '../screens/testRender';
import { ALREADY_CHANGED_COPY } from '../data/bookingChanges';

let mockCalls;
let mockAnswer;

// 2 PM Thu Nov 12 in Chicago.
const NOW = new Date('2026-11-12T20:00:00Z');
const row = (over = {}) => ({
  id: 'jordan_s1', kind: 'booking', athleteId: 'jordan', sessionId: 's1', date: '2026-11-10', time: '4:00 PM',
  label: 'Training block', status: 'noshow', source: null, chargedFrom: 'period', comp: false, graceTokenId: null, ...over,
});
const member = (athleteId, name, spent) => ({ athleteId, name, spent, reserved: [], period: { start: '2026-11-01' } });
const JORDAN = member('jordan', 'Jordan Whitfield', [row()]);
const RILEY = member('riley', 'Riley Whitfield', [row({ id: 'riley_s1', athleteId: 'riley', status: 'confirmed' })]);
const CASEY = member('casey', 'Casey Whitfield', [row({ id: 'casey_s1', athleteId: 'casey' })]);

beforeEach(() => {
  mockCalls = [];
  mockAnswer = ({ bookingIds }) => Promise.resolve({ sessionId: 's1', cancelled: bookingIds.map((bookingId) => ({ bookingId, tokenBack: true })) });
});

async function mount(props = {}) {
  const calls = { close: 0, cancelled: [] };
  const r = await renderScreen(
    <StaffCancelSheet
      row={JORDAN.spent[0]}
      member={JORDAN}
      members={[JORDAN, RILEY, CASEY]}
      now={NOW}
      onClose={() => { calls.close += 1; }}
      onCancelled={(line) => { calls.cancelled.push(line); }}
      {...props}
    />
  );
  return { ...r, calls };
}

const ticks = (r) => [...r.container.querySelectorAll('[role="checkbox"]')];

test('restates the session and asks why with the past tense once it has passed', async () => {
  const r = await mount();
  expect(r.text()).toContain('Jordan Whitfield · Tue Nov 10, 4:00 PM · Training block · No-show');
  expect(r.text()).toContain("Why couldn't Jordan make it?");
  await r.unmount();
});

test('an upcoming session asks the families\' question', async () => {
  const later = row({ date: '2026-11-17', status: 'confirmed' });
  const r = await mount({ row: later, member: { ...JORDAN, spent: [later] } });
  expect(r.text()).toContain("Why can't Jordan make it?");
  expect(r.text()).toContain('Booked');
  await r.unmount();
});

test('brothers and sisters on the same session are listed unticked, with their status', async () => {
  const r = await mount();
  expect(r.text()).toContain('Also cancel for');
  expect(ticks(r).map((t) => [t.textContent.trim(), t.getAttribute('aria-checked')])).toEqual([
    ['Riley · Booked', 'false'],
    ['Casey · No-show', 'false'],
  ]);
  await r.unmount();
});

test('the ticks sit in a group named "Also cancel for"', async () => {
  const r = await mount();
  const group = [...r.container.querySelectorAll('[role="group"]')].find((g) => g.hasAttribute('aria-labelledby'));
  const heading = group.querySelector(`[id="${group.getAttribute('aria-labelledby')}"]`);
  expect(heading.textContent).toBe('Also cancel for');
  expect(group.querySelectorAll('[role="checkbox"]')).toHaveLength(2);
  await r.unmount();
});

test('no sibling block when nobody else is on the session', async () => {
  const r = await mount({ members: [JORDAN] });
  expect(r.text()).not.toContain('Also cancel for');
  expect(ticks(r)).toEqual([]);
  await r.unmount();
});

test('nothing is sent until a reason is picked; then only the tapped booking', async () => {
  const r = await mount();
  await r.click('Cancel and give the token back');
  expect(mockCalls).toEqual([]);
  await r.click('Sick');
  await r.click('Cancel and give the token back');
  expect(mockCalls).toEqual([{ bookingIds: ['jordan_s1'], reason: { category: 'sick', note: null } }]);
  expect(r.calls.cancelled).toEqual(['Cancelled · Sick - token back for Jordan.']);
  await r.unmount();
});

test('ticking siblings adds their bookings and the label goes plural', async () => {
  const r = await mount();
  await r.click('Riley · Booked');
  await r.click('Casey · No-show');
  expect(ticks(r).map((t) => t.getAttribute('aria-checked'))).toEqual(['true', 'true']);
  await r.click('Sick');
  await r.click('Cancel and give the tokens back');
  expect(mockCalls).toEqual([{ bookingIds: ['jordan_s1', 'riley_s1', 'casey_s1'], reason: { category: 'sick', note: null } }]);
  expect(r.calls.cancelled).toEqual(['Cancelled · Sick - tokens back for Jordan, Riley and Casey.']);
  await r.unmount();
});

test('a tick can be taken back', async () => {
  const r = await mount();
  await r.click('Riley · Booked');
  await r.click('Riley · Booked');
  await r.click('School');
  await r.click('Cancel and give the token back');
  expect(mockCalls[0].bookingIds).toEqual(['jordan_s1']);
  await r.unmount();
});

test('a free comp or Elite gives nothing back: "Cancel session", and the line names no token', async () => {
  mockAnswer = ({ bookingIds }) => Promise.resolve({ sessionId: 's1', cancelled: bookingIds.map((bookingId) => ({ bookingId, tokenBack: false })) });
  const comp = row({ comp: true });
  const r = await mount({ row: comp, member: { ...JORDAN, spent: [comp] }, members: [JORDAN] });
  expect(r.button('Cancel session')).not.toBeNull();
  await r.click('Sick');
  await r.click('Cancel session');
  expect(r.calls.cancelled).toEqual(['Cancelled · Sick.']);
  await r.unmount();
  const elite = row({ chargedFrom: 'elite' });
  const e = await mount({ row: elite, member: { ...JORDAN, spent: [elite] }, members: [JORDAN] });
  expect(e.button('Cancel session')).not.toBeNull();
  expect(e.text()).not.toMatch(/token/i);
  await e.unmount();
});

test('Other sends its note and the line carries it', async () => {
  const r = await mount();
  await r.click('Other');
  await r.click('Cancel and give the token back');
  expect(mockCalls).toEqual([]);
  await r.fill('A few words', 'dentist');
  await r.click('Cancel and give the token back');
  expect(mockCalls[0].reason).toEqual({ category: 'other', note: 'dentist' });
  expect(r.calls.cancelled).toEqual(['Cancelled · Other: dentist - token back for Jordan.']);
  await r.unmount();
});

test('a refusal stays on the sheet with its words; nothing closes', async () => {
  mockAnswer = () => Promise.reject(Object.assign(new Error(ALREADY_CHANGED_COPY), { reason: 'already-cancelled' }));
  const r = await mount();
  await r.click('Sick');
  await r.click('Cancel and give the token back');
  expect(r.text()).toContain(ALREADY_CHANGED_COPY);
  expect(r.calls.cancelled).toEqual([]);
  expect(r.calls.close).toBe(0);
  await r.unmount();
});

test('one call per tap: busy while it runs, ticks and reasons frozen', async () => {
  let finish;
  mockAnswer = () => new Promise((resolve) => { finish = resolve; });
  const r = await mount();
  await r.click('Sick');
  await r.click('Cancel and give the token back');
  const busy = r.button('Cancelling');
  expect(busy).not.toBeNull();
  expect(busy.disabled).toBe(true);
  expect(ticks(r).every((t) => t.disabled)).toBe(true);
  expect(r.button('Sick').disabled).toBe(true);
  await r.act(async () => { busy.click(); });
  expect(mockCalls).toHaveLength(1);
  await r.act(async () => { finish({ sessionId: 's1', cancelled: [{ bookingId: 'jordan_s1', tokenBack: true }] }); });
  expect(r.calls.cancelled).toHaveLength(1);
  await r.unmount();
});

test('Keep it closes and sends nothing', async () => {
  const r = await mount();
  await r.click('Sick');
  await r.click('Keep it');
  expect(r.calls.close).toBe(1);
  expect(mockCalls).toEqual([]);
  await r.unmount();
});

test('every tap target is at least 44px tall', async () => {
  const r = await mount();
  for (const t of ticks(r)) expect(parseInt(t.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
  await r.unmount();
});
