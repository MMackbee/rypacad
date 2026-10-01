/* Sprint 13 functions replay harness - runs against the ISOLATED emulator
 * (firestore 8082 / functions 5001, config firebase.functions-lane.json at the
 * repo root). It WIPES and reseeds that instance; never point it at 8080.
 *   cd functions && npx firebase-tools emulators:start --only firestore,functions --project rypacad --config ../firebase.functions-lane.json
 * Dates: the seeded 'future' sessions live in Nov/Dec 2026 (moved from
 * Sep/Oct on 2026-09-28, when those had become the past); the ONE past
 * booking, jordan_2026-09-10-1, stays in September on purpose.
 *   node test/verify-lane.js   (from functions/) */
'use strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082';
process.env.GCLOUD_PROJECT = 'rypacad';

const admin = require('firebase-admin');
const Stripe = require('stripe');
const lib = require('../portal/lib.js');

const SECRET = 'whsec_functionslane_emulator_only_not_a_real_secret';
const URL = 'http://127.0.0.1:5001/rypacad/us-central1/stripeWebhook';
const stripe = new Stripe('sk_test_harness');

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
function checkTrue(label, cond, detail) {
  if (cond) log(`    PASS  ${label}`);
  else { failures++; log(`    FAIL  ${label} ${detail === undefined ? '' : detail}`); }
}

const secs = (y, m, d) => Date.UTC(y, m - 1, d, 12) / 1000;
const TS = (ms) => admin.firestore.Timestamp.fromMillis(ms);

