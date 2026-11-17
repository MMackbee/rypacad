/**
 * The Facility door staff screen's pure half (spec 4, 6, 7): doorConfig/main
 * as the screen reads it (missing is Off, fail closed; the defaults), the
 * write the rules accept (only the listed keys, Everyone only once the
 * academy location is set), and the activity and pause rows in plain words
 * with America/Chicago times.
 */
import fs from 'fs';
import path from 'path';
import {
  LOCATION_FIX_MAX_M,
  MODES,
  OPEN_SECONDS_MAX,
  OPEN_SECONDS_MIN,
  OPEN_TIME_OPTIONS,
  RADIUS_OPTIONS,
  chicagoTime,
  configPatch,
  configWrite,
  distanceM,
  eventRow,
  locationSet,
  normalizeConfig,
  openTimeChoices,
  openTimeText,
  pausedRow,
  pauseTarget,
  phoneCheck,
} from './doorAdmin';

const ts = (ms) => ({ toMillis: () => ms });

describe('normalizeConfig', () => {
  test('missing is Off with the defaults and no location', () => {
    expect(normalizeConfig(null)).toEqual({ mode: 'off', lat: null, lng: null, radiusM: 200, openSeconds: 5, updatedAtMs: null, updatedByUid: null });
  });

  test('a stored config reads as stored', () => {
    expect(normalizeConfig({ mode: 'all', lat: 44.97, lng: -93.26, radiusM: 300, openSeconds: 8, updatedAt: ts(1700000000000), updatedByUid: 'u1' }))
      .toEqual({ mode: 'all', lat: 44.97, lng: -93.26, radiusM: 300, openSeconds: 8, updatedAtMs: 1700000000000, updatedByUid: 'u1' });
  });

  test('anything out of range falls back: an unknown mode is Off, odd numbers the defaults, half a location none', () => {
    expect(normalizeConfig({ mode: 'open', lat: 44.9, lng: 'x', radiusM: 5000, openSeconds: 2.5 }))
      .toMatchObject({ mode: 'off', lat: null, lng: null, radiusM: 200, openSeconds: 5 });
    expect(normalizeConfig({ lat: 91, lng: 10 })).toMatchObject({ lat: null, lng: null });
  });

  test('an open time of up to 10 min reads as stored; past it, or not whole seconds, is 5 s', () => {
    expect(normalizeConfig({ openSeconds: 600 }).openSeconds).toBe(600);
    expect(normalizeConfig({ openSeconds: 180 }).openSeconds).toBe(180);
    expect(normalizeConfig({ openSeconds: 601 }).openSeconds).toBe(5);
    expect(normalizeConfig({ openSeconds: 0 }).openSeconds).toBe(5);
    expect(normalizeConfig({ openSeconds: '60' }).openSeconds).toBe(5);
  });
});

test('the open time bounds equal the server\'s (door-decide.js) and the rules\'', () => {
  expect([OPEN_SECONDS_MIN, OPEN_SECONDS_MAX]).toEqual([1, 600]);
  const root = path.resolve(__dirname, '../../../..');
  const server = fs.readFileSync(path.join(root, 'functions/portal/door-decide.js'), 'utf8');
  expect(server.match(/OPEN_SECONDS_MIN = (\d+);/)[1]).toBe(String(OPEN_SECONDS_MIN));
  expect(server.match(/OPEN_SECONDS_MAX = (\d+);/)[1]).toBe(String(OPEN_SECONDS_MAX));
  const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
  expect(rules.match(/d\.openSeconds >= (\d+) && d\.openSeconds <= (\d+)/).slice(1)).toEqual([String(OPEN_SECONDS_MIN), String(OPEN_SECONDS_MAX)]);
});

test('openTimeText: seconds under a minute, then minutes and seconds', () => {
  expect(openTimeText(5)).toBe('5 s');
  expect(openTimeText(45)).toBe('45 s');
  expect(openTimeText(60)).toBe('1 min');
  expect(openTimeText(90)).toBe('1 min 30 s');
  expect(openTimeText(180)).toBe('3 min');
  expect(openTimeText(600)).toBe('10 min');
  expect(openTimeText(61)).toBe('1 min 1 s');
});

describe('the open time choices', () => {
  const SECS = [3, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420, 480, 540, 600];

  test('3 s to 10 min, in order', () => {
    expect(OPEN_TIME_OPTIONS).toEqual(SECS);
    expect(OPEN_TIME_OPTIONS.map(openTimeText)).toEqual(['3 s', '5 s', '10 s', '15 s', '20 s', '30 s', '45 s', '1 min', '1 min 30 s', '2 min',
      '3 min', '4 min', '5 min', '6 min', '7 min', '8 min', '9 min', '10 min']);
  });

  test('a saved time not on the list joins it in its sorted place; one on it adds nothing', () => {
    expect(openTimeChoices(180)).toEqual(SECS);
    expect(openTimeChoices(6)).toEqual([3, 5, 6, ...SECS.slice(2)]);
    expect(openTimeChoices(11)).toEqual([3, 5, 10, 11, ...SECS.slice(3)]);
    expect(openTimeChoices(1)).toEqual([1, ...SECS]);
    expect(openTimeChoices(599)).toEqual([...SECS.slice(0, -1), 599, 600]);
    expect(openTimeChoices(null)).toEqual(SECS);
  });
});

