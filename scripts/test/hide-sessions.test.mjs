import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, matchSessions, missingIds, decide, buildWrite, main } from '../hide-sessions.mjs';
import { resolveTarget, commit, docName, fsFields, getDoc } from '../lib/firestore-rest.mjs';
import { planSync, planWrites } from '../sync-calendar-sessions.mjs';

const TODAY = '2026-11-05';
const p = (argv) => parseArgs(argv, { today: TODAY });
const BASE = ['--days', 'Mon,Wed', '--time', '6:00 PM'];

test('parseArgs: one of --hide | --show, one of --dry-run | --yes, the slot, defaults', () => {
  assert.match(p([...BASE, '--dry-run']).error, /exactly one of --hide or --show/);
  assert.match(p([...BASE, '--hide', '--show', '--dry-run']).error, /exactly one of --hide or --show/);
  assert.match(p([...BASE, '--hide']).error, /exactly one of --dry-run or --yes/);
  assert.match(p([...BASE, '--hide', '--dry-run', '--yes']).error, /exactly one of --dry-run or --yes/);
  const ok = p([...BASE, '--hide', '--dry-run']);
  assert.deepEqual(
    [ok.mode, ok.days, ok.dayNames, ok.time, ok.type, ok.from, ok.to, ok.ids, ok.prod, ok.dryRun, ok.yes],
    ['hide', [1, 3], ['Mon', 'Wed'], '6:00 PM', 'training', TODAY, '2027-02-27', null, false, true, false]
  );
  assert.equal(p([...BASE, '--show', '--yes', '--prod']).mode, 'show');
  assert.equal(p([...BASE, '--show', '--yes', '--prod']).prod, true);
  // Days: any case, any order, each once; full names are not guessed at.
  assert.deepEqual(p(['--days', 'wed, MON,wed', '--time', '6:00 PM', '--hide', '--yes']).days, [1, 3]);
  assert.match(p(['--days', 'Monday', '--time', '6:00 PM', '--hide', '--yes']).error, /--days/);
  assert.match(p(['--days', '', '--time', '6:00 PM', '--hide', '--yes']).error, /--days/);
  assert.match(p(['--time', '6:00 PM', '--hide', '--yes']).error, /--days/);
  // Time: the session docs' own shape, '6:00 PM'.
  assert.equal(p(['--days', 'Mon', '--time', '6:00pm', '--hide', '--yes']).time, '6:00 PM');
  assert.equal(p(['--days', 'Mon', '--time', ' 06:00 p.m. ', '--hide', '--yes']).time, '6:00 PM');
  assert.match(p(['--days', 'Mon', '--time', '18:00', '--hide', '--yes']).error, /--time/);
  assert.match(p(['--days', 'Mon', '--hide', '--yes']).error, /--time/);
  // Type, window, ids.
  assert.equal(p([...BASE, '--type', 'phil', '--hide', '--yes']).type, 'phil');
  assert.match(p([...BASE, '--type', 'mental', '--hide', '--yes']).error, /--type/);
  const win = p([...BASE, '--from', '2026-11-09', '--to', '2026-12-31', '--hide', '--yes']);
  assert.deepEqual([win.from, win.to], ['2026-11-09', '2026-12-31']);
  assert.match(p([...BASE, '--from', '2026-12-31', '--to', '2026-11-09', '--hide', '--yes']).error, /--from .* after --to/);
  assert.match(p([...BASE, '--to', '2027-02-30', '--hide', '--yes']).error, /real date/);
  assert.match(p([...BASE, '--from', '11/09/2026', '--hide', '--yes']).error, /real date/);
  assert.deepEqual(p([...BASE, '--ids', '2026-11-11-7, 2026-11-25-7', '--hide', '--yes']).ids, ['2026-11-11-7', '2026-11-25-7']);
  assert.match(p([...BASE, '--ids', '2026-11-11-7,../users/x', '--hide', '--yes']).error, /--ids/);
  assert.match(p([...BASE, '--ids', ',', '--hide', '--yes']).error, /--ids/);
  // Each value flag once, each with a value; nothing unknown.
  assert.match(p([...BASE, '--days', 'Tue', '--hide', '--yes']).error, /only once/);
  assert.match(p([...BASE, '--to', '--hide', '--yes']).error, /needs a value/);
  assert.match(p([...BASE, '--hide', '--yes', '--everything']).error, /Unknown argument: --everything/);
});

const s = (id, date, over = {}) => ({ id, date, time: '6:00 PM', type: 'training', capacity: 12, booked: 0, status: 'scheduled', ...over });

