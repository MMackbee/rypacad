import React from 'react';
import { renderScreen } from '../../screens/testRender';
import BoardRow from './BoardRow';
import WeekDots from './WeekDots';

const days = [
  { date: '2026-11-09', state: 'met', minutes: 10 }, { date: '2026-11-10', state: 'met', minutes: 10 }, { date: '2026-11-11', state: 'short', minutes: 5 },
  { date: '2026-11-12', state: 'none', minutes: 0 }, { date: '2026-11-13', state: 'none', minutes: 0 },
];
const row = { athleteId: 'nico', name: 'Nico Whitfield', age: 9, required: 10, thisWeek: { metDays: 2, days }, lastWeek: { metDays: 5, days }, lastCheckin: '2026-11-04', checkedInThisWeek: false, daysSince: 7 };

test('seven dots: five weekdays by state, two muted weekend dots', async () => {
  const r = await renderScreen(<WeekDots days={days} />, { path: '/x' });
  const dots = r.container.querySelectorAll('[data-dot]');
  expect(dots).toHaveLength(7);
  expect([...dots].map((d) => d.getAttribute('data-dot'))).toEqual(['met', 'met', 'short', 'none', 'none', 'weekend', 'weekend']);
  expect(dots[0].getAttribute('aria-label')).toBe('Mon met');
  r.unmount();
});

test('a row with the toggle fires onToggle once per tap', async () => {
  const onToggle = jest.fn();
  const r = await renderScreen(<BoardRow row={row} canToggle onToggle={onToggle} />, { path: '/x' });
  expect(r.text()).toContain('Age 9 · 10 min');
  expect(r.text()).toContain('This week 2/5');
  expect(r.text()).toContain('Last week 5/5 · Last check-in Nov 4');
  await r.click('Checked in · Nico Whitfield');
  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(onToggle).toHaveBeenCalledWith(true);
  r.unmount();
});

test('read-only row: no toggle; a due row says how many days', async () => {
  const r = await renderScreen(<BoardRow row={{ ...row, lastCheckin: null, daysSince: 22 }} canToggle={false} />, { path: '/x' });
  expect(r.button('Checked in · Nico Whitfield')).toBeNull();
  expect(r.text()).toContain('Never checked in · 22 days');
  r.unmount();
});
