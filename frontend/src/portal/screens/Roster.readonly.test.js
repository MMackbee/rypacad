import React from 'react';
import { renderScreen } from './testRender';
import { SessionAttendance } from './Roster';
import { attendanceReadOnlyFor } from '../data/specialists';

// Owner ruling 2026-11-03: Phil and Yannick see the golf day. A roster the
// rules would not let the viewer mark renders read-only - the marks as
// badges, no IN/OUT buttons, no Start session, a saved no-show reason as
// text. What the rules grant such a viewer stays: the session note, and
// Cancel session by role.
let mockLive;
let mockNote;
let mockError;
const mockWrites = { note: [] };
jest.mock('../hooks', () => ({
  useCoachRoster: () => ({ data: [], loading: false }),
  useSession: () => ({ data: { type: 'training', blockLabel: 'Block 1 of 3', name: 'Training block', meta: '3:00-4:00 PM', startsIn: 'Starts in 12 min' } }),
  useSessionAttendance: () => ({
    data: mockError ? null : [
      { bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'confirmed' },
      { bookingId: 'b2', athleteId: 'a2', name: 'Avery Nguyen', status: 'noshow', noshowReason: 'Sick, parent texted' },
      { bookingId: 'b3', athleteId: 'a3', name: 'Sam Ortiz', status: 'attended' },
    ],
    loading: false,
    error: mockError,
    mark: () => {},
    setReason: async () => {},
    setSessionNote: async (sessionId, note) => { mockWrites.note.push([sessionId, note]); },
    cancelSession: async () => {},
    sessionNote: mockNote,
    sessionStatus: 'scheduled',
    sessionMaxHandicap: null,
  }),
  genericSessionName: () => 'Training block',
}));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => mockLive }));
jest.mock('../hooks/assessments', () => ({ useOpenAssessmentWindows: () => ({ data: null, loading: false, error: null }) }));

const block = { date: '2026-11-03', time: '5:00 PM', type: 'training', name: 'Training block', meta: '3 of 14 booked' };
const roster = (props) => renderScreen(<SessionAttendance bare sessionId="2026-11-03-5" block={block} onBack={() => {}} {...props} />);
// The IN/OUT controls, one pair per row.
const controls = (r) => [...r.container.querySelectorAll('button[aria-pressed]')].filter((b) => ['IN', 'OUT'].includes(b.textContent)).length;
// StatusBadge renders an uppercase span; the counters' labels are divs, so this is the badges alone, in document order.
const badges = (r) => [...r.container.querySelectorAll('span')]
  .filter((s) => s.style.textTransform === 'uppercase' && ['View only', 'In', 'Out', 'Unmarked'].includes(s.textContent))
  .map((s) => s.textContent);
// The session-note editor (ReasonEditor's input with the note placeholder).
const noteEditor = (r) => r.container.querySelector('input[placeholder^="e.g. Ran short groups"]');

beforeEach(() => {
  mockLive = true;
  mockNote = 'Cones set up for Thursday';
  mockError = null;
  mockWrites.note.length = 0;
});

test('read-only (Yannick on a golf block): every row shows its mark as a badge; no IN/OUT, no Start session; the saved reason is text', async () => {
  const r = await roster({ readOnly: true, role: 'mental' });
  const text = r.text();
  // Header badge, then Jordan (unmarked), Avery (no-show), Sam (attended).
  expect(badges(r)).toEqual(['View only', 'Unmarked', 'Out', 'In']);
  expect(controls(r)).toBe(0);
  expect(r.button('Start session')).toBeNull();
  expect(r.button('Close block')).toBeNull();
  expect(text).toContain('Attendance is marked by the coach.');
  expect(text).toContain('Sick, parent texted');
  expect(r.button('Sick, parent texted · edit')).toBeNull();
  // Cancel session follows role, and a mental login is not ops/owner.
  expect(r.button('Cancel session')).toBeNull();
  await r.unmount();
});

