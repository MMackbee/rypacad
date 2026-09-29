/**
 * Sprint 20 rules probe - runs against the LOCAL Firestore emulator only
 * (FIRESTORE_EMULATOR_HOST from scripts/emulator.env) under a throwaway
 * project id, so seeded data is untouched. Seeds via `Bearer owner` (bypasses
 * rules), then exercises each new rules clause as a real user via an
 * unsigned JWT (the emulator accepts alg:none). Exit 1 on any FAIL.
 *   node --env-file=scripts/emulator.env scripts/verify-rules.mjs
 */
import { fsFields, localEmulatorHost } from './lib/firestore-rest.mjs';

const HOST = localEmulatorHost({ required: true });
const PROJECT = 'demo-rules-probe';
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const GATE_MS = 1791633600000;
const beforeGate = Date.now() < GATE_MS;
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
async function createAs(auth, col, id, fields, serverTime = ['createdAt']) {
  // One `commit` write: a create (currentDocument.exists false) plus REQUEST_TIME transforms.
  const name = `projects/${PROJECT}/databases/(default)/documents/${col}/${id}`;
  const res = await fetch(`http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents:commit`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify({ writes: [{ update: { name, fields: fsFields(fields) }, currentDocument: { exists: false },
      updateTransforms: serverTime.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) }] }),
  });
  return res.status;
}
function expect(label, actual, wanted) {
  const ok = actual === wanted;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} -> ${actual} (wanted ${wanted})`);
}

const uid = { parent: 'p-probe', athlete: 'a-probe', ops: 'ops-probe', kid: 'kid-probe', stranger: 's-probe' };
const t = {
  parent: token(uid.parent, { email: 'dana@example.com', email_verified: true }),
  athlete: token(uid.athlete, { email: 'ava@example.com', email_verified: true }),
  ops: token(uid.ops, { email: 'ops@example.com', email_verified: true }),
  kidVerified: token(uid.kid, { email: 'Kid@Example.com', email_verified: true }),
  kidUnverified: token(uid.kid, { email: 'Kid@Example.com', email_verified: false }),
  stranger: token(uid.stranger, { email: 'x@example.com', email_verified: true }),
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
  for (const [c, ids] of Object.entries({ users: Object.values(uid), households: ['hh'], sessions: ['s1', 's2', 's-full'],
    athletes: ['ath-active', 'ath-absent', 'ath-pending', 'ath-elite', 'ath-elite-pending', 'new-1', 'new-2', 'new-3', 'new-4'],
    bookings: ['ath-active_s1', 'ath-absent_s1', 'ath-pending_s1', 'ath-elite_s1', 'ath-elite-pending_s1', 'ath-elite_s2'],
    graceTokens: ['grace-probe'],
    waitlist: ['s-full_ath-pending', 's-full_ath-elite', 's-full_ath-active'] })) for (const id of ids) await del(c, id);
}

export { setup, teardown, seed, del, call, createAs, expect, token, t, uid, BASE };
if (process.argv[1] && process.argv[1].endsWith('verify-rules.mjs')) {
  await setup();
  try { await task4(); } finally { await teardown(); }
  console.log(failures ? `${failures} FAILED` : 'ALL PASS');
  process.exit(failures ? 1 : 0);
}
