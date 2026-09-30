import React, { act } from 'react';
import { renderScreen } from './testRender';
import Registration from './Registration';

const mockCalls = [];
jest.mock('../hooks/callables', () => ({
  callCreateFamily: async (payload) => { mockCalls.push(['createFamily', payload]); return { householdId: 'h1', athleteIds: ['a1'] }; },
  callAddAthletes: async (payload) => { mockCalls.push(['addAthletes', payload]); return { householdId: 'h1', athleteIds: ['a2'] }; },
  callCreateCheckoutSession: async () => ({ url: 'https://checkout.stripe.test/x' }),
}), { virtual: true });
jest.mock('./RegistrationSuccess', () => ({ __esModule: true, default: ({ result, onFinish }) => <button type="button" onClick={() => onFinish('/portal/family')}>SUCCESS {result.athleteIds.join(',')}</button> }));

beforeEach(() => { mockCalls.length = 0; });

async function fillParentToConsent(r) {
  await r.click('Parent or guardian');
  await r.click('Continue');
  expect(r.container.querySelector('[aria-label="Email"]').value).toBe('dana@email.com'); // prefilled from auth
  await r.fill('Your name', 'Dana Whitfield');
  await r.fill('Mobile', '(612) 555-0148');
  await r.fill('Relationship to athlete', 'Mother');
  await r.click('Continue');
  await r.fill('Athlete name', 'Jordan');
  await r.fill('Date of birth', '2012-06-17');
  await r.fill('Handicap', '12');
  await r.click('Continue');
  await r.click('12 tokens');
  await r.click('Continue');
  await r.fill('Type your full legal name', 'Dana Whitfield');
}

