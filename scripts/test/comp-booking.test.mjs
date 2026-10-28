import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, normalTime, pickAthlete, pickSession, refusal, buildWrites, main } from '../comp-booking.mjs';
import { resolveTarget, commit, docName, fsFields, getDoc } from '../lib/firestore-rest.mjs';

const ARGS = ['--email', 'Parent@Example.com', '--date', '2026-11-25', '--time', '4:00 pm'];

test('parseArgs: date, time and type validated, exactly one of --dry-run | --yes', () => {
  assert.ok(parseArgs(ARGS).error);
  assert.ok(parseArgs([...ARGS, '--dry-run', '--yes']).error);
  assert.ok(parseArgs(['--email', 'a@b.co', '--date', '11/25', '--time', '4:00 PM', '--yes']).error);
  assert.ok(parseArgs([...ARGS, '--type', 'golf', '--yes']).error);
  const ok = parseArgs([...ARGS, '--prod', '--dry-run']);
  assert.equal(ok.email, 'parent@example.com');
  assert.equal(ok.time, '4:00 PM');
  assert.equal(ok.type, 'training');
});

test('normalTime: the forms an owner types', () => {
  assert.equal(normalTime('4:00PM'), '4:00 PM');
  assert.equal(normalTime(' 09:00 a.m. '), '9:00 AM');
  assert.equal(normalTime('4pm'), null);
});

test('pickAthlete: the only athlete, or the one named', () => {
  const a = [{ name: 'Madison Lee' }, { name: 'Max Lee' }];
  assert.ok(pickAthlete(a).error);
  assert.equal(pickAthlete(a, 'madi').athlete.name, 'Madison Lee');
  assert.equal(pickAthlete([a[0]]).athlete.name, 'Madison Lee');
});

test('pickSession: matches type and time, lists the day when it misses', () => {
  const s = [{ id: 'g4', type: 'training', time: '4:00 PM' }, { id: 'p4', type: 'phil', time: '4:00 PM' }];
  assert.equal(pickSession(s, { date: 'd', time: '4:00 PM', type: 'training' }).session.id, 'g4');
  assert.match(pickSession(s, { date: 'd', time: '6:00 PM', type: 'training' }).error, /No training session at 6:00 PM.*4:00 PM phil/);
});

test('refusal: unpaid only, and never a cancelled, past, full, reserved or held seat', () => {
  const ath = { name: 'Madison', billing: { status: 'pending' }, handicap: 12 };
  const ses = { date: '2026-11-25', booked: 1, capacity: 14 };
  const today = '2026-10-20';
  assert.equal(refusal({ athlete: ath, session: ses, existing: null, today }), null);
  assert.match(refusal({ athlete: { ...ath, billing: { status: 'active' } }, session: ses, existing: null, today }), /not unpaid/);
  assert.match(refusal({ athlete: { ...ath, billing: undefined }, session: ses, existing: null, today }), /not unpaid/);
  assert.match(refusal({ athlete: ath, session: { ...ses, status: 'cancelled' }, existing: null, today }), /cancelled/);
  assert.match(refusal({ athlete: ath, session: ses, existing: null, today: '2026-11-26' }), /day is over/);
  assert.match(refusal({ athlete: ath, session: { ...ses, booked: 14 }, existing: null, today }), /full/);
  assert.match(refusal({ athlete: ath, session: { ...ses, maxHandicap: 5 }, existing: null, today }), /reserved/);
  assert.equal(refusal({ athlete: { ...ath, handicap: 4 }, session: { ...ses, maxHandicap: 5 }, existing: null, today }), null);
  assert.match(refusal({ athlete: ath, session: ses, existing: { status: 'confirmed' }, today }), /already holds/);
  assert.equal(refusal({ athlete: ath, session: ses, existing: { status: 'cancelled' }, today }), null);
});