async function get(col, id) {
  const s = await db.collection(col).doc(id).get();
  return s.exists ? s.data() : null;
}
async function exists(col, id) {
  return (await db.collection(col).doc(id).get()).exists;
}
async function post(event) {
  const payload = JSON.stringify(event);
  const sig = stripe.webhooks.generateTestHeaderString({payload, secret: SECRET});
  const res = await fetch(URL, {
    method: 'POST',
    headers: {'content-type': 'application/json', 'stripe-signature': sig},
    body: payload,
  });
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return {status: res.status, body};
}
async function settle(ms) { await new Promise((r) => setTimeout(r, ms)); }
async function waitFor(fn, label, timeoutMs = 20000) {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return true;
    if (Date.now() - t0 > timeoutMs) { failures++; log(`    FAIL  timed out waiting for ${label}`); return false; }
    await settle(400);
  }
}
async function wipe() {
  for (const c of ['households', 'athletes', 'packages', 'sessions', 'bookings',
    'waitlist', 'graceTokens', 'tokenPeriods', 'stripeEvents', 'users',
    'notifications']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

const invoice = (id, customer, startSecs, endSecs, extra = {}) => ({
  id, object: 'event', type: extra.type || 'invoice.paid',
  data: {object: Object.assign({
    id: 'in_' + id, object: 'invoice', customer, status: 'paid',
    period_start: startSecs, period_end: endSecs,
    lines: {object: 'list', data: [{id: 'il_' + id, object: 'line_item',
      period: {start: startSecs, end: endSecs}, price: {id: 'price_t12'}}]},
  }, extra.object || {})},
});

async function seed() {
  await wipe();
  const B = db.batch();
  const set = (c, id, data) => B.set(db.collection(c).doc(id), data);

  set('households', 'whitfield', {name: 'Whitfield family', stripeCustomerId: 'cus_whitfield', stripeSubscriptionId: 'sub_whitfield'});
  set('households', 'parker', {name: 'Parker family', stripeCustomerId: 'cus_parker', periodAnchorDay: 1});
  set('households', 'nguyen', {name: 'Nguyen family', periodAnchorDay: 1});
  set('households', 'stone', {name: 'Stone family', periodAnchorDay: 1, membership: {status: 'past_due'}});

  set('athletes', 'jordan', {name: 'Jordan', householdId: 'whitfield', packageId: 't-12'});
  set('athletes', 'nico', {name: 'Nico', householdId: 'whitfield', packageId: 't-6'});
  set('athletes', 'reese', {name: 'Reese', householdId: 'whitfield', packageId: 'elite'});
  set('athletes', 'avery', {name: 'Avery', householdId: 'parker', packageId: 't-6'});
  set('athletes', 'blake', {name: 'Blake', householdId: 'parker', packageId: 't-6'});
  set('athletes', 'cam', {name: 'Cam', householdId: 'nguyen', packageId: 't-6'});
  set('athletes', 'dev', {name: 'Dev', householdId: 'nguyen', packageId: 't-6'});
  set('athletes', 'quinn', {name: 'Quinn', householdId: 'stone', packageId: 't-6'});

  set('packages', 't-12', {name: '12 tokens', kind: 'tokens', tokens: 12, windowDays: 32, stripePriceId: 'price_t12'});
  set('packages', 't-6', {name: '6 tokens', kind: 'tokens', tokens: 6, windowDays: 32, stripePriceId: 'price_t6'});
  set('packages', 'elite', {name: 'Elite', kind: 'elite', tokens: null, windowDays: 45, access247: true, stripePriceId: 'price_elite'});

  set('users', 'u-jordan', {role: 'athlete', athleteId: 'jordan', email: 'jordan@example.test'});
  set('users', 'u-dana', {role: 'parent', householdId: 'nguyen', email: 'dana@example.test', phoneNumber: '+15550100'});
  set('users', 'u-cam', {role: 'athlete', athleteId: 'cam', email: 'cam@example.test'});

  set('graceTokens', 'grace-avery', {athleteId: 'avery', householdId: 'parker', expiresAt: '2026-12-06', reason: 'session-cancelled', sourceSessionId: '2026-11-05-1', createdBy: 'ops', createdAt: TS(Date.now())});
  set('graceTokens', 'grace-cam', {athleteId: 'cam', householdId: 'nguyen', expiresAt: '2026-12-06', reason: 'session-cancelled', sourceSessionId: '2026-11-05-1', createdBy: 'ops', createdAt: TS(Date.now())});

  // `noStatus` reproduces the season generator's shape: those sessions carry
  // NO status field at all (db lane reconciliation) - absent == scheduled.
  const S = (id, date, cap, booked, type = 'training', noStatus = false) => {
    const doc = {date, time: '3:00 PM', type, capacity: cap, booked, bookable: true, label: null};
    if (!noStatus) doc.status = 'scheduled';
    set('sessions', id, doc);
  };
  S('2026-09-10-1', '2026-09-10', 15, 1);
  S('2026-11-18-1', '2026-11-18', 2, 2);
  S('2026-11-20-1', '2026-11-20', 2, 2, 'training', true); // NO status field
  S('2026-11-22-1', '2026-11-22', 1, 1, 'tournament');
  S('2026-11-25-1', '2026-11-25', 15, 1);
  S('2026-12-05-1', '2026-12-05', 15, 1);
  for (let d = 6; d <= 13; d++) S(`2026-12-${String(d).padStart(2, '0')}-1`, `2026-12-${String(d).padStart(2, '0')}`, 15, 0);

  const BK = (ath, sid, date, hh, pk, extra = {}) => set('bookings', `${ath}_${sid}`, Object.assign({
    athleteId: ath, sessionId: sid, householdId: hh, date, type: 'training',
    status: 'confirmed', periodKey: pk, graceTokenId: null, chargedFrom: 'period',
    createdBy: 'u-' + ath, createdAt: TS(Date.now()),
  }, extra));
  BK('jordan', '2026-09-10-1', '2026-09-10', 'whitfield', '2026-09-01');
  BK('blake', '2026-11-18-1', '2026-11-18', 'parker', '2026-11-01');
  BK('reese', '2026-11-18-1', '2026-11-18', 'whitfield', '2026-11-01', {chargedFrom: 'elite'});
  BK('jordan', '2026-11-20-1', '2026-11-20', 'whitfield', '2026-11-01');
  BK('nico', '2026-11-20-1', '2026-11-20', 'whitfield', '2026-11-01');
  BK('avery', '2026-11-22-1', '2026-11-22', 'parker', '2026-11-01');
  BK('jordan', '2026-11-25-1', '2026-11-25', 'whitfield', '2026-11-01');
  BK('jordan', '2026-12-05-1', '2026-12-05', 'whitfield', '2026-12-01');

  const t0 = Date.parse('2026-11-15T12:00:00Z');
  const WL = (sid, ath, hh, date, pk, offset) => set('waitlist', `${sid}_${ath}`, {
    sessionId: sid, athleteId: ath, householdId: hh, date, periodKey: pk,
    joinedAt: TS(t0 + offset), createdBy: 'u-' + ath});
  WL('2026-11-18-1', 'quinn', 'stone', '2026-11-18', '2026-11-01', 0);
  WL('2026-11-18-1', 'dev', 'nguyen', '2026-11-18', '2026-11-01', 60000);
  WL('2026-11-18-1', 'cam', 'nguyen', '2026-11-18', '2026-11-01', 120000);
  WL('2026-11-20-1', 'blake', 'parker', '2026-11-20', '2026-11-01', 0);
  WL('2026-11-20-1', 'avery', 'parker', '2026-11-20', '2026-11-01', 60000);
  WL('2026-11-22-1', 'reese', 'whitfield', '2026-11-22', '2026-11-01', 0);

  await B.commit();
}

async function main() {
  const today = lib.todayISO();
  log(`\n=== Sprint 13 functions lane - isolated emulator verification ===`);
  log(`today (America/Chicago) = ${today}\n`);
  await seed();
  log('seeded 4 households / 8 athletes / 3 packages / 14 sessions / 8 bookings / 6 waitlist entries / 2 grace tokens\n');

  // ---------------------------------------------------------------- STEP P
  log('STEP P  promotion by admin-SDK decrement (session 2026-11-18-1, cap 2)');
  const bp = db.batch();
  bp.update(db.collection('bookings').doc('blake_2026-11-18-1'), {status: 'cancelled', cancelledBy: 'u-blake', cancelReason: 'member'});
  bp.update(db.collection('bookings').doc('reese_2026-11-18-1'), {status: 'cancelled', cancelledBy: 'u-reese', cancelReason: 'member'});
  bp.update(db.collection('sessions').doc('2026-11-18-1'), {booked: 0});
  await bp.commit();
  await waitFor(async () => (await get('sessions', '2026-11-18-1')).booked === 2, 'both seats refilled');
  const camB = await get('bookings', 'cam_2026-11-18-1');
  const devB = await get('bookings', 'dev_2026-11-18-1');
  checkTrue('cam promoted (grace holder, joined LAST)', !!camB);
  checkTrue('dev promoted (no grace, joined 2nd)', !!devB);
  if (camB) {
    check('cam.chargedFrom', camB.chargedFrom, 'grace');
    check('cam.graceTokenId', camB.graceTokenId, 'grace-cam');
    check('cam.status/createdBy/promotedFromWaitlist', [camB.status, camB.createdBy, camB.promotedFromWaitlist], ['confirmed', 'system', true]);
    check('cam.periodKey', camB.periodKey, '2026-11-01');
    check('cam booking shape', Object.keys(camB).sort(), ['athleteId', 'chargedFrom', 'createdAt', 'createdBy', 'date', 'graceTokenId', 'householdId', 'periodKey', 'promotedFromWaitlist', 'sessionId', 'status', 'type']);
  }
  if (devB) check('dev.chargedFrom/graceTokenId', [devB.chargedFrom, devB.graceTokenId], ['period', null]);
  check('sessions/2026-11-18-1.booked', (await get('sessions', '2026-11-18-1')).booked, 2);
  check('waitlist 2026-11-18-1_cam deleted', await exists('waitlist', '2026-11-18-1_cam'), false);
  check('waitlist 2026-11-18-1_dev deleted', await exists('waitlist', '2026-11-18-1_dev'), false);
  check('waitlist 2026-11-18-1_quinn deleted (past_due gate, no grace token minted)', await exists('waitlist', '2026-11-18-1_quinn'), false);
  check('no booking for quinn', await exists('bookings', 'quinn_2026-11-18-1'), false);
  // 2026-10-01: a family removed at a gate is told why (keyed by the entry's joinedAt, the seed's t0).
  const quinnNotice = `waitlist-removed_2026-11-18-1_quinn_${Date.parse('2026-11-15T12:00:00Z')}`;
  await waitFor(async () => await exists('notifications', quinnNotice), 'quinn told the entry was removed');
  check('quinn removal notice', ((await get('notifications', quinnNotice)) || {}).body,
      'Quinn was next on the waitlist for Training, Wed, Nov 18 at 3:00 PM but could not be booked: the membership payment is not up to date.');
  check('graceTokens still 2 (consumption is derived, never deleted)', (await db.collection('graceTokens').get()).size, 2);

  // ---------------------------------------------------------------- STEP 1
  log('\nSTEP 1  invoice.paid  evt_1  cus_whitfield  period 2026-11-01..2026-11-30');
  let r = await post(invoice('evt_1', 'cus_whitfield', secs(2026, 11, 1), secs(2026, 11, 30)));
  check('HTTP', [r.status, r.body.outcome], [200, 'issued']);
  let hh = await get('households', 'whitfield');
  check('households/whitfield.periodAnchorDay (was ABSENT)', hh.periodAnchorDay, 1);
  check('membership', [hh.membership.status, hh.membership.stripeSubscriptionStatus, hh.membership.currentPeriodStart, hh.membership.currentPeriodEnd, hh.membership.lastEventId],
      ['active', 'active', '2026-11-01', '2026-11-30', 'evt_1']);
  const tpJ = await get('tokenPeriods', 'jordan_2026-11-01');
  check('tokenPeriods/jordan_2026-11-01', [tpJ.granted, tpJ.source, tpJ.eventId, tpJ.periodKey, tpJ.periodEnd, tpJ.householdId],
      [12, 'stripe', 'evt_1', '2026-11-01', '2026-11-30', 'whitfield']);
  check('tokenPeriods/nico_2026-11-01.granted', (await get('tokenPeriods', 'nico_2026-11-01')).granted, 6);
  check('tokenPeriods/reese_2026-11-01 (Elite gets NO doc)', await exists('tokenPeriods', 'reese_2026-11-01'), false);
  const ev1 = await get('stripeEvents', 'evt_1');
  check('stripeEvents/evt_1', [ev1.type, ev1.customer, ev1.householdId, ev1.outcome], ['invoice.paid', 'cus_whitfield', 'whitfield', 'issued']);

  // ---------------------------------------------------------------- STEP 2
  log('\nSTEP 2  invoice.payment_failed  evt_2  next_payment_attempt SET (retry pending)');
  r = await post(invoice('evt_2', 'cus_whitfield', secs(2026, 11, 1), secs(2026, 11, 30),
      {type: 'invoice.payment_failed', object: {status: 'open', next_payment_attempt: secs(2026, 11, 23)}}));
  check('HTTP', [r.status, r.body.outcome], [200, 'past_due']);
  hh = await get('households', 'whitfield');
  check('membership.status / subscriptionStatus / lastEventId', [hh.membership.status, hh.membership.stripeSubscriptionStatus, hh.membership.lastEventId], ['past_due', 'past_due', 'evt_2']);
  check('period fields PRESERVED through the freeze', [hh.membership.currentPeriodStart, hh.membership.currentPeriodEnd], ['2026-11-01', '2026-11-30']);
  check('retry position recorded (v2.4): next attempt, attempt count absent -> null', [hh.membership.nextPaymentAttempt, hh.membership.attemptCount], ['2026-11-23', null]);
  check('FREEZE not revoke: jordan_2026-11-25-1 still confirmed', (await get('bookings', 'jordan_2026-11-25-1')).status, 'confirmed');
  check('tokenPeriods untouched', (await get('tokenPeriods', 'jordan_2026-11-01')).granted, 12);

  // ---------------------------------------------------------------- STEP 3
  log('\nSTEP 3  invoice.payment_failed  evt_3  next_payment_attempt NULL (final) -> lapse + revoke + promotion');
  r = await post(invoice('evt_3', 'cus_whitfield', secs(2026, 11, 1), secs(2026, 11, 30),
      {type: 'invoice.payment_failed', object: {status: 'open', next_payment_attempt: null}}));
  check('HTTP', [r.status, r.body.outcome], [200, 'lapsed']);
  log(`    revoke summary: ${JSON.stringify(r.body.summary)}`);
  hh = await get('households', 'whitfield');
  check('membership', [hh.membership.status, hh.membership.stripeSubscriptionStatus, hh.membership.lastEventId], ['lapsed', 'unpaid', 'evt_3']);
  for (const id of ['jordan_2026-11-20-1', 'nico_2026-11-20-1', 'jordan_2026-11-25-1', 'jordan_2026-12-05-1']) {
    const b = await get('bookings', id);
    check(`revoked ${id}`, [b.status, b.cancelledBy, b.cancelReason, !!b.cancelledAt], ['cancelled', 'system', 'lapsed', true]);
  }
  check('PAST booking jordan_2026-09-10-1 untouched (date > today only)', (await get('bookings', 'jordan_2026-09-10-1')).status, 'confirmed');
  check("other households' bookings untouched (avery_2026-11-22-1)", (await get('bookings', 'avery_2026-11-22-1')).status, 'confirmed');
  check('whitfield waitlist entry 2026-11-22-1_reese deleted', await exists('waitlist', '2026-11-22-1_reese'), false);
  check('sessions/2026-11-25-1.booked 1 -> 0', (await get('sessions', '2026-11-25-1')).booked, 0);
  check('sessions/2026-12-05-1.booked 1 -> 0', (await get('sessions', '2026-12-05-1')).booked, 0);
  check('2026-11-20-1 carries NO status field (generator shape)', (await get('sessions', '2026-11-20-1')).status, undefined);
  await waitFor(async () => (await get('sessions', '2026-11-20-1')).booked === 2, 'promotion refilled 2026-11-20-1 (absent status == scheduled)');
  const avB = await get('bookings', 'avery_2026-11-20-1');
  const blB = await get('bookings', 'blake_2026-11-20-1');
  checkTrue('avery promoted FIRST (grace holder, joined 2nd)', !!avB);
  checkTrue('blake promoted second', !!blB);
  if (avB) check('avery.chargedFrom/graceTokenId/promotedFromWaitlist', [avB.chargedFrom, avB.graceTokenId, avB.promotedFromWaitlist], ['grace', 'grace-avery', true]);
  if (blB) check('blake.chargedFrom/graceTokenId', [blB.chargedFrom, blB.graceTokenId], ['period', null]);
  check('sessions/2026-11-20-1.booked back to 2', (await get('sessions', '2026-11-20-1')).booked, 2);
  check('waitlist for 2026-11-20-1 emptied', (await db.collection('waitlist').where('sessionId', '==', '2026-11-20-1').get()).size, 0);
  check('no grace token minted by revocation (still 2)', (await db.collection('graceTokens').get()).size, 2);

  // ---------------------------------------------------------------- STEP 4
  log('\nSTEP 4  invoice.paid  evt_4  REINSTATEMENT after lapsed');
  r = await post(invoice('evt_4', 'cus_whitfield', secs(2026, 11, 1), secs(2026, 11, 30)));
  check('HTTP', [r.status, r.body.outcome], [200, 'issued']);
  hh = await get('households', 'whitfield');
  check('membership back to active', [hh.membership.status, hh.membership.lastEventId], ['active', 'evt_4']);
  check('retry position cleared by the paid invoice (v2.4)', [hh.membership.attemptCount, hh.membership.nextPaymentAttempt, hh.membership.lastFailedAt], [null, null, null]);
  check('tokenPeriods/jordan_2026-11-01 re-issued by evt_4', (await get('tokenPeriods', 'jordan_2026-11-01')).eventId, 'evt_4');
  for (const id of ['jordan_2026-11-20-1', 'jordan_2026-11-25-1', 'jordan_2026-12-05-1']) {
    check(`revoked booking STAYS cancelled: ${id}`, [(await get('bookings', id)).status, (await get('bookings', id)).cancelReason], ['cancelled', 'lapsed']);
  }
  check('seat NOT returned to whitfield: sessions/2026-11-20-1.booked', (await get('sessions', '2026-11-20-1')).booked, 2);

  // -------------------------------------------------------------- STEP 4b
  log('\nSTEP 4b (harness setup) jordan rebooks 8 October sessions under t-12');
  const b4 = db.batch();
  for (let d = 6; d <= 13; d++) {
    const dd = String(d).padStart(2, '0');
    b4.set(db.collection('bookings').doc(`jordan_2026-12-${dd}-1`), {
      athleteId: 'jordan', sessionId: `2026-12-${dd}-1`, householdId: 'whitfield',
      date: `2026-12-${dd}`, type: 'training', status: 'confirmed', periodKey: '2026-12-01',
      graceTokenId: null, chargedFrom: 'period', createdBy: 'u-jordan',
      createdAt: TS(Date.parse('2026-11-16T10:00:00Z') + d * 1000)});
    b4.update(db.collection('sessions').doc(`2026-12-${dd}-1`), {booked: 1});
  }
  await b4.commit();
  await settle(1500);
  check('8 confirmed October bookings for jordan', (await db.collection('bookings').where('athleteId', '==', 'jordan').where('date', '>', '2026-11-30').get()).docs.filter((d) => d.data().status === 'confirmed').length, 8);

  // ---------------------------------------------------------------- STEP 5
  log('\nSTEP 5  customer.subscription.updated  evt_5  price_t12 -> price_t6 (DOWNGRADE)');
  r = await post({id: 'evt_5', object: 'event', type: 'customer.subscription.updated',
    data: {object: {id: 'sub_whitfield', object: 'subscription', customer: 'cus_whitfield',
      status: 'active', current_period_start: secs(2026, 11, 1), current_period_end: secs(2026, 11, 30),
      items: {object: 'list', data: [{id: 'si_1', price: {id: 'price_t6'}}]}},
    previous_attributes: {items: {data: [{price: {id: 'price_t12'}}]}}}});
  check('HTTP', [r.status, r.body.outcome], [200, 'downgraded']);
  log(`    downgrade summary: ${JSON.stringify(r.body.summary)}`);
  for (const a of ['jordan', 'nico', 'reese']) {
    check(`athletes/${a}.packageId`, (await get('athletes', a)).packageId, 't-6');
  }
  const octSnap = await db.collection('bookings').where('athleteId', '==', 'jordan').where('date', '>', '2026-11-30').get();
  const octLive = octSnap.docs.filter((d) => d.data().status === 'confirmed').map((d) => d.id).sort();
  const octCut = octSnap.docs.filter((d) => d.data().cancelReason === 'downgrade').map((d) => d.id).sort();
  check('October confirmed trimmed to the new grant of 6', octLive.length, 6);
  check('cancelled NEWEST-first (13th, 12th)', octCut, ['jordan_2026-12-12-1', 'jordan_2026-12-13-1']);
  check('cancelReason/cancelledBy on a trimmed booking', [(await get('bookings', 'jordan_2026-12-13-1')).cancelReason, (await get('bookings', 'jordan_2026-12-13-1')).cancelledBy], ['downgrade', 'system']);
  check('sessions/2026-12-13-1.booked released', (await get('sessions', '2026-12-13-1')).booked, 0);
  check('sessions/2026-12-11-1.booked kept', (await get('sessions', '2026-12-11-1')).booked, 1);
  check('membership refreshed by the subscription event', (await get('households', 'whitfield')).membership.lastEventId, 'evt_5');

  // ---------------------------------------------------------------- STEP 6
  log('\nSTEP 6  DUPLICATE: re-post evt_1 byte-for-byte');
  r = await post(invoice('evt_1', 'cus_whitfield', secs(2026, 11, 1), secs(2026, 11, 30)));
  check('HTTP', [r.status, r.body.outcome], [200, 'duplicate']);
  hh = await get('households', 'whitfield');
  check('lastEventId NOT rolled back to evt_1', hh.membership.lastEventId, 'evt_5');
  check('membership NOT flipped back to active-by-evt_1', hh.membership.status, 'active');
  check('tokenPeriods/jordan_2026-11-01.eventId unchanged', (await get('tokenPeriods', 'jordan_2026-11-01')).eventId, 'evt_4');
  check('athletes/jordan.packageId unchanged', (await get('athletes', 'jordan')).packageId, 't-6');
  check('stripeEvents/evt_1.outcome still the ORIGINAL', (await get('stripeEvents', 'evt_1')).outcome, 'issued');

  // ---------------------------------------------------------------- STEP 7
  log('\nSTEP 7  UNMATCHED customer  evt_7  cus_nobody');
  r = await post(invoice('evt_7', 'cus_nobody', secs(2026, 11, 1), secs(2026, 11, 30)));
  check('HTTP 200, no throw', [r.status, r.body.outcome], [200, 'unmatched']);
  const ev7 = await get('stripeEvents', 'evt_7');
  check('stripeEvents/evt_7', [ev7.type, ev7.customer, ev7.householdId, ev7.outcome], ['invoice.paid', 'cus_nobody', null, 'unmatched']);
  check('no tokenPeriods created by it', (await db.collection('tokenPeriods').where('eventId', '==', 'evt_7').get()).size, 0);

  // -------------------------------------------------------------- STEP 8
  log('\nSTEP 8  BAD SIGNATURE (an unsigned POST must never write)');
  const bad = await fetch(URL, {method: 'POST', headers: {'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef'},
    body: JSON.stringify(invoice('evt_forged', 'cus_whitfield', secs(2026, 11, 1), secs(2026, 11, 30)))});
  check('HTTP 400', bad.status, 400);
  check('no stripeEvents/evt_forged', await exists('stripeEvents', 'evt_forged'), false);

  log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
