import React, { act } from 'react';
import { renderScreen } from './testRender';

let mockFlow;
jest.mock('../hooks/mentalConsent', () => ({ useConsentFlow: () => mockFlow }));
// The Done screen shows today's academy date (the MentalContract.test.js precedent).
jest.mock('../data/calendar', () => ({ ...jest.requireActual('../data/calendar'), academyDateISO: () => '2026-11-05' }));
import MentalConsentFlow from './MentalConsentFlow';

const AVA = { id: 'ava', name: 'Ava Test', dob: '2012-05-14', householdId: 'hh' };
const MAX = { id: 'max', name: 'Max Test', dob: '2007-03-02', householdId: 'hh' };

/** A useConsentFlow result: `over` sets the data fields (plan Task 10's payload). */
function flow(over = {}) {
  return {
    data: {
      viewer: 'parent', uid: 'u-dana', athlete: AVA, signerName: 'Dana Test', signerEmail: 'dana@example.com', guardianName: 'Dana Test',
      emergencyContact: null, selfManaged: false, record: null, status: 'unsigned', branch: 'minor', drivingAsked: false, under13: false,
      draft: null, draftState: null, nextAthleteId: null, nextName: null, listCount: 1, ...over,
    },
    loading: false,
    error: null,
    sign: jest.fn(async () => ({ status: 'signed' })),
    saveDraft: jest.fn(),
    dropDraft: jest.fn(),
    change: jest.fn(async () => {}),
  };
}

