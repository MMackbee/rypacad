/**
 * The Facility door staff screen's Firestore half (spec 4, 6): it reads
 * doorConfig/main, doorPauses and the latest 50 doorEvents, and writes
 * doorConfig/main and doorPauses exactly as firestore.rules allows - only
 * the listed keys, the server's time, the signed-in uid. Seed mode touches
 * no Firestore. Plain functions, not jest.fn(): CRA's resetMocks would clear them.
 */
jest.mock('firebase/firestore', () => ({
  doc: (db, ...path) => ({ path: path.join('/') }),
  collection: (db, name) => ({ path: name }),
  query: (ref, ...parts) => ({ path: ref.path, parts }),
  orderBy: (field, dir) => ['orderBy', field, dir],
  limit: (n) => ['limit', n],
  serverTimestamp: () => 'SERVER_TIME',
  getDoc: async (ref) => mockRead(ref.path),
  getDocs: async (q) => mockList(q),
  setDoc: async (ref, data, opts) => mockWrite(opts ? ['set', ref.path, data, opts] : ['set', ref.path, data]),
  deleteDoc: async (ref) => mockWrite(['delete', ref.path]),
}));
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  isLive: () => mockLive,
  requireUser: () => ({ uid: 'owner-uid' }),
}));

let mockLive;
let mockConfig;
let mockPauses;
let mockEvents;
let mockEventsFail;
let mockWriteFail;
const mockLog = [];
function mockRead(path) {
  mockLog.push(['get', path]);
  return { exists: () => mockConfig != null, data: () => mockConfig };
}
function mockList(q) {
  mockLog.push(['list', q.path, q.parts || []]);
  if (q.path === 'doorEvents' && mockEventsFail) throw Object.assign(new Error('no index'), { code: 'failed-precondition' });
  const rows = q.path === 'doorPauses' ? mockPauses : mockEvents;
  return { docs: rows.map((r) => ({ id: r.id, data: () => r.data })) };
}
let mockClock = 100;
/** Records the write; a config write lands in mockConfig the way Firestore stores it (merge or whole). */
function mockWrite(entry) {
  mockLog.push(entry);
  if (mockWriteFail) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
  const [kind, path, data, opts] = entry;
  if (kind === 'set' && path === 'doorConfig/main') {
    const stored = { ...data, updatedAt: { toMillis: () => (mockClock += 1) } };
    mockConfig = opts && opts.merge ? { ...(mockConfig || {}), ...stored } : stored;
  }
}

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useDoorAdmin } from './doorAdmin';

beforeEach(() => {
  mockLive = true;
  mockConfig = { mode: 'staff', lat: 44.97, lng: -93.26, radiusM: 200, openSeconds: 5, updatedAt: { toMillis: () => 1 }, updatedByUid: 'ops-uid' };
  mockPauses = [{ id: 'hh-hart', data: { householdId: 'hh-hart', pausedAt: { toMillis: () => 2 }, pausedByUid: 'ops-uid' } }];
  mockEvents = [{ id: 'u1_p1', data: { uid: 'u1', name: 'Dana Hart', atMs: 3, outcome: 'opened' } }];
  mockEventsFail = false;
  mockWriteFail = false;
  mockLog.length = 0;
});

