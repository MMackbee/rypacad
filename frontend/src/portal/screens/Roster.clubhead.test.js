import React from 'react';
import { renderScreen } from './testRender';
import { SessionAttendance } from './Roster';

let mockOpen;
jest.mock('../hooks', () => ({
  useCoachRoster: () => ({ data: [], loading: false }),
  useSession: () => ({ data: { type: 'training', blockLabel: 'Block 1 of 3', name: 'Training block', meta: '3:00-4:00 PM', startsIn: 'Starts in 12 min' } }),
  useSessionAttendance: () => ({
    data: [
      { bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'confirmed' },
      { bookingId: 'b2', athleteId: 'a2', name: 'Sam Lee', status: 'confirmed' },
    ],
    loading: false,
    error: null,
    mark: () => {},
    sessionNote: null,
    sessionStatus: 'scheduled',
    sessionMaxHandicap: null,
  }),
  genericSessionName: () => 'Training block',
}));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => true }));
jest.mock('../hooks/assessments', () => ({ useOpenAssessmentWindows: () => ({ data: { byAthlete: mockOpen }, loading: false, error: null }) }));

const block = (type) => ({ date: '2026-11-05', time: '3:00 PM', type, name: type === 'training' ? 'Training block' : 'RYP Tour', meta: '2 of 6 booked' });
const roster = (type, props = {}) => renderScreen(<SessionAttendance bare sessionId="2026-11-05-0" block={block(type)} onBack={() => {}} {...props} />);

beforeEach(() => {
  mockOpen = { a1: { windowId: '2026-27-baseline', kind: 'baseline', circuitDate: '2026-11-03', golfDate: null, circuitMode: null } };
});

test('a training session shows "Clubhead speed" on an athlete with an open window, and opens the entry', async () => {
  const opened = [];
  const r = await roster('training', { onOpenClubhead: (id, name) => opened.push([id, name]) });
  expect(r.button('Clubhead speed: Sam Lee')).toBeNull();
  await r.click('Clubhead speed: Jordan Whitfield');
  expect(opened).toEqual([['a1', 'Jordan Whitfield']]);
  await r.unmount();
});

test('golf already entered reads as entered; it can still be opened to correct', async () => {
  mockOpen = { a1: { ...mockOpen.a1, golfDate: '2026-11-05' } };
  const r = await roster('training', { onOpenClubhead: () => {} });
  expect(r.text()).toContain('Clubhead speed · entered');
  await r.unmount();
});

test('a Tour event, or a roster opened without the handler, shows no chip', async () => {
  const tour = await roster('tournament', { onOpenClubhead: () => {} });
  expect(tour.button('Clubhead speed: Jordan Whitfield')).toBeNull();
  await tour.unmount();
  const plain = await roster('training');
  expect(plain.button('Clubhead speed: Jordan Whitfield')).toBeNull();
  await plain.unmount();
});
