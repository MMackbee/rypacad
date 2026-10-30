import React from 'react';
import { renderScreen } from './testRender';

let mockBoard;
// What the mocked hook "holds", flipped by the mocked writes the way the real
// hook's optimistic row is: ticks per athlete, notes per athlete.
let checked;
let notes;
let holdNotes;
let heldNote;
const mockSetCheckin = jest.fn();
const mockSetCheckinNote = jest.fn();
jest.mock('../hooks', () => ({
  useContractBoard: (weekStartISO) => ({ ...mockBoard(weekStartISO), setCheckin: mockSetCheckin, setCheckinNote: mockSetCheckinNote, loading: false, error: null }),
  useSelfManaged: () => false,
}));
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), academyDateISO: () => '2026-11-11' }));
import MentalContract from './MentalContract';

const r0 = (id, name, metDays, extra = {}) => ({
  athleteId: id, name, age: 12, required: 20, familyName: null, thisWeek: { metDays, days: [] }, lastWeek: { metDays: 0, days: [] },
  lastCheckin: null, checkedInThisWeek: false, note: null, visits: [], daysSince: null, ...extra,
});
const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const screen = () => <MentalContract bare role="mental" />;

beforeEach(() => {
  checked = { nico: false, reese: false };
  notes = { jordan: 'Spoke Monday.', nico: null, reese: null };
  holdNotes = false;
  heldNote = null;
  mockSetCheckin.mockReset();
  mockSetCheckinNote.mockReset();
  mockSetCheckin.mockImplementation(async ({ athleteId, checkedIn }) => {
    if (athleteId in checked) checked[athleteId] = checkedIn;
    return { id: `${athleteId}_2026-11-09`, checkedIn };
  });
  mockSetCheckinNote.mockImplementation(({ athleteId, note }) => {
    const prev = notes[athleteId];
    notes[athleteId] = note.trim() || null;
    const done = { id: `${athleteId}_2026-11-09`, note: notes[athleteId] };
    if (!holdNotes) return Promise.resolve(done);
    return new Promise((resolve, reject) => {
      heldNote = { resolve: () => resolve(done), reject: (e) => { notes[athleteId] = prev; reject(e); } };
    });
  });
  mockBoard = (week) => ({
    config: { enabled: true, enabledAt: '2026-11-03' },
    rows: week === '2026-11-09'
      ? {
        due: checked.reese ? [] : [{ ...r0('reese', 'Reese', 0), daysSince: 22 }],
        thisWeek: checked.nico ? [] : [r0('nico', 'Nico', 2, { visits: [{ date: '2026-11-10', dow: 'Tue', time: '4:00 PM', type: 'training' }] })],
        checkedIn: [
          { ...r0('jordan', 'Jordan', 4), checkedInThisWeek: true, note: notes.jordan },
          ...(checked.nico ? [{ ...r0('nico', 'Nico', 2), checkedInThisWeek: true, note: notes.nico }] : []),
          ...(checked.reese ? [{ ...r0('reese', 'Reese', 0), checkedInThisWeek: true, note: notes.reese }] : []),
        ],
      }
      : { due: [], thisWeek: [r0('jordan', 'Jordan', 5)], checkedIn: [] },
  });
});

