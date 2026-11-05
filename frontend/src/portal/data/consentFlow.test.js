/**
 * The consent flow's steps, the hand-over lock, the device draft and the
 * exit (plan Task 9). Pure: the screen drives flowReducer with useReducer.
 */
import {
  DRAFT_TTL_DAYS, assentFromFlow, canContinue, choicesFromFlow, clearDraft, consentExit, draftKey, draftState, flowReducer, initialFlow, nameMatches, progressLabel,
  readDraft, savesHere, writeDraft,
} from './consentFlow';

const minor = (o = {}) => initialFlow({ branch: 'minor', drivingAsked: false, under13: false, firstName: 'Ava', contact: null, parentName: 'Dana Test', ...o });
const adult = (o = {}) => initialFlow({ branch: 'adult', firstName: 'Max', ...o });
const go = (state, ...actions) => actions.reduce(flowReducer, state);
const set = (path, value) => ({ type: 'set', path, value });
const at = (state, step) => ({ ...state, step });
const draft = {
  v: 1, version: '2026-10-30', savedAt: 0,
  choices: { location: 'B', audio: true, driving: null, emergencyContact: { name: null, phone: null, relationship: null } }, parentName: 'Dana Test',
};
const day = 86400000;

test('the steps of each branch', () => {
  expect(minor().steps).toEqual(['who', 'agreement', 'choices', 'signature', 'handover', 'assent']);
  expect(initialFlow({ branch: 'adult' }).steps).toEqual(['who', 'agreement', 'choices', 'signature']);
  expect(initialFlow({ branch: 'adult-handover' }).steps).toEqual(['who', 'handover', 'agreement', 'choices', 'signature']);
  expect(minor()).toMatchObject({ step: 'who', locked: false, readToEnd: false, resumed: false, notice: null, firstName: 'Ava' });
});

test('progress: the hand-over shares its number with the step it hands into', () => {
  expect(progressLabel(minor())).toBe('Step 1 of 5');
  expect(progressLabel(at(minor(), 'handover'))).toBe('Step 5 of 5');
  expect(progressLabel(at(minor(), 'assent'))).toBe('Step 5 of 5');
  expect(progressLabel(at(initialFlow({ branch: 'adult-handover' }), 'signature'))).toBe('Step 4 of 4');
  expect(progressLabel(at(adult(), 'choices'))).toBe('Step 3 of 4');
});

test('who, minor: same as parent, or a whole emergency contact, or none', () => {
  expect(canContinue(go(minor(), set('contact.sameAsParent', true))).ok).toBe(true);
  expect(canContinue(minor()).ok).toBe(true); // all blank, not ticked: stored as same as parent
  expect(canContinue(go(minor(), set('contact.name', 'Lee')))).toEqual({ ok: false, reason: 'Add a mobile number we can call.' });
  expect(canContinue(go(minor(), set('contact.relationship', 'aunt')))).toEqual({ ok: false, reason: 'Add their name, or clear the other emergency fields.' });
});

test('who, adult: an emergency contact is required', () => {
  expect(canContinue(initialFlow({ branch: 'adult' }))).toEqual({ ok: false, reason: 'Add an emergency contact name and mobile number.' });
  expect(canContinue(go(initialFlow({ branch: 'adult' }), set('contact.name', 'Lee'), set('contact.phone', 'test-phone'))).ok).toBe(true);
  expect(adult({ contact: { name: 'Lee Test', phone: 'test-phone', relationship: null } }).contact)
    .toEqual({ name: 'Lee Test', phone: 'test-phone', relationship: '', sameAsParent: false });
});

test('agreement: read to the end first', () => {
  expect(canContinue(at(minor(), 'agreement'))).toEqual({ ok: false, reason: 'Scroll to the end to continue' });
  expect(canContinue(go(at(minor(), 'agreement'), { type: 'readToEnd' })).ok).toBe(true);
});

