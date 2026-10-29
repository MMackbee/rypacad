import React, { act } from 'react';
import { renderScreen } from '../screens/testRender';
import ResearchConfirmGate from './ResearchConfirmGate';
import { confirmBody } from '../data/researchConsent';

let mockUser;
let mockPending;
let mockSaves;
let mockFailIds;
let mockHang;
// The wave's slow-save threshold, shortened so a save that never settles shows within the test.
jest.mock('../hooks/assessmentSaves', () => ({ SLOW_SAVE_MS: 30 }));
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), isLive: () => true }));
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => ({ user: mockUser, loading: false }) }));
jest.mock('../hooks/researchConsent', () => ({
  useResearchConfirm: () => ({ data: mockPending ? { pending: mockPending } : null, loading: false, error: mockPending ? null : new Error('offline') }),
  saveResearchConsent: async (args) => {
    mockSaves.push(args);
    if (mockHang) await mockHang;
    if (mockFailIds.includes(args.athleteId)) throw new Error('permission-denied');
    return { athleteId: args.athleteId };
  },
}));

const gate = () => renderScreen(<ResearchConfirmGate><div>FAMILY HOME</div></ResearchConfirmGate>);
let uidSeq = 0;
beforeEach(() => {
  uidSeq += 1;
  mockUser = { uid: `parent-${uidSeq}`, role: 'parent', householdId: 'hh' };
  mockPending = [{ id: 'a1', name: 'Jordan Whitfield', self: false, minor: true }, { id: 'a2', name: 'Reese Whitfield', self: false, minor: true }];
  mockSaves = [];
  mockFailIds = [];
  mockHang = null;
});

test('a family with an athlete not answered sees the question before the home, in the approved words', async () => {
  const r = await gate();
  expect(r.text()).toContain('One quick question about research');
  expect(r.text()).toContain(confirmBody('Jordan and Reese'));
  expect(r.text()).toContain("Research (optional): Reese's results may be used in research.");
  expect(r.text()).not.toContain('FAMILY HOME');
  await r.click('Read more about research for Jordan');
  expect(r.text()).toContain('What it covers');
  await r.click('Close');
  await r.unmount();
});

test('unticked saves as no; a yes under 18 needs the assent; then the home opens', async () => {
  const r = await gate();
  await r.click("Research (optional): Jordan's results may be used in research.");
  await r.click("I've talked about this with Jordan, and they agree too.");
  await r.click('Save my answer');
  expect(mockSaves).toEqual([
    { athleteId: 'a1', answer: { value: true, assent: true } },
    { athleteId: 'a2', answer: { value: false, assent: false } },
  ]);
  expect(r.text()).toContain('FAMILY HOME');
  await r.unmount();
});

test('Review Focus 5: a refused save says so, retries only what failed, and offers Skip for now', async () => {
  mockFailIds = ['a2'];
  const r = await gate();
  await r.click('Save my answer');
  expect(r.text()).toContain('Your answer was not saved. Check the connection and try again, or skip for now: we will ask again the next time you sign in.');
  expect(r.text()).not.toContain('FAMILY HOME');
  mockFailIds = [];
  await r.click('Save my answer');
  expect(mockSaves.map((s) => s.athleteId)).toEqual(['a1', 'a2', 'a2']);
  expect(r.text()).toContain('FAMILY HOME');
  await r.unmount();

  mockFailIds = ['a1', 'a2'];
  const again = await gate();
  await again.click('Save my answer');
  await again.click('Skip for now');
  expect(again.text()).toContain('FAMILY HOME');
  await again.unmount();
  const reopened = await gate();
  expect(reopened.text()).toContain('FAMILY HOME');
  await reopened.unmount();
});

test('Review Focus 5: a save the server never acknowledges (offline) offers Skip for now after 8 s; the write may still land', async () => {
  let release;
  mockHang = new Promise((resolve) => { release = resolve; });
  const r = await gate();
  await r.click('Save my answer');
  expect(r.button('Skip for now')).toBeNull();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
  expect(r.text()).toContain('Your answer is not saved yet. Check the connection, or skip for now: we will ask again the next time you sign in.');
  expect(r.button('Skip for now').disabled).toBe(false);
  await act(async () => { release(); });
  expect(r.text()).toContain('FAMILY HOME');
  await r.unmount();

  mockHang = new Promise(() => {});
  const again = await gate();
  await again.click('Save my answer');
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
  await again.click('Skip for now');
  expect(again.text()).toContain('FAMILY HOME');
  await again.unmount();
});

test('an 18+ member answers for themselves, in the approved words with their own name', async () => {
  mockUser = { uid: 'self-1', role: 'athlete', athleteId: 's1', householdId: 'hs' };
  mockPending = [{ id: 's1', name: 'Sam Reyes', self: true, minor: false }];
  const r = await gate();
  expect(r.text()).toContain(confirmBody('Sam'));
  await r.click('Research (optional): my results may be used in research.');
  await r.click('Save my answer');
  expect(mockSaves).toEqual([{ athleteId: 's1', answer: { value: true, assent: null } }]);
  await r.unmount();
});

test('nothing pending, or a read that failed: straight to the home, never trapped', async () => {
  mockPending = [];
  const none = await gate();
  expect(none.text()).toBe('FAMILY HOME');
  await none.unmount();
  mockPending = null;
  const failed = await gate();
  expect(failed.text()).toBe('FAMILY HOME');
  await failed.unmount();
});