test('parent sign-up calls createFamily with the contract payload, shows success, refreshes only on leaving it', async () => {
  const refreshed = [];
  const finished = [];
  const r = await renderScreen(
    <Registration bare mode="signup" account={{ email: 'dana@email.com', emailVerified: false }} onRefresh={async () => refreshed.push(1)} onFinish={(p) => finished.push(p)} />
  );
  expect(r.text()).toContain('Step 1 of 5');
  await fillParentToConsent(r);
  await r.click('Sign and submit');
  expect(mockCalls[0][0]).toBe('createFamily');
  expect(mockCalls[0][1]).toMatchObject({
    mode: 'parent',
    contact: { name: 'Dana Whitfield', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
    athletes: [{ name: 'Jordan', dob: '2012-06-17', packageId: 't-12', handicap: 12, loginEmail: null, contractMinutes: null }],
    signatureName: 'Dana Whitfield',
  });
  // The receipt renders BEFORE provisioned flips: RegistrationRoute would
  // otherwise redirect and unmount it (review 2026-09-28).
  expect(r.text()).toContain('SUCCESS a1');
  expect(refreshed).toHaveLength(0);
  await r.click('SUCCESS a1');
  expect(refreshed).toHaveLength(1);
  expect(finished).toEqual(['/portal/family']);
  await r.unmount();
});

test('a reload keeps the half-filled form (per signed-in account), and success clears it', async () => {
  window.sessionStorage.clear();
  const account = { uid: 'u-draft', email: 'dana@email.com', emailVerified: false };
  const first = await renderScreen(<Registration bare mode="signup" account={account} />);
  await first.click('Parent or guardian');
  await first.click('Continue');
  await first.fill('Your name', 'Dana Whitfield');
  await first.unmount(); // the tab reloads
  const second = await renderScreen(<Registration bare mode="signup" account={account} />);
  expect(second.text()).toContain('Step 2 of 5');
  expect(second.container.querySelector('[aria-label="Your name"]').value).toBe('Dana Whitfield');
  await second.unmount();
  // Another login on the same browser never sees it.
  const other = await renderScreen(<Registration bare mode="signup" account={{ uid: 'u-other', email: 'x@email.com' }} />);
  expect(other.text()).toContain('Step 1 of 5');
  await other.unmount();
  // Submitting successfully drops the draft.
  const third = await renderScreen(<Registration bare mode="signup" account={account} onFinish={() => {}} />);
  await third.fill('Mobile', '(612) 555-0148');
  await third.fill('Relationship to athlete', 'Mother');
  await third.click('Continue');
  await third.fill('Athlete name', 'Jordan');
  await third.fill('Date of birth', '2012-06-17');
  await third.click('Continue');
  await third.click('12 tokens');
  await third.click('Continue');
  await third.fill('Type your full legal name', 'Dana Whitfield');
  await third.click('Sign and submit');
  expect(third.text()).toContain('SUCCESS a1');
  expect(window.sessionStorage.getItem('ryp.signupDraft.signup.u-draft')).toBeNull();
  await third.unmount();
});

test('Continue on an unfinished step names the missing fields instead of sitting greyed out', async () => {
  const r = await renderScreen(<Registration bare mode="signup" account={{ email: 'dana@email.com' }} />);
  await r.click('Parent or guardian');
  await r.click('Continue');
  await r.fill('Your name', 'Dana Whitfield');
  expect(r.button('Continue').disabled).toBe(false);
  await r.click('Continue'); // no phone yet
  expect(r.text()).toContain('Step 2 of 5');
  expect(r.text()).toContain('A mobile number is required.');
  await r.fill('Mobile', '(612) 555-0148');
  await r.click('Continue');
  await r.fill('Athlete name', 'Jordan');
  await r.fill('Date of birth', '2031-01-01');
  await r.click('Continue');
  expect(r.text()).toContain('Step 3 of 5');
  expect(r.text()).toContain('That date is in the future - check the year.');
  expect(r.text()).not.toContain('Age -');
  await r.unmount();
});

test('a double tap on Sign and submit sends one createFamily and still shows the receipt', async () => {
  const r = await renderScreen(<Registration bare mode="signup" account={{ email: 'dana@email.com' }} onRefresh={async () => {}} />);
  await fillParentToConsent(r);
  const before = mockCalls.length;
  const submit = r.button('Sign and submit');
  await act(async () => { submit.click(); submit.click(); });
  expect(mockCalls.length - before).toBe(1);
  expect(r.text()).toContain('SUCCESS a1');
  await r.unmount();
});

test('a restored draft holding the off-sale single token cannot be submitted', async () => {
  window.sessionStorage.clear();
  const account = { uid: 'u-single', email: 'dana@email.com' };
  const form = {
    mode: 'parent',
    contact: { name: 'Dana Whitfield', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
    athletes: [{ key: 'k1', name: 'Jordan', dob: '2012-06-17', handicap: '', ownLogin: false, loginEmail: '', packageId: 'single', contractMinutes: null }],
    emergencyContact: '', medical: '',
    consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false },
    signatureName: '',
  };
  window.sessionStorage.setItem('ryp.signupDraft.signup.u-single', JSON.stringify({ v: 1, step: 3, form }));
  const r = await renderScreen(<Registration bare mode="signup" account={account} />);
  expect(r.text()).toContain('Step 4 of 5');
  expect(r.button('Single token').getAttribute('aria-pressed')).toBe('false');
  await r.click('Continue');
  expect(r.text()).toContain('Step 4 of 5');
  expect(r.text()).toContain('Pick a package for Jordan to continue.');
  await r.click('6 tokens');
  await r.click('Continue');
  expect(r.text()).toContain('Step 5 of 5');
  await r.unmount();
  window.sessionStorage.clear();
});

test('link mode skips to athletes and calls addAthletes', async () => {
  const r = await renderScreen(<Registration bare mode="link" account={{ email: 'dana@email.com' }} />);
  expect(r.text()).toContain('Step 1 of 2');
  await r.fill('Athlete name', 'Reese');
  await r.fill('Date of birth', '2014-03-02');
  await r.click('Continue');
  await r.click('6 tokens');
  await r.click('Add athlete');
  expect(mockCalls[0][0]).toBe('addAthletes');
  expect(mockCalls[0][1]).toEqual({ athletes: [{ name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null }], medical: null });
  await r.unmount();
});
