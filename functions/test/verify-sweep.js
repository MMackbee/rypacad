/* Sprint 17 waitlist-sweep harness - runs against the ISOLATED emulator
 * (firestore 8082, config firebase.functions-lane.json at the repo root).
 * It WIPES the collections it touches on that instance; never point it at
 * 8080. The sweep's body is called directly with a fixed clock (scheduled
 * functions never fire in the emulator).
 * Owner ruling 2026-10-01: the sweep closes an entry and tells the family;
 * it mints NOTHING. portal/sweep.test.js covers the same body without an
 * emulator.
 *   node test/verify-sweep.js   (from functions/, emulator running) */
'use strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8082';
process.env.GCLOUD_PROJECT = 'rypacad';
process.env.FUNCTIONS_EMULATOR = 'true';

const admin = require('firebase-admin');
const sweep = require('../portal/sweep.js');

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
async function get(col, id) {
  const s = await db.collection(col).doc(id).get();
  return s.exists ? s.data() : null;
}
async function count(col, filter) {
  let q = db.collection(col);
  if (filter) q = q.where(...filter);
  return (await q.get()).size;
}

async function wipe() {
  for (const c of ['households', 'athletes', 'packages', 'sessions', 'bookings', 'waitlist', 'graceTokens', 'notifications', 'users']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

// The 'waitlist-expired' notice's ledger key (portal/waitlist-notices.js): it
// carries the entry's joinedAt, so every seeded entry joins at one fixed time.
const JOINED = Date.UTC(2026, 8, 10, 15);
const noticeKey = (sessionId, athleteId) => `${sessionId}_${athleteId}_waitlist_${JOINED}`;

// A fixed clock: "today" is 2026-09-20 in Chicago (noon UTC-5 is safe).
const NOW = new Date(Date.UTC(2026, 8, 20, 17));
const TODAY = '2026-09-20';

async function seed() {
  const set = (c, id, d) => db.collection(c).doc(id).set(d);
  await set('households', 'hart', {name: 'Hart family', periodAnchorDay: 1});
  await set('athletes', 'teddy', {name: 'Teddy Hart', householdId: 'hart', packageId: 't-12'});
  await set('athletes', 'wren', {name: 'Wren Hart', householdId: 'hart', packageId: 't-6'});
  await set('athletes', 'ivy', {name: 'Ivy Hart', householdId: 'hart', packageId: 'elite'});
  await set('packages', 't-12', {name: '12 tokens', kind: 'tokens', tokens: 12});
  await set('packages', 't-6', {name: '6 tokens', kind: 'tokens', tokens: 6});
  await set('packages', 'elite', {name: 'Elite', kind: 'elite', tokens: null});
  await set('users', 'u-pat', {role: 'parent', householdId: 'hart', email: 'pat@example.test'});
  await set('sessions', '2026-09-18-0', {date: '2026-09-18', time: '3:00 PM', type: 'training', label: null, capacity: 2, booked: 2});
  await set('sessions', '2026-09-19-0', {date: '2026-09-19', time: '10:00 AM', type: 'tournament', label: 'Fall Scramble', capacity: 2, booked: 2});
  await set('sessions', '2026-09-25-0', {date: '2026-09-25', time: '3:00 PM', type: 'training', label: null, capacity: 2, booked: 2});
  const entry = (sid, aid, date) => set('waitlist', `${sid}_${aid}`, {
    sessionId: sid, athleteId: aid, householdId: 'hart', date, periodKey: '2026-09-01', joinedAt: TS(JOINED), createdBy: 'u-pat',
  });
  await entry('2026-09-18-0', 'teddy', '2026-09-18'); // expired -> closed + notice
  await entry('2026-09-18-0', 'ivy', '2026-09-18'); // expired, Elite -> closed + notice with no token sentence
  await entry('2026-09-19-0', 'teddy', '2026-09-19'); // expired -> closed + notice
  await entry('2026-09-19-0', 'wren', '2026-09-19'); // expired -> closed + notice
  await entry('2026-09-25-0', 'teddy', '2026-09-25'); // not expired -> untouched
  // A token the OLD sweep minted before the 2026-10-01 ruling: left alone, and no new one joins it.
  await set('graceTokens', 'sweep-2026-09-19-0-teddy-1', {
    athleteId: 'teddy', householdId: 'hart', expiresAt: '2026-10-15', reason: 'waitlist-expired',
    sourceSessionId: '2026-09-19-0', createdBy: 'sweep', createdAt: TS(Date.now()),
  });
}

async function main() {
  log('=== Sprint 17 waitlist sweep - isolated emulator verification ===');
  await wipe();
  await seed();

  log('\nSTEP 1  first run at a fixed clock');
  let r = await sweep.runWaitlistSweep({now: NOW, db});
  check('summary', [r.today, r.expired, r.skipped, r.notified], [TODAY, 4, 0, 4]);
  check('summary carries no minted count', 'minted' in r, false);
  check('expired entries gone, the future one kept', [
    await get('waitlist', '2026-09-18-0_teddy'), await get('waitlist', '2026-09-18-0_ivy'), await get('waitlist', '2026-09-19-0_teddy'),
    await get('waitlist', '2026-09-19-0_wren'), Boolean(await get('waitlist', '2026-09-25-0_teddy')),
  ], [null, null, null, null, true]);
  check('NOTHING minted: only the pre-ruling token is there', (await db.collection('graceTokens').get()).docs.map((d) => d.id), ['sweep-2026-09-19-0-teddy-1']);
  const n1 = await get('notifications', `waitlist-expired_${noticeKey('2026-09-18-0', 'teddy')}`);
  check('notice: kind/category/ids', [n1.kind, n1.category, n1.householdId, n1.athleteId, n1.sessionId], ['waitlist-expired', 'schedule', 'hart', 'teddy', '2026-09-18-0']);
  check('notice body', n1.body, 'The waitlist for Training, Fri, Sep 18 at 3:00 PM closed without a spot for Teddy. The token held for it is free to use again.');
  check('notice recipients (parent, email skipped in the emulator)', n1.recipients.map((x) => `${x.uid}:${x.email}/${x.push}`), ['u-pat:skipped/no-device']);
  check('Elite notice has no token sentence', (await get('notifications', `waitlist-expired_${noticeKey('2026-09-18-0', 'ivy')}`)).body,
      'The waitlist for Training, Fri, Sep 18 at 3:00 PM closed without a spot for Ivy.');
  check('wren notice names the tournament', (await get('notifications', `waitlist-expired_${noticeKey('2026-09-19-0', 'wren')}`)).body,
      'The waitlist for Fall Scramble, Sat, Sep 19 at 10:00 AM closed without a spot for Wren. The token held for it is free to use again.');
  check('teddy is told about Sep 19 too (no mint to skip any more)', Boolean(await get('notifications', `waitlist-expired_${noticeKey('2026-09-19-0', 'teddy')}`)), true);

  log('\nSTEP 2  second run, same clock: nothing to do');
  r = await sweep.runWaitlistSweep({now: NOW, db});
  check('summary', [r.expired, r.skipped, r.notified], [0, 0, 0]);
  check('graceTokens still 1, notices still 4', [await count('graceTokens'), await count('notifications')], [1, 4]);

  log('\nSTEP 3  six days later: the Sep 25 entry expires');
  r = await sweep.runWaitlistSweep({now: new Date(Date.UTC(2026, 8, 26, 17)), db});
  check('summary', [r.today, r.expired, r.notified], ['2026-09-26', 1, 1]);
  check('still nothing minted', await count('graceTokens'), 1);
  check('its entry is gone', await get('waitlist', '2026-09-25-0_teddy'), null);

  log(failures ? `\n=== ${failures} FAILED ===` : '\n=== ALL CHECKS PASSED ===');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