test('choices: location and recording; driving when asked; 18+: the parent-session permission and a name', () => {
  const c = at(minor(), 'choices');
  expect(canContinue(go(c, set('choices.location', 'B'))).ok).toBe(false);
  expect(canContinue(go(c, set('choices.location', 'B'), set('choices.audio', false))).ok).toBe(true);
  const d = at(minor({ drivingAsked: true }), 'choices');
  expect(canContinue(go(d, set('choices.location', 'B'), set('choices.audio', true))).ok).toBe(false);
  expect(canContinue(go(d, set('choices.location', 'B'), set('choices.audio', true), set('choices.driving', false))).ok).toBe(true);
  const a = go(at(adult(), 'choices'), set('choices.location', 'C'), set('choices.audio', true), set('choices.parentSessions', true));
  expect(canContinue(a).ok).toBe(false);
  expect(canContinue(go(a, set('choices.parentName', 'Dana'))).ok).toBe(true);
  expect(canContinue(go(at(adult(), 'choices'), set('choices.location', 'C'), set('choices.audio', true), set('choices.parentSessions', false))).ok).toBe(true);
});

test('the hand-over locks the parent\'s answers; unlocking re-shows the signature unticked', () => {
  const signed = go(at(minor(), 'signature'), set('signature.agreed', true), set('signature.name', 'Dana Test'), { type: 'next' });
  expect(signed).toMatchObject({ step: 'handover', locked: true });
  expect(go(signed, { type: 'back' }).step).toBe('handover');
  const assent = go(signed, { type: 'next' });
  expect(assent.step).toBe('assent');
  expect(go(assent, { type: 'back' }).step).toBe('handover');
  expect(go(assent, set('choices.audio', false), set('signature.name', 'Someone')).signature.name).toBe('Dana Test'); // locked
  expect(go(signed, { type: 'unlock' })).toMatchObject({ step: 'signature', locked: false, signature: { agreed: false, name: 'Dana Test' } });
});

test('next waits for canContinue; back walks the steps and stops at the first', () => {
  expect(go(at(minor(), 'agreement'), { type: 'next' }).step).toBe('agreement');
  expect(go(minor(), { type: 'next' }, { type: 'readToEnd' }, { type: 'next' }).step).toBe('choices');
  expect(go(minor(), { type: 'back' }).step).toBe('who');
  expect(go(at(initialFlow({ branch: 'adult-handover' }), 'agreement'), { type: 'back' }).step).toBe('handover');
});

test('the save is at the last step', () => {
  expect(savesHere(at(minor(), 'signature'))).toBe(false);
  expect(savesHere(at(minor(), 'assent'))).toBe(true);
  expect(savesHere(at(adult(), 'signature'))).toBe(true);
  expect(savesHere(at(initialFlow({ branch: 'adult-handover' }), 'signature'))).toBe(true);
});

test('assent: the answer, the tick and a name (soft-checked)', () => {
  const s = go(at(minor(), 'assent'), set('assent.audio', true), set('assent.agreed', true), set('assent.name', 'Bob'));
  expect(canContinue(s).ok).toBe(true);
  expect(canContinue(go(at(minor(), 'assent'), set('assent.audio', true), set('assent.name', 'Ava'))).ok).toBe(false);
  expect(nameMatches('ava test', 'Ava')).toBe(true);
  expect(nameMatches('Bob', 'Ava')).toBe(false);
  expect(nameMatches('Zoë', 'Zoe')).toBe(true);
  expect(nameMatches('', 'Ava')).toBe(false);
});

test('every typed field is clamped', () => {
  const s = go(minor(), set('signature.name', 'n'.repeat(130)), set('contact.phone', 'p'.repeat(50)), set('contact.relationship', 'r'.repeat(70)),
    set('choices.parentName', 'q'.repeat(130)), set('assent.name', 'a'.repeat(130)), set('contact.name', 'c'.repeat(130)));
  expect([s.signature.name.length, s.contact.phone.length, s.contact.relationship.length, s.choices.parentName.length, s.assent.name.length, s.contact.name.length])
    .toEqual([120, 40, 60, 120, 120, 120]);
});

