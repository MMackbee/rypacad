import React from 'react';
import { renderScreen } from './testRender';
import SignUp from './SignUp';

let mockSession;
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => mockSession }));

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
  expect(r.text()).toContain('We sent a link to dana@email.com from noreply@');
  expect(r.button('Continue to sign-up')).not.toBeNull();
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
