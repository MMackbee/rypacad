/**
 * Pure checks for the notification jobs' helpers.
 *   node portal/jobs.test.js
 */
'use strict';
const assert = require('node:assert/strict');
const {test, run} = require('./tiny');
const jobs = require('./jobs');

test('graceNoticeKey: a bonus token keys on its own doc id', () => {
  assert.equal(jobs.graceNoticeKey('grace-w3', {athleteId: 'wren',
    expiresAt: '2026-11-11', reason: 'session-cancelled'}), 'grace-w3');
  assert.equal(jobs.graceNoticeKey('s1_wren_waitlist', {athleteId: 'wren',
    expiresAt: '2026-11-11', reason: 'waitlist-expired'}),
  's1_wren_waitlist');
  assert.equal(jobs.graceNoticeKey('legacy', null), 'legacy');
});

test('graceNoticeKey: single tokens share one key per athlete and day',
    () => {
      const a = jobs.graceNoticeKey('single_cs_a', {athleteId: 'sol',
        expiresAt: '2027-02-27', reason: 'single-purchase'});
      const b = jobs.graceNoticeKey('single_cs_b', {athleteId: 'sol',
        expiresAt: '2027-02-27', reason: 'single-purchase'});
      assert.equal(a, 'sol_single_2027-02-27');
      assert.equal(a, b);
      assert.notEqual(jobs.graceNoticeKey('single_cs_c', {athleteId: 'max',
        expiresAt: '2027-02-27', reason: 'single-purchase'}), a);
    });

test('addDays: UTC-noon arithmetic across a month end', () => {
  assert.equal(jobs.addDays('2027-02-20', 7), '2027-02-27');
  assert.equal(jobs.addDays('2026-10-28', 7), '2026-11-04');
});

const lib = require('./lib');
const paid = {billing: {status: 'active'}, packageId: 't-6'};

test('tokenReminderApplies: the Oct 24 run (October period) sends nothing',
    () => {
      // The 2026-10-24 09:00 run targets periods ending Oct 31: pre-season.
      const period = lib.periodFor('2026-10-24', 1);
      assert.equal(period.periodEnd, '2026-10-31');
      assert.equal(jobs.addDays('2026-10-24', jobs.EXPIRY_LEAD_DAYS),
          period.periodEnd);
      assert.equal(jobs.tokenReminderApplies({household: {}, athlete: paid,
        period}), false);
    });

test('tokenReminderApplies: a paid athlete in a season period is warned',
    () => {
      const period = lib.periodFor('2026-11-24', 1);
      assert.equal(period.periodEnd, '2026-11-30');
      assert.equal(jobs.tokenReminderApplies({household: {}, athlete: paid,
        period}), true);
      // No billing block at all is a pre-sprint athlete: active.
      assert.equal(jobs.tokenReminderApplies({household: {},
        athlete: {packageId: 't-6'}, period}), true);
    });

test('tokenReminderApplies: unpaid, lapsed and past-due athletes are skipped',
    () => {
      const period = lib.periodFor('2026-11-24', 1);
      for (const status of ['pending', 'lapsed', 'past_due']) {
        assert.equal(jobs.tokenReminderApplies({household: {},
          athlete: {packageId: 't-6', billing: {status}}, period}), false,
        status);
      }
      assert.equal(jobs.tokenReminderApplies({
        household: {membership: {status: 'past_due'}}, athlete: paid,
        period}), false);
      // A single-token buyer moved onto a package is unpaid until it is paid.
      assert.equal(jobs.tokenReminderApplies({household: {},
        athlete: {packageId: 't-4', billing: {status: 'active',
          oneTime: true}}, period}), false);
    });

test('tokenReminderApplies: a period ending on or after the season start',
    () => {
      assert.equal(jobs.tokenReminderApplies({household: {}, athlete: paid,
        period: {periodEnd: '2026-11-02'}}), false);
      assert.equal(jobs.tokenReminderApplies({household: {}, athlete: paid,
        period: {periodEnd: jobs.SEASON_START}}), true);
      assert.equal(jobs.tokenReminderApplies({household: {}, athlete: paid,
        period: null}), false);
    });

