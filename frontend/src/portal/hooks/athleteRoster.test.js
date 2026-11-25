/**
 * hooks/athleteRoster.js (hq card 14): the admin athlete roster's reads and
 * the two marks' writes. The SDK and live.js are plain-function mocks (CRA's
 * resetMocks would clear jest.fn); data/athleteRoster.test.js covers the rows.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('../../firebase', () => ({ auth: { currentUser: { displayName: 'Pat Owner' } }, db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: (_db, ...path) => ({ path: path.join('/') }),
  // The cache answer a device gives offline for a collection it never read: empty, and it does not fail.
  getDocs: async () => { mockCached.push('getDocs'); return { docs: [], metadata: { fromCache: true } }; },
  getDocsFromServer: async (ref) => {
    // The two whole-collection reads (server only), then one milestones read per athlete.
    if (!ref.path.includes('/')) {
      mockCalls.push(ref.path);
      if (ref.path === 'athletes' && mockAthletesFail) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      if (ref.path === 'households' && mockHouseholdsFail) throw Object.assign(new Error('offline'), { code: 'unavailable' });
      const rows = ref.path === 'athletes' ? mockAthletes : mockHouseholds;
      return { docs: rows.map(({ id, ...data }) => ({ id, data: () => data })) };
    }
    mockReads.push(ref.path);
    const id = ref.path.split('/')[1];
    if (mockFailing.has(id)) throw Object.assign(new Error('offline'), { code: 'unavailable' });
    const docs = mockMilestones[id] ?? {};
    return { docs: Object.entries(docs).map(([docId, data]) => ({ id: docId, data: () => data })) };
  },
}));
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  __esModule: true,
  isLive: () => mockLive,
  fetchCurrentUser: async () => mockUser,
  // The cache-capable list fetchers: the roster must not use them (an offline device would get a short list).
  fetchAllAthletes: async () => { mockCached.push('fetchAllAthletes'); return mockAthletes; },
  fetchAllHouseholds: async () => { mockCached.push('fetchAllHouseholds'); return mockHouseholds; },
}));
jest.mock('./parallaxLive', () => ({
  ...jest.requireActual('./parallaxLive'),
  __esModule: true,
  INTAKE_KEY: 'milestones',
  intakeStamp: () => 'NOW',
  createIntake: async (athleteId, body, docId) => {
    mockWrites.push(['create', athleteId, body, docId]);
    return mockCreateResult;
  },
  deleteIntake: async (athleteId, docId, expected) => {
    mockWrites.push(['delete', athleteId, docId]);
    mockExpected.push(expected);
    if (mockDeleteError) throw mockDeleteError;
  },
  fetchIntake: async (athleteId, docId) => {
    mockWrites.push(['fetch', athleteId, docId]);
    mockFetches.push(athleteId);
    return mockStored;
  },
}));

import { ERR, LiveDataError } from './live';
import { MARK_CHANGED } from './parallaxLive';
import { useAthleteRoster } from './athleteRoster';
import { clearIntakeCache, useParallaxIntakes } from './parallax';

let mockLive;
let mockUser;
let mockAthletes;
let mockHouseholds;
let mockMilestones;
let mockFailing;
let mockReads;
let mockCalls;
let mockWrites;
let mockCreateResult;
let mockDeleteError;
let mockAthletesFail;
let mockHouseholdsFail;
let mockCached;
let mockStored;
let mockExpected;
let mockFetches;

const MARK = (byName = 'Luke') => ({ athleteId: 'a-kim', at: new Date('2026-11-12T22:00:00Z'), by: 'u-luke', byName });

beforeEach(() => {
  mockLive = true;
  mockUser = { uid: 'u-owner', role: 'owner', displayName: 'Pat Lee' };
  mockAthletes = [
    { id: 'a-kim', name: 'Dana Kim', householdId: 'h-kim' },
    { id: 'a-moss', name: 'Ada Moss', householdId: 'h-moss' },
    { id: 'a-test', name: 'Zed Tester', householdId: 'h-test' },
  ];
  mockHouseholds = [{ id: 'h-kim', name: 'Kim family' }, { id: 'h-moss', name: 'Moss family' }, { id: 'h-test', name: 'Test family', test: true }];
  mockMilestones = { 'a-kim': { parallaxIntake: MARK() }, 'a-moss': {} };
  mockFailing = new Set();
  mockReads = [];
  mockCalls = [];
  mockWrites = [];
  mockCreateResult = { status: 'done' };
  mockDeleteError = null;
  mockAthletesFail = false;
  mockHouseholdsFail = false;
  mockCached = [];
  mockStored = null;
  mockExpected = [];
  mockFetches = [];
  clearIntakeCache();
});

const flush = async () => { for (let i = 0; i < 12; i += 1) await act(async () => {}); };
async function mount(useHook = useAthleteRoster) {
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

test('live: one athletes read, one households read, then one milestones read per real athlete', async () => {
  const { result, unmount } = await mount();
  expect(mockCalls.sort()).toEqual(['athletes', 'households']);
  // The test family's athlete is left out, so it costs no read.
  expect(mockReads.sort()).toEqual(['athletes/a-kim/milestones', 'athletes/a-moss/milestones']);
  const { data } = result.current;
  expect(data.athletes.map((a) => a.id).sort()).toEqual(['a-kim', 'a-moss']);
  expect(data.households).toHaveLength(3);
  expect(data.marks['a-kim']).toEqual({ parallaxIntake: MARK(), fitnessAssessment: null });
  expect(data.marks['a-moss']).toEqual({ parallaxIntake: null, fitnessAssessment: null });
  expect(data.viewer).toEqual({ uid: 'u-owner', role: 'owner', byName: 'Pat' });
  expect(result.current.loading).toBe(false);
  await unmount();
});

test('a milestone doc under another id is ignored', async () => {
  mockMilestones = { 'a-kim': { somethingElse: { x: 1 }, fitnessAssessment: MARK('Pat') }, 'a-moss': {} };
  const { result, unmount } = await mount();
  expect(result.current.data.marks['a-kim']).toEqual({ parallaxIntake: null, fitnessAssessment: MARK('Pat') });
  await unmount();
});

test("one athlete's failed marks read leaves the list up and that athlete without marks", async () => {
  mockFailing = new Set(['a-moss']);
  const { result, unmount } = await mount();
  expect(result.current.error).toBeNull();
  expect(result.current.data.athletes).toHaveLength(2);
  expect(result.current.data.marks['a-kim']).toBeDefined();
  expect(result.current.data.marks['a-moss']).toBeUndefined();
  await unmount();
});

test('a failed athletes read is the screen error, and retry reads again', async () => {
  mockAthletesFail = true;
  const { result, unmount } = await mount();
  expect(result.current.error).toBeTruthy();
  expect(result.current.data).toBeNull();
  mockAthletesFail = false;
  await act(async () => { result.current.retry(); });
  await flush();
  expect(result.current.error).toBeNull();
  expect(result.current.data.athletes).toHaveLength(2);
  expect(mockCalls.filter((c) => c === 'athletes')).toHaveLength(2);
  await unmount();
});

test('the fitness tick writes the fitness doc with the four keys, and the row shows it at once', async () => {
  const { result, unmount } = await mount();
  const reads = mockReads.length;
  let answer;
  await act(async () => { answer = await result.current.tick('a-moss', 'fitnessAssessment'); });
  expect(answer).toBe('done');
  const [kind, athleteId, body, docId] = mockWrites[0];
  expect([kind, athleteId, docId]).toEqual(['create', 'a-moss', 'fitnessAssessment']);
  expect(body).toEqual({ athleteId: 'a-moss', at: 'NOW', by: 'u-owner', byName: 'Pat' });
  expect(Object.keys(body).sort()).toEqual(['at', 'athleteId', 'by', 'byName']);
  const shown = result.current.data.marks['a-moss'];
  expect(shown.fitnessAssessment).toMatchObject({ athleteId: 'a-moss', by: 'u-owner', byName: 'Pat' });
  expect(shown.fitnessAssessment.at).toBeInstanceOf(Date);
  expect(shown.parallaxIntake).toBeNull();
  // Only that athlete's row changed: the other real athlete's marks, both of them, are as they were.
  expect(result.current.data.marks['a-kim']).toEqual({ parallaxIntake: MARK(), fitnessAssessment: null });
  expect(Object.keys(result.current.data.marks).sort()).toEqual(['a-kim', 'a-moss']);
  // No reload of the list: nothing was read again.
  expect(mockReads.length).toBe(reads);
  expect(mockCalls.filter((c) => c === 'athletes')).toHaveLength(1);
  await unmount();
});

test('the Parallax tick writes the Parallax doc', async () => {
  const { result, unmount } = await mount();
  await act(async () => { await result.current.tick('a-moss', 'parallaxIntake'); });
  expect(mockWrites[0][3]).toBe('parallaxIntake');
  expect(result.current.data.marks['a-moss'].parallaxIntake).toBeTruthy();
  expect(result.current.data.marks['a-moss'].fitnessAssessment).toBeNull();
  await unmount();
});

test("a mark someone else ticked first shows theirs ('already')", async () => {
  mockCreateResult = { status: 'already', milestone: MARK('Sam') };
  const { result, unmount } = await mount();
  let answer;
  await act(async () => { answer = await result.current.tick('a-moss', 'fitnessAssessment'); });
  expect(answer).toBe('already');
  expect(result.current.data.marks['a-moss'].fitnessAssessment).toEqual(MARK('Sam'));
  await unmount();
});

test('undo deletes by doc id and the row goes back to not done', async () => {
  const { result, unmount } = await mount();
  await act(async () => { await result.current.undo('a-kim', 'parallaxIntake'); });
  expect(mockWrites[0]).toEqual(['delete', 'a-kim', 'parallaxIntake']);
  expect(result.current.data.marks['a-kim'].parallaxIntake).toBeNull();
  // The other athlete's marks are untouched (neither one was ever ticked).
  expect(result.current.data.marks['a-moss']).toEqual({ parallaxIntake: null, fitnessAssessment: null });
  await unmount();
});

test('an undo changes only that athlete and that mark: a tick on another athlete stays', async () => {
  mockMilestones = { 'a-kim': { parallaxIntake: MARK(), fitnessAssessment: MARK('Sam') }, 'a-moss': {} };
  const { result, unmount } = await mount();
  await act(async () => { await result.current.tick('a-moss', 'parallaxIntake'); });
  await act(async () => { await result.current.undo('a-kim', 'parallaxIntake'); });
  expect(result.current.data.marks['a-kim']).toEqual({ parallaxIntake: null, fitnessAssessment: MARK('Sam') });
  expect(result.current.data.marks['a-moss'].parallaxIntake).toBeTruthy();
  expect(result.current.data.marks['a-moss'].fitnessAssessment).toBeNull();
  await unmount();
});

test('an undo the rules refuse because the mark is already gone reads as undone; a mark still there stays and the refusal stands', async () => {
  mockDeleteError = Object.assign(new Error('no'), { code: ERR.PERMISSION });
  const { result, unmount } = await mount();
  mockStored = null;
  await act(async () => { await result.current.undo('a-kim', 'parallaxIntake'); });
  expect(mockWrites.map((w) => w[0])).toEqual(['delete', 'fetch']);
  expect(result.current.data.marks['a-kim'].parallaxIntake).toBeNull();
  mockStored = MARK('Sam');
  let thrown;
  await act(async () => { try { await result.current.undo('a-kim', 'parallaxIntake'); } catch (err) { thrown = err; } });
  expect(thrown).toBeTruthy();
  expect(result.current.data.marks['a-kim'].parallaxIntake).toEqual(MARK('Sam'));
  await unmount();
});

test('an undo that fails for another reason throws and changes nothing', async () => {
  mockDeleteError = Object.assign(new Error('offline'), { code: ERR.UNAVAILABLE });
  const { result, unmount } = await mount();
  let thrown;
  await act(async () => { try { await result.current.undo('a-kim', 'parallaxIntake'); } catch (err) { thrown = err; } });
  expect(thrown).toBeTruthy();
  expect(result.current.data.marks['a-kim'].parallaxIntake).toEqual(MARK());
  await unmount();
});

test('seed mode: the seed athletes, no network call, ticks work in memory', async () => {
  mockLive = false;
  const { result, unmount } = await mount();
  expect(mockReads).toEqual([]);
  expect(mockCalls).toEqual([]);
  const { data } = result.current;
  expect(data.athletes.length).toBeGreaterThan(0);
  expect(data.viewer.role).toBe('owner');
  const id = data.athletes[0].id;
  await act(async () => { await result.current.tick(id, 'fitnessAssessment'); });
  expect(result.current.data.marks[id].fitnessAssessment).toBeTruthy();
  await act(async () => { await result.current.undo(id, 'fitnessAssessment'); });
  expect(result.current.data.marks[id].fitnessAssessment).toBeNull();
  expect(mockWrites).toEqual([]);
  await unmount();
});

describe('an undo or clear deletes only the mark the roster showed (card 14, round 6)', () => {
  const changed = (stored) => Object.assign(new LiveDataError(ERR.UNKNOWN, 'changed', null, MARK_CHANGED), { stored });

  test('a mark that came from a read is passed as expected with its author and server time', async () => {
    const { result, unmount } = await mount();
    await act(async () => { await result.current.undo('a-kim', 'parallaxIntake'); });
    expect(mockExpected).toEqual([{ by: 'u-luke', at: MARK().at, fromServer: true }]);
    await unmount();
  });

  test("a mark this screen ticked is passed as expected by its author alone (the device time is not the server's)", async () => {
    const { result, unmount } = await mount();
    await act(async () => { await result.current.tick('a-moss', 'fitnessAssessment'); });
    await act(async () => { await result.current.undo('a-moss', 'fitnessAssessment'); });
    expect(mockExpected).toEqual([{ by: 'u-owner', fromServer: false }]);
    await unmount();
  });

  test('another device replaced the mark: the stored one shows, nothing else, and the failure is not the ten-minutes one', async () => {
    const { result, unmount } = await mount();
    mockDeleteError = changed(MARK('Sam'));
    let thrown;
    await act(async () => { try { await result.current.undo('a-kim', 'parallaxIntake'); } catch (err) { thrown = err; } });
    expect(thrown).toBeTruthy();
    expect(thrown.code).not.toBe(ERR.PERMISSION);
    expect(result.current.data.marks['a-kim'].parallaxIntake).toEqual(MARK('Sam'));
    // The next tap goes the normal way for the mark now shown, expecting that one.
    mockDeleteError = null;
    await act(async () => { await result.current.undo('a-kim', 'parallaxIntake'); });
    expect(mockExpected[1]).toEqual({ by: 'u-luke', at: MARK('Sam').at, fromServer: true });
    expect(result.current.data.marks['a-kim'].parallaxIntake).toBeNull();
    await unmount();
  });

  test('an undo with no mark shown asks for nothing to be deleted (expected null), never a bare delete', async () => {
    const { result, unmount } = await mount();
    await act(async () => { await result.current.undo('a-moss', 'parallaxIntake'); });
    expect(mockExpected).toEqual([null]);
    await unmount();
  });
});

describe('a marks read that never reached the server is "didn\'t load", never "not done" (card 14, round 6)', () => {
  test('offline: the cache has nothing for that athlete, so it has no marks, and every read asks the server', async () => {
    mockFailing = new Set(['a-moss']);
    const { result, unmount } = await mount();
    expect(result.current.data.marks['a-moss']).toBeUndefined();
    expect(result.current.data.marks['a-kim']).toEqual({ parallaxIntake: MARK(), fitnessAssessment: null });
    expect(mockReads.sort()).toEqual(['athletes/a-kim/milestones', 'athletes/a-moss/milestones']);
    await unmount();
  });
});

describe("the attendance screen's cache follows the roster's Parallax writes (card 14, round 6)", () => {
  const useAttendance = () => useParallaxIntakes(['a-kim', 'a-moss'], { enabled: true });

  async function loadAttendanceThenRoster() {
    const first = await mount(useAttendance);
    await first.unmount();
    return mount();
  }

  test('a roster tick: attendance, opened again inside ten minutes, reads that athlete again and shows the tick', async () => {
    mockStored = null;
    const roster = await loadAttendanceThenRoster();
    expect(mockFetches.sort()).toEqual(['a-kim', 'a-moss']);
    await act(async () => { await roster.result.current.tick('a-moss', 'parallaxIntake'); });
    mockStored = MARK('Pat');
    mockFetches = [];
    const again = await mount(useAttendance);
    expect(mockFetches).toEqual(['a-moss']);
    expect(again.result.current.data.byAthlete['a-moss']).toEqual(MARK('Pat'));
    await again.unmount();
    await roster.unmount();
  });

  test('a roster undo: attendance reads that athlete again and shows no tick', async () => {
    mockStored = MARK();
    const roster = await loadAttendanceThenRoster();
    mockStored = null;
    await act(async () => { await roster.result.current.undo('a-kim', 'parallaxIntake'); });
    mockFetches = [];
    const again = await mount(useAttendance);
    expect(mockFetches).toEqual(['a-kim']);
    expect(again.result.current.data.byAthlete['a-kim']).toBeNull();
    await again.unmount();
    await roster.unmount();
  });

  test("a tick that lost the race ('already') and a refused undo's re-read both reach attendance too", async () => {
    mockStored = null;
    const roster = await loadAttendanceThenRoster();
    mockCreateResult = { status: 'already', milestone: MARK('Sam') };
    await act(async () => { await roster.result.current.tick('a-moss', 'parallaxIntake'); });
    mockFetches = [];
    let again = await mount(useAttendance);
    expect(mockFetches).toEqual(['a-moss']);
    await again.unmount();
    mockDeleteError = Object.assign(new Error('no'), { code: ERR.PERMISSION });
    mockStored = MARK('Sam');
    await act(async () => { try { await roster.result.current.undo('a-kim', 'parallaxIntake'); } catch (err) { /* the refusal stands */ } });
    mockFetches = [];
    again = await mount(useAttendance);
    expect(mockFetches).toEqual(['a-kim']);
    await again.unmount();
    await roster.unmount();
  });

  test('a changed mark the roster learns of reaches attendance too', async () => {
    mockStored = null;
    const roster = await loadAttendanceThenRoster();
    mockStored = MARK();
    mockFetches = [];
    mockDeleteError = Object.assign(new LiveDataError(ERR.UNKNOWN, 'changed', null, MARK_CHANGED), { stored: MARK('Sam') });
    await act(async () => { try { await roster.result.current.undo('a-kim', 'parallaxIntake'); } catch (err) { /* the save fails */ } });
    mockFetches = [];
    const again = await mount(useAttendance);
    expect(mockFetches).toEqual(['a-kim']);
    await again.unmount();
    await roster.unmount();
  });

  test('a fitness write does not touch it (attendance has no fitness mark)', async () => {
    mockStored = null;
    const roster = await loadAttendanceThenRoster();
    await act(async () => { await roster.result.current.tick('a-moss', 'fitnessAssessment'); });
    mockFetches = [];
    const again = await mount(useAttendance);
    expect(mockFetches).toEqual([]);
    await again.unmount();
    await roster.unmount();
  });
});

