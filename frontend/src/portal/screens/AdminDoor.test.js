/**
 * The Facility door staff screen (spec 7), owner and ops: Who can unlock
 * (Off / Staff only / Everyone, Everyone off until the academy location is
 * set), the academy location from this phone, the reach and the open time,
 * the staff Unlock (the door card, no location), Recent activity in Chicago
 * time, and Paused families with Unpause and Pause a family (the athlete
 * search; pausing pauses the household). The data hook, the door card and
 * the directory are stand-ins. Plain functions, not jest.fn().
 */
jest.mock('../hooks/doorAdmin', () => ({ useDoorAdmin: () => mockAdmin }));
jest.mock('../hooks/door', () => ({ currentLocation: async (opts) => { mockLocateCalls.push(opts); return mockLocate(opts); } }));
jest.mock('../hooks/billing', () => ({ useHouseholdsDirectory: () => { mockDirectoryReads += 1; return { data: mockDirectory, loading: false, error: null }; } }));
jest.mock('../components/door/DoorCard', () => ({
  __esModule: true,
  default: ({ staffScreen, recheckKey, label }) => <div data-door-card={JSON.stringify({ staffScreen: Boolean(staffScreen), recheckKey, label })} />,
}));

let mockAdmin;
let mockLocate;
let mockLocateCalls;
let mockDirectory;
let mockDirectoryReads;
let saves;
let paused;
let unpaused;

import React, { act } from 'react';
import { renderScreen } from './testRender';
import { normalizeConfig } from '../data/doorAdmin';
import { ERR, LiveDataError } from '../hooks/live';
import AdminDoor from './AdminDoor';

const at = Date.UTC(2026, 10, 18, 0, 42); // Nov 17, 6:42 PM in Chicago
const LOCATED = { mode: 'staff', lat: 44.97, lng: -93.26, radiusM: 200, openSeconds: 5, updatedAt: { toMillis: () => 111 } };

function admin(over = {}) {
  return {
    config: normalizeConfig(LOCATED),
    pauses: [],
    events: [],
    loading: false,
    error: null,
    eventsError: null,
    saveConfig: async (patch) => { saves.push(patch); },
    pause: async (id) => { paused.push(id); },
    unpause: async (id) => { unpaused.push(id); },
    refreshEvents: async () => { saves.push('refresh'); },
    reload: () => { saves.push('reload'); },
    ...over,
  };
}

beforeEach(() => {
  saves = [];
  paused = [];
  unpaused = [];
  mockAdmin = admin();
  mockLocate = () => ({ lat: 44.98, lng: -93.27, accuracy: 12.4 });
  mockLocateCalls = [];
  mockDirectoryReads = 0;
  mockDirectory = [
    { id: 'hh-hart', name: 'Hart family', status: 'active', athletes: [{ id: 'dana', name: 'Dana Hart', packageName: 'Elite' }] },
    { id: 'hh-lee', name: 'Lee family', status: 'active', athletes: [{ id: 'sam', name: 'Sam Lee', packageName: '8 tokens' }, { id: 'kim', name: 'Kim Lee', packageName: 'Elite' }] },
  ];
});

const mount = (props = {}) => renderScreen(<AdminDoor bare role="owner" onBack={() => saves.push('back')} {...props} />);
/** A search result row by the athlete's name (its text also carries the family and package). */
const pick = (r, name) => act(async () => { [...r.container.querySelectorAll('button')].find((b) => b.textContent.startsWith(name)).click(); });
/** The athlete search: focus (the directory loads on first focus), then type. */
async function search(r, text) {
  await act(async () => { r.container.querySelector('input[aria-label="Find an athlete"]').focus(); });
  await r.fill('Find an athlete', text);
}
const radio = (r, label) => [...r.container.querySelectorAll('[role="radio"]')].find((b) => b.textContent === label);

test('the header: back to Admin and the title', async () => {
  const r = await mount();
  expect(r.text()).toContain('Facility door');
  await r.click('‹ Admin');
  expect(saves).toEqual(['back']);
  await r.unmount();
});

test('loading shows no controls; a failed load says so and retries', async () => {
  mockAdmin = admin({ loading: true, config: null, pauses: null });
  const loading = await mount();
  expect(loading.container.querySelector('[role="radio"]')).toBeNull();
  await loading.unmount();
  mockAdmin = admin({ error: new LiveDataError(ERR.UNAVAILABLE, 'x'), config: null, pauses: null });
  const failed = await mount();
  expect(failed.text()).toContain("The door settings didn't load");
  await failed.click('Try again');
  expect(saves).toEqual(['reload']);
  await failed.unmount();
});

