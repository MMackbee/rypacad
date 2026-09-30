/**
 * The staff "Cancel session" write plan (hooks/grace.js planCancelSession),
 * pinned without Firestore: single tokens come back without a bonus, a
 * session the calendar sync already cancelled is not rewritten, and one
 * bonus per athlete (owner ruling 2026-09-29/30). Firebase is mocked out.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({}));

import { planCancelSession } from './grace';

const booking = (id, athleteId, over = {}) => ({ id, athleteId, householdId: 'h1', status: 'confirmed', ...over });
const kinds = (ops) => ops.map((op) => (op.booking ? `${op.kind}:${op.booking.id}` : op.kind));

test('a single_ booking is cancelled with no bonus; a period booking gets one', () => {
  const ops = planCancelSession(
    [booking('b-single', 'ava', { chargedFrom: 'grace', graceTokenId: 'single_cs_1' }), booking('b-period', 'ben', { chargedFrom: 'period' })],
    []
  );
  expect(kinds(ops)).toEqual(['session', 'booking:b-single', 'booking:b-period', 'grace:b-period']);
});

test('a booking paid with a bonus token still mints a new bonus', () => {
  const ops = planCancelSession([booking('b-bonus', 'cy', { chargedFrom: 'grace', graceTokenId: 'grace-1' })], []);
  expect(kinds(ops)).toEqual(['session', 'booking:b-bonus', 'grace:b-bonus']);
});

test('no session write when the calendar sync already cancelled the session', () => {
  const ops = planCancelSession([booking('b1', 'ava')], [], { sessionAlreadyCancelled: true });
  expect(kinds(ops)).toEqual(['booking:b1', 'grace:b1']);
  expect(planCancelSession([], [], { sessionAlreadyCancelled: true })).toEqual([]);
  expect(kinds(planCancelSession([], []))).toEqual(['session']);
});

test('one bonus per athlete: an athlete already graced for this session gets none', () => {
  const ops = planCancelSession([booking('b1', 'ava'), booking('b2', 'ava'), booking('b3', 'ben')], [{ id: 'g0', athleteId: 'ben' }]);
  expect(kinds(ops)).toEqual(['session', 'booking:b1', 'grace:b1', 'booking:b2', 'booking:b3']);
});
