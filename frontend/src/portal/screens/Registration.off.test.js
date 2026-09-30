import React from 'react';
import { renderScreen } from './testRender';
import Registration from './Registration';

/**
 * Sign-up with the Commitment Contract hidden (owner ruling 2026-09-30,
 * data/contractFlag.js): the step does not exist, every athlete is sent with
 * contractMinutes null, and a draft saved on the 6-step layout still
 * restores. The real receipt renders here (not mocked) so its copy is
 * checked too. Registration.test.js covers the flag ON, unchanged.
 */
const mockCalls = [];
// Not `virtual`: see PayButton.test.js.
jest.mock('../hooks/callables', () => ({
  callCreateFamily: async (payload) => { mockCalls.push(['createFamily', payload]); return { householdId: 'h1', athleteIds: ['a1'] }; },
  callAddAthletes: async (payload) => { mockCalls.push(['addAthletes', payload]); return { householdId: 'h1', athleteIds: ['a2'] }; },
}));
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ label }) => <button type="button">{label}</button> }));

beforeEach(() => {
  mockCalls.length = 0;
  delete process.env.REACT_APP_CONTRACT_ENABLED;
  window.sessionStorage.clear();
});
afterEach(() => { window.sessionStorage.clear(); });

/** A v1 draft as the 6-step form saved it: a goal picked, contractPicked set. */
function sixStepDraft(athlete = {}) {
  return {
    mode: 'parent',
    contact: { name: 'Dana Whitfield', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
    athletes: [{ key: 'k1', name: 'Jordan', dob: '2012-06-17', handicap: '', ownLogin: false, loginEmail: '', packageId: 't-12',
      contractMinutes: 45, contractPicked: true, ...athlete }],
    emergencyContact: { name: '', phone: '', relationship: '' }, medical: '',
    consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false },
    signatureName: 'Dana Whitfield',
  };
}

test('sign-up is 5 steps with no contract anywhere, and sends contractMinutes null', async () => {
  const r = await renderScreen(<Registration bare mode="signup" account={{ email: 'dana@email.com' }} onRefresh={async () => {}} />);
  expect(r.text()).toContain('Step 1 of 5');
  await r.click('Parent or guardian');
  await r.click('Continue');
  await r.fill('Your name', 'Dana Whitfield');
  await r.fill('Mobile', '(612) 555-0148');
  await r.click('Continue');
  expect(r.text()).toContain('Step 3 of 5');
  await r.fill('Athlete name', 'Jordan');
  await r.fill('Date of birth', '2012-06-17');
  await r.click('Continue');
  expect(r.text()).toContain('Step 4 of 5');
  expect(r.text()).not.toMatch(/contract|commitment/i);
  await r.click('12 tokens');
  await r.click('Continue');
  expect(r.text()).toContain('Step 5 of 5');
  expect(r.text()).toContain('Consent and waiver');
  expect(r.text()).not.toMatch(/contract|commitment/i);
  await r.fill('Type your full legal name', 'Dana Whitfield');
  await r.click('Sign and submit');
  expect(mockCalls).toHaveLength(1);
  expect(mockCalls[0][1].athletes).toEqual([
    { name: 'Jordan', dob: '2012-06-17', packageId: 't-12', contractMinutes: null, handicap: null, loginEmail: null, facilityRequested: false },
  ]);
  // The receipt and its "What happens next" say nothing about a contract.
  expect(r.text()).toContain("You're in");
  expect(r.text()).not.toMatch(/contract|commitment/i);
  await r.unmount();
});

test('link mode is 2 steps: the package step submits, contractMinutes null', async () => {
  const r = await renderScreen(<Registration bare mode="link" account={{ email: 'dana@email.com' }} />);
  expect(r.text()).toContain('Step 1 of 2');
  await r.fill('Athlete name', 'Reese');
  await r.fill('Date of birth', '2014-03-02');
  await r.click('Continue');
  expect(r.text()).toContain('Step 2 of 2');
  await r.click('6 tokens');
  await r.click('Add athlete');
  expect(mockCalls[0]).toEqual(['addAthletes', {
    athletes: [{ name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null, facilityRequested: false }],
    emergencyContact: null, medical: null,
  }]);
  await r.unmount();
});

test('a 6-step draft on the old consent step reopens on consent (clamped); its 45 is not sent', async () => {
  const account = { uid: 'u-six', email: 'dana@email.com' };
  window.sessionStorage.setItem('ryp.signupDraft.signup.u-six', JSON.stringify({ v: 1, step: 5, form: sixStepDraft() }));
  const r = await renderScreen(<Registration bare mode="signup" account={account} onRefresh={async () => {}} />);
  expect(r.text()).toContain('Step 5 of 5');
  expect(r.container.querySelector('[aria-label="Type your full legal name"]').value).toBe('Dana Whitfield');
  await r.click('Sign and submit');
  expect(mockCalls[0][1].athletes[0].contractMinutes).toBeNull();
  expect(mockCalls[0][1].athletes[0]).not.toHaveProperty('contractPicked');
  await r.unmount();
});

test('a draft saved on the old contract step reopens on consent; a stale 95 blocks nothing', async () => {
  const account = { uid: 'u-c4', email: 'dana@email.com' };
  const form = sixStepDraft({ contractMinutes: 95, contractPicked: false });
  window.sessionStorage.setItem('ryp.signupDraft.signup.u-c4', JSON.stringify({ v: 1, step: 4, form }));
  const r = await renderScreen(<Registration bare mode="signup" account={account} onRefresh={async () => {}} />);
  expect(r.text()).toContain('Step 5 of 5');
  expect(r.text()).not.toMatch(/Commitment Contract/);
  await r.click('‹ Back');
  await r.click('‹ Back');
  expect(r.text()).toContain('Step 3 of 5');
  await r.click('Continue');
  await r.click('Continue');
  expect(r.text()).toContain('Step 5 of 5');
  await r.click('Sign and submit');
  expect(mockCalls[0][1].athletes[0].contractMinutes).toBeNull();
  await r.unmount();
});

test('a link-mode draft past its old contract step clamps to the package step', async () => {
  const account = { uid: 'u-link', email: 'dana@email.com' };
  window.sessionStorage.setItem('ryp.signupDraft.link.u-link', JSON.stringify({ v: 1, step: 2, form: sixStepDraft() }));
  const r = await renderScreen(<Registration bare mode="link" account={account} />);
  expect(r.text()).toContain('Step 2 of 2');
  expect(r.button('Add athlete')).not.toBeNull();
  await r.unmount();
});

test("the harness's contract variant still shows the step; its other variants follow the flag", async () => {
  const contract = await renderScreen(<Registration bare variant="contract" />);
  expect(contract.text()).toContain('Step 5 of 6');
  expect(contract.text()).toContain('Commitment Contract');
  await contract.unmount();
  const consent = await renderScreen(<Registration bare variant="consent" />);
  expect(consent.text()).toContain('Step 5 of 5');
  expect(consent.text()).toContain('Consent and waiver');
  await consent.unmount();
});

test('smoke: flag on, the contract step is back (6 steps)', async () => {
  process.env.REACT_APP_CONTRACT_ENABLED = 'true';
  try {
    const r = await renderScreen(<Registration bare mode="signup" account={{ email: 'dana@email.com' }} />);
    expect(r.text()).toContain('Step 1 of 6');
    await r.unmount();
    const consent = await renderScreen(<Registration bare variant="consent" />);
    expect(consent.text()).toContain('Step 6 of 6');
    await consent.unmount();
  } finally {
    delete process.env.REACT_APP_CONTRACT_ENABLED;
  }
});
