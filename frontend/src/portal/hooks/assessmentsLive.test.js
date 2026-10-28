/**
 * hooks/assessmentsLive.js: every write's shape is the contract with
 * firestore.rules (athletes/{id}/assessments, assessmentProfile,
 * assessmentSettings, users.assessor; scripts/rules-probes/assessments.mjs),
 * so each is pinned field for field here.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
// Plain functions, not jest.fn(): CRA's resetMocks would clear them before every test.
jest.mock('firebase/firestore', () => ({
  collection: (_db, ...path) => ({ kind: 'collection', path: path.join('/') }),
  collectionGroup: (_db, id) => ({ kind: 'group', id }),
  doc: (_db, ...path) => ({ path: path.join('/') }),
  serverTimestamp: () => 'SERVER_TIME',
  getDoc: async (ref) => mockSnap(ref.path),
  getDocs: async (ref) => {
    mockReads.push(ref.kind === 'group' ? `group:${ref.id}` : ref.path);
    if (mockReadError) throw mockReadError;
    const paths = Object.keys(mockStore).filter((p) => {
      const parts = p.split('/');
      return ref.kind === 'group' ? parts.length === 4 && parts[2] === ref.id : p.startsWith(`${ref.path}/`) && parts.length === ref.path.split('/').length + 1;
    });
    return { docs: paths.map(mockSnap) };
  },
  updateDoc: async (ref, data) => {
    if (mockWriteError) throw mockWriteError;
    mockWrites.push(['update', ref.path, data]);
  },
  setDoc: async (ref, data, opts) => {
    if (mockWriteError) throw mockWriteError;
    mockWrites.push(['set', ref.path, data, opts ?? null]);
  },
  runTransaction: async (_db, run) => {
    const writes = [];
    const out = await run({
      get: async (ref) => mockSnap(ref.path),
      set: (ref, data) => { writes.push(['set', ref.path, data]); },
      update: (ref, data) => { writes.push(['update', ref.path, data]); },
    });
    if (mockWriteError) throw mockWriteError;
    mockWrites.push(...writes);
    return out;
  },
}));
jest.mock('./invalidate', () => ({ __esModule: true, bump: (key) => mockBumps.push(key), useInvalidation: () => 0 }));

import { auth } from '../../firebase';
import { ERR } from './live';
import {
  ASSESSMENTS_KEY, ASSESSMENT_SETTINGS_KEY, fetchAllAssessmentWindows, fetchAssessmentSettings, saveAssessmentProfile, saveAssessmentSettings,
  saveSection, saveWindowFields, setStaffAssessor, startWave,
} from './assessmentsLive';
import { DEFAULT_SETTINGS, circuitModeOf } from '../data/assessmentSettings';

let mockStore;
let mockReads;
let mockWrites;
let mockBumps;
let mockReadError;
let mockWriteError;
function mockSnap(path) {
  return { id: path.split('/').pop(), exists: () => path in mockStore, data: () => mockStore[path], ref: { parent: { parent: { id: path.split('/')[1] } } } };
}
const caught = async (promise) => {
  try { await promise; } catch (e) { return e; }
  return null;
};
const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });

beforeEach(() => {
  auth.currentUser = { uid: 'phil' };
  process.env.REACT_APP_PORTAL_LIVE_DATA = 'true';
  mockStore = {};
  mockReads = [];
  mockWrites = [];
  mockBumps = [];
  mockReadError = null;
  mockWriteError = null;
});
afterEach(() => {
  auth.currentUser = null;
  delete process.env.REACT_APP_PORTAL_LIVE_DATA;
});

describe('reads', () => {
  test('every window in one collection-group read; athleteId from the doc or its path', async () => {
    mockStore['athletes/a1/assessments/2026-27-baseline'] = { athleteId: 'a1', kind: 'baseline' };
    mockStore['athletes/a2/assessments/2026-27-baseline'] = { kind: 'baseline' };
    const rows = await fetchAllAssessmentWindows();
    expect(mockReads).toEqual(['group:assessments']);
    expect(rows.map((r) => [r.id, r.athleteId])).toEqual([['2026-27-baseline', 'a1'], ['2026-27-baseline', 'a2']]);
  });
  test('settings are null until saved; a refused read is the typed permission error', async () => {
    expect(await fetchAssessmentSettings()).toBeNull();
    mockStore['assessmentSettings/current'] = { protocolVersion: 'v1.2.1' };
    expect(await fetchAssessmentSettings()).toEqual({ protocolVersion: 'v1.2.1' });
    mockReadError = denied();
    expect(await caught(fetchAllAssessmentWindows())).toMatchObject({ code: ERR.PERMISSION });
  });
});

describe('saveSection writes one section, its mark and the server time - nothing else', () => {
  test('the exact write, and no refresh of other screens mid-wave', async () => {
    const grip = { right: [32.5, null, null], left: [], deviceRight: 'D1', deviceLeft: 'D1', handlePosition: '3', dominant: 'right' };
    await expect(saveSection({ athleteId: 'a1', windowId: '2026-27-baseline', section: 'grip', value: grip })).resolves.toEqual({ section: 'grip' });
    expect(mockWrites).toEqual([['update', 'athletes/a1/assessments/2026-27-baseline', { grip, 'enteredBy.grip': 'phil', updatedAt: 'SERVER_TIME' }]]);
    expect(mockBumps).toEqual([]);
  });
  test('an unknown section, a missing id or a non-map value is refused before any write', async () => {
    expect(await caught(saveSection({ athleteId: 'a1', windowId: 'w', section: 'score', value: {} }))).toMatchObject({ code: ERR.INVALID });
    expect(await caught(saveSection({ athleteId: 'a1', section: 'grip', value: {} }))).toMatchObject({ code: ERR.INVALID });
    expect(await caught(saveSection({ athleteId: 'a1', windowId: 'w', section: 'grip', value: [1] }))).toMatchObject({ code: ERR.INVALID });
    expect(mockWrites).toEqual([]);
  });
  test('a refused write is the typed permission error; seed mode writes nothing', async () => {
    mockWriteError = denied();
    expect(await caught(saveSection({ athleteId: 'a1', windowId: 'w', section: 'golf', value: { speeds: [88] } }))).toMatchObject({ code: ERR.PERMISSION });
    process.env.REACT_APP_PORTAL_LIVE_DATA = 'false';
    mockWriteError = null;
    await expect(saveSection({ athleteId: 'a1', windowId: 'w', section: 'golf', value: { speeds: [88] } })).resolves.toEqual({ section: 'golf', simulated: true });
    expect(mockWrites).toEqual([]);
  });
});

describe('startWave', () => {
  const settings = DEFAULT_SETTINGS;
  const start = (entries, over = {}) => startWave({ waveId: 'wave-2026-11-03-abc', circuitDate: '2026-11-03', entries, settings, today: '2026-11-05', ...over });

  test('opens a window and a profile per new athlete, exactly as the rules admit', async () => {
    const r = await start([{ athleteId: 'a1', kind: 'baseline', position: 1 }]);
    expect(r).toEqual({ waveId: 'wave-2026-11-03-abc', started: ['a1'], skipped: [] });
    expect(mockWrites).toEqual([
      ['set', 'athletes/a1/assessments/2026-27-baseline', {
        athleteId: 'a1', season: '2026-27', kind: 'baseline', protocolVersion: 'v1.2', circuitMode: circuitModeOf(settings), status: 'open',
        circuitDate: '2026-11-03', golfDate: null, mcgillDate: null, weeksOfExposure: 0, wave: { id: 'wave-2026-11-03-abc', position: 1, coachUid: 'phil' },
        enteredBy: {}, createdAt: 'SERVER_TIME', updatedAt: 'SERVER_TIME',
      }],
      ['set', 'athletes/a1/assessmentProfile/current', {
        athleteId: 'a1', sex: null, firstTestDate: '2026-11-03', medballMassKg: null, medballMethod: null, dominantHand: null, gripDevice: null,
        handlePosition: null, driver: null, season: '2026-27', updatedAt: 'SERVER_TIME', updatedBy: 'phil',
      }],
    ]);
    expect(mockBumps).toEqual([ASSESSMENTS_KEY]);
  });

  test('an athlete already in an open window joins the new wave and keeps every entry (two tablets, or a retest after "absent")', async () => {
    mockStore['athletes/a1/assessments/2026-27-baseline'] = { athleteId: 'a1', status: 'open', grip: { right: [30] }, circuitDate: '2026-11-03' };
    mockStore['athletes/a1/assessmentProfile/current'] = { athleteId: 'a1', firstTestDate: '2026-11-03', season: '2026-27', sex: 'female' };
    const r = await start([{ athleteId: 'a1', kind: 'baseline', position: 2 }], { circuitDate: '2026-11-05' });
    expect(r.started).toEqual(['a1']);
    expect(mockWrites).toEqual([['update', 'athletes/a1/assessments/2026-27-baseline', {
      wave: { id: 'wave-2026-11-03-abc', position: 2, coachUid: 'phil' }, circuitDate: '2026-11-05', weeksOfExposure: 0, updatedAt: 'SERVER_TIME',
    }]]);
  });

  test('an open window more than 14 days old is skipped, never moved into the wave (it is completed instead)', async () => {
    mockStore['athletes/a1/assessments/2026-27-baseline'] = { athleteId: 'a1', status: 'open', grip: { right: [30] }, circuitDate: '2026-11-03' };
    const r = await start([{ athleteId: 'a1', kind: 'baseline', position: 1 }], { circuitDate: '2026-11-20', today: '2026-11-20' });
    expect(r).toEqual({ waveId: 'wave-2026-11-03-abc', started: [], skipped: [{ athleteId: 'a1', reason: 'stale' }] });
    expect(mockWrites).toEqual([]);
  });

  test('a profile already in a later season is left alone: the season only moves forward', async () => {
    mockStore['athletes/a1/assessmentProfile/current'] = { athleteId: 'a1', firstTestDate: '2026-11-03', season: '2027-28' };
    await start([{ athleteId: 'a1', kind: 'end', position: 1 }]);
    expect(mockWrites.map(([, path]) => path)).toEqual(['athletes/a1/assessments/2026-27-end']);
  });

  test('a complete window is skipped; weeks of exposure count from the first test; a new season resets the med ball', async () => {
    mockStore['athletes/a1/assessments/2026-27-baseline'] = { status: 'complete' };
    mockStore['athletes/a2/assessmentProfile/current'] = { athleteId: 'a2', firstTestDate: '2026-11-03', season: '2026-27', medballMethod: 'speed' };
    mockStore['athletes/a3/assessmentProfile/current'] = { athleteId: 'a3', firstTestDate: '2026-01-10', season: '2025-26', medballMethod: 'speed', medballMassKg: 3, sex: 'male' };
    const r = await start([{ athleteId: 'a1', kind: 'baseline', position: 1 }, { athleteId: 'a2', kind: 'mid', position: 2 }, { athleteId: 'a3', kind: 'baseline', position: 3 }],
      { circuitDate: '2026-12-29' });
    expect(r.skipped).toEqual([{ athleteId: 'a1', reason: 'complete' }]);
    expect(r.started).toEqual(['a2', 'a3']);
    const byPath = Object.fromEntries(mockWrites.map(([, path, data]) => [path, data]));
    expect(byPath['athletes/a2/assessments/2026-27-mid'].weeksOfExposure).toBe(8);
    expect('athletes/a2/assessmentProfile/current' in byPath).toBe(false);
    expect(byPath['athletes/a3/assessmentProfile/current']).toMatchObject({ firstTestDate: '2026-01-10', season: '2026-27', medballMethod: null, medballMassKg: null, sex: 'male' });
    expect('athletes/a1/assessments/2026-27-baseline' in byPath).toBe(false);
  });

  test('a wave is 1 to 4 athletes with a kind and a position; the date must be a date', async () => {
    const five = [1, 2, 3, 4, 5].map((i) => ({ athleteId: `a${i}`, kind: 'baseline', position: Math.min(i, 4) }));
    expect(await caught(start(five))).toMatchObject({ code: ERR.INVALID });
    expect(await caught(start([]))).toMatchObject({ code: ERR.INVALID });
    expect(await caught(start([{ athleteId: 'a1', kind: 'final', position: 1 }]))).toMatchObject({ code: ERR.INVALID });
    expect(await caught(start([{ athleteId: 'a1', kind: 'baseline', position: 1 }], { circuitDate: 'Nov 3' }))).toMatchObject({ code: ERR.INVALID });
    expect(mockWrites).toEqual([]);
  });
});

describe('window fields, profile, settings, the assessor flag', () => {
  test('window fields: only the five the rules admit; a status change refreshes the lists', async () => {
    await saveWindowFields({ athleteId: 'a1', windowId: 'w', fields: { golfDate: '2026-11-04' } });
    await saveWindowFields({ athleteId: 'a1', windowId: 'w', fields: { status: 'complete' } });
    expect(mockWrites).toEqual([
      ['update', 'athletes/a1/assessments/w', { golfDate: '2026-11-04', updatedAt: 'SERVER_TIME' }],
      ['update', 'athletes/a1/assessments/w', { status: 'complete', updatedAt: 'SERVER_TIME' }],
    ]);
    expect(mockBumps).toEqual([ASSESSMENTS_KEY]);
    expect(await caught(saveWindowFields({ athleteId: 'a1', windowId: 'w', fields: { kind: 'mid' } }))).toMatchObject({ code: ERR.INVALID });
  });
  test('profile: a merge of known fields with the writer and the server time', async () => {
    await saveAssessmentProfile({ athleteId: 'a1', patch: { sex: 'female' } });
    expect(mockWrites).toEqual([['set', 'athletes/a1/assessmentProfile/current', { sex: 'female', athleteId: 'a1', updatedAt: 'SERVER_TIME', updatedBy: 'phil' }, { merge: true }]]);
    expect(await caught(saveAssessmentProfile({ athleteId: 'a1', patch: { score: 1 } }))).toMatchObject({ code: ERR.INVALID });
  });
  test('settings: the whole doc, defaults filled in, with the writer and the server time', async () => {
    await expect(saveAssessmentSettings({ ...DEFAULT_SETTINGS, protocolVersion: 'v1.2.1', waveSize: 3 })).resolves.toEqual({ protocolVersion: 'v1.2.1' });
    const [[op, path, data]] = mockWrites;
    expect([op, path]).toEqual(['set', 'assessmentSettings/current']);
    expect(data).toEqual({ ...DEFAULT_SETTINGS, protocolVersion: 'v1.2.1', waveSize: 3, updatedAt: 'SERVER_TIME', updatedBy: 'phil' });
    expect(mockBumps).toEqual([ASSESSMENT_SETTINGS_KEY]);
    expect(await caught(saveAssessmentSettings({ ...DEFAULT_SETTINGS, protocolVersion: '1.3' }))).toMatchObject({ code: ERR.INVALID });
  });
  test('the Assessments permission: one bool on the users doc, then the staff list re-reads', async () => {
    await expect(setStaffAssessor({ uid: 'u2', assessor: true })).resolves.toEqual({ uid: 'u2', assessor: true });
    expect(mockWrites).toEqual([['update', 'users/u2', { assessor: true }]]);
    expect(mockBumps).toEqual(['users']);
    expect(await caught(setStaffAssessor({ uid: 'u2', assessor: 'yes' }))).toMatchObject({ code: ERR.INVALID });
  });
});