describe('the athlete and household lists come from the server only (card 14, round 8)', () => {
  test('both lists arrive through the server-only read on a good load, and no cache-capable list read runs', async () => {
    const { result, unmount } = await mount();
    expect(mockCalls.sort()).toEqual(['athletes', 'households']);
    expect(mockCached).toEqual([]);
    expect(result.current.data.athletes.map((a) => a.id).sort()).toEqual(['a-kim', 'a-moss']);
    expect(result.current.data.athletes.find((a) => a.id === 'a-kim')).toEqual({ id: 'a-kim', name: 'Dana Kim', householdId: 'h-kim' });
    expect(result.current.data.households).toHaveLength(3);
    await unmount();
  });

  test('offline: the athletes read rejects, so the screen error shows with no data (never an empty list), and nothing read from the cache', async () => {
    mockAthletesFail = true;
    const { result, unmount } = await mount();
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
    expect(mockCached).toEqual([]);
    await unmount();
  });

  test('offline: the households read rejecting fails the whole load too', async () => {
    mockHouseholdsFail = true;
    const { result, unmount } = await mount();
    expect(result.current.error).toBeTruthy();
    expect(result.current.data).toBeNull();
    expect(mockCached).toEqual([]);
    await unmount();
  });
});

describe('a tick shows the stored mark when the read-back found it (card 14, round 8)', () => {
  test('the undo of a read-back mark expects author AND server time; without one, the author alone', async () => {
    const stored = { athleteId: 'a-moss', at: { toMillis: () => 5000 }, by: 'u-owner', byName: 'Pat' };
    mockCreateResult = { status: 'done', milestone: stored };
    const { result, unmount } = await mount();
    await act(async () => { await result.current.tick('a-moss', 'fitnessAssessment'); });
    expect(result.current.data.marks['a-moss'].fitnessAssessment).toBe(stored);
    await act(async () => { await result.current.undo('a-moss', 'fitnessAssessment'); });
    expect(mockExpected).toEqual([{ by: 'u-owner', at: stored.at, fromServer: true }]);
    await unmount();
  });
});

