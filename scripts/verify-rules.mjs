/**
 * Sprint 20 rules probe - runs against the LOCAL Firestore emulator only
 * (FIRESTORE_EMULATOR_HOST from scripts/emulator.env) under a throwaway
 * project id, so seeded data is untouched. Seeds via `Bearer owner` (bypasses
 * rules), then exercises each new rules clause as a real user via an
 * unsigned JWT (the emulator accepts alg:none). Exit 1 on any FAIL.
 *   node --env-file=scripts/emulator.env scripts/verify-rules.mjs
 *
 * TWO PASSES (single token, owner rulings 2026-09-29/30). The emulator's
 * rules-load endpoint (PUT /emulator/v1/projects/{p}:securityRules) loads
 * rules for the probe project only, after a self-check (broken rules -> 400,
 * firestore.rules -> 200):
 *   Pass A  the real ../firestore.rules, expectations keyed on the real
 *           clock (beforeGate: the Oct 10 booking gate).
 *   Pass B  a copy whose ONE 'timestamp.value(1791633600000)' is replaced by
 *           'timestamp.value(0)', every case with post-gate expectations.
 * The real file is reloaded at the end. When this emulator build has no
 * rules-load endpoint, Pass B runs against a SECOND firestore emulator
 * started on a scratch copy (the script writes it and prints the command;
 * set RULES_POSTGATE_EMULATOR_HOST to that emulator's host).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fsFields, localEmulatorHost, LOCAL_HOSTS } from './lib/firestore-rest.mjs';

let HOST = localEmulatorHost({ required: true });
const PROJECT = 'demo-rules-probe';
const baseFor = (host) => `http://${host}/v1/projects/${PROJECT}/databases/(default)/documents`;
let BASE = baseFor(HOST);
const GATE_MS = 1791633600000;
const GATE_LITERAL = 'timestamp.value(1791633600000)';
const GATE_ZERO = 'timestamp.value(0)';
let beforeGate = Date.now() < GATE_MS;
let failures = 0;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(uid, claims = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: uid, user_id: uid,
    iat: now, exp: now + 3600, firebase: { sign_in_provider: claims.provider || 'password', identities: {} }, ...claims };
  delete body.provider;
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(body)}.`;
}
async function call(method, path, body, auth) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const seed = (col, id, fields) => call('PATCH', `/${col}/${id}`, { fields: fsFields(fields) }, 'owner');
const del = (col, id) => call('DELETE', `/${col}/${id}`, null, 'owner');
async function commitAs(auth, write) {
  const res = await fetch(`http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents:commit`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify({ writes: [write] }),
  });
  return res.status;
}
const docPath = (col, id) => `projects/${PROJECT}/databases/(default)/documents/${col}/${id}`;
const transforms = (serverTime) => serverTime.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' }));
async function createAs(auth, col, id, fields, serverTime = ['createdAt']) {
  // One `commit` write: a create (currentDocument.exists false) plus REQUEST_TIME transforms.
  return commitAs(auth, { update: { name: docPath(col, id), fields: fsFields(fields) }, currentDocument: { exists: false },
    updateTransforms: transforms(serverTime) });
}
/** One `commit` write: an update of `mask` (default: the given fields) plus REQUEST_TIME transforms. */
async function updateAs(auth, col, id, fields, mask = Object.keys(fields), serverTime = []) {
  return commitAs(auth, { update: { name: docPath(col, id), fields: fsFields(fields) }, updateMask: { fieldPaths: mask },
    currentDocument: { exists: true }, updateTransforms: transforms(serverTime) });
}
function expect(label, actual, wanted) {
  const ok = actual === wanted;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} -> ${actual} (wanted ${wanted})`);
}

/** Load rules for the probe project only. @return {Promise<number>} The HTTP status. */
async function loadRules(content) {
  const res = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}:securityRules`, {
    method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content }] } }),
  });
  await res.text().catch(() => null);
  return res.status;
}
/** The post-gate copy: the ONE booking-gate literal set to the epoch. */
function postGateCopy(rules) {
  const parts = rules.split(GATE_LITERAL);
  if (parts.length !== 2) {
    throw new Error(`expected exactly one '${GATE_LITERAL}' in firestore.rules, found ${parts.length - 1}`);
  }
  return parts.join(GATE_ZERO);
}
const BROKEN_RULES = "rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n" +
  '    match /x/{id} { allow read: if nope(; }\n  }\n}\n';

