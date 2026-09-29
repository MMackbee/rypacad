# Functions - Sprint 20 Implementation Plan (part 6b: Task 10, Steps 5-7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Read `40-functions.md` first (Goal, Architecture, Global Constraints, Execution order, emulator command), then `40-functions-part6.md` (Task 10 Steps 1-4: `calendly-verify.js`, `calendly.js`, the four fixtures). This part finishes Task 10: the replay harness, its run, the commit. Same **Files** and **Interfaces** as Task 10 in part 6.

---

- [ ] **Step 5: Write the harness** `functions/test/verify-calendly.js`

```js
/* Sprint 20 Calendly replay harness - runs against the ISOLATED emulator
 * (firestore 8082 / functions 5001, config firebase.functions-lane.json).
 * It WIPES and reseeds that instance; never point it at 8080.
 *   cd functions && npx firebase-tools emulators:start --only firestore,functions --project rypacad --config ../firebase.functions-lane.json
 *   node --env-file=.env.local test/verify-calendly.js   (from functions/)
 * Business steps call handleCalendlyEvent IN THIS PROCESS with a FIXED clock
 * (Oct 14, after the Oct 10 gate) so the flags are deterministic on any day;
 * the HTTP steps at the end need CALENDLY_WEBHOOK_SIGNING_KEY from .env.local
 * (the same value the emulator loads) and exercise the 400/200 contract. */
'use strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082';
process.env.GCLOUD_PROJECT = 'rypacad';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const lib = require('../portal/lib.js');
const calendly = require('../portal/calendly.js');

const URL = 'http://127.0.0.1:5001/rypacad/us-central1/calendlyWebhook';
const KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
admin.initializeApp({projectId: 'rypacad'});
const db = admin.firestore();

let failures = 0;
const log = (...a) => console.log(...a);
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { log(`    PASS  ${label} = ${a}`); }
  else { failures++; log(`    FAIL  ${label}\n          expected ${e}\n          actual   ${a}`); }
}
const TS = (ms) => admin.firestore.Timestamp.fromMillis(ms);
async function get(col, id) {
  const s = await db.collection(col).doc(id).get();
  return s.exists ? s.data() : null;
}
async function exists(col, id) {
  return (await db.collection(col).doc(id).get()).exists;
}
async function wipe() {
  for (const c of ['households', 'athletes', 'packages', 'sessions', 'bookings', 'waitlist',
    'graceTokens', 'tokenPeriods', 'users', 'calendlyEvents', 'notifications']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', `calendly-${name}.json`), 'utf8'));
/** A deep copy of a fixture with new uuids (suffix n), a utm_content and a start time. */
function variant(name, n, over) {
  const body = JSON.parse(JSON.stringify(fixture(name)).replace(/0000000000\d\d/g, String(n).padStart(12, '0')));
  const p = body.payload;
  const o = over || {};
  if ('utm' in o) p.tracking.utm_content = o.utm;
  if (o.email) p.email = o.email;
  if (o.start) {
    p.scheduled_event.start_time = o.start;
    p.scheduled_event.end_time = new Date(Date.parse(o.start) + 30 * 60000).toISOString();
  }
  if (o.attendee) p.questions_and_answers[1].answer = o.attendee;
  return body;
}
const EVT = (n) => `cal-e0a1c3d5-7b9f-4a2c-8e6d-${String(n).padStart(12, '0')}`;
const INV = (n) => `1a2b3c4d-5e6f-4a7b-8c9d-${String(n).padStart(12, '0')}`;
const CLOCK = new Date('2026-10-14T15:00:00Z');
const run = (body, now) => calendly.handleCalendlyEvent(body, {db, now: now || CLOCK});
async function position(athleteId, pkgId, periodKey) {
  const period = lib.periodFor(periodKey, 1);
  const bookings = lib.rows(await lib.periodBookingsQuery(db, athleteId, period).get());
  return lib.tokensPosition({pkg: await get('packages', pkgId), tokenPeriod: null, bookings, waitlist: [], graceTokens: [], periodKey, today: lib.todayISO(CLOCK)});
}
async function postSigned(body, tSecs) {
  const payload = JSON.stringify(body);
  const t = tSecs || Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', KEY).update(`${t}.`).update(payload).digest('hex');
  const res = await fetch(URL, {method: 'POST', headers: {'content-type': 'application/json', 'calendly-webhook-signature': `t=${t},v1=${v1}`}, body: payload});
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return {status: res.status, body: parsed};
}

async function seed() {
  await wipe();
  const B = db.batch();
  const set = (c, id, d) => B.set(db.collection(c).doc(id), d);
  set('households', 'novak', {name: 'Novak family', periodAnchorDay: 1, guardian: {name: 'Nina Novak', email: 'nina@example.test', phone: null}});
  set('households', 'oyelaran', {name: 'Oyelaran family', periodAnchorDay: 1, guardian: {name: 'Kemi Oyelaran', email: 'kemi@example.test', phone: null}});
  set('households', 'quist', {name: 'Quist family', periodAnchorDay: 1, guardian: {name: 'Sol Quist', email: 'sol@example.test', phone: null}});
  set('athletes', 'lena', {name: 'Lena', householdId: 'novak', packageId: 't-6'});
  set('athletes', 'max', {name: 'Max', householdId: 'novak', packageId: 'elite', billing: {status: 'pending'}});
  set('athletes', 'femi', {name: 'Femi', householdId: 'oyelaran', packageId: 't-12'});
  set('athletes', 'sol', {name: 'Sol', householdId: 'quist', packageId: 'single'});
  set('packages', 't-6', {name: '6 tokens', kind: 'tokens', tokens: 6, windowDays: 30});
  set('packages', 't-12', {name: '12 tokens', kind: 'tokens', tokens: 12, windowDays: 30});
  set('packages', 'elite', {name: 'Elite', kind: 'elite', tokens: null, windowDays: 45, access247: true});
  set('packages', 'single', {name: 'Single token', kind: 'single', tokens: 1, windowDays: 30});
  set('users', 'u-nina', {role: 'parent', householdId: 'novak', email: 'nina@example.test'});
  set('users', 'u-kemi', {role: 'parent', householdId: 'oyelaran', email: 'kemi@example.test'});
  set('users', 'u-sol', {role: 'athlete', athleteId: 'sol', householdId: 'quist', email: 'sol@example.test'});
  // Sol's single October token is already spent on a training block.
  set('sessions', '2026-10-05-1', {date: '2026-10-05', time: '3:00 PM', type: 'training', capacity: 15, booked: 1, bookable: true, label: null, status: 'scheduled'});
  set('bookings', 'sol_2026-10-05-1', {athleteId: 'sol', sessionId: '2026-10-05-1', householdId: 'quist', date: '2026-10-05', type: 'training', status: 'confirmed', periodKey: '2026-10-01', graceTokenId: null, chargedFrom: 'period', createdBy: 'u-sol', createdAt: TS(Date.now())});
  await B.commit();
}

async function main() {
  log('\n=== Sprint 20 Calendly replay (isolated emulator) ===');
  log(`fixed clock = ${CLOCK.toISOString()} (booking open for token members)\n`);
  await seed();

  log('STEP A  invitee.created (utm_content=lena) -> session + booking + ledger');
  let r = await run(fixture('invitee-created'));
  check('outcome', r, {outcome: 'applied', flag: null});
  const s = await get('sessions', EVT(1));
  check('session cal-<uuid>', [s.date, s.time, s.type, s.label, s.capacity, s.booked, s.status, s.durationMinutes, s.bookable, s.coachId, s.special, s.source, s.calendlyEventUri, s.gcalEventId, s.coachNote],
      ['2026-10-14', '4:00 PM', 'mental', 'Mental game session', 1, 1, 'scheduled', 30, false, null, false, 'calendly',
        'https://api.calendly.com/scheduled_events/e0a1c3d5-7b9f-4a2c-8e6d-000000000001', null, null]);
  check('time is the literal 4:00 PM with U+0020', [s.time, s.time.charCodeAt(4)], ['4:00 PM', 32]);
  const b = await get('bookings', `lena_${EVT(1)}`);
  check('booking', [b.athleteId, b.sessionId, b.householdId, b.date, b.type, b.status, b.periodKey, b.chargedFrom, b.graceTokenId, b.attendee, b.createdBy, b.source, b.flag, !!b.createdAt],
      ['lena', EVT(1), 'novak', '2026-10-14', 'mental', 'confirmed', '2026-10-01', 'period', null, 'athlete', 'system', 'calendly', null, true]);
  check('booking.calendlyInviteeUri', b.calendlyInviteeUri, fixture('invitee-created').payload.uri);
  const l = await get('calendlyEvents', `${INV(1)}_invitee.created`);
  check('ledger', [l.event, l.inviteeUri === b.calendlyInviteeUri, l.eventUri, l.athleteId, l.householdId, l.outcome, l.flag, !!l.receivedAt],
      ['invitee.created', true, s.calendlyEventUri, 'lena', 'novak', 'applied', null, true]);
  check('token position: one spent, 5 left', [(await position('lena', 't-6', '2026-10-01')).used, (await position('lena', 't-6', '2026-10-01')).left], [1, 5]);

  log('\nSTEP B  duplicate delivery');
  r = await run(fixture('invitee-created'));
  check('outcome', r, {outcome: 'duplicate', flag: null});
  check('still one lena booking', (await db.collection('bookings').where('athleteId', '==', 'lena').get()).size, 1);

  log('\nSTEP C  reschedule, REVERSED order: created (old_invitee set) before canceled');
  r = await run(fixture('reschedule-created'));
  check('outcome', r, {outcome: 'rescheduled', flag: null});
  const oldB = await get('bookings', `lena_${EVT(1)}`);
  check('old booking cancelled by calendly', [oldB.status, oldB.cancelledBy, oldB.cancelReason, !!oldB.cancelledAt], ['cancelled', 'calendly', 'member', true]);
  check('old session released', [(await get('sessions', EVT(1))).booked, (await get('sessions', EVT(1))).status], [0, 'cancelled']);
  const newB = await get('bookings', `lena_${EVT(2)}`);
  check('new booking clean (cadence 1/month not tripped)', [newB.status, newB.flag, newB.chargedFrom, newB.date], ['confirmed', null, 'period', '2026-10-16']);
  check('new session 4:30 PM', (await get('sessions', EVT(2))).time, '4:30 PM');
  check('still 1 used, 5 left', (await position('lena', 't-6', '2026-10-01')).left, 5);
  r = await run(fixture('reschedule-canceled'));
  check('the late canceled half', r, {outcome: 'already-cancelled', flag: null});
  check('ledger row for the canceled half', (await get('calendlyEvents', `${INV(1)}_invitee.canceled`)).outcome, 'already-cancelled');

  log('\nSTEP D  invitee.canceled (plain) releases the token');
  r = await run(fixture('invitee-canceled'));
  check('outcome', r, {outcome: 'applied', flag: null});
  check('booking + session cancelled', [(await get('bookings', `lena_${EVT(2)}`)).status, (await get('bookings', `lena_${EVT(2)}`)).cancelledBy, (await get('sessions', EVT(2))).booked, (await get('sessions', EVT(2))).status], ['cancelled', 'calendly', 0, 'cancelled']);
  check('6 left again', (await position('lena', 't-6', '2026-10-01')).left, 6);
  check('ledger', [(await get('calendlyEvents', `${INV(2)}_invitee.canceled`)).outcome, (await get('calendlyEvents', `${INV(2)}_invitee.canceled`)).athleteId], ['applied', 'lena']);
  r = await run(variant('invitee-canceled', 99));
  check('unknown invitee -> not-found', r, {outcome: 'not-found', flag: null});

  log('\nSTEP E  unresolved: no utm_content, unknown email');
  r = await run(variant('invitee-created', 3, {utm: null, email: 'stranger@example.test'}));
  check('outcome', r, {outcome: 'unresolved', flag: null});
  check('ledger row, no session', [(await get('calendlyEvents', `${INV(3)}_invitee.created`)).outcome, await exists('sessions', EVT(3))], ['unresolved', false]);
  r = await run(variant('invitee-created', 4, {utm: null, email: 'nina@example.test'}));
  check('two-athlete household by email is ambiguous -> unresolved', r.outcome, 'unresolved');

  log('\nSTEP F  resolved by email through a parent account, attendee parent');
  r = await run(variant('invitee-created', 5, {utm: null, email: 'Kemi@Example.test', attendee: 'Parent', start: '2026-10-20T21:00:00Z'}));
  check('outcome', r, {outcome: 'applied', flag: null});
  check('femi booked, attendee parent', [(await get('bookings', `femi_${EVT(5)}`)).attendee, (await get('bookings', `femi_${EVT(5)}`)).householdId], ['parent', 'oyelaran']);
  r = await run(variant('invitee-created', 6, {utm: null, email: 'sol@example.test', start: '2026-10-21T21:00:00Z'}));
  check('athlete account resolves directly; single token already spent -> over-cap', r, {outcome: 'applied', flag: 'over-cap'});
  const solB = await get('bookings', `sol_${EVT(6)}`);
  check('flagged booking still written, period-charged', [solB.status, solB.chargedFrom, solB.graceTokenId, solB.flag], ['confirmed', 'period', null, 'over-cap']);
  check('tokens derived: left floors at 0', (await position('sol', 'single', '2026-10-01')).left, 0);
  check('ledger carries the flag', (await get('calendlyEvents', `${INV(6)}_invitee.created`)).flag, 'over-cap');

  log('\nSTEP G  the other flags');
  r = await run(variant('invitee-created', 7, {utm: 'sol', start: '2026-10-22T21:00:00Z'}));
  check('second mental this month -> over-cadence (before over-cap)', r, {outcome: 'applied', flag: 'over-cadence'});
  r = await run(variant('invitee-created', 8, {utm: 'max', start: '2026-10-23T21:00:00Z'}));
  check('billing pending -> membership-inactive, even for Elite', r, {outcome: 'applied', flag: 'membership-inactive'});
  check('max chargedFrom period, not elite', (await get('bookings', `max_${EVT(8)}`)).chargedFrom, 'period');
  r = await run(variant('invitee-created', 9, {utm: 'lena', start: '2026-10-12T21:00:00Z'}), new Date('2026-10-09T12:00:00Z'));
  check('received before Oct 10 07:00 for t-6 -> before-open', r, {outcome: 'applied', flag: 'before-open'});
  r = await run(variant('invitee-created', 10, {utm: 'femi', start: '2026-11-03T22:00:00Z'}), new Date('2026-10-09T12:00:00Z'));
  check('November slot: periodKey 2026-11-01 (CST, 4:00 PM)', [r.flag, (await get('bookings', `femi_${EVT(10)}`)).periodKey, (await get('sessions', EVT(10))).time], ['before-open', '2026-11-01', '4:00 PM']);
  check('ignored event type', await run({event: 'routing_form_submission.created', payload: {uri: 'x'}}), {outcome: 'ignored', flag: null});
  check('malformed (no invitee uri)', await run({event: 'invitee.created', payload: {}}), {outcome: 'malformed', flag: null});

  log('\nSTEP H  HTTP contract on the emulator (400 signature / 200 always)');
  if (!KEY) {
    failures++; log('    FAIL  CALENDLY_WEBHOOK_SIGNING_KEY is not set - run with node --env-file=.env.local');
  } else {
    const unsigned = await fetch(URL, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(fixture('invitee-created'))});
    check('no signature -> 400', unsigned.status, 400);
    const stale = await postSigned(fixture('invitee-created'), Math.floor(Date.now() / 1000) - 600);
    check('stale t -> 400', stale.status, 400);
    const dup = await postSigned(fixture('invitee-created'));
    check('signed duplicate -> 200 duplicate', [dup.status, dup.body.outcome], [200, 'duplicate']);
    const fresh = await postSigned(variant('invitee-created', 11, {utm: 'lena', start: '2026-10-28T21:00:00Z'}));
    check('signed fresh -> 200 applied (flag depends on the real clock)', [fresh.status, fresh.body.outcome], [200, 'applied']);
    // 14 rows: A(1) + C(2) + D(2) + E(2) + F(2) + G(4) + H(1); ignored/malformed/duplicate write none.
    check('no ledger row from the unsigned or stale posts', (await db.collection('calendlyEvents').get()).size, 14);
  }

  log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
```