// ---------------------------------------------------------------------------
// 2026-11-04: the notice day comes from the REAL session calendar.

/**
 * Every day from `from` through `to` except Sundays and `skip`.
 * @param {string} from `'YYYY-MM-DD'`.
 * @param {string} to `'YYYY-MM-DD'`.
 * @param {!Array<string>=} skip Days with no sessions.
 * @return {!Array<string>} The days.
 */
function daysBetween(from, to, skip) {
  const out = [];
  for (let d = from; d <= to; d = jobs.addDays(d, 1)) {
    const sunday = new Date(`${d}T12:00:00Z`).getUTCDay() === 0;
    if (!sunday && !(skip || []).includes(d)) out.push(d);
  }
  return out;
}

// The production calendar as read 2026-11-04: sessions every day of the
// season (Tue, Nov 3 - Sat, Feb 27) but Sundays, Thanksgiving, Christmas Eve
// and Day, New Year's Eve and Day. Nov 25, 27, 28, Dec 23, 26, 28-30, Jan 2
// and Feb 15 all have sessions.
const NO_SESSIONS = ['2026-11-26', '2026-12-24', '2026-12-25', '2026-12-31',
  '2027-01-01'];
const CALENDAR = daysBetween('2026-11-03', '2027-02-27', NO_SESSIONS);
const planFor = (day, anchor) =>
  jobs.expiryPlan(lib.periodFor(day, anchor), CALENDAR);

test('expiryPlan: December - last day Wed Dec 30, sent Mon Dec 21', () => {
  const period = lib.periodFor('2026-12-21', 1);
  assert.deepEqual(period, {periodKey: '2026-12-01', periodEnd: '2026-12-31'});
  // The last seven days with sessions: no Dec 24, 25, 27 (Sunday) or 31.
  assert.deepEqual(CALENDAR.filter((d) => d.startsWith('2026-12')).slice(-7),
      ['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-26', '2026-12-28',
        '2026-12-29', '2026-12-30']);
  assert.deepEqual(jobs.expiryPlan(period, CALENDAR),
      {sendOn: '2026-12-21', lastDay: '2026-12-30'});
});

test('expiryPlan: November - Thanksgiving off, last day Mon Nov 30', () => {
  // Nov 30, 28, 27, 25, 24, 23, 21: no Nov 26 and no Sun, Nov 29.
  assert.deepEqual(planFor('2026-11-21', 1),
      {sendOn: '2026-11-21', lastDay: '2026-11-30'});
});

test('expiryPlan: January ends on a Sunday - Sat Jan 30, sent Jan 23', () => {
  assert.deepEqual(planFor('2027-01-23', 1),
      {sendOn: '2027-01-23', lastDay: '2027-01-30'});
});

test('expiryPlan: February stops at the season end, Sat Feb 27', () => {
  // Presidents' Day has sessions; the period runs to Sun, Feb 28.
  assert.ok(CALENDAR.includes('2027-02-15'));
  assert.deepEqual(planFor('2027-02-20', 1),
      {sendOn: '2027-02-20', lastDay: '2027-02-27'});
  // A stray date after the season never moves the last day.
  assert.deepEqual(jobs.expiryPlan(lib.periodFor('2027-02-20', 1),
      CALENDAR.concat(['2027-02-28'])),
  {sendOn: '2027-02-20', lastDay: '2027-02-27'});
  // After the season and before it: no session day, no notice.
  assert.equal(planFor('2027-03-10', 1), null);
  assert.equal(planFor('2026-10-24', 1), null);
});

test('expiryPlan: fewer than seven session days go out on the first', () => {
  // A period opening Thu, Feb 25 has three: Feb 25, 26 and 27.
  assert.deepEqual(planFor('2027-02-25', 25),
      {sendOn: '2027-02-25', lastDay: '2027-02-27'});
  const december = {periodKey: '2026-12-01', periodEnd: '2026-12-31'};
  assert.deepEqual(jobs.expiryPlan(december,
      ['2026-12-30', '2026-12-28', '2026-12-28']),
  {sendOn: '2026-12-28', lastDay: '2026-12-30'});
  assert.equal(jobs.expiryPlan(december, []), null);
  assert.equal(jobs.expiryPlan(null, CALENDAR), null);
});

