import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PHIL_LABEL, RESERVED_RULES, SYNCED_FIELDS, mapEvents, planReport, planSync, planWrites, reservedLimitFor,
} from '../sync-calendar-sessions.mjs';

// Handicap-reserved sessions (owner, 2026-10-02): the Tuesday 3:00 PM training
// block is reserved for a handicap of 5 or better. The sync stamps
// sessions.maxHandicap from ONE rule table, and its plan touches exactly the
// reserved sessions.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = 'scripts/fixtures/gcal-reserved-events.json';
const [FROM, TO] = ['2026-11-02', '2026-11-14'];
const items = JSON.parse(readFileSync(path.join(repoRoot, FIXTURE), 'utf8')).items;

// The two Tuesday 3 PM training blocks. Nov 3 shares its start time with
// Phil's fitness session; the ids are start-time order, then event id.
const RESERVED_IDS = ['2026-11-03-0', '2026-11-10-0'];

function dryRun(tz) {
  const env = { ...process.env };
  delete env.FIRESTORE_EMULATOR_HOST; // no target: the script diffs against an empty map
  if (tz) env.TZ = tz;
  return spawnSync(process.execPath, [
    path.join(repoRoot, 'scripts', 'sync-calendar-sessions.mjs'),
    '--from', FROM, '--to', TO, '--dry-run', '--fixture', FIXTURE,
  ], { cwd: repoRoot, encoding: 'utf8', env });
}
/** The session ids a dry run printed with a maxHandicap, as 'id=limit'. */
const stamped = (stdout) => [...stdout.matchAll(/^ {2}session (\S+): \{[^\n]*"maxHandicap":(\d+)/gm)].map((m) => `${m[1]}=${m[2]}`);

/** What production holds before the rule's first run: the same sessions, with no maxHandicap field at all. */
function existingWithoutLimit(desired, booked = {}) {
  const existing = new Map();
  for (const [id, doc] of desired) {
    const cur = { ...doc, booked: booked[id] ?? 0 };
    delete cur.maxHandicap;
    existing.set(id, cur);
  }
  return existing;
}

test('RESERVED_RULES is the one table: Tuesday, 3:00 PM, training, handicap 5', () => {
  assert.deepEqual(RESERVED_RULES, [{ weekday: 2, time: '3:00 PM', type: 'training', maxHandicap: 5 }]);
});

test('reservedLimitFor: every Tuesday 3:00 PM training block of the season, and nothing else', () => {
  // Tuesdays either side of both clock changes (Nov 1 2026, Mar 14 2027).
  for (const date of ['2026-10-27', '2026-11-03', '2026-12-29', '2027-02-23', '2027-03-16']) {
    assert.equal(reservedLimitFor({ date, time: '3:00 PM', type: 'training' }), 5, date);
  }
  for (const date of ['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']) {
    assert.equal(reservedLimitFor({ date, time: '3:00 PM', type: 'training' }), null, date);
  }
  // The 3 PM fitness session with Phil that runs at the same time is not reserved.
  assert.equal(reservedLimitFor({ date: '2026-11-03', time: '3:00 PM', type: 'phil' }), null);
  assert.equal(reservedLimitFor({ date: '2026-11-03', time: '3:00 PM', type: 'tournament' }), null);
  assert.equal(reservedLimitFor({ date: '2026-11-03', time: '4:00 PM', type: 'training' }), null);
  assert.equal(reservedLimitFor({ date: '2026-11-03', time: '3:30 PM', type: 'training' }), null);
  assert.equal(reservedLimitFor({ date: 'Tuesday', time: '3:00 PM', type: 'training' }), null);
  assert.equal(reservedLimitFor({ time: '3:00 PM', type: 'training' }), null);
});

test('reservedLimitFor reads the table it is given: another row, or none', () => {
  const thursdays = [{ weekday: 4, time: '3:00 PM', type: 'training', maxHandicap: 10 }];
  assert.equal(reservedLimitFor({ date: '2026-11-05', time: '3:00 PM', type: 'training' }, thursdays), 10);
  assert.equal(reservedLimitFor({ date: '2026-11-03', time: '3:00 PM', type: 'training' }, thursdays), null);
  assert.equal(reservedLimitFor({ date: '2026-11-03', time: '3:00 PM', type: 'training' }, []), null);
});

test('the dry run stamps maxHandicap 5 on the Tuesday 3 PM training blocks only', () => {
  const r = dryRun();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Window 2026-11-02\.\.2026-11-14: 7 bookable/);
  assert.deepEqual(stamped(r.stdout), RESERVED_IDS.map((id) => `${id}=5`));
  // Phil's 3 PM session on the same Tuesday, and every other block, carry no such field.
  assert.match(r.stdout, /session 2026-11-03-1: \{[^\n]*"time":"3:00 PM"[^\n]*"type":"phil"[^\n]*"gcalEventId":"res-tue-1103-1500-phil"\}/);
  assert.equal((r.stdout.match(/^ {2}session /gm) || []).length, 7);
  assert.match(r.stdout, /Handicap-reserved in window: 2 session\(s\) - 2026-11-03-0 3:00 PM \(5 or better\), 2026-11-10-0 3:00 PM \(5 or better\)/);
  // Against an empty target a reserved session is created with the field, an open one without it.
  assert.match(r.stdout, /create {2}sessions\/2026-11-03-0 \{[^\n]*"maxHandicap":5\}/);
  assert.match(r.stdout, /create {2}sessions\/2026-11-04-0 \{[^\n]*"gcalEventId":"res-wed-1104-1500"\}/);
});