// The agreement's end sentinel: the test decides when it scrolls into view.
let mockSeen = null;
beforeEach(() => {
  mockSeen = null;
  window.IntersectionObserver = class {
    constructor(cb) { mockSeen = cb; }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(() => {
  delete window.IntersectionObserver;
});
const reach = () => act(() => { mockSeen([{ isIntersecting: true }]); });
const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);

/** Steps 1-3 of a minor's flow at 14: same as parent, the agreement read, Option B and recording yes. */
async function throughChoices(r) {
  await r.click('Same as parent'); await r.click('Continue');
  reach(); await r.click('Continue');
  await r.click('Eden Prairie conference room (Option B)'); await r.click('I/We consent'); await r.click('Continue');
}

test('minor: five steps, nothing saved until Done, then the Done copy', async () => {
  mockFlow = flow({ branch: 'minor', athlete: AVA, signerName: 'Dana Test', signerEmail: 'dana@example.com' });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" />);
  expect(r.text()).toContain('Step 1 of 5');
  expect(r.text()).toContain('Dana Test signs as Ava\'s parent, then Ava agrees');
  expect(r.text()).toContain('dana@example.com');
  await r.click('Same as parent'); await r.click('Continue');
  expect(r.button('Scroll to the end to continue').disabled).toBe(true);
  reach(); await r.click('Continue');
  expect(r.text()).not.toContain('My athlete has my permission to drive'); // 14 years old
  await r.click('Eden Prairie conference room (Option B)'); await r.click('I/We consent'); await r.click('Continue');
  expect(r.text()).toContain('Typing your name signs this agreement for Ava, dated today.');
  await r.click('I have read and agree to all of the above'); await r.fill('Full legal name', 'Dana Test'); await r.click('Continue');
  expect(r.text()).toContain('Hand the phone to Ava — your answers are locked');
  await r.click('Hand over'); await r.click('I agree'); await r.click('I agree to take part in mental performance coaching');
  await r.fill("Ava's name", 'Ava');
  expect(mockFlow.sign).not.toHaveBeenCalled();
  await r.click('Done');
  expect(mockFlow.sign).toHaveBeenCalledTimes(1);
  expect(r.text()).toContain("Signed · Nov 5. Yannick will see this before Ava's session. You can change the recording or location choice any time from Ava's card.");
  await r.unmount();
});

test('Back from step 1 leaves the consent pages in a one-athlete household', async () => {
  mockFlow = flow({ branch: 'minor', viewer: 'parent', listCount: 1 });
  const onBack = jest.fn();
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" onBack={onBack} />);
  await r.click('Back');
  expect(onBack).toHaveBeenCalledWith({ to: '/portal/family', state: null });
  await r.unmount();
});

test('16+: the driving question is asked and required', async () => {
  mockFlow = flow({ athlete: { ...AVA, dob: '2010-01-01' }, drivingAsked: true });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" />);
  await r.click('Same as parent'); await r.click('Continue');
  reach(); await r.click('Continue');
  expect(r.text()).toContain('My athlete has my permission to drive');
  await r.click('Eden Prairie conference room (Option B)'); await r.click('I/We consent');
  expect(r.button('Continue').disabled).toBe(true);
  await r.click('No');
  expect(r.button('Continue').disabled).toBe(false);
  await r.click('Continue');
  expect(r.text()).toContain('Step 4 of 5');
  await r.unmount();
});

test("'Ava isn't here' keeps the parent's part on the device", async () => {
  mockFlow = flow({ listCount: 2 });
  const onDone = jest.fn();
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" onDone={onDone} />);
  await throughChoices(r);
  await r.click('I have read and agree to all of the above'); await r.fill('Full legal name', 'Dana Test'); await r.click('Continue');
  await r.click("Ava isn't here");
  expect(mockFlow.saveDraft).toHaveBeenCalledTimes(1);
  expect(mockFlow.saveDraft.mock.calls[0][0]).toMatchObject({ choices: { location: 'B', audio: true }, signature: { name: 'Dana Test' } });
  expect(mockFlow.sign).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith({ to: '/portal/consent/mental', state: { from: 'flow' } });
  await r.unmount();
});

test('the hand-over locks the answers; giving the phone back re-shows step 4 unticked', async () => {
  mockFlow = flow();
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" />);
  await throughChoices(r);
  await r.click('I have read and agree to all of the above'); await r.fill('Full legal name', 'Dana Test'); await r.click('Continue');
  expect(r.button('Back')).toBeNull();
  await r.click('Give the phone back to Dana');
  expect(r.text()).toContain('Step 4 of 5');
  expect(field(r, 'I have read and agree to all of the above').getAttribute('aria-checked')).toBe('false');
  expect(field(r, 'Full legal name').value).toBe('Dana Test');
  await r.unmount();
});

test('already signed by the other parent: the Done screen says so', async () => {
  mockFlow = flow();
  mockFlow.sign = jest.fn(async () => ({ status: 'already', record: { signer: { name: 'Dana Whitfield' }, signedAt: new Date('2026-11-03T17:00:00Z') } }));
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" />);
  await throughChoices(r);
  await r.click('I have read and agree to all of the above'); await r.fill('Full legal name', 'Dana Test'); await r.click('Continue');
  await r.click('Hand over'); await r.click('I do not agree'); await r.click('I agree to take part in mental performance coaching');
  await r.fill("Ava's name", 'Ava');
  await r.click('Done');
  expect(r.text()).toContain('Already signed by Dana Whitfield on Nov 3');
  expect(r.text()).not.toContain('Signed · Nov 5');
  await r.unmount();
});

test('a refused save keeps the form and says so', async () => {
  mockFlow = flow();
  mockFlow.sign = jest.fn(async () => { throw new Error('permission-denied'); });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" />);
  await throughChoices(r);
  await r.click('I have read and agree to all of the above'); await r.fill('Full legal name', 'Dana Test'); await r.click('Continue');
  await r.click('Hand over'); await r.click('I agree'); await r.click('I agree to take part in mental performance coaching');
  await r.fill("Ava's name", 'Ava');
  await r.click('Done');
  expect(r.text()).toContain("This couldn't be saved. Check your connection and try again.");
  expect(field(r, "Ava's name").value).toBe('Ava');
  await r.unmount();
});

test('resumed draft starts at the signature with the name filled, unticked', async () => {
  const draft = { v: 1, version: '2026-10-30', savedAt: 0, choices: { location: 'B', audio: true, driving: null, emergencyContact: { name: null, phone: null, relationship: null } }, parentName: 'Dana Test' };
  mockFlow = flow({ draft, draftState: 'fresh' });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" />);
  expect(r.text()).toContain('Step 4 of 5');
  expect(field(r, 'Full legal name').value).toBe('Dana Test');
  expect(field(r, 'I have read and agree to all of the above').getAttribute('aria-checked')).toBe('false');
  await r.unmount();
});

test('no dob, an adult on their own login elsewhere, a minor login', async () => {
  const cases = [
    [flow({ branch: 'no-dob', status: 'no-dob', athlete: { ...AVA, dob: null } }), "Add Ava's date of birth first"],
    [flow({ branch: 'adult-elsewhere', athlete: MAX }), 'Max signs this on their own login'],
    [flow({ branch: 'minor-login', viewer: 'athlete' }), 'Your parent signs this'],
  ];
  for (const [f, copy] of cases) {
    mockFlow = f;
    const r = await renderScreen(<MentalConsentFlow bare athleteId="x" />);
    expect(r.text()).toContain(copy);
    expect(r.button('Continue')).toBeNull();
    expect(r.button('Back')).not.toBeNull();
    await r.unmount();
  }
});

test("adult on the parent's phone: the hand-over comes before the agreement; it saves at the signature", async () => {
  mockFlow = flow({ branch: 'adult-handover', athlete: MAX, guardianName: 'Dana Test' });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="max" />);
  expect(r.text()).toContain('Max is 18 or older and signs for themself');
  expect(r.text()).toContain('Step 1 of 4');
  expect(r.button('Same as parent')).toBeNull();
  expect(r.button('Add an emergency contact name and mobile number.').disabled).toBe(true);
  await r.fill('Emergency contact name', 'Lee Test'); await r.fill('Emergency contact mobile', 'test-phone');
  await r.click('Continue');
  expect(r.text()).toContain('Hand the phone to Max');
  await r.click('Hand over');
  reach(); await r.click('Continue');
  await r.click('Online (Option C)'); await r.click('I consent'); await r.click('I give permission');
  expect(field(r, 'Parent/guardian name').value).toBe('Dana Test');
  await r.click('Continue');
  expect(r.text()).toContain('Step 4 of 4');
  await r.click('I confirm I am 18 or older and agree'); await r.fill('Full legal name', 'Max Test');
  expect(mockFlow.sign).not.toHaveBeenCalled();
  await r.click('Done');
  expect(mockFlow.sign).toHaveBeenCalledTimes(1);
  expect(mockFlow.sign.mock.calls[0][0]).toMatchObject({ branch: 'adult-handover', signature: { agreed: true, name: 'Max Test' }, choices: { location: 'C', audio: true, parentSessions: true } });
  expect(r.text()).toContain('Signed · Nov 5.');
  await r.unmount();
});

test('under 13: the read-aloud tick is offered', async () => {
  mockFlow = flow({ athlete: { id: 'nico', name: 'Nico Test', dob: '2016-04-01', householdId: 'hh' }, under13: true });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="nico" />);
  await r.click('Same as parent'); await r.click('Continue');
  reach(); await r.click('Continue');
  await r.click('Eden Prairie conference room (Option B)'); await r.click('I/We consent'); await r.click('Continue');
  await r.click('I have read and agree to all of the above'); await r.fill('Full legal name', 'Dana Test'); await r.click('Continue');
  await r.click('Hand over');
  expect(r.button('I read this aloud to Nico')).not.toBeNull();
  await r.fill("Nico's name", 'Bob');
  expect(r.text()).toContain("That doesn't look like Nico's name — check it's Nico typing.");
  await r.unmount();
});

