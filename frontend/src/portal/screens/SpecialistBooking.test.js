import React from 'react';
import { renderScreen } from './testRender';
import SpecialistBooking from './SpecialistBooking';
import { addDaysISO, todayISO } from '../data/calendar';

let mockSlots;
jest.mock('../hooks', () => ({
  seedSpecialistDays: () => [],
  useSpecialistSlots: () => mockSlots,
  useBooking: () => ({ book: async () => ({}) }),
  useHouseholdAthletes: () => ({ data: [], loading: false }),
  useMembership: () => ({ data: { household: { id: 'h1' }, members: [] } }),
}));
jest.mock('../data/calendly', () => ({
  calendlyUrlFor: () => 'https://calendly.com/ryp/mental',
  calendlyLinkFor: ({ url, athleteId, athleteName, householdId, name, email }) =>
    `${url}?${new URLSearchParams({ name, email, a1: athleteName, utm_content: athleteId, utm_campaign: householdId })}`,
  CALENDLY_NOTE: "Yannick's confirmation, reminders and cancellations come from Calendly. The session appears on My Schedule within a minute and spends one token.",
}), { virtual: true });

beforeEach(() => {
  mockSlots = { loading: false, error: null, data: {
    days: [], tokens: { left: 3, unlimited: false, grace: [] }, capReached: false,
    bookingMode: 'calendly', calendlyUrl: 'https://calendly.com/ryp/mental', billingStatus: 'active', bookingOpen: true,
    athlete: { id: 'a1', name: 'Jordan', loginEmail: null }, guardian: { name: 'Dana', email: 'dana@email.com' }, householdId: 'h1',
  } };
});

test('Book with Yannick opens the prefilled link in a new tab, with the note', async () => {
  const opened = [];
  window.open = (url, target, features) => { opened.push([url, target, features]); return null; };
  const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  await r.click('Book with Yannick');
  expect(opened[0][1]).toBe('_blank');
  expect(opened[0][0]).toContain('utm_content=a1');
  expect(opened[0][0]).toContain('name=Jordan');
  await r.click('A parent');
  await r.click('Book with Yannick');
  expect(opened[1][0]).toContain('name=Dana');
  expect(r.text()).toContain('The session appears on My Schedule within a minute and spends one token.');
  await r.unmount();
});

test('gated copy replaces the button', async () => {
  mockSlots.data.billingStatus = 'pending';
  const p = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(p.button('Book with Yannick')).toBeNull();
  expect(p.text()).toContain('Payment pending - finish checkout to start booking');
  await p.unmount();
  mockSlots.data.billingStatus = 'active';
  mockSlots.data.bookingOpen = false;
  const g = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(g.text()).toContain('Booking opens Fri, Oct 10 at 7 AM');
  await g.unmount();
});

test('no Calendly url: the in-app slot list with real durations', async () => {
  // Two days out: inside the 30-day window whatever today is (a fixed date
  // past the window renders LockedDayNotice, not the slot list).
  mockSlots.data = { ...mockSlots.data, bookingMode: 'in-app', calendlyUrl: null,
    days: [{ date: addDaysISO(todayISO(), 2), dayLabel: 'Wed, Nov 4', slots: [{ sessionId: 's1', time: '4:00 PM', open: true, capacity: 1, booked: 0, durationMinutes: 30 }] }] };
  const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(r.button('Book with Yannick')).toBeNull();
  expect(r.text()).toContain('30 min');
  expect(r.text()).not.toContain('45 min');
  await r.unmount();
});
