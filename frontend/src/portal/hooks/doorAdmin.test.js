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
  setDoc: async (ref, data) => mockWrite(['set', ref.path, data]),
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
function mockWrite(entry) {
  mockLog.push(entry);
  if (mockWriteFail) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
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

test('a config write is the whole doc: the listed keys, the server time, the signed-in uid', async () => {
  const h = await mount();
  await act(async () => { await h.out.current.saveConfig({ mode: 'all' }); });
  expect(writes()).toEqual([['set', 'doorConfig/main', {
    mode: 'all', lat: 44.97, lng: -93.26, radiusM: 200, openSeconds: 5, updatedAt: 'SERVER_TIME', updatedByUid: 'owner-uid',
  }]]);
  expect(h.out.current.config.mode).toBe('all');
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

test('two quick changes both land: the second builds on the first', async () => {
  const h = await mount();
  await act(async () => {
    await Promise.all([h.out.current.saveConfig({ radiusM: 300 }), h.out.current.saveConfig({ openSeconds: 8 })]);
  });
  expect(writes()[1][2]).toMatchObject({ radiusM: 300, openSeconds: 8 });
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
  await act(async () => { await h.out.current.pause('hh-lee'); });
  expect(writes()).toEqual([['set', 'doorPauses/hh-lee', { householdId: 'hh-lee', pausedAt: 'SERVER_TIME', pausedByUid: 'owner-uid' }]]);
  expect(h.out.current.pauses.map((p) => p.householdId)).toEqual(['hh-hart', 'hh-lee']);
  await act(async () => { await h.out.current.unpause('hh-hart'); });
  expect(writes()[1]).toEqual(['delete', 'doorPauses/hh-hart']);
  expect(h.out.current.pauses.map((p) => p.householdId)).toEqual(['hh-lee']);
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
