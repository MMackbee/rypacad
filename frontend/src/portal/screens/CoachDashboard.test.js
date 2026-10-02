import React, { act } from 'react';
import { renderScreen } from './testRender';
import CoachDashboard from './CoachDashboard';

const session = { id: 'nov5-4pm', date: '2026-11-05', time: '4:00 PM', type: 'training', name: 'Training block', capacity: 8, booked: 3 };
let mockRequested;
// Nov 5's sessions (one open block unless a test says otherwise), and today's blocks on the Overview.
let mockNov5 = [session];
let mockBlocks = [];
// Month-aware: November has its sessions on Nov 5; every other month is empty.
const mockMonth = (m) => {
  mockRequested.push(m);
  const days = m === '2026-11-01' ? [{ date: '2026-11-05', sessions: mockNov5 }] : [];
  return { data: { days }, loading: false, error: null };
};
let mockAttention = [];
let mockStudents = [];
jest.mock('../hooks', () => ({
  useCoachDay: () => ({ data: { coach: { name: 'Coach', date: '2026-11-04' }, blocks: mockBlocks, attention: mockAttention } }),
  // The real roster hook drops the contract part of meta while the contract is hidden; the mock does the same.
  useCoachRoster: () => ({ data: mockStudents.map((s) => ({ ...s, meta: jest.requireActual('../data/contractFlag').hideContractParts(s.meta) })), loading: false }),
  useMonthSessions: (m) => mockMonth(m),
}));

const KEY = 'ryp.calendarView';
const EXPECTED_ROSTER = {
  sessionId: 'nov5-4pm',
  date: '2026-11-05',
  time: '4:00 PM',
  type: 'training',
  name: 'Training block',
  meta: '3 of 8 booked',
};

const pressed = (r, name) => r.button(name)?.getAttribute('aria-pressed');
/** The nav title sits between the prev and next arrows, in either view. */
const navLabel = (r) => (r.button('Previous week') || r.button('Previous month'))?.nextElementSibling?.textContent ?? null;
const td = (r, iso) => r.container.querySelector(`td[data-date="${iso}"]`);
const pill = (r, iso) => r.container.querySelector(`.ryp-week-view [data-date="${iso}"]`);
const tap = async (el) => { await act(async () => { el.click(); }); };
/** The selected day's session card (SessionCard sets cursor: pointer from onClick). */
const sessionCard = (r) =>
  [...r.container.querySelectorAll('div')].find(
    (el) => el.style.cursor === 'pointer' && el.textContent.startsWith('4:00') && el.textContent.includes('Training block')
  ) || null;

async function openSessions(onOpenRoster) {
  const r = await renderScreen(<CoachDashboard bare onOpenRoster={onOpenRoster} />);
  await r.click('Sessions');
  return r;
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
  mockRequested = [];
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-11-04T15:00:00'));
});
afterEach(() => {
  jest.useRealTimers();
});

test('Month is the default, and a day then a session opens that roster', async () => {
  const onOpenRoster = jest.fn();
  const r = await openSessions(onOpenRoster);
  expect(pressed(r, 'Month')).toBe('true');
  expect(r.container.querySelector('.fc')).not.toBeNull();
  expect(navLabel(r)).toBe('November 2026');
  expect(sessionCard(r)).toBeNull();
  // The tournament / closed legend sits under the coach's grid too.
  expect(r.container.querySelector('.ryp-day-mark-legend').textContent).toContain('Academy closed');
  await tap(td(r, '2026-11-05'));
  await tap(sessionCard(r));
  expect(onOpenRoster).toHaveBeenCalledTimes(1);
  expect(onOpenRoster).toHaveBeenCalledWith(EXPECTED_ROSTER);
  await r.unmount();
});

test('Week: the same day and session open the identical roster payload', async () => {
  const onOpenRoster = jest.fn();
  const r = await openSessions(onOpenRoster);
  await r.click('Week');
  expect(window.localStorage.getItem(KEY)).toBe('week');
  expect(r.container.querySelector('.fc')).toBeNull();
  expect(navLabel(r)).toBe('Nov 2 – 8');
  await r.click('Thursday, Nov 5');
  expect(pill(r, '2026-11-05').getAttribute('aria-pressed')).toBe('true');
  await tap(sessionCard(r));
  expect(onOpenRoster).toHaveBeenCalledTimes(1);
  expect(onOpenRoster).toHaveBeenCalledWith(EXPECTED_ROSTER);
  await r.unmount();
});

test('Week steps through the month and into the next one, the boundary week whole', async () => {
  const r = await openSessions(() => {});
  await r.click('Week');
  await r.click('Thursday, Nov 5');
  expect(sessionCard(r)).not.toBeNull();
  for (let i = 0; i < 4; i++) await r.click('Next week');
  expect(navLabel(r)).toBe('Nov 30 – Dec 6');
  // Stepping clears the selected day, as the month arrows do.
  expect(sessionCard(r)).toBeNull();
  // November's load already covers Nov 30 - Dec 6: no December read yet.
  expect(mockRequested).not.toContain('2026-12-01');
  await r.click('Next week');
  expect(mockRequested).toContain('2026-12-01');
  expect(navLabel(r)).toBe('Dec 7 – 13');
  await r.unmount();
});

