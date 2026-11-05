/**
 * The family's consent hooks and the staff tracker (plan Task 10): seed mode
 * against the fixtures, and live mode against mocked reads and writes - a
 * parent never gets a record by id (Review Focus 2), and a save hands the
 * exact shapes to the live writes.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const mockApi = { live: false };
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));
jest.mock('firebase/firestore', () => ({}));
jest.mock('./callables', () => ({ callRequestMentalConsent: (...a) => mockApi.callRequestMentalConsent(...a) }));
jest.mock('./live', () => ({
  ...jest.requireActual('./live'),
  isLive: () => mockApi.live === true,
  fetchCurrentUser: (...a) => mockApi.fetchCurrentUser(...a),
  fetchAthlete: (...a) => mockApi.fetchAthlete(...a),
  fetchBookings: (...a) => mockApi.fetchBookings(...a),
  fetchHousehold: (...a) => mockApi.fetchHousehold(...a),
  fetchHouseholdAthletes: (...a) => mockApi.fetchHouseholdAthletes(...a),
  fetchHouseholdBookings: (...a) => mockApi.fetchHouseholdBookings(...a),
}));
jest.mock('./signups', () => ({ ...jest.requireActual('./signups'), fetchLoginInvite: (...a) => mockApi.fetchLoginInvite(...a) }));
jest.mock('./mentalConsentLive', () => ({
  ...jest.requireActual('./mentalConsentLive'),
  consentStamp: () => 'NOW',
  createConsent: (...a) => mockApi.createConsent(...a),
  fetchHouseholdConsents: (...a) => mockApi.fetchHouseholdConsents(...a),
  fetchOwnConsent: (...a) => mockApi.fetchOwnConsent(...a),
  updateConsent: (...a) => mockApi.updateConsent(...a),
}));
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), academyDateISO: () => '2026-11-05' }));
import { countersignConsent, seedFamilyConsents, sendConsentReminder, useConsentFlow, useFamilyConsents, withdrawRecording } from './mentalConsent';
import { useConsentTracker } from './mentalConsentStaff';
import { homeCardFor } from '../data/mentalConsent';
import { initialFlow } from '../data/consentFlow';

function mountHook(useHook) {
  const out = { current: null };
  function Probe() { out.current = useHook(); return null; }
  const div = document.createElement('div');
  const root = createRoot(div);
  return { out, render: async () => { await act(async () => { root.render(<Probe />); }); }, unmount: () => act(() => root.unmount()) };
}
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const settle = async (h) => { await h.render(); await tick(); await tick(); };
const seed = (o) => seedFamilyConsents({ as: 'parent', today: '2026-11-05', utcToday: '2026-11-05', ...o }).rows;
const DRAFT_KEY = 'ryp.mentalConsent.u-dana.jordan';

beforeEach(() => {
  mockApi.live = false;
  window.localStorage.clear();
});

describe('seed mode', () => {
  test('the Whitfield family: Jordan signed, Nico and Reese not; Reese has the 1:1 a week out', () => {
    expect(seed().map((r) => [r.athleteId, r.status, r.nextMental?.date ?? null])).toEqual([
      ['jordan', 'signed', expect.any(String)], ['nico', 'unsigned', null], ['reese', 'unsigned', '2026-11-12']]);
    expect(homeCardFor(seed()).athleteId).toBe('reese');
  });

  test('the harness draft', () => {
    expect(seed({ demoDraft: 'reese' }).find((r) => r.athleteId === 'reese').draft).toBe('fresh');
  });

  test('the athlete view is Jordan alone', () => {
    expect(seed({ as: 'athlete' }).map((r) => [r.athleteId, r.viewer])).toEqual([['jordan', 'athlete']]);
  });

  test('a record signed on another device beats this device\'s draft', async () => {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ v: 1, version: '2026-10-30', savedAt: Date.now(), choices: { location: 'B', audio: true }, parentName: 'Dana Whitfield' }));
    const h = mountHook(() => useConsentFlow('jordan'));
    await settle(h);
    expect(h.out.current.data).toMatchObject({ status: 'signed', draft: null, listCount: 3 });
    expect(window.localStorage.getItem(DRAFT_KEY)).toBeNull();
    h.unmount();
  });

  test('harness-only hand-over: Quinn on the parent\'s phone', async () => {
    const h = mountHook(() => useConsentFlow('quinn', { demoViewer: 'parent', demoNoRecord: true }));
    await settle(h);
    expect(h.out.current.data).toMatchObject({ branch: 'adult-handover', status: 'unsigned', signerName: 'Sam Parker', listCount: 1 });
    h.unmount();
  });

  test('the tracker: every athlete with a mental booking, not signed with a 1:1 ahead first', async () => {
    const h = mountHook(() => useConsentTracker());
    await settle(h);
    expect(h.out.current.data.map((r) => [r.athleteId, r.label])).toEqual([['reese', 'Not signed'], ['jordan', 'Signed']]);
    h.unmount();
  });

  // The writes below land in this file's seed overlay, so they run last.
  test('a fresh draft opens the flow and shows on the family line; signing clears it and the list reads Signed', async () => {
    const h = mountHook(() => ({ flow: useConsentFlow('reese'), family: useFamilyConsents() }));
    await settle(h);
    expect(h.out.current.flow.data).toMatchObject({ branch: 'minor', status: 'unsigned', signerName: 'Dana Whitfield', signerEmail: 'dana@email.com', nextAthleteId: 'nico', listCount: 3 });
    const state = { ...initialFlow({ branch: 'minor', firstName: 'Reese' }), choices: { location: 'B', audio: true, driving: null, parentSessions: null, parentName: '' },
      signature: { agreed: true, name: 'Dana Whitfield' }, assent: { audio: true, agreed: true, name: 'Reese', readAloud: false } };
    await act(async () => { h.out.current.flow.saveDraft(state); });
    await tick();
    expect(h.out.current.flow.data).toMatchObject({ draftState: 'fresh', draft: { parentName: 'Dana Whitfield', choices: { location: 'B' } } });
    expect(h.out.current.family.data.byId.reese.draft).toBe('fresh');
    let result;
    await act(async () => { result = await h.out.current.flow.sign(state); });
    await tick();
    expect(result).toEqual({ status: 'signed' });
    expect(window.localStorage.getItem('ryp.mentalConsent.u-dana.reese')).toBeNull();
    expect(h.out.current.family.data.byId.reese).toMatchObject({ status: 'signed', draft: null });
    expect(h.out.current.family.data.byId.reese.record).toMatchObject({ signer: { role: 'parent', name: 'Dana Whitfield' }, assent: { name: 'Reese', audio: true } });
    await act(async () => { result = await h.out.current.flow.sign(state); });
    expect(result).toMatchObject({ status: 'already', record: { signer: { name: 'Dana Whitfield' } } });
    h.unmount();
  });

  test('the standalone actions resolve without a backend', async () => {
    await expect(sendConsentReminder('reese')).resolves.toEqual({ status: 'sent' });
    await expect(countersignConsent('quinn')).resolves.toEqual({ athleteId: 'quinn' });
    await expect(withdrawRecording('jordan')).resolves.toEqual({ athleteId: 'jordan' });
    await expect(withdrawRecording('nico')).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('live mode', () => {
  const ava = { id: 'ava', name: 'Ava Test', dob: '2012-05-14', householdId: 'hh' };
  const max = { id: 'max', name: 'Max Test', dob: '2007-03-02', householdId: 'hh', loginEmail: 'max@example.com' };
  const minorEra = { id: 'max', athleteId: 'max', householdId: 'hh', adult: false, adultSignature: null, choices: { location: 'B' }, assent: { name: 'Max', audio: true },
    countersign: null, history: [] };
  beforeEach(() => {
    mockApi.live = true;
    Object.assign(mockApi, {
      fetchCurrentUser: jest.fn(async () => ({ uid: 'u-dana', role: 'parent', householdId: 'hh', displayName: 'Dana Test', email: 'dana@example.com' })),
      fetchHouseholdAthletes: jest.fn(async () => [ava, max]),
      fetchHouseholdConsents: jest.fn(async () => []),
      fetchHouseholdBookings: jest.fn(async () => [{ athleteId: 'ava', type: 'mental', status: 'confirmed', date: '2026-11-12' }]),
      fetchHousehold: jest.fn(async () => ({ id: 'hh', guardian: { name: 'Dana Test' }, emergencyContact: { name: 'Lee Test', phone: 'test-phone', relationship: 'aunt' } })),
      fetchLoginInvite: jest.fn(async (email) => (email === 'max@example.com' ? { status: 'claimed' } : null)),
      fetchOwnConsent: jest.fn(async () => null),
      fetchAthlete: jest.fn(async () => max),
      fetchBookings: jest.fn(async () => []),
      createConsent: jest.fn(async () => ({ status: 'signed' })),
      updateConsent: jest.fn(async () => {}),
      callRequestMentalConsent: jest.fn(async () => ({ status: 'sent' })),
    });
  });

  test('a parent\'s rows come from the household reads; a claimed invite marks the 18+ athlete', async () => {
    const h = mountHook(() => useFamilyConsents());
    await settle(h);
    expect(h.out.current.data.rows.map((r) => [r.athleteId, r.status, r.claimedLogin, r.nextMental?.date ?? null]))
      .toEqual([['ava', 'unsigned', false, '2026-11-12'], ['max', 'unsigned', true, null]]);
    expect(mockApi.fetchHouseholdConsents).toHaveBeenCalledWith('hh');
    expect(mockApi.fetchOwnConsent).not.toHaveBeenCalled();
    h.unmount();
  });

  test('the onboarding walkthrough (practice) reads nothing and has no rows, on live data too', async () => {
    for (const as of ['parent', 'athlete']) {
      const h = mountHook(() => useFamilyConsents({ as, practice: true }));
      await settle(h);
      expect(h.out.current).toMatchObject({ data: null, loading: false, error: null });
      h.unmount();
    }
    expect(mockApi.fetchCurrentUser).not.toHaveBeenCalled();
  });

  test('a parent signs a minor: the portal record goes to createConsent; the re-read is the household query', async () => {
    const h = mountHook(() => useConsentFlow('ava'));
    await settle(h);
    expect(h.out.current.data).toMatchObject({ viewer: 'parent', uid: 'u-dana', branch: 'minor', signerName: 'Dana Test', signerEmail: 'dana@example.com',
      guardianName: 'Dana Test', emergencyContact: { name: 'Lee Test', phone: 'test-phone', relationship: 'aunt' }, listCount: 2, nextAthleteId: null });
    const state = { ...initialFlow({ branch: 'minor', firstName: 'Ava' }), choices: { location: 'B', audio: true, driving: null, parentSessions: null, parentName: '' },
      contact: { name: '', phone: '', relationship: '', sameAsParent: true },
      signature: { agreed: true, name: 'Dana Test' }, assent: { audio: false, agreed: true, name: 'Ava', readAloud: false } };
    await act(async () => { await h.out.current.sign(state); });
    const call = mockApi.createConsent.mock.calls[0][0];
    expect(call.athleteId).toBe('ava');
    expect(call.doc).toMatchObject({ householdId: 'hh', signedAt: 'NOW', signedBy: 'u-dana', signer: { role: 'parent', name: 'Dana Test' }, adult: false,
      assent: { name: 'Ava', audio: false, at: 'NOW', withdrawnBy: null }, choices: { location: 'B', audio: true, updatedAt: 'NOW', updatedBy: 'u-dana' } });
    mockApi.fetchHouseholdConsents.mockResolvedValueOnce([{ id: 'ava', athleteId: 'ava', signer: { name: 'Sam Test' } }]);
    expect(await call.reread()).toMatchObject({ id: 'ava' });
    expect(mockApi.fetchOwnConsent).not.toHaveBeenCalled();
    h.unmount();
  });

  test('an 18+ athlete with a minor-era record re-signs through updateConsent with the snapshot\'s own history', async () => {
    mockApi.fetchHouseholdConsents.mockResolvedValue([minorEra]);
    mockApi.fetchLoginInvite.mockResolvedValue(null);
    const h = mountHook(() => useConsentFlow('max'));
    await settle(h);
    expect(h.out.current.data).toMatchObject({ status: 'needs-adult', branch: 'adult-handover' });
    const state = { ...initialFlow({ branch: 'adult-handover', firstName: 'Max' }), contact: { name: 'Lee Test', phone: 'test-phone', relationship: '', sameAsParent: false },
      choices: { location: 'C', audio: true, driving: null, parentSessions: false, parentName: '' }, signature: { agreed: true, name: 'Max Test' } };
    await act(async () => { await h.out.current.sign(state); });
    expect(mockApi.createConsent).not.toHaveBeenCalled();
    const { athleteId, build } = mockApi.updateConsent.mock.calls[0][0];
    expect(athleteId).toBe('max');
    const u = build(minorEra);
    expect(u.history[0].choices).toBe(minorEra.choices);
    expect(u.adultSignature).toMatchObject({ signedAt: 'NOW', signedBy: 'u-dana', name: 'Max Test', method: 'portal' });
    h.unmount();
  });

  test('an athlete login reads its own record by id and never the household query', async () => {
    mockApi.fetchCurrentUser.mockResolvedValue({ uid: 'u-max', role: 'athlete', athleteId: 'max', householdId: 'hh', displayName: 'Max Test', email: null });
    const h = mountHook(() => useConsentFlow('max'));
    await settle(h);
    expect(h.out.current.data).toMatchObject({ viewer: 'athlete', branch: 'adult', status: 'unsigned', listCount: 1 });
    expect(mockApi.fetchOwnConsent).toHaveBeenCalledWith('max');
    expect(mockApi.fetchHouseholdConsents).not.toHaveBeenCalled();
    h.unmount();
  });

  test('another family\'s athlete is not found', async () => {
    const h = mountHook(() => useConsentFlow('someone-else'));
    await settle(h);
    expect(h.out.current).toMatchObject({ data: null, loading: false, error: null });
    h.unmount();
  });

  test('the reminder is the callable', async () => {
    await expect(sendConsentReminder('ava')).resolves.toEqual({ status: 'sent' });
    expect(mockApi.callRequestMentalConsent).toHaveBeenCalledWith({ athleteId: 'ava' });
  });
});
