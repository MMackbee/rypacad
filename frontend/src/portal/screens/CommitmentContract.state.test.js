import React from 'react';
import { renderScreen } from './testRender';
import CommitmentContract from './CommitmentContract';

/**
 * Live mode renders <CommitmentContract bare /> with the default variant, so
 * the hook's state.kind has to drive the hero (contract-buffer ruling,
 * 2026-09-30): a red hero under a live Behind pill, and just the line before
 * the contract starts. No tier picker (owner, 2026-10-28): the header shows
 * the derived requirement and a first open stamps the contract once.
 */

let mockData;
let mockEnsure;
jest.mock('../hooks', () => ({
  useContract: () => ({ data: mockData, loading: false, error: null, ensureContractStart: mockEnsure }),
  usePracticeLog: () => ({
    data: { loggedToday: false, todayMinutes: 0 },
    totalMinutes: 0,
    logPractice: jest.fn(),
    removeLog: jest.fn(),
  }),
}));

// The hero is the one card bordered in color.error (#FF4444).
const hasRedHero = (r) => [...r.container.querySelectorAll('div')].some((d) => d.style.borderColor === '#ff4444');
const contract = (state, stats) => ({
  tierMinutes: 45,
  month: { label: 'November 2026', name: 'November', start: '2026-11-01' },
  dayStates: {},
  stats: { logged: 0, contractDays: 20, dueSoFar: 6, missed: 6, daysLeft: 14, streak: 0, minutes: 0, ...stats },
  state,
  caption: 'Weekends are not contract days.',
  needsStart: false,
});

beforeEach(() => {
  mockEnsure = jest.fn(async () => ({}));
  mockData = {
    ...contract({ kind: 'ontrack', badge: { tone: 'green', label: 'On track' }, line: '2 of 2 days due so far.', hint: 'One tap.' }, { logged: 2, dueSoFar: 2, missed: 0 }),
    needsStart: false,
  };
  jest.useFakeTimers('modern');
  jest.setSystemTime(new Date('2026-11-11T15:00:00'));
});
afterEach(() => { jest.useRealTimers(); });

test("kind 'behind' gives the red hero under the Behind pill, with the default variant", async () => {
  mockData = contract({
    kind: 'behind',
    badge: { tone: 'red', label: 'Behind' },
    line: '6 days behind with 14 contract days left.',
    hint: 'Missed a day? Tap it in the grid to add a late entry.',
  });
  const r = await renderScreen(<CommitmentContract bare />);
  expect(r.text()).toContain('Behind');
  expect(hasRedHero(r)).toBe(true);
  expect(r.text()).toContain('of 20 contract days');
  await r.unmount();
});

test("kind 'catchup' stays green: On track, no red hero", async () => {
  mockData = contract(
    {
      kind: 'catchup',
      badge: { tone: 'green', label: 'On track' },
      line: '4 of 6 days due so far — 2 to catch up. Tap a missed day to add a late entry.',
      hint: 'Missed a day? Tap it in the grid to add a late entry.',
    },
    { logged: 4, missed: 2 }
  );
  const r = await renderScreen(<CommitmentContract bare />);
  expect(r.text()).toContain('On track');
  expect(hasRedHero(r)).toBe(false);
  await r.unmount();
});

test("kind 'notStarted': no pill, the start line, no '0 of 0 contract days'", async () => {
  mockData = contract(
    {
      kind: 'notStarted',
      badge: null,
      line: "Your contract starts Tuesday, Nov 3. Days before then don't count for or against you.",
      hint: 'Weekends are not contract days.',
    },
    { contractDays: 0, dueSoFar: 0, missed: 0, daysLeft: 0 }
  );
  const r = await renderScreen(<CommitmentContract bare />);
  expect(r.text()).toContain('Your contract starts Tuesday, Nov 3.');
  expect(r.text()).not.toContain('contract days logged');
  expect(r.text()).not.toContain('of 0 contract days');
  expect(r.text()).not.toContain('On track');
  expect(r.text()).not.toContain('Behind');
  expect(hasRedHero(r)).toBe(false);
  await r.unmount();
});

test('the header shows the derived requirement and never a picker', async () => {
  mockData = { ...mockData, tierMinutes: 10, needsStart: false };
  const r = await renderScreen(<CommitmentContract bare />, { path: '/portal/contract' });
  expect(r.text()).toContain('10 min a day');
  expect(r.text()).not.toMatch(/Pick your daily investment|Start the \d+ min contract/);
  await r.unmount();
});

test('a first open stamps the contract once', async () => {
  mockEnsure.mockClear();
  mockData = { ...mockData, needsStart: true };
  const r = await renderScreen(<CommitmentContract bare />, { path: '/portal/contract' });
  await r.flush();
  expect(mockEnsure).toHaveBeenCalledTimes(1);
  await r.unmount();
});
