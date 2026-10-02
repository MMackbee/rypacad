/**
 * setAthleteHandicap (2026-10-02): the academy's edit of the handicap on
 * file. The seam is tested over a mocked adapter (live delegates, seed is a
 * local echo); the adapter's own write is tested against a mocked SDK below.
 * firestore.rules' handicapUpdateOk is the real boundary
 * (scripts/verify-rules.mjs taskReserved).
 */
const mockWrite = jest.fn();
let mockLive = true;
jest.mock('./live', () => {
  const actual = jest.requireActual('./live');
  return { ...actual, isLive: () => mockLive, setAthleteHandicap: (...args) => mockWrite(...args) };
});
jest.mock('../../firebase', () => ({ auth: { currentUser: { uid: 'ops1' } }, db: {} }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), serverTimestamp: jest.fn(), updateDoc: jest.fn() }));
jest.mock('./invalidate', () => ({ bump: jest.fn() }));

import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { bump } from './invalidate';
import { setAthleteHandicap } from './handicap';

const { ERR, setAthleteHandicap: adapterWrite } = jest.requireActual('./live');

beforeEach(() => {
  jest.clearAllMocks();
  mockWrite.mockReset();
  doc.mockImplementation((db, col, id) => `${col}/${id}`);
  serverTimestamp.mockReturnValue('SERVER_TIME');
  updateDoc.mockResolvedValue(undefined);
});

describe('the seam', () => {
  test('live: the adapter writes, and its refusal reaches the caller', async () => {
    mockLive = true;
    mockWrite.mockResolvedValue({ athleteId: 'a2', handicap: 4 });
    await expect(setAthleteHandicap({ athleteId: 'a2', handicap: 4 })).resolves.toEqual({ athleteId: 'a2', handicap: 4 });
    expect(mockWrite).toHaveBeenCalledWith({ athleteId: 'a2', handicap: 4 });
    mockWrite.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await expect(setAthleteHandicap({ athleteId: 'a2', handicap: 4 })).rejects.toMatchObject({ code: 'permission-denied' });
  });

  test('seed: a local echo held to the same range, no write', async () => {
    mockLive = false;
    await expect(setAthleteHandicap({ athleteId: 'jordan', handicap: 0 })).resolves.toEqual({ athleteId: 'jordan', handicap: 0, simulated: true });
    await expect(setAthleteHandicap({ athleteId: 'jordan', handicap: null })).resolves.toEqual({ athleteId: 'jordan', handicap: null, simulated: true });
    for (const handicap of [-1, 55, 4.5, '4', undefined]) {
      await expect(setAthleteHandicap({ athleteId: 'jordan', handicap })).rejects.toMatchObject({ code: ERR.INVALID, reason: 'handicap-range' });
    }
    await expect(setAthleteHandicap({ handicap: 4 })).rejects.toMatchObject({ code: ERR.INVALID });
    expect(mockWrite).not.toHaveBeenCalled();
  });
});

describe('the adapter write', () => {
  test('writes the handicap and the server updatedAt, then bumps athletes', async () => {
    for (const handicap of [0, 5, 54, null]) {
      updateDoc.mockClear();
      await expect(adapterWrite({ athleteId: 'a2', handicap })).resolves.toEqual({ athleteId: 'a2', handicap });
      expect(updateDoc).toHaveBeenCalledWith('athletes/a2', { handicap, updatedAt: 'SERVER_TIME' });
    }
    expect(bump).toHaveBeenCalledWith('athletes');
  });

  test('out of range, not a whole number, a string or no athlete is refused before any write', async () => {
    for (const handicap of [-1, 55, 4.5, '4', '', undefined]) {
      await expect(adapterWrite({ athleteId: 'a2', handicap })).rejects.toMatchObject({
        code: ERR.INVALID,
        reason: 'handicap-range',
        message: 'Handicap is a whole number from 0 to 54, or leave it blank.',
      });
    }
    await expect(adapterWrite({ athleteId: null, handicap: 4 })).rejects.toMatchObject({ code: ERR.INVALID });
    expect(updateDoc).not.toHaveBeenCalled();
    expect(bump).not.toHaveBeenCalled();
  });

  test('a rules refusal (a parent, or rules not deployed yet) surfaces as permission-denied, nothing bumped', async () => {
    updateDoc.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    await expect(adapterWrite({ athleteId: 'a2', handicap: 4 })).rejects.toMatchObject({ code: ERR.PERMISSION });
    expect(bump).not.toHaveBeenCalled();
  });
});