test("the weekday is the session's calendar date: no drift in a time zone far east or far west", () => {
  for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Chicago', 'UTC']) {
    const r = dryRun(tz);
    assert.equal(r.status, 0, `${tz}: ${r.stderr}`);
    assert.deepEqual(stamped(r.stdout), RESERVED_IDS.map((id) => `${id}=5`), tz);
  }
});

test('first run on existing sessions: exactly the reserved sessions are updates, every other session is unchanged', () => {
  const { sessions: desired } = mapEvents(items, FROM, TO);
  const existing = existingWithoutLimit(desired, { '2026-11-03-0': 6, '2026-11-03-2': 9 });
  const plan = planSync(desired, existing);
  assert.deepEqual(plan.updates.map((u) => [u.id, u.limit]), RESERVED_IDS.map((id) => [id, 'set']));
  assert.deepEqual(plan.unchanged.sort(), ['2026-11-03-1', '2026-11-03-2', '2026-11-04-0', '2026-11-05-0', '2026-11-10-1']);
  for (const key of ['creates', 'deletes', 'cancels', 'conflicts', 'seededUntouched']) assert.deepEqual(plan[key], [], key);

  const writes = planWrites(plan);
  assert.equal(writes.length, 2);
  for (const [i, id] of RESERVED_IDS.entries()) {
    assert.ok(writes[i].update.name.endsWith(`/sessions/${id}`));
    assert.deepEqual(writes[i].updateMask.fieldPaths, [...SYNCED_FIELDS, 'maxHandicap']);
    assert.deepEqual(writes[i].update.fields.maxHandicap, { integerValue: '5' });
    // The seat count is never in the patch: the six bookings already on Nov 3 stay.
    assert.ok(!writes[i].updateMask.fieldPaths.includes('booked'));
    assert.ok(!('booked' in writes[i].update.fields));
  }
});

test('the plan as printed before a production run: the two reserved sessions are named, every other session is only counted', () => {
  const { sessions: desired } = mapEvents(items, FROM, TO);
  const existing = existingWithoutLimit(desired, { '2026-11-03-0': 6, '2026-11-03-2': 9 });
  const plan = planSync(desired, existing);
  const lines = planReport(plan, desired, existing);
  assert.equal(lines.length, 4);
  assert.equal(lines[0], 'Plan: 0 create, 2 update, 5 unchanged, 0 delete, 0 cancel, 0 seeded-untouched');
  assert.equal(lines[1], 'Handicap-reserved in window: 2 session(s) - 2026-11-03-0 3:00 PM (5 or better), 2026-11-10-0 3:00 PM (5 or better)');
  // The block that already holds bookings says so, and names its waitlist too (the sync cannot read one, and an entry
  // already queued stays); the seat count is not in the patch it prints.
  assert.match(lines[2], /^ {2}update {2}sessions\/2026-11-03-0 <- \{[^\n]*"gcalEventId":"res-tue-1103-1500"\} \+ maxHandicap 5 \(reserved: handicap 5 or better\) - 6 booking\(s\) already on it are kept, as is any waitlist; check both$/);
  assert.match(lines[3], /^ {2}update {2}sessions\/2026-11-10-0 <- \{[^\n]*"gcalEventId":"res-tue-1110-1500"\} \+ maxHandicap 5 \(reserved: handicap 5 or better\)$/);
  assert.ok(!lines.some((line) => /"booked"/.test(line)));
  for (const id of plan.unchanged) assert.ok(!lines.some((line) => line.includes(`sessions/${id}`)), id);

  // The run after it: nothing is named at all.
  const stampedNow = new Map([...desired].map(([id, doc]) => [id, { ...doc, booked: existing.get(id).booked }]));
  assert.deepEqual(planReport(planSync(desired, stampedNow), desired, stampedNow), [
    'Plan: 0 create, 0 update, 7 unchanged, 0 delete, 0 cancel, 0 seeded-untouched',
    lines[1],
  ]);

  // The table emptied: the same two sessions, each losing the field, and no reserved line.
  const { sessions: open } = mapEvents(items, FROM, TO, []);
  const emptied = planReport(planSync(open, stampedNow), open, stampedNow);
  assert.equal(emptied[0], 'Plan: 0 create, 2 update, 5 unchanged, 0 delete, 0 cancel, 0 seeded-untouched');
  assert.deepEqual(emptied.slice(1).map((line) => line.replace(/ <- \{[^\n]*\}/, '')), RESERVED_IDS.map((id) => `  update  sessions/${id} - maxHandicap removed (no rule reserves this session now)`));
});

