/* Sprint 17 waitlist-sweep harness - runs against the ISOLATED emulator
 * (firestore 8082, config firebase.functions-lane.json at the repo root).
 * It WIPES the collections it touches on that instance; never point it at
 * 8080. The sweep's body is called directly with a fixed clock (scheduled
 * functions never fire in the emulator).
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
  for (const c of ['households', 'athletes', 'sessions', 'waitlist', 'graceTokens', 'notifications', 'users']) {
    const snap = await db.collection(c).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  }
}

// A fixed clock: "today" is 2026-09-20 in Chicago (noon UTC-5 is safe).
const NOW = new Date(Date.UTC(2026, 8, 20, 17));
const TODAY = '2026-09-20';

async function seed() {
  const set = (c, id, d) => db.collection(c).doc(id).set(d);
  await set('households', 'hart', {name: 'Hart family', periodAnchorDay: 1});
  await set('athletes', 'teddy', {name: 'Teddy Hart', householdId: 'hart', packageId: 't-12'});
  await set('athletes', 'wren', {name: 'Wren Hart', householdId: 'hart', packageId: 't-6'});
  await set('users', 'u-pat', {role: 'parent', householdId: 'hart', email: 'pat@example.test'});
  await set('sessions', '2026-09-18-0', {date: '2026-09-18', time: '3:00 PM', type: 'training', label: null, capacity: 2, booked: 2});
  await set('sessions', '2026-09-19-0', {date: '2026-09-19', time: '10:00 AM', type: 'tournament', label: 'Fall Scramble', capacity: 2, booked: 2});
  await set('sessions', '2026-09-25-0', {date: '2026-09-25', time: '3:00 PM', type: 'training', label: null, capacity: 2, booked: 2});
  const entry = (sid, aid, date) => set('waitlist', `${sid}_${aid}`, {
    sessionId: sid, athleteId: aid, householdId: 'hart', date, periodKey: '2026-09-01', joinedAt: TS(Date.now()), createdBy: 'u-pat',
  });
  await entry('2026-09-18-0', 'teddy', '2026-09-18'); // expired -> mint + notice
  await entry('2026-09-19-0', 'teddy', '2026-09-19'); // expired, but the manual script already minted one
  await entry('2026-09-19-0', 'wren', '2026-09-19'); // expired -> mint + notice
  await entry('2026-09-25-0', 'teddy', '2026-09-25'); // not expired -> untouched
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
  check('summary', [r.today, r.expired, r.minted, r.skipped, r.notified], [TODAY, 3, 2, 1, 2]);
  check('expired entries gone, the future one kept', [
    await get('waitlist', '2026-09-18-0_teddy'), await get('waitlist', '2026-09-19-0_teddy'),
    await get('waitlist', '2026-09-19-0_wren'), Boolean(await get('waitlist', '2026-09-25-0_teddy')),
  ], [null, null, null, true]);
  const g1 = await get('graceTokens', sweep.graceIdFor('2026-09-18-0', 'teddy'));
  check('teddy minted for Sep 18 (deterministic id, 30 days, sweep)', [g1.athleteId, g1.householdId, g1.reason, g1.sourceSessionId, g1.expiresAt, g1.createdBy],
      ['teddy', 'hart', 'waitlist-expired', '2026-09-18-0', '2026-10-20', 'sweep']);
  check('teddy NOT minted again for Sep 19 (script token honoured)', await get('graceTokens', sweep.graceIdFor('2026-09-19-0', 'teddy')), null);
  check('wren minted for Sep 19', Boolean(await get('graceTokens', sweep.graceIdFor('2026-09-19-0', 'wren'))), true);
  check('graceTokens total', await count('graceTokens'), 3);
  const n1 = await get('notifications', `waitlist-expired_${sweep.graceIdFor('2026-09-18-0', 'teddy')}`);
  check('notice: kind/category/ids', [n1.kind, n1.category, n1.householdId, n1.athleteId, n1.sessionId], ['waitlist-expired', 'schedule', 'hart', 'teddy', '2026-09-18-0']);
  check('notice body', n1.body, 'The waitlist for Training, Fri, Sep 18 at 3:00 PM closed without a spot for Teddy. A bonus token was added to Teddy\'s account (expires Tue, Oct 20).');
  check('notice recipients (parent, email skipped in the emulator)', n1.recipients.map((x) => `${x.uid}:${x.email}/${x.push}`), ['u-pat:skipped/no-device']);
  check('wren notice names the tournament', (await get('notifications', `waitlist-expired_${sweep.graceIdFor('2026-09-19-0', 'wren')}`)).body,
      'The waitlist for Fall Scramble, Sat, Sep 19 at 10:00 AM closed without a spot for Wren. A bonus token was added to Wren\'s account (expires Tue, Oct 20).');
  check('no notice for the skipped mint', await get('notifications', `waitlist-expired_${sweep.graceIdFor('2026-09-19-0', 'teddy')}`), null);

  log('\nSTEP 2  second run, same clock: nothing to do');
  r = await sweep.runWaitlistSweep({now: NOW, db});
  check('summary', [r.expired, r.minted, r.skipped, r.notified], [0, 0, 0, 0]);
  check('graceTokens still 3, notices still 2', [await count('graceTokens'), await count('notifications')], [3, 2]);

  log('\nSTEP 3  six days later: the Sep 25 entry expires');
  r = await sweep.runWaitlistSweep({now: new Date(Date.UTC(2026, 8, 26, 17)), db});
  check('summary', [r.today, r.expired, r.minted, r.notified], ['2026-09-26', 1, 1, 1]);
  check('its bonus token expires 30 days from THAT run', (await get('graceTokens', sweep.graceIdFor('2026-09-25-0', 'teddy'))).expiresAt, '2026-10-26');

  log(failures ? `\n=== ${failures} FAILED ===` : '\n=== ALL CHECKS PASSED ===');
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
