import React from 'react';
import { renderScreen } from './testRender';
import NotProvisioned from './NotProvisioned';
import { VERIFY_EMAIL_SENDER } from '../data/authCopy';

let mockSession;
let mockLegacy;
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => mockSession }));
jest.mock('../hooks', () => ({ useEnrollment: () => mockLegacy }));

beforeEach(() => {
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
