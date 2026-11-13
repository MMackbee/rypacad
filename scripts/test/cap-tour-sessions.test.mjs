import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAP, parseArgs, planCaps, buildWrite, capLine, failureNote, main } from '../cap-tour-sessions.mjs';
import { resolveTarget, commit, docName, fsFields, getDoc } from '../lib/firestore-rest.mjs';

const TODAY = '2026-11-13';
const p = (argv) => parseArgs(argv, { today: TODAY });

test('parseArgs: one of --dry-run | --yes; the window defaults to today .. the season end', () => {
  assert.equal(CAP, 20);
  assert.match(p([]).error, /exactly one of --dry-run or --yes/);
  assert.match(p(['--prod']).error, /exactly one of --dry-run or --yes/);
  assert.match(p(['--dry-run', '--yes']).error, /exactly one of --dry-run or --yes/);
  assert.deepEqual(p(['--dry-run']), { prod: false, from: TODAY, to: '2027-02-27', dryRun: true, yes: false });
  assert.deepEqual(p(['--prod', '--yes']), { prod: true, from: TODAY, to: '2027-02-27', dryRun: false, yes: true });
  const win = p(['--from', '2026-11-14', '--to', '2026-12-31', '--dry-run']);
  assert.deepEqual([win.from, win.to], ['2026-11-14', '2026-12-31']);
  assert.match(p(['--from', '2026-12-31', '--to', '2026-11-14', '--dry-run']).error, /--from \(2026-12-31\) is after --to \(2026-11-14\)/);
  assert.match(p(['--to', '2027-02-30', '--dry-run']).error, /real dates/);
  assert.match(p(['--from', '11/14/2026', '--dry-run']).error, /real dates/);
  assert.match(p(['--from', '2026-11-14', '--from', '2026-11-21', '--dry-run']).error, /--from may be given only once/);
  assert.match(p(['--to', '--dry-run']).error, /--to needs a value/);
  assert.match(p(['--from']).error, /--from needs a value/);
  assert.match(p(['--dry-run', '--cap', '18']).error, /Unknown argument: --cap/);
});

const tour = (id, date, time, over = {}) => ({ id, date, time, durationMinutes: 120, type: 'tournament', capacity: 25, booked: 0, status: 'scheduled', ...over });

test('planCaps: a Tour event at 25 goes to 20; one already at 20 is left; training, phil and mental are never touched', () => {
  const plan = planCaps([
    tour('2026-11-14-0', '2026-11-14', '10:00 AM', { booked: 19 }),
    tour('2026-11-14-1', '2026-11-14', '12:00 PM', { capacity: 20, booked: 4 }),
    { id: '2026-11-14-2', date: '2026-11-14', time: '12:00 PM', type: 'training', capacity: 12, booked: 3 },
    { id: '2026-11-14-3', date: '2026-11-14', time: '11:00 AM', type: 'phil', capacity: 6, booked: 2 },
    { id: 'cal-abc', date: '2026-11-14', time: '9:00 AM', type: 'mental', capacity: 1, booked: 1 },
    { id: '2026-11-16-0', date: '2026-11-16', time: '4:00 PM', type: 'training', capacity: 25, booked: 0 },
  ]);
  assert.deepEqual(plan, {
    change: [{ id: '2026-11-14-0', date: '2026-11-14', time: '10:00 AM', from: 25, booked: 19, over: false }],
    same: ['2026-11-14-1'],
  });
});

test('planCaps: 23 booked is still capped at 20 and flagged over (everyone kept); exactly 20 booked is not over', () => {
  const plan = planCaps([
    tour('2026-11-21-0', '2026-11-21', '10:00 AM', { booked: 23 }),
    tour('2026-11-21-1', '2026-11-21', '12:00 PM', { booked: 20 }),
  ]);
  assert.deepEqual(plan.change, [
    { id: '2026-11-21-0', date: '2026-11-21', time: '10:00 AM', from: 25, booked: 23, over: true },
    { id: '2026-11-21-1', date: '2026-11-21', time: '12:00 PM', from: 25, booked: 20, over: false },
  ]);
  assert.deepEqual(plan.same, []);
});

