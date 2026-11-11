/**
 * hooks/sessionLocalStatus.js: the attendance screen's Start session / Close
 * block state, kept per session for the app's lifetime (plan Decided here
 * 11) and per signed-in account, so the next account on a shared academy
 * device never inherits the last one's block state (2026-11-11 review).
 */
jest.mock('../../firebase', () => ({ auth: { currentUser: null }, db: {} }));

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { auth } from '../../firebase';
import { clearSessionLocalStatus, useSessionLocalStatus } from './sessionLocalStatus';

async function mountHook(useHook) {
  const result = { current: null };
  function Probe() {
    result.current = useHook();
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => { root.render(<Probe />); });
  return { result, unmount: () => act(async () => root.unmount()) };
}

const close = (h) => act(async () => { h.result.current[1]('completed'); });

beforeEach(() => {
  clearSessionLocalStatus();
  auth.currentUser = { uid: 'coach-x' };
});

test('a session keeps its state across mounts', async () => {
  const first = await mountHook(() => useSessionLocalStatus('s1'));
  expect(first.result.current[0]).toBeNull();
  await close(first);
  expect(first.result.current[0]).toBe('completed');
  await first.unmount();
  const again = await mountHook(() => useSessionLocalStatus('s1'));
  expect(again.result.current[0]).toBe('completed');
  await again.unmount();
  const other = await mountHook(() => useSessionLocalStatus('s2'));
  expect(other.result.current[0]).toBeNull();
  await other.unmount();
});

test('the next account on the same device starts the session fresh', async () => {
  const x = await mountHook(() => useSessionLocalStatus('s1'));
  await close(x);
  await x.unmount();
  auth.currentUser = { uid: 'staff-y' };
  const y = await mountHook(() => useSessionLocalStatus('s1'));
  expect(y.result.current[0]).toBeNull();
  await y.unmount();
  auth.currentUser = { uid: 'coach-x' };
  const back = await mountHook(() => useSessionLocalStatus('s1'));
  expect(back.result.current[0]).toBe('completed');
  await back.unmount();
});

test('no session id: plain component state, never shared', async () => {
  const first = await mountHook(() => useSessionLocalStatus(undefined));
  await close(first);
  expect(first.result.current[0]).toBe('completed');
  await first.unmount();
  const again = await mountHook(() => useSessionLocalStatus(undefined));
  expect(again.result.current[0]).toBeNull();
  await again.unmount();
});