test('buildWrites: a create plus the seat under the session updateTime; a cancelled seat re-confirms', () => {
  const base = { athlete: { id: 'a1' }, household: { id: 'h1' }, session: { id: 's1', date: '2026-11-25', type: 'training', booked: 3 }, sessionUpdateTime: 'S' };
  const [b, s] = buildWrites({ ...base, existing: null });
  assert.deepEqual(b.currentDocument, { exists: false });
  assert.ok(b.update.name.endsWith('/bookings/a1_s1'));
  assert.equal(b.update.fields.periodKey.stringValue, '2026-11-01');
  assert.equal(b.update.fields.chargedFrom.stringValue, 'period');
  assert.equal(s.update.fields.booked.integerValue, '4');
  assert.deepEqual(s.currentDocument, { updateTime: 'S' });
  const [re] = buildWrites({ ...base, existing: { status: 'cancelled' }, bookingUpdateTime: 'B' });
  assert.deepEqual(re.updateMask.fieldPaths, ['status', 'chargedFrom', 'comp']);
  assert.deepEqual(re.currentDocument, { updateTime: 'B' });
});

// Against a real Firestore emulator; skipped unless one is running, e.g.
//   npx firebase-tools emulators:exec --only firestore --project rypacad "node --test scripts/test/comp-booking.test.mjs"
test('against the emulator: dry run writes nothing, --yes books one seat, a re-run refuses', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const t = await resolveTarget({ prod: false });
  const stamp = String(process.hrtime.bigint());
  const hh = `hh-${stamp}`, ath = `ath${stamp}`, paid = `paid${stamp}`, email = `parent-${stamp}@example.test`;
  const date = '2026-11-25';
  const ses = `ses-${stamp}`;
  await commit(t, [
    { update: { name: docName('households', hh), fields: fsFields({ name: 'Lee family' }) } },
    { update: { name: docName('users', `u-${stamp}`), fields: fsFields({ role: 'parent', householdId: hh, email }) } },
    { update: { name: docName('athletes', ath), fields: fsFields({ name: 'Madison Lee', householdId: hh, packageId: 't-4', billing: { status: 'pending', customerId: null, subscriptionId: null } }) } },
    { update: { name: docName('athletes', paid), fields: fsFields({ name: 'Max Lee', householdId: hh, packageId: 't-4', billing: { status: 'active' } }) } },
    { update: { name: docName('sessions', ses), fields: fsFields({ date, time: '4:00 PM', type: 'training', capacity: 14, booked: 1, title: 'Golf' }) } },
  ]);
  const run = (mode, who = 'Madison') => main(['--email', email, '--athlete', who, '--date', date, '--time', '4:00 PM', mode], { today: '2026-10-20' });
  assert.equal(await run('--dry-run'), 0);
  assert.equal(await getDoc(t, 'bookings', `${ath}_${ses}`), null);
  assert.equal((await getDoc(t, 'sessions', ses)).booked, 1);
  assert.equal(await run('--yes'), 0);
  const b = await getDoc(t, 'bookings', `${ath}_${ses}`);
  assert.equal(b.status, 'confirmed');
  assert.equal(b.householdId, hh);
  assert.equal(b.periodKey, '2026-11-01');
  assert.equal(b.comp, true);
  assert.ok(b.createdAt);
  assert.equal((await getDoc(t, 'sessions', ses)).booked, 2);
  assert.equal(await run('--yes'), 1); // already holds the seat
  assert.equal((await getDoc(t, 'sessions', ses)).booked, 2);
  assert.equal(await run('--yes', 'Max'), 1); // paid: books with own tokens
  // The family cancels it in the app, then the owner books it again.
  await commit(t, [
    { update: { name: docName('bookings', `${ath}_${ses}`), fields: fsFields({ status: 'cancelled', cancelReason: 'member' }) }, updateMask: { fieldPaths: ['status', 'cancelReason'] } },
    { update: { name: docName('sessions', ses), fields: fsFields({ booked: 1 }) }, updateMask: { fieldPaths: ['booked'] } },
  ]);
  assert.equal(await run('--yes'), 0);
  assert.equal((await getDoc(t, 'bookings', `${ath}_${ses}`)).status, 'confirmed');
  assert.equal((await getDoc(t, 'sessions', ses)).booked, 2);
});