describe('round 9: no undo without a server-verified mark', () => {
  const changed = (stored) => Object.assign(new LiveDataError(ERR.UNKNOWN, 'changed', null, MARK_CHANGED), { stored });

  test('a tick whose read-back failed: the first undo rejects and shows the stored mark; the second expects author AND server time', async () => {
    mockCreateResult = { status: 'done' };
    const { result, unmount } = await mount();
    await act(async () => { await result.current.tick('a-moss', 'fitnessAssessment'); });
    const stored = { athleteId: 'a-moss', at: { toMillis: () => 9000 }, by: 'u-owner', byName: 'Pat' };
    mockDeleteError = changed(stored);
    let thrown;
    await act(async () => { try { await result.current.undo('a-moss', 'fitnessAssessment'); } catch (err) { thrown = err; } });
    expect(thrown).toBeTruthy();
    expect(mockExpected[0]).toEqual({ by: 'u-owner', fromServer: false });
    expect(result.current.data.marks['a-moss'].fitnessAssessment).toBe(stored);
    mockDeleteError = null;
    await act(async () => { await result.current.undo('a-moss', 'fitnessAssessment'); });
    expect(mockExpected[1]).toEqual({ by: 'u-owner', at: stored.at, fromServer: true });
    await unmount();
  });

  test('a tick whose read-back says the mark is gone shows as not done, with no error', async () => {
    mockCreateResult = { status: 'done', milestone: null };
    const { result, unmount } = await mount();
    let answer;
    await act(async () => { answer = await result.current.tick('a-moss', 'fitnessAssessment'); });
    expect(answer).toBe('done');
    expect(result.current.data.marks['a-moss'].fitnessAssessment).toBeNull();
    await unmount();
  });
});