test('planCaps: by date then start time; any other number goes to 20 like the sync writes it; a missing capacity or booked reads as such', () => {
  const plan = planCaps([
    tour('2026-12-05-1', '2026-12-05', '12:00 PM'),
    tour('2026-11-28-x', '2026-11-28', '10:30 AM', { capacity: 16 }),
    tour('2026-12-05-0', '2026-12-05', '9:00 AM', { capacity: undefined, booked: undefined }),
    // Cancelled and hidden events are capped too: only capacity is ever written, so they stay cancelled / hidden.
    tour('2026-12-12-0', '2026-12-12', '10:00 AM', { status: 'cancelled' }),
    tour('2026-12-12-1', '2026-12-12', '12:00 PM', { hidden: true }),
  ]);
  assert.deepEqual(plan.change.map((c) => [c.id, c.from, c.booked]), [
    ['2026-11-28-x', 16, 0],
    ['2026-12-05-0', null, 0],
    ['2026-12-05-1', 25, 0],
    ['2026-12-12-0', 25, 0],
    ['2026-12-12-1', 25, 0],
  ]);
  assert.equal(planCaps([tour('a', '2026-11-14', '10:00 AM', { booked: 19 })], 18).change[0].over, true);
  assert.deepEqual(planCaps([]), { change: [], same: [] });
});

test('buildWrite: masked to capacity alone, under the updateTime of the read', () => {
  const w = buildWrite({ id: '2026-11-14-0', updateTime: '2026-11-13T15:00:00.123456Z' });
  assert.match(w.update.name, /documents\/sessions\/2026-11-14-0$/);
  assert.deepEqual(w.update.fields, { capacity: { integerValue: '20' } });
  assert.deepEqual(w.updateMask, { fieldPaths: ['capacity'] });
  assert.deepEqual(w.currentDocument, { updateTime: '2026-11-13T15:00:00.123456Z' });
  assert.equal(w.updateTransforms, undefined);
  assert.deepEqual(Object.keys(w).sort(), ['currentDocument', 'update', 'updateMask']);
  assert.throws(() => buildWrite({ id: '2026-11-14-0', updateTime: null }), /No updateTime for sessions\/2026-11-14-0/);
});

test('capLine: date time  booked/old -> 20, with the kept note when over', () => {
  const c = { id: '2026-11-14-0', date: '2026-11-14', time: '10:00 AM', from: 25, booked: 19, over: false };
  assert.equal(capLine(c), '  2026-11-14 10:00 AM  19/25 -> 20');
  assert.equal(capLine({ ...c, booked: 23, over: true }), '  2026-11-14 10:00 AM  23/25 -> 20  kept: 23 booked > 20');
  assert.equal(capLine({ ...c, from: null, booked: 0 }), '  2026-11-14 10:00 AM  0/? -> 20');
});

test('failureNote: a changed session only on FAILED_PRECONDITION; any other failure as itself, on one line', () => {
  const body = (code, status, message) => `{\n  "error": {\n    "code": ${code},\n    "message": "${message}",\n    "status": "${status}"\n  }\n}\n`;
  const stale = `Commit against the emulator failed (400): ${body(400, 'FAILED_PRECONDITION', 'the stored version does not match the required base version')}`;
  assert.equal(failureNote(['2026-11-14-0', '2026-11-14-1'], stale),
    '2026-11-14-0, 2026-11-14-1: not written; one of them changed since it was read - run again, dry run first');
  const denied = failureNote(['2026-11-14-0'], `Commit against production failed (401): ${body(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.')}`);
  assert.doesNotMatch(denied, /changed since/);
  assert.match(denied, /^2026-11-14-0: not written \(Commit against production failed \(401\): \{ "error": .*"UNAUTHENTICATED" \} \}\) - run again, dry run first$/);
  assert.equal(failureNote(['x'], undefined), 'x: not written (no error text) - run again, dry run first');
  assert.ok(failureNote(['x'], 'y'.repeat(500)).length < 260);
});