describe('Who can unlock', () => {
  test('the three choices, the current one checked', async () => {
    const r = await mount();
    expect(r.text()).toContain('Who can unlock');
    expect(radio(r, 'Off').getAttribute('aria-checked')).toBe('false');
    expect(radio(r, 'Staff only').getAttribute('aria-checked')).toBe('true');
    expect(radio(r, 'Everyone').disabled).toBe(false);
    await act(async () => { radio(r, 'Everyone').click(); });
    expect(saves).toEqual([{ mode: 'all' }]);
    await act(async () => { radio(r, 'Off').click(); });
    expect(saves).toEqual([{ mode: 'all' }, { mode: 'off' }]);
    await r.unmount();
  });

  test('Everyone stays off until the academy location is set', async () => {
    mockAdmin = admin({ config: normalizeConfig({ mode: 'staff' }) });
    const r = await mount();
    expect(radio(r, 'Everyone').disabled).toBe(true);
    expect(r.text()).toContain('Everyone turns on once the academy location is set.');
    await act(async () => { radio(r, 'Everyone').click(); });
    expect(saves).toEqual([]);
    await r.unmount();
  });

  test('a write that fails says so', async () => {
    mockAdmin = admin({ saveConfig: async () => { throw new LiveDataError(ERR.PERMISSION, 'denied'); } });
    const r = await mount();
    await act(async () => { radio(r, 'Off').click(); });
    expect(r.text()).toContain("Didn't save. Check your connection and try again.");
    await r.unmount();
  });
});

const SAVE_HERE = "Save this as the academy's location? Only do this inside the academy.";

