/* Sprint 20 Stripe launch replay harness - runs against the ISOLATED emulator
 * (firestore 8082 / functions 5001, config firebase.functions-lane.json at the
 * repo root). It WIPES and reseeds that instance; never point it at 8080.
 *   cd functions && npx firebase-tools emulators:start --only firestore,functions --project rypacad --config ../firebase.functions-lane.json
 *   node test/verify-stripe-launch.js   (from functions/)
 * Needs functions/.env.local (Task 11 Step 4): STRIPE_WEBHOOK_SECRET equal to
 * SECRET below, STRIPE_LINE_ITEMS_STUB for STEP B/C/E, and
 * STRIPE_SECRET_KEY=sk_test_harness so Task 13 STEP H fails deterministically. */
'use strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082';
process.env.GCLOUD_PROJECT = 'rypacad';

const admin = require('firebase-admin');
const Stripe = require('stripe');

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
async function wipe() {
  for (const c of ['households', 'athletes', 'packages', 'sessions', 'bookings',
    'waitlist', 'graceTokens', 'tokenPeriods', 'stripeEvents', 'users',
    'notifications']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

async function seed() {
  await wipe();
  const B = db.batch();
  const set = (c, id, d) => B.set(db.collection(c).doc(id), d);
  set('households', 'novak', {name: 'Novak family', stripeCustomerId: null,
    stripeSubscriptionId: null, stripeCustomerIds: [], guardian: {
      name: 'Nina Novak', email: 'nina@example.test', phone: '+15550199'}});
  set('athletes', 'lena', {name: 'Lena', householdId: 'novak',
    packageId: 't-6', contractMinutes: null, coachId: null,
    facilityAccess: false, billing: {status: 'pending'}});
  set('athletes', 'max', {name: 'Max', householdId: 'novak',
    packageId: 'elite', contractMinutes: null, coachId: null,
    facilityAccess: false, billing: {status: 'pending'}});
  set('packages', 't-6', {name: '6 tokens', kind: 'tokens', tokens: 6,
    windowDays: 30, stripePriceId: 'price_t6'});
  set('packages', 'elite', {name: 'Elite', kind: 'elite', tokens: null,
    windowDays: 45, access247: true, stripePriceId: 'price_elite'});
  set('users', 'u-nina', {role: 'parent', householdId: 'novak',
    email: 'nina@example.test'});
  // STEP D2 (D17): two paid siblings, each with a future booking and a
  // waitlist entry, so a per-athlete lapse can be told from a household one.
  set('households', 'reyes', {name: 'Reyes family',
    stripeCustomerId: 'cus_reyes', stripeSubscriptionId: null,
    stripeCustomerIds: ['cus_reyes'], periodAnchorDay: 1,
    membership: {status: 'active'},
    guardian: {name: 'Ana Reyes', email: 'ana@example.test',
      phone: '+15550188'}});
  set('sessions', 'reyes-s1', {date: '2026-11-10', time: '4:00 PM',
    type: 'training', capacity: 8, booked: 2, bookable: true,
    status: 'scheduled'});
  set('sessions', 'reyes-s2', {date: '2026-11-12', time: '4:00 PM',
    type: 'training', capacity: 1, booked: 1, bookable: true,
    status: 'scheduled'});
  for (const a of ['ivy', 'kai']) {
    set('athletes', a, {name: a, householdId: 'reyes', packageId: 't-6',
      contractMinutes: null, coachId: null, facilityAccess: false,
      billing: {status: 'active', customerId: 'cus_reyes',
        subscriptionId: 'sub_' + a}});
    set('bookings', `${a}_reyes-s1`, {athleteId: a, householdId: 'reyes',
      sessionId: 'reyes-s1', date: '2026-11-10', type: 'training',
      status: 'confirmed', periodKey: '2026-11-01', chargedFrom: 'period',
      graceTokenId: null, createdBy: 'u-ana', createdAt: TS(Date.now())});
    set('waitlist', `${a}_reyes-s2`, {athleteId: a, householdId: 'reyes',
      sessionId: 'reyes-s2', date: '2026-11-12', periodKey: '2026-11-01',
      joinedAt: TS(Date.now()), createdBy: 'u-ana'});
  }
  await B.commit();
}
const META = (ath, pk) => ({householdId: 'novak', athleteId: ath,
  product: 'tier', packageId: pk, prepaidPeriodKey: '2026-11-01',
  prepaidTokens: pk === 'elite' ? '' : '6'});
// Lines in the order Stripe may list them on the checkout invoice: the
// one-time prepaid line (a single instant) FIRST, then the subscription line
// (review finding 7 - invoicePeriod must pick the subscription line).
const basilInvoice = (id, sub, ath, pk, reason) => ({id, object: 'event',
  type: 'invoice.paid', data: {object: {id: 'in_' + id, object: 'invoice',
    customer: 'cus_novak', status: 'paid', billing_reason: reason,
    parent: {subscription_details: {subscription: sub, metadata: META(ath, pk)}},
    lines: {data: [
      {period: {start: secs(2026, 10, 6), end: secs(2026, 10, 6)},
        parent: {type: 'invoice_item_details'},
        pricing: {price_details: {price: 'price_prepaid_' + ath}}},
      {period: {start: secs(2026, 10, 6), end: secs(2026, 12, 1)},
        parent: {type: 'subscription_item_details'},
        price: {id: 'price_' + pk.replace('-', '')}}]}}}});
const deleted = (id, sub, ath) => ({id, object: 'event',
  type: 'customer.subscription.deleted', data: {object: {id: sub,
    object: 'subscription', customer: 'cus_reyes', status: 'canceled',
    metadata: {householdId: 'reyes', athleteId: ath, product: 'tier',
      packageId: 't-6'},
    items: {data: [{price: {id: 'price_t6'}}]}}}});
const completed = (id, sub, ath) => ({id, object: 'event',
  type: 'checkout.session.completed', data: {object: {id: 'cs_' + id,
    object: 'checkout.session', mode: 'subscription', payment_status: 'paid',
    customer: 'cus_novak', subscription: sub,
    client_reference_id: `novak__${ath}__tier`}}});

async function main() {
  log('\n=== Sprint 20 Stripe launch replay (isolated emulator) ===');
  await seed();
  // The emulator has no Stripe: listLineItems must be stubbed. The webhook
  // reads STRIPE_LINE_ITEMS_STUB (functions/.env.local, emulator only) as a
  // JSON map sessionId -> line items; see stripe.js stripe() note.
  log('STEP A  invoice.paid (Basil shape, subscription_create) BEFORE checkout');
  let r = await post(basilInvoice('evt_a', 'sub_lena', 'lena', 't-6',
      'subscription_create'));
  check('HTTP', [r.status, r.body.outcome], [200, 'issued-prepaid']);
  const tp = await get('tokenPeriods', 'lena_2026-11-01');
  check('prepaid tokenPeriods', [tp.granted, tp.prepaid, tp.periodEnd],
      [6, true, '2026-11-30']);
  check('lena.billing.status', (await get('athletes', 'lena')).billing.status,
      'active');
  const hhA = await get('households', 'novak');
  check('novak.periodAnchorDay', hhA.periodAnchorDay, 1);
  check('membership period from the SUBSCRIPTION line, not the one-time ' +
      'prepaid line (review finding 7)',
  [hhA.membership.currentPeriodStart, hhA.membership.currentPeriodEnd],
  ['2026-10-06', '2026-12-01']);
  check('notice membership_lena_paid', await exists('notifications',
      'membership_lena_paid'), true);
  check('ledger via', (await get('stripeEvents', 'evt_a')).via, 'metadata');

  log('\nSTEP B  checkout.session.completed AFTER the invoice (lena)');
  r = await post(completed('evt_b', 'sub_lena', 'lena'));
  check('HTTP', [r.status, r.body.outcome], [200, 'applied-checkout']);
  const lena = await get('athletes', 'lena');
  check('billing ids', [lena.billing.customerId, lena.billing.subscriptionId,
    lena.billing.checkoutSessionId], ['cus_novak', 'sub_lena', 'cs_evt_b']);
  const hh = await get('households', 'novak');
  check('customer linked', [hh.stripeCustomerId, hh.stripeCustomerIds],
      ['cus_novak', ['cus_novak']]);
  check('notice not duplicated', (await db.collection('notifications')
      .where('athleteId', '==', 'lena').get()).size, 1);

  log('\nSTEP C  checkout.session.completed BEFORE invoice.paid (max, Elite)');
  r = await post(completed('evt_c', 'sub_max', 'max'));
  check('HTTP', [r.status, r.body.outcome], [200, 'applied-checkout']);
  check('max active at checkout (payment_status paid)',
      (await get('athletes', 'max')).billing.status, 'active');
  r = await post(basilInvoice('evt_d', 'sub_max', 'max', 'elite',
      'subscription_create'));
  check('HTTP', [r.status, r.body.outcome], [200, 'issued-prepaid']);
  check('Elite gets NO tokenPeriods doc', await exists('tokenPeriods',
      'max_2026-11-01'), false);
  check('exactly one notice for max', (await db.collection('notifications')
      .where('athleteId', '==', 'max').get()).size, 1);

  log('\nSTEP D  invoice.payment_failed lands on lena only');
  r = await post({id: 'evt_e', object: 'event', type: 'invoice.payment_failed',
    data: {object: {id: 'in_e', object: 'invoice', customer: 'cus_novak',
      next_payment_attempt: secs(2026, 12, 5),
      parent: {subscription_details: {subscription: 'sub_lena'}}}}});
  check('HTTP', [r.status, r.body.outcome], [200, 'past_due']);
  check('lena past_due, max untouched',
      [(await get('athletes', 'lena')).billing.status,
        (await get('athletes', 'max')).billing.status],
      ['past_due', 'active']);
  check('ledger via billing.subscriptionId',
      (await get('stripeEvents', 'evt_e')).via, 'billing');

  log('\nSTEP D2  customer.subscription.deleted (tier) is per athlete (D17)');
  r = await post(deleted('evt_d2a', 'sub_ivy', 'ivy'));
  check('HTTP', [r.status, r.body.outcome], [200, 'athlete-lapsed']);
  check('ivy lapsed, kai active',
      [(await get('athletes', 'ivy')).billing.status,
        (await get('athletes', 'kai')).billing.status], ['lapsed', 'active']);
  check('ivy booking cancelled (lapsed), kai booking kept',
      [(await get('bookings', 'ivy_reyes-s1')).status,
        (await get('bookings', 'ivy_reyes-s1')).cancelReason,
        (await get('bookings', 'kai_reyes-s1')).status],
      ['cancelled', 'lapsed', 'confirmed']);
  check('ivy waitlist gone, kai waitlist kept',
      [await exists('waitlist', 'ivy_reyes-s2'),
        await exists('waitlist', 'kai_reyes-s2')], [false, true]);
  check('household reyes stays active (a sibling is live)',
      (await get('households', 'reyes')).membership.status, 'active');
  check('ledger outcome', (await get('stripeEvents', 'evt_d2a')).outcome,
      'athlete-lapsed');
  r = await post(deleted('evt_d2b', 'sub_kai', 'kai'));
  check('HTTP (last live tier -> the household lapses)',
      [r.status, r.body.outcome], [200, 'lapsed']);
  check('kai lapsed, household lapsed, kai booking cancelled',
      [(await get('athletes', 'kai')).billing.status,
        (await get('households', 'reyes')).membership.status,
        (await get('bookings', 'kai_reyes-s1')).status],
      ['lapsed', 'lapsed', 'cancelled']);

  log('\nSTEP E  unexpected-quantity and duplicate');
  r = await post(completed('evt_f', 'sub_bad', 'lena'));
  check('HTTP (stub returns qty 2 for cs_evt_f)', [r.status, r.body.outcome],
      [200, 'unexpected-quantity']);
  r = await post(completed('evt_b', 'sub_lena', 'lena'));
  check('duplicate', [r.status, r.body.outcome], [200, 'duplicate']);

  log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' :
      failures + ' CHECK(S) FAILED'} ===`);
  process.exitCode = failures === 0 ? 0 : 1;
}
main().catch((e) => {
  console.error(e); process.exitCode = 1;
});