test('matchSessions: the weekday is the session date as a calendar date; time, type and window must match; sorted', () => {
  const args = p([...BASE, '--from', '2026-11-09', '--to', '2026-11-30', '--hide', '--yes']);
  const docs = [
    s('2026-11-25-7', '2026-11-25'),
    s('2026-11-11-7', '2026-11-11'),
    s('2026-11-09-7', '2026-11-09'),
    s('2026-11-10-7', '2026-11-10'), // Tuesday
    s('2026-11-16-6', '2026-11-16', { time: '5:00 PM' }),
    s('2026-11-16-x', '2026-11-16', { type: 'phil' }),
    s('2026-12-02-7', '2026-12-02'), // past --to
    s('2026-11-04-7', '2026-11-04'), // before --from
    s('2026-11-18-7', '2026-11-18', { time: '6:00 pm' }), // a hand-typed time still matches
  ];
  assert.deepEqual(matchSessions(docs, args).map((x) => x.id), ['2026-11-09-7', '2026-11-11-7', '2026-11-18-7', '2026-11-25-7']);
  const only = p([...BASE, '--ids', '2026-11-25-7,2026-11-10-7', '--hide', '--yes']);
  assert.deepEqual(matchSessions(docs, only).map((x) => x.id), ['2026-11-25-7']);
  assert.deepEqual(missingIds(matchSessions(docs, only), only.ids), ['2026-11-10-7']);
  assert.deepEqual(missingIds(matchSessions(docs, args), null), []);
});

test('decide: hide refuses a seat counted, a live booking or a waitlist entry; show clears only a hidden session', () => {
  const hide = (session, liveBookings = [], waitlist = []) => decide({ mode: 'hide', session, liveBookings, waitlist });
  const show = (session) => decide({ mode: 'show', session, liveBookings: [], waitlist: [] });
  assert.deepEqual(hide(s('a', '2026-11-11')), { action: 'hide', note: 'hide' });
  assert.deepEqual(hide(s('a', '2026-11-11', { booked: 2 })), { action: 'refuse', note: 'NOT hidden: 2 booked' });
  assert.deepEqual(hide(s('a', '2026-11-11'), [{ id: 'b1', status: 'confirmed' }, { id: 'b2', status: 'attended' }]),
    { action: 'refuse', note: 'NOT hidden: 2 live booking(s) (b1, b2) although booked reads 0' });
  assert.deepEqual(hide(s('a', '2026-11-11'), [], [{ id: 'w1' }]), { action: 'refuse', note: 'NOT hidden: 1 on the waitlist' });
  assert.deepEqual(hide(s('a', '2026-11-11', { hidden: true })), { action: 'skip', note: 'already hidden' });
  assert.deepEqual(show(s('a', '2026-11-11', { hidden: true })), { action: 'show', note: 'show' });
  assert.deepEqual(show(s('a', '2026-11-11')), { action: 'skip', note: 'not hidden' });
  assert.deepEqual(show(s('a', '2026-11-11', { hidden: false })), { action: 'skip', note: 'not hidden' });
});

test('buildWrite: masked to hidden, hiddenAt and hiddenBy, under the read updateTime; show removes all three', () => {
  const hide = buildWrite({ id: '2026-11-11-7', mode: 'hide', updateTime: 't1' });
  assert.match(hide.update.name, /documents\/sessions\/2026-11-11-7$/);
  assert.deepEqual(hide.update.fields, { hidden: { booleanValue: true }, hiddenBy: { stringValue: 'hide-sessions' } });
  assert.deepEqual(hide.updateMask, { fieldPaths: ['hidden', 'hiddenBy'] });
  assert.deepEqual(hide.updateTransforms, [{ fieldPath: 'hiddenAt', setToServerValue: 'REQUEST_TIME' }]);
  assert.deepEqual(hide.currentDocument, { updateTime: 't1' });
  const show = buildWrite({ id: '2026-11-11-7', mode: 'show', updateTime: 't2' });
  assert.deepEqual(show.update.fields, {});
  assert.deepEqual(show.updateMask, { fieldPaths: ['hidden', 'hiddenAt', 'hiddenBy'] });
  assert.equal(show.updateTransforms, undefined);
  assert.deepEqual(show.currentDocument, { updateTime: 't2' });
  assert.throws(() => buildWrite({ id: 'x', mode: 'hide', updateTime: null }), /updateTime/);
});