describe('Academy location', () => {
  test('not set: a fresh reading from this phone, a question, then it is saved', async () => {
    mockAdmin = admin({ config: normalizeConfig({ mode: 'off' }) });
    const r = await mount();
    expect(r.text()).toContain('Academy location');
    expect(r.text()).toContain('Not set');
    expect(r.text()).toContain('Stand inside the academy');
    await r.click("Use this phone's location");
    // Review 2026-11-17 (app-1): never a cached fix for the academy itself.
    expect(mockLocateCalls).toEqual([{ fresh: true }]);
    expect(saves).toEqual([]);
    expect(r.text()).toContain(SAVE_HERE);
    expect(r.text()).toContain('This reading is accurate to about 12 m.');
    await r.click('Save');
    expect(saves).toEqual([{ lat: 44.98, lng: -93.27 }]);
    expect(r.text()).not.toContain(SAVE_HERE);
    expect(r.text()).toContain('Set from this phone, accurate to about 12 m.');
    await r.unmount();
  });

  test('Cancel on the question saves nothing', async () => {
    const r = await mount();
    await r.click("Use this phone's location");
    await r.click('Cancel');
    expect(saves).toEqual([]);
    expect(r.text()).not.toContain(SAVE_HERE);
    await r.unmount();
  });

  test('a rough reading (a laptop, the car park, an IP guess) is never saved', async () => {
    // Review 2026-11-17 (app-1, spec-3): the screen confirmed an 800 m+ fix in green.
    mockLocate = () => ({ lat: 44.99, lng: -93.3, accuracy: 812 });
    const r = await mount();
    await r.click("Use this phone's location");
    expect(saves).toEqual([]);
    expect(r.text()).not.toContain(SAVE_HERE);
    expect(r.text()).toContain('Too rough a reading (accurate to about 812 m). Step inside the academy and try again.');
    await r.unmount();
  });

  test('a borderline reading asks with a warning; 75 m is the most it saves', async () => {
    mockLocate = () => ({ lat: 44.98, lng: -93.27, accuracy: 75 });
    const r = await mount();
    await r.click("Use this phone's location");
    expect(r.text()).toContain('This reading is accurate to about 75 m. A closer one is better: try again away from the door and windows.');
    await r.click('Save');
    expect(saves).toEqual([{ lat: 44.98, lng: -93.27 }]);
    await r.unmount();
    mockLocate = () => ({ lat: 44.98, lng: -93.27, accuracy: 76 });
    const over = await mount();
    await over.click("Use this phone's location");
    expect(over.text()).not.toContain(SAVE_HERE);
    await over.unmount();
  });

  test('check this phone the way a family is checked, before Everyone is on', async () => {
    // Review 2026-11-17 (app-1): staff unlock skips the location check, so
    // nothing else on this screen tries the family path.
    mockAdmin = admin({ config: normalizeConfig({ ...LOCATED, lat: 44.9, lng: -93.4, radiusM: 200 }) });
    mockLocate = () => ({ lat: 44.9003, lng: -93.4002, accuracy: 7 });
    const r = await mount();
    await r.click("Check this phone's distance");
    expect(mockLocateCalls).toEqual([{ fresh: true }]);
    expect(r.text()).toContain('This phone is about 40 m from the academy (reading accurate to about 7 m). A family standing here could unlock.');
    mockLocate = () => ({ lat: 44.95, lng: -93.4, accuracy: 10 });
    await r.click("Check this phone's distance");
    expect(r.text()).toContain('This phone is about 5560 m from the academy (reading accurate to about 10 m). A family standing here would be too far away to unlock.');
    expect(saves).toEqual([]);
    await r.unmount();
  });

  test('no academy location: nothing to check against', async () => {
    mockAdmin = admin({ config: normalizeConfig({ mode: 'off' }) });
    const r = await mount();
    expect(r.text()).not.toContain("Check this phone's distance");
    await r.unmount();
  });

  test('no location from the phone: the location copy, nothing saved', async () => {
    mockLocate = () => { throw new LiveDataError(ERR.INVALID, "Turn on Location for this site so the app can check you're at the academy.", null, 'location-needed'); };
    const r = await mount();
    expect(r.text()).toContain('Set');
    await r.click("Use this phone's location");
    expect(saves).toEqual([]);
    expect(r.text()).toContain("Turn on Location for this site so the app can check you're at the academy.");
    await r.click("Check this phone's distance");
    expect(r.text()).toContain("Turn on Location for this site so the app can check you're at the academy.");
    await r.unmount();
  });

  test('the reach: 100, 200, 300 or 500 m', async () => {
    const r = await mount();
    expect(['100 m', '200 m', '300 m', '500 m'].map((l) => Boolean(radio(r, l)))).toEqual([true, true, true, true]);
    expect(radio(r, '200 m').getAttribute('aria-checked')).toBe('true');
    await act(async () => { radio(r, '300 m').click(); });
    expect(saves).toEqual([{ radiusM: 300 }]);
    await r.unmount();
  });

  test('the door open time: a labelled select from 3 s to 10 min; a choice saves only the open time', async () => {
    const r = await mount();
    const select = r.container.querySelector('select[aria-label="Door open time"]');
    expect([...select.options].map((o) => o.textContent)).toEqual(['3 s', '5 s', '10 s', '15 s', '20 s', '30 s', '45 s', '1 min', '1 min 30 s',
      '2 min', '3 min', '4 min', '5 min', '6 min', '7 min', '8 min', '9 min', '10 min']);
    expect(select.value).toBe('5');
    expect(r.text()).toContain("Set the same time as the door's Entry open duration in Alta. The app counts it down after an unlock.");
    await r.fill('Door open time', '180');
    expect(saves).toEqual([{ openSeconds: 180 }]);
    expect(r.button('One second more')).toBeNull();
    await r.unmount();
  });

  test('the open time shows keyboard focus, and a change while its save is in flight is dropped (review 2026-11-17 a11y-2)', async () => {
    // Arrow keys on a focused, closed select (Windows) change it once per key: one save at a time, never a write per key.
    let release;
    mockAdmin = admin({ saveConfig: (patch) => { saves.push(patch); return new Promise((resolve) => { release = resolve; }); } });
    const r = await mount();
    const select = r.container.querySelector('select[aria-label="Door open time"]');
    const box = select.parentElement;
    expect(box.style.outline).not.toMatch(/solid/);
    await act(async () => { select.focus(); });
    expect(box.style.outline).toMatch(/^2px solid/);
    await r.fill('Door open time', '240');
    expect(select.getAttribute('aria-busy')).toBe('true');
    await r.fill('Door open time', '300');
    await r.fill('Door open time', '360');
    expect(saves).toEqual([{ openSeconds: 240 }]);
    expect(select.value).toBe('5');
    await act(async () => { release(); });
    await r.flush();
    expect(select.getAttribute('aria-busy')).toBeNull();
    await r.fill('Door open time', '300');
    expect(saves).toEqual([{ openSeconds: 240 }, { openSeconds: 300 }]);
    await act(async () => { select.blur(); });
    expect(box.style.outline).not.toMatch(/solid/);
    await r.unmount();
  });

  test('a saved open time off the list shows as chosen, in its sorted place', async () => {
    for (const [secs, text, after] of [[6, '6 s', '5 s'], [11, '11 s', '10 s']]) {
      mockAdmin = admin({ config: normalizeConfig({ ...LOCATED, openSeconds: secs }) });
      const r = await mount();
      const select = r.container.querySelector('select[aria-label="Door open time"]');
      const texts = [...select.options].map((o) => o.textContent);
      expect(select.value).toBe(String(secs));
      expect(select.options[select.selectedIndex].textContent).toBe(text);
      expect(texts.indexOf(text)).toBe(texts.indexOf(after) + 1);
      expect(texts).toHaveLength(19);
      await r.unmount();
    }
  });
});

test('the staff Unlock: the door card on the staff screen, rechecked after each saved change', async () => {
  const r = await mount();
  const card = JSON.parse(r.container.querySelector('[data-door-card]').getAttribute('data-door-card'));
  expect(card).toEqual({ staffScreen: true, recheckKey: 111, label: 'Staff unlock' });
  await r.unmount();
});

