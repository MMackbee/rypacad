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
  getDocs: async (ref) => {
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
  fetchAllAthletes: async () => {
    mockCalls.push('athletes');
    if (mockAthletesFail) throw Object.assign(new Error('offline'), { code: 'unavailable' });
    return mockAthletes;
  },
  fetchAllHouseholds: async () => { mockCalls.push('households'); return mockHouseholds; },
}));
jest.mock('./parallaxLive', () => ({
  INTAKE_KEY: 'milestones',
  intakeStamp: () => 'NOW',
  createIntake: async (athleteId, body, docId) => {
    mockWrites.push(['create', athleteId, body, docId]);
    return mockCreateResult;
  },
  deleteIntake: async (athleteId, docId) => {
    mockWrites.push(['delete', athleteId, docId]);
    if (mockDeleteError) throw mockDeleteError;
  },
  fetchIntake: async (athleteId, docId) => {
    mockWrites.push(['fetch', athleteId, docId]);
    return mockStored;
  },
}));

import { ERR } from './live';
import { useAthleteRoster } from './athleteRoster';

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
let mockStored;

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
  mockStored = null;
});

const flush = async () => { for (let i = 0; i < 12; i += 1) await act(async () => {}); };
async function mount() {
  const result = { current: null };
  function Probe() {
    result.current = useAthleteRoster();
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
