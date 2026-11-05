import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consentFixtures } from '../lib/consent-fixtures.mjs';

// The Global Constraints' field set, exactly (plan 01-plan.md).
const RECORD_KEYS = ['athleteId', 'householdId', 'version', 'method', 'signedAt', 'signedBy', 'signer', 'adult', 'assent',
  'choices', 'adultConfirm', 'adultSignature', 'countersign', 'history'];
const CHOICE_KEYS = ['location', 'audio', 'driving', 'emergencyContact', 'parentSessions', 'parentName', 'updatedAt', 'updatedBy'];
const ASSENT_KEYS = ['name', 'audio', 'at', 'readAloud', 'withdrawnBy'];
// The gate's phone pattern (plan Task 19 Step 5a): ten digits in 3-3-4 groups.
const PHONE = /[0-9]{3}[^0-9A-Za-z]{0,2}[0-9]{3}[^0-9A-Za-z]{0,2}[0-9]{4}/;
const NOW = new Date('2026-11-05T18:00:00Z');
const DAY_MS = 86400000;
const sorted = (keys) => [...keys].sort();

function strings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (v instanceof Map) for (const [k, x] of v) { strings(k, out); strings(x, out); }
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === 'object' && !(v instanceof Date)) Object.entries(v).forEach(([k, x]) => { out.push(k); strings(x, out); });
  return out;
}

test('both records carry exactly the 14 fields; reese and nico stay unsigned', () => {
  const { mentalConsents } = consentFixtures({ now: NOW });
  assert.deepEqual([...mentalConsents.keys()].sort(), ['jordan', 'quinn-parker']);
  for (const [id, r] of mentalConsents) {
    assert.deepEqual(sorted(Object.keys(r)), sorted(RECORD_KEYS), id);
    assert.deepEqual(sorted(Object.keys(r.choices)), sorted(CHOICE_KEYS), id);
    assert.equal(r.athleteId, id);
    assert.equal(r.version, '2026-10-30');
    assert.equal(r.method, 'portal');
    assert.deepEqual(r.history, []);
    assert.equal(r.adultConfirm, null);
    assert.equal(r.adultSignature, null);
    assert.ok(r.signedAt instanceof Date && r.signedAt < NOW, id);
    assert.equal(r.choices.updatedAt.getTime(), r.signedAt.getTime(), id);
    assert.equal(r.choices.updatedBy, r.signedBy, id);
  }
  assert.equal(mentalConsents.has('reese'), false);
  assert.equal(mentalConsents.has('nico'), false);
});

test('jordan: a minor portal record by parent-dana, assent yes, countersigned by mental the next day', () => {
  const j = consentFixtures({ now: NOW }).mentalConsents.get('jordan');
  assert.deepEqual([j.householdId, j.signedBy, j.adult], ['whitfield', 'parent-dana', false]);
  assert.deepEqual(j.signer, { role: 'parent', name: 'Dana Whitfield' });
  assert.deepEqual(sorted(Object.keys(j.assent)), sorted(ASSENT_KEYS));
  assert.equal(j.assent.at.getTime(), j.signedAt.getTime());
  assert.deepEqual([j.assent.name, j.assent.audio, j.assent.readAloud, j.assent.withdrawnBy], ['Jordan', true, false, null]);
  assert.deepEqual([j.choices.location, j.choices.audio, j.choices.driving], ['B', true, false]);
  assert.deepEqual(j.choices.emergencyContact, { name: null, phone: null, relationship: null });
  assert.deepEqual([j.choices.parentSessions, j.choices.parentName], [null, null]);
  assert.equal(j.countersign.by, 'mental');
  assert.equal(j.countersign.at.getTime() - j.signedAt.getTime(), DAY_MS);
  assert.ok(j.countersign.at < NOW);
});

test('quinn-parker: section 11 by hand-the-phone on parent-sam, no assent, not countersigned', () => {
  const q = consentFixtures({ now: NOW }).mentalConsents.get('quinn-parker');
  assert.deepEqual([q.householdId, q.signedBy, q.adult], ['parker', 'parent-sam', true]);
  assert.deepEqual(q.signer, { role: 'athlete', name: 'Quinn Parker' });
  assert.equal(q.assent, null);
  assert.equal(q.choices.driving, null);
  assert.deepEqual([q.choices.location, q.choices.audio, q.choices.parentSessions, q.choices.parentName], ['C', true, true, 'Sam Parker']);
  assert.deepEqual(q.choices.emergencyContact, { name: 'Sam Parker', phone: 'test-phone', relationship: 'parent' });
  assert.equal(q.countersign, null);
});

test('the 18+ athlete and the switch, seeded off', () => {
  const { athletes, config } = consentFixtures({ now: NOW });
  assert.deepEqual([...athletes.keys()], ['quinn-parker']);
  assert.deepEqual(athletes.get('quinn-parker'), {
    name: 'Quinn Parker', dob: '2006-08-20', householdId: 'parker', packageId: 'elite', contractMinutes: null, coachId: null,
  });
  assert.deepEqual(config, ['mentalConsent', { notices: false, enabledAt: null }]);
});

test('no value looks like a phone number', () => {
  const fx = consentFixtures({ now: NOW });
  const all = strings([fx.athletes, fx.mentalConsents, fx.config]);
  assert.ok(all.includes('test-phone'));
  assert.deepEqual(all.filter((s) => PHONE.test(s)), []);
  assert.equal(PHONE.test(JSON.stringify([[...fx.athletes], [...fx.mentalConsents], fx.config])), false);
});
