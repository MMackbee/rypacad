/**
 * The Tour score sheet's Firestore side (owner rulings 2026-11-06): the
 * history read behind the Boys/Girls pre-fill and the coach quick picks, and
 * saveTournamentResults refusing what the rules refuse - before any write
 * starts - while writing gender only when there is one. Firebase is mocked
 * out; the SDK stand-in is just enough for the query and setDoc shapes.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'coach-test' } }, db: {} }));
jest.mock('./invalidate', () => ({ bump: () => {} }));
jest.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ collection: name }),
  doc: (_db, col, id) => ({ path: `${col}/${id}` }),
  orderBy: (field) => ({ orderBy: field }),
  where: (field, op, value) => ({ field, op, value }),
  query: (ref, ...filters) => ({ ...ref, filters }),
  getDocs: async (q) => {
    mockQueries.push(q);
    return { docs: mockRows.map((r) => ({ id: r.id, data: () => r })) };
  },
  setDoc: async (ref, data) => {
    mockSets.push({ path: ref.path, data });
  },
  serverTimestamp: () => 'SERVER_TS',
}));

const mockQueries = [];
const mockSets = [];
let mockRows = [];

import { fetchTourSheetHistory } from './tourSheet';
import { ERR, saveTournamentResults } from './live';

beforeEach(() => {
  mockQueries.length = 0;
  mockSets.length = 0;
  mockRows = [];
});

test('the history is the standings read of tournamentResults: genders and coaches out of it', async () => {
  mockRows = [
    { id: '2026-10-31-1_ava', athleteId: 'ava', bracket: '11-14', gender: 'girls', date: '2026-10-31', score: 80 },
    { id: '2026-10-31-1_coach_pat', athleteId: 'coach_pat', bracket: 'coaches', gender: 'boys', name: 'Pat', date: '2026-10-31', score: 75 },
  ];
  const out = await fetchTourSheetHistory();
  expect(mockQueries).toEqual([{ collection: 'tournamentResults', filters: [{ orderBy: 'date' }] }]);
  expect(out).toEqual({ genderById: { ava: 'girls', coach_pat: 'boys' }, coaches: [{ athleteId: 'coach_pat', name: 'Pat', gender: 'boys' }] });
});

const entry = (extra) => ({ athleteId: 'ava', name: 'Ava Test', bracket: '11-14', gender: 'girls', score: 80, ...extra });

test.each([
  ['a legacy bracket', { bracket: '14+' }],
  ['a made-up age group', { bracket: '12-15' }],
  ['junk', { bracket: 'zz' }],
  ['an unknown gender', { gender: 'female' }],
  ['a kid filed as a coach', { bracket: 'coaches' }],
  ['a coach id in a kid bracket', { athleteId: 'coach_ava' }],
])('saveTournamentResults refuses %s before writing anything', async (_what, extra) => {
  await expect(saveTournamentResults('2026-11-07-1', '2026-11-07', [entry({}), entry(extra)])).rejects.toMatchObject({ code: ERR.INVALID });
  expect(mockSets).toEqual([]);
});

test('saveTournamentResults writes the current ids, gender only when set, and a coach entry as given', async () => {
  await saveTournamentResults('2026-11-07-1', '2026-11-07', [
    entry({ athleteId: 'a0', bracket: '10U', gender: null, score: 41 }),
    entry({ athleteId: 'a1' }),
    entry({ athleteId: 'a2', bracket: '15-18', gender: 'boys' }),
    entry({ athleteId: 'a3', bracket: null, gender: null }),
    { athleteId: 'coach_pat-lee', name: 'Pat Lee', bracket: 'coaches', gender: 'boys', score: 76 },
  ]);
  expect(mockSets.map((s) => [s.path, s.data.bracket, 'gender' in s.data ? s.data.gender : 'absent'])).toEqual([
    ['tournamentResults/2026-11-07-1_a0', '10U', 'absent'],
    ['tournamentResults/2026-11-07-1_a1', '11-14', 'girls'],
    ['tournamentResults/2026-11-07-1_a2', '15-18', 'boys'],
    ['tournamentResults/2026-11-07-1_a3', null, 'absent'],
    ['tournamentResults/2026-11-07-1_coach_pat-lee', 'coaches', 'boys'],
  ]);
  expect(Object.keys(mockSets[1].data).sort()).toEqual(['athleteId', 'bracket', 'createdAt', 'createdBy', 'date', 'gender', 'name', 'score', 'sessionId']);
  expect(mockSets[4].data.name).toBe('Pat Lee');
});