// Against a real Firestore emulator; skipped unless one is running, e.g.
//   npx firebase-tools emulators:exec --only firestore --project rypacad --config firebase.functions-lane.json "node --test scripts/test/hide-sessions.test.mjs"
test('against the emulator: dry run writes nothing; --yes hides only the empty ones; refusals untouched; read-back; --show clears; the sync keeps it', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const t = await resolveTarget({ prod: false });
  // A window of its own (a Monday and Wednesday of March 2030), cleared first, so nothing else in the emulator matches.
  const W = ['--days', 'Mon,Wed', '--time', '6:00 PM', '--from', '2030-03-04', '--to', '2030-03-13'];
  const run = (...rest) => main([...W, ...rest], { today: TODAY });
  const sess = (id, date, over = {}) => ({ update: { name: docName('sessions', id), fields: fsFields({ date, time: '6:00 PM', durationMinutes: 60, type: 'training',
    capacity: 12, booked: 0, coachId: null, label: null, special: false, overflow: false, status: 'scheduled', gcalEventId: `ev-${id}`, ...over }) } });
  const ids = ['2030-03-04-7', '2030-03-06-7', '2030-03-11-7', '2030-03-13-7', '2030-03-05-7', '2030-03-04-6', '2030-03-04-x'];
  const clear = () => commit(t, [...ids.map((id) => ({ delete: docName('sessions', id) })),
    { delete: docName('bookings', 'kid_2030-03-11-7') }, { delete: docName('waitlist', '2030-03-13-7_kid') }]);
  await clear();
  try {
    await commit(t, [
      sess('2030-03-04-7', '2030-03-04'), // Mon, empty: hidden
      sess('2030-03-06-7', '2030-03-06', { booked: 3 }), // Wed, three booked: refused
      sess('2030-03-11-7', '2030-03-11'), // Mon, a live booking although booked reads 0: refused
      sess('2030-03-13-7', '2030-03-13'), // Wed, a waitlist entry: refused
      sess('2030-03-05-7', '2030-03-05'), // Tue: not matched
      sess('2030-03-04-6', '2030-03-04', { time: '5:00 PM' }), // 5 PM: not matched
      sess('2030-03-04-x', '2030-03-04', { type: 'phil' }), // Phil at 6 PM: not matched (type training)
      { update: { name: docName('bookings', 'kid_2030-03-11-7'), fields: fsFields({ athleteId: 'kid', sessionId: '2030-03-11-7', status: 'confirmed' }) } },
      { update: { name: docName('waitlist', '2030-03-13-7_kid'), fields: fsFields({ athleteId: 'kid', sessionId: '2030-03-13-7' }) } },
    ]);
    const hiddenOf = async (id) => (await getDoc(t, 'sessions', id)).hidden ?? null;

    assert.equal(await run('--hide', '--dry-run'), 0);
    for (const id of ids) assert.equal(await hiddenOf(id), null, id);

    assert.equal(await run('--hide', '--yes'), 0);
    const hidden = await getDoc(t, 'sessions', '2030-03-04-7');
    assert.deepEqual([hidden.hidden, hidden.hiddenBy, typeof hidden.hiddenAt, hidden.booked, hidden.time], [true, 'hide-sessions', 'string', 0, '6:00 PM']);
    for (const id of ['2030-03-06-7', '2030-03-11-7', '2030-03-13-7', '2030-03-05-7', '2030-03-04-6', '2030-03-04-x']) assert.equal(await hiddenOf(id), null, id);
    assert.equal((await getDoc(t, 'sessions', '2030-03-06-7')).booked, 3);

    // A second run: already hidden, nothing written, still 0.
    assert.equal(await run('--hide', '--yes'), 0);
    // --ids naming a session the slot does not match refuses the whole run.
    assert.equal(await run('--hide', '--yes', '--ids', '2030-03-04-7,2030-03-05-7'), 1);
    // A slot that matches nothing is an error, not a quiet success.
    assert.equal(await main(['--days', 'Fri', '--time', '6:00 PM', '--from', '2030-03-04', '--to', '2030-03-13', '--hide', '--yes'], { today: TODAY }), 1);

    // The calendar sync moves the hidden block to 6:30 PM: its masked patch keeps the flag (a real commit, read back).
    const cur = await getDoc(t, 'sessions', '2030-03-04-7');
    const desired = new Map([['2030-03-04-7', { date: '2030-03-04', time: '6:30 PM', durationMinutes: 60, type: 'training', capacity: 12, booked: 0,
      coachId: null, label: null, special: false, overflow: false, status: 'scheduled', gcalEventId: 'ev-2030-03-04-7' }]]);
    const writes = planWrites(planSync(desired, new Map([['2030-03-04-7', cur]])));
    assert.equal(writes.length, 1);
    await commit(t, writes);
    const synced = await getDoc(t, 'sessions', '2030-03-04-7');
    assert.deepEqual([synced.time, synced.hidden, synced.hiddenBy, synced.hiddenAt], ['6:30 PM', true, 'hide-sessions', cur.hiddenAt]);

    // --show clears it: the three fields are gone; the 6:30 PM block no longer matches a 6 PM run, so it is named by its new time.
    assert.equal(await main(['--days', 'Mon', '--time', '6:30 PM', '--from', '2030-03-04', '--to', '2030-03-04', '--show', '--dry-run'], { today: TODAY }), 0);
    assert.equal(await hiddenOf('2030-03-04-7'), true);
    assert.equal(await main(['--days', 'Mon', '--time', '6:30 PM', '--from', '2030-03-04', '--to', '2030-03-04', '--show', '--yes'], { today: TODAY }), 0);
    const shown = await getDoc(t, 'sessions', '2030-03-04-7');
    assert.deepEqual(['hidden', 'hiddenAt', 'hiddenBy'].filter((k) => k in shown), []);
    assert.equal(shown.time, '6:30 PM');
  } finally {
    await clear();
  }
});
