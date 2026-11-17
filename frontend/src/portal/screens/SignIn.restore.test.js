import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import SignIn from './SignIn';

/*
 * The sign-in page during a session restore (speed work 2026-11-17, F3): no
 * dimmed form while auth and users/{uid} resolve - the launch splash, or
 * straight to the landing the cold-start hint names. A sign-in the visitor
 * started keeps its form, dimmed, as designed.
 */
const mockSession = { value: null, listeners: new Set() };
const mockCalls = [];
jest.mock('../hooks/useAuthSession', () => {
  const { useSyncExternalStore } = require('react');
  return {
    __esModule: true,
    default: function useMockSession() {
      const s = useSyncExternalStore(
        (fn) => { mockSession.listeners.add(fn); return () => mockSession.listeners.delete(fn); },
        () => mockSession.value
      );
      return {
        ...s,
        signIn: () => { mockCalls.push('google'); },
        signInWithEmail: (email) => {
          mockCalls.push(`email:${email}`);
          mockSession.value = { ...mockSession.value, loading: true };
          mockSession.listeners.forEach((fn) => fn());
        },
      };
    },
  };
});

function setSession(next) { mockSession.value = next; mockSession.listeners.forEach((fn) => fn()); }
const base = { user: null, provisioned: false, loading: false, error: null, hint: null };

function Spy({ onLoc }) { onLoc(useLocation()); return null; }

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const loc = { current: null };
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/portal/signin']}>
        <Spy onLoc={(l) => { loc.current = l; }} />
        <Routes>
          <Route path="/portal/signin" element={<SignIn bare />} />
          <Route path="*" element={null} />
        </Routes>
      </MemoryRouter>
    );
  });
  return {
    container,
    pathname: () => loc.current.pathname,
    splash: () => container.querySelector('[data-launch-splash]'),
    inputs: () => container.querySelectorAll('input'),
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

afterEach(() => {
  mockSession.value = null;
  mockCalls.length = 0;
});

test('while the session restores: the launch splash, no sign-in form', async () => {
  setSession({ ...base, loading: true });
  const r = await mount();
  expect(r.splash()).not.toBeNull();
  expect(r.inputs()).toHaveLength(0);
  expect(r.pathname()).toBe('/portal/signin');
  await r.unmount();
});

test("a restore with this account's hint goes straight to the hinted landing", async () => {
  setSession({ ...base, loading: true, hint: { uid: 'u-o', role: 'ops', specialistId: null } });
  const r = await mount();
  expect(r.pathname()).toBe('/portal/admin');
  await r.unmount();
});

test("a specialist's hint goes to their own day", async () => {
  setSession({ ...base, loading: true, hint: { uid: 'u-y', role: 'mental', specialistId: 'mental' } });
  const r = await mount();
  expect(r.pathname()).toBe('/portal/my-sessions');
  await r.unmount();
});

test('a restore that ends signed out shows the form', async () => {
  setSession({ ...base, loading: true });
  const r = await mount();
  await act(async () => { setSession({ ...base }); });
  expect(r.splash()).toBeNull();
  expect(r.inputs().length).toBeGreaterThanOrEqual(2);
  await r.unmount();
});

test('a restore that ends signed in goes to the verified landing', async () => {
  setSession({ ...base, loading: true });
  const r = await mount();
  await act(async () => { setSession({ ...base, user: { uid: 'u-p', role: 'parent' }, provisioned: true }); });
  expect(r.pathname()).toBe('/portal/family');
  await r.unmount();
});

test('an email sign-in the visitor started keeps its form while it resolves', async () => {
  setSession({ ...base });
  const r = await mount();
  const [email, password] = r.inputs();
  await act(async () => { typeInto(email, 'sam@example.com'); typeInto(password, 'secret-1'); });
  const signInButton = [...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Sign in');
  await act(async () => { signInButton.click(); });
  expect(mockCalls).toEqual(['email:sam@example.com']);
  expect(mockSession.value.loading).toBe(true);
  expect(r.splash()).toBeNull();
  expect(r.inputs().length).toBeGreaterThanOrEqual(2);
  await r.unmount();
});
