import React, { act } from 'react';
import { renderScreen } from './testRender';
import Registration from './Registration';
import { VERIFY_EMAIL_SENDER } from '../data/authCopy';

const mockCalls = [];
let mockCreateError = null;
// Not `virtual`: callables.js is on disk, and a virtual mock is keyed by the
// extension-less path - a suite that loaded the real Registration.js earlier
// in the same jest worker (PortalRoutes) left `callables.js` in the shared
// resolver cache, so the mock was skipped and createFamily ran for real.
jest.mock('../hooks/callables', () => ({
  callCreateFamily: async (payload) => {
    mockCalls.push(['createFamily', payload]);
    if (mockCreateError) throw mockCreateError;
    return { householdId: 'h1', athleteIds: ['a1'] };
  },
  callAddAthletes: async (payload) => { mockCalls.push(['addAthletes', payload]); return { householdId: 'h1', athleteIds: ['a2'] }; },
  callCreateCheckoutSession: async () => ({ url: 'https://checkout.stripe.test/x' }),
})); // not `virtual`: see PayButton.test.js
jest.mock('./RegistrationSuccess', () => ({ __esModule: true, default: ({ result, onFinish }) => <button type="button" onClick={() => onFinish('/portal/family')}>SUCCESS {result.athleteIds.join(',')}</button> }));

// These cover the 6-step layout, contract ON; Registration.off.test.js covers it hidden.
beforeEach(() => { mockCalls.length = 0; mockCreateError = null; process.env.REACT_APP_CONTRACT_ENABLED = 'true'; });
afterEach(() => { delete process.env.REACT_APP_CONTRACT_ENABLED; });

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
  await r.fill('Emergency contact name', ' Uncle Bo ');
  await r.fill('Emergency contact mobile', '(612) 555-0100');
  await r.fill('Relationship to athlete', 'Uncle');
  await r.click('Continue');
  await r.click('12 tokens');
  await r.click('Continue');
  await r.click('Not yet for Jordan');
  await r.click('Continue');
  await r.fill('Type your full legal name', 'Dana Whitfield');
}

