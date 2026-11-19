/**
 * The workshop card's Firestore half (hq card 5), through the real hook with only Firestore, the signed-in
 * user and isLive faked: nothing in seed and practice modes and on a failed read; one query for the enabled
 * events, one for the caller's own sign-ups (only when something will show), one link read per sign-up that
 * has not ended; signing up writes the five fields under the right id and then reads the link; a late
 * arrival; take-back; a failed write says so and a double tap sends one write; a link that is not https
 * opens nothing; a re-read when the page comes back (not within 30 s); the state moves by timer with no
 * network. Plain functions, not jest.fn(): CRA's resetMocks would clear them.
 */
jest.mock('firebase/firestore', () => ({
  collection: (db, name) => ({ col: name }),
  doc: (db, col, id) => ({ col, id }),
  query: (ref, ...parts) => ({ col: ref.col, where: parts.filter((p) => p && p.kind === 'where') }),
  where: (field, op, value) => ({ kind: 'where', field, op, value }),
  serverTimestamp: () => 'SERVER_TIME',
  getDocs: async (q) => mockGetDocs(q),
  getDoc: async (ref) => mockGetDoc(ref),
  setDoc: async (ref, data) => mockSetDoc(ref, data),
  deleteDoc: async (ref) => mockDeleteDoc(ref),
}));
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  isLive: () => mockLive,
  requireUser: () => mockUser,
}));

let mockLive;
let mockUser;
let mockStore;
let mockFail;
let mockLog;
let mockHold;
let mockHoldList;
let mockHoldLink;
const UID = 'u-probe';
const LINK = 'https://example.com/workshop-link-placeholder';
// Monday Nov 23 2026, 8:00 to 8:45 PM Central.
const START = Date.UTC(2026, 10, 24, 2, 0, 0);
const END = START + 45 * 60000;
const SEC = 1000;

const rows = (col) => Object.entries(mockStore[col]).map(([id, data]) => ({ id, data: () => data }));
async function mockGetDocs(q) {
  mockLog.push(['list', q.col, q.where.map((w) => [w.field, w.op, w.value])]);
  if (mockHoldList && q.col === 'events') await mockHoldList;
  if (mockFail.has(q.col)) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
  return { docs: rows(q.col).filter((r) => q.where.every((w) => r.data()[w.field] === w.value)) };
}
async function mockGetDoc(ref) {
  mockLog.push(['get', `${ref.col}/${ref.id}`]);
  if (mockHoldLink && ref.col === 'eventLinks') await mockHoldLink;
  if (mockFail.has(ref.col)) throw Object.assign(new Error('denied'), { code: 'permission-denied' });
  const data = mockStore[ref.col][ref.id];
  return { exists: () => data !== undefined, data: () => data };
}
async function mockSetDoc(ref, data) {
  mockLog.push(['set', `${ref.col}/${ref.id}`, data]);
  if (mockHold) await mockHold;
  if (mockFail.has('setDoc')) throw Object.assign(new Error('offline'), { code: 'unavailable' });
  if (mockStore[ref.col][ref.id] !== undefined) throw Object.assign(new Error('denied'), { code: 'permission-denied' }); // the rules have no update
  mockStore[ref.col][ref.id] = data;
}
async function mockDeleteDoc(ref) {
  mockLog.push(['delete', `${ref.col}/${ref.id}`]);
  if (mockHold) await mockHold;
  if (mockFail.has('deleteDoc')) throw Object.assign(new Error('offline'), { code: 'unavailable' });
  if (mockStore[ref.col][ref.id] === undefined) throw Object.assign(new Error('denied'), { code: 'permission-denied' }); // nothing to delete: the rules refuse
  delete mockStore[ref.col][ref.id];
}

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { RECHECK_MIN_MS, useEvents } from './events';

const event = (over = {}) => ({ enabled: true, title: 'Probe workshop', startsAt: new Date(START), endsAt: new Date(END), ...over });
const mineFor = (eventId) => ({ eventId, uid: UID, email: 'probe@example.com', name: 'Probe Person', createdAt: new Date(0) });

beforeEach(() => {
  jest.useFakeTimers('modern');
  jest.setSystemTime(START - 86400000);
  mockLive = true;
  mockUser = { uid: UID, getIdTokenResult: async () => ({ claims: { email: 'probe@example.com' } }) };
  mockStore = { events: { e1: event() }, eventSignups: {}, eventLinks: { e1: { meetUrl: LINK } }, users: { [UID]: { role: 'parent', displayName: 'Probe Person' } } };
  mockFail = new Set();
  mockLog = [];
  mockHold = null;
  mockHoldList = null;
  mockHoldLink = null;
});
// A test that fails before its own unmount must not leave a listener on document for the next one.
afterEach(async () => {
  for (const close of [...openMounts]) await close();
  jest.useRealTimers();
});

