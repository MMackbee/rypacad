import React from 'react';
import { renderScreen } from './testRender';
import Registration from './Registration';

// Owner ruling 2026-09-30: the facility add-on is a FAMILY add-on - one tick
// for the whole sign-up, sent on one athlete. Registration.test.js keeps the
// single-athlete flow (the waiver, the reload, the switch to Elite); this
// file is the family of two, the per-athlete drafts and link mode.
const mockCalls = [];
let mockFamily = null;
jest.mock('../hooks/callables', () => ({
  callCreateFamily: async (payload) => { mockCalls.push(['createFamily', payload]); return { householdId: 'h1', athleteIds: ['a1', 'a2'] }; },
  callAddAthletes: async (payload) => { mockCalls.push(['addAthletes', payload]); return { householdId: 'h1', athleteIds: ['a2'] }; },
  callCreateCheckoutSession: async () => ({ url: 'https://checkout.stripe.test/x' }),
})); // not `virtual`: see PayButton.test.js
jest.mock('./RegistrationSuccess', () => ({ __esModule: true, default: ({ result }) => `SUCCESS ${result.athleteIds.join(',')}` }));
jest.mock('../hooks/live', () => ({
  ...jest.requireActual('../hooks/live'),
  __esModule: true,
  isLive: () => mockFamily !== null,
  fetchHouseholdAthletes: async () => mockFamily,
}));

const TICK = 'Add 24/7 family facility access';
const INCLUDED = '24/7 facility access · Included for your whole family with Elite';

beforeEach(() => { mockCalls.length = 0; mockFamily = null; process.env.REACT_APP_CONTRACT_ENABLED = 'true'; window.sessionStorage.clear(); });
afterEach(() => { delete process.env.REACT_APP_CONTRACT_ENABLED; window.sessionStorage.clear(); });

/** A v1 draft on the package step: Jordan on 12 tokens, Reese on 6. */
function twoAthletes(over = {}) {
  const athlete = (key, name, dob, packageId) => ({ key, name, dob, handicap: '', ownLogin: false, loginEmail: '', packageId, contractMinutes: null });
  return {
    mode: 'parent',
    contact: { name: 'Dana Whitfield', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
    athletes: [athlete('k1', 'Jordan', '2012-06-17', 't-12'), athlete('k2', 'Reese', '2014-03-02', 't-6')],
    emergencyContact: '', medical: '',
    consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false },
    signatureName: 'Dana Whitfield',
    ...over,
  };
}
async function onPackageStep(form) {
  window.sessionStorage.setItem('ryp.signupDraft.signup.u-two', JSON.stringify({ v: 1, step: 3, form }));
  return renderScreen(<Registration bare mode="signup" account={{ uid: 'u-two', email: 'dana@email.com' }} onRefresh={async () => {}} />);
}
async function toConsent(r) {
  await r.click('Continue');
  await r.click('Not yet for Jordan');
  await r.click('Not yet for Reese');
  await r.click('Continue');
}

test('two athletes: the tick is made once, from either tab, and sent on ONE athlete - the first on a token package', async () => {
  const r = await onPackageStep(twoAthletes());
  await r.click('Reese ✓');
  await r.click(TICK);
  await toConsent(r);
  expect(r.text()).toContain('Needed for the facility access you picked');
  await r.click('Facility access waiver');
  await r.click('Sign and submit');
  expect(mockCalls[0][0]).toBe('createFamily');
  expect(mockCalls[0][1].athletes.map((a) => [a.name, a.facilityRequested])).toEqual([['Jordan', true], ['Reese', false]]);
  expect(mockCalls[0][1].consents.facilityAccess).toBe(true);
  await r.unmount();
});

