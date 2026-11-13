import React, { act } from 'react';
import { renderScreen } from './testRender';
import Roster, { SessionAttendance } from './Roster';
import { attendanceReadOnlyFor } from '../data/specialists';
import * as invalidate from '../hooks/invalidate';

// Owner ruling 2026-11-03: Phil and Yannick see the golf day. A roster the
// rules would not let the viewer mark renders read-only - the marks as
// badges, no IN/OUT buttons, no Start session, a saved no-show reason as
// text. What the rules grant such a viewer stays: the session note, and
// Cancel session by role.
let mockLive;
let mockNote;
let mockError;
let mockLoading;
let mockRows;
let mockStatus;
let mockCoachError;
let mockUnresolved;
let mockResults;
const mockWrites = { note: [], results: [], coachRetries: 0 };
jest.mock('../hooks', () => ({
  useCoachRoster: () => ({ data: mockCoachError ? null : [], loading: false, error: mockCoachError ?? null, retry: () => { mockWrites.coachRetries += 1; } }),
  useSession: () => ({ data: { type: 'training', blockLabel: 'Block 1 of 3', name: 'Training block', meta: '3:00-4:00 PM', startsIn: 'Starts in 12 min' } }),
  useSessionAttendance: () => ({
    data: mockError || mockLoading ? null : mockRows ?? [
      { bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'confirmed' },
      { bookingId: 'b2', athleteId: 'a2', name: 'Avery Nguyen', status: 'noshow', noshowReason: 'Sick, parent texted' },
      { bookingId: 'b3', athleteId: 'a3', name: 'Sam Ortiz', status: 'attended' },
    ],
    loading: Boolean(mockLoading),
    error: mockError ?? null,
    mark: () => {},
    setReason: async () => {},
    setSessionNote: async (sessionId, note) => { mockWrites.note.push([sessionId, note]); },
    cancelSession: async () => {},
    sessionNote: mockNote,
    sessionStatus: mockStatus,
    sessionMaxHandicap: null,
    sessionUnresolved: mockUnresolved,
  }),
  useTournamentResults: () => ({ data: mockResults, loading: false, error: null, saveResults: async (entries) => { mockWrites.results.push(entries); } }),
  genericSessionName: () => 'Training block',
}));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), __esModule: true, isLive: () => mockLive }));
jest.mock('../hooks/assessments', () => ({ useOpenAssessmentWindows: () => ({ data: null, loading: false, error: null }) }));
jest.mock('../hooks/cancelledBookings', () => ({ useCancelledBookings: () => ({ data: [], loading: false, error: null }), markOrRecheck: async (mark, id, status) => { await mark(id, status); return false; } }));

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
  mockLoading = false;
  mockRows = null;
  mockStatus = 'scheduled';
  mockCoachError = null;
  mockUnresolved = false;
  mockResults = null;
  mockWrites.note.length = 0;
  mockWrites.results.length = 0;
  mockWrites.coachRetries = 0;
});
// The three counters, in document order, as "0 In 0 Out 0 Unmarked".
const counters = (r) => {
  const m = r.text().match(/(\d+)\s*In\s*(\d+)\s*Out\s*(\d+)\s*Unmarked/);
  return m ? `${m[1]} In ${m[2]} Out ${m[3]} Unmarked` : '';
};
const PERMISSION = () => Object.assign(new Error('fetchAthlete: Missing or insufficient permissions.'), { code: 'permission-denied' });

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

