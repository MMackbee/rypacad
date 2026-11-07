/**
 * Boys/Girls at 15 & up (owner ruling 2026-11-06), the Firestore side: the
 * pre-fill reads only the 15 & up results, and saveTournamentResults refuses
 * a bracket this app must never write (a bare '15+', a legacy id, junk)
 * before any write starts. Firebase is mocked out; the SDK stand-in is just
 * enough for the query and setDoc shapes.
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'coach-test' } }, db: {} }));
jest.mock('./invalidate', () => ({ bump: () => {} }));
jest.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ collection: name }),
  doc: (_db, col, id) => ({ path: `${col}/${id}` }),
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

import { fetchSplitBracketResults } from './tourDivisions';
import { ERR, saveTournamentResults } from './live';
import { priorDivisions } from '../data/tourDivisions';

beforeEach(() => {
  mockQueries.length = 0;
  mockSets.length = 0;
  mockRows = [];
});

test('the pre-fill reads tournamentResults where bracket is 15+B or 15+G, nothing wider', async () => {
  mockRows = [{ id: '2026-11-07-1_ava', athleteId: 'ava', bracket: '15+G', date: '2026-11-07' }];
  const rows = await fetchSplitBracketResults();
  expect(mockQueries).toEqual([{ collection: 'tournamentResults', filters: [{ field: 'bracket', op: 'in', value: ['15+B', '15+G'] }] }]);
  expect(priorDivisions(rows, ['ava'])).toEqual({ ava: 'G' });
});

const entry = (bracket) => ({ athleteId: 'ava', name: 'Ava Test', bracket, score: 40 });

test.each([['15+'], ['14+'], ['10U'], ['11-13'], ['zz'], ['open']])(
  'saveTournamentResults refuses bracket %p before writing anything',
  async (bracket) => {
    await expect(saveTournamentResults('2026-11-07-1', '2026-11-07', [entry('11U'), entry(bracket)])).rejects.toMatchObject({ code: ERR.INVALID });
    expect(mockSets).toEqual([]);
  }
);

test('saveTournamentResults writes the current ids and null (Open) as given', async () => {
  const entries = ['11U', '12-14', '15+B', '15+G', null].map((bracket, i) => ({ athleteId: `a${i}`, name: null, bracket, score: 40 + i }));
  await saveTournamentResults('2026-11-07-1', '2026-11-07', entries);
  expect(mockSets.map((s) => [s.path, s.data.bracket])).toEqual([
    ['tournamentResults/2026-11-07-1_a0', '11U'],
    ['tournamentResults/2026-11-07-1_a1', '12-14'],
    ['tournamentResults/2026-11-07-1_a2', '15+B'],
    ['tournamentResults/2026-11-07-1_a3', '15+G'],
    ['tournamentResults/2026-11-07-1_a4', null],
  ]);
});
