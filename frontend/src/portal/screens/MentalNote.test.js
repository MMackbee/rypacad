import React from 'react';
import { renderScreen } from './testRender';

const mockSave = jest.fn();
const mockRemove = jest.fn();
let mockEntry;
let mockHookName = null;
jest.mock('../hooks', () => ({
  useMentalNote: () => ({ entry: mockEntry, athleteName: mockHookName, loading: false, error: null, save: mockSave, remove: mockRemove, saveState: 'idle', savedAt: null }),
  useSelfManaged: () => false,
}));
import MentalNote from './MentalNote';

beforeEach(() => { mockHookName = null; });

test('a session note: title with the date, whose note it is, the editor bound to save, delete goes back', async () => {
  mockEntry = { id: 'cal-b', body: 'Kept the routine.', sessionDate: '2026-11-10' };
  const onBack = jest.fn();
  const r = await renderScreen(<MentalNote bare athleteId="jordan" entryId="cal-b" sessionDate="2026-11-10" athleteName="Jordan Whitfield" onBack={onBack} />, { path: '/portal/mental/jordan/notes/cal-b' });
  expect(r.text()).toContain('Session note · Nov 10');
  expect(r.text()).toContain('Jordan Whitfield');
  expect(r.container.querySelector('textarea').value).toBe('Kept the routine.');
  await r.click('Delete note');
  await r.click('Yes, delete');
  await r.flush();
  expect(mockRemove).toHaveBeenCalledTimes(1);
  expect(onBack).toHaveBeenCalledTimes(1);
  r.unmount();
});

test('a new intake note has no delete and the intake title; a deep link takes the name from the hook', async () => {
  mockEntry = null;
  mockHookName = 'Nico Whitfield';
  const r = await renderScreen(<MentalNote bare athleteId="nico" entryId="intake" onBack={jest.fn()} />, { path: '/portal/mental/nico/notes/intake' });
  expect(r.text()).toContain('Intake note');
  expect(r.text()).toContain('Nico Whitfield');
  expect(r.text()).toContain('Not saved yet');
  expect(r.button('Delete note')).toBeNull();
  r.unmount();
});

test('text typed while the first save was in flight survives entry arriving (Review Focus 5)', async () => {
  // A new note: entry is null until the first autosave resolves and useMentalNote sets it. If the screen
  // keyed the editor on entry.id, that moment would remount NoteEditor and reset it to the saved body.
  mockEntry = null;
  const el = <MentalNote bare athleteId="nico" entryId="intake" athleteName="Nico Whitfield" onBack={jest.fn()} />;
  const r = await renderScreen(el, { path: '/portal/mental/nico/notes/intake' });
  await r.fill('Note', 'First line.');
  mockSave.mockClear();
  await r.fill('Note', 'First line. Typed during the save.');
  mockEntry = { id: 'intake', body: 'First line.', sessionDate: null };
  await r.rerender(el);
  expect(r.container.querySelector('textarea').value).toBe('First line. Typed during the save.');
  r.unmount();
});
