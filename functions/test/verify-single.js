/* Single-token harness (owner rulings 2026-09-29/30) - runs against the
 * ISOLATED emulator (firestore 8082, config firebase.functions-lane.json at
 * the repo root). It WIPES the collections it touches on that instance;
 * never point it at 8080. Every step runs IN THIS PROCESS on a fixed clock,
 * so start the emulator with firestore ONLY - a running functions emulator
 * would fire onSingleTokenSpent / onSessionBookedDecrease on the seeded rows
 * and race the in-process calls:
 *   cd functions && npx firebase-tools emulators:start --only firestore --project rypacad --config ../firebase.functions-lane.json
 *   node test/verify-single.js   (from functions/)
 * P1 cross-period promotion, P2 waitlist holds and the queue, P3 Calendly,
 * P4 the waitlist sweep, P5 the double-spend guard. */
'use strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082';
process.env.GCLOUD_PROJECT = 'rypacad';
process.env.FUNCTIONS_EMULATOR = 'true';

const admin = require('firebase-admin');
const lib = require('../portal/lib.js');
const promotion = require('../portal/promotion.js');
const calendly = require('../portal/calendly.js');
const sweep = require('../portal/sweep.js');
const guard = require('../portal/single-guard.js');

admin.initializeApp({projectId: 'rypacad'});
const db = admin.firestore();

let failures = 0;
const log = (...a) => console.log(...a);
function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) log(`    PASS  ${label} = ${a}`);
  else { failures++; log(`    FAIL  ${label}\n          expected ${e}\n          actual   ${a}`); }
}
const TS = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const T0 = Date.UTC(2026, 10, 1, 12);
async function get(col, id) {
  const s = await db.collection(col).doc(id).get();
  return s.exists ? s.data() : null;
}
async function count(col, filter) {
  let q = db.collection(col);
  if (filter) q = q.where(...filter);
  return (await q.get()).size;
}
const set = (c, id, d) => db.collection(c).doc(id).set(d);

