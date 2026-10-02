/**
 * hooks/scholarships.js: the owner's read of scholarshipApplications and the
 * decision write. The write's shape is the contract with firestore.rules
 * (scholarshipDecisionOk; scripts/verify-rules.mjs taskScholarship), so it
 * is pinned field for field here.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
// Plain functions, not jest.fn(): CRA's resetMocks would clear them before every test.
jest.mock('firebase/firestore', () => ({
  collection: (_db, col) => ({ col }),
  doc: (_db, col, id) => ({ col, id }),
  serverTimestamp: () => 'SERVER_TIME',
  deleteField: () => 'DELETE_FIELD',
  getDocs: async (ref) => {
    mockReads.push(ref.col);
    if (mockReadError) throw mockReadError;
    return { docs: Object.entries(mockStore[ref.col] ?? {}).map(([id, data]) => ({ id, data: () => data })) };
  },
  // The decision is one transaction: a read of the doc, then the update. The update is recorded as { ref, patch }.
  runTransaction: async (_db, run) => {
    const updates = [];
    await run({
      get: async (ref) => {
        mockTxReads.push(`${ref.col}/${ref.id}`);
        const data = (mockStore[ref.col] ?? {})[ref.id];
        return { exists: () => data !== undefined, data: () => data };
      },
      update: (ref, patch) => { updates.push({ ref, patch }); },
    });
    mockWrites.push(...updates);
    if (mockWriteError) throw mockWriteError;
  },
}));
jest.mock('./invalidate', () => ({ __esModule: true, bump: jest.fn(), useInvalidation: () => 0 }));

import { auth } from '../../firebase';
import { ERR } from './live';
import { bump } from './invalidate';
import useScholarships, { SCHOLARSHIPS_KEY, decideScholarship, fetchScholarshipApplications } from './scholarships';

let mockStore;
let mockReads;
let mockTxReads;
let mockWrites;
let mockReadError;
let mockWriteError;

const caught = async (promise) => {
  try { await promise; } catch (e) { return e; }
  return null;
};
const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });

beforeEach(() => {
  auth.currentUser = { uid: 'owner-1' };
  process.env.REACT_APP_PORTAL_LIVE_DATA = 'true';
  mockReads = [];
  mockTxReads = [];
  mockWrites = [];
  mockReadError = null;
  mockWriteError = null;
  mockStore = {
    scholarshipApplications: {
      older: { athlete: 'Ava Lee', status: 'approved', createdAtMs: 100, updatedAtMs: 100, decidedBy: 'owner-1', decidedAt: { toMillis: () => 150 } },
      newest: { athlete: 'Sam Hart', status: 'new', createdAtMs: 300, updatedAtMs: 300 },
      middle: { athlete: 'Kai Roy', status: 'declined', createdAtMs: 50, updatedAtMs: 200, decidedBy: 'owner-2', decidedAt: { toMillis: () => 120 } },
    },
  };
});
afterEach(() => {
  auth.currentUser = null;
  delete process.env.REACT_APP_PORTAL_LIVE_DATA;
});

describe('fetchScholarshipApplications', () => {
  test('one unfiltered read of the collection; decidedAt becomes decidedAtMs (null until decided)', async () => {
    const rows = await fetchScholarshipApplications();
    expect(mockReads).toEqual(['scholarshipApplications']);
    expect(rows.map((r) => [r.id, r.decidedAtMs])).toEqual([['older', 150], ['newest', null], ['middle', 120]]);
    expect(rows[0]).toEqual({ id: 'older', athlete: 'Ava Lee', status: 'approved', createdAtMs: 100, updatedAtMs: 100, decidedBy: 'owner-1', decidedAtMs: 150 });
    expect('decidedAt' in rows[0]).toBe(false);
  });

  test('a refused read (not an owner) is the typed permission error', async () => {
    mockReadError = denied();
    expect(await caught(fetchScholarshipApplications())).toMatchObject({ code: ERR.PERMISSION });
  });
});

describe('decideScholarship writes exactly what the rule admits', () => {
  test('approve and decline: status, decidedBy (this owner) and decidedAt (server time), then the key is bumped', async () => {
    await expect(decideScholarship({ id: 'newest', status: 'approved' })).resolves.toEqual({ id: 'newest', status: 'approved' });
    await decideScholarship({ id: 'older', status: 'declined' });
    expect(mockWrites).toEqual([
      { ref: { col: 'scholarshipApplications', id: 'newest' }, patch: { status: 'approved', decidedBy: 'owner-1', decidedAt: 'SERVER_TIME' } },
      { ref: { col: 'scholarshipApplications', id: 'older' }, patch: { status: 'declined', decidedBy: 'owner-1', decidedAt: 'SERVER_TIME' } },
    ]);
    expect(bump.mock.calls).toEqual([[SCHOLARSHIPS_KEY], [SCHOLARSHIPS_KEY]]);
    expect(SCHOLARSHIPS_KEY).toBe('scholarshipApplications');
    // Each decision read its own doc first, inside the same transaction, and nothing else.
    expect(mockTxReads).toEqual(['scholarshipApplications/newest', 'scholarshipApplications/older']);
    expect(mockReads).toEqual([]);
  });

  test('the version on screen is the one decided: the same updatedAtMs writes, a later one writes nothing and reloads the list', async () => {
    await expect(decideScholarship({ id: 'newest', status: 'approved', updatedAtMs: 300 })).resolves.toEqual({ id: 'newest', status: 'approved' });
    expect(mockWrites).toHaveLength(1);
    expect(bump).toHaveBeenCalledTimes(1);
    // The family sends the form again (the function moves updatedAtMs); the owner's screen still shows the 300 version.
    mockStore.scholarshipApplications.newest = { ...mockStore.scholarshipApplications.newest, updatedAtMs: 900, submissions: 2 };
    for (const status of ['approved', 'declined', 'new']) {
      expect(await caught(decideScholarship({ id: 'newest', status, updatedAtMs: 300 }))).toMatchObject({ code: ERR.INVALID, reason: 'resubmitted' });
    }
    expect(mockWrites).toHaveLength(1);
    // Each refusal reloads: the row on screen is no longer what is stored.
    expect(bump.mock.calls).toEqual([[SCHOLARSHIPS_KEY], [SCHOLARSHIPS_KEY], [SCHOLARSHIPS_KEY], [SCHOLARSHIPS_KEY]]);
    // Read again, the new version decides.
    await decideScholarship({ id: 'newest', status: 'declined', updatedAtMs: 900 });
    expect(mockWrites[1]).toEqual({ ref: { col: 'scholarshipApplications', id: 'newest' }, patch: { status: 'declined', decidedBy: 'owner-1', decidedAt: 'SERVER_TIME' } });
  });

  test('an application that is no longer there: not found, nothing written, nothing reloaded', async () => {
    expect(await caught(decideScholarship({ id: 'gone', status: 'approved', updatedAtMs: 300 }))).toMatchObject({ code: ERR.NOT_FOUND });
    expect(mockWrites).toEqual([]);
    expect(bump).not.toHaveBeenCalled();
  });

  test("reopen: status 'new', decidedBy and decidedAt removed", async () => {
    await decideScholarship({ id: 'older', status: 'new' });
    expect(mockWrites).toEqual([
      { ref: { col: 'scholarshipApplications', id: 'older' }, patch: { status: 'new', decidedBy: 'DELETE_FIELD', decidedAt: 'DELETE_FIELD' } },
    ]);
    expect(bump).toHaveBeenCalledTimes(1);
  });

  test('a status outside the three, or no id: refused here, nothing written', async () => {
    for (const args of [{ id: 'newest', status: 'paid' }, { id: 'newest' }, { id: '', status: 'approved' }, { status: 'approved' }, { id: 7, status: 'approved' }, undefined]) {
      expect(await caught(decideScholarship(args))).toMatchObject({ code: ERR.INVALID });
    }
    expect(mockWrites).toEqual([]);
    expect(bump).not.toHaveBeenCalled();
  });

  test('a refused or failed write rejects with the typed error and reloads nothing', async () => {
    mockWriteError = denied();
    expect(await caught(decideScholarship({ id: 'newest', status: 'approved' }))).toMatchObject({ code: ERR.PERMISSION });
    mockWriteError = Object.assign(new Error('offline'), { code: 'unavailable' });
    expect(await caught(decideScholarship({ id: 'newest', status: 'declined' }))).toMatchObject({ code: ERR.UNAVAILABLE });
    expect(bump).not.toHaveBeenCalled();
  });

  test('signed out: refused before any write', async () => {
    auth.currentUser = null;
    expect(await caught(decideScholarship({ id: 'newest', status: 'approved' }))).toMatchObject({ code: ERR.UNAUTHENTICATED });
    expect(mockWrites).toEqual([]);
  });

  test('demo (seed) mode: resolves, writes nothing, reloads nothing', async () => {
    delete process.env.REACT_APP_PORTAL_LIVE_DATA;
    auth.currentUser = null;
    await expect(decideScholarship({ id: 'newest', status: 'approved' })).resolves.toEqual({ id: 'newest', status: 'approved', simulated: true });
    expect(mockWrites).toEqual([]);
    expect(bump).not.toHaveBeenCalled();
  });
});

describe('useScholarships', () => {
  async function mountHook() {
    const seen = [];
    function Probe() {
      seen.push(useScholarships());
      return null;
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => { root.render(<Probe />); });
    return { seen, unmount: () => act(async () => { root.unmount(); }) };
  }

  test('live: loading, then rows newest first with their counts', async () => {
    const h = await mountHook();
    expect(h.seen[0]).toEqual({ data: null, loading: true, error: null });
    const last = h.seen[h.seen.length - 1];
    expect(last.loading).toBe(false);
    expect(last.data.rows.map((r) => r.id)).toEqual(['newest', 'middle', 'older']);
    expect(last.data.counts).toEqual({ new: 1, approved: 1, declined: 1, all: 3 });
    expect(mockReads).toEqual(['scholarshipApplications']);
    await h.unmount();
  });

  test('live, read refused: the error, no rows', async () => {
    mockReadError = denied();
    const h = await mountHook();
    const last = h.seen[h.seen.length - 1];
    expect(last).toMatchObject({ data: null, loading: false, error: { code: ERR.PERMISSION } });
    await h.unmount();
  });

  test('seed mode: an honest empty list, and no read at all', async () => {
    delete process.env.REACT_APP_PORTAL_LIVE_DATA;
    const h = await mountHook();
    expect(h.seen[h.seen.length - 1]).toEqual({ data: { rows: [], counts: { new: 0, approved: 0, declined: 0, all: 0 } }, loading: false, error: null });
    expect(mockReads).toEqual([]);
    await h.unmount();
  });
});
