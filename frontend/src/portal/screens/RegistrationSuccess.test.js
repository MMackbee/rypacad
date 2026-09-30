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

// The clock is pinned: the receipt's gate and pay-terms lines depend on it.
const EMAIL_DAY = Date.parse('2026-10-01T17:00:00Z');
const NOV_1_CHICAGO = Date.parse('2026-11-01T05:00:00Z');
beforeEach(() => { jest.spyOn(Date, 'now').mockReturnValue(EMAIL_DAY); });
afterEach(() => { jest.restoreAllMocks(); });

test('one pay button per athlete, the next steps, child-login instructions, no walkthrough', async () => {
  const finished = [];
  const r = await renderScreen(
    <RegistrationSuccess bare mode="signup" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com' }} onFinish={(p) => finished.push(p)} />
  );
  expect(r.text()).toContain("You're in");
  expect(r.button("Pay $569 for Jordan's 12 tokens|a1")).not.toBeNull();
  expect(r.button("Pay $999 for Reese's Elite|a2")).not.toBeNull();
  expect(r.text()).toContain('Today you pay the amount on each button for November, then monthly from Dec 1.');
  expect(r.text()).toContain('Booking opens Sat, Oct 10 at 7 AM');
  expect(r.text()).toContain('Elite books right away once paid');
  // UX review P-09 / CHILD-3: where Stripe really returns, the child's real buttons, the full address.
  expect(r.text()).toContain('After you pay, Stripe sends you to your family page. It shows "Confirming your payment..." for up to a minute. Paying for more than one athlete? The others wait there under Pay now.');
  expect(r.text()).toContain(`Reese signs in at ${window.location.host}/portal/signin with reese@email.com. Continue with Google is quickest. With a password: tap Create a login, open the email from noreply@`);
  expect(r.text()).toContain(", then tap I've verified.");
  expect(r.text()).toContain("There's no welcome email. Your family page always shows what's paid and what's left to do.");
  expect(r.text()).not.toMatch(/brought back here|Check again|this screen is your receipt/);
  expect(r.button('Start the walkthrough')).toBeNull();
  await r.click('Go to your family');
  expect(finished).toEqual(['/portal/family']);
  await r.unmount();
});

test('before Nov 1 the receipt names the amount due today and says monthly from Dec 1, never when billing ends (UX P-07)', async () => {
  const one = form({ athletes: [{ ...newAthleteEntry(), name: 'Jordan Whitfield', dob: '2012-06-17', packageId: 't-6' }] });
  const r = await renderScreen(<RegistrationSuccess bare mode="signup" form={one} result={{ householdId: 'h1', athleteIds: ['a1'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
  expect(r.button("Pay $299 for Jordan's 6 tokens|a1")).not.toBeNull();
  expect(r.text()).toContain("Today you pay $299 for November, then monthly from Dec 1. Stripe's page calls the plan a free trial until Dec 1 because November is paid today as a separate line.");
  expect(r.text()).not.toMatch(/until you cancel|through February/);
  await r.unmount();
});

test('from Nov 1 (checkout prorates) and for the one-time single token the receipt names no amount', async () => {
  Date.now.mockReturnValue(NOV_1_CHICAGO);
  const r = await renderScreen(<RegistrationSuccess bare mode="signup" form={form()} result={{ householdId: 'h1', athleteIds: ['a1', 'a2'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
  expect(r.button("Pay for Jordan's 12 tokens|a1")).not.toBeNull();
  expect(r.button("Pay for Reese's Elite|a2")).not.toBeNull();
  expect(r.text()).not.toContain('Today you pay');
  await r.unmount();
  Date.now.mockReturnValue(EMAIL_DAY);
  const single = form({ athletes: [{ ...newAthleteEntry(), name: 'Jordan', dob: '2012-06-17', packageId: 'single' }] });
  const s = await renderScreen(<RegistrationSuccess bare mode="signup" form={single} result={{ householdId: 'h1', athleteIds: ['a1'] }} account={{ email: 'dana@email.com' }} onFinish={() => {}} />);
  expect(s.button("Pay for Jordan's Single token|a1")).not.toBeNull();
  expect(s.text()).not.toContain('Today you pay');
  expect(s.text()).not.toContain('monthly from Dec 1');
  await s.unmount();
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
  expect(r.text()).toContain('After you pay, Stripe sends you to your home page.');
  expect(r.text()).toContain('Your home page always shows');
  expect(r.text()).not.toContain('more than one athlete');
  await r.click('Go to your home');
  expect(finished).toEqual(['/portal/home']);
  await r.unmount();
});