test('the choices the screen offers', () => {
  expect(MODES).toEqual([['off', 'Off'], ['staff', 'Staff only'], ['all', 'Everyone']]);
  expect(RADIUS_OPTIONS).toEqual([100, 200, 300, 500]);
});

test('locationSet', () => {
  expect(locationSet(normalizeConfig(null))).toBe(false);
  expect(locationSet(normalizeConfig({ lat: 44.97, lng: -93.26 }))).toBe(true);
  expect(locationSet(normalizeConfig({ lat: 0, lng: 0 }))).toBe(true);
});

describe('configWrite', () => {
  const base = normalizeConfig({ mode: 'staff', lat: 44.97, lng: -93.26, radiusM: 200, openSeconds: 5 });

  test('the five fields the rules allow besides the stamp, with the change applied', () => {
    expect(configWrite(base, { mode: 'all' })).toEqual({ mode: 'all', lat: 44.97, lng: -93.26, radiusM: 200, openSeconds: 5 });
    expect(configWrite(base, { radiusM: 500 })).toMatchObject({ radiusM: 500 });
    expect(configWrite(base, { lat: 44.5, lng: -93.1 })).toMatchObject({ lat: 44.5, lng: -93.1 });
    expect(configWrite(normalizeConfig(null), { mode: 'staff' })).toEqual({ mode: 'staff', lat: null, lng: null, radiusM: 200, openSeconds: 5 });
  });

  test('Everyone needs the academy location', () => {
    expect(() => configWrite(normalizeConfig({ mode: 'staff' }), { mode: 'all' })).toThrow('Set the academy location first.');
  });

  test('open time stays a whole number of seconds from 1 to 600; a bad mode or radius is refused', () => {
    expect(configWrite(base, { openSeconds: 0 }).openSeconds).toBe(1);
    expect(configWrite(base, { openSeconds: 600 }).openSeconds).toBe(600);
    expect(configWrite(base, { openSeconds: 601 }).openSeconds).toBe(600);
    expect(configWrite(base, { openSeconds: 'x' }).openSeconds).toBe(5);
    expect(() => configWrite(base, { mode: 'open' })).toThrow();
    expect(() => configWrite(base, { radiusM: 5000 })).toThrow();
    expect(() => configWrite(base, { lat: 120, lng: 0 })).toThrow();
  });
});

describe('configPatch (review 2026-11-17 rules-1, app-2)', () => {
  const base = normalizeConfig({ mode: 'staff', lat: 44.97, lng: -93.26, radiusM: 200, openSeconds: 5 });

  test('only the keys that change: a stale screen never writes back what it did not touch', () => {
    expect(configPatch(base, { mode: 'all' })).toEqual({ mode: 'all' });
    expect(configPatch(base, { radiusM: 300 })).toEqual({ radiusM: 300 });
    expect(configPatch(base, { openSeconds: 180 })).toEqual({ openSeconds: 180 });
    expect(configPatch(base, { openSeconds: 601 })).toEqual({ openSeconds: 600 });
    expect(configPatch(normalizeConfig(null), { mode: 'staff' })).toEqual({ mode: 'staff' });
  });

  test('lat and lng always travel together; nothing outside the rules\' keys', () => {
    expect(configPatch(base, { lat: 44.5, lng: -93.1 })).toEqual({ lat: 44.5, lng: -93.1 });
    expect(configPatch(base, { lat: 44.5 })).toEqual({ lat: 44.5, lng: -93.26 });
    expect(configPatch(base, { radiusM: 100, updatedByUid: 'x', unlockUrl: 'y' })).toEqual({ radiusM: 100 });
  });

  test('the same checks as configWrite', () => {
    expect(() => configPatch(normalizeConfig({ mode: 'staff' }), { mode: 'all' })).toThrow('Set the academy location first.');
    expect(() => configPatch(base, { radiusM: 5000 })).toThrow();
  });
});

