import React from 'react';
import { act } from 'react';
import { renderScreen } from './testRender';
import { SessionAttendance } from './Roster';
import { CANCEL_FAILURE_COPY } from '../data/cancelCopy';

/**
 * Staff "Cancel session" failing part-way (2026-11-04). The sheet is the
 * families' CancelSheet; its failure line was the family's "This
 * reservation couldn't be cancelled ... contact the academy", which hid
 * the cause from the academy itself. cancelSession commits in chunks and
 * can stop part-way, so staff read that, that a re-run is safe, and the
 * underlying message.
 */
let mockStatus;
let mockCancel;
jest.mock('../hooks', () => ({
  useCoachRoster: () => ({ data: [], loading: false, error: null }),
  useSession: () => ({ data: { type: 'training', blockLabel: 'Block 1 of 3', name: 'Training block', meta: '3:00-4:00 PM', startsIn: 'Starts in 12 min' } }),
  useSessionAttendance: () => ({
    data: [
      { bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'confirmed' },
      { bookingId: 'b2', athleteId: 'a2', name: 'Avery Nguyen', status: 'confirmed' },
    ],
    loading: false,
    error: null,
    mark: () => {},
    setReason: async () => {},
    setSessionNote: async () => {},
    cancelSession: (...args) => mockCancel(...args),
    sessionNote: null,
    sessionStatus: mockStatus,
    sessionMaxHandicap: null,
  }),
  genericSessionName: () => 'Training block',
}));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => true }));
jest.mock('../hooks/assessments', () => ({ useOpenAssessmentWindows: () => ({ data: null, loading: false, error: null }) }));

const block = { date: '2026-11-10', time: '5:00 PM', type: 'training', name: 'Training block', meta: '2 of 8 booked' };
const roster = () => renderScreen(<SessionAttendance bare sessionId="2026-11-10-5" block={block} role="ops" onBack={() => {}} />);
// The sheet's confirm shares its label with the header button that opened it: the sheet's is the last.
const confirm = async (r, label) => {
  const all = [...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === label);
  await act(async () => { all[all.length - 1].click(); });
};
const denied = () =>
  Object.assign(new Error('cancelSession: Missing or insufficient permissions.'), { name: 'LiveDataError', code: 'permission-denied' });

beforeEach(() => {
  mockStatus = 'scheduled';
  mockCancel = async () => { throw denied(); };
});

test('a failed Cancel session reads as staff words with the cause, and tapping it again re-runs the cancel', async () => {
  const calls = [];
  mockCancel = async (sessionId) => {
    calls.push(sessionId);
    if (calls.length === 1) throw denied();
    return { sessionId, cancelled: 2, graceTokensMinted: 2 };
  };
  const r = await roster();
  await r.click('Cancel session');
  await confirm(r, 'Cancel session');
  const text = r.text();
  expect(text).toContain('This session was not fully cancelled. Some of its bookings may already be.');
  expect(text).toContain('Tap "Cancel session" again to finish.');
  expect(text).toContain('What went wrong: cancelSession: Missing or insufficient permissions.');
  expect(text).not.toContain(CANCEL_FAILURE_COPY.one.permission);
  expect(text).not.toMatch(/contact the academy/);
  // The sheet stayed open; the second tap runs the same cancel again.
  await confirm(r, 'Cancel session');
  expect(calls).toEqual(['2026-11-10-5', '2026-11-10-5']);
  expect(r.text()).not.toContain('What went wrong');
  await r.unmount();
});

test('"Cancel remaining bookings" on a session the calendar already cancelled says the same for its bookings', async () => {
  mockStatus = 'cancelled';
  const r = await roster();
  await r.click('Cancel remaining bookings');
  await confirm(r, 'Cancel bookings');
  expect(r.text()).toContain('The remaining bookings were not all cancelled. Some may already be. Tap "Cancel bookings" again to finish.');
  expect(r.text()).toContain('What went wrong: cancelSession: Missing or insufficient permissions.');
  await r.unmount();
});
