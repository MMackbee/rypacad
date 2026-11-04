import React from 'react';
import { renderScreen } from './testRender';

let mockSessions;
jest.mock('../hooks', () => ({
  useSpecialistSessions: () => ({ data: { sessions: mockSessions }, loading: false, error: null }),
  useSelfManaged: () => false,
}));
import SpecialistDay, { UNMATCHED_META } from './SpecialistDay';

beforeEach(() => {
  jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-11-11T15:00:00'));
  mockSessions = [
    { sessionId: 'cal-c', date: '2026-11-17', dayLabel: 'Tue Nov 17', time: '5:00 PM', booked: 1, capacity: 1, type: 'mental', durationMinutes: 30, athletes: [{ athleteId: 'jordan', name: 'Jordan', attendee: 'athlete' }] },
    { sessionId: 'cal-d', date: '2026-11-19', dayLabel: 'Thu Nov 19', time: '4:00 PM', booked: 0, capacity: 1, type: 'mental', durationMinutes: 30, athletes: [] },
  ];
});
afterEach(() => jest.useRealTimers());

test('a mental row with an athlete gets a Note chip that opens the note without opening attendance', async () => {
  const onOpenNote = jest.fn();
  const onOpenSession = jest.fn();
  const r = await renderScreen(<SpecialistDay bare specialistId="mental" role="mental" onOpenNote={onOpenNote} onOpenSession={onOpenSession} />, { path: '/portal/my-sessions' });
  expect(r.container.querySelectorAll('button').length).toBeGreaterThan(0);
  await r.click('Note');
  expect(onOpenNote).toHaveBeenCalledWith({ athleteId: 'jordan', sessionId: 'cal-c', sessionDate: '2026-11-17', athleteName: 'Jordan' });
  expect(onOpenSession).not.toHaveBeenCalled();
  r.unmount();
});

test('a Calendly booking the webhook could not match shows as held, 1/1, with no Note chip (2026-11-04)', async () => {
  mockSessions = [
    ...mockSessions,
    { sessionId: 'cal-u', date: '2026-11-11', dayLabel: 'Today', time: '7:00 PM', booked: 1, capacity: 1, type: 'mental', durationMinutes: 45, athletes: [], unresolved: true },
    { sessionId: 'cal-v', date: '2026-11-20', dayLabel: 'Fri Nov 20', time: '3:30 PM', booked: 1, capacity: 1, type: 'mental', durationMinutes: 45, athletes: [], unresolved: true },
  ];
  const r = await renderScreen(<SpecialistDay bare specialistId="mental" role="mental" onOpenNote={jest.fn()} />, { path: '/portal/my-sessions' });
  const text = r.text();
  expect((text.match(new RegExp(UNMATCHED_META.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length).toBe(2); // the pinned Today row and the list row
  expect(text).toContain('No one booked yet'); // cal-d, a real open slot, reads as before
  expect(text).toContain('1/1');
  expect([...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Note').length).toBe(1); // Jordan's Note chip only; none on a held row
  r.unmount();
});

test('Phil and an ops switcher see no Note chip', async () => {
  const phil = await renderScreen(<SpecialistDay bare specialistId="phil" role="coach" onOpenNote={jest.fn()} />, { path: '/portal/my-sessions' });
  expect(phil.button('Note')).toBeNull();
  await phil.unmount(); // awaited: the next render must not overlap this act

  const ops = await renderScreen(<SpecialistDay bare specialistId="mental" role="ops" canSwitch onOpenNote={jest.fn()} />, { path: '/portal/my-sessions' });
  expect(ops.button('Note')).toBeNull();
  ops.unmount();
});
