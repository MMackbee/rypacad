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
import { fsFields, fsValue, localEmulatorHost, LOCAL_HOSTS } from './lib/firestore-rest.mjs';

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
const docName = (col, id) => `projects/${PROJECT}/databases/(default)/documents/${col}/${id}`;
// One `commit` as a real user: every write lands or none does - the shape of the client's own transactions.
async function commitAs(auth, writes) {
  const res = await fetch(`http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents:commit`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` }, body: JSON.stringify({ writes }) });
  return res.status;
}
// A create (currentDocument.exists false) plus REQUEST_TIME transforms.
const createWrite = (col, id, fields, serverTime = ['createdAt']) => ({ update: { name: docName(col, id), fields: fsFields(fields) }, currentDocument: { exists: false },
  updateTransforms: serverTime.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) });
// An update of the masked fields only; a masked field with no value is a delete. `serverTime` names fields set to
// REQUEST_TIME beside the mask (the re-book's rebookedAt: serverTimestamp()).
const patchWrite = (col, id, fields, mask = Object.keys(fields), serverTime = []) => ({ update: { name: docName(col, id), fields: fsFields(fields) }, updateMask: { fieldPaths: mask }, currentDocument: { exists: true },
  ...(serverTime.length ? { updateTransforms: serverTime.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) } : {}) });
// The session's seat count moved by `delta`, written as a plain value like live.js createBooking / cancelBooking.
async function seatWrite(sessionId, delta) {
  const booked = Number((await call('GET', `/sessions/${sessionId}`, null, 'owner')).body?.fields?.booked?.integerValue ?? 0);
  return patchWrite('sessions', sessionId, { booked: booked + delta });
}
const createAs = (auth, col, id, fields, serverTime = ['createdAt']) => commitAs(auth, [createWrite(col, id, fields, serverTime)]);
// 2026-10-01: a family's booking is the booking plus the session's count + 1 in ONE commit (rules: seatTakenInCommit).
const bookAs = async (auth, id, fields) => commitAs(auth, [createWrite('bookings', id, fields), await seatWrite(fields.sessionId, 1)]);
// A list query as a real user. A refused query answers 403 on the response or inside the stream; both read as 403.
async function listAs(auth, col, filters) {
  const where = { compositeFilter: { op: 'AND', filters: Object.entries(filters).map(([fieldPath, v]) => ({ fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: fsValue(v) } })) } };
  const res = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], ...(Object.keys(filters).length ? { where } : {}) } }) });
  const body = await res.json().catch(() => null);
  const err = Array.isArray(body) ? body.find((r) => r && r.error)?.error : body?.error;
  return err ? err.code : res.status;
}
// Session dates sit a few days out, so the past-session clause (rules: sessionDayNotOver) never decides a case that is
// not about it. taskWindow keeps its fixed December dates: the Nov 1 anchor it probes is a fixed date too.
const dayOut = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const [DAY1, DAY2] = [dayOut(5), dayOut(6)];
/** One `commit` write: an update of `mask` (default: the given fields) plus REQUEST_TIME transforms. */
const updateAs = (auth, col, id, fields, mask = Object.keys(fields), serverTime = []) => commitAs(auth, [patchWrite(col, id, fields, mask, serverTime)]);
// Single token: s3 sits a day past DAY2, and a single athlete's 'period' charge needs a comp whose period covers the
// session date (rules: compPeriodOk), so the comps follow DAY1 - the month DAY1 falls in, and the month before it.
const DAY3 = dayOut(7);
const monthOf = (y, m) => ({ key: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10) });
const COMP = monthOf(Number(DAY1.slice(0, 4)), Number(DAY1.slice(5, 7)) - 1);
const COMP_PREV = monthOf(Number(DAY1.slice(0, 4)), Number(DAY1.slice(5, 7)) - 2);
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

const uid = { parent: 'p-probe', athlete: 'a-probe', ops: 'ops-probe', kid: 'kid-probe', stranger: 's-probe',
  eliteLogin: 'elite-probe', other: 'p-other-probe', coach: 'coach-probe', frozen: 'pf-probe' };
const t = {
  // 2026-10-01: a paid Elite athlete's own login (its answers hold before the Oct 10 gate), a parent in ANOTHER household, a coach.
  eliteLogin: token(uid.eliteLogin, { email: 'eli@example.com', email_verified: true }),
  other: token(uid.other, { email: 'other@example.com', email_verified: true }),
  coach: token(uid.coach, { email: 'coach@example.com', email_verified: true }),
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
  await seed('users', uid.eliteLogin, { role: 'athlete', athleteId: 'ath-elite', householdId: 'hh' });
  await seed('users', uid.other, { role: 'parent', householdId: 'hh-other', athleteId: null });
  await seed('users', uid.coach, { role: 'coach' });
  await seed('households', 'hh', { name: 'Probe family', periodAnchorDay: 1 });
  await seed('households', 'hh-other', { name: 'Other family', periodAnchorDay: 1 });
  await seed('athletes', 'ath-other', { name: 'ath-other', householdId: 'hh-other', contractMinutes: null, coachId: null, packageId: 'elite', billing: { status: 'active' } });
  for (const [id, extra] of [
    ['ath-active', { packageId: 't-6', billing: { status: 'active' } }],
    ['ath-absent', { packageId: 't-6' }],
    ['ath-pending', { packageId: 't-6', billing: { status: 'pending' } }],
    ['ath-elite', { packageId: 'elite', billing: { status: 'active' } }],
    ['ath-elite-pending', { packageId: 'elite', billing: { status: 'pending' } }],
  ]) await seed('athletes', id, { name: id, householdId: 'hh', contractMinutes: null, coachId: null, ...extra });
  await seed('sessions', 's1', { date: DAY1, time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled' });
  await seed('sessions', 's2', { date: DAY2, time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled' });
  await seed('sessions', 's-full', { date: DAY1, time: '5:00 PM', type: 'training', capacity: 1, booked: 1, status: 'scheduled' });
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
  await seed('sessions', 's3', { date: DAY3, time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled' });
  // 2026-10-01: a session whose day is long over, its one seat counted, for the member-cancel refusal (case 17).
  await seed('sessions', 's-past', { date: '2026-09-01', time: '4:00 PM', type: 'training', capacity: 15, booked: 1, status: 'scheduled' });
  const purchase = (athleteId, expiresAt) => ({ athleteId, householdId: 'hh', expiresAt, reason: 'single-purchase', sourceSessionId: null,
    createdBy: 'stripe', createdAt: new Date() });
  await seed('graceTokens', 'single_cs_probe', purchase('ath-single', '2027-02-27'));
  await seed('graceTokens', 'single_cs_other', purchase('ath-single2', '2027-02-27'));
  await seed('graceTokens', 'single_cs_void', purchase('ath-single', '2000-01-01'));
  await seed('tokenPeriods', `ath-single-legacy_${COMP.key}`, { athleteId: 'ath-single-legacy', periodKey: COMP.key, periodEnd: COMP.end, granted: 1 });
  await seed('tokenPeriods', `ath-single-legacy_${COMP_PREV.key}`, { athleteId: 'ath-single-legacy', periodKey: COMP_PREV.key, periodEnd: COMP_PREV.end, granted: 1 });
  await seed('tokenPeriods', `ath-single_${COMP.key}`, { athleteId: 'ath-single', periodKey: COMP.key, periodEnd: COMP.end, granted: 0 });
}
const booking = (athleteId) => ({ athleteId, sessionId: 's1', date: DAY1, type: 'training', periodKey: '2026-11-01',
  status: 'confirmed', householdId: 'hh', createdBy: uid.parent, chargedFrom: 'period' });
const entry = (athleteId) => ({ sessionId: 's-full', athleteId, householdId: 'hh', date: DAY1, periodKey: '2026-11-01', createdBy: uid.parent });

export async function task4() {
  console.log('Task 4: athlete shape, billing gate, opens-at gate' + (beforeGate ? ' (before Oct 10)' : ' (after Oct 10)'));
  // dob is in the shape the client always writes (live.js createAthlete: dob ?? null) and the rule dereferences it.
  const shape = { name: 'N', householdId: 'hh', dob: null, contractMinutes: null, coachId: null };
  expect('ops creates athlete with handicap 12 + loginEmail', await createAs(t.ops, 'athletes', 'new-1', { ...shape, handicap: 12, loginEmail: 'kid@example.com' }, []), 200);
  expect('handicap 55 refused', await createAs(t.ops, 'athletes', 'new-2', { ...shape, handicap: 55 }, []), 403);
  expect('client-written billing refused', await createAs(t.ops, 'athletes', 'new-3', { ...shape, billing: { status: 'active' } }, []), 403);
  expect('parent cannot create an athlete', await createAs(t.parent, 'athletes', 'new-4', shape, []), 403);
  expect('booking: billing active', await bookAs(t.parent, 'ath-active_s1', booking('ath-active')), beforeGate ? 403 : 200);
  expect('booking: billing absent', await bookAs(t.parent, 'ath-absent_s1', booking('ath-absent')), beforeGate ? 403 : 200);
  expect('booking: billing pending refused', await bookAs(t.parent, 'ath-pending_s1', booking('ath-pending')), 403);
  expect('booking: paid Elite books before the gate', await bookAs(t.parent, 'ath-elite_s1', booking('ath-elite')), 200);
  expect('booking: unpaid Elite refused', await bookAs(t.parent, 'ath-elite-pending_s1', booking('ath-elite-pending')), 403);
  expect('booking: parent + grace token stays under the read cap (paid Elite: open before the gate too)',
    await bookAs(t.parent, 'ath-elite_s2', { ...booking('ath-elite'), sessionId: 's2', date: DAY2, chargedFrom: 'grace', graceTokenId: 'grace-probe' }), 200);
  expect('waitlist: pending refused', await createAs(t.parent, 'waitlist', 's-full_ath-pending', entry('ath-pending'), ['joinedAt']), 403);
  expect('waitlist: paid Elite allowed', await createAs(t.parent, 'waitlist', 's-full_ath-elite', entry('ath-elite'), ['joinedAt']), 200);
  expect('waitlist: active token athlete', await createAs(t.parent, 'waitlist', 's-full_ath-active', entry('ath-active'), ['joinedAt']), beforeGate ? 403 : 200);
}

async function teardown() {
  for (const [c, ids] of Object.entries({ users: Object.values(uid), households: ['hh', 'hh-other', 'hh-frozen'], sessions: ['s1', 's2', 's3', 's-full', 's-past'],
    athletes: ['ath-active', 'ath-absent', 'ath-pending', 'ath-elite', 'ath-elite-pending', 'ath-other', 'new-1', 'new-2', 'new-3', 'new-4',
      'ath-single', 'ath-single2', 'ath-single-legacy', 'ath-moved', 'ath-frozen'],
    bookings: ['ath-active_s1', 'ath-absent_s1', 'ath-pending_s1', 'ath-elite_s1', 'ath-elite-pending_s1', 'ath-elite_s2', 'ath-pending_s-old',
      'ath-single_s1', 'ath-single2_s1', 'ath-single-legacy_s1', 'ath-moved_s1', 'ath-elite_s3', 'ath-single_s2', 'ath-single_s3', 'ath-frozen_s2', 'ath-active_s-past'],
    graceTokens: ['grace-probe', 'single_cs_probe', 'single_cs_other', 'single_cs_void'],
    tokenPeriods: [`ath-single-legacy_${COMP.key}`, `ath-single-legacy_${COMP_PREV.key}`, `ath-single_${COMP.key}`],
    waitlist: ['s-full_ath-pending', 's-full_ath-elite', 's-full_ath-active', 's-full_ath-moved'] })) for (const id of ids) await del(c, id);
}

export async function task5() {
  console.log('Task 5: calendly cancel guard, loginInvites/calendlyEvents reads, household exclusions');
  await seed('bookings', 'ath-active_cal-1', { athleteId: 'ath-active', sessionId: 'cal-1', date: '2026-11-10', type: 'mental', periodKey: '2026-11-01',
    status: 'confirmed', householdId: 'hh', createdBy: 'system', createdAt: new Date(), chargedFrom: 'period', source: 'calendly', calendlyInviteeUri: 'https://api.calendly.com/x' });
  await seed('bookings', 'ath-active_s-portal', { athleteId: 'ath-active', sessionId: 's-portal', date: DAY1, type: 'training', periodKey: '2026-11-01',
    status: 'confirmed', householdId: 'hh', createdBy: uid.parent, createdAt: new Date(), chargedFrom: 'period' });
  // 2026-10-01: each row's session exists with its seat counted, and a family's status flip rides with the count write
  // (live.js cancelBooking / the re-book path), so a refusal below is still the clause its label names.
  await seed('sessions', 's-portal', { date: DAY1, time: '4:00 PM', type: 'training', capacity: 15, booked: 1, status: 'scheduled' });
  await seed('sessions', 'cal-1', { date: '2026-11-10', time: '9:00 AM', type: 'mental', capacity: 1, booked: 1, status: 'scheduled', bookable: false, source: 'calendly' });
  const cancel = async (id, auth) => commitAs(auth, [patchWrite('bookings', id, { status: 'cancelled', cancelledBy: uid.parent, cancelReason: 'member' }), await seatWrite(id.split('_')[1], -1)]);
  expect('member cancel of a portal booking', await cancel('ath-active_s-portal', t.parent), 200);
  expect('member cancel of a calendly booking refused', await cancel('ath-active_cal-1', t.parent), 403);
  // Re-confirming a cancelled row is booking: the same gates as a create
  // (review 2026-09-29). An unpaid athlete's revoked row stays cancelled.
  await seed('bookings', 'ath-pending_s-old', { athleteId: 'ath-pending', sessionId: 's1', date: DAY1, type: 'training', periodKey: '2026-11-01',
    status: 'cancelled', householdId: 'hh', createdBy: uid.parent, createdAt: new Date(), chargedFrom: 'period', cancelledBy: 'system', cancelReason: 'lapsed' });
  const rebook = async (id, auth, sessionId = id.split('_')[1]) => commitAs(auth, [patchWrite('bookings', id, { status: 'confirmed' }), await seatWrite(sessionId, 1)]);
  expect('re-book refused for a pending athlete', await rebook('ath-pending_s-old', t.parent, 's1'), 403);
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
  for (const [c, id] of [['bookings', 'ath-active_cal-1'], ['bookings', 'ath-active_s-portal'], ['bookings', 'ath-pending_s-old'], ['loginInvites', 'kid@example.com'], ['calendlyEvents', 'ev-1'],
    ['sessions', 's-portal'], ['sessions', 'cal-1']]) await del(c, id);
}

export async function taskContract() {
  console.log('Contract Phase 2: contractMinutesUpdateOk takes contractStart (a yyyy-MM-dd string) beside the tier');
  await seed('athletes', 'ath-contract', { name: 'ath-contract', householdId: 'hh', contractMinutes: null, coachId: null, packageId: 't-6' });
  const patchAth = (id, fields, auth) => call('PATCH', `/athletes/${id}?${Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`,
    { fields: fsFields(fields) }, auth).then((r) => r.status);
  expect('parent starts a tier with contractStart', await patchAth('ath-contract', { contractMinutes: 45, contractStart: '2026-11-03' }, t.parent), 200);
  expect('parent changes the tier alone (contractStart untouched)', await patchAth('ath-contract', { contractMinutes: 90 }, t.parent), 200);
  expect('parent clears the tier', await patchAth('ath-contract', { contractMinutes: null }, t.parent), 200);
  // Review 2026-09-30: contractStart moves only on a no-tier -> tier start, never on its own or with a tier change.
  expect('parent starts again with contractStart', await patchAth('ath-contract', { contractMinutes: 45, contractStart: '2026-11-03' }, t.parent), 200);
  expect('contractStart alone on a tiered athlete refused', await patchAth('ath-contract', { contractStart: '2026-12-01' }, t.parent), 403);
  expect('a tier change with a new contractStart refused', await patchAth('ath-contract', { contractMinutes: 90, contractStart: '2026-12-01' }, t.parent), 403);
  expect('athlete cannot move their own contractStart', await patchAth('ath-contract', { contractStart: '2026-12-01' }, t.athlete), 403);
  expect('parent clears the tier again', await patchAth('ath-contract', { contractMinutes: null }, t.parent), 200);
  expect('athlete starts their own tier with contractStart', await patchAth('ath-active', { contractMinutes: 20, contractStart: '2026-12-15' }, t.athlete), 200);
  expect('contractStart not a date refused', await patchAth('ath-contract', { contractMinutes: 45, contractStart: 'Nov 3' }, t.parent), 403);
  expect('contractStart as a number refused', await patchAth('ath-contract', { contractMinutes: 45, contractStart: 20261103 }, t.parent), 403);
  expect('any other field beside the tier refused', await patchAth('ath-contract', { contractMinutes: 45, packageId: 'elite' }, t.parent), 403);
  expect('contractStart beside another field refused', await patchAth('ath-contract', { contractStart: '2026-11-03', coachId: 'c1' }, t.parent), 403);
  expect('a stranger cannot start a tier', await patchAth('ath-contract', { contractMinutes: 45, contractStart: '2026-11-03' }, t.stranger), 403);
  // approveEnrollmentRequest stamps contractStart on a tiered kid it creates; the create rule is hasAll.
  expect('ops approval creates a tiered athlete with contractStart', await createAs(t.ops, 'athletes', 'ath-contract-new',
    { name: 'N', householdId: 'hh', dob: null, contractMinutes: 45, coachId: null, contractStart: '2026-12-15' }, []), 200);
  await del('athletes', 'ath-contract');
  await del('athletes', 'ath-contract-new');
}

// Owner ruling 2026-09-30: every window counts from Nov 1 until then, so the
// outer bound reaches Nov 1 + 46 days (Dec 17) whatever today is. Dec 18 stays
// refused until the clock-based ceiling (today + 46 days) passes it on Nov 2.
export async function taskWindow() {
  const dec18Open = Date.now() + 46 * 86400000 >= Date.UTC(2026, 11, 18);
  console.log('Window: the Nov 1 anchor on the outer booking bound' + (dec18Open ? ' (Nov 2 or later)' : ' (before Nov 2)'));
  for (const [id, date] of [['s-dec16', '2026-12-16'], ['s-dec18', '2026-12-18']]) {
    await seed('sessions', id, { date, time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled' });
  }
  const elite = (sessionId, date) => ({ ...booking('ath-elite'), sessionId, date, periodKey: '2026-12-01', chargedFrom: 'elite' });
  expect('booking: Elite books Dec 16 (Nov 1 + 45)', await bookAs(t.parent, 'ath-elite_s-dec16', elite('s-dec16', '2026-12-16')), 200);
  expect('booking: Dec 18 past the anchored bound', await bookAs(t.parent, 'ath-elite_s-dec18', elite('s-dec18', '2026-12-18')), dec18Open ? 200 : 403);
  // Review 2026-09-30: the anchored ceiling follows the package. A token
  // athlete reaches Dec 1 (Nov 1 + 30, one day of slack) - once the Oct 10
  // gate is open - and Dec 3 stays refused until today + 46 days passes it.
  await seed('sessions', 's-dec1', { date: '2026-12-01', time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled' });
  await seed('sessions', 's-dec3', { date: '2026-12-03', time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled' });
  const tokens = (sessionId, date) => ({ ...booking('ath-active'), sessionId, date, periodKey: '2026-12-01' });
  const dec3Open = Date.now() + 46 * 86400000 >= Date.UTC(2026, 11, 3);
  expect('booking: token athlete books Dec 1 (Nov 1 + 30)', await bookAs(t.parent, 'ath-active_s-dec1', tokens('s-dec1', '2026-12-01')), beforeGate ? 403 : 200);
  expect('booking: token athlete Dec 3 past the anchored token bound', await bookAs(t.parent, 'ath-active_s-dec3', tokens('s-dec3', '2026-12-03')), dec3Open && !beforeGate ? 200 : 403);
  for (const [c, id] of [['bookings', 'ath-elite_s-dec16'], ['bookings', 'ath-elite_s-dec18'], ['bookings', 'ath-active_s-dec1'], ['bookings', 'ath-active_s-dec3'],
    ['sessions', 's-dec16'], ['sessions', 's-dec18'], ['sessions', 's-dec1'], ['sessions', 's-dec3']]) await del(c, id);
}

// Owner report 2026-09-30: Repeat weekly's copies carry createdVia 'repeat'
// so onBookingCreated sends no notice per week - the shape admits that one
// value and nothing else. Paid Elite, so both answers hold before the gate too.
export async function taskRepeat() {
  console.log("Repeat: bookingShapeOk admits createdVia 'repeat', nothing else");
  const [rep1, rep2, rep3] = [dayOut(7), dayOut(8), dayOut(9)];
  for (const [id, date] of [['s-rep1', rep1], ['s-rep2', rep2], ['s-rep3', rep3]]) {
    await seed('sessions', id, { date, time: '4:00 PM', type: 'training', capacity: 15, booked: 0, status: 'scheduled' });
  }
  const elite = (sessionId, date, extra) => ({ ...booking('ath-elite'), sessionId, date, chargedFrom: 'elite', ...extra });
  expect("booking: createdVia 'repeat' accepted", await bookAs(t.parent, 'ath-elite_s-rep1', elite('s-rep1', rep1, { createdVia: 'repeat' })), 200);
  expect('booking: any other createdVia refused', await bookAs(t.parent, 'ath-elite_s-rep2', elite('s-rep2', rep2, { createdVia: 'auto' })), 403);
  expect('booking: no createdVia (a single tap) still accepted', await bookAs(t.parent, 'ath-elite_s-rep3', elite('s-rep3', rep3)), 200);
  for (const id of ['s-rep1', 's-rep2', 's-rep3']) {
    await del('bookings', `ath-elite_${id}`);
    await del('sessions', id);
  }
}

// Tester S4 (2026-09-30): before the first payment the family may switch the
// package picked at sign-up - pendingPackageUpdateOk.
export async function taskPackageChange() {
  console.log('Package change: the family switches a never-paid package - only packageId (+ server updatedAt), only monthly');
  const selfUid = 'self-probe';
  const self = token(selfUid, { email: 'sam@example.com', email_verified: true });
  await seed('users', selfUid, { role: 'athlete', athleteId: 'ath-pkg-self', householdId: 'hh-self' });
  await seed('households', 'hh-self', { name: 'Self', periodAnchorDay: 1, createdBy: selfUid });
  // A child's claimed login in the parent's household (review 2026-09-30: never the payer).
  const kidUid = 'kid-pkg-probe';
  const kidLogin = token(kidUid, { email: 'kid-pkg@example.com', email_verified: true });
  await seed('users', kidUid, { role: 'athlete', athleteId: 'ath-pkg-kid', householdId: 'hh' });
  const athletes = [['ath-pkg-pending', 'hh', 'pending'], ['ath-pkg-active', 'hh', 'active'], ['ath-pkg-pastdue', 'hh', 'past_due'],
    ['ath-pkg-lapsed', 'hh', 'lapsed'], ['ath-pkg-absent', 'hh', null], ['ath-pkg-self', 'hh-self', 'pending'],
    ['ath-pkg-kid', 'hh', 'pending']];
  for (const [id, householdId, status] of athletes) {
    await seed('athletes', id, { name: id, householdId, contractMinutes: null, coachId: null, packageId: 'elite', ...(status ? { billing: { status } } : {}) });
  }
  const patchAth = (id, fields, auth) => call('PATCH', `/athletes/${id}?${Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`,
    { fields: fsFields(fields) }, auth).then((r) => r.status);
  // live.js changePendingPackage's write: packageId plus updatedAt = serverTimestamp() (REQUEST_TIME).
  const stamped = async (id, fields, auth) => {
    const name = `projects/${PROJECT}/databases/(default)/documents/athletes/${id}`;
    const res = await fetch(`http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents:commit`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
      body: JSON.stringify({ writes: [{ update: { name, fields: fsFields(fields) }, updateMask: { fieldPaths: Object.keys(fields) },
        currentDocument: { exists: true }, updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] }] }),
    });
    return res.status;
  };
  expect('parent switches a pending athlete, Elite -> 6 tokens', await patchAth('ath-pkg-pending', { packageId: 't-6' }, t.parent), 200);
  expect('parent switches again with the server updatedAt (the client write)', await stamped('ath-pkg-pending', { packageId: 't-12' }, t.parent), 200);
  expect('parent switches back to Elite', await stamped('ath-pkg-pending', { packageId: 'elite' }, t.parent), 200);
  expect('the one-time single token refused', await patchAth('ath-pkg-pending', { packageId: 'single' }, t.parent), 403);
  expect('a retired package refused', await patchAth('ath-pkg-pending', { packageId: 't-20' }, t.parent), 403);
  expect('a client-chosen updatedAt refused', await patchAth('ath-pkg-pending', { packageId: 't-16', updatedAt: new Date('2026-01-01T00:00:00Z') }, t.parent), 403);
  expect('packageId beside billing refused', await patchAth('ath-pkg-pending', { packageId: 't-16', billing: { status: 'active' } }, t.parent), 403);
  expect('packageId beside facilityAccess refused', await patchAth('ath-pkg-pending', { packageId: 't-16', facilityAccess: true }, t.parent), 403);
  // The sign-up facility add-on request (owner 2026-09-30) is written by createFamily / addAthletes only - no rules change.
  expect('facilityRequested alone refused (server-written)', await patchAth('ath-pkg-pending', { facilityRequested: true }, t.parent), 403);
  expect('packageId beside facilityRequested refused', await patchAth('ath-pkg-pending', { packageId: 't-16', facilityRequested: false }, t.parent), 403);
  expect('the athlete cannot request it on their own doc either', await patchAth('ath-pkg-self', { facilityRequested: true }, self), 403);
  for (const [id, label] of [['ath-pkg-active', 'active'], ['ath-pkg-pastdue', 'past_due'], ['ath-pkg-lapsed', 'lapsed'], ['ath-pkg-absent', 'absent (== active)']]) {
    expect(`refused when billing is ${label}`, await patchAth(id, { packageId: 't-6' }, t.parent), 403);
  }
  expect('the 18+ athlete switches their own pending package', await stamped('ath-pkg-self', { packageId: 't-16' }, self), 200);
  expect('an athlete cannot switch another athlete in the household', await patchAth('ath-pkg-pending', { packageId: 't-6' }, t.athlete), 403);
  expect("a child's own login cannot switch the package the parent pays for", await stamped('ath-pkg-kid', { packageId: 't-6' }, kidLogin), 403);
  expect("a parent cannot switch another family's athlete", await patchAth('ath-pkg-self', { packageId: 't-6' }, t.parent), 403);
  expect('a stranger cannot switch', await patchAth('ath-pkg-pending', { packageId: 't-6' }, t.stranger), 403);
  expect('ops still assigns any package (the staff branch)', await patchAth('ath-pkg-active', { packageId: 'single' }, t.ops), 200);
  for (const [id] of athletes) await del('athletes', id);
  await del('households', 'hh-self');
  await del('users', kidUid);
  await del('users', selfUid);
}

// Tester Mike 2026-09-30: "cancel this and the later weeks" marks each week's
// cancel cancelledVia 'series' so onBookingCancelled sends no notice per week.
// memberBookingUpdateOk admits that one value, on the cancel direction only.
// Paid Elite rows where a re-book is tried, so its answer holds before the gate too.
export async function taskSeriesCancel() {
  console.log("Series cancel: a family cancel may carry cancelledVia 'series', nothing else, and no other write sets it");
  const rows = [['ath-elite_ser-1', 'confirmed'], ['ath-active_ser-2', 'confirmed'], ['ath-elite_ser-3', 'confirmed'], ['ath-elite_ser-4', 'confirmed'], ['ath-elite_ser-5', 'cancelled']];
  for (const [id, status] of rows) {
    await seed('bookings', id, { athleteId: id.split('_')[0], sessionId: id.split('_')[1], date: DAY1, type: 'training', periodKey: '2026-11-01',
      status, householdId: 'hh', createdBy: uid.parent, createdAt: new Date(), chargedFrom: id.startsWith('ath-elite') ? 'elite' : 'period',
      ...(status === 'cancelled' ? { cancelledBy: uid.parent, cancelReason: 'member' } : {}) });
    await seed('sessions', id.split('_')[1], { date: DAY1, time: '4:00 PM', type: 'training', capacity: 15, booked: 1, status: 'scheduled' });
  }
  // `mask` names the fields the write touches; a masked field with no value is a delete. 2026-10-01: a family's status
  // flip carries the session's count write in the same commit, as live.js writes it (cancel - 1, re-book + 1); the
  // academy's session cancel never touches the count. So every refusal below is still the clause its label names.
  const patch = async (id, fields, auth, mask = Object.keys(fields)) => {
    const seat = auth === t.ops || !fields.status ? 0 : fields.status === 'cancelled' ? -1 : 1;
    return commitAs(auth, [patchWrite('bookings', id, fields, mask), ...(seat ? [await seatWrite(id.split('_')[1], seat)] : [])]);
  };
  const cancelBy = (who, extra) => ({ status: 'cancelled', cancelledBy: uid[who], cancelReason: 'member', ...extra });
  // live.js cancelBooking's single cancel: the three fields plus cancelledVia: deleteField().
  const single = ['status', 'cancelledBy', 'cancelReason', 'cancelledVia'];
  expect("parent cancels with cancelledVia 'series'", await patch('ath-elite_ser-1', cancelBy('parent', { cancelledVia: 'series' }), t.parent), 200);
  expect("athlete cancels their own with cancelledVia 'series'", await patch('ath-active_ser-2', cancelBy('athlete', { cancelledVia: 'series' }), t.athlete), 200);
  expect('any other cancelledVia refused', await patch('ath-elite_ser-3', cancelBy('parent', { cancelledVia: 'bulk' }), t.parent), 403);
  expect('cancelledVia null refused', await patch('ath-elite_ser-3', cancelBy('parent', { cancelledVia: null }), t.parent), 403);
  expect('cancelledVia true refused', await patch('ath-elite_ser-3', cancelBy('parent', { cancelledVia: true }), t.parent), 403);
  expect("'series' with another user's cancelledBy refused (every earlier clause holds)", await patch('ath-elite_ser-3', cancelBy('athlete', { cancelledVia: 'series' }), t.parent), 403);
  expect("'series' with another cancelReason refused", await patch('ath-elite_ser-3', { ...cancelBy('parent', { cancelledVia: 'series' }), cancelReason: 'session-cancelled' }, t.parent), 403);
  expect("a stranger cannot cancel with 'series'", await patch('ath-elite_ser-3', { ...cancelBy('parent', { cancelledVia: 'series' }), cancelledBy: uid.stranger }, t.stranger), 403);
  expect('a single cancel (the client write: no marker to remove) still accepted', await patch('ath-elite_ser-3', cancelBy('parent'), t.parent, single), 200);
  // Non-cancel writes cannot set the field.
  expect('cancelledVia alone on a confirmed booking refused', await patch('ath-elite_ser-4', { cancelledVia: 'series' }, t.parent), 403);
  expect('a re-book cannot set cancelledVia', await patch('ath-elite_ser-5', { status: 'confirmed', cancelledVia: 'series' }, t.parent), 403);
  expect('cancelledVia alone on a cancelled booking refused', await patch('ath-elite_ser-5', { cancelledVia: 'series' }, t.parent), 403);
  expect("the academy's session cancel cannot carry it", await patch('ath-elite_ser-4', { status: 'cancelled', cancelledBy: uid.ops, cancelReason: 'session-cancelled', cancelledVia: 'series' }, t.ops), 403);
  expect("the academy's session cancel without it still accepted", await patch('ath-elite_ser-4', { status: 'cancelled', cancelledBy: uid.ops, cancelReason: 'session-cancelled' }, t.ops), 200);
  // A series-cancelled row that is booked again keeps the marker (a re-book
  // writes status alone); the next single cancel removes it, so its notice goes.
  expect('re-book of a series-cancelled row (status alone)', await patch('ath-elite_ser-1', { status: 'confirmed' }, t.parent), 200);
  expect('a single cancel removes the old series marker', await patch('ath-elite_ser-1', cancelBy('parent'), t.parent, single), 200);
  expect('the marker is gone', (await call('GET', '/bookings/ath-elite_ser-1', null, 'owner')).body?.fields?.cancelledVia, undefined);
  for (const [id] of rows) { await del('bookings', id); await del('sessions', id.split('_')[1]); }
}

// Waitlist audit 2026-10-01 ("the rules do not protect capacity"): a family's booking, cancel and re-book each land
// with the session's count moving the same way in the same commit (seatTakenInCommit / seatFreedInCommit), and the
// count is moved by a family account only (bookedMoverOk). Paid Elite rows, so every answer holds before the gate too.
export async function taskSeats() {
  console.log('Seats: a booking, cancel or re-book lands with its count write or not at all; a bare count change is refused');
  for (const id of ['s-seat', 's-seat2']) await seed('sessions', id, { date: DAY1, time: '4:00 PM', type: 'training', capacity: 3, booked: 1, status: 'scheduled' });
  const row = (sessionId, who = 'parent') => ({ ...booking('ath-elite'), sessionId, chargedFrom: 'elite', createdBy: uid[who] });
  const id = 'ath-elite_s-seat';
  const flip = async (fields, auth, seat) => commitAs(auth, [patchWrite('bookings', id, fields), ...(seat ? [await seatWrite('s-seat', seat)] : [])]);
  const cancelled = (who) => ({ status: 'cancelled', cancelledBy: uid[who], cancelReason: 'member' });
  const bare = async (auth, delta) => commitAs(auth, [await seatWrite('s-seat', delta)]);
  expect('booking with no count write refused', await createAs(t.parent, 'bookings', id, row('s-seat')), 403);
  expect('booking with the count going DOWN refused', await commitAs(t.parent, [createWrite('bookings', id, row('s-seat')), await seatWrite('s-seat', -1)]), 403);
  expect('parent books: booking and count + 1 in one commit', await bookAs(t.parent, id, row('s-seat')), 200);
  expect('booking a full session refused even with its count write', await bookAs(t.parent, 'ath-elite_s-full', row('s-full')), 403);
  expect('cancel with no count write refused', await flip(cancelled('parent'), t.parent, 0), 403);
  expect('cancel with the count going UP refused', await flip(cancelled('parent'), t.parent, 1), 403);
  expect('parent cancels: status and count - 1 in one commit', await flip(cancelled('parent'), t.parent, -1), 200);
  expect('re-book with no count write refused', await flip({ status: 'confirmed' }, t.parent, 0), 403);
  expect('parent re-books: status and count + 1 in one commit', await flip({ status: 'confirmed' }, t.parent, 1), 200);
  expect('athlete login cancels its own booking with the count', await flip(cancelled('eliteLogin'), t.eliteLogin, -1), 200);
  expect('athlete login re-book with no count write refused', await flip({ status: 'confirmed' }, t.eliteLogin, 0), 403);
  expect('athlete login re-books its own booking with the count', await flip({ status: 'confirmed' }, t.eliteLogin, 1), 200);
  expect('athlete login booking with no count write refused', await createAs(t.eliteLogin, 'bookings', 'ath-elite_s-seat2', row('s-seat2', 'eliteLogin')), 403);
  expect('athlete login books: booking and count + 1 in one commit', await bookAs(t.eliteLogin, 'ath-elite_s-seat2', row('s-seat2', 'eliteLogin')), 200);
  // The count alone (s-seat reads 2 of 3 here, so one step either way is a legal value and only WHO and WHY decide).
  expect('bare count - 1 from an athlete login refused', await bare(t.eliteLogin, -1), 403);
  expect('bare count + 1 from an athlete login refused', await bare(t.eliteLogin, 1), 403);
  expect('bare count - 1 from a login with no role refused', await bare(t.stranger, -1), 403);
  expect('bare count - 1 from ops refused (staff never move the count)', await bare(t.ops, -1), 403);
  expect('bare count - 1 from a coach refused', await bare(t.coach, -1), 403);
  // Not closable in rules: the session write cannot name which child's booking changed. Promotion must not trust the count alone.
  expect('KNOWN GAP - a bare count - 1 from a parent is still accepted', await bare(t.parent, -1), 200);
  for (const [c, d] of [['bookings', id], ['bookings', 'ath-elite_s-seat2'], ['sessions', 's-seat'], ['sessions', 's-seat2']]) await del(c, d);
}

// Owner ruling R2 (2026-10-01): a session whose day is over cannot be booked, re-booked or waitlisted. The rule's
// cut-off is the session date at 00:00 UTC + 30 hours: midnight Chicago in winter (CST), 01:00 in summer (CDT).
export async function taskPast() {
  console.log('Past sessions: no booking, re-book or waitlist join once the session day is over');
  const days = { 'p-old': dayOut(-2), 'p-yday': dayOut(-1), 'p-today': dayOut(0), 'p-soon': dayOut(2) };
  for (const [id, date] of Object.entries(days)) await seed('sessions', id, { date, time: '4:00 PM', type: 'training', capacity: 15, booked: 1, status: 'scheduled' });
  await seed('sessions', 'p-old-full', { date: days['p-old'], time: '5:00 PM', type: 'training', capacity: 1, booked: 1, status: 'scheduled' });
  const row = (sessionId) => ({ ...booking('ath-elite'), sessionId, date: days[sessionId], chargedFrom: 'elite' });
  const ydayOpen = Date.now() < Date.parse(`${days['p-yday']}T00:00:00Z`) + 30 * 3600000;
  expect('booking a session two days back refused', await bookAs(t.parent, 'ath-elite_p-old', row('p-old')), 403);
  expect("booking yesterday's UTC date: open only until 06:00 UTC (midnight CST)", await bookAs(t.parent, 'ath-elite_p-yday', row('p-yday')), ydayOpen ? 200 : 403);
  expect('booking a session dated today accepted', await bookAs(t.parent, 'ath-elite_p-today', row('p-today')), 200);
  expect('booking a session two days out accepted', await bookAs(t.parent, 'ath-elite_p-soon', row('p-soon')), 200);
  await seed('bookings', 'ath-elite_p-old', { ...row('p-old'), status: 'cancelled', createdAt: new Date(), cancelledBy: uid.parent, cancelReason: 'member' });
  expect('re-book on a session two days back refused', await commitAs(t.parent, [patchWrite('bookings', 'ath-elite_p-old', { status: 'confirmed' }), await seatWrite('p-old', 1)]), 403);
  expect('waitlist join on a full session two days back refused',
    await createAs(t.parent, 'waitlist', 'p-old-full_ath-elite', { ...entry('ath-elite'), sessionId: 'p-old-full', date: days['p-old'] }, ['joinedAt']), 403);
  for (const id of Object.keys(days)) { await del('bookings', `ath-elite_${id}`); await del('sessions', id); }
  await del('sessions', 'p-old-full');
  await del('waitlist', 'p-old-full_ath-elite');
}

// Waitlist audit 2026-10-01: the read is household-scoped like bookings (it was any signed-in account), and a join
// is refused on a 'mental' session and for an athlete already booked on the session. A normal join and leave pass.
export async function taskWaitlist() {
  console.log("Waitlist: household-scoped read, no 'mental' session, no entry beside a live booking; join and leave still pass");
  const full = (extra) => ({ date: DAY1, time: '5:00 PM', type: 'training', capacity: 1, booked: 1, status: 'scheduled', ...extra });
  for (const [id, extra] of [['w-open', {}], ['w-mental', { type: 'mental' }], ['w-booked', {}], ['w-rebook', {}]]) await seed('sessions', id, full(extra));
  const wl = (sessionId, athleteId, extra = {}) => ({ ...entry(athleteId), sessionId, ...extra });
  const join = (auth, sessionId, athleteId, extra) => createAs(auth, 'waitlist', `${sessionId}_${athleteId}`, wl(sessionId, athleteId, extra), ['joinedAt']);
  const leave = (auth, id) => call('DELETE', `/waitlist/${id}`, null, auth).then((r) => r.status);
  const get = (auth, id) => call('GET', `/waitlist/${id}`, null, auth).then((r) => r.status);
  expect('parent joins a full session', await join(t.parent, 'w-open', 'ath-elite'), 200);
  expect('a second join for the same athlete refused (an update, never granted)', (await call('PATCH', '/waitlist/w-open_ath-elite', { fields: fsFields(wl('w-open', 'ath-elite')) }, t.parent)).status, 403);
  expect("another household's parent cannot remove it", await leave(t.other, 'w-open_ath-elite'), 403);
  expect('parent leaves', await leave(t.parent, 'w-open_ath-elite'), 200);
  expect('athlete login joins for itself', await join(t.eliteLogin, 'w-open', 'ath-elite', { createdBy: uid.eliteLogin }), 200);
  expect('athlete login leaves', await leave(t.eliteLogin, 'w-open_ath-elite'), 200);
  expect("another household's parent cannot join this family's athlete", await join(t.other, 'w-open', 'ath-elite', { createdBy: uid.other }), 403);
  expect("join on a 'mental' session refused", await join(t.parent, 'w-mental', 'ath-elite'), 403);
  const held = (sessionId, status) => seed('bookings', `ath-elite_${sessionId}`, { ...booking('ath-elite'), sessionId, status, chargedFrom: 'elite', createdAt: new Date() });
  await held('w-booked', 'confirmed');
  await held('w-rebook', 'cancelled');
  expect('join refused while the athlete holds a booking on the session', await join(t.parent, 'w-booked', 'ath-elite'), 403);
  expect('join accepted when that booking is cancelled', await join(t.parent, 'w-rebook', 'ath-elite'), 200);
  // Reads. Three entries on one session: the athlete login's own, a sibling's, and another household's.
  for (const [athleteId, householdId] of [['ath-active', 'hh'], ['ath-elite', 'hh'], ['ath-other', 'hh-other']]) {
    await seed('waitlist', `w-open_${athleteId}`, { ...wl('w-open', athleteId), householdId, joinedAt: new Date() });
  }
  expect("parent reads its household's entry", await get(t.parent, 'w-open_ath-active'), 200);
  expect("parent cannot read another household's entry", await get(t.parent, 'w-open_ath-other'), 403);
  expect("another household's parent cannot read this family's entry", await get(t.other, 'w-open_ath-active'), 403);
  expect('athlete login reads its own entry', await get(t.athlete, 'w-open_ath-active'), 200);
  expect("athlete login cannot read a sibling's entry", await get(t.athlete, 'w-open_ath-elite'), 403);
  expect('a login with no role cannot read an entry', await get(t.stranger, 'w-open_ath-active'), 403);
  expect('coach reads any entry', await get(t.coach, 'w-open_ath-other'), 200);
  expect('ops reads any entry', await get(t.ops, 'w-open_ath-other'), 200);
  expect("a missing entry in the parent's own keyspace reads as not found", await get(t.parent, 'w-none_ath-active'), 404);
  expect("a missing entry in another household's keyspace refused", await get(t.other, 'w-none_ath-active'), 403);
  expect('parent lists by its householdId', await listAs(t.parent, 'waitlist', { householdId: 'hh' }), 200);
  expect('parent lists by athleteId + its householdId', await listAs(t.parent, 'waitlist', { athleteId: 'ath-active', householdId: 'hh' }), 200);
  expect('parent list by athleteId alone refused', await listAs(t.parent, 'waitlist', { athleteId: 'ath-active' }), 403);
  expect('parent list by sessionId (the old position query) refused', await listAs(t.parent, 'waitlist', { sessionId: 'w-open' }), 403);
  expect("parent list by another household's id refused", await listAs(t.parent, 'waitlist', { householdId: 'hh-other' }), 403);
  expect('athlete login lists by its own athleteId', await listAs(t.athlete, 'waitlist', { athleteId: 'ath-active' }), 200);
  expect("athlete login list by a sibling's athleteId refused", await listAs(t.athlete, 'waitlist', { athleteId: 'ath-elite' }), 403);
  expect('athlete login list by householdId refused', await listAs(t.athlete, 'waitlist', { householdId: 'hh' }), 403);
  expect('athlete login list by sessionId refused', await listAs(t.athlete, 'waitlist', { sessionId: 'w-open' }), 403);
  expect('a login with no role cannot list', await listAs(t.stranger, 'waitlist', {}), 403);
  expect('ops lists a session queue', await listAs(t.ops, 'waitlist', { sessionId: 'w-open' }), 200);
  expect('coach lists a session queue', await listAs(t.coach, 'waitlist', { sessionId: 'w-open' }), 200);
  for (const id of ['w-open_ath-active', 'w-open_ath-elite', 'w-open_ath-other', 'w-rebook_ath-elite']) await del('waitlist', id);
  for (const id of ['w-open', 'w-mental', 'w-booked', 'w-rebook']) await del('sessions', id);
  for (const id of ['ath-elite_w-booked', 'ath-elite_w-rebook']) await del('bookings', id);
}

// Owner 2026-10-01 ("build that into the admin screen of the portal"): scholarshipApplications is the OWNER's alone -
// a child's date of birth and a family's finances. Read (get and list) and the decision are refused to every other
// role; the decision is status + decidedBy (the caller) + decidedAt (server time), or a reopen that removes both, and
// nothing else on the doc is client-writable. scholarshipMeta (the function's daily counter) is closed to everyone.
// No clock or gate in any answer, and it seeds and removes everything it touches, so it reads the same in every pass.
export async function taskScholarship() {
  console.log('Scholarships: owner-only read and decision (status, decidedBy, decidedAt and nothing else); scholarshipMeta closed to every client');
  const col = 'scholarshipApplications';
  const [id, day] = ['app-probe', '2026-10-02'];
  const owners = { owner: 'owner-probe', owner2: 'owner2-probe' };
  for (const u of Object.values(owners)) await seed('users', u, { role: 'owner' });
  const owner = token(owners.owner, { email: 'owner@example.com', email_verified: true });
  const owner2 = token(owners.owner2, { email: 'owner2@example.com', email_verified: true });
  // A specialist (role 'mental' with a specialistId): staff on most of this file's read lists, and on neither clause here.
  const specialistUid = 'mental-probe';
  await seed('users', specialistUid, { role: 'mental', specialistId: 'mental' });
  const specialist = token(specialistUid, { email: 'mental@example.com', email_verified: true });
  // The function's own shape (functions/portal/scholarship.js), status 'new'.
  const application = { parent: 'Dana Hart', relationship: 'Parent', email: 'dana@example.com', phone: '612-555-0100', athlete: 'Sam Hart', dob: '2012-05-01',
    school: '', grade: '8', average: '82.1', handicap: '', events: '', package: '12 tokens', level: 'Partial', need: '',
    statement: 'Sam tries hard, trains smart and backs his teammates.', season: '2026-27', status: 'new', submissions: 1,
    createdAtMs: 1790953200000, updatedAtMs: 1790953200000, email_status: 'sent' };
  await seed(col, id, application);
  await seed('scholarshipMeta', day, { count: 3 });

  // Reads. A signed-out caller sends no Authorization header at all (the shared helpers always send one).
  const anon = async (path, body) => {
    const res = await fetch(`${BASE}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => null);
    const err = Array.isArray(json) ? json.find((r) => r && r.error)?.error : json?.error;
    return err ? err.code : res.status;
  };
  const get = (auth, c = col, d = id) => call('GET', `/${c}/${d}`, null, auth).then((r) => r.status);
  expect('owner reads one application', await get(owner), 200);
  expect('owner lists every application', await listAs(owner, col, {}), 200);
  expect('a second owner reads it too', await get(owner2), 200);
  for (const [who, auth] of [['ops', t.ops], ['coach', t.coach], ['specialist', specialist], ['parent', t.parent], ['athlete', t.athlete], ['a login with no role', t.stranger]]) {
    expect(`${who}: read refused`, await get(auth), 403);
    expect(`${who}: list refused`, await listAs(auth, col, {}), 403);
  }
  expect('signed out: read refused', await anon(`/${col}/${id}`), 403);
  expect('signed out: list refused', await anon(':runQuery', { structuredQuery: { from: [{ collectionId: col }] } }), 403);

  // The decision, written as hooks/scholarships.js decideScholarship writes it (a transaction's update): the mask is the
  // plain fields, serverTimestamp() is a REQUEST_TIME transform beside it, and deleteField() is a masked field with no value.
  const decideAs = (auth, fields, mask = Object.keys(fields)) => commitAs(auth, [{ ...patchWrite(col, id, fields, mask),
    updateTransforms: [{ fieldPath: 'decidedAt', setToServerValue: 'REQUEST_TIME' }] }]);
  const reopenAs = (auth) => commitAs(auth, [patchWrite(col, id, { status: 'new' }, ['status', 'decidedBy', 'decidedAt'])]);
  const patchAs = (auth, fields, mask = Object.keys(fields)) => commitAs(auth, [patchWrite(col, id, fields, mask)]);
  // What is stored, read back past the rules: 'status|decidedBy|decidedAt is a timestamp|the answers are untouched'.
  const stored = async () => {
    const f = (await call('GET', `/${col}/${id}`, null, 'owner')).body?.fields ?? {};
    const untouched = f.email?.stringValue === application.email && f.statement?.stringValue === application.statement && f.level?.stringValue === application.level
      && f.submissions?.integerValue === '1' && f.updatedAtMs?.integerValue === String(application.updatedAtMs);
    return `${f.status?.stringValue}|${f.decidedBy?.stringValue ?? 'none'}|${f.decidedAt?.timestampValue ? 'stamped' : 'none'}|${untouched ? 'untouched' : 'CHANGED'}`;
  };
  expect('owner approves: status + decidedBy (own uid) + decidedAt (server time)', await decideAs(owner, { status: 'approved', decidedBy: owners.owner }), 200);
  expect('stored as approved by that owner, stamped, answers untouched', await stored(), `approved|${owners.owner}|stamped|untouched`);
  // A decided application cannot be flipped under its old stamp: every decision carries its own decidedBy and decidedAt.
  expect('status-only flip (approved to declined) by the same owner refused: decidedAt would be the old moment', await patchAs(owner, { status: 'declined' }), 403);
  expect("status-only flip by a second owner refused: decidedBy would still be the first owner's", await patchAs(owner2, { status: 'declined' }), 403);
  expect('a flip that renames decidedBy but keeps the old decidedAt refused', await patchAs(owner2, { status: 'declined', decidedBy: owners.owner2 }), 403);
  expect('still approved by the first owner after the refused flips', await stored(), `approved|${owners.owner}|stamped|untouched`);
  expect('reopen that leaves decidedBy and decidedAt behind refused', await patchAs(owner, { status: 'new' }), 403);
  expect('reopen that removes decidedBy but keeps decidedAt refused', await patchAs(owner, { status: 'new' }, ['status', 'decidedBy']), 403);
  expect('owner declines', await decideAs(owner, { status: 'declined', decidedBy: owners.owner }), 200);
  expect('stored as declined by that owner, stamped, answers untouched', await stored(), `declined|${owners.owner}|stamped|untouched`);
  expect('a second owner decides in their own name', await decideAs(owner2, { status: 'approved', decidedBy: owners.owner2 }), 200);
  expect('stored as approved by the second owner', await stored(), `approved|${owners.owner2}|stamped|untouched`);
  expect("owner reopens: status 'new', decidedBy and decidedAt removed", await reopenAs(owner), 200);
  expect('stored as new with no decision fields, answers untouched', await stored(), 'new|none|none|untouched');

  // Refused. The doc is 'new' with no decision fields from here on, so each refusal is the clause its label names.
  expect("a decision carrying someone else's uid in decidedBy refused", await decideAs(owner, { status: 'approved', decidedBy: owners.owner2 }), 403);
  expect('a decision with no decidedBy refused', await decideAs(owner, { status: 'approved' }), 403);
  expect('a decision with a client-chosen decidedAt refused',
    await patchAs(owner, { status: 'approved', decidedBy: owners.owner, decidedAt: new Date('2026-01-01T00:00:00Z') }), 403);
  expect('a decision with no decidedAt refused', await patchAs(owner, { status: 'approved', decidedBy: owners.owner }), 403);
  for (const status of ['waitlisted', 'paid', '', null]) {
    expect(`a status outside the three (${JSON.stringify(status)}) refused`, await decideAs(owner, { status, decidedBy: owners.owner }), 403);
  }
  expect("status 'new' beside a decidedBy and decidedAt refused", await decideAs(owner, { status: 'new', decidedBy: owners.owner }), 403);
  for (const [field, value] of [['email', 'someone@example.com'], ['statement', 'Rewritten.'], ['level', 'Full'], ['submissions', 9], ['updatedAtMs', 1], ['email_status', 'failed'], ['note', 'x']]) {
    expect(`owner editing ${field} alone refused`, await patchAs(owner, { [field]: value }), 403);
    expect(`owner editing ${field} inside an otherwise valid decision refused`, await decideAs(owner, { status: 'approved', decidedBy: owners.owner, [field]: value }), 403);
  }
  expect('owner removing an answer (need) refused', await patchAs(owner, {}, ['need']), 403);
  expect('owner create refused', await createAs(owner, col, 'app-new', application, []), 403);
  expect('owner delete refused', (await call('DELETE', `/${col}/${id}`, null, owner)).status, 403);
  for (const [who, auth, by] of [['ops', t.ops, uid.ops], ['coach', t.coach, uid.coach], ['specialist', specialist, specialistUid], ['parent', t.parent, uid.parent]]) {
    expect(`${who} decision (the exact shape, in their own name) refused`, await decideAs(auth, { status: 'approved', decidedBy: by }), 403);
  }
  expect('ops reopen refused', await reopenAs(t.ops), 403);
  expect('nothing refused above was written', await stored(), 'new|none|none|untouched');

  // scholarshipMeta: the function's counter, closed to every client - the owner included.
  expect('scholarshipMeta: owner read refused', await get(owner, 'scholarshipMeta', day), 403);
  expect('scholarshipMeta: owner list refused', await listAs(owner, 'scholarshipMeta', {}), 403);
  expect('scholarshipMeta: owner update refused', await commitAs(owner, [patchWrite('scholarshipMeta', day, { count: 0 })]), 403);
  expect('scholarshipMeta: owner create refused', await createAs(owner, 'scholarshipMeta', '2026-10-03', { count: 1 }, []), 403);
  expect('scholarshipMeta: owner delete refused', (await call('DELETE', `/scholarshipMeta/${day}`, null, owner)).status, 403);
  expect('scholarshipMeta: ops read refused', await get(t.ops, 'scholarshipMeta', day), 403);
  expect('scholarshipMeta: the counter is untouched', (await call('GET', `/scholarshipMeta/${day}`, null, 'owner')).body?.fields?.count?.integerValue, '3');

  for (const [c, d] of [[col, id], [col, 'app-new'], ['scholarshipMeta', day], ['scholarshipMeta', '2026-10-03'], ...[...Object.values(owners), specialistUid].map((u) => ['users', u])]) await del(c, d);
}

/**
 * The single-token cases (rulesChanges 1-19). Case 15 is task5's monthly
 * status-only re-book, 17's future-session half is task5's member cancel and
 * 18 is task4's 'booking: billing active'. Refusals run before the create that
 * succeeds on the same doc id, so each 403 is refused for its own reason.
 * 2026-10-01 (merged onto the waitlist audit): every booking, re-book and
 * cancel below carries the session's count write in the same commit, as
 * live.js writes it (rules: seatTakenInCommit / seatFreedInCommit), so a
 * refusal is still the clause its label names. Sessions sit a few days out
 * (DAY1-DAY3) and the comps follow DAY1 (COMP, COMP_PREV).
 */
export async function taskSingle() {
  console.log('Single token: charge, billing, re-book and cancel gates' + (beforeGate ? ' (before Oct 10)' : ' (after Oct 10)'));
  const open = beforeGate ? 403 : 200;
  // A single athlete's booking names the period its session date falls in: the comp lookup is keyed on it.
  const row = (athleteId, over = {}) => ({ ...booking(athleteId), periodKey: COMP.key, ...over });
  const grace = (athleteId, graceTokenId, over = {}) => row(athleteId, { chargedFrom: 'grace', graceTokenId, ...over });
  const mk = (id, fields) => bookAs(t.parent, id, fields);
  expect('2. single: another athlete\'s token refused', await mk('ath-single_s1', grace('ath-single', 'single_cs_other')), 403);
  expect('3. single: a voided token refused', await mk('ath-single_s1', grace('ath-single', 'single_cs_void')), 403);
  expect('4. single: grace with no token id refused', await mk('ath-single_s1', row('ath-single', { chargedFrom: 'grace' })), 403);
  expect('5. single: elite refused', await mk('ath-single_s1', row('ath-single', { chargedFrom: 'elite' })), 403);
  expect('6. single: period with no comp refused', await mk('ath-single2_s1', row('ath-single2')), 403);
  expect('9. single: period against a granted-0 comp refused', await mk('ath-single_s1', row('ath-single')), 403);
  expect('1. single + own token', await mk('ath-single_s1', grace('ath-single', 'single_cs_probe')), open);
  expect("8. legacy single: last month's comp on this month's session refused", await mk('ath-single-legacy_s1', row('ath-single-legacy', { periodKey: COMP_PREV.key })), 403);
  expect("7. legacy single: period against this month's comp", await mk('ath-single-legacy_s1', row('ath-single-legacy')), open);
  expect('10. moved off single, unpaid: booking refused', await mk('ath-moved_s1', booking('ath-moved')), 403);
  expect('10. moved off single, unpaid: waitlist refused', await createAs(t.parent, 'waitlist', 's-full_ath-moved', entry('ath-moved'), ['joinedAt']), 403);
  expect('19. Elite charged elite (open before the gate too)', await mk('ath-elite_s3', { ...booking('ath-elite'), sessionId: 's3', date: DAY3, chargedFrom: 'elite' }), 200);

  // A single row the member cancelled; it had spent single_cs_probe.
  await seed('bookings', 'ath-single_s2', { athleteId: 'ath-single', sessionId: 's2', date: DAY2, type: 'training', periodKey: COMP.key,
    status: 'cancelled', householdId: 'hh', createdBy: uid.parent, createdAt: new Date(), chargedFrom: 'grace', graceTokenId: 'single_cs_probe',
    cancelledBy: uid.parent, cancelReason: 'member' });
  // A family's status flip with the session's count write beside it: + 1 for a re-book, - 1 for a cancel.
  const flip = async (auth, id, fields, seat, serverTime = []) => commitAs(auth, [patchWrite('bookings', id, fields, undefined, serverTime), await seatWrite(id.split('_')[1], seat)]);
  const rebook = (id, fields, auth = t.parent) => flip(auth, id, { status: 'confirmed', ...fields }, 1, ['rebookedAt']);
  expect('12. single re-book, status only (a stale client) refused', await flip(t.parent, 'ath-single_s2', { status: 'confirmed' }, 1), 403);
  expect('13. single re-book naming another athlete\'s token refused', await rebook('ath-single_s2', { chargedFrom: 'grace', graceTokenId: 'single_cs_other' }), 403);
  expect('14. single re-book naming a voided token refused', await rebook('ath-single_s2', { chargedFrom: 'grace', graceTokenId: 'single_cs_void' }), 403);
  // 2026-10-01: the re-decided charge alone is not enough - the seat count must follow it in the same commit.
  expect('11. single re-book re-deciding its charge with no count write refused', await updateAs(t.parent, 'bookings', 'ath-single_s2',
    { status: 'confirmed', chargedFrom: 'grace', graceTokenId: 'single_cs_probe' }, undefined, ['rebookedAt']), 403);
  expect('11. single re-book re-deciding its charge, rebookedAt == request.time', await rebook('ath-single_s2', { chargedFrom: 'grace', graceTokenId: 'single_cs_probe' }), open);

  await seed('bookings', 'ath-frozen_s2', { athleteId: 'ath-frozen', sessionId: 's2', date: DAY2, type: 'training', periodKey: '2026-11-01',
    status: 'cancelled', householdId: 'hh-frozen', createdBy: uid.frozen, createdAt: new Date(), chargedFrom: 'period', cancelledBy: uid.frozen, cancelReason: 'member' });
  expect('16. re-book in a past_due household refused', await flip(t.frozen, 'ath-frozen_s2', { status: 'confirmed' }, 1), 403);

  await seed('bookings', 'ath-active_s-past', { athleteId: 'ath-active', sessionId: 's-past', date: '2026-09-01', type: 'training', periodKey: '2026-09-01',
    status: 'confirmed', householdId: 'hh', createdBy: uid.parent, createdAt: new Date(), chargedFrom: 'period' });
  expect('17. member cancel after the session day refused', await flip(t.parent, 'ath-active_s-past',
    { status: 'cancelled', cancelledBy: uid.parent, cancelReason: 'member' }, -1), 403);

  // Merge 2026-10-01: a cancel has no opens-at gate, so a booking paid with a bought token is cancelled the way any
  // booking is - before the day is over, with the count - 1 in the same commit (s3 holds one seat, case 19's).
  await seed('bookings', 'ath-single_s3', { athleteId: 'ath-single', sessionId: 's3', date: DAY3, type: 'training', periodKey: COMP.key,
    status: 'confirmed', householdId: 'hh', createdBy: uid.parent, createdAt: new Date(), chargedFrom: 'grace', graceTokenId: 'single_cs_probe' });
  const cancelled = { status: 'cancelled', cancelledBy: uid.parent, cancelReason: 'member' };
  expect('20. single: member cancel of a coming session with no count write refused', await updateAs(t.parent, 'bookings', 'ath-single_s3', cancelled), 403);
  expect('20. single: member cancel of a coming session, count - 1 in the same commit', await flip(t.parent, 'ath-single_s3', cancelled, -1), 200);
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
  try {
    await task4(); await task5(); await taskContract(); await taskWindow(); await taskRepeat(); await taskPackageChange(); await taskSeriesCancel();
    await taskSeats(); await taskPast(); await taskWaitlist(); await taskSingle(); await taskScholarship();
  } finally { await teardown(); }
}

export { setup, teardown, seed, del, call, createAs, updateAs, commitAs, bookAs, listAs, expect, token, t, uid, BASE, loadRules, postGateCopy };
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
