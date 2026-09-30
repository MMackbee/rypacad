import React from 'react';
import { renderScreen } from './testRender';
import RegistrationSuccess from './RegistrationSuccess';
import { newAthleteEntry } from '../data/signup';

jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, label }) => <button type="button">{label}|{athleteId}</button>, startCheckout: async () => {} }));

const form = (over) => ({
  mode: 'parent', contact: { name: 'Dana', email: 'dana@email.com', phone: '1', relationship: 'Mother' },
  athletes: [{ ...newAthleteEntry(), name: 'Jordan', dob: '2012-06-17', packageId: 't-12' }, { ...newAthleteEntry(), name: 'Reese', dob: '2014-03-02', packageId: 'elite', ownLogin: true, loginEmail: 'reese@email.com' }],
  emergencyContact: '', medical: '', consents: {}, signatureName: 'Dana', ...over,
});

test('one pay button per athlete, the next steps, child-login instructions, no walkthrough', async () => {
  const finished = [];
  const r = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com' }} onFinish={(p) => finished.push(p)} />
  );
  expect(r.text()).toContain("You're in");
  expect(r.button("Pay for Jordan's 12 tokens|a1")).not.toBeNull();
  expect(r.button("Pay for Reese's Elite|a2")).not.toBeNull();
  expect(r.text()).toContain('Booking opens Sat, Oct 10 at 7 AM');
  expect(r.text()).toContain('Elite books right away once paid');
  expect(r.text()).toContain('you will be brought back here');
  expect(r.text()).toContain('reese@email.com');
  expect(r.text()).toContain("There's no welcome email");
  expect(r.button('Start the walkthrough')).toBeNull();
  await r.click('Go to your family');
  expect(finished).toEqual(['/portal/family']);
  await r.unmount();
});

test('an unverified password account is told to open the verification link before Pay (UX P-04)', async () => {
  const unverified = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com', emailVerified: false }} onFinish={() => {}} />
  );
  expect(unverified.text()).toContain('First open the link we emailed to dana@email.com (from noreply@');
  expect(unverified.text()).toContain(' - check spam), then tap Pay.');
  await unverified.unmount();
  const verified = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com', emailVerified: true }} onFinish={() => {}} />
  );
  expect(verified.text()).not.toContain('First open the link');
  await verified.unmount();
});

test('athlete mode goes home', async () => {
  const finished = [];
  const r = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form({ mode: 'athlete', athletes: [form().athletes[0]] })} result={{ householdId: 'h1', athleteIds: ['a1'] }} account={{ email: 'j@email.com' }} onFinish={(p) => finished.push(p)} />
  );
  await r.click('Go to your home');
  expect(finished).toEqual(['/portal/home']);
  await r.unmount();
});