async function wipe(cols) {
  for (const c of cols || ['households', 'athletes', 'packages', 'sessions', 'bookings', 'waitlist',
    'graceTokens', 'tokenPeriods', 'users', 'calendlyEvents', 'notifications']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

const ONE_TIME = {status: 'active', oneTime: true};
const purchase = (athleteId, householdId) => ({athleteId, householdId, expiresAt: '2027-02-27', reason: 'single-purchase',
  sourceSessionId: null, createdBy: 'stripe', createdAt: TS(T0)});
const entry = (sessionId, athleteId, householdId, date, joinedMs) => set('waitlist', `${sessionId}_${athleteId}`, {
  sessionId, athleteId, householdId, date, periodKey: lib.periodFor(date, 1).periodKey, joinedAt: TS(joinedMs), createdBy: 'u-x',
});
const session = (id, date, extra) => set('sessions', id, Object.assign({date, time: '4:00 PM', type: 'training', label: null,
  capacity: 2, booked: 1, status: 'scheduled'}, extra || {}));
const bookingDoc = (athleteId, sessionId, householdId, date, extra) => Object.assign({athleteId, sessionId, householdId, date,
  type: 'training', status: 'confirmed', periodKey: lib.periodFor(date, 1).periodKey, chargedFrom: 'grace', graceTokenId: null,
  createdBy: 'u-x', createdAt: TS(T0)}, extra || {});

// promoteOneSeat's clock (waitlist hardening, 2026-10-01): today in Chicago and
// the instant it was read from. Noon Chicago on Nov 25: Dec 2-5 are inside the
// 30-day window and none of them is "today".
const NOV25 = {today: '2026-11-25', now: new Date('2026-11-25T18:00:00Z')};
// A dropped entry is a full record now; these checks care who and why.
const why = (r) => r.dropped.map((d) => ({athleteId: d.athleteId, reason: d.reason}));

async function seedPackages() {
  await set('packages', 't-6', {name: '6 tokens', kind: 'tokens', tokens: 6, windowDays: 30});
  await set('packages', 'single', {name: 'Single token', kind: 'single', tokens: 1, windowDays: 30});
}

// ---------------------------------------------------------------- P1
async function p1() {
  log('\nP1  cross-period promotion: a token spent in November is not offered in December');
  await set('households', 'quist', {name: 'Quist family', periodAnchorDay: 1});
  await set('athletes', 'sol', {name: 'Sol Quist', householdId: 'quist', packageId: 'single', billing: ONE_TIME});
  await set('graceTokens', 'single_cs_a', purchase('sol', 'quist'));
  await session('nov20', '2026-11-20');
  await set('bookings', 'sol_nov20', bookingDoc('sol', 'nov20', 'quist', '2026-11-20', {graceTokenId: 'single_cs_a'}));
  await session('dec2', '2026-12-02');
  await entry('dec2', 'sol', 'quist', '2026-12-02', T0);
  let r = await promotion.promoteOneSeat('dec2', NOV25);
  check('dropped: the token is spent (cross-period read)', [r.promoted, why(r)], [null, [{athleteId: 'sol', reason: 'no-tokens-left'}]]);
  check('entry deleted, no booking, seat still open', [await get('waitlist', 'dec2_sol'), await get('bookings', 'sol_dec2'),
    (await get('sessions', 'dec2')).booked], [null, null, 1]);

  await db.collection('bookings').doc('sol_nov20').update({status: 'cancelled', cancelledBy: 'u-sol', cancelReason: 'member'});
  await entry('dec2', 'sol', 'quist', '2026-12-02', T0);
  r = await promotion.promoteOneSeat('dec2', NOV25);
  check('promoted once the Nov 20 booking is cancelled',
      r.promoted && [r.promoted.chargedFrom, r.promoted.graceTokenId, r.promoted.periodKey], ['grace', 'single_cs_a', '2026-12-01']);
  const b = await get('bookings', 'sol_dec2');
  check('booking', b && [b.status, b.chargedFrom, b.graceTokenId, b.periodKey, b.promotedFromWaitlist],
      ['confirmed', 'grace', 'single_cs_a', '2026-12-01', true]);
  check('seat taken, entry gone', [(await get('sessions', 'dec2')).booked, await get('waitlist', 'dec2_sol')], [2, null]);
}

// ---------------------------------------------------------------- P2
async function p2() {
  log('\nP2  a waitlist entry HOLDS a token; a purchased token earns no queue priority');
  await set('households', 'quinn', {name: 'Quinn family', periodAnchorDay: 1});
  await set('athletes', 'sol2', {name: 'Sol Two', householdId: 'quinn', packageId: 'single', billing: ONE_TIME});
  await set('graceTokens', 'single_cs_b', purchase('sol2', 'quinn'));
  await session('p2a', '2026-12-04');
  await session('p2b', '2026-12-05');
  await entry('p2a', 'sol2', 'quinn', '2026-12-04', T0);
  await entry('p2b', 'sol2', 'quinn', '2026-12-05', T0 + 1000);
  let r = await promotion.promoteOneSeat('p2a', NOV25);
  check('first promotion drops the entry (its one token is held by the other entry)', [r.promoted, why(r)],
      [null, [{athleteId: 'sol2', reason: 'no-tokens-left'}]]);
  r = await promotion.promoteOneSeat('p2b', NOV25);
  check('second promotion succeeds with the freed token', r.promoted && [r.promoted.chargedFrom, r.promoted.graceTokenId],
      ['grace', 'single_cs_b']);

  // One session, three open seats, three entries: plain (earliest), buyer, bonus (latest).
  await set('athletes', 'plain', {name: 'Pia Quinn', householdId: 'quinn', packageId: 't-6'});
  await set('athletes', 'buyer', {name: 'Bea Quinn', householdId: 'quinn', packageId: 'single', billing: ONE_TIME});
  await set('athletes', 'bonus', {name: 'Bo Quinn', householdId: 'quinn', packageId: 't-6'});
  await set('graceTokens', 'single_cs_q', purchase('buyer', 'quinn'));
  await set('graceTokens', 'p2q-bonus', {athleteId: 'bonus', householdId: 'quinn', expiresAt: '2026-12-31',
    reason: 'session-cancelled', sourceSessionId: 'old', createdBy: 'u-x', createdAt: TS(T0)});
  await session('p2q', '2026-12-03', {capacity: 3, booked: 0});
  await entry('p2q', 'plain', 'quinn', '2026-12-03', T0);
  await entry('p2q', 'buyer', 'quinn', '2026-12-03', T0 + 60000);
  await entry('p2q', 'bonus', 'quinn', '2026-12-03', T0 + 120000);
  const order = [];
  for (let i = 0; i < 3; i += 1) {
    r = await promotion.promoteOneSeat('p2q', NOV25);
    order.push(r.promoted ? `${r.promoted.athleteId}:${r.promoted.chargedFrom}` : `none:${r.reason}`);
  }
  check('bonus holder first, then plain and the single-purchase holder by joinedAt', order,
      ['bonus:grace', 'plain:period', 'buyer:grace']);
  check('buyer spent its purchased token', (await get('bookings', 'buyer_p2q')).graceTokenId, 'single_cs_q');
}

// ---------------------------------------------------------------- P3
const CLOCK = new Date('2026-10-29T15:00:00Z');
function invitee(n, startISO) {
  const ev = `https://api.calendly.com/scheduled_events/single-ev-${n}`;
  return {event: 'invitee.created', payload: {
    email: 'cal@example.test', uri: `${ev}/invitees/single-inv-${n}`, event: ev, old_invitee: null,
    questions_and_answers: [{question: 'Who is attending?', answer: 'Athlete'}],
    tracking: {utm_content: 'cal'},
    scheduled_event: {uri: ev, start_time: startISO, end_time: new Date(Date.parse(startISO) + 30 * 60000).toISOString()},
  }};
}
async function p3() {
  log(`\nP3  Calendly at a fixed clock (${CLOCK.toISOString()})`);
  await set('households', 'calhh', {name: 'Cal family', periodAnchorDay: 1});
  await set('athletes', 'cal', {name: 'Cal Reyes', householdId: 'calhh', packageId: 'single', billing: ONE_TIME});
  await set('users', 'u-cal', {role: 'athlete', athleteId: 'cal', householdId: 'calhh', email: 'cal@example.test'});
  await set('graceTokens', 'single_cs_c', purchase('cal', 'calhh'));
  await set('bookings', 'cal_oct28', bookingDoc('cal', 'oct28', 'calhh', '2026-10-28', {graceTokenId: 'single_cs_c'}));

  let r = await calendly.handleCalendlyEvent(invitee(1, '2026-11-04T21:00:00Z'), {db, now: CLOCK});
  check('Nov 4: the only token was spent Oct 28 -> over-cap', r, {outcome: 'applied', flag: 'over-cap'});
  let b = await get('bookings', 'cal_cal-single-ev-1');
  check('Nov 4 booking', b && [b.date, b.flag, b.chargedFrom, b.graceTokenId], ['2026-11-04', 'over-cap', 'period', null]);

  await set('graceTokens', 'single_cs_c2', purchase('cal', 'calhh'));
  r = await calendly.handleCalendlyEvent(invitee(2, '2026-11-06T21:00:00Z'), {db, now: CLOCK});
  check('Nov 6: the Nov 4 mental booking counts -> over-cadence', r, {outcome: 'applied', flag: 'over-cadence'});
  b = await get('bookings', 'cal_cal-single-ev-2');
  check('Nov 6 booking keeps its flag AND spends the second token', b && [b.date, b.flag, b.chargedFrom, b.graceTokenId],
      ['2026-11-06', 'over-cadence', 'grace', 'single_cs_c2']);
}

// ---------------------------------------------------------------- P4
const NOW4 = new Date(Date.UTC(2026, 10, 10, 17));
async function p4() {
  log(`\nP4  the waitlist sweep at a fixed clock (${lib.todayISO(NOW4)})`);
  await wipe(['waitlist']);
  await set('households', 'sw', {name: 'Sweep family', periodAnchorDay: 1});
  await set('users', 'u-sw', {role: 'parent', householdId: 'sw', email: 'sw@example.test'});
  await set('athletes', 'sage', {name: 'Sage Sweep', householdId: 'sw', packageId: 'single'});
  await set('athletes', 'milo', {name: 'Milo Sweep', householdId: 'sw', packageId: 't-6', billing: ONE_TIME});
  await set('athletes', 'tess', {name: 'Tess Sweep', householdId: 'sw', packageId: 't-6'});
  await set('sessions', 'sw-s', {date: '2026-11-05', time: '3:00 PM', type: 'training', label: null, capacity: 2, booked: 2});
  for (const a of ['sage', 'milo', 'tess']) await entry('sw-s', a, 'sw', '2026-11-05', T0);
  const r = await sweep.runWaitlistSweep({now: NOW4, db});
  // Owner ruling 2026-10-01: a closed waitlist mints nothing, for anyone. The
  // entry is deleted, the token it held is free again, and every family reads
  // the same notice (ledger key: portal/waitlist-notices.js, with joinedAt).
  check('summary [today, expired, skipped, notified]', [r.today, r.expired, r.skipped, r.notified], ['2026-11-10', 3, 0, 3]);
  check('summary carries no minted count', 'minted' in r, false);
  check('every expired entry deleted', await count('waitlist', ['sessionId', '==', 'sw-s']), 0);
  check('NOTHING minted: single, oneTime or t-6', [await count('graceTokens', ['sourceSessionId', '==', 'sw-s']),
    await count('graceTokens', ['reason', '==', 'waitlist-expired'])], [0, 0]);
  const body = async (a) => ((await get('notifications', `waitlist-expired_sw-s_${a}_waitlist_${T0}`)) || {}).body;
  const free = (name) => `The waitlist for Training, Thu, Nov 5 at 3:00 PM closed without a spot for ${name}. ` +
      'The token held for it is free to use again.';
  check('single notice: the held token is free again', await body('sage'), free('Sage'));
  check('oneTime notice: the same', await body('milo'), free('Milo'));
  check('t-6 notice: the same, no bonus token', await body('tess'), free('Tess'));
}

// ---------------------------------------------------------------- P5
async function p5() {
  log('\nP5  the double-spend guard (releaseDoubleSpends in-process)');
  await set('households', 'gh', {name: 'Guard family', periodAnchorDay: 1});
  await set('users', 'u-gia', {role: 'parent', householdId: 'gh', email: 'gia@example.test'});
  await set('athletes', 'gia', {name: 'Gia Guard', householdId: 'gh', packageId: 'single', billing: ONE_TIME});
  const rows = [
    ['g-s1', 'single_cs_g', {createdAt: TS(T0)}],
    ['g-s2', 'single_cs_g', {createdAt: TS(T0 + 60000)}],
    ['r-s1', 'single_cs_r', {createdAt: TS(T0 + 120000)}],
    ['r-s2', 'single_cs_r', {createdAt: TS(T0 - 86400000), rebookedAt: TS(T0 + 300000)}],
    ['t-s1', 'single_cs_t', {createdAt: TS(T0 + 500000), status: 'attended'}],
    ['t-s2', 'single_cs_t', {createdAt: TS(T0)}],
    ['k-s1', 'single_cs_k', {createdAt: TS(T0)}],
    ['k-s2', 'single_cs_k', {createdAt: TS(T0 + 100000), source: 'calendly', type: 'mental'}],
    ['k-s3', 'single_cs_k', {createdAt: TS(T0 + 200000), source: 'calendly', type: 'mental'}],
  ];
  for (const tok of ['single_cs_g', 'single_cs_r', 'single_cs_t', 'single_cs_k']) await set('graceTokens', tok, purchase('gia', 'gh'));
  for (const [sid, tok, extra] of rows) {
    await session(sid, '2026-11-12', {booked: 1, capacity: 15});
    await set('bookings', `gia_${sid}`, bookingDoc('gia', sid, 'gh', '2026-11-12', Object.assign({graceTokenId: tok}, extra)));
  }
  const run = (tok) => guard.releaseDoubleSpends(db, tok);
  check('two creates: the later createdAt loses', await run('single_cs_g'), {keeper: 'gia_g-s1', released: ['gia_g-s2'], stuck: []});
  const lost = await get('bookings', 'gia_g-s2');
  check('loser cancelled', [lost.status, lost.cancelledBy, lost.cancelReason, !!lost.cancelledAt], ['cancelled', 'system', 'double-spend', true]);
  check('its seat released, the keeper untouched', [(await get('sessions', 'g-s2')).booked, (await get('sessions', 'g-s1')).booked,
    (await get('bookings', 'gia_g-s1')).status], [0, 1, 'confirmed']);
  const n = await get('notifications', 'booking-released_gia_g-s2_released');
  check('booking-released ledger row', n && [n.kind, n.category, n.householdId, n.athleteId, n.sessionId, n.bookingId, n.title],
      ['booking-released', 'schedule', 'gh', 'gia', 'g-s2', 'gia_g-s2', 'Booking released']);
  check('notice body', n && n.body, 'Gia\'s booking for Training, Thu, Nov 12 at 4:00 PM was released because its session token ' +
      'was already used for another booking. Buy another token to book it again.');
  check('a re-book with a later rebookedAt loses to an earlier create', await run('single_cs_r'),
      {keeper: 'gia_r-s1', released: ['gia_r-s2'], stuck: []});
  check('an attended keeper survives', await run('single_cs_t'), {keeper: 'gia_t-s1', released: ['gia_t-s2'], stuck: []});
  check('  attended row untouched', (await get('bookings', 'gia_t-s1')).status, 'attended');
  check('Calendly keeps the token; a second Calendly row is never cancelled', await run('single_cs_k'),
      {keeper: 'gia_k-s2', released: ['gia_k-s1'], stuck: ['gia_k-s3']});
  check('  both Calendly rows still confirmed', [(await get('bookings', 'gia_k-s2')).status, (await get('bookings', 'gia_k-s3')).status],
      ['confirmed', 'confirmed']);

  const snapshot = async () => {
    const out = [];
    for (const [sid] of rows) out.push(`${sid}:${(await get('bookings', `gia_${sid}`)).status}:${(await get('sessions', sid)).booked}`);
    return out;
  };
  const before = await snapshot();
  const again = [];
  for (const tok of ['single_cs_g', 'single_cs_r', 'single_cs_t', 'single_cs_k']) again.push((await run(tok)).released.length);
  check('a second run releases nothing', again, [0, 0, 0, 0]);
  check('  and changes nothing', await snapshot(), before);
  check('  still 4 booking-released notices', await count('notifications', ['kind', '==', 'booking-released']), 4);
}

async function main() {
  log('=== Single token - isolated emulator verification (in-process, fixed clocks) ===');
  await wipe();
  await seedPackages();
  await p1();
  await p2();
  await p3();
  await p4();
  await p5();
  log(failures ? `\n=== ${failures} FAILED ===` : '\n=== ALL CHECKS PASSED ===');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
