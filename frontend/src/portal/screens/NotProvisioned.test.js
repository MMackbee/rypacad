import React, { act } from 'react';
import { renderScreen } from './testRender';
import NotProvisioned from './NotProvisioned';
import { VERIFY_EMAIL_SENDER } from '../data/authCopy';

let mockSession;
let mockLegacy;
let mockLive; // a live-shaped session hook (liveSession below), else the fixed mockSession
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => (mockLive ? mockLive() : mockSession) }));
jest.mock('../hooks', () => ({ useEnrollment: () => mockLegacy }));

/**
 * useAuthSession's runClaim, live-shaped: checkInvite flips claimState to
 * 'checking', waits until the test calls gate.release(), then lands `result`.
 * The view leaves and re-enters, which the fixed Demo variant never does.
 */
function liveSession(start, result) {
  const gate = {};
  function useLiveSession() {
    const [claimState, setClaimState] = React.useState(start);
    const checkInvite = async () => {
      setClaimState('checking');
      await new Promise((resolve) => { gate.release = resolve; });
      setClaimState(result);
      return result;
    };
    gate.claim = checkInvite; // the auth effect's first claim, no tap
    return { ...mockSession, claimState, checkInvite };
  }
  mockLive = useLiveSession;
  return gate;
}

beforeEach(() => {
  mockLive = null;
  mockLegacy = { data: { status: 'none', request: null }, loading: false, error: null, submit: async () => {} };
  mockSession = {
    user: { uid: 'u1', email: 'kid@email.com', emailVerified: false, role: null }, provisioned: false, loading: false,
    claimState: 'none', checkInvite: async () => 'none', resendVerification: async () => ({ sent: true }), signOut: async () => {},
  };
});

test('stranger: two CTAs and Check again re-runs the claim', async () => {
  const checks = [];
  mockSession.checkInvite = async () => { checks.push(1); return 'none'; };
  const started = [];
  const r = await renderScreen(<NotProvisioned bare onStartEnrollment={() => started.push(1)} />);
  await r.click("I'm a parent - start sign-up");
  expect(started).toEqual([1]);
  await r.click('My parent enrolled me');
  expect(r.text()).toContain('Use the email they entered, then tap Check again.');
  await r.click('Check again');
  expect(checks).toEqual([1]);
  await r.unmount();
});

test('needs-verification names the sender and offers Resend / I\'ve verified', async () => {
  mockSession.claimState = 'needs-verification';
  const resent = []; const checks = [];
  mockSession.resendVerification = async () => { resent.push(1); return { sent: true }; };
  mockSession.checkInvite = async () => { checks.push(1); return 'needs-verification'; };
  const r = await renderScreen(<NotProvisioned bare />);
  expect(r.text()).toContain('Verify your email to finish');
  expect(r.text()).toContain(`We sent a link to kid@email.com from ${VERIFY_EMAIL_SENDER}.`);
  await r.click('Resend');
  await r.click("I've verified");
  expect(resent).toEqual([1]);
  expect(checks).toEqual([1]);
  await r.unmount();
});

// Guide 4.3 (Yannick): I've verified before opening the link said nothing.
test("live: I've verified before the link keeps the verify card and says not verified yet", async () => {
  const gate = liveSession('needs-verification', 'needs-verification');
  const r = await renderScreen(<NotProvisioned bare />);
  await r.click("I've verified");
  // Mid-check: the same card, its button busy - not the first-load checking card.
  expect(r.text()).not.toContain('Checking your account');
  expect(r.button("I've verified").disabled).toBe(true);
  await act(async () => { gate.release(); });
  expect(r.text()).toContain("Not verified yet - open the link in the email, then tap I've verified.");
  expect(r.text()).toContain('Verify your email to finish');
  await r.unmount();
});

// Guide 4.7 (Yannick): Check again with no invite collapsed the panel, no message.
test('live: Check again with no invite keeps the panel open and says so', async () => {
  const gate = liveSession('none', 'none');
  const r = await renderScreen(<NotProvisioned bare onStartEnrollment={() => {}} />);
  await r.click('My parent enrolled me');
  await r.click('Check again');
  expect(r.button('Check again').disabled).toBe(true);
  await act(async () => { gate.release(); });
  expect(r.text()).toContain('No invite for this email yet. Check the email your parent entered, or ask them to add your login.');
  expect(r.text()).toContain('Use the email they entered, then tap Check again.');
  expect(r.button('Check again')).not.toBeNull();
  await r.unmount();
});

test('live: first load still shows the checking card; a re-check that lands verify moves on', async () => {
  mockSession.claimState = 'checking';
  const first = await renderScreen(<NotProvisioned bare />);
  expect(first.text()).toContain('Checking your account');
  await first.unmount();
  const gate = liveSession('none', 'needs-verification');
  const r = await renderScreen(<NotProvisioned bare />);
  await r.click('My parent enrolled me');
  await r.click('Check again');
  await act(async () => { gate.release(); });
  expect(r.text()).toContain('Verify your email to finish');
  expect(r.button("I've verified")).not.toBeNull();
  await r.unmount();
});

// The real hook starts 'idle' (stranger once enrollment loads), then claims on its own.
test('live: a first load from idle shows the checking card, not the stranger CTAs', async () => {
  const gate = liveSession('idle', 'needs-verification');
  const r = await renderScreen(<NotProvisioned bare onStartEnrollment={() => {}} />);
  expect(r.button('My parent enrolled me')).not.toBeNull();
  await act(async () => { gate.claim(); });
  expect(r.text()).toContain('Checking your account');
  expect(r.button("I'm a parent - start sign-up")).toBeNull();
  expect(r.button('My parent enrolled me')).toBeNull();
  await act(async () => { gate.release(); });
  expect(r.text()).toContain('Verify your email to finish');
  expect(r.button("I've verified")).not.toBeNull();
  await r.unmount();
});

test('already claimed and legacy pending', async () => {
  mockSession.claimState = 'already-claimed';
  const a = await renderScreen(<NotProvisioned bare />);
  expect(a.text()).toContain('This login is already set up - sign in with it');
  await a.unmount();
  mockSession.claimState = 'none';
  mockLegacy.data = { status: 'pending', request: { guardian: { name: 'Dana' }, athletes: [] } };
  const started = [];
  const l = await renderScreen(<NotProvisioned bare onStartEnrollment={() => started.push(1)} />);
  await l.click('Sign-up is now instant - start here');
  expect(started).toEqual([1]);
  expect(l.text()).not.toContain("you'll get an email");
  await l.unmount();
});

test('a claimed account is sent to its home', async () => {
  mockSession.provisioned = true;
  mockSession.user = { ...mockSession.user, role: 'athlete' };
  const r = await renderScreen(<NotProvisioned bare />, { path: '/portal/not-provisioned' });
  expect(r.location().pathname).toBe('/portal/home');
  await r.unmount();
});