- [ ] **Step 6: Run the harness**

Before the first run, this worktree's `functions/.env.local` and `functions/.secret.local` (both gitignored by `functions/.gitignore:2` `*.local`; created by **Task 11 Step 4**, decision D15 - do that step now if Task 11 has not run yet, it only needs db lane Task 7 merged) must carry `CALENDLY_WEBHOOK_SIGNING_KEY=<a 64-hex string, emulator only>` - generate it with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; never a production value. Why both files: with `runWith({secrets})` declared, the emulator reads a declared secret from `.secret.local` first and only then tries Secret Manager (`firebase-tools/lib/emulator/functionsEmulator.js` `resolveSecretEnvs`); `.env.local` still flows into the runtime env, so the harness works either way, but the `.secret.local` copy silences the "Unable to access secret" error at startup. Restart the emulator after editing either file.

Run: `cd functions && node --env-file=.env.local test/verify-calendly.js`
Expected: `ALL CHECKS PASSED` (43 checks; the last one counts the 14 ledger rows the steps write: A 1, C 2, D 2, E 2, F 2, G 4, H 1 - `duplicate`, `ignored` and `malformed` write none). Then `node test/verify-lane.js` still ends `ALL CHECKS PASSED`.

- [ ] **Step 7: Commit**

```bash
git add functions/portal/calendly-verify.js functions/portal/calendly-verify.test.js functions/portal/calendly.js functions/test/fixtures/calendly-invitee-created.json functions/test/fixtures/calendly-invitee-canceled.json functions/test/fixtures/calendly-reschedule-created.json functions/test/fixtures/calendly-reschedule-canceled.json functions/test/verify-calendly.js
git commit -m "feat(functions): calendlyWebhook - signed, idempotent, flags never refuses; replay harness" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
Continue with `40-functions-part7.md` (Tasks 11-13: `index.js` binding + exports, the owner runbook, the Stripe harness additions).
