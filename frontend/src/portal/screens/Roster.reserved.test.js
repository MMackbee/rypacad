import React from 'react';
import { renderScreen } from './testRender';
import { SessionAttendance } from './Roster';

// Owner ruling 2026-10-02: the roster of a handicap-reserved block carries
// the tag families see. The limit is the hook's own read of the session.
let mockLive;
let mockLimit;
jest.mock('../hooks', () => ({
  useCoachRoster: () => ({ data: [], loading: false }),
  useSession: () => ({ data: { type: 'training', blockLabel: 'Block 1 of 3', name: 'Training block', meta: '3:00-4:00 PM', startsIn: 'Starts in 12 min' } }),
  useSessionAttendance: () => ({
    data: [{ bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'confirmed' }],
    loading: false,
    error: null,
    mark: () => {},
    sessionNote: null,
    sessionStatus: 'scheduled',
    sessionMaxHandicap: mockLimit,
  }),
  genericSessionName: () => 'Training block',
}));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => mockLive }));

const block = { date: '2026-11-03', time: '3:00 PM', type: 'training', name: 'Training block', meta: '2 of 6 booked' };
const roster = () => renderScreen(<SessionAttendance bare sessionId="2026-11-03-0" block={block} onBack={() => {}} />);

beforeEach(() => {
  mockLive = true;
  mockLimit = null;
});

test('a reserved block: the header carries the tag', async () => {
  mockLimit = 5;
  const r = await roster();
  expect(r.text().split('Handicap 5 or better')).toHaveLength(2);
  expect(r.text()).toContain('Jordan Whitfield');
  await r.unmount();
});

test('an open block, or a hook that reports no limit: the header is as it was', async () => {
  const drawn = [];
  for (const limit of [null, undefined]) {
    mockLimit = limit;
    const r = await roster();
    expect(r.text()).not.toContain('Handicap');
    drawn.push(r.container.innerHTML);
    await r.unmount();
  }
  expect(drawn[0]).toBe(drawn[1]);
});

test('the seed roster (no live session) carries no tag', async () => {
  mockLive = false;
  mockLimit = undefined;
  const r = await renderScreen(<SessionAttendance bare onBack={() => {}} />);
  expect(r.text()).toContain('Training block');
  expect(r.text()).not.toContain('Handicap');
  await r.unmount();
});
