/**
 * The one-time research confirm over the real list read (hooks/researchConsent
 * useResearchConfirm, useSeedResource, invalidate): only Firestore is faked.
 * Every save that lands bumps the list, and the list reads again while the
 * sheet is still saving the next athlete (review 2026-10-28, F1). Each write
 * here waits until the test lands, refuses or never settles it.
 */
jest.mock('../../firebase', () => ({ __esModule: true, default: {}, auth: { currentUser: null }, db: {}, functions: {}, storage: {} }));
// Plain functions, not jest.fn(): CRA's resetMocks would clear them before every test.
jest.mock('firebase/firestore', () => ({
  collection: (_db, name) => ({ name }),
  where: (field, _op, value) => ({ field, value }),
  query: (col, filter) => ({ col, filter }),
  getDocs: async ({ filter }) => ({
    docs: Object.entries(mockAthletes)
      .filter(([, a]) => a[filter.field] === filter.value)
      .map(([id, a]) => ({ id, data: () => a })),
  }),
  doc: (_db, col, id) => ({ col, id }),
  serverTimestamp: () => 'SERVER_TIME',
  updateDoc: (ref, patch) => new Promise((resolve, reject) => {
    mockWrites.push({
      id: ref.id,
      land: () => {
        mockAthletes[ref.id] = { ...mockAthletes[ref.id], consents: { research: patch['consents.research'] } };
        resolve();
      },
      refuse: () => reject(Object.assign(new Error('denied'), { code: 'permission-denied' })),
    });
  }),
}));
// The wave's slow-save threshold, shortened so a save that never settles shows within the test.
jest.mock('../hooks/assessmentSaves', () => ({ SLOW_SAVE_MS: 30 }));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), isLive: () => true }));
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => ({ user: mockUser, loading: false }) }));

import React, { act } from 'react';
import { auth } from '../../firebase';
import { renderScreen } from '../screens/testRender';
import ResearchConfirmGate from './ResearchConfirmGate';

let mockUser;
let mockAthletes;
let mockWrites;
let homeRenders;
let uidSeq = 0;

function Home() {
  homeRenders += 1;
  return <div>FAMILY HOME</div>;
}

const JORDAN = "Research (optional): Jordan's results may be used in research.";
const REESE = "Research (optional): Reese's results may be used in research.";
const REESE_ASSENT = "I've talked about this with Reese, and they agree too.";
const JORDAN_ASSENT = "I've talked about this with Jordan, and they agree too.";

const gate = async () => {
  const r = await renderScreen(<ResearchConfirmGate><Home /></ResearchConfirmGate>);
  await r.flush();
  // The home shows while the first read loads (never a trap); count only what renders once the sheet is up.
  homeRenders = 0;
  const checked = (label) => r.container.querySelector(`[role="checkbox"][aria-label="${label}"]`)?.getAttribute('aria-checked') ?? null;
  const settle = async (id, how) => {
    const w = mockWrites.find((x) => x.id === id && !x.settled);
    if (!w) throw new Error(`no open write for ${id}`);
    w.settled = true;
    await act(async () => { w[how](); });
    await r.flush();
    await r.flush();
  };
  return { ...r, checked, land: (id) => settle(id, 'land'), refuse: (id) => settle(id, 'refuse') };
};
const writesFor = (id) => mockWrites.filter((w) => w.id === id).length;

beforeEach(() => {
  uidSeq += 1;
  mockUser = { uid: `parent-r${uidSeq}`, role: 'parent', householdId: 'hh' };
  auth.currentUser = { uid: mockUser.uid };
  mockAthletes = {
    a1: { name: 'Jordan Whitfield', householdId: 'hh', dob: '2012-06-17', consents: { research: null } },
    a2: { name: 'Reese Whitfield', householdId: 'hh', dob: '2013-03-02', consents: { research: null } },
  };
  mockWrites = [];
  homeRenders = 0;
});

test('two athletes both land: the sheet holds through the refetch after the first, answers kept, then the home', async () => {
  const r = await gate();
  expect(r.text()).toContain('One quick question about research');
  await r.click(JORDAN);
  await r.click(JORDAN_ASSENT);
  await r.click('Save my answer');
  expect(mockWrites.map((w) => w.id)).toEqual(['a1']);

  await r.land('a1');
  expect(homeRenders).toBe(0);
  expect(r.text()).toContain(JORDAN);
  expect(r.text()).toContain(REESE);
  expect(r.checked(JORDAN)).toBe('true');
  expect(r.checked(JORDAN_ASSENT)).toBe('true');
  expect(mockWrites.map((w) => w.id)).toEqual(['a1', 'a2']);

  await r.land('a2');
  expect(r.text()).toContain('FAMILY HOME');
  expect(mockAthletes.a1.consents.research).toMatchObject({ value: true, assent: true });
  expect(mockAthletes.a2.consents.research).toMatchObject({ value: false, assent: false });
  expect(mockWrites.map((w) => w.id)).toEqual(['a1', 'a2']);
  await r.unmount();
});

test('a1 lands and a2 is refused: the sheet stays with Not saved and Skip for now, the ticked answer kept, and a retry sends only a2', async () => {
  const r = await gate();
  await r.click(REESE);
  await r.click(REESE_ASSENT);
  await r.click('Save my answer');
  await r.land('a1');
  await r.refuse('a2');

  expect(homeRenders).toBe(0);
  expect(r.text()).toContain('Your answer was not saved. Check the connection and try again, or skip for now: we will ask again the next time you sign in.');
  expect(r.button('Skip for now')).not.toBeNull();
  expect(r.button('Skip for now').disabled).toBe(false);
  expect(r.checked(REESE)).toBe('true');
  expect(r.checked(REESE_ASSENT)).toBe('true');
  expect(r.text()).toContain('Saved');

  await r.click('Save my answer');
  expect(mockWrites.map((w) => w.id)).toEqual(['a1', 'a2', 'a2']);
  await r.land('a2');
  expect(r.text()).toContain('FAMILY HOME');
  expect(mockAthletes.a2.consents.research).toMatchObject({ value: true, assent: true });
  await r.unmount();
});

test('a1 lands and a2 never settles: after the slow-save threshold Skip for now shows, and a2 is written exactly once', async () => {
  const r = await gate();
  await r.click('Save my answer');
  await r.land('a1');
  expect(homeRenders).toBe(0);
  expect(r.button('Skip for now')).toBeNull();

  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
  await r.flush();
  expect(homeRenders).toBe(0);
  expect(r.text()).toContain('Your answer is not saved yet. Check the connection, or skip for now: we will ask again the next time you sign in.');
  expect(r.button('Skip for now').disabled).toBe(false);
  expect(r.button('Save my answer').disabled).toBe(true);
  await r.click('Save my answer');
  expect(writesFor('a2')).toBe(1);

  await r.click('Skip for now');
  expect(r.text()).toContain('FAMILY HOME');
  expect(writesFor('a1')).toBe(1);
  expect(writesFor('a2')).toBe(1);
  await r.unmount();
});