describe('Recent activity', () => {
  test('each event: name, family, what happened and why, distance, Chicago time', async () => {
    mockAdmin = admin({ events: [
      { id: 'e1', name: 'Dana Hart', householdName: 'Hart family', atMs: at, outcome: 'opened', distanceM: 40 },
      { id: 'e2', name: 'Sam Lee', householdName: 'Lee family', atMs: at, outcome: 'denied', reason: 'too-far', distanceM: 420 },
      { id: 'e3', name: 'Casey Test', householdName: 'Test family', atMs: at, outcome: 'test', test: true },
    ] });
    const r = await mount();
    expect(r.text()).toContain('Recent activity');
    expect(r.text()).toContain('Dana Hart');
    expect(r.text()).toContain('Hart family · Opened · 40 m away');
    expect(r.text()).toContain('Lee family · Refused: too far away · 420 m away');
    expect(r.text()).toContain('Nov 17, 6:42 PM');
    expect(r.text()).toContain('Test (not opened)');
    await r.click('Refresh');
    expect(saves).toEqual(['refresh']);
    await r.unmount();
  });

  test('nothing yet, and a failed list', async () => {
    const empty = await mount();
    expect(empty.text()).toContain('No unlocks yet.');
    await empty.unmount();
    mockAdmin = admin({ events: null, eventsError: new Error('x') });
    const failed = await mount();
    expect(failed.text()).toContain("Activity didn't load.");
    await failed.unmount();
  });
});

describe('Paused families', () => {
  test('the list by family name, with Unpause', async () => {
    mockAdmin = admin({ pauses: [{ householdId: 'hh-hart', pausedAt: { toMillis: () => at } }] });
    const r = await mount();
    expect(r.text()).toContain('Paused families');
    expect(r.text()).toContain('Hart family');
    expect(r.text()).toContain('Paused Nov 17, 6:42 PM');
    await r.click('Unpause Hart family');
    expect(unpaused).toEqual(['hh-hart']);
    await r.unmount();
  });

  test('none paused', async () => {
    const r = await mount();
    expect(r.text()).toContain('No family is paused.');
    await r.unmount();
  });

  test('Pause a family: pick an athlete, confirm, and the household is paused', async () => {
    const r = await mount();
    await search(r, 'sam');
    await pick(r, 'Sam Lee');
    expect(r.text()).toContain('Pause door unlocking for Lee family?');
    await r.click('Pause');
    expect(paused).toEqual(['hh-lee']);
    expect(r.text()).not.toContain('Pause door unlocking for Lee family?');
    await r.unmount();
  });

  test('a family someone else paused meanwhile: "already paused", not a connection problem', async () => {
    // Review 2026-11-17 (rules-2): the hook reads the list again and answers 'already'.
    mockAdmin = admin({ pause: async (id) => { paused.push(id); return 'already'; } });
    const r = await mount();
    await search(r, 'sam');
    await pick(r, 'Sam Lee');
    await r.click('Pause');
    expect(paused).toEqual(['hh-lee']);
    expect(r.text()).toContain('Lee family is already paused.');
    expect(r.text()).not.toContain("Didn't save");
    expect(r.text()).not.toContain('Pause door unlocking for Lee family?');
    await r.unmount();
  });

  test('the households directory loads only for a paused family\'s name or the search', async () => {
    // Review 2026-11-17 (app-9): every household and athlete, read on every open of the screen.
    const none = await mount();
    expect(none.text()).toContain('No family is paused.');
    expect(mockDirectoryReads).toBe(0);
    await act(async () => { none.container.querySelector('input[aria-label="Find an athlete"]').focus(); });
    expect(mockDirectoryReads).toBeGreaterThan(0);
    await none.unmount();
    mockDirectoryReads = 0;
    mockAdmin = admin({ pauses: [{ householdId: 'hh-hart', pausedAt: null }] });
    const some = await mount();
    expect(mockDirectoryReads).toBeGreaterThan(0);
    expect(some.text()).toContain('Hart family');
    await some.unmount();
  });

  test('Cancel pauses nothing; an athlete in a paused family reads Paused and cannot be picked', async () => {
    mockAdmin = admin({ pauses: [{ householdId: 'hh-lee', pausedAt: null }] });
    const r = await mount();
    await search(r, 'dana');
    await pick(r, 'Dana Hart');
    await r.click('Cancel');
    expect(paused).toEqual([]);
    await search(r, 'kim');
    const kim = [...r.container.querySelectorAll('button')].find((b) => b.textContent.includes('Kim Lee'));
    expect(kim.disabled).toBe(true);
    expect(kim.textContent).toContain('Paused');
    await r.unmount();
  });
});