test('who step: a half-filled emergency contact keeps Continue disabled with the validator copy', async () => {
  mockFlow = flow();
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" />);
  await r.fill('Emergency contact name', 'Lee');
  expect(r.button('Add a mobile number we can call.').disabled).toBe(true);
  await r.unmount();
});

test('Done offers the next athlete to sign for', async () => {
  mockFlow = flow({ nextAthleteId: 'reese', nextName: 'Reese', listCount: 2 });
  const onDone = jest.fn();
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" onDone={onDone} />);
  await throughChoices(r);
  await r.click('I have read and agree to all of the above'); await r.fill('Full legal name', 'Dana Test'); await r.click('Continue');
  await r.click('Hand over'); await r.click('I agree'); await r.click('I agree to take part in mental performance coaching');
  await r.fill("Ava's name", 'Ava'); await r.click('Done');
  await r.click('Next: sign for Reese');
  expect(onDone).toHaveBeenCalledWith({ to: '/portal/consent/mental/reese', state: null });
  await r.click('Done');
  expect(onDone).toHaveBeenLastCalledWith({ to: '/portal/consent/mental', state: { from: 'flow' } });
  await r.unmount();
});

/* ---------------------------------------------- Change choices (Task 12) -- */

const minorRecord = {
  id: 'ava', athleteId: 'ava', adult: false, adultSignature: null, method: 'portal', version: '2026-10-30', signedAt: new Date('2026-10-30T17:00:00Z'),
  signer: { role: 'parent', name: 'Dana Test' }, assent: { name: 'Ava', audio: false, at: new Date('2026-10-30T17:00:00Z'), readAloud: false, withdrawnBy: null },
  choices: { location: 'B', audio: true, driving: null, emergencyContact: { name: null, phone: null, relationship: null }, parentSessions: null, parentName: null },
  adultConfirm: null, countersign: null, history: [],
};
const adultRecord = {
  id: 'max', athleteId: 'max', adult: true, adultSignature: null, method: 'portal', version: '2026-10-30', signedAt: new Date('2026-10-30T17:00:00Z'),
  signer: { role: 'athlete', name: 'Max Test' }, assent: null,
  choices: { location: 'C', audio: true, driving: null, emergencyContact: { name: 'Lee Test', phone: 'test-phone', relationship: 'aunt' }, parentSessions: true, parentName: 'Dana Test' },
  adultConfirm: null, countersign: null, history: [],
};