test('read-only keeps the session note the rules grant: readable, and editable from the footer and the card', async () => {
  const r = await roster({ readOnly: true, role: 'mental' });
  expect(r.text()).toContain('Cones set up for Thursday');
  expect(r.button('Edit')).not.toBeNull();
  expect(r.button('Edit session note')).not.toBeNull();
  await r.click('Edit session note');
  const editor = noteEditor(r);
  expect(editor).not.toBeNull();
  expect(editor.value).toBe('Cones set up for Thursday');
  await r.unmount();
});

test('read-only with no note yet: the footer offers "Add a session note" and nothing else', async () => {
  mockNote = null;
  const r = await roster({ readOnly: true, role: 'ops' });
  expect(r.button('Add a session note')).not.toBeNull();
  expect(r.button('Start session')).toBeNull();
  expect(r.text()).not.toContain('Session note');
  await r.click('Add a session note');
  expect(noteEditor(r)).not.toBeNull();
  expect(noteEditor(r).value).toBe('');
  await r.unmount();
});

test('ops is read-only but still cancels the session (role), never marks', async () => {
  const r = await roster({ readOnly: true, role: 'ops' });
  expect(r.button('Cancel session')).not.toBeNull();
  expect(controls(r)).toBe(0);
  expect(r.button('Start session')).toBeNull();
  await r.unmount();
});

test('a coach keeps the live controls and the footer', async () => {
  const r = await roster({});
  expect(r.text()).not.toContain('View only');
  expect(badges(r)).toEqual([]);
  expect(controls(r)).toBe(6);
  expect(r.button('Start session')).not.toBeNull();
  // The session note only shows once the coach completes the session.
  expect(r.text()).not.toContain('Cones set up for Thursday');
  await r.unmount();
});

test('who marks what follows the rules: coach and owner on golf, a specialist on their own type only, ops never', () => {
  const ro = (role, type, specialistId = null) => attendanceReadOnlyFor({ role, specialistId, type });
  // Plain coach: every golf block, nothing else.
  expect(ro('coach', 'training')).toBe(false);
  expect(ro('coach', 'tournament')).toBe(false);
  expect(ro('coach', null)).toBe(false);
  expect(ro('coach', 'mental')).toBe(true);
  // Phil: golf (he is a coach) and his own sessions, not Yannick's.
  expect(ro('coach', 'training', 'phil')).toBe(false);
  expect(ro('coach', 'phil', 'phil')).toBe(false);
  expect(ro('coach', 'mental', 'phil')).toBe(true);
  // Owner: golf only.
  expect(ro('owner', 'training')).toBe(false);
  expect(ro('owner', 'phil')).toBe(true);
  expect(ro('owner', 'mental')).toBe(true);
  // Yannick: his own sessions only; a mental login without a specialistId marks nothing (the rules' specialist branch needs it).
  expect(ro('mental', 'mental', 'mental')).toBe(false);
  expect(ro('mental', 'training', 'mental')).toBe(true);
  expect(ro('mental', 'tournament', 'mental')).toBe(true);
  expect(ro('mental', null, 'mental')).toBe(true);
  expect(ro('mental', 'mental')).toBe(true);
  // Ops never.
  expect(ro('ops', 'training')).toBe(true);
  expect(ro('ops', 'mental')).toBe(true);
  expect(ro(null, 'training')).toBe(true);
});

test("a roster the rules refuse (a swing coach, 2026-11-04) says so instead of reading as an empty block", async () => {
  mockError = Object.assign(new Error('fetchAthlete: Missing or insufficient permissions.'), { code: 'permission-denied' });
  const r = await roster({});
  const text = r.text();
  expect(text).toContain("This login can't read athlete profiles, so the roster can't load.");
  expect(text).not.toContain('Jordan Whitfield');
  expect(controls(r)).toBe(0);
  await r.unmount();
});

test('any other load failure reads as a plain line, never an empty block', async () => {
  mockError = new Error('fetchBookingsBySession: network');
  const r = await roster({});
  expect(r.text()).toContain("The roster didn't load. Check the connection and try again.");
  await r.unmount();
});
