import { attendeeContact, calendlyBlockReason } from './specialistGate';

const ok = { billingStatus: 'active', bookingOpen: true, tokens: { left: 2, unlimited: false, grace: [] }, capReached: false };
test('gate order: billing, open, cadence, tokens (spec 6.1)', () => {
  expect(calendlyBlockReason(ok)).toBeNull();
  expect(calendlyBlockReason({ ...ok, billingStatus: 'pending' })).toBe('billing-pending');
  expect(calendlyBlockReason({ ...ok, billingStatus: 'past_due' })).toBe('membership-inactive');
  expect(calendlyBlockReason({ ...ok, billingStatus: undefined })).toBeNull();
  expect(calendlyBlockReason({ ...ok, bookingOpen: false })).toBe('booking-not-open');
  expect(calendlyBlockReason({ ...ok, capReached: true })).toBe('cap-reached');
  expect(calendlyBlockReason({ ...ok, tokens: { left: 0, unlimited: false, grace: [] } })).toBe('no-tokens-left');
  expect(calendlyBlockReason({ ...ok, tokens: { left: 0, unlimited: false, grace: [{ id: 'g' }] } })).toBeNull();
  expect(calendlyBlockReason({ ...ok, tokens: { left: null, unlimited: true, grace: [] } })).toBeNull();
});
test('a single-token athlete with none left is told to buy one (ruling 2026-09-29/30)', () => {
  const none = { left: 0, unlimited: false, grace: [], perPurchase: true };
  expect(calendlyBlockReason({ ...ok, tokens: none })).toBe('no-session-token');
  expect(calendlyBlockReason({ ...ok, tokens: { ...none, grace: [{ id: 'single_cs_1', reason: 'single-purchase' }] } })).toBeNull();
  expect(calendlyBlockReason({ ...ok, tokens: { ...none, left: 1 } })).toBeNull(); // an ops comp
  expect(calendlyBlockReason({ ...ok, billingStatus: 'pending', tokens: none })).toBe('billing-pending');
});
test("the attendee's own name and email go to Calendly", () => {
  const athlete = { id: 'a1', name: 'Jordan', loginEmail: null };
  const guardian = { name: 'Dana', email: 'dana@email.com' };
  expect(attendeeContact({ attendee: 'parent', athlete, guardian })).toEqual({ name: 'Dana', email: 'dana@email.com' });
  expect(attendeeContact({ attendee: 'athlete', athlete, guardian })).toEqual({ name: 'Jordan', email: 'dana@email.com' });
  expect(attendeeContact({ attendee: 'athlete', athlete: { ...athlete, loginEmail: 'j@email.com' }, guardian })).toEqual({ name: 'Jordan', email: 'j@email.com' });
});
