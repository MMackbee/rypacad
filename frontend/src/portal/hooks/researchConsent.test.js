jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
// Plain functions, not jest.fn(): CRA's resetMocks would clear them before every test.
jest.mock('firebase/firestore', () => ({
  doc: (_db, ...path) => ({ path: path.join('/') }),
  serverTimestamp: () => 'SERVER_TIME',
  updateDoc: async (ref, data) => {
    if (mockWriteError) throw mockWriteError;
    mockWrites.push([ref.path, data]);
  },
}));
jest.mock('./invalidate', () => ({ __esModule: true, bump: (key) => mockBumps.push(key), useInvalidation: () => 0 }));
jest.mock('./live', () => ({ ...jest.requireActual('./live'), isLive: () => true }));

import { auth } from '../../firebase';
import { ASSESSMENTS_KEY } from './assessmentsLive';
import { RESEARCH_KEY, pendingResearch, recordResearchChange, saveResearchConsent } from './researchConsent';

let mockWrites;
let mockBumps;
let mockWriteError;
beforeEach(() => {
  mockWrites = [];
  mockBumps = [];
  mockWriteError = null;
  auth.currentUser = { uid: 'p1' };
});

test('a parent is asked about every household athlete with no answer recorded', () => {
  const athletes = [
    { id: 'a1', name: 'Jordan Whitfield', dob: '2012-06-17', consents: { dataCollection: true, research: null } },
    { id: 'a2', name: 'Reese Whitfield', dob: '2007-01-01' },
    { id: 'a3', name: 'Sam Whitfield', dob: '2013-01-01', consents: { research: { value: false, assent: false } } },
  ];
  expect(pendingResearch({ user: { uid: 'p1', role: 'parent' }, athletes, household: null, todayISO: '2026-10-15' })).toEqual([
    { id: 'a1', name: 'Jordan Whitfield', self: false, minor: true },
    { id: 'a2', name: 'Reese Whitfield', self: false, minor: false },
  ]);
});

test("an 18+ member who created their own household answers for themselves; a child's login never does", () => {
  const me = [{ id: 's1', name: 'Sam Reyes', dob: '2000-01-01' }];
  expect(pendingResearch({ user: { uid: 'u1', role: 'athlete', athleteId: 's1' }, athletes: me, household: { createdBy: 'u1' }, todayISO: '2026-10-15' }))
    .toEqual([{ id: 's1', name: 'Sam Reyes', self: true, minor: false }]);
  expect(pendingResearch({ user: { uid: 'kid', role: 'athlete', athleteId: 's1' }, athletes: me, household: { createdBy: 'p1' }, todayISO: '2026-10-15' })).toEqual([]);
  expect(pendingResearch({ user: { uid: 'c1', role: 'coach' }, athletes: me, household: null, todayISO: '2026-10-15' })).toEqual([]);
});

test('saveResearchConsent writes consents.research only, dated and signed, and refreshes the gate', async () => {
  await saveResearchConsent({ athleteId: 'a1', answer: { value: true, assent: true } });
  expect(mockWrites).toEqual([['athletes/a1', { 'consents.research': { value: true, assent: true, recordedAt: 'SERVER_TIME', recordedBy: 'p1' } }]]);
  expect(mockBumps).toEqual([RESEARCH_KEY]);
  await expect(saveResearchConsent({ athleteId: 'a1', answer: { value: 'yes' } })).rejects.toThrow('saveResearchConsent');
});

test("the owner's recorded change keeps the earlier answer on the history", async () => {
  auth.currentUser = { uid: 'owner1' };
  const current = { value: true, assent: true, recordedAt: 'TS-1015', recordedBy: 'p1', history: [{ value: false, assent: false, recordedAt: 'TS-1001', recordedBy: 'p1' }] };
  await recordResearchChange({ athleteId: 'a1', answer: { value: false, assent: false }, current });
  expect(mockWrites).toEqual([['athletes/a1', { 'consents.research': {
    value: false, assent: false, recordedAt: 'SERVER_TIME', recordedBy: 'owner1',
    history: [{ value: false, assent: false, recordedAt: 'TS-1001', recordedBy: 'p1' }, { value: true, assent: true, recordedAt: 'TS-1015', recordedBy: 'p1' }],
  } }]]);
  expect(mockBumps).toEqual([RESEARCH_KEY, ASSESSMENTS_KEY]);
  mockWrites = [];
  await recordResearchChange({ athleteId: 'a2', answer: { value: true, assent: null }, current: null });
  expect(mockWrites[0][1]['consents.research'].history).toEqual([]);
});

test('a refused write is reported, not swallowed', async () => {
  mockWriteError = Object.assign(new Error('denied'), { code: 'permission-denied' });
  await expect(saveResearchConsent({ athleteId: 'a1', answer: { value: false, assent: false } })).rejects.toBeTruthy();
  expect(mockBumps).toEqual([]);
});
