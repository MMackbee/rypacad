import React, { Profiler, act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

/*
 * The home-screen launch (speed work 2026-11-17, F3): the installed icon
 * opens '/'. Live, that now goes to the portal index, which sends a signed-in
 * account straight to its landing - no stop on the sign-in page. The review
 * scaffold (seed mode) keeps '/' on sign-in.
 */
const mockLive = { value: false };
jest.mock('./portal/hooks/live', () => ({ ...jest.requireActual('./portal/hooks/live'), isLive: () => mockLive.value }));
jest.mock('./portal/PortalRoutes', () => ({
  __esModule: true,
  default: function Stub() { return `PORTAL ${require('react-router-dom').useLocation().pathname}`; },
}));

async function launch(path) {
  window.history.replaceState(null, '', path);
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => { root.render(<App />); });
  const text = container.textContent;
  await act(async () => root.unmount());
  return { text, pathname: window.location.pathname };
}

afterEach(() => { mockLive.value = false; });

test('live: the home-screen launch goes to the portal index, not the sign-in page', async () => {
  mockLive.value = true;
  expect(await launch('/')).toEqual({ text: 'PORTAL /portal', pathname: '/portal' });
});

test('seed mode: / still opens sign-in', async () => {
  expect(await launch('/')).toEqual({ text: 'PORTAL /portal/signin', pathname: '/portal/signin' });
});

// Review 2026-11-17 (F2): the HTML splash goes at React's first commit, and
// the '/' redirect rendered nothing - a black frame before the portal.
test("live: the launch's first frame is the splash, never a blank page", async () => {
  mockLive.value = true;
  window.history.replaceState(null, '', '/');
  const container = document.createElement('div');
  const root = createRoot(container);
  const frames = [];
  const onRender = () => frames.push(container.querySelector('[data-launch-splash]') ? 'SPLASH' : container.textContent.trim() || 'BLANK');
  await act(async () => { root.render(<Profiler id="app" onRender={onRender}><App /></Profiler>); });
  expect(frames[0]).toBe('SPLASH');
  expect(frames).not.toContain('BLANK');
  expect(container.textContent).toBe('PORTAL /portal');
  await act(async () => root.unmount());
});

test('the old /login bookmark still opens sign-in', async () => {
  mockLive.value = true;
  expect((await launch('/login')).pathname).toBe('/portal/signin');
});