const uid = { parent: 'p-probe', athlete: 'a-probe', ops: 'ops-probe', kid: 'kid-probe', stranger: 's-probe', frozen: 'pf-probe' };
const t = {
  parent: token(uid.parent, { email: 'dana@example.com', email_verified: true }),
  athlete: token(uid.athlete, { email: 'ava@example.com', email_verified: true }),
  ops: token(uid.ops, { email: 'ops@example.com', email_verified: true }),
  kidVerified: token(uid.kid, { email: 'Kid@Example.com', email_verified: true }),
  kidUnverified: token(uid.kid, { email: 'Kid@Example.com', email_verified: false }),
  stranger: token(uid.stranger, { email: 'x@example.com', email_verified: true }),
  frozen: token(uid.frozen, { email: 'fern@example.com', email_verified: true }),
};

async function setup() {
  await seed('users', uid.parent, { role: 'parent', householdId: 'hh', athleteId: null });
  await seed('users', uid.athlete, { role: 'athlete', athleteId: 'ath-active', householdId: 'hh' });
  await seed('users', uid.ops, { role: 'ops' });
  await seed('households', 'hh', { name: 'Probe family', periodAnchorDay: 1 });
  for (const [id, extra] of [
    ['ath-active', { packageId: 't-6', billing: { status: 'active' } }],
    ['ath-absent', { packageId: 't-6' }],
    ['ath-pending', { packageId: 't-6', billing: { status: 'pending' } }],
    ['ath-elite', { packageId: 'elite', billing: { status: 'active' } }],
    ['ath-elite-pending', { packageId: 'elite', billing: { status: 'pending' } }],
  ]) await seed('athletes', id, { name: id, householdId: 'hh', contractMinutes: null, coachId: null, ...extra });
  await seed('sessions', 's1', { date: '2026-11-04', time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled' });
  await seed('sessions', 's2', { date: '2026-11-05', time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled' });
  await seed('sessions', 's-full', { date: '2026-11-04', time: '5:00 PM', type: 'training', capacity: 1, booked: 1, status: 'scheduled' });
  // Sprint 20 read-cap check (spec 11): a grace-charged booking by the PARENT
  // walks the longest create path - me() + sessions + graceTokens (x2, one
  // doc) + households + athletes = 5 unique docs of the 10-doc cap. Held by
  // ath-elite so the expectation is 200 before AND after the Oct 10 gate.
  await seed('graceTokens', 'grace-probe', { athleteId: 'ath-elite', householdId: 'hh', expiresAt: '2026-12-31', reason: 'session-cancelled',
    sourceSessionId: 's-cancelled', createdBy: uid.ops, createdAt: new Date() });
  await setupSingle();
}

// Single token (rulings 2026-09-29/30): one-time buyers, a legacy single
// athlete on comps, an athlete who moved off single unpaid, a frozen household.
async function setupSingle() {
  const oneTime = { status: 'active', oneTime: true };
  await seed('users', uid.frozen, { role: 'parent', householdId: 'hh-frozen', athleteId: null });
  await seed('households', 'hh-frozen', { name: 'Frozen family', periodAnchorDay: 1, membership: { status: 'past_due' } });
  for (const [id, extra] of [
    ['ath-single', { packageId: 'single', billing: oneTime }],
    ['ath-single2', { packageId: 'single', billing: oneTime }],
    ['ath-single-legacy', { packageId: 'single' }],
    ['ath-moved', { packageId: 't-6', billing: oneTime }],
    ['ath-frozen', { packageId: 't-6', billing: { status: 'active' }, householdId: 'hh-frozen' }],
  ]) await seed('athletes', id, { name: id, householdId: 'hh', contractMinutes: null, coachId: null, ...extra });
  await seed('sessions', 's3', { date: '2026-11-06', time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled' });
  const purchase = (athleteId, expiresAt) => ({ athleteId, householdId: 'hh', expiresAt, reason: 'single-purchase', sourceSessionId: null,
    createdBy: 'stripe', createdAt: new Date() });
  await seed('graceTokens', 'single_cs_probe', purchase('ath-single', '2027-02-27'));
  await seed('graceTokens', 'single_cs_other', purchase('ath-single2', '2027-02-27'));
  await seed('graceTokens', 'single_cs_void', purchase('ath-single', '2000-01-01'));
  await seed('tokenPeriods', 'ath-single-legacy_2026-11-01', { athleteId: 'ath-single-legacy', periodKey: '2026-11-01', periodEnd: '2026-11-30', granted: 1 });
  await seed('tokenPeriods', 'ath-single-legacy_2026-10-01', { athleteId: 'ath-single-legacy', periodKey: '2026-10-01', periodEnd: '2026-10-31', granted: 1 });
  await seed('tokenPeriods', 'ath-single_2026-11-01', { athleteId: 'ath-single', periodKey: '2026-11-01', periodEnd: '2026-11-30', granted: 0 });
}
const booking = (athleteId) => ({ athleteId, sessionId: 's1', date: '2026-11-04', type: 'training', periodKey: '2026-11-01',
  status: 'confirmed', householdId: 'hh', createdBy: uid.parent, chargedFrom: 'period' });
const entry = (athleteId) => ({ sessionId: 's-full', athleteId, householdId: 'hh', date: '2026-11-04', periodKey: '2026-11-01', createdBy: uid.parent });

export async function task4() {
  console.log('Task 4: athlete shape, billing gate, opens-at gate' + (beforeGate ? ' (before Oct 10)' : ' (after Oct 10)'));
  // dob is in the shape the client always writes (live.js createAthlete: dob ?? null) and the rule dereferences it.
  const shape = { name: 'N', householdId: 'hh', dob: null, contractMinutes: null, coachId: null };
  expect('ops creates athlete with handicap 12 + loginEmail', await createAs(t.ops, 'athletes', 'new-1', { ...shape, handicap: 12, loginEmail: 'kid@example.com' }, []), 200);
  expect('handicap 55 refused', await createAs(t.ops, 'athletes', 'new-2', { ...shape, handicap: 55 }, []), 403);
  expect('client-written billing refused', await createAs(t.ops, 'athletes', 'new-3', { ...shape, billing: { status: 'active' } }, []), 403);
  expect('parent cannot create an athlete', await createAs(t.parent, 'athletes', 'new-4', shape, []), 403);
  expect('booking: billing active', await createAs(t.parent, 'bookings', 'ath-active_s1', booking('ath-active')), beforeGate ? 403 : 200);
  expect('booking: billing absent', await createAs(t.parent, 'bookings', 'ath-absent_s1', booking('ath-absent')), beforeGate ? 403 : 200);
  expect('booking: billing pending refused', await createAs(t.parent, 'bookings', 'ath-pending_s1', booking('ath-pending')), 403);
  expect('booking: paid Elite books before the gate', await createAs(t.parent, 'bookings', 'ath-elite_s1', booking('ath-elite')), 200);
  expect('booking: unpaid Elite refused', await createAs(t.parent, 'bookings', 'ath-elite-pending_s1', booking('ath-elite-pending')), 403);
  expect('booking: parent + grace token stays under the read cap (paid Elite: open before the gate too)',
    await createAs(t.parent, 'bookings', 'ath-elite_s2', { ...booking('ath-elite'), sessionId: 's2', date: '2026-11-05', chargedFrom: 'grace', graceTokenId: 'grace-probe' }), 200);
  expect('waitlist: pending refused', await createAs(t.parent, 'waitlist', 's-full_ath-pending', entry('ath-pending'), ['joinedAt']), 403);
  expect('waitlist: paid Elite allowed', await createAs(t.parent, 'waitlist', 's-full_ath-elite', entry('ath-elite'), ['joinedAt']), 200);
  expect('waitlist: active token athlete', await createAs(t.parent, 'waitlist', 's-full_ath-active', entry('ath-active'), ['joinedAt']), beforeGate ? 403 : 200);
}

async function teardown() {
  for (const [c, ids] of Object.entries({ users: Object.values(uid), households: ['hh', 'hh-frozen'], sessions: ['s1', 's2', 's3', 's-full'],
    athletes: ['ath-active', 'ath-absent', 'ath-pending', 'ath-elite', 'ath-elite-pending', 'new-1', 'new-2', 'new-3', 'new-4',
      'ath-single', 'ath-single2', 'ath-single-legacy', 'ath-moved', 'ath-frozen'],
    bookings: ['ath-active_s1', 'ath-absent_s1', 'ath-pending_s1', 'ath-elite_s1', 'ath-elite-pending_s1', 'ath-elite_s2', 'ath-pending_s-old',
      'ath-single_s1', 'ath-single2_s1', 'ath-single-legacy_s1', 'ath-moved_s1', 'ath-elite_s3', 'ath-single_s2', 'ath-frozen_s2', 'ath-active_s-past'],
    graceTokens: ['grace-probe', 'single_cs_probe', 'single_cs_other', 'single_cs_void'],
    tokenPeriods: ['ath-single-legacy_2026-11-01', 'ath-single-legacy_2026-10-01', 'ath-single_2026-11-01'],
    waitlist: ['s-full_ath-pending', 's-full_ath-elite', 's-full_ath-active', 's-full_ath-moved'] })) for (const id of ids) await del(c, id);
}

export async function task5() {
  console.log('Task 5: calendly cancel guard, loginInvites/calendlyEvents reads, household exclusions');
  await seed('bookings', 'ath-active_cal-1', { athleteId: 'ath-active', sessionId: 'cal-1', date: '2026-11-10', type: 'mental', periodKey: '2026-11-01',
    status: 'confirmed', householdId: 'hh', createdBy: 'system', createdAt: new Date(), chargedFrom: 'period', source: 'calendly', calendlyInviteeUri: 'https://api.calendly.com/x' });
  await seed('bookings', 'ath-active_s-portal', { athleteId: 'ath-active', sessionId: 's1', date: '2026-11-04', type: 'training', periodKey: '2026-11-01',
    status: 'confirmed', householdId: 'hh', createdBy: uid.parent, createdAt: new Date(), chargedFrom: 'period' });
  const cancel = (id, auth) => call('PATCH', `/bookings/${id}?updateMask.fieldPaths=status&updateMask.fieldPaths=cancelledBy&updateMask.fieldPaths=cancelReason`,
    { fields: fsFields({ status: 'cancelled', cancelledBy: uid.parent, cancelReason: 'member' }) }, auth).then((r) => r.status);
  expect('member cancel of a portal booking', await cancel('ath-active_s-portal', t.parent), 200);
  expect('member cancel of a calendly booking refused', await cancel('ath-active_cal-1', t.parent), 403);
  // Re-confirming a cancelled row is booking: the same gates as a create
  // (review 2026-09-29). An unpaid athlete's revoked row stays cancelled.
  await seed('bookings', 'ath-pending_s-old', { athleteId: 'ath-pending', sessionId: 's1', date: '2026-11-04', type: 'training', periodKey: '2026-11-01',
    status: 'cancelled', householdId: 'hh', createdBy: uid.parent, createdAt: new Date(), chargedFrom: 'period', cancelledBy: 'system', cancelReason: 'lapsed' });
  const rebook = (id, auth) => call('PATCH', `/bookings/${id}?updateMask.fieldPaths=status`, { fields: fsFields({ status: 'confirmed' }) }, auth).then((r) => r.status);
  expect('re-book refused for a pending athlete', await rebook('ath-pending_s-old', t.parent), 403);
  expect('re-book of a portal row by a paid athlete', await rebook('ath-active_s-portal', t.parent), beforeGate ? 403 : 200);
  await seed('loginInvites', 'kid@example.com', { email: 'kid@example.com', householdId: 'hh', athleteId: 'ath-active', athleteName: 'Kid', requestedBy: 'guardian',
    createdBy: uid.parent, createdAt: new Date(), status: 'open', claimedBy: null, claimedAt: null });
  const read = (auth) => call('GET', '/loginInvites/kid@example.com', null, auth).then((r) => r.status);
  expect('invite read by the verified owner (mixed-case token email, .lower())', await read(t.kidVerified), 200);
  expect('invite read refused while unverified', await read(t.kidUnverified), 403);
  expect('invite read by the household parent', await read(t.parent), 200);
  expect('invite read by ops', await read(t.ops), 200);
  expect('invite read refused for a stranger', await read(t.stranger), 403);
  expect('client cannot create an invite', await createAs(t.parent, 'loginInvites', 'new@example.com', { email: 'new@example.com', householdId: 'hh', athleteId: 'ath-active', athleteName: 'N', requestedBy: 'guardian', createdBy: uid.parent, status: 'open', claimedBy: null, claimedAt: null }), 403);
  expect('client cannot create a household', await createAs(t.parent, 'households', 'hh-new', { name: 'X' }, []), 403);
  expect('client cannot create a users doc', await createAs(t.stranger, 'users', uid.stranger, { role: 'parent', householdId: 'hh' }, []), 403);
  await seed('calendlyEvents', 'ev-1', { event: 'invitee.created', outcome: 'unresolved', receivedAt: new Date() });
  expect('calendlyEvents read by ops', (await call('GET', '/calendlyEvents/ev-1', null, t.ops)).status, 200);
  expect('calendlyEvents read refused for a parent', (await call('GET', '/calendlyEvents/ev-1', null, t.parent)).status, 403);
  const patchHh = (fields) => call('PATCH', `/households/hh?${Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`, { fields: fsFields(fields) }, t.parent).then((r) => r.status);
  expect('parent edits their own contact', await patchHh({ emergencyContact: '555' }), 200);
  expect('parent cannot write membership', await patchHh({ membership: { status: 'active' } }), 403);
  expect('parent cannot write stripeCustomerIds', await patchHh({ stripeCustomerIds: ['cus_x'] }), 403);
  for (const [c, id] of [['bookings', 'ath-active_cal-1'], ['bookings', 'ath-active_s-portal'], ['loginInvites', 'kid@example.com'], ['calendlyEvents', 'ev-1']]) await del(c, id);
}

/**
 * The single-token cases (rulesChanges 1-19). Case 15 is task5's monthly
 * status-only re-book, 17's Nov 4 half is task5's member cancel and 18 is
 * task4's 'booking: billing active'. Refusals run before the create that
 * succeeds on the same doc id, so each 403 is refused for its own reason.
 */
export async function taskSingle() {
  console.log('Single token: charge, billing, re-book and cancel gates' + (beforeGate ? ' (before Oct 10)' : ' (after Oct 10)'));
  const open = beforeGate ? 403 : 200;
  const grace = (athleteId, graceTokenId, over = {}) => ({ ...booking(athleteId), chargedFrom: 'grace', graceTokenId, ...over });
  const mk = (id, fields) => createAs(t.parent, 'bookings', id, fields);
  expect('2. single: another athlete\'s token refused', await mk('ath-single_s1', grace('ath-single', 'single_cs_other')), 403);
  expect('3. single: a voided token refused', await mk('ath-single_s1', grace('ath-single', 'single_cs_void')), 403);
  expect('4. single: grace with no token id refused', await mk('ath-single_s1', { ...booking('ath-single'), chargedFrom: 'grace' }), 403);
  expect('5. single: elite refused', await mk('ath-single_s1', { ...booking('ath-single'), chargedFrom: 'elite' }), 403);
  expect('6. single: period with no comp refused', await mk('ath-single2_s1', booking('ath-single2')), 403);
  expect('9. single: period against a granted-0 comp refused', await mk('ath-single_s1', booking('ath-single')), 403);
  expect('1. single + own token', await mk('ath-single_s1', grace('ath-single', 'single_cs_probe')), open);
  expect('8. legacy single: an October comp on a Nov 4 session refused', await mk('ath-single-legacy_s1', { ...booking('ath-single-legacy'), periodKey: '2026-10-01' }), 403);
  expect('7. legacy single: period against the Nov comp', await mk('ath-single-legacy_s1', booking('ath-single-legacy')), open);
  expect('10. moved off single, unpaid: booking refused', await mk('ath-moved_s1', booking('ath-moved')), 403);
  expect('10. moved off single, unpaid: waitlist refused', await createAs(t.parent, 'waitlist', 's-full_ath-moved', entry('ath-moved'), ['joinedAt']), 403);
  expect('19. Elite charged elite (open before the gate too)', await mk('ath-elite_s3', { ...booking('ath-elite'), sessionId: 's3', date: '2026-11-06', chargedFrom: 'elite' }), 200);

  // A single row the member cancelled; it had spent single_cs_probe.
  await seed('bookings', 'ath-single_s2', { athleteId: 'ath-single', sessionId: 's2', date: '2026-11-05', type: 'training', periodKey: '2026-11-01',
    status: 'cancelled', householdId: 'hh', createdBy: uid.parent, createdAt: new Date(), chargedFrom: 'grace', graceTokenId: 'single_cs_probe',
    cancelledBy: uid.parent, cancelReason: 'member' });
  const rebook = (id, fields, auth = t.parent) => updateAs(auth, 'bookings', id, { status: 'confirmed', ...fields }, undefined, ['rebookedAt']);
  expect('12. single re-book, status only (a stale client) refused', await updateAs(t.parent, 'bookings', 'ath-single_s2', { status: 'confirmed' }), 403);
  expect('13. single re-book naming another athlete\'s token refused', await rebook('ath-single_s2', { chargedFrom: 'grace', graceTokenId: 'single_cs_other' }), 403);
  expect('14. single re-book naming a voided token refused', await rebook('ath-single_s2', { chargedFrom: 'grace', graceTokenId: 'single_cs_void' }), 403);
  expect('11. single re-book re-deciding its charge, rebookedAt == request.time', await rebook('ath-single_s2', { chargedFrom: 'grace', graceTokenId: 'single_cs_probe' }), open);

  await seed('bookings', 'ath-frozen_s2', { athleteId: 'ath-frozen', sessionId: 's2', date: '2026-11-05', type: 'training', periodKey: '2026-11-01',
    status: 'cancelled', householdId: 'hh-frozen', createdBy: uid.frozen, createdAt: new Date(), chargedFrom: 'period', cancelledBy: uid.frozen, cancelReason: 'member' });
  expect('16. re-book in a past_due household refused', await updateAs(t.frozen, 'bookings', 'ath-frozen_s2', { status: 'confirmed' }), 403);

  await seed('bookings', 'ath-active_s-past', { athleteId: 'ath-active', sessionId: 's-past', date: '2026-09-01', type: 'training', periodKey: '2026-09-01',
    status: 'confirmed', householdId: 'hh', createdBy: uid.parent, createdAt: new Date(), chargedFrom: 'period' });
  expect('17. member cancel after the session day refused', await updateAs(t.parent, 'bookings', 'ath-active_s-past',
    { status: 'cancelled', cancelledBy: uid.parent, cancelReason: 'member' }), 403);
}

/**
 * Where Pass B runs when the emulator cannot load rules: a second emulator
 * the operator starts on a scratch copy the script writes here.
 * @return {string} The second emulator's host.
 */
function fallbackHost(postGateRules) {
  const dir = join(tmpdir(), 'ryp-verify-rules-postgate');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'firestore.rules'), postGateRules);
  writeFileSync(join(dir, 'firebase.json'), JSON.stringify({ firestore: { rules: 'firestore.rules' },
    emulators: { firestore: { port: 8085 }, hub: { port: 4405 }, logging: { port: 4505 }, ui: { enabled: false } } }, null, 2));
  const host = process.env.RULES_POSTGATE_EMULATOR_HOST;
  if (!host || !LOCAL_HOSTS.has(host.replace(/:\d+$/, ''))) {
    console.error('This emulator has no rules-load endpoint. Start a second Firestore emulator on the post-gate copy:\n' +
      `  cd "${dir}" && npx firebase-tools emulators:start --only firestore --project ${PROJECT}\n` +
      'then re-run with RULES_POSTGATE_EMULATOR_HOST=127.0.0.1:8085 (a local host).');
    process.exit(1);
  }
  return host;
}

async function runPass(label) {
  console.log(`\n=== ${label} ===`);
  await setup();
  try { await task4(); await task5(); await taskSingle(); } finally { await teardown(); }
}

export { setup, teardown, seed, del, call, createAs, updateAs, expect, token, t, uid, BASE, loadRules, postGateCopy };
if (process.argv[1] && process.argv[1].endsWith('verify-rules.mjs')) {
  const realRules = readFileSync(fileURLToPath(new URL('../firestore.rules', import.meta.url)), 'utf8');
  const postGateRules = postGateCopy(realRules);
  const broken = await loadRules(BROKEN_RULES);
  const endpoint = ![404, 405, 501].includes(broken);
  if (endpoint) {
    console.log('Rules-load endpoint self-check');
    expect('a deliberately broken rules string is refused', broken, 400);
    expect('firestore.rules loads', await loadRules(realRules), 200);
    if (failures) { console.log(`${failures} FAILED (self-check) - no pass run`); process.exit(1); }
  }
  let passB = false;
  try {
    beforeGate = Date.now() < GATE_MS;
    await runPass(`Pass A: the real firestore.rules, real clock (${beforeGate ? 'before' : 'after'} the Oct 10 gate)`);
    if (endpoint) {
      expect('post-gate copy loads', await loadRules(postGateRules), 200);
    } else {
      HOST = fallbackHost(postGateRules);
      BASE = baseFor(HOST);
    }
    passB = true;
    beforeGate = false;
    await runPass('Pass B: the post-gate copy (gate literal set to 0), post-gate expectations');
  } finally {
    if (endpoint) expect('the real firestore.rules reloaded', await loadRules(realRules), 200);
  }
  console.log(failures ? `${failures} FAILED` : `ALL PASS${passB ? ' (both passes)' : ''}`);
  process.exit(failures ? 1 : 0);
}
