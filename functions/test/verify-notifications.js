/* Sprint 14 notifications replay harness - runs against the ISOLATED emulator
 * (firestore 8082 / functions 5001, config firebase.functions-lane.json at the
 * repo root). It WIPES and reseeds that instance; never point it at 8080.
 *   cd functions && npx firebase-tools emulators:start --only firestore,functions --project rypacad --config ../firebase.functions-lane.json
 *   node test/verify-notifications.js   (from functions/)
 *   node test/verify-lane.js            (afterwards - it wipes the same instance, so never together)
 *
 * Courier and Twilio are unconfigured in the emulator, so a channel that is
 * allowed to send records 'skipped', one a preference switched off records
 * 'off', and an SMS to an account with no phone records 'no-phone'. That is
 * the point: the pipeline is verifiable with neither provider.
 *
 * Every date is derived from the run's own clock, so this passes on any day.
 * The two jobs are called directly with a FIXED now (scheduled functions never
 * fire in the emulator); the expiry job's clock is chosen so the household's
 * anchor day puts the period end exactly 3 days out (and a second household
 * exactly 4, the negative case). */
'use strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082';
process.env.GCLOUD_PROJECT = 'rypacad';

const admin = require('firebase-admin');
const Stripe = require('stripe');
const lib = require('../portal/lib.js');
const jobs = require('../portal/jobs.js');
const notices = require('../portal/notices.js');
const sms = require('../portal/sms.js');

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

const TS = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const addDays = jobs.addDays;
const dom = (iso) => Number(iso.slice(8, 10));