test("change, minor: Save sends the choices only; the history is the hook's job", async () => {
  mockFlow = flow({ status: 'signed', record: minorRecord, branch: 'minor' });
  const onDone = jest.fn();
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" change onDone={onDone} />);
  expect(r.text()).toContain('Change choices');
  expect(r.button('Eden Prairie conference room (Option B)').getAttribute('aria-pressed')).toBe('true');
  await r.click('Online (Option C)'); await r.click('Save');
  expect(mockFlow.change).toHaveBeenCalledWith({ choices: expect.objectContaining({ location: 'C' }) });
  expect(mockFlow.sign).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalledWith({ to: '/portal/family', state: null });
  await r.unmount();
});

test("change, minor: Ava's own answer needs the hand-over and her name", async () => {
  mockFlow = flow({ status: 'signed', record: minorRecord, branch: 'minor' });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" change />);
  await r.click("Change Ava's own answer");
  expect(r.text()).toContain('Hand the phone to Ava');
  expect(r.button('Online (Option C)')).toBeNull(); // the parent's answers are out of reach
  expect(r.button('Save').disabled).toBe(true);
  await r.click('I agree'); await r.fill("Ava's name", 'Ava'); await r.click('Save');
  expect(mockFlow.change).toHaveBeenCalledWith({ choices: expect.any(Object), assentAudio: true });
  await r.unmount();
});

test('change, adult: recording needs the typed confirmation; location alone does not', async () => {
  mockFlow = flow({ status: 'signed', record: adultRecord, branch: 'adult-handover', athlete: MAX });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="max" change />);
  expect(field(r, 'Max types their name to confirm')).toBeNull();
  await r.click('I do not consent');
  // Save waits for the typed name, and the pinned button says so (the field can sit below the fold).
  expect(r.button('Max types their name to confirm').disabled).toBe(true);
  await r.fill('Max types their name to confirm', 'Max Test');
  await r.click('Save');
  expect(mockFlow.change).toHaveBeenCalledWith({ choices: expect.objectContaining({ audio: false, parentSessions: true }), adultConfirmName: 'Max Test' });
  await r.unmount();

  mockFlow = flow({ status: 'signed', record: adultRecord, branch: 'adult-handover', athlete: MAX });
  const loc = await renderScreen(<MentalConsentFlow bare athleteId="max" change />);
  await loc.click('Academy quiet area (Option A)'); await loc.click('Save');
  expect(mockFlow.change).toHaveBeenCalledTimes(1);
  expect(mockFlow.change.mock.calls[0][0]).toEqual({ choices: expect.objectContaining({ location: 'A' }) });
  await loc.unmount();
});