test('expiryPlan: other anchors count the same session days', () => {
  // Dec 2 - Jan 1: New Year's Day has none, so Wed, Dec 30 again.
  assert.deepEqual(planFor('2026-12-21', 2),
      {sendOn: '2026-12-21', lastDay: '2026-12-30'});
  // Dec 5 - Jan 4: Mon, Jan 4 has sessions; seven back is Wed, Dec 23.
  assert.deepEqual(planFor('2026-12-23', 5),
      {sendOn: '2026-12-23', lastDay: '2027-01-04'});
  // Jan 16 - Feb 15: Presidents' Day is the last day with sessions.
  assert.deepEqual(planFor('2027-02-08', 16),
      {sendOn: '2027-02-08', lastDay: '2027-02-15'});
});

test('sessionDays: a cancelled-only day, Calendly 1:1s and the adult ' +
    'block do not count', () => {
  assert.deepEqual(jobs.sessionDays([
    {date: '2026-12-30', type: 'training', status: 'scheduled'},
    {date: '2026-12-30', type: 'phil'},
    {date: '2026-12-26', type: 'tournament', bookable: true},
    // Dec 31: its one training was cancelled; the others never count.
    {date: '2026-12-31', type: 'training', status: 'cancelled'},
    {date: '2026-12-31', type: 'mental', bookable: false},
    {date: '2027-01-02', type: 'adult', bookable: false},
    {date: '2027-01-04', type: 'training', bookable: false},
    null,
    {type: 'training'},
  ]), ['2026-12-26', '2026-12-30']);
});

/**
 * Families for the expiry job on the fake Firestore, and the production
 * calendar from Nov 30 to Jan 10 as session docs.
 * @return {!Object} The `{path: body}` map.
 */
function expiryFixture() {
  const paid = (name, householdId, packageId) => ({name, householdId,
    packageId, billing: {status: 'active'}});
  const docs = {
    'households/h-two': {periodAnchorDay: 1},
    'households/h-one': {periodAnchorDay: 1},
    'households/h-day2': {periodAnchorDay: 2},
    'households/h-day5': {periodAnchorDay: 5},
    'packages/t-6': {tokens: 6},
    'packages/elite': {tokens: null},
    'athletes/maya': paid('Maya Two', 'h-two', 't-6'),
    'athletes/leo': paid('Leo Two', 'h-two', 't-6'),
    'athletes/zia': paid('Zia Two', 'h-two', 'elite'),
    'athletes/ava': paid('Ava One', 'h-one', 't-6'),
    'athletes/nell': {name: 'Nell One', householdId: 'h-one',
      packageId: 't-6', billing: {status: 'pending'}},
    'athletes/bo': paid('Bo Day', 'h-day2', 't-6'),
    'athletes/cy': paid('Cy Five', 'h-day5', 't-6'),
  };
  for (const day of CALENDAR) {
    if (day < '2026-11-30' || day > '2027-01-10') continue;
    docs[`sessions/${day}-0`] = {date: day, type: 'training',
      status: 'scheduled'};
  }
  docs['sessions/2026-12-26-t'] = {date: '2026-12-26', type: 'tournament'};
  docs['sessions/2026-12-30-p'] = {date: '2026-12-30', type: 'phil'};
  // Dec 31: a cancelled training and a Calendly 1:1 - not a session day.
  docs['sessions/2026-12-31-0'] = {date: '2026-12-31', type: 'training',
    status: 'cancelled'};
  docs['sessions/cal-yannick'] = {date: '2026-12-31', type: 'mental',
    bookable: false, source: 'calendly'};
  // Leo has used 5 of his 6 December tokens.
  for (const day of ['01', '02', '03', '07', '08']) {
    docs[`bookings/leo_${day}`] = {athleteId: 'leo', date: `2026-12-${day}`,
      status: 'confirmed', periodKey: '2026-12-01', chargedFrom: 'period'};
  }
  return docs;
}