test('what the flow saves', () => {
  const s = go(at(minor({ drivingAsked: true, under13: true }), 'choices'), set('choices.location', 'B'), set('choices.audio', true), set('choices.driving', false),
    set('assent.name', ' Ava '), set('assent.audio', true), set('assent.readAloud', true));
  expect(choicesFromFlow(s)).toEqual({ location: 'B', audio: true, driving: false, emergencyContact: { name: null, phone: null, relationship: null }, parentSessions: null, parentName: null });
  expect(assentFromFlow(s)).toEqual({ name: 'Ava', audio: true, readAloud: true });
  expect(assentFromFlow({ ...s, under13: false }).readAloud).toBe(false);
  const a = go(adult(), set('contact.name', ' Lee Test '), set('contact.phone', 'test-phone'), set('choices.location', 'C'), set('choices.audio', false),
    set('choices.parentSessions', true), set('choices.parentName', 'Dana Test'), set('choices.driving', true));
  expect(choicesFromFlow(a)).toEqual({ location: 'C', audio: false, driving: null, emergencyContact: { name: 'Lee Test', phone: 'test-phone', relationship: null },
    parentSessions: true, parentName: 'Dana Test' });
});

test('draftState', () => {
  expect(DRAFT_TTL_DAYS).toBe(7);
  expect(draftState(draft, { version: '2026-10-30', adultNow: false, nowMs: 6 * day })).toBe('fresh');
  expect(draftState(draft, { version: '2026-10-30', adultNow: false, nowMs: 8 * day })).toBe('expired');
  expect(draftState(draft, { version: '2026-12-01', adultNow: false, nowMs: 6 * day })).toBe('version-changed');
  expect(draftState(draft, { version: '2026-10-30', adultNow: true, nowMs: 6 * day })).toBe('adult-changed');
  expect(draftState(null, { version: '2026-10-30', adultNow: false, nowMs: 0 })).toBeNull();
});

test('a fresh draft resumes at the signature with the name filled, unticked', () => {
  expect(initialFlow({ branch: 'minor', firstName: 'Ava', draft, draftState: 'fresh' })).toMatchObject({
    step: 'signature', signature: { name: 'Dana Test', agreed: false }, choices: { location: 'B' }, resumed: true });
  expect(initialFlow({ branch: 'minor', firstName: 'Ava', draft, draftState: 'fresh' }).contact.sameAsParent).toBe(true);
});

test('a new version restarts at the agreement with the draft\'s choices', () => {
  expect(initialFlow({ branch: 'minor', firstName: 'Ava', draft, draftState: 'version-changed' })).toMatchObject({
    step: 'agreement', choices: { location: 'B' }, readToEnd: false, notice: 'The form was updated since you started, so please read it again.' });
});

test('turned 18: the draft is ignored', () => {
  expect(initialFlow({ branch: 'adult-handover', firstName: 'Ava', draft, draftState: 'adult-changed' })).toMatchObject({
    step: 'who', choices: { location: null }, notice: 'Ava is 18 now, so Ava signs this for themself.' });
});

test('an expired draft starts again at step 1', () => {
  expect(initialFlow({ branch: 'minor', firstName: 'Ava', draft, draftState: 'expired' })).toMatchObject({ step: 'who', choices: { location: null }, resumed: false });
});

test('the device draft never throws', () => {
  const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  expect(readDraft('u', 'ava', throwing)).toBeNull();
  expect(() => writeDraft('u', 'ava', draft, throwing)).not.toThrow();
  expect(() => clearDraft('u', 'ava', throwing)).not.toThrow();
  expect(readDraft('u', 'ava', { getItem: () => '{not json' })).toBeNull();
  expect(readDraft('u', 'ava', { getItem: () => JSON.stringify({ ...draft, v: 2 }) })).toBeNull();
  expect(draftKey('u-dana', 'ava')).toBe('ryp.mentalConsent.u-dana.ava');
});

test('the device draft round-trips through localStorage', () => {
  window.localStorage.clear();
  writeDraft('u-dana', 'ava', draft);
  expect(window.localStorage.getItem('ryp.mentalConsent.u-dana.ava')).not.toBeNull();
  expect(readDraft('u-dana', 'ava')).toEqual(draft);
  clearDraft('u-dana', 'ava');
  expect(readDraft('u-dana', 'ava')).toBeNull();
});

test('leaving the flow', () => {
  expect(consentExit({ viewer: 'parent', listCount: 1 })).toEqual({ to: '/portal/family', state: null });
  expect(consentExit({ viewer: 'athlete', listCount: 1 })).toEqual({ to: '/portal/home', state: null });
  expect(consentExit({ viewer: 'parent', listCount: 3 })).toEqual({ to: '/portal/consent/mental', state: { from: 'flow' } });
});
