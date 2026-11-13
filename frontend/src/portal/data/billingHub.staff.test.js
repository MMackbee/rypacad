/**
 * What the staff booking tools read off the Billing hub (Task C0): each
 * row's session type (Move keeps to the same kind, a 1:1 never moves or
 * cancels here), the next period's rows (the staff view lists them, and a
 * cancel finds brothers and sisters there too) and the test athlete mark.
 * Kept out of billingHub.test.js, which is past the 500-line limit.
 */
import { hubMemberFor, periodRows } from './billingHub';
import { TOKEN_PACKAGES } from './packages';

const T6 = TOKEN_PACKAGES.find((p) => p.id === 't-6');
const today = '2026-11-12';
const athlete = { id: 'jordan', name: 'Jordan Whitfield', packageId: 't-6' };
const b = (id, over = {}) => ({ id, athleteId: 'jordan', sessionId: `s-${id}`, status: 'confirmed', periodKey: '2026-11-01', date: '2026-11-10', type: 'training', ...over });
const args = (over = {}) => ({ athlete, pkg: T6, bookings: [], waitlist: [], graceTokens: [], anchorDay: 1, today, ...over });

test("periodRows rows carry the type: the booking's own, else the session's, else null", () => {
  const { spent } = periodRows({
    bookings: [
      b('own', { date: '2026-11-03', type: 'phil', sessionId: 's1' }),
      b('session', { date: '2026-11-04', type: undefined, sessionId: 's2' }),
      b('neither', { date: '2026-11-05', type: undefined, sessionId: 's9' }),
    ],
    waitlist: [],
    periodKey: '2026-11-01',
    sessionsById: {
      s1: { id: 's1', type: 'training', date: '2026-11-03', time: '4:00 PM' },
      s2: { id: 's2', type: 'training', date: '2026-11-04', time: '4:00 PM' },
    },
  });
  expect(spent.map((r) => [r.id, r.type])).toEqual([['own', 'phil'], ['session', 'training'], ['neither', null]]);
});

test("hubMemberFor: nextSpent holds the next period's rows, as the next-period count reads them", () => {
  const m = hubMemberFor(args({
    bookings: [
      b('jordan_s1'),
      b('jordan_s9', { date: '2026-12-03', periodKey: '2026-12-01', sessionId: 's9' }),
      b('jordan_s10', { date: '2026-12-10', periodKey: '2026-12-01', status: 'cancelled' }),
      b('jordan_s20', { date: '2027-01-07', periodKey: '2027-01-01' }),
    ],
  }));
  expect(m.spent.map((r) => r.id)).toEqual(['jordan_s1']);
  expect(m.nextSpent.map((r) => [r.id, r.date, r.sessionId, r.type, r.status])).toEqual([['jordan_s9', '2026-12-03', 's9', 'training', 'confirmed']]);
  expect(m.nextSpent).toHaveLength(m.nextPeriod.booked);
  expect(hubMemberFor(args()).nextSpent).toEqual([]);
});

test('hubMemberFor: test is true only for an athlete marked test', () => {
  expect(hubMemberFor(args()).test).toBe(false);
  expect(hubMemberFor(args({ athlete: { ...athlete, test: true } })).test).toBe(true);
  expect(hubMemberFor(args({ athlete: { ...athlete, test: 'yes' } })).test).toBe(false);
});
