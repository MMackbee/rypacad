import React, { act } from 'react';
import { renderScreen } from './testRender';
import CommitmentContract from './CommitmentContract';

/**
 * Live mode renders <CommitmentContract bare /> with the default variant, so
 * the hook's state.kind has to drive the hero (contract-buffer ruling,
 * 2026-09-30): a red hero under a live Behind pill, and just the line before
 * the contract starts. NoContract's start stamps contractStart ({ start: true }).
 */

let mockData;
let mockSetTier;
jest.mock('../hooks', () => ({
  useContract: () => ({ data: mockData, loading: false, error: null, setTier: mockSetTier }),
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
  tiers: [],
});

beforeEach(() => {
  mockSetTier = jest.fn(async () => ({}));
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

test('NoContract: starting a tier asks the hook to stamp contractStart', async () => {
  mockData = { ...contract(null), tierMinutes: null, tiers: [{ minutes: 45, description: 'The standard.' }] };
  const r = await renderScreen(<CommitmentContract bare />);
  const tier = r.container.querySelector('[role="button"][aria-pressed]');
  await act(async () => { tier.click(); });
  await r.click('Start the 45 min contract');
  expect(mockSetTier).toHaveBeenCalledWith(45, { start: true });
  expect(r.text()).toContain('Contract started');
  await r.unmount();
});