// Against a real Firestore emulator; skipped unless one is running, e.g.
//   npx firebase-tools emulators:exec --only firestore --project rypacad --config firebase.functions-lane.json "node --test scripts/test/cap-tour-sessions.test.mjs"
test('against the emulator: dry run writes nothing; --yes caps only Tour events, keeps every other field, reads back; a second run writes nothing', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const t = await resolveTarget({ prod: false });
  // A window of its own (March 2030), cleared first, so nothing else in the emulator matches.
  const W = ['--from', '2030-03-02', '--to', '2030-03-09'];
  const run = (...rest) => main([...W, ...rest], { today: TODAY });
  const sess = (id, date, time, over = {}) => ({ update: { name: docName('sessions', id), fields: fsFields({ date, time, durationMinutes: 120, type: 'tournament',
    capacity: 25, booked: 0, coachId: null, label: null, special: false, overflow: false, status: 'scheduled', gcalEventId: `ev-${id}`, ...over }) } });
  const ids = ['2030-03-02-0', '2030-03-02-1', '2030-03-02-2', '2030-03-09-0', '2030-03-09-1', '2030-03-09-2', '2030-03-10-0'];
  const clear = () => commit(t, ids.map((id) => ({ delete: docName('sessions', id) })));
  await clear();
  try {
    await commit(t, [
      sess('2030-03-02-0', '2030-03-02', '10:00 AM', { booked: 19 }), // capped
      sess('2030-03-02-1', '2030-03-02', '12:00 PM', { capacity: 20, booked: 2 }), // already 20
      sess('2030-03-02-2', '2030-03-02', '12:00 PM', { type: 'training', capacity: 12, booked: 5 }), // training: untouched
      sess('2030-03-09-0', '2030-03-09', '10:00 AM', { booked: 23 }), // over: capped, all 23 kept
      sess('2030-03-09-1', '2030-03-09', '12:00 PM', { status: 'cancelled', hidden: true, hiddenBy: 'hide-sessions' }), // capped, stays cancelled and hidden
      sess('2030-03-09-2', '2030-03-09', '11:00 AM', { type: 'phil', capacity: 6 }), // phil: untouched
      sess('2030-03-10-0', '2030-03-10', '10:00 AM'), // past --to: untouched
    ]);
    const capOf = async (id) => (await getDoc(t, 'sessions', id)).capacity;

    assert.equal(await run('--dry-run'), 0);
    assert.deepEqual(await Promise.all(ids.map(capOf)), [25, 20, 12, 25, 25, 6, 25]);

    assert.equal(await run('--yes'), 0);
    assert.deepEqual(await Promise.all(ids.map(capOf)), [20, 20, 12, 20, 20, 6, 25]);
    const over = await getDoc(t, 'sessions', '2030-03-09-0');
    assert.deepEqual([over.booked, over.status, over.time, over.gcalEventId], [23, 'scheduled', '10:00 AM', 'ev-2030-03-09-0']);
    const gone = await getDoc(t, 'sessions', '2030-03-09-1');
    assert.deepEqual([gone.status, gone.hidden, gone.hiddenBy, gone.booked], ['cancelled', true, 'hide-sessions', 0]);
    assert.equal((await getDoc(t, 'sessions', '2030-03-02-0')).booked, 19);

    // A write under a stale updateTime is refused as FAILED_PRECONDITION, which failureNote calls a changed session.
    const stale = await commit(t, [buildWrite({ id: '2030-03-02-0', updateTime: '2000-01-01T00:00:00Z', cap: 18 })]).then(() => 'committed', (e) => e.message);
    assert.match(failureNote(['2030-03-02-0'], stale), /: not written; one of them changed since it was read/);
    assert.equal(await capOf('2030-03-02-0'), 20);

    // A second run: everything already at 20, nothing written, still 0.
    assert.equal(await run('--yes'), 0);
    assert.deepEqual(await Promise.all(ids.map(capOf)), [20, 20, 12, 20, 20, 6, 25]);
  } finally {
    await clear();
  }
});
