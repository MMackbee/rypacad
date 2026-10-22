import React, { act } from 'react';
import {
  applyActionCode,
  checkActionCode,
  confirmPasswordReset,
  onAuthStateChanged,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { auth } from '../../firebase';
import { renderScreen } from './testRender';
import AuthAction, { SIGN_IN_PATH, safeContinuePath } from './AuthAction';
import { RESEND } from '../data/authCopy';

jest.mock('firebase/auth', () => ({
  ...jest.requireActual('firebase/auth'),
  applyActionCode: jest.fn(),
  checkActionCode: jest.fn(),
  confirmPasswordReset: jest.fn(),
  onAuthStateChanged: jest.fn(),
  verifyPasswordResetCode: jest.fn(),
}));
// The portal's own initialised auth: the only auth this page may use.
jest.mock('../../firebase', () => ({
  __esModule: true,
  default: {},
  auth: { currentUser: null },
  provider: {},
  db: {},
  functions: {},
}));

const PATH = '/portal/auth/action';
// The deleted key Firebase still writes into every email link.
const OLD_KEY = 'AIzaSyOLD-deleted-browser-key';
const link = (query) => `${PATH}?${new URLSearchParams(query).toString()}`;
const fbError = (code) => Object.assign(new Error(code), { code });
// Lets the whole promise chain behind an action settle (a macrotask).
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const heading = (r) => r.container.querySelector('h1');
const status = (r) => r.container.querySelector('[role="status"]').textContent;
const firebaseMocks = [applyActionCode, checkActionCode, confirmPasswordReset, onAuthStateChanged, verifyPasswordResetCode];

async function open(query, element = <AuthAction bare />) {
  const r = await renderScreen(element, { path: link(query) });
  await settle();
  return r;
}

beforeEach(() => {
  auth.currentUser = null;
  // Auth has finished restoring the saved session (if any) a tick later.
  onAuthStateChanged.mockImplementation((a, next) => {
    Promise.resolve().then(() => next(a.currentUser));
    return () => {};
  });
  applyActionCode.mockResolvedValue(undefined);
  checkActionCode.mockResolvedValue({ operation: 'RECOVER_EMAIL', data: { email: 'dana@email.com', previousEmail: 'someone@else.example' } });
  verifyPasswordResetCode.mockResolvedValue('dana@email.com');
  confirmPasswordReset.mockResolvedValue(undefined);
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('verifyEmail', () => {
  test('signed out: applies the code with the portal auth and shows success, heading focused and announced', async () => {
    const r = await open({ mode: 'verifyEmail', oobCode: 'code-1', apiKey: OLD_KEY, lang: 'en' });
    expect(applyActionCode).toHaveBeenCalledTimes(1);
    expect(applyActionCode).toHaveBeenCalledWith(auth, 'code-1');
    expect(r.container.querySelectorAll('h1')).toHaveLength(1);
    expect(heading(r).textContent).toBe('Email verified');
    expect(document.activeElement).toBe(heading(r));
    expect(status(r)).toContain('Email verified.');
    // No continueUrl: Continue goes to sign-in.
    await r.click('Continue');
    expect(r.location().pathname).toBe(SIGN_IN_PATH);
    await r.unmount();
  });

  test('signed in: reloads the user and forces a fresh token before showing success', async () => {
    const calls = [];
    let releaseReload;
    auth.currentUser = {
      reload: jest.fn(() => new Promise((resolve) => { calls.push('reload'); releaseReload = resolve; })),
      getIdToken: jest.fn(async (force) => { calls.push(`token:${force}`); return 'token'; }),
    };
    const r = await open({ mode: 'verifyEmail', oobCode: 'code-2', continueUrl: 'http://localhost/portal/signin' });
    // The gate must see the new state before Continue can be tapped.
    expect(heading(r).textContent).toBe('Checking your link');
    expect(r.button('Continue')).toBeNull();
    await act(async () => { releaseReload(); });
    await settle();
    expect(calls).toEqual(['reload', 'token:true']);
    expect(heading(r).textContent).toBe('Email verified');
    await r.unmount();
  });

  test('a refresh that fails does not hide that the email is verified', async () => {
    auth.currentUser = { reload: jest.fn(async () => { throw fbError('auth/user-token-expired'); }), getIdToken: jest.fn() };
    const r = await open({ mode: 'verifyEmail', oobCode: 'code-3' });
    expect(heading(r).textContent).toBe('Email verified');
    await r.unmount();
  });

  test('called exactly once under React.StrictMode', async () => {
    // A second call would fail: the code is spent by the first.
    applyActionCode.mockReset();
    applyActionCode.mockResolvedValueOnce(undefined).mockRejectedValue(fbError('auth/invalid-action-code'));
    const r = await open(
      { mode: 'verifyEmail', oobCode: 'code-4', apiKey: OLD_KEY },
      <React.StrictMode><AuthAction bare /></React.StrictMode>
    );
    expect(applyActionCode).toHaveBeenCalledTimes(1);
    expect(heading(r).textContent).toBe('Email verified');
    await r.unmount();
  });

  test('an expired link says so and points at Resend after signing in', async () => {
    applyActionCode.mockRejectedValue(fbError('auth/expired-action-code'));
    const r = await open({ mode: 'verifyEmail', oobCode: 'old-code' });
    expect(heading(r).textContent).toBe('This link has expired');
    expect(r.text()).toContain(`To get a new link, sign in and tap ${RESEND}.`);
    expect(status(r)).toContain('This link has expired.');
    expect(document.activeElement).toBe(heading(r));
    expect(r.button('Try again')).toBeNull();
    await r.click('Go to sign in');
    expect(r.location().pathname).toBe(SIGN_IN_PATH);
    await r.unmount();
  });

  test('used, disabled, missing and unknown failures each get their own message', async () => {
    const cases = [
      ['auth/invalid-action-code', 'This link no longer works', true],
      ['auth/user-disabled', 'This login is turned off', false],
      ['auth/user-not-found', 'Login not found', false],
      ['auth/internal-error', 'Something went wrong', true],
    ];
    for (const [code, title, resendHint] of cases) {
      applyActionCode.mockRejectedValue(fbError(code));
      const r = await open({ mode: 'verifyEmail', oobCode: `c-${code}` });
      expect(heading(r).textContent).toBe(title);
      expect(r.text().includes(`tap ${RESEND}`)).toBe(resendHint);
      expect(r.button('Go to sign in')).not.toBeNull();
      await r.unmount();
    }
  });

  test('no connection offers Try again, which runs the link again', async () => {
    applyActionCode.mockReset();
    applyActionCode.mockRejectedValueOnce(fbError('auth/network-request-failed')).mockResolvedValueOnce(undefined);
    const r = await open({ mode: 'verifyEmail', oobCode: 'code-5' });
    expect(heading(r).textContent).toBe('No connection');
    expect(r.button('Go to sign in')).not.toBeNull();
    await r.click('Try again');
    await settle();
    expect(applyActionCode).toHaveBeenCalledTimes(2);
    expect(heading(r).textContent).toBe('Email verified');
    await r.unmount();
  });

  test('verifyAndChangeEmail applies the code and says the email is updated', async () => {
    const r = await open({ mode: 'verifyAndChangeEmail', oobCode: 'code-6' });
    expect(applyActionCode).toHaveBeenCalledWith(auth, 'code-6');
    expect(heading(r).textContent).toBe('Email updated');
    await r.unmount();
  });
});

describe('continueUrl', () => {
  test('a same-origin portal page is followed', async () => {
    const r = await open({ mode: 'verifyEmail', oobCode: 'code-7', continueUrl: 'http://localhost/portal/billing?from=verify' });
    await r.click('Continue');
    expect(r.location().pathname).toBe('/portal/billing');
    expect(r.location().search).toBe('?from=verify');
    await r.unmount();
  });

  test('another site falls back to sign-in', async () => {
    const r = await open({ mode: 'verifyEmail', oobCode: 'code-8', continueUrl: 'https://evil.example/portal/home' });
    await r.click('Continue');
    expect(r.location().pathname).toBe(SIGN_IN_PATH);
    await r.unmount();
  });

  test('only this origin and only /portal pages', () => {
    expect(safeContinuePath('http://localhost/portal/signin')).toBe('/portal/signin');
    expect(safeContinuePath('http://localhost/portal')).toBe('/portal');
    expect(safeContinuePath('http://localhost/portal/home#top')).toBe('/portal/home#top');
    for (const unsafe of [
      '',
      undefined,
      'https://evil.example/portal/home',
      'https://localhost.evil.example/portal/home',
      'http://localhost:8080/portal/home',
      'http://localhost/elsewhere',
      'http://localhost/portalx',
      'http://localhost/portal/../admin',
      '//evil.example/portal/home',
      '/portal/home',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(safeContinuePath(unsafe)).toBe(SIGN_IN_PATH);
    }
  });
});

describe('resetPassword', () => {
  test('shows the email, checks length and match before saving, then confirms', async () => {
    const r = await open({ mode: 'resetPassword', oobCode: 'reset-1', apiKey: OLD_KEY, lang: 'en' });
    expect(verifyPasswordResetCode).toHaveBeenCalledWith(auth, 'reset-1');
    expect(heading(r).textContent).toBe('Choose a new password');
    expect(r.text()).toContain('For dana@email.com.');
    expect(r.container.querySelector('[aria-label="New password"]').type).toBe('password');
    expect(r.container.querySelector('[aria-label="Confirm password"]').type).toBe('password');

    await r.fill('New password', 'abc');
    await r.fill('Confirm password', 'abc');
    await r.click('Save password');
    expect(r.text()).toContain('Use at least 6 characters.');
    expect(r.container.querySelector('[role="alert"]').textContent).toContain('Use at least 6 characters.');

    await r.fill('New password', 'correct-horse');
    await r.fill('Confirm password', 'correct-hors');
    await r.click('Save password');
    expect(r.text()).toContain('The two passwords do not match.');
    expect(r.text()).not.toContain('Use at least 6 characters.');
    expect(confirmPasswordReset).not.toHaveBeenCalled();

    await r.fill('Confirm password', 'correct-horse');
    await r.click('Save password');
    await settle();
    expect(confirmPasswordReset).toHaveBeenCalledTimes(1);
    expect(confirmPasswordReset).toHaveBeenCalledWith(auth, 'reset-1', 'correct-horse');
    expect(heading(r).textContent).toBe('Password changed');
    expect(document.activeElement).toBe(heading(r));
    await r.click('Sign in');
    expect(r.location().pathname).toBe(SIGN_IN_PATH);
    await r.unmount();
  });

  test('a password the server calls weak stays on the form with the sign-up wording', async () => {
    confirmPasswordReset.mockRejectedValue(fbError('auth/weak-password'));
    const r = await open({ mode: 'resetPassword', oobCode: 'reset-2' });
    await r.fill('New password', 'aaaaaa');
    await r.fill('Confirm password', 'aaaaaa');
    await r.click('Save password');
    await settle();
    expect(r.text()).toContain('Choose a longer password - at least 6 characters.');
    expect(r.button('Save password')).not.toBeNull();
    await r.unmount();
  });

  test('no connection on save keeps the form so it can be sent again', async () => {
    confirmPasswordReset.mockRejectedValueOnce(fbError('auth/network-request-failed')).mockResolvedValueOnce(undefined);
    const r = await open({ mode: 'resetPassword', oobCode: 'reset-3' });
    await r.fill('New password', 'correct-horse');
    await r.fill('Confirm password', 'correct-horse');
    await r.click('Save password');
    await settle();
    expect(r.text()).toContain('Could not connect.');
    await r.click('Save password');
    await settle();
    expect(heading(r).textContent).toBe('Password changed');
    await r.unmount();
  });

  test('an expired reset link points at Forgot password, before or on save', async () => {
    verifyPasswordResetCode.mockRejectedValue(fbError('auth/expired-action-code'));
    const before = await open({ mode: 'resetPassword', oobCode: 'reset-4' });
    expect(heading(before).textContent).toBe('This link has expired');
    expect(before.text()).toContain('enter your email and tap Forgot password');
    expect(before.container.querySelector('[aria-label="New password"]')).toBeNull();
    await before.unmount();

    verifyPasswordResetCode.mockResolvedValue('dana@email.com');
    confirmPasswordReset.mockRejectedValue(fbError('auth/invalid-action-code'));
    const onSave = await open({ mode: 'resetPassword', oobCode: 'reset-5' });
    await onSave.fill('New password', 'correct-horse');
    await onSave.fill('Confirm password', 'correct-horse');
    await onSave.click('Save password');
    await settle();
    expect(heading(onSave).textContent).toBe('This link no longer works');
    expect(onSave.text()).toContain('tap Forgot password');
    await onSave.unmount();
  });
});

describe('recoverEmail', () => {
  test('reads the restored address, applies the code, and recommends a new password', async () => {
    const r = await open({ mode: 'recoverEmail', oobCode: 'rec-1', apiKey: OLD_KEY });
    expect(checkActionCode).toHaveBeenCalledWith(auth, 'rec-1');
    expect(applyActionCode).toHaveBeenCalledWith(auth, 'rec-1');
    expect(checkActionCode.mock.invocationCallOrder[0]).toBeLessThan(applyActionCode.mock.invocationCallOrder[0]);
    expect(heading(r).textContent).toBe('Email restored');
    expect(r.text()).toContain('Your sign-in email is back to dana@email.com.');
    expect(r.text()).toContain('change your password too');
    expect(r.text()).not.toContain('someone@else.example');
    await r.click('Sign in');
    expect(r.location().pathname).toBe(SIGN_IN_PATH);
    await r.unmount();
  });

  test('a used recovery link says so and never applies', async () => {
    checkActionCode.mockRejectedValue(fbError('auth/invalid-action-code'));
    const r = await open({ mode: 'recoverEmail', oobCode: 'rec-2' });
    expect(applyActionCode).not.toHaveBeenCalled();
    expect(heading(r).textContent).toBe('This link no longer works');
    expect(r.text()).toContain('contact RYP Academy');
    await r.unmount();
  });
});

describe('a link that is not complete', () => {
  test('missing mode, missing code or an unknown mode: the invalid-link state, no Firebase call', async () => {
    for (const query of [{}, { mode: 'verifyEmail' }, { oobCode: 'x1' }, { mode: 'signIn', oobCode: 'x2' }, { mode: 'resetPassword', apiKey: OLD_KEY }]) {
      const r = await open(query);
      expect(heading(r).textContent).toBe('This link is not complete');
      expect(r.container.querySelectorAll('h1')).toHaveLength(1);
      for (const mock of firebaseMocks) expect(mock).not.toHaveBeenCalled();
      await r.click('Go to sign in');
      expect(r.location().pathname).toBe(SIGN_IN_PATH);
      await r.unmount();
    }
  });
});

describe('the address bar and the old key', () => {
  test('replaceState drops oobCode, apiKey and the rest, keeping only the mode', async () => {
    const replace = jest.spyOn(window.history, 'replaceState');
    const r = await open({ mode: 'verifyEmail', oobCode: 'code-9', apiKey: OLD_KEY, continueUrl: 'http://localhost/portal/signin', lang: 'en' });
    expect(replace.mock.calls.map((call) => call[2])).toContain(`${PATH}?mode=verifyEmail`);
    expect(window.location.pathname).toBe(PATH);
    expect(window.location.search).toBe('?mode=verifyEmail');
    expect(window.location.href).not.toContain('code-9');
    expect(window.location.href).not.toContain(OLD_KEY);
    replace.mockRestore();
    await r.unmount();
  });

  test('an unknown mode leaves no query at all', async () => {
    const r = await open({ mode: 'signIn', oobCode: 'x3', apiKey: OLD_KEY });
    expect(window.location.pathname).toBe(PATH);
    expect(window.location.search).toBe('');
    await r.unmount();
  });

  test('the apiKey in the link is never passed to Firebase or shown', async () => {
    auth.currentUser = { reload: jest.fn(async () => {}), getIdToken: jest.fn(async () => 'token') };
    const screens = [];
    for (const mode of ['verifyEmail', 'resetPassword', 'recoverEmail']) {
      const r = await open({ mode, oobCode: `k-${mode}`, apiKey: OLD_KEY, continueUrl: 'http://localhost/portal/signin' });
      screens.push(r.text());
      await r.unmount();
    }
    const everyCall = firebaseMocks.flatMap((mock) => mock.mock.calls).concat(auth.currentUser.reload.mock.calls, auth.currentUser.getIdToken.mock.calls);
    expect(everyCall.length).toBeGreaterThan(0);
    for (const args of everyCall) {
      for (const arg of args) {
        expect(arg === auth || typeof arg === 'function' || !JSON.stringify(arg ?? null).includes(OLD_KEY)).toBe(true);
      }
    }
    // Every call that takes an auth gets the portal's own instance.
    for (const mock of firebaseMocks) for (const args of mock.mock.calls) expect(args[0]).toBe(auth);
    expect(Object.values(auth).some((v) => typeof v === 'string' && v.includes(OLD_KEY))).toBe(false);
    for (const text of screens) expect(text).not.toContain(OLD_KEY);
  });
});