// 2026-11-13 (owner): no session note on Yannick's 1:1s. A session doc is
// readable by every signed-in family, so a note there would not stay private;
// his notes live on the athlete's page (mentalNotes, his alone).
const mentalBlock = { date: '2026-11-18', time: '4:30 PM', type: 'mental', name: 'Mental game session', meta: '1 of 1 booked' };
const closeButton = (r) => [...r.container.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Close block'));

test('a 1:1 with Yannick: the owner and ops get no session note, and the stored one is not shown', async () => {
  for (const role of ['owner', 'ops']) {
    const r = await roster({ readOnly: true, role, block: mentalBlock, sessionId: `cal-view-${role}` });
    expect(r.button('Add a session note')).toBeNull();
    expect(r.button('Edit session note')).toBeNull();
    expect(r.button('Edit')).toBeNull();
    expect(r.text()).not.toContain('Cones set up for Thursday');
    expect(r.text()).not.toContain('Session note');
    expect(r.text()).not.toContain('A session note is open to you');
    expect(r.text()).toContain('Attendance is marked by the coach.');
    // Avery's saved no-show reason is not shown on a 1:1 either.
    expect(r.text()).not.toContain('Sick, parent texted');
    await r.unmount();
  }
});

// Avery's row is a no-show with a saved reason in the mock: on a golf block the
// coach gets the reason chip ("<reason> · edit"); on a 1:1 there is no chip.
const reasonChips = (r) => [...r.container.querySelectorAll('button')]
  .filter((b) => /· edit$|^\+ Add a reason/.test(b.textContent.trim()));

test('a 1:1 with Yannick: a no-show row has no reason chip and the saved reason is not shown', async () => {
  const r = await roster({ role: 'mental', block: mentalBlock, sessionId: 'cal-reason-check' });
  await r.click('Start session');
  expect(reasonChips(r)).toEqual([]);
  expect(r.text()).not.toContain('Sick, parent texted');
  await r.unmount();
});

test('a golf block still shows the no-show reason chip (unchanged)', async () => {
  const r = await roster({ sessionId: 'golf-reason-check' });
  await r.click('Start session');
  expect(r.button('Sick, parent texted · edit')).not.toBeNull();
  await r.unmount();
});

test('a 1:1 with Yannick: closing it offers no session note, only the pointer to his private notes', async () => {
  mockNote = null;
  // Own session ids: a closed status is kept per session across mounts (useSessionLocalStatus).
  const r = await roster({ role: 'mental', block: mentalBlock, sessionId: 'cal-close-check' });
  await r.click('Start session');
  const close = closeButton(r);
  expect(close).toBeTruthy();
  await act(async () => { close.click(); });
  expect(r.button('Add a session note')).toBeNull();
  expect(noteEditor(r)).toBeNull();
  expect(r.text()).toContain("Keep 1:1 notes on the athlete's page - only you can read them.");
  expect(r.text()).not.toContain('No-shows are reported to Phil');
  expect(mockWrites.note).toEqual([]);
  await r.unmount();
});

test('a golf block still takes a session note when closed (unchanged)', async () => {
  mockNote = null;
  const r = await roster({ sessionId: 'golf-close-check' });
  await r.click('Start session');
  await act(async () => { closeButton(r).click(); });
  expect(r.button('Add a session note')).not.toBeNull();
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

test("a roster the rules refuse (a swing coach, 2026-11-04) says so instead of reading as an empty block: names the owner, no retry", async () => {
  mockError = PERMISSION();
  const r = await roster({});
  const text = r.text();
  expect(text).toContain("The roster didn't load");
  expect(text).toContain("Your account can't read athletes, so this roster can't load. Tell the owner to check your access.");
  expect(counters(r)).toBe('0 In 0 Out 0 Unmarked');
  expect(controls(r)).toBe(0);
  expect(r.button('Try again')).toBeNull();
  await r.unmount();
});

test('any other load failure is the titled notice with a Try again, never an empty block', async () => {
  mockError = new Error('fetchBookingsBySession: network');
  const r = await roster({});
  const text = r.text();
  expect(text).toContain("The roster didn't load");
  expect(text).toContain('Check your connection and try again.');
  expect(text).not.toContain("Your account can't read athletes");
  expect(r.button('Try again')).not.toBeNull();
  // Try again re-reads the roster: useSessionAttendance re-runs on a 'bookings' bump.
  const bump = jest.spyOn(invalidate, 'bump');
  await r.click('Try again');
  expect(bump).toHaveBeenCalledWith('bookings');
  bump.mockRestore();
  expect(counters(r)).toBe('0 In 0 Out 0 Unmarked');
  await r.unmount();
});

test('the first load says so: a loading line, no rows, no controls', async () => {
  mockLoading = true;
  const r = await roster({});
  expect(r.text()).toContain('Loading the roster…');
  expect(r.text()).not.toContain('Jordan Whitfield');
  expect(controls(r)).toBe(0);
  await r.unmount();
});

test('a refetch after a mark keeps the rows in place: no loading line, the controls stay', async () => {
  const r = await roster({});
  expect(controls(r)).toBe(6);
  mockLoading = true; // the hook blanks data while it re-reads after a mark
  await r.rerender(<SessionAttendance bare sessionId="2026-11-03-5" block={block} onBack={() => {}} />);
  expect(controls(r)).toBe(6);
  expect(r.text()).toContain('Jordan Whitfield');
  expect(r.text()).not.toContain('Loading the roster…');
  await r.unmount();
});

test('a saved no-show reason stays on its row while the roster re-reads or after the re-read fails, and the editor opens with it (review 2026-11-04)', async () => {
  const again = (r, props = {}) => r.rerender(<SessionAttendance bare sessionId="2026-11-03-5" block={block} onBack={() => {}} {...props} />);
  const r = await roster({});
  expect(r.button('Sick, parent texted · edit')).not.toBeNull();
  mockLoading = true; // the hook blanks data while it re-reads after a mark
  await again(r);
  expect(r.button('Sick, parent texted · edit')).not.toBeNull();
  expect(r.text()).not.toContain('+ Add a reason (optional)');
  mockLoading = false;
  mockError = new Error('fetchBookingsBySession: network'); // the re-read failed
  await again(r);
  expect(r.text()).toContain("The roster didn't load");
  expect(r.button('Sick, parent texted · edit')).not.toBeNull();
  await r.click('Sick, parent texted · edit');
  expect(r.container.querySelector('input[placeholder^="e.g. Sick"]').value).toBe('Sick, parent texted');
  await r.unmount();

  // A read-only viewer keeps the reason line too.
  mockError = null;
  const ro = await roster({ readOnly: true, role: 'mental' });
  mockLoading = true;
  await again(ro, { readOnly: true, role: 'mental' });
  expect(ro.text()).toContain('Sick, parent texted');
  await ro.unmount();
});

test('seed/demo mode (not live) never shows the loading line or the load notice', async () => {
  mockLive = false;
  mockError = PERMISSION();
  const r = await roster({});
  expect(r.text()).not.toContain('Loading the roster…');
  expect(r.text()).not.toContain("roster didn't load");
  expect(r.text()).not.toContain("Your account can't read athletes");
  await r.unmount();
});

test('a booking whose athlete could not be read keeps its row as Name unavailable, with its controls', async () => {
  mockRows = [
    { bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'confirmed' },
    { bookingId: 'b4', athleteId: 'a4', name: null, status: 'confirmed' },
  ];
  const r = await roster({});
  expect(r.text()).toContain('Name unavailable');
  expect(controls(r)).toBe(4);
  expect(counters(r)).toBe('0 In 0 Out 2 Unmarked');
  await r.unmount();
});

test('Tour results saved from a roster with an unreadable athlete keep the saved name, else store null, never the on-screen label (review 2026-11-04)', async () => {
  const tour = { ...block, type: 'tournament', name: 'RYP Tour' };
  mockRows = [
    { bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'attended' },
    { bookingId: 'b4', athleteId: 'a4', name: null, status: 'attended' },
    { bookingId: 'b5', athleteId: 'a5', name: null, status: 'attended' },
  ];
  // Scores already saved: reopening the sheet to correct one re-saves every
  // row. a4's saved result carries its name; a5 has no saved result yet.
  mockResults = { results: [{ athleteId: 'a1', score: 72 }, { athleteId: 'a4', name: 'Avery Nguyen', score: 80 }] };
  const r = await roster({ block: tour });
  await r.click('Edit Tour results');
  expect(r.text()).toContain('Name unavailable');
  const a5Score = r.container.querySelectorAll('input[inputmode="numeric"]')[2];
  await r.act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(a5Score, '85');
    a5Score.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await r.click('Save scores');
  expect(mockWrites.results).toHaveLength(1);
  expect(mockWrites.results[0].map((e) => [e.athleteId, e.name, e.score])).toEqual([
    ['a1', 'Jordan Whitfield', 72],
    ['a4', 'Avery Nguyen', 80],
    ['a5', null, 85],
  ]);
  await r.unmount();
});

// Types a strokes count into the score sheet's nth field.
const typeScore = async (r, index, value) => {
  const field = r.container.querySelectorAll('input[inputmode="numeric"]')[index];
  await r.act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

test('a second Tour results save while the results re-read is in flight or failed still sends the saved name (review 2026-11-04)', async () => {
  const tour = { ...block, type: 'tournament', name: 'RYP Tour' };
  mockRows = [
    { bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'attended' },
    { bookingId: 'b4', athleteId: 'a4', name: null, status: 'attended' },
  ];
  mockResults = { results: [{ athleteId: 'a1', name: 'Jordan Whitfield', score: 72 }, { athleteId: 'a4', name: 'Avery Nguyen', score: 80 }] };
  // A fresh element each render, so rerender reaches the screen.
  const view = () => <SessionAttendance bare sessionId="2026-11-03-5" block={tour} onBack={() => {}} />;
  const r = await renderScreen(view());
  await r.click('Edit Tour results');
  await r.click('Save scores');
  expect(mockWrites.results[0].map((e) => [e.athleteId, e.name, e.score])).toEqual([
    ['a1', 'Jordan Whitfield', 72],
    ['a4', 'Avery Nguyen', 80],
  ]);
  // The save's own re-read blanks the results (in flight, or failed).
  mockResults = null;
  await r.rerender(view());
  expect(r.text()).toContain('Name unavailable');
  await typeScore(r, 1, '81');
  await r.click('Save scores');
  expect(mockWrites.results).toHaveLength(2);
  expect(mockWrites.results[1].map((e) => [e.athleteId, e.name, e.score])).toEqual([
    ['a1', 'Jordan Whitfield', 72],
    ['a4', 'Avery Nguyen', 81],
  ]);
  await r.unmount();
});

test('a name sent in a Tour results save is kept for the next save when the roster then loses it and the results re-read failed (review 2026-11-04)', async () => {
  const tour = { ...block, type: 'tournament', name: 'RYP Tour' };
  mockRows = [
    { bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'attended' },
    { bookingId: 'b4', athleteId: 'a4', name: 'Avery Nguyen', status: 'attended' },
  ];
  // First entry for this event: nothing saved yet.
  mockResults = null;
  // A fresh element each render, so rerender reaches the screen.
  const view = () => <SessionAttendance bare sessionId="2026-11-03-5" block={tour} onBack={() => {}} />;
  const r = await renderScreen(view());
  await r.click('Enter Tour results');
  await typeScore(r, 0, '72');
  await typeScore(r, 1, '80');
  await r.click('Save scores');
  expect(mockWrites.results[0].map((e) => [e.athleteId, e.name, e.score])).toEqual([
    ['a1', 'Jordan Whitfield', 72],
    ['a4', 'Avery Nguyen', 80],
  ]);
  // The roster re-read could not read a4 this time, and the results re-read failed.
  mockRows = [
    { bookingId: 'b1', athleteId: 'a1', name: 'Jordan Whitfield', status: 'attended' },
    { bookingId: 'b4', athleteId: 'a4', name: null, status: 'attended' },
  ];
  await r.rerender(view());
  expect(r.text()).toContain('Name unavailable');
  await typeScore(r, 1, '81');
  await r.click('Save scores');
  expect(mockWrites.results).toHaveLength(2);
  expect(mockWrites.results[1].map((e) => [e.athleteId, e.name, e.score])).toEqual([
    ['a1', 'Jordan Whitfield', 72],
    ['a4', 'Avery Nguyen', 81],
  ]);
  await r.unmount();
});

test('a cancelled session whose roster failed to load shows the cancelled card alone', async () => {
  mockStatus = 'cancelled';
  mockError = new Error('fetchBookingsBySession: network');
  const r = await roster({});
  expect(r.text()).toContain('This session was cancelled');
  expect(r.text()).not.toContain("roster didn't load");
  await r.unmount();
});

test('a Tour block hides Enter Tour results while the roster is on its first load or failed, and shows it once loaded', async () => {
  const tour = { ...block, type: 'tournament', name: 'RYP Tour' };
  mockLoading = true;
  const loading = await roster({ block: tour });
  expect(loading.button('Enter Tour results')).toBeNull();
  await loading.unmount();
  mockLoading = false;
  mockError = new Error('fetchBookingsBySession: network');
  const failed = await roster({ block: tour });
  expect(failed.button('Enter Tour results')).toBeNull();
  await failed.unmount();
  mockError = null;
  const loaded = await roster({ block: tour });
  expect(loaded.button('Enter Tour results')).not.toBeNull();
  await loaded.unmount();
});

test('a slot held for a Calendly booking not matched to a family: no Cancel session, one plain line instead (review 2026-11-04)', async () => {
  mockRows = [];
  mockUnresolved = true;
  const held = await roster({ readOnly: true, role: 'owner' });
  expect(held.button('Cancel session')).toBeNull();
  expect(held.text()).toContain("This slot is held for a Calendly booking that isn't matched to a family yet.");
  await held.unmount();
  // Absent on every other session: Cancel session as before.
  mockUnresolved = undefined;
  const open = await roster({ readOnly: true, role: 'owner' });
  expect(open.button('Cancel session')).not.toBeNull();
  expect(open.text()).not.toContain('held for a Calendly booking');
  await open.unmount();
});

test("the bottom-tab Roster says when the assigned list failed to load, never 'nobody is assigned'", async () => {
  mockCoachError = PERMISSION();
  const r = await renderScreen(<Roster bare />);
  expect(r.text()).toContain("Your account can't read athletes, so this roster can't load.");
  expect(r.text()).not.toContain('No assigned athletes');
  expect(r.button('Try again')).toBeNull();
  await r.unmount();
});

test('the bottom-tab Roster offers Try again when the list failed for any other reason, and it re-reads the list (review 2026-11-04)', async () => {
  mockCoachError = new Error('fetchCoachAthletes: network');
  const r = await renderScreen(<Roster bare />);
  expect(r.text()).toContain('Check your connection and try again.');
  await r.click('Try again');
  expect(mockWrites.coachRetries).toBe(1);
  await r.unmount();
});