async function get(col, id) {
  const s = await db.collection(col).doc(id).get();
  return s.exists ? s.data() : null;
}
async function exists(col, id) {
  return (await db.collection(col).doc(id).get()).exists;
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
async function post(event) {
  const payload = JSON.stringify(event);
  const sig = stripe.webhooks.generateTestHeaderString({payload, secret: SECRET});
  const res = await fetch(URL, {method: 'POST', headers: {'content-type': 'application/json', 'stripe-signature': sig}, body: payload});
  const text = await res.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return {status: res.status, body};
}
async function wipe() {
  for (const c of ['households', 'athletes', 'packages', 'sessions', 'bookings',
    'waitlist', 'graceTokens', 'tokenPeriods', 'stripeEvents', 'users',
    'notifications', 'smsLogs']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

/** The ledger row, with its recipients flattened to 'uid:email/sms', uid-sorted. */
async function ledger(id) {
  const doc = await get('notifications', id);
  if (!doc) return null;
  return {
    kind: doc.kind, category: doc.category, householdId: doc.householdId,
    athleteId: doc.athleteId, sessionId: doc.sessionId, bookingId: doc.bookingId,
    subjectKey: doc.subjectKey, title: doc.title, body: doc.body,
    sentAt: !!doc.sentAt, createdAt: !!doc.createdAt,
    to: (doc.recipients || []).slice()
        .sort((a, b) => String(a.uid).localeCompare(String(b.uid)))
        .map((r) => `${r.uid}:${r.email}/${r.sms}`),
  };
}
async function countKind(kind) {
  return (await db.collection('notifications').where('kind', '==', kind).get()).size;
}

// ---------------------------------------------------------------- the clock
const NOW = new Date();
const today = lib.todayISO(NOW);
const tomorrow = addDays(today, 1);
const plus2 = addDays(today, 2);
const plus3 = addDays(today, 3);
const graceCancelExpiry = addDays(today, 30);

// The expiry job's fixed clock: the first day at least 60 days out whose
// day-of-month is <= 23, so that dom+4 and dom+5 are both legal anchor days
// (1..28) LATER in the same month. With anchor == dom+4 the period the day
// falls in ends exactly 3 days out; with anchor == dom+5, exactly 4 (the
// negative case). Derived, never hard-coded, so this holds on any run date.
function pickExpiryToday(from) {
  let d = from;
  for (let i = 0; i < 40; i += 1) {
    if (dom(d) <= 23) return d;
    d = addDays(d, 1);
  }
  return from;
}
const EXP_TODAY = pickExpiryToday(addDays(today, 60));
const ANCHOR_3 = dom(addDays(EXP_TODAY, 4));
const ANCHOR_4 = dom(addDays(EXP_TODAY, 5));
const EXP_TARGET = addDays(EXP_TODAY, 3);
const EXP_NOW = new Date(Date.UTC(Number(EXP_TODAY.slice(0, 4)), Number(EXP_TODAY.slice(5, 7)) - 1, dom(EXP_TODAY), 18));
const HART_PERIOD = lib.periodFor(EXP_TODAY, ANCHOR_3);
const LOPEZ_PERIOD = lib.periodFor(EXP_TODAY, ANCHOR_4);

// sessions/bookings used by the scenarios
const S_BOOK = `${plus2}-n1`;
const S_PROMO = `${plus2}-n2`;
const S_KERR1 = `${plus2}-n4`;
const S_CANCEL = `${plus3}-n1`;
const S_KERR2 = `${plus3}-n2`;
const S_REM_T = `${tomorrow}-n1`;
const S_REM_W = `${tomorrow}-n2`;
const S_REM_X = `${tomorrow}-n3`;
const S_EXP_1 = `${addDays(EXP_TODAY, -1)}-n1`;
const S_EXP_2 = `${addDays(EXP_TODAY, -2)}-n1`;
const S_EXP_W = `${EXP_TODAY}-n1`;

let seededConfirmed = 0;

async function seed() {
  await wipe();
  const B = db.batch();
  const set = (c, id, data) => B.set(db.collection(c).doc(id), data);

  set('households', 'hart', {name: 'Hart family', periodAnchorDay: ANCHOR_3});
  set('households', 'lopez', {name: 'Lopez family', periodAnchorDay: ANCHOR_4});
  set('households', 'kerr', {name: 'Kerr family', periodAnchorDay: 1, stripeCustomerId: 'cus_kerr_notify'});

  set('athletes', 'teddy', {name: 'Teddy', householdId: 'hart', packageId: 't-6'});
  set('athletes', 'zia', {name: 'Zia', householdId: 'hart', packageId: 'elite'});
  set('athletes', 'wren', {name: 'Wren', householdId: 'lopez', packageId: 't-6'});
  set('athletes', 'nell', {name: 'Nell', householdId: 'lopez', packageId: 't-6'});
  set('athletes', 'kip', {name: 'Kip', householdId: 'kerr', packageId: 't-6'});

  set('packages', 't-6', {name: '6 tokens', kind: 'tokens', tokens: 6, windowDays: 32});
  set('packages', 'elite', {name: 'Elite', kind: 'elite', tokens: null, windowDays: 45});

  // Two Hart parents: one WITH a phone who switched schedule SMS off (and
  // billing email off, which the lock overrides), one with NO phone and no
  // saved preferences at all. Plus the athlete's own account, with a phone.
  set('users', 'u-pat', {role: 'parent', householdId: 'hart', email: 'pat@example.test', phone: '+15550101',
    notificationPrefs: {schedule: {email: true, sms: false}, billing: {email: false, sms: true}}});
  set('users', 'u-robin', {role: 'parent', householdId: 'hart', email: 'robin@example.test'});
  set('users', 'u-teddy', {role: 'athlete', athleteId: 'teddy', email: 'teddy@example.test', phone: '+15550102'});
  set('users', 'u-sam', {role: 'parent', householdId: 'lopez', email: 'sam@example.test',
    notificationPrefs: {schedule: {email: false, sms: true}}});
  set('users', 'u-kerry', {role: 'parent', householdId: 'kerr', email: 'kerry@example.test'});

  const S = (id, date, cap, booked, extra = {}) => set('sessions', id, Object.assign(
      {date, time: '3:00 PM', type: 'training', capacity: cap, booked, bookable: true, label: null, status: 'scheduled'}, extra));
  S(S_BOOK, plus2, 15, 0);
  S(S_PROMO, plus2, 1, 1);
  S(S_KERR1, plus2, 15, 1);
  S(S_CANCEL, plus3, 15, 1, {label: 'Fall Scramble', type: 'tournament'});
  S(S_KERR2, plus3, 15, 1);
  S(S_REM_T, tomorrow, 15, 1);
  S(S_REM_W, tomorrow, 15, 1);
  S(S_REM_X, tomorrow, 15, 0);
  S(S_EXP_1, addDays(EXP_TODAY, -1), 15, 1);
  S(S_EXP_2, addDays(EXP_TODAY, -2), 15, 1);
  S(S_EXP_W, EXP_TODAY, 1, 1);

  const BK = (ath, sid, date, hh, pk, extra = {}) => {
    const body = Object.assign({athleteId: ath, sessionId: sid, householdId: hh, date, type: 'training',
      status: 'confirmed', periodKey: pk, graceTokenId: null, chargedFrom: 'period',
      createdBy: 'u-' + ath, createdAt: TS(Date.now())}, extra);
    if (body.status === 'confirmed') seededConfirmed += 1;
    set('bookings', `${ath}_${sid}`, body);
  };
  BK('teddy', S_REM_T, tomorrow, 'hart', lib.periodFor(tomorrow, ANCHOR_3).periodKey);
  BK('wren', S_REM_W, tomorrow, 'lopez', lib.periodFor(tomorrow, ANCHOR_4).periodKey);
  // Cancelled, dated tomorrow: the reminder job must step over it.
  BK('nell', S_REM_X, tomorrow, 'lopez', lib.periodFor(tomorrow, ANCHOR_4).periodKey,
      {status: 'cancelled', cancelledBy: 'u-nell', cancelReason: 'member'});
  BK('nell', S_PROMO, plus2, 'lopez', lib.periodFor(plus2, ANCHOR_4).periodKey);
  BK('teddy', S_CANCEL, plus3, 'hart', lib.periodFor(plus3, ANCHOR_3).periodKey, {type: 'tournament'});
  BK('kip', S_KERR1, plus2, 'kerr', lib.periodFor(plus2, 1).periodKey);
  BK('kip', S_KERR2, plus3, 'kerr', lib.periodFor(plus3, 1).periodKey);
  // Teddy's position in the expiry period: granted 4 (the tokenPeriods doc
  // outranks the package's 6), one ordinary spend, one grace-charged booking
  // that is NOT a spend, one waitlist entry reserved -> left = 4 - 1 - 1 = 2.
  BK('teddy', S_EXP_1, addDays(EXP_TODAY, -1), 'hart', HART_PERIOD.periodKey);
  BK('teddy', S_EXP_2, addDays(EXP_TODAY, -2), 'hart', HART_PERIOD.periodKey,
      {graceTokenId: 'grace-teddy-old', chargedFrom: 'grace'});
  // Wren's consumed bonus token: expires on the target day, already spent.
  BK('wren', S_EXP_1, addDays(EXP_TODAY, -1), 'lopez', LOPEZ_PERIOD.periodKey,
      {graceTokenId: 'grace-spent', chargedFrom: 'grace'});

  set('tokenPeriods', lib.tokenPeriodId('teddy', HART_PERIOD.periodKey), {
    athleteId: 'teddy', householdId: 'hart', periodKey: HART_PERIOD.periodKey,
    periodEnd: HART_PERIOD.periodEnd, granted: 4, source: 'ops', eventId: null, createdAt: TS(Date.now())});

  set('waitlist', `${S_EXP_W}_teddy`, {sessionId: S_EXP_W, athleteId: 'teddy', householdId: 'hart',
    date: EXP_TODAY, periodKey: HART_PERIOD.periodKey, joinedAt: TS(Date.now()), createdBy: 'u-teddy'});
  set('waitlist', `${S_PROMO}_teddy`, {sessionId: S_PROMO, athleteId: 'teddy', householdId: 'hart',
    date: plus2, periodKey: lib.periodFor(plus2, ANCHOR_3).periodKey, joinedAt: TS(Date.now()), createdBy: 'u-teddy'});

  // Grace tokens live on WREN so the promotion above cannot spend one (the
  // charge order prefers grace) - the expiry half of the job needs them
  // unconsumed. grace-w3 expires exactly on the target, grace-w4 one day
  // later, grace-spent on the target but already charged to a booking.
  const GT = (id, expiresAt, extra = {}) => set('graceTokens', id, Object.assign(
      {athleteId: 'wren', householdId: 'lopez', expiresAt, reason: 'session-cancelled',
        sourceSessionId: S_EXP_2, createdBy: 'ops', createdAt: TS(Date.now())}, extra));
  GT('grace-w3', EXP_TARGET);
  GT('grace-w4', addDays(EXP_TODAY, 4));
  GT('grace-spent', EXP_TARGET);
  set('graceTokens', 'grace-teddy-old', {athleteId: 'teddy', householdId: 'hart', expiresAt: addDays(EXP_TODAY, 10),
    reason: 'session-cancelled', sourceSessionId: S_EXP_2, createdBy: 'ops', createdAt: TS(Date.now())});

  await B.commit();
}

async function main() {
  log(`\n=== Sprint 14 notifications - isolated emulator verification ===`);
  log(`today (America/Chicago) = ${today}   reminder target = ${tomorrow}`);
  log(`expiry clock = ${EXP_TODAY} (anchors ${ANCHOR_3}/${ANCHOR_4}) -> hart period ends ${HART_PERIOD.periodEnd}, lopez ${LOPEZ_PERIOD.periodEnd}\n`);
  await seed();
  log(`seeded 3 households / 5 athletes / 11 sessions / ${seededConfirmed} confirmed bookings / 2 waitlist entries / 4 grace tokens\n`);

  log('STEP 0  the clock the time-based steps depend on');
  check('hart period ends exactly 3 days out', HART_PERIOD.periodEnd, EXP_TARGET);
  check('lopez period ends exactly 4 days out (the negative case)', LOPEZ_PERIOD.periodEnd, addDays(EXP_TODAY, 4));
  check('SMS window: 03:00 Chicago closed, 12:00 open',
      [sms.withinSmsWindow(new Date(Date.UTC(2026, 8, 16, 8))), sms.withinSmsWindow(new Date(Date.UTC(2026, 8, 16, 17)))], [false, true]);
  await waitFor(async () => (await countKind('booking-confirmed')) === seededConfirmed, 'the seed\'s booking-confirmed notices');
  check('one booking-confirmed notice per seeded confirmed booking', await countKind('booking-confirmed'), seededConfirmed);

  // ---------------------------------------------------------------- STEP 1
  log('\nSTEP 1  client booking create -> booking-confirmed (athlete + both parents)');
  await db.collection('bookings').doc(`teddy_${S_BOOK}`).set({
    athleteId: 'teddy', sessionId: S_BOOK, householdId: 'hart', date: plus2, type: 'training',
    status: 'confirmed', periodKey: lib.periodFor(plus2, ANCHOR_3).periodKey, graceTokenId: null,
    chargedFrom: 'period', createdBy: 'u-pat', createdAt: TS(Date.now())});
  await waitFor(async () => !!(await get('notifications', `booking-confirmed_teddy_${S_BOOK}`)), 'booking-confirmed ledger row');
  const l1 = await ledger(`booking-confirmed_teddy_${S_BOOK}`);
  check('ledger shape', Object.keys(await get('notifications', `booking-confirmed_teddy_${S_BOOK}`)).sort(),
      ['athleteId', 'body', 'bookingId', 'category', 'createdAt', 'householdId', 'kind', 'recipients', 'sentAt', 'sessionId', 'subjectKey', 'title']);
  check('kind/category/ids', [l1.kind, l1.category, l1.householdId, l1.athleteId, l1.sessionId, l1.bookingId, l1.subjectKey],
      ['booking-confirmed', 'schedule', 'hart', 'teddy', S_BOOK, `teddy_${S_BOOK}`, `teddy_${S_BOOK}`]);
  check('sentAt + createdAt written', [l1.sentAt, l1.createdAt], [true, true]);
  check('body (session doc, not booking fields)', l1.body, `Teddy is booked: Training, ${notices.dayLabel(plus2)} at 3:00 PM.`);
  check('per-recipient outcomes (pat: sms off; robin: no phone; teddy: athlete account)', l1.to,
      ['u-pat:skipped/off', 'u-robin:skipped/no-phone', 'u-teddy:skipped/skipped']);

  // ---------------------------------------------------------------- STEP 2
  log('\nSTEP 2  waitlist promotion -> ONE promoted notice, and NO booking-confirmed');
  const b2 = db.batch();
  b2.update(db.collection('bookings').doc(`nell_${S_PROMO}`), {status: 'cancelled', cancelledBy: 'u-nell', cancelReason: 'member'});
  b2.update(db.collection('sessions').doc(S_PROMO), {booked: 0});
  await b2.commit();
  await waitFor(async () => await exists('bookings', `teddy_${S_PROMO}`), 'teddy promoted into the open seat');
  await waitFor(async () => !!(await get('notifications', `promoted_teddy_${S_PROMO}`)), 'promoted ledger row');
  const l2 = await ledger(`promoted_teddy_${S_PROMO}`);
  check('promotion booking is system-written', [(await get('bookings', `teddy_${S_PROMO}`)).createdBy, (await get('bookings', `teddy_${S_PROMO}`)).promotedFromWaitlist], ['system', true]);
  check('kind/category/subjectKey', [l2.kind, l2.category, l2.subjectKey], ['promoted', 'schedule', `teddy_${S_PROMO}`]);
  check('body', l2.body, `A spot opened — Teddy is now booked for Training, ${notices.dayLabel(plus2)} at 3:00 PM.`);
  check('recipients', l2.to, ['u-pat:skipped/off', 'u-robin:skipped/no-phone', 'u-teddy:skipped/skipped']);
  await settle(1500);
  check('NO booking-confirmed for the promoted booking', await exists('notifications', `booking-confirmed_teddy_${S_PROMO}`), false);
  check('booking-confirmed count unchanged by the promotion', await countKind('booking-confirmed'), seededConfirmed + 1);

  // ---------------------------------------------------------------- STEP 3
  log('\nSTEP 3  staff cancels a session -> session-cancelled, naming the bonus token expiry');
  const b3 = db.batch();
  b3.set(db.collection('graceTokens').doc('grace-cancel'), {athleteId: 'teddy', householdId: 'hart',
    expiresAt: graceCancelExpiry, reason: 'session-cancelled', sourceSessionId: S_CANCEL, createdBy: 'ops', createdAt: TS(Date.now())});
  b3.update(db.collection('sessions').doc(S_CANCEL), {status: 'cancelled', booked: 0});
  b3.update(db.collection('bookings').doc(`teddy_${S_CANCEL}`), {status: 'cancelled', cancelledBy: 'system', cancelReason: 'session-cancelled', cancelledAt: TS(Date.now())});
  await b3.commit();
  await waitFor(async () => !!(await get('notifications', `session-cancelled_teddy_${S_CANCEL}`)), 'session-cancelled ledger row');
  const l3 = await ledger(`session-cancelled_teddy_${S_CANCEL}`);
  check('kind/category/subjectKey', [l3.kind, l3.category, l3.subjectKey], ['session-cancelled', 'schedule', `teddy_${S_CANCEL}`]);
  check('body names the label and the grace expiry', l3.body,
      `Fall Scramble on ${notices.dayLabel(plus3)} was cancelled by the academy. A bonus token was added to Teddy's account (expires ${notices.dayLabel(graceCancelExpiry)}).`);
  check('recipients', l3.to, ['u-pat:skipped/off', 'u-robin:skipped/no-phone', 'u-teddy:skipped/skipped']);
  check("a member's own cancel sends nothing", await exists('notifications', `session-cancelled_nell_${S_PROMO}`), false);

  // ---------------------------------------------------------------- STEP 4
  log(`\nSTEP 4  runSessionReminders at a fixed clock (bookings dated ${tomorrow})`);
  let r = await jobs.runSessionReminders({now: NOW, db});
  check('summary', [r.date, r.considered, r.sent, r.duplicate], [tomorrow, 2, 2, 0]);
  const l4 = await ledger(`reminder-24h_teddy_${S_REM_T}`);
  check('teddy reminder body', l4.body, 'Reminder: Teddy has Training tomorrow at 3:00 PM.');
  check('teddy reminder category/ids', [l4.category, l4.householdId, l4.athleteId, l4.bookingId], ['schedule', 'hart', 'teddy', `teddy_${S_REM_T}`]);
  check('teddy reminder recipients', l4.to, ['u-pat:skipped/off', 'u-robin:skipped/no-phone', 'u-teddy:skipped/skipped']);
  const l4w = await ledger(`reminder-24h_wren_${S_REM_W}`);
  check('wren reminder recipients (parent with schedule EMAIL off, no phone)', l4w.to, ['u-sam:off/no-phone']);
  check('cancelled booking dated tomorrow got no reminder', await exists('notifications', `reminder-24h_nell_${S_REM_X}`), false);
  check('a booking dated the day after tomorrow got no reminder', await exists('notifications', `reminder-24h_teddy_${S_BOOK}`), false);
  r = await jobs.runSessionReminders({now: NOW, db});
  check('IDEMPOTENT re-run at the same clock: nothing sent twice', [r.considered, r.sent, r.duplicate], [2, 0, 2]);
  check('reminder-24h ledger rows still 2', await countKind('reminder-24h'), 2);

  // ---------------------------------------------------------------- STEP 5
  log(`\nSTEP 5  runTokenExpiryReminders at a fixed clock (${EXP_TODAY}; expiring ${EXP_TARGET})`);
  r = await jobs.runTokenExpiryReminders({now: EXP_NOW, db});
  check('summary', [r.today, r.target, r.tokens, r.grace, r.duplicate], [EXP_TODAY, EXP_TARGET, 1, 1, 0]);
  const l5 = await ledger(`tokens-expiring_teddy_${HART_PERIOD.periodKey}`);
  check('kind/category/ids', [l5.kind, l5.category, l5.householdId, l5.athleteId, l5.subjectKey],
      ['tokens-expiring', 'billing', 'hart', 'teddy', `teddy_${HART_PERIOD.periodKey}`]);
  check('body: granted 4 - used 1 (grace-charged booking excluded) - reserved 1', l5.body,
      `Teddy has 2 tokens left that expire ${notices.dayLabel(EXP_TARGET)}. Book before then.`);
  check('BILLING is parents only, and billing email is LOCKED ON for a parent who switched it off', l5.to,
      ['u-pat:skipped/skipped', 'u-robin:skipped/no-phone']);
  const l5g = await ledger('grace-expiring_grace-w3');
  check('grace body/category', [l5g.kind, l5g.category, l5g.athleteId, l5g.body],
      ['grace-expiring', 'billing', 'wren', `Wren's bonus token expires ${notices.dayLabel(EXP_TARGET)}.`]);
  check('grace recipients (lopez parent only)', l5g.to, ['u-sam:skipped/no-phone']);
  check('4 days out: no tokens-expiring for wren', await exists('notifications', `tokens-expiring_wren_${LOPEZ_PERIOD.periodKey}`), false);
  check('4 days out: no grace-expiring for grace-w4', await exists('notifications', 'grace-expiring_grace-w4'), false);
  check('CONSUMED grace token gets no notice', await exists('notifications', 'grace-expiring_grace-spent'), false);
  check('Elite (tokens: null) is never warned', await exists('notifications', `tokens-expiring_zia_${HART_PERIOD.periodKey}`), false);
  r = await jobs.runTokenExpiryReminders({now: EXP_NOW, db});
  check('IDEMPOTENT re-run at the same clock', [r.tokens, r.grace, r.duplicate], [0, 0, 2]);
  check('ledger rows still 1 + 1', [await countKind('tokens-expiring'), await countKind('grace-expiring')], [1, 1]);

  // ---------------------------------------------------------------- STEP 6
  log('\nSTEP 6  membership status flips -> the pin\'s three bodies (parents only)');
  for (const status of ['past_due', 'lapsed', 'active']) {
    await db.collection('households').doc('hart').update({'membership.status': status, 'membership.updatedAt': TS(Date.now())});
    await settle(1200);
  }
  await waitFor(async () => (await db.collection('notifications').where('kind', '==', 'membership').where('householdId', '==', 'hart').get()).size === 3, 'three membership notices');
  const mSnap = await db.collection('notifications').where('kind', '==', 'membership').where('householdId', '==', 'hart').get();
  check('three notices, one per flip', mSnap.size, 3);
  check('bodies', mSnap.docs.map((d) => d.data().body).sort(), [
    'A payment didn\'t go through — new bookings are paused until it clears.',
    'Membership lapsed — upcoming bookings were released.',
    'Payment received — booking is open again.'].sort());
  check('category billing, parents only, athleteId null', mSnap.docs.map((d) => `${d.data().category}/${(d.data().recipients || []).length}/${d.data().athleteId}`).sort(),
      ['billing/2/null', 'billing/2/null', 'billing/2/null']);
  check('ledger id carries the household and the trigger event id', mSnap.docs.every((d) => d.id.startsWith('membership_hart_')), true);

  // ---------------------------------------------------------------- STEP 7
  log('\nSTEP 7  Stripe lapse on the Kerr household -> ONE booking-revoked notice for two bookings');
  const evt = 'evt_notify_lapse';
  r = await post({id: evt, object: 'event', type: 'invoice.payment_failed',
    data: {object: {id: 'in_' + evt, object: 'invoice', customer: 'cus_kerr_notify', status: 'open',
      next_payment_attempt: null, period_start: Math.floor(Date.now() / 1000), period_end: Math.floor(Date.now() / 1000),
      lines: {object: 'list', data: []}}}});
  check('HTTP', [r.status, r.body.outcome], [200, 'lapsed']);
  check('two kerr bookings revoked', [r.body.summary.cancelled, r.body.summary.sessions], [2, 2]);
  await waitFor(async () => !!(await get('notifications', `booking-revoked_kerr_${evt}`)), 'booking-revoked ledger row');
  const l7 = await ledger(`booking-revoked_kerr_${evt}`);
  check('ONE notice per household per event', await countKind('booking-revoked'), 1);
  check('kind/category/athleteId/subjectKey', [l7.kind, l7.category, l7.athleteId, l7.subjectKey], ['booking-revoked', 'billing', null, `kerr_${evt}`]);
  check('body counts the batch', l7.body, '2 upcoming bookings were released because the membership lapsed. Book again once payment resumes.');
  check('parents only', l7.to, ['u-kerry:skipped/no-phone']);
  await waitFor(async () => (await db.collection('notifications').where('kind', '==', 'membership').where('householdId', '==', 'kerr').get()).size === 1, 'kerr membership notice');
  const kerrM = (await db.collection('notifications').where('kind', '==', 'membership').where('householdId', '==', 'kerr').get()).docs[0];
  check('the lapse also flips membership -> its own notice', kerrM.data().body, 'Membership lapsed — upcoming bookings were released.');

  log(`\n=== ${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'} ===`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