const openMounts = new Set();
async function mount(opts) {
  const out = { current: null };
  function Probe() {
    out.current = useEvents(opts);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  const unmount = async () => {
    openMounts.delete(unmount);
    await act(async () => root.unmount());
  };
  openMounts.add(unmount);
  return { out, unmount };
}
const settle = async () => { for (let i = 0; i < 25; i += 1) await Promise.resolve(); };
const lists = () => mockLog.filter(([k]) => k === 'list');
const gets = () => mockLog.filter(([k]) => k === 'get');
const writes = () => mockLog.filter(([k]) => k === 'set' || k === 'delete');
const card = (h, id = 'e1') => h.out.current.cards.find((c) => c.id === id);
// Modern fake timers move Date.now() with the timers, so the clock is advanced once, here.
const advance = (ms) => act(async () => { jest.advanceTimersByTime(ms); });

test('seed mode shows nothing and touches no Firestore', async () => {
  mockLive = false;
  const h = await mount();
  expect(h.out.current.cards).toEqual([]);
  await act(async () => { await h.out.current.signUp('e1'); });
  expect(mockLog).toEqual([]);
  await h.unmount();
});

test('the onboarding walkthrough shows nothing even when live', async () => {
  const h = await mount({ practice: true });
  expect(h.out.current.cards).toEqual([]);
  expect(mockLog).toEqual([]);
  await h.unmount();
});

test('a failed first read shows nothing and no error', async () => {
  mockFail.add('events');
  const h = await mount();
  expect(h.out.current.cards).toEqual([]);
  await h.unmount();
  mockFail = new Set(['eventSignups']);
  const h2 = await mount();
  expect(h2.out.current.cards).toEqual([]);
  await h2.unmount();
});

test('no signed-in user shows nothing', async () => {
  mockUser = null;
  const h = await mount();
  expect(h.out.current.cards).toEqual([]);
  await h.unmount();
});

test('not signed up: one query for enabled events, one for the caller\'s sign-ups, no link read, the invite', async () => {
  mockStore.events.off = event({ enabled: false, title: 'Hidden' });
  const h = await mount();
  expect(lists()).toEqual([['list', 'events', [['enabled', '==', true]]], ['list', 'eventSignups', [['uid', '==', UID]]]]);
  expect(gets()).toEqual([]);
  expect(h.out.current.cards).toHaveLength(1);
  expect(card(h).view).toMatchObject({ kind: 'invite', title: 'Probe workshop', primary: { action: 'come' } });
  await h.unmount();
});

test('only the caller\'s own sign-up counts, and only when its id is eventId_uid', async () => {
  mockStore.eventSignups.e1_other = { ...mineFor('e1'), uid: 'someone-else' };
  const h = await mount();
  expect(card(h).view.kind).toBe('invite');
  await h.unmount();
});

test('nothing will show: no sign-up query at all', async () => {
  jest.setSystemTime(END + 86400000);
  const h = await mount();
  expect(h.out.current.cards).toEqual([]);
  expect(lists()).toEqual([['list', 'events', [['enabled', '==', true]]]]);
  await h.unmount();
});

test('signed up with a link set: one link read for the event, Join with the address', async () => {
  mockStore.eventSignups[`e1_${UID}`] = mineFor('e1');
  const h = await mount();
  expect(gets()).toEqual([['get', 'eventLinks/e1']]);
  expect(card(h).view).toMatchObject({ kind: 'in', primary: { action: 'join', href: LINK } });
  await h.unmount();
});

test('signed up, link not set (no document, or a refusal): "no link", not an error', async () => {
  mockStore.eventSignups[`e1_${UID}`] = mineFor('e1');
  delete mockStore.eventLinks.e1;
  const h = await mount();
  expect(card(h).view.primary).toBeNull();
  expect(card(h).error).toBeNull();
  await h.unmount();
  mockFail.add('eventLinks');
  const h2 = await mount();
  expect(card(h2).view.primary).toBeNull();
  expect(card(h2).view.quiet.map((q) => q.action)).toContain('back');
  await h2.unmount();
});

test('a link that is not https shows no Join', async () => {
  mockStore.eventSignups[`e1_${UID}`] = mineFor('e1');
  mockStore.eventLinks.e1 = { meetUrl: 'http://example.com/not-secure' };
  const h = await mount();
  expect(card(h).view.primary).toBeNull();
  await h.unmount();
});

test('two events: a card each, earliest start first', async () => {
  mockStore.events.e0 = event({ title: 'Earlier one', startsAt: new Date(START - 12 * 3600000), endsAt: new Date(END - 12 * 3600000) });
  const h = await mount();
  expect(h.out.current.cards.map((c) => c.id)).toEqual(['e0', 'e1']);
  await h.unmount();
});

test('signing up writes the five fields under eventId_uid, then shows Join when the link is readable', async () => {
  const h = await mount();
  await act(async () => { await h.out.current.signUp('e1'); });
  expect(writes()).toEqual([['set', `eventSignups/e1_${UID}`, { eventId: 'e1', uid: UID, email: 'probe@example.com', name: 'Probe Person', createdAt: 'SERVER_TIME' }]]);
  expect(Object.keys(writes()[0][2]).sort()).toEqual(['createdAt', 'email', 'eventId', 'name', 'uid']);
  expect(gets()).toContainEqual(['get', `users/${UID}`]);
  expect(gets()).toContainEqual(['get', 'eventLinks/e1']);
  expect(card(h).view).toMatchObject({ kind: 'in', primary: { action: 'join', href: LINK } });
  expect(card(h).busy).toBeNull();
  await h.unmount();
});

test('a missing name or email is sent as null', async () => {
  mockUser = { uid: UID, getIdTokenResult: async () => ({ claims: {} }) };
  mockStore.users[UID] = { role: 'parent' };
  const h = await mount();
  await act(async () => { await h.out.current.signUp('e1'); });
  expect(writes()[0][2]).toMatchObject({ email: null, name: null });
  await h.unmount();
});

test('signing up before the link is set shows "You\'re in" and no Join', async () => {
  delete mockStore.eventLinks.e1;
  const h = await mount();
  await act(async () => { await h.out.current.signUp('e1'); });
  expect(card(h).view).toMatchObject({ kind: 'in', primary: null });
  await h.unmount();
});

test('a late arrival: signing up after the start shows Join at once', async () => {
  jest.setSystemTime(START + 20 * 60000);
  const h = await mount();
  expect(card(h).view).toMatchObject({ kind: 'invite' });
  await act(async () => { await h.out.current.signUp('e1'); });
  expect(card(h).view.primary).toMatchObject({ action: 'join', href: LINK });
  await h.unmount();
});

test('taking it back deletes the sign-up and clears the link', async () => {
  mockStore.eventSignups[`e1_${UID}`] = mineFor('e1');
  const h = await mount();
  await act(async () => { await h.out.current.takeBack('e1'); });
  expect(writes()).toEqual([['delete', `eventSignups/e1_${UID}`]]);
  expect(card(h).view).toMatchObject({ kind: 'invite', primary: { action: 'come' } });
  await h.unmount();
});

test('a failed sign-up says so and leaves the card as it was', async () => {
  mockFail.add('setDoc');
  const h = await mount();
  await act(async () => { await h.out.current.signUp('e1'); });
  expect(card(h).error).toBe("That didn't save. Check your connection and try again.");
  expect(card(h).view.kind).toBe('invite');
  expect(card(h).busy).toBeNull();
  mockFail.delete('setDoc');
  await act(async () => { await h.out.current.signUp('e1'); });
  expect(card(h).error).toBeNull();
  expect(card(h).view.kind).toBe('in');
  await h.unmount();
});

test('a failed take-back says so and leaves the card as it was', async () => {
  mockStore.eventSignups[`e1_${UID}`] = mineFor('e1');
  mockFail.add('deleteDoc');
  const h = await mount();
  await act(async () => { await h.out.current.takeBack('e1'); });
  expect(card(h).error).toBe("That didn't save. Check your connection and try again.");
  expect(card(h).view.kind).toBe('in');
  await h.unmount();
});

test('a sign-up the rules refuse because the account already signed up elsewhere shows that state, no error', async () => {
  const h = await mount();
  expect(card(h).view.kind).toBe('invite');
  mockStore.eventSignups[`e1_${UID}`] = mineFor('e1'); // another tab or device
  mockLog.length = 0;
  await act(async () => { await h.out.current.signUp('e1'); });
  expect(card(h).error).toBeNull();
  expect(card(h).view).toMatchObject({ kind: 'in', primary: { action: 'join', href: LINK } });
  expect(card(h).busy).toBeNull();
  expect(lists().map((l) => l[1])).toEqual(['events', 'eventSignups']); // one full re-read, not a loop
  await h.unmount();
});

test('a take-back the rules refuse because the sign-up is already gone shows that state, no error', async () => {
  mockStore.eventSignups[`e1_${UID}`] = mineFor('e1');
  const h = await mount();
  expect(card(h).view.kind).toBe('in');
  delete mockStore.eventSignups[`e1_${UID}`]; // removed on another device
  mockLog.length = 0;
  await act(async () => { await h.out.current.takeBack('e1'); });
  expect(card(h).error).toBeNull();
  expect(card(h).view).toMatchObject({ kind: 'invite', primary: { action: 'come' } });
  expect(lists().map((l) => l[1])).toEqual(['events', 'eventSignups']);
  await h.unmount();
});

test('a refused write that the re-read does not explain still says so, after one re-read', async () => {
  mockFail.add('setDoc');
  const h = await mount();
  mockLog.length = 0;
  await act(async () => { await h.out.current.signUp('e1'); });
  expect(card(h).error).toBe("That didn't save. Check your connection and try again.");
  expect(lists().map((l) => l[1])).toEqual(['events', 'eventSignups']);
  await h.unmount();
});

test('a failed re-read after a refused write says so too', async () => {
  mockFail.add('setDoc');
  const h = await mount();
  mockFail.add('events');
  await act(async () => { await h.out.current.signUp('e1'); });
  expect(card(h).error).toBe("That didn't save. Check your connection and try again.");
  expect(card(h).view.kind).toBe('invite');
  await h.unmount();
});

test('taps while the re-read after a refusal runs do nothing', async () => {
  mockFail.add('setDoc');
  const h = await mount();
  let release;
  mockHoldList = new Promise((r) => { release = r; });
  let first;
  await act(async () => { first = h.out.current.signUp('e1'); await settle(); });
  expect(card(h).busy).toBe('signup');
  await act(async () => { h.out.current.signUp('e1'); h.out.current.takeBack('e1'); await settle(); });
  expect(writes()).toHaveLength(1);
  await act(async () => { release(); await first; });
  expect(card(h).busy).toBeNull();
  expect(card(h).error).not.toBeNull();
  await h.unmount();
});

test('a double tap sends one write, and the button is busy while it runs', async () => {
  let release;
  mockHold = new Promise((r) => { release = r; });
  const h = await mount();
  let first;
  await act(async () => {
    first = h.out.current.signUp('e1');
    h.out.current.signUp('e1');
    h.out.current.takeBack('e1');
    await Promise.resolve();
  });
  expect(card(h).busy).toBe('signup');
  expect(writes()).toHaveLength(1);
  await act(async () => { release(); await first; });
  expect(writes()).toHaveLength(1);
  expect(card(h).busy).toBeNull();
  await h.unmount();
});

// React 18 no longer warns about a state update after unmount, so the guards are watched directly: every
// state setter the hook creates is wrapped, and a call after the unmount is counted. The first count proves
// the wrapper sees the hook's calls at all.
function watchSetters() {
  const real = React.useState;
  const wrapped = new WeakMap();
  const seen = { before: 0, after: 0, unmounted: false };
  const spy = jest.spyOn(React, 'useState').mockImplementation((init) => {
    const [value, set] = real(init);
    if (!wrapped.has(set)) {
      wrapped.set(set, (...args) => {
        if (seen.unmounted) seen.after += 1; else seen.before += 1;
        return set(...args);
      });
    }
    return [value, wrapped.get(set)];
  });
  return { seen, stop: () => spy.mockRestore() };
}
describe('nothing is set after unmount', () => {
  async function leaveMidFlight(start, release) {
    const watch = watchSetters();
    try {
      const h = await mount();
      let p;
      await act(async () => { p = start(h); await Promise.resolve(); });
      expect(watch.seen.before).toBeGreaterThan(0);
      await h.unmount();
      watch.seen.unmounted = true;
      await act(async () => { release(); await p; await settle(); });
      return watch.seen.after;
    } finally {
      watch.stop();
    }
  }

  test('a sign-up that is written after the card left', async () => {
    let release;
    mockHold = new Promise((r) => { release = r; });
    expect(await leaveMidFlight((h) => h.out.current.signUp('e1'), () => release())).toBe(0);
    expect(writes()).toHaveLength(1);
  });

  test('a sign-up that fails after the card left', async () => {
    let release;
    mockHold = new Promise((r) => { release = r; });
    mockFail.add('setDoc');
    expect(await leaveMidFlight((h) => h.out.current.signUp('e1'), () => release())).toBe(0);
  });

  test('a take-back that is written after the card left', async () => {
    let release;
    mockHold = new Promise((r) => { release = r; });
    mockStore.eventSignups[`e1_${UID}`] = mineFor('e1');
    expect(await leaveMidFlight((h) => h.out.current.takeBack('e1'), () => release())).toBe(0);
    expect(writes()).toHaveLength(1);
  });

  test('a link check that comes back after the card left', async () => {
    mockStore.eventSignups[`e1_${UID}`] = mineFor('e1');
    jest.setSystemTime(START + SEC);
    let release;
    const check = (h) => {
      mockHoldLink = new Promise((r) => { release = r; }); // held after the mount's own read, so only the tap waits
      return h.out.current.checkLink('e1');
    };
    expect(await leaveMidFlight(check, () => release())).toBe(0);
  });

  test('a read that comes back after the card left', async () => {
    let release;
    mockHoldList = new Promise((r) => { release = r; });
    const watch = watchSetters();
    try {
      const h = await mount();
      expect(lists().map((l) => l[1])).toEqual(['events']);
      await h.unmount();
      watch.seen.unmounted = true;
      await act(async () => { release(); await settle(); });
      expect(lists().map((l) => l[1])).toEqual(['events', 'eventSignups']);
      expect(watch.seen.after).toBe(0);
    } finally {
      watch.stop();
    }
  });
});

test('"Check for the link" re-reads that link', async () => {
  mockStore.eventSignups[`e1_${UID}`] = mineFor('e1');
  delete mockStore.eventLinks.e1;
  jest.setSystemTime(START + SEC);
  const h = await mount();
  expect(card(h).view.status).toBe("You're in. The link isn't here yet. Check again in a minute.");
  mockStore.eventLinks.e1 = { meetUrl: LINK };
  mockLog.length = 0;
  await act(async () => { await h.out.current.checkLink('e1'); });
  expect(mockLog).toEqual([['get', 'eventLinks/e1']]);
  expect(card(h).view.primary.action).toBe('join');
  await h.unmount();
});

test('the page coming back into view re-reads, not more than once every 30 seconds', async () => {
  mockStore.eventSignups[`e1_${UID}`] = mineFor('e1');
  delete mockStore.eventLinks.e1;
  const h = await mount();
  expect(card(h).view.primary).toBeNull();
  mockStore.eventLinks.e1 = { meetUrl: LINK };
  const show = () => act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  mockLog.length = 0;
  await advance(RECHECK_MIN_MS - SEC);
  await show();
  expect(mockLog).toEqual([]);
  await advance(2 * SEC);
  await show();
  expect(lists().map((l) => l[1])).toEqual(['events', 'eventSignups']);
  expect(card(h).view.primary.action).toBe('join');
  await h.unmount();
});

test('a failed re-read keeps what the card showed', async () => {
  mockStore.eventSignups[`e1_${UID}`] = mineFor('e1');
  const h = await mount();
  mockFail.add('events');
  await advance(RECHECK_MIN_MS + SEC);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(card(h).view.primary.action).toBe('join');
  await h.unmount();
});

test('the card moves between states by timer, with no network call', async () => {
  mockStore.eventSignups[`e1_${UID}`] = mineFor('e1');
  delete mockStore.eventLinks.e1;
  jest.setSystemTime(START - 3 * 3600000);
  const h = await mount();
  expect(card(h).view.quiet.map((q) => q.action)).toEqual(['back']);
  mockLog.length = 0;
  await advance(3600000); // two hours to go: Check for the link appears
  expect(card(h).view.quiet.map((q) => q.action)).toEqual(['back', 'check']);
  await advance(2 * 3600000); // exactly the start: the "not here yet" line, no "I can't come"
  expect(card(h).view.status).toBe("You're in. The link isn't here yet. Check again in a minute.");
  expect(card(h).view.quiet.map((q) => q.action)).toEqual(['check']);
  await advance(45 * 60000); // exactly the end: the card goes
  expect(h.out.current.cards).toEqual([]);
  expect(mockLog).toEqual([]);
  await h.unmount();
});

test('after the end a recording address keeps the card, for a family that never signed up', async () => {
  mockStore.events.e1 = event({ recordingUrl: 'https://example.com/recording-placeholder' });
  jest.setSystemTime(END + 3600000);
  const h = await mount();
  expect(card(h).view).toMatchObject({ kind: 'recording', primary: { action: 'recording', href: 'https://example.com/recording-placeholder' } });
  expect(gets()).toEqual([]);
  await h.unmount();
});
