/**
 * The workshop card's "Check for the link" feedback (hq card 5, fix round 3): a check that finds no link
 * leaves a quiet line (card.note); it goes when the card's state changes, when a link is found and on the
 * next tap. Plain functions, not jest.fn(): CRA's resetMocks would clear them.
 */
jest.mock('firebase/firestore', () => ({
  collection: (db, name) => ({ col: name }),
  doc: (db, col, id) => ({ col, id }),
  query: (ref, ...parts) => ({ col: ref.col, where: parts.filter((p) => p && p.kind === 'where') }),
  where: (field, op, value) => ({ kind: 'where', field, op, value }),
  serverTimestamp: () => 'SERVER_TIME',
  getDocs: async (q) => ({ docs: Object.entries(mockStore[q.col]).filter(([, d]) => q.where.every((w) => d[w.field] === w.value)).map(([id, d]) => ({ id, data: () => d })) }),
  getDoc: async (ref) => {
    if (mockHoldLink && ref.col === 'eventLinks') await mockHoldLink;
    const d = mockStore[ref.col][ref.id];
    return { exists: () => d !== undefined, data: () => d };
  },
  setDoc: async (ref, data) => { mockStore[ref.col][ref.id] = data; },
  deleteDoc: async (ref) => { delete mockStore[ref.col][ref.id]; },
}));
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  isLive: () => true,
  requireUser: () => ({ uid: 'u-probe', getIdTokenResult: async () => ({ claims: { email: 'probe@example.com' } }) }),
}));

let mockStore;
let mockHoldLink;
const LINK = 'https://example.com/workshop-link-placeholder';
// Monday Nov 23 2026, 8:00 to 8:45 PM Central.
const START = Date.UTC(2026, 10, 24, 2, 0, 0);
const END = START + 45 * 60000;
const HOUR = 3600000;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { NO_LINK_YET } from '../data/events';
import { useEvents } from './events';

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(START - HOUR);
  mockHoldLink = null;
  mockStore = {
    events: { e1: { enabled: true, title: 'Probe workshop', startsAt: new Date(START), endsAt: new Date(END) } },
    eventSignups: { 'e1_u-probe': { eventId: 'e1', uid: 'u-probe', email: 'probe@example.com', name: 'Probe Person', createdAt: new Date(0) } },
    eventLinks: {},
    users: { 'u-probe': { role: 'parent', displayName: 'Probe Person' } },
  };
});
afterEach(() => { jest.useRealTimers(); });

async function mount() {
  const out = { current: null };
  function Probe() {
    out.current = useEvents();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  return { out, unmount: () => act(async () => root.unmount()) };
}
const card = (h) => h.out.current.cards.find((c) => c.id === 'e1');
const check = (h) => act(async () => { await h.out.current.checkLink('e1'); });

test('a check that finds no link leaves the quiet line, and nothing before it', async () => {
  const h = await mount();
  expect(card(h).note).toBeNull();
  await check(h);
  expect(card(h).note).toBe(NO_LINK_YET);
  expect(card(h).error).toBeNull();
  await h.unmount();
});

test('a link that is not https counts as no link', async () => {
  mockStore.eventLinks.e1 = { meetUrl: 'http://example.com/not-secure' };
  const h = await mount();
  await check(h);
  expect(card(h).note).toBe(NO_LINK_YET);
  await h.unmount();
});

test('a link found takes the line away', async () => {
  const h = await mount();
  await check(h);
  mockStore.eventLinks.e1 = { meetUrl: LINK };
  await check(h);
  expect(card(h).note).toBeNull();
  expect(card(h).view.primary.action).toBe('join');
  await h.unmount();
});

test('the next tap takes the line away while it runs, and a second miss puts it back', async () => {
  const h = await mount();
  await check(h);
  expect(card(h).note).toBe(NO_LINK_YET);
  let release;
  mockHoldLink = new Promise((r) => { release = r; });
  let pending;
  await act(async () => { pending = h.out.current.checkLink('e1'); });
  expect(card(h).busy).toBe('check');
  expect(card(h).note).toBeNull();
  await act(async () => { release(); await pending; });
  expect(card(h).note).toBe(NO_LINK_YET);
  await h.unmount();
});

test('the line goes when the card\'s state changes by time', async () => {
  const h = await mount();
  await check(h);
  expect(card(h).note).toBe(NO_LINK_YET);
  const before = card(h).view.status;
  await act(async () => { jest.advanceTimersByTime(HOUR); }); // the start: the status words change
  expect(card(h).view.status).not.toBe(before);
  expect(card(h).note).toBeNull();
  await h.unmount();
});

test('the line goes when the card is taken back', async () => {
  const h = await mount();
  await check(h);
  expect(card(h).note).toBe(NO_LINK_YET);
  await act(async () => { await h.out.current.takeBack('e1'); });
  expect(card(h).note).toBeNull();
  await h.unmount();
});