/**
 * The fake Firestore with reads that fail: the list of each collection in
 * `lists`, each document path in `docs`, and the `sessions` date range that
 * starts on each day in `spans`.
 * @param {!Object} db A fakeDb.
 * @param {{lists: (!Array<string>|undefined), docs: (!Array<string>|undefined),
 *     spans: (!Array<string>|undefined)}} fail What fails.
 * @return {!Object} The wrapped stand-in.
 */
function failing(db, {lists = [], docs = [], spans = []}) {
  const down = (what) => async () => {
    throw new Error(`UNAVAILABLE: ${what}`);
  };
  const broken = (what) => ({where: () => broken(what), get: down(what)});
  return Object.assign({}, db, {
    collection: (name) => {
      const col = db.collection(name);
      return Object.assign({}, col, {
        get: lists.includes(name) ? down(name) : col.get,
        doc: (id) => docs.includes(`${name}/${id}`) ?
            {id, get: down(`${name}/${id}`)} : col.doc(id),
        where: (f, op, v) => name === 'sessions' && f === 'date' &&
            op === '>=' && spans.includes(v) ?
            broken(`sessions from ${v}`) : col.where(f, op, v),
      });
    },
  });
}

/**
 * Runs `fn` with notify.sendNotice replaced by an in-memory ledger (a second
 * send of the same id is a duplicate, as in the real one) and console.error
 * captured.
 * @param {function(!Map<string, !Object>, !Array<string>): !Promise<void>} fn
 *     The body: the sent notices by ledger id, and the logged errors.
 * @return {!Promise<void>} Resolves when it has run.
 */
async function withLedger(fn) {
  const notify = require('./notify');
  const real = notify.sendNotice;
  const realError = console.error;
  const sent = new Map();
  const errors = [];
  notify.sendNotice = async (args) => {
    const id = `${args.kind}_${args.subjectKey}`;
    if (sent.has(id)) return {id, duplicate: true};
    sent.set(id, args);
    return {id, duplicate: false, sent: true};
  };
  console.error = (...parts) => errors.push(parts.map(String).join(' '));
  try {
    await fn(sent, errors);
  } finally {
    notify.sendNotice = real;
    console.error = realError;
  }
}

// 09:00 in Chicago (CST) is 15:00 UTC.
const nineAM = (day, db) => ({now: new Date(`${day}T15:00:00Z`), db});

test('runTokenExpiryReminders: one notice per household, Mon Dec 21',
    () => withLedger(async (sent, errors) => {
      const {fakeDb} = require('./fake-firestore');
      const db = fakeDb(expiryFixture());
      // Not the closure list's Dec 15 or Dec 22, not the old rule's Dec 24.
      for (const day of ['2026-12-15', '2026-12-22', '2026-12-24']) {
        const r = await jobs.runTokenExpiryReminders(nineAM(day, db));
        assert.deepEqual([r.tokens, r.duplicate, r.failed], [0, 0, 0], day);
      }
      const r = await jobs.runTokenExpiryReminders(nineAM('2026-12-21', db));
      assert.deepEqual([r.today, r.tokens, r.duplicate, r.failed],
          ['2026-12-21', 3, 0, 0]);
      // Zia is Elite (nothing to expire): Leo and Maya, one email.
      const two = sent.get('tokens-expiring_h-two_2026-12-01');
      assert.deepEqual([two.category, two.householdId, two.athleteId],
          ['billing', 'h-two', null]);
      assert.equal(two.body, 'Leo has 1 token left and Maya has 6 tokens ' +
          'left. Their tokens expire Thu, Dec 31; the last day with ' +
          'sessions before then is Wed, Dec 30.');
      // Nell is unpaid: the notice is Ava's alone.
      const one = sent.get('tokens-expiring_h-one_2026-12-01');
      assert.deepEqual([one.householdId, one.athleteId], ['h-one', 'ava']);
      assert.equal(one.body, 'Ava has 6 tokens left that expire Thu, ' +
          'Dec 31. The last day with sessions before then is Wed, Dec 30.');
      // Anchor 2 (Dec 2 - Jan 1): the same session days, the same morning.
      assert.equal(sent.get('tokens-expiring_h-day2_2026-12-02').body,
          'Bo has 6 tokens left that expire Fri, Jan 1. The last day with ' +
          'sessions before then is Wed, Dec 30.');
      assert.equal(sent.size, 3);
      // Same clock again: the ledger ids hold, nothing goes twice.
      const again = await jobs.runTokenExpiryReminders(
          nineAM('2026-12-21', db));
      assert.deepEqual([again.tokens, again.duplicate], [0, 3]);
      // Anchor 5 (Dec 5 - Jan 4) has sessions on its last day.
      const five = await jobs.runTokenExpiryReminders(
          nineAM('2026-12-23', db));
      assert.deepEqual([five.tokens, five.duplicate], [1, 0]);
      assert.equal(sent.get('tokens-expiring_h-day5_2026-12-05').body,
          'Cy has 6 tokens left that expire Mon, Jan 4. Book before then.');
      assert.deepEqual(errors, []);
    }));

