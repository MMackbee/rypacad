import React from 'react';
import { renderScreen } from '../../screens/testRender';
import BoardRow from './BoardRow';
import WeekDots from './WeekDots';

const days = [
  { date: '2026-11-09', state: 'met', minutes: 10 }, { date: '2026-11-10', state: 'met', minutes: 10 }, { date: '2026-11-11', state: 'short', minutes: 5 },
  { date: '2026-11-12', state: 'none', minutes: 0 }, { date: '2026-11-13', state: 'none', minutes: 0 },
];
const row = {
  athleteId: 'nico', name: 'Nico Whitfield', age: 9, required: 10, familyName: 'Whitfield family', thisWeek: { metDays: 2, days }, lastWeek: { metDays: 5, days },
  lastCheckin: '2026-11-04', checkedInThisWeek: false, note: null, visits: [], daysSince: 7,
};
const visits = [
  { date: '2026-11-10', dow: 'Tue', time: '4:00 PM', type: 'training' },
  { date: '2026-11-12', dow: 'Thu', time: '4:30 PM', type: 'mental' },
  { date: '2026-11-14', dow: 'Sat', time: '9:00 AM', type: 'tournament' },
];
const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);

test('seven dots: five weekdays by state, two muted weekend dots', async () => {
  const r = await renderScreen(<WeekDots days={days} />, { path: '/x' });
  const dots = r.container.querySelectorAll('[data-dot]');
  expect(dots).toHaveLength(7);
  expect([...dots].map((d) => d.getAttribute('data-dot'))).toEqual(['met', 'met', 'short', 'none', 'none', 'weekend', 'weekend']);
  expect(dots[0].getAttribute('aria-label')).toBe('Mon met');
  r.unmount();
});

test('a row with the tick box fires onToggle once per tap; the tick is a checkbox, not a switch', async () => {
  const onToggle = jest.fn();
  const r = await renderScreen(<BoardRow row={row} canToggle onToggle={onToggle} />, { path: '/x' });
  expect(r.text()).toContain('Age 9 · 10 min');
  expect(r.text()).not.toContain('Whitfield family'); // a full name needs no family hint
  expect(r.text()).toContain('This week 2/5');
  expect(r.text()).toContain('Last week 5/5 · Last check-in Nov 4');
  const tick = r.button('Checked in · Nico Whitfield');
  expect(tick.getAttribute('role')).toBe('checkbox');
  expect(tick.getAttribute('aria-checked')).toBe('false');
  expect(r.container.querySelector('[role="switch"]')).toBeNull();
  await r.click('Checked in · Nico Whitfield');
  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(onToggle).toHaveBeenCalledWith(true);
  r.unmount();
});

test('the family name shows beside a first-name-only athlete', async () => {
  const r = await renderScreen(<BoardRow row={{ ...row, name: 'Brooks', familyName: 'Erickson family' }} />, { path: '/x' });
  expect(r.text()).toContain('Brooks');
  expect(r.text()).toContain('Erickson family · Age 9 · 10 min');
  r.unmount();
});

test('the visits line names the days, times and kinds for that week; none reads not booked', async () => {
  const r = await renderScreen(<BoardRow row={{ ...row, visits }} />, { path: '/x' });
  expect(r.text()).toContain('At RYP: Tue 4:00 PM · Thu 4:30 PM 1:1 · Sat 9:00 AM Tour');
  expect(r.container.querySelector('[data-visits="some"]')).not.toBeNull();
  await r.rerender(<BoardRow row={row} />);
  expect(r.text()).toContain('At RYP: not booked');
  expect(r.container.querySelector('[data-visits="none"]')).not.toBeNull();
  r.unmount();
});

test('a past week row names that week and the one before, not this week and last week', async () => {
  const r = await renderScreen(<BoardRow row={row} weekLabel="Week of Oct 19" priorLabel="Week before" />, { path: '/x' });
  expect(r.text()).toContain('Week of Oct 19 2/5');
  expect(r.text()).toContain('Week before 5/5 · Last check-in Nov 4');
  expect(r.text()).not.toMatch(/This week|Last week/);
  await r.unmount();
});

test('read-only row: no tick, no Edit, the note still shows; a due row says how many days', async () => {
  const r = await renderScreen(<BoardRow row={{ ...row, lastCheckin: null, daysSince: 22, note: 'Spoke Monday.' }} canToggle={false} onEditNote={() => {}} />, { path: '/x' });
  expect(r.button('Checked in · Nico Whitfield')).toBeNull();
  expect(r.text()).toContain('Never checked in · 22 days');
  expect(r.text()).toContain('Note: Spoke Monday.');
  expect(r.button('Edit note · Nico Whitfield')).toBeNull();
  r.unmount();
});

test('a stored note shows with Edit for Yannick; the open composer starts from it, Save hands the text up, Skip closes', async () => {
  const onEditNote = jest.fn();
  const onSaveNote = jest.fn().mockResolvedValue(undefined);
  const onCloseNote = jest.fn();
  const checked = { ...row, checkedInThisWeek: true, note: 'Spoke Monday.' };
  const r = await renderScreen(<BoardRow row={checked} canToggle onEditNote={onEditNote} onSaveNote={onSaveNote} onCloseNote={onCloseNote} />, { path: '/x' });
  expect(r.text()).toContain('Note: Spoke Monday.');
  expect(field(r, 'Check-in note · Nico Whitfield')).toBeNull();
  await r.click('Edit note · Nico Whitfield');
  expect(onEditNote).toHaveBeenCalledTimes(1);
  await r.rerender(<BoardRow row={checked} canToggle noteOpen onEditNote={onEditNote} onSaveNote={onSaveNote} onCloseNote={onCloseNote} />);
  expect(field(r, 'Check-in note · Nico Whitfield').value).toBe('Spoke Monday.');
  expect(document.activeElement).toBe(field(r, 'Check-in note · Nico Whitfield')); // the prompt takes focus when it opens
  expect(r.text()).not.toContain('Note: Spoke Monday.'); // the composer replaces the line while open
  await r.fill('Check-in note · Nico Whitfield', 'Spoke Monday and Thursday.');
  // The row's note changes under an open composer (the hook's optimistic note, then the refused write putting the old one back): the draft stays.
  await r.rerender(<BoardRow row={{ ...checked, note: 'Spoke Monday and Thursday.' }} canToggle noteOpen onEditNote={onEditNote} onSaveNote={onSaveNote} onCloseNote={onCloseNote} />);
  await r.rerender(<BoardRow row={checked} canToggle noteOpen onEditNote={onEditNote} onSaveNote={onSaveNote} onCloseNote={onCloseNote} />);
  expect(field(r, 'Check-in note · Nico Whitfield').value).toBe('Spoke Monday and Thursday.');
  await r.click('Save note · Nico Whitfield');
  await r.flush();
  expect(onSaveNote).toHaveBeenCalledWith('Spoke Monday and Thursday.');
  await r.click('Skip note · Nico Whitfield');
  expect(onCloseNote).toHaveBeenCalledTimes(1);
  // A reader never sees the composer, even when asked to open it.
  await r.rerender(<BoardRow row={checked} canToggle={false} noteOpen onSaveNote={onSaveNote} onCloseNote={onCloseNote} />);
  expect(field(r, 'Check-in note · Nico Whitfield')).toBeNull();
  r.unmount();
});
