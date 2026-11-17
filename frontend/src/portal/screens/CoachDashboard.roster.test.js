/**
 * The Today tab's Students read (speed review, 2026-11-17): only a plain
 * coach has a Students tab, so only a plain coach's screen asks for the
 * roster. Owner, ops, Phil (a coach with a specialistId) and Yannick get
 * { enabled: false }, and their Today tab makes no athletes query.
 */
import React from 'react';
import { renderScreen } from './testRender';
import CoachDashboard from './CoachDashboard';

const mockRosterAsks = [];
jest.mock('../hooks', () => ({
  useCoachDay: () => ({ data: { coach: { name: 'Coach', date: '2026-11-04' }, blocks: [], attention: [] } }),
  useCoachRoster: (opts) => {
    mockRosterAsks.push(opts);
    return { data: [], loading: false, error: null, retry: () => {} };
  },
  useMonthSessions: () => ({ data: { days: [] }, loading: false, error: null }),
}));

beforeEach(() => { mockRosterAsks.length = 0; });

test.each([
  ['owner', { role: 'owner' }, false],
  ['ops', { role: 'ops' }, false],
  ['Phil (a coach with a specialistId)', { role: 'coach', specialistId: 'phil' }, false],
  ['Yannick (mental)', { role: 'mental' }, false],
  ['a coach', { role: 'coach' }, true],
])('%s: roster read enabled is %s', async (_, props, enabled) => {
  const r = await renderScreen(<CoachDashboard bare {...props} />);
  expect(mockRosterAsks.length).toBeGreaterThan(0);
  for (const ask of mockRosterAsks) expect(ask).toEqual({ enabled });
  expect(Boolean(r.button('Students'))).toBe(enabled);
  await r.unmount();
});