test('parent sign-up calls createFamily with the contract payload, shows success, refreshes only on leaving it', async () => {
  const refreshed = [];
  const finished = [];
  const r = await renderScreen(
    <Registration bare mode="signup" account={{ email: 'dana@email.com', emailVerified: false }} onRefresh={async () => refreshed.push(1)} onFinish={(p) => finished.push(p)} />
  );
  expect(r.text()).toContain('Step 1 of 6');
  await fillParentToConsent(r);
  await r.click('Sign and submit');
  expect(mockCalls[0][0]).toBe('createFamily');
  expect(mockCalls[0][1]).toMatchObject({
    mode: 'parent',
    contact: { name: 'Dana Whitfield', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
    athletes: [{ name: 'Jordan', dob: '2012-06-17', packageId: 't-12', handicap: 12, loginEmail: null, contractMinutes: null }],
    emergencyContact: { name: 'Uncle Bo', phone: '(612) 555-0100', relationship: 'Uncle' },
    signatureName: 'Dana Whitfield',
  });
  expect(mockCalls[0][1].athletes[0]).not.toHaveProperty('contractPicked');
  // The receipt renders BEFORE provisioned flips: RegistrationRoute would
  // otherwise redirect and unmount it (review 2026-09-28).
  expect(r.text()).toContain('SUCCESS a1');
  expect(refreshed).toHaveLength(0);
  await r.click('SUCCESS a1');
  expect(refreshed).toHaveLength(1);
  expect(finished).toEqual(['/portal/family']);
  await r.unmount();
});

test('a new login shows the verification note on step 1 only', async () => {
  const r = await renderScreen(
    <Registration bare mode="signup" account={{ uid: 'u-note', email: 'dana@email.com', emailVerified: false }} verifySent={{ email: 'dana@email.com', mailed: true }} />
  );
  expect(r.text()).toContain('Verification sent');
  expect(r.text()).toContain(`We sent a link to dana@email.com from ${VERIFY_EMAIL_SENDER} (check Spam`);
  await r.click('Parent or guardian');
  await r.click('Continue');
  expect(r.text()).not.toContain('Verification sent');
  await r.unmount();
  window.sessionStorage.clear();
});

test("another account never sees a note left in history by the last sign-up", async () => {
  const r = await renderScreen(<Registration bare mode="signup" account={{ email: 'other@email.com' }} verifySent={{ email: 'dana@email.com', mailed: true }} />);
  expect(r.text()).not.toContain('Verification sent');
  expect(r.text()).not.toContain('dana@email.com');
  await r.unmount();
});

test('an unsent verification says so on the form', async () => {
  const r = await renderScreen(<Registration bare mode="signup" account={{ email: 'dana@email.com' }} verifySent={{ email: 'dana@email.com', mailed: false }} />);
  expect(r.text()).toContain('Login created');
  expect(r.text()).toContain('tap Resend on the verify card');
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
  expect(second.text()).toContain('Step 2 of 6');
  expect(second.container.querySelector('[aria-label="Your name"]').value).toBe('Dana Whitfield');
  await second.unmount();
  // Another login on the same browser never sees it.
  const other = await renderScreen(<Registration bare mode="signup" account={{ uid: 'u-other', email: 'x@email.com' }} />);
  expect(other.text()).toContain('Step 1 of 6');
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
  await third.click('Not yet for Jordan');
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
  expect(r.text()).toContain('Step 2 of 6');
  expect(r.text()).toContain('A mobile number is required.');
  await r.fill('Mobile', '(612) 555-0148');
  await r.click('Continue');
  await r.fill('Athlete name', 'Jordan');
  await r.fill('Date of birth', '2031-01-01');
  await r.click('Continue');
  expect(r.text()).toContain('Step 3 of 6');
  expect(r.text()).toContain('That date is in the future - check the year.');
  expect(r.text()).not.toContain('Age -');
  await r.unmount();
});

test('each step opens at its top, and an invalid Continue says so and scrolls to the first error', async () => {
  const scrolled = [];
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function scrollIntoView(opts) { scrolled.push([this, opts]); };
  try {
    const r = await renderScreen(<Registration bare mode="signup" account={{ email: 'dana@email.com' }} />);
    const scroller = [...r.container.querySelectorAll('div')].find((d) => d.style.overflowY === 'auto');
    Object.defineProperty(scroller, 'scrollTop', { value: 480, writable: true, configurable: true });
    await r.click('Continue'); // nothing picked on the who step
    expect(r.text()).toContain('Choose one above to continue.');
    await r.click('Parent or guardian');
    expect(r.text()).not.toContain('Choose one above to continue.');
    await r.click('Continue');
    expect(r.text()).toContain('Step 2 of 6');
    expect(scroller.scrollTop).toBe(0);
    await r.fill('Your name', 'Dana Whitfield');
    await r.click('Continue'); // no phone yet
    expect(r.text()).toContain("Something above needs fixing - it's marked in red.");
    const [el, opts] = scrolled[scrolled.length - 1];
    expect(el.hasAttribute('data-field-error')).toBe(true);
    expect(el.textContent).toContain('A mobile number is required.');
    expect(opts).toEqual({ block: 'center' });
    await r.fill('Mobile', '(612) 555-0148');
    expect(r.text()).not.toContain('Something above needs fixing');
    await r.unmount();
  } finally {
    Element.prototype.scrollIntoView = original;
  }
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
  expect(r.text()).toContain('Step 4 of 6');
  expect(r.button('Single token').getAttribute('aria-pressed')).toBe('false');
  await r.click('Continue');
  expect(r.text()).toContain('Step 4 of 6');
  expect(r.text()).toContain('Pick a package for Jordan to continue.');
  await r.click('6 tokens');
  await r.click('Continue');
  expect(r.text()).toContain('Step 5 of 6');
  await r.unmount();
  window.sessionStorage.clear();
});

/** A v1 draft as the pre-contract-step form saved it (string emergency contact, no contractPicked). */
function oldDraft(over = {}, athlete = {}) {
  return {
    mode: 'parent',
    contact: { name: 'Dana Whitfield', email: 'dana@email.com', phone: '(612) 555-0148', relationship: 'Mother' },
    athletes: [{ key: 'k1', name: 'Jordan', dob: '2012-06-17', handicap: '', ownLogin: false, loginEmail: '', packageId: 't-12', contractMinutes: null, ...athlete }],
    emergencyContact: '', medical: '',
    consents: { dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: false },
    signatureName: 'Dana Whitfield',
    ...over,
  };
}

test('the contract is its own step: explained, per athlete, and it needs an answer', async () => {
  window.sessionStorage.clear();
  const account = { uid: 'u-contract', email: 'dana@email.com' };
  window.sessionStorage.setItem('ryp.signupDraft.signup.u-contract', JSON.stringify({ v: 1, step: 3, form: oldDraft() }));
  const r = await renderScreen(<Registration bare mode="signup" account={account} onFinish={() => {}} />);
  expect(r.text()).not.toContain('Commitment Contract');
  await r.click('Continue');
  expect(r.text()).toContain('Step 5 of 6');
  expect(r.text()).toContain('Commitment Contract');
  expect(r.text()).toContain("You shouldn't have to nag about practice.");
  await r.click('Continue');
  expect(r.text()).toContain('Step 5 of 6');
  expect(r.container.querySelector('[data-field-error]').textContent).toBe('Pick a daily goal for Jordan, or tap Not yet.');
  await r.click('45 min a day for Jordan');
  await r.click('Continue');
  expect(r.text()).toContain('Step 6 of 6');
  await r.click('Sign and submit');
  // The draft predates the facility add-on: it restores unticked and sends false.
  expect(mockCalls[0][1].athletes[0]).toEqual({ name: 'Jordan', dob: '2012-06-17', packageId: 't-12', contractMinutes: 45, handicap: null, loginEmail: null, facilityRequested: false });
  await r.unmount();
  window.sessionStorage.clear();
});

test('a draft saved on the old consent step reopens on the contract step, signature kept; a 45 already chosen goes straight through', async () => {
  window.sessionStorage.clear();
  const account = { uid: 'u-old4', email: 'dana@email.com' };
  window.sessionStorage.setItem('ryp.signupDraft.signup.u-old4', JSON.stringify({ v: 1, step: 4, form: oldDraft() }));
  const r = await renderScreen(<Registration bare mode="signup" account={account} />);
  expect(r.text()).toContain('Step 5 of 6');
  await r.click('Not yet for Jordan');
  await r.click('Continue');
  expect(r.container.querySelector('[aria-label="Type your full legal name"]').value).toBe('Dana Whitfield');
  await r.unmount();
  window.sessionStorage.setItem('ryp.signupDraft.signup.u-old4', JSON.stringify({ v: 1, step: 4, form: oldDraft({}, { contractMinutes: 45 }) }));
  const picked = await renderScreen(<Registration bare mode="signup" account={account} />);
  expect(picked.button('45 min a day for Jordan').getAttribute('aria-checked')).toBe('true');
  await picked.click('Continue');
  expect(picked.text()).toContain('Step 6 of 6');
  await picked.unmount();
  window.sessionStorage.clear();
});

test('emergency contact: a name without a mobile blocks Continue; an old one-string draft restores into the name', async () => {
  window.sessionStorage.clear();
  const account = { uid: 'u-ec', email: 'dana@email.com' };
  window.sessionStorage.setItem('ryp.signupDraft.signup.u-ec', JSON.stringify({ v: 1, step: 2, form: oldDraft({ emergencyContact: 'Uncle Bo 555' }) }));
  const r = await renderScreen(<Registration bare mode="signup" account={account} />);
  expect(r.text()).toContain('Step 3 of 6');
  expect(r.container.querySelector('[aria-label="Emergency contact name"]').value).toBe('Uncle Bo 555');
  await r.click('Continue');
  expect(r.text()).toContain('Step 3 of 6');
  expect(r.text()).toContain("Something above needs fixing - it's marked in red.");
  expect(r.text()).toContain('Add a mobile number we can call.');
  await r.fill('Emergency contact mobile', '(612) 555-0100');
  await r.click('Continue');
  expect(r.text()).toContain('Step 4 of 6');
  await r.unmount();
  window.sessionStorage.clear();
});

test('an old one-string contact restored past the athletes step sends the family back there, not into a refusal', async () => {
  window.sessionStorage.clear();
  const account = { uid: 'u-ec5', email: 'dana@email.com' };
  const form = oldDraft({ emergencyContact: 'Uncle Bo 555' }, { contractMinutes: 20 });
  window.sessionStorage.setItem('ryp.signupDraft.signup.u-ec5', JSON.stringify({ v: 1, step: 5, form }));
  const r = await renderScreen(<Registration bare mode="signup" account={account} />);
  await r.click('Sign and submit');
  expect(mockCalls).toHaveLength(0);
  expect(r.text()).toContain('Step 3 of 6');
  expect(r.text()).toContain('Add a mobile number we can call.');
  await r.unmount();
  window.sessionStorage.clear();
});

test('an invited child refused at submit (invite-open) goes to the verify screen, draft dropped', async () => {
  window.sessionStorage.clear();
  const finished = [];
  const account = { uid: 'u-kid', email: 'dana@email.com' };
  const r = await renderScreen(<Registration bare mode="signup" account={account} onRefresh={async () => {}} onFinish={(p) => finished.push(p)} />);
  await fillParentToConsent(r);
  mockCreateError = Object.assign(new Error('Your parent already enrolled you - sign in with this email and tap Check again.'), { reason: 'invite-open' });
  await r.click('Sign and submit');
  expect(finished).toEqual(['/portal/not-provisioned']);
  expect(window.sessionStorage.getItem('ryp.signupDraft.signup.u-kid')).toBeNull();
  await r.unmount();
});

test('any other refusal at submit still shows its message on the form', async () => {
  const finished = [];
  const r = await renderScreen(<Registration bare mode="signup" account={{ email: 'dana@email.com' }} onFinish={(p) => finished.push(p)} />);
  await fillParentToConsent(r);
  mockCreateError = Object.assign(new Error('That email is already on another athlete.'), { reason: 'child-email-duplicate' });
  await r.click('Sign and submit');
  expect(finished).toEqual([]);
  expect(r.text()).toContain('That email is already on another athlete.');
  expect(r.button('Sign and submit')).not.toBeNull();
  await r.unmount();
});

test('link mode skips to athletes and calls addAthletes', async () => {
  const r = await renderScreen(<Registration bare mode="link" account={{ email: 'dana@email.com' }} />);
  expect(r.text()).toContain('Step 1 of 3');
  expect(r.text()).toContain('Leave blank to use the contact from your sign-up.');
  await r.fill('Athlete name', 'Reese');
  await r.fill('Date of birth', '2014-03-02');
  await r.click('Continue');
  await r.click('6 tokens');
  expect(r.button('Add athlete')).toBeNull();
  await r.click('Continue');
  expect(r.text()).toContain('Step 3 of 3');
  await r.click('Not yet for Reese');
  await r.click('Add athlete');
  expect(mockCalls[0][0]).toBe('addAthletes');
  expect(mockCalls[0][1]).toEqual({
    athletes: [{ name: 'Reese', dob: '2014-03-02', packageId: 't-6', contractMinutes: null, handicap: null, loginEmail: null, facilityRequested: false }],
    emergencyContact: null, medical: null,
  });
  await r.unmount();
});

test('link mode: the facility add-on ticked under the packages is sent; there is no consent step to ask for the waiver', async () => {
  const r = await renderScreen(<Registration bare mode="link" account={{ email: 'dana@email.com' }} />);
  await r.fill('Athlete name', 'Reese');
  await r.fill('Date of birth', '2014-03-02');
  await r.click('Continue');
  await r.click('6 tokens');
  await r.click('Add 24/7 facility access for Reese');
  await r.click('Continue');
  await r.click('Not yet for Reese');
  await r.click('Add athlete');
  expect(mockCalls[0][0]).toBe('addAthletes');
  expect(mockCalls[0][1].athletes[0]).toMatchObject({ name: 'Reese', packageId: 't-6', facilityRequested: true });
  await r.unmount();
});

describe('facility add-on at sign-up (owner request, Mike 2026-09-30)', () => {
  const WAIVER_ERROR = 'Tick the facility access waiver to keep the add-on, or untick facility access on the package step.';

  async function toPackageStep(r) {
    await r.click('Parent or guardian');
    await r.click('Continue');
    await r.fill('Your name', 'Dana Whitfield');
    await r.fill('Mobile', '(612) 555-0148');
    await r.click('Continue');
    await r.fill('Athlete name', 'Jordan');
    await r.fill('Date of birth', '2012-06-17');
    await r.click('Continue');
  }

  test('ticked: the waiver turns required and blocks submit until ticked; the payload carries both', async () => {
    window.sessionStorage.clear();
    const r = await renderScreen(<Registration bare mode="signup" account={{ email: 'dana@email.com' }} onRefresh={async () => {}} />);
    await toPackageStep(r);
    await r.click('12 tokens');
    await r.click('Add 24/7 facility access for Jordan');
    await r.click('Continue');
    await r.click('Not yet for Jordan');
    await r.click('Continue');
    expect(r.text()).toContain('Needed for the facility access you picked');
    await r.fill('Type your full legal name', 'Dana Whitfield');
    await r.click('Sign and submit');
    expect(mockCalls).toHaveLength(0);
    expect(r.text()).toContain('Step 6 of 6');
    expect(r.container.querySelector('[data-field-error]').textContent).toBe(WAIVER_ERROR);
    expect(r.text()).toContain("Something above needs fixing - it's marked in red.");
    await r.click('Facility access waiver');
    expect(r.text()).not.toContain(WAIVER_ERROR);
    await r.click('Sign and submit');
    expect(mockCalls[0][0]).toBe('createFamily');
    expect(mockCalls[0][1].athletes[0]).toMatchObject({ packageId: 't-12', facilityRequested: true });
    expect(mockCalls[0][1].consents).toEqual({ dataCollection: true, videoCapture: true, mediaRelease: false, facilityAccess: true });
    await r.unmount();
    window.sessionStorage.clear();
  });

  test('unticking on the package step makes the waiver optional again', async () => {
    window.sessionStorage.clear();
    const r = await renderScreen(<Registration bare mode="signup" account={{ email: 'dana@email.com' }} onRefresh={async () => {}} />);
    await toPackageStep(r);
    await r.click('12 tokens');
    await r.click('Add 24/7 facility access for Jordan');
    await r.click('Continue');
    await r.click('Not yet for Jordan');
    await r.click('Continue');
    await r.fill('Type your full legal name', 'Dana Whitfield');
    await r.click('Sign and submit');
    expect(r.text()).toContain(WAIVER_ERROR);
    await r.click('‹ Back');
    await r.click('‹ Back');
    await r.click('Add 24/7 facility access for Jordan');
    await r.click('Continue');
    await r.click('Continue');
    expect(r.text()).toContain('Optional - needed only for the facility access add-on');
    await r.click('Sign and submit');
    expect(mockCalls[0][1].athletes[0].facilityRequested).toBe(false);
    expect(mockCalls[0][1].consents.facilityAccess).toBe(false);
    await r.unmount();
    window.sessionStorage.clear();
  });

  test('a tick left behind on a switch to Elite neither blocks the consent step nor reaches the payload', async () => {
    window.sessionStorage.clear();
    const r = await renderScreen(<Registration bare mode="signup" account={{ email: 'dana@email.com' }} onRefresh={async () => {}} />);
    await toPackageStep(r);
    await r.click('12 tokens');
    await r.click('Add 24/7 facility access for Jordan');
    await r.click('Elite');
    expect(r.text()).toContain('24/7 facility access · Included with Elite');
    await r.click('Continue');
    await r.click('Not yet for Jordan');
    await r.click('Continue');
    expect(r.text()).not.toContain('Needed for the facility access you picked');
    await r.fill('Type your full legal name', 'Dana Whitfield');
    await r.click('Sign and submit');
    expect(mockCalls[0][1].athletes[0]).toMatchObject({ packageId: 'elite', facilityRequested: false });
    await r.unmount();
    window.sessionStorage.clear();
  });

  test('a reload keeps the tick (the draft carries it)', async () => {
    window.sessionStorage.clear();
    const account = { uid: 'u-fac', email: 'dana@email.com' };
    const first = await renderScreen(<Registration bare mode="signup" account={account} />);
    await toPackageStep(first);
    await first.click('16 tokens');
    await first.click('Add 24/7 facility access for Jordan');
    await first.unmount();
    const second = await renderScreen(<Registration bare mode="signup" account={account} />);
    expect(second.text()).toContain('Step 4 of 6');
    expect(second.button('Add 24/7 facility access for Jordan').getAttribute('aria-checked')).toBe('true');
    await second.unmount();
    window.sessionStorage.clear();
  });
});

test('link mode sends the contact the parent typed', async () => {
  const r = await renderScreen(<Registration bare mode="link" account={{ email: 'dana@email.com' }} />);
  await r.fill('Athlete name', 'Reese');
  await r.fill('Date of birth', '2014-03-02');
  await r.fill('Emergency contact name', 'Gran');
  await r.fill('Emergency contact mobile', '(612) 555-0122');
  await r.click('Continue');
  await r.click('6 tokens');
  await r.click('Continue');
  await r.click('20 min a day for Reese');
  await r.click('Add athlete');
  expect(mockCalls[0][1]).toMatchObject({
    athletes: [{ name: 'Reese', contractMinutes: 20 }],
    emergencyContact: { name: 'Gran', phone: '(612) 555-0122', relationship: null },
  });
  await r.unmount();
});