test('three groups, the tick box and the visits line; a tick keeps the row in place with the note prompt under it; Save writes the note and the row moves', async () => {
  const r = await renderScreen(screen(), { path: '/portal/mental/contract' });
  expect(r.text()).toContain('Week of Nov 9');
  expect(r.text()).toContain('Due for a check-in · 1');
  expect(r.text()).toContain('This week · 1');
  expect(r.text()).toContain('Checked in this week · 1');
  expect(r.text()).toContain('At RYP: Tue 4:00 PM');
  const tick = r.button('Checked in · Nico');
  expect(tick.getAttribute('role')).toBe('checkbox');
  expect(tick.getAttribute('aria-checked')).toBe('false');
  expect(field(r, 'Check-in note · Nico')).toBeNull();
  await r.click('Checked in · Nico');
  await r.flush();
  expect(mockSetCheckin).toHaveBeenCalledWith({ athleteId: 'nico', checkedIn: true });
  // Ticked and prompted, but still where his thumb is: the row has not moved yet.
  expect(r.text()).toContain('This week · 1');
  expect(r.text()).toContain('Checked in this week · 1');
  expect(r.button('Checked in · Nico').getAttribute('aria-checked')).toBe('true');
  const box = field(r, 'Check-in note · Nico');
  expect(box).not.toBeNull();
  expect(document.activeElement).toBe(box);
  expect(r.container.querySelector('section:nth-of-type(2) [aria-label="Check-in note · Nico"]')).not.toBeNull();
  await r.fill('Check-in note · Nico', '  Quick word at pickup. ');
  await r.click('Save note · Nico');
  await r.flush();
  expect(mockSetCheckinNote).toHaveBeenCalledWith({ athleteId: 'nico', note: '  Quick word at pickup. ' });
  expect(field(r, 'Check-in note · Nico')).toBeNull();
  expect(r.text()).toContain('This week · 0');
  expect(r.text()).toContain('Checked in this week · 2');
  expect(r.text()).toContain('Note: Quick word at pickup.');
  // Jordan's stored note shows with an Edit; unticking writes false.
  expect(r.text()).toContain('Note: Spoke Monday.');
  expect(r.button('Edit note · Jordan')).not.toBeNull();
  await r.click('Checked in · Jordan');
  expect(mockSetCheckin).toHaveBeenCalledWith({ athleteId: 'jordan', checkedIn: false });
  r.unmount();
});

test("each row's prompt is its own: a second tick leaves the first open, un-ticking closes its own, Skip releases the row", async () => {
  const r = await renderScreen(screen(), { path: '/portal/mental/contract' });
  await r.click('Checked in · Nico');
  await r.flush();
  await r.click('Checked in · Reese');
  await r.flush();
  expect(field(r, 'Check-in note · Nico')).not.toBeNull();
  expect(field(r, 'Check-in note · Reese')).not.toBeNull();
  expect(r.text()).toContain('Due for a check-in · 1'); // Reese stays put while her prompt is open
  expect(r.text()).toContain('This week · 1');
  expect(r.text()).toContain('Checked in this week · 1');
  await r.click('Checked in · Nico'); // un-tick: his prompt goes, Reese's stays
  await r.flush();
  expect(mockSetCheckin).toHaveBeenLastCalledWith({ athleteId: 'nico', checkedIn: false });
  expect(field(r, 'Check-in note · Nico')).toBeNull();
  expect((r.text().match(/Note:/g) || []).length).toBe(1); // Jordan's stored note only; nothing for Nico
  expect(field(r, 'Check-in note · Reese')).not.toBeNull();
  await r.click('Skip note · Reese');
  await r.flush();
  expect(mockSetCheckinNote).not.toHaveBeenCalled();
  expect(field(r, 'Check-in note · Reese')).toBeNull();
  expect(r.text()).toContain('Due for a check-in · 0');
  expect(r.text()).toContain('Checked in this week · 2');
  r.unmount();
});

test('Edit reopens a stored note; a failed save says so and keeps the typed words through the optimistic flip and back; Skip closes without a write', async () => {
  holdNotes = true;
  const r = await renderScreen(screen(), { path: '/portal/mental/contract' });
  await r.click('Edit note · Jordan');
  expect(field(r, 'Check-in note · Jordan').value).toBe('Spoke Monday.');
  expect(document.activeElement).toBe(field(r, 'Check-in note · Jordan'));
  await r.fill('Check-in note · Jordan', 'Spoke Monday, again Tuesday.');
  await r.click('Save note · Jordan');
  // The hook's optimistic row now carries the new note (a render with it), then the write is refused and the row goes back.
  await r.rerender(screen());
  expect(notes.jordan).toBe('Spoke Monday, again Tuesday.');
  expect(field(r, 'Check-in note · Jordan').value).toBe('Spoke Monday, again Tuesday.');
  await r.act(async () => { heldNote.reject(Object.assign(new Error('offline'), { code: 'unavailable' })); });
  await r.flush();
  expect(notes.jordan).toBe('Spoke Monday.');
  expect(r.text()).toContain("That note didn't save");
  expect(field(r, 'Check-in note · Jordan').value).toBe('Spoke Monday, again Tuesday.');
  await r.click('Skip note · Jordan');
  expect(field(r, 'Check-in note · Jordan')).toBeNull();
  expect(r.text()).toContain('Note: Spoke Monday.');
  expect(mockSetCheckinNote).toHaveBeenCalledTimes(1);
  r.unmount();
});