async function mount() {
  const out = { current: null };
  function Probe() {
    out.current = useDoorAdmin();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  return { out, unmount: () => act(async () => root.unmount()) };
}
const writes = () => mockLog.filter(([kind]) => kind === 'set' || kind === 'delete');

test('seed mode: Off, no location, nothing paused, no activity, and no Firestore', async () => {
  mockLive = false;
  const h = await mount();
  expect(h.out.current).toMatchObject({ loading: false, error: null, pauses: [], events: [] });
  expect(h.out.current.config).toMatchObject({ mode: 'off', lat: null, lng: null, radiusM: 200, openSeconds: 5 });
  await act(async () => { await h.out.current.saveConfig({ mode: 'staff' }); });
  expect(h.out.current.config.mode).toBe('staff');
  expect(mockLog).toEqual([]);
  await h.unmount();
});

test('live: the config, the pauses and the latest 50 events, newest first', async () => {
  const h = await mount();
  expect(mockLog).toContainEqual(['get', 'doorConfig/main']);
  expect(mockLog).toContainEqual(['list', 'doorPauses', []]);
  expect(mockLog).toContainEqual(['list', 'doorEvents', [['orderBy', 'atMs', 'desc'], ['limit', 50]]]);
  expect(h.out.current.config).toMatchObject({ mode: 'staff', lat: 44.97, radiusM: 200 });
  expect(h.out.current.pauses).toEqual([{ householdId: 'hh-hart', pausedAt: mockPauses[0].data.pausedAt, pausedByUid: 'ops-uid' }]);
  expect(h.out.current.events).toEqual([{ id: 'u1_p1', uid: 'u1', name: 'Dana Hart', atMs: 3, outcome: 'opened' }]);
  await h.unmount();
});

test('no doorConfig/main reads Off', async () => {
  mockConfig = null;
  const h = await mount();
  expect(h.out.current.config).toMatchObject({ mode: 'off', lat: null, lng: null });
  await h.unmount();
});

test('a config write is only the change, merged, with the server time and the signed-in uid', async () => {
  const h = await mount();
  await act(async () => { await h.out.current.saveConfig({ mode: 'all' }); });
  expect(writes()).toEqual([['set', 'doorConfig/main', { mode: 'all', updatedAt: 'SERVER_TIME', updatedByUid: 'owner-uid' }, { merge: true }]]);
  expect(h.out.current.config).toMatchObject({ mode: 'all', lat: 44.97, lng: -93.26, radiusM: 200 });
  await act(async () => { await h.out.current.saveConfig({ lat: 44.98, lng: -93.27 }); });
  expect(writes()[1][2]).toEqual({ lat: 44.98, lng: -93.27, updatedAt: 'SERVER_TIME', updatedByUid: 'owner-uid' });
  await h.unmount();
});

test('a screen loaded before another staff change never undoes it, and shows it once saved', async () => {
  // Review 2026-11-17 (rules-1, app-2): ops' screen still shows Staff only
  // when the owner taps Off on their own phone; ops then changes the reach.
  const h = await mount();
  mockConfig = { ...mockConfig, mode: 'off', updatedByUid: 'other-uid' };
  await act(async () => { await h.out.current.saveConfig({ radiusM: 300 }); });
  expect(writes()).toEqual([['set', 'doorConfig/main', { radiusM: 300, updatedAt: 'SERVER_TIME', updatedByUid: 'owner-uid' }, { merge: true }]]);
  expect(mockConfig).toMatchObject({ mode: 'off', lat: 44.97, lng: -93.26, radiusM: 300 });
  expect(h.out.current.config).toMatchObject({ mode: 'off', radiusM: 300 });
  await h.unmount();
});

test('the config and the pauses are read again when the page comes back into view', async () => {
  const h = await mount();
  mockConfig = { ...mockConfig, mode: 'off' };
  mockPauses = [];
  const hidden = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
  let state = 'hidden';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  try {
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(h.out.current.config.mode).toBe('staff');
    state = 'visible';
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(h.out.current.config.mode).toBe('off');
    expect(h.out.current.pauses).toEqual([]);
  } finally {
    delete document.visibilityState;
    if (hidden) Object.defineProperty(Document.prototype, 'visibilityState', hidden);
  }
  await h.unmount();
});

test('Everyone before the location is set is refused here, nothing written', async () => {
  mockConfig = { mode: 'staff' };
  const h = await mount();
  let err;
  await act(async () => { err = await h.out.current.saveConfig({ mode: 'all' }).catch((e) => e); });
  expect(err.message).toBe('Set the academy location first.');
  expect(writes()).toEqual([]);
  await h.unmount();
});

test('two quick changes both land, each its own merge', async () => {
  const h = await mount();
  await act(async () => {
    await Promise.all([h.out.current.saveConfig({ radiusM: 300 }), h.out.current.saveConfig({ openSeconds: 8 })]);
  });
  expect(writes().map((w) => w[2])).toEqual([
    { radiusM: 300, updatedAt: 'SERVER_TIME', updatedByUid: 'owner-uid' },
    { openSeconds: 8, updatedAt: 'SERVER_TIME', updatedByUid: 'owner-uid' },
  ]);
  expect(mockConfig).toMatchObject({ radiusM: 300, openSeconds: 8 });
  expect(h.out.current.config).toMatchObject({ radiusM: 300, openSeconds: 8 });
  await h.unmount();
});

test('a refused write puts the config back and says so', async () => {
  const h = await mount();
  mockWriteFail = true;
  let err;
  await act(async () => { err = await h.out.current.saveConfig({ radiusM: 500 }).catch((e) => e); });
  expect(err).toBeTruthy();
  expect(h.out.current.config.radiusM).toBe(200);
  await h.unmount();
});

test('pause: one doorPauses doc for the household; unpause deletes it', async () => {
  const h = await mount();
  let answer;
  await act(async () => { answer = await h.out.current.pause('hh-lee'); });
  expect(answer).toBe('paused');
  expect(writes()).toEqual([['set', 'doorPauses/hh-lee', { householdId: 'hh-lee', pausedAt: 'SERVER_TIME', pausedByUid: 'owner-uid' }]]);
  expect(h.out.current.pauses.map((p) => p.householdId)).toEqual(['hh-hart', 'hh-lee']);
  await act(async () => { await h.out.current.unpause('hh-hart'); });
  expect(writes()[1]).toEqual(['delete', 'doorPauses/hh-hart']);
  expect(h.out.current.pauses.map((p) => p.householdId)).toEqual(['hh-lee']);
  await h.unmount();
});

test('pausing a family someone else already paused: the list is read again and it is "already"', async () => {
  // Review 2026-11-17 (rules-2): the rules allow no update of a pause, so
  // the second create is refused; that is not a connection problem.
  const h = await mount();
  mockPauses = [...mockPauses, { id: 'hh-lee', data: { householdId: 'hh-lee', pausedAt: { toMillis: () => 5 }, pausedByUid: 'ops-uid' } }];
  mockWriteFail = true;
  let answer;
  await act(async () => { answer = await h.out.current.pause('hh-lee'); });
  expect(answer).toBe('already');
  expect(h.out.current.pauses.map((p) => p.householdId)).toEqual(['hh-hart', 'hh-lee']);
  await h.unmount();
});

test('a pause that fails and is not there still fails', async () => {
  const h = await mount();
  mockWriteFail = true;
  let err;
  await act(async () => { err = await h.out.current.pause('hh-lee').catch((e) => e); });
  expect(err).toBeInstanceOf(Error);
  expect(h.out.current.pauses.map((p) => p.householdId)).toEqual(['hh-hart']);
  await h.unmount();
});

test('activity failing to load leaves the rest of the screen working', async () => {
  mockEventsFail = true;
  const h = await mount();
  expect(h.out.current.error).toBeNull();
  expect(h.out.current.config.mode).toBe('staff');
  expect(h.out.current.events).toBeNull();
  expect(h.out.current.eventsError).toBeTruthy();
  mockEventsFail = false;
  await act(async () => { await h.out.current.refreshEvents(); });
  expect(h.out.current.events).toHaveLength(1);
  expect(h.out.current.eventsError).toBeNull();
  await h.unmount();
});

test('no write before the stored config has loaded (it would overwrite it with the defaults)', async () => {
  let release;
  const slow = new Promise((resolve) => { release = resolve; });
  const realConfig = mockConfig;
  mockConfig = undefined;
  const firestore = require('firebase/firestore');
  const getDocBefore = firestore.getDoc;
  firestore.getDoc = async (ref) => { await slow; mockConfig = realConfig; return mockRead(ref.path); };
  try {
    const h = await mount();
    expect(h.out.current.loading).toBe(true);
    let err;
    await act(async () => { err = await h.out.current.saveConfig({ mode: 'off' }).catch((e) => e); });
    expect(err).toBeInstanceOf(Error);
    expect(writes()).toEqual([]);
    await act(async () => { release(); });
    await h.unmount();
  } finally {
    firestore.getDoc = getDocBefore;
  }
});