test('Elite on either athlete covers the family: the tick goes, the waiver stays optional, nobody carries a request', async () => {
  const r = await onPackageStep(twoAthletes({ facilityRequested: true }));
  expect(r.button(TICK).getAttribute('aria-checked')).toBe('true');
  await r.click('Reese ✓');
  await r.click('Elite');
  await r.click('Jordan ✓');
  expect(r.button(TICK)).toBeNull();
  expect(r.text()).toContain(INCLUDED);
  await toConsent(r);
  expect(r.text()).not.toContain('Needed for the facility access you picked');
  await r.click('Sign and submit');
  expect(mockCalls[0][1].athletes.map((a) => a.facilityRequested)).toEqual([false, false]);
  await r.unmount();
});

test('a draft saved by the per-athlete form restores the family tick when any athlete had one', async () => {
  const form = twoAthletes();
  form.athletes = [{ ...form.athletes[0], facilityRequested: false }, { ...form.athletes[1], facilityRequested: true }];
  const r = await onPackageStep(form);
  expect(r.button(TICK).getAttribute('aria-checked')).toBe('true');
  await toConsent(r);
  await r.click('Facility access waiver');
  await r.click('Sign and submit');
  // Sent on the first token athlete, whoever held the old tick.
  expect(mockCalls[0][1].athletes.map((a) => a.facilityRequested)).toEqual([true, false]);
  await r.unmount();
});

test('unticking a tick restored from a per-athlete draft stays unticked after the next reload', async () => {
  const form = twoAthletes();
  form.athletes = [form.athletes[0], { ...form.athletes[1], facilityRequested: true }];
  const first = await onPackageStep(form);
  await first.click(TICK);
  expect(first.button(TICK).getAttribute('aria-checked')).toBe('false');
  await first.unmount();
  const second = await renderScreen(<Registration bare mode="signup" account={{ uid: 'u-two', email: 'dana@email.com' }} />);
  expect(second.button(TICK).getAttribute('aria-checked')).toBe('false');
  await second.unmount();
});

describe('link mode: the family already there decides whether the tick is offered', () => {
  async function onLinkPackageStep() {
    const r = await renderScreen(<Registration bare mode="link" account={{ uid: 'u-dana', email: 'dana@email.com', householdId: 'h1' }} />);
    await r.flush();
    await r.fill('Athlete name', 'Nico');
    await r.fill('Date of birth', '2015-05-05');
    await r.click('Continue');
    await r.click('6 tokens');
    return r;
  }

  test('a family with a live Elite membership: included, no tick', async () => {
    mockFamily = [{ id: 'max', householdId: 'h1', packageId: 'elite', billing: { status: 'active' } }];
    const r = await onLinkPackageStep();
    expect(r.button(TICK)).toBeNull();
    expect(r.text()).toContain(INCLUDED);
    await r.unmount();
  });

  test('a family that already asked for or pays the add-on: not offered again', async () => {
    mockFamily = [{ id: 'reese', householdId: 'h1', packageId: 't-6', billing: { status: 'active' }, facilityBilling: { status: 'active' } }];
    const paid = await onLinkPackageStep();
    expect(paid.text()).not.toMatch(/facility access/i);
    await paid.unmount();
    window.sessionStorage.clear(); // the first render's draft would reopen on the package step
    mockFamily = [{ id: 'reese', householdId: 'h1', packageId: 't-6', billing: { status: 'pending' }, facilityRequested: true }];
    const asked = await onLinkPackageStep();
    expect(asked.text()).not.toMatch(/facility access/i);
    await asked.unmount();
  });

  test('a family with neither: the tick, sent on the new athlete', async () => {
    mockFamily = [{ id: 'reese', householdId: 'h1', packageId: 't-6', billing: { status: 'active' } }];
    const r = await onLinkPackageStep();
    await r.click(TICK);
    await r.click('Continue');
    await r.click('Not yet for Nico');
    await r.click('Add athlete');
    expect(mockCalls[0][0]).toBe('addAthletes');
    expect(mockCalls[0][1].athletes.map((a) => a.facilityRequested)).toEqual([true]);
    await r.unmount();
  });
});