test('a failed tick says so and does not leave a note prompt open', async () => {
  mockSetCheckin.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
  const r = await renderScreen(screen(), { path: '/portal/mental/contract' });
  await r.click('Checked in · Nico');
  await r.flush();
  expect(r.text()).toContain("That check-in didn't save");
  expect(field(r, 'Check-in note · Nico')).toBeNull();
  r.unmount();
});

test('the week switcher goes back, closes any open prompt, and the empty groups say so', async () => {
  const r = await renderScreen(screen(), { path: '/portal/mental/contract' });
  await r.click('Checked in · Nico');
  await r.flush();
  expect(field(r, 'Check-in note · Nico')).not.toBeNull();
  await r.click('Previous week');
  await r.flush();
  expect(r.text()).toContain('Week of Nov 2');
  expect(r.text()).toContain('No one is due');
  expect(r.text()).toContain('No check-ins that week');
  expect(r.button('Next week').disabled).toBe(false);
  expect(r.button('Checked in · Jordan')).not.toBeNull(); // a past week can still be ticked
  expect(r.container.querySelector('textarea')).toBeNull();
  r.unmount();
});

test('a past week is labelled as that week, never as this week; Due says it is as of today', async () => {
  const r = await renderScreen(screen(), { path: '/portal/mental/contract' });
  await r.click('Previous week');
  await r.flush();
  const text = r.text();
  expect(text).toContain('Due for a check-in, as of today · 0');
  expect(text).toContain('Not checked in that week · 1');
  expect(text).toContain('Checked in that week · 0');
  expect(text).toContain('Week of Nov 2 5/5');
  expect(text).toContain('Week before 0/5');
  expect(text).not.toMatch(/This week|Last week|this week/);
  await r.click('Next week');
  await r.flush();
  expect(r.text()).toContain('This week · 1');
  expect(r.text()).toContain('This week 2/5');
  expect(r.text()).toContain('Last week 0/5');
  r.unmount();
});

test('the switcher goes ahead up to four weeks: read-only, named as that week, and it says it is ahead', async () => {
  const r = await renderScreen(screen(), { path: '/portal/mental/contract' });
  await r.click('Next week');
  await r.flush();
  expect(r.text()).toContain('Week of Nov 16 · ahead');
  expect(r.text()).toContain('That week · 1');
  expect(r.text()).toContain('Check-ins open when the week starts');
  expect(r.text()).toContain('Week of Nov 16 5/5');
  expect(r.button('Checked in · Jordan')).toBeNull();
  for (let i = 0; i < 3; i += 1) {
    await r.click('Next week');
    await r.flush();
  }
  expect(r.text()).toContain('Week of Dec 7');
  expect(r.button('Next week').disabled).toBe(true);
  await r.click('Previous week');
  await r.flush();
  expect(r.button('Next week').disabled).toBe(false);
  r.unmount();
});

test('owner and ops see the board without the tick or Edit, notes included; the off switch shows a banner', async () => {
  mockBoard = () => ({
    config: { enabled: false, enabledAt: null },
    rows: { due: [], thisWeek: [], checkedIn: [{ ...r0('jordan', 'Jordan', 4), checkedInThisWeek: true, note: 'Spoke Monday.' }] },
  });
  const r = await renderScreen(<MentalContract bare role="owner" />, { path: '/portal/mental/contract' });
  expect(r.button('Checked in · Jordan')).toBeNull();
  expect(r.text()).toContain('Note: Spoke Monday.');
  expect(r.button('Edit note · Jordan')).toBeNull();
  expect(r.text()).toContain('The contract switch is off');
  r.unmount();
});