test('an absent field, an explicit null and "no rule" are the same thing: nothing to write', () => {
  const { sessions: desired } = mapEvents(items, FROM, TO, []);
  const existing = existingWithoutLimit(desired);
  existing.get('2026-11-04-0').maxHandicap = null;
  const plan = planSync(desired, existing);
  assert.deepEqual(plan.updates, []);
  assert.equal(plan.unchanged.length, 7);
  assert.deepEqual(planWrites(plan), []);
});

test('a second run after the stamp is in sync: nothing to write', () => {
  const { sessions: desired } = mapEvents(items, FROM, TO);
  const existing = new Map([...desired].map(([id, doc]) => [id, { ...doc, booked: 3 }]));
  const plan = planSync(desired, existing);
  assert.deepEqual(plan.updates, []);
  assert.equal(plan.unchanged.length, 7);
  assert.deepEqual(planWrites(plan), []);
});

test('emptying the table removes the field from the sessions that carry it, and touches no other', () => {
  const stampedNow = mapEvents(items, FROM, TO).sessions;
  const existing = new Map([...stampedNow].map(([id, doc]) => [id, { ...doc, booked: 2 }]));
  const { sessions: desired } = mapEvents(items, FROM, TO, []);
  assert.ok([...desired.values()].every((doc) => !('maxHandicap' in doc)));

  const plan = planSync(desired, existing);
  assert.deepEqual(plan.updates.map((u) => [u.id, u.limit]), RESERVED_IDS.map((id) => [id, 'remove']));
  assert.equal(plan.unchanged.length, 5);
  for (const w of planWrites(plan)) {
    // In the mask with no value: Firestore deletes the field.
    assert.ok(w.updateMask.fieldPaths.includes('maxHandicap'));
    assert.ok(!('maxHandicap' in w.update.fields));
  }
});

test('a changed limit is an update of the reserved sessions alone', () => {
  const existing = new Map([...mapEvents(items, FROM, TO).sessions].map(([id, doc]) => [id, { ...doc, booked: 0 }]));
  const { sessions: desired } = mapEvents(items, FROM, TO, [{ weekday: 2, time: '3:00 PM', type: 'training', maxHandicap: 8 }]);
  const plan = planSync(desired, existing);
  assert.deepEqual(plan.updates.map((u) => [u.id, u.limit]), RESERVED_IDS.map((id) => [id, 'set']));
  assert.deepEqual(planWrites(plan).map((w) => w.update.fields.maxHandicap), [{ integerValue: '8' }, { integerValue: '8' }]);
});

test('a booked session patched in place under its old id still takes the limit; an open one keeps the plain patch', () => {
  const { sessions: desired } = mapEvents(items, FROM, TO);
  const existing = existingWithoutLimit(desired, { '2026-11-10-0': 4 });
  // Nov 10's reserved block sits under another id (its day-order changed) and holds four bookings.
  existing.set('2026-11-10-9', existing.get('2026-11-10-0'));
  existing.delete('2026-11-10-0');
  const plan = planSync(desired, existing);
  const kept = plan.updates.find((u) => u.id === '2026-11-10-9');
  assert.deepEqual([kept.keptId, kept.limit], [true, 'set']);
  const writes = planWrites(plan);
  const keptWrite = writes.find((w) => w.update.name.endsWith('/sessions/2026-11-10-9'));
  assert.deepEqual(keptWrite.update.fields.maxHandicap, { integerValue: '5' });
  // The other update (Nov 3's reserved block) aside, no write names maxHandicap.
  assert.equal(writes.filter((w) => w.updateMask?.fieldPaths.includes('maxHandicap')).length, 2);
});

test('every Phil session is named "Performance with Phil", whatever its calendar title (owner, 2026-10-12)', () => {
  const sessions = [...mapEvents(items, FROM, TO).sessions.values()];
  const phil = sessions.filter((s) => s.type === 'phil');
  assert.ok(phil.length > 0);
  for (const s of phil) assert.equal(s.label, PHIL_LABEL);
  assert.equal(PHIL_LABEL, 'Performance with Phil');
  // Golf blocks keep their own rule: a generic title has no label.
  assert.ok(sessions.some((s) => s.type === 'training' && s.label === null));
});