test('runTokenExpiryReminders: a failed read skips only its own record',
    () => withLedger(async (sent, errors) => {
      const {fakeDb} = require('./fake-firestore');
      const docs = Object.assign(expiryFixture(), {
        'households/h-bad': {periodAnchorDay: 1},
        'athletes/dax': {name: 'Dax Bad', householdId: 'h-bad',
          packageId: 't-6', billing: {status: 'active'}},
      });
      // Dax's and Maya's token reads fail, and so does the read of the
      // Dec 2 - Jan 1 period's sessions (Bo's household).
      const db = failing(fakeDb(docs), {
        docs: ['tokenPeriods/dax_2026-12-01', 'tokenPeriods/maya_2026-12-01'],
        spans: ['2026-12-02'],
      });
      const r = await jobs.runTokenExpiryReminders(nineAM('2026-12-21', db));
      assert.deepEqual([r.tokens, r.duplicate, r.failed], [2, 0, 3]);
      assert.deepEqual([...sent.keys()].sort(), [
        'tokens-expiring_h-one_2026-12-01',
        'tokens-expiring_h-two_2026-12-01',
      ]);
      // Maya's brother is still told; Maya's failure is in the log.
      const two = sent.get('tokens-expiring_h-two_2026-12-01');
      assert.deepEqual([two.athleteId, two.body], ['leo', 'Leo has 1 token ' +
          'left that expires Thu, Dec 31. The last day with sessions ' +
          'before then is Wed, Dec 30.']);
      assert.equal(errors.length, 3);
      assert.ok(errors.some((e) => e.includes('athlete dax skipped')));
      assert.ok(errors.some((e) => e.includes('athlete maya skipped')));
      assert.ok(errors.some((e) => e.includes('sessions 2026-12-02 to ' +
          '2027-01-01 not read')));
    }));

test('runTokenExpiryReminders: the bonus tokens still go when the ' +
    'athletes cannot be listed, and one bad token never stops another',
() => withLedger(async (sent, errors) => {
  const {fakeDb} = require('./fake-firestore');
  const docs = expiryFixture();
  // Both expire Dec 28, seven days after the Dec 21 run; the bad one first.
  docs['graceTokens/g-ghost'] = {athleteId: 'ghost',
    expiresAt: '2026-12-28', reason: 'session-cancelled'};
  docs['graceTokens/g-ava'] = {athleteId: 'ava', householdId: 'h-one',
    expiresAt: '2026-12-28', reason: 'session-cancelled'};
  const db = failing(fakeDb(docs),
      {lists: ['athletes'], docs: ['athletes/ghost']});
  const r = await jobs.runTokenExpiryReminders(nineAM('2026-12-21', db));
  assert.deepEqual([r.tokens, r.grace, r.failed], [0, 1, 2]);
  assert.deepEqual([...sent.keys()], ['grace-expiring_g-ava']);
  assert.ok(errors.some((e) => e.includes('the tokens half stopped')));
  assert.ok(errors.some((e) => e.includes('bonus token g-ghost skipped')));
}));

run();
