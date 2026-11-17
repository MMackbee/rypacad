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
jest.mock('../hooks/door', () => ({ currentLocation: async () => mockLocate() }));
jest.mock('../hooks/billing', () => ({ useHouseholdsDirectory: () => ({ data: mockDirectory, loading: false, error: null }) }));
jest.mock('../components/door/DoorCard', () => ({
  __esModule: true,
  default: ({ staffScreen, recheckKey, label }) => <div data-door-card={JSON.stringify({ staffScreen: Boolean(staffScreen), recheckKey, label })} />,
}));

let mockAdmin;
let mockLocate;
let mockDirectory;
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

describe('Academy location', () => {
  test('not set: this phone sets it, and says how close the reading was', async () => {
    mockAdmin = admin({ config: normalizeConfig({ mode: 'off' }) });
    const r = await mount();
    expect(r.text()).toContain('Academy location');
    expect(r.text()).toContain('Not set');
    expect(r.text()).toContain('Stand inside the academy');
    await r.click("Use this phone's location");
    expect(saves).toEqual([{ lat: 44.98, lng: -93.27 }]);
    expect(r.text()).toContain('Set from this phone, accurate to about 12 m.');
    await r.unmount();
  });

  test('no location from the phone: the location copy, nothing saved', async () => {
    mockLocate = () => { throw new LiveDataError(ERR.INVALID, "Turn on Location for this site so the app can check you're at the academy.", null, 'location-needed'); };
    const r = await mount();
    expect(r.text()).toContain('Set');
    await r.click("Use this phone's location");
    expect(saves).toEqual([]);
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

  test('the door open time, a second at a time, 1 to 30', async () => {
    const r = await mount();
    expect(r.text()).toContain('5 s');
    await r.click('One second more');
    await r.click('One second less');
    expect(saves).toEqual([{ openSeconds: 6 }, { openSeconds: 4 }]);
    await r.unmount();
    mockAdmin = admin({ config: normalizeConfig({ ...LOCATED, openSeconds: 30 }) });
    const top = await mount();
    expect(top.button('One second more').disabled).toBe(true);
    await top.unmount();
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
