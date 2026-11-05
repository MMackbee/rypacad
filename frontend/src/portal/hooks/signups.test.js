/**
 * hooks/signups.js in live mode (review 2026-11-04 follow-up): an unmatched
 * Calendly booking keeps its created row 'unresolved' after the family
 * cancels or moves it on Calendly, so the report also reads the cancel rows
 * and the held sessions, and leaves a booking that no longer holds its time
 * off the Unmatched card. data/signups.test.js covers the builder; this pins
 * the queries that feed it.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
// Plain functions, not jest.fn(): CRA's resetMocks would clear them before every test.
jest.mock('firebase/firestore', () => ({
  collection: (_db, col) => ({ col }),
  doc: (_db, col, id) => ({ col, id }),
  orderBy: (field) => ({ orderBy: field }),
  where: (field, op, value) => ({ where: [field, op, value] }),
  query: (ref, ...cons) => ({ col: ref.col, cons }),
  getDocs: async (q) => {
    const wheres = (q.cons ?? []).filter((c) => c.where).map((c) => c.where);
    mockQueries.push([q.col, ...wheres.map(([f, op, v]) => `${f} ${op} ${JSON.stringify(v)}`)].join(' '));
    const match = (d) => wheres.every(([f, op, v]) => (op === 'in' ? v.includes(d[f]) : d[f] === v));
    return { docs: Object.entries(mockStore[q.col] ?? {}).filter(([, d]) => match(d)).map(([id, data]) => ({ id, data: () => data })) };
  },
}));
jest.mock('./invalidate', () => ({ __esModule: true, bump: () => {}, useInvalidation: () => 0 }));
jest.mock('./live', () => ({ ...jest.requireActual('./live'), __esModule: true, isLive: () => true, fetchAllAthletes: async () => [] }));

import useSignups from './signups';

let mockStore;
let mockQueries;

const flush = async () => { for (let i = 0; i < 12; i += 1) await act(async () => {}); };
async function mountHook(useHook) {
  const result = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  await flush();
  return { result, unmount: () => act(async () => root.unmount()) };
}

beforeEach(() => {
  mockQueries = [];
  const created = (eventId, date) => ({
    event: 'invitee.created', outcome: 'unresolved', householdId: null, eventUri: `https://api.calendly.com/scheduled_events/${eventId}`,
    slot: { date, time: '4:00 PM', durationMinutes: 30 },
  });
  mockStore = {
    calendlyEvents: {
      'inv-held_invitee.created': created('ev-held', '2026-11-10'),
      'inv-gone_invitee.created': created('ev-gone', '2026-11-12'),
      'inv-gone_invitee.canceled': { event: 'invitee.canceled', outcome: 'applied-unmatched', householdId: null },
      'inv-freed_invitee.created': created('ev-freed', '2026-11-13'),
      // Owner ruling 2026-11-04: another of Yannick's event types, and its cancel.
      'inv-info_invitee.created': { event: 'invitee.created', outcome: 'other-event', invitee: null, eventName: '15 Minute Info Call',
        eventUri: 'https://api.calendly.com/scheduled_events/ev-info', slot: { date: '2026-11-14', time: '4:00 PM', durationMinutes: 15 } },
      'inv-info_invitee.canceled': { event: 'invitee.canceled', outcome: 'other-event', invitee: null, eventName: '15 Minute Info Call' },
    },
    sessions: {
      'cal-ev-held': { unresolved: true, status: 'scheduled', booked: 1 },
      'cal-ev-gone': { unresolved: true, status: 'cancelled', booked: 0 },
      // Released in the app: no cancel row on the ledger.
      'cal-ev-freed': { unresolved: true, status: 'cancelled', booked: 0 },
      '2026-11-10-1': { type: 'training', status: 'scheduled' },
    },
  };
});

test('the report reads the Calendly cancel rows and the held sessions, and leaves off what is no longer held and other event types', async () => {
  const { result, unmount } = await mountHook(useSignups);
  expect(result.current.error).toBeNull();
  expect(mockQueries).toContain('calendlyEvents outcome == "unresolved"');
  expect(mockQueries).toContain('calendlyEvents event == "invitee.canceled"');
  expect(mockQueries).toContain('sessions unresolved == true');
  expect(result.current.data.unresolved.map((e) => e.id)).toEqual(['inv-held_invitee.created']);
  expect(result.current.data.counts.unresolved).toBe(1);
  await unmount();
});