test('a week with no sessions shows the week empty copy', async () => {
  const r = await openSessions(() => {});
  expect(r.text()).toContain('Green and yellow days have sessions');
  await r.click('Week');
  expect(r.text()).toContain('Green and yellow days have sessions');
  await r.click('Next week');
  expect(navLabel(r)).toBe('Nov 9 – 15');
  expect(r.text()).toContain('No sessions are scheduled this week.');
  expect(r.text()).not.toContain('Green and yellow days have sessions');
  await r.unmount();
});

test('a stored Week preference opens the Sessions tab in Week', async () => {
  window.localStorage.setItem(KEY, 'week');
  const r = await openSessions(() => {});
  expect(pressed(r, 'Week')).toBe('true');
  expect(r.container.querySelector('.ryp-week-view')).not.toBeNull();
  expect(navLabel(r)).toBe('Nov 2 – 8');
  await r.unmount();
});

test('Needs a conversation drops "Contract behind" while the contract is hidden (owner, 2026-09-30)', async () => {
  mockAttention = [
    { id: 'a1', name: 'M. Okonkwo', meta: '3 no-shows this month', tone: 'red' },
    { id: 'a2', kind: 'contract', name: 'R. Sandoval', meta: 'Contract behind - 7 of 13 days', tone: 'yellow' },
  ];
  try {
    const off = await renderScreen(<CoachDashboard bare />);
    expect(off.text()).toContain('3 no-shows this month');
    expect(off.text()).not.toContain('Contract behind');
    await off.unmount();
    process.env.REACT_APP_CONTRACT_ENABLED = 'true';
    const on = await renderScreen(<CoachDashboard bare />);
    expect(on.text()).toContain('Contract behind - 7 of 13 days');
    await on.unmount();
  } finally {
    mockAttention = [];
    delete process.env.REACT_APP_CONTRACT_ENABLED;
  }
});

test('Students rows drop the contract tier while the contract is hidden', async () => {
  mockStudents = [{ id: 'j', name: 'J. Whitfield', meta: '45 min tier' }, { id: 'a', name: 'A. Nguyen', meta: 'Age 12 · 4th month' }];
  try {
    const off = await renderScreen(<CoachDashboard bare />);
    await off.click('Students');
    expect(off.text()).toContain('J. Whitfield');
    expect(off.text()).toContain('Age 12 · 4th month');
    expect(off.text()).not.toContain('min tier');
    await off.unmount();
    process.env.REACT_APP_CONTRACT_ENABLED = 'true';
    const on = await renderScreen(<CoachDashboard bare />);
    await on.click('Students');
    expect(on.text()).toContain('45 min tier');
    await on.unmount();
  } finally {
    mockStudents = [];
    delete process.env.REACT_APP_CONTRACT_ENABLED;
  }
});

// Owner ruling 2026-10-02: staff see the same tag families do on a handicap-reserved block.
describe('a handicap-reserved block', () => {
  const TAG = 'Handicap 5 or better';
  const reserved = { id: 'nov5-3pm', date: '2026-11-05', time: '3:00 PM', type: 'training', name: 'Training block', capacity: 6, booked: 2, maxHandicap: 5 };
  const cardAt = (r, time) =>
    [...r.container.querySelectorAll('div')].find((el) => el.textContent.startsWith(time) && el.textContent.includes('Training block')) || null;
  afterEach(() => {
    mockNov5 = [session];
    mockBlocks = [];
  });

  test('the Sessions list tags it, not the open block beside it, and it opens its roster as any block does', async () => {
    mockNov5 = [reserved, session];
    const onOpenRoster = jest.fn();
    const r = await openSessions(onOpenRoster);
    await tap(td(r, '2026-11-05'));
    expect(cardAt(r, '3:00').textContent).toBe(`3:00PMTraining${TAG}Training block2 of 6 booked`);
    expect(cardAt(r, '4:00').textContent).toBe('4:00PMTrainingTraining block3 of 8 booked');
    await tap(cardAt(r, '3:00'));
    expect(onOpenRoster).toHaveBeenCalledWith({
      sessionId: 'nov5-3pm',
      date: '2026-11-05',
      time: '3:00 PM',
      type: 'training',
      name: 'Training block',
      meta: '2 of 6 booked',
    });
    await r.unmount();
  });

  test("today's Overview tags the reserved block only", async () => {
    mockBlocks = [
      { id: 'b1', sessionId: '2026-11-04-0', time: '3:00 PM', type: 'training', name: 'Training block', meta: '2 of 6 booked', status: 'next', maxHandicap: 5 },
      { id: 'b2', sessionId: '2026-11-04-1', time: '4:00 PM', type: 'training', name: 'Training block', meta: '3 of 6 booked', status: 'next', maxHandicap: null },
    ];
    const r = await renderScreen(<CoachDashboard bare />);
    expect(cardAt(r, '3:00').textContent).toContain(`Training${TAG}Training block`);
    expect(cardAt(r, '4:00').textContent).not.toContain('Handicap');
    expect(r.text().split(TAG)).toHaveLength(2);
    await r.unmount();
  });

  test('with no reserved block the coach screens carry no tag at all', async () => {
    const r = await openSessions(() => {});
    await tap(td(r, '2026-11-05'));
    expect(r.text()).not.toContain('Handicap');
    await r.unmount();
  });
});