test('change: a paper record with no location, and a driving answer now owed, say why Save waits; the hand-over waits too', async () => {
  const paper = { ...minorRecord, method: 'paper', choices: { ...minorRecord.choices, location: null } };
  mockFlow = flow({ status: 'signed', record: paper, branch: 'minor', drivingAsked: true, athlete: { ...AVA, dob: '2010-02-01' } });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" change />);
  expect(r.button('Choose a location').disabled).toBe(true);
  expect(r.button("Change Ava's own answer").disabled).toBe(true);
  await r.click('Online (Option C)');
  expect(r.button('Answer the driving question').disabled).toBe(true);
  await r.click('No');
  expect(r.button('Save').disabled).toBe(false);
  expect(r.button("Change Ava's own answer").disabled).toBe(false);
  await r.unmount();
});

test("change on an 18+ athlete's own login asks them to type their own name", async () => {
  mockFlow = flow({ viewer: 'athlete', status: 'signed', record: adultRecord, branch: 'adult', athlete: MAX, selfManaged: true });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="max" change />);
  await r.click('I do not consent');
  expect(field(r, 'Max types their name to confirm')).toBeNull();
  expect(r.button('Type your name to confirm').disabled).toBe(true);
  await r.fill('Type your name to confirm', 'Max Test'); await r.click('Save');
  expect(mockFlow.change).toHaveBeenCalledWith({ choices: expect.objectContaining({ audio: false }), adultConfirmName: 'Max Test' });
  await r.unmount();
});

test('screen readers: a one-answer question is a named radio group; a new step takes the focus; the step count is announced', async () => {
  mockFlow = flow({ branch: 'minor' });
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" />);
  expect(r.container.querySelector('[aria-live="polite"]').textContent).toBe('Step 1 of 5');
  await r.click('Same as parent'); await r.click('Continue');
  expect(document.activeElement.textContent).toBe('The agreement');
  reach(); await r.click('Continue');
  expect(r.container.querySelector('[aria-live="polite"]').textContent).toBe('Step 3 of 5');
  const group = r.container.querySelector('[role="radiogroup"][aria-label="Audio recording of athlete sessions"]');
  expect([...group.querySelectorAll('[role="radio"]')].map((b) => b.getAttribute('aria-label'))).toEqual(['I/We consent', 'I/We do not consent']);
  await r.unmount();
});

test("change: a refused save keeps the form; a claimed adult's parent cannot change anything", async () => {
  mockFlow = flow({ status: 'signed', record: minorRecord, branch: 'minor' });
  mockFlow.change = jest.fn(async () => { throw new Error('permission-denied'); });
  const onDone = jest.fn();
  const r = await renderScreen(<MentalConsentFlow bare athleteId="ava" change onDone={onDone} />);
  await r.click('Online (Option C)'); await r.click('Save');
  expect(r.text()).toContain("This couldn't be saved. Check your connection and try again.");
  expect(r.button('Online (Option C)').getAttribute('aria-pressed')).toBe('true');
  expect(onDone).not.toHaveBeenCalled();
  await r.unmount();

  mockFlow = flow({ status: 'signed', record: adultRecord, branch: 'adult-elsewhere', athlete: MAX });
  const claimed = await renderScreen(<MentalConsentFlow bare athleteId="max" change />);
  expect(claimed.button('Save')).toBeNull();
  expect(claimed.text()).toContain('Already signed by Max Test on Oct 30');
  await claimed.unmount();
});
