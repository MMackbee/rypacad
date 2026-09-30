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

export async function taskContract() {
  console.log('Contract Phase 2: contractMinutesUpdateOk takes contractStart (a yyyy-MM-dd string) beside the tier');
  await seed('athletes', 'ath-contract', { name: 'ath-contract', householdId: 'hh', contractMinutes: null, coachId: null, packageId: 't-6' });
  const patchAth = (id, fields, auth) => call('PATCH', `/athletes/${id}?${Object.keys(fields).map((k) => `updateMask.fieldPaths=${k}`).join('&')}`,
    { fields: fsFields(fields) }, auth).then((r) => r.status);
  expect('parent starts a tier with contractStart', await patchAth('ath-contract', { contractMinutes: 45, contractStart: '2026-11-03' }, t.parent), 200);
  expect('parent changes the tier alone (contractStart untouched)', await patchAth('ath-contract', { contractMinutes: 90 }, t.parent), 200);
  expect('parent clears the tier', await patchAth('ath-contract', { contractMinutes: null }, t.parent), 200);
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
  expect('booking: Elite books Dec 16 (Nov 1 + 45)', await createAs(t.parent, 'bookings', 'ath-elite_s-dec16', elite('s-dec16', '2026-12-16')), 200);
  expect('booking: Dec 18 past the anchored bound', await createAs(t.parent, 'bookings', 'ath-elite_s-dec18', elite('s-dec18', '2026-12-18')), dec18Open ? 200 : 403);
  for (const [c, id] of [['bookings', 'ath-elite_s-dec16'], ['bookings', 'ath-elite_s-dec18'], ['sessions', 's-dec16'], ['sessions', 's-dec18']]) await del(c, id);
}

export { setup, teardown, seed, del, call, createAs, expect, token, t, uid, BASE };
if (process.argv[1] && process.argv[1].endsWith('verify-rules.mjs')) {
  await setup();
  try { await task4(); await task5(); await taskContract(); await taskWindow(); } finally { await teardown(); }
  console.log(failures ? `${failures} FAILED` : 'ALL PASS');
  process.exit(failures ? 1 : 0);
}
