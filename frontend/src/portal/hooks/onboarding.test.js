/**
 * useOnboardingStatus: device-local completion plus the first-visit offer
 * flag (tester report 2026-09-30: a new family never got the walkthrough).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import useOnboardingStatus from './onboarding';

async function mountHook() {
  const result = { current: null };
  function Probe() {
    result.current = useOnboardingStatus();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  return { result, unmount: () => act(async () => root.unmount()) };
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch (e) { /* storage unavailable */ }
});
afterEach(() => {
  jest.restoreAllMocks();
});

test('a fresh device: nothing completed, nothing offered', async () => {
  const h = await mountHook();
  expect(h.result.current.completed).toEqual({ parent: false, athlete: false });
  expect(h.result.current.offered).toEqual({ parent: false, athlete: false });
  await h.unmount();
});

test('markOffered and markComplete persist per track, under their own keys', async () => {
  const h = await mountHook();
  await act(async () => { h.result.current.markOffered('parent'); });
  expect(h.result.current.offered).toEqual({ parent: true, athlete: false });
  expect(h.result.current.completed).toEqual({ parent: false, athlete: false });
  expect(window.localStorage.getItem('ryp.onboarding.offered.parent')).toBe('true');
  await act(async () => { h.result.current.markComplete('athlete'); });
  expect(window.localStorage.getItem('ryp.onboarding.athlete')).toBe('true');
  // Unknown tracks never corrupt the shape.
  await act(async () => { h.result.current.markOffered('coach'); });
  expect(Object.keys(h.result.current.offered)).toEqual(['parent', 'athlete']);
  await h.unmount();

  const again = await mountHook();
  expect(again.result.current.offered).toEqual({ parent: true, athlete: false });
  expect(again.result.current.completed).toEqual({ parent: false, athlete: true });
  await again.unmount();
});

test('reset clears completion and the offer', async () => {
  window.localStorage.setItem('ryp.onboarding.parent', 'true');
  window.localStorage.setItem('ryp.onboarding.offered.parent', 'true');
  const h = await mountHook();
  await act(async () => { h.result.current.reset(); });
  expect(h.result.current.completed).toEqual({ parent: false, athlete: false });
  expect(h.result.current.offered).toEqual({ parent: false, athlete: false });
  expect(window.localStorage.getItem('ryp.onboarding.offered.parent')).toBeNull();
  await h.unmount();
});

test('storage that throws: reads fall back to unset, a mark still flips in memory', async () => {
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
  const h = await mountHook();
  expect(h.result.current.offered).toEqual({ parent: false, athlete: false });
  await act(async () => { h.result.current.markOffered('athlete'); });
  expect(h.result.current.offered).toEqual({ parent: false, athlete: true });
  await h.unmount();
});
