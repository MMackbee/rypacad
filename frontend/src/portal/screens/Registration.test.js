import React from 'react';
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