describe('a phone reading against the academy (review 2026-11-17 app-1)', () => {
  test('distanceM: metres on the earth, the server\'s formula', () => {
    expect(distanceM({ lat: 44.9, lng: -93.4 }, { lat: 44.9, lng: -93.4 })).toBe(0);
    // 0.05 degrees of latitude is about 5560 m (door.test.js's FAR).
    expect(Math.round(distanceM({ lat: 44.9, lng: -93.4 }, { lat: 44.95, lng: -93.4 }) / 10) * 10).toBe(5560);
  });

  test('phoneCheck: how far, how sure, and whether a family standing here could unlock', () => {
    const academy = normalizeConfig({ mode: 'all', lat: 44.9, lng: -93.4, radiusM: 200 });
    // About 37 m away with a 7 m reading: kept as 40, inside the reach.
    expect(phoneCheck({ lat: 44.9003, lng: -93.4002, accuracy: 7 }, academy)).toEqual({ distanceM: 40, accuracyM: 7, ok: true });
    // 5.5 km away: outside, even with the 150 m the server allows for a rough reading.
    expect(phoneCheck({ lat: 44.95, lng: -93.4, accuracy: 900 }, academy)).toMatchObject({ distanceM: 5560, ok: false });
    // 300 m away: in only because a rough reading earns up to 150 m.
    const near = { lat: 44.9027, lng: -93.4, accuracy: 120 };
    expect(phoneCheck(near, academy).ok).toBe(true);
    expect(phoneCheck({ ...near, accuracy: 20 }, academy).ok).toBe(false);
    expect(phoneCheck(near, normalizeConfig({ mode: 'all' }))).toBeNull();
  });

  test('the roughest reading the screen saves as the academy', () => {
    expect(LOCATION_FIX_MAX_M).toBe(75);
  });
});

test('chicagoTime: the academy clock, whatever the phone says', () => {
  // 2026-11-18 00:42 UTC is 6:42 PM on Nov 17 in Chicago.
  expect(chicagoTime(Date.UTC(2026, 10, 18, 0, 42))).toBe('Nov 17, 6:42 PM');
  expect(chicagoTime(null)).toBe('');
});

describe('eventRow', () => {
  const at = Date.UTC(2026, 10, 18, 0, 42);

  test('an opened door', () => {
    expect(eventRow({ id: 'u1_p1', uid: 'u1', name: 'Dana Hart', householdName: 'Hart family', atMs: at, outcome: 'opened', reason: null, distanceM: 40, test: false }))
      .toEqual({ id: 'u1_p1', when: 'Nov 17, 6:42 PM', name: 'Dana Hart', family: 'Hart family', outcome: 'Opened', reason: null, distance: '40 m away', test: false, tone: 'green' });
  });

  test('a refusal says why in words; staff have no family; no distance, none shown', () => {
    expect(eventRow({ id: 'x', name: 'Dana Hart', householdName: 'Hart family', atMs: at, outcome: 'denied', reason: 'too-far', distanceM: 420 }))
      .toMatchObject({ outcome: 'Refused', reason: 'too far away', distance: '420 m away', tone: 'red' });
    expect(eventRow({ id: 'y', name: 'Sam Lee', householdName: null, atMs: at, outcome: 'opened', distanceM: null }))
      .toMatchObject({ family: 'Staff', distance: null });
    expect(eventRow({ id: 'z', name: 'Dana Hart', atMs: at, outcome: 'error', reason: 'alta-timeout' }))
      .toMatchObject({ outcome: 'Door error', reason: 'the door system timed out', tone: 'red' });
  });

  test('a test press and a reason the screen does not know', () => {
    expect(eventRow({ id: 't', name: 'Casey Test', householdName: 'Test family', atMs: at, outcome: 'test', test: true }))
      .toMatchObject({ outcome: 'Test (not opened)', test: true, tone: 'neutral' });
    expect(eventRow({ id: 'u', name: 'Dana Hart', atMs: at, outcome: 'denied', reason: 'brand-new' })).toMatchObject({ reason: 'brand-new' });
  });
});

test('pausedRow: the family name from the directory, else the id; when, in Chicago', () => {
  const p = { householdId: 'hh-hart', pausedAt: ts(Date.UTC(2026, 10, 18, 0, 42)), pausedByUid: 'u9' };
  expect(pausedRow(p, { 'hh-hart': 'Hart family' })).toEqual({ householdId: 'hh-hart', name: 'Hart family', since: 'Paused Nov 17, 6:42 PM' });
  expect(pausedRow(p, {})).toMatchObject({ name: 'hh-hart' });
  expect(pausedRow({ householdId: 'hh-hart', pausedAt: null }, {})).toMatchObject({ since: 'Paused' });
});

test('pauseTarget: the family an athlete is in per the directory, or null (review 2026-11-17)', () => {
  const directory = [
    { id: 'hh-hart', name: 'Hart family', athletes: [{ id: 'dana' }] },
    { id: 'hh-lee', name: null, athletes: [null, { id: 'sam' }] },
    { id: 'hh-empty' },
  ];
  expect(pauseTarget(directory, 'dana')).toEqual({ householdId: 'hh-hart', householdName: 'Hart family' });
  expect(pauseTarget(directory, 'sam')).toEqual({ householdId: 'hh-lee', householdName: null });
  expect(pauseTarget(directory, 'gone')).toBeNull();
  expect(pauseTarget(null, 'dana')).toBeNull();
});
