import React, { act } from 'react';
import { renderScreen } from './testRender';
import SignUp from './SignUp';
import { VERIFY_EMAIL_SENDER } from '../data/authCopy';

let mockSession;
let mockRerender;
// The hook re-reads mockSession on every render; mockRerender forces one, the
// way a real invite-check answer re-renders the screen.
jest.mock('../hooks/useAuthSession', () => ({
  __esModule: true,
  default: function useMockAuthSession() {
    const [, bump] = require('react').useReducer((n) => n + 1, 0);
    mockRerender = bump;
    return mockSession;
  },
}));

beforeEach(() => {
  mockSession = {
    user: null, provisioned: false, loading: false, error: null, claimState: 'idle',
    signIn: async () => {},
    createLogin: async (email) => {
      if (email === 'taken@email.com') {
        const err = new Error('This email already has a login - sign in instead');
        err.reason = 'email-in-use';
        throw err;
      }
      return { sent: true };
    },
  };
});

test('creates a login and shows the verification-sent note', async () => {
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  expect(r.button('Create login').disabled).toBe(true);
  await r.fill('Email', 'dana@email.com');
  await r.fill('Password', 'correct-horse-9');
  await r.click('Create login');
  expect(r.text()).toContain(`We sent a link to dana@email.com from ${VERIFY_EMAIL_SENDER} (check Spam`);
  // The invite check has not answered yet (idle): Continue waits for it.
  expect(r.button('Continue to sign-up')).toBeNull();
  expect(r.button('Checking your email...').disabled).toBe(true);
  await r.unmount();
});

// No Continue tap (owner, 2026-09-30): once the invite check has answered,
// Create login moves on by itself, carrying the verification note.
async function createLoginThenLand(claimState) {
  mockSession.claimState = claimState;
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  await r.fill('Email', 'kid@email.com');
  await r.fill('Password', 'correct-horse-9');
  await r.click('Create login');
  const { pathname, state } = r.location();
  await r.unmount();
  return { pathname, state };
}

test('after Create login, an invited child goes straight to the verify screen, not the parent form', async () => {
  expect((await createLoginThenLand('needs-verification')).pathname).toBe('/portal/not-provisioned');
  expect((await createLoginThenLand('already-claimed')).pathname).toBe('/portal/not-provisioned');
});

test('after Create login, a parent (no invite) or a failed check goes straight to the form with the note', async () => {
  const parent = await createLoginThenLand('none');
  expect(parent.pathname).toBe('/portal/register');
  expect(parent.state).toEqual({ verifySent: { email: 'kid@email.com', mailed: true } });
  expect((await createLoginThenLand('error')).pathname).toBe('/portal/register');
});

test('a login whose email did not send still moves on, flagged unsent', async () => {
  mockSession.createLogin = async () => ({ sent: false });
  expect((await createLoginThenLand('none')).state).toEqual({ verifySent: { email: 'kid@email.com', mailed: false } });
});

test('an invite check that answers before the email is sent still carries the note', async () => {
  let release;
  mockSession.createLogin = () => new Promise((res) => { release = res; });
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  await r.fill('Email', 'dana@email.com');
  await r.fill('Password', 'correct-horse-9');
  await r.click('Create login');
  mockSession = { ...mockSession, user: { uid: 'u3', email: 'dana@email.com', role: null }, claimState: 'none' };
  await act(async () => { mockRerender(); });
  expect(r.location().pathname).toBe('/portal/signup');
  await act(async () => { release({ sent: true }); });
  expect(r.location().pathname).toBe('/portal/register');
  expect(r.location().state).toEqual({ verifySent: { email: 'dana@email.com', mailed: true } });
  await r.unmount();
});

test('an invited child whose verification email did not send keeps the yellow note until Continue', async () => {
  mockSession.claimState = 'needs-verification';
  mockSession.createLogin = async () => ({ sent: false });
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  await r.fill('Email', 'kid@email.com');
  await r.fill('Password', 'correct-horse-9');
  await r.click('Create login');
  expect(r.location().pathname).toBe('/portal/signup');
  expect(r.text()).toContain('We could not send the verification email to kid@email.com');
  await r.click('Continue to sign-up');
  expect(r.location().pathname).toBe('/portal/not-provisioned');
  await r.unmount();
});

test('while the invite check runs it waits, then moves on when the check answers', async () => {
  mockSession.claimState = 'checking';
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  await r.fill('Email', 'dana@email.com');
  await r.fill('Password', 'correct-horse-9');
  await r.click('Create login');
  expect(r.location().pathname).toBe('/portal/signup');
  expect(r.button('Checking your email...').disabled).toBe(true);
  mockSession = { ...mockSession, claimState: 'none' };
  await act(async () => { mockRerender(); });
  expect(r.location().pathname).toBe('/portal/register');
  await r.unmount();
});

test('email already in use points at sign in', async () => {
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  await r.fill('Email', 'taken@email.com');
  await r.fill('Password', 'correct-horse-9');
  await r.click('Create login');
  expect(r.text()).toContain('This email already has a login - sign in instead');
  await r.unmount();
});

test('a signed-in unprovisioned stranger goes to /portal/register', async () => {
  mockSession.user = { uid: 'u1', email: 'dana@email.com', role: null };
  mockSession.claimState = 'none';
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  expect(r.location().pathname).toBe('/portal/register');
  await r.unmount();
});

test('before the claim check has run (idle) nobody is routed to /portal/register', async () => {
  mockSession.user = { uid: 'u2', email: 'kid@email.com', role: null };
  mockSession.claimState = 'idle';
  const r = await renderScreen(<SignUp bare />, { path: '/portal/signup' });
  expect(r.location().pathname).toBe('/portal/signup');
  await r.unmount();
});
